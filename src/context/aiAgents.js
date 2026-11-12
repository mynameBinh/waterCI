// ─────────────────────────────────────────────────────────────────────────────
//  AI-AGENT  (trước đây gọi là "AI-theme")
//
//  Mỗi agent = 1 key trong AI_THEMES (src/context/aiThemes.js).
//  • Ảnh / style ảnh : nằm trong aiThemes.js.
//  • TÊN + NỘI DUNG khung chat (lời chào, gợi ý, placeholder…) : sửa ở AGENT_META bên dưới.
//  • TÍNH CÁCH (prompt AI) : sửa ở backend main.py -> AI_AGENTS.
//
//  ⚠️ KEY trong AGENT_META phải TRÙNG key trong AI_THEMES ("ai-avata", "whale-avata"). Lệch key sẽ có cảnh báo ở __DEV__.
//     Backend còn nhận diện thêm theo TÊN agent, nên đặt `name` ở đây TRÙNG `name` trong AI_AGENTS.
//
//  Dùng trong component:
//     const { key, name, content } = useAiAgent();
//     const logo = useAppLogo();       // logo app theo agent + màu chủ đạo
//     const bg = useAppBackground();   // ảnh nền app theo agent (null nếu không có)
//
//  ▶ APP-IMAGE (biểu tượng app + ảnh thông báo theo agent):
//     AGENT_META[key].appImage = ảnh đại diện (1 ảnh hoặc map theo màu chủ đạo) — ảnh đính kèm thông báo.
//     AGENT_META[key].appIcon  = id icon PHỤ của app (khớp AGENT_ICONS trong app.config.js).
//                                Icon thật = id + màu, vd "TieuDauPink"; thiếu -> id gốc "TieuDau" -> icon mặc định.
//     Xem thêm: src/context/appIcon.js (đồng bộ icon) và src/utils/notificationImage.js.
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
//   content.taskDoneFallback  bong bóng khi xong mục tiêu mà AI không có câu riêng
//   content.waterFallback     bong bóng khi lưu check-in nước mà AI không có câu riêng
//   content.appealWaterDone   bong bóng khi ghi nhận bù check-in nước
//   content.appealTaskDone    bong bóng khi ghi nhận bù mục tiêu
//
//  AGENT_META[key].voice = giọng của THÔNG BÁO ĐẨY (utils/notifications.js):
//   voice.me         đại từ tự xưng ("em", "mình"…)           (mặc định "em")
//   voice.userCall   cách gọi người dùng                      (mặc định "bạn")  — phải khớp user_call của agent ở backend
//   voice.templates  (tuỳ chọn) câu thông báo riêng, mỗi mục là MẢNG câu; không ghi = dùng câu mặc định.
//                    Các khoá: waterTitles, waterBodies, taskTitles, taskTodayOne, taskTodayMany, taskNextOne,
//                    taskNextMany, newTaskTitleOne, newTaskTitleMany, newTaskBodyOne, newTaskBodyMany, testBodies
//                    Biến: {a}=tên agent {me}/{Me}=xưng hô {u}/{U}=gọi người dùng {t}=giờ {n}=tên mục tiêu {c}=số lượng
export const AGENT_META = {
  "ai-avata": {
    name: "Tiểu Đậu",
    // ▶ APP-IMAGE: 1 ảnh, hoặc map theo màu chủ đạo { ocean, pink, yellow, orange, purple, green }
    appImage: AI_THEMES["ai-avata"].images,
    appIcon: "TieuDau", // id icon phụ — khớp AGENT_ICONS trong app.config.js
  },
  "whale-avata": {
    name: "Tiểu Ngư",
    // ▶ APP-IMAGE: ocean dùng app-whale.png, các màu khác dùng ảnh cá voi theo màu
    appImage: { ...AI_THEMES["whale-avata"].images, ocean: require("../../assets/avata/whale-avata/app-whale.png") },
    appIcon: "Whale", // id icon phụ — khớp AGENT_ICONS trong app.config.js
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
      taskDoneFallback: "Hoàn thành mục tiêu rồi, bạn làm tốt lắm 🌟",
      waterFallback: "Uống nước đều đặn thật tốt cho bạn đó 💧",
      appealWaterDone: "Mình ghi nhận bù rồi nhé, lần sau chụp rõ hơn một chút giúp mình 🐚",
      appealTaskDone: "Mình ghi nhận bù mục tiêu cho bạn rồi nhé ✅",
    },
    // ▶ SỬA: giọng thông báo đẩy của Tiểu Ngư
    voice: {
      me: "mình",
      userCall: "bạn",
      templates: {
        waterTitles: ["{a} nhắc {u} nè 💧", "Đến giờ uống nước rồi 🌊", "Một ngụm nước nhé {u} 🐳"],
        waterBodies: [
          "{t} rồi, {u} uống một ngụm nước cho khoẻ nhé 💧",
          "{Me} canh giờ giúp {u}: uống nước rồi chụp check-in giữ chuỗi nhé 🔥",
          "Cơ thể {u} đang cần nước đó, nhấp một ngụm nhé 🌊",
        ],
        taskTitles: ["Nhắc mục tiêu hôm nay 🎯", "{a} nhắc {u} nhé 🎯"],
        taskTodayOne: [
          "Mục tiêu “{n}” còn đang chờ {u} đó, check-in nhé 🎯",
          "Chỉ còn “{n}” thôi, {Me} tin {u} làm được ✨",
        ],
        taskTodayMany: [
          "Còn {c} mục tiêu chưa xong: {n}. Cố lên nhé {u} 💪",
          "{u} còn {c} việc nhỏ: {n}. Xong hết {me} sẽ khen {u} liền 💙",
        ],
        taskNextOne: ["Hôm nay {u} có mục tiêu “{n}”, {me} chờ ảnh check-in nhé 🌤️"],
        taskNextMany: ["Hôm nay {u} có {c} mục tiêu: {n}. Mình cùng cố gắng nhé 🌟"],
        newTaskTitleOne: ["Có mục tiêu mới nè 🎯", "{a} báo tin vui 🎉"],
        newTaskTitleMany: ["Có {c} mục tiêu mới nè 🎯", "{a} báo tin vui: có {c} mục tiêu mới 🎉"],
        newTaskBodyOne: ["“{n}” — vào check-in nhé, {me} chờ {u} 🌊"],
        newTaskBodyMany: ["{n} — {u} vào xem nhé, {me} chờ 🌊"],
        testBodies: ["{a} thử loa nè, nếu {u} nghe được âm thanh này là ổn rồi nhé 🐳"],
      },
    },
  },
};

// Cảnh báo sớm nếu key AGENT_META và AI_THEMES lệch nhau (chỉ chạy khi dev)
if (typeof __DEV__ !== "undefined" && __DEV__) {
  Object.keys(AI_THEMES).forEach((k) => {
    if (!AGENT_META[k]) console.warn(`[aiAgents] AI_THEMES có "${k}" nhưng AGENT_META thiếu key này`);
  });
  Object.keys(AGENT_META).forEach((k) => {
    if (!AI_THEMES[k]) console.warn(`[aiAgents] AGENT_META có "${k}" nhưng AI_THEMES không có key này`);
  });
}

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

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const defaultContent = (name, { me, userCall: u }) => ({
  emptyTitle: `${name} có mặt🐋`,
  emptySub: `Hỏi ${me} về học tập, giải trí, hay nhờ ${me} tạo nội dung. ${cap(me)} sẽ trả lời nhanh nhất có thể.`,
  cameraHintAppeal: `Chụp rõ hơn một chút để ${me} xem lại giúp ${u} nhé`,
  cameraHint: `Chụp thứ ${u} muốn hỏi: bài tập, tài liệu, món đồ…`,
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
  taskDoneFallback: "Hoàn thành mục tiêu rồi, giỏi quá! ✅",
  waterFallback: "Uống nước đều đặn, giỏi lắm luôn! 💧",
  appealWaterDone: `${cap(me)} ghi nhận bù rồi nha, lần sau chụp rõ hơn xíu giúp ${me}! 😾`,
  appealTaskDone: `${cap(me)} ghi nhận bù mục tiêu cho ${u} rồi nha! ✅`,
  memoryHint:
    `${name} chỉ ghi nhớ khi được nhờ, ví dụ: “Hãy nhớ tên mình là …”, “Từ giờ gọi mình là …”, ` +
    "“Mình đang học trường …”. Bạn có thể xoá từng điều ở đây bất cứ lúc nào.",
});

export const getAgentContent = (key) => ({
  ...defaultContent(getAgentName(key), getAgentVoice(key)),
  ...(AGENT_META[key]?.content || {}),
});

// Giọng thông báo đẩy của agent (xem hướng dẫn ở đầu file)
export const getAgentVoice = (key) => ({
  me: "tớ",
  userCall: "cậu",
  templates: {},
  ...(AGENT_META[key]?.voice || {}),
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

// ── APP-IMAGE ────────────────────────────────────────────────────────────────
const safeThemeKey = (themeKey) => (AI_THEMES[themeKey] ? themeKey : DEFAULT_AI_THEME);

// 1 ảnh (native: number, web: string / {uri}) hay map theo màu?
const isSingleImage = (img) =>
  typeof img === "number" || typeof img === "string" || (img && img.uri);

// Ảnh app-image của agent theo màu chủ đạo (thiếu -> avatar của agent). Dùng được ngoài component.
export const getAppImage = (themeKey, accentKey = "ocean") => {
  const k = safeThemeKey(themeKey);
  const img = AGENT_META[k]?.appImage;
  if (!img) return getAiAvatar(k, accentKey);
  if (isSingleImage(img)) return img;
  return img[accentKey] || img.ocean || Object.values(img)[0] || getAiAvatar(k, accentKey);
};

// id icon phụ gốc của agent (vd "TieuDau"); null nếu agent không có icon riêng.
export const getAppIconName = (themeKey) => AGENT_META[safeThemeKey(themeKey)]?.appIcon ?? null;

// Hook: app-image của agent + màu đang chọn
export const useAppImage = () => {
  const { aiThemeKey, accentKey } = useTheme();
  return getAppImage(aiThemeKey, accentKey);
};