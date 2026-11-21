// =============================================================================
// CoupleSettings — tab "Tuỳ chỉnh": nhịp tim (kiểu sóng / màu, mở sẵn hết, xem trước trực tiếp), chia sẻ,
// công tắc tính năng (chuỗi chung / thông báo mốc / bản tin tuần), huỷ liên kết.
// Lựa chọn nhịp tim: server là nguồn đúng (PUT /api/couple/heart), AsyncStorage (key theo username) chỉ là bản nhớ đệm.
// Khung quanh cá đã bỏ: các trường `frame` / `share` của lựa chọn cũ được giữ nguyên khi lưu, không còn hiện trong giao diện.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Btn } from "./AgentHomeCards";
import CoupleHeart from "./CoupleHeart";
import { colorOf, DEFAULT_HEART, HEART_COLORS, HEART_WAVES } from "./CoupleHeartCatalog";

const same = (a, b) => a?.wave === b?.wave && a?.color === b?.color;

const Row = ({ colors, label, hint, value, onValueChange, disabled }) => (
  <View style={styles.switchRow}>
    <View style={{ flex: 1 }}>
      <Text style={[styles.msg, { color: colors.text }]}>{label}</Text>
      {!!hint && <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>}
    </View>
    <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor="#ffffff" accessibilityLabel={label} />
  </View>
);

const Option = ({ colors, item, selected, onPress, dot }) => (
  <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(item)} accessibilityRole="button" accessibilityState={{ selected }}
    accessibilityLabel={item.label}
    style={[styles.opt, { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border }]}>
    <View style={styles.optTop}>
      {!!dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
      <Text style={[styles.optLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
      {selected ? <Ionicons name="checkmark-circle" size={15} color={colors.primary} /> : null}
    </View>
  </TouchableOpacity>
);

const Group = ({ colors, title, items, value, onPick, accent }) => (
  <View style={{ marginTop: 12 }}>
    <Text style={[styles.sub, { color: colors.textMuted }]}>{title}</Text>
    <View style={styles.opts}>
      {items.map((it) => (
        <Option key={it.key} colors={colors} item={it} selected={value === it.key} onPress={onPick}
          dot={it.color === undefined ? null : it.color || accent} />
      ))}
    </View>
  </View>
);

export const SettingsTab = ({ colors, couple, heart, saveHeart, partnerName, refreshControl }) => {
  const { c, api, busy, err, run, setShareProgress, unlink } = couple;
  const settings = c.settings || { streak_enabled: true, milestone_enabled: true, weekly_enabled: true };
  const [draft, setDraft] = useState(heart || DEFAULT_HEART);
  const [demo, setDemo] = useState(false);
  useEffect(() => setDraft(heart || DEFAULT_HEART), [heart?.wave, heart?.color]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (field) => (item) => {
    try { Haptics.selectionAsync(); } catch { /* bỏ qua */ }
    setDraft((d) => ({ ...d, [field]: item.key }));
  };
  const setting = (patch) => run(() => api("/api/couple/settings", { method: "PUT", body: JSON.stringify(patch) }));
  const confirmUnlink = () =>
    Alert.alert("Huỷ liên kết?", "Hai bạn sẽ ngừng thấy dữ liệu của nhau. Bạn có thể liên kết lại bất cứ lúc nào.", [
      { text: "Giữ lại", style: "cancel" },
      { text: "Huỷ liên kết", style: "destructive", onPress: unlink },
    ]);
  const dirty = !same(draft, heart || DEFAULT_HEART);
  const tint = colorOf(draft.color, colors.primary);

  return (
    <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}>
      {/* ── nhịp tim ── */}
      <View style={[styles.panel, { backgroundColor: colors.background }]}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>Nhịp tim</Text>
        <Text style={[styles.hint, { color: colors.textMuted, marginBottom: 6 }]}>
          Chọn kiểu sóng và màu nhịp bạn thích, xem trước trực tiếp ngay bên dưới.
        </Text>
        <CoupleHeart colors={colors} mood="happy" partnerName={partnerName || "Bạn ấy"} myProgress={demo ? 1 : 0.55}
          partnerProgress={demo ? 1 : 0.8} bothDone={demo} streak={demo ? Math.max(1, c.joint_streak || 1) : 0}
          waveStyle={draft.wave} pulseColor={tint} />
        <TouchableOpacity onPress={() => setDemo((v) => !v)} hitSlop={8} style={styles.demoBtn} accessibilityRole="button"
          accessibilityLabel={demo ? "Quay lại xem trước thường" : "Xem thử khi cả hai cùng xong"}>
          <Text style={[styles.link, { color: colors.primaryText }]}>{demo ? "Quay lại xem trước" : "Xem thử khi cả hai cùng xong"}</Text>
        </TouchableOpacity>
        <Group colors={colors} title="Kiểu sóng" items={HEART_WAVES} value={draft.wave} onPick={pick("wave")} />
        <Group colors={colors} title="Màu nhịp" items={HEART_COLORS} value={draft.color} onPick={pick("color")} accent={colors.primary} />
        <Btn colors={colors} label="Lưu kiểu nhịp tim" busy={busy} disabled={!dirty} style={styles.fullBtn}
          onPress={() => saveHeart(draft)} />
      </View>

      {/* ── chia sẻ & công tắc ── */}
      <View style={[styles.panel, { backgroundColor: colors.background }]}>
        <Text style={[styles.panelTitle, { color: colors.text }]}>Chia sẻ và tính năng</Text>
        <Row colors={colors} label={`Cho ${c.partner_username} xem tiến độ của mình`} value={!!c.my_share} onValueChange={setShareProgress} disabled={busy} />
        <Row colors={colors} label="Chuỗi chung và gánh chuỗi" hint="Tắt thì không hiện chuỗi và không có lời nhắc về chuỗi chung."
          value={settings.streak_enabled} onValueChange={(v) => setting({ streak_enabled: v })} disabled={busy} />
        <Row colors={colors} label="Nhắc các mốc bên nhau" hint="Báo trước 1 ngày và đúng hôm đó."
          value={settings.milestone_enabled} onValueChange={(v) => setting({ milestone_enabled: v })} disabled={busy} />
        <Row colors={colors} label="Bản tin tuần" hint="Một đoạn ngắn ấm áp vào tối Chủ nhật."
          value={settings.weekly_enabled} onValueChange={(v) => setting({ weekly_enabled: v })} disabled={busy} />
      </View>

      <TouchableOpacity onPress={confirmUnlink} hitSlop={8} style={styles.unlink} accessibilityRole="button" accessibilityLabel="Huỷ liên kết">
        <Text style={[styles.link, { color: colors.textMuted }]}>Huỷ liên kết</Text>
      </TouchableOpacity>
      {!!err && <Text style={[styles.msg, { color: "#d64545", marginTop: 8 }]}>{err}</Text>}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: 20 },
  msg: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  sub: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  link: { fontSize: 12.5, fontWeight: "700" },
  panel: { borderRadius: 14, padding: 14, marginBottom: 10 },
  panelTitle: { fontSize: 14.5, fontWeight: "800", marginBottom: 4 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  fullBtn: { width: "100%", marginTop: 14 },
  demoBtn: { alignSelf: "center", marginTop: 2, marginBottom: 2 },
  opts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opt: { width: "48%", borderWidth: 1.5, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, minHeight: 40, justifyContent: "center" },
  optTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  optLabel: { flex: 1, fontSize: 13, fontWeight: "700" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  unlink: { alignSelf: "flex-start", marginTop: 6 },
});