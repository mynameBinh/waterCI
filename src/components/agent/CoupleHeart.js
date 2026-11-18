// =============================================================================
// CoupleHeart — hai ảnh đại diện + sóng nhịp tim (ECG) nối giữa, trái tim ở chính giữa đập theo nhịp.
//   mood = "flat"  : chưa xem được nhau (chưa liên kết / chưa bật chia sẻ) -> đường thẳng mờ, tim rỗng
//          "calm"  : đã liên kết, đang cùng uống nước                       -> nhịp chậm
//          "happy" : cả hai đã xong hôm nay                                  -> nhịp nhanh, sóng cao, sáng hơn
// Xung sáng chạy dọc đường ECG từ người này sang người kia, mỗi vòng = 2 nhịp.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Avatar } from "../Avatar";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const H = 52;
const MID = H / 2;
const AV = 64;

// một nhịp ECG: [dx, dy] (dy âm = đi lên)
const BEAT = [[0, 0], [8, 0], [11, -4], [14, 0], [18, 0], [20, 5], [24, -20], [28, 15], [31, 0], [36, 0], [40, -6], [46, 0], [56, 0]];
const BEAT_W = 56;

const MOODS = {
  flat: { bpm: 40, amp: 0, line: 0.3 },
  calm: { bpm: 66, amp: 1, line: 0.9 },
  happy: { bpm: 92, amp: 1.2, line: 1 },
};

function buildEcg(width, amp) {
  const pts = [[0, MID]];
  if (amp > 0 && width > BEAT_W * 2 + 40) {
    const n = 2 * Math.max(1, Math.floor(width / 200)); // số chẵn: chừa chỗ giữa cho trái tim
    for (let i = 0; i < n; i++) {
      const x0 = ((i + 0.5) * width) / n - BEAT_W / 2;
      for (const [dx, dy] of BEAT) pts.push([x0 + dx, MID + dy * amp]);
    }
  }
  pts.push([width, MID]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return { d, len: Math.max(len, 1) };
}

const CoupleHeart = memo(function CoupleHeart({ colors, mood = "flat", myName, partnerName, mySource, myUri, partnerSource }) {
  const cfg = MOODS[mood] || MOODS.flat;
  const [w, setW] = useState(0);
  const { d, len } = useMemo(() => buildEcg(w, cfg.amp), [w, cfg.amp]);
  const seg = Math.min(70, len * 0.4);

  const travel = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const period = 60000 / cfg.bpm;
    travel.setValue(0);
    const run = Animated.loop(
      Animated.timing(travel, { toValue: 1, duration: period * 2, easing: Easing.linear, useNativeDriver: false }),
    );
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

  const dashOffset = travel.interpolate({ inputRange: [0, 1], outputRange: [seg, -len] });
  const active = mood !== "flat";

  return (
    <View style={styles.row}>
      <View style={styles.side}>
        <Avatar name={myName} source={mySource} uri={myUri} size={AV} ringColor={colors.primary} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          Bạn
        </Text>
      </View>

      <View style={styles.mid} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {w > 0 && (
          <Svg width={w} height={H}>
            {/* đường nền mờ */}
            <Path d={d} stroke={colors.primary} strokeOpacity={active ? 0.22 : 0.3} strokeWidth={2} fill="none"
              strokeLinecap="round" strokeLinejoin="round" strokeDasharray={active ? undefined : [4, 6]} />
            {/* xung sáng chạy dọc đường */}
            {cfg.amp > 0 && (
              <AnimatedPath d={d} stroke={colors.primary} strokeOpacity={cfg.line} strokeWidth={2.8} fill="none"
                strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[seg, len]} strokeDashoffset={dashOffset} />
            )}
          </Svg>
        )}
        <Animated.View
          style={[styles.heart, { backgroundColor: colors.card, borderColor: colors.primaryBorder || colors.border,
            transform: [{ scale: beat }] }]}
          pointerEvents="none"
        >
          <Ionicons name={active ? "heart" : "heart-outline"} size={18} color={active ? colors.primary : colors.textMuted} />
        </Animated.View>
      </View>

      <View style={styles.side}>
        <Avatar name={partnerName} source={partnerSource} size={AV} ringColor={colors.primary} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {partnerName}
        </Text>
      </View>
    </View>
  );
});

export default CoupleHeart;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", marginBottom: 4 },
  side: { width: AV + 16, alignItems: "center" },
  name: { fontSize: 12.5, fontWeight: "700", marginTop: 6, maxWidth: AV + 16 },
  mid: { flex: 1, height: H, marginTop: (AV - H) / 2, justifyContent: "center" },
  heart: {
    position: "absolute",
    alignSelf: "center",
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
