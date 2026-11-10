import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from "react-native-svg";

// ─────────────────────────────────────────────────────────────────────────────
// Trang trí cho nút chụp ảnh. Danh sách lựa chọn (key / nhãn / emoji) nằm ở
// ThemeContext (DECORATIONS) để màn Profile hiển thị; file này chỉ lo VẼ.
//
// Quy ước toạ độ SVG: viewBox "0 -35 100 55" = vùng phía trên đầu nút.
//   x: 0..100 theo chiều ngang nút, y = 0 là đỉnh nút, y âm là phía trên nút.
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = ["#fde68a", "#f59e0b"];
const GOLD_OFF = ["#e2e8f0", "#94a3b8"];
const SW = 3; // độ dày viền (theo hệ toạ độ viewBox)

// Lớp SVG nằm phía trên đầu nút, phía sau nút (zIndex 1 < nút 3)
const SvgLayer = ({ size, gradient, gold, children }) => (
  <Svg
    width={size}
    height={size * 0.55}
    viewBox="0 -35 100 55"
    pointerEvents="none"
    style={{ position: "absolute", top: -size * 0.35, left: 0, zIndex: 1 }}
  >
    <Defs>
      <SvgGradient id="decoG" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={gradient[0]} />
        <Stop offset="1" stopColor={gradient[1]} />
      </SvgGradient>
      <SvgGradient id="decoGold" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={gold[0]} />
        <Stop offset="1" stopColor={gold[1]} />
      </SvgGradient>
    </Defs>
    {children}
  </Svg>
);

// Bay lên xuống nhẹ nhàng (dùng cho vầng hào quang)
const Floating = ({ children, disabled }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (disabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
};

// Một ngôi sao nhấp nháy
const Twinkle = ({ delay, disabled, style, size, color }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (disabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, delay, v]);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.1] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", zIndex: 4, opacity, transform: [{ scale }] }, style]}
    >
      <Ionicons name="sparkles" size={size} color={color} />
    </Animated.View>
  );
};

// ── Tai thỏ (dài, hẹp, đứng thẳng) ──
const RabbitEars = ({ size, gradient, borderColor, innerColor }) => {
  const W = size * 0.24;
  const H = size * 0.62;
  const IW = W * 0.5;
  const IH = H * 0.62;
  const common = { width: W, height: H, borderRadius: W, top: -H * 0.5 };
  const inner = { width: IW, height: IH, borderRadius: IW, top: -H * 0.33 };
  return (
    <>
      <LinearGradient
        colors={gradient}
        style={[
          styles.ear,
          styles.earLeft,
          { borderColor },
          common,
          { left: size * 0.24 },
        ]}
      />
      <View
        style={[
          styles.earInner,
          styles.earLeft,
          inner,
          { left: size * 0.24 + (W - IW) / 2, backgroundColor: innerColor },
        ]}
      />
      <LinearGradient
        colors={gradient}
        style={[
          styles.ear,
          styles.earRight,
          { borderColor },
          common,
          { right: size * 0.24 },
        ]}
      />
      <View
        style={[
          styles.earInner,
          styles.earRight,
          inner,
          { right: size * 0.24 + (W - IW) / 2, backgroundColor: innerColor },
        ]}
      />
    </>
  );
};

const ButtonDecoration = memo(function ButtonDecoration({
  type,
  size,
  gradient, // [sáng, đậm] theo accent (hoặc xám khi disabled)
  borderColor,
  innerColor,
  accent, // màu accent đặc (dùng cho viên ngọc vương miện)
  disabled,
}) {
  const gold = disabled ? GOLD_OFF : GOLD;

  switch (type) {
    case "rabbit":
      return (
        <RabbitEars
          size={size}
          gradient={gradient}
          borderColor={borderColor}
          innerColor={innerColor}
        />
      );

    case "cat":
      return (
        <SvgLayer size={size} gradient={gradient} gold={gold}>
          <Path d="M8 22 L12 -28 L45 0 Z" fill="url(#decoG)" stroke={borderColor} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M92 22 L88 -28 L55 0 Z" fill="url(#decoG)" stroke={borderColor} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M19 12 L20 -13 L36 3 Z" fill={innerColor} stroke={innerColor} strokeWidth={3} strokeLinejoin="round" />
          <Path d="M81 12 L80 -13 L64 3 Z" fill={innerColor} stroke={innerColor} strokeWidth={3} strokeLinejoin="round" />
        </SvgLayer>
      );

    case "bear":
      return (
        <SvgLayer size={size} gradient={gradient} gold={gold}>
          <Circle cx="20" cy="4" r="16" fill="url(#decoG)" stroke={borderColor} strokeWidth={SW} />
          <Circle cx="80" cy="4" r="16" fill="url(#decoG)" stroke={borderColor} strokeWidth={SW} />
          <Circle cx="20" cy="2" r="8" fill={innerColor} />
          <Circle cx="80" cy="2" r="8" fill={innerColor} />
        </SvgLayer>
      );

    case "crown":
      return (
        <SvgLayer size={size} gradient={gradient} gold={gold}>
          <Path
            d="M23 8 L20 -20 L36 -6 L50 -29 L64 -6 L80 -20 L77 8 Z"
            fill="url(#decoGold)"
            stroke={borderColor}
            strokeWidth={SW}
            strokeLinejoin="round"
          />
          <Circle cx="20" cy="-20" r="4" fill={accent} />
          <Circle cx="50" cy="-29" r="4.5" fill={accent} />
          <Circle cx="80" cy="-20" r="4" fill={accent} />
        </SvgLayer>
      );

    case "bow":
      return (
        <SvgLayer size={size} gradient={gradient} gold={gold}>
          <Path d="M50 -8 C40 -30 10 -32 13 -12 C15 5 40 2 50 -8 Z" fill="url(#decoG)" stroke={borderColor} strokeWidth={SW} strokeLinejoin="round" />
          <Path d="M50 -8 C60 -30 90 -32 87 -12 C85 5 60 2 50 -8 Z" fill="url(#decoG)" stroke={borderColor} strokeWidth={SW} strokeLinejoin="round" />
          <Ellipse cx="50" cy="-8" rx="8" ry="9" fill="url(#decoG)" stroke={borderColor} strokeWidth={SW} />
        </SvgLayer>
      );

    case "halo":
      return (
        <Floating disabled={disabled}>
          <SvgLayer size={size} gradient={gradient} gold={gold}>
            <Ellipse cx="50" cy="-16" rx="25" ry="7" fill="none" stroke={gold[1]} strokeOpacity={0.25} strokeWidth={11} />
            <Ellipse cx="50" cy="-16" rx="25" ry="7" fill="none" stroke="url(#decoGold)" strokeWidth={5} />
          </SvgLayer>
        </Floating>
      );

    case "sparkles": {
      const color = disabled ? "#cbd5e1" : "#fbbf24";
      return (
        <>
          <Twinkle delay={0} disabled={disabled} size={size * 0.22} color={color} style={{ left: -size * 0.04, top: size * 0.02 }} />
          <Twinkle delay={350} disabled={disabled} size={size * 0.28} color={color} style={{ right: -size * 0.06, top: -size * 0.1 }} />
          <Twinkle delay={700} disabled={disabled} size={size * 0.17} color={color} style={{ right: -size * 0.02, bottom: size * 0.08 }} />
        </>
      );
    }

    default:
      return null; // "none"
  }
});

export default ButtonDecoration;

const styles = StyleSheet.create({
  ear: { position: "absolute", borderWidth: 4, zIndex: 1 },
  earInner: { position: "absolute", zIndex: 2 },
  earLeft: { transform: [{ rotate: "-10deg" }] },
  earRight: { transform: [{ rotate: "10deg" }] },
});