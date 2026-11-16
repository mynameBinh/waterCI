// exportApi.js — gọi API xuất file / Google, lưu và chia sẻ file. (không phụ thuộc authFetch: dùng fetch + Bearer token)
import { File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Linking } from "react-native";

export class ApiError extends Error {
  constructor(message, status = 0, code = "") {
    super(message);
    this.status = status;
    this.code = code; // header X-Error-Code: google_not_connected | google_reauth | google_not_configured | ...
  }
}

async function api(ctx, path, { method = "GET", body, timeoutMs = 60000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${String(ctx.apiBase).replace(/\/$/, "")}${path}`, {
      method,
      headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) {
      const d = data?.detail;
      const msg =
        typeof d === "string" ? d : Array.isArray(d) ? "Dữ liệu gửi lên chưa hợp lệ." : "Có lỗi xảy ra, bạn thử lại nhé.";
      throw new ApiError(msg, res.status, res.headers?.get?.("X-Error-Code") || "");
    }
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e?.name === "AbortError") throw new ApiError("Quá thời gian chờ, bạn thử lại nhé.", 0, "timeout");
    throw new ApiError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.", 0, "network");
  } finally {
    clearTimeout(timer);
  }
}

// ── Xuất file ───────────────────────────────────────────────────────────────
// -> { filename, mime, data(base64), warnings }  hoặc (gdoc/gsheet/gslides)  { filename, url, file_id, warnings }
export const exportFile = (ctx, { format, title, content, theme, source, options }) =>
  api(ctx, "/api/chat/export", {
    method: "POST",
    timeoutMs: 90000,
    body: { format, title, content, theme, ...(source ? { source } : {}), ...(options ? { options } : {}) },
  });

// ── Google ──────────────────────────────────────────────────────────────────
export const googleStatus = (ctx) => api(ctx, "/api/google/status");
export const googleDisconnect = (ctx) => api(ctx, "/api/google/disconnect", { method: "POST" });
export async function googleConnect(ctx) {
  const { url } = await api(ctx, "/api/google/connect");
  await Linking.openURL(url); // mở trình duyệt; xong Google chuyển về app bằng deep link
}
export const googleInspect = (ctx, url) => api(ctx, "/api/google/inspect", { method: "POST", body: { url } });
export const googlePlan = (ctx, url, instruction) =>
  api(ctx, "/api/google/edit/plan", { method: "POST", body: { url, instruction }, timeoutMs: 120000 });
export const googleApply = (ctx, plan_id, use_copy = false) =>
  api(ctx, "/api/google/edit/apply", { method: "POST", body: { plan_id, confirm: true, use_copy }, timeoutMs: 120000 });

export const needsGoogleConnect = (e) => e?.code === "google_not_connected" || e?.code === "google_reauth";

// ── Lưu + chia sẻ ───────────────────────────────────────────────────────────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64ToBytes(b64) {
  const s = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64.indexOf(s[i]), b = B64.indexOf(s[i + 1]);
    const c = i + 2 < s.length ? B64.indexOf(s[i + 2]) : -1;
    const d = i + 3 < s.length ? B64.indexOf(s[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

// Ghi base64 vào thư mục tạm của app -> { uri, size }
export function saveBase64(filename, b64) {
  const safe = filename.replace(/[\\/:*?"<>|]+/g, "-");
  const f = new ExpoFile(Paths.cache, safe);
  if (f.exists) f.delete();
  f.create();
  const bytes = b64ToBytes(b64);
  f.write(bytes);
  return { uri: f.uri, size: bytes.length };
}

export async function shareSaved({ uri, mime, filename }) {
  if (!(await Sharing.isAvailableAsync())) throw new ApiError("Thiết bị này chưa hỗ trợ chia sẻ file.", 0, "no_share");
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: filename, UTI: undefined });
}

export const openUrl = (url) => Linking.openURL(url);

export function formatBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
