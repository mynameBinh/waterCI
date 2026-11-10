import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

// ▶ ẢNH ICON AI THEO THEME: mỗi màu accent trong ThemeContext ứng với 1 ảnh trong assets/ai-avata/.
//   (Metro bắt buộc require phải ghi đường dẫn tĩnh nên phải liệt kê từng ảnh như dưới.)
//   Đường dẫn tính từ src/components -> ../../assets. Nếu thư mục assets nằm chỗ khác thì sửa ở đây.
//   Nếu ảnh của bạn không phải .png thì đổi đuôi tương ứng.
export const AI_AVATARS = {
  ocean: require("../../assets/ai-avata/ai-avata-xanhduong.png"),
  pink: require("../../assets/ai-avata/ai-avata-hong.png"),
  yellow: require("../../assets/ai-avata/ai-avata-vang.png"),
  orange: require("../../assets/ai-avata/ai-avata-cam.png"),
  purple: require("../../assets/ai-avata/ai-avata-tim.png"),
  green: require("../../assets/ai-avata/ai-avata-xanhla.png"),
};

// Giữ lại để file khác (nút ở tab Tôi...) import cũ vẫn chạy – mặc định là màu xanh dương.
export const AI_AVATAR = AI_AVATARS.ocean;

// Hook: trả về avatar đúng với accent đang chọn. File khác có thể dùng:
//   import { useAiAvatar } from "../components/AIChatModal";
//   const avatar = useAiAvatar();
export const useAiAvatar = () => {
  const { accentKey } = useTheme();
  return AI_AVATARS[accentKey] || AI_AVATARS.ocean;
};

// Các giới hạn này khớp với backend (chat_patch.py)
const MAX_SEND = 30; // CHAT_MAX_TURNS
const MAX_INPUT = 8000; // CHAT_MAX_CHARS
const MAX_FILES = 3; // CHAT_MAX_FILES
const MAX_FILE_BYTES = 5 * 1024 * 1024; // CHAT_MAX_FILE_BYTES

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PICK_TYPES = ["image/*", "application/pdf", "text/*", DOCX_MIME];

// Bấm vào gợi ý -> điền sẵn vào ô nhập để bạn sửa lại trước khi gửi
const SUGGESTIONS = [
 
];

const guessMime = (name = "", mime) => {
  if (mime) return mime;
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return DOCX_MIME;
  if (/\.(png|jpe?g|webp|gif)$/.test(n)) return "image/jpeg";
  return "text/plain";
};

const AIChatModal = memo(function AIChatModal({
  visible,
  onClose,
  token,
  apiBase,
  authFetch,
}) {
  const { colors } = useTheme();
  const avatar = useAiAvatar();
  const insets = useSafeAreaInsets();
  // message: { id, role, content, files?: [{name, mime, data}], isError? }
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState([]); // tệp đã chọn, chưa gửi: [{name, mime, size, uri}]
  const [sending, setSending] = useState(false);
  const [convId, setConvId] = useState(null); // id cuộc trò chuyện trên server (null = cuộc mới)
  const [panel, setPanel] = useState(null); // null | "history" | "memory"
  const [convs, setConvs] = useState([]);
  const [memories, setMemories] = useState([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const convIdRef = useRef(null);
  convIdRef.current = convId;
  const listRef = useRef(null);
  const idRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const nextId = () => `m${++idRef.current}`;

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    if (visible) scrollToEnd();
  }, [visible, scrollToEnd]);

  // Đóng các bảng phụ khi đóng khung chat
  useEffect(() => {
    if (!visible) setPanel(null);
  }, [visible]);

  // ── Gọi API (lịch sử + ghi nhớ) ───────────────────────────────────────────
  const api = useCallback(
    async (path, options = {}) => {
      const doFetch = authFetch || fetch;
      const res = await doFetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.detail === "string" ? data.detail : "Có lỗi xảy ra, bạn thử lại nhé.",
        );
      }
      return data;
    },
    [authFetch, apiBase, token],
  );

  const openHistory = useCallback(async () => {
    setPanel("history");
    setPanelLoading(true);
    setPanelError("");
    try {
      const d = await api("/api/chat/conversations");
      setConvs(d.conversations || []);
    } catch (e) {
      setPanelError(e?.message || "Không tải được lịch sử.");
    } finally {
      setPanelLoading(false);
    }
  }, [api]);

  const openMemory = useCallback(async () => {
    setPanel("memory");
    setPanelLoading(true);
    setPanelError("");
    try {
      const d = await api("/api/chat/memory");
      setMemories(d.memories || []);
    } catch (e) {
      setPanelError(e?.message || "Không tải được phần ghi nhớ.");
    } finally {
      setPanelLoading(false);
    }
  }, [api]);

  const openConv = useCallback(
    async (id) => {
      if (sending) return;
      setPanelLoading(true);
      setPanelError("");
      try {
        const d = await api(`/api/chat/conversations/${id}`);
        setMessages(
          (d.messages || []).map((m) => ({
            id: nextId(),
            role: m.role,
            content: m.content,
            files: (m.files || []).map((n) => ({ name: n })), // chỉ có tên, không có nội dung tệp
          })),
        );
        setConvId(id);
        setPending([]);
        setPanel(null);
      } catch (e) {
        setPanelError(e?.message || "Không mở được cuộc trò chuyện.");
      } finally {
        setPanelLoading(false);
      }
    },
    [api, sending],
  );

  const deleteConv = useCallback(
    (c) => {
      Alert.alert("Xoá cuộc trò chuyện?", `"${c.title}" sẽ bị xoá vĩnh viễn.`, [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá",
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/api/chat/conversations/${c.id}`, { method: "DELETE" });
              setConvs((p) => p.filter((x) => x.id !== c.id));
              if (convIdRef.current === c.id) {
                setMessages([]);
                setConvId(null);
              }
            } catch (e) {
              Alert.alert("Không xoá được", e?.message || "Bạn thử lại nhé.");
            }
          },
        },
      ]);
    },
    [api],
  );

  const deleteMemory = useCallback(
    async (m) => {
      try {
        await api(`/api/chat/memory/${m.id}`, { method: "DELETE" });
        setMemories((p) => p.filter((x) => x.id !== m.id));
      } catch (e) {
        Alert.alert("Không xoá được", e?.message || "Bạn thử lại nhé.");
      }
    },
    [api],
  );

  const clearMemory = useCallback(() => {
    Alert.alert("Quên tất cả?", "Tiểu Đậu sẽ không còn nhớ điều nào về chị nữa.", [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Quên hết",
        style: "destructive",
        onPress: async () => {
          try {
            await api("/api/chat/memory", { method: "DELETE" });
            setMemories([]);
          } catch (e) {
            Alert.alert("Không xoá được", e?.message || "Bạn thử lại nhé.");
          }
        },
      },
    ]);
  }, [api]);

  // ── Chọn tệp ──────────────────────────────────────────────────────────────
  const pickFiles = useCallback(async () => {
    if (sending) return;
    const room = MAX_FILES - pending.length;
    if (room <= 0) {
      Alert.alert("Đã đủ tệp", `Mỗi lượt chỉ đính kèm tối đa ${MAX_FILES} tệp.`);
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: PICK_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const accepted = [];
      for (const a of res.assets || []) {
        if (accepted.length >= room) break;
        if (a.size && a.size > MAX_FILE_BYTES) {
          Alert.alert("Tệp quá lớn", `"${a.name}" vượt quá 5MB.`);
          continue;
        }
        accepted.push({
          name: a.name || "tep",
          mime: guessMime(a.name, a.mimeType),
          size: a.size || 0,
          uri: a.uri,
        });
      }
      if (accepted.length) setPending((p) => [...p, ...accepted]);
    } catch (e) {
      Alert.alert("Không chọn được tệp", e?.message || "Bạn thử lại nhé.");
    }
  }, [sending, pending.length]);

  const removePending = useCallback(
    (idx) => setPending((p) => p.filter((_, i) => i !== idx)),
    [],
  );

  // ── Gửi ───────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || sending) return;

    setSending(true);
    try {
      // Đọc tệp -> base64 (giữ trong tin nhắn để các câu hỏi tiếp theo vẫn "nhớ" tệp)
      const files = [];
      for (const f of pending) {
        const data = await new ExpoFile(f.uri).base64();
        files.push({ name: f.name, mime: f.mime, data });
      }

      const userMsg = {
        id: nextId(),
        role: "user",
        content: text.slice(0, MAX_INPUT),
        files,
      };
      const history = [...messagesRef.current, userMsg];
      setMessages(history);
      setInput("");
      setPending([]);
      scrollToEnd();

      // Bỏ tin lỗi, lấy MAX_SEND tin gần nhất; chỉ giữ MAX_FILES tệp mới nhất
      const recent = history.filter((m) => !m.isError).slice(-MAX_SEND);
      let budget = MAX_FILES;
      const attachKeep = new Map();
      for (let i = recent.length - 1; i >= 0 && budget > 0; i--) {
        const fl = (recent[i].files || []).filter((f) => f.data); // tin cũ mở từ lịch sử chỉ còn tên tệp
        if (recent[i].role === "user" && fl.length) {
          attachKeep.set(i, fl.slice(0, budget));
          budget -= attachKeep.get(i).length;
        }
      }
      const payload = recent.map((m, i) => ({
        role: m.role,
        content: m.content,
        attachments: attachKeep.get(i) || [],
      }));

      const doFetch = authFetch || fetch;
      const res = await doFetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: payload, conversation_id: convIdRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : "Không gửi được tin nhắn, bạn thử lại nhé.";
        throw new Error(detail);
      }
      if (data.conversation_id) setConvId(data.conversation_id);
      const note = (data.memory_events || [])
        .map((e) =>
          e.action === "saved"
            ? `🧠 Đã ghi nhớ: ${e.text}`
            : e.action === "forgot"
              ? `🧠 Đã quên: ${e.text}`
              : e.action === "full"
                ? "🧠 Bộ nhớ đã đầy, hãy xoá bớt trong mục Ghi nhớ."
                : "",
        )
        .filter(Boolean)
        .join("\n");
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: data.reply, note },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          isError: true,
          content: e?.message || "Lỗi kết nối, bạn kiểm tra mạng rồi thử lại nhé.",
        },
      ]);
    } finally {
      setSending(false);
      scrollToEnd();
    }
  }, [input, pending, sending, authFetch, apiBase, token, scrollToEnd]);

  // Bắt đầu cuộc trò chuyện mới (cuộc cũ vẫn nằm trong Lịch sử)
  const newChat = useCallback(() => {
    if (sending) return;
    setMessages([]);
    setPending([]);
    setConvId(null);
    setPanel(null);
  }, [sending]);

  const renderItem = useCallback(
    ({ item }) => {
      const mine = item.role === "user";
      return (
        <View style={[styles.msgRow, mine ? styles.rowMine : styles.rowAi]}>
          {!mine && <Image source={avatar} style={styles.msgAvatar} />}
          <View
            style={[
              styles.bubble,
              mine
                ? { backgroundColor: colors.primary, borderBottomRightRadius: 6 }
                : {
                    backgroundColor: item.isError ? "rgba(239,68,68,0.12)" : colors.card,
                    borderBottomLeftRadius: 6,
                  },
            ]}
          >
            {!!item.files?.length &&
              item.files.map((f, i) => (
                <Text
                  key={`${f.name}-${i}`}
                  numberOfLines={1}
                  style={[styles.fileTag, { color: mine ? "#ffffff" : colors.textMuted }]}
                >
                  📎 {f.name}
                </Text>
              ))}
            {!!item.content && (
              <Text
                selectable
                style={[
                  styles.bubbleText,
                  { color: mine ? "#ffffff" : item.isError ? "#ef4444" : colors.text },
                ]}
              >
                {item.content}
              </Text>
            )}
            {!!item.note && (
              <Text style={[styles.noteText, { color: colors.primaryText }]}>{item.note}</Text>
            )}
          </View>
        </View>
      );
    },
    [colors, avatar],
  );

  const empty = (
    <View style={styles.emptyWrap}>
      <Image source={avatar} style={styles.emptyAvatar} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Chào chị, em là Tiểu Đậu 🥰 </Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        Chị có thể hỏi em về học tập, giải trí, hay nhờ em tạo nội dung. Em sẽ trả lời nhanh nhất có thể.
      </Text>
      <View style={styles.chips}>
        {SUGGESTIONS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}
            onPress={() => setInput(s)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, { color: colors.primary }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const canSend = (!!input.trim() || pending.length > 0) && !sending;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
          >
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </TouchableOpacity>
          <Image source={avatar} style={styles.headerAvatar} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>Tiểu Đậu</Text>
            <Text numberOfLines={1} style={[styles.headerSub, { color: colors.textMuted }]}>
              {sending ? "Đang trả lời…" : "Hỏi đáp · Học tập · Tạo nội dung"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={openMemory}
            hitSlop={8}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Ghi nhớ"
          >
            <Ionicons name="bulb-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openHistory}
            hitSlop={8}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Lịch sử chat"
          >
            <Ionicons name="time-outline" size={23} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={newChat}
            hitSlop={8}
            disabled={sending || (messages.length === 0 && !convId)}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Cuộc trò chuyện mới"
          >
            <Ionicons
              name="create-outline"
              size={22}
              color={sending || (messages.length === 0 && !convId) ? colors.border : colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {/* Danh sách tin nhắn */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          ListEmptyComponent={empty}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            sending ? (
              <View style={[styles.msgRow, styles.rowAi]}>
                <Image source={avatar} style={styles.msgAvatar} />
                <View style={[styles.bubble, { backgroundColor: colors.card, borderBottomLeftRadius: 6 }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              </View>
            ) : null
          }
        />

        {/* Tệp đã chọn (chưa gửi) */}
        {pending.length > 0 && (
          <View style={[styles.pendingBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {pending.map((f, i) => (
                <View
                  key={`${f.name}-${i}`}
                  style={[styles.pendingChip, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}
                >
                  <Text numberOfLines={1} style={[styles.pendingText, { color: colors.primary }]}>
                    📎 {f.name}
                  </Text>
                  <TouchableOpacity onPress={() => removePending(i)} hitSlop={8} accessibilityLabel="Bỏ tệp">
                    <Ionicons name="close-circle" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Ô nhập */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: pending.length ? "transparent" : colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <TouchableOpacity
            onPress={pickFiles}
            disabled={sending}
            hitSlop={6}
            style={styles.attachBtn}
            accessibilityRole="button"
            accessibilityLabel="Đính kèm tệp"
          >
            <Ionicons name="attach" size={26} color={sending ? colors.border : colors.textMuted} />
          </TouchableOpacity>
          <TextInput
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
            ]}
            value={input}
            onChangeText={setInput}
            placeholder="Nhập tin nhắn hoặc dán văn bản…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_INPUT}
            editable={!sending}
          />
          <TouchableOpacity
            onPress={send}
            disabled={!canSend}
            activeOpacity={0.8}
            style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Gửi"
          >
            <Ionicons name="arrow-up" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Bảng phụ: Lịch sử chat / Ghi nhớ (phủ lên khung chat) */}
        {panel && (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <View
              style={[
                styles.header,
                { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border },
              ]}
            >
              <TouchableOpacity
                onPress={() => setPanel(null)}
                hitSlop={10}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel="Quay lại"
              >
                <Ionicons name="chevron-back" size={26} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text, flex: 1, marginLeft: 6 }]}>
                {panel === "history" ? "Lịch sử chat" : "Tiểu Đậu đang nhớ"}
              </Text>
              {panel === "memory" && memories.length > 0 && (
                <TouchableOpacity onPress={clearMemory} hitSlop={8} style={styles.panelAction}>
                  <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 13.5 }}>Quên hết</Text>
                </TouchableOpacity>
              )}
            </View>

            {panelLoading ? (
              <View style={styles.panelCenter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : panelError ? (
              <View style={styles.panelCenter}>
                <Text style={[styles.panelEmpty, { color: "#ef4444" }]}>{panelError}</Text>
                <TouchableOpacity
                  onPress={panel === "history" ? openHistory : openMemory}
                  style={[styles.retryBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}
                >
                  <Text style={{ color: colors.primaryText, fontWeight: "700" }}>Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : panel === "history" ? (
              <FlatList
                data={convs}
                keyExtractor={(c) => String(c.id)}
                contentContainerStyle={styles.panelList}
                ListEmptyComponent={
                  <Text style={[styles.panelEmpty, { color: colors.textMuted }]}>
                    Chưa có cuộc trò chuyện nào. Nhắn cho Tiểu Đậu một câu để bắt đầu nhé 💬
                  </Text>
                }
                renderItem={({ item: c }) => {
                  const active = c.id === convId;
                  return (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => openConv(c.id)}
                      style={[
                        styles.rowCard,
                        {
                          backgroundColor: active ? colors.primarySoft : colors.card,
                          borderColor: active ? colors.primaryBorder : colors.border,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
                          {c.title}
                        </Text>
                        <Text style={[styles.rowSub, { color: colors.textMuted }]}>{c.updated}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => deleteConv(c)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Xoá cuộc trò chuyện"
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <FlatList
                data={memories}
                keyExtractor={(m) => String(m.id)}
                contentContainerStyle={styles.panelList}
                ListHeaderComponent={
                  <Text style={[styles.panelHint, { color: colors.textMuted }]}>
                    Tiểu Đậu chỉ ghi nhớ khi chị nhờ, ví dụ: “Hãy nhớ chị tên là …”, “Từ giờ gọi em là …”,
                    “Em đang học trường …”. Chị có thể xoá từng điều ở đây bất cứ lúc nào.
                  </Text>
                }
                ListEmptyComponent={
                  <Text style={[styles.panelEmpty, { color: colors.textMuted }]}>
                    Chưa có điều nào được ghi nhớ 🧠
                  </Text>
                }
                renderItem={({ item: m }) => (
                  <View style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{m.text}</Text>
                    <TouchableOpacity
                      onPress={() => deleteMemory(m)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Quên điều này"
                    >
                      <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
});

export default AIChatModal;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  headerAvatar: { width: 38, height: 38, borderRadius: 12, marginHorizontal: 8 },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  headerSub: { fontSize: 12, marginTop: 1 },
  listContent: { padding: 16, flexGrow: 1 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 12 },
  rowMine: { justifyContent: "flex-end" },
  rowAi: { justifyContent: "flex-start" },
  msgAvatar: { width: 28, height: 28, borderRadius: 9, marginRight: 8 },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  fileTag: { fontSize: 12.5, fontWeight: "600", marginBottom: 4 },
  noteText: { fontSize: 12.5, fontWeight: "600", marginTop: 8 },
  panelAction: { paddingHorizontal: 8, height: 36, justifyContent: "center" },
  panelCenter: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  panelList: { padding: 16, flexGrow: 1 },
  panelHint: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  panelEmpty: { fontSize: 14, textAlign: "center", lineHeight: 21, marginTop: 24 },
  retryBtn: { marginTop: 14, borderWidth: 1, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 18 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  rowTitle: { fontSize: 14.5, fontWeight: "600", lineHeight: 20 },
  rowSub: { fontSize: 12, marginTop: 2 },
  emptyWrap: { alignItems: "center", paddingTop: 32, paddingHorizontal: 12 },
  emptyAvatar: { width: 96, height: 96, borderRadius: 28, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptySub: { fontSize: 13.5, marginTop: 6, textAlign: "center", lineHeight: 20 },
  chips: { marginTop: 22, width: "100%" },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  chipText: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  pendingBar: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1 },
  pendingChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 6,
    marginRight: 8,
    maxWidth: 220,
  },
  pendingText: { fontSize: 12.5, fontWeight: "600", marginRight: 6, flexShrink: 1 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  attachBtn: { width: 40, height: 42, justifyContent: "center", alignItems: "center" },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 11 : 8,
    paddingBottom: Platform.OS === "ios" ? 11 : 8,
    fontSize: 15,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});