import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

// key phải khớp với backend (CHAT_MODELS trong main.py)
export const CHAT_MODELS = [
  { key: "fast", label: "Nhanh", sub: "Haiku · trả lời tức thì", icon: "flash-outline" },
  { key: "balanced", label: "Cân bằng", sub: "Sonnet · thông minh, vẫn nhanh", icon: "options-outline" },
  { key: "smart", label: "Mạnh nhất", sub: "Opus · bài khó, trả lời chậm hơn", icon: "sparkles-outline" },
];

const ChatPlusSheet = memo(function ChatPlusSheet({
  prefs,
  onChangePrefs,
  onPickFile,
  onClose,
  attachFull = false,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const Row = ({ icon, title, sub, onPress, right, disabled }) => (
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
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12) + 6,
            maxHeight: height * 0.82,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }],
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={[styles.section, { color: colors.textMuted }]}>THÊM VÀO TIN NHẮN</Text>
          <Row
            icon="document-attach-outline"
            title="Tệp"
            sub={attachFull ? "Đã đủ số tệp đính kèm" : "PDF, Word, văn bản (ảnh: dùng nút ảnh bên cạnh)"}
            onPress={onPickFile}
            disabled={attachFull}
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.section, { color: colors.textMuted }]}>CÔNG CỤ</Text>
          <Row
            icon="globe-outline"
            title="Tìm kiếm web"
            sub="AI tra cứu thông tin mới nhất trên mạng"
            onPress={() => onChangePrefs({ webSearch: !prefs.webSearch })}
            right={
              <Switch
                value={prefs.webSearch}
                onValueChange={(v) => onChangePrefs({ webSearch: v })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#ffffff"
              />
            }
          />
          <Row
            icon="bulb-outline"
            title="Suy nghĩ sâu"
            sub="AI cân nhắc kỹ hơn trước khi trả lời (chậm hơn)"
            onPress={() => onChangePrefs({ thinking: !prefs.thinking })}
            right={
              <Switch
                value={prefs.thinking}
                onValueChange={(v) => onChangePrefs({ thinking: v })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#ffffff"
              />
            }
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.section, { color: colors.textMuted }]}>MODEL</Text>
          {CHAT_MODELS.map((m) => {
            const active = prefs.model === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                activeOpacity={0.7}
                onPress={() => onChangePrefs({ model: m.key })}
                style={[
                  styles.modelRow,
                  {
                    backgroundColor: active ? colors.primarySoft : "transparent",
                    borderColor: active ? colors.primaryBorder : colors.border,
                  },
                ]}
              >
                <Ionicons name={m.icon} size={20} color={active ? colors.primary : colors.textMuted} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{m.label}</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>{m.sub}</Text>
                </View>
                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off"}
                  size={22}
                  color={active ? colors.primary : colors.border}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onClose}
          style={[styles.doneBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.doneText}>Xong</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
});

export default ChatPlusSheet;

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  section: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, marginTop: 10, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 9 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12.5, marginTop: 1, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 8 },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  doneBtn: { marginTop: 12, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center" },
  doneText: { color: "#ffffff", fontSize: 15.5, fontWeight: "800" },
});