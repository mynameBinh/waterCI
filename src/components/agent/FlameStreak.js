// FlameStreak — icon ngọn lửa + số ngày, dùng cho chuỗi chung của Cặp đôi (giống kiểu streak cá nhân).
//   <FlameStreak count={12} size={14} label="ngày chung" labelColor={colors.textMuted} /> -> ngọn lửa nhỏ + số bên cạnh (dạng một dòng)
//   <FlameStreak count={12} size={40} inside />                -> ngọn lửa lớn, số nằm TRONG ngọn lửa (dùng ở giữa CoupleHeart)
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

export const FLAME = "#ff7a1a";

const FlameStreak = memo(function FlameStreak({ count, size = 16, label, labelColor, style, inside = false }) {
  if (inside) {
    // `size` = chiều rộng ngọn lửa; số căn giữa, hơi thấp hơn tâm vì thân ngọn lửa phình ở phần dưới
    const digits = String(count).length;
    const fontSize = Math.round(size * (digits >= 3 ? 0.3 : digits === 2 ? 0.38 : 0.46));
    return (
      <View style={[{ width: size, height: size }, styles.center, style]} accessibilityLabel={`Chuỗi chung ${count} ngày`}>
        <Ionicons name="flame" size={size} color={FLAME} />
        <Text style={[styles.inside, { fontSize, top: size * 0.4 }]} allowFontScaling={false}>
          {count}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.row, style]} accessibilityLabel={`Chuỗi chung ${count} ngày`}>
      <Ionicons name="flame" size={size + 2} color={FLAME} />
      <Text style={[styles.num, { fontSize: size, color: FLAME }]}>{count}</Text>
      {!!label && <Text style={[styles.label, { fontSize: size - 2, color: labelColor || FLAME }]}>{label}</Text>}
    </View>
  );
});

export default FlameStreak;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  num: { fontWeight: "800", marginLeft: 2 },
  label: { fontWeight: "600", marginLeft: 4 },
  center: { alignItems: "center", justifyContent: "center" },
  inside: {
    position: "absolute",
    color: "#ffffff",
    fontWeight: "900",
    textShadowColor: "rgba(160,50,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});