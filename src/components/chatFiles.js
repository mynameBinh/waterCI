import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

// ─────────────────────────────────────────────────────────────────────────────
//  Tiện ích cho "tạo file" + đọc cấu trúc câu trả lời của AI
//  (AIChatModal & SmartCopySheet dùng chung)
//
//  Cần cài:  npx expo install expo-sharing
// ─────────────────────────────────────────────────────────────────────────────

export const FILE_TYPES = {
  docx: {
    label: "Word",
    icon: "document-text-outline",
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    uti: "org.openxmlformats.wordprocessingml.document",
    server: true,
  },
  xlsx: {
    label: "Excel",
    icon: "grid-outline",
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    uti: "org.openxmlformats.spreadsheetml.sheet",
    server: true,
  },
  csv: { label: "CSV", icon: "list-outline", ext: "csv", mime: "text/csv", uti: "public.comma-separated-values-text" },
  md: { label: "Markdown", icon: "logo-markdown", ext: "md", mime: "text/markdown", uti: "net.daringfireball.markdown" },
  txt: { label: "Văn bản", icon: "reader-outline", ext: "txt", mime: "text/plain", uti: "public.plain-text" },
};

// ── Đọc câu trả lời có khối :::file / :::next ───────────────────────────────
//   :::file docx "Ten-file"        ...nội dung markdown...        :::
//   :::next                         mỗi dòng 1 câu gợi ý tiếp       :::
const FILE_RE = /:::file[ \t]+(docx|xlsx|csv|md|txt)[ \t]+"([^"\n]*)"[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/g;
const NEXT_RE = /:::next[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/;

export function parseReply(content = "") {
  let src = String(content);
  let next = [];
  const m = src.match(NEXT_RE);
  if (m) {
    next = m[1]
      .split("\n")
      .map((s) => s.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    src = src.replace(NEXT_RE, "");
  }
  // khối gợi ý bị cắt dở -> ẩn đi
  src = src.replace(/:::next[\s\S]*$/, "");

  const segments = [];
  let last = 0;
  src.replace(FILE_RE, (all, fmt, name, body, offset) => {
    const before = src.slice(last, offset);
    if (before.trim()) segments.push({ type: "text", text: before.trim() });
    segments.push({ type: "file", fmt, name: name || "tai-lieu", body });
    last = offset + all.length;
    return all;
  });
  let rest = src.slice(last);
  // AI bị cắt giữa chừng (hết token) -> vẫn giữ phần đã viết thành file thay vì lộ ký hiệu thô
  const open = rest.match(/:::file[ \t]+(docx|xlsx|csv|md|txt)[ \t]+"([^"\n]*)"[ \t]*\n([\s\S]*)$/);
  if (open) {
    rest = rest.slice(0, open.index);
    if (rest.trim()) segments.push({ type: "text", text: rest.trim() });
    segments.push({ type: "file", fmt: open[1], name: open[2] || "tai-lieu", body: open[3].replace(/\n?:::\s*$/, "") });
    return { segments, next };
  }
  if (rest.trim()) segments.push({ type: "text", text: rest.trim() });
  return { segments, next };
}

// Chỉ phần chữ (không có khối file / gợi ý) – dùng cho sao chép
export const replyText = (content) =>
  parseReply(content)
    .segments.filter((s) => s.type === "text")
    .map((s) => s.text)
    .join("\n\n");

// ── Markdown -> chữ thường ──────────────────────────────────────────────────
export const plainText = (md = "") =>
  String(md)
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "- ")
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}[ \t:|-]*(\n|$)/gm, "")
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, r) => r.split("|").map((c) => c.trim()).join(" | "))
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// ── Bảng markdown -> mảng hàng ──────────────────────────────────────────────
const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const splitRow = (l) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.replace(/\*\*/g, "").replace(/`/g, "").trim());

export function extractTables(md = "") {
  const lines = String(md).split("\n");
  const out = [];
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^\s{0,3}#{1,4}\s+(.*)$/);
    if (h) heading = h[1].trim();
    if (lines[i].includes("|") && i + 1 < lines.length && isSep(lines[i + 1])) {
      const rows = [splitRow(lines[i])];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      i--;
      out.push({ name: heading || `Bảng ${out.length + 1}`, rows });
    }
  }
  return out;
}

export const tablesToTSV = (tables) => tables.map((t) => t.rows.map((r) => r.join("\t")).join("\n")).join("\n\n");
export const tablesToCSV = (tables) =>
  tables
    .map((t) => t.rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"))
    .join("\n\n");

export function extractCode(md = "") {
  const out = [];
  String(md).replace(/```[^\n]*\n([\s\S]*?)```/g, (_, c) => out.push(c.replace(/\n$/, "")));
  return out;
}

export const guessTitle = (md = "") => {
  const h = String(md).match(/^\s{0,3}#{1,3}\s+(.*)$/m);
  const first = h ? h[1] : plainText(md).split("\n")[0] || "tai-lieu";
  return first.slice(0, 50);
};

export const safeName = (s = "tai-lieu") =>
  String(s).replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "tai-lieu";

// ── Sao chép ────────────────────────────────────────────────────────────────
export async function copyText(text) {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

// ── Tạo file ────────────────────────────────────────────────────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64ToBytes(b64) {
  const clean = String(b64).replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < len ? B64.indexOf(clean[i + 2]) : 0;
    const d = i + 3 < len ? B64.indexOf(clean[i + 3]) : 0;
    out[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len) out[p++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, p);
}

function writeToCache(filename, data) {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(data);
  return file.uri;
}

/**
 * Tạo file từ nội dung markdown.
 *  - md / txt / csv: làm ngay trên máy.
 *  - docx / xlsx  : gọi POST /api/chat/export (xem backend/export_patch.py).
 * Trả về { uri, name, mime, uti }.
 */
export async function createFile({ apiBase, token, authFetch, format, title, content }) {
  const t = FILE_TYPES[format];
  if (!t) throw new Error("Định dạng này chưa hỗ trợ.");
  const base = safeName(title || guessTitle(content));
  const name = `${base}.${t.ext}`;

  if (!t.server) {
    let text = content;
    if (format === "txt") text = plainText(content);
    if (format === "csv") {
      const tables = extractTables(content);
      if (!tables.length) throw new Error("Nội dung này không có bảng để xuất CSV.");
      text = "\uFEFF" + tablesToCSV(tables); // BOM để Excel đọc đúng tiếng Việt
    }
    return { uri: writeToCache(name, text), name, mime: t.mime, uti: t.uti };
  }

  const doFetch = authFetch || fetch;
  const res = await doFetch(`${apiBase}/api/chat/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ format, title: base, content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.data) {
    throw new Error(typeof data?.detail === "string" ? data.detail : "Không tạo được file, bạn thử lại nhé.");
  }
  const fname = safeName(data.filename || name);
  return { uri: writeToCache(fname.includes(".") ? fname : `${fname}.${t.ext}`, base64ToBytes(data.data)), name: fname, mime: t.mime, uti: t.uti };
}

export async function shareFile(f) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Thiết bị chưa hỗ trợ chia sẻ tệp.");
  await Sharing.shareAsync(f.uri, { mimeType: f.mime, UTI: f.uti, dialogTitle: f.name });
}
