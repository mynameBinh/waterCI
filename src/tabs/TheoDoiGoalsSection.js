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

const API_BASE = "https://binhhn21-water-check-in-backend.hf.space";
const TARGET_USERNAME = "binhhn21"; // tài khoản được đặt mục tiêu
const REFRESH_INTERVAL_MS = 10000;

// ── Endpoint backend (CẦN có phía server, xem ghi chú trong câu trả lời) ──
// GET   /api/embe/target-tasks?username=binhhn21
//       -> { tasks: [{ id, title, verify_description, target_per_day, done_today,
//                      is_active, checkins: [{ id, time, date, image_url }] }] }
// POST  /api/embe/target-tasks            body JSON { username, title, verify_description, target_per_day }
// PATCH /api/embe/target-tasks/{id}       body JSON { is_active: false }
const LIST_URL = `${API_BASE}/api/embe/target-tasks?username=${encodeURIComponent(
  TARGET_USERNAME,
)}`;
const CREATE_URL = `${API_BASE}/api/embe/target-tasks`;
const taskUrl = (id) => `${API_BASE}/api/embe/target-tasks/${id}`;

const thumbUrl = (u) =>
  u ? `${API_BASE}/api/thumb/${u.split("/").pop()}?w=480` : null;

// Cache module-level: chuyển tab qua lại không bị nháy loading
let cachedTasks = null;
let hasFetchedOnce = false;

const parseList = (data) =>
  Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data) ? data : [];

// Gọi từ TheoDoiTab ngay khi vào app: tải sẵn danh sách mục tiêu + ảnh thumbnail
export async function prefetchGoals(token) {
  if (!token || hasFetchedOnce) return;
  try {
    const res = await fetch(LIST_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const list = parseList(await res.json());
    cachedTasks = list;
    hasFetchedOnce = true;
    list.forEach((t) =>
      (t.checkins || []).forEach((c) => {
        const u = thumbUrl(c.image_url);
        if (u) Image.prefetch(u).catch(() => {});
      }),
    );
  } catch {}
}

export default function TheoDoiGoalsSection({ token, colors, active = true }) {
  const [loading, setLoading] = useState(!hasFetchedOnce);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [tasks, setTasks] = useState(cachedTasks ?? []);
  const [selectedId, setSelectedId] = useState(cachedTasks?.[0]?.id ?? null);
  const [repeat, setRepeat] = useState("daily"); // "daily" | "today"

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
        const res = await fetch(LIST_URL, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 403) {
          setErrorMsg('Chỉ tài khoản "em bé" mới được đặt mục tiêu.');
          return;
        }
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list = parseList(data);
        if (JSON.stringify(list) !== JSON.stringify(cachedTasks)) {
          cachedTasks = list;
          setTasks(list);
        }
        setErrorMsg(null);
        setSelectedId((prev) =>
          list.some((t) => t.id === prev) ? prev : (list[0]?.id ?? null),
        );
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
    if (!desc)
      return Alert.alert("Thiếu mô tả", "Nhập thứ cần thấy trong ảnh nhé.");
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
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Không tạo được",
        );
      }
      setTitle("");
      setDescription("");
      setTarget("1");
      setRepeat("daily");
      setShowForm(false);
      await loadData();
      if (data?.id) setSelectedId(data.id);
    } catch (e) {
      Alert.alert("Lỗi", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = (task) => {
    Alert.alert("Tắt mục tiêu", `Tắt "${task.title}" cho ${TARGET_USERNAME}?`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Tắt",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await fetch(taskUrl(task.id), {
              method: "PATCH",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({ is_active: false }),
            });
            if (!res.ok) throw new Error("Không tắt được mục tiêu");
            await loadData();
          } catch (e) {
            Alert.alert("Lỗi", e.message);
          }
        },
      },
    ]);
  };

  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const checkins = (selected?.checkins || []).map((c) => ({
    id: c.id,
    time: c.time,
    date: c.date,
    imageUrl: thumbUrl(c.image_url),
  }));

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* ── Đặt mục tiêu mới ── */}
      <Pressable
        onPress={() => setShowForm((v) => !v)}
        style={[styles.addBtn, { backgroundColor: colors.primarySoft }]}
      >
        <Ionicons
          name={showForm ? "close" : "add-circle"}
          size={20}
          color={colors.primary}
        />
        <Text style={[styles.addBtnText, { color: colors.primaryText }]}>
          {showForm ? "Đóng" : `Đặt mục tiêu cho ${TARGET_USERNAME}`}
        </Text>
      </Pressable>

      {showForm && (
        <View style={[styles.formCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>
            Tên mục tiêu
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="VD: Ăn cơm, học bài..."
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border || "#dbeafe" },
            ]}
          />
          <Text style={[styles.label, { color: colors.textMuted }]}>
            Mô tả mục tiêu để AI kiểm tra camera
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="VD: Chén cơm, sách vở..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={[
              styles.input,
              styles.inputMulti,
              { color: colors.text, borderColor: colors.border || "#dbeafe" },
            ]}
          />
          <Text style={[styles.label, { color: colors.textMuted }]}>
            Số lần mỗi ngày
          </Text>
          <TextInput
            value={target}
            onChangeText={(v) => setTarget(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border || "#dbeafe" },
            ]}
          />
          <Text style={[styles.label, { color: colors.textMuted }]}>
            Kiểu mục tiêu
          </Text>
          <View style={[styles.repeatRow, { backgroundColor: colors.background }]}>
            {[
              { key: "daily", label: "Hằng ngày", icon: "repeat" },
              { key: "today", label: "Chỉ hôm nay", icon: "today-outline" },
            ].map((o) => {
              const on = repeat === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setRepeat(o.key)}
                  style={[
                    styles.repeatItem,
                    on && { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons
                    name={o.icon}
                    size={14}
                    color={on ? "#fff" : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.repeatText,
                      { color: on ? "#fff" : colors.textMuted },
                    ]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {repeat === "daily"
              ? "Lặp lại mỗi ngày cho tới khi tắt."
              : "Chỉ áp dụng trong hôm nay, qua nửa đêm tự hết hạn."}
          </Text>
          <Pressable
            onPress={handleCreate}
            disabled={submitting}
            style={[
              styles.submitBtn,
              { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Giao mục tiêu</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* ── Danh sách mục tiêu + ảnh ── */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 30 }}
        />
      ) : errorMsg ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={colors.textMuted}
          />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {errorMsg}
          </Text>
        </View>
      ) : tasks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="flag-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Chưa có mục tiêu nào cho {TARGET_USERNAME}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            style={{ marginHorizontal: -4 }}
          >
            {tasks.map((t) => {
              const tg = Math.max(t.target_per_day ?? 1, 1);
              const d = t.done_today ?? 0;
              const sel = t.id === selectedId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setSelectedId(t.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: sel ? colors.primary : colors.card,
                    },
                  ]}
                >
                  <Ionicons
                    name={d >= tg ? "checkmark-circle" : "flag"}
                    size={15}
                    color={sel ? "#fff" : colors.primary}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.chipTitle,
                      { color: sel ? "#fff" : colors.text },
                    ]}
                  >
                    {t.title}
                  </Text>
                  <Text
                    style={[
                      styles.chipCount,
                      { color: sel ? "rgba(255,255,255,0.8)" : colors.textMuted },
                    ]}
                  >
                    {d}/{tg}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selected && (
            <>
              <View style={styles.selectedHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Ảnh check-in: {selected.title}
                    {"  "}
                    <Text style={{ color: colors.primaryText, fontSize: 11 }}>
                      · {selected.repeat === "today" ? "Chỉ hôm nay" : "Hằng ngày"}
                    </Text>
                  </Text>
                  {!!selected.verify_description && (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {selected.verify_description}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => handleDisable(selected)}
                  hitSlop={8}
                  style={styles.offBtn}
                >
                  <Ionicons name="power" size={14} color="#ef4444" />
                  <Text style={styles.offText}>Tắt</Text>
                </Pressable>
              </View>

              {checkins.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons
                    name="camera-outline"
                    size={40}
                    color={colors.textMuted}
                  />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    Chưa có ảnh check-in nào cho mục tiêu này
                  </Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {checkins.map((item) => (
                    <View
                      key={String(item.id)}
                      style={[
                        styles.photoCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border || "#dbeafe",
                        },
                      ]}
                    >
                      <View style={styles.photoHeader}>
                        <Ionicons
                          name="time-outline"
                          size={13}
                          color={colors.textMuted}
                        />
                        <Text
                          style={[styles.photoTime, { color: colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {item.time}
                        </Text>
                      </View>
                      {!!item.date && (
                        <Text
                          style={[styles.photoDate, { color: colors.textMuted }]}
                        >
                          {item.date}
                        </Text>
                      )}
                      {item.imageUrl ? (
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={styles.photo}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.photo, styles.photoPlaceholder]}>
                          <Ionicons
                            name="image-outline"
                            size={28}
                            color={colors.primary}
                          />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  addBtnText: { fontSize: 14, fontWeight: "800" },

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
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
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
  submitBtn: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
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
  chipTitle: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: "700",
    marginLeft: 6,
  },
  chipCount: { fontSize: 12, fontWeight: "700", marginLeft: 8 },

  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800" },
  offBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  offText: { color: "#ef4444", fontSize: 12, fontWeight: "800" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  photoCard: {
    width: "48.5%",
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 10,
    marginBottom: 12,
  },
  photoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  photoTime: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  photoDate: { fontSize: 10, fontWeight: "600", marginBottom: 8 },
  photo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#0f172a",
  },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },

  emptyWrap: { alignItems: "center", marginTop: 40 },
  emptyText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});