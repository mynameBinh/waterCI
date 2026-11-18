import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import BottomSheet from "./BottomSheet";
import SkillsSection from "./SkillsSection"; // >>> skills

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
  onOpenGoogle, // mở màn "Tài khoản Google" (AIChatModal truyền vào)
  onClose,
  attachFull = false,
  apiBase, // >>> skills: để mục "Skill" gọi API /api/brain/skills
  token,
  authFetch,
}) {
  const { colors } = useTheme();
  const [openModel, setOpenModel] = useState(false);
  useEffect(() => {
    if (!visible) {
      setOpenModel(false);
    }
  }, [visible]);

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

  // Dòng tiêu đề có mũi tên: bấm để xổ / thu. Là HÀM trả về phần tử (không phải component) nên không bị dựng lại mỗi lần render.
  const renderHead = (icon, title, sub, open, onPress) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={styles.row}
    >
      <View style={[styles.iconWrap, { backgroundColor: open ? colors.primary : colors.primarySoft }]}>
        <Ionicons name={icon} size={20} color={open ? "#ffffff" : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: open ? colors.primary : colors.text }]}>{title}</Text>
        {!!sub && <Text style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</Text>}
      </View>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={open ? colors.primary : colors.textMuted} />
    </TouchableOpacity>
  );
  // Khung có tiêu đề nhỏ phía trên (giống Group) nhưng là HÀM, không phải component -> phần bên trong không bị dựng lại mỗi lần render
  const renderGroup = (title, children) => (
    <View style={styles.group}>
      <Text style={[styles.section, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>{children}</View>
    </View>
  );
  // Phần xổ xuống: nền khác, thụt vào thẳng hàng với chữ của dòng cha, có đường dọc nối với icon cha, chữ nhỏ hơn, không có ô icon
  const renderBody = (children) => (
    <View style={[styles.body, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      <View pointerEvents="none" style={[styles.guide, { backgroundColor: colors.border }]} />
      {children}
    </View>
  );
  const renderSub = ({ key, title, sub, onPress, right, active, last }) => (
    <View key={key}>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.subRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.subTitle, { color: active ? colors.primary : colors.text }]}>{title}</Text>
          {!!sub && <Text style={[styles.subSub, { color: colors.textMuted }]}>{sub}</Text>}
        </View>
        {right}
      </TouchableOpacity>
      {!last && <View style={[styles.subSep, { backgroundColor: colors.border }]} />}
    </View>
  );
  const curModel = CHAT_MODELS.find((m) => m.key === prefs.model) || CHAT_MODELS[1];

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.86}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Group title="Thêm vào tin nhắn">
          <Row
            icon="document-attach-outline"
            title="Tệp"
            sub={attachFull ? "Đã đủ số tệp đính kèm" : "PDF, Word, Excel, văn bản"}
            onPress={onPickFile}
            disabled={attachFull}
            last
          />
        </Group>

        {!!onOpenGoogle && (
          <Group title="Tài khoản">
            <Row
              icon="logo-google"
              title="Tài khoản Google"
              sub="Lưu file vào Drive, đọc và sửa Docs / Sheets / Slides"
              onPress={onOpenGoogle}
              right={<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
              last
            />
          </Group>
        )}

        {/* Công cụ: hiện thẳng ra ngoài như "Tệp" và "Tài khoản" */}
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

        {/* Model: tiêu đề phía trên, dòng bên trong hiện model đang chọn, bấm vào mới sổ các lựa chọn */}
        {renderGroup(
          "Model",
          <>
            {renderHead(curModel.icon, curModel.label, curModel.sub, openModel, () => setOpenModel((o) => !o))}
            {openModel &&
              renderBody(
                CHAT_MODELS.map((m, i) => {
                  const active = prefs.model === m.key;
                  return renderSub({
                    key: m.key,
                    title: m.label,
                    sub: m.sub,
                    active,
                    onPress: () => {
                      onChangePrefs({ model: m.key });
                      setOpenModel(false); // chọn xong tự thu lại cho gọn
                    },
                    last: i === CHAT_MODELS.length - 1,
                    right: (
                      <Ionicons
                        name={active ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={active ? colors.primary : colors.border}
                      />
                    ),
                  });
                }),
              )}
          </>,
        )}

        {/* Skill: tiêu đề phía trên (do SkillsSection tự vẽ), bấm vào mới sổ danh sách */}
        {!!apiBase && !!token && ( // >>> skills
          <SkillsSection key="skills" apiBase={apiBase} token={token} authFetch={authFetch} />
        )}
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
  // phần xổ xuống (con): thụt vào 66 = 14 (lề) + 38 (ô icon) + 14 (khoảng cách) để thẳng hàng chữ cha
  body: { borderTopWidth: StyleSheet.hairlineWidth },
  guide: { position: "absolute", left: 32, top: 0, bottom: 0, width: 2, borderRadius: 1, opacity: 0.7 },
  subRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingLeft: 66, paddingRight: 14 },
  subSep: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  subTitle: { fontSize: 14, fontWeight: "600" },
  subSub: { fontSize: 12, marginTop: 1, lineHeight: 16 },
});