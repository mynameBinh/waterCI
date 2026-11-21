// =============================================================================
// CoupleMemories — tab "Kỷ niệm": ngày bên nhau (đề xuất -> người kia xác nhận), các mốc (đã đạt / đếm ngược, chúc mừng khi
// vừa đạt), chuỗi chung + "gánh chuỗi" và bản tin tuần do AI viết.
//   useFetch(api, path, enabled): tải một endpoint GET, giữ dữ liệu cũ khi tải lại lỗi.
//   MemoriesTab: giao diện. Mọi hành động đi qua couple.run (đặt busy / báo lỗi / tải lại trạng thái).
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { Btn, Input } from "./AgentHomeCards";
import { Skeleton } from "./CoupleDiary";
import FlameStreak from "./FlameStreak";

const buzz = (kind) => {
  try {
    if (kind === "ok") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* thiết bị không hỗ trợ rung */
  }
};

export const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

export function useFetch(api, path, enabled = true) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const r = await api(path);
      if (mounted.current) {
        setData(r);
        setFailed(false);
      }
    } catch {
      if (mounted.current) setFailed(true); // giữ dữ liệu cũ
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [api, path, enabled]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, failed, loading, reload: load };
}

// ── ngày dd / mm / yyyy -> "YYYY-MM-DD" (kiểm tra ngày có thật, không ở tương lai) ──
export function parseDmy(dd, mm, yyyy) {
  const d = Number(dd);
  const m = Number(mm);
  const y = Number(yyyy);
  if (!d || !m || String(yyyy).length !== 4 || !y) return { error: "Bạn nhập đủ ngày, tháng và năm (4 chữ số) nhé." };
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return { error: "Ngày này không có thật, bạn kiểm tra lại nhé." };
  if (dt.getTime() > Date.now()) return { error: "Ngày bắt đầu không thể ở tương lai." };
  return { iso: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

const DateFields = ({ colors, busy, onSubmit, submitLabel }) => {
  const [dd, setDd] = useState("");
  const [mm, setMm] = useState("");
  const [yy, setYy] = useState("");
  const [err, setErr] = useState("");
  const mmRef = useRef(null);
  const yyRef = useRef(null);
  const digits = (v, n) => v.replace(/\D/g, "").slice(0, n);
  const submit = async () => {
    const r = parseDmy(dd, mm, yy);
    if (r.error) return setErr(r.error);
    setErr("");
    if (await onSubmit(r.iso)) {
      setDd("");
      setMm("");
      setYy("");
    }
  };
  const box = (value, set, n, ph, ref, next, w) => (
    <Input colors={colors} value={value} onChangeText={(v) => { const t = digits(v, n); set(t); if (t.length === n && next) next.current?.focus(); }}
      placeholder={ph} keyboardType="number-pad" maxLength={n} ref={ref} style={{ width: w, textAlign: "center" }}
      accessibilityLabel={ph === "dd" ? "Ngày" : ph === "mm" ? "Tháng" : "Năm"} />
  );
  return (
    <View>
      <View style={styles.dateRow}>
        {box(dd, setDd, 2, "dd", null, mmRef, 54)}
        <Text style={[styles.slash, { color: colors.textMuted }]}>/</Text>
        {box(mm, setMm, 2, "mm", mmRef, yyRef, 54)}
        <Text style={[styles.slash, { color: colors.textMuted }]}>/</Text>
        {box(yy, setYy, 4, "yyyy", yyRef, null, 84)}
        <Btn colors={colors} label={submitLabel} onPress={submit} busy={busy} disabled={!dd || !mm || yy.length !== 4} style={{ marginLeft: 8 }} />
      </View>
      {!!err && <Text style={[styles.msg, { color: "#d64545", marginTop: 6 }]}>{err}</Text>}
    </View>
  );
};

// ── hiệu ứng chúc mừng: trái tim bay lên, chạm để bỏ qua ──
const HEARTS = 16;
const Celebration = ({ colors, text, onDone }) => {
  const t = useRef(new Animated.Value(0)).current;
  const hearts = useMemo(
    () => Array.from({ length: HEARTS }, (_, i) => ({ x: 6 + ((i * 53) % 88) + (i % 3), delay: (i * 140) % 1500, size: 16 + (i % 4) * 6,
      sway: (i % 2 ? 1 : -1) * (10 + (i % 5) * 4) })),
    [],
  );
  useEffect(() => {
    buzz("ok");
    Animated.timing(t, { toValue: 1, duration: 3800, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const id = setTimeout(onDone, 4600);
    return () => clearTimeout(id);
  }, [t, onDone]);
  return (
    <TouchableWithoutFeedback onPress={onDone} accessibilityLabel="Bỏ qua hiệu ứng chúc mừng">
      <View style={styles.celebrate} accessibilityRole="button" accessibilityLabel="Chúc mừng. Chạm để bỏ qua">
        {hearts.map((h, i) => {
          const local = t.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
          return (
            <Animated.View key={i} pointerEvents="none"
              style={{ position: "absolute", left: `${h.x}%`, bottom: -20,
                opacity: t.interpolate({ inputRange: [0, 0.08 + h.delay / 6000, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: local.interpolate({ inputRange: [0, 1], outputRange: [0, -420 - (i % 4) * 30] }) },
                  { translateX: local.interpolate({ inputRange: [0, 1], outputRange: [0, h.sway] }) }] }}>
              <Ionicons name="heart" size={h.size} color={i % 3 === 0 ? colors.primary : i % 3 === 1 ? colors.primaryLight : "#ff7aa8"} />
            </Animated.View>
          );
        })}
        <View style={[styles.celebrateCard, { backgroundColor: colors.card, borderColor: colors.primaryBorder }]}>
          <Text style={[styles.celebrateTitle, { color: colors.primaryText }]}>Chúc mừng hai bạn!</Text>
          <Text style={[styles.msg, { color: colors.text, textAlign: "center" }]}>{text}</Text>
          <Text style={[styles.hint, { color: colors.textMuted, textAlign: "center" }]}>Chạm để đóng</Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const Panel = ({ colors, title, icon, children, right }) => (
  <View style={[styles.panel, { backgroundColor: colors.background }]}>
    <View style={styles.panelHead}>
      {!!icon && <Ionicons name={icon} size={16} color={colors.primary} style={{ marginRight: 6 }} />}
      <Text style={[styles.panelTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
    {children}
  </View>
);

// ngày dương lịch (dd/mm/yyyy) của mốc: ưu tiên m.date từ server, không có thì tính từ số ngày còn lại
const msDate = (m) => {
  if (m.date) return fmtDate(m.date);
  if (typeof m.days_left !== "number") return "";
  const d = new Date();
  d.setDate(d.getDate() + m.days_left);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// khung chờ 1 hàng, cùng chiều cao với NextMilestone (không dùng Skeleton nhiều hàng nữa)
const NextSkeleton = ({ colors }) => {
  const o = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  const bar = { backgroundColor: colors.border, borderRadius: 6 };
  return (
    <Animated.View style={[styles.nextRow, { opacity: o }]} accessibilityLabel="Đang tải mốc sắp tới">
      <View style={{ flex: 1 }}>
        <View style={[bar, { width: "55%", height: 14 }]} />
        <View style={[bar, { width: "32%", height: 11, marginTop: 5 }]} />
      </View>
      <View style={[bar, { width: 64, height: 14 }]} />
    </Animated.View>
  );
};

const NextMilestone = ({ colors, m }) => {
  const left = m.days_left === 0 ? "Hôm nay" : m.days_left === 1 ? "Ngày mai" : `Còn ${m.days_left} ngày`;
  const date = msDate(m);
  return (
    <View style={styles.nextRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.chipLabel, { color: colors.text }]} numberOfLines={1}>{m.label}</Text>
        {!!date && <Text style={[styles.hint, { color: colors.textMuted }]}>{date}</Text>}
      </View>
      <Text style={[styles.nextLeft, { color: colors.primaryText }]}>{left}</Text>
    </View>
  );
};

export const MemoriesTab = ({ colors, couple, together, weekly, avatars = {}, partnerName, refreshControl }) => {
  const { c, api, busy, err, run } = couple;
  const [editing, setEditing] = useState(false);
  const [showPrev, setShowPrev] = useState(false);
  const [cele, setCele] = useState(null);
  const t = together.data;
  const pending = c.pending;
  const since = c.together_since;
  const settings = c.settings || { streak_enabled: true, milestone_enabled: true, weekly_enabled: true };

  const act = async (fn, ok) => {
    const done = await run(fn);
    if (done) {
      together.reload();
      weekly.reload();
      if (ok) buzz("ok");
    }
    return done;
  };

  // chúc mừng một lần cho mỗi mốc (nhớ trên máy theo tên đăng nhập + ngày bắt đầu + mốc)
  const nextMs = useMemo(
    () => (t?.upcoming || []).reduce((best, m) => (typeof m.days_left === "number" && (!best || m.days_left < best.days_left) ? m : best), null),
    [t],
  );
  const todayMs = t?.today;
  useEffect(() => {
    if (!todayMs || !since || !settings.milestone_enabled) return;
    const key = `couple_cele:${avatars.myName}:${since}:${todayMs.key}`;
    let live = true;
    AsyncStorage.getItem(key)
      .then((v) => {
        if (!live || v) return;
        AsyncStorage.setItem(key, "1").catch(() => {});
        setCele(`Hôm nay là mốc ${todayMs.label} của hai bạn.`);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [todayMs?.key, since, settings.milestone_enabled, avatars.myName]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmRescue = () =>
    Alert.alert(
      `Gánh chuỗi cho ${partnerName}?`,
      `Hôm qua ${partnerName} chưa kịp hoàn thành. Bạn sẽ dùng 1 lượt gánh của tháng này để giữ chuỗi chung của hai bạn. ` +
        `Bạn còn ${c.rescue?.saves_left ?? 0} lượt trong tháng.`,
      [
        { text: "Để sau", style: "cancel" },
        { text: "Gánh chuỗi", onPress: () => act(() => api("/api/couple/rescue", { method: "POST" }), true) },
      ],
    );

  const setSetting = (patch) => act(() => api("/api/couple/settings", { method: "PUT", body: JSON.stringify(patch) }));

  const w = weekly.data;
  const rescue = c.rescue;

  return (
    <View style={styles.flex}>
      <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        {/* ── ngày bên nhau ── */}
        <Panel colors={colors} title="Ngày bên nhau" icon="calendar-outline">
          {pending && !pending.by_me ? (
            <View>
              <Text style={[styles.msg, { color: colors.text }]}>
                {partnerName} đề xuất bắt đầu bên nhau từ ngày {fmtDate(pending.date)}. Đúng chứ?
              </Text>
              <View style={styles.btnRow}>
                <Btn colors={colors} ghost label="Chưa đúng" busy={busy}
                  onPress={() => act(() => api("/api/couple/together/respond", { method: "POST", body: JSON.stringify({ accept: false }) }))} />
                <Btn colors={colors} label="Đồng ý" busy={busy}
                  onPress={() => act(() => api("/api/couple/together/respond", { method: "POST", body: JSON.stringify({ accept: true }) }), true)} />
              </View>
            </View>
          ) : pending && pending.by_me ? (
            <View>
              <Text style={[styles.msg, { color: colors.text }]}>
                Bạn đã đề xuất ngày {fmtDate(pending.date)}. Đang chờ {partnerName} xác nhận.
              </Text>
              <Btn colors={colors} ghost label="Rút lại đề xuất" busy={busy} style={styles.fullBtn}
                onPress={() => act(() => api("/api/couple/together/pending", { method: "DELETE" }))} />
            </View>
          ) : null}

          {since && !pending ? (
            <View style={styles.daysBox}>
              <Text style={[styles.bigNum, { color: colors.primaryText }]}>Ngày thứ {c.together_days}</Text>
              <Text style={[styles.msg, { color: colors.textMuted }]}>bên nhau · từ {fmtDate(since)}</Text>
            </View>
          ) : null}

          {since && !pending && !editing && (
            <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8} style={styles.linkBtn} accessibilityRole="button"
              accessibilityLabel="Đề xuất đổi ngày bắt đầu">
              <Text style={[styles.link, { color: colors.textMuted }]}>Đề xuất đổi ngày</Text>
            </TouchableOpacity>
          )}

          {!since && !pending && (
            <Text style={[styles.msg, { color: colors.textMuted, marginBottom: 8 }]}>
              Đề xuất ngày bắt đầu bên nhau, chờ người ấy xác nhận.
            </Text>
          )}
          {(editing || (!since && !pending) || (pending && !pending.by_me)) && (
            <View style={{ marginTop: pending ? 12 : 0 }}>
              {pending && !pending.by_me && <Text style={[styles.hint, { color: colors.textMuted, marginBottom: 6 }]}>Hoặc đề xuất một ngày khác:</Text>}
              <DateFields colors={colors} busy={busy} submitLabel="Đề xuất"
                onSubmit={async (iso) => {
                  const ok = await act(() => api("/api/couple/together", { method: "PUT", body: JSON.stringify({ date: iso }) }));
                  if (ok) setEditing(false);
                  return ok;
                }} />
            </View>
          )}
        </Panel>

        {/* ── mốc sắp tới (chỉ 1 mốc gần nhất) ── */}
        {since && (
          <Panel colors={colors} title="Mốc sắp tới" icon="ribbon-outline">
            {!t && (together.failed ? (
              <TouchableOpacity onPress={together.reload} accessibilityRole="button" accessibilityLabel="Thử tải lại mốc sắp tới">
                <Text style={[styles.msg, { color: colors.textMuted }]}>Chưa tải được. Chạm để thử lại.</Text>
              </TouchableOpacity>
            ) : <NextSkeleton colors={colors} />)}
            {!!t && (nextMs
              ? <NextMilestone colors={colors} m={nextMs} />
              : <Text style={[styles.msg, { color: colors.textMuted }]}>Chưa có mốc nào sắp tới.</Text>)}
          </Panel>
        )}

        {/* ── chuỗi chung + gánh chuỗi ── */}
        <Panel colors={colors} title="Chuỗi chung" icon="link-outline">
          {!c.visible ? (
            <Text style={[styles.msg, { color: colors.textMuted }]}>Cần cả hai cùng bật chia sẻ tiến độ để có chuỗi chung.</Text>
          ) : !settings.streak_enabled ? (
            <View>
              <Text style={[styles.msg, { color: colors.textMuted }]}>Chuỗi chung đang tắt. Bạn có thể bật lại bất cứ lúc nào.</Text>
              <Btn colors={colors} ghost label="Bật chuỗi chung" busy={busy} style={styles.fullBtn} onPress={() => setSetting({ streak_enabled: true })} />
            </View>
          ) : (
            <View>
              <View style={styles.streakRow}>
                {c.joint_streak > 0 ? <FlameStreak count={c.joint_streak} size={22} label="ngày chung" /> : (
                  <Text style={[styles.msg, { color: colors.textMuted, flex: 1 }]}>Hôm nay mình bắt đầu một chuỗi mới nhé.</Text>
                )}
                <View style={{ flex: 1 }} />
                {c.best_joint_streak > 0 && <Text style={[styles.hint, { color: colors.textMuted }]}>Dài nhất: {c.best_joint_streak} ngày</Text>}
              </View>
              {rescue?.available ? (
                <View style={[styles.rescue, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}>
                  <Text style={[styles.msg, { color: colors.text }]}>
                    Hôm qua {partnerName} chưa kịp hoàn thành. Bạn có thể gánh chuỗi giúp bạn ấy để chuỗi chung không bị đứt.
                  </Text>
                  <Btn colors={colors} label="Gánh chuỗi cho bạn ấy" busy={busy} style={styles.fullBtn} onPress={confirmRescue} />
                </View>
              ) : null}
              {rescue && (
                <Text style={[styles.hint, { color: colors.textMuted, marginTop: 8 }]}>
                  Tháng này bạn còn {rescue.saves_left} lượt gánh chuỗi.
                </Text>
              )}
            </View>
          )}
        </Panel>

        {/* ── bản tin tuần ── */}
        <Panel colors={colors} title="Bản tin tuần này" icon="newspaper-outline">
          {!w ? (
            weekly.failed ? (
              <TouchableOpacity onPress={weekly.reload} accessibilityRole="button" accessibilityLabel="Thử tải lại bản tin tuần">
                <Text style={[styles.msg, { color: colors.textMuted }]}>Chưa tải được bản tin. Chạm để thử lại.</Text>
              </TouchableOpacity>
            ) : <Skeleton colors={colors} />
          ) : !w.enabled ? (
            <View>
              <Text style={[styles.msg, { color: colors.textMuted }]}>Bản tin tuần đang tắt.</Text>
              <Btn colors={colors} ghost label="Bật bản tin tuần" busy={busy} style={styles.fullBtn} onPress={() => setSetting({ weekly_enabled: true })} />
            </View>
          ) : w.current ? (
            <View>
              <Text style={[styles.hint, { color: colors.textMuted }]}>{w.current.label}</Text>
              <Text style={[styles.msg, { color: colors.text, marginTop: 4 }]}>{w.current.content}</Text>
            </View>
          ) : (
            <Text style={[styles.msg, { color: colors.textMuted }]}>Bản tin tuần sẽ đến vào tối Chủ nhật.</Text>
          )}
          {!!w?.previous?.length && (
            <View style={{ marginTop: 10 }}>
              <TouchableOpacity onPress={() => setShowPrev((v) => !v)} hitSlop={8} accessibilityRole="button"
                accessibilityLabel="Xem các tuần trước" accessibilityState={{ expanded: showPrev }}>
                <Text style={[styles.link, { color: colors.primaryText }]}>{showPrev ? "Ẩn các tuần trước" : `Xem các tuần trước (${w.previous.length})`}</Text>
              </TouchableOpacity>
              {showPrev && w.previous.map((p) => (
                <View key={p.week} style={[styles.prev, { borderColor: colors.border }]}>
                  <Text style={[styles.hint, { color: colors.textMuted }]}>{p.label}</Text>
                  <Text style={[styles.msg, { color: colors.text, marginTop: 2 }]}>{p.content}</Text>
                </View>
              ))}
            </View>
          )}
        </Panel>

        {!!err && <Text style={[styles.msg, { color: "#d64545", marginTop: 4 }]}>{err}</Text>}
      </ScrollView>
      {!!cele && <Celebration colors={colors} text={cele} onDone={() => setCele(null)} />}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 16 },
  msg: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 12, lineHeight: 17 },
  link: { fontSize: 12.5, fontWeight: "700" },
  linkBtn: { alignSelf: "flex-start", marginTop: 6 },
  fullBtn: { width: "100%", marginTop: 12 },
  btnRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  panel: { borderRadius: 14, padding: 14, marginBottom: 10 },
  panelHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  panelTitle: { fontSize: 14.5, fontWeight: "800" },
  daysBox: { alignItems: "center", paddingVertical: 6 },
  bigNum: { fontSize: 26, fontWeight: "800" },
  dateRow: { flexDirection: "row", alignItems: "center" },
  slash: { fontSize: 18, marginHorizontal: 5 },
  chipLabel: { fontSize: 13.5, fontWeight: "700" },
  nextRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nextLeft: { fontSize: 14, fontWeight: "800" },
  streakRow: { flexDirection: "row", alignItems: "center" },
  rescue: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  prev: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 10 },
  celebrate: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.18)", zIndex: 10 },
  celebrateCard: { borderWidth: 1.5, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 20, maxWidth: "86%", gap: 6 },
  celebrateTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
});