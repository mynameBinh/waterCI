import AsyncStorage from "@react-native-async-storage/async-storage";
import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAiAvatar } from "./AIChatModal";

// ── Nút AI nổi kiểu AssistiveTouch ──────────────────────────────────────────
//  • Kéo đi bất cứ đâu trên màn hình; thả ra sẽ tự hít vào mép trái / phải gần nhất.
//  • Chạm nhẹ (không kéo) -> gọi onPress (mở khung chat).
//  • Nhớ vị trí lần trước (AsyncStorage), tự làm mờ khi không dùng.
//  • Né thanh dock phía dưới và tai thỏ / thanh trạng thái phía trên.

const SIZE = 56; // kích thước nút
const MARGIN = 8; // khoảng cách tới mép màn hình
const TAP_SLOP = 8; // kéo ít hơn số px này vẫn tính là "chạm"
const IDLE_MS = 3000; // sau bấy lâu không đụng tới thì làm mờ
const IDLE_OPACITY = 0.55;
const STORAGE_KEY = "ai_fab_position_v1";

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const FloatingAIButton = memo(function FloatingAIButton({
  onPress,
  bottomInset = 96, // vùng dock phía dưới cần tránh (chưa gồm safe-area)
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const avatar = useAiAvatar(); // ảnh AI đổi theo màu theme

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

  // Vị trí mặc định: mép phải, hơi cao hơn dock
  const x = useRef(new Animated.Value(bounds.maxX)).current;
  const y = useRef(new Animated.Value(Math.max(bounds.minY, bounds.maxY - 80))).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const posRef = useRef({ x: bounds.maxX, y: Math.max(bounds.minY, bounds.maxY - 80) });
  const startRef = useRef({ x: 0, y: 0 });
  const sideRef = useRef("right"); // "left" | "right"
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
        if (saved?.side === "left" || saved?.side === "right") sideRef.current = saved.side;
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
    if (loadedRef.current) applyLayout(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, insets.top, insets.bottom, bottomInset]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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

  return (
    <Animated.View
      {...pan.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Trò chuyện với AI"
      onAccessibilityTap={() => onPressRef.current?.()}
      style={[
        styles.fab,
        { opacity, transform: [{ translateX: x }, { translateY: y }, { scale }] },
      ]}
    >
      <Image source={avatar} style={styles.img} />
    </Animated.View>
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
  img: { width: "100%", height: "100%", borderRadius: SIZE / 2 },
});