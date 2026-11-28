// =============================================================================
// CoupleDiary — "Nhật ký" của cặp đôi: dòng thời gian theo NGÀY, cuộn xuống tải thêm ngày cũ.
//   useDiary(api, enabled): tải trang đầu, tải thêm, thêm / sửa / xoá ghi chú của chính mình. (giữ nguyên)
//   DiaryTab: giao diện (skeleton khi tải lần đầu, giữ dữ liệu cũ khi tải lại lỗi).
// Mỗi ngày: câu hỏi hôm đó + câu trả lời của hai người (của người kia chỉ hiện sau khi mình đã trả lời —
// server quyết định, app chỉ hiển thị) + ghi chú tự do (mỗi người tối đa một ghi chú / ngày, sửa/xoá được của mình).
// Giao diện: dòng thời gian giữ nguyên (cột ngày + đường dọc + gộp ngày trống + tiêu đề tháng).
// Phần nội dung từng ngày thiết kế lại:
//   - câu hỏi là "tiêu đề" của ngày: chữ serif lớn, dễ đọc lại
//   - câu trả lời là hai "giọng" xếp dọc, mỗi giọng một thanh màu bên trái (không còn bong bóng chat)
//   - câu trả lời của người kia chưa mở = phong thư niêm phong (khung nét đứt + khoá); mở ra có chuyển động nhẹ
//   - ghi chú là thẻ nhỏ riêng, sửa/xoá gom vào một nút "…" (đủ 44pt để bấm)
//   - ô trả lời có nút gửi tròn; ô ghi chú thu gọn thành một dòng, chạm mới mở
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Avatar } from "../Avatar";
import { Btn, Input } from "./AgentHomeCards";
import { ACCENTS, useTheme } from "../../context/ThemeContext"; // ⚠️ chỉnh đường dẫn tới ThemeContext.js cho đúng thư mục của bạn

const PAGE = 14; // số ngày mỗi trang khi cuộn tải thêm (server giới hạn 31)
const FIRST_PAGE = 7; // trang ĐẦU nhỏ hơn -> server trả nhanh hơn; thiếu thì tự tải thêm cho đầy khung
const CACHE_KEY = (k) => `couple_diary:${k}`;
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

// cacheKey (vd. tên đăng nhập): có thì trang đầu được nhớ trên máy -> mở nhật ký là có dữ liệu NGAY, bản mới tải ngầm rồi thay vào.
export function useDiary(api, enabled = true, cacheKey = "") {
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
  const loadSeq = useRef(0); // chỉ kết quả của lần tải MỚI NHẤT được ghi (bản cũ về trễ không đè bản mới)
  const gotFresh = useRef(false); // đã có dữ liệu từ server -> bỏ qua bản nhớ trên máy nếu nó đọc xong chậm hơn

  // bản nhớ trên máy: hiện tức thì trong lúc chờ server
  useEffect(() => {
    if (!cacheKey) return;
    AsyncStorage.getItem(CACHE_KEY(cacheKey))
      .then((v) => {
        if (!v || !mounted.current || gotFresh.current) return;
        const cached = JSON.parse(v);
        if (!Array.isArray(cached?.days)) return;
        setState((prev) => (prev.days.length ? prev : { days: cached.days, hasMore: !!cached.has_more, nextBefore: cached.next_before || null }));
        setLoaded(true);
      })
      .catch(() => {});
  }, [cacheKey]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    const mine = (loadSeq.current += 1);
    setLoading(true);
    try {
      const page = await api(`/api/couple/diary?limit=${FIRST_PAGE}`);
      if (!mounted.current || mine !== loadSeq.current) return;
      if (!Array.isArray(page?.days)) throw new Error("server chưa hỗ trợ nhật ký theo ngày");
      gotFresh.current = true;
      setState((prev) => mergeFirstPage(prev, page));
      setLoaded(true);
      setFailed(false);
      if (cacheKey) AsyncStorage.setItem(CACHE_KEY(cacheKey), JSON.stringify({ days: page.days, has_more: page.has_more, next_before: page.next_before })).catch(() => {});
    } catch {
      if (mounted.current && mine === loadSeq.current) setFailed(true); // giữ nguyên dữ liệu cũ
    } finally {
      if (mounted.current && mine === loadSeq.current) setLoading(false);
    }
  }, [api, enabled, cacheKey]);

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

// ── ngày tháng cho dòng thời gian (server chỉ cần gửi day = "YYYY-MM-DD"; hôm nay tính theo giờ máy) ──
const WEEKDAY = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const dateInfo = (day) => {
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (day.is_today) return { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate(), wd: WEEKDAY[now.getDay()], diff: 0 };
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day.day || ""));
  if (!m) return null;
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(dt.getTime())) return null;
  return { y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate(), wd: WEEKDAY[dt.getDay()], diff: Math.round((today0 - dt) / 86400000) };
};
const whenLabel = (day, info) => {
  if (day.is_today) return "Hôm nay";
  if (!info) return day.label || "";
  return info.diff === 1 ? "Hôm qua" : info.wd;
};
const isEmptyDay = (d) => !d.is_today && !d.my_answer && !d.partner_answer && !d.partner_answered && !(d.notes || []).length;

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
        <View key={i} style={styles.row}>
          <View style={styles.rail}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border, marginBottom: 6 }} />
            <View style={[styles.railLine, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.rowBody}>
            {bar(70, 12)}
            {bar("92%", 16)}
            {bar("64%", 16)}
          </View>
        </View>
      ))}
    </Animated.View>
  );
};

// ── cột mốc bên trái: ngày (hôm nay = chấm đặc), đường dọc nối các ngày với nhau ──
const Rail = ({ colors, info, today, gap, showLine }) => (
  <View style={styles.rail}>
    {gap || !info ? (
      <View style={[styles.gapDot, { borderColor: gap ? colors.textMuted : colors.primary }]} />
    ) : today ? (
      <View style={[styles.todayDot, { backgroundColor: colors.primary }]}>
        <Text style={styles.todayNum} allowFontScaling={false}>{info.d}</Text>
      </View>
    ) : (
      <View style={styles.dateBox}>
        <Text style={[styles.dateNum, { color: colors.text }]} allowFontScaling={false}>{info.d}</Text>
        <Text style={[styles.dateMon, { color: colors.textMuted }]} allowFontScaling={false}>thg {info.mo}</Text>
      </View>
    )}
    {showLine && <View style={[styles.railLine, { backgroundColor: colors.border }]} />}
  </View>
);


// Câu hỏi là "tiêu đề" của ngày: chữ serif cho cảm giác nhật ký. Muốn bỏ thì đổi thành undefined.
// (Georgia / serif hệ thống đều có dấu tiếng Việt; nên xem thử trên máy thật.)
// TẠM THỜI: bật để thấy giá trị partnerAccent mà nhật ký nhận được (hiện một dòng nhỏ trên đầu). Xong việc thì đổi thành false.
const SHOW_ACCENT_DEBUG = false;

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: undefined });

// Chỉ chạy khi có chuyển động thật sự đáng kể: câu trả lời của người ấy vừa được MỞ sau khi mình gửi câu trả lời.
// Tôn trọng cài đặt "giảm chuyển động" của máy.
const Reveal = ({ animate, children }) => {
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return undefined;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!alive) return;
        if (reduce) v.setValue(1);
        else Animated.timing(v, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      })
      .catch(() => v.setValue(1));
    return () => {
      alive = false;
    };
  }, [animate, v]);
  if (!animate) return children;
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      {children}
    </Animated.View>
  );
};

// Nút gửi tròn 44pt: xám khi chưa có chữ, vòng xoay khi đang gửi
const SendBtn = ({ colors, busy, disabled, onPress, label }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || busy}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled, busy: !!busy }}
    style={[styles.send, { backgroundColor: disabled ? colors.border : colors.primary }]}
  >
    {busy ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="arrow-up" size={20} color={disabled ? colors.textMuted : "#ffffff"} />}
  </TouchableOpacity>
);

const Counter = ({ colors, n, left }) =>
  n > 700 ? (
    <Text style={[styles.counter, { color: colors.textMuted }, left && { textAlign: "left" }]}>
      {n}/{MAX_NOTE}
    </Text>
  ) : null;

// Màu của ĐỐI PHƯƠNG theo accent mà họ đang dùng (cùng công thức với ThemeContext: nền nhạt, viền nhạt, chữ accent).
// accentKey không hợp lệ / chưa có -> null -> hiển thị trung tính như trước.
const partnerPalette = (accentKey, isDark) => {
  const a = ACCENTS[accentKey];
  if (!a) return null;
  return {
    soft: `rgba(${a.rgb},${isDark ? 0.2 : 0.14})`,
    border: `rgba(${a.rgb},${isDark ? 0.45 : 0.35})`,
    text: isDark ? a.light : a.dark,
    bar: a.primary,
  };
};

// ── một câu trả lời = bóng chat: avatar bên trái, tên phía trên, chữ trong bóng ──
//   state "text": câu trả lời đã mở · "sealed": người ấy đã viết, mình chưa mở được · "waiting": chưa ai viết
//   Màu: của mình theo theme của mình, của người ấy theo accent người ấy đang dùng (accent).
//   Trong thẻ hôm nay (nền màu chủ đạo) bóng nền thẻ + viền theo màu từng người; trong thẻ ngày cũ bóng tô nhạt theo màu từng người.
const AnswerBlock = ({ colors, who, avatar, tone, state = "text", inCard, accent, children }) => {
  const mine = tone === "mine";
  const sealed = state === "sealed";
  const theirs = !mine && accent; // có màu riêng của người ấy
  const soft = mine ? colors.primarySoft : theirs ? accent.soft : "transparent";
  const border = mine ? colors.primaryBorder : theirs ? accent.border : colors.border;
  const nameColor = mine ? colors.primaryText : theirs ? accent.text : colors.textMuted;
  const bubbleBg = inCard ? colors.card : soft;
  const bubbleBorder = inCard || !(mine || theirs) ? border : "transparent";
  return (
    <View style={styles.answer}>
      <Avatar name={who} size={28} ringColor={mine ? colors.primaryBorder : border} {...avatar} />
      <View style={styles.answerBody}>
        <Text style={[styles.who, { color: nameColor, marginBottom: 4 }]} numberOfLines={1}>
          {who}
        </Text>
        {state === "text" ? (
          <View style={[styles.bubble, { backgroundColor: bubbleBg, borderColor: bubbleBorder }]}>{children}</View>
        ) : (
          <View
            style={[
              styles.sealed,
              { borderColor: sealed ? border : colors.border, backgroundColor: inCard ? colors.card : "transparent" },
            ]}
          >
            <Ionicons name={sealed ? "lock-closed" : "time-outline"} size={16}
              color={sealed ? (theirs ? accent.text : colors.primaryText) : colors.textMuted} />
            <Text style={[styles.text, styles.sealedText, { color: sealed ? colors.text : colors.textMuted }]}>{children}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

// ── ghi chú tự do: thẻ nhỏ riêng, khác hẳn câu trả lời; sửa/xoá gom vào nút "…" ──
const NoteBlock = ({ colors, note, avatar, busy, inCard, accent, onEdit, onRemove }) => {
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
  const openMenu = () => {
    buzz();
    Alert.alert("Ghi chú của bạn", undefined, [
      { text: "Sửa ghi chú", onPress: startEdit },
      { text: "Xoá ghi chú", style: "destructive", onPress: confirmRemove },
      { text: "Huỷ", style: "cancel" },
    ]);
  };
  const tint = !note.mine && accent ? { soft: accent.soft, border: accent.border } : { soft: colors.primarySoft, border: colors.primaryBorder };
  return (
    <View style={[styles.noteCard, { backgroundColor: inCard ? colors.card : tint.soft, borderColor: tint.border }]}>
      <View style={styles.noteRow}>
        <Avatar name={note.mine ? "Bạn" : note.author} size={18} ringColor={tint.border} {...avatar} />
        <View style={styles.noteMain}>
          <View style={styles.noteMeta}>
            <Text style={[styles.noteWho, { color: colors.textMuted }]} numberOfLines={1}>
              {note.mine ? "Bạn" : note.author}
            </Text>
            <Ionicons name="bookmark-outline" size={10} color={colors.textMuted} style={{ marginLeft: 4, opacity: 0.7 }} />
          </View>
          {!editing && <Text style={[styles.noteText, { color: colors.text }]}>{note.text}</Text>}
        </View>
        {note.mine && !editing && (
          <TouchableOpacity onPress={openMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.more}
            accessibilityRole="button" accessibilityLabel="Tuỳ chọn ghi chú">
            <Ionicons name="ellipsis-horizontal" size={15} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {editing && (
        <View style={{ marginTop: 8 }}>
          <Input colors={colors} value={text} onChangeText={setText} multiline maxLength={MAX_NOTE} style={styles.noteInput}
            accessibilityLabel="Sửa ghi chú" />
          <Counter colors={colors} n={text.length} />
          <View style={styles.editBtns}>
            <Btn colors={colors} ghost label="Huỷ" onPress={() => setEditing(false)} style={styles.smallBtn} />
            <Btn colors={colors} label="Lưu" onPress={save} busy={busy} disabled={!text.trim() || text.trim() === note.text}
              style={styles.smallBtn} />
          </View>
        </View>
      )}
    </View>
  );
};

// Ghi chú nhỏ cho hôm nay: thu gọn thành một dòng, chạm mới mở ô nhập (đỡ hai ô nhập chồng nhau trong thẻ hôm nay)
const Composer = ({ colors, busy, onAdd, inCard }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const send = async () => {
    if (await onAdd(text.trim())) setText("");
  };
  if (!open) {
    return (
      <TouchableOpacity
        onPress={() => {
          buzz();
          setOpen(true);
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Thêm ghi chú nhỏ cho hôm nay"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={[styles.addNote, { borderColor: inCard ? colors.primaryBorder : colors.border }]}
      >
        <Ionicons name="add" size={14} color={colors.textMuted} />
        <Text style={[styles.addNoteText, { color: colors.textMuted }]}>Ghi chú nhỏ</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.composer}>
      <View style={styles.formRow}>
        <Input colors={colors} value={text} onChangeText={setText} multiline maxLength={MAX_NOTE} autoFocus
          placeholder="Viết một ghi chú nhỏ cho hôm nay…" style={{ flex: 1, maxHeight: 100, backgroundColor: colors.card }}
          accessibilityLabel="Ghi chú hôm nay" />
        <SendBtn colors={colors} busy={busy} disabled={!text.trim()} onPress={send} label="Lưu ghi chú" />
      </View>
      <Counter colors={colors} n={text.length} />
    </View>
  );
};

// Ô trả lời câu hỏi hôm nay (người kia chỉ thấy sau khi mình trả lời — server quyết định)
const AnswerBox = ({ colors, busy, onAnswer, err }) => {
  const [text, setText] = useState("");
  const send = async () => {
    if (await onAnswer(text.trim())) {
      buzz("ok");
      setText("");
    }
  };
  return (
    <View style={styles.composer}>
      <View style={styles.formRow}>
        <Input colors={colors} value={text} onChangeText={setText} multiline maxLength={MAX_NOTE}
          placeholder="Viết câu trả lời của bạn…" style={{ flex: 1, maxHeight: 120, backgroundColor: colors.card }}
          accessibilityLabel="Trả lời câu hỏi hôm nay" />
        <SendBtn colors={colors} busy={busy} disabled={!text.trim()} onPress={send} label="Gửi câu trả lời" />
      </View>
      <Counter colors={colors} n={text.length} left />
      <Text style={[styles.hint, { color: colors.textMuted }]}>Người ấy sẽ xem được câu trả lời của bạn sau khi cũng trả lời.</Text>
      {!!err && <Text style={[styles.text, { color: "#d64545", marginTop: 6 }]}>{err}</Text>}
    </View>
  );
};

const DayCard = memo(function DayCard({ colors, day, avatars, partnerName, accent, busy, showLine, onAdd, onEdit, onRemove, onAnswer, answerErr }) {
  const myAv = { uri: avatars.myUri, source: avatars.myUri ? null : avatars.mySource };
  const pAv = { source: avatars.partnerSource };
  const hasMyNote = day.notes.some((n) => n.mine);
  const today = !!day.is_today;
  const info = dateInfo(day);
  const preAnswer = today && !day.my_answer; // hôm nay mình chưa trả lời: ô nhập nằm ngay dưới câu hỏi

  // Người ấy đã viết nhưng mình chưa mở được -> phong thư niêm phong. Khi mình gửi xong và nó mở ra thì chạy chuyển động nhẹ.
  const partnerSealed = today && !!day.partner_answered && !day.partner_answer;
  const wasSealed = useRef(false);
  if (partnerSealed) wasSealed.current = true;

  let partnerBlock = null;
  if (day.partner_answer) {
    partnerBlock = (
      <Reveal animate={wasSealed.current}>
        <AnswerBlock colors={colors} who={partnerName} avatar={pAv} tone="theirs" accent={accent} inCard={today}>
          <Text style={[styles.answerText, { color: colors.text }]}>{day.partner_answer}</Text>
        </AnswerBlock>
      </Reveal>
    );
  } else if (partnerSealed) {
    partnerBlock = (
      <AnswerBlock colors={colors} who={partnerName} avatar={pAv} tone="theirs" accent={accent} state="sealed" inCard={today}>
        Đã trả lời rồi. Bạn trả lời để cả hai cùng mở ra nhé.
      </AnswerBlock>
    );
  } else if (today && !preAnswer) {
    partnerBlock = (
      <AnswerBlock colors={colors} who={partnerName} avatar={pAv} tone="theirs" accent={accent} state="waiting" inCard={today}>
        Đang chờ người ấy trả lời.
      </AnswerBlock>
    );
  }

  const content = (
    <>
      <View style={styles.dayHead}>
        {today ? (
          <View style={[styles.pill, { backgroundColor: colors.primary }]}>
            <Text style={styles.pillText}>Câu hỏi hôm nay</Text>
          </View>
        ) : (
          <Text style={[styles.dayLabel, { color: colors.textMuted }]}>{whenLabel(day, info)}</Text>
        )}
      </View>
      <Text style={[today ? styles.questionToday : styles.question, { color: colors.text }]}>{day.question}</Text>

      {preAnswer ? (
        <>
          {partnerBlock}
          <AnswerBox colors={colors} busy={busy} onAnswer={onAnswer} err={answerErr} />
        </>
      ) : (
        <>
          {!!day.my_answer && (
            <AnswerBlock colors={colors} who="Bạn" avatar={myAv} tone="mine" inCard={today}>
              <Text style={[styles.answerText, { color: colors.text }]}>{day.my_answer}</Text>
            </AnswerBlock>
          )}
          {partnerBlock}
        </>
      )}

      {day.notes.map((n) => (
        <NoteBlock key={n.id} colors={colors} note={n} avatar={n.mine ? myAv : pAv} busy={busy} inCard={today} accent={accent}
          onEdit={onEdit} onRemove={onRemove} />
      ))}
      {today && !hasMyNote && <Composer colors={colors} busy={busy} onAdd={onAdd} inCard />}
    </>
  );

  return (
    <View style={styles.row}>
      <Rail colors={colors} info={info} today={today} showLine={showLine} />
      <View style={styles.rowBody}>
        {today ? (
          <View style={[styles.todayCard, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}>{content}</View>
        ) : (
          <View style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{content}</View>
        )}
      </View>
    </View>
  );
});

// Các ngày liền nhau không có gì gộp thành một dòng, để lịch sử không bị loãng
const GapRow = memo(function GapRow({ colors, count, showLine }) {
  return (
    <View style={styles.row}>
      <Rail colors={colors} gap showLine={showLine} />
      <View style={[styles.rowBody, styles.gapBody]}>
        <Text style={[styles.gapText, { color: colors.textMuted }]}>{count} ngày chưa ghi lại gì</Text>
      </View>
    </View>
  );
});

const MonthRow = ({ colors, title }) => (
  <View style={styles.row}>
    <View style={styles.rail}>
      <View style={[styles.railLine, { backgroundColor: colors.border }]} />
    </View>
    <View style={[styles.rowBody, { paddingBottom: 8, paddingTop: 2 }]}>
      <Text style={[styles.month, { color: colors.text }]}>{title}</Text>
    </View>
  </View>
);
// bottomInset: phần đệm đáy (safe area) do khung cha truyền vào; danh sách cuộn tới sát đáy bảng và tự chừa chỗ này ở cuối.
export const DiaryTab = ({ colors, diary, avatars = {}, partnerName, partnerAccent, refreshControl, todayInfo, onAnswer, answerErr, bottomInset = 0 }) => {
  const { isDark } = useTheme();
  const accent = useMemo(() => partnerPalette(partnerAccent, isDark), [partnerAccent, isDark]);
  const view = useRef(0);
  const content = useRef(0);
  const { days: loadedDays, loaded, failed, hasMore, loadingMore, busy, err, reload, loadMore, addNote, editNote, removeNote } = diary;
  // Server chưa trả ngày hôm nay (nhật ký trống) nhưng đã có câu hỏi: dựng thẻ "hôm nay" từ trạng thái cặp đôi
  const days =
    todayInfo?.question && !loadedDays.some((d) => d.is_today)
      ? [{ day: "today", label: "Hôm nay", is_today: true, question: todayInfo.question, my_answer: todayInfo.my_answer || null,
          partner_answered: !!todayInfo.partner_answer, partner_answer: todayInfo.partner_answer || null, notes: [] }, ...loadedDays]
      : loadedDays;

  // Gộp các ngày trống liền nhau + chèn tiêu đề tháng khi sang tháng khác
  const items = useMemo(() => {
    const out = [];
    let prevMonth = null;
    days.forEach((d, idx) => {
      if (isEmptyDay(d)) {
        const last = out[out.length - 1];
        if (last && last.type === "gap") last.count += 1;
        else out.push({ type: "gap", key: `gap-${d.day}`, count: 1 });
        return;
      }
      const info = dateInfo(d);
      const monthKey = info ? `${info.y}-${info.mo}` : null;
      if (idx > 0 && monthKey && monthKey !== prevMonth) out.push({ type: "month", key: `m-${monthKey}`, title: `Tháng ${info.mo}, ${info.y}` });
      if (monthKey) prevMonth = monthKey;
      out.push({ type: "day", key: d.day, day: d });
    });
    return out;
  }, [days]);

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
      {SHOW_ACCENT_DEBUG && (
        <Text style={[styles.hint, { color: colors.textMuted, marginTop: 0, marginBottom: 6 }]}>
          partnerAccent = {String(partnerAccent)} · {accent ? "khớp bảng màu" : "KHÔNG khớp (đang hiện màu trung tính)"}
        </Text>
      )}
      {failed && (
        <TouchableOpacity onPress={reload} style={[styles.banner, { backgroundColor: colors.primarySoft }]} accessibilityRole="button"
          accessibilityLabel="Thử tải lại nhật ký">
          <Text style={[styles.text, { color: colors.primaryText, flex: 1 }]}>Chưa cập nhật được, đang hiện dữ liệu đã có.</Text>
          <Text style={[styles.link, { color: colors.primaryText }]}>Thử lại</Text>
        </TouchableOpacity>
      )}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: bottomInset + 16 }}
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
        {items.map((it, idx) => {
          const showLine = idx < items.length - 1 || hasMore || loadingMore;
          if (it.type === "month") return <MonthRow key={it.key} colors={colors} title={it.title} />;
          if (it.type === "gap") return <GapRow key={it.key} colors={colors} count={it.count} showLine={showLine} />;
          return (
            <DayCard key={it.key} colors={colors} day={it.day} avatars={avatars} partnerName={partnerName} accent={accent} busy={busy} showLine={showLine}
              onAdd={addNote} onEdit={editNote} onRemove={removeNote} onAnswer={onAnswer} answerErr={answerErr} />
          );
        })}
        {loadingMore && <Skeleton colors={colors} />}
        {!hasMore && !loadingMore && (
          <Text style={[styles.end, { color: colors.textMuted }]}>
            {days.length <= 1 ? "Nhật ký của hai bạn sẽ dày lên theo từng ngày." : "Đó là toàn bộ nhật ký."}
          </Text>
        )}
      </ScrollView>
      {!!err && <Text style={[styles.text, { color: "#d64545", marginTop: 8 }]}>{err}</Text>}
    </View>
  );
};

const RAIL_W = 48;
const styles = StyleSheet.create({
  flex: { flex: 1 },
  // dòng thời gian (giữ nguyên)
  row: { flexDirection: "row" },
  rail: { width: RAIL_W, alignItems: "center" },
  railLine: { flex: 1, width: 2, borderRadius: 1, minHeight: 10 },
  rowBody: { flex: 1, paddingBottom: 22 },
  dateBox: { alignItems: "center", marginBottom: 6 },
  dateNum: { fontSize: 24, lineHeight: 28, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dateMon: { fontSize: 11.5, lineHeight: 14, fontWeight: "600" },
  todayDot: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  todayNum: { color: "#ffffff", fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  gapDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, marginTop: 4, marginBottom: 6 },
  gapBody: { paddingBottom: 14, justifyContent: "center" },
  gapText: { fontSize: 12.5, lineHeight: 17, marginTop: -1 },
  month: { fontSize: 15, fontWeight: "800" },
  // thẻ hôm nay
  todayCard: { borderRadius: 20, borderWidth: 1.5, padding: 16 },
  dayCard: { borderRadius: 18, borderWidth: 1, padding: 14 },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 26 },
  dayLabel: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  pill: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { color: "#ffffff", fontSize: 11.5, fontWeight: "800" },
  // câu hỏi = tiêu đề của ngày (serif, lớn, đủ tương phản cả với ngày cũ)
  question: { fontFamily: SERIF, fontSize: 18, lineHeight: 27, marginTop: 8 },
  questionToday: { fontFamily: SERIF, fontSize: 22, lineHeight: 31, marginTop: 10 },
  // câu trả lời: avatar + tên, chữ có thanh màu bên trái
  answer: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14 },
  answerBody: { flex: 1 },
  bubble: { borderWidth: 1, borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
  who: { fontSize: 13, lineHeight: 18, fontWeight: "700", flexShrink: 1 },
  answerText: { fontSize: 15.5, lineHeight: 24 },
  sealed: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, padding: 12 },
  sealedText: { flex: 1 },
  text: { fontSize: 14.5, lineHeight: 21 },
  // ghi chú tự do
  noteCard: { marginTop: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 7 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  noteMain: { flex: 1, minWidth: 0 },
  noteMeta: { flexDirection: "row", alignItems: "center", minHeight: 18 },
  noteWho: { fontSize: 11.5, lineHeight: 16, fontWeight: "600", flexShrink: 1 },
  noteText: { fontSize: 13.5, lineHeight: 19, marginTop: 1 },
  more: { width: 24, height: 24, alignItems: "center", justifyContent: "center", marginRight: -4, marginTop: -2 },
  noteInput: { maxHeight: 110 },
  editBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  smallBtn: { minWidth: 64, height: 34 },
  addNote: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, height: 30, marginTop: 10, paddingLeft: 8, paddingRight: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15 },
  addNoteText: { fontSize: 12.5, lineHeight: 17, fontWeight: "500" },
  // ô nhập
  composer: { marginTop: 16 },
  formRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  counter: { fontSize: 11.5, textAlign: "right", marginTop: 4 },
  hint: { fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  // trạng thái chung
  banner: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  link: { fontSize: 12.5, fontWeight: "700" },
  fullBtn: { width: "100%", marginTop: 12 },
  end: { fontSize: 12.5, textAlign: "center", paddingVertical: 14 },
});