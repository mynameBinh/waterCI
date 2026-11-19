// =============================================================================
// CoupleHeart — "tim đôi": hai hình AGENT đang dùng (cùng ảnh, cùng màu chủ đạo với app) ở hai đầu, sóng nhịp tim chạy
// giữa, trái tim ở chính giữa đập theo nhịp.
//   - Mỗi người làm xong tới đâu thì hình agent của người đó TIẾN LẠI GẦN trái tim tới đó (myProgress / partnerProgress 0..1).
//   - Khi CẢ HAI xong và có chuỗi (bothDone && streak > 0): "BÙM" — ngọn lửa bung ra giữa, số ngày chuỗi nằm trong ngọn lửa,
//     hai hình agent (và trái tim) biến mất. Có chuỗi rồi thì không hiện lại hai agent.
//   - Tuỳ biến (mở khoá theo chuỗi dài nhất): waveStyle, pulseColor, frameStyle, partnerFrameStyle.
// mood: "flat" (chưa xem được nhau, đường chấm mờ) | "calm" (nhịp chậm) | "happy" (nhịp nhanh, sóng cao).
// Mặc định (không truyền tuỳ biến) = sóng ECG + màu chủ đạo + viền đơn.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { getAiAvatar, getAiAvatarStyle } from "../../context/aiThemes";
import { useTheme } from "../../context/ThemeContext";
import { buildWave } from "./CoupleHeartCatalog";
import FlameStreak, { FLAME } from "./FlameStreak";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const H = 52; // chiều cao vùng sóng
const AV = 60; // đường kính khung agent
const PAD = 8; // lề hai bên của cột (agent + tên)
const COL = AV + PAD * 2;
const HEART = 32;
const FLAME_W = 76;
const NAME_H = 20;
const ROW_H = AV + 6 + NAME_H;
const SPARKS = 10;

const MOODS = {
  flat: { bpm: 40, amp: 0, line: 0.3 },
  calm: { bpm: 66, amp: 1, line: 0.9 },
  happy: { bpm: 92, amp: 1.2, line: 1 },
};

// khung quanh hình agent
const Frame = ({ kind, color, size }) => {
  const circle = (extra) => ({ position: "absolute", borderRadius: 999, ...extra });
  const inset = (n, extra) => circle({ top: n, left: n, right: n, bottom: n, ...extra });
  if (kind === "double")
    return (
      <>
        <View pointerEvents="none" style={inset(0, { borderWidth: 2, borderColor: color })} />
        <View pointerEvents="none" style={inset(6, { borderWidth: 1.5, borderColor: color, opacity: 0.55 })} />
      </>
    );
  if (kind === "dashed")
    return <View pointerEvents="none" style={inset(0, { borderWidth: 2.2, borderColor: color, borderStyle: "dashed" })} />;
  if (kind === "glow")
    return (
      <>
        <View pointerEvents="none" style={inset(-5, { backgroundColor: color, opacity: 0.16 })} />
        <View pointerEvents="none"
          style={inset(0, { borderWidth: 2.5, borderColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 } })} />
      </>
    );
  return <View pointerEvents="none" style={inset(0, { borderWidth: Math.max(2, size / 28), borderColor: color })} />;
};

const Agent = memo(function Agent({ source, themeKey, size, frame, color, fill, flip, dim }) {
  const base = getAiAvatarStyle(themeKey) || {};
  const tf = [...(base.transform || []), ...(flip ? [{ scaleX: -1 }] : [])];
  const inner = size - 10;
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.4 : 1, alignItems: "center", justifyContent: "center" }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: fill }]} />
      <Image
        source={source}
        resizeMode="cover"
        fadeDuration={0}
        style={[{ width: inner, height: inner, borderRadius: inner / 2 }, base, tf.length ? { transform: tf } : null]}
        accessibilityIgnoresInvertColors
      />
      <Frame kind={frame} color={color} size={size} />
    </View>
  );
});

const CoupleHeart = memo(function CoupleHeart({
  colors,
  mood = "flat",
  myName,
  partnerName,
  myProgress = 0,
  partnerProgress = 0,
  streak = 0,
  bothDone = false,
  waveStyle = "ecg",
  pulseColor,
  frameStyle = "ring",
  partnerFrameStyle,
  partnerDim = false,
  mirrorPartner = true,
  celebrate = true,
}) {
  const { aiThemeKey, accentKey } = useTheme();
  const agentSrc = getAiAvatar(aiThemeKey, accentKey);
  const tint = pulseColor || colors.primary;
  const cfg = MOODS[mood] || MOODS.flat;
  const active = mood !== "flat";
  const showFlame = bothDone && streak > 0;

  const [w, setW] = useState(0);
  const { d, len } = useMemo(() => buildWave(waveStyle, w, H / 2, cfg.amp), [waveStyle, w, cfg.amp]);
  const seg = Math.min(70, len * 0.4);
  const travelMax = Math.max(0, w / 2 - COL / 2 - AV / 2 - HEART / 2 - 4); // agent chạm trái tim ở progress = 1

  const travel = useRef(new Animated.Value(0)).current; // xung sáng chạy dọc sóng
  const beat = useRef(new Animated.Value(1)).current; // trái tim đập
  const left = useRef(new Animated.Value(0)).current; // tiến độ của mình / của người kia (0..1)
  const right = useRef(new Animated.Value(0)).current;
  const agentOp = useRef(new Animated.Value(1)).current; // agent + trái tim mờ dần khi ngọn lửa bung ra
  const flameIn = useRef(new Animated.Value(0)).current; // 0 -> 1: ngọn lửa bung
  const burst = useRef(new Animated.Value(0)).current; // tia lửa toả ra
  const flicker = useRef(new Animated.Value(1)).current; // ngọn lửa bập bùng
  const shown = useRef(false);

  // nhịp tim + xung sáng chạy dọc sóng
  useEffect(() => {
    const period = 60000 / cfg.bpm;
    travel.setValue(0);
    const run = Animated.loop(Animated.timing(travel, { toValue: 1, duration: period * 2, easing: Easing.linear, useNativeDriver: false }));
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: cfg.amp ? 1.28 : 1.04, duration: 110, useNativeDriver: true }),
        Animated.timing(beat, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(beat, { toValue: cfg.amp ? 1.16 : 1.02, duration: 100, useNativeDriver: true }),
        Animated.timing(beat, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.delay(Math.max(0, period - 460)),
      ]),
    );
    if (cfg.amp) run.start();
    pulse.start();
    return () => {
      run.stop();
      pulse.stop();
    };
  }, [cfg.bpm, cfg.amp, travel, beat]);

  // hai agent tiến lại gần trái tim theo tiến độ
  useEffect(() => {
    const go = (v, to) => Animated.spring(v, { toValue: Math.max(0, Math.min(1, to || 0)), friction: 8, tension: 60, useNativeDriver: true }).start();
    go(left, myProgress);
    go(right, partnerProgress);
  }, [myProgress, partnerProgress, left, right]);

  // "BÙM": ngọn lửa bung ra, agent biến mất; sau đó chỉ còn ngọn lửa + số ngày
  useEffect(() => {
    if (!showFlame) {
      shown.current = false;
      flameIn.setValue(0);
      burst.setValue(0);
      agentOp.setValue(1);
      return undefined;
    }
    if (shown.current) return undefined;
    shown.current = true;
    if (!celebrate) {
      flameIn.setValue(1);
      agentOp.setValue(0);
    } else {
      Animated.parallel([
        Animated.timing(agentOp, { toValue: 0, duration: 260, delay: 160, useNativeDriver: true }),
        Animated.spring(flameIn, { toValue: 1, friction: 4.5, tension: 110, delay: 200, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 850, delay: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1.06, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.97, duration: 480, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showFlame, celebrate, flameIn, burst, agentOp, flicker]);

  const dashOffset = travel.interpolate({ inputRange: [0, 1], outputRange: [seg, -len] });
  const leftX = left.interpolate({ inputRange: [0, 1], outputRange: [0, travelMax] });
  const rightX = right.interpolate({ inputRange: [0, 1], outputRange: [0, -travelMax] });
  const flameScale = Animated.multiply(flameIn.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }), flicker);
  const flameOp = flameIn.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] });
  const sparks = useMemo(
    () => Array.from({ length: SPARKS }, (_, i) => {
      const a = (i / SPARKS) * Math.PI * 2 + 0.3;
      const dist = 46 + (i % 3) * 14;
      return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist * 0.8, c: [FLAME, "#ffd166", tint][i % 3], s: 6 + (i % 3) * 2 };
    }),
    [tint],
  );

  const pct = (v) => Math.round((v || 0) * 100);
  const label = showFlame
    ? `Cả hai đã xong hôm nay, chuỗi chung ${streak} ngày`
    : `Tiến độ hôm nay: bạn ${pct(myProgress)} phần trăm, ${partnerName || "người kia"} ${pct(partnerProgress)} phần trăm`;
  const frameColor = tint;
  const partnerFrame = partnerFrameStyle || frameStyle;

  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={label}>
      <View style={styles.row} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {w > 0 && (
          <>
            {/* sóng nhịp tim chạy giữa hai agent; mờ đi khi ngọn lửa bung ra */}
            <Animated.View style={[styles.wave, { opacity: agentOp.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }]}
              pointerEvents="none">
              <Svg width={w} height={H}>
                <Path d={d} stroke={tint} strokeOpacity={active ? 0.22 : 0.3} strokeWidth={2} fill="none" strokeLinecap="round"
                  strokeLinejoin="round" strokeDasharray={active ? undefined : [4, 6]} />
                {cfg.amp > 0 && (
                  <AnimatedPath d={d} stroke={tint} strokeOpacity={cfg.line} strokeWidth={2.8} fill="none" strokeLinecap="round"
                    strokeLinejoin="round" strokeDasharray={[seg, len]} strokeDashoffset={dashOffset} />
                )}
              </Svg>
            </Animated.View>

            {/* trái tim giữa */}
            <Animated.View pointerEvents="none"
              style={[styles.heart, { left: w / 2 - HEART / 2, backgroundColor: colors.card, borderColor: colors.primaryBorder || colors.border,
                opacity: agentOp, transform: [{ scale: beat }] }]}>
              <Ionicons name={active ? "heart" : "heart-outline"} size={18} color={active ? tint : colors.textMuted} />
            </Animated.View>

            {/* hai agent: tiến lại gần trái tim theo tiến độ */}
            <Animated.View style={[styles.col, { left: 0, opacity: agentOp, transform: [{ translateX: leftX }] }]}>
              <Agent source={agentSrc} themeKey={aiThemeKey} size={AV} frame={frameStyle} color={frameColor} fill={colors.primarySoft} />
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>Bạn</Text>
            </Animated.View>
            <Animated.View style={[styles.col, { right: 0, opacity: agentOp, transform: [{ translateX: rightX }] }]}>
              <Agent source={agentSrc} themeKey={aiThemeKey} size={AV} frame={partnerFrame} color={frameColor} fill={colors.primarySoft}
                flip={mirrorPartner} dim={partnerDim} />
              <Text style={[styles.name, { color: colors.text, opacity: partnerDim ? 0.5 : 1 }]} numberOfLines={1}>{partnerName}</Text>
            </Animated.View>

            {/* BÙM: tia lửa + ngọn lửa với số ngày chuỗi nằm trong */}
            {showFlame && (
              <View style={[styles.flameBox, { left: w / 2 - FLAME_W / 2 }]} pointerEvents="none">
                {sparks.map((p, i) => (
                  <Animated.View key={i}
                    style={[styles.spark, { width: p.s, height: p.s, borderRadius: p.s, backgroundColor: p.c,
                      left: FLAME_W / 2 - p.s / 2, top: FLAME_W / 2 - p.s / 2,
                      opacity: burst.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
                      transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                        { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
                        { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }] }]} />
                ))}
                <Animated.View style={[styles.glow, { opacity: flameOp.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
                  transform: [{ scale: flameScale }] }]} />
                <Animated.View style={{ opacity: flameOp, transform: [{ scale: flameScale }] }}>
                  <FlameStreak count={streak} size={FLAME_W} inside />
                </Animated.View>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
});

export default CoupleHeart;

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  row: { height: ROW_H },
  wave: { position: "absolute", left: 0, right: 0, top: (AV - H) / 2, height: H },
  heart: {
    position: "absolute",
    top: AV / 2 - HEART / 2,
    width: HEART,
    height: HEART,
    borderRadius: HEART / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  col: { position: "absolute", top: 0, width: COL, alignItems: "center" },
  name: { fontSize: 12.5, fontWeight: "700", marginTop: 6, maxWidth: COL, textAlign: "center" },
  flameBox: { position: "absolute", top: AV / 2 - FLAME_W / 2 - 2, width: FLAME_W, height: FLAME_W, alignItems: "center", justifyContent: "center" },
  spark: { position: "absolute" },
  glow: { position: "absolute", width: FLAME_W * 1.5, height: FLAME_W * 1.5, borderRadius: FLAME_W, backgroundColor: FLAME },
});