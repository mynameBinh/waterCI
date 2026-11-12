// ─────────────────────────────────────────────────────────────────────────────
//  AI-AGENT  (trước đây gọi là "AI-theme")
//
//  Mỗi agent = 1 key trong AI_THEMES (src/context/aiThemes.js).
//  • Ảnh / style ảnh : nằm trong aiThemes.js.
//  • TÊN + NỘI DUNG khung chat (lời chào, gợi ý, placeholder…) : sửa ở AGENT_META bên dưới.
//  • TÍNH CÁCH (prompt AI) : sửa ở backend main.py -> AI_AGENTS.
//
//  ⚠️ KEY trong AGENT_META phải TRÙNG key trong AI_THEMES  (và trùng key trong AI_AGENTS ở backend).
//     Backend còn nhận diện thêm theo TÊN agent, nên đặt `name` ở đây TRÙNG `name` trong AI_AGENTS.
//
//  Dùng trong component:
//     const { key, name, content } = useAiAgent();
//     const logo = useAppLogo();       // logo app theo agent + màu chủ đạo
//     const bg = useAppBackground();   // ảnh nền app theo agent (null nếu không có)
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import {
  AI_THEMES,
  DEFAULT_AI_THEME,
  getAiAvatar,
  getAiBackground,
  getAiBackgroundStyle,
} from "./aiThemes";
import { useTheme } from "./ThemeContext";

export const FALLBACK_AGENT_NAME = "Trợ lý AI";

// ▶ BẠN TỰ SỬA. Mọi trường trong `content` đều tuỳ chọn (không điền thì dùng mặc định bên dưới).
//   content.emptyTitle        tiêu đề màn hình chào
//   content.emptySub          dòng mô tả dưới tiêu đề
//   content.suggestions       4 gợi ý bấm nhanh [{ icon (Ionicons), text }]
//   content.placeholder       chữ mờ trong ô nhập
//   content.appealPlaceholder chữ mờ khi giải thích check-in bị từ chối
//   content.historyEmpty      câu ở lịch sử khi chưa có cuộc trò chuyện
//   content.memoryTitle       tiêu đề bảng ghi nhớ
//   content.memoryHint        mô tả bảng ghi nhớ
export const AGENT_META = {
  tieudau: {
    name: "Tiểu Đậu",
  },
  whale: {
    name: "Tiểu Ngư",
    content: {
      emptyTitle: "Tiểu Ngư đây 🐳",
      emptySub: "Cứ hỏi mình về học tập, đời sống hay nhờ mình viết giúp một thứ gì đó nhé. Mình sẽ trả lời thật nhẹ nhàng.",
      suggestions: [
        { icon: "school-outline", text: "Giải thích giúp mình một khái niệm khó" },
        { icon: "create-outline", text: "Cùng viết một đoạn văn ngắn nhé" },
        { icon: "language-outline", text: "Dịch và chỉnh lại câu này giúp mình" },
        { icon: "water-outline", text: "Gợi ý cách uống nước đều đặn hơn" },
      ],
      placeholder: "Trò chuyện với Tiểu Ngư…",
      appealPlaceholder: "Kể cho Tiểu Ngư nghe nhé…",
      historyEmpty: "Trò chuyện với Tiểu Ngư một chút để bắt đầu nhé 🌊",
      memoryTitle: "Tiểu Ngư đang nhớ",
      memoryHint:
        "Tiểu Ngư chỉ ghi nhớ khi được nhờ, ví dụ: “Hãy nhớ mình tên là …”, “Từ giờ gọi mình là …”. Bạn có thể xoá từng điều ở đây bất cứ lúc nào.",
    },
  },
};

// Bỏ dấu + ký tự lạ để so khớp tên (khớp với backend: "Tiểu Ngư" -> "tieungu")
export const agentSlug = (name) => {
  let t = String(name || "").toLowerCase().replace(/đ/g, "d");
  try {
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    /* môi trường không có normalize -> giữ nguyên */
  }
  return t.replace(/[^a-z0-9]/g, "");
};

export const getAgentName = (key) =>
  AGENT_META[key]?.name || AI_THEMES[key]?.label || FALLBACK_AGENT_NAME;

const defaultContent = (name) => ({
  emptyTitle: `${name} có mặt🥰`,
  emptySub: "hỏi em về học tập, giải trí, hay nhờ em tạo nội dung. Em sẽ trả lời nhanh nhất có thể.",
  suggestions: [
    { icon: "school-outline", text: "Giải thích một khái niệm khó hiểu" },
    { icon: "create-outline", text: "Giúp viết một đoạn văn ngắn" },
    { icon: "language-outline", text: "Dịch và sửa lỗi câu này" },
    { icon: "bulb-outline", text: "Gợi ý một vài ý tưởng thú vị" },
  ],
  placeholder: `Nhắn cho ${name}…`,
  appealPlaceholder: `Giải thích với ${name}…`,
  historyEmpty: `Nhắn cho ${name} một câu để bắt đầu nhé 💬`,
  memoryTitle: `${name} đang nhớ`,
  memoryHint:
    `${name} chỉ ghi nhớ khi được nhờ, ví dụ: “Hãy nhớ chị tên là …”, “Từ giờ gọi em là …”, ` +
    "“Em đang học trường …”. Chị có thể xoá từng điều ở đây bất cứ lúc nào.",
});

export const getAgentContent = (key) => ({
  ...defaultContent(getAgentName(key)),
  ...(AGENT_META[key]?.content || {}),
});

// Hook: agent đang chọn
export const useAiAgent = () => {
  const { aiThemeKey } = useTheme();
  const key = AI_THEMES[aiThemeKey] ? aiThemeKey : DEFAULT_AI_THEME;
  return useMemo(
    () => ({ key, name: getAgentName(key), slug: agentSlug(getAgentName(key)), content: getAgentContent(key) }),
    [key],
  );
};

// Hook: ảnh LOGO của app theo agent (ưu tiên appLogo riêng, không có thì dùng avatar theo màu chủ đạo)
// Bản không phải hook (dùng được ở utils/notifications.js)
export const getAppLogo = (themeKey, accentKey) =>
  AGENT_META[themeKey]?.appLogo || getAiAvatar(themeKey, accentKey);

export const useAppLogo = () => {
  const { aiThemeKey, accentKey } = useTheme();
  return getAppLogo(aiThemeKey, accentKey);
};

// Hook: ảnh NỀN của app theo agent (null nếu agent không có ảnh nền)
export const useAppBackground = () => {
  const { aiThemeKey, accentKey } = useTheme();
  const source = AGENT_META[aiThemeKey]?.appBackground || getAiBackground(aiThemeKey, accentKey);
  return source ? { source, style: getAiBackgroundStyle(aiThemeKey) } : null;
};