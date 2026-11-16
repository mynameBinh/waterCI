// exportMeta.js — thông tin định dạng / theme, ước lượng độ dài, lưu theme mặc định, tách khối :::choices và from="..."
import AsyncStorage from "@react-native-async-storage/async-storage";

export const FORMATS = {
  docx: { label: "Word", ext: "docx", icon: "document-text-outline", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  pdf: { label: "PDF", ext: "pdf", icon: "document-outline", mime: "application/pdf" },
  xlsx: { label: "Excel", ext: "xlsx", icon: "grid-outline", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pptx: { label: "PowerPoint", ext: "pptx", icon: "easel-outline", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  gdoc: { label: "Google Docs", ext: "", icon: "logo-google", google: true, base: "docx" },
  gsheet: { label: "Google Sheets", ext: "", icon: "logo-google", google: true, base: "xlsx" },
  gslides: { label: "Google Slides", ext: "", icon: "logo-google", google: true, base: "pptx" },
};
export const SERVER_FORMATS = Object.keys(FORMATS); // csv / md / txt vẫn do thẻ file cũ xử lý
export const GOOGLE_LABEL = { gdoc: "Google Docs", gsheet: "Google Sheets", gslides: "Google Slides" };

export const THEMES = [
  { key: "mint", label: "Bạc hà", color: "#2DBFA6" },
  { key: "peach", label: "Đào", color: "#F59E6B" },
  { key: "lavender", label: "Oải hương", color: "#A78BFA" },
  { key: "sky", label: "Trời xanh", color: "#5BA4F5" },
  { key: "ocean", label: "Đại dương", color: "#2563EB" },
  { key: "forest", label: "Rừng xanh", color: "#16A34A" },
  { key: "sunset", label: "Hoàng hôn", color: "#EA580C" },
  { key: "violet", label: "Tím", color: "#7C3AED" },
  { key: "graphite", label: "Than chì", color: "#4B5563" },
];

const THEME_KEY = "export_theme_v1";
export async function loadDefaultTheme() {
  try {
    const v = await AsyncStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.key === v) ? v : "mint";
  } catch {
    return "mint";
  }
}
export const saveDefaultTheme = (key) => AsyncStorage.setItem(THEME_KEY, key).catch(() => {});

// Ước lượng kích thước kết quả (chỉ để hiển thị gợi ý, không cần chính xác)
export function estimate(content, fmt) {
  const base = FORMATS[fmt]?.base || fmt;
  const text = content || "";
  const h2 = (text.match(/^##\s+\S/gm) || []).length;
  const tables = (text.match(/^\|[ \t:-]+\|[ \t|:-]*$/gm) || []).length; // dòng phân cách bảng
  const tableRows = (text.match(/^\|.*\|[ \t]*$/gm) || []).length;
  if (base === "xlsx") return `~${Math.max(1, tables)} trang tính`;
  if (base === "pptx") return `~${1 + Math.max(1, h2) + Math.floor(tableRows / 9)} slide`;
  const pages = Math.max(1, Math.ceil(text.length / 2600 + tableRows * 0.035 + h2 * 0.12));
  return `~${pages} trang`;
}

// ── Tách các khối đặc biệt trước khi đưa vào parseReply (không cần sửa chatFiles.js) ──
// 1) ':::file pdf "Tên" from="goc.docx"'
//    - bỏ phần from=...
//    - định dạng chatFiles.js chưa biết (pdf, pptx, gdoc...) được đổi tạm thành docx để parseReply vẫn nhận ra khối file;
//      định dạng THẬT và from được trả theo thứ tự khối -> gán lại cho từng đoạn file sau khi parse (xem applyFileMeta)
const LEGACY_FMT = new Set(["docx", "xlsx", "csv", "md", "txt"]);
export function extractFromAttrs(text) {
  const info = [];
  const out = text.replace(/^:::file[ \t]+(\w+)[ \t]+"([^"\n]*)"(?:[ \t]+from="([^"\n]*)")?[ \t]*$/gm, (_m, fmt, name, from) => {
    const f = fmt.toLowerCase();
    info.push({ fmt: f, from: from || null });
    return `:::file ${LEGACY_FMT.has(f) ? f : "docx"} "${name}"`;
  });
  return { text: out, info };
}
export function applyFileMeta(parsed, info) {
  let k = 0;
  for (const sg of parsed.segments || []) {
    if (sg.type === "file" || (sg.fmt && sg.body !== undefined && sg.type !== "text")) {
      const m = info[k++];
      if (m) {
        sg.fmt = m.fmt;
        sg.from = m.from;
      }
    }
  }
  return parsed;
}
// 2) ':::choices\nCâu hỏi\nLựa chọn 1\n...\n:::'  -> { text (đã bỏ khối), choices: {question, options} | null }
export function extractChoices(text) {
  const re = /^:::choices[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/m;
  const m = text.match(re);
  if (!m) return { text, choices: null };
  const lines = m[1].split(/\r?\n/).map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
  const out = text.replace(re, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  if (lines.length < 3) return { text: out, choices: null }; // cần 1 câu hỏi + ít nhất 2 lựa chọn
  return { text: out, choices: { question: lines[0].slice(0, 160), options: lines.slice(1, 5).map((l) => l.slice(0, 48)) } };
}

// 3) Link Google trong tin nhắn của người dùng -> { urls, instruction (phần chữ còn lại sau khi bỏ link) }
const G_RE = /https?:\/\/(?:docs|drive)\.google\.com\/[^\s)>\]]+/gi;
export function googleLinks(text) {
  const urls = [];
  for (const u of (text || "").match(G_RE) || []) {
    const clean = u.replace(/[.,;]+$/, "");
    if (/\/d\/[A-Za-z0-9_-]{15,}|[?&]id=[A-Za-z0-9_-]{15,}/.test(clean) && !urls.includes(clean)) urls.push(clean);
  }
  return { urls: urls.slice(0, 2), instruction: (text || "").replace(G_RE, " ").replace(/\s+/g, " ").trim() };
}
