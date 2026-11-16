// ExportPreviewSheet.js — màn xem trước trước khi tạo file: sửa tên, chọn định dạng, chọn theme (chấm màu), Lưu vào Google Drive.
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { estimate, FORMATS, GOOGLE_LABEL, THEMES } from "./exportMeta";

const LOCAL_FORMATS = ["docx", "pdf", "xlsx", "pptx"];
const GOOGLE_FORMATS = ["gdoc", "gsheet", "gslides"];

const Chip = ({ active, disabled, icon, label, onPress, colors }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityState={{ selected: active, disabled }}
    style={[
      s.chip,
      {
        backgroundColor: active ? colors.primarySoft : colors.card,
        borderColor: active ? colors.primary : colors.border,
        opacity: disabled ? 0.45 : 1,
      },
    ]}
  >
    <Ionicons name={icon} size={16} color={active ? colors.primary : colors.textMuted} />
    <Text numberOfLines={1} style={[s.chipText, { color: active ? colors.primary : colors.text }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const ExportPreviewSheet = memo(function ExportPreviewSheet({
  visible, onClose, onConfirm, colors,
  file,                 // { fmt, name, body, from? }
  theme, onThemeChange, // theme đang chọn + hàm đổi (lưu mặc định do nơi gọi làm)
  googleConnected,      // true | false | null (chưa biết)
  lockFormat,           // 'docx' | 'xlsx' | null : đang sửa file đính kèm -> chỉ cho đúng định dạng gốc
  busy,
}) {
  const insets = useSafeAreaInsets();
  const [fmt, setFmt] = useState(file.fmt);
  const [name, setName] = useState(file.name);

  useEffect(() => {
    if (visible) {
      setFmt(lockFormat || file.fmt);
      setName(file.name);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const isGoogle = !!FORMATS[fmt]?.google;
  const cleanName = name.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 60);
  const canGo = !!cleanName && !busy && (!isGoogle || googleConnected);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={busy ? undefined : onClose} accessibilityLabel="Đóng" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.kav} pointerEvents="box-none">
        <View style={[s.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={[s.grab, { backgroundColor: colors.border }]} />
          <View style={s.head}>
            <Text style={[s.title, { color: colors.text }]} numberOfLines={1}>
              Xem trước file
            </Text>
            <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={10} accessibilityLabel="Đóng">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Tên file */}
            <Text style={[s.label, { color: colors.textMuted }]}>Tên file</Text>
            <View style={[s.nameRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={60}
                placeholder="Tên file"
                placeholderTextColor={colors.textMuted}
                style={[s.nameInput, { color: colors.text }]}
                autoCorrect={false}
              />
              {!isGoogle && <Text style={{ color: colors.textMuted, fontSize: 14 }}>.{FORMATS[fmt].ext}</Text>}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }} numberOfLines={2}>
              {FORMATS[fmt].label} · {estimate(file.body, fmt)} · {file.body.length.toLocaleString("vi-VN")} ký tự
            </Text>

            {file.from ? (
              <View style={[s.note, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>
                  Sửa từ file «{file.from}». File gốc không bị đổi; ảnh và định dạng riêng của file gốc có thể không được giữ.
                </Text>
              </View>
            ) : null}

            {/* Định dạng */}
            <Text style={[s.label, { color: colors.textMuted, marginTop: 16 }]}>Định dạng</Text>
            <View style={s.wrap}>
              {LOCAL_FORMATS.map((k) => (
                <Chip
                  key={k} colors={colors} icon={FORMATS[k].icon} label={FORMATS[k].label} active={fmt === k}
                  disabled={!!lockFormat && lockFormat !== k} onPress={() => setFmt(k)}
                />
              ))}
            </View>

            {!lockFormat && (
              <>
                <Text style={[s.label, { color: colors.textMuted, marginTop: 16 }]}>Lưu vào Google Drive</Text>
                <View style={s.wrap}>
                  {GOOGLE_FORMATS.map((k) => (
                    <Chip
                      key={k} colors={colors} icon="logo-google" label={GOOGLE_LABEL[k]} active={fmt === k}
                      disabled={googleConnected === false} onPress={() => setFmt(k)}
                    />
                  ))}
                </View>
                {googleConnected === false && (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                    Cần kết nối tài khoản Google trước (Cài đặt → Tài khoản Google).
                  </Text>
                )}
              </>
            )}

            {/* Theme */}
            <Text style={[s.label, { color: colors.textMuted, marginTop: 16 }]}>Màu giao diện file</Text>
            <View style={s.dots}>
              {THEMES.map((t) => {
                const on = theme === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => onThemeChange(t.key)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t.label}
                    style={[s.dotRing, { borderColor: on ? colors.text : "transparent" }]}
                  >
                    <View style={[s.dot, { backgroundColor: t.color }]}>
                      {on && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
              {THEMES.find((t) => t.key === theme)?.label} · tự nhớ cho lần sau
            </Text>
          </ScrollView>

          <TouchableOpacity
            onPress={() => onConfirm({ format: fmt, title: cleanName })}
            disabled={!canGo}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={[s.go, { backgroundColor: colors.primary, opacity: canGo ? 1 : 0.5 }]}
          >
            <Ionicons name={isGoogle ? "cloud-upload-outline" : "download-outline"} size={18} color={colors.primaryText || "#fff"} />
            <Text style={[s.goText, { color: colors.primaryText || "#fff" }]} numberOfLines={1}>
              {busy ? "Đang tạo…" : isGoogle ? `Lưu vào ${GOOGLE_LABEL[fmt]}` : `Tạo file ${FORMATS[fmt].label}`}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheet: { maxHeight: "88%", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8 },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { fontSize: 18, fontWeight: "700", flex: 1, marginRight: 12 },
  label: { fontSize: 12.5, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  nameRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  nameInput: { flex: 1, fontSize: 16, paddingVertical: Platform.OS === "ios" ? 12 : 8, minWidth: 0 },
  note: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 10, marginTop: 10, alignItems: "flex-start" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "100%" },
  chipText: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  dots: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  dotRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 2.5, alignItems: "center", justifyContent: "center" },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  go: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  goText: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
});

export default ExportPreviewSheet;
