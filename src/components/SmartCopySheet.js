import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import BottomSheet from "./BottomSheet";
import {
  FILE_TYPES,
  copyText,
  createFile,
  extractCode,
  extractTables,
  guessTitle,
  plainText,
  replyText,
  shareFile,
  tablesToTSV,
} from "./chatFiles";

export { copyText }; // giữ tương thích import cũ: import { copyText } from "./SmartCopySheet"

// ── Tiện ích văn bản ────────────────────────────────────────────────────────
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
const LIST_RE = /^\s*(\d+[.)]|[•\-*])\s+/;

// Bỏ emoji + ký hiệu markdown, chuẩn hoá gạch đầu dòng, gọn khoảng trắng
export const cleanText = (t = "") =>
  plainText(t)
    .replace(EMOJI_RE, "")
    .replace(/(\S)[ \t]{2,}/g, "$1 ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Tách câu trả lời thành các khối: mỗi đoạn văn / mỗi mục danh sách là 1 khối
export function splitBlocks(text = "") {
  const blocks = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.text.trim()) blocks.push({ ...cur, text: cur.text.trim() });
    cur = null;
  };
  let inCode = false;
  for (const line of text.split("\n")) {
    if (/^```/.test(line.trim())) {
      if (!inCode) flush();
      inCode = !inCode;
      cur = cur || { kind: "code", text: "" };
      cur.text += (cur.text ? "\n" : "") + line;
      if (!inCode) flush();
      continue;
    }
    if (inCode) {
      cur.text += "\n" + line;
    } else if (!line.trim()) {
      flush();
    } else if (LIST_RE.test(line)) {
      flush();
      cur = { kind: "list", text: line.trim() };
    } else if (cur) {
      cur.text += "\n" + line.trim();
    } else {
      cur = { kind: "para", text: line.trim() };
    }
  }
  flush();
  return blocks.map((b, i) => ({ ...b, id: i }));
}

const joinBlocks = (arr) =>
  arr.reduce((acc, b, i) => {
    if (i === 0) return b.text;
    const sep = arr[i - 1].kind === "list" && b.kind === "list" ? "\n" : "\n\n";
    return acc + sep + b.text;
  }, "");

const REWRITES = [
  { label: "Rút gọn", prompt: "Rút gọn câu trả lời trên, chỉ giữ ý chính." },
  { label: "Dễ hiểu hơn", prompt: "Giải thích lại câu trả lời trên thật đơn giản, dễ hiểu." },
  { label: "Trang trọng", prompt: "Viết lại câu trả lời trên theo văn phong trang trọng, lịch sự." },
  { label: "Thành bảng", prompt: "Trình bày lại câu trả lời trên dưới dạng bảng." },
];

// ── Giao diện ───────────────────────────────────────────────────────────────
const SmartCopySheet = memo(function SmartCopySheet({
  visible,
  text,
  onClose,
  onRewrite,
  apiBase,
  token,
  authFetch,
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const timer = useRef(null);
  const [view, setView] = useState("menu"); // "menu" | "pick" | "file"
  const [done, setDone] = useState(null); // { ok, label }
  const [busy, setBusy] = useState("");
  const [sel, setSel] = useState({});

  const body = useMemo(() => replyText(text || ""), [text]);
  const blocks = useMemo(() => splitBlocks(body), [body]);
  const listBlocks = useMemo(() => blocks.filter((b) => b.kind === "list"), [blocks]);
  const tables = useMemo(() => extractTables(body), [body]);
  const codes = useMemo(() => extractCode(body), [body]);
  const selCount = blocks.filter((b) => sel[b.id]).length;

  // Mỗi lần mở lại -> về menu
  useEffect(() => {
    if (visible) {
      setView("menu");
      setDone(null);
      setBusy("");
      setSel({});
    }
    return () => clearTimeout(timer.current);
  }, [visible]);

  const finish = async (str, label) => {
    const ok = await copyText(str);
    setDone({ ok, label: ok ? label : "Không sao chép được" });
    timer.current = setTimeout(onClose, ok ? 750 : 1300);
  };

  const makeFile = async (format) => {
    const t = FILE_TYPES[format];
    setBusy(`Đang tạo file ${t.label}…`);
    try {
      const f = await createFile({
        apiBase,
        token,
        authFetch,
        format,
        title: guessTitle(body),
        content: body,
      });
      setBusy("");
      onClose();
      // chờ sheet trượt xuống xong mới mở bảng chia sẻ (iOS không cho 2 lớp cùng lúc)
      setTimeout(() => shareFile(f).catch(() => {}), 400);
    } catch (e) {
      setBusy("");
      setDone({ ok: false, label: e?.message || "Không tạo được file" });
      timer.current = setTimeout(() => setDone(null), 1800);
    }
  };

  const Row = ({ icon, title, sub, onPress, last, disabled }) => (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        disabled={disabled}
        style={[styles.row, disabled && { opacity: 0.4 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
          {!!sub && <Text style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.border} />
      </TouchableOpacity>
      {!last && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
    </>
  );

  const Card = ({ children }) => (
    <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>{children}</View>
  );

  const copyRows = [
    {
      icon: "copy-outline",
      title: "Sao chép toàn bộ",
      sub: `${body.length} ký tự`,
      onPress: () => finish(body, "Đã sao chép toàn bộ"),
    },
    {
      icon: "sparkles-outline",
      title: "Văn bản sạch",
      sub: "Bỏ emoji và ký hiệu markdown – dán vào ghi chú / bài viết",
      onPress: () => finish(cleanText(body), "Đã sao chép văn bản sạch"),
    },
    tables.length > 0 && {
      icon: "grid-outline",
      title: "Chỉ phần bảng",
      sub: "Dán thẳng vào Excel / Google Sheets",
      onPress: () => finish(tablesToTSV(tables), "Đã sao chép bảng"),
    },
    codes.length > 0 && {
      icon: "code-slash-outline",
      title: "Chỉ phần code",
      sub: `${codes.length} khối code`,
      onPress: () => finish(codes.join("\n\n"), "Đã sao chép code"),
    },
    listBlocks.length >= 2 && {
      icon: "list-outline",
      title: "Chỉ phần danh sách",
      sub: `${listBlocks.length} mục`,
      onPress: () => finish(listBlocks.map((b) => b.text).join("\n"), "Đã sao chép danh sách"),
    },
    blocks.length > 1 && {
      icon: "checkbox-outline",
      title: "Chọn đoạn để sao chép",
      sub: "Tích chọn từng đoạn / từng mục",
      onPress: () => setView("pick"),
    },
  ].filter(Boolean);

  const maxPick = height * 0.45;

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.88}>
      {busy ? (
        <View style={styles.doneWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.doneText, { color: colors.text }]}>{busy}</Text>
        </View>
      ) : done ? (
        <View style={styles.doneWrap}>
          <Ionicons
            name={done.ok ? "checkmark-circle" : "alert-circle"}
            size={46}
            color={done.ok ? colors.primary : "#ef4444"}
          />
          <Text style={[styles.doneText, { color: colors.text }]}>{done.label}</Text>
        </View>
      ) : view === "menu" ? (
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={[styles.title, { color: colors.text }]}>Sao chép thông minh</Text>

          <Text style={[styles.section, { color: colors.textMuted }]}>Sao chép</Text>
          <Card>
            {copyRows.map((r, i) => (
              <Row key={r.title} {...r} last={i === copyRows.length - 1} />
            ))}
          </Card>

          <Text style={[styles.section, { color: colors.textMuted }]}>Tạo file & chia sẻ</Text>
          <Card>
            <Row
              icon="document-text-outline"
              title="Tạo file…"
              sub="Word, Excel, CSV, Markdown, văn bản"
              onPress={() => setView("file")}
            />
            <Row
              icon="share-outline"
              title="Chia sẻ…"
              sub="Gửi sang ứng dụng khác"
              onPress={() => {
                Share.share({ message: body }).catch(() => {});
                onClose();
              }}
              last
            />
          </Card>

          {!!onRewrite && (
            <>
              <Text style={[styles.section, { color: colors.textMuted }]}>Nhờ Tiểu Đậu chỉnh lại</Text>
              <View style={styles.chipsWrap}>
                {REWRITES.map((r) => (
                  <TouchableOpacity
                    key={r.label}
                    activeOpacity={0.8}
                    onPress={() => {
                      onClose();
                      onRewrite(r.prompt);
                    }}
                    style={[styles.chip, { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }]}
                  >
                    <Text style={[styles.chipText, { color: colors.primaryText }]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      ) : view === "file" ? (
        <>
          <View style={styles.pickHeader}>
            <TouchableOpacity onPress={() => setView("menu")} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text, flex: 1, marginBottom: 0, marginLeft: 6 }]}>
              Tạo file
            </Text>
          </View>
          <Card>
            {[
              { f: "docx", sub: "Tài liệu có tiêu đề, danh sách, bảng" },
              { f: "xlsx", sub: tables.length ? `${tables.length} bảng -> ${tables.length} trang tính` : "Mỗi dòng 1 hàng" },
              { f: "csv", sub: "Chỉ phần bảng", disabled: !tables.length },
              { f: "md", sub: "Giữ nguyên định dạng markdown" },
              { f: "txt", sub: "Văn bản thuần" },
            ].map((o, i, arr) => (
              <Row
                key={o.f}
                icon={FILE_TYPES[o.f].icon}
                title={`${FILE_TYPES[o.f].label} (.${FILE_TYPES[o.f].ext})`}
                sub={o.sub}
                disabled={o.disabled}
                onPress={() => makeFile(o.f)}
                last={i === arr.length - 1}
              />
            ))}
          </Card>
        </>
      ) : (
        <>
          <View style={styles.pickHeader}>
            <TouchableOpacity onPress={() => setView("menu")} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text, flex: 1, marginBottom: 0, marginLeft: 6 }]}>
              Chọn đoạn
            </Text>
            <TouchableOpacity
              hitSlop={8}
              onPress={() =>
                setSel(selCount === blocks.length ? {} : Object.fromEntries(blocks.map((b) => [b.id, true])))
              }
            >
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
                {selCount === blocks.length ? "Bỏ chọn" : "Chọn tất cả"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: maxPick }} showsVerticalScrollIndicator={false}>
            {blocks.map((b) => {
              const on = !!sel[b.id];
              return (
                <TouchableOpacity
                  key={b.id}
                  activeOpacity={0.75}
                  onPress={() => setSel((s) => ({ ...s, [b.id]: !s[b.id] }))}
                  style={[
                    styles.block,
                    {
                      backgroundColor: on ? colors.primarySoft : "transparent",
                      borderColor: on ? colors.primaryBorder : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={22}
                    color={on ? colors.primary : colors.textMuted}
                    style={{ marginRight: 10, marginTop: 1 }}
                  />
                  <Text numberOfLines={4} style={[styles.blockText, { color: colors.text }]}>
                    {b.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!selCount}
            onPress={() => finish(joinBlocks(blocks.filter((b) => sel[b.id])), `Đã sao chép ${selCount} đoạn`)}
            style={[styles.copyBtn, { backgroundColor: selCount ? colors.primary : colors.border }]}
          >
            <Text style={styles.copyBtnText}>{selCount ? `Sao chép (${selCount})` : "Chọn ít nhất 1 đoạn"}</Text>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
});

export default SmartCopySheet;

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
  section: { fontSize: 12.5, fontWeight: "700", marginTop: 14, marginBottom: 8, marginLeft: 4 },
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 4 },
  chip: { borderWidth: 1, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { fontSize: 13.5, fontWeight: "700" },
  doneWrap: { alignItems: "center", paddingVertical: 34 },
  doneText: { fontSize: 16, fontWeight: "700", marginTop: 12, textAlign: "center", paddingHorizontal: 12 },
  pickHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  block: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  blockText: { flex: 1, fontSize: 14, lineHeight: 20 },
  copyBtn: { marginTop: 10, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" },
  copyBtnText: { color: "#ffffff", fontSize: 15.5, fontWeight: "800" },
});