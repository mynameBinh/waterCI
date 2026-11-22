import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Camera } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
// fetch có hỗ trợ stream (SSE). Có sẵn trong expo, không cần cài thêm.
import { fetch as streamFetch } from "expo/fetch";
import {
  Component,
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  SectionList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Hình minh hoạ SVG do AI tự vẽ. Cài: npx expo install react-native-svg
import Svg, { G, Path, Rect, Text as SvgText, SvgXml } from "react-native-svg";
import { useAiAgent } from "../context/aiAgents";
import { useTheme } from "../context/ThemeContext";
import CameraOverlay from "./CameraOverlay";
import {
  copyText,
  createFile,
  FILE_TYPES,
  parseReply,
  replyText,
  shareFile,
} from "./chatFiles";
import ChatPlusSheet, { CHAT_MODELS } from "./ChatPlusSheet";
import ChoiceButtons from "./fileTools/ChoiceButtons";
import AgentActionCards from "./agent/AgentActionCards"; // >>> water_agent
import { INBOX_LABEL, isInboxUnread } from "./agent/AgentHomeCards";
import { applyFileMeta, extractChoices, extractFromAttrs, googleLinks, SERVER_FORMATS } from "./fileTools/exportMeta";
import FileCardV2 from "./fileTools/FileCardV2";
import { GoogleAccountSheet } from "./fileTools/GoogleAccountSection";
import GoogleDocCard from "./fileTools/GoogleDocCard";
import SmartCopySheet from "./SmartCopySheet";

const haptic = (kind = "light") => {
  try {
    if (kind === "success")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === "select") Haptics.selectionAsync();
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
};

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
  if (background)
    return { source: background, style: getAiBackgroundStyle(aiThemeKey) };
  return {
    source: getAiAvatar(aiThemeKey, accentKey),
    style: getAiAvatarStyle(aiThemeKey),
  };
};

// Các giới hạn này khớp với backend (chat_patch.py)
const MAX_SEND = 30; // CHAT_MAX_TURNS
const MAX_INPUT = 8000; // CHAT_MAX_CHARS
const MAX_FILES = 3; // CHAT_MAX_FILES
const MAX_FILE_BYTES = 5 * 1024 * 1024; // CHAT_MAX_FILE_BYTES

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_MIME = "application/vnd.ms-excel";
const PICK_TYPES = ["image/*", "application/pdf", "text/*", DOCX_MIME, XLSX_MIME, XLS_MIME];

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
      style={[
        styles.modeChip,
        {
          backgroundColor: colors.primarySoft,
          borderColor: colors.primaryBorder,
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={[styles.modeChipText, { color: colors.primary }]}>
        {label}
      </Text>
      <Ionicons name="close" size={14} color={colors.primary} />
    </TouchableOpacity>
  );
});

// ── Hiển thị markdown gọn (đậm, nghiêng, `code`, tiêu đề, gạch đầu dòng, khối code) ──
const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const splitCells = (l) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const HR = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const SRC = /^\s*\**Nguồn(?:\s+tham\s+khảo)?\**\s*:/i;
const indentLvl = (s) =>
  Math.min(2, Math.ceil(s.replace(/\t/g, "  ").length / 4)); // 2–4 khoảng trắng = cấp 1, 5+ = cấp 2

// Đọc 1 khối code mở ở dòng i. Trả { block, next } hoặc null nếu dòng i không mở khối code.
//  • Dòng đóng phải CHỈ gồm dấu fence (>= độ dài fence mở) -> fence lồng nhau / dòng "```js" bên trong code không đóng nhầm.
//  • ```code``` đóng ngay trên cùng 1 dòng -> khối 1 dòng (nếu còn chữ phía sau thì là đoạn văn + code nội tuyến); KHÔNG nuốt phần còn lại của tin nhắn.
//  • Thụt lề của dòng mở fence (vd code nằm trong mục danh sách) được bỏ khỏi các dòng code.
const readFence = (lines, i) => {
  const fm = lines[i].match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!fm) return null;
  const [, ind, fence, rest] = fm;
  const ch = fence[0];
  if (ch === "`") {
    const closeAt = rest.indexOf(fence);
    if (closeAt >= 0) {
      // còn chữ sau fence đóng -> đây là đoạn văn có code nội tuyến (Inline lo), không biến cả dòng thành khối code
      if (rest.slice(closeAt + fence.length).trim()) return null;
      return {
        block: { t: "code", text: rest.slice(0, closeAt).trim(), lang: "" },
        next: i + 1,
      };
    }
    if (rest.includes("`")) return null; // info string của fence ``` không chứa dấu ` -> đây là code nội tuyến
  }
  const lang = rest.trim().split(/\s+/)[0] || "";
  const closeRe = new RegExp(`^\\s*${ch}{${fence.length},}\\s*$`);
  const cutRe = ind.length ? new RegExp(`^ {0,${ind.length}}`) : null;
  const code = [];
  let j = i + 1;
  while (j < lines.length && !closeRe.test(lines[j])) {
    code.push(cutRe ? lines[j].replace(cutRe, "") : lines[j]);
    j++;
  }
  while (code.length && !code[code.length - 1].trim()) code.pop(); // bỏ dòng trống đầu / cuối khối
  while (code.length && !code[0].trim()) code.shift();
  return { block: { t: "code", text: code.join("\n"), lang }, next: j + 1 };
};

const parseBlocks = (src) => {
  const lines = String(src || "")
    .replace(/\r/g, "")
    .split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = readFence(lines, i);
    if (fence) {
      out.push(fence.block);
      i = fence.next;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      TABLE_SEP.test(lines[i + 1])
    ) {
      const rows = [splitCells(line)];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim())
        rows.push(splitCells(lines[i++]));
      out.push({ t: "table", rows });
      continue;
    }
    let m;
    if ((m = line.match(/^\s{0,3}(#{1,4})\s+(.*)$/)))
      out.push({ t: "h", text: m[2], lvl: m[1].length });
    else if (HR.test(line)) out.push({ t: "hr" });
    else if ((m = line.match(/^(\s*)[-*•]\s+(.*)$/))) {
      const lvl = indentLvl(m[1]);
      out.push({ t: "li", text: m[2], lvl, mark: lvl ? "◦" : "•" });
    } else if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/)))
      out.push({ t: "li", text: m[3], lvl: indentLvl(m[1]), mark: `${m[2]}.` });
    else if ((m = line.match(/^>\s?(.*)$/)))
      out.push({ t: "quote", text: m[1] });
    else if (SRC.test(line))
      out.push({ t: "src", text: line.trim().replace(/\*\*/g, "") });
    else out.push({ t: "p", text: line });
    i++;
  }
  return out;
};

const openLink = async (url) => {
  try {
    if (!/^https?:\/\//i.test(url)) return; // chỉ mở http/https
    await Linking.openURL(url);
  } catch {
    Alert.alert("Không mở được liên kết", url);
  }
};

// [chữ](https://...) | URL trần | **đậm** | `code` | *nghiêng*
const INLINE_SPLIT =
  /(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>)\]]+|\*\*[^*]+\*\*|`{1,3}[^`\n]+`{1,3}|\*[^*\s][^*]*\*|\[\d{1,2}\](?!\())/g;
const SrcContext = createContext([]); // danh sách link của dòng "Nguồn:" -> [1][2] trong câu bấm được
const SRC_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;
const MD_LINK = /^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)$/;

const Inline = ({ text, style, colors }) => {
  const srcs = useContext(SrcContext);
  return (
    <Text style={style} selectable>
      {text.split(INLINE_SPLIT).map((p, i) => {
        if (!p) return null;
        const cm = p.match(/^\[(\d{1,2})\]$/);
        if (cm) {
          const s = srcs[Number(cm[1]) - 1];
          if (!s) return p;
          return (
            <Text
              key={i}
              onPress={() => openLink(s.url)}
              style={{
                color: colors.primary,
                fontWeight: "800",
                fontSize: 11.5,
              }}
            >
              {` [${cm[1]}]`}
            </Text>
          );
        }
        const lm = p.match(MD_LINK);
        if (lm)
          return (
            <Text
              key={i}
              onPress={() => openLink(lm[2])}
              style={[styles.link, { color: colors.primary }]}
            >
              {lm[1]}
            </Text>
          );
        if (/^https?:\/\//i.test(p)) {
          const url = p.replace(/[.,;:!?]+$/, ""); // bỏ dấu câu dính cuối URL
          const tail = p.slice(url.length);
          return (
            <Text key={i}>
              <Text
                onPress={() => openLink(url)}
                style={[styles.link, { color: colors.primary }]}
              >
                {url}
              </Text>
              {tail}
            </Text>
          );
        }
        if (p.length > 4 && p.startsWith("**") && p.endsWith("**"))
          return (
            <Text key={i} style={{ fontWeight: "800", color: colors.primary }}>
              {p.slice(2, -2)}
            </Text>
          );
        if (p.length > 2 && p.startsWith("`") && p.endsWith("`"))
          return (
            <Text
              key={i}
              style={[
                styles.inlineCode,
                {
                  backgroundColor: colors.primarySoft,
                  color: colors.primaryText,
                },
              ]}
            >
              {p.replace(/^`+|`+$/g, "")}
            </Text>
          );
        if (p.length > 2 && p.startsWith("*") && p.endsWith("*"))
          return (
            <Text key={i} style={{ fontStyle: "italic" }}>
              {p.slice(1, -1)}
            </Text>
          );
        return p;
      })}
    </Text>
  );
};

const RichText = memo(function RichText({ content, colors, fs }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const srcs = useMemo(() => {
    const line = blocks.find((b) => b.t === "src");
    return line
      ? [...line.text.matchAll(SRC_LINK)].map((m) => ({
          label: m[1],
          url: m[2],
        }))
      : [];
  }, [blocks]);
  const k = fs ? fs / 15 : 1; // tỉ lệ phóng chữ (khung văn bản / chế độ phóng to)
  const base = [
    styles.bubbleText,
    { color: colors.text },
    fs ? { fontSize: fs, lineHeight: Math.round(fs * 1.62) } : null,
  ];
  return (
    <SrcContext.Provider value={srcs}>
      <View>
        {blocks.map((b, i) => {
          const prev = blocks[i - 1];
          // khoảng cách thoáng: giữa các mục list 6, list <-> đoạn văn 12, giữa các đoạn 10
          const gap =
            i === 0
              ? 0
              : b.t === "li"
                ? prev?.t === "li"
                  ? 6
                  : 8
                : prev?.t === "li"
                  ? 12
                  : 10;
          if (b.t === "code")
            return (
              <CodeBlock
                key={i}
                text={b.text}
                lang={b.lang}
                colors={colors}
                gap={gap}
              />
            );
          if (b.t === "table")
            return (
              <TableView key={i} rows={b.rows} colors={colors} gap={gap} />
            );
          if (b.t === "hr")
            return (
              <View
                key={i}
                style={{
                  height: 1,
                  marginTop: gap + 4,
                  marginBottom: 2,
                  backgroundColor: colors.border,
                }}
              />
            );
          if (b.t === "h")
            return (
              <View key={i} style={{ marginTop: i === 0 ? 0 : gap + 4 }}>
                <Inline
                  text={b.text}
                  colors={colors}
                  style={[
                    base,
                    {
                      fontWeight: "800",
                      color: colors.primary,
                      fontSize: (b.lvl === 1 ? 18 : b.lvl === 2 ? 16.5 : 15.5) * k,
                      lineHeight: Math.round(24 * k),
                    },
                  ]}
                />
              </View>
            );
          if (b.t === "li")
            return (
              <View
                key={i}
                style={[
                  styles.liRow,
                  { marginTop: gap, marginLeft: b.lvl * 18 },
                ]}
              >
                <Text
                  style={[
                    base,
                    styles.liMark,
                    {
                      color: colors.primary,
                      width: /^\d/.test(b.mark) ? 26 : 18,
                    },
                  ]}
                >
                  {b.mark}
                </Text>
                <View style={{ flex: 1 }}>
                  <Inline text={b.text} colors={colors} style={base} />
                </View>
              </View>
            );
          if (b.t === "quote")
            return (
              <View
                key={i}
                style={[
                  styles.quote,
                  {
                    marginTop: gap,
                    borderLeftColor: colors.primary,
                    backgroundColor: colors.primarySoft,
                  },
                ]}
              >
                <Inline
                  text={b.text}
                  colors={colors}
                  style={[base, { color: colors.primaryText }]}
                />
              </View>
            );
          if (b.t === "src" && srcs.length)
            return (
              <View
                key={i}
                style={{
                  marginTop: gap + 4,
                  flexDirection: "row",
                  flexWrap: "wrap",
                }}
              >
                {srcs.map((s, k) => (
                  <TouchableOpacity
                    key={s.url}
                    activeOpacity={0.7}
                    onPress={() => openLink(s.url)}
                    style={[
                      styles.srcChip,
                      {
                        backgroundColor: colors.primarySoft,
                        borderColor: colors.primaryBorder,
                      },
                    ]}
                    accessibilityRole="link"
                    accessibilityLabel={`Nguồn ${k + 1}: ${s.label}`}
                  >
                    <Text style={[styles.srcNum, { color: colors.primary }]}>
                      {k + 1}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.srcLabel, { color: colors.text }]}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          if (b.t === "src")
            return (
              <View
                key={i}
                style={{
                  marginTop: gap + 2,
                  flexDirection: "row",
                  alignItems: "flex-start",
                }}
              >
                <Ionicons
                  name="globe-outline"
                  size={14}
                  color={colors.textMuted}
                  style={{ marginTop: 3, marginRight: 6 }}
                />
                <View style={{ flex: 1 }}>
                  <Inline
                    text={b.text}
                    colors={colors}
                    style={[
                      base,
                      {
                        fontSize: 12.5,
                        lineHeight: 18,
                        color: colors.textMuted,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          return (
            <View key={i} style={{ marginTop: gap }}>
              <Inline text={b.text} colors={colors} style={base} />
            </View>
          );
        })}
      </View>
    </SrcContext.Provider>
  );
});

// ── Khối code: KHÔNG để 1 khối chiếm hết màn hình / làm native Text quá lớn ──
const CODE_COLLAPSE_LINES = 20; // dài hơn mức này -> mặc định thu gọn
const CODE_PREVIEW_LINES = 12; // số dòng hiện khi thu gọn
const CODE_CHUNK_LINES = 40; // mỗi <Text> tối đa ngần này dòng (Text native quá cao dễ bị cắt / trắng trên Android)
const CODE_MAX_LINE = 220; // dòng dài hơn mức này được ngắt khi HIỂN THỊ (nút Sao chép vẫn chép bản gốc)

// Tô màu cú pháp gọn (tự viết, không thêm thư viện): chú thích / chuỗi / số / từ khoá / kiểu.
const HL_KW = new Set(
  "if else elif for while do switch case break continue return function def class const let var import from export default as async await yield try catch except finally throw raise new delete typeof instanceof in of is not and or with pass lambda static public private protected void int float double string bool boolean char long short struct enum interface type extends implements package using namespace null None nil true false True False undefined this self super select where insert update create alter table join group order by limit values set into and not like end begin then fn let mut pub use mod impl trait match loop go func defer chan range".split(
    " ",
  ),
);
const HASH_LANGS =
  /^(py|python|sh|bash|shell|zsh|yaml|yml|ruby|rb|toml|dockerfile|r|perl|makefile|ini|conf)$/i;
const DASH_LANGS = /^(sql|lua|haskell|hs)$/i;
const HL_COLORS = {
  kw: "#a855f7",
  str: "#16a34a",
  num: "#d97706",
  type: "#0ea5e9",
};
const HL_SLASH =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;
const HL_HASH =
  /(#[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;
const HL_DASH =
  /(--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;
const hlRegex = (lang) =>
  HASH_LANGS.test(lang) ? HL_HASH : DASH_LANGS.test(lang) ? HL_DASH : HL_SLASH;
// -> [{ s: "chữ", c?: "#màu", i?: true }]
const highlight = (code, lang, muted) => {
  const out = [];
  let last = 0;
  const re = new RegExp(hlRegex(lang || "").source, "g");
  let m;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push({ s: code.slice(last, m.index) });
    if (m[1]) out.push({ s: m[1], c: muted, i: true });
    else if (m[2]) out.push({ s: m[2], c: HL_COLORS.str });
    else if (m[3]) out.push({ s: m[3], c: HL_COLORS.num });
    else if (
      HL_KW.has(m[4]) ||
      (/^[A-Z]{2,}$/.test(m[4]) && HL_KW.has(m[4].toLowerCase()))
    )
      out.push({ s: m[4], c: HL_COLORS.kw });
    else if (
      /^[A-Z][A-Za-z0-9_]*$/.test(m[4]) &&
      m[4].length > 1 &&
      /[a-z]/.test(m[4])
    )
      out.push({ s: m[4], c: HL_COLORS.type });
    else out.push({ s: m[4] });
    last = re.lastIndex;
    if (m[0] === "") re.lastIndex++;
  }
  if (last < code.length) out.push({ s: code.slice(last) });
  return out;
};
const HL_MAX_LINES = 400; // khối quá dài thì để chữ thường cho nhẹ máy

const prepCode = (text) => {
  const out = [];
  String(text || "")
    .replace(/\t/g, "  ")
    .split("\n")
    .forEach((l) => {
      const line = l.replace(/\s+$/, "");
      if (line.length <= CODE_MAX_LINE) out.push(line);
      else
        for (let k = 0; k < line.length; k += CODE_MAX_LINE)
          out.push((k ? "↪ " : "") + line.slice(k, k + CODE_MAX_LINE));
    });
  return out;
};

const CodeBlock = memo(function CodeBlock({ text, lang, colors, gap }) {
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => prepCode(text), [text]);
  const long = lines.length > CODE_COLLAPSE_LINES;
  const chunks = useMemo(() => {
    const src = long && !open ? lines.slice(0, CODE_PREVIEW_LINES) : lines;
    const c = [];
    for (let k = 0; k < src.length; k += CODE_CHUNK_LINES)
      c.push(src.slice(k, k + CODE_CHUNK_LINES).join("\n"));
    return c.length ? c : [""];
  }, [lines, long, open]);
  return (
    <View
      style={[
        styles.codeBlock,
        {
          marginTop: gap,
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.codeHead}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.textMuted,
            fontSize: 11.5,
            fontWeight: "700",
            flexShrink: 1,
            marginRight: 8,
          }}
        >
          {lang || "Code"}
          {long ? ` · ${lines.length} dòng` : ""}
        </Text>
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
          <Ionicons
            name={ok ? "checkmark" : "copy-outline"}
            size={14}
            color={ok ? colors.primary : colors.textMuted}
          />
          <Text
            style={{
              color: ok ? colors.primary : colors.textMuted,
              fontSize: 11.5,
              fontWeight: "700",
              marginLeft: 4,
            }}
          >
            {ok ? "Đã chép" : "Sao chép"}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View>
          {chunks.map((c, k) => (
            <Text
              key={k}
              selectable
              style={[styles.codeText, { color: colors.text }]}
            >
              {lines.length > HL_MAX_LINES
                ? c
                : highlight(c, lang, colors.textMuted).map((t, n) =>
                    t.c ? (
                      <Text
                        key={n}
                        style={{
                          color: t.c,
                          fontStyle: t.i ? "italic" : "normal",
                        }}
                      >
                        {t.s}
                      </Text>
                    ) : (
                      t.s
                    ),
                  )}
            </Text>
          ))}
        </View>
      </ScrollView>
      {long && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setOpen((v) => !v)}
          style={[styles.codeMore, { borderTopColor: colors.border }]}
          accessibilityRole="button"
        >
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={14}
            color={colors.primary}
          />
          <Text
            style={{
              color: colors.primary,
              fontSize: 12,
              fontWeight: "700",
              marginLeft: 4,
            }}
          >
            {open
              ? "Thu gọn"
              : `Xem thêm ${lines.length - CODE_PREVIEW_LINES} dòng`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ── Tin nhắn của NGƯỜI DÙNG có code: tách khối ``` thành CodeBlock; dán code trần (không ```) cũng nhận ra ──
const CODE_LINE =
  /[{};]\s*$|^\s{2,}\S|^\s*(?:\/\/|#include\b|import\s|from\s+\S+\s+import\b|def\s|class\s|function\b|const\s|let\s|var\s|return\b|elif\b|else\s*:|(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|ALTER|JOIN|GROUP BY|ORDER BY)\b|<\/?[A-Za-z][^>]*>\s*$)|=>|\w\(.*\)\s*:?\s*$|^\s*[\w.[\]]+\s*[-+*/]?=\s*\S/;

// [{ t: "text", text } | { t: "code", text, lang }]
const splitUserCode = (src) => {
  const lines = String(src || "")
    .replace(/\r/g, "")
    .split("\n");
  const out = [];
  let buf = [];
  const flush = () => {
    const t = buf.join("\n").replace(/^\n+|\s+$/g, "");
    if (t) out.push({ t: "text", text: t });
    buf = [];
  };
  let hasFence = false;
  for (let i = 0; i < lines.length; ) {
    const f = readFence(lines, i);
    if (f) {
      hasFence = true;
      flush();
      out.push(f.block);
      i = f.next;
    } else buf.push(lines[i++]);
  }
  flush();
  if (hasFence) return out;

  // không có ``` : dán code trần? (>= 3 dòng có nội dung và >= 60% giống code)
  const hit = lines.map((l) => !!l.trim() && CODE_LINE.test(l));
  const nonEmpty = lines.filter((l) => l.trim()).length;
  if (nonEmpty < 3 || hit.filter(Boolean).length / nonEmpty < 0.6)
    return [{ t: "text", text: String(src || "") }];
  const first = hit.indexOf(true);
  const last = hit.lastIndexOf(true);
  const res = [];
  const head = lines.slice(0, first).join("\n").trim();
  const tail = lines
    .slice(last + 1)
    .join("\n")
    .trim();
  if (head) res.push({ t: "text", text: head });
  res.push({
    t: "code",
    text: lines.slice(first, last + 1).join("\n"),
    lang: "",
  });
  if (tail) res.push({ t: "text", text: tail });
  return res;
};

const UserBody = memo(function UserBody({ content, colors }) {
  const blocks = useMemo(() => splitUserCode(content), [content]);
  return (
    <View>
      {blocks.map((b, i) =>
        b.t === "code" ? (
          <CodeBlock
            key={i}
            text={b.text}
            lang={b.lang}
            colors={colors}
            gap={i ? 8 : 0}
          />
        ) : (
          <Text
            key={i}
            selectable
            style={[
              styles.bubbleText,
              { color: "#ffffff", marginTop: i ? 8 : 0 },
            ]}
          >
            {b.text}
          </Text>
        ),
      )}
    </View>
  );
});

// Tin nhắn có khối code / bảng cần bong bóng RỘNG CỐ ĐỊNH để cuộn ngang hoạt động (xem renderItem)
const WIDE_CONTENT =
  /(^|\n)[ \t]*(`{3,}|~{3,})|(^|\n)[ \t]*\|.*\|[ \t]*(\n|$)|(^|\n):::doc\b/;

// ── KHUNG VĂN BẢN :::doc Tiêu đề … ::: (bài nói, thư, kế hoạch...) ──
// Khối chưa đóng (đang stream) vẫn nhận, để khung hiện dần theo chữ AI viết.
const DOC_RE = /^:::doc[ \t]*([^\n]*)\n([\s\S]*?)(?:^:::[ \t]*$|(?![\s\S]))/gm;
const docTitle = (t) =>
  String(t || "")
    .replace(/^title\s*=\s*/i, "")
    .replace(/^["“”'«]+|["“”'»]+$/g, "")
    .trim();
const splitDoc = (text) => {
  const src = String(text || "");
  const out = [];
  let last = 0;
  for (const m of src.matchAll(DOC_RE)) {
    if (m.index > last) out.push({ type: "text", text: src.slice(last, m.index) });
    out.push({
      type: "doc",
      title: docTitle(m[1]),
      body: m[2].replace(/\s+$/, ""),
      open: !/(^|\n):::[ \t]*$/.test(m[0]),
    });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: "text", text: src.slice(last) });
  return out;
};

const TableView = memo(function TableView({ rows, colors, gap }) {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.min(
      220,
      Math.max(
        76,
        Math.max(...rows.map((r) => String(r[c] || "").length)) * 7.4 + 24,
      ),
    ),
  );
  return (
    <View
      style={[styles.tableWrap, { marginTop: gap, borderColor: colors.border }]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View>
          {rows.map((r, ri) => (
            <View
              key={ri}
              style={{
                flexDirection: "row",
                backgroundColor:
                  ri === 0
                    ? colors.primarySoft
                    : ri % 2 === 0
                      ? colors.background
                      : "transparent",
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
      const f = await createFile({
        ...ctx,
        format: file.fmt,
        title: file.name,
        content: file.body,
      });
      setBusy(false);
      await shareFile(f);
    } catch (e) {
      setBusy(false);
      Alert.alert("Không tạo được file", e?.message || "Bạn thử lại nhé.");
    }
  };

  return (
    <View
      style={[
        styles.fileBox,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen((v) => !v)}
        style={styles.fileBoxTop}
      >
        <View
          style={[styles.fileTile, { backgroundColor: colors.primarySoft }]}
        >
          <Ionicons name={t.icon} size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[styles.fileBoxName, { color: colors.text }]}
          >
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
          style={[
            styles.fileDl,
            { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 },
          ]}
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
          <ScrollView
            style={{ maxHeight: 260 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <RichText content={file.body} colors={colors} />
          </ScrollView>
        </View>
      )}
    </View>
  );
});

// ── Khung văn bản: rộng, chữ thoáng, sao chép nhanh, phóng to toàn màn hình, tăng / giảm cỡ chữ ──
const DOC_COLLAPSE_CHARS = 1100; // dài hơn thì khung thu gọn, bấm "Phóng to" để đọc hết
const DOC_FS_MIN = 14;
const DOC_FS_MAX = 28;

const docFileName = (t) =>
  String(t || "Van-ban")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .slice(0, 60) || "Van-ban";

const DocModal = memo(function DocModal({ visible, onClose, title, body, colors, ctx }) {
  const insets = useSafeAreaInsets();
  const [fs, setFs] = useState(17);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const canWord = !!FILE_TYPES.docx;

  const copy = async () => {
    if (await copyText(body)) {
      setOk(true);
      setTimeout(() => setOk(false), 1400);
    }
  };
  const saveWord = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const f = await createFile({
        ...ctx,
        format: "docx",
        title: docFileName(title),
        content: (title ? `# ${title}\n\n` : "") + body,
      });
      setBusy(false);
      await shareFile(f);
    } catch (e) {
      setBusy(false);
      Alert.alert("Không tạo được file", e?.message || "Bạn thử lại nhé.");
    }
  };
  const Btn = ({ icon, label, onPress, disabled, active }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        docStyles.hBtn,
        { backgroundColor: active ? colors.primarySoft : "transparent", opacity: disabled ? 0.4 : 1 },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={20} color={active ? colors.primary : colors.text} />
      ) : (
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 14 }}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: colors.card || colors.background, paddingTop: insets.top }}>
        <View style={[docStyles.mHead, { borderBottomColor: colors.border }]}>
          <Btn icon="close" label="Đóng" onPress={onClose} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: colors.text, fontSize: 15.5, fontWeight: "800", marginHorizontal: 6 }}
          >
            {title || "Văn bản"}
          </Text>
          <Btn label="A−" onPress={() => setFs((v) => Math.max(DOC_FS_MIN, v - 1))} disabled={fs <= DOC_FS_MIN} />
          <Btn label="A+" onPress={() => setFs((v) => Math.min(DOC_FS_MAX, v + 1))} disabled={fs >= DOC_FS_MAX} />
          <Btn icon={ok ? "checkmark" : "copy-outline"} label="Sao chép" onPress={copy} active={ok} />
          {canWord && (
            <Btn icon={busy ? "hourglass-outline" : "download-outline"} label="Tải Word" onPress={saveWord} disabled={busy} />
          )}
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingTop: 20,
            paddingBottom: insets.bottom + 48,
            width: "100%",
            maxWidth: 780,
            alignSelf: "center",
          }}
          showsVerticalScrollIndicator
        >
          {!!title && (
            <Text
              style={{
                color: colors.text,
                fontSize: Math.round(fs * 1.45),
                lineHeight: Math.round(fs * 1.9),
                fontWeight: "800",
                marginBottom: 14,
              }}
            >
              {title}
            </Text>
          )}
          <RichText content={body} colors={colors} fs={fs} />
        </ScrollView>
      </View>
    </Modal>
  );
});

const DocBlock = memo(function DocBlock({ title, body, typing, colors, ctx }) {
  const [full, setFull] = useState(false);
  const [ok, setOk] = useState(false);
  const words = useMemo(() => (body.trim() ? body.trim().split(/\s+/).length : 0), [body]);
  const long = !typing && body.length > DOC_COLLAPSE_CHARS;
  const copy = async () => {
    if (await copyText(body)) {
      setOk(true);
      setTimeout(() => setOk(false), 1400);
    }
  };
  return (
    <View
      style={[
        docStyles.card,
        { backgroundColor: colors.background, borderColor: colors.primaryBorder || colors.border },
      ]}
    >
      <View style={[docStyles.head, { backgroundColor: colors.primarySoft, borderBottomColor: colors.border }]}>
        <Ionicons name="document-text-outline" size={19} color={colors.primary} />
        <View style={{ flex: 1, marginHorizontal: 9 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14.5, fontWeight: "800" }}>
            {title || "Văn bản"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 1 }}>
            {words} từ{typing ? " · đang viết…" : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={copy}
          hitSlop={8}
          style={docStyles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Sao chép văn bản"
        >
          <Ionicons name={ok ? "checkmark" : "copy-outline"} size={19} color={ok ? colors.primary : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFull(true)}
          hitSlop={8}
          style={docStyles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Phóng to văn bản"
        >
          <Ionicons name="expand-outline" size={19} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={long ? { maxHeight: 380, overflow: "hidden" } : null}>
        <View style={docStyles.body}>
          <RichText content={body} colors={colors} fs={15.5} />
        </View>
        {long && (
          <View pointerEvents="none" style={docStyles.fade}>
            {[0.2, 0.45, 0.7, 0.92].map((o) => (
              <View key={o} style={{ height: 16, backgroundColor: colors.background, opacity: o }} />
            ))}
          </View>
        )}
      </View>
      {!typing && (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setFull(true)}
          style={[docStyles.foot, { borderTopColor: colors.border }]}
          accessibilityRole="button"
        >
          <Ionicons name="expand-outline" size={15} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", marginLeft: 6 }}>
            {long ? "Phóng to để đọc hết" : "Phóng to"}
          </Text>
        </TouchableOpacity>
      )}
      {full && (
        <DocModal visible={full} onClose={() => setFull(false)} title={title} body={body} colors={colors} ctx={ctx} />
      )}
    </View>
  );
});

const docStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, overflow: "hidden", alignSelf: "stretch" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center", marginLeft: 2 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hBtn: { minWidth: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginLeft: 2 },
});

// Đang stream: cắt khối :::file / :::next chưa đóng để người dùng không thấy mã thô
const streamSafe = (s) => {
  // khối :::doc (kể cả dở dang) được giữ nguyên để khung hiện dần; che nó đi (giữ nguyên độ dài) trước khi đếm khối file / next / choices
  const mask = s.replace(DOC_RE, (m) => m.replace(/[^\n]/g, " "));
  const opens = [...mask.matchAll(/^:::(?:file|next|choices)\b/gm)];
  const closes = (mask.match(/^:::[ \t]*$/gm) || []).length;
  if (opens.length > closes)
    return s.slice(0, opens[opens.length - 1].index).trimEnd();
  return s;
};

// ── HÌNH MINH HOẠ SVG do AI tự vẽ (khối ```svg) ────────────────────────────────
const SVG_FENCE = /```(svg|mindmap|images)[ \t]*\r?\n([\s\S]*?)```/gi;
// khối ```svg chưa đóng (đang stream), hoặc mới gõ dở "```sv"
const SVG_OPEN_TAIL =
  /```(?:svg|mindmap|images)[ \t]*\r?\n(?![\s\S]*```)[\s\S]*$|```(?:s|sv|svg|mi|min|mind|mindm|mindma|mindmap|im|ima|imag|image|images)[ \t]*$/i;

// Tách một đoạn chữ thành [{type:"text"}, {type:"svg"}, ...]
const splitSvg = (text) => {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(SVG_FENCE)) {
    if (m.index > last)
      out.push({ type: "text", text: text.slice(last, m.index) });
    out.push({
      type:
        m[1].toLowerCase() === "mindmap"
          ? "mindmap"
          : m[1].toLowerCase() === "images"
            ? "images"
            : "svg",
      body: m[2].trim(),
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out.filter((x) => x.type !== "text" || x.text.trim());
};

// Đang stream: cắt khối ```svg chưa viết xong, báo "đang vẽ"
const svgStream = (s) => {
  const m = s.match(SVG_OPEN_TAIL);
  if (!m) return { text: s, drawing: false };
  const head = m[0].split("\n")[0]; // chỉ xét dòng mở khối, tránh nhầm với chữ bên trong mã
  const kind = /mi/i.test(head)
    ? "mindmap"
    : /sv/i.test(head)
      ? "svg"
      : /im/i.test(head)
        ? "images"
        : false;
  return { text: s.slice(0, m.index).trimEnd(), drawing: kind };
};

// Bỏ khối SVG khi sao chép / chia sẻ câu trả lời dạng chữ
const stripSvg = (s) =>
  String(s || "")
    .replace(/```(?:svg|mindmap|images)[ \t]*\r?\n[\s\S]*?```/gi, "")
    .replace(DOC_RE, (_m, t, b) => (docTitle(t) ? docTitle(t) + "\n\n" : "") + String(b).trim())
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Làm sạch lần nữa phía app (server đã lọc) + thay màu nhấn ACCENT bằng màu chủ đạo của app
const prepSvg = (xml, accent) =>
  String(xml || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<image\b[^>]*>(\s*<\/image>)?/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\bACCENT\b/g, accent || "#3b82f6");

// Nếu một hình lỗi thì chỉ mất hình đó, không làm sập cả cuộc chat
class SvgBoundary extends Component {
  state = { bad: false };
  static getDerivedStateFromError() {
    return { bad: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.bad ? this.props.fallback : this.props.children;
  }
}

// ── Khung xem toàn màn hình kiểu whiteboard ────────────────────────────────────
// Chụm 2 ngón: thu phóng quanh điểm giữa 2 ngón · Kéo 1 ngón: di chuyển · Chạm đúp: phóng to để đọc / khớp màn hình.
// Dùng PanResponder có sẵn (chạy như nhau trên iOS & Android, không cần cài thư viện, hoạt động trong Modal).
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampPan = (t, view, content) => {
  const m = 80; // cho phép kéo lố mép tối đa 80px, không để lạc mất hình
  const a = m;
  const b = view - content - m;
  return clampN(t, Math.min(a, b), Math.max(a, b));
};
const cornerBtn = (colors) => ({
  width: 26,
  height: 26,
  borderRadius: 13,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.primarySoft,
});

const ZoomModal = memo(function ZoomModal({
  visible,
  onClose,
  title,
  colors,
  cw,
  ch,
  render,
  right,
}) {
  const insets = useSafeAreaInsets();
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(false);
  const hintOn = useRef(false);
  const X = useRef(new Animated.Value(0)).current;
  const Y = useRef(new Animated.Value(0)).current;
  const R = useRef(new Animated.Value(1)).current;
  const anim = useRef(new Animated.Value(0)).current;
  const st = useRef({ s: 1, tx: 0, ty: 0 }).current; // s = tỉ lệ hiển thị; (tx,ty) = vị trí góc trên-trái của hình trong khung
  const g = useRef({
    mode: 0,
    moved: false,
    t0: 0,
    p0: { x: 0, y: 0 },
    m0: { x: 0, y: 0 },
    d0: 1,
    s0: 1,
    tx0: 0,
    ty0: 0,
    lastTap: 0,
    lastX: 0,
    lastY: 0,
  }).current;
  const geo = useRef({}).current; // thông số mới nhất cho PanResponder (được tạo một lần)

  // Hình được vẽ ở kích thước "base" (đủ nét, có trần diện tích để khỏi tốn bộ nhớ), phóng/thu bằng transform
  const base = Math.max(
    0.2,
    Math.min(1.25, Math.sqrt(1.2e6 / Math.max(1, cw * ch))),
  );
  const fitS = vp.w > 0 ? Math.min((vp.w - 24) / cw, (vp.h - 24) / ch) : 1;
  geo.cw = cw;
  geo.ch = ch;
  geo.base = base;
  geo.vw = vp.w;
  geo.vh = vp.h;
  geo.fit = fitS;
  geo.start = Math.min(fitS, 1.5);
  geo.min = Math.max(0.05, Math.min(fitS, 1) * 0.6);
  geo.max = Math.max(4, fitS * 4);

  // Quy đổi (s, tx, ty) -> transform. RN scale quanh TÂM view nên cần bù: X = tx + (cw*s - cw*base)/2
  const apply = useCallback((s0, tx0, ty0) => {
    const s = clampN(s0, geo.min, geo.max);
    const tx = clampPan(tx0, geo.vw, geo.cw * s);
    const ty = clampPan(ty0, geo.vh, geo.ch * s);
    st.s = s;
    st.tx = tx;
    st.ty = ty;
    X.setValue(tx + (geo.cw * s - geo.cw * geo.base) / 2);
    Y.setValue(ty + (geo.ch * s - geo.ch * geo.base) / 2);
    R.setValue(s / geo.base);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const animateTo = useCallback(
    (s1, tx1, ty1) => {
      const f = { s: st.s, tx: st.tx, ty: st.ty };
      anim.stopAnimation();
      anim.removeAllListeners();
      anim.setValue(0);
      anim.addListener(({ value }) =>
        apply(
          f.s + (s1 - f.s) * value,
          f.tx + (tx1 - f.tx) * value,
          f.ty + (ty1 - f.ty) * value,
        ),
      );
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => anim.removeAllListeners());
    },
    [apply], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const goFit = useCallback(
    (animate) => {
      const s = geo.start;
      const tx = (geo.vw - geo.cw * s) / 2;
      const ty = (geo.vh - geo.ch * s) / 2;
      if (animate) animateTo(s, tx, ty);
      else apply(s, tx, ty);
    },
    [apply, animateTo], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Phóng tới tỉ lệ s1 sao cho điểm (px,py) trong khung đứng yên
  const zoomAt = useCallback(
    (px, py, s1) => {
      const s = clampN(s1, geo.min, geo.max);
      const cx = (px - st.tx) / st.s;
      const cy = (py - st.ty) / st.s;
      animateTo(s, px - cx * s, py - cy * s);
    },
    [animateTo], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!visible) {
      setReady(false);
      setHint(false);
      hintOn.current = false;
      return undefined;
    }
    if (vp.w > 0) {
      anim.stopAnimation();
      goFit(false);
      setReady(true);
      setHint(true);
      hintOn.current = true;
      const id = setTimeout(() => {
        hintOn.current = false;
        setHint(false);
      }, 4500);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [visible, vp.w, vp.h, cw, ch]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        anim.stopAnimation();
        g.moved = false;
        g.t0 = Date.now();
        const t = e.nativeEvent.touches[0];
        g.p0 = t ? { x: t.locationX, y: t.locationY } : { x: 0, y: 0 };
        rebase(e);
      },
      onPanResponderMove: (e) => {
        const p = e.nativeEvent.touches.map((t) => ({
          x: t.locationX,
          y: t.locationY,
        }));
        if (!p.length) return;
        const n = p.length >= 2 ? 2 : 1;
        if (n !== g.mode) {
          rebase(e); // đổi số ngón giữa chừng: lấy mốc mới để hình không bị giật
          return;
        }
        if (n === 2) {
          const mx = (p[0].x + p[1].x) / 2;
          const my = (p[0].y + p[1].y) / 2;
          const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          const s1 = clampN((g.s0 * d) / g.d0, geo.min, geo.max);
          const cx = (g.m0.x - g.tx0) / g.s0; // điểm của hình nằm dưới giữa 2 ngón lúc bắt đầu
          const cy = (g.m0.y - g.ty0) / g.s0;
          apply(s1, mx - cx * s1, my - cy * s1);
          g.moved = true;
        } else {
          const dx = p[0].x - g.m0.x;
          const dy = p[0].y - g.m0.y;
          if (!g.moved && Math.hypot(dx, dy) < 6) return;
          g.moved = true;
          apply(g.s0, g.tx0 + dx, g.ty0 + dy);
        }
        if (hintOn.current) {
          hintOn.current = false;
          setHint(false);
        }
      },
      onPanResponderRelease: () => {
        g.mode = 0;
        if (g.moved || Date.now() - g.t0 > 350) return;
        const now = Date.now();
        const { x, y } = g.p0;
        if (
          now - g.lastTap < 320 &&
          Math.hypot(x - g.lastX, y - g.lastY) < 40
        ) {
          g.lastTap = 0;
          if (st.s > geo.start * 1.3) goFit(true);
          else zoomAt(x, y, Math.max(1.2, geo.start * 2.5));
        } else {
          g.lastTap = now;
          g.lastX = x;
          g.lastY = y;
        }
      },
      onPanResponderTerminate: () => {
        g.mode = 0;
      },
    }),
  ).current;

  function rebase(e) {
    const p = e.nativeEvent.touches.map((t) => ({
      x: t.locationX,
      y: t.locationY,
    }));
    if (!p.length) return;
    if (p.length >= 2) {
      g.mode = 2;
      g.m0 = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      g.d0 = Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y));
    } else {
      g.mode = 1;
      g.m0 = p[0];
      g.d0 = 1;
    }
    g.s0 = st.s;
    g.tx0 = st.tx;
    g.ty0 = st.ty;
  }

  const btn = {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginTop: 8,
  };
  const step = (f) => zoomAt(vp.w / 2, vp.h / 2, st.s * f);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: insets.top + 8,
            paddingBottom: 8,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 16,
              fontWeight: "800",
            }}
          >
            {title}
          </Text>
          {right}
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View
          style={{ flex: 1, overflow: "hidden" }}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setVp((v) =>
              v.w === width && v.h === height ? v : { w: width, h: height },
            );
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: Math.round(cw * base),
              height: Math.round(ch * base),
              opacity: ready ? 1 : 0,
              transform: [{ translateX: X }, { translateY: Y }, { scale: R }],
            }}
          >
            {render(Math.round(cw * base), Math.round(ch * base))}
          </Animated.View>
          {/* lớp bắt cử chỉ: luôn là đích của mọi lần chạm nên locationX/Y chính là toạ độ trong khung */}
          <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
          {hint && ready && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: insets.bottom + 18,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 16,
                  backgroundColor: colors.primarySoft,
                }}
              ></View>
            </View>
          )}
          <View
            style={{
              position: "absolute",
              right: 12,
              bottom: insets.bottom + 14,
            }}
          >
            <TouchableOpacity
              onPress={() => step(1.4)}
              style={btn}
              accessibilityRole="button"
              accessibilityLabel="Phóng to"
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => step(1 / 1.4)}
              style={btn}
              accessibilityRole="button"
              accessibilityLabel="Thu nhỏ"
            >
              <Ionicons name="remove" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => goFit(true)}
              style={btn}
              accessibilityRole="button"
              accessibilityLabel="Vừa khít màn hình"
            >
              <Ionicons name="scan-outline" size={19} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const SvgBlock = memo(function SvgBlock({ xml, colors }) {
  const [w, setW] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [bad, setBad] = useState(false);
  const onErr = useCallback(() => setBad(true), []); // phải ổn định: SvgXml chạy lại effect khi onError đổi
  const clean = useMemo(
    () => prepSvg(xml, colors.primary),
    [xml, colors.primary],
  );
  const ok = /^<svg[\s>]/i.test(clean) && /<\/svg>\s*$/i.test(clean);
  const vb = useMemo(() => {
    const m = clean.match(
      /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i,
    );
    const vw = m ? Number(m[1]) : 320;
    const vh = m ? Number(m[2]) : 212;
    return Number.isFinite(vw) && Number.isFinite(vh) && vw > 0 && vh > 0
      ? { w: vw, h: vh }
      : { w: 320, h: 212 };
  }, [clean]);
  const ratio = Math.min(2.5, Math.max(0.3, vb.h / vb.w));

  const failed = (
    <Text
      style={{ color: colors.textMuted, fontSize: 12.5, fontStyle: "italic" }}
    >
      Không hiển thị được hình minh hoạ.
    </Text>
  );
  if (!ok || bad) return failed;

  const inner = w > 22 ? w - 22 : 0; // trừ padding 10 + viền 1 mỗi bên
  return (
    <SvgBoundary fallback={failed}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setZoom(true)}
        onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))}
        accessibilityRole="imagebutton"
        accessibilityLabel="Hình minh hoạ. Chạm để phóng to"
        style={{
          alignSelf: "stretch",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          padding: 10,
          backgroundColor: colors.background,
        }}
      >
        {inner > 0 && (
          <SvgXml
            xml={clean}
            width={inner}
            height={inner * ratio}
            color={colors.text}
            onError={onErr}
          />
        )}
        <View
          pointerEvents="none"
          style={[
            cornerBtn(colors),
            { position: "absolute", top: 6, right: 6 },
          ]}
        >
          <Ionicons name="expand-outline" size={15} color={colors.primary} />
        </View>
      </TouchableOpacity>
      <ZoomModal
        visible={zoom}
        onClose={() => setZoom(false)}
        title="Hình minh hoạ"
        colors={colors}
        cw={vb.w}
        ch={vb.h}
        render={(pw, ph) => (
          <SvgXml
            xml={clean}
            width={pw}
            height={ph}
            color={colors.text}
            onError={onErr}
          />
        )}
      />
    </SvgBoundary>
  );
});

// ── SƠ ĐỒ TƯ DUY (khối ```mindmap) ─────────────────────────────────────────────
// AI chỉ viết dàn ý nhiều cấp; app tự xếp bố cục (trái/phải cân bằng), tự xuống dòng, tô màu theo nhánh rồi vẽ.
const MM_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ea580c",
];
const MM_MAX_DEPTH = 24; // chỉ để chống dàn ý lỗi (thụt lề vô tận); thực tế không bị chạm tới
const MM_STYLE = [
  { fs: 15, bold: true, maxW: 124, padX: 14, padY: 9, rx: 16 }, // chủ đề trung tâm
  { fs: 13.5, bold: true, maxW: 128, padX: 12, padY: 7, rx: 12 }, // nhánh chính
  { fs: 12.5, bold: false, maxW: 150, padX: 10, padY: 5, rx: 9 },
  { fs: 12, bold: false, maxW: 150, padX: 9, padY: 4, rx: 8 },
];

// Dàn ý "chủ đề / - nhánh / (2 dấu cách) - ý con" -> cây. Không giới hạn số nút, số cấp hay độ dài nhãn.
const parseMindmap = (src) => {
  const lines = String(src || "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return null;
  const clean = (t) =>
    t
      .trim()
      .replace(/^[-*•+]\s+/, "")
      .replace(/^#+\s*/, "")
      .replace(/\*\*|__|`/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const root = { text: clean(lines[0]), children: [], depth: 0 };
  if (!root.text) return null;
  const stack = [{ indent: -1, node: root }];
  let count = 1;
  for (const raw of lines.slice(1)) {
    const indent = raw.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length;
    const text = clean(raw);
    if (!text) continue;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent)
      stack.pop();
    const parent = stack[stack.length - 1].node;
    if (parent.depth >= MM_MAX_DEPTH) {
      stack.push({ indent, node: { children: [], depth: MM_MAX_DEPTH } }); // nút "ma": nuốt luôn các con của nó
      continue;
    }
    const node = { text, children: [], depth: parent.depth + 1 };
    parent.children.push(node);
    stack.push({ indent, node });
    count++;
  }
  return root.children.length ? { root, count } : null;
};

// Ước lượng bề rộng chữ (px) theo từng ký tự: đủ chính xác để tự xuống dòng cho tiếng Việt
const mmTextW = (t, fs, bold) => {
  let w = 0;
  for (const c of t) {
    if (c === " ") w += 0.28;
    else if ("ilj.,:;'!|()[]/\\-íìỉĩịÍÌ".includes(c)) w += 0.3;
    else if ("mwMW".includes(c)) w += 0.85;
    else if (c >= "0" && c <= "9") w += 0.56;
    else if (c !== c.toLowerCase()) w += 0.66;
    else w += 0.55;
  }
  return w * fs * (bold ? 1.07 : 1) * 1.04;
};
const mmWrap = (t, fs, bold, maxW) => {
  const lines = [];
  let cur = "";
  for (const w of t.split(/\s+/)) {
    const test = cur ? cur + " " + w : w;
    if (cur && mmTextW(test, fs, bold) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
};

// Xếp bố cục: chủ đề ở giữa, các nhánh chia cân bằng sang phải / trái, mỗi nhánh là một cây mọc ra ngoài.
const layoutMindmap = ({ root, count }) => {
  const GAPX = 36;
  const GAPY = 9;
  const MARGIN = 18;
  const nodes = [];
  const prep = (n, branch) => {
    const st = MM_STYLE[Math.min(n.depth, MM_STYLE.length - 1)];
    n.st = st;
    n.lines = mmWrap(n.text, st.fs, st.bold, st.maxW);
    n.lh = st.fs * 1.32;
    n.w =
      Math.max(...n.lines.map((l) => mmTextW(l, st.fs, st.bold))) + st.padX * 2;
    n.h = n.lines.length * n.lh + st.padY * 2;
    n.branch = branch;
    nodes.push(n);
    n.children.forEach((c, i) => prep(c, n.depth === 0 ? i : branch));
  };
  const sub = (n) => {
    if (!n.children.length) return (n.sub = n.h);
    const tot =
      n.children.reduce((a, c) => a + sub(c), 0) +
      GAPY * (n.children.length - 1);
    return (n.sub = Math.max(n.h, tot));
  };
  // nearX: cạnh của nút quay về phía cha; dir: 1 = mọc sang phải, -1 = mọc sang trái
  const place = (n, nearX, top, dir) => {
    n.dir = dir;
    n.x = dir === 1 ? nearX : nearX - n.w;
    if (!n.children.length) {
      n.cy = top + n.sub / 2;
      return;
    }
    const tot =
      n.children.reduce((a, c) => a + c.sub, 0) +
      GAPY * (n.children.length - 1);
    let y = top + (n.sub - tot) / 2;
    for (const c of n.children) {
      place(c, dir === 1 ? n.x + n.w + GAPX : n.x - GAPX, y, dir);
      y += c.sub + GAPY;
    }
    n.cy = (n.children[0].cy + n.children[n.children.length - 1].cy) / 2;
  };

  prep(root, -1);
  root.children.forEach(sub);
  const kids = root.children;
  const total = kids.reduce((a, c) => a + c.sub, 0);
  const right = [];
  const left = [];
  let acc = 0;
  kids.forEach((c) => {
    if (!right.length || acc + c.sub / 2 <= total / 2) right.push(c);
    else left.push(c);
    acc += c.sub;
  });
  const side = (arr) =>
    arr.reduce((a, c) => a + c.sub, 0) + GAPY * Math.max(0, arr.length - 1);
  const hr = side(right);
  const hl = side(left);
  const H = Math.max(hr, hl, root.h);
  root.dir = 0;
  root.x = -root.w / 2;
  root.cy = H / 2;
  let y = (H - hr) / 2;
  right.forEach((c) => {
    place(c, root.x + root.w + GAPX, y, 1);
    y += c.sub + GAPY;
  });
  y = (H - hl) / 2;
  left.forEach((c) => {
    place(c, root.x - GAPX, y, -1);
    y += c.sub + GAPY;
  });

  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const minY = Math.min(...nodes.map((n) => n.cy - n.h / 2));
  const maxY = Math.max(...nodes.map((n) => n.cy + n.h / 2));
  const ox = MARGIN - minX;
  const oy = MARGIN - minY;
  nodes.forEach((n) => {
    n.x += ox;
    n.cy += oy;
  });
  const edges = [];
  nodes.forEach((p) =>
    p.children.forEach((c) => {
      const x1 = c.dir === 1 ? p.x + p.w : p.x;
      const x2 = c.dir === 1 ? c.x : c.x + c.w;
      const xm = (x1 + x2) / 2;
      edges.push({
        d: `M${x1.toFixed(1)} ${p.cy.toFixed(1)} C${xm.toFixed(1)} ${p.cy.toFixed(1)} ${xm.toFixed(1)} ${c.cy.toFixed(1)} ${x2.toFixed(1)} ${c.cy.toFixed(1)}`,
        branch: c.branch,
        w: c.depth === 1 ? 3.2 : c.depth === 2 ? 2.2 : 1.6,
      });
    }),
  );
  return {
    root,
    nodes,
    edges,
    count,
    W: Math.ceil(maxX - minX + MARGIN * 2),
    H: Math.ceil(maxY - minY + MARGIN * 2),
  };
};

const MindmapSvg = memo(function MindmapSvg({ map, width, height, colors }) {
  const colorOf = (b) =>
    b >= 0 ? MM_COLORS[b % MM_COLORS.length] : colors.primary;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${map.W} ${map.H}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {map.edges.map((e, i) => (
        <Path
          key={`e${i}`}
          d={e.d}
          stroke={colorOf(e.branch)}
          strokeWidth={e.w}
          strokeLinecap="round"
          fill="none"
          opacity={0.85}
        />
      ))}
      {map.nodes.map((n, i) => {
        const top = n.cy - n.h / 2;
        const col = colorOf(n.branch);
        const solid = n.depth <= 1;
        return (
          <G key={`n${i}`}>
            <Rect
              x={n.x}
              y={top}
              width={n.w}
              height={n.h}
              rx={n.st.rx}
              ry={n.st.rx}
              fill={col}
              fillOpacity={solid ? 1 : 0.14}
              stroke={col}
              strokeWidth={solid ? 0 : 1.2}
            />
            {n.lines.map((ln, k) => (
              <SvgText
                key={k}
                x={n.x + n.w / 2}
                y={top + n.st.padY + k * n.lh + n.lh / 2 + n.st.fs * 0.35}
                fontSize={n.st.fs}
                fontWeight={n.st.bold ? "bold" : "normal"}
                fill={solid ? "#ffffff" : colors.text}
                textAnchor="middle"
              >
                {ln}
              </SvgText>
            ))}
          </G>
        );
      })}
    </Svg>
  );
});

const MindmapBlock = memo(function MindmapBlock({ src, colors }) {
  const [w, setW] = useState(0);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const map = useMemo(() => {
    try {
      const parsed = parseMindmap(src);
      return parsed ? layoutMindmap(parsed) : null;
    } catch {
      return null;
    }
  }, [src]);
  if (!map)
    return (
      <Text
        style={{ color: colors.textMuted, fontSize: 12.5, fontStyle: "italic" }}
      >
        Không hiển thị được sơ đồ tư duy.
      </Text>
    );

  const inner = w > 22 ? w - 22 : 0;
  const thumbH = Math.min(inner * (map.H / map.W), 300);
  const copyOutline = async () => {
    const ok = await copyText(src);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setOpen(true)}
        onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))}
        accessibilityRole="button"
        accessibilityLabel={`Sơ đồ tư duy: ${map.root.text}. Chạm để phóng to`}
        style={{
          alignSelf: "stretch",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          padding: 10,
          backgroundColor: colors.background,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Ionicons
            name="git-network-outline"
            size={16}
            color={colors.primary}
          />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 13.5,
              fontWeight: "800",
              marginLeft: 6,
            }}
          >
            {map.root.text}
          </Text>
          <Text
            style={{ color: colors.textMuted, fontSize: 11.5, marginRight: 8 }}
          >
            {map.count} ý
          </Text>
          <View pointerEvents="none" style={cornerBtn(colors)}>
            <Ionicons name="expand-outline" size={15} color={colors.primary} />
          </View>
        </View>
        {inner > 0 && (
          <MindmapSvg map={map} width={inner} height={thumbH} colors={colors} />
        )}
      </TouchableOpacity>
      <ZoomModal
        visible={open}
        onClose={() => setOpen(false)}
        title={map.root.text}
        colors={colors}
        cw={map.W}
        ch={map.H}
        render={(pw, ph) => (
          <MindmapSvg map={map} width={pw} height={ph} colors={colors} />
        )}
        right={
          <TouchableOpacity
            onPress={copyOutline}
            hitSlop={10}
            style={{ marginRight: 16 }}
            accessibilityRole="button"
            accessibilityLabel="Sao chép dàn ý"
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={22}
              color={copied ? colors.primary : colors.text}
            />
          </TouchableOpacity>
        }
      />
    </>
  );
});

// ── ẢNH THAM KHẢO TRÊN INTERNET (khối ```images) ─────────────────────────────────
// AI chỉ viết 1 dòng truy vấn; SERVER tìm ảnh rồi thay khối bằng JSON {q, items:[{t: ảnh nhỏ, u: ảnh gốc, c: tiêu đề, s: tên miền, p: trang nguồn}]}.
// Khi còn là truy vấn thô (đang stream, server chưa tìm xong) -> hiện "đang tìm ảnh"; khi không tìm được server đã bỏ khối.
const HTTPS = /^https:\/\//i;
const parseImages = (src) => {
  try {
    const j = JSON.parse(src);
    const items = (Array.isArray(j?.items) ? j.items : [])
      .filter((x) => HTTPS.test(x?.t || ""))
      .slice(0, 6)
      .map((x) => ({
        t: x.t,
        u: HTTPS.test(x.u || "") ? x.u : x.t,
        c: String(x.c || ""),
        s: String(x.s || ""),
        p: HTTPS.test(x.p || "") ? x.p : "",
      }));
    return items.length ? { q: String(j.q || ""), items } : null;
  } catch {
    return null;
  }
};

const ImagesBlock = memo(function ImagesBlock({ src, colors, pending }) {
  const data = useMemo(() => parseImages(src), [src]);
  const [failed, setFailed] = useState({}); // ảnh nhỏ không tải được (bị chặn / hết hạn) -> ẩn
  const [sel, setSel] = useState(-1);
  const [full, setFull] = useState(null); // { uri, w, h } của ảnh đang phóng to

  // Phóng to: thử ảnh gốc (có thể bị trang nguồn chặn), không được thì dùng ảnh nhỏ
  useEffect(() => {
    if (sel < 0 || !data) return undefined;
    let alive = true;
    const it = data.items[sel];
    setFull(null);
    const tryUri = (uri, next) =>
      Image.getSize(
        uri,
        (w, h) => alive && setFull({ uri, w: w || 4, h: h || 3 }),
        () => {
          if (!alive) return;
          if (next) next();
          else setFull({ uri: it.t, w: 4, h: 3 });
        },
      );
    tryUri(it.u, it.u !== it.t ? () => tryUri(it.t, null) : null);
    return () => {
      alive = false;
    };
  }, [sel, data]);

  if (!data)
    return pending ? <SvgDrawing colors={colors} kind="images" /> : null;
  const list = data.items
    .map((it, i) => ({ it, i }))
    .filter(({ i }) => !failed[i]);
  if (!list.length) return null;
  const cur = sel >= 0 ? data.items[sel] : null;

  return (
    <View
      style={{
        alignSelf: "stretch",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 10,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
      >
        <Ionicons name="images-outline" size={16} color={colors.primary} />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 13.5,
            fontWeight: "800",
            marginLeft: 6,
          }}
        >
          Ảnh tham khảo từ internet
        </Text>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
      >
        {list.map(({ it, i }) => (
          <TouchableOpacity
            key={it.t}
            activeOpacity={0.85}
            onPress={() => setSel(i)}
            style={{ width: 150, marginRight: 8 }}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Ảnh tham khảo: ${it.c || it.s}. Chạm để phóng to`}
          >
            <Image
              source={{ uri: it.t }}
              resizeMode="cover"
              onError={() => setFailed((f) => ({ ...f, [i]: true }))}
              style={{
                width: 150,
                height: 112,
                borderRadius: 12,
                backgroundColor: colors.primarySoft,
              }}
            />
            {sel === i && !full && (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    height: 112,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.35)",
                  },
                ]}
              >
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
      {cur && full && (
        <ZoomModal
          visible
          onClose={() => {
            setSel(-1);
            setFull(null);
          }}
          title={cur.c || cur.s || "Ảnh tham khảo"}
          colors={colors}
          cw={full.w}
          ch={full.h}
          render={(pw, ph) => (
            <Image
              source={{ uri: full.uri }}
              style={{ width: pw, height: ph }}
              resizeMode="contain"
            />
          )}
          right={
            cur.p ? (
              <TouchableOpacity
                onPress={() => openLink(cur.p)}
                hitSlop={10}
                style={{ marginRight: 16 }}
                accessibilityRole="link"
                accessibilityLabel="Mở trang nguồn"
              >
                <Ionicons name="open-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
});

// Chỗ giữ trước trong lúc AI đang viết hình / dàn ý
const SvgDrawing = memo(function SvgDrawing({ colors, kind }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "stretch",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        padding: 14,
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={{ color: colors.textMuted, fontSize: 13.5, marginLeft: 10 }}>
        {kind === "mindmap"
          ? "Đang vẽ sơ đồ tư duy…"
          : kind === "images"
            ? "Đang tìm ảnh tham khảo…"
            : "Đang vẽ hình minh hoạ…"}
      </Text>
    </View>
  );
});

const balance = (s) => {
  if ((s.match(/```/g) || []).length % 2) return s + "\n```";
  if ((s.match(/\*\*/g) || []).length % 2) return s + "**";
  return s;
};

// Dấu hiệu server gắn cuối tin nhắn "kế hoạch sửa file Google": app ẩn dấu hiệu và hiện nút Xác nhận dưới tin nhắn
const GCONFIRM_RE = /\s*\[\[gconfirm\]\]\s*$/;

// Nội dung câu trả lời của AI: chữ "gõ ra" dần (như Claude / ChatGPT) + thẻ file
const AssistantBody = memo(function AssistantBody({
  content,
  fresh,
  streaming,
  colors,
  ctx,
  onDone,
}) {
  const sv = streaming
    ? svgStream(streamSafe(content))
    : { text: content, drawing: false };
  const shown = sv.text.replace(GCONFIRM_RE, "");
  // Tách khối :::doc (khung văn bản) TRƯỚC, rồi mỗi đoạn chữ còn lại đi qua đường cũ:
  // :::choices, from="..." và các định dạng pdf/pptx/gdoc... (xem exportMeta.js), thẻ file, rồi các khối ```svg
  // (hình hiện nguyên khối, không "gõ" từng ký tự mã).
  const segs = useMemo(() => {
    const out = [];
    splitDoc(shown).forEach((piece) => {
      if (piece.type === "doc") {
        out.push(piece);
        return;
      }
      if (!piece.text.trim()) return;
      const pre = extractFromAttrs(extractChoices(piece.text).text);
      const parsed = applyFileMeta(parseReply(pre.text), pre.info);
      parsed.segments.forEach((x) => {
        if (x.type === "text") out.push(...splitSvg(x.text));
        else out.push(x);
      });
    });
    return out;
  }, [shown]);
  const total = useMemo(
    () =>
      segs.reduce(
        (n, x) =>
          n + (x.type === "text" ? x.text.length : x.type === "doc" ? x.body.length : 0),
        0,
      ),
    [segs],
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
  segs.forEach((s, i) => {
    if (s.type === "text") {
      const take = Math.max(0, remaining);
      remaining -= s.text.length;
      if (take > 0)
        out.push(
          <RichText
            key={i}
            content={
              take >= s.text.length ? s.text : balance(s.text.slice(0, take))
            }
            colors={colors}
          />,
        );
    } else if (s.type === "doc") {
      const take = Math.max(0, remaining);
      remaining -= s.body.length;
      if (take > 0 || !fresh)
        out.push(
          <DocBlock
            key={i}
            title={s.title}
            body={take >= s.body.length ? s.body : balance(s.body.slice(0, take))}
            typing={(s.open && !!streaming) || (fresh && take < s.body.length)}
            colors={colors}
            ctx={ctx}
          />,
        );
    } else if (s.type === "svg") {
      if (remaining >= 0)
        out.push(<SvgBlock key={i} xml={s.body} colors={colors} />);
    } else if (s.type === "mindmap") {
      if (remaining >= 0)
        out.push(<MindmapBlock key={i} src={s.body} colors={colors} />);
    } else if (s.type === "images") {
      if (remaining >= 0)
        out.push(
          <ImagesBlock
            key={i}
            src={s.body}
            colors={colors}
            pending={!!streaming}
          />,
        );
    } else if (remaining >= 0) {
      out.push(
        SERVER_FORMATS.includes(s.fmt) ? (
          <FileCardV2 key={i} file={s} colors={colors} ctx={ctx} />
        ) : (
          <FileCard key={i} file={s} colors={colors} ctx={ctx} />
        ),
      );
    }
  });
  if (sv.drawing)
    out.push(<SvgDrawing key="drawing" colors={colors} kind={sv.drawing} />);
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
          Animated.timing(d, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
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
        <Animated.View
          key={i}
          style={[styles.thinkDot, { backgroundColor: color, opacity: d }]}
        />
      ))}
    </View>
  );
});

// ── Lịch sử: nhóm theo ngày ("HH:MM  DD/MM/YYYY" giờ VN từ server) ──
const parseUpdated = (str = "") => {
  const m = String(str).match(
    /(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  );
  return m ? new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]) : null;
};
const pad2 = (n) => String(n).padStart(2, "0");
const groupConvs = (list, query) => {
  const needle = query.trim().toLowerCase();
  const buckets = [
    ["Hôm nay", []],
    ["Hôm qua", []],
    ["7 ngày qua", []],
    ["30 ngày qua", []],
    ["Cũ hơn", []],
  ];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  list.forEach((c) => {
    if (needle && !(c.title || "").toLowerCase().includes(needle)) return;
    const d = parseUpdated(c.updated);
    const days = d
      ? Math.round(
          (today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) /
            86400000,
        )
      : 999;
    const idx =
      days <= 0 ? 0 : days === 1 ? 1 : days <= 7 ? 2 : days <= 30 ? 3 : 4;
    const when = !d
      ? c.updated
      : days <= 1
        ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
        : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
    buckets[idx][1].push({ ...c, when });
  });
  return buckets
    .filter(([, data]) => data.length)
    .map(([title, data]) => ({ title, data }));
};

const guessMime = (name = "", mime) => {
  if (mime) return mime;
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return DOCX_MIME;
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm")) return XLSX_MIME;
  if (n.endsWith(".xls")) return XLS_MIME;
  if (/\.(png|jpe?g|webp|gif)$/.test(n)) return "image/jpeg";
  return "text/plain";
};

// Câu mở đầu của AI khi người dùng mở một thông báo hộp thư
const inboxIntro = (it) => {
  const text = String(it.text || "").trim();
  if (it.kind === "partner")
    return `${it.from || "Người ấy"} vừa nhắn:\n\n> ${text}\n\nBạn muốn trả lời sao? Cứ nói ý chính, mình soạn giúp một tin thật tự nhiên nhé.`;
  return `${INBOX_LABEL[it.kind] || "Thông báo"}:\n\n> ${text}\n\nBạn có muốn mình giúp gì với tin này không?`;
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
  inbox, // { items, unread, refresh, markRead } | undefined — hộp thư (chuông thông báo)
  inboxSeed, // { item, nonce } | null — bấm bong bóng hộp thư -> mở thẳng cuộc trò chuyện về tin này
  onInboxSeedUsed, // () => void
}) {
  const { colors } = useTheme();
  const avatar = useAiAvatar();
  const baseAvatarStyle = useAiAvatarStyle();
  // avatar trong khung chat nằm bên TRÁI -> lật để quay đầu về phía nội dung (xem AVATAR_NATIVE_FACING)
  const avatarStyle = useMemo(
    () =>
      AVATAR_NATIVE_FACING === "left"
        ? flipAvatarStyle(baseAvatarStyle)
        : baseAvatarStyle,
    [baseAvatarStyle],
  );
  const emptyImage = useAiEmptyImage();
  const { key: agentKey, name: agentName, content: agentText } = useAiAgent(); // agent đang chọn: tên hiển thị + key gửi lên backend để đổi tính cách
  const insets = useSafeAreaInsets();
  // message: { id, role, content, files?: [{name, mime, data}], isError? }
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [googleOpen, setGoogleOpen] = useState(false); // màn Tài khoản Google
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
  // Bề rộng THẬT của danh sách tin nhắn (onLayout). Bong bóng cần bề rộng px xác định (không dùng %) thì khối code / bảng
  // mới bị giới hạn đúng và cuộn ngang được, thay vì kéo bong bóng rộng quá màn hình và che avatar + các phần khác.
  const [listW, setListW] = useState(0);
  const contentW = Math.max(200, Math.round((listW || winW) - 32)); // trừ padding 16 hai bên của listContent
  const aiColMax = Math.max(
    160,
    Math.min(contentW - 36, Math.floor(contentW * 0.94)),
  ); // 36 = avatar 28 + lề 8
  const myColMax = Math.floor(contentW * 0.82);
  const [focused, setFocused] = useState(false);
  const atBottomRef = useRef(true);
  const [copiedId, setCopiedId] = useState(null); // hiện dấu ✓ sau khi bấm "Sao chép"
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [sendLabel, setSendLabel] = useState("Đang trả lời…");
  const [showJump, setShowJump] = useState(false); // nút cuộn xuống cuối
  const [composerH, setComposerH] = useState(90);
  const abortRef = useRef(null);
  const sendingRef = useRef(false);
  const inputRef = useRef(null);
  const streamTextRef = useRef("");
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
  const exportCtx = useMemo(
    () => ({
      apiBase,
      token,
      authFetch,
      // GĐ4: tìm tệp đã đính kèm trong cuộc trò chuyện theo tên -> {name, mime, data(base64)}
      findAttachment: (name) => {
        const list = messagesRef.current || [];
        for (let i = list.length - 1; i >= 0; i--) {
          const f = (list[i].files || []).find((x) => x.name === name);
          if (f) return f;
        }
        return null;
      },
      openGoogle: () => setGoogleOpen(true),
    }),
    [apiBase, token, authFetch],
  );
  const markDone = useCallback(
    (id) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === id && m.fresh ? { ...m, fresh: false } : m)),
      ),
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
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true }),
    );
  }, []);

  useEffect(() => {
    if (visible) scrollToEnd();
  }, [visible, scrollToEnd]);

  // Có check-in bị từ chối đang chờ -> chat mở ra NỐI TIẾP câu thông báo của AI (kèm ảnh vừa chụp).
  // Ảnh gốc nằm tạm trên server nên các lượt sau KHÔNG gửi lại ảnh, chỉ gửi lời giải thích.
  useEffect(() => {
    if (!visible || !appeal || seededRef.current === appeal.id || sending)
      return;
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
        content:
          appeal.text ||
          "Em chưa nhận ra ảnh check-in này, kể em nghe được khom nè?",
        files: appeal.uri
          ? [{ name: "anh-check-in.jpg", uri: appeal.uri }]
          : [],
        note:
          appeal.status === "approved"
            ? "✅ Em đã duyệt roi đó, bấm nút chọn ml dưới để check bù nhé."
            : "💛 Lý do gì nè, kể tớ nghe.",
        appealCard: appeal.status === "approved",
        appealId: appeal.id,
      },
    ]);
    atBottomRef.current = true;
    scrollToEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, appeal?.id]);

  // ── Hộp thư: mở một thông báo -> cuộc trò chuyện mới, AI mở lời bằng nội dung tin đó ──
  const inboxCtxRef = useRef(null); // tin hộp thư đang trò chuyện -> gửi kèm lên backend (inbox_context)
  const seededInboxRef = useRef(null);
  const startInboxChat = useCallback(
    (it) => {
      if (!it || sendingRef.current) return;
      inboxCtxRef.current = { id: it.id, kind: it.kind, from: it.from || "", text: it.text || "" };
      inbox?.markRead?.([it.id]);
      setInAppeal(false);
      seededRef.current = null;
      setConvId(null);
      setPending([]);
      setInput("");
      setPanel(null);
      setMessages([{ id: nextId(), role: "assistant", content: inboxIntro(it), inboxId: it.id }]);
      atBottomRef.current = true;
      scrollToEnd();
    },
    [inbox, scrollToEnd],
  );
  // đặt SAU effect khiếu nại: nếu cùng lúc có cả hai thì tin hộp thư được ưu tiên
  useEffect(() => {
    if (!visible || !inboxSeed || seededInboxRef.current === inboxSeed.nonce || sending) return;
    seededInboxRef.current = inboxSeed.nonce;
    startInboxChat(inboxSeed.item);
    onInboxSeedUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, inboxSeed?.nonce]);
  const openInbox = useCallback(() => {
    setPanel("inbox");
    setPanelError("");
    inbox?.refresh?.();
  }, [inbox]);

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
      wrapOpacity: progress.interpolate({
        inputRange: [0, 0.3, 1],
        outputRange: [0, 1, 1],
        extrapolate: "clamp",
      }),
      wrapScale: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.18, 1],
      }), // cho phép vọt nhẹ quá 1 -> hiệu ứng nảy
      bodyOpacity: progress.interpolate({
        inputRange: [0, 0.55, 1],
        outputRange: [0, 0, 1],
        extrapolate: "clamp",
      }),
      headerY: progress.interpolate({
        inputRange: [0, 0.4, 0.9],
        outputRange: [-18, -18, 0],
        extrapolate: "clamp",
      }),
      composerY: progress.interpolate({
        inputRange: [0, 0.5, 0.95],
        outputRange: [28, 28, 0],
        extrapolate: "clamp",
      }),
      radius: radius.interpolate({
        inputRange: [0, 1],
        outputRange: [120, 0],
        extrapolate: "clamp",
      }),
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
        Animated.spring(progress, {
          toValue: 1,
          useNativeDriver: true,
          damping: 18,
          stiffness: 190,
          mass: 0.95,
        }),
        Animated.timing(radius, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(() => setOpening(false));
    } else if (mountedRef.current) {
      setOpening(true);
      Animated.parallel([
        Animated.timing(progress, {
          toValue: 0,
          duration: 230,
          easing: Easing.bezier(0.4, 0, 0.9, 0.4),
          useNativeDriver: true,
        }),
        Animated.timing(radius, {
          toValue: 0,
          duration: 230,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
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
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 260,
          }).start();
        } else if (layerOpenRef.current) {
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 260,
          }).start();
          goBackRef.current();
        } else {
          Animated.timing(swipeX, {
            toValue: winWRef.current,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => goBackRef.current());
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
          typeof data?.detail === "string"
            ? data.detail
            : "Có lỗi xảy ra, bạn thử lại nhé.",
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
        inboxCtxRef.current = null;
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
              await api(`/api/chat/conversations/${c.id}`, {
                method: "DELETE",
              });
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
      Alert.alert(
        "Đã đủ tệp",
        `Mỗi lượt chỉ đính kèm tối đa ${MAX_FILES} tệp.`,
      );
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
      Alert.alert(
        "Đã đủ tệp",
        `Mỗi lượt chỉ đính kèm tối đa ${MAX_FILES} tệp.`,
      );
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
        mime:
          a.mimeType && a.mimeType.startsWith("image/")
            ? a.mimeType
            : "image/jpeg",
        size: a.fileSize || 0,
        uri: a.uri,
      }));
      if (accepted.length) setPending((p) => [...p, ...accepted]);
    } catch (e) {
      Alert.alert(
        "Không mở được thư viện ảnh",
        e?.message || "Bạn kiểm tra quyền truy cập ảnh rồi thử lại nhé.",
      );
    }
  }, [sending, pending.length]);

  // Mở khung camera check-in (cùng giao diện với màn hình chính, nhưng to hơn) rồi đính kèm ảnh vừa chụp
  const takePhoto = useCallback(async () => {
    if (sending) return;
    if (MAX_FILES - pending.length <= 0) {
      Alert.alert(
        "Đã đủ tệp",
        `Mỗi lượt chỉ đính kèm tối đa ${MAX_FILES} tệp.`,
      );
      return;
    }
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Cần quyền Camera",
          `Bạn cho phép ứng dụng dùng camera trong Cài đặt để chụp ảnh gửi cho ${agentName} nhé.`,
        );
        return;
      }
      Keyboard.dismiss();
      setCamOpen(true);
    } catch (e) {
      Alert.alert(
        "Không mở được camera",
        e?.message || "Bạn kiểm tra quyền camera rồi thử lại nhé.",
      );
    }
  }, [sending, pending.length]);

  const handleCamPicture = useCallback((uri) => {
    setCamOpen(false);
    if (!uri) return;
    setPending((p) =>
      p.length >= MAX_FILES
        ? p
        : [
            ...p,
            {
              name: `chup-${Date.now()}.jpg`,
              mime: "image/jpeg",
              size: 0,
              uri,
            },
          ],
    );
  }, []);
  const handleCamClose = useCallback(() => setCamOpen(false), []);

  // Sao chép nhanh toàn bộ câu trả lời
  const quickCopy = useCallback(async (item) => {
    const ok = await copyText(replyText(stripSvg(item.content)));
    if (!ok) return;
    setCopiedId(item.id);
    setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1500);
  }, []);

  // ── Gửi ───────────────────────────────────────────────────────────────────
  const memoNote = (events) =>
    (events || [])
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

  // Đọc luồng SSE từ /api/chat/stream. Ném lỗi { fallback: true } nếu máy chủ chưa có route stream -> dùng /api/chat cũ.
  const runStream = useCallback(
    async (reqBody, signal, aid) => {
      const res = await streamFetch(`${apiBase}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(reqBody),
        signal,
      });
      if (!res.ok) {
        if ([401, 404, 405, 501].includes(res.status))
          throw Object.assign(new Error("no-stream"), { fallback: true });
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Không gửi được tin nhắn, bạn thử lại nhé.",
        );
      }
      const reader = res.body?.getReader?.();
      if (!reader)
        throw Object.assign(new Error("no-reader"), { fallback: true });

      const decoder =
        typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;
      let carry = new Uint8Array(0);
      const decode = (chunk) => {
        if (decoder) return decoder.decode(chunk, { stream: true });
        // dự phòng không có TextDecoder: giữ lại byte UTF-8 dở dang cho lần sau
        const all = new Uint8Array(carry.length + chunk.length);
        all.set(carry);
        all.set(chunk, carry.length);
        let cut = all.length;
        for (let k = 1; k <= Math.min(3, all.length); k++) {
          const b = all[all.length - k];
          if ((b & 0xc0) === 0x80) continue;
          if (
            b >= 0xc0 &&
            all.length - (all.length - k) < (b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2)
          )
            cut = all.length - k;
          break;
        }
        carry = all.slice(cut);
        let s = "";
        for (let k = 0; k < cut; k++) s += String.fromCharCode(all[k]);
        try {
          return decodeURIComponent(escape(s));
        } catch {
          return s;
        }
      };

      let flushTimer = null;
      const flush = () => {
        flushTimer = null;
        const text = streamTextRef.current;
        setMessages((prev) =>
          prev.map((m) => (m.id === aid ? { ...m, content: text } : m)),
        );
      };
      const schedule = () => {
        if (!flushTimer) flushTimer = setTimeout(flush, 60); // gom chữ ~16 lần/giây cho đỡ giật
      };

      let buf = "";
      let finished = false;
      let agentActions = []; // >>> water_agent
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decode(value).replace(/\r\n/g, "\n");
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n");
            if (!dataLine) continue;
            let ev;
            try {
              ev = JSON.parse(dataLine);
            } catch {
              continue;
            }
            if (ev.t === "delta") {
              streamTextRef.current += ev.x;
              schedule();
            } else if (ev.t === "reset") {
              streamTextRef.current = "";
              flush();
              setSendLabel("Đang viết câu trả lời…");
            } else if (ev.t === "status") {
              setSendLabel(
                ev.s === "search"
                  ? "Đang tìm kiếm web…"
                  : ev.s === "tool"
                    ? "Đang làm việc…"
                    : "Đang suy nghĩ…",
              );
            } else if (ev.t === "confirm" || ev.t === "action") { // >>> water_agent
              agentActions = [...agentActions, ev];
              const actionsSnapshot = agentActions;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aid ? { ...m, actions: actionsSnapshot } : m,
                ),
              );
            } else if (ev.t === "error") {
              throw new Error(
                ev.detail || "AI đang bận, bạn thử lại sau ít giây nhé.",
              );
            } else if (ev.t === "done") {
              finished = true;
              if (flushTimer) clearTimeout(flushTimer);
              if (ev.conversation_id) setConvId(ev.conversation_id);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aid
                    ? {
                        ...m,
                        content: ev.reply,
                        streaming: false,
                        fresh: false,
                        note: memoNote(ev.memory_events),
                        searched: !!ev.searched,
                        truncated: !!ev.truncated,
                        actions:
                          ev.actions && ev.actions.length
                            ? ev.actions
                            : agentActions, // >>> water_agent
                      }
                    : m,
                ),
              );
              haptic("success");
            }
          }
        }
      } finally {
        if (flushTimer) clearTimeout(flushTimer);
      }
      if (!finished)
        throw new Error("Kết nối bị ngắt giữa chừng, bạn thử lại nhé.");
    },
    [apiBase, token],
  );

  // Đường cũ (không stream): dùng cho khiếu nại check-in hoặc khi máy chủ chưa có /api/chat/stream
  const runPlain = useCallback(
    async (reqBody, signal) => {
      const doFetch = authFetch || fetch;
      const res = await doFetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(reqBody),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 410 && inAppealRef.current) onAppealChange?.(null); // ảnh tạm đã hết hạn / khiếu nại đã đóng
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Không gửi được tin nhắn, bạn thử lại nhé.",
        );
      }
      if (data.conversation_id) setConvId(data.conversation_id);
      // Quyết định của AI về khiếu nại: duyệt -> hiện nút chọn ml / xác nhận; từ chối -> đóng khiếu nại
      const ap =
        data.appeal &&
        appealRef.current &&
        data.appeal.id === appealRef.current.id
          ? data.appeal
          : null;
      if (ap) {
        if (ap.status === "rejected") onAppealChange?.(null);
        else
          onAppealChange?.({
            ...appealRef.current,
            status: ap.status,
            goodwill: !!ap.goodwill,
            containerType: ap.container_type || appealRef.current.containerType,
            maxVolume: ap.max_volume || appealRef.current.maxVolume,
            expiresAt:
              Date.now() + Math.max(0, (ap.expires_in || 0) - 20) * 1000,
          });
      }
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: data.reply,
          note: memoNote(data.memory_events),
          fresh: true,
          searched: !!data.searched,
          appealCard: ap?.status === "approved",
          appealId: ap?.id,
        },
      ]);
      haptic("success");
    },
    [authFetch, apiBase, token, onAppealChange],
  );

  // Gửi `history` (kết thúc bằng tin của người dùng) lên AI. Dùng chung cho Gửi / Tạo lại / Tiếp tục / Sửa tin.
  const runChat = useCallback(
    async (history) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      const hasFile = (history[history.length - 1]?.files || []).length > 0;
      setSendLabel(
        hasFile
          ? "Đang đọc tệp…"
          : prefs.webSearch
            ? "Đang tìm kiếm…"
            : prefs.thinking
              ? "Đang suy nghĩ…"
              : "Đang trả lời…",
      );
      streamTextRef.current = "";
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let aid = null;
      try {
        // Bỏ tin lỗi / tin rỗng, lấy MAX_SEND tin gần nhất; chỉ giữ MAX_FILES tệp mới nhất
        const recent = history
          .filter((m) => !m.isError && !(m.role === "assistant" && !m.content))
          .slice(-MAX_SEND);
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
          attachments: (attachKeep.get(i) || []).map(
            ({ name, mime, data }) => ({ name, mime, data }),
          ),
        }));
        const appealId =
          inAppealRef.current && appealRef.current?.status === "open"
            ? appealRef.current.id
            : undefined;
        const reqBody = {
          messages: payload,
          conversation_id: convIdRef.current,
          model: prefs.model,
          thinking: prefs.thinking,
          web_search: prefs.webSearch,
          agent: agentKey, // backend đổi tên + tính cách AI theo agent
          agent_name: agentName, // dự phòng: backend khớp theo tên nếu key không trùng
          appeal_id: appealId, // đang giải thích cho check-in bị từ chối -> server tự đính kèm lại ảnh tạm cho AI xem
          inbox_context: inboxCtxRef.current || undefined, // đang trò chuyện về một thông báo hộp thư
        };

        if (appealId) {
          await runPlain(reqBody, ctrl.signal);
        } else {
          aid = nextId();
          setMessages((prev) => [
            ...prev,
            { id: aid, role: "assistant", content: "", streaming: true },
          ]);
          try {
            await runStream(reqBody, ctrl.signal, aid);
          } catch (e) {
            if (!e?.fallback) throw e;
            setMessages((prev) => prev.filter((m) => m.id !== aid)); // máy chủ chưa hỗ trợ stream -> chạy kiểu cũ
            aid = null;
            await runPlain(reqBody, ctrl.signal);
          }
        }
      } catch (e) {
        const aborted = e?.name === "AbortError" || ctrl.signal.aborted;
        if (aborted) {
          // Người dùng bấm Dừng: giữ phần đã viết (nếu có), bỏ bong bóng trống
          const partial = streamTextRef.current;
          setMessages((prev) =>
            prev
              .map((m) =>
                m.id === aid
                  ? {
                      ...m,
                      content: partial || m.content,
                      streaming: false,
                      stopped: true,
                    }
                  : m,
              )
              .filter((m) => !(m.id === aid && !m.content)),
          );
        } else {
          setMessages((prev) => [
            ...prev.filter((m) => !(m.id === aid && !m.content)),
            {
              id: nextId(),
              role: "assistant",
              isError: true,
              retry: true,
              content:
                e?.message || "Lỗi kết nối, bạn kiểm tra mạng rồi thử lại nhé.",
            },
          ]);
        }
      } finally {
        sendingRef.current = false;
        abortRef.current = null;
        setSending(false);
        setMessages((prev) =>
          prev.some((m) => m.streaming)
            ? prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
            : prev,
        );
        scrollToEnd();
      }
    },
    [prefs, agentKey, agentName, runStream, runPlain, scrollToEnd],
  );

  const send = useCallback(
    async (override) => {
      const fromChip = typeof override === "string";
      const text = (fromChip ? override : input).trim();
      if ((!text && pending.length === 0) || sendingRef.current) return;
      haptic();
      try {
        // Đọc tệp -> base64 (giữ trong tin nhắn để các câu hỏi tiếp theo vẫn "nhớ" tệp)
        const files = [];
        for (const f of pending) {
          const data = await new ExpoFile(f.uri).base64();
          if (data.length * 0.75 > MAX_FILE_BYTES) {
            throw new Error(
              `"${f.name}" vượt quá 5MB, bạn chọn tệp nhỏ hơn nhé.`,
            );
          }
          files.push({
            name: f.name,
            mime: f.mime,
            data,
            uri: f.mime.startsWith("image/") ? f.uri : undefined,
          });
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
        runChat(history);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            isError: true,
            content: e?.message || "Không đọc được tệp, bạn thử lại nhé.",
          },
        ]);
      }
    },
    [input, pending, scrollToEnd, runChat],
  );

  // ── Nút Dừng: ngắt kết nối -> server huỷ lượt gọi Claude luôn (không tốn thêm token) ──
  const stopStream = useCallback(() => {
    haptic();
    abortRef.current?.abort();
  }, []);

  // ── Tạo lại câu trả lời cuối ──
  const regenerate = useCallback(
    (item) => {
      if (sendingRef.current) return;
      const list = messagesRef.current;
      const idx = list.findIndex((m) => m.id === item.id);
      if (idx < 1 || idx !== list.length - 1 || list[idx - 1].role !== "user")
        return;
      haptic();
      const history = list.slice(0, idx);
      setMessages(history);
      atBottomRef.current = true;
      runChat(history);
    },
    [runChat],
  );

  // ── Tiếp tục khi câu trả lời bị cắt / đã bấm Dừng ──
  const continueReply = useCallback(() => {
    if (sendingRef.current) return;
    haptic();
    const history = [
      ...messagesRef.current,
      {
        id: nextId(),
        role: "user",
        content: "Hãy viết tiếp từ chỗ đang dừng, đừng lặp lại phần đã viết.",
        files: [],
      },
    ];
    setMessages(history);
    atBottomRef.current = true;
    runChat(history);
  }, [runChat]);

  // ── Sửa tin đã gửi: đưa lại vào ô nhập, bỏ tin đó và mọi tin sau nó ──
  const editMessage = useCallback((item) => {
    if (sendingRef.current) return;
    const list = messagesRef.current;
    const idx = list.findIndex((m) => m.id === item.id);
    if (idx < 0) return;
    haptic();
    setMessages(list.slice(0, idx));
    setInput(item.content || "");
    setPending(
      (item.files || [])
        .filter((f) => f.uri && f.mime?.startsWith("image/"))
        .map((f) => ({ name: f.name, mime: f.mime, size: 0, uri: f.uri })),
    );
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  // ── Chia sẻ câu trả lời ──
  const shareReply = useCallback(async (item) => {
    haptic("select");
    try {
      await Share.share({ message: replyText(stripSvg(item.content)) });
    } catch {}
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Bắt đầu cuộc trò chuyện mới (cuộc cũ vẫn nằm trong Lịch sử)
  const newChat = useCallback(() => {
    if (sending) return;
    setMessages([]);
    setPending([]);
    setConvId(null);
    setInAppeal(false);
    seededRef.current = null; // mở lại chat vẫn có thể quay về khiếu nại còn hạn
    inboxCtxRef.current = null;
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
    inboxCtxRef.current = null;
    setPanel(null);
  }, [agentKey]);

  const shown = messages;

  const renderItem = useCallback(
    ({ item, index }) => {
      const mine = item.role === "user";
      const canCopy =
        !mine &&
        !item.isError &&
        !!item.content &&
        !item.fresh &&
        !item.streaming;
      if (item.streaming && !item.content) return null; // chưa có chữ nào: footer hiện 3 chấm + trạng thái
      const isLastMsg = index === shown.length - 1;
      const copied = copiedId === item.id;
      const prev = shown[index - 1];
      const next = shown[index + 1];
      const firstOfGroup = !prev || prev.role !== item.role;
      const lastOfGroup = !next || next.role !== item.role;
      const colMax = mine ? myColMax : aiColMax;
      const wide =
        !!item.content &&
        !item.isError &&
        (WIDE_CONTENT.test(item.content) ||
          (mine && splitUserCode(item.content).some((b) => b.t === "code")));
      const choicesData =
        !mine && !item.isError && !item.fresh && isLastMsg && !sending && item.content
          ? extractChoices(item.content).choices
          : null;
      const showConfirm =
        !mine && !item.isError && !item.fresh && isLastMsg && !sending && !!item.content && GCONFIRM_RE.test(item.content);
      const nextQs =
        !mine &&
        !item.isError &&
        !item.fresh &&
        isLastMsg &&
        !sending &&
        item.content
          ? parseReply(extractFromAttrs(extractChoices(item.content).text).text).next
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
              <Image
                source={avatar}
                fadeDuration={0}
                resizeMethod="scale"
                style={[styles.msgAvatar, avatarStyle]}
              />
            ) : (
              <View style={styles.msgAvatarSpacer} />
            ))}
          <View
            style={[
              styles.msgCol,
              {
                alignItems: mine ? "flex-end" : "flex-start",
                maxWidth: colMax,
              },
            ]}
          >
            <View
              style={[
                styles.bubble,
                { maxWidth: colMax },
                wide && { width: colMax },
                mine
                  ? [
                      { backgroundColor: colors.primary },
                      lastOfGroup && { borderBottomRightRadius: 6 },
                      !firstOfGroup && { borderTopRightRadius: 6 },
                    ]
                  : [
                      {
                        backgroundColor: item.isError
                          ? "rgba(239,68,68,0.12)"
                          : colors.card,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: item.isError
                          ? "rgba(239,68,68,0.4)"
                          : colors.border,
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
                      <Image
                        key={`${f.name}-${i}`}
                        source={{ uri: f.uri }}
                        style={styles.msgImg}
                      />
                    ) : (
                      <View
                        key={`${f.name}-${i}`}
                        style={[
                          styles.fileCard,
                          {
                            backgroundColor: mine
                              ? "rgba(255,255,255,0.2)"
                              : colors.primarySoft,
                          },
                        ]}
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={18}
                          color={mine ? "#ffffff" : colors.primary}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.fileCardText,
                            { color: mine ? "#ffffff" : colors.text },
                          ]}
                        >
                          {f.name}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              )}
              {!!item.content &&
                (mine && !item.isError ? (
                  <UserBody content={item.content} colors={colors} />
                ) : item.isError ? (
                  <Text
                    selectable
                    style={[
                      styles.bubbleText,
                      {
                        color: mine
                          ? "#ffffff"
                          : item.isError
                            ? "#ef4444"
                            : colors.text,
                      },
                    ]}
                  >
                    {item.content}
                  </Text>
                ) : (
                  <AssistantBody
                    content={item.content}
                    fresh={!!item.fresh}
                    streaming={!!item.streaming}
                    colors={colors}
                    ctx={exportCtx}
                    onDone={() => markDone(item.id)}
                  />
                ))}
              {!!item.searched && (
                <View style={styles.searchedRow}>
                  <Ionicons
                    name="globe-outline"
                    size={13}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.searchedText, { color: colors.textMuted }]}
                  >
                    Đã tra cứu web
                  </Text>
                </View>
              )}
              {!!item.note && (
                <View
                  style={[
                    styles.noteBox,
                    { backgroundColor: colors.primarySoft },
                  ]}
                >
                  <Text
                    style={[styles.noteText, { color: colors.primaryText }]}
                  >
                    {item.note}
                  </Text>
                </View>
              )}
              {!!item.actions?.length && ( // >>> water_agent
                <AgentActionCards
                  actions={item.actions}
                  colors={colors}
                  api={api}
                />
              )}
            </View>

            {item.isError && item.retry && isLastMsg && !sending && (
              <TouchableOpacity
                onPress={() => {
                  const list = messagesRef.current.filter(
                    (m) => m.id !== item.id,
                  );
                  if (list[list.length - 1]?.role !== "user") return;
                  haptic();
                  setMessages(list);
                  runChat(list);
                }}
                style={styles.actionRow}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={15} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>
                  Thử lại
                </Text>
              </TouchableOpacity>
            )}
            {mine &&
              !sending &&
              !item.isError &&
              (item.content || "").length > 0 && (
                <View
                  style={[
                    styles.actionRow,
                    { alignSelf: "flex-end", marginRight: 4 },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => editMessage(item)}
                    hitSlop={8}
                    style={styles.actionBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Sửa tin đã gửi"
                  >
                    <Ionicons
                      name="create-outline"
                      size={15}
                      color={colors.textMuted}
                    />
                    <Text
                      style={[styles.actionText, { color: colors.textMuted }]}
                    >
                      Sửa
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            {!mine &&
              item.appealCard &&
              !item.fresh &&
              appeal?.status === "approved" &&
              appeal.id === item.appealId &&
              appeal.goodwill && (
                <View
                  style={[
                    styles.noteBox,
                    {
                      backgroundColor: colors.primarySoft,
                      alignSelf: "flex-start",
                    },
                  ]}
                >
                  <Text
                    style={[styles.noteText, { color: colors.primaryText }]}
                  >
                    🎁 Cơ hội đặc biệt hôm nay
                    {appeal.kind === "water" && appeal.maxVolume
                      ? ` · tối đa ${appeal.maxVolume} ml`
                      : ""}
                  </Text>
                </View>
              )}
            {!mine &&
              item.appealCard &&
              !item.fresh &&
              appeal?.status === "approved" &&
              appeal.id === item.appealId && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => onAppealApproved?.(appeal)}
                  style={[
                    styles.appealBtn,
                    { backgroundColor: colors.primary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    appeal.kind === "water"
                      ? "Chọn lượng nước và gửi bù"
                      : "Xác nhận hoàn thành mục tiêu"
                  }
                >
                  <Ionicons
                    name={
                      appeal.kind === "water" ? "water" : "checkmark-circle"
                    }
                    size={18}
                    color="#ffffff"
                  />
                  <Text style={styles.appealBtnText}>
                    {appeal.kind === "water"
                      ? "Chọn lượng nước & gửi bù"
                      : "Xác nhận hoàn thành mục tiêu"}
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
                  <Text
                    style={[
                      styles.actionText,
                      { color: copied ? colors.primary : colors.textMuted },
                    ]}
                  >
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
                  <Ionicons
                    name="sparkles-outline"
                    size={15}
                    color={colors.textMuted}
                  />
                  <Text
                    style={[styles.actionText, { color: colors.textMuted }]}
                  >
                    Thông minh
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => shareReply(item)}
                  hitSlop={8}
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Chia sẻ"
                >
                  <Ionicons
                    name="share-outline"
                    size={16}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
                {isLastMsg && !sending && !item.appealId && (
                  <TouchableOpacity
                    onPress={() => regenerate(item)}
                    hitSlop={8}
                    style={styles.actionBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Tạo lại câu trả lời"
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={16}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {!mine &&
              !sending &&
              isLastMsg &&
              (item.truncated || item.stopped) && (
                <TouchableOpacity
                  onPress={continueReply}
                  activeOpacity={0.8}
                  style={[
                    styles.contBtn,
                    {
                      borderColor: colors.primaryBorder,
                      backgroundColor: colors.card,
                    },
                  ]}
                >
                  <Ionicons
                    name="play-forward-outline"
                    size={15}
                    color={colors.primary}
                  />
                  <Text
                    style={{
                      color: colors.primary,
                      fontWeight: "700",
                      fontSize: 13,
                      marginLeft: 6,
                    }}
                  >
                    {item.stopped ? "Viết tiếp" : "Tiếp tục"}
                  </Text>
                </TouchableOpacity>
              )}
            {choicesData && (
              <ChoiceButtons choices={choicesData} colors={colors} onPick={(o) => send(o)} />
            )}
            {nextQs.length > 0 && (
              <View style={styles.nextWrap}>
                {nextQs.map((q) => (
                  <TouchableOpacity
                    key={q}
                    activeOpacity={0.8}
                    onPress={() => send(q)}
                    style={[
                      styles.nextChip,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.primaryBorder,
                      },
                    ]}
                  >
                    <Ionicons
                      name="arrow-forward-circle-outline"
                      size={16}
                      color={colors.primary}
                    />
                    <Text
                      numberOfLines={2}
                      style={[styles.nextText, { color: colors.text }]}
                    >
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      );
    },
    [
      colors,
      exportCtx,
      avatar,
      avatarStyle,
      copiedId,
      quickCopy,
      shown,
      sending,
      send,
      exportCtx,
      markDone,
      appeal,
      onAppealApproved,
      aiColMax,
      myColMax,
      shareReply,
      regenerate,
      continueReply,
      editMessage,
      runChat,
    ],
  );

  const empty = (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyGlow, { backgroundColor: colors.primarySoft }]}>
        <Image
          source={emptyImage.source}
          fadeDuration={0}
          resizeMethod="scale"
          style={[styles.emptyAvatar, emptyImage.style]}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {agentText.emptyTitle}
      </Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        {agentText.emptySub}
      </Text>
    </View>
  );

  const canSend = (!!input.trim() || pending.length > 0) && !sending;
  const attachFull = pending.length >= MAX_FILES;
  const sections = useMemo(
    () => groupConvs(convs, histQuery),
    [convs, histQuery],
  );

  if (!mounted) return null;

  return (
    <View style={styles.host}>
      <Animated.View
        renderToHardwareTextureAndroid={opening}
        style={[
          styles.fill,
          {
            opacity: anim.wrapOpacity,
            transform: [{ translateX: swipeX }, { scale: anim.wrapScale }],
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
          <Animated.View style={{ flex: 1, opacity: anim.bodyOpacity }}>
            <KeyboardAvoidingView
              style={[styles.container, { backgroundColor: colors.background }]}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              {/* Header */}
              <Animated.View
                style={[
                  styles.header,
                  { transform: [{ translateY: anim.headerY }] },
                  {
                    paddingTop: insets.top + 8,
                    backgroundColor: colors.card,
                    borderBottomColor: colors.border,
                  },
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
                <Image
                  source={avatar}
                  fadeDuration={0}
                  resizeMethod="scale"
                  style={[styles.headerAvatar, avatarStyle]}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[styles.headerTitle, { color: colors.text }]}
                  >
                    {agentName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.headerSub, { color: colors.textMuted }]}
                  >
                    {sending
                      ? sendLabel
                      : inAppeal && appeal?.status === "open"
                        ? "Đang xem lại ảnh check-in"
                        : "Hỏi đáp · Học tập · Tạo nội dung"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openInbox}
                  hitSlop={8}
                  style={styles.headerBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Thông báo"
                >
                  <Ionicons
                    name={inbox?.unread ? "notifications" : "notifications-outline"}
                    size={22}
                    color={inbox?.unread ? colors.primary : colors.textMuted}
                  />
                  {inbox?.unread > 0 && (
                    <View style={styles.bellBadge}>
                      <Text style={styles.bellBadgeText}>
                        {inbox.unread > 9 ? "9+" : inbox.unread}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openMemory}
                  hitSlop={8}
                  style={styles.headerBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Ghi nhớ"
                >
                  <Ionicons
                    name="bulb-outline"
                    size={22}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openHistory}
                  hitSlop={8}
                  style={styles.headerBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Lịch sử chat"
                >
                  <Ionicons
                    name="time-outline"
                    size={23}
                    color={colors.textMuted}
                  />
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
                    color={
                      sending || (messages.length === 0 && !convId)
                        ? colors.border
                        : colors.textMuted
                    }
                  />
                </TouchableOpacity>
              </Animated.View>

              {/* Danh sách tin nhắn */}
              <FlatList
                ref={listRef}
                onLayout={(e) => {
                  const w = Math.round(e.nativeEvent.layout.width);
                  setListW((p) => (p === w ? p : w));
                }}
                data={shown}
                keyExtractor={(m) => m.id}
                renderItem={renderItem}
                ListEmptyComponent={empty}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onContentSizeChange={() => atBottomRef.current && scrollToEnd()}
                onScroll={(e) => {
                  const { contentOffset, layoutMeasurement, contentSize } =
                    e.nativeEvent;
                  atBottomRef.current =
                    contentOffset.y + layoutMeasurement.height >=
                    contentSize.height - 140;
                  const away =
                    contentOffset.y + layoutMeasurement.height <
                    contentSize.height - 320;
                  setShowJump((p) => (p === away ? p : away));
                }}
                scrollEventThrottle={32}
                showsVerticalScrollIndicator={false}
                ListFooterComponent={
                  sending &&
                  !(
                    shown[shown.length - 1]?.streaming &&
                    shown[shown.length - 1]?.content
                  ) ? (
                    <View style={[styles.msgRow, styles.rowAi]}>
                      <Image
                        source={avatar}
                        fadeDuration={0}
                        resizeMethod="scale"
                        style={[styles.msgAvatar, avatarStyle]}
                      />
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
                        <View
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          <ThinkingDots color={colors.primary} />
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 13,
                              marginLeft: 10,
                            }}
                          >
                            {sendLabel}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : null
                }
              />

              {showJump && shown.length > 0 && (
                <View
                  pointerEvents="box-none"
                  style={[styles.jumpWrap, { bottom: composerH + 10 }]}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      haptic("select");
                      atBottomRef.current = true;
                      scrollToEnd();
                    }}
                    style={[
                      styles.jumpBtn,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Cuộn xuống cuối"
                  >
                    <Ionicons name="arrow-down" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Ô soạn tin: thẻ bo tròn, ô nhập ở trên – hàng công cụ ở dưới, giãn cách thoáng */}
              <Animated.View
                onLayout={(e) =>
                  setComposerH(Math.round(e.nativeEvent.layout.height))
                }
                style={[
                  styles.composerWrap,
                  {
                    paddingBottom: Math.max(insets.bottom, 10),
                    transform: [{ translateY: anim.composerY }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.composer,
                    {
                      backgroundColor: colors.card,
                      borderColor: focused
                        ? colors.primaryBorder
                        : colors.border,
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
                          <View
                            key={`${f.name}-${i}`}
                            style={styles.pendingItem}
                          >
                            {isImg ? (
                              <Image
                                source={{ uri: f.uri }}
                                style={[
                                  styles.pendingImg,
                                  { borderColor: colors.border },
                                ]}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.pendingFile,
                                  {
                                    backgroundColor: colors.primarySoft,
                                    borderColor: colors.primaryBorder,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name="document-text-outline"
                                  size={22}
                                  color={colors.primary}
                                />
                                <Text
                                  numberOfLines={2}
                                  style={[
                                    styles.pendingFileText,
                                    { color: colors.primary },
                                  ]}
                                >
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
                              <Ionicons
                                name="close"
                                size={13}
                                color="#ffffff"
                              />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}

                  <TextInput
                    ref={inputRef}
                    style={[styles.input, { color: colors.text }]}
                    value={input}
                    onChangeText={setInput}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={
                      inAppeal && appeal?.status === "open"
                        ? agentText.appealPlaceholder
                        : agentText.placeholder
                    }
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
                      style={[
                        styles.toolBtn,
                        { backgroundColor: colors.primarySoft },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Thêm tệp và công cụ"
                    >
                      <Ionicons
                        name="add"
                        size={22}
                        color={sending ? colors.border : colors.primary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={pickFromLibrary}
                      disabled={sending || attachFull}
                      hitSlop={6}
                      activeOpacity={0.7}
                      style={[
                        styles.toolBtn,
                        { backgroundColor: colors.primarySoft },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Thêm ảnh từ thư viện"
                    >
                      <Ionicons
                        name="image-outline"
                        size={20}
                        color={
                          sending || attachFull ? colors.border : colors.primary
                        }
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={takePhoto}
                      disabled={sending || attachFull}
                      hitSlop={6}
                      activeOpacity={0.7}
                      style={[
                        styles.toolBtn,
                        { backgroundColor: colors.primarySoft },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Chụp ảnh gửi AI"
                    >
                      <Ionicons
                        name="camera-outline"
                        size={21}
                        color={
                          sending || attachFull ? colors.border : colors.primary
                        }
                      />
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
                        <ModeChip
                          icon="globe-outline"
                          label="Web"
                          colors={colors}
                          onClear={() => updatePrefs({ webSearch: false })}
                        />
                      )}
                      {prefs.thinking && (
                        <ModeChip
                          icon="bulb-outline"
                          label="Suy nghĩ sâu"
                          colors={colors}
                          onClear={() => updatePrefs({ thinking: false })}
                        />
                      )}
                      {prefs.model !== "fast" && (
                        <ModeChip
                          icon={
                            CHAT_MODELS.find((m) => m.key === prefs.model)
                              ?.icon || "options-outline"
                          }
                          label={
                            CHAT_MODELS.find((m) => m.key === prefs.model)
                              ?.label || ""
                          }
                          colors={colors}
                          onClear={() => updatePrefs({ model: "fast" })}
                        />
                      )}
                    </ScrollView>

                    {sending ? (
                      <TouchableOpacity
                        onPress={stopStream}
                        activeOpacity={0.8}
                        style={[
                          styles.sendBtn,
                          { backgroundColor: colors.primary },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Dừng"
                      >
                        <Ionicons name="square" size={14} color="#ffffff" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => send()}
                        disabled={!canSend}
                        activeOpacity={0.8}
                        style={[
                          styles.sendBtn,
                          {
                            backgroundColor: canSend
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Gửi"
                      >
                        <Ionicons name="arrow-up" size={20} color="#ffffff" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Animated.View>

              <ChatPlusSheet
                visible={plusOpen}
                prefs={prefs}
                onChangePrefs={updatePrefs}
                apiBase={apiBase} // >>> skills
                token={token}
                authFetch={authFetch}
                attachFull={pending.length >= MAX_FILES}
                onClose={() => setPlusOpen(false)}
                onPickFile={() => {
                  setPlusOpen(false);
                  setTimeout(pickFiles, 280); // chờ bảng trượt xuống rồi mới mở chọn tệp (iOS)
                }}
                onOpenGoogle={() => {
                  // ChatPlusSheet có thể gọi prop này để mở mục "Tài khoản Google" (xem HUONG-DAN.md)
                  setPlusOpen(false);
                  setTimeout(() => setGoogleOpen(true), 280);
                }}
              />
              <GoogleAccountSheet
                visible={googleOpen}
                onClose={() => setGoogleOpen(false)}
                colors={colors}
                ctx={exportCtx}
              />
              <SmartCopySheet
                visible={copyOpen}
                text={stripSvg(copyMsg?.content)}
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
                    {
                      backgroundColor: colors.background,
                      paddingBottom: Math.max(insets.bottom, 10),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.header,
                      {
                        paddingTop: insets.top + 8,
                        backgroundColor: colors.card,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => setPanel(null)}
                      hitSlop={10}
                      style={styles.headerBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Quay lại"
                    >
                      <Ionicons
                        name="chevron-back"
                        size={26}
                        color={colors.text}
                      />
                    </TouchableOpacity>
                    <Text
                      style={[
                        styles.headerTitle,
                        { color: colors.text, flex: 1, marginLeft: 6 },
                      ]}
                    >
                      {panel === "history"
                        ? "Lịch sử chat"
                        : panel === "inbox"
                          ? "Thông báo"
                          : agentText.memoryTitle}
                    </Text>
                    {panel === "memory" && memories.length > 0 && (
                      <TouchableOpacity
                        onPress={clearMemory}
                        hitSlop={8}
                        style={styles.panelAction}
                      >
                        <Text
                          style={{
                            color: "#ef4444",
                            fontWeight: "700",
                            fontSize: 13.5,
                          }}
                        >
                          Quên hết
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {panelLoading ? (
                    <View style={styles.panelCenter}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : panelError ? (
                    <View style={styles.panelCenter}>
                      <Text style={[styles.panelEmpty, { color: "#ef4444" }]}>
                        {panelError}
                      </Text>
                      <TouchableOpacity
                        onPress={panel === "history" ? openHistory : openMemory}
                        style={[
                          styles.retryBtn,
                          {
                            backgroundColor: colors.primarySoft,
                            borderColor: colors.primaryBorder,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: colors.primaryText,
                            fontWeight: "700",
                          }}
                        >
                          Thử lại
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : panel === "history" ? (
                    <View style={{ flex: 1 }}>
                      <View style={styles.histTop}>
                        <View
                          style={[
                            styles.searchBox,
                            {
                              backgroundColor: colors.card,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name="search"
                            size={18}
                            color={colors.textMuted}
                          />
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
                            <TouchableOpacity
                              onPress={() => setHistQuery("")}
                              hitSlop={8}
                              accessibilityLabel="Xoá tìm kiếm"
                            >
                              <Ionicons
                                name="close-circle"
                                size={18}
                                color={colors.textMuted}
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={newChat}
                          disabled={sending}
                          style={[
                            styles.newChatBtn,
                            { backgroundColor: colors.primary },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Cuộc trò chuyện mới"
                        >
                          <Ionicons name="add" size={20} color="#ffffff" />
                          <Text style={styles.newChatText}>Mới</Text>
                        </TouchableOpacity>
                      </View>
                      <View
                        style={[
                          styles.retainNote,
                          { backgroundColor: colors.primarySoft },
                        ]}
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={16}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.retainText,
                            { color: colors.primaryText },
                          ]}
                        >
                          Lịch sử chỉ được giữ 2 ngày, sau đó tự động xoá. Phần
                          "Ghi nhớ" vẫn được giữ lại.
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
                            <View
                              style={[
                                styles.histEmptyIcon,
                                { backgroundColor: colors.primarySoft },
                              ]}
                            >
                              <Ionicons
                                name={
                                  histQuery
                                    ? "search-outline"
                                    : "chatbubbles-outline"
                                }
                                size={30}
                                color={colors.primary}
                              />
                            </View>
                            <Text
                              style={[
                                styles.histEmptyTitle,
                                { color: colors.text },
                              ]}
                            >
                              {histQuery
                                ? "Không thấy kết quả"
                                : "Chưa có cuộc trò chuyện nào"}
                            </Text>
                            <Text
                              style={[
                                styles.panelEmpty,
                                { color: colors.textMuted, marginTop: 4 },
                              ]}
                            >
                              {histQuery
                                ? "Thử từ khoá khác nhé."
                                : agentText.historyEmpty}
                            </Text>
                          </View>
                        }
                        renderSectionHeader={({ section }) => (
                          <View style={styles.sectionHead}>
                            <Text
                              style={[
                                styles.sectionTitle,
                                { color: colors.textMuted },
                              ]}
                            >
                              {section.title}
                            </Text>
                            <Text
                              style={[
                                styles.sectionCount,
                                { color: colors.textMuted },
                              ]}
                            >
                              {section.data.length}
                            </Text>
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
                                  backgroundColor: active
                                    ? colors.primarySoft
                                    : colors.card,
                                  borderColor: active
                                    ? colors.primaryBorder
                                    : colors.border,
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.convIcon,
                                  {
                                    backgroundColor: active
                                      ? colors.card
                                      : colors.primarySoft,
                                  },
                                ]}
                              >
                                <Ionicons
                                  name="chatbubble-ellipses-outline"
                                  size={19}
                                  color={colors.primary}
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  numberOfLines={2}
                                  style={[
                                    styles.convTitle,
                                    { color: colors.text },
                                  ]}
                                >
                                  {c.title}
                                </Text>
                                <View style={styles.convMetaRow}>
                                  <Ionicons
                                    name="time-outline"
                                    size={12}
                                    color={colors.textMuted}
                                  />
                                  <Text
                                    style={[
                                      styles.convMeta,
                                      { color: colors.textMuted },
                                    ]}
                                  >
                                    {c.when}
                                  </Text>
                                  {active && (
                                    <View
                                      style={[
                                        styles.activePill,
                                        { backgroundColor: colors.primary },
                                      ]}
                                    >
                                      <Text style={styles.activePillText}>
                                        Đang mở
                                      </Text>
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
                                <Ionicons
                                  name="trash-outline"
                                  size={19}
                                  color={colors.textMuted}
                                />
                              </TouchableOpacity>
                            </TouchableOpacity>
                          );
                        }}
                      />
                    </View>
                  ) : panel === "inbox" ? (
                    <FlatList
                      data={inbox?.items || []}
                      keyExtractor={(it) => String(it.id)}
                      contentContainerStyle={styles.panelList}
                      ListEmptyComponent={
                        <Text
                          style={[styles.panelEmpty, { color: colors.textMuted }]}
                        >
                          Chưa có thông báo nào 🔔
                        </Text>
                      }
                      renderItem={({ item: it }) => {
                        const unread = isInboxUnread(it);
                        return (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => startInboxChat(it)}
                            style={[
                              styles.rowCard,
                              {
                                backgroundColor: unread
                                  ? colors.primarySoft
                                  : colors.card,
                                borderColor: unread
                                  ? colors.primaryBorder
                                  : colors.border,
                              },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Mở thông báo để trò chuyện"
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.rowSub,
                                  { color: colors.textMuted, marginBottom: 2 },
                                ]}
                              >
                                {INBOX_LABEL[it.kind] || "Thông báo"}
                                {it.from ? ` · ${it.from}` : ""}
                              </Text>
                              <Text
                                numberOfLines={3}
                                style={[styles.rowTitle, { color: colors.text }]}
                              >
                                {it.text}
                              </Text>
                            </View>
                            {unread && (
                              <View
                                style={[
                                  styles.unreadDot,
                                  { backgroundColor: colors.primary },
                                ]}
                              />
                            )}
                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color={colors.textMuted}
                            />
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
                        <Text
                          style={[
                            styles.panelHint,
                            { color: colors.textMuted },
                          ]}
                        >
                          {agentText.memoryHint}
                        </Text>
                      }
                      ListEmptyComponent={
                        <Text
                          style={[
                            styles.panelEmpty,
                            { color: colors.textMuted },
                          ]}
                        >
                          Chưa có điều nào được ghi nhớ 🧠
                        </Text>
                      }
                      renderItem={({ item: m }) => (
                        <View
                          style={[
                            styles.rowCard,
                            {
                              backgroundColor: colors.card,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.rowTitle,
                              { color: colors.text, flex: 1 },
                            ]}
                          >
                            {m.text}
                          </Text>
                          <TouchableOpacity
                            onPress={() => deleteMemory(m)}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel="Quên điều này"
                          >
                            <Ionicons
                              name="close-circle"
                              size={22}
                              color={colors.textMuted}
                            />
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
  bellBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 8 },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8 },
  composer: {
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  composerBar: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  modeRow: { alignItems: "center", paddingRight: 8 },
  pendingScroll: { marginBottom: 8, marginTop: 2 },
  edgeStrip: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: 18,
    zIndex: 30,
  },
  codeHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  cell: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  fileBox: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    minWidth: 250,
  },
  fileBoxTop: { flexDirection: "row", alignItems: "center", padding: 10 },
  fileTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  fileBoxName: { fontSize: 14, fontWeight: "800" },
  fileDl: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    marginLeft: 8,
    minWidth: 34,
    justifyContent: "center",
  },
  fileDlText: {
    color: "#fff",
    fontSize: 12.5,
    fontWeight: "800",
    marginLeft: 4,
  },
  filePreview: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
  appealBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  appealBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 7,
  },
  nextWrap: { marginTop: 8, gap: 8, alignItems: "flex-start" },
  nextChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: "100%",
  },
  nextText: { fontSize: 13.5, fontWeight: "600", marginLeft: 6, flexShrink: 1 },
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 990,
    elevation: 28,
  },
  fill: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    marginHorizontal: 8,
  },
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
  codeBlock: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignSelf: "stretch",
    overflow: "hidden",
  },
  codeText: {
    fontFamily: MONO,
    fontSize: 12.5,
    lineHeight: 18,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  codeMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  liRow: { flexDirection: "row", alignItems: "flex-start" },
  liMark: { width: 20, fontWeight: "800" },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  link: { fontWeight: "600", textDecorationLine: "underline" },
  searchedRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  searchedText: { fontSize: 12, fontWeight: "600", marginLeft: 5 },
  thinkDot: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 2.5 },
  errHead: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  errHeadText: {
    color: "#ef4444",
    fontSize: 12.5,
    fontWeight: "800",
    marginLeft: 5,
  },
  msgFiles: { marginBottom: 6 },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  fileCardText: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 8,
    flexShrink: 1,
  },
  noteBox: {
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginTop: 8,
  },
  fileTag: { fontSize: 12.5, fontWeight: "600", marginBottom: 4 },
  noteText: { fontSize: 12.5, fontWeight: "600" },
  panelAction: { paddingHorizontal: 8, height: 36, justifyContent: "center" },
  panelCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  panelList: { padding: 16, flexGrow: 1 },
  panelHint: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  panelEmpty: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 24,
  },
  retryBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
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
  emptyGlow: {
    width: 120,
    height: 120,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyAvatar: { width: 92, height: 92, borderRadius: 28 },
  sugGrid: {
    marginTop: 22,
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  sugCard: {
    width: "48.5%",
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  sugIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  sugText: { fontSize: 13.5, fontWeight: "600", lineHeight: 19 },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptySub: {
    fontSize: 13.5,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },
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
  pendingFile: {
    width: 120,
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
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
  roundBtn: {
    width: 38,
    height: 42,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  histTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14.5, marginLeft: 8, paddingVertical: 0 },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 16,
    paddingLeft: 10,
    paddingRight: 14,
    marginLeft: 10,
  },
  newChatText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 2,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sectionCount: { fontSize: 12, fontWeight: "700" },
  convCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  convIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  convTitle: { fontSize: 14.5, fontWeight: "700", lineHeight: 20 },
  convMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  convMeta: { fontSize: 12, marginLeft: 4 },
  convDel: {
    width: 34,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
  },
  activePill: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
  activePillText: { color: "#ffffff", fontSize: 10.5, fontWeight: "800" },
  retainNote: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  retainText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
    lineHeight: 17,
  },
  histEmpty: { alignItems: "center", paddingTop: 56, paddingHorizontal: 24 },
  histEmptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
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
  pendingText: {
    fontSize: 12.5,
    fontWeight: "600",
    marginRight: 6,
    flexShrink: 1,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  attachBtn: {
    width: 40,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
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
  msgImg: {
    width: 168,
    height: 168,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  actionRow: { flexDirection: "row", marginTop: 4, marginLeft: 4 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    marginRight: 14,
  },
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
  jumpWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  jumpBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  srcChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 6,
    marginTop: 6,
    maxWidth: "100%",
  },
  srcNum: { fontSize: 11.5, fontWeight: "800", marginRight: 5 },
  srcLabel: { fontSize: 12, flexShrink: 1 },
  contBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});