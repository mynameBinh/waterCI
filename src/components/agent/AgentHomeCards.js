// =============================================================================
// AgentHomeCards — thẻ ở màn hình chính:
//   Hộp thư (nhắc nhở / tin nhắn từ người kia / nhắc nhẹ của AI / ngày đặc biệt / mốc bên nhau / bản tin tuần / chấp nhận cặp đôi...)
//   KHÔNG còn hiện thành thẻ chèn ở tab check-in nước nữa: useInboxBubbles lấy tin chưa đọc rồi cho nút AI nổi (FloatingAIButton)
//   phát từng tin dưới dạng bong bóng chat.
// (Chức năng "Cặp đôi" nay nằm ở tab "Tôi": xem CoupleSheet.js.)
// File này cũng export vài helper dùng chung: useAgentApi, useRefreshOnActive, useInboxBubbles, Btn, Input.
// Tự gọi API (token + authFetch), không phụ thuộc state của Dashboard.
// =============================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../../context/ThemeContext";

export function useAgentApi(token, apiBase, authFetch) {
  return useCallback(
    async (path, options = {}) => {
      const doFetch = authFetch || fetch;
      const res = await doFetch(`${apiBase}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Có lỗi xảy ra, bạn thử lại nhé.");
      return data;
    },
    [token, apiBase, authFetch],
  );
}

// chạy lại khi mở app / quay lại app
export function useRefreshOnActive(load) {
  useEffect(() => {
    load();
    const sub = AppState.addEventListener("change", (s) => s === "active" && load());
    return () => sub.remove();
  }, [load]);
}

export const Btn = ({ colors, label, onPress, busy, ghost, disabled, style }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={busy || disabled}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: !!(busy || disabled), busy: !!busy }}
    style={[
      styles.btn,
      ghost
        ? { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent", opacity: disabled ? 0.5 : 1 }
        : { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 },
      style,
    ]}
  >
    {busy ? (
      <ActivityIndicator size="small" color={ghost ? colors.primary : "#fff"} />
    ) : (
      <Text style={[styles.btnText, { color: ghost ? colors.text : "#fff" }]}>{label}</Text>
    )}
  </TouchableOpacity>
);

export const Input = ({ colors, ...p }) => (
  <TextInput
    placeholderTextColor={colors.textMuted}
    {...p}
    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }, p.style]}
  />
);

// ── Hộp thư -> bong bóng chat của nút AI nổi ────────────────────────────────
export const INBOX_LABEL = {
  reminder: "Nhắc nhở",
  partner: "Tin nhắn từ người ấy",
  nudge: "Nhắc nhẹ",
  special: "Ngày đặc biệt",
  milestone: "Mốc bên nhau",
  weekly: "Bản tin tuần",
  save: "Gánh chuỗi",
  together: "Ngày bên nhau",
};
const INBOX_POLL_MS = 45000; // app đang mở: hỏi server xem có tin mới mỗi bấy nhiêu ms (ngoài ra còn hỏi ngay khi mở / quay lại app)
const INBOX_MAX_BUBBLES = 3; // một lần có nhiều tin: phát tối đa bấy nhiêu bong bóng, phần còn lại gộp thành một dòng "và N tin khác"
const BUBBLE_GAP_MS = 900; // nghỉ giữa hai bong bóng liên tiếp
const BUBBLE_STUCK_MS = 12000; // phòng khi nút nổi tự ẩn bong bóng mà không báo đóng: quá bấy nhiêu thì phát tin kế tiếp luôn
const inboxTime = (it) => Date.parse(it?.created_at || it?.ts || it?.at || "") || 0;

// Lấy tin hộp thư, xếp hàng, phát từng tin bằng showBubble(text, meta, tone, rawItem). Chỉ phát khi KHÔNG có bong bóng khác đang hiện
// (kết quả check-in, lý do AI từ chối... luôn được ưu tiên) và khung chat AI không mở (paused).
// Lúc bong bóng hiện chỉ GHI NHỚ cục bộ (AsyncStorage) để không phát lại; tin chỉ được đánh dấu "đã đọc" trên server khi người dùng
// mở nó (bấm bong bóng / bấm trong chuông) -> chuông vẫn đếm đúng số tin chưa xem.
// Trả về { items, unread, refresh, markRead } để AIChatModal vẽ chuông thông báo.
const BUBBLED_KEY = "inbox_bubbled_v1";
export const isInboxUnread = (it) => !(it?.read || it?.is_read || it?.read_at);

export function useInboxBubbles({ api, enabled = true, paused = false, bubble = null, showBubble }) {
  const [items, setItems] = useState([]);
  const queue = useRef([]); // [{ ids, text, meta, raw }]
  const seen = useRef(new Set()); // id đã xếp hàng trong phiên này -> không phát lại
  const bubbled = useRef(null); // Set id đã phát bong bóng (nạp từ AsyncStorage)
  const timer = useRef(null);
  const last = useRef({ text: "", at: 0 });
  const live = useRef({});
  live.current = { api, bubble, paused, showBubble };

  const loadBubbled = useCallback(async () => {
    if (bubbled.current) return bubbled.current;
    let ids = [];
    try {
      ids = JSON.parse((await AsyncStorage.getItem(BUBBLED_KEY)) || "[]");
    } catch {}
    bubbled.current = new Set(ids);
    return bubbled.current;
  }, []);

  const rememberBubbled = useCallback((ids) => {
    const set = bubbled.current || new Set();
    ids.forEach((id) => set.add(id));
    bubbled.current = set;
    AsyncStorage.setItem(BUBBLED_KEY, JSON.stringify([...set].slice(-200))).catch(() => {});
  }, []);

  const pump = useCallback(() => {
    clearTimeout(timer.current);
    if (!queue.current.length) return;
    const { bubble: cur, paused: hold, showBubble: show } = live.current;
    if (hold || !show) {
      timer.current = setTimeout(pump, 1500);
      return;
    }
    const stuck = !!cur && cur.text === last.current.text && Date.now() - last.current.at > BUBBLE_STUCK_MS;
    if (cur && !stuck) {
      timer.current = setTimeout(pump, 1500); // đang có bong bóng khác -> đợi nó tắt
      return;
    }
    const item = queue.current.shift();
    last.current = { text: item.text, at: Date.now() };
    show(item.text, item.meta, undefined, item.raw); // raw = tin gốc -> Dashboard biết bong bóng này là tin hộp thư
    rememberBubbled(item.ids); // KHÔNG gọi /api/inbox/read ở đây nữa
    if (queue.current.length) timer.current = setTimeout(pump, BUBBLE_GAP_MS + 1500);
  }, [rememberBubbled]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await live.current.api("/api/inbox?limit=30"); // lấy cả tin đã đọc cho chuông
      const all = (r?.items || []).filter((it) => it?.id != null);
      setItems(all);
      const done = await loadBubbled();
      let fresh = all.filter((it) => isInboxUnread(it) && !seen.current.has(it.id) && !done.has(it.id));
      if (!fresh.length) return;
      fresh.forEach((it) => seen.current.add(it.id));
      // phát tin cũ trước, tin mới sau
      fresh = fresh.every((it) => inboxTime(it)) ? [...fresh].sort((x, y) => inboxTime(x) - inboxTime(y)) : [...fresh].reverse();
      const toItem = (it) => ({
        ids: [it.id],
        raw: it,
        text: `${it.from ? `${it.from}: ` : ""}${it.text || ""}`.trim(),
        meta: INBOX_LABEL[it.kind] || "Thông báo",
      });
      const shown = fresh.slice(0, INBOX_MAX_BUBBLES).map(toItem);
      const rest = fresh.slice(INBOX_MAX_BUBBLES);
      queue.current.push(...shown.filter((x) => x.text));
      if (rest.length) queue.current.push({ ids: rest.map((it) => it.id), raw: null, text: `Và ${rest.length} tin mới khác`, meta: "Thông báo" });
      pump();
    } catch {
      /* offline: lần sau tự thử lại */
    }
  }, [enabled, pump, loadBubbled]);

  // đánh dấu đã đọc: cập nhật ngay trên máy (chuông giảm số) rồi báo server
  const markRead = useCallback((ids) => {
    if (!ids?.length) return;
    const set = new Set(ids);
    setItems((prev) => prev.map((it) => (set.has(it.id) ? { ...it, read: true } : it)));
    live.current.api?.("/api/inbox/read", { method: "POST", body: JSON.stringify({ ids }) }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) {
      queue.current = [];
      seen.current.clear();
      setItems([]);
      return undefined;
    }
    load();
    const id = setInterval(() => {
      if (AppState.currentState === "active") load();
    }, INBOX_POLL_MS);
    const sub = AppState.addEventListener("change", (st) => st === "active" && load());
    return () => {
      clearInterval(id);
      sub.remove();
      clearTimeout(timer.current);
    };
  }, [enabled, load]);

  // bong bóng vừa tắt / khung chat vừa đóng -> phát tin kế tiếp sau một nhịp nghỉ
  useEffect(() => {
    if (bubble || paused || !queue.current.length) return undefined;
    const t = setTimeout(pump, BUBBLE_GAP_MS); // timer riêng: dọn effect này không được huỷ vòng chờ của pump
    return () => clearTimeout(t);
  }, [bubble, paused, pump]);

  return { items, unread: items.filter(isInboxUnread).length, refresh: load, markRead };
}

// Không còn thẻ nào ở màn hình chính (giữ export mặc định để nơi nào còn import cũ không lỗi)
const AgentHomeCards = () => null;
export default AgentHomeCards;

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btn: { minWidth: 72, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  btnText: { fontWeight: "700", fontSize: 13.5 },
});