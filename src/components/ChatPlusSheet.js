import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import BottomSheet from "./BottomSheet";

// key phải khớp với backend (CHAT_MODELS trong main.py)
export const CHAT_MODELS = [
  { key: "fast", label: "Nhanh", sub: "Haiku · trả lời tức thì", icon: "flash-outline" },
  { key: "balanced", label: "Cân bằng", sub: "Sonnet · thông minh, vẫn nhanh", icon: "options-outline" },
  { key: "smart", label: "Mạnh nhất", sub: "Opus · bài khó, trả lời chậm hơn", icon: "sparkles-outline" },
];

const ChatPlusSheet = memo(function ChatPlusSheet({
  visible,
  prefs,
  onChangePrefs,
  onPickFile,
  onClose,
  attachFull = false,
}) {
  const { colors } = useTheme();

  const Group = ({ title, children }) => (
    <View style={styles.group}>
      <Text style={[styles.section, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );

  const Row = ({ icon, title, sub, onPress, right, disabled, last }) => (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        disabled={disabled}
        style={[styles.row, disabled && { opacity: 0.45 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
          {!!sub && <Text style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</Text>}
        </View>
        {right}
      </TouchableOpacity>
      {!last && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
    </>
  );

  const Toggle = ({ value, onChange }) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colors.primary, false: colors.border }}
      thumbColor="#ffffff"
    />
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.86}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <Group title="Thêm vào tin nhắn">
          <Row
            icon="document-attach-outline"
            title="Tệp"
            sub={attachFull ? "Đã đủ số tệp đính kèm" : "PDF, Word, văn bản"}
            onPress={onPickFile}
            disabled={attachFull}
            last
          />
        </Group>

        <Group title="Công cụ">
          <Row
            icon="globe-outline"
            title="Tìm kiếm web"
            sub="Tra cứu thông tin mới nhất trên mạng"
            onPress={() => onChangePrefs({ webSearch: !prefs.webSearch })}
            right={<Toggle value={prefs.webSearch} onChange={(v) => onChangePrefs({ webSearch: v })} />}
          />
          <Row
            icon="bulb-outline"
            title="Suy nghĩ sâu"
            sub="Cân nhắc kỹ hơn trước khi trả lời (chậm hơn)"
            onPress={() => onChangePrefs({ thinking: !prefs.thinking })}
            right={<Toggle value={prefs.thinking} onChange={(v) => onChangePrefs({ thinking: v })} />}
            last
          />
        </Group>

        <Group title="Model">
          {CHAT_MODELS.map((m, i) => {
            const active = prefs.model === m.key;
            return (
              <Row
                key={m.key}
                icon={m.icon}
                title={m.label}
                sub={m.sub}
                onPress={() => onChangePrefs({ model: m.key })}
                last={i === CHAT_MODELS.length - 1}
                right={
                  <Ionicons
                    name={active ? "radio-button-on" : "radio-button-off"}
                    size={22}
                    color={active ? colors.primary : colors.border}
                  />
                }
              />
            );
          })}
        </Group>
      </ScrollView>
    </BottomSheet>
  );
});

export default ChatPlusSheet;

const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  section: { fontSize: 12.5, fontWeight: "700", marginBottom: 8, marginLeft: 4 },
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
});