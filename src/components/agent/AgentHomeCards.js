// =============================================================================
// AgentHomeCards — thẻ ở màn hình chính:
//   Hộp thư: nhắc nhở / tin nhắn từ người kia / nhắc nhẹ của AI / ngày đặc biệt / mốc bên nhau / bản tin tuần (chưa đọc).
// (Chức năng "Cặp đôi" nay nằm ở tab "Tôi": xem CoupleSheet.js.)
// File này cũng export vài helper dùng chung: useAgentApi, useRefreshOnActive, Btn, Input.
// Tự gọi API (token + authFetch), không phụ thuộc state của Dashboard.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";

export function useAgentApi(token, apiBase, authFetch) {
  return useCallback(
    async (path, options = {}) => {
      const doFetch = authFetch || fetch;
      const res = await doFetch(`${apiBase}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Có lỗi xảy ra, bạn thử lại nhé.");
      return data;
    },
    [token, apiBase, authFetch],
  );
}

// chạy lại khi mở app / quay lại app
export function useRefreshOnActive(load) {
  useEffect(() => {
    load();
    const sub = AppState.addEventListener("change", (s) => s === "active" && load());
    return () => sub.remove();
  }, [load]);
}

const Box = ({ colors, icon, title, children, right }) => (
  <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={styles.head}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={[styles.headTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
    {children}
  </View>
);

export const Btn = ({ colors, label, onPress, busy, ghost, disabled, style }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={busy || disabled}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!(busy || disabled), busy: !!busy }}
    style={[
      styles.btn,
      ghost
        ? { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent", opacity: disabled ? 0.5 : 1 }
        : { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 },
      style,
    ]}
  >
    {busy ? (
      <ActivityIndicator size="small" color={ghost ? colors.primary : "#fff"} />
    ) : (
      <Text style={[styles.btnText, { color: ghost ? colors.text : "#fff" }]}>{label}</Text>
    )}
  </TouchableOpacity>
);

export const Input = ({ colors, ...p }) => (
  <TextInput
    placeholderTextColor={colors.textMuted}
    {...p}
    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }, p.style]}
  />
);

// ── 1. Hộp thư ───────────────────────────────────────────────────────────────
const KIND_ICON = {
  reminder: "alarm-outline",
  partner: "chatbubble-ellipses-outline",
  nudge: "water-outline",
  special: "gift-outline",
  milestone: "ribbon-outline", // mốc ngày bên nhau
  weekly: "newspaper-outline", // bản tin tuần của cặp đôi
  save: "heart-circle-outline", // được người kia gánh chuỗi
  together: "calendar-outline", // đề xuất / xác nhận ngày bên nhau
};

const InboxCard = memo(function InboxCard({ colors, api }) {
  const [items, setItems] = useState([]);
  const load = useCallback(async () => {
    try {
      const r = await api("/api/inbox?unread=true&limit=10");
      setItems(r.items || []);
    } catch {
      /* offline: giữ nguyên */
    }
  }, [api]);
  useRefreshOnActive(load);

  const readAll = async () => {
    setItems([]);
    try {
      await api("/api/inbox/read", { method: "POST", body: JSON.stringify({ ids: null }) });
    } catch {
      load();
    }
  };
  if (!items.length) return null;
  return (
    <Box colors={colors} icon="mail-unread-outline" title={`Có ${items.length} tin mới`}
      right={<TouchableOpacity onPress={readAll} hitSlop={8}><Text style={[styles.link, { color: colors.primary }]}>Đã xem hết</Text></TouchableOpacity>}>
      {items.slice(0, 4).map((it) => (
        <View key={it.id} style={styles.itemRow}>
          <Ionicons name={KIND_ICON[it.kind] || "notifications-outline"} size={16} color={colors.textMuted} />
          <Text style={[styles.itemText, { color: colors.text }]}>
            {it.from ? `${it.from}: ` : ""}
            {it.text}
          </Text>
        </View>
      ))}
    </Box>
  );
});

// ── Gói chung ───────────────────────────────────────────────────────────────
const AgentHomeCards = memo(function AgentHomeCards({ token, apiBase, authFetch }) {
  const { colors } = useTheme();
  const api = useAgentApi(token, apiBase, authFetch);
  if (!token) return null;
  return (
    <View style={styles.wrap}>
      <InboxCard colors={colors} api={api} />
    </View>
  );
});

export default AgentHomeCards;

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 10, gap: 10 },
  box: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  headTitle: { fontSize: 15, fontWeight: "700" },
  big: { fontSize: 24, fontWeight: "800" },
  msg: { fontSize: 13, lineHeight: 19 },
  link: { fontSize: 12.5, fontWeight: "700" },
  itemRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  itemText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btn: { minWidth: 72, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  btnText: { fontWeight: "700", fontSize: 13.5 },
});