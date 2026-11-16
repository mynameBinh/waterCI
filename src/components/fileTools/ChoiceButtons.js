// ChoiceButtons.js — khối :::choices của AI hiển thị thành nút bấm; bấm xong gửi lại thành tin nhắn.
import { memo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const ChoiceButtons = memo(function ChoiceButtons({ choices, colors, onPick }) {
  const [picked, setPicked] = useState(null);
  if (!choices) return null;
  return (
    <View style={[s.box, { backgroundColor: colors.card, borderColor: colors.primaryBorder || colors.border }]}>
      <Text style={[s.q, { color: colors.text }]}>{choices.question}</Text>
      <View style={s.list}>
        {choices.options.map((o) => {
          const on = picked === o;
          return (
            <TouchableOpacity
              key={o}
              disabled={picked !== null}
              activeOpacity={0.8}
              accessibilityRole="button"
              onPress={() => {
                setPicked(o);
                onPick(o); // gửi đúng nội dung nút như một tin nhắn của người dùng
              }}
              style={[s.btn, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.background, opacity: picked && !on ? 0.45 : 1 }]}
            >
              <Text numberOfLines={2} style={[s.t, { color: on ? colors.primary : colors.text }]}>{o}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 8 },
  q: { fontSize: 14.5, fontWeight: "600", marginBottom: 10 },
  list: { gap: 8 },
  btn: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  t: { fontSize: 15, fontWeight: "600" },
});

export default ChoiceButtons;
