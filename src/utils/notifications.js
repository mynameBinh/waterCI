import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const T = Notifications.SchedulableTriggerInputTypes;
const IS_ANDROID = Platform.OS === "android";

// ─── Cấu hình ───────────────────────────────────────────────────────────────
export const TASK_PRESET_TIMES = ["09:00", "12:00", "15:00", "19:00", "21:00"];
export const TASK_DEFAULT_TIMES = ["09:00", "19:00"];

// Đặt lịch nhắc task cho hôm nay + (HORIZON - 1) ngày tới. iOS chỉ giữ tối đa
// 64 thông báo đang chờ, nên có trần MAX_TASK_NOTIFS (chừa chỗ cho nhắc uống nước).
const TASK_HORIZON_DAYS = 3;
const MAX_TASK_NOTIFS = 40;

// Tên âm thanh người dùng chọn -> file trong app.
// iOS chỉ phát được file đã được đóng gói vào app (plugin expo-notifications
// "sounds"); file không tồn tại thì iOS tự phát âm mặc định. ĐỔI tên file ở đây
// cho khớp với file thật bạn đã thêm.
const SOUND_FILES = {
  "Tiếng nước chảy": "pouring_water.wav",
  "Ting ting": "ting_ting.wav",
  "Tiếng chim hót": "bird.wav",
  "Chuông ngân (Mặc định)": "pouring_water.wav", // giữ đúng hành vi cũ
};
const soundFor = (name) =>
  IS_ANDROID ? "pouring_water.mp3" : (SOUND_FILES[name] ?? "default");

// ─── Tiện ích ───────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
// Ngày theo GIỜ ĐỊA PHƯƠNG, dạng YYYY-MM-DD
export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isTaskDone = (t) =>
  (t.done_today ?? 0) >= Math.max(t.target_per_day ?? 1, 1);

const names = (list) => {
  const n = list.map((t) => t.title).filter(Boolean);
  const shown = n.slice(0, 3).join(", ");
  return n.length > 3 ? `${shown}…` : shown;
};

// Chạy tuần tự các thao tác đặt/huỷ lịch để tránh 2 lần sync chạy chồng nhau
// (một lần huỷ xong lại xoá mất thông báo vừa đặt của lần kia).
let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
};

const androidExtras = IS_ANDROID
  ? {
      priority: Notifications.AndroidNotificationPriority.HIGH,
      channelId: "water-reminder",
    }
  : {};

async function cancelWhere(predicate) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter(predicate)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// ─── Quyền / badge ──────────────────────────────────────────────────────────
export async function getPermissionStatus() {
  try {
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return "undetermined";
  }
}

export async function setBadge(count) {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count || 0));
  } catch {
    /* chưa có quyền badge — bỏ qua */
  }
}

// ─── Nhắc uống nước (lặp mỗi ngày) ──────────────────────────────────────────
export function syncWaterReminders(times, enabled, soundName) {
  return serial(async () => {
    try {
      // Chỉ huỷ nhắc uống nước (kể cả lịch cũ chưa gắn nhãn), KHÔNG đụng tới nhắc task.
      await cancelWhere((n) => {
        const kind = n.content?.data?.kind;
        return !kind || kind === "water";
      });
      if (!enabled || !times?.length) return;

      for (const timeStr of times) {
        const [hour, minute] = timeStr.split(":").map(Number);
        await Notifications.scheduleNotificationAsync({
          identifier: `water-${timeStr}`,
          content: {
            title: "Giờ uống nước đến rồi !!! 💧",
            body: `${timeStr} Đã điểm, vào check-in uống nước để duy trì chuỗi nào!`,
            sound: soundFor(soundName),
            data: { kind: "water" },
            ...androidExtras,
          },
          trigger: { type: T.CALENDAR, hour, minute, repeats: true },
        });
      }
    } catch {
      /* ignore */
    }
  });
}

// ─── Nhắc task chưa hoàn thành ──────────────────────────────────────────────
// Đặt các thông báo MỘT LẦN (không lặp) cho vài ngày tới, vì nội dung phụ thuộc
// việc hôm nay còn task nào chưa xong. Gọi lại mỗi khi danh sách task đổi
// (sau check-in, admin đặt task mới, mở lại app) để lịch luôn đúng.
// Trả về số task chưa xong hôm nay (dùng làm badge).
export function syncTaskReminders({ tasks, times, enabled }) {
  return serial(async () => {
    const pendingToday = tasks.filter((t) => !isTaskDone(t));
    try {
      await cancelWhere((n) => n.content?.data?.kind === "task");
      if (!enabled || !tasks.length || !times?.length) return pendingToday.length;

      const now = Date.now();
      const sorted = [...times].sort();
      let count = 0;

      for (let d = 0; d < TASK_HORIZON_DAYS; d++) {
        // Hôm nay: chỉ task chưa xong. Các ngày sau: tất cả (ngày mới sẽ reset tiến độ).
        const list = d === 0 ? pendingToday : tasks;
        if (!list.length) continue;

        for (const timeStr of sorted) {
          if (count >= MAX_TASK_NOTIFS) break;
          const [h, m] = timeStr.split(":").map(Number);
          const fire = new Date();
          fire.setDate(fire.getDate() + d);
          fire.setHours(h, m, 0, 0);
          if (fire.getTime() <= now + 30000) continue; // đã qua giờ

          const body =
            d === 0
              ? list.length === 1
                ? `Mục tiêu “${list[0].title}” chưa hoàn thành, check-in ngay nhé!`
                : `Còn ${list.length} mục tiêu chưa xong: ${names(list)}`
              : list.length === 1
                ? `Mục tiêu hôm nay: “${list[0].title}”`
                : `Hôm nay có ${list.length} mục tiêu: ${names(list)}`;

          await Notifications.scheduleNotificationAsync({
            identifier: `task-${dateKey(fire)}-${timeStr}`,
            content: {
              title: "Nhắc mục tiêu hôm nay 🎯",
              body,
              sound: "default",
              data: { kind: "task" },
              ...androidExtras,
            },
            trigger: { type: T.DATE, date: fire },
          });
          count++;
        }
      }
    } catch {
      /* ignore */
    }
    return pendingToday.length;
  });
}

// ─── Phát hiện task mới ─────────────────────────────────────────────────────
// So danh sách task hiện tại với danh sách đã biết (lưu theo từng tài khoản).
// Lần đầu tiên chỉ ghi nhận, không báo (tránh báo hàng loạt task cũ).
// Lưu ý: hàm này chạy khi app đang mở / vừa được mở lại. Để báo khi app đóng
// hẳn, backend phải gửi push (xem HUONG_DAN.md).
export function notifyNewTasks(tasks, { userKey, enabled }) {
  return serial(async () => {
    try {
      const key = `known_task_ids:${userKey || "anon"}`;
      const raw = await AsyncStorage.getItem(key);
      const known = new Set(raw ? JSON.parse(raw) : []);

      // Task đã có push từ backend (còn nằm trong Trung tâm thông báo) thì coi là đã báo.
      try {
        const delivered = await Notifications.getPresentedNotificationsAsync();
        for (const n of delivered) {
          const data = n.request?.content?.data;
          if (data?.kind === "new_task" && Array.isArray(data.task_ids)) {
            data.task_ids.forEach((id) => known.add(String(id)));
          }
        }
      } catch {
        /* ignore */
      }

      const ids = tasks.map((t) => String(t.id));
      await AsyncStorage.setItem(key, JSON.stringify(ids));
      if (raw === null) return 0; // lần đầu

      const fresh = tasks.filter((t) => !known.has(String(t.id)));
      if (!fresh.length || !enabled) return fresh.length;

      await Notifications.scheduleNotificationAsync({
        content: {
          title:
            fresh.length === 1
              ? "Có mục tiêu mới! 🎯"
              : `Có ${fresh.length} mục tiêu mới! 🎯`,
          body:
            fresh.length === 1
              ? `“${fresh[0].title}” — vào check-in ngay nhé!`
              : names(fresh),
          sound: "default",
          data: { kind: "new_task", task_ids: fresh.map((t) => t.id) },
          ...androidExtras,
        },
        trigger: null, // báo ngay
      });
      return fresh.length;
    } catch {
      return 0;
    }
  });
}

// ─── Thông báo thử ──────────────────────────────────────────────────────────
export async function sendTestNotification(soundName) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Thông báo thử 🔔",
        body: "Nếu bạn nghe thấy âm thanh này là mọi thứ ổn rồi!",
        sound: soundFor(soundName),
        data: { kind: "test" },
        ...androidExtras,
      },
      trigger: { type: T.TIME_INTERVAL, seconds: 2 },
    });
  } catch {
    /* ignore */
  }
}

// ─── Chạm vào thông báo -> mở tab nào ───────────────────────────────────────
export function tabForNotification(data) {
  switch (data?.kind) {
    case "task":
    case "new_task":
      return "task";
    case "water":
      return "home";
    default:
      return null;
  }
}