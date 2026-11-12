import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { DEFAULT_AI_THEME, AI_THEMES, getAiAvatar } from "../context/aiThemes";
import { ACCENTS } from "../context/ThemeContext";

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
// iOS chỉ phát được file đã được đóng gói vào app: MỖI file ở đây phải có trong mảng "sounds" của plugin
// expo-notifications (app.json) với đúng tên + đuôi, rồi build lại app. File chưa có -> tự dùng âm mặc định.
const SOUND_FILES = {
  "Tiếng nước chảy": "pouring_water.wav",
  "Ting ting": "ting_ting.wav",
  "Tiếng chim hót": "bird.wav",
  "Chuông ngân (Mặc định)": "pouring_water.wav", // giữ đúng hành vi cũ
};
// Android: âm thanh được gắn ở NOTIFICATION CHANNEL ("water-reminder", tạo trong DashboardScreen với
// sound: "pouring_water.mp3"). File nằm trong res/raw do plugin expo-notifications ("sounds") chép vào,
// nên ở đây chỉ dùng TÊN FILE trùng channel — KHÔNG dùng đường dẫn tương đối kiểu "../assets/...".
const ANDROID_SOUND = "pouring_water.mp3";

// iOS: file .wav chỉ phát được nếu BẢN APP ĐANG CHẠY đã đóng gói nó (xem hướng dẫn build lại). Bản chưa có thì
// native chỉ GHI LOG "Custom sound ... not found in native app" (không ném lỗi) và thông báo mất tiếng.
// Để false = dùng âm mặc định cho tới khi bạn build lại app có chứa file; build xong thì đổi thành true.
const IOS_CUSTOM_SOUNDS_READY = false;
const soundFor = (name) =>
  IS_ANDROID
    ? ANDROID_SOUND
    : IOS_CUSTOM_SOUNDS_READY
      ? (SOUND_FILES[name] ?? "default")
      : "default";

// ─── Giọng "Tiểu Đậu" ────────────────────────────────────────────────────────
// Tiểu Đậu xưng "em", gọi người dùng là "anh" / "chị". Cách gọi lấy từ server (điều người dùng đã nhờ
// AI ghi nhớ) và được lưu lại để dùng được cả khi offline. {u} = anh|chị, {U} = Anh|Chị.
const ADDRESS_KEY = "notif_user_address";
const DEFAULT_ADDRESS = "chị"; // khớp mặc định của server (NOTIF_DEFAULT_ADDRESS)
let userAddress = null;
let accentKey = "ocean";
let aiThemeKey = DEFAULT_AI_THEME;

// Gọi từ DashboardScreen mỗi lần render (chỉ gán biến, rất nhẹ). Trả về true nếu cách xưng hô đổi.
export function setNotificationVoice({ accent, aiTheme, address } = {}) {
  if (accent && ACCENTS[accent]) accentKey = accent;
  if (aiTheme && AI_THEMES[aiTheme]) aiThemeKey = aiTheme;
  if (address === "anh" || address === "chị") {
    if (address !== userAddress) {
      userAddress = address;
      AsyncStorage.setItem(ADDRESS_KEY, address).catch(() => {});
      return true;
    }
  }
  return false;
}

async function getAddress() {
  if (userAddress) return userAddress;
  try {
    const v = await AsyncStorage.getItem(ADDRESS_KEY);
    if (v === "anh" || v === "chị") userAddress = v;
  } catch {
    /* ignore */
  }
  return userAddress || DEFAULT_ADDRESS;
}

const WATER_TITLES = [
  "Tiểu Đậu nhắc {u} nè 💧",
  "Uống nước thôi {u} ơi! 🥤",
  "Ting ting! Giờ uống nước rồi 💦",
  "{U} ơi, em khát giùm {u} nè 🐳",
  "Nước đang gọi {u} đó nha 🌊",
];
const WATER_BODIES = [
  "{t} rồi nè! {U} nhấp một ngụm cho em vui nha 🥺",
  "Em canh giờ giùm {u} nè: uống nước rồi chụp check-in giữ chuỗi nha! 🔥",
  "Cơ thể {u} đang réo gọi nước đó, em nghe thấy luôn á 💧",
  "Một ly nước nhỏ xíu thôi, {u} làm được mà! Em cổ vũ nè 📣",
  "Chuỗi streak đang chờ {u} đó, uống nước rồi check-in liền nha ✨",
  "Em nhắc nhẹ thôi nha: {t} rồi, {u} uống nước chưa ạ? 🐥",
  "Da đẹp dáng xinh là nhờ uống nước, {u} ơi! Em chờ ảnh check-in nè 📸",
  "Ly nước này ngon lắm luôn, {u} thử đi nha! 🥤",
  "Tiểu Đậu đến giao lời nhắc: uống nước thôi nào {u} 🌈",
  "Đừng để em đợi lâu nha, {u} uống nước rồi khoe em xem nè 😚",
];

const TASK_TITLES = [
  "Nhắc mục tiêu hôm nay 🎯",
  "Tiểu Đậu nhắc {u} nè 🎯",
  "{U} ơi, mục tiêu đang chờ nè 💪",
  "Cố lên {u} ơi! 🌟",
];
const TASK_TODAY_ONE = [
  "Mục tiêu “{n}” còn chờ {u} nè, check-in liền cho em vui nha! 🎯",
  "Em thấy “{n}” chưa xong đó, {u} làm xíu là xong thôi à! 💪",
  "“{n}” đang đợi {u} kìa, Tiểu Đậu cổ vũ hết mình nè! 📣",
  "Sắp xong rồi, còn mỗi “{n}” thôi {u} ơi! Em tin {u} làm được ✨",
];
const TASK_TODAY_MANY = [
  "Còn {c} mục tiêu chưa xong nè {u} ơi: {n} 🎯",
  "Em đếm được {c} mục tiêu đang chờ {u}: {n}. Cố lên nha! 💪",
  "{U} ơi, còn {c} việc nho nhỏ: {n}. Xong hết em khen liền nha 💖",
];
const TASK_NEXT_ONE = [
  "Hôm nay {u} có mục tiêu “{n}” nè, em chờ ảnh check-in nha! 🌤️",
  "Mục tiêu hôm nay của {u}: “{n}”. Em cổ vũ nè! 💪",
];
const TASK_NEXT_MANY = [
  "Hôm nay {u} có {c} mục tiêu: {n}. Em tin {u} làm được hết! ✨",
  "Có {c} mục tiêu đang đợi {u} nè: {n}. Mình cùng cố lên nha! 🌟",
];
const NEW_TASK_TITLE_ONE = ["Có mục tiêu mới nè {u} ơi! 🎯", "Tiểu Đậu báo tin vui nè! 🎉"];
const NEW_TASK_TITLE_MANY = ["Có {c} mục tiêu mới nè {u} ơi! 🎯", "Tiểu Đậu báo tin vui: có {c} mục tiêu mới! 🎉"];
const NEW_TASK_BODY_ONE = [
  "“{n}” — vào check-in liền nha, em chờ nè! 💨",
  "Mục tiêu mới “{n}” vừa tới, {u} xem thử nha! 👀",
];
const NEW_TASK_BODY_MANY = ["{n} — {u} vào xem liền nha, em chờ nè! 💨"];
const TEST_BODIES = [
  "Tiểu Đậu thử loa nè! Nếu {u} nghe được âm thanh này là mọi thứ ổn rồi nha 💖",
  "Alo alo, em nghe rõ không {u} ơi? Có tiếng là ổn áp rồi đó! 🎶",
];

const pickOne = (pool) => pool[Math.floor(Math.random() * pool.length)];

// Lấy lần lượt từ một bản xáo trộn của pool -> các thông báo cùng lượt đặt lịch KHÔNG trùng nhau
// (chỉ lặp lại khi pool hết).
function makeDeck(pool) {
  let deck = [];
  return () => {
    if (!deck.length) {
      deck = [...pool];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    return deck.pop();
  };
}

// Điền {u} {U} và các biến khác ({t} giờ, {n} tên mục tiêu, {c} số lượng)
const fill = (tpl, address, vars = {}) => {
  const U = address.charAt(0).toUpperCase() + address.slice(1);
  return tpl
    .replace(/\{U\}/g, U)
    .replace(/\{u\}/g, address)
    .replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
};

// ─── Hình + màu thông báo theo theme (accent) ───────────────────────────────
// iOS: đính ảnh avatar AI đúng màu theme làm thumbnail (attachments — chỉ iOS hỗ trợ theo TỪNG thông báo).
// Android: expo-notifications không cho đổi ảnh lớn theo từng thông báo (ảnh nhỏ/lớn do plugin gắn lúc build),
// nên đổi MÀU nhấn của thông báo theo màu theme.
// Ảnh lấy từ registry src/context/aiThemes.js: theo AI-theme đang chọn + màu accent (thiếu ảnh -> tấm mặc định).
const avatarUriCache = {};
function avatarUri(themeKey, key) {
  const cacheKey = `${themeKey}:${key}`;
  if (!avatarUriCache[cacheKey]) {
    avatarUriCache[cacheKey] = Asset.fromModule(getAiAvatar(themeKey, key))
      .downloadAsync()
      .then((a) => a.localUri || a.uri || null)
      .catch(() => null);
    avatarUriCache[cacheKey].then((u) => {
      if (!u) delete avatarUriCache[cacheKey]; // lỗi -> lần sau thử lại
    });
  }
  return avatarUriCache[cacheKey];
}

async function visualExtras() {
  const key = ACCENTS[accentKey] ? accentKey : "ocean";
  if (IS_ANDROID) return { color: ACCENTS[key]?.primary };
  const uri = await avatarUri(aiThemeKey, key);
  return uri
    ? {
        attachments: [
          { identifier: "tieu-dau-avatar", url: uri, typeHint: "public.png", hideThumbnail: false },
        ],
      }
    : {};
}

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

// Dự phòng: nếu việc đặt lịch NÉM lỗi liên quan âm thanh thì thử lại với âm mặc định để thông báo vẫn tới
// (trước đây lỗi bị nuốt và không có thông báo nào được đặt). Lưu ý: trên iOS lỗi "sound not found" thường chỉ
// được native ghi log chứ không ném lỗi, nên đã có cờ IOS_CUSTOM_SOUNDS_READY ở trên.
async function scheduleSafe(request) {
  try {
    return await Notifications.scheduleNotificationAsync(request);
  } catch (e) {
    const msg = String(e?.message || e);
    const snd = request?.content?.sound;
    if (snd && snd !== "default" && /sound/i.test(msg)) {
      console.warn(`[notifications] Chưa có âm "${snd}" trong app, dùng âm mặc định. ${msg}`);
      return Notifications.scheduleNotificationAsync({
        ...request,
        content: { ...request.content, sound: "default" },
      });
    }
    throw e;
  }
}

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

      const address = await getAddress();
      const extras = await visualExtras();
      // Câu chữ được chọn NGẪU NHIÊN mỗi lần đặt lịch (mở app / đổi giờ / đổi theme); các giờ khác nhau
      // trong cùng lượt không trùng câu. Vì nhắc lặp mỗi ngày nên câu giữ nguyên tới lần đặt lịch kế tiếp.
      const nextTitle = makeDeck(WATER_TITLES);
      const nextBody = makeDeck(WATER_BODIES);

      for (const timeStr of times) {
        const [hour, minute] = timeStr.split(":").map(Number);
        await scheduleSafe({
          identifier: `water-${timeStr}`,
          content: {
            title: fill(nextTitle(), address),
            body: fill(nextBody(), address, { t: timeStr }),
            sound: soundFor(soundName),
            data: { kind: "water" },
            ...androidExtras,
            ...extras,
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
      const address = await getAddress();
      const extras = await visualExtras();
      const nextTitle = makeDeck(TASK_TITLES);
      const nextTodayOne = makeDeck(TASK_TODAY_ONE);
      const nextTodayMany = makeDeck(TASK_TODAY_MANY);
      const nextNextOne = makeDeck(TASK_NEXT_ONE);
      const nextNextMany = makeDeck(TASK_NEXT_MANY);

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

          const vars = { n: list.length === 1 ? list[0].title : names(list), c: list.length };
          const tpl =
            d === 0
              ? list.length === 1
                ? nextTodayOne()
                : nextTodayMany()
              : list.length === 1
                ? nextNextOne()
                : nextNextMany();
          const body = fill(tpl, address, vars);

          await scheduleSafe({
            identifier: `task-${dateKey(fire)}-${timeStr}`,
            content: {
              title: fill(nextTitle(), address),
              body,
              sound: "default",
              data: { kind: "task" },
              ...androidExtras,
              ...extras,
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

      const address = await getAddress();
      const extras = await visualExtras();
      const one = fresh.length === 1;
      const vars = { n: one ? fresh[0].title : names(fresh), c: fresh.length };
      await scheduleSafe({
        content: {
          title: fill(pickOne(one ? NEW_TASK_TITLE_ONE : NEW_TASK_TITLE_MANY), address, vars),
          body: fill(pickOne(one ? NEW_TASK_BODY_ONE : NEW_TASK_BODY_MANY), address, vars),
          sound: "default",
          data: { kind: "new_task", task_ids: fresh.map((t) => t.id) },
          ...androidExtras,
          ...extras,
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
    const address = await getAddress();
    const extras = await visualExtras();
    await scheduleSafe({
      content: {
        title: "Thông báo thử 🔔",
        body: fill(pickOne(TEST_BODIES), address),
        sound: soundFor(soundName),
        data: { kind: "test" },
        ...androidExtras,
        ...extras,
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