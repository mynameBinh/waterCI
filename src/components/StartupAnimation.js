import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import { useAppLogo } from "../context/aiAgents";
import { useTheme } from "../context/ThemeContext";

const LOGO_SIZE = 180;
const RING_SIZE = 200;
const MIN_SHOW_MS = 1300; // tối thiểu trước khi bắt đầu mờ ra

// Overlay mở app: nền theo màu chủ đạo + logo agent nổi lên + sóng nước, rồi mờ ra.
// - Phải nằm TRONG <ThemeProvider> (dùng useTheme / useAppLogo).
// - `ready`: khi App đã đọc xong token. Overlay chỉ mờ ra khi đã đủ MIN_SHOW_MS VÀ ready = true,
//   nên không bao giờ lộ màn hình loading bên dưới.
// - Chỉ dùng opacity/transform với useNativeDriver nên chạy mượt trên iPhone. Tổng ~1.7s.
export default function StartupAnimation({ ready = true, onDone }) {
  const { colors } = useTheme();
  const logo = useAppLogo();

  const logoAnim = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const exitAnim = useRef(new Animated.Value(0)).current;

  const [minDone, setMinDone] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Giai đoạn 1: vào (logo, sóng)
  useEffect(() => {
    const timing = (value, duration, delay, easing) =>
      Animated.timing(value, {
        toValue: 1,
        duration,
        delay,
        easing,
        useNativeDriver: true,
      });

    const anim = Animated.parallel([
      timing(logoAnim, 650, 150, Easing.out(Easing.cubic)),
      timing(ring1, 1000, 250, Easing.out(Easing.quad)),
      timing(ring2, 1000, 550, Easing.out(Easing.quad)),
    ]);
    anim.start();
    const timer = setTimeout(() => setMinDone(true), MIN_SHOW_MS);

    return () => {
      anim.stop();
      clearTimeout(timer);
    };
  }, [logoAnim, ring1, ring2]);

  // Giai đoạn 2: mờ ra (khi đủ thời gian tối thiểu và app đã sẵn sàng)
  useEffect(() => {
    if (!minDone || !ready) return;
    const exit = Animated.timing(exitAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    exit.start(({ finished }) => {
      if (finished) onDoneRef.current?.();
    });
    return () => exit.stop();
  }, [minDone, ready, exitAnim]);

  const ringStyle = (v) => ({
    opacity: v.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0, 0.45, 0],
    }),
    transform: [
      {
        scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.2] }),
      },
    ],
  });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        {
          backgroundColor: colors.background,
          opacity: exitAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
        },
      ]}
      pointerEvents="auto"
    >
      <LinearGradient
        colors={[colors.background, colors.primarySoft]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        <View style={styles.logoWrap}>
          <Animated.View
            style={[
              styles.ring,
              { borderColor: colors.primary },
              ringStyle(ring1),
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              { borderColor: colors.primary },
              ringStyle(ring2),
            ]}
          />
          <Animated.View
            style={{
              opacity: logoAnim,
              transform: [
                {
                  translateY: logoAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
                {
                  scale: logoAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.88, 1],
                  }),
                },
              ],
            }}
          >
            <Image
              source={logo}
              style={styles.logo}
              resizeMode="contain"
              fadeDuration={0}
            />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 999, elevation: 999 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
});