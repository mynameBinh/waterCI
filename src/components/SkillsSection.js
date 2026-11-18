// components/SkillsSection.js
// Mục "Skill" trong bảng "+": bấm vào mới xổ danh sách; thêm (dán nội dung / link GitHub), bật-tắt, xoá.
// Gọi API /api/brain/skills* của backend (xem routes.py). Dùng được ở bất kỳ đâu, chỉ cần truyền apiBase / token / authFetch.
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

const BASE = "/api/brain";
const SAMPLE =
  "---\nname: ten-skill\ndescription: Dùng khi người dùng nhờ ... (nói rõ khi nào AI nên dùng)\n---\n\n# Tiêu đề\n\n- Cách làm 1\n- Cách làm 2";

const errMsg = (data) =>
  typeof data?.detail === "string" ? data.detail : "Có lỗi xảy ra, bạn thử lại nhé.";

const warnLines = (warnings, minLevel = "medium") => {
  const rank = { low: 1, medium: 2, high: 3 };
  return (warnings || [])
    .filter((w) => (rank[w.level] || 0) >= rank[minLevel])
    .map((w) => `• ${w.message}`)
    .join("\n");
};

const SkillsSection = memo(function SkillsSection({ apiBase, token, authFetch, embedded = false }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [skills, setSkills] = useState([]);
  const [busyKey, setBusyKey] = useState(null); // skill đang bật/tắt/xoá
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState("paste"); // "paste" | "link"
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);

  const call = useCallback(
    async (path, options = {}) => {
      const doFetch = authFetch || fetch;
      const res = await doFetch(`${apiBase}${BASE}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    },
    [authFetch, apiBase, token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await call("/skills");
      if (!r.ok) throw new Error(errMsg(r.data));
      setSkills(r.data.skills || []);
    } catch (e) {
      setError(e?.message || "Không tải được danh sách skill.");
    } finally {
      setLoading(false);
    }
  }, [call]);

  // chỉ tải khi người dùng bấm mở mục "Skill"
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const keyOf = (s) => `${s.scope}/${s.slug}`;
  const patch = (s, fields) =>
    setSkills((prev) => prev.map((x) => (keyOf(x) === keyOf(s) ? { ...x, ...fields } : x)));

  const setEnabled = async (s, enabled, force = false) => {
    setBusyKey(keyOf(s));
    try {
      const r = await call(`/skills/${s.scope}/${s.slug}/enable`, {
        method: "POST",
        body: JSON.stringify({ enabled, force }),
      });
      if (r.status === 409 && r.data?.needs_force) {
        Alert.alert(
          "Skill có dấu hiệu rủi ro cao",
          `${warnLines(r.data.warnings, "low")}\n\nChỉ bật nếu bạn tin nguồn của skill này.`,
          [
            { text: "Không bật", style: "cancel" },
            { text: "Vẫn bật", style: "destructive", onPress: () => setEnabled(s, true, true) },
          ],
        );
        return;
      }
      if (!r.ok) throw new Error(errMsg(r.data));
      patch(s, { status: r.data.status || (enabled ? "enabled" : "disabled"), warnings: r.data.warnings ?? s.warnings });
    } catch (e) {
      Alert.alert("Không đổi được", e?.message || "Bạn thử lại nhé.");
    } finally {
      setBusyKey(null);
    }
  };

  const confirmDelete = (s) =>
    Alert.alert("Xoá skill?", `"${s.name}" sẽ bị xoá.`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          setBusyKey(keyOf(s));
          try {
            const r = await call(`/skills/${s.scope}/${s.slug}`, { method: "DELETE" });
            if (!r.ok) throw new Error(errMsg(r.data));
            setSkills((prev) => prev.filter((x) => keyOf(x) !== keyOf(s)));
          } catch (e) {
            Alert.alert("Không xoá được", e?.message || "Bạn thử lại nhé.");
          } finally {
            setBusyKey(null);
          }
        },
      },
    ]);

  const askEnable = (sk) => {
    if (sk.status === "enabled") return; // thêm lại đúng nội dung cũ -> vẫn đang bật
    const warns = warnLines(sk.warnings, "medium");
    Alert.alert(
      "Đã thêm skill",
      `"${sk.name}" chưa được bật.${warns ? `\n\nLưu ý:\n${warns}` : ""}\n\nBật dùng luôn?`,
      [
        { text: "Để sau", style: "cancel" },
        { text: "Bật", onPress: () => setEnabled(sk, true) },
      ],
    );
  };

  const submit = async () => {
    const v = text.trim();
    if (!v || adding) return;
    setAdding(true);
    try {
      const isLink = mode === "link";
      const r = await call(isLink ? "/skills/import" : "/skills", {
        method: "POST",
        body: JSON.stringify(isLink ? { scope: "user", url: v } : { scope: "user", markdown: v }),
      });
      if (!r.ok) throw new Error(errMsg(r.data));
      const sk = r.data;
      setSkills((prev) => [...prev.filter((x) => keyOf(x) !== keyOf(sk)), sk]);
      setText("");
      setFormOpen(false);
      askEnable(sk);
    } catch (e) {
      Alert.alert("Không thêm được", e?.message || "Bạn thử lại nhé.");
    } finally {
      setAdding(false);
    }
  };

  const sorted = useMemo(
    () => [...skills].sort((a, b) => (a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === "user" ? -1 : 1)),
    [skills],
  );
  const onCount = skills.filter((s) => s.status === "enabled").length;

  const chip = (active) => ({
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: active ? colors.primarySoft : "transparent",
    borderWidth: 1,
    borderColor: active ? colors.primary : colors.border,
  });
  const hair = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border };

  const inner = (
    <>
        {/* Dòng "Skill": bấm mới xổ / thu danh sách */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel="Quản lý skill"
          accessibilityState={{ expanded: open }}
          style={styles.row}
        >
          <View style={[styles.iconWrap, { backgroundColor: open ? colors.primary : colors.primarySoft }]}>
            <Ionicons name="extension-puzzle-outline" size={20} color={open ? "#ffffff" : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: open ? colors.primary : colors.text }]}>Quản lý skill</Text>
            <Text style={[styles.rowSub, { color: colors.textMuted }]}>
              {open && skills.length > 0
                ? `${onCount} đang bật`
                : "Thêm, bật, xoá hướng dẫn cho AI"}
            </Text>
          </View>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={open ? colors.primary : colors.textMuted} />
        </TouchableOpacity>

        {open && (
          <View
            style={{
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
              backgroundColor: embedded ? colors.card : "transparent",
              paddingLeft: embedded ? 66 : 14, // thẳng hàng chữ của dòng cha
              paddingRight: 14,
              paddingBottom: 6,
            }}
          >
            {embedded && <View pointerEvents="none" style={[styles.guide, { backgroundColor: colors.border }]} />}
            {loading && skills.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ margin: 14 }} />
            ) : error ? (
              <TouchableOpacity onPress={load}>
                <Text style={{ color: colors.textMuted, textAlign: "center", padding: 14 }}>
                  {error} Chạm để thử lại.
                </Text>
              </TouchableOpacity>
            ) : sorted.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: "center", padding: 14 }}>
                Chưa có skill nào. Bấm “Thêm skill” bên dưới.
              </Text>
            ) : (
              sorted.map((s) => {
                const busy = busyKey === keyOf(s);
                const risky = s.risk === "high" || s.risk === "medium";
                return (
                  <View key={keyOf(s)} style={[styles.skillRow, hair]}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      activeOpacity={0.7}
                      onPress={() =>
                        Alert.alert(
                          s.name,
                          `${s.description}${risky ? `\n\nCảnh báo:\n${warnLines(s.warnings, "medium")}` : ""}`,
                        )
                      }
                    >
                      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                        {s.name}
                        {s.scope === "global" ? "  · chung" : ""}
                        {s.status === "pending" ? "  · chờ bật" : ""}
                      </Text>
                      <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, color: colors.textMuted, marginTop: 1 }}>
                        {risky ? "⚠ " : ""}
                        {s.description}
                      </Text>
                    </TouchableOpacity>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Switch
                          value={s.status === "enabled"}
                          onValueChange={(v) => setEnabled(s, v)}
                          trackColor={{ true: colors.primary, false: colors.border }}
                          thumbColor="#ffffff"
                        />
                        <TouchableOpacity
                          onPress={() => confirmDelete(s)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={`Xoá skill ${s.name}`}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                );
              })
            )}

            {formOpen ? (
              <View style={{ marginTop: 10, marginBottom: 8, gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={chip(mode === "paste")} onPress={() => setMode("paste")}>
                    <Text style={{ color: mode === "paste" ? colors.primaryText || colors.primary : colors.textMuted, fontSize: 13 }}>
                      Dán nội dung
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={chip(mode === "link")} onPress={() => setMode("link")}>
                    <Text style={{ color: mode === "link" ? colors.primaryText || colors.primary : colors.textMuted, fontSize: 13 }}>
                      Link GitHub
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline={mode === "paste"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={mode === "paste" ? SAMPLE : "https://github.com/.../SKILL.md"}
                  placeholderTextColor={colors.textMuted}
                  style={{
                    color: colors.text,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    padding: 10,
                    fontSize: 13.5,
                    minHeight: mode === "paste" ? 110 : 44,
                    maxHeight: 180,
                    textAlignVertical: "top",
                  }}
                />
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setFormOpen(false);
                      setText("");
                    }}
                    style={{ paddingHorizontal: 14, paddingVertical: 8 }}
                  >
                    <Text style={{ color: colors.textMuted }}>Huỷ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submit}
                    disabled={adding || !text.trim()}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: colors.primary,
                      opacity: adding || !text.trim() ? 0.5 : 1,
                    }}
                  >
                    {adding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Thêm</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setFormOpen(true)} style={styles.addRow}>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Thêm skill</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
    </>
  );
  // embedded: chỉ trả phần dòng + danh sách để ChatPlusSheet tự đặt vào khung chung; không thì tự vẽ khung riêng
  if (embedded) return inner;
  return (
    <View style={styles.group}>
      <Text style={[styles.section, { color: colors.textMuted }]}>Skill</Text>
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>{inner}</View>
    </View>
  );
});

// kích thước / bo góc lấy đúng theo ChatPlusSheet để hai bên nhìn như một
const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  section: { fontSize: 12.5, fontWeight: "700", marginBottom: 8, marginLeft: 4 },
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 14 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  guide: { position: "absolute", left: 32, top: 0, bottom: 0, width: 2, borderRadius: 1, opacity: 0.7 },
  skillRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12 },
});

export default SkillsSection;