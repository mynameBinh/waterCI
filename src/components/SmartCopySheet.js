import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

// ── Tiện ích văn bản (dùng chung với AIChatModal) ───────────────────────────
export async function copyText(text) {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
const LIST_RE = /^\s*(\d+[.)]|[•\-*])\s+/;

// Bỏ emoji, chuẩn hoá gạch đầu dòng "•" -> "-", gọn khoảng trắng
export const cleanText = (t = "") =>
  t
    .replace(EMOJI_RE, "")
    .replace(/^[ \t]*•[ \t]+/gm, "- ")
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
  for (const line of text.split("\n")) {
    if (!line.trim()) {
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

// ── Giao diện ───────────────────────────────────────────────────────────────
const SmartCopySheet = memo(function SmartCopySheet({ text, onClose }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  const [view, setView] = useState("menu"); // "menu" | "pick"
  const [done, setDone] = useState("");
  const [sel, setSel] = useState({});

  const blocks = useMemo(() => splitBlocks(text), [text]);
  const listBlocks = useMemo(() => blocks.filter((b) => b.kind === "list"), [blocks]);
  const selCount = blocks.filter((b) => sel[b.id]).length;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => clearTimeout(timer.current);
  }, [anim]);

  const finish = async (str, label) => {
    const ok = await copyText(str);
    setDone(ok ? label : "Không sao chép được");
    timer.current = setTimeout(onClose, ok ? 800 : 1300);
  };

  const Row = ({ icon, title, sub, onPress }) => (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {!!sub && <Text style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.border} />
    </TouchableOpacity>
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12) + 6,
            maxHeight: height * 0.8,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }],
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />

        {done ? (
          <View style={styles.doneWrap}>
            <Ionicons
              name={done.startsWith("Không") ? "alert-circle" : "checkmark-circle"}
              size={46}
              color={done.startsWith("Không") ? "#ef4444" : colors.primary}
            />
            <Text style={[styles.doneText, { color: colors.text }]}>{done}</Text>
          </View>
        ) : view === "menu" ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Sao chép thông minh</Text>
            <Row
              icon="copy-outline"
              title="Sao chép toàn bộ"
              sub={`${text.length} ký tự`}
              onPress={() => finish(text, "Đã sao chép toàn bộ")}
            />
            <Row
              icon="sparkles-outline"
              title="Văn bản sạch"
              sub="Bỏ emoji, chuẩn hoá gạch đầu dòng – tiện dán vào ghi chú / bài viết"
              onPress={() => finish(cleanText(text), "Đã sao chép văn bản sạch")}
            />
            {listBlocks.length >= 2 && (
              <Row
                icon="list-outline"
                title="Chỉ phần danh sách"
                sub={`${listBlocks.length} mục đánh số / gạch đầu dòng`}
                onPress={() => finish(listBlocks.map((b) => b.text).join("\n"), "Đã sao chép danh sách")}
              />
            )}
            {blocks.length > 1 && (
              <Row
                icon="checkbox-outline"
                title="Chọn đoạn để sao chép"
                sub="Tích chọn từng đoạn / từng mục"
                onPress={() => setView("pick")}
              />
            )}
            <Row
              icon="share-outline"
              title="Chia sẻ…"
              sub="Gửi sang ứng dụng khác"
              onPress={() => {
                Share.share({ message: text }).catch(() => {});
                onClose();
              }}
            />
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
            <ScrollView style={{ maxHeight: height * 0.5 }} showsVerticalScrollIndicator={false}>
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
      </Animated.View>
    </View>
  );
});

export default SmartCopySheet;

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: "800", marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 9 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12.5, marginTop: 1, lineHeight: 17 },
  doneWrap: { alignItems: "center", paddingVertical: 28 },
  doneText: { fontSize: 16, fontWeight: "700", marginTop: 10 },
  pickHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  block: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  blockText: { flex: 1, fontSize: 14, lineHeight: 20 },
  copyBtn: { marginTop: 10, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center" },
  copyBtnText: { color: "#ffffff", fontSize: 15.5, fontWeight: "800" },
});
