// =============================================================================
// useAgentSync — đồng bộ nhắc nhở do AI/server tạo thành THÔNG BÁO CỤC BỘ trên máy.
// Không cần push APNs nên chạy được với bản IPA sideload. Mỗi lần mở app / quay lại app:
//   1) lấy ≤20 nhắc gần nhất từ /api/reminders/upcoming,
//   2) huỷ các thông báo agent cũ rồi lên lịch lại (không đụng tới nhắc uống nước của app),
//   3) bỏ qua nhắc đã qua. iOS giữ tối đa 64 thông báo cục bộ, nên chỉ lấy ít.
// Không tự xin quyền thông báo: dùng quyền app đã xin ở phần Nhắc nhở.
// Khi app đóng hẳn: dùng kênh ngoài (ntfy / Bark / Telegram) cấu hình ở server — xem README.
// =============================================================================
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

const KIND = "agent_reminder";

export async function syncAgentReminders({ token, apiBase, authFetch }) {
  const perm = await Notifications.getPermissionsAsync();
  if (!perm?.granted && perm?.status !== "granted") return 0;

  const doFetch = authFetch || fetch;
  const res = await doFetch(`${apiBase}/api/reminders/upcoming?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const { reminders = [] } = await res.json();

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n?.content?.data?.kind === KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
  );

  const DATE = Notifications.SchedulableTriggerInputTypes?.DATE ?? "date";
  let n = 0;
  for (const r of reminders) {
    const when = new Date(r.fire_at_utc);
    if (isNaN(when.getTime()) || when.getTime() <= Date.now() + 5000) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: "Nhắc nhở", body: r.text, sound: true, data: { kind: KIND, id: r.id } },
        trigger: { type: DATE, date: when },
      });
      n += 1;
    } catch {
      /* bỏ qua một nhắc lỗi, vẫn lên lịch các nhắc còn lại */
    }
  }
  return n;
}

export function useAgentSync({ token, apiBase, authFetch }) {
  const busy = useRef(false);
  const run = useCallback(async () => {
    if (!token || busy.current) return;
    busy.current = true;
    try {
      await syncAgentReminders({ token, apiBase, authFetch });
    } catch {
      /* offline: giữ lịch cũ */
    } finally {
      busy.current = false;
    }
  }, [token, apiBase, authFetch]);

  useEffect(() => {
    run();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") run();
    });
    return () => sub.remove();
  }, [run]);

  return { resync: run };
}
