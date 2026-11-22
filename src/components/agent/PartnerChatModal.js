// =============================================================================
// PartnerChatModal — cuộc trò chuyện giữa hai người, giống chat nhóm có Tiểu Ngư.
//  • Bấm thông báo / bong bóng loại "chat", hoặc nút 💬 trên đầu khung chat AI -> mở thẳng khung này (không qua chatbot).
//  • Avatar = cá voi theo theme AI + màu accent (aiThemes.js). Người kia dùng accent của CHÍNH họ nếu `partner.accent` có.
//  • Gõ "tiểu ngư ơi ..." (hoặc @Tiểu Ngư) -> backend cho Tiểu Ngư trả lời vào cuộc trò chuyện. Không gọi thì Tiểu Ngư im lặng.
// Đặt file này ở components/agent/PartnerChatModal.js. AIChatModal dùng nó ở chế độ `embedded`.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAiAvatar, getAiAvatarStyle } from "../../context/aiThemes";
import { useTheme } from "../../context/ThemeContext";

const AGENT_NAME = "Tiểu Ngư";
const POLL_MS = 3000; // khung đang mở: hỏi tin mới mỗi 3 s
const POLL_FAST_MS = 1500; // đang đợi Tiểu Ngư trả lời
const AGENT_WAIT_MS = 45000; // quá bấy nhiêu mà chưa thấy trả lời thì thôi hiện "đang soạn"
const MAX_LEN = 2000;

// khớp với backend: bỏ dấu rồi tìm "tieu ngu"
const fold = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ");
export const mentionsAgent = (t) => /\btieu\s*ngu\b/.test(fold(t));

const avatarImgStyle = (themeKey) => {
  const flat = StyleSheet.flatten(getAiAvatarStyle(themeKey)) || {};
  const t = Array.isArray(flat.transform) ? flat.transform : [];
  // ảnh gốc quay đầu sang trái -> lật để quay vào phía nội dung (avatar nằm bên trái)
  return { ...flat, transform: [...t, { scaleX: -1 }] };
};

const mergeItems = (prev, incoming) => {
  if (!incoming?.length) return prev;
  const map = new Map(prev.map((m) => [m.id, m]));
  incoming.forEach((m) => map.set(m.id, m));
  const real = [...map.values()].filter((m) => typeof m.id === "number").sort((a, b) => a.id - b.id);
  const tmp = [...map.values()].filter((m) => typeof m.id !== "number");
  return [...real, ...tmp];
};

export default function PartnerChatModal({
  visible,
  onClose,
  api, // useAgentApi(token, apiBase, authFetch)
  inbox, // { items, markRead, refresh } từ useInboxBubbles
  partner, // { name?, accent?, aiTheme? } — nếu có dữ liệu theme của người kia thì truyền vào
  embedded = false, // true: vẽ như một lớp phủ bình thường (dùng trong AIChatModal) thay vì <Modal> riêng
}) {
  const { colors, accentKey, aiThemeKey } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [meId, setMeId] = useState(null);
  const [info, setInfo] = useState({ name: "Người ấy" });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const lastId = useRef(0);
  const sendingRef = useRef(false);
  const live = useRef({});
  live.current = { api, inbox };

  const partnerKey = partner?.aiTheme || aiThemeKey;
  const partnerAvatar = getAiAvatar(partnerKey, partner?.accent || accentKey);
  const partnerImgStyle = useMemo(() => avatarImgStyle(partnerKey), [partnerKey]);
  const agentAvatar = getAiAvatar(aiThemeKey, accentKey);
  const agentImgStyle = useMemo(() => avatarImgStyle(aiThemeKey), [aiThemeKey]);

  const load = useCallback(async (initial = false) => {
    if (sendingRef.current) return; // đang gửi: đợi gửi xong rồi mới đồng bộ, khỏi trùng tin
    try {
      const r = await live.current.api(`/api/couple/chat?after_id=${initial ? 0 : lastId.current}`);
      setMeId(r.me_id);
      if (r.partner) setInfo(r.partner);
      const rows = r.items || [];
      if (rows.length) lastId.current = Math.max(lastId.current, ...rows.map((m) => m.id));
      setItems((prev) => mergeItems(initial ? [] : prev, rows));
      setError("");
    } catch (e) {
      if (initial) setError(e.message || "Không tải được cuộc trò chuyện.");
    } finally {
      setLoading(false);
    }
  }, []);

  // mở khung: tải toàn bộ + đánh dấu các thông báo "chat" là đã đọc
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    lastId.current = 0;
    load(true);
    const ids = (live.current.inbox?.items || []).filter((it) => it.kind === "chat" && !(it.read || it.is_read || it.read_at)).map((it) => it.id);
    if (ids.length) live.current.inbox?.markRead?.(ids);
  }, [visible, load]);

  // đang đợi Tiểu Ngư? (tin cuối là của người, có gọi tên, chưa có trả lời, chưa quá 45 s)
  const waitingAgent = useMemo(() => {
    const last = items[items.length - 1];
    if (!last || last.sender_id == null) return false;
    if (!mentionsAgent(last.text)) return false;
    const t = typeof last.id === "number" ? Date.parse(last.created_at || "") || 0 : now;
    return now - t < AGENT_WAIT_MS;
  }, [items, now]);

  // vòng hỏi tin mới
  useEffect(() => {
    if (!visible) return undefined;
    let stop = false;
    let timer;
    const tick = async () => {
      if (stop) return;
      setNow(Date.now());
      if (AppState.currentState === "active") await load(false);
      if (!stop) timer = setTimeout(tick, waitingAgent ? POLL_FAST_MS : POLL_MS);
    };
    timer = setTimeout(tick, waitingAgent ? POLL_FAST_MS : POLL_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [visible, load, waitingAgent]);

  const send = useCallback(async () => {
    const text = input.trim().slice(0, MAX_LEN);
    if (!text || sendingRef.current) return;
    const tmpId = `tmp-${Date.now()}`;
    sendingRef.current = true;
    setSending(true);
    setInput("");
    setError("");
    setItems((prev) => mergeItems(prev, [{ id: tmpId, sender_id: meId ?? -1, text, created_at: new Date().toISOString() }]));
    try {
      const r = await api("/api/couple/chat", { method: "POST", body: JSON.stringify({ text }) });
      const msg = r?.message;
      if (msg) lastId.current = Math.max(lastId.current, msg.id);
      setItems((prev) => mergeItems(prev.filter((m) => m.id !== tmpId), msg ? [msg] : []));
    } catch (e) {
      setItems((prev) => prev.filter((m) => m.id !== tmpId));
      setInput(text); // trả lại chữ để gửi lại
      setError(e.message || "Chưa gửi được, bạn thử lại nhé.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [api, input, meId]);

  const data = useMemo(() => [...items].reverse(), [items]); // FlatList inverted: tin mới nhất ở đáy

  const renderItem = ({ item }) => {
    const isAgent = item.sender_id == null;
    const mine = !isAgent && item.sender_id === meId;
    const bubbleBg = mine ? colors.primary : isAgent ? colors.primarySoft : colors.card;
    const fg = mine ? "#fff" : colors.text;
    return (
      <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
        {!mine && (
          <View style={styles.avatarWrap}>
            <Image source={isAgent ? agentAvatar : partnerAvatar} style={[styles.avatar, isAgent ? agentImgStyle : partnerImgStyle]} />
            {isAgent && (
              <View style={[styles.aiBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
                <Ionicons name="sparkles" size={8} color="#fff" />
              </View>
            )}
          </View>
        )}
        <View style={styles.col}>
          {!mine && (
            <Text style={[styles.name, { color: colors.textMuted }]}>{isAgent ? AGENT_NAME : info.name}</Text>
          )}
          <View
            style={[
              styles.bubble,
              { backgroundColor: bubbleBg, borderColor: mine ? "transparent" : colors.border },
              typeof item.id !== "number" && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.msg, { color: fg }]} selectable>
              {item.text}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const body = (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Đóng">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Image source={partnerAvatar} style={[styles.headAvatar, partnerImgStyle]} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {info.name}
            </Text>
            <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
              Gọi “{AGENT_NAME} ơi” để {AGENT_NAME} vào trò chuyện
            </Text>
          </View>
        </View>

        {loading && !items.length ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={data}
            inverted
            keyExtractor={(m) => String(m.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              waitingAgent ? (
                <View style={[styles.row, styles.rowOther]}>
                  <View style={styles.avatarWrap}>
                    <Image source={agentAvatar} style={[styles.avatar, agentImgStyle]} />
                  </View>
                  <Text style={[styles.typing, { color: colors.textMuted }]}>{AGENT_NAME} đang soạn…</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textMuted, transform: [{ scaleY: -1 }] }]}>
                Chưa có tin nhắn nào. Nhắn một câu để bắt đầu nhé.
              </Text>
            }
          />
        )}

        {!!error && <Text style={[styles.error, { color: "#ef4444" }]}>{error}</Text>}

        <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={`Nhắn tin… (gọi “${AGENT_NAME} ơi” để hỏi ${AGENT_NAME})`}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_LEN}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <TouchableOpacity
            onPress={send}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Gửi"
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: !input.trim() || sending ? 0.5 : 1 }]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
  );

  if (embedded) return visible ? body : null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headAvatar: { width: 36, height: 36, borderRadius: 18, marginLeft: 6 },
  title: { fontSize: 16, fontWeight: "800" },
  sub: { fontSize: 11.5, marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", marginVertical: 4, alignItems: "flex-end" },
  rowMine: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  avatarWrap: { width: 34, height: 34, marginRight: 8 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  aiBadge: { position: "absolute", right: -3, bottom: -3, width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  col: { maxWidth: "78%", flexShrink: 1 },
  name: { fontSize: 11.5, fontWeight: "700", marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  msg: { fontSize: 15, lineHeight: 21 },
  typing: { fontSize: 13, fontStyle: "italic", paddingVertical: 8 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 13.5 },
  error: { textAlign: "center", fontSize: 12.5, paddingVertical: 4 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: Platform.OS === "ios" ? 10 : 8, paddingBottom: 8, fontSize: 15.5 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, marginLeft: 8, alignItems: "center", justifyContent: "center" },
});