// =============================================================================
// AgentHomeCards — các thẻ ở màn hình chính cho 2 người dùng:
//   1) Hộp thư: nhắc nhở / tin nhắn từ người kia / nhắc nhẹ của AI / ngày đặc biệt / thời tiết (chưa đọc).
//   2) Thời tiết: gợi ý mục tiêu nước hôm nay + bật "tự chỉnh mỗi sáng".
//   3) Cặp đôi: liên kết 2 bên, tiến độ của nhau (khi CẢ HAI bật chia sẻ), chuỗi chung, câu hỏi mỗi ngày.
// Tự gọi API (token + authFetch), không phụ thuộc state của Dashboard.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";

function useAgentApi(token, apiBase, authFetch) {
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
function useRefreshOnActive(load) {
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

const Btn = ({ colors, label, onPress, busy, ghost, disabled }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={busy || disabled}
    activeOpacity={0.8}
    style={[
      styles.btn,
      ghost
        ? { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" }
        : { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 },
    ]}
  >
    {busy ? (
      <ActivityIndicator size="small" color={ghost ? colors.primary : "#fff"} />
    ) : (
      <Text style={[styles.btnText, { color: ghost ? colors.text : "#fff" }]}>{label}</Text>
    )}
  </TouchableOpacity>
);

const Input = ({ colors, ...p }) => (
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
  weather: "partly-sunny-outline",
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

// ── 2. Thời tiết -> mục tiêu nước ───────────────────────────────────────────
const WeatherCard = memo(function WeatherCard({ colors, api, onGoalChanged }) {
  const [w, setW] = useState(null);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const apply = useCallback(
    (data) => {
      setW(data);
      if (data?.current_goal && onGoalChanged) onGoalChanged(data.current_goal);
    },
    [onGoalChanged],
  );
  const load = useCallback(async () => {
    try {
      apply(await api("/api/weather/goal"));
      setErr("");
    } catch (e) {
      setErr(e.message);
    }
  }, [api, apply]);
  useRefreshOnActive(load);

  const act = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveCity = () =>
    act(async () => apply(await api("/api/weather/settings", { method: "PUT", body: JSON.stringify({ city }) })));
  const setAdjust = (on) =>
    act(async () => apply(await api("/api/weather/settings", { method: "PUT", body: JSON.stringify({ adjust: on }) })));
  const applyNow = () =>
    act(async () => {
      await api("/api/weather/apply", { method: "POST" });
      await load();
    });

  if (!w) {
    return err ? (
      <Box colors={colors} icon="partly-sunny-outline" title="Thời tiết">
        <Text style={[styles.msg, { color: colors.textMuted }]}>{err}</Text>
      </Box>
    ) : null;
  }
  if (!w.configured) {
    return (
      <Box colors={colors} icon="partly-sunny-outline" title="Thời tiết & mục tiêu nước">
        <Text style={[styles.msg, { color: colors.textMuted }]}>
          Chọn thành phố để app gợi ý uống nhiều hơn vào những ngày nóng.
        </Text>
        <View style={styles.formRow}>
          <Input colors={colors} value={city} onChangeText={setCity} placeholder="Tên thành phố" style={{ flex: 1 }} />
          <Btn colors={colors} label="Lưu" onPress={saveCity} busy={busy} disabled={city.trim().length < 2} />
        </View>
        {!!err && <Text style={[styles.msg, { color: "#d64545" }]}>{err}</Text>}
      </Box>
    );
  }
  const differs = w.suggested_goal !== w.current_goal;
  return (
    <Box colors={colors} icon="partly-sunny-outline" title={w.city || "Thời tiết"}>
      <Text style={[styles.big, { color: colors.text }]}>
        {Math.round(w.feels_max_c ?? w.temp_max_c ?? 0)}°C
        <Text style={[styles.msg, { color: colors.textMuted }]}>  cao nhất hôm nay (cảm giác)</Text>
      </Text>
      <Text style={[styles.msg, { color: colors.text }]}>{w.reason}</Text>
      <Text style={[styles.msg, { color: colors.textMuted }]}>
        Mục tiêu hiện tại {w.current_goal} ml · gợi ý {w.suggested_goal} ml (gốc {w.base_goal} ml). Chỉ là gợi ý
        tham khảo của app, nghe cơ thể mình trước nhé.
      </Text>
      <View style={styles.switchRow}>
        <Text style={[styles.msg, { color: colors.text, flex: 1 }]}>Tự chỉnh mục tiêu mỗi sáng</Text>
        <Switch value={!!w.adjust} onValueChange={setAdjust} disabled={busy} />
      </View>
      {differs && !w.adjust && <Btn colors={colors} label={`Áp dụng ${w.suggested_goal} ml hôm nay`} onPress={applyNow} busy={busy} />}
      {!!err && <Text style={[styles.msg, { color: "#d64545" }]}>{err}</Text>}
    </Box>
  );
});

// ── 3. Cặp đôi ──────────────────────────────────────────────────────────────
const CoupleCard = memo(function CoupleCard({ colors, api }) {
  const [c, setC] = useState(null);
  const [partner, setPartner] = useState("");
  const [share, setShare] = useState(true);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const r = await api("/api/couple/status");
      if (mounted.current) setC(r);
    } catch {
      /* offline */
    }
  }, [api]);
  useRefreshOnActive(load);

  const act = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const link = () =>
    act(() => api("/api/couple/link", { method: "PUT", body: JSON.stringify({ partner_username: partner.trim(), share_progress: share }) }));
  const unlink = () => act(() => api("/api/couple/link", { method: "PUT", body: JSON.stringify({ partner_username: null }) }));
  const setShareProgress = (on) =>
    act(() => api("/api/couple/link", { method: "PUT", body: JSON.stringify({ partner_username: c.partner_username, share_progress: on }) }));
  const sendAnswer = () =>
    act(async () => {
      await api("/api/couple/daily", { method: "POST", body: JSON.stringify({ text: answer }) });
      setAnswer("");
    });

  if (!c) return null;

  if (!c.partner_username) {
    return (
      <Box colors={colors} icon="heart-outline" title="Cặp đôi">
        <Text style={[styles.msg, { color: colors.textMuted }]}>
          Liên kết với người kia để xem tiến độ của nhau, giữ chuỗi chung và trả lời câu hỏi mỗi ngày. Cả hai cùng nhập tên
          đăng nhập của nhau thì mới liên kết.
        </Text>
        <View style={styles.formRow}>
          <Input colors={colors} value={partner} onChangeText={setPartner} placeholder="Tên đăng nhập của người kia" autoCapitalize="none" style={{ flex: 1 }} />
          <Btn colors={colors} label="Liên kết" onPress={link} busy={busy} disabled={partner.trim().length < 2} />
        </View>
        <View style={styles.switchRow}>
          <Text style={[styles.msg, { color: colors.text, flex: 1 }]}>Cho người kia xem tiến độ uống nước của mình</Text>
          <Switch value={share} onValueChange={setShare} />
        </View>
        {!!err && <Text style={[styles.msg, { color: "#d64545" }]}>{err}</Text>}
      </Box>
    );
  }

  if (!c.linked) {
    return (
      <Box colors={colors} icon="heart-outline" title="Cặp đôi">
        <Text style={[styles.msg, { color: colors.text }]}>
          Đang chờ {c.partner_username} nhập tên đăng nhập của bạn để hoàn tất liên kết.
        </Text>
        <Btn colors={colors} ghost label="Huỷ liên kết" onPress={unlink} busy={busy} />
      </Box>
    );
  }

  const p = c.partner;
  const pct = p ? Math.min(100, Math.round((p.water_ml / Math.max(1, p.water_goal)) * 100)) : 0;
  return (
    <Box colors={colors} icon="heart" title={`Với ${c.partner_username}`}
      right={c.visible && c.joint_streak > 0 ? <Text style={[styles.link, { color: colors.primary }]}>🔥 {c.joint_streak} ngày chung</Text> : null}>
      {c.visible && p ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={[styles.msg, { color: colors.text }]}>
            {p.name}: {p.water_ml}/{p.water_goal} ml{p.day_complete ? " · xong hôm nay" : p.pending_tasks ? ` · còn ${p.pending_tasks} việc` : ""}
          </Text>
          <View style={[styles.bar, { backgroundColor: colors.border }]}>
            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>
      ) : (
        <Text style={[styles.msg, { color: colors.textMuted }]}>Chưa xem được tiến độ của nhau (cần cả hai bật chia sẻ).</Text>
      )}
      {!!c.question && (
        <View style={{ marginTop: 4 }}>
          <Text style={[styles.q, { color: colors.text }]}>Câu hỏi hôm nay: {c.question}</Text>
          {c.my_answer ? (
            <>
              <Text style={[styles.msg, { color: colors.text }]}>Bạn: {c.my_answer}</Text>
              <Text style={[styles.msg, { color: c.partner_answer ? colors.text : colors.textMuted }]}>
                {c.partner_answer ? `${c.partner_username}: ${c.partner_answer}` : `${c.partner_username} chưa trả lời.`}
              </Text>
            </>
          ) : (
            <View style={styles.formRow}>
              <Input colors={colors} value={answer} onChangeText={setAnswer} placeholder="Trả lời của bạn (người kia chỉ thấy sau khi cũng trả lời)" multiline style={{ flex: 1, maxHeight: 90 }} />
              <Btn colors={colors} label="Gửi" onPress={sendAnswer} busy={busy} disabled={!answer.trim()} />
            </View>
          )}
        </View>
      )}
      <View style={styles.switchRow}>
        <Text style={[styles.msg, { color: colors.text, flex: 1 }]}>Cho {c.partner_username} xem tiến độ của mình</Text>
        <Switch value={!!c.my_share} onValueChange={setShareProgress} disabled={busy} />
      </View>
      <TouchableOpacity onPress={unlink} hitSlop={8} style={{ alignSelf: "flex-start", marginTop: 2 }}>
        <Text style={[styles.link, { color: colors.textMuted }]}>Huỷ liên kết</Text>
      </TouchableOpacity>
      {!!err && <Text style={[styles.msg, { color: "#d64545" }]}>{err}</Text>}
    </Box>
  );
});

// ── Gói chung ───────────────────────────────────────────────────────────────
const AgentHomeCards = memo(function AgentHomeCards({ token, apiBase, authFetch, onGoalChanged }) {
  const { colors } = useTheme();
  const api = useAgentApi(token, apiBase, authFetch);
  if (!token) return null;
  return (
    <View style={styles.wrap}>
      <InboxCard colors={colors} api={api} />
      <WeatherCard colors={colors} api={api} onGoalChanged={onGoalChanged} />
      <CoupleCard colors={colors} api={api} />
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
  q: { fontSize: 13.5, fontWeight: "600", marginBottom: 4 },
  link: { fontSize: 12.5, fontWeight: "700" },
  itemRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  itemText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  formRow: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: 4 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btn: { minWidth: 72, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  btnText: { fontWeight: "700", fontSize: 13.5 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 6 },
  barFill: { height: 6, borderRadius: 3 },
});
