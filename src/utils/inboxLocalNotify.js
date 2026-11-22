// =============================================================================
// inboxLocalNotify — THÔNG BÁO CỤC BỘ cho tin chat đôi (app sideload nên không có push thật).
//  • Nhiệm vụ nền (expo-background-task + expo-task-manager) gọi /api/inbox; tin "chat" chưa đọc, chưa báo, chưa hiện bong bóng
//    -> scheduleNotificationAsync(trigger: null) với data { kind: "inbox", itemKind: "chat", inboxId }.
//  • Bấm thông báo -> DashboardScreen đọc data này và mở thẳng khung chat đôi.
//  • Giới hạn của hệ điều hành: không tức thì (>= 15 phút, hệ thống tự chọn lúc chạy), dừng khi vuốt tắt app (iOS).
//    App đang mở thì dùng polling sẵn có (useInboxBubbles 45 s + polling của khung chat), nên nhiệm vụ nền bỏ qua khi app đang active.
//  • Token được lưu ở AsyncStorage để nhiệm vụ nền (chạy ngoài React) gọi được API. Đăng xuất -> saveInboxNotifyCreds(null).
//  • Hai module native được nạp trong try/require: bản app CHƯA build lại vẫn chạy bình thường (chỉ không có thông báo nền).
// Import file này ở mức module (DashboardScreen hoặc tốt hơn là App.js / index.js) để defineTask chạy ở phạm vi toàn cục.
// Đặt ở utils/inboxLocalNotify.js
// =============================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";

let TaskManager = null;
let BackgroundTask = null;
try {
  TaskManager = require("expo-task-manager");
  BackgroundTask = require("expo-background-task");
} catch {
  /* chưa cài / chưa build lại app: bỏ qua thông báo nền */
}

export const INBOX_TASK = "inbox-local-notify";
const CREDS_KEY = "inbox_notify_creds_v1";
const NOTIFIED_KEY = "inbox_notified_v1"; // mảng id đã báo (giữ 200 id gần nhất)
const BUBBLED_KEY = "inbox_bubbled_v1"; // mảng id đã hiện bong bóng AI (AgentHomeCards)
const PARTNER_BUBBLED_KEY = "partner_chat_bubbled_v1"; // id chat lớn nhất đã hiện bong bóng ở nút người kia (usePartnerChat)
const NOTIFY_KINDS = ["chat"]; // thêm kind khác vào đây nếu muốn báo cả loại đó
const unread = (it) => !(it?.read || it?.is_read || it?.read_at);

const readJson = async (key, fallback) => {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

export async function saveInboxNotifyCreds(creds) {
  try {
    if (creds?.token && creds?.apiBase) await AsyncStorage.setItem(CREDS_KEY, JSON.stringify({ token: creds.token, apiBase: creds.apiBase }));
    else await AsyncStorage.removeItem(CREDS_KEY);
  } catch {
    /* bỏ qua */
  }
}

// Một lượt kiểm tra. Trả số thông báo đã tạo.
export async function checkInboxAndNotify() {
  if (AppState.currentState === "active") return 0; // đang mở app: bong bóng + polling lo rồi
  const creds = await readJson(CREDS_KEY, null);
  if (!creds?.token || !creds?.apiBase) return 0;
  const perm = await Notifications.getPermissionsAsync();
  if (perm?.status !== "granted") return 0;
  const res = await fetch(`${creds.apiBase}/api/inbox?limit=30`, { headers: { Authorization: `Bearer ${creds.token}` } });
  if (!res.ok) return 0;
  const data = await res.json().catch(() => ({}));
  const notified = new Set(await readJson(NOTIFIED_KEY, []));
  const bubbled = new Set(await readJson(BUBBLED_KEY, []));
  const partnerBubbled = Number(await AsyncStorage.getItem(PARTNER_BUBBLED_KEY).catch(() => 0)) || 0;
  const fresh = (data?.items || [])
    .filter((it) => it?.id != null && NOTIFY_KINDS.includes(it.kind) && unread(it))
    .filter((it) => !notified.has(it.id) && !bubbled.has(it.id) && !(it.kind === "chat" && it.id <= partnerBubbled))
    .sort((a, b) => a.id - b.id);
  let n = 0;
  for (const it of fresh.slice(-3)) {
    // một lần tối đa 3 thông báo, tránh dồn dập
    await Notifications.scheduleNotificationAsync({
      content: {
        title: it.from || (it.from_user_id == null ? "Tiểu Ngư" : "Tin nhắn mới"),
        body: String(it.text || "Bạn có tin nhắn mới").slice(0, 180),
        data: { kind: "inbox", itemKind: it.kind, inboxId: it.id },
        sound: true,
      },
      trigger: null,
    });
    n += 1;
  }
  if (fresh.length) {
    fresh.forEach((it) => notified.add(it.id));
    await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified].slice(-200))).catch(() => {});
  }
  return n;
}

if (TaskManager && BackgroundTask) {
  try {
    TaskManager.defineTask(INBOX_TASK, async () => {
      try {
        await checkInboxAndNotify();
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  } catch {
    /* đã định nghĩa (Fast Refresh) */
  }
}

// Đăng ký nhiệm vụ nền (gọi sau khi đăng nhập). Không ném lỗi; trả true nếu đã đăng ký.
export async function registerInboxNotifyTask() {
  if (!TaskManager || !BackgroundTask) return false;
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(INBOX_TASK))) await BackgroundTask.registerTaskAsync(INBOX_TASK, { minimumInterval: 15 });
    return true;
  } catch {
    return false;
  }
}
