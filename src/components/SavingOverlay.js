import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

// ── "Giọt nước dâng" — animation cho bước LƯU check-in (sau khi bấm "Xác nhận uống") ──
//  • Không dùng ảnh, không có tia quét: một chiếc "giọt nước tròn" được rót đầy dần.
//  • Giọt rơi xuống -> mực nước DÂNG LÊN chậm dần (không bao giờ chạm đỉnh khi còn đang chờ,
//    nên người dùng luôn thấy nó "đang chạy" mà không biết trước thời gian).
//  • Server trả về (done = true) -> nước dâng đầy, nổ vòng sóng, hiện dấu ✓ rồi mới đóng.
//  • Nút AI vẫn bay tới "ghế" vắt trên mép thẻ (onBadgeTarget) giống các bước trước.

const STEPS = [
  [0, "Đang lưu lượng nước…"],
  [2, "Đang cập nhật tiến độ hôm nay…"],
  [6, "Sắp xong rồi, chờ xíu nhé…"],
  [12, "Mạng hơi chậm, đừng thoát nhé…"],
];
const stepAt = (sec) => {
  let out = STEPS[0][1];
  for (const [s, m] of STEPS) if (sec >= s) out = m;
  return out;
};

const CARD_W = 264;
const CARD_TOP = 40; // chừa chỗ cho huy hiệu AI
const BADGE = 64;
const TITLE_H = 28;
const DROP_ZONE = 30; // khoảng cho giọt rơi phía trên orb
const ORB = 132;
const VOL_H = 34;
const STATUS_H = 22;
const PAD_BOTTOM = 22;
const CARD_H = CARD_TOP + TITLE_H + DROP_ZONE + ORB + 10 + VOL_H + STATUS_H + PAD_BOTTOM;

// Sóng = hình vuông bo tròn (squircle) rất to xoay chậm, lộ phần mép trên trong orb
const WAVE = ORB * 2.4;
const WAVE_EMPTY = ORB + 16; // translateY khi chưa có nước
const WAVE_FULL = -22; // translateY khi đầy (phủ kín cả khi sóng nhấp nhô)
const LEVEL_WAITING = 0.8; // đang chờ: nước dâng tới ~80% rồi dừng lại

function Content({ volume, done, onBadgeTarget }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const accent = colors.primary || "#0ea5e9";
  const accentLight = colors.primaryLight || accent;

  const cardLeft = (width - CARD_W) / 2;
  const cardTop = Math.max(
    insets.top + BADGE / 2 + 8,
    (height - CARD_H - BADGE / 2) / 2 + BADGE / 2,
  );

  // Báo "ghế" huy hiệu cho nút AI nổi; null khi overlay biến mất -> nút bay về
  useEffect(() => {
    if (!onBadgeTarget) return;
    onBadgeTarget({ x: cardLeft + CARD_W / 2, y: cardTop, size: BADGE });
  }, [onBadgeTarget, cardLeft, cardTop]);
  useEffect(() => () => onBadgeTarget?.(null), [onBadgeTarget]);

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const level = useRef(new Animated.Value(0.1)).current;
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const dropA = useRef(new Animated.Value(0)).current;
  const dropB = useRef(new Animated.Value(0)).current;
  const dropsVis = useRef(new Animated.Value(1)).current;
  const ringPulse = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const msgFade = useRef(new Animated.Value(1)).current;
  const [sec, setSec] = useState(0);

  // Vào cảnh + các vòng lặp nền
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }),
    ]).start();

    // mực nước dâng chậm dần (ease-out dài) -> cảm giác tiến lên nhưng không "hết"
    Animated.timing(level, {
      toValue: LEVEL_WAITING,
      duration: 9000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const fall = (v) =>
      Animated.timing(v, { toValue: 1, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true });
    const loops = [
      Animated.loop(Animated.timing(wave1, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.timing(wave2, { toValue: 1, duration: 7400, easing: Easing.linear, useNativeDriver: true })),
      // hai giọt rơi so le, chu kỳ 1600ms
      Animated.loop(Animated.sequence([fall(dropA), Animated.delay(950), Animated.timing(dropA, { toValue: 0, duration: 0, useNativeDriver: true })])),
      Animated.loop(Animated.sequence([Animated.delay(800), fall(dropB), Animated.delay(150), Animated.timing(dropB, { toValue: 0, duration: 0, useNativeDriver: true })])),
      // viền orb "thở" nhẹ
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringPulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(ringPulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => {
      loops.forEach((l) => l.stop());
      level.stopAnimation();
      clearInterval(t);
    };
  }, [fade, rise, level, wave1, wave2, dropA, dropB, ringPulse]);

  // Server xong -> nước đầy, nổ sóng, hiện ✓
  useEffect(() => {
    if (!done) return;
    Animated.parallel([
      Animated.timing(level, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(dropsVis, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      Animated.parallel([
        Animated.spring(check, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
  }, [done, level, dropsVis, check, burst]);

  const label = done ? "Đã lưu xong!" : stepAt(sec);
  useEffect(() => {
    msgFade.setValue(0);
    Animated.timing(msgFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [label, msgFade]);

  const waveY = level.interpolate({ inputRange: [0, 1], outputRange: [WAVE_EMPTY, WAVE_FULL] });
  const waveBackY = level.interpolate({ inputRange: [0, 1], outputRange: [WAVE_EMPTY + 8, WAVE_FULL - 6] });
  const spinCW = wave1.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const spinCCW = wave2.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] });
  const dropFall = (v) => ({
    opacity: v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, DROP_ZONE + ORB * 0.2] }) }],
  });

  return (
    // View thường (nhận chạm) -> chặn bấm xuyên xuống app trong lúc đang lưu
    <View style={[styles.root, { width, height }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.background, opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.88] }) },
        ]}
      />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            styles.card,
            {
              left: cardLeft,
              top: cardTop,
              width: CARD_W,
              height: CARD_H,
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
          {/* ghế huy hiệu cho nút AI nổi */}
          <View style={styles.badgeWrap}>
            <Animated.View
              style={[
                styles.badgeRing,
                {
                  borderColor: accent,
                  opacity: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                },
              ]}
            />
            <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.card }]} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{done ? "Đã lưu check-in" : "Đang lưu check-in"}</Text>

          {/* orb + giọt rơi */}
          <View style={styles.orbWrap}>
            <Animated.View pointerEvents="none" style={[styles.dropLayer, { opacity: dropsVis }]}>
              <Animated.View style={[styles.drop, { backgroundColor: accent, left: ORB / 2 - 14 }, dropFall(dropA)]} />
              <Animated.View style={[styles.drop, { backgroundColor: accentLight, left: ORB / 2 + 5 }, dropFall(dropB)]} />
            </Animated.View>

            {/* vòng sóng nổ khi xong */}
            <Animated.View
              style={[
                styles.burst,
                {
                  borderColor: accent,
                  opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                  transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
                },
              ]}
            />

            <View style={[styles.orb, { borderColor: accent, backgroundColor: colors.primarySoft || "rgba(0,0,0,0.05)" }]}>
              <Animated.View
                style={[
                  styles.wave,
                  { backgroundColor: accentLight, opacity: 0.55, transform: [{ translateY: waveBackY }, { rotate: spinCCW }] },
                ]}
              />
              <Animated.View
                style={[
                  styles.wave,
                  { backgroundColor: accent, opacity: 0.9, transform: [{ translateY: waveY }, { rotate: spinCW }] },
                ]}
              />
              <Animated.Text
                style={[
                  styles.check,
                  {
                    opacity: check,
                    transform: [{ scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
                  },
                ]}
              >
                ✓
              </Animated.Text>
            </View>
          </View>

          <View style={styles.volRow}>
            <Text style={[styles.vol, { color: accent }]}>+{volume} ml</Text>
          </View>

          <View style={styles.statusRow}>
            <Animated.Text numberOfLines={1} style={[styles.status, { color: colors.text, opacity: msgFade }]}>
              {label}
            </Animated.Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const SavingOverlay = memo(function SavingOverlay({ visible, done = false, volume = 0, onBadgeTarget }) {
  if (!visible) return null;
  return <Content volume={volume} done={done} onBadgeTarget={onBadgeTarget} />;
});

export default SavingOverlay;

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, zIndex: 1000, elevation: 30 },
  card: {
    position: "absolute",
    alignItems: "center",
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: CARD_TOP,
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
  badgeRing: { position: "absolute", width: BADGE, height: BADGE, borderRadius: BADGE / 2, borderWidth: 2 },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
  },
  title: { height: TITLE_H, fontSize: 17, fontWeight: "800", textAlignVertical: "center" },

  orbWrap: { width: ORB, height: DROP_ZONE + ORB, alignItems: "center" },
  dropLayer: { position: "absolute", top: 0, left: 0, width: ORB, height: DROP_ZONE },
  drop: { position: "absolute", top: 0, width: 9, height: 12, borderRadius: 6 },
  burst: { position: "absolute", top: DROP_ZONE, width: ORB, height: ORB, borderRadius: ORB / 2, borderWidth: 3 },
  orb: {
    position: "absolute",
    top: DROP_ZONE,
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    borderWidth: 3,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  wave: {
    position: "absolute",
    top: 0,
    left: (ORB - WAVE) / 2,
    width: WAVE,
    height: WAVE,
    borderRadius: WAVE * 0.4,
  },
  check: { fontSize: 56, fontWeight: "900", color: "#ffffff" },

  volRow: { height: VOL_H, marginTop: 10, justifyContent: "center" },
  vol: { fontSize: 26, fontWeight: "800" },
  statusRow: { height: STATUS_H, justifyContent: "center", maxWidth: "100%", paddingHorizontal: 16 },
  status: { fontSize: 14.5, fontWeight: "600" },
});
