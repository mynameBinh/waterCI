// =============================================================================
// CoupleDiary — "Nhật ký" của cặp đôi: dòng thời gian theo NGÀY, cuộn xuống tải thêm ngày cũ.
//   useDiary(api, enabled): tải trang đầu, tải thêm, thêm / sửa / xoá ghi chú của chính mình.
//   DiaryTab: giao diện (skeleton khi tải lần đầu, giữ dữ liệu cũ khi tải lại lỗi, avatar nhỏ cạnh mỗi dòng).
// Mỗi ngày: câu hỏi hôm đó + câu trả lời của hai người (của người kia chỉ hiện sau khi mình đã trả lời —
// server quyết định, app chỉ hiển thị) + ghi chú tự do (mỗi người tối đa một ghi chú / ngày, sửa/xoá được của mình).
// Dùng ScrollView thường (không phải FlatList) chiếm hết khung tab; `refreshControl` (kéo để làm mới) do CoupleSheet truyền xuống.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Avatar } from "../Avatar";
import { Btn, Input } from "./AgentHomeCards";

const PAGE = 14; // số ngày mỗi trang (server giới hạn 31)
const MAX_NOTE = 800;
const buzz = (kind = "light") => {
  try {
    if (kind === "ok") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* thiết bị không hỗ trợ rung: bỏ qua */
  }
};

// Trang mới nhất thay thế các ngày trùng; các trang cũ đã tải (cũ hơn trang đầu) được giữ lại.
function mergeFirstPage(prev, page) {
  const oldestNew = page.days.length ? page.days[page.days.length - 1].day : null;
  const kept = oldestNew ? prev.days.filter((d) => d.day < oldestNew) : [];
  const deeper = kept.length > 0; // đã cuộn xuống sâu hơn trang đầu: giữ con trỏ cũ
  return {
    days: [...page.days, ...kept],
    hasMore: deeper ? prev.hasMore : page.has_more,
    nextBefore: deeper ? prev.nextBefore : page.next_before,
  };
}

export function useDiary(api, enabled = true) {
  const [state, setState] = useState({ days: [], hasMore: false, nextBefore: null });
  const [loaded, setLoaded] = useState(false); // đã có ít nhất một lần tải thành công
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mounted = useRef(true);
  const moreLock = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

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
      const page = await api(`/api/couple/diary?limit=${PAGE}`);
      if (!mounted.current) return;
      if (!Array.isArray(page?.days)) throw new Error("server chưa hỗ trợ nhật ký theo ngày");
      setState((prev) => mergeFirstPage(prev, page));
      setLoaded(true);
      setFailed(false);
    } catch {
      if (mounted.current) setFailed(true); // giữ nguyên dữ liệu cũ
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [api, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    const { hasMore, nextBefore } = stateRef.current;
    if (!enabled || !hasMore || !nextBefore || moreLock.current) return;
    moreLock.current = true;
    setLoadingMore(true);
    try {
      const page = await api(`/api/couple/diary?limit=${PAGE}&before=${encodeURIComponent(nextBefore)}`);
      if (!mounted.current) return;
      if (!Array.isArray(page?.days)) throw new Error("server chưa hỗ trợ nhật ký theo ngày");
      setState((prev) => {
        const have = new Set(prev.days.map((d) => d.day));
        return {
          days: [...prev.days, ...page.days.filter((d) => !have.has(d.day))],
          hasMore: page.has_more,
          nextBefore: page.next_before,
        };
      });
      setFailed(false);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      moreLock.current = false;
      if (mounted.current) setLoadingMore(false);
    }
  }, [api, enabled]);

  // Chạy một hành động rồi tải lại trang đầu; trả về true nếu thành công
  const act = useCallback(
    async (fn) => {
      setBusy(true);
      setErr("");
      try {
        await fn();
        await load();
        buzz("ok");
        return true;
      } catch (e) {
        if (mounted.current) setErr(e.message);
        return false;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [load],
  );

  const addNote = useCallback((text) => act(() => api("/api/couple/diary", { method: "POST", body: JSON.stringify({ text }) })), [act, api]);
  const editNote = useCallback(
    (id, text) => act(() => api(`/api/couple/diary/${id}`, { method: "PATCH", body: JSON.stringify({ text }) })),
    [act, api],
  );
  const removeNote = useCallback((id) => act(() => api(`/api/couple/diary/${id}`, { method: "DELETE" })), [act, api]);

  return { ...state, loaded, loading, loadingMore, failed, busy, err, clearErr: () => setErr(""), reload: load, loadMore, addNote, editNote, removeNote };
}

// ── khung xương khi tải lần đầu ──
export const Skeleton = ({ colors }) => {
  const op = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  const bar = (w, h = 12) => <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: colors.border, marginBottom: 8 }} />;
  return (
    <Animated.View style={{ opacity: op }} accessibilityLabel="Đang tải nhật ký">
      {[0, 1].map((i) => (
        <View key={i} style={[styles.day, { backgroundColor: colors.background }]}>
          {bar(70, 14)}
          {bar("90%")}
          {bar("60%")}
        </View>
      ))}
    </Animated.View>
  );
};

// ── một dòng: avatar nhỏ + tên + nội dung ──
const Line = ({ colors, who, avatar, children, muted }) => (
  <View style={styles.line}>
    <Avatar name={who} size={24} ringColor={colors.primaryBorder} {...avatar} />
    <View style={styles.lineBody}>
      <Text style={[styles.who, { color: colors.textMuted }]} numberOfLines={1}>
        {who}
      </Text>
      {children ?? null}
    </View>
  </View>
);

const NoteLine = ({ colors, note, avatar, busy, onEdit, onRemove }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const startEdit = () => {
    setText(note.text);
    setEditing(true);
  };
  const save = async () => {
    if (await onEdit(note.id, text.trim())) setEditing(false);
  };
  const confirmRemove = () =>
    Alert.alert("Xoá ghi chú này?", "Ghi chú sẽ biến mất khỏi nhật ký của cả hai.", [
      { text: "Giữ lại", style: "cancel" },
      { text: "Xoá", style: "destructive", onPress: () => onRemove(note.id) },
    ]);

  return (
    <Line colors={colors} who={note.mine ? "Bạn" : note.author} avatar={avatar}>
      {editing ? (
        <View>
          <Input colors={colors} value={text} onChangeText={setText} multiline maxLength={MAX_NOTE} style={styles.noteInput}
            accessibilityLabel="Sửa ghi chú" />
          <View style={styles.editBtns}>
            <Btn colors={colors} ghost label="Huỷ" onPress={() => setEditing(false)} style={styles.smallBtn} />
            <Btn colors={colors} label="Lưu" onPress={save} busy={busy} disabled={!text.trim() || text.trim() === note.text}
              style={styles.smallBtn} />
          </View>
        </View>
      ) : (
        <View style={styles.noteRow}>
          <Text style={[styles.text, { color: colors.text, flex: 1 }]}>{note.text}</Text>
          {note.mine && (
            <View style={styles.noteActions}>
              <TouchableOpacity onPress={startEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sửa ghi chú">
                <Ionicons name="create-outline" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Xoá ghi chú"
                style={{ marginLeft: 12 }}>
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </Line>
  );
};

const Composer = ({ colors, busy, onAdd }) => {
  const [text, setText] = useState("");
  const send = async () => {
    if (await onAdd(text.trim())) setText("");
  };
  return (
    <View style={styles.composer}>
      <View style={styles.formRow}>
        <Input colors={colors} value={text} onChangeText={setText} multiline maxLength={MAX_NOTE}
          placeholder="Viết một ghi chú nhỏ cho hôm nay…" style={{ flex: 1, maxHeight: 90, backgroundColor: colors.card }}
          accessibilityLabel="Ghi chú hôm nay" />
        <Btn colors={colors} label="Lưu" onPress={send} busy={busy} disabled={!text.trim()} />
      </View>
      {text.length > 700 && (
        <Text style={[styles.counter, { color: colors.textMuted }]}>
          {text.length}/{MAX_NOTE}
        </Text>
      )}
    </View>
  );
};

const DayCard = memo(function DayCard({ colors, day, avatars, partnerName, busy, onAdd, onEdit, onRemove }) {
  const myAv = { uri: avatars.myUri, source: avatars.myUri ? null : avatars.mySource };
  const pAv = { source: avatars.partnerSource };
  const hasMyNote = day.notes.some((n) => n.mine);

  let partnerLine = null;
  if (day.partner_answer) {
    partnerLine = <Text style={[styles.text, { color: colors.text }]}>{day.partner_answer}</Text>;
  } else if (day.is_today && day.partner_answered) {
    partnerLine = (
      <Text style={[styles.text, { color: colors.textMuted }]}>
        Bạn ấy đã trả lời rồi. Trả lời câu hỏi hôm nay ở mục “Hôm nay” để cùng xem nhé.
      </Text>
    );
  } else if (day.is_today) {
    partnerLine = <Text style={[styles.text, { color: colors.textMuted }]}>Chưa trả lời.</Text>;
  }

  return (
    <View style={[styles.day, { backgroundColor: colors.background }]}>
      <Text style={[styles.dayLabel, { color: day.is_today ? colors.primaryText : colors.text }]}>{day.label}</Text>
      <Text style={[styles.question, { color: colors.textMuted }]}>{day.question}</Text>

      {!!day.my_answer && (
        <Line colors={colors} who="Bạn" avatar={myAv}>
          <Text style={[styles.text, { color: colors.text }]}>{day.my_answer}</Text>
        </Line>
      )}
      {day.is_today && !day.my_answer && (
        <Text style={[styles.text, { color: colors.textMuted, marginTop: 4 }]}>Bạn chưa trả lời câu hỏi hôm nay.</Text>
      )}
      {!!partnerLine && (
        <Line colors={colors} who={partnerName} avatar={pAv}>
          {partnerLine}
        </Line>
      )}

      {day.notes.map((n) => (
        <NoteLine key={n.id} colors={colors} note={n} avatar={n.mine ? myAv : pAv} busy={busy} onEdit={onEdit} onRemove={onRemove} />
      ))}
      {day.is_today && !hasMyNote && <Composer colors={colors} busy={busy} onAdd={onAdd} />}
    </View>
  );
});

export const DiaryTab = ({ colors, diary, avatars = {}, partnerName, refreshControl }) => {
  const view = useRef(0);
  const content = useRef(0);
  const { days, loaded, failed, hasMore, loadingMore, busy, err, reload, loadMore, addNote, editNote, removeNote } = diary;

  // Nội dung chưa đủ dài để cuộn mà vẫn còn ngày cũ -> tải thêm cho đầy khung
  const fill = useCallback(() => {
    if (hasMore && !loadingMore && view.current > 0 && content.current < view.current + 60) loadMore();
  }, [hasMore, loadingMore, loadMore]);
  useEffect(fill, [fill, days.length]);

  if (!loaded) {
    return failed ? (
      <ScrollView refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
        <Text style={[styles.text, { color: colors.textMuted }]}>Chưa tải được nhật ký. Kiểm tra kết nối rồi thử lại nhé.</Text>
        <Btn colors={colors} ghost label="Thử lại" onPress={reload} style={styles.fullBtn} />
      </ScrollView>
    ) : (
      <ScrollView refreshControl={refreshControl}>
        <Skeleton colors={colors} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.flex}>
      {failed && (
        <TouchableOpacity onPress={reload} style={[styles.banner, { backgroundColor: colors.primarySoft }]} accessibilityRole="button"
          accessibilityLabel="Thử tải lại nhật ký">
          <Text style={[styles.text, { color: colors.primaryText, flex: 1 }]}>Chưa cập nhật được, đang hiện dữ liệu đã có.</Text>
          <Text style={[styles.link, { color: colors.primaryText }]}>Thử lại</Text>
        </TouchableOpacity>
      )}
      <ScrollView
        style={styles.flex}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={120}
        onLayout={(e) => {
          view.current = e.nativeEvent.layout.height;
          fill();
        }}
        onContentSizeChange={(_w, h) => {
          content.current = h;
          fill();
        }}
        onScroll={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height > contentSize.height - 160) loadMore();
        }}
      >
        {days.map((d) => (
          <DayCard key={d.day} colors={colors} day={d} avatars={avatars} partnerName={partnerName} busy={busy}
            onAdd={addNote} onEdit={editNote} onRemove={removeNote} />
        ))}
        {loadingMore && <Skeleton colors={colors} />}
        {!hasMore && !loadingMore && (
          <Text style={[styles.end, { color: colors.textMuted }]}>
            {days.length <= 1 ? "Nhật ký của hai bạn sẽ dày lên theo từng ngày." : "Đó là toàn bộ nhật ký của hai bạn."}
          </Text>
        )}
      </ScrollView>
      {!!err && <Text style={[styles.text, { color: "#d64545", marginTop: 8 }]}>{err}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  day: { borderRadius: 14, padding: 14, marginBottom: 10 },
  dayLabel: { fontSize: 14.5, fontWeight: "800" },
  question: { fontSize: 12.5, lineHeight: 18, marginTop: 2, marginBottom: 6 },
  line: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "flex-start" },
  lineBody: { flex: 1 },
  who: { fontSize: 11.5, fontWeight: "700", marginBottom: 1 },
  text: { fontSize: 13.5, lineHeight: 19 },
  noteRow: { flexDirection: "row", alignItems: "flex-start" },
  noteActions: { flexDirection: "row", marginLeft: 8, paddingTop: 2 },
  noteInput: { maxHeight: 110 },
  editBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  smallBtn: { minWidth: 64, height: 34 },
  composer: { marginTop: 12 },
  formRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  counter: { fontSize: 11.5, textAlign: "right", marginTop: 4 },
  banner: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  link: { fontSize: 12.5, fontWeight: "700" },
  fullBtn: { width: "100%", marginTop: 12 },
  end: { fontSize: 12.5, textAlign: "center", paddingVertical: 14 },
});