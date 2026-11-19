// =============================================================================
// CoupleSheet — chức năng "Cặp đôi" cho tab "Tôi":
//   - useCouple(api, enabled, username): tải / làm mới trạng thái liên kết + các hành động (liên kết, huỷ liên kết, chia sẻ,
//     trả lời câu hỏi, lưu kiểu nhịp tim) + `run(fn)` để các tab chạy hành động riêng (đặt busy / báo lỗi / tải lại trạng thái).
//   - CoupleSheetBody: nội dung bảng trượt (đặt trong PickerSheet `tall` của ProfileTab). Chưa liên kết -> màn liên kết (CoupleLink);
//     đã liên kết -> 4 tab: "Hôm nay" · "Nhật ký" (CoupleDiary) · "Kỷ niệm" (CoupleMemories) · "Tuỳ chỉnh" (CoupleSettings).
//   - coupleHeartProps(c, colors, heart): gom props cho <CoupleHeart> (dùng cả ở thẻ Cặp đôi trong ProfileTab).
// Mọi tab: có khung xương khi tải lần đầu, kéo để làm mới, lỗi mạng có nút thử lại, giữ dữ liệu cũ khi tải lại lỗi.
// =============================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Btn, Input, useRefreshOnActive } from "./AgentHomeCards";
import { DiaryTab, Skeleton, useDiary } from "./CoupleDiary";
import CoupleHeart from "./CoupleHeart";
import { colorOf, DEFAULT_HEART } from "./CoupleHeartCatalog";
import { LinkIntro, LinkWaiting } from "./CoupleLink";
import { MemoriesTab, useFetch } from "./CoupleMemories";
import { SettingsTab } from "./CoupleSettings";
import FlameStreak from "./FlameStreak";

const HEART_KEY = (u) => `couple_heart:${u}`;

export function useCouple(api, enabled = true, username = null) {
  const [c, setC] = useState(null);
  const [failed, setFailed] = useState(false); // lần tải gần nhất lỗi (mất mạng / server chưa có API)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [localHeart, setLocalHeart] = useState(null); // bản nhớ đệm trên máy (server mới là nguồn đúng)
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!username) return;
    AsyncStorage.getItem(HEART_KEY(username))
      .then((v) => {
        if (v && mounted.current) setLocalHeart(JSON.parse(v));
      })
      .catch(() => {});
  }, [username]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await api("/api/couple/status");
      if (mounted.current) {
        setC(r);
        setFailed(false);
      }
    } catch {
      if (mounted.current) setFailed(true); // giữ nguyên dữ liệu cũ nếu có
    }
  }, [api, enabled]);
  useRefreshOnActive(load);

  // Chạy một hành động rồi tải lại trạng thái; trả về true nếu thành công
  const act = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      if (mounted.current) setErr(e.message);
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const put = (body) => api("/api/couple/link", { method: "PUT", body: JSON.stringify(body) });

  const link = (partner, share) => act(() => put({ partner_username: partner.trim(), share_progress: share }));
  const unlink = () => act(() => put({ partner_username: null }));
  const setShareProgress = (on) => act(() => put({ partner_username: c.partner_username, share_progress: on }));
  const sendAnswer = (text) => act(() => api("/api/couple/daily", { method: "POST", body: JSON.stringify({ text }) }));
  const saveHeart = async (choice) => {
    const ok = await act(() => api("/api/couple/heart", { method: "PUT", body: JSON.stringify(choice) }));
    if (ok) {
      if (mounted.current) setLocalHeart(choice);
      if (username) AsyncStorage.setItem(HEART_KEY(username), JSON.stringify(choice)).catch(() => {});
    }
    return ok;
  };

  // Dòng tóm tắt hiện ở danh sách cài đặt
  let summary = failed ? "Chưa kết nối được" : "Đang tải…";
  if (c) {
    if (!c.partner_username) summary = "Chưa liên kết";
    else if (!c.linked) summary = `Đang chờ ${c.partner_username}`;
    else if (c.visible && c.joint_streak > 0) summary = `${c.partner_username} · ${c.joint_streak} ngày`;
    else summary = c.partner_username;
  }
  // Có câu hỏi hôm nay mà mình chưa trả lời -> chấm nhỏ trên icon
  const needsAttention = !!(c?.linked && c.question && !c.my_answer);
  // Tab "Kỷ niệm" cần chú ý: người kia đề xuất ngày bên nhau, hoặc có thể gánh chuỗi
  const memoriesAttention = !!(c?.linked && ((c.pending && !c.pending.by_me) || c.rescue?.available));
  const heart = c?.my_heart || localHeart || null;

  return { c, api, run: act, summary, needsAttention, memoriesAttention, busy, err, failed, reload: load, link, unlink,
    setShareProgress, sendAnswer, heart, saveHeart };
}

// Gom props cho <CoupleHeart> từ trạng thái /api/couple/status (server cũ chưa có `progress` thì suy ra từ day_complete)
export function coupleHeartProps(c, colors, heart) {
  const visible = !!(c?.visible && c?.partner);
  const bothDone = visible && !!c.me?.day_complete && !!c.partner.day_complete;
  const h = heart || c?.my_heart || DEFAULT_HEART;
  const prog = (x) => (typeof x?.progress === "number" ? x.progress : x?.day_complete ? 1 : 0);
  return {
    mood: visible ? (bothDone ? "happy" : "calm") : "flat",
    myProgress: visible ? prog(c.me) : 0,
    partnerProgress: visible ? prog(c.partner) : 0,
    bothDone,
    streak: visible ? c.joint_streak || 0 : 0, // 0 khi người dùng tắt chuỗi chung -> không hiện ngọn lửa
    waveStyle: h.wave || "ecg",
    pulseColor: colorOf(h.color || "accent", colors.primary),
    frameStyle: h.frame || "ring",
    partnerFrameStyle: c?.partner_heart?.frame,
  };
}

const TABS = [
  ["today", "Hôm nay"],
  ["diary", "Nhật ký"],
  ["memories", "Kỷ niệm"],
  ["settings", "Tuỳ chỉnh"],
];

const TabBar = ({ colors, value, onChange, badges }) => (
  <View style={[styles.tabs, { backgroundColor: colors.background }]} accessibilityRole="tablist">
    {TABS.map(([key, label]) => {
      const on = value === key;
      return (
        <TouchableOpacity key={key} activeOpacity={0.8} accessibilityRole="tab" accessibilityLabel={label}
          accessibilityState={{ selected: on }}
          onPress={() => {
            if (on) return;
            try { Haptics.selectionAsync(); } catch { /* bỏ qua */ }
            onChange(key);
          }}
          style={[styles.tab, on && { backgroundColor: colors.card, borderColor: colors.primaryBorder }]}>
          <Text style={[styles.tabText, { color: on ? colors.primaryText : colors.textMuted }]} numberOfLines={1}>{label}</Text>
          {!!badges[key] && <View style={[styles.badge, { backgroundColor: colors.primary }]} />}
        </TouchableOpacity>
      );
    })}
  </View>
);

const TodayTab = ({ colors, couple, refreshControl }) => {
  const { c, busy, err, sendAnswer, heart } = couple;
  const [answer, setAnswer] = useState("");
  const p = c.partner;
  const pct = p ? Math.min(100, Math.round((p.water_ml / Math.max(1, p.water_goal)) * 100)) : 0;
  const status = p?.day_complete ? " · xong hôm nay" : p?.pending_tasks ? ` · còn ${p.pending_tasks} việc` : "";
  const hp = coupleHeartProps(c, colors, heart);
  const caption = hp.bothDone ? "Cả hai đã xong hôm nay 💗" : hp.mood === "calm" ? "" : "Chưa xem được nhịp của nhau";
  return (
    <ScrollView refreshControl={refreshControl} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}>
      <CoupleHeart colors={colors} partnerName={c.partner_username} {...hp} />
      {!!caption && <Text style={[styles.caption, { color: colors.textMuted }]}>{caption}</Text>}
      <View style={[styles.panel, { backgroundColor: colors.background }]}>
        <View style={styles.panelHead}>
          <Text style={[styles.panelTitle, { color: colors.text }]} numberOfLines={1}>{p?.name || c.partner_username}</Text>
          {c.visible && c.joint_streak > 0 && <FlameStreak count={c.joint_streak} size={14} label="ngày chung" style={{ marginLeft: 8 }} />}
        </View>
        {c.visible && p ? (
          <>
            <Text style={[styles.msg, { color: colors.text }]}>{p.water_ml}/{p.water_goal} ml{status}</Text>
            <View style={[styles.bar, { backgroundColor: colors.border }]}>
              <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
            </View>
          </>
        ) : (
          <Text style={[styles.msg, { color: colors.textMuted }]}>Chưa xem được tiến độ của nhau (cần cả hai bật chia sẻ).</Text>
        )}
      </View>

      {!!c.question && (
        <View style={[styles.panel, { backgroundColor: colors.background }]}>
          <Text style={[styles.q, { color: colors.text }]}>Câu hỏi hôm nay: {c.question}</Text>
          {c.my_answer ? (
            <>
              <Text style={[styles.msg, { color: colors.text }]}>Bạn: {c.my_answer}</Text>
              <Text style={[styles.msg, { color: c.partner_answer ? colors.text : colors.textMuted }]}>
                {c.partner_answer ? `${c.partner_username}: ${c.partner_answer}` : `${c.partner_username} chưa trả lời.`}
              </Text>
              {!!c.my_answer_locked && <Text style={[styles.hint, { color: colors.textMuted }]}>Cả hai đã trả lời nên câu trả lời được giữ nguyên.</Text>}
            </>
          ) : (
            <View style={styles.formRow}>
              <Input colors={colors} value={answer} onChangeText={setAnswer} multiline maxLength={800}
                placeholder="Trả lời của bạn (người kia chỉ thấy sau khi cũng trả lời)"
                style={{ flex: 1, maxHeight: 90, backgroundColor: colors.card }} accessibilityLabel="Trả lời câu hỏi hôm nay" />
              <Btn colors={colors} label="Gửi" busy={busy}
                onPress={async () => { if (await sendAnswer(answer)) { setAnswer(""); try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* bỏ qua */ } } }}
                disabled={!answer.trim()} />
            </View>
          )}
        </View>
      )}
      {!!err && <Text style={[styles.msg, { color: "#d64545", marginTop: 8 }]}>{err}</Text>}
    </ScrollView>
  );
};

// avatars: { myName, mySource, myUri, partnerSource } do ProfileTab truyền xuống (ảnh người kia lấy từ server)
export const CoupleSheetBody = ({ colors, couple, avatars = {} }) => {
  const { c, failed, reload } = couple;
  const [tab, setTab] = useState("today");
  const [refreshing, setRefreshing] = useState(false);
  const linked = !!c?.linked;
  // Dữ liệu của từng tab chỉ tải khi mở tab đó; giữ lại khi chuyển qua lại
  const diary = useDiary(couple.api, linked && tab === "diary");
  const together = useFetch(couple.api, "/api/couple/together", linked && tab === "memories");
  const weekly = useFetch(couple.api, "/api/couple/weekly", linked && tab === "memories");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([reload(), tab === "diary" ? diary.reload() : null, tab === "memories" ? together.reload() : null,
        tab === "memories" ? weekly.reload() : null]);
    } finally {
      setRefreshing(false);
    }
  }, [reload, tab, diary.reload, together.reload, weekly.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />;

  // Chưa có dữ liệu: đang tải (khung xương) hoặc lỗi (nút thử lại)
  if (!c) {
    return (
      <ScrollView refreshControl={refreshControl} contentContainerStyle={styles.content}>
        {failed ? (
          <View>
            <Text style={[styles.msg, { color: colors.textMuted }]}>Chưa tải được thông tin cặp đôi. Kiểm tra kết nối rồi thử lại nhé.</Text>
            <Btn colors={colors} ghost label="Thử lại" onPress={reload} style={styles.fullBtn} />
          </View>
        ) : (
          <Skeleton colors={colors} />
        )}
      </ScrollView>
    );
  }
  if (!c.partner_username) {
    return (
      <ScrollView refreshControl={refreshControl} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <LinkIntro colors={colors} couple={couple} myName={avatars.myName} />
      </ScrollView>
    );
  }
  if (!c.linked) {
    return (
      <ScrollView refreshControl={refreshControl} contentContainerStyle={styles.content}>
        <LinkWaiting colors={colors} couple={couple} myName={avatars.myName} />
      </ScrollView>
    );
  }

  const badges = { today: couple.needsAttention, memories: couple.memoriesAttention };
  return (
    <View style={styles.flex}>
      {failed && (
        <TouchableOpacity onPress={reload} style={[styles.banner, { backgroundColor: colors.primarySoft }]} accessibilityRole="button"
          accessibilityLabel="Thử tải lại">
          <Text style={[styles.msg, { color: colors.primaryText, flex: 1 }]}>Chưa cập nhật được, đang hiện dữ liệu đã có.</Text>
          <Text style={[styles.link, { color: colors.primaryText }]}>Thử lại</Text>
        </TouchableOpacity>
      )}
      <TabBar colors={colors} value={tab} onChange={setTab} badges={badges} />
      <View style={styles.flex}>
        {tab === "today" && <TodayTab colors={colors} couple={couple} refreshControl={refreshControl} />}
        {tab === "diary" && <DiaryTab colors={colors} diary={diary} avatars={avatars} partnerName={c.partner_username} refreshControl={refreshControl} />}
        {tab === "memories" && (
          <MemoriesTab colors={colors} couple={couple} together={together} weekly={weekly} avatars={avatars} partnerName={c.partner_username}
            refreshControl={refreshControl} />
        )}
        {tab === "settings" && (
          <SettingsTab colors={colors} couple={couple} heart={couple.heart} saveHeart={couple.saveHeart} partnerName={c.partner_username}
            refreshControl={refreshControl} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 16 },
  msg: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  caption: { fontSize: 12.5, fontWeight: "600", textAlign: "center", marginBottom: 6 },
  q: { fontSize: 13.5, fontWeight: "600", marginBottom: 6 },
  link: { fontSize: 12.5, fontWeight: "700" },
  formRow: { flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: 10 },
  fullBtn: { width: "100%", marginTop: 12 },
  panel: { borderRadius: 14, padding: 14, marginBottom: 4, marginTop: 8 },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  panelTitle: { flex: 1, fontSize: 15, fontWeight: "700", marginRight: 8 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  barFill: { height: 6, borderRadius: 3 },
  banner: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  tabs: { flexDirection: "row", borderRadius: 12, padding: 3, marginBottom: 12 },
  tab: { flex: 1, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent",
    flexDirection: "row", paddingHorizontal: 2 },
  tabText: { fontSize: 12.5, fontWeight: "700" },
  badge: { width: 6, height: 6, borderRadius: 3, marginLeft: 4 },
});
