// GoogleAccountSection.js — mục "Tài khoản Google" (trạng thái, Kết nối / Ngắt kết nối / Kết nối lại).
// Đặt <GoogleAccountSection colors={colors} ctx={ctx} /> vào ChatPlusSheet hoặc màn Cài đặt; hoặc dùng GoogleAccountSheet (Modal).
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { googleConnect, googleDisconnect, googleStatus } from "./exportApi";

export const GoogleAccountSection = memo(function GoogleAccountSection({ colors, ctx, onChange }) {
  const [st, setSt] = useState(null); // { configured, connected, email, needs_reconnect }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await googleStatus(ctx);
      setSt(r);
      setErr("");
      onChange?.(r);
    } catch (e) {
      setErr(e?.message || "Không kiểm tra được trạng thái Google.");
    }
  }, [ctx, onChange]);

  useEffect(() => {
    refresh();
    // quay lại app sau khi cấp quyền trên trình duyệt -> tải lại trạng thái
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    try {
      await googleConnect(ctx);
    } catch (e) {
      Alert.alert("Chưa kết nối được Google", e?.message || "Bạn thử lại nhé.");
    } finally {
      setBusy(false);
    }
  };
  const disconnect = () =>
    Alert.alert("Ngắt kết nối Google?", "Ứng dụng sẽ không còn truy cập Google Drive của bạn nữa. File đã tạo vẫn còn nguyên trong Drive.", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Ngắt kết nối", style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await googleDisconnect(ctx);
            await refresh();
          } catch (e) {
            Alert.alert("Không ngắt được", e?.message || "Bạn thử lại nhé.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  let line = "Đang kiểm tra…";
  let action = null;
  if (err) line = err;
  else if (st && !st.configured) line = "Máy chủ chưa cấu hình Google (quản trị viên cần đặt các biến GOOGLE_*).";
  else if (st?.needs_reconnect) {
    line = `Kết nối đã hết hạn${st.email ? ` (${st.email})` : ""}. Hãy kết nối lại.`;
    action = { label: "Kết nối lại Google", fn: connect, primary: true };
  } else if (st?.connected) {
    line = `Đã kết nối: ${st.email}`;
    action = { label: "Ngắt kết nối", fn: disconnect, danger: true };
  } else if (st) {
    line = "Chưa kết nối. Kết nối để lưu file vào Drive, đọc và sửa Google Docs / Sheets / Slides.";
    action = { label: "Kết nối Google", fn: connect, primary: true };
  }

  return (
    <View style={[s.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.head}>
        <Ionicons name="logo-google" size={20} color={colors.primary} />
        <Text style={[s.title, { color: colors.text }]}>Tài khoản Google</Text>
        {st?.connected && <Ionicons name="checkmark-circle" size={18} color="#16A34A" />}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>{line}</Text>
      {action && st?.configured !== false && (
        <TouchableOpacity
          onPress={action.fn} disabled={busy} activeOpacity={0.85} accessibilityRole="button"
          style={[s.btn, action.primary ? { backgroundColor: colors.primary } : { borderWidth: 1, borderColor: action.danger ? "#DC2626" : colors.border }]}
        >
          {busy ? <ActivityIndicator size="small" color={action.primary ? colors.primaryText || "#fff" : colors.text} /> : (
            <Text style={[s.btnText, { color: action.primary ? colors.primaryText || "#fff" : action.danger ? "#DC2626" : colors.text }]}>{action.label}</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

export const GoogleAccountSheet = memo(function GoogleAccountSheet({ visible, onClose, colors, ctx }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { backgroundColor: colors.background }]} onPress={() => {}}>
          <GoogleAccountSection colors={colors} ctx={ctx} />
          <TouchableOpacity onPress={onClose} style={{ alignSelf: "center", padding: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Đóng</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const s = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15.5, fontWeight: "700", flex: 1 },
  btn: { marginTop: 12, borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  btnText: { fontSize: 14.5, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  sheet: { borderRadius: 18, padding: 14 },
});

export default GoogleAccountSection;
