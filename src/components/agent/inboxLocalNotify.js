// =============================================================================
// inboxLocalNotify — biến tin hộp thư thành THÔNG BÁO CỤC BỘ (không cần push / APNs / FCM).
// Cách hoạt động: một nhiệm vụ nền (expo-background-task) thỉnh thoảng được hệ điều hành đánh thức,
// gọi /api/inbox, tin chưa đọc nào chưa báo thì bắn ngay một thông báo cục bộ trên máy.
//
// GIỚI HẠN (do hệ điều hành, không né được bằng code):
//  • Hệ điều hành quyết định LÚC NÀO chạy (tối thiểu ~15 phút, thường thưa hơn, cần pin/mạng). Không phải tức thời.
//  • iOS: vuốt tắt app khỏi màn hình đa nhiệm thì nhiệm vụ nền dừng hẳn.
//  • Đang mở app: không cần file này, useInboxBubbles đã lo (bong bóng) mỗi 45 s.
// Cần cài: npx expo install expo-background-task expo-task-manager  -> phải build lại bản app (có module native mới).
//
// QUAN TRỌNG: file này phải được import ở mức module ngay lúc khởi động (vd app/_layout.js: `import "../components/agent/inboxLocalNotify";`)
// vì TaskManager.defineTask phải chạy trước khi nhiệm vụ nền được gọi.
// Đặt ở components/agent/inboxLocalNotify.js
// =============================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { useEffect } from "react";
import { Platform } from "react-native";
import { INBOX_LABEL, isInboxUnread } from "./AgentHomeCards";

const TASK = "inbox-local-notify";
const SESSION_KEY = "inbox_bg_session_v1"; // { apiBase, token } — nhiệm vụ nền không có React context nên phải đọc từ đây
const NOTIFIED_KEY = "inbox_notified_v1"; // id đã bắn thông báo cục bộ
const BUBBLED_KEY = "inbox_bubbled_v1"; // cùng khoá với useInboxBubbles: đã hiện bong bóng lúc đang mở app thì khỏi báo nữa
const MAX_PER_RUN = 3;

const readSet = async (key) => {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(key)) || "[]"));
  } catch {
    return new Set();
  }
};

export async function pollAndNotify() {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return 0;
  const { apiBase, token } = JSON.parse(raw);
  if (!apiBase || !token) return 0;

  const res = await fetch(`${apiBase}/api/inbox?limit=30`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`inbox ${res.status}`);
  const items = ((await res.json())?.items || []).filter((it) => it?.id != null && isInboxUnread(it));

  const [notified, bubbled] = await Promise.all([readSet(NOTIFIED_KEY), readSet(BUBBLED_KEY)]);
  const fresh = items.filter((it) => !notified.has(it.id) && !bubbled.has(it.id));
  if (!fresh.length) return 0;

  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== "granted") return 0;

  const batch = fresh.slice(0, MAX_PER_RUN);
  for (const it of batch) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: it.from || INBOX_LABEL[it.kind] || "Thông báo",
        body: String(it.text || "").slice(0, 180),
        data: { kind: "inbox", itemKind: it.kind, inboxId: it.id }, // Dashboard đọc data này để mở thẳng khung chat
        ...(Platform.OS === "android" ? { channelId: "water-reminder" } : {}),
      },
      trigger: null, // báo ngay
    });
  }
  // tin dư (quá MAX_PER_RUN) cũng đánh dấu đã báo, tránh lần sau lại dồn một loạt
  fresh.forEach((it) => notified.add(it.id));
  await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notified].slice(-300)));
  return batch.length;
}

TaskManager.defineTask(TASK, async () => {
  try {
    await pollAndNotify();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerInboxBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
      await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 }); // phút
    }
    return true;
  } catch {
    return false;
  }
}

export async function unregisterInboxBackgroundTask() {
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch {}
  await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
}

// Dùng trong DashboardScreen: lưu token mới nhất cho nhiệm vụ nền + đăng ký nhiệm vụ (đăng xuất thì token = null -> gỡ).
export function useInboxLocalNotify({ token, apiBase, enabled = true }) {
  useEffect(() => {
    if (!enabled || !token) {
      unregisterInboxBackgroundTask();
      return;
    }
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ apiBase, token })).catch(() => {});
    registerInboxBackgroundTask();
  }, [token, apiBase, enabled]);
}
