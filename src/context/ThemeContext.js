import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useColorScheme, View } from "react-native";
import { AI_THEMES, DEFAULT_AI_THEME } from "./aiThemes";

export const ThemeContext = createContext();

// ── Giai đoạn mở app ─────────────────────────────────────────────────────────
// Giữ màn splash native cho tới khi theme đã đọc xong VÀ khung đầu tiên (đúng màu theme) đã vẽ.
// Nhờ vậy không còn khoảnh khắc trắng/đen giữa splash và app. Phải gọi ở mức module (trước khi render).
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions?.({ duration: 250, fade: true }); // splash tan mượt thay vì "cắt" sang màu theme

// Bảng màu nền mặc định (giữ lại để file khác import vẫn chạy).
// Khi chạy thật, màu nền được phối theo accent ở bên dưới (surfaceLight / surfaceDark).
export const lightColors = {
  background: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  textMuted: "#64748b",
  border: "#f1f5f9",
  dockBg: "rgba(255, 255, 255, 0.96)",
  dockShadow: "#0f172a",
};

export const darkColors = {
  background: "#0f172a",
  card: "#1e293b",
  text: "#f8fafc",
  textMuted: "#94a3b8",
  border: "#334155",
  dockBg: "rgba(30, 41, 59, 0.96)",
  dockShadow: "#000000",
};

// ── Bảng màu chủ đạo (accent) ────────────────────────────────────────────────
// primary / light / dark / rgb : màu accent như cũ.
// surfaceLight : nền SÁNG được pha tông theo accent (dịu, pastel, hợp tone)
// surfaceDark  : nền TỐI được pha tông theo accent (đậm, trầm, dịu mắt)
//   background : nền màn hình
//   card       : nền thẻ / modal
//   border     : viền, đường kẻ
//   text       : chữ chính
//   textMuted  : chữ phụ
//   pale       : viền "nhấn nhẹ" quanh nút (tai thỏ, nút chính, quà đã mở...)
export const ACCENTS = {
  ocean: {
    label: "Đại dương",
    primary: "#0ea5e9",
    light: "#67d8f5",
    dark: "#0284c7",
    rgb: "14,165,233",
    surfaceLight: {
      background: "#f0f9ff",
      card: "#ffffff",
      border: "#d9eefb",
      text: "#0c2a3e",
      textMuted: "#5b7a8f",
      pale: "#bae6fd",
    },
    surfaceDark: {
      background: "#0a1822",
      card: "#122636",
      border: "#1f3b52",
      text: "#e6f4fb",
      textMuted: "#8fb3c9",
      pale: "#0b5f8f",
    },
  },
  pink: {
    label: "Hồng",
    primary: "#ec4899",
    light: "#f9a8d4",
    dark: "#be185d",
    rgb: "236,72,153",
    surfaceLight: {
      background: "#fff1f7",
      card: "#ffffff",
      border: "#fbdcea",
      text: "#3b0a24",
      textMuted: "#98677f",
      pale: "#fbcfe8",
    },
    surfaceDark: {
      background: "#1c0e17",
      card: "#2b1724",
      border: "#47283c",
      text: "#fdf2f8",
      textMuted: "#c79bb6",
      pale: "#9d2a63",
    },
  },
  yellow: {
    label: "Vàng",
    primary: "#f59e0b",
    light: "#fcd34d",
    dark: "#b45309",
    rgb: "245,158,11",
    surfaceLight: {
      background: "#fffaeb",
      card: "#ffffff",
      border: "#f8ebc4",
      text: "#3a2a07",
      textMuted: "#8a6d2f",
      pale: "#fde68a",
    },
    surfaceDark: {
      background: "#19140a",
      card: "#272010",
      border: "#433717",
      text: "#fffbeb",
      textMuted: "#c9b27a",
      pale: "#8f5a0c",
    },
  },
  green: {
    label: "Xanh lá",
    primary: "#22c55e",
    light: "#86efac",
    dark: "#15803d",
    rgb: "34,197,94",
    surfaceLight: {
      background: "#f0fdf4",
      card: "#ffffff",
      border: "#d6f3df",
      text: "#0b2e1a",
      textMuted: "#5f8a70",
      pale: "#bbf7d0",
    },
    surfaceDark: {
      background: "#09170f",
      card: "#112619",
      border: "#1e422d",
      text: "#ecfdf5",
      textMuted: "#8fbfa3",
      pale: "#17803c",
    },
  },
  purple: {
    label: "Tím",
    primary: "#8b5cf6",
    light: "#c4b5fd",
    dark: "#6d28d9",
    rgb: "139,92,246",
    surfaceLight: {
      background: "#f6f3ff",
      card: "#ffffff",
      border: "#e6dffb",
      text: "#1e1245",
      textMuted: "#7c6fa3",
      pale: "#ddd6fe",
    },
    surfaceDark: {
      background: "#110d20",
      card: "#1c1632",
      border: "#32295a",
      text: "#f5f3ff",
      textMuted: "#a99bd6",
      pale: "#5b32b8",
    },
  },
  orange: {
    label: "Cam",
    primary: "#f97316",
    light: "#fdba74",
    dark: "#c2410c",
    rgb: "249,115,22",
    surfaceLight: {
      background: "#fff6ed",
      card: "#ffffff",
      border: "#fde4cb",
      text: "#361a07",
      textMuted: "#9a6c4a",
      pale: "#fed7aa",
    },
    surfaceDark: {
      background: "#1a0f08",
      card: "#2a190d",
      border: "#47301b",
      text: "#fff7ed",
      textMuted: "#d0a583",
      pale: "#a2410f",
    },
  },
};
export const DEFAULT_ACCENT = "ocean";

// ── Trang trí cho nút chụp ảnh (vẽ ở components/ButtonDecoration.js) ─────────
export const DECORATIONS = [
  { key: "none", label: "Không", emoji: "🚫" },
  { key: "rabbit", label: "Tai thỏ", emoji: "🐇" },
  { key: "cat", label: "Tai mèo", emoji: "🐱" },
  { key: "bear", label: "Tai gấu", emoji: "🐻" },
  { key: "crown", label: "Vương miện", emoji: "👑" },
  { key: "bow", label: "Nơ", emoji: "🎀" },
  { key: "halo", label: "Hào quang", emoji: "😇" },
  { key: "sparkles", label: "Lấp lánh", emoji: "✨" },
];
export const DEFAULT_DECORATION = "rabbit";

// "#rrggbb" -> "rgba(r,g,b,alpha)"
const hexToRgba = (hex, alpha) => {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme(); // Tự động nghe lén theme của điện thoại
  const [themePreference, setThemePreference] = useState("system");
  const [accentKey, setAccentKey] = useState(DEFAULT_ACCENT);
  const [decorationKey, setDecorationKey] = useState(DEFAULT_DECORATION);
  const [aiThemeKey, setAiThemeKey] = useState(DEFAULT_AI_THEME);
  const [isReady, setIsReady] = useState(false);

  // Vừa mở app là móc trong kho ra xem trước đó sếp chọn theme + màu gì
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const [savedTheme, savedAccent, savedDeco, savedAiTheme] =
          await Promise.all([
            AsyncStorage.getItem("themePreference"),
            AsyncStorage.getItem("accentPreference"),
            AsyncStorage.getItem("decorationPreference"),
            AsyncStorage.getItem("aiThemePreference"),
          ]);
        if (savedTheme) setThemePreference(savedTheme);
        if (savedAccent && ACCENTS[savedAccent]) setAccentKey(savedAccent);
        if (savedDeco && DECORATIONS.some((d) => d.key === savedDeco))
          setDecorationKey(savedDeco);
        if (savedAiTheme && AI_THEMES[savedAiTheme])
          setAiThemeKey(savedAiTheme);
      } catch (e) {
      } finally {
        setIsReady(true);
      }
    };
    loadTheme();
  }, []);

  // Hàm lưu theme sếp vừa bấm
  const changeTheme = async (newTheme) => {
    setThemePreference(newTheme);
    try {
      await AsyncStorage.setItem("themePreference", newTheme);
    } catch (e) {}
  };

  // Hàm lưu màu chủ đạo sếp vừa bấm
  const changeAccent = async (newAccent) => {
    if (!ACCENTS[newAccent]) return;
    setAccentKey(newAccent);
    try {
      await AsyncStorage.setItem("accentPreference", newAccent);
    } catch (e) {}
  };

  // Hàm lưu kiểu trang trí nút sếp vừa chọn
  const changeDecoration = async (newDeco) => {
    if (!DECORATIONS.some((d) => d.key === newDeco)) return;
    setDecorationKey(newDeco);
    try {
      await AsyncStorage.setItem("decorationPreference", newDeco);
    } catch (e) {}
  };

  // Hàm lưu AI-theme (phong cách ảnh AI) sếp vừa chọn
  const changeAiTheme = async (newKey) => {
    if (!AI_THEMES[newKey]) return;
    setAiThemeKey(newKey);
    try {
      await AsyncStorage.setItem("aiThemePreference", newKey);
    } catch (e) {}
  };

  // Tính toán xem cuối cùng là xài màu Sáng hay Tối
  const activeTheme =
    themePreference === "system"
      ? systemColorScheme || "light"
      : themePreference;

  // colors = nền Sáng/Tối ĐÃ PHA TÔNG theo accent + bộ màu accent
  const colors = useMemo(() => {
    const isDark = activeTheme === "dark";
    const a = ACCENTS[accentKey] || ACCENTS[DEFAULT_ACCENT];
    const s = isDark ? a.surfaceDark : a.surfaceLight;
    return {
      // nền / thẻ / chữ / viền: hài hoà với accent đang chọn
      background: s.background,
      card: s.card,
      text: s.text,
      textMuted: s.textMuted,
      border: s.border,
      dockBg: hexToRgba(s.card, 0.96),
      dockShadow: isDark ? "#000000" : s.text, // bóng đổ ngả tông thay vì đen/xám thuần

      // accent
      primary: a.primary,
      primaryLight: a.light,
      primaryDark: a.dark,
      primaryPale: s.pale, // viền nhấn nhẹ: sáng pastel ở Light, trầm đậm ở Dark
      primaryText: isDark ? a.light : a.dark, // chữ màu accent, đọc được ở cả 2 chế độ
      primaryRgb: a.rgb,
      primarySoft: `rgba(${a.rgb},${isDark ? 0.2 : 0.14})`, // nền nhạt
      primaryBorder: `rgba(${a.rgb},${isDark ? 0.45 : 0.35})`, // viền nhạt
    };
  }, [activeTheme, accentKey]);

  // Màu nền của CỬA SỔ GỐC (native) = màu nền theme: không còn mảng trắng/đen lộ ra khi mở app,
  // bật bàn phím, xoay máy hoặc chuyển màn hình.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  // Ẩn splash sau khi khung đầu tiên đã vẽ bằng đúng màu theme
  const splashHidden = useRef(false);
  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    requestAnimationFrame(() => SplashScreen.hideAsync().catch(() => {}));
  }, []);

  const value = useMemo(
    () => ({
      themePreference,
      changeTheme,
      activeTheme,
      isDark: activeTheme === "dark",
      colors,
      accentKey,
      changeAccent,
      accents: ACCENTS,
      decorationKey,
      changeDecoration,
      decorations: DECORATIONS,
      aiThemeKey,
      changeAiTheme,
      aiThemes: AI_THEMES,
    }),
    [themePreference, activeTheme, colors, accentKey, decorationKey, aiThemeKey],
  );

  // Chưa đọc xong theme đã lưu: splash native vẫn đang che (preventAutoHideAsync ở trên) nên trả null là an toàn
  if (!isReady) return null;

  return (
    <ThemeContext.Provider value={value}>
      {/* nền theme phủ toàn bộ: màn nào chưa tự đặt màu nền cũng không lộ nền mặc định */}
      <View
        style={{ flex: 1, backgroundColor: colors.background }}
        onLayout={hideSplash}
      >
        {children}
      </View>
    </ThemeContext.Provider>
  );
};

// Hook xài nhanh cho các màn hình
export const useTheme = () => useContext(ThemeContext);