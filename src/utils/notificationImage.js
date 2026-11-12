// Ảnh app-image của agent đính kèm vào THÔNG BÁO (iOS).
//  • Trên iOS, biểu tượng nhỏ bên cạnh thông báo LUÔN là icon app -> tự đổi theo appIcon (appIcon.js).
//  • File này thêm ảnh agent làm ảnh đính kèm (hiện thu nhỏ bên phải thông báo).
//  • Android: icon nhỏ của thông báo là ảnh đơn sắc cố định lúc build (plugin expo-notifications) — không đổi được lúc chạy.
//
// Dùng khi hẹn thông báo (utils/notifications.js):
//   import { getNotificationAttachments } from "./notificationImage";
//   content: { title, body, sound, ...(await getNotificationAttachments(aiThemeKey, accentKey)) }
import { Platform } from "react-native";
import { Asset } from "expo-asset";
import { getAppImage } from "../context/aiAgents";

let FS = null;
try {
  FS = require("expo-file-system/legacy");
} catch (e) {}

export async function getNotificationAttachments(themeKey, accentKey) {
  if (Platform.OS !== "ios") return {};
  try {
    const asset = Asset.fromModule(getAppImage(themeKey, accentKey));
    await asset.downloadAsync();
    let uri = asset.localUri || asset.uri;
    if (!uri) return {};

    // iOS có thể DI CHUYỂN file đính kèm vào kho riêng -> sao chép ra bản tạm để lần sau còn ảnh gốc
    if (FS?.cacheDirectory) {
      const copy = `${FS.cacheDirectory}notif-${themeKey}-${Date.now()}.png`;
      await FS.copyAsync({ from: uri, to: copy });
      uri = copy;
    }
    return { attachments: [{ identifier: `agent-${themeKey}`, url: uri }] };
  } catch (e) {
    return {}; // lỗi ảnh -> vẫn gửi thông báo bình thường, chỉ không có ảnh
  }
}
