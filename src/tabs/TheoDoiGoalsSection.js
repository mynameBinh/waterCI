import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  API_BASE,
  EmptyState,
  PhotoGrid,
  SectionHeader,
  SummaryCard,
  isToday,
  thumbUrl,
} from "./TheoDoiShared";

const TARGET_USERNAME = "binhhn21"; // tài khoản được đặt mục tiêu
const REFRESH_INTERVAL_MS = 10000;

// ── Endpoint backend ──
// GET    /api/embe/target-tasks?username=binhhn21
//        -> { tasks: [{ id, title, verify_description, target_per_day, done_today, repeat,
//                       is_active, checkins: [{ id, time, date, image_url }] }] }
// POST   /api/embe/target-tasks        body { username, title, verify_description, target_per_day, repeat }
// DELETE /api/embe/target-tasks/{id}   XOÁ hẳn (xem backend/TASKS_REPEAT_FIX.md). Chưa có -> app tự
//                                      chuyển sang PATCH { is_active:false } để vẫn dùng được.
const LIST_URL = `${API_BASE}/api/embe/target-tasks?username=${encodeURIComponent(TARGET_USERNAME)}`;
const CREATE_URL = `${API_BASE}/api/embe/target-tasks`;
const taskUrl = (id) => `${API_BASE}/api/embe/target-tasks/${id}`;

// Cache module-level: chuyển tab qua lại không bị nháy loading
let cachedTasks = null;
let hasFetchedOnce = false;

const parseList = (data) => (Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data) ? data : []);

// Gọi từ TheoDoiTab ngay khi vào app: tải sẵn danh sách mục tiêu + ảnh thumbnail
export async function prefetchGoals(token) {
  if (!token || hasFetchedOnce) return;
  try {
    const res = await fetch(LIST_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const list = parseList(await res.json());
    cachedTasks = list;
    hasFetchedOnce = true;
    list.forEach((t) =>
      (t.checkins || []).filter((c) => isToday(c.date)).forEach((c) => {
        const u = thumbUrl(c.image_url);
        if (u) Image.prefetch(u).catch(() => {});
      }),
    );
  } catch {}
}

const isDone = (t) => (t.done_today ?? 0) >= Math.max(t.target_per_day ?? 1, 1);

export default function TheoDoiGoalsSection({ token, colors, active = true }) {
  const [loading, setLoading] = useState(!hasFetchedOnce);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [tasks, setTasks] = useState(cachedTasks ?? []);
  const [selectedId, setSelectedId] = useState(cachedTasks?.[0]?.id ?? null);
  const [repeat, setRepeat] = useState("today"); // "daily" | "today" – mặc định "chỉ hôm nay" để khỏi lặp ngoài ý muốn

  // form tạo mục tiêu
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadData = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setErrorMsg(null);
      try {
        const res = await fetch(LIST_URL, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 403) {
          setErrorMsg('Chỉ tài khoản "em bé" mới được đặt mục tiêu.');
          return;
        }
        if (!res.ok) throw new Error();
        const list = parseList(await res.json());
        if (JSON.stringify(list) !== JSON.stringify(cachedTasks)) {
          cachedTasks = list;
          setTasks(list);
        }
        setErrorMsg(null);
        setSelectedId((prev) => (list.some((t) => t.id === prev) ? prev : (list[0]?.id ?? null)));
      } catch {
        if (!silent) setErrorMsg("Không thể tải mục tiêu. Vui lòng thử lại.");
      } finally {
        hasFetchedOnce = true;
      }
    },
    [token],
  );

  useEffect(() => {
    setLoading(!hasFetchedOnce);
    loadData(hasFetchedOnce).finally(() => setLoading(false)); // có cache -> làm mới ngầm
  }, [loadData]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => loadData(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadData, active]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleCreate = async () => {
    const t = title.trim();
    const n = parseInt(target, 10);
    const desc = description.trim();
    if (!t) return Alert.alert("Thiếu tên", "Nhập tên mục tiêu nhé.");
    if (!desc) return Alert.alert("Thiếu mô tả", "Nhập thứ cần thấy trong ảnh nhé.");
    if (!n || n < 1) return Alert.alert("Sai số lần", "Số lần/ngày phải ≥ 1.");
    setSubmitting(true);
    try {
      const res = await fetch(CREATE_URL, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          username: TARGET_USERNAME,
          title: t,
          verify_description: desc,
          target_per_day: n,
          repeat,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Không tạo được");
      }
      setTitle("");
      setDescription("");
      setTarget("1");
      setRepeat("today");
      setShowForm(false);
      await loadData();
      if (data?.id) setSelectedId(data.id);
    } catch (e) {
      Alert.alert("Lỗi", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // XOÁ mục tiêu (trước đây là "Tắt"): biến mất khỏi danh sách ngay, lỗi thì tải lại
  const handleDelete = (task) => {
    Alert.alert("Xoá mục tiêu", `Xoá "${task.title}" của ${TARGET_USERNAME}? Không hoàn tác được.`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          const before = cachedTasks;
          const after = (before || []).filter((t) => t.id !== task.id);
          cachedTasks = after;
          setTasks(after);
          setSelectedId((prev) => (prev === task.id ? (after[0]?.id ?? null) : prev));
          try {
            let res = await fetch(taskUrl(task.id), { method: "DELETE", headers: authHeaders });
            // backend chưa có DELETE -> dùng tạm cách cũ (ẩn mục tiêu) để vẫn hoạt động
            if ([404, 405, 501].includes(res.status)) {
              res = await fetch(taskUrl(task.id), {
                method: "PATCH",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: false }),
              });
            }
            if (!res.ok) throw new Error("Không xoá được mục tiêu");
            await loadData(true);
          } catch (e) {
            cachedTasks = before;
            setTasks(before || []);
            Alert.alert("Lỗi", e.message);
          }
        },
      },
    ]);
  };

  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  // CHỈ hiện lượt check-in của HÔM NAY (không hiện những ngày trước)
  const todays = (selected?.checkins || [])
    .filter((c) => isToday(c.date))
    .map((c) => ({ id: c.id, time: c.time, date: c.date, imageUrl: thumbUrl(c.image_url) }));

  const doneTasks = tasks.filter(isDone).length;
  const totalToday = tasks.reduce((n, t) => n + (t.done_today ?? 0), 0);

  const input = [styles.input, { color: colors.text, borderColor: colors.border || "#dbeafe" }];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Tổng quan: cùng bố cục với tab "Uống nước" ── */}
      {!loading && !errorMsg && (
        <SummaryCard
          colors={colors}
          icon="flag"
          title="Mục tiêu hôm nay"
          subtitle={`Giao cho ${TARGET_USERNAME}`}
          progress={tasks.length ? doneTasks / tasks.length : 0}
          stats={[
            { value: `${doneTasks}/${tasks.length}`, label: "hoàn thành" },
            { value: `${totalToday}`, label: "lượt check-in" },
            { value: `${tasks.length - doneTasks}`, label: "còn lại" },
          ]}
        />
      )}

      {/* ── Danh sách mục tiêu + nút giao mục tiêu ── */}
      <SectionHeader
        colors={colors}
        title="Mục tiêu"
        count={loading || errorMsg ? undefined : tasks.length}
        right={
          <Pressable
            onPress={() => setShowForm((v) => !v)}
            hitSlop={6}
            style={[styles.addPill, { backgroundColor: colors.primarySoft }]}
          >
            <Ionicons name={showForm ? "close" : "add"} size={16} color={colors.primary} />
            <Text style={[styles.addPillText, { color: colors.primaryText }]}>{showForm ? "Đóng" : "Giao mục tiêu"}</Text>
          </Pressable>
        }
      />

      {showForm && (
        <View style={[styles.formCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Tên mục tiêu</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="VD: Ăn cơm, học bài..."
            placeholderTextColor={colors.textMuted}
            style={input}
          />
          <Text style={[styles.label, { color: colors.textMuted }]}>Mô tả mục tiêu để AI kiểm tra camera</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="VD: Chén cơm, sách vở..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={[...input, styles.inputMulti]}
          />
          <Text style={[styles.label, { color: colors.textMuted }]}>Số lần mỗi ngày</Text>
          <TextInput
            value={target}
            onChangeText={(v) => setTarget(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            style={input}
          />
          <Text style={[styles.label, { color: colors.textMuted }]}>Kiểu mục tiêu</Text>
          <View style={[styles.repeatRow, { backgroundColor: colors.background }]}>
            {[
              { key: "today", label: "Chỉ hôm nay", icon: "today-outline" },
              { key: "daily", label: "Hằng ngày", icon: "repeat" },
            ].map((o) => {
              const on = repeat === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setRepeat(o.key)}
                  style={[styles.repeatItem, on && { backgroundColor: colors.primary }]}
                >
                  <Ionicons name={o.icon} size={14} color={on ? "#fff" : colors.textMuted} />
                  <Text style={[styles.repeatText, { color: on ? "#fff" : colors.textMuted }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {repeat === "daily"
              ? "Lặp lại mỗi ngày cho tới khi xoá."
              : "Chỉ áp dụng trong hôm nay, qua nửa đêm tự hết hạn."}
          </Text>
          <Pressable
            onPress={handleCreate}
            disabled={submitting}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Giao mục tiêu</Text>}
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
      ) : errorMsg ? (
        <EmptyState colors={colors} icon="alert-circle-outline" text={errorMsg} />
      ) : tasks.length === 0 ? (
        <EmptyState colors={colors} icon="flag-outline" text={`Chưa có mục tiêu nào cho ${TARGET_USERNAME}`} />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            style={{ marginHorizontal: -4, marginBottom: 16 }}
          >
            {tasks.map((t) => {
              const tg = Math.max(t.target_per_day ?? 1, 1);
              const d = t.done_today ?? 0;
              const sel = t.id === selectedId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setSelectedId(t.id)}
                  style={[styles.chip, { backgroundColor: sel ? colors.primary : colors.card }]}
                >
                  <Ionicons name={d >= tg ? "checkmark-circle" : "flag"} size={15} color={sel ? "#fff" : colors.primary} />
                  <Text numberOfLines={1} style={[styles.chipTitle, { color: sel ? "#fff" : colors.text }]}>
                    {t.title}
                  </Text>
                  <Text style={[styles.chipCount, { color: sel ? "rgba(255,255,255,0.8)" : colors.textMuted }]}>
                    {d}/{tg}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selected && (
            <>
              <SectionHeader
                colors={colors}
                title={`Hôm nay · ${selected.title}`}
                count={`${todays.length}/${Math.max(selected.target_per_day ?? 1, 1)}`}
                right={
                  <Pressable
                    onPress={() => handleDelete(selected)}
                    hitSlop={8}
                    style={styles.delBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Xoá mục tiêu"
                  >
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    <Text style={styles.delText}>Xoá</Text>
                  </Pressable>
                }
              />
              <View style={styles.metaRow}>
                <View style={[styles.repeatTag, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons
                    name={selected.repeat === "today" ? "today-outline" : "repeat"}
                    size={12}
                    color={colors.primaryText}
                  />
                  <Text style={[styles.repeatTagText, { color: colors.primaryText }]}>
                    {selected.repeat === "today" ? "Chỉ hôm nay" : "Hằng ngày"}
                  </Text>
                </View>
                {!!selected.verify_description && (
                  <Text numberOfLines={2} style={[styles.desc, { color: colors.textMuted }]}>
                    {selected.verify_description}
                  </Text>
                )}
              </View>

              {todays.length === 0 ? (
                <EmptyState colors={colors} icon="camera-outline" text="Hôm nay chưa có ảnh check-in nào cho mục tiêu này" />
              ) : (
                <PhotoGrid colors={colors} items={todays} />
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 16,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 12,
  },
  addPillText: { fontSize: 12.5, fontWeight: "800" },

  formCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  inputMulti: { minHeight: 64, textAlignVertical: "top" },
  repeatRow: { flexDirection: "row", borderRadius: 12, padding: 3 },
  repeatItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
  },
  repeatText: { fontSize: 13, fontWeight: "800" },
  hint: { fontSize: 11.5, marginTop: 6, fontWeight: "500" },
  submitBtn: { marginTop: 16, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  chipsContent: { paddingHorizontal: 4, paddingVertical: 6, gap: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 120,
    maxWidth: 210,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chipTitle: { flexShrink: 1, fontSize: 13.5, fontWeight: "700", marginLeft: 6 },
  chipCount: { fontSize: 12, fontWeight: "700", marginLeft: 8 },

  delBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  delText: { color: "#ef4444", fontSize: 12, fontWeight: "800" },

  metaRow: { flexDirection: "row", alignItems: "center", marginTop: -4, marginBottom: 14, gap: 10 },
  repeatTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  repeatTagText: { fontSize: 11, fontWeight: "800" },
  desc: { flex: 1, fontSize: 12, lineHeight: 16 },
});