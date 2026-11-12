// Đồng bộ BIỂU TƯỢNG APP với AI-agent + màu chủ đạo đang chọn.
//  • Icon cần có dạng  <appIcon><Màu>  (vd "TieuDauPink"); thiếu -> "<appIcon>" (vd "TieuDau"); thiếu nữa -> icon mặc định.
//  • Danh sách icon ĐÃ build vào app lấy từ app.config.js (extra.appIcons) nên không bao giờ gọi icon không tồn tại.
//  • iOS: mỗi lần đổi icon, hệ điều hành hiện hộp thoại "Bạn đã đổi biểu tượng" (không tắt được).
//  • Chỉ chạy trong development build / bản build thật — Expo Go không có module này.
import Constants from "expo-constants";
import { useEffect } from "react";
import { useTheme } from "./ThemeContext";
import { getAppIconName } from "./aiAgents";

let Icons = null;
try {
  Icons = require("expo-alternate-app-icons");
} catch (e) {}

const built = new Set(Constants.expoConfig?.extra?.appIcons ?? []);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Trả về tên icon cần dùng, hoặc null = icon mặc định
export const resolveAppIcon = (themeKey, accentKey) => {
  const base = getAppIconName(themeKey);
  if (!base) return null;
  for (const name of [base + cap(accentKey || "ocean"), base]) {
    if (built.has(name)) return name;
  }
  return null;
};

export async function applyAppIcon(themeKey, accentKey) {
  if (!Icons?.supportsAlternateIcons) return;
  const target = resolveAppIcon(themeKey, accentKey);
  let current = null;
  try {
    current = Icons.getAppIconName() ?? null;
  } catch (e) {}
  if (current === target) return; // đã đúng -> không gọi (tránh hộp thoại thừa)
  try {
    await Icons.setAlternateAppIcon(target);
  } catch (e) {
    if (__DEV__) console.warn("[appIcon] không đổi được icon:", target, e?.message);
  }
}

export function useSyncAppIcon() {
  const { aiThemeKey, accentKey } = useTheme();
  useEffect(() => {
    applyAppIcon(aiThemeKey, accentKey);
  }, [aiThemeKey, accentKey]);
}

// Component không vẽ gì, đặt bên trong <ThemeProvider> (xem App.js)
export default function AppIconSync() {
  useSyncAppIcon();
  return null;
}
