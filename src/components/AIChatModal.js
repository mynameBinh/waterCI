import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAiAgent } from "../context/aiAgents";
import { useTheme } from "../context/ThemeContext";
import CameraOverlay from "./CameraOverlay";
import ChatPlusSheet, { CHAT_MODELS } from "./ChatPlusSheet";
import SmartCopySheet from "./SmartCopySheet";
import { FILE_TYPES, copyText, createFile, parseReply, replyText, shareFile } from "./chatFiles";

// ▶ ẢNH ICON AI: nay nằm trong src/context/aiThemes.js (theme ảnh × màu accent).
import {
  AI_THEMES,
  DEFAULT_AI_THEME,
  getAiAvatar,
  getAiAvatarStyle,
  getAiBackground,
  getAiBackgroundStyle,
} from "../context/aiThemes";

// Giữ export cũ để file khác import vẫn chạy
export const AI_AVATARS = AI_THEMES[DEFAULT_AI_THEME].images;
export const AI_AVATAR = AI_AVATARS.ocean;

// Hook: trả về avatar đúng với AI-theme + màu accent đang chọn. File khác có thể dùng:
//   import { useAiAvatar } from "../components/AIChatModal";
//   const avatar = useAiAvatar();
export const useAiAvatar = () => {
  const { accentKey, aiThemeKey } = useTheme();
  return getAiAvatar(aiThemeKey, accentKey);
};

// Hook: style phóng to riêng của AI-theme đang chọn (vd cá voi to hơn) -> gắn thêm vào style của <Image>
export const useAiAvatarStyle = () => {
  const { aiThemeKey } = useTheme();
  return getAiAvatarStyle(aiThemeKey);
};

// ── Hướng đầu của ảnh agent ──────────────────────────────────────────────────
// "left"  = ảnh gốc quay đầu sang TRÁI (mặc định);  "right" = ảnh gốc quay đầu sang PHẢI.
// Mục tiêu: agent luôn quay đầu vào phía trong màn hình / phía nội dung.
//  • Nút nổi nằm mép PHẢI -> quay sang trái; nằm mép TRÁI -> lật lại quay sang phải.
//  • Avatar trong khung chat đều nằm bên TRÁI -> cần quay sang phải.
// Thấy ngược hướng thì chỉ cần đổi hằng số này.
export const AVATAR_NATIVE_FACING = "left";

// Lật ngang style ảnh (giữ nguyên các transform sẵn có của AI-theme như phóng to)
export const flipAvatarStyle = (style) => {
  const flat = StyleSheet.flatten(style) || {};
  const t = Array.isArray(flat.transform) ? flat.transform : [];
  return { ...flat, transform: [...t, { scaleX: -1 }] };
};

// Hook: ảnh + style cho màn hình trống. Theme có `background` -> dùng ảnh nền (đổi theo màu accent,
// chỉ có 1 ảnh thì dùng ảnh đó); không có -> dùng avatar như cũ.
export const useAiEmptyImage = () => {
  const { accentKey, aiThemeKey } = useTheme();
  const background = getAiBackground(aiThemeKey, accentKey);
  if (background) return { source: background, style: getAiBackgroundStyle(aiThemeKey) };
  return { source: getAiAvatar(aiThemeKey, accentKey), style: getAiAvatarStyle(aiThemeKey) };
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
  { icon: "school-outline", text: "Giải thích một khái niệm khó hiểu" },
  { icon: "create-outline", text: "Giúp viết một đoạn văn ngắn" },
  { icon: "language-outline", text: "Dịch và sửa lỗi câu này" },
  { icon: "bulb-outline", text: "Gợi ý một vài ý tưởng thú vị" },
];

const PREFS_KEY = "ai_chat_prefs_v1";
const DEFAULT_PREFS = { model: "fast", thinking: false, webSearch: false };

// Chip nhỏ báo chế độ đang bật (chạm để tắt)
const ModeChip = memo(function ModeChip({ icon, label, onClear, colors }) {
  return (
    <TouchableOpacity
      onPress={onClear}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Tắt ${label}`}
      style={[styles.modeChip, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}
    >
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={[styles.modeChipText, { color: colors.primary }]}>{label}</Text>
      <Ionicons name="close" size={14} color={colors.primary} />
    </TouchableOpacity>
  );
});

// ── Hiển thị markdown gọn (đậm, nghiêng, `code`, tiêu đề, gạch đầu dòng, khối code) ──
const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const splitCells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

const parseBlocks = (src) => {
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]);
      i++;
      out.push({ t: "code", text: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const rows = [splitCells(line)];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitCells(lines[i++]));
      out.push({ t: "table", rows });
      continue;
    }
    let m;
    if ((m = line.match(/^\s{0,3}(#{1,4})\s+(.*)$/))) out.push({ t: "h", text: m[2], lvl: m[1].length });
    else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) out.push({ t: "li", text: m[1], mark: "•" });
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) out.push({ t: "li", text: m[2], mark: `${m[1]}.` });
    else if ((m = line.match(/^>\s?(.*)$/))) out.push({ t: "quote", text: m[1] });
    else out.push({ t: "p", text: line });
    i++;
  }
  return out;
};

const Inline = ({ text, style, colors }) => (
  <Text style={style} selectable>
    {text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).map((p, i) => {
      if (!p) return null;
      if (p.length > 4 && p.startsWith("**") && p.endsWith("**"))
        return <Text key={i} style={{ fontWeight: "800" }}>{p.slice(2, -2)}</Text>;
      if (p.length > 2 && p.startsWith("`") && p.endsWith("`"))
        return (
          <Text key={i} style={[styles.inlineCode, { backgroundColor: colors.primarySoft, color: colors.primaryText }]}>
            {p.slice(1, -1)}
          </Text>
        );
      if (p.length > 2 && p.startsWith("*") && p.endsWith("*"))
        return <Text key={i} style={{ fontStyle: "italic" }}>{p.slice(1, -1)}</Text>;
      return p;
    })}
  </Text>
);

const RichText = memo(function RichText({ content, colors }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const base = [styles.bubbleText, { color: colors.text }];
  return (
    <View>
      {blocks.map((b, i) => {
        const gap = i === 0 ? 0 : b.t === "li" ? 3 : 8;
        if (b.t === "code") return <CodeBlock key={i} text={b.text} colors={colors} gap={gap} />;
        if (b.t === "table") return <TableView key={i} rows={b.rows} colors={colors} gap={gap} />;
        if (b.t === "h")
          return (
            <View key={i} style={{ marginTop: gap + 2 }}>
              <Inline text={b.text} colors={colors} style={[base, { fontWeight: "800", fontSize: b.lvl === 1 ? 18 : b.lvl === 2 ? 16.5 : 15.5, lineHeight: 24 }]} />
            </View>
          );
        if (b.t === "li")
          return (
            <View key={i} style={[styles.liRow, { marginTop: gap }]}>
              <Text style={[base, styles.liMark, { color: colors.primary }]}>{b.mark}</Text>
              <View style={{ flex: 1 }}>
                <Inline text={b.text} colors={colors} style={base} />
              </View>
            </View>
          );
        if (b.t === "quote")
          return (
            <View key={i} style={[styles.quote, { marginTop: gap, borderLeftColor: colors.primary }]}>
              <Inline text={b.text} colors={colors} style={[base, { color: colors.textMuted }]} />
            </View>
          );
        return (
          <View key={i} style={{ marginTop: gap }}>
            <Inline text={b.text} colors={colors} style={base} />
          </View>
        );
      })}
    </View>
  );
});

const CodeBlock = memo(function CodeBlock({ text, colors, gap }) {
  const [ok, setOk] = useState(false);
  return (
    <View style={[styles.codeBlock, { marginTop: gap, backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.codeHead}>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "700" }}>Code</Text>
        <TouchableOpacity
          hitSlop={8}
          onPress={async () => {
            if (await copyText(text)) {
              setOk(true);
              setTimeout(() => setOk(false), 1400);
            }
          }}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <Ionicons name={ok ? "checkmark" : "copy-outline"} size={14} color={ok ? colors.primary : colors.textMuted} />
          <Text style={{ color: ok ? colors.primary : colors.textMuted, fontSize: 11.5, fontWeight: "700", marginLeft: 4 }}>
            {ok ? "Đã chép" : "Sao chép"}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <Text selectable style={[styles.codeText, { color: colors.text }]}>{text}</Text>
      </ScrollView>
    </View>
  );
});

const TableView = memo(function TableView({ rows, colors, gap }) {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.min(220, Math.max(76, Math.max(...rows.map((r) => String(r[c] || "").length)) * 7.4 + 24)),
  );
  return (
    <View style={[styles.tableWrap, { marginTop: gap, borderColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View>
          {rows.map((r, ri) => (
            <View
              key={ri}
              style={{
                flexDirection: "row",
                backgroundColor: ri === 0 ? colors.primarySoft : ri % 2 === 0 ? colors.background : "transparent",
              }}
            >
              {widths.map((w, ci) => (
                <Text
                  key={ci}
                  style={[
                    styles.cell,
                    {
                      width: w,
                      color: ri === 0 ? colors.primaryText : colors.text,
                      fontWeight: ri === 0 ? "800" : "500",
                      borderTopWidth: ri ? StyleSheet.hairlineWidth : 0,
                      borderTopColor: colors.border,
                    },
                  ]}
                >
                  {String(r[ci] ?? "").replace(/\*\*/g, "")}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

// Thẻ file do AI tạo (Word / Excel / ...) – bấm "Tải về" để tạo và chia sẻ
const FileCard = memo(function FileCard({ file, colors, ctx }) {
  const t = FILE_TYPES[file.fmt] || FILE_TYPES.txt;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const lines = file.body.split("\n").filter((l) => l.trim()).length;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const f = await createFile({ ...ctx, format: file.fmt, title: file.name, content: file.body });
      setBusy(false);
      await shareFile(f);
    } catch (e) {
      setBusy(false);
      Alert.alert("Không tạo được file", e?.message || "Bạn thử lại nhé.");
    }
  };

  return (
    <View style={[styles.fileBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => setOpen((v) => !v)} style={styles.fileBoxTop}>
        <View style={[styles.fileTile, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={t.icon} size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.fileBoxName, { color: colors.text }]}>
            {file.name}.{t.ext}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {t.label} · {lines} dòng · {open ? "Thu gọn" : "Xem trước"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={run}
          disabled={busy}
          activeOpacity={0.85}
          style={[styles.fileDl, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Tải file ${t.label}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.fileDlText}>Tải về</Text>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
      {open && (
        <View style={[styles.filePreview, { borderTopColor: colors.border }]}>
          <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <RichText content={file.body} colors={colors} />
          </ScrollView>
        </View>
      )}
    </View>
  );
});

const balance = (s) => {
  if ((s.match(/```/g) || []).length % 2) return s + "\n```";
  if ((s.match(/\*\*/g) || []).length % 2) return s + "**";
  return s;
};

// Nội dung câu trả lời của AI: chữ "gõ ra" dần (như Claude / ChatGPT) + thẻ file
const AssistantBody = memo(function AssistantBody({ content, fresh, colors, ctx, onDone }) {
  const parsed = useMemo(() => parseReply(content), [content]);
  const total = useMemo(
    () => parsed.segments.reduce((n, s) => n + (s.type === "text" ? s.text.length : 0), 0),
    [parsed],
  );
  const [n, setN] = useState(fresh ? 0 : total);
  const doneRef = useRef(!fresh);

  useEffect(() => {
    if (!fresh) return undefined;
    if (n >= total) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
      return undefined;
    }
    const step = Math.max(3, Math.ceil(total / 70)); // dài mấy cũng gõ xong trong ~1.5s
    const id = setTimeout(() => setN((v) => Math.min(total, v + step)), 22);
    return () => clearTimeout(id);
  }, [n, total, fresh]); // eslint-disable-line react-hooks/exhaustive-deps

  let remaining = fresh ? n : total;
  const out = [];
  parsed.segments.forEach((s, i) => {
    if (s.type === "text") {
      const take = Math.max(0, remaining);
      remaining -= s.text.length;
      if (take > 0) out.push(<RichText key={i} content={take >= s.text.length ? s.text : balance(s.text.slice(0, take))} colors={colors} />);
    } else if (remaining >= 0) {
      out.push(<FileCard key={i} file={s} colors={colors} ctx={ctx} />);
    }
  });
  return (
    <View>
      {out.map((el, i) => (
        <View key={el.key} style={{ marginTop: i ? 10 : 0 }}>
          {el}
        </View>
      ))}
    </View>
  );
});

// 3 chấm nhấp nháy khi AI đang trả lời
const ThinkingDots = memo(function ThinkingDots({ color }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(300 - i * 150),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.thinkDot, { backgroundColor: color, opacity: d }]} />
      ))}
    </View>
  );
});

// ── Lịch sử: nhóm theo ngày ("HH:MM  DD/MM/YYYY" giờ VN từ server) ──
const parseUpdated = (str = "") => {
  const m = String(str).match(/(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]) : null;
};
const pad2 = (n) => String(n).padStart(2, "0");
const groupConvs = (list, query) => {
  const needle = query.trim().toLowerCase();
  const buckets = [["Hôm nay", []], ["Hôm qua", []], ["7 ngày qua", []], ["30 ngày qua", []], ["Cũ hơn", []]];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  list.forEach((c) => {
    if (needle && !(c.title || "").toLowerCase().includes(needle)) return;
    const d = parseUpdated(c.updated);
    const days = d ? Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000) : 999;
    const idx = days <= 0 ? 0 : days === 1 ? 1 : days <= 7 ? 2 : days <= 30 ? 3 : 4;
    const when = !d ? c.updated : days <= 1 ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
    buckets[idx][1].push({ ...c, when });
  });
  return buckets.filter(([, data]) => data.length).map(([title, data]) => ({ title, data }));
};

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
  origin, // { x, y } tâm nút AI nổi lúc bấm -> khung chat bung ra từ chính chỗ đó
  onMountedChange, // báo khung chat đang hiện (để ẩn nút AI nổi, tránh đè lên)
  appeal, // { id, kind, uri, text, status, expiresAt, containerType, maxVolume } | null — check-in bị từ chối đang chờ giải thích
  onAppealChange, // (appeal | null) => void — báo trạng thái mới (approved) hoặc null (bị từ chối / hết hạn)
  onAppealApproved, // (appeal) => void — user bấm nút sau khi AI duyệt (Dashboard mở bảng chọn ml / ghi nhận mục tiêu)
}) {
  const { colors } = useTheme();
  const avatar = useAiAvatar();
  const baseAvatarStyle = useAiAvatarStyle();
  // avatar trong khung chat nằm bên TRÁI -> lật để quay đầu về phía nội dung (xem AVATAR_NATIVE_FACING)
  const avatarStyle = useMemo(
    () => (AVATAR_NATIVE_FACING === "left" ? flipAvatarStyle(baseAvatarStyle) : baseAvatarStyle),
    [baseAvatarStyle],
  );
  const emptyImage = useAiEmptyImage();
  const { key: agentKey, name: agentName, content: agentText } = useAiAgent(); // agent đang chọn: tên hiển thị + key gửi lên backend để đổi tính cách
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
  const [histQuery, setHistQuery] = useState("");
  const [plusOpen, setPlusOpen] = useState(false); // bảng "+" (ảnh / tệp / tìm kiếm / suy nghĩ / model)
  const [copyMsg, setCopyMsg] = useState(null); // tin nhắn đang mở "sao chép thông minh"
  const [copyOpen, setCopyOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false); // khung camera check-in (dùng chung với màn hình chính)
  const { width: winW, height: winH } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  const atBottomRef = useRef(true);
  const [copiedId, setCopiedId] = useState(null); // hiện dấu ✓ sau khi bấm "Sao chép"
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [sendLabel, setSendLabel] = useState("Đang trả lời…");
  const convIdRef = useRef(null);
  convIdRef.current = convId;
  // ── Khiếu nại check-in bị từ chối ──
  const [inAppeal, setInAppeal] = useState(false); // cuộc trò chuyện hiện tại nối tiếp thông báo lỗi check-in
  const inAppealRef = useRef(false);
  inAppealRef.current = inAppeal;
  const appealRef = useRef(appeal);
  appealRef.current = appeal;
  const seededRef = useRef(null); // id khiếu nại đã được đưa vào khung chat
  const listRef = useRef(null);
  const idRef = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const nextId = () => `m${++idRef.current}`;
  const exportCtx = useMemo(() => ({ apiBase, token, authFetch }), [apiBase, token, authFetch]);
  const markDone = useCallback(
    (id) => setMessages((prev) => prev.map((m) => (m.id === id && m.fresh ? { ...m, fresh: false } : m))),
    [],
  );

  // Nhớ lựa chọn model / tìm kiếm / suy nghĩ giữa các lần mở app
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw);
        setPrefs({
          model: CHAT_MODELS.some((m) => m.key === p?.model) ? p.model : "fast",
          thinking: !!p?.thinking,
          webSearch: !!p?.webSearch,
        });
      })
      .catch(() => {});
  }, []);

  const updatePrefs = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    if (visible) scrollToEnd();
  }, [visible, scrollToEnd]);

  // Có check-in bị từ chối đang chờ -> chat mở ra NỐI TIẾP câu thông báo của AI (kèm ảnh vừa chụp).
  // Ảnh gốc nằm tạm trên server nên các lượt sau KHÔNG gửi lại ảnh, chỉ gửi lời giải thích.
  useEffect(() => {
    if (!visible || !appeal || seededRef.current === appeal.id || sending) return;
    seededRef.current = appeal.id;
    setInAppeal(true);
    setConvId(null);
    setPending([]);
    setInput("");
    setPanel(null);
    setMessages([
      {
        id: nextId(),
        role: "assistant",
        content: appeal.text || "Em chưa nhận ra ảnh check-in này, kể em nghe được khom nè?",
        files: appeal.uri ? [{ name: "anh-check-in.jpg", uri: appeal.uri }] : [],
        note:
          appeal.status === "approved"
            ? "✅ Em đã duyệt roi đó, bấm nút chọn ml dưới để check bù nhé."
            : "💛 Lý do gì nè, kể em nghe.",
        appealCard: appeal.status === "approved",
        appealId: appeal.id,
      },
    ]);
    atBottomRef.current = true;
    scrollToEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, appeal?.id]);

// ── Hiệu ứng mở / đóng ─────────────────────────────────────────────────────
  //  Bấm nút nổi -> khung chat "bung" ra từ ĐÚNG vị trí nút (spring nhẹ, bo góc tròn -> vuông),
  //  nội dung hiện sau một nhịp để chữ không bị méo khi đang phóng to. Đóng -> co ngược về nút.
  //  Nút nổi tự ẩn khi chat đang mở (onMountedChange) nên không còn đè lên Lịch sử / Ghi nhớ.
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);
  mountedRef.current = mounted;
  const progress = useRef(new Animated.Value(0)).current; // 0 = thu vào nút, 1 = mở hết
  const radius = useRef(new Animated.Value(0)).current; // bo góc (JS driver)
  const swipeX = useRef(new Animated.Value(0)).current; // kéo từ mép trái để quay lại
  // Các phép nội suy chỉ tạo MỘT LẦN (không tạo lại mỗi lần render -> hết nhấp nháy khi component render lại giữa lúc đang mở).
  // Dùng extrapolate "clamp" vì spring có thể vọt quá 1 một chút: không clamp thì opacity > 1 / vị trí lệch -> chớp.
  const anim = useMemo(
    () => ({
      wrapOpacity: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
      wrapScale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] }), // cho phép vọt nhẹ quá 1 -> hiệu ứng nảy
      bodyOpacity: progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1], extrapolate: "clamp" }),
      headerY: progress.interpolate({ inputRange: [0, 0.4, 0.9], outputRange: [-18, -18, 0], extrapolate: "clamp" }),
      composerY: progress.interpolate({ inputRange: [0, 0.5, 0.95], outputRange: [28, 28, 0], extrapolate: "clamp" }),
      radius: radius.interpolate({ inputRange: [0, 1], outputRange: [120, 0], extrapolate: "clamp" }),
    }),
    [progress, radius],
  );
  const [opening, setOpening] = useState(false); // đang chạy hiệu ứng mở/đóng -> gộp cả khung thành 1 texture để không chớp
  const ox = origin?.x ?? winW - 40;
  const oy = origin?.y ?? winH - 160;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => onMountedChange?.(true)); // Dashboard render lại nặng: để sau khung hình đầu cho animation chạy trước
      swipeX.setValue(0);
      progress.setValue(0);
      radius.setValue(0);
      setOpening(true);
      Animated.parallel([
        Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 190, mass: 0.95 }),
        Animated.timing(radius, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start(() => setOpening(false));
    } else if (mountedRef.current) {
      setOpening(true);
      Animated.parallel([
        Animated.timing(progress, { toValue: 0, duration: 230, easing: Easing.bezier(0.4, 0, 0.9, 0.4), useNativeDriver: true }),
        Animated.timing(radius, { toValue: 0, duration: 230, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
      ]).start(({ finished }) => {
        setOpening(false);
        if (finished) {
          setMounted(false);
          swipeX.setValue(0);
          onMountedChange?.(false);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => () => onMountedChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Quay lại" theo từng lớp: bảng "+" -> sao chép thông minh -> Lịch sử/Ghi nhớ -> đóng chat.
  // Dùng chung cho nút Back Android, vuốt từ mép trái (iPhone) và nút ‹.
  const layerOpen = camOpen || plusOpen || copyOpen || !!panel;
  const goBack = useCallback(() => {
    if (camOpen) setCamOpen(false);
    else if (plusOpen) setPlusOpen(false);
    else if (copyOpen) setCopyOpen(false);
    else if (panel) setPanel(null);
    else onClose?.();
  }, [camOpen, plusOpen, copyOpen, panel, onClose]);
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const layerOpenRef = useRef(layerOpen);
  layerOpenRef.current = layerOpen;
  const winWRef = useRef(winW);
  winWRef.current = winW;

  const edgePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dx > 6 && Math.abs(g.dy) < g.dx,
      onPanResponderMove: (_, g) => swipeX.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        const commit = g.dx > 80 || g.vx > 0.55;
        if (!commit) {
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 260 }).start();
        } else if (layerOpenRef.current) {
          Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 260 }).start();
          goBackRef.current();
        } else {
          Animated.timing(swipeX, { toValue: winWRef.current, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() =>
            goBackRef.current(),
          );
        }
      },
      onPanResponderTerminate: () =>
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start(),
    }),
  ).current;

  // Nút Back của Android
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  // Đóng các bảng phụ khi đóng khung chat
  useEffect(() => {
    if (!visible) {
      setPanel(null);
      setPlusOpen(false);
      setCopyOpen(false);
      setCamOpen(false);
    }
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
    setHistQuery("");
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
        setInAppeal(false);
        seededRef.current = null;
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
    Alert.alert("Quên tất cả?", `${agentName} sẽ không còn nhớ gì nữa!.`, [
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

  // Chọn ảnh từ thư viện (tối đa số chỗ còn trống)
  const pickFromLibrary = useCallback(async () => {
    if (sending) return;
    const room = MAX_FILES - pending.length;
    if (room <= 0) {
      Alert.alert("Đã đủ tệp", `Mỗi lượt chỉ đính kèm tối đa ${MAX_FILES} tệp.`);
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: room,
        quality: 0.8, // nén nhẹ để không vượt 5MB / ảnh
        exif: false,
      });
      if (res.canceled) return;
      const stamp = Date.now();
      const accepted = (res.assets || []).slice(0, room).map((a, i) => ({
        name: a.fileName || `anh-${stamp}-${i + 1}.jpg`,
        mime: a.mimeType && a.mimeType.startsWith("image/") ? a.mimeType : "image/jpeg",
        size: a.fileSize || 0,
        uri: a.uri,
      }));
      if (accepted.length) setPending((p) => [...p, ...accepted]);
    } catch (e) {
      Alert.alert("Không mở được thư viện ảnh", e?.message || "Bạn kiểm tra quyền truy cập ảnh rồi thử lại nhé.");
    }
  }, [sending, pending.length]);

  // Mở khung camera check-in (cùng giao diện với màn hình chính, nhưng to hơn) rồi đính kèm ảnh vừa chụp
  const takePhoto = useCallback(async () => {
    if (sending) return;
    if (MAX_FILES - pending.length <= 0) {
      Alert.alert("Đã đủ tệp", `Mỗi lượt chỉ đính kèm tối đa ${MAX_FILES} tệp.`);
      return;
    }
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Cần quyền Camera", `Bạn cho phép ứng dụng dùng camera trong Cài đặt để chụp ảnh gửi cho ${agentName} nhé.`);
        return;
      }
      Keyboard.dismiss();
      setCamOpen(true);
    } catch (e) {
      Alert.alert("Không mở được camera", e?.message || "Bạn kiểm tra quyền camera rồi thử lại nhé.");
    }
  }, [sending, pending.length]);

  const handleCamPicture = useCallback((uri) => {
    setCamOpen(false);
    if (!uri) return;
    setPending((p) =>
      p.length >= MAX_FILES ? p : [...p, { name: `chup-${Date.now()}.jpg`, mime: "image/jpeg", size: 0, uri }],
    );
  }, []);
  const handleCamClose = useCallback(() => setCamOpen(false), []);

  // Sao chép nhanh toàn bộ câu trả lời
  const quickCopy = useCallback(async (item) => {
    const ok = await copyText(replyText(item.content));
    if (!ok) return;
    setCopiedId(item.id);
    setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1500);
  }, []);

  // ── Gửi ───────────────────────────────────────────────────────────────────
  const send = useCallback(async (override) => {
    const fromChip = typeof override === "string";
    const text = (fromChip ? override : input).trim();
    if ((!text && pending.length === 0) || sending) return;

    setSending(true);
    setSendLabel(
      prefs.webSearch ? "Đang tìm kiếm…" : prefs.thinking ? "Đang suy nghĩ…" : "Đang trả lời…",
    );
    try {
      // Đọc tệp -> base64 (giữ trong tin nhắn để các câu hỏi tiếp theo vẫn "nhớ" tệp)
      const files = [];
      for (const f of pending) {
        const data = await new ExpoFile(f.uri).base64();
        if (data.length * 0.75 > MAX_FILE_BYTES) {
          throw new Error(`"${f.name}" vượt quá 5MB, bạn chọn tệp nhỏ hơn nhé.`);
        }
        files.push({ name: f.name, mime: f.mime, data, uri: f.mime.startsWith("image/") ? f.uri : undefined });
      }

      const userMsg = {
        id: nextId(),
        role: "user",
        content: text.slice(0, MAX_INPUT),
        files,
      };
      const history = [...messagesRef.current, userMsg];
      setMessages(history);
      if (!fromChip) setInput("");
      setPending([]);
      atBottomRef.current = true;
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
        body: JSON.stringify({
          messages: payload,
          conversation_id: convIdRef.current,
          model: prefs.model,
          thinking: prefs.thinking,
          web_search: prefs.webSearch,
          agent: agentKey, // backend đổi tên + tính cách AI theo agent
          agent_name: agentName, // dự phòng: backend khớp theo tên nếu key không trùng
          // đang giải thích cho check-in bị từ chối -> server tự đính kèm lại ảnh tạm cho AI xem
          appeal_id: inAppealRef.current && appealRef.current?.status === "open" ? appealRef.current.id : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 410 && inAppealRef.current) onAppealChange?.(null); // ảnh tạm đã hết hạn / khiếu nại đã đóng
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
      // Quyết định của AI về khiếu nại: duyệt -> hiện nút chọn ml / xác nhận; từ chối -> đóng khiếu nại
      const ap = data.appeal && appealRef.current && data.appeal.id === appealRef.current.id ? data.appeal : null;
      if (ap) {
        if (ap.status === "rejected") onAppealChange?.(null);
        else
          onAppealChange?.({
            ...appealRef.current,
            status: ap.status,
            goodwill: !!ap.goodwill,
            containerType: ap.container_type || appealRef.current.containerType,
            maxVolume: ap.max_volume || appealRef.current.maxVolume,
            expiresAt: Date.now() + Math.max(0, (ap.expires_in || 0) - 20) * 1000,
          });
      }
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: data.reply,
          note,
          fresh: true,
          appealCard: ap?.status === "approved",
          appealId: ap?.id,
        },
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
  }, [input, pending, sending, prefs, authFetch, apiBase, token, scrollToEnd, onAppealChange, agentKey]);

  // Bắt đầu cuộc trò chuyện mới (cuộc cũ vẫn nằm trong Lịch sử)
  const newChat = useCallback(() => {
    if (sending) return;
    setMessages([]);
    setPending([]);
    setConvId(null);
    setInAppeal(false);
    seededRef.current = null; // mở lại chat vẫn có thể quay về khiếu nại còn hạn
    setPanel(null);
  }, [sending]);

  // Đổi AI-agent trong Hồ sơ -> khởi tạo chat MỚI (cuộc cũ vẫn nằm trong Lịch sử), không nối tiếp đoạn chat của agent trước
  const prevAgentRef = useRef(agentKey);
  useEffect(() => {
    if (prevAgentRef.current === agentKey) return;
    prevAgentRef.current = agentKey;
    setMessages([]);
    setPending([]);
    setInput("");
    setConvId(null);
    setInAppeal(false);
    seededRef.current = null;
    setPanel(null);
  }, [agentKey]);

  const renderItem = useCallback(
    ({ item, index }) => {
      const mine = item.role === "user";
      const canCopy = !mine && !item.isError && !!item.content && !item.fresh;
      const copied = copiedId === item.id;
      const prev = messages[index - 1];
      const next = messages[index + 1];
      const firstOfGroup = !prev || prev.role !== item.role;
      const lastOfGroup = !next || next.role !== item.role;
      const nextQs =
        !mine && !item.isError && !item.fresh && index === messages.length - 1 && !sending && item.content
          ? parseReply(item.content).next
          : [];
      return (
        <View
          style={[
            styles.msgRow,
            mine ? styles.rowMine : styles.rowAi,
            { marginBottom: lastOfGroup ? 14 : 4 },
          ]}
        >
          {!mine &&
            (lastOfGroup ? (
              <Image source={avatar} fadeDuration={0} resizeMethod="scale" style={[styles.msgAvatar, avatarStyle]} />
            ) : (
              <View style={styles.msgAvatarSpacer} />
            ))}
          <View style={[styles.msgCol, { alignItems: mine ? "flex-end" : "flex-start", maxWidth: mine ? "82%" : "92%" }]}>
            <View
              style={[
                styles.bubble,
                { maxWidth: "100%" },
                mine
                  ? [
                      { backgroundColor: colors.primary },
                      lastOfGroup && { borderBottomRightRadius: 6 },
                      !firstOfGroup && { borderTopRightRadius: 6 },
                    ]
                  : [
                      {
                        backgroundColor: item.isError ? "rgba(239,68,68,0.12)" : colors.card,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: item.isError ? "rgba(239,68,68,0.4)" : colors.border,
                      },
                      lastOfGroup && { borderBottomLeftRadius: 6 },
                      !firstOfGroup && { borderTopLeftRadius: 6 },
                    ],
              ]}
            >
              {item.isError && (
                <View style={styles.errHead}>
                  <Ionicons name="alert-circle" size={15} color="#ef4444" />
                  <Text style={styles.errHeadText}>Chưa gửi được</Text>
                </View>
              )}
              {!!item.files?.length && (
                <View style={styles.msgFiles}>
                  {item.files.map((f, i) =>
                    f.uri ? (
                      <Image key={`${f.name}-${i}`} source={{ uri: f.uri }} style={styles.msgImg} />
                    ) : (
                      <View
                        key={`${f.name}-${i}`}
                        style={[
                          styles.fileCard,
                          { backgroundColor: mine ? "rgba(255,255,255,0.2)" : colors.primarySoft },
                        ]}
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={18}
                          color={mine ? "#ffffff" : colors.primary}
                        />
                        <Text
                          numberOfLines={1}
                          style={[styles.fileCardText, { color: mine ? "#ffffff" : colors.text }]}
                        >
                          {f.name}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              )}
              {!!item.content &&
                (mine || item.isError ? (
                  <Text
                    selectable
                    style={[
                      styles.bubbleText,
                      { color: mine ? "#ffffff" : item.isError ? "#ef4444" : colors.text },
                    ]}
                  >
                    {item.content}
                  </Text>
                ) : (
                  <AssistantBody
                    content={item.content}
                    fresh={!!item.fresh}
                    colors={colors}
                    ctx={exportCtx}
                    onDone={() => markDone(item.id)}
                  />
                ))}
              {!!item.note && (
                <View style={[styles.noteBox, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.noteText, { color: colors.primaryText }]}>{item.note}</Text>
                </View>
              )}
            </View>

            {!mine && item.appealCard && !item.fresh && appeal?.status === "approved" && appeal.id === item.appealId && appeal.goodwill && (
              <View style={[styles.noteBox, { backgroundColor: colors.primarySoft, alignSelf: "flex-start" }]}>
                <Text style={[styles.noteText, { color: colors.primaryText }]}>
                  🎁 Cơ hội đặc biệt hôm nay{appeal.kind === "water" && appeal.maxVolume ? ` · tối đa ${appeal.maxVolume} ml` : ""}
                </Text>
              </View>
            )}
            {!mine && item.appealCard && !item.fresh && appeal?.status === "approved" && appeal.id === item.appealId && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onAppealApproved?.(appeal)}
                style={[styles.appealBtn, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={appeal.kind === "water" ? "Chọn lượng nước và gửi bù" : "Xác nhận hoàn thành mục tiêu"}
              >
                <Ionicons name={appeal.kind === "water" ? "water" : "checkmark-circle"} size={18} color="#ffffff" />
                <Text style={styles.appealBtnText}>
                  {appeal.kind === "water" ? "Chọn lượng nước & gửi bù" : "Xác nhận hoàn thành mục tiêu"}
                </Text>
              </TouchableOpacity>
            )}

            {canCopy && lastOfGroup && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={() => quickCopy(item)}
                  hitSlop={8}
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Sao chép câu trả lời"
                >
                  <Ionicons
                    name={copied ? "checkmark" : "copy-outline"}
                    size={15}
                    color={copied ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.actionText, { color: copied ? colors.primary : colors.textMuted }]}>
                    {copied ? "Đã chép" : "Sao chép"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setCopyMsg(item);
                    setCopyOpen(true);
                  }}
                  hitSlop={8}
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Sao chép thông minh"
                >
                  <Ionicons name="sparkles-outline" size={15} color={colors.textMuted} />
                  <Text style={[styles.actionText, { color: colors.textMuted }]}>Thông minh</Text>
                </TouchableOpacity>
              </View>
            )}
            {nextQs.length > 0 && (
              <View style={styles.nextWrap}>
                {nextQs.map((q) => (
                  <TouchableOpacity
                    key={q}
                    activeOpacity={0.8}
                    onPress={() => send(q)}
                    style={[styles.nextChip, { backgroundColor: colors.card, borderColor: colors.primaryBorder }]}
                  >
                    <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.primary} />
                    <Text numberOfLines={2} style={[styles.nextText, { color: colors.text }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      );
    },
    [colors, avatar, avatarStyle, copiedId, quickCopy, messages, sending, send, exportCtx, markDone, appeal, onAppealApproved],
  );

  const empty = (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyGlow, { backgroundColor: colors.primarySoft }]}>
        <Image source={emptyImage.source} fadeDuration={0} resizeMethod="scale" style={[styles.emptyAvatar, emptyImage.style]} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{agentText.emptyTitle}</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        {agentText.emptySub}
      </Text>
      <View style={styles.sugGrid}>
        {agentText.suggestions.map((s) => (
          <TouchableOpacity
            key={s.text}
            style={[styles.sugCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setInput(s.text)}
            activeOpacity={0.8}
          >
            <View style={[styles.sugIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name={s.icon} size={18} color={colors.primary} />
            </View>
            <Text numberOfLines={3} style={[styles.sugText, { color: colors.text }]}>
              {s.text}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const canSend = (!!input.trim() || pending.length > 0) && !sending;
  const attachFull = pending.length >= MAX_FILES;
  const sections = useMemo(() => groupConvs(convs, histQuery), [convs, histQuery]);

  if (!mounted) return null;

  return (
    <View style={styles.host}>
      <Animated.View
        renderToHardwareTextureAndroid={opening}
        style={[
          styles.fill,
          {
            opacity: anim.wrapOpacity,
            transform: [
              { translateX: swipeX },
              { scale: anim.wrapScale },
            ],
            transformOrigin: [ox, oy, 0],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              overflow: "hidden",
              backgroundColor: colors.background,
              borderRadius: anim.radius,
            },
          ]}
        >
      <Animated.View
        style={{ flex: 1, opacity: anim.bodyOpacity }}
      >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            { transform: [{ translateY: anim.headerY }] },
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
          <Image source={avatar} fadeDuration={0} resizeMethod="scale" style={[styles.headerAvatar, avatarStyle]} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>{agentName}</Text>
            <Text numberOfLines={1} style={[styles.headerSub, { color: colors.textMuted }]}>
              {sending
                ? sendLabel
                : inAppeal && appeal?.status === "open"
                  ? "Đang xem lại ảnh check-in"
                  : "Hỏi đáp · Học tập · Tạo nội dung"}
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
        </Animated.View>

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
          onContentSizeChange={() => atBottomRef.current && scrollToEnd()}
          onScroll={(e) => {
            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            atBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 140;
          }}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            sending ? (
              <View style={[styles.msgRow, styles.rowAi]}>
                <Image source={avatar} fadeDuration={0} resizeMethod="scale" style={[styles.msgAvatar, avatarStyle]} />
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: colors.card,
                      borderBottomLeftRadius: 6,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <ThinkingDots color={colors.primary} />
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginLeft: 10 }}>{sendLabel}</Text>
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        {/* Ô soạn tin: thẻ bo tròn, ô nhập ở trên – hàng công cụ ở dưới, giãn cách thoáng */}
        <Animated.View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10), transform: [{ translateY: anim.composerY }] }]}>
          <View
            style={[
              styles.composer,
              {
                backgroundColor: colors.card,
                borderColor: focused ? colors.primaryBorder : colors.border,
              },
            ]}
          >
            {pending.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.pendingScroll}
              >
                {pending.map((f, i) => {
                  const isImg = f.mime?.startsWith("image/");
                  return (
                    <View key={`${f.name}-${i}`} style={styles.pendingItem}>
                      {isImg ? (
                        <Image source={{ uri: f.uri }} style={[styles.pendingImg, { borderColor: colors.border }]} />
                      ) : (
                        <View
                          style={[
                            styles.pendingFile,
                            { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
                          ]}
                        >
                          <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                          <Text numberOfLines={2} style={[styles.pendingFileText, { color: colors.primary }]}>
                            {f.name}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => removePending(i)}
                        hitSlop={8}
                        style={styles.pendingX}
                        accessibilityRole="button"
                        accessibilityLabel="Bỏ tệp"
                      >
                        <Ionicons name="close" size={13} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={input}
              onChangeText={setInput}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={inAppeal && appeal?.status === "open" ? agentText.appealPlaceholder : agentText.placeholder}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_INPUT}
              editable={!sending}
            />

            <View style={styles.composerBar}>
              <TouchableOpacity
                onPress={() => setPlusOpen(true)}
                disabled={sending}
                hitSlop={6}
                activeOpacity={0.7}
                style={[styles.toolBtn, { backgroundColor: colors.primarySoft }]}
                accessibilityRole="button"
                accessibilityLabel="Thêm tệp và công cụ"
              >
                <Ionicons name="add" size={22} color={sending ? colors.border : colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={pickFromLibrary}
                disabled={sending || attachFull}
                hitSlop={6}
                activeOpacity={0.7}
                style={[styles.toolBtn, { backgroundColor: colors.primarySoft }]}
                accessibilityRole="button"
                accessibilityLabel="Thêm ảnh từ thư viện"
              >
                <Ionicons name="image-outline" size={20} color={sending || attachFull ? colors.border : colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={takePhoto}
                disabled={sending || attachFull}
                hitSlop={6}
                activeOpacity={0.7}
                style={[styles.toolBtn, { backgroundColor: colors.primarySoft }]}
                accessibilityRole="button"
                accessibilityLabel="Chụp ảnh gửi AI"
              >
                <Ionicons name="camera-outline" size={21} color={sending || attachFull ? colors.border : colors.primary} />
              </TouchableOpacity>

              {/* chế độ đang bật: nằm gọn cùng hàng, chạm để tắt */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
                contentContainerStyle={styles.modeRow}
              >
                {prefs.webSearch && (
                  <ModeChip icon="globe-outline" label="Web" colors={colors} onClear={() => updatePrefs({ webSearch: false })} />
                )}
                {prefs.thinking && (
                  <ModeChip icon="bulb-outline" label="Suy nghĩ sâu" colors={colors} onClear={() => updatePrefs({ thinking: false })} />
                )}
                {prefs.model !== "fast" && (
                  <ModeChip
                    icon={CHAT_MODELS.find((m) => m.key === prefs.model)?.icon || "options-outline"}
                    label={CHAT_MODELS.find((m) => m.key === prefs.model)?.label || ""}
                    colors={colors}
                    onClear={() => updatePrefs({ model: "fast" })}
                  />
                )}
              </ScrollView>

              <TouchableOpacity
                onPress={() => send()}
                disabled={!canSend}
                activeOpacity={0.8}
                style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Gửi"
              >
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={20} color="#ffffff" />}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        <ChatPlusSheet
          visible={plusOpen}
          prefs={prefs}
          onChangePrefs={updatePrefs}
          attachFull={pending.length >= MAX_FILES}
          onClose={() => setPlusOpen(false)}
          onPickFile={() => {
            setPlusOpen(false);
            setTimeout(pickFiles, 280); // chờ bảng trượt xuống rồi mới mở chọn tệp (iOS)
          }}
        />
        <SmartCopySheet
          visible={copyOpen}
          text={copyMsg?.content || ""}
          onClose={() => setCopyOpen(false)}
          onRewrite={(p) => send(p)}
          apiBase={apiBase}
          token={token}
          authFetch={authFetch}
        />

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
                {panel === "history" ? "Lịch sử chat" : agentText.memoryTitle}
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
              <View style={{ flex: 1 }}>
                <View style={styles.histTop}>
                  <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="search" size={18} color={colors.textMuted} />
                    <TextInput
                      value={histQuery}
                      onChangeText={setHistQuery}
                      placeholder="Tìm cuộc trò chuyện…"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.searchInput, { color: colors.text }]}
                      returnKeyType="search"
                      autoCorrect={false}
                    />
                    {!!histQuery && (
                      <TouchableOpacity onPress={() => setHistQuery("")} hitSlop={8} accessibilityLabel="Xoá tìm kiếm">
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={newChat}
                    disabled={sending}
                    style={[styles.newChatBtn, { backgroundColor: colors.primary }]}
                    accessibilityRole="button"
                    accessibilityLabel="Cuộc trò chuyện mới"
                  >
                    <Ionicons name="add" size={20} color="#ffffff" />
                    <Text style={styles.newChatText}>Mới</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.retainNote, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
                  <Text style={[styles.retainText, { color: colors.primaryText }]}>
                    Lịch sử chỉ được giữ 2 ngày, sau đó tự động xoá. Phần "Ghi nhớ" vẫn được giữ lại.
                  </Text>
                </View>
                <SectionList
                  sections={sections}
                  keyExtractor={(c) => String(c.id)}
                  stickySectionHeadersEnabled={false}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.panelList}
                  ListEmptyComponent={
                    <View style={styles.histEmpty}>
                      <View style={[styles.histEmptyIcon, { backgroundColor: colors.primarySoft }]}>
                        <Ionicons
                          name={histQuery ? "search-outline" : "chatbubbles-outline"}
                          size={30}
                          color={colors.primary}
                        />
                      </View>
                      <Text style={[styles.histEmptyTitle, { color: colors.text }]}>
                        {histQuery ? "Không thấy kết quả" : "Chưa có cuộc trò chuyện nào"}
                      </Text>
                      <Text style={[styles.panelEmpty, { color: colors.textMuted, marginTop: 4 }]}>
                        {histQuery
                          ? "Thử từ khoá khác nhé."
                          : agentText.historyEmpty}
                      </Text>
                    </View>
                  }
                  renderSectionHeader={({ section }) => (
                    <View style={styles.sectionHead}>
                      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
                      <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{section.data.length}</Text>
                    </View>
                  )}
                  renderItem={({ item: c }) => {
                    const active = c.id === convId;
                    return (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => openConv(c.id)}
                        style={[
                          styles.convCard,
                          {
                            backgroundColor: active ? colors.primarySoft : colors.card,
                            borderColor: active ? colors.primaryBorder : colors.border,
                          },
                        ]}
                      >
                        <View style={[styles.convIcon, { backgroundColor: active ? colors.card : colors.primarySoft }]}>
                          <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={2} style={[styles.convTitle, { color: colors.text }]}>
                            {c.title}
                          </Text>
                          <View style={styles.convMetaRow}>
                            <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                            <Text style={[styles.convMeta, { color: colors.textMuted }]}>{c.when}</Text>
                            {active && (
                              <View style={[styles.activePill, { backgroundColor: colors.primary }]}>
                                <Text style={styles.activePillText}>Đang mở</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => deleteConv(c)}
                          hitSlop={10}
                          style={styles.convDel}
                          accessibilityRole="button"
                          accessibilityLabel="Xoá cuộc trò chuyện"
                        >
                          <Ionicons name="trash-outline" size={19} color={colors.textMuted} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            ) : (
              <FlatList
                data={memories}
                keyExtractor={(m) => String(m.id)}
                contentContainerStyle={styles.panelList}
                ListHeaderComponent={
                  <Text style={[styles.panelHint, { color: colors.textMuted }]}>
                    {agentText.memoryHint}
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
      {camOpen && (
        <CameraOverlay
          large
          colors={colors}
          title={`Chụp ảnh gửi ${agentName}`}
          subtitle={
            inAppeal && appeal?.status === "open"
              ? agentText.cameraHintAppeal
              : agentText.cameraHint
          }
          hint="Vuốt lên / xuống để zoom"
          frameWidth={Math.round(Math.min(340, winW * 0.84, winH * 0.44))}
          quality={0.7}
          skipProcessing={false}
          onPicture={handleCamPicture}
          onClose={handleCamClose}
        />
      )}
      </Animated.View>
      {/* vuốt từ mép trái (kiểu iPhone) để quay lại */}
      <View
        {...edgePan.panHandlers}
        style={[styles.edgeStrip, { top: insets.top + 56 }]}
        pointerEvents="box-only"
      />
        </Animated.View>
      </Animated.View>
    </View>
  );
});

export default AIChatModal;

const styles = StyleSheet.create({
  composerWrap: { paddingHorizontal: 12, paddingTop: 8 },
  composer: { borderWidth: 1, borderRadius: 26, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  composerBar: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  toolBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", marginRight: 10 },
  modeRow: { alignItems: "center", paddingRight: 8 },
  pendingScroll: { marginBottom: 8, marginTop: 2 },
  edgeStrip: { position: "absolute", left: 0, bottom: 0, width: 18, zIndex: 30 },
  codeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  cell: { paddingHorizontal: 11, paddingVertical: 8, fontSize: 13, lineHeight: 18 },
  fileBox: { borderWidth: 1, borderRadius: 16, overflow: "hidden", minWidth: 250 },
  fileBoxTop: { flexDirection: "row", alignItems: "center", padding: 10 },
  fileTile: { width: 42, height: 42, borderRadius: 13, justifyContent: "center", alignItems: "center", marginRight: 10 },
  fileBoxName: { fontSize: 14, fontWeight: "800" },
  fileDl: { flexDirection: "row", alignItems: "center", height: 34, borderRadius: 17, paddingHorizontal: 12, marginLeft: 8, minWidth: 34, justifyContent: "center" },
  fileDlText: { color: "#fff", fontSize: 12.5, fontWeight: "800", marginLeft: 4 },
  filePreview: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
  appealBtn: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: 8, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 16 },
  appealBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "800", marginLeft: 7 },
  nextWrap: { marginTop: 8, gap: 8, alignItems: "flex-start" },
  nextChip: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, maxWidth: "100%" },
  nextText: { fontSize: 13.5, fontWeight: "600", marginLeft: 6, flexShrink: 1 },
  host: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 990, elevation: 28 },
  fill: { flex: 1 },
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
  msgAvatarSpacer: { width: 36 },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  inlineCode: { fontFamily: MONO, fontSize: 13.5 },
  codeBlock: { borderWidth: 1, borderRadius: 12, padding: 10 },
  codeText: { fontFamily: MONO, fontSize: 12.5, lineHeight: 18 },
  liRow: { flexDirection: "row", alignItems: "flex-start" },
  liMark: { width: 20, fontWeight: "800" },
  quote: { borderLeftWidth: 3, paddingLeft: 10 },
  thinkDot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 2.5 },
  errHead: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  errHeadText: { color: "#ef4444", fontSize: 12.5, fontWeight: "800", marginLeft: 5 },
  msgFiles: { marginBottom: 6 },
  fileCard: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 4 },
  fileCardText: { fontSize: 13, fontWeight: "600", marginLeft: 8, flexShrink: 1 },
  noteBox: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 9, marginTop: 8 },
  fileTag: { fontSize: 12.5, fontWeight: "600", marginBottom: 4 },
  noteText: { fontSize: 12.5, fontWeight: "600" },
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
  emptyWrap: { alignItems: "center", paddingTop: 28, paddingHorizontal: 4 },
  emptyGlow: { width: 120, height: 120, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  emptyAvatar: { width: 92, height: 92, borderRadius: 28 },
  sugGrid: { marginTop: 22, width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  sugCard: { width: "48.5%", borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 10 },
  sugIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  sugText: { fontSize: 13.5, fontWeight: "600", lineHeight: 19 },
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
  pendingItem: { marginRight: 10, paddingTop: 6, paddingRight: 6 },
  pendingImg: { width: 64, height: 64, borderRadius: 14, borderWidth: 1 },
  pendingFile: { width: 120, height: 64, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, justifyContent: "center" },
  pendingFileText: { fontSize: 11.5, fontWeight: "600", marginTop: 3 },
  pendingX: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#475569",
    justifyContent: "center",
    alignItems: "center",
  },
  roundBtn: { width: 38, height: 42, borderRadius: 19, justifyContent: "center", alignItems: "center" },
  histTop: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12 },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 14.5, marginLeft: 8, paddingVertical: 0 },
  newChatBtn: { flexDirection: "row", alignItems: "center", height: 42, borderRadius: 16, paddingLeft: 10, paddingRight: 14, marginLeft: 10 },
  newChatText: { color: "#ffffff", fontSize: 14, fontWeight: "800", marginLeft: 2 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  sectionCount: { fontSize: 12, fontWeight: "700" },
  convCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 10 },
  convIcon: { width: 40, height: 40, borderRadius: 13, justifyContent: "center", alignItems: "center", marginRight: 12 },
  convTitle: { fontSize: 14.5, fontWeight: "700", lineHeight: 20 },
  convMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  convMeta: { fontSize: 12, marginLeft: 4 },
  convDel: { width: 34, height: 34, justifyContent: "center", alignItems: "center", marginLeft: 4 },
  activePill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  activePillText: { color: "#ffffff", fontSize: 10.5, fontWeight: "800" },
  retainNote: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 10, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  retainText: { flex: 1, fontSize: 12, fontWeight: "600", marginLeft: 6, lineHeight: 17 },
  histEmpty: { alignItems: "center", paddingTop: 56, paddingHorizontal: 24 },
  histEmptyIcon: { width: 68, height: 68, borderRadius: 22, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  histEmptyTitle: { fontSize: 16, fontWeight: "800" },
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
    maxHeight: 140,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingTop: Platform.OS === "ios" ? 8 : 6,
    paddingBottom: 6,
    fontSize: 16,
    lineHeight: 22,
  },
  msgCol: { maxWidth: "82%", flexShrink: 1 },
  msgImg: { width: 168, height: 168, borderRadius: 12, marginBottom: 6, backgroundColor: "rgba(0,0,0,0.08)" },
  actionRow: { flexDirection: "row", marginTop: 4, marginLeft: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 3, marginRight: 14 },
  actionText: { fontSize: 12, fontWeight: "600", marginLeft: 4 },
  pendingThumb: { width: 26, height: 26, borderRadius: 7, marginRight: 8 },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 9,
    marginRight: 8,
  },
  modeChipText: { fontSize: 12.5, fontWeight: "700", marginHorizontal: 5 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});