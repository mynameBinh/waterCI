import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useAiAvatar } from "./AIChatModal";

// ── Overlay "AI đang quét ảnh" ─────────────────────────────────────────────
//  • Nền: màu theme của app phủ mờ (không còn lớp đen); thẻ nằm đúng GIỮA MÀN HÌNH.
//  • Huy hiệu avatar AI nằm vắt qua mép trên thẻ, có vòng sóng lan toả khi đang quét.
//    Nếu truyền `onBadgeTarget`, overlay KHÔNG tự vẽ avatar nữa mà báo toạ độ "ghế" huy hiệu
//    ({ x, y, size }) để FloatingAIButton bay tới đứng đúng chỗ đó (null khi quét xong -> nút bay về).
//  • Khung ảnh theo đúng tỉ lệ ảnh vừa chụp -> không bị cắt, tia quét chạy hết ảnh.
//  • Thẻ + chữ + thanh tiến trình dùng màu theme (sáng / tối đều hợp).

const STEPS = {
  water: [
    [0, "Đang gửi ảnh cho AI…"],
    [2, "AI đang quan sát vật chứa…"],
    [5, "Đang ước lượng dung tích…"],
    [9, "Sắp xong rồi, chờ xíu nhé…"],
    [14, "Mạng hơi chậm, đừng thoát nhé…"],
  ],
  task: [
    [0, "Đang gửi ảnh cho AI…"],
    [2, "AI đang đối chiếu với mục tiêu…"],
    [5, "Đang kiểm tra ảnh có đúng yêu cầu…"],
    [9, "Sắp xong rồi, chờ xíu nhé…"],
    [14, "Mạng hơi chậm, đừng thoát nhé…"],
  ],
};
const TITLES = { water: "Đang quét nước uống", task: "Đang kiểm tra mục tiêu" };

const stepAt = (mode, sec) => {
  const list = STEPS[mode] || STEPS.water;
  let out = list[0][1];
  for (const [s, m] of list) if (sec >= s) out = m;
  return out;
};

const CARD_PAD = 16;
const CARD_TOP = 40; // chừa chỗ cho huy hiệu avatar
const BADGE = 64;
const HEADER_H = 30; // chiều cao dòng tiêu đề
const FOOTER_H = 84; // trạng thái + thanh tiến trình
const STATUS_H = 22; // dòng trạng thái
const BAR_CHUNK = 76;

function Content({ uri, mode, onBadgeTarget }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const avatar = useAiAvatar();
  const accent = colors.primary || "#0ea5e9";

  // Tỉ lệ rộng/cao của ảnh (mặc định 3:4 như ảnh chụp dọc; cập nhật khi biết kích thước thật)
  const [ratio, setRatio] = useState(3 / 4);
  useEffect(() => {
    if (!uri) return undefined;
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => alive && w > 0 && h > 0 && setRatio(Math.min(Math.max(w / h, 0.6), 1.5)),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  // Cỡ khung ảnh lớn nhất còn vừa màn hình (thẻ luôn căn giữa, chừa tai thỏ / thanh dưới cho cân)
  const edge = Math.max(insets.top, insets.bottom);
  const freeH = height - edge * 2 - 48 - BADGE / 2;
  const cardW = Math.min(width - 48, 340);
  const maxFrameW = cardW - CARD_PAD * 2;
  const maxFrameH = Math.max(160, freeH - CARD_TOP - 18 - HEADER_H - FOOTER_H);
  let frameW = maxFrameW;
  let frameH = frameW / ratio;
  if (frameH > maxFrameH) {
    frameH = maxFrameH;
    frameW = frameH * ratio;
  }

  // Vị trí tính tay (không dựa vào flex): chiều cao thẻ = tổng các phần đã biết trước,
  // đặt thẻ + huy hiệu thành một cụm nằm đúng giữa cửa sổ.
  const cardH = CARD_TOP + HEADER_H + frameH + 16 + STATUS_H + 14 + 5 + 18;
  const cardLeft = (width - cardW) / 2;
  const cardTop = Math.max(
    insets.top + BADGE / 2 + 8,
    (height - cardH - BADGE / 2) / 2 + BADGE / 2,
  );

  // Báo tâm huy hiệu (đã tính theo vị trí thẻ) cho nút AI nổi; báo null khi overlay biến mất
  useEffect(() => {
    if (!onBadgeTarget) return;
    onBadgeTarget({ x: cardLeft + cardW / 2, y: cardTop, size: BADGE });
  }, [onBadgeTarget, cardLeft, cardW, cardTop]);
  useEffect(() => () => onBadgeTarget?.(null), [onBadgeTarget]);

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const msgFade = useRef(new Animated.Value(1)).current;
  const [sec, setSec] = useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }),
    ]).start();
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(scan, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(scan, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.timing(prog, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ),
    ];
    loops.forEach((l) => l.start());
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => {
      loops.forEach((l) => l.stop());
      clearInterval(t);
    };
  }, [fade, rise, scan, pulse, prog]);

  const label = stepAt(mode, sec);
  useEffect(() => {
    msgFade.setValue(0);
    Animated.timing(msgFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [label, msgFade]);

  const cornerOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const corner = (pos) => (
    <Animated.View
      pointerEvents="none"
      style={[styles.corner, pos, { borderColor: "#ffffff", opacity: cornerOpacity }]}
    />
  );
  const barW = cardW - CARD_PAD * 2;

  return (
    // View thường (nhận chạm) -> chặn bấm xuyên xuống app trong lúc đang quét
    <View style={[styles.root, { width, height }]}>
      {/* nền: màu theme phủ mờ — app phía sau vẫn thấp thoáng, không còn lớp đen */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.background, opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }) },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: accent, opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.06] }) },
        ]}
      />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            styles.card,
            {
              position: "absolute",
              left: cardLeft,
              top: cardTop,
              width: cardW,
              height: cardH,
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: fade,
              transform: [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          {/* huy hiệu AI + vòng sóng */}
          <View style={styles.badgeWrap}>
            <Animated.View
              style={[
                styles.ring,
                {
                  borderColor: accent,
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                },
              ]}
            />
            <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.card }]}>
              {!onBadgeTarget && <Image source={avatar} style={styles.badgeImg} />}
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{TITLES[mode] || TITLES.water}</Text>

          <View
            style={[
              styles.frame,
              { width: frameW, height: frameH, backgroundColor: colors.primarySoft || "rgba(0,0,0,0.06)" },
            ]}
          >
            {uri ? (
              <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={styles.center}>
                <Animated.Image
                  source={avatar}
                  style={[
                    styles.bigAvatar,
                    { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }] },
                  ]}
                />
              </View>
            )}

            {/* tia quét */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.scanBand,
                { transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [-60, frameH - 4] }) }] },
              ]}
            >
              <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.34)"]} style={StyleSheet.absoluteFill} />
              <View style={[styles.scanLine, { shadowColor: accent }]} />
            </Animated.View>

            {corner({ top: 10, left: 10, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 })}
            {corner({ top: 10, right: 10, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 })}
            {corner({ bottom: 10, left: 10, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 })}
            {corner({ bottom: 10, right: 10, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 })}
          </View>

          <View style={styles.statusRow}>
            <Animated.Text numberOfLines={1} style={[styles.status, { color: colors.text, opacity: msgFade }]}>
              {label}
            </Animated.Text>
          </View>

          <View style={[styles.track, { width: barW, backgroundColor: colors.border }]}>
            <Animated.View
              style={[
                styles.bar,
                {
                  backgroundColor: accent,
                  transform: [{ translateX: prog.interpolate({ inputRange: [0, 1], outputRange: [-BAR_CHUNK, barW] }) }],
                },
              ]}
            />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const ScanningOverlay = memo(function ScanningOverlay({ visible, uri, mode = "water", onBadgeTarget }) {
  if (!visible) return null;
  return <Content uri={uri} mode={mode} onBadgeTarget={onBadgeTarget} />;
});

export default ScanningOverlay;

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, zIndex: 1000, elevation: 30 },
  card: {
    alignItems: "center",
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: CARD_PAD,
    paddingTop: CARD_TOP,
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  badgeWrap: {
    position: "absolute",
    top: -BADGE / 2,
    left: 0,
    right: 0,
    height: BADGE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: { position: "absolute", width: BADGE, height: BADGE, borderRadius: BADGE / 2, borderWidth: 2 },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 4,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
  },
  badgeImg: { width: "100%", height: "100%", borderRadius: BADGE / 2 },
  title: { height: HEADER_H, fontSize: 17, fontWeight: "800", textAlignVertical: "center" },
  frame: { borderRadius: 22, overflow: "hidden" },
  center: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  bigAvatar: { width: 96, height: 96, borderRadius: 28 },
  scanBand: { position: "absolute", left: 0, right: 0, top: 0, height: 60 },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "#ffffff",
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  corner: { position: "absolute", width: 30, height: 30 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: STATUS_H, marginTop: 16, maxWidth: "100%" },
  status: { fontSize: 14.5, fontWeight: "600", flexShrink: 1 },
  track: { height: 5, borderRadius: 3, marginTop: 14, overflow: "hidden" },
  bar: { width: BAR_CHUNK, height: 5, borderRadius: 3 },
});