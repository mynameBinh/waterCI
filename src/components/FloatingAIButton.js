import AsyncStorage from "@react-native-async-storage/async-storage";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useAiAvatar } from "./AIChatModal";

// ── Nút AI nổi kiểu AssistiveTouch ──────────────────────────────────────────
//  • Kéo đi bất cứ đâu trên màn hình; thả ra sẽ tự hít vào mép trái / phải gần nhất.
//  • Chạm nhẹ (không kéo) -> gọi onPress (mở khung chat).
//  • Nhớ vị trí lần trước (AsyncStorage), tự làm mờ khi không dùng.
//  • Né thanh dock phía dưới và tai thỏ / thanh trạng thái phía trên.
//  • BONG BÓNG TIN NHẮN: truyền prop `bubble={{ id, text, meta?, tone? }}` (tone="error" -> viền đỏ báo thất bại) -> AI "nhắn" ra ngay cạnh nút
//    (có hiệu ứng đang gõ rồi hiện chữ), tự biến mất, chạm vào để mở khung chat.
//    Tắt bằng cách đặt bubble = null (hoặc nghe onBubbleClose).
//  • BAY VÀO "GHẾ" KHI QUÉT: truyền prop `dockTarget={{ x, y, size }}` (tâm + đường kính huy hiệu trên ScanningOverlay)
//    -> nút bay tới đó (phóng to vừa huy hiệu, ẩn khỏi thao tác chạm). Đặt dockTarget = null -> bay về chỗ cũ.

const SIZE = 56; // kích thước nút
const MARGIN = 8; // khoảng cách tới mép màn hình
const TAP_SLOP = 8; // kéo ít hơn số px này vẫn tính là "chạm"
const IDLE_MS = 3000; // sau bấy lâu không đụng tới thì làm mờ
const IDLE_OPACITY = 0.55;
const STORAGE_KEY = "ai_fab_position_v1";

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const TYPING_MS = 850; // "đang gõ…" trước khi hiện chữ
const BUBBLE_GAP = 10;

// 3 chấm nhấp nháy giống Messenger
const TypingDots = memo(function TypingDots({ color }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 280, useNativeDriver: false }),
          Animated.timing(d, { toValue: 0.3, duration: 280, useNativeDriver: false }),
          Animated.delay(320 - i * 160),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={styles.dotsRow}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.dot, { backgroundColor: color, opacity: d }]} />
      ))}
    </View>
  );
});

const FloatingAIButton = memo(function FloatingAIButton({
  onPress,
  bottomInset = 96, // vùng dock phía dưới cần tránh (chưa gồm safe-area)
  bubble = null, // { id, text, meta? } -> bong bóng tin nhắn từ AI
  onBubbleClose,
  dockTarget = null, // { x, y, size } | null -> bay tới huy hiệu của ScanningOverlay
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const avatar = useAiAvatar(); // ảnh AI đổi theo màu theme
  const { colors } = useTheme();

  const bounds = {
    minX: MARGIN,
    maxX: Math.max(MARGIN, width - SIZE - MARGIN),
    minY: insets.top + MARGIN,
    maxY: Math.max(insets.top + MARGIN, height - insets.bottom - bottomInset - SIZE),
  };
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const onCloseRef = useRef(onBubbleClose);
  onCloseRef.current = onBubbleClose;

  // Vị trí mặc định: mép phải, hơi cao hơn dock
  const x = useRef(new Animated.Value(bounds.maxX)).current;
  const y = useRef(new Animated.Value(Math.max(bounds.minY, bounds.maxY - 80))).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const posRef = useRef({ x: bounds.maxX, y: Math.max(bounds.minY, bounds.maxY - 80) });
  const startRef = useRef({ x: 0, y: 0 });
  const sideRef = useRef("right"); // "left" | "right"
  const [side, setSide] = useState("right"); // bản state của sideRef (để bong bóng đổi bên)
  const yRatioRef = useRef(null); // 0..1 trong khoảng minY..maxY (để thích ứng khi đổi kích thước màn hình)
  const idleTimer = useRef(null);
  const loadedRef = useRef(false);

  // theo dõi vị trí hiện tại
  useEffect(() => {
    const ix = x.addListener(({ value }) => (posRef.current.x = value));
    const iy = y.addListener(({ value }) => (posRef.current.y = value));
    return () => {
      x.removeListener(ix);
      y.removeListener(iy);
      clearTimeout(idleTimer.current);
      clearTimeout(returnTimer.current);
    };
  }, [x, y]);

  const wake = useRef(() => {
    clearTimeout(idleTimer.current);
    Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: false }).start();
  }).current;

  const scheduleIdle = useRef(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: IDLE_OPACITY, duration: 350, useNativeDriver: false }).start();
    }, IDLE_MS);
  }).current;

  const persist = useRef(() => {
    const b = boundsRef.current;
    const span = Math.max(1, b.maxY - b.minY);
    yRatioRef.current = clamp((posRef.current.y - b.minY) / span, 0, 1);
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ side: sideRef.current, yRatio: yRatioRef.current }),
    ).catch(() => {});
  }).current;

  // Hít vào mép gần nhất rồi lưu lại
  const snap = useRef(() => {
    const b = boundsRef.current;
    const centerX = posRef.current.x + SIZE / 2;
    const side = centerX < (b.minX + b.maxX + SIZE) / 2 ? "left" : "right";
    sideRef.current = side;
    setSide(side);
    const toY = clamp(posRef.current.y, b.minY, b.maxY);
    Animated.parallel([
      Animated.spring(x, {
        toValue: side === "left" ? b.minX : b.maxX,
        useNativeDriver: false,
        friction: 7,
        tension: 70,
      }),
      Animated.spring(y, { toValue: toY, useNativeDriver: false, friction: 8 }),
    ]).start();
    persist();
    scheduleIdle();
  }).current;

  // Nạp vị trí đã lưu (1 lần)
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw);
        if (saved?.side === "left" || saved?.side === "right") {
          sideRef.current = saved.side;
          setSide(saved.side);
        }
        if (typeof saved?.yRatio === "number") yRatioRef.current = clamp(saved.yRatio, 0, 1);
      })
      .catch(() => {})
      .finally(() => {
        loadedRef.current = true;
        applyLayout(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đặt lại vị trí theo mép + tỉ lệ Y đã nhớ (khi xoay máy / đổi kích thước)
  const applyLayout = (animated) => {
    const b = boundsRef.current;
    const toX = sideRef.current === "left" ? b.minX : b.maxX;
    const ratio = yRatioRef.current;
    const toY =
      ratio == null
        ? clamp(posRef.current.y, b.minY, b.maxY)
        : b.minY + ratio * (b.maxY - b.minY);
    if (animated) {
      Animated.parallel([
        Animated.spring(x, { toValue: toX, useNativeDriver: false }),
        Animated.spring(y, { toValue: toY, useNativeDriver: false }),
      ]).start();
    } else {
      x.setValue(toX);
      y.setValue(toY);
    }
    scheduleIdle();
  };

  useEffect(() => {
    if (loadedRef.current && !dockedRef.current) applyLayout(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, insets.top, insets.bottom, bottomInset]);

  // ── Bay vào huy hiệu của ScanningOverlay rồi bay về ──────────────────────
  const [docked, setDocked] = useState(false);
  const dockedRef = useRef(false);
  const homeRef = useRef(null); // vị trí cũ trước khi bay đi
  const returnTimer = useRef(null); // chờ một nhịp rồi mới bay về: chuyển bước (quét -> chọn ml -> lưu) nút không bị bay về giữa chừng
  const dockX = dockTarget?.x;
  const dockY = dockTarget?.y;
  const dockSize = dockTarget?.size;

  useEffect(() => {
    const b = boundsRef.current;
    if (dockX != null && dockY != null) {
      clearTimeout(returnTimer.current);
      if (!dockedRef.current) {
        dockedRef.current = true;
        homeRef.current = { ...posRef.current };
        x.stopAnimation();
        y.stopAnimation();
        setDocked(true);
        wake();
        clearTimeout(idleTimer.current);
      }
      Animated.parallel([
        Animated.spring(x, { toValue: dockX - SIZE / 2, useNativeDriver: false, friction: 8, tension: 55 }),
        Animated.spring(y, { toValue: dockY - SIZE / 2, useNativeDriver: false, friction: 8, tension: 55 }),
        Animated.spring(scale, {
          toValue: dockSize ? dockSize / SIZE : 1,
          useNativeDriver: false,
          friction: 7,
          tension: 70,
        }),
      ]).start();
    } else if (dockedRef.current) {
      clearTimeout(returnTimer.current);
      returnTimer.current = setTimeout(() => {
        if (!dockedRef.current) return;
        dockedRef.current = false;
        const home = homeRef.current;
        homeRef.current = null;
        const toX = sideRef.current === "left" ? b.minX : b.maxX;
        const toY = clamp(home ? home.y : posRef.current.y, b.minY, b.maxY);
        Animated.parallel([
          Animated.spring(x, { toValue: toX, useNativeDriver: false, friction: 8, tension: 55 }),
          Animated.spring(y, { toValue: toY, useNativeDriver: false, friction: 8, tension: 55 }),
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 7, tension: 70 }),
        ]).start(({ finished }) => {
          if (!finished || dockedRef.current) return; // bị ngắt vì lại có bước mới -> giữ nguyên trạng thái bay
          setDocked(false);
          scheduleIdle();
        });
      }, 180);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockX, dockY, dockSize]);

  // ── Bong bóng tin nhắn ──────────────────────────────────────────────────
  const bAnim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(null); // giữ nội dung để còn chạy hiệu ứng biến mất
  const [typing, setTyping] = useState(false);
  const bubbleTimers = useRef([]);
  const clearBubbleTimers = () => {
    bubbleTimers.current.forEach(clearTimeout);
    bubbleTimers.current = [];
  };

  useEffect(() => {
    clearBubbleTimers();
    if (!bubble) {
      Animated.timing(bAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start(() => {
        setShown(null);
        scheduleIdle();
      });
      return undefined;
    }
    setShown(bubble);
    setTyping(true);
    wake();
    bAnim.setValue(0);
    Animated.spring(bAnim, { toValue: 1, useNativeDriver: false, friction: 7, tension: 90 }).start();
    bubbleTimers.current.push(setTimeout(() => setTyping(false), TYPING_MS));
    const life = Math.min(10000, (bubble.tone === "error" ? 6000 : 4500) + (bubble.text?.length || 0) * 45);
    bubbleTimers.current.push(setTimeout(() => onCloseRef.current?.(), TYPING_MS + life));
    return clearBubbleTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubble?.id]);

  const bubbleW = Math.min(width - SIZE - MARGIN * 2 - BUBBLE_GAP - 4, 270);
  const bubbleX = useMemo(
    () => (side === "right" ? Animated.add(x, -(bubbleW + BUBBLE_GAP)) : Animated.add(x, SIZE + BUBBLE_GAP)),
    [side, x, bubbleW],
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !dockedRef.current,
      onMoveShouldSetPanResponder: () => !dockedRef.current,
      onPanResponderGrant: () => {
        x.stopAnimation();
        y.stopAnimation();
        startRef.current = { ...posRef.current };
        wake();
        Animated.spring(scale, { toValue: 1.12, useNativeDriver: false, friction: 6 }).start();
      },
      onPanResponderMove: (_, g) => {
        const b = boundsRef.current;
        x.setValue(clamp(startRef.current.x + g.dx, b.minX, b.maxX));
        y.setValue(clamp(startRef.current.y + g.dy, b.minY, b.maxY));
      },
      onPanResponderRelease: (_, g) => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 6 }).start();
        const isTap = Math.hypot(g.dx, g.dy) < TAP_SLOP;
        snap();
        if (isTap) onPressRef.current?.();
      },
      onPanResponderTerminate: () => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 6 }).start();
        snap();
      },
    }),
  ).current;

  const isErr = shown?.tone === "error";

  return (
    <>
    {shown && (
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.bubbleHost,
          {
            width: bubbleW,
            alignItems: side === "right" ? "flex-end" : "flex-start",
            transform: [{ translateX: bubbleX }, { translateY: y }],
          },
        ]}
      >
        <Animated.View
          style={{
            opacity: bAnim,
            transform: [
              { translateX: bAnim.interpolate({ inputRange: [0, 1], outputRange: [side === "right" ? 26 : -26, 0] }) },
              { scale: bAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            ],
          }}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              onCloseRef.current?.();
              onPressRef.current?.();
            }}
            accessibilityRole="button"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Tiểu Đậu: ${shown.text}`}
            style={[
              styles.bubble,
              {
                backgroundColor: colors.card,
                borderColor: isErr ? "#ef4444" : colors.border,
                borderWidth: isErr ? 1.5 : StyleSheet.hairlineWidth,
                // góc "đuôi" hướng về nút AI
                ...(side === "right" ? { borderTopRightRadius: 6 } : { borderTopLeftRadius: 6 }),
              },
            ]}
          >
            {typing ? (
              <TypingDots color={colors.textMuted} />
            ) : (
              <>
                <Text style={[styles.bubbleName, { color: isErr ? "#ef4444" : colors.primary }]}>
                  {isErr ? "Tiểu Đậu · chưa được rồi" : "Tiểu Đậu"}
                </Text>
                <Text numberOfLines={4} style={[styles.bubbleText, { color: colors.text }]}>
                  {shown.text}
                </Text>
                {!!shown.meta && (
                  <Text numberOfLines={1} style={[styles.bubbleMeta, { color: colors.textMuted }]}>
                    {shown.meta}
                  </Text>
                )}
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    )}
    <Animated.View
      {...pan.panHandlers}
      pointerEvents={docked ? "none" : "auto"}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Trò chuyện với AI"
      onAccessibilityTap={() => onPressRef.current?.()}
      style={[
        styles.fab,
        docked && styles.fabDocked, // nổi trên cả ScanningOverlay (zIndex 1000)
        { opacity, transform: [{ translateX: x }, { translateY: y }, { scale }] },
      ]}
    >
      <Image source={avatar} style={styles.img} />
    </Animated.View>
    </>
  );
});

export default FloatingAIButton;

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    zIndex: 999,
    elevation: 24, // Android: nổi trên dock
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    backgroundColor: "#ffffff",
  },
  fabDocked: { zIndex: 1002, elevation: 40 },
  img: { width: "100%", height: "100%", borderRadius: SIZE / 2 },
  bubbleHost: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 998,
    elevation: 23,
  },
  bubble: {
    maxWidth: "100%",
    minWidth: 64,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  bubbleName: { fontSize: 11.5, fontWeight: "800", marginBottom: 2 },
  bubbleText: { fontSize: 14.5, lineHeight: 20, fontWeight: "500" },
  bubbleMeta: { fontSize: 11.5, marginTop: 4 },
  dotsRow: { flexDirection: "row", alignItems: "center", height: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 2.5 },
});