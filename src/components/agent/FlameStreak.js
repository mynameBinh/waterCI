// FlameStreak — icon ngọn lửa + số ngày, dùng cho chuỗi chung của Cặp đôi (giống kiểu streak cá nhân).
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

export const FLAME = "#ff7a1a";

const FlameStreak = memo(function FlameStreak({ count, size = 16, label, style }) {
  return (
    <View style={[styles.row, style]} accessibilityLabel={`Chuỗi chung ${count} ngày`}>
      <Ionicons name="flame" size={size + 2} color={FLAME} />
      <Text style={[styles.num, { fontSize: size, color: FLAME }]}>{count}</Text>
      {!!label && <Text style={[styles.label, { fontSize: size - 2 }]}>{label}</Text>}
    </View>
  );
});

export default FlameStreak;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  num: { fontWeight: "800", marginLeft: 2 },
  label: { fontWeight: "600", marginLeft: 4 },
});
