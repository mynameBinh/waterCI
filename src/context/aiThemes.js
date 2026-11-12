// Registry các theme ảnh AI. Metro bắt buộc require phải là đường dẫn tĩnh nên phải liệt kê từng ảnh.
// images: key theo accent (ocean / pink / yellow / orange / purple / green).
// Accent nào không có ảnh -> tự lấy ảnh mặc định của theme đó (ocean = tấm đầu, xanh dương).
export const AI_THEMES = {
  "ai-avata": {
    label: "AI Avatar",
    scale: 1, // phóng ảnh khi hiển thị (1 = giữ nguyên)
    // rounded: true (mặc định) -> giữ bo tròn như style gốc
    images: {
      ocean: require("../../assets/avata/ai-avata/ai-avata-xanhduong.png"),
      pink: require("../../assets/avata/ai-avata/ai-avata-hong.png"),
      yellow: require("../../assets/avata/ai-avata/ai-avata-vang.png"),
      orange: require("../../assets/avata/ai-avata/ai-avata-cam.png"),
      purple: require("../../assets/avata/ai-avata/ai-avata-tim.png"),
      green: require("../../assets/avata/ai-avata/ai-avata-xanhla.png"),
    },
  },
  "whale-avata": {
    label: "Tiểu Ngư",
    scale: 1.29, // ảnh đã xoá phông, viền trong suốt nên hơi nhỏ -> phóng to (chỉnh số này cho vừa mắt)
    rounded: false, // ảnh đã xoá phông -> KHÔNG bo tròn (bo tròn sẽ cắt mất hình)
    resizeMode: "contain", // hiện trọn ảnh, không crop
    backgroundScale: 1, // phóng riêng cho ảnh nền ở màn hình trống (chỉnh cho vừa mắt)
    // Ảnh nền màn hình trống: 1 ảnh duy nhất, hoặc map theo accent (ocean / pink / yellow / orange / purple / green).
    // Thiếu màu -> ocean -> ảnh đầu tiên. Theme không có background -> dùng avatar.
    background: {
      ocean: require("../../assets/avata/whale-avata/whale-background-blue.png"),
      pink: require("../../assets/avata/whale-avata/whale-background-pink.png"),
      yellow: require("../../assets/avata/whale-avata/whale-background-yellow.png"),
      orange: require("../../assets/avata/whale-avata/whale-background-orange.png"),
      purple: require("../../assets/avata/whale-avata/whale-background-purple.png"),
      green: require("../../assets/avata/whale-avata/whale-background-green.png"),
    },
    images: {
      // mới có 1 ảnh -> mọi màu đều dùng ảnh này (fallback)
      ocean: require("../../assets/avata/whale-avata/blue-whale.png"),
      pink: require("../../assets/avata/whale-avata/pink-whale.png"),
      yellow: require("../../assets/avata/whale-avata/yelow-whale.png"),
      orange: require("../../assets/avata/whale-avata/orange-whale.png"),
      purple: require("../../assets/avata/whale-avata/purple-whale.png"),
      green: require("../../assets/avata/whale-avata/green-whale.png"),
    },
  },
  // Sau này thêm theme mới: copy 1 khối ở trên, đổi key / label / scale / đường dẫn ảnh.
};

export const DEFAULT_AI_THEME = "whale-avata";

// Lấy ảnh theo theme + accent; thiếu ảnh -> tấm mặc định (ocean) -> tấm đầu tiên có trong theme
export const getAiAvatar = (themeKey, accentKey) => {
  const theme = AI_THEMES[themeKey] || AI_THEMES[DEFAULT_AI_THEME];
  const imgs = theme.images;
  return imgs[accentKey] || imgs.ocean || Object.values(imgs)[0];
};

// Style riêng cho từng theme, gắn SAU style gốc của <Image> nên sẽ ghi đè:
//  - rounded === false  -> bỏ bo tròn (borderRadius = 0) để ảnh đã xoá phông không bị cắt góc
//  - resizeMode         -> "contain" = hiện trọn ảnh, không bị crop như "cover" mặc định
//  - scale              -> phóng to bằng transform (không làm xô lệch bố cục xung quanh)
export const getAiAvatarStyle = (themeKey) => {
  const theme = AI_THEMES[themeKey] || AI_THEMES[DEFAULT_AI_THEME];
  const style = {};
  if (theme.rounded === false) style.borderRadius = 0;
  if (theme.resizeMode) style.resizeMode = theme.resizeMode;
  if (theme.scale && theme.scale !== 1) style.transform = [{ scale: theme.scale }];
  return Object.keys(style).length ? style : undefined;
};

// Ảnh nền theo theme + accent. Trả về null nếu theme không có background.
export const getAiBackground = (themeKey, accentKey) => {
  const theme = AI_THEMES[themeKey] || AI_THEMES[DEFAULT_AI_THEME];
  const bg = theme.background;
  if (!bg) return null;
  // 1 ảnh duy nhất (native: number, web: string / {uri})
  const isSingle = typeof bg === "number" || typeof bg === "string" || (bg && bg.uri);
  if (isSingle) return bg;
  // map theo accent: đúng màu -> ocean -> ảnh đầu tiên có
  return bg[accentKey] || bg.ocean || Object.values(bg)[0] || null;
};

// Style riêng cho ảnh nền: lấp đầy khung emptyGlow (120x120) và bo tròn giống viền khung (borderRadius 40)
//  - backgroundRadius     -> độ bo góc (mặc định 40 = bằng viền emptyGlow)
//  - backgroundResizeMode -> "cover" (mặc định, lấp đầy khung) hoặc "contain" (hiện trọn ảnh)
export const getAiBackgroundStyle = (themeKey) => {
  const theme = AI_THEMES[themeKey] || AI_THEMES[DEFAULT_AI_THEME];
  const style = {
    width: 120,
    height: 120,
    borderRadius: theme.backgroundRadius ?? 40,
    resizeMode: theme.backgroundResizeMode || "cover",
  };
  if (theme.backgroundScale && theme.backgroundScale !== 1) {
    style.transform = [{ scale: theme.backgroundScale }];
  }
  return style;
};