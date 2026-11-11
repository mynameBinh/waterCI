import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Camera } from "expo-camera";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { File as ExpoFile } from "expo-file-system";
import * as Notifications from "expo-notifications";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Linking,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AIChatModal from "../components/AIChatModal";
import CameraOverlay from "../components/CameraOverlay";
import FloatingAIButton from "../components/FloatingAIButton";
import SavingOverlay from "../components/SavingOverlay";
import ScanningOverlay from "../components/ScanningOverlay";
import HeaderComponent from "../components/HeaderComponent";
import HistoryComponent from "../components/HistoryComponent";
import MainActionButtonComponent from "../components/MainActionButtonComponent";
import { useTheme } from "../context/ThemeContext";
import NotificationsTab from "../tabs/NotificationsTab";
import ProfileTab from "../tabs/ProfileTab";
import RoadmapTab from "../tabs/RoadmapTab";
import TaskCheckinTab from "../tabs/TaskCheckinTab";
import TheoDoiTab from "../tabs/TheoDoiTab";
import { decodeJWT } from "../utils/jwt";
import {
  getPermissionStatus,
  notifyNewTasks,
  sendTestNotification,
  setBadge,
  setNotificationVoice,
  syncTaskReminders,
  syncWaterReminders,
  TASK_DEFAULT_TIMES,
  TASK_PRESET_TIMES,
  tabForNotification,
} from "../utils/notifications";

const API_BASE = "https://binhhn21-water-check-in-backend.hf.space";

// SDK 54+/58: fetch toàn cục là expo/fetch, FormData KHÔNG còn hỗ trợ kiểu
// RN cũ { uri, name, type } (gây lỗi "Unsupported FormDataPart implementation").
// Phải append một Blob/File thật — ExpoFile (expo-file-system) là Blob đọc từ uri.
// Lỗi mạng của fetch -> câu dễ hiểu; các lỗi khác (lý do do server / AI trả) giữ nguyên
const friendlyScanError = (m = "") =>
  /network|failed to fetch|timeout|timed out/i.test(m)
    ? "Mạng chập chờn rồi, kiểm tra kết nối rồi thử lại nhé! 📶"
    : m || "Có lỗi xảy ra, bạn thử lại nhé.";

// Gợi ý ở dòng phụ của bong bóng lỗi khi check-in có thể khiếu nại (server đang giữ tạm ảnh)
const APPEAL_HINT = "Chưa thành công · chạm để giải thích 💬";

const buildImageFormData = (uri) => {
  const formData = new FormData();
  formData.append("image", new ExpoFile(uri));
  return formData;
};

// AsyncStorage keys cho notification settings
const STORAGE_PUSH_ENABLED = "notif_push_enabled";
const STORAGE_SELECTED_TIMES = "notif_selected_times";
const STORAGE_SELECTED_SOUND = "notif_selected_sound";
const STORAGE_TASK_REMIND_ENABLED = "notif_task_remind_enabled";
const STORAGE_TASK_REMIND_TIMES = "notif_task_remind_times";
const STORAGE_NEW_TASK_NOTIFY = "notif_new_task_enabled";

// Streak recovery key (lưu tháng đã dùng recovery, format: YYYY-MM)
const STORAGE_STREAK_RECOVERY_USED = "streak_recovery_used_month";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // shouldShowAlert bị deprecate ở các bản expo-notifications mới (SDK 50+),
    // thay bằng shouldShowBanner/shouldShowList — nếu chỉ set shouldShowAlert,
    // thông báo có thể KHÔNG hiện banner khi app đang mở trên Android. Set cả
    // 2 loại field để tương thích với mọi phiên bản.
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CONTAINER_LABELS = {
  glass: "Ly thủy tinh",
  mug: "Cốc có quai cầm",
  thermos: "Bình giữ nhiệt",
  bottle: "Chai nước lọc",
};
const CONTAINER_HEIGHT = { glass: 135, mug: 120, thermos: 170, bottle: 200 };

// So sánh nội dung (dữ liệu từ server nhỏ) để KHÔNG setState khi không đổi:
// mảng/object mới mỗi lần fetch sẽ kéo theo re-render + chạy lại các effect
// đồng bộ (đặt lại lịch nhắc, widget...) dù dữ liệu y hệt.
const sameJSON = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

// ─── Component ───────────────────────────────────────────────────────────────
export default function DashboardScreen({ token, onLogout }) {
  const { colors, accentKey } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── Ghi chú: việc ẩn/hiện thanh điều hướng Android (sticky-immersive) ────
  // được xử lý tập trung ở App.js (áp dụng cho toàn bộ app, kể cả màn hình
  // Auth/Admin), nên không cần lặp lại logic đó ở đây nữa. `setPositionAsync`
  // và `setBackgroundColorAsync` cũng đã bị Android edge-to-edge (Android
  // 15+) vô hiệu hoá nên không còn cần gọi thủ công — layout đã tự tràn viền
  // và ta chỉ cần tôn trọng `insets` (useSafeAreaInsets) như bên dưới.

  // ── Màn hình nhỏ (< 360dp width, khá phổ biến ở Android tầm trung/giá rẻ)
  // cần thu nhỏ vài thành phần để tránh tràn/chồng chéo.
  const isCompactWidth = Platform.OS === "android" && screenWidth < 360;
  const isShortScreen = screenHeight < 700; // máy màn hình thấp / tỉ lệ vuông hơn

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("home");
  // ── Hiệu ứng chuyển tab: fade + trượt nhẹ mỗi khi activeTab đổi ──────────
  const tabFadeAnim = useRef(new Animated.Value(1)).current;
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  const [currentWater, setCurrentWater] = useState(0);
  const [goalMl, setGoalMl] = useState(1800);
  const [username, setUsername] = useState("Đang tải...");
  const [userRole, setUserRole] = useState("");
  const [memberTier, setMemberTier] = useState("Thành viên");
  const [streak, setStreak] = useState(0);
  const [completedDates, setCompletedDates] = useState([]);
  const [history, setHistory] = useState([]);
  const [gifts, setGifts] = useState([]);

  // ── Mục tiêu check-in (do admin đặt) ──────────────────────────────────────
  const [activeTasks, setActiveTasks] = useState([]); // có thể nhiều mục tiêu cùng lúc
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  // Mục tiêu đang chọn — các chỗ khác (chụp ảnh, tiêu đề camera) vẫn dùng activeTask như cũ
  const activeTask = useMemo(
    () =>
      activeTasks.find((t) => t.id === selectedTaskId) ??
      activeTasks[0] ??
      null,
    [activeTasks, selectedTaskId],
  );
  const cameraModeRef = useRef("water"); // 'water' | 'task' — quyết định ảnh chụp xong gửi về đâu
  const submitTaskRef = useRef(null); // luôn trỏ tới submitTaskImage mới nhất (tránh closure cũ)
  const submitImageRef = useRef(null); // luôn trỏ tới submitImage mới nhất
  const [selectedGiftModal, setSelectedGiftModal] = useState(null);
  const [showStreakRecovery, setShowStreakRecovery] = useState(false);
  const [streakRecoveryUsed, setStreakRecoveryUsed] = useState(false);
  // Điều kiện phục hồi do SERVER quyết định (đã tính theo tháng + ngày bỏ lỡ)
  const [recoveryInfo, setRecoveryInfo] = useState({
    can_recover: false,
    recoverable_streak: 0,
  });
  const [showAIChat, setShowAIChat] = useState(false); // khung chat AI (mở từ nút nổi)
  const [showNotificationsModal, setShowNotificationsModal] = useState(false); // nhắc nhở nay nằm trong tab "Tôi"

  // Camera / AI
  const [aiLoading, setAiLoading] = useState(false);
  // Overlay "đang quét": ảnh vừa chụp + loại quét (water | task)
  const [scan, setScan] = useState({ uri: null, mode: "water" });
  // Vị trí "ghế" huy hiệu AI trên ScanningOverlay -> nút AI nổi bay tới đó khi đang quét
  const [scanTarget, setScanTarget] = useState(null);
  // Bước LƯU check-in (sau "Xác nhận uống"): null | "saving" | "done" -> SavingOverlay "Giọt nước dâng"
  const [saveState, setSaveState] = useState(null);
  const [saveVolume, setSaveVolume] = useState(0);
  const [saveTarget, setSaveTarget] = useState(null); // ghế huy hiệu của SavingOverlay cho nút AI nổi
  // Chỗ avatar ở header khung chat -> nút AI nổi bay lên đứng đó khi chat mở (như chat head Messenger)
  const [chatMounted, setChatMounted] = useState(false); // khung chat đang hiện -> ẩn nút AI nổi
  const [chatOrigin, setChatOrigin] = useState(null); // tâm nút AI lúc bấm -> chat bung ra từ đó
  // Chỗ "ghế" phía trên thẻ chọn dung tích -> nút AI đứng đó trong lúc chọn ml
  const [volumeTarget, setVolumeTarget] = useState(null);
  // Bong bóng tin nhắn từ AI (hiện cạnh nút nổi) — thay cho Alert "thành công"
  const [aiBubble, setAiBubble] = useState(null);
  const pendingAiComment = useRef(""); // câu cảm thán AI trả về ở bước quét nước, dùng khi user xác nhận
  const showAIBubble = useCallback(
    (text, meta, tone) => setAiBubble({ id: Date.now(), text, meta, tone }),
    [],
  );
  const handleBubbleClose = useCallback(() => setAiBubble(null), []);
  // Check-in bị AI từ chối -> server giữ tạm ảnh; bấm bong bóng (hoặc nút AI có chấm đỏ) để giải thích với chat bot.
  // { id, kind: 'water'|'task', uri, text, status: 'open'|'approved', expiresAt, containerType, maxVolume }
  const [appeal, setAppeal] = useState(null);
  const appealModeRef = useRef(null); // id khiếu nại đã duyệt đang chọn ml -> handleConfirmVolume gửi bù thay vì check-in thường
  const registerAppeal = useCallback((id, ttlSec, kind, uri, text) => {
    if (!id) return;
    setAppeal({
      id,
      kind,
      uri,
      text,
      status: "open",
      expiresAt: Date.now() + Math.max(30, (ttlSec || 1800) - 30) * 1000,
    });
  }, []);
  useEffect(() => {
    if (!appeal?.expiresAt) return undefined;
    const t = setTimeout(
      () => setAppeal((a) => (a && a.id === appeal.id ? null : a)),
      Math.max(0, appeal.expiresAt - Date.now()),
    );
    return () => clearTimeout(t);
  }, [appeal?.id, appeal?.expiresAt]);
  const [showMiniCam, setShowMiniCam] = useState(false);

  // Volume modal
  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [volumeSession, setVolumeSession] = useState(0); // đổi key -> modal mở lại luôn mới
  const [maxVolume, setMaxVolume] = useState(250);
  const [containerType, setContainerType] = useState("unknown");
  // AI ước lượng mực nước trong vật chứa lúc quét: núm kéo đặt sẵn ở mức này (null = không rõ -> mặc định đầy)
  const [suggestedVolume, setSuggestedVolume] = useState(null);
  const [fillPercent, setFillPercent] = useState(null);
  const pendingImageUrl = useRef(""); // lưu image_url từ /api/checkin để gửi khi confirm

  // Notifications
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState("");
  const [showSoundModal, setShowSoundModal] = useState(false);
  const [selectedSound, setSelectedSound] = useState("Chuông ngân (Mặc định)");
  const [permissionStatus, setPermissionStatus] = useState("undetermined"); // quyền thông báo của iOS
  const [taskRemindEnabled, setTaskRemindEnabled] = useState(true);
  const [taskRemindTimes, setTaskRemindTimes] = useState(TASK_DEFAULT_TIMES);
  const [newTaskNotify, setNewTaskNotify] = useState(true);
  const [tasksLoaded, setTasksLoaded] = useState(false); // đã tải task thành công ít nhất 1 lần
  const selectedSoundRef = useRef("Chuông ngân (Mặc định)");
  const notifPrefsRef = useRef({ push: false, newTask: true });
  const soundOptions = useMemo(
    () => [
      "Tiếng nước chảy",
      "Ting ting",
      "Tiếng chim hót",
      "Chuông ngân (Mặc định)",
    ],
    [],
  );
  const [selectedTimes, setSelectedTimes] = useState([
    "08:00",
    "12:00",
    "15:00",
    "20:00",
  ]);
  // Cách Tiểu Đậu gọi người dùng trong thông báo ("anh" | "chị"), lấy từ ghi nhớ trên server
  const [notifAddress, setNotifAddress] = useState(null);
  // Gán theme + cách xưng hô cho utils/notifications (chỉ gán biến, nên đặt ở thân component để luôn
  // chạy TRƯỚC mọi effect đặt lịch bên dưới)
  setNotificationVoice({ accent: accentKey, address: notifAddress });
  const waterCfgRef = useRef({ push: false, times: [] });
  const voiceMountedRef = useRef(false);
  const presetTimes = useMemo(
    () => [
      "07:00",
      "08:00",
      "10:00",
      "12:00",
      "15:00",
      "18:00",
      "20:00",
      "22:00",
    ],
    [],
  );
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState("");

  // ── Xử lý token hết hạn / không hợp lệ (401) ─────────────────────────────
  // sessionExpiredRef đảm bảo chỉ hiện Alert 1 lần dù nhiều request 401 cùng lúc
  const sessionExpiredRef = useRef(false);

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return;
    sessionExpiredRef.current = true;
    Alert.alert(
      "Phiên đăng nhập đã hết hạn",
      "Vui lòng đăng nhập lại để tiếp tục sử dụng.",
      [{ text: "Đăng nhập lại", onPress: () => onLogout() }],
      { cancelable: false },
    );
  }, [onLogout]);

  // authFetch: dùng thay cho fetch() ở MỌI lời gọi API_BASE — tự động phát
  // hiện token hết hạn/không hợp lệ (401) và đăng xuất ngay thay vì để app
  // "nằm lì" không nhận được dữ liệu mà không rõ lý do.
  const authFetch = useCallback(
    async (url, options) => {
      const res = await fetch(url, options);
      if (res.status === 401) {
        handleSessionExpired();
      }
      return res;
    },
    [handleSessionExpired],
  );

  useEffect(() => {
    sessionExpiredRef.current = false;
  }, [token]);

  // ── Streak: đồng bộ từ server (streak chỉ tăng khi đủ nước VÀ xong hết mục tiêu) ──
  const fetchStreak = useCallback(async () => {
    if (!token) return;
    try {
      const res = await authFetch(`${API_BASE}/api/streak`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const st = await res.json();
        setStreak(st.streak);
        const dates = st.completed_dates || [];
        setCompletedDates((prev) => (sameJSON(prev, dates) ? prev : dates));
        const rec = {
          can_recover: !!st.can_recover,
          recoverable_streak: st.recoverable_streak ?? 0,
        };
        setRecoveryInfo((prev) => (sameJSON(prev, rec) ? prev : rec));
      }
    } catch {
      /* lỗi mạng: giữ nguyên state */
    }
  }, [token, authFetch]);

  // ── Mục tiêu check-in: tải task đang active (admin vừa đặt/tắt là thấy ngay
  // khi user chuyển tab) ───────────────────────────────────────────────────────
  const fetchActiveTask = useCallback(
    async (autoAdvance = false) => {
      if (!token) return;
      try {
        const res = await authFetch(`${API_BASE}/api/tasks/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Backend có thể trả { tasks: [...] } (nhiều) hoặc { task: {...} } (cũ, 1 cái)
          const list = Array.isArray(data.tasks)
            ? data.tasks
            : Array.isArray(data)
              ? data
              : data.task
                ? [data.task]
                : [];
          setActiveTasks((prev) => (sameJSON(prev, list) ? prev : list));
          setTasksLoaded(true);
          // Báo nếu có mục tiêu mới so với lần trước (xem utils/notifications.js)
          notifyNewTasks(list, {
            userKey: decodeJWT(token)?.sub,
            enabled: notifPrefsRef.current.push && notifPrefsRef.current.newTask,
          });

          const isDone = (t) =>
            (t.done_today ?? 0) >= Math.max(t.target_per_day ?? 1, 1);
          setSelectedTaskId((prev) => {
            const cur = list.find((t) => t.id === prev);
            // chưa chọn / mục tiêu cũ đã bị tắt -> chọn cái chưa xong đầu tiên
            if (!cur)
              return (list.find((t) => !isDone(t)) ?? list[0])?.id ?? null;
            // vừa hoàn thành mục tiêu này -> tự nhảy sang mục tiêu chưa xong tiếp theo
            if (autoAdvance && isDone(cur)) {
              const next = list.find((t) => t.id !== cur.id && !isDone(t));
              return next ? next.id : cur.id;
            }
            return prev;
          });
        } else {
          console.warn("[task] /api/tasks/active ->", res.status);
        }
      } catch (e) {
        console.warn("[task] lỗi mạng khi tải mục tiêu:", e?.message);
      }
    },
    [token, authFetch],
  );

  useEffect(() => {
    // Tab Quà tặng không dùng dữ liệu mục tiêu: bỏ qua để request + setState +
    // re-render cả Dashboard không chen vào lúc hiệu ứng mở đầu của roadmap chạy.
    if (activeTab === "gifts") return;
    fetchActiveTask();
  }, [activeTab, fetchActiveTask]);

  // ── Cờ cài đặt dùng trong callback (ref) — tránh phải tạo lại fetchActiveTask ──
  useEffect(() => {
    notifPrefsRef.current = { push: isPushEnabled, newTask: newTaskNotify };
  }, [isPushEnabled, newTaskNotify]);

  // ── Nhắc task chưa hoàn thành + badge số task còn lại trên icon app ──────
  // Chạy lại mỗi khi danh sách task đổi (check-in xong, admin đặt task mới...).
  // Chưa tải được task thì KHÔNG chạy, để khỏi huỷ nhầm lịch nhắc đang có.
  useEffect(() => {
    if (!tasksLoaded) return;
    syncTaskReminders({
      tasks: activeTasks,
      times: taskRemindTimes,
      enabled: isPushEnabled && taskRemindEnabled,
    }).then((pending) => setBadge(isPushEnabled ? pending : 0));
  }, [tasksLoaded, activeTasks, taskRemindTimes, taskRemindEnabled, isPushEnabled, accentKey, notifAddress]);

  // ── Nhắc uống nước: đặt lại khi đổi theme / cách xưng hô để ảnh + câu chữ khớp ──────────
  useEffect(() => {
    waterCfgRef.current = { push: isPushEnabled, times: selectedTimes };
  }, [isPushEnabled, selectedTimes]);
  useEffect(() => {
    if (!voiceMountedRef.current) {
      voiceMountedRef.current = true; // lần đầu đã được đặt lịch ở restoreNotificationSettings
      return;
    }
    if (isPushEnabled) syncWaterReminders(selectedTimes, true, selectedSoundRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentKey, notifAddress]);

  // ── Lấy cách xưng hô (anh/chị) mà người dùng đã nhờ Tiểu Đậu ghi nhớ ─────────────────────
  const refreshNotifVoice = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/chat/address`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      if (d?.address === "anh" || d?.address === "chị") setNotifAddress(d.address);
    } catch {
      /* offline -> dùng lại cách xưng hô đã lưu */
    }
  }, [token, authFetch]);
  useEffect(() => {
    if (token) refreshNotifVoice();
  }, [token, refreshNotifVoice]);

  // ── Quay lại app: tải lại task/streak (kéo theo làm mới widget), kiểm tra quyền ──
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      fetchActiveTask();
      fetchStreak();
      getPermissionStatus().then(setPermissionStatus);
      refreshNotifVoice();
      // Đặt lại nhắc uống nước -> mỗi lần mở app Tiểu Đậu có câu nhắc ngẫu nhiên mới
      const cfg = waterCfgRef.current;
      if (cfg.push) syncWaterReminders(cfg.times, true, selectedSoundRef.current);
    });
    return () => sub.remove();
  }, [fetchActiveTask, fetchStreak, refreshNotifVoice]);

  // ── Load dữ liệu ban đầu ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    // Lấy username từ token (không cần gọi API thêm)
    const payload = decodeJWT(token);
    if (payload?.sub) setUsername(payload.sub);
    if (payload?.role) setUserRole(payload.role);

    // Bỏ async đi để các tiến trình con tự xử lý Promise của chúng
    const loadData = () => {
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Load thông tin user (độc lập)
      authFetch(`${API_BASE}/api/me`, { headers })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error();
        })
        .then((me) => {
          setGoalMl(me.daily_goal);
          setMemberTier(me.tier || "Thành viên");
        })
        .catch(() => {}); // lỗi mạng thì bỏ qua, giữ nguyên state

      // 2. Load lịch sử (độc lập)
      authFetch(`${API_BASE}/api/history`, { headers })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error();
        })
        .then((hData) => {
          setHistory(
            hData.map((item) => ({
              id: item.id,
              time: new Date(
                item.timestamp.endsWith("Z")
                  ? item.timestamp
                  : `${item.timestamp}Z`,
              ).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              }),
              volume: item.volume_ml,
            })),
          );
          setCurrentWater(hData.reduce((sum, i) => sum + i.volume_ml, 0));
        })
        .catch(() => {});

      // 3. Load thông tin streak (độc lập)
      fetchStreak();

      // 4. Load thông tin quà tặng (độc lập)
      authFetch(`${API_BASE}/api/gifts`, { headers })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error();
        })
        .then((data) => setGifts(data))
        .catch(() => {});
    };

    // ── Khôi phục notification settings từ AsyncStorage ──────────────────
    const restoreNotificationSettings = async () => {
      try {
        const [
          savedEnabled,
          savedTimes,
          savedSound,
          savedRecovery,
          savedTaskOn,
          savedTaskTimes,
          savedNewTask,
        ] = await Promise.all([
          AsyncStorage.getItem(STORAGE_PUSH_ENABLED),
          AsyncStorage.getItem(STORAGE_SELECTED_TIMES),
          AsyncStorage.getItem(STORAGE_SELECTED_SOUND),
          AsyncStorage.getItem(STORAGE_STREAK_RECOVERY_USED),
          AsyncStorage.getItem(STORAGE_TASK_REMIND_ENABLED),
          AsyncStorage.getItem(STORAGE_TASK_REMIND_TIMES),
          AsyncStorage.getItem(STORAGE_NEW_TASK_NOTIFY),
        ]);

        const enabled = savedEnabled === "true";
        const times = savedTimes
          ? JSON.parse(savedTimes)
          : ["08:00", "12:00", "15:00", "20:00"];
        const sound = savedSound || "Chuông ngân (Mặc định)";

        setSelectedTimes(times);
        setSelectedSound(sound);
        selectedSoundRef.current = sound; // phải gán TRƯỚC khi đặt lịch bên dưới
        setTaskRemindEnabled(savedTaskOn !== "false");
        if (savedTaskTimes) setTaskRemindTimes(JSON.parse(savedTaskTimes));
        setNewTaskNotify(savedNewTask !== "false");
        getPermissionStatus().then(setPermissionStatus);

        if (enabled) {
          // Kiểm tra quyền còn hiệu lực không trước khi restore
          const { status } = await Notifications.getPermissionsAsync();
          if (status === "granted") {
            setIsPushEnabled(true);
            // Lên lịch lại sau mỗi lần mở app — đảm bảo không mất thông báo
            await syncScheduledReminders(times, true);
            // Push token có thể đổi theo thời gian -> gửi lại cho backend mỗi lần mở app
            tryGetPushToken().then((t) => {
              if (!t) return;
              setExpoPushToken(t);
              updatePushTokenToBackend(t);
            });
          } else {
            // Quyền bị thu hồi — reset về false
            await AsyncStorage.setItem(STORAGE_PUSH_ENABLED, "false");
          }
        }

        // Kiểm tra xem tháng này đã dùng recovery chưa
        if (savedRecovery) {
          const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
          if (savedRecovery === thisMonth) setStreakRecoveryUsed(true);
        }
      } catch {
        /* ignore */
      }
    };

    loadData();
    // Đặt lại lịch thông báo (nhiều lời gọi native) chờ app vẽ xong khung hình đầu
    const restoreTimer = setTimeout(restoreNotificationSettings, 300);
    return () => clearTimeout(restoreTimer);
  }, [token, authFetch, fetchStreak]);

  // ── Notification listeners ────────────────────────────────────────────────
  useEffect(() => {
    // Chạm vào thông báo -> mở đúng tab (task/new_task -> "task", nhắc nước -> "home")
    const openFromNotification = (response) => {
      const tab = tabForNotification(
        response?.notification?.request?.content?.data,
      );
      if (tab) setActiveTab(tab);
    };

    // App bị tắt hẳn rồi được mở bằng cách chạm thông báo
    try {
      const cold = Notifications.getLastNotificationResponse();
      if (cold) {
        openFromNotification(cold);
        Notifications.clearLastNotificationResponse();
      }
    } catch {
      /* ignore */
    }

    // Push "task mới" từ backend tới lúc app đang mở -> tải lại danh sách ngay
    const recvSub = Notifications.addNotificationReceivedListener((n) => {
      if (n?.request?.content?.data?.kind === "new_task") fetchActiveTask();
    });
    const tapSub =
      Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => {
      recvSub.remove();
      tapSub.remove();
    };
  }, [fetchActiveTask]);

  // ── Android: tạo notification channel NGAY KHI APP MỞ ────────────────────
  // Quan trọng: trên Android 13+, hộp thoại xin quyền thông báo sẽ KHÔNG
  // hiện ra đúng cách nếu chưa có channel nào tồn tại từ trước. Trước đây
  // channel chỉ được tạo SAU khi xin quyền (trong requestNotificationPermission)
  // — sai thứ tự, khiến quyền có thể không bao giờ được cấp thành công trên
  // nhiều máy Android. Tạo channel sớm ở đây để đảm bảo nó luôn tồn tại
  // trước bất kỳ lần xin quyền nào.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    Notifications.setNotificationChannelAsync("water-reminder", {
      name: "Nhắc nhở uống nước",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0ea5e9",
      sound: "pouring_water.mp3",
    }).catch(() => {});
  }, []);

  // ── Notification helpers ──────────────────────────────────────────────────
  // Dùng utils/notifications.js: chỉ huỷ/đặt lại nhắc uống nước (không đụng nhắc task)
  // và dùng đúng âm thanh người dùng đã chọn.
  const syncScheduledReminders = useCallback(
    (timesList, enabled) =>
      syncWaterReminders(timesList, enabled, selectedSoundRef.current),
    [],
  );

  // ── Xin quyền thông báo (chỉ cần quyền, không cần push token) ───────────────
  const requestNotificationPermission = useCallback(async () => {
    // Channel đã được tạo sẵn từ lúc mount (xem useEffect phía trên) — đúng
    // thứ tự bắt buộc trên Android 13+ trước khi gọi requestPermissionsAsync.
    const { status: existing } = await Notifications.getPermissionsAsync();
    const finalStatus =
      existing !== "granted"
        ? (await Notifications.requestPermissionsAsync()).status
        : existing;

    setPermissionStatus(finalStatus);
    if (finalStatus !== "granted") {
      Alert.alert(
        "Chưa cấp quyền",
        "Phải bật quyền thông báo thì mới nhận được lời nhắc nha!",
      );
      return false;
    }

    // ── Android 12+: quyền "Alarms & reminders" (exact alarm) ──────────────
    // Đây là quyền đặc biệt, Android KHÔNG cho phép app tự bật bằng popup —
    // người dùng phải tự bật trong màn hình Cài đặt hệ thống. Thiếu quyền
    // này, thông báo hẹn giờ (calendar trigger) vẫn được lên lịch nhưng có
    // thể bị trễ hàng giờ hoặc không bắn khi máy vào chế độ tiết kiệm pin
    // (Doze). Mở thẳng màn hình cấp quyền để người dùng bật 1 lần duy nhất.
    if (Platform.OS === "android" && Number(Platform.Version) >= 31) {
      try {
        await Linking.sendIntent(
          "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
        );
      } catch {
        /* máy không hỗ trợ intent này (Android <12) — bỏ qua */
      }
    }

    return true;
  }, []);

  // ── Lấy push token (tuỳ chọn — bỏ qua nếu không có projectId / Expo Go) ────
  const tryGetPushToken = useCallback(async () => {
    if (!Device.isDevice) return null; // Simulator/Expo Go preview — bỏ qua lặng lẽ

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      if (!projectId) return null; // Không có projectId — bỏ qua lặng lẽ
      return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch {
      return null; // Lỗi bất kỳ — bỏ qua, không block local notification
    }
  }, []);

  const updatePushTokenToBackend = useCallback(
    async (pushToken) => {
      if (pushToken === null || pushToken === undefined) return; // Chỉ skip khi chưa từng có token (Expo Go)
      try {
        await authFetch(`${API_BASE}/api/users/update-push-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ push_token: pushToken }), // '' khi tắt, token thật khi bật
        });
      } catch {
        /* ignore */
      }
    },
    [token],
  );

  const handleTogglePush = useCallback(
    async (value) => {
      if (value) {
        // 1. Xin quyền trước — nếu từ chối thì dừng lại
        const granted = await requestNotificationPermission();
        if (!granted) return;

        // 2. Đặt lịch local notification — luôn hoạt động kể cả Expo Go
        setIsPushEnabled(true);
        await AsyncStorage.setItem(STORAGE_PUSH_ENABLED, "true");
        await syncScheduledReminders(selectedTimes, true);

        // 3. Thử lấy push token (tuỳ chọn)
        const pToken = await tryGetPushToken();
        if (pToken) {
          setExpoPushToken(pToken);
          await updatePushTokenToBackend(pToken);
        }
      } else {
        setIsPushEnabled(false);
        setExpoPushToken("");
        await AsyncStorage.setItem(STORAGE_PUSH_ENABLED, "false");
        await updatePushTokenToBackend("");
        await syncScheduledReminders([], false);
      }
    },
    [
      requestNotificationPermission,
      tryGetPushToken,
      updatePushTokenToBackend,
      syncScheduledReminders,
      selectedTimes,
    ],
  );

  const toggleTimeSelection = useCallback(
    (time) => {
      setSelectedTimes((prev) => {
        const next = prev.includes(time)
          ? prev.filter((t) => t !== time)
          : [...prev, time].sort();
        AsyncStorage.setItem(STORAGE_SELECTED_TIMES, JSON.stringify(next));
        if (isPushEnabled) syncScheduledReminders(next, true);
        return next;
      });
    },
    [isPushEnabled, syncScheduledReminders],
  );

  const handleAddCustomTime = useCallback(() => {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(customTimeInput)) {
      Alert.alert(
        "Lỗi định dạng",
        "Vui lòng nhập đúng giờ theo chuẩn HH:MM (VD: 09:30)",
      );
      return;
    }
    setSelectedTimes((prev) => {
      if (prev.includes(customTimeInput)) return prev;
      const next = [...prev, customTimeInput].sort();
      AsyncStorage.setItem(STORAGE_SELECTED_TIMES, JSON.stringify(next));
      if (isPushEnabled) syncScheduledReminders(next, true);
      return next;
    });
    setShowCustomTimeModal(false);
    setCustomTimeInput("");
  }, [customTimeInput, isPushEnabled, syncScheduledReminders]);

  // Wrapper lưu sound vào AsyncStorage khi user thay đổi
  const handleSetSelectedSound = useCallback(
    (sound) => {
      setSelectedSound(sound);
      selectedSoundRef.current = sound;
      AsyncStorage.setItem(STORAGE_SELECTED_SOUND, sound);
      // Áp dụng âm thanh mới cho các lịch nhắc đã đặt
      if (isPushEnabled) syncScheduledReminders(selectedTimes, true);
    },
    [isPushEnabled, selectedTimes, syncScheduledReminders],
  );

  const handleToggleTaskRemind = useCallback((value) => {
    setTaskRemindEnabled(value);
    AsyncStorage.setItem(STORAGE_TASK_REMIND_ENABLED, String(value));
  }, []);

  const toggleTaskTime = useCallback((time) => {
    setTaskRemindTimes((prev) => {
      const next = prev.includes(time)
        ? prev.filter((t) => t !== time)
        : [...prev, time].sort();
      AsyncStorage.setItem(STORAGE_TASK_REMIND_TIMES, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleToggleNewTask = useCallback((value) => {
    setNewTaskNotify(value);
    AsyncStorage.setItem(STORAGE_NEW_TASK_NOTIFY, String(value));
  }, []);

  const handleTestNotification = useCallback(async () => {
    const ok =
      permissionStatus === "granted" || (await requestNotificationPermission());
    if (ok) sendTestNotification(selectedSound);
  }, [permissionStatus, requestNotificationPermission, selectedSound]);

  // ── Streak Recovery ───────────────────────────────────────────────────────
  // Server quyết định: vừa bỏ lỡ đúng hôm qua + tháng này chưa dùng phục hồi
  const canUseStreakRecovery = recoveryInfo.can_recover;

  const handleStreakRecovery = useCallback(async () => {
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    try {
      const res = await authFetch(`${API_BASE}/api/streak/recover`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setStreak(data.streak);
        setCompletedDates(data.completed_dates || []);
        setRecoveryInfo({ can_recover: false, recoverable_streak: 0 });
        setStreakRecoveryUsed(true);
        await AsyncStorage.setItem(STORAGE_STREAK_RECOVERY_USED, thisMonth);
        setShowStreakRecovery(false);
        Alert.alert(
          "Streak đã phục hồi! 🔥",
          `May quá! Streak vẫn là 🔥${data.streak} ngày. Nhớ uống đủ nước và hoàn thành mục tiêu hôm nay nha!`,
        );
      } else {
        Alert.alert(
          "Không thể phục hồi",
          "Không đủ điều kiện để phục hồi streak lần này.",
        );
        setShowStreakRecovery(false);
        fetchStreak();
      }
    } catch {
      Alert.alert("Lỗi mạng", "Vui lòng thử lại sau.");
    }
  }, [token, authFetch, fetchStreak]);

  // ── Camera / AI ───────────────────────────────────────────────────────────
  const handleActivationCamera = useCallback(async () => {
    cameraModeRef.current = "water";
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Quyền truy cập", "Cần cấp quyền Camera nhé!");
      return;
    }
    setShowMiniCam(true);
  }, []);

  // Chụp ảnh / zoom / flash nằm trong <CameraOverlay> (state riêng) để vuốt zoom
  // không làm re-render cả Dashboard. Ở đây chỉ còn các callback ổn định.
  // Chụp xong -> đóng khung camera -> submit* mới bật ScanningOverlay (có ảnh thật),
  // nên overlay không còn đè lên giao diện camera.
  const handleCameraClose = useCallback(() => setShowMiniCam(false), []);
  const handleCameraPicture = useCallback((uri) => {
    setShowMiniCam(false);
    if (cameraModeRef.current === "task") submitTaskRef.current?.(uri);
    else submitImageRef.current?.(uri);
  }, []);

  // ── Camera + gửi ảnh cho Mục tiêu check-in ─────────────────────────────────
  const handleActivationTaskCamera = useCallback(async () => {
    cameraModeRef.current = "task";
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Quyền truy cập", "Cần cấp quyền Camera nhé!");
      return;
    }
    setShowMiniCam(true);
  }, []);

  const submitTaskImage = useCallback(
    async (uri) => {
      if (!activeTask) return;
      setScan({ uri, mode: "task" });
      setAiLoading(true);
      try {
        const formData = buildImageFormData(uri);
        const res = await authFetch(
          `${API_BASE}/api/tasks/${activeTask.id}/checkin`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Claude từ chối -> backend trả lý do trong `detail` (chuỗi) + giữ tạm ảnh (header X-Appeal-Id)
          const e = new Error(
            typeof data.detail === "string" ? data.detail : "Check-in thất bại",
          );
          e.appealId = res.headers.get("X-Appeal-Id") || "";
          e.appealTtl = Number(res.headers.get("X-Appeal-Ttl")) || 1800;
          throw e;
        }
        showAIBubble(
          data.ai_comment || data.message || "Hoàn thành mục tiêu rồi, giỏi quá! ✅",
          data.message,
        );
        fetchActiveTask(true);
        fetchStreak(); // task cuối cùng có thể vừa giữ được streak
      } catch (err) {
        // Lý do AI từ chối nằm sau "Chưa đúng yêu cầu: " -> chỉ hiện lý do trong bong bóng
        const reason = friendlyScanError(err.message).replace(/^Chưa đúng yêu cầu:\s*/, "");
        if (err.appealId) registerAppeal(err.appealId, err.appealTtl, "task", uri, reason);
        showAIBubble(
          reason,
          err.appealId ? APPEAL_HINT : "Check-in mục tiêu chưa thành công",
          "error",
        );
      } finally {
        setAiLoading(false);
      }
    },
    [token, activeTask, authFetch, fetchActiveTask, fetchStreak, showAIBubble, registerAppeal],
  );
  submitTaskRef.current = submitTaskImage;

  const submitImage = useCallback(
    async (uri) => {
      setScan({ uri, mode: "water" });
      setAiLoading(true);
      try {
        const formData = buildImageFormData(uri);
        const res = await authFetch(`${API_BASE}/api/checkin`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          // 400: {detail:{message}} (không thấy nước) · 503: {detail:"..."} (AI bận)
          const d = await res.json().catch(() => ({}));
          const e = new Error(
            d?.detail?.message ||
              (typeof d?.detail === "string" ? d.detail : "Không phát hiện nước"),
          );
          e.aiComment = d?.detail?.ai_comment || ""; // lý do do AI nói (nếu có)
          e.appealId = res.headers.get("X-Appeal-Id") || ""; // server đang giữ tạm ảnh -> có thể khiếu nại
          e.appealTtl = Number(res.headers.get("X-Appeal-Ttl")) || 1800;
          throw e;
        }
        const data = await res.json();
        const vol = data.max_volume || 250;
        // Lưu image_url để gửi kèm khi user xác nhận — chưa lưu DB ở bước này
        pendingImageUrl.current = data.image_url || "";
        pendingAiComment.current = data.ai_comment || "";
        setMaxVolume(vol);
        setContainerType(data.container_type || "unknown");
        const aiMl = Number(data.suggested_volume_ml);
        setSuggestedVolume(Number.isFinite(aiMl) && aiMl > 0 ? Math.min(aiMl, vol) : null);
        setFillPercent(typeof data.fill_percent === "number" ? data.fill_percent : null);
        setVolumeSession((n) => n + 1);
        // Quét xong -> hiện thẻ chọn dung tích (nút AI vẫn đứng trên thẻ, chưa bay về)
        setShowVolumeModal(true);
      } catch (err) {
        const msg = friendlyScanError(err.message);
        const shown = err.aiComment || msg;
        if (err.appealId) registerAppeal(err.appealId, err.appealTtl, "water", uri, shown);
        showAIBubble(
          shown,
          err.appealId
            ? APPEAL_HINT
            : err.aiComment
              ? msg
              : "Check-in nước chưa thành công",
          "error",
        );
      } finally {
        setAiLoading(false);
      }
    },
    [token, authFetch, showAIBubble, registerAppeal],
  );
  submitImageRef.current = submitImage;

  const handleConfirmVolume = useCallback(
    async (confirmedVol) => {
      // Chọn xong -> đóng thẻ chọn, bật SavingOverlay (nút AI vẫn ở trên) và chờ server trả về
      setShowVolumeModal(false);
      setSaveVolume(confirmedVol);
      setSaveState("saving");
      try {
        const appealId = appealModeRef.current; // gửi bù cho check-in từng bị từ chối (AI đã duyệt)
        const res = await authFetch(
          appealId
            ? `${API_BASE}/api/appeals/${appealId}/confirm`
            : `${API_BASE}/api/checkin/confirm`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              appealId
                ? { volume_ml: confirmedVol }
                : { volume_ml: confirmedVol, image_url: pendingImageUrl.current },
            ),
          },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          const e = new Error(
            typeof d?.detail === "string" ? d.detail : `HTTP ${res.status}`,
          );
          e.status = res.status;
          throw e;
        }
        // Server đã lưu xong -> cập nhật giao diện rồi thông báo
        setCurrentWater((prev) => prev + confirmedVol);
        setHistory((prev) => [
          {
            id: Date.now(),
            time: new Date().toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            volume: confirmedVol,
          },
          ...prev,
        ]);
        // Nước dâng đầy + dấu ✓ rồi mới đóng overlay và hiện bong bóng AI
        setSaveState("done");
        await new Promise((r) => setTimeout(r, 1000));
        const wasAppeal = !!appealModeRef.current;
        showAIBubble(
          wasAppeal
            ? "Em ghi nhận bù rùi nha, lần sau chụp rõ hơn xíu giúp em! 😾"
            : pendingAiComment.current || "Uống nước đều đặn, giỏi lắm luôn! 💧",
          wasAppeal
            ? `+${confirmedVol} ml · Ghi nhận bù`
            : `+${confirmedVol} ml · Check-in nước`,
        );
        if (wasAppeal) {
          appealModeRef.current = null;
          setAppeal(null);
        }
        pendingAiComment.current = "";
        pendingImageUrl.current = "";
        fetchStreak(); // đủ nước + xong mục tiêu -> streak tăng
      } catch (err) {
        console.warn("[checkin/confirm] thất bại:", err.message);
        // khiếu nại hết hạn / đã được ghi nhận -> đóng luôn; lỗi khác (mạng, 422…) giữ lại để thử lại
        if (appealModeRef.current && (err.status === 409 || err.status === 410)) {
          appealModeRef.current = null;
          setAppeal(null);
        }
        showAIBubble(
          friendlyScanError(err.message) ||
            "Chưa lưu được check-in lên máy chủ, bạn thử lại nhé! 🥺",
          "Lỗi lưu dữ liệu",
          "error",
        );
      } finally {
        setSaveState(null);
      }
    },
    [token, authFetch, fetchStreak, showAIBubble],
  );

  // Huỷ ở bước chọn dung tích: bỏ ảnh tạm, nút AI bay về
  const handleCancelVolume = useCallback(() => {
    setShowVolumeModal(false);
    appealModeRef.current = null; // khiếu nại (nếu có) vẫn còn hạn: mở lại chat để bấm "Chọn lượng nước" lần nữa
    pendingImageUrl.current = "";
    pendingAiComment.current = "";
  }, []);

  // AI đã DUYỆT khiếu nại (user bấm nút trong chat):
  //  • nước  -> đóng chat, mở bảng chọn ml; chọn xong handleConfirmVolume gửi bù bằng ảnh tạm trên server
  //  • mục tiêu -> ghi nhận luôn
  const handleAppealApproved = useCallback(
    async (a) => {
      if (!a) return;
      setShowAIChat(false);
      if (a.kind === "water") {
        appealModeRef.current = a.id;
        pendingAiComment.current = "";
        setMaxVolume(a.maxVolume || 250);
        setContainerType(a.containerType || "unknown");
        setSuggestedVolume(null);
        setFillPercent(null);
        setVolumeSession((n) => n + 1);
        setShowVolumeModal(true);
        return;
      }
      setScan({ uri: a.uri, mode: "task" });
      setAiLoading(true);
      try {
        const res = await authFetch(`${API_BASE}/api/appeals/${a.id}/confirm`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const e = new Error(
            typeof data.detail === "string" ? data.detail : "Chưa ghi nhận được",
          );
          e.status = res.status;
          throw e;
        }
        setAppeal(null);
        showAIBubble("Em ghi nhận bù mục tiêu cho chị rồi nha! ✅", data.message);
        fetchActiveTask(true);
        fetchStreak();
      } catch (err) {
        if (err.status === 409 || err.status === 410) setAppeal(null);
        showAIBubble(friendlyScanError(err.message), "Chưa ghi nhận được", "error");
      } finally {
        setAiLoading(false);
      }
    },
    [token, authFetch, showAIBubble, fetchActiveTask, fetchStreak],
  );

  const handleLogoutPrompt = useCallback(() => {
    Alert.alert("Đăng xuất", "Đăng xuất tài khoản này ư?", [
      { text: "Hủy", style: "cancel" },
      { text: "Đăng xuất", style: "destructive", onPress: onLogout },
    ]);
  }, [onLogout]);

  //hàm thêm mục tiêu
  const handleCreateTask = useCallback(
  async (payload) => {
    const res = await authFetch(`${API_BASE}/api/tasks/mine`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload), // { title, verify_description, target_per_day, repeat }
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      throw new Error(
        typeof data?.detail === "string" ? data.detail : "Không thêm được mục tiêu.",
      );
    }
    await fetchActiveTask();
    if (data?.id) setSelectedTaskId(data.id); // chuyển sang mục tiêu vừa thêm
  },
  [token, authFetch, fetchActiveTask],
  );

  // Hàm xoá mục tiêu
  const handleDeleteTask = useCallback(
  async (id) => {
    const res = await authFetch(`${API_BASE}/api/tasks/mine/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      let msg = "Không xoá được mục tiêu.";
      try { msg = (await res.json())?.detail || msg; } catch {}
      throw new Error(msg);
    }
    await fetchActiveTask();
  },
  [token, authFetch, fetchActiveTask],
  );


  // ── Bottom padding: CHỈ tính động cho Android ────────────────────────────
  // iOS giữ nguyên số cố định như code gốc (110 / 150 / 125) — không đổi gì.
  // Android: insets.bottom dao động rất nhiều giữa các hãng/kiểu điều hướng
  // (0 / ~24dp gesture pill / ~48dp nút bấm cứng) nên tính theo insets thực
  // tế của từng máy thay vì một số cố định chỉ đúng cho một số thiết bị.
  const IS_ANDROID = Platform.OS === "android";
  const dockClearance = IS_ANDROID
    ? insets.bottom + 62 + (isShortScreen ? 40 : 55)
    : null;

  // ── Shared style props ────────────────────────────────────────────────────
  const profileContentStyle = useMemo(
    () =>
      IS_ANDROID
        ? [styles.profileContent, { paddingBottom: dockClearance + 30 }]
        : [styles.profileContent, { paddingBottom: 110 }], // iOS — giữ nguyên
    [IS_ANDROID, dockClearance],
  );
  const roadmapContentStyle = useMemo(
    () =>
      IS_ANDROID
        ? [styles.roadmapContent, { paddingBottom: dockClearance + 65 }]
        : [styles.roadmapContent, { paddingBottom: 150 }], // iOS — giữ nguyên
    [IS_ANDROID, dockClearance],
  );

  // ── Nội dung từng tab được memo hoá ───────────────────────────────────────
  // Đổi tab chỉ đổi `activeTab` -> Dashboard render lại; nhờ các element này giữ
  // nguyên tham chiếu nên React bỏ qua việc render lại nội dung các tab đang ẩn.
  const handleOpenNotifications = useCallback(
    () => setShowNotificationsModal(true),
    [],
  );
  const homeContent = useMemo(
    () => (
    <View
      style={[
        styles.scrollContent,
        { paddingBottom: IS_ANDROID ? dockClearance + 20 : 125 },
      ]}
    >
      <HeaderComponent
        currentWater={currentWater}
        goalMl={goalMl}
        username={username}
        streak={streak}
        completedDates={completedDates}
      />

      {/* ── Streak Recovery Banner ── */}
      {canUseStreakRecovery && (
        <TouchableOpacity
          style={styles.recoveryBanner}
          onPress={() => setShowStreakRecovery(true)}
          activeOpacity={0.85}
        >
          <View style={styles.recoveryBannerLeft}>
            <Ionicons name="flame" size={22} color="#f97316" />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.recoveryBannerTitle}>
                Phục hồi streak!
              </Text>
              <Text style={styles.recoveryBannerSub}>
                Em có 1 cơ hội cứu chuỗi {recoveryInfo.recoverable_streak}{" "}
                ngày
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#f97316" />
        </TouchableOpacity>
      )}

      <View style={{ marginTop: -12, marginBottom: -4, zIndex: 10 }}>
        <MainActionButtonComponent
          onOpen={handleActivationCamera}
          disabled={aiLoading}
        />
      </View>
      <HistoryComponent history={history} />
    </View>
    ),
    [
      currentWater,
      goalMl,
      username,
      streak,
      completedDates,
      canUseStreakRecovery,
      recoveryInfo.recoverable_streak,
      handleActivationCamera,
      aiLoading,
      history,
      IS_ANDROID,
      dockClearance,
    ],
  );
  const taskContent = useMemo(
    () => (
    <View
      style={[
        styles.scrollContent,
        { paddingBottom: IS_ANDROID ? dockClearance + 20 : 125 },
      ]}
    >
      {activeTask ? (
        <TaskCheckinTab
          tasks={activeTasks}
          selectedId={activeTask?.id}
          onSelect={setSelectedTaskId}
          onOpenCamera={handleActivationTaskCamera}
          onCreateTask={handleCreateTask}
          onDeleteTask={handleDeleteTask}
          disabled={aiLoading}
        />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="flag-outline"
            size={48}
            color={colors.textMuted}
          />
          <Text
            style={{
              color: colors.textMuted,
              marginTop: 12,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            Chưa có mục tiêu nào
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              marginTop: 4,
              fontSize: 12.5,
              textAlign: "center",
              paddingHorizontal: 24,
            }}
          >
            Khi sếp đặt mục tiêu mới, nó sẽ hiện ở đây.
          </Text>
        </View>
      )}
    </View>
    ),
    [
      activeTask,
      activeTasks,
      handleActivationTaskCamera,
      aiLoading,
      colors,
      IS_ANDROID,
      dockClearance,
    ],
  );
  const handleOpenAIChat = useCallback((origin) => {
    setChatOrigin(origin && typeof origin.x === "number" ? origin : null); // nơi khác gọi (không có toạ độ) -> bung từ góc dưới phải
    setShowAIChat(true);
  }, []);
  const profileTab = useMemo(
    () => (
    <ProfileTab
      username={username}
      memberTier={memberTier}
      goalMl={goalMl}
      onLogout={handleLogoutPrompt}
      profileContent={profileContentStyle}
      isPushEnabled={isPushEnabled}
      reminderTimesCount={selectedTimes.length}
      onOpenNotifications={handleOpenNotifications}
    />
    ),
    [
      username,
      memberTier,
      goalMl,
      handleLogoutPrompt,
      profileContentStyle,
      isPushEnabled,
      selectedTimes.length,
      handleOpenNotifications,
    ],
  );

  useEffect(() => {
    tabFadeAnim.setValue(0);
    tabSlideAnim.setValue(10);
    Animated.parallel([
      Animated.timing(tabFadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(tabSlideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTab]);

  // ── Dock width ────────────────────────────────────────────────────────────
  // iOS: giữ nguyên 280/320 cố định như cũ.
  // Android: giới hạn theo screenWidth vì màn hình hẹp (~320-340dp, phổ biến
  // ở phân khúc giá rẻ) có thể khiến dock tràn ra ngoài hoặc sát mép.
  const dockItemCount =
    3 + // Check-in + Mục tiêu + Tôi
    (userRole === "embe" ? 1 : 0) +
    (memberTier === "Em bé của Bình" ? 1 : 0);
  const baseDockWidth = Math.max(280, dockItemCount * 72 + 32); // 4 item = 320 như cũ
  const dockWidth = IS_ANDROID
    ? Math.min(baseDockWidth, screenWidth - 32)
    : baseDockWidth;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {/* ── HOME TAB ── */}
        <Animated.View
          style={[
            {
              flex: 1,
              opacity: tabFadeAnim,
              transform: [{ translateY: tabSlideAnim }],
            },
            activeTab !== "home" && styles.hiddenTab,
          ]}
        >
          {homeContent}
        </Animated.View>

        {/* ── MỤC TIÊU TAB ── */}
        <Animated.View
          style={[
            {
              flex: 1,
              opacity: tabFadeAnim,
              transform: [{ translateY: tabSlideAnim }],
            },
            activeTab !== "task" && styles.hiddenTab,
          ]}
        >
          {taskContent}
        </Animated.View>

        {/* ── GIFTS TAB ── */}
        <Animated.View
          style={[
            {
              flex: 1,
              opacity: tabFadeAnim,
              transform: [{ translateY: tabSlideAnim }],
            },
            activeTab !== "gifts" && styles.hiddenTab,
          ]}
        >
          <RoadmapTab
            active={activeTab === "gifts"}
            streak={streak}
            gifts={gifts}
            selectedGiftModal={selectedGiftModal}
            setSelectedGiftModal={setSelectedGiftModal}
            roadmapContent={roadmapContentStyle}
          />
        </Animated.View>

        {/* ── THEO DÕI TAB ── */}
        {userRole === "embe" && (
          <Animated.View
            style={[
              {
                flex: 1,
                opacity: tabFadeAnim,
                transform: [{ translateY: tabSlideAnim }],
              },
              activeTab !== "theodoi" && styles.hiddenTab,
            ]}
          >
            <TheoDoiTab
              token={token}
              containerStyle={profileContentStyle}
              active={activeTab === "theodoi"}
            />
          </Animated.View>
        )}

        {/* ── PROFILE TAB ── */}
        <Animated.View
          style={[
            {
              flex: 1,
              opacity: tabFadeAnim,
              transform: [{ translateY: tabSlideAnim }],
            },
            activeTab !== "profile" && styles.hiddenTab,
          ]}
        >
          {profileTab}
        </Animated.View>
      </View>

      {/* ── KHUNG CHAT AI ── */}
      <AIChatModal
        visible={showAIChat}
        onClose={() => setShowAIChat(false)}
        token={token}
        apiBase={API_BASE}
        authFetch={authFetch}
        origin={chatOrigin}
        onMountedChange={setChatMounted}
        appeal={appeal}
        onAppealChange={setAppeal}
        onAppealApproved={handleAppealApproved}
      />

      {/* ── MODAL CÀI ĐẶT NHẮC NHỞ (chuyển từ tab riêng sang đây) ── */}
      <Modal
        visible={showNotificationsModal}
        animationType="slide"
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: insets.top,
          }}
        >
          <View
            style={[
              styles.notifModalHeader,
              { borderBottomColor: colors.border },
            ]}
          >
            <TouchableOpacity
              onPress={() => setShowNotificationsModal(false)}
              style={styles.notifModalCloseBtn}
            >
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.notifModalTitle, { color: colors.text }]}>
              Nhắc nhở
            </Text>
            <View style={{ width: 26 }} />
          </View>

          <NotificationsTab
            isPushEnabled={isPushEnabled}
            onTogglePush={handleTogglePush}
            selectedSound={selectedSound}
            showSoundModal={showSoundModal}
            setShowSoundModal={setShowSoundModal}
            soundOptions={soundOptions}
            setSelectedSound={handleSetSelectedSound}
            selectedTimes={selectedTimes}
            presetTimes={presetTimes}
            onToggleTime={toggleTimeSelection}
            showCustomTimeModal={showCustomTimeModal}
            setShowCustomTimeModal={setShowCustomTimeModal}
            customTimeInput={customTimeInput}
            setCustomTimeInput={setCustomTimeInput}
            onAddCustomTime={handleAddCustomTime}
            profileContent={profileContentStyle}
            permissionStatus={permissionStatus}
            onTestNotification={handleTestNotification}
            taskRemindEnabled={taskRemindEnabled}
            onToggleTaskRemind={handleToggleTaskRemind}
            taskRemindTimes={taskRemindTimes}
            taskPresetTimes={TASK_PRESET_TIMES}
            onToggleTaskTime={toggleTaskTime}
            newTaskNotify={newTaskNotify}
            onToggleNewTask={handleToggleNewTask}
          />
        </View>
      </Modal>

      {/* ── NÚT AI NỔI (kéo thả kiểu AssistiveTouch, hiện ở mọi tab) ── */}
      <FloatingAIButton
        onPress={handleOpenAIChat}
        bubble={aiBubble}
        onBubbleClose={handleBubbleClose}
        dockTarget={scanTarget || saveTarget || volumeTarget}
        hidden={chatMounted}
        badge={!!appeal}
      />

      {/* ── DOCK ── */}
      <View
        style={[
          styles.dockWrapper,
          {
            bottom: IS_ANDROID
              ? insets.bottom + 20
              : Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View
          style={[
            styles.appleDock,
            {
              backgroundColor: colors.dockBg,
              shadowColor: colors.dockShadow,
              width: dockWidth,
            },
          ]}
        >
          <DockItem
            tab="home"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            icon="water"
            activeIcon="water"
            label="Check-in"
            activeColor={colors.primary}
            colors={colors}
            compact={isCompactWidth}
          />
          <DockItem
            tab="task"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            icon="checkmark-circle-outline"
            activeIcon="checkmark-circle"
            label="Mục tiêu"
            activeColor="#8b5cf6"
            colors={colors}
            compact={isCompactWidth}
          />
          {userRole === "embe" && (
            <DockItem
              tab="theodoi"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              icon="eye-outline"
              activeIcon="eye"
              label="Theo dõi"
              activeColor="#10b981"
              colors={colors}
              compact={isCompactWidth}
            />
          )}
          {memberTier === "Em bé của Bình" && (
            <DockItem
              tab="gifts"
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              icon="gift-outline"
              activeIcon="gift"
              label="Quà tặng"
              activeColor="#f43f5e"
              colors={colors}
              compact={isCompactWidth}
            />
          )}
          <DockItem
            tab="profile"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            icon="person-outline"
            activeIcon="person"
            label="Tôi"
            activeColor={colors.primary}
            colors={colors}
            compact={isCompactWidth}
          />
        </View>
      </View>

      {/* ── STREAK RECOVERY MODAL ── */}
      <Modal visible={showStreakRecovery} transparent animationType="fade">
        <View style={styles.modalWaterOverlay}>
          <View
            style={[styles.modalWaterCard, { backgroundColor: colors.card }]}
          >
            <Ionicons
              name="flame"
              size={56}
              color="#f97316"
              style={{ marginBottom: 8 }}
            />
            <Text style={[styles.recoveryModalTitle, { color: colors.text }]}>
              Phục hồi Streak 🔥
            </Text>
            <Text
              style={[styles.recoveryModalBody, { color: colors.textMuted }]}
            >
              Đã bỏ lỡ hôm qua nhưng vẫn còn 1 cơ hội phục hồi chuỗi{" "}
              <Text style={{ fontWeight: "800", color: "#f97316" }}>
                {recoveryInfo.recoverable_streak} ngày
              </Text>{" "}
              của mình.{"\n\n"}
              Mỗi tháng chỉ dùng được 1 lần — Sau khi phục hồi, nhớ uống đủ nước
              và hoàn thành mọi mục tiêu hôm nay để giữ streak!
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                width: "100%",
                marginTop: 20,
              }}
            >
              <TouchableOpacity
                style={[
                  styles.confirmWaterBtn,
                  { flex: 1, backgroundColor: "#94a3b8" },
                ]}
                onPress={() => setShowStreakRecovery(false)}
              >
                <Text style={styles.confirmWaterBtnText}>Để sau</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmWaterBtn,
                  { flex: 1, backgroundColor: "#f97316" },
                ]}
                onPress={handleStreakRecovery}
              >
                <Text style={styles.confirmWaterBtnText}>Phục hồi ngay!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── CAMERA OVERLAY ── */}
      {showMiniCam && (
        <CameraOverlay
          colors={colors}
          subtitle={
            activeTab === "task" && activeTask
              ? `Chụp ảnh cho mục tiêu: ${activeTask.title}`
              : "Đặt cốc/chai nước vào giữa khung hình"
          }
          frameWidth={
            IS_ANDROID
              ? Math.min(280, screenWidth * 0.72, screenHeight * 0.42)
              : null
          }
          aiLoading={aiLoading}
          onPicture={handleCameraPicture}
          onClose={handleCameraClose}
        />
      )}

      {/* -- CHỌN DUNG TÍCH (không dùng Modal để nút AI nổi vẫn hiện ở trên) -- */}
      {showVolumeModal && (
        <View style={styles.volumeHost}>
          <VolumeSheet
            key={volumeSession}
            colors={colors}
            maxVolume={maxVolume}
            initialVolume={suggestedVolume}
            fillPercent={fillPercent}
            containerType={containerType}
            compact={IS_ANDROID && isShortScreen}
            onConfirm={handleConfirmVolume}
            onCancel={handleCancelVolume}
            onDockTarget={setVolumeTarget}
          />
        </View>
      )}

      {/* ── OVERLAY ĐANG QUÉT (gửi ảnh cho AI, chờ kết quả) ── */}
      <ScanningOverlay
        visible={aiLoading}
        uri={scan.uri}
        mode={scan.mode}
        onBadgeTarget={setScanTarget}
      />

      {/* ── ĐANG LƯU CHECK-IN (sau "Xác nhận uống"): animation giọt nước dâng, không dùng ảnh ── */}
      <SavingOverlay
        visible={!!saveState}
        done={saveState === "done"}
        volume={saveVolume}
        onBadgeTarget={setSaveTarget}
      />
    </View>
  );
}

// ─── Dock item tách riêng + memo ─────────────────────────────────────────────
const DockItem = memo(function DockItem({
  tab,
  activeTab,
  setActiveTab,
  icon,
  activeIcon,
  label,
  activeColor,
  colors,
  compact,
}) {
  const isActive = activeTab === tab;

  // ── Hiệu ứng item to hơn + nhô lên khi active ────────────────────────────
  const scaleAnim = useRef(new Animated.Value(isActive ? 1.18 : 1)).current;
  const liftAnim = useRef(new Animated.Value(isActive ? -6 : 0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isActive ? 1.18 : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start();
    Animated.spring(liftAnim, {
      toValue: isActive ? -6 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 160,
    }).start();
  }, [isActive]);

  return (
    <TouchableOpacity
      style={styles.dockItem}
      activeOpacity={0.7}
      onPress={() => setActiveTab(tab)}
    >
      <Animated.View
        style={{ transform: [{ scale: scaleAnim }, { translateY: liftAnim }] }}
      >
        <Ionicons
          name={isActive ? activeIcon : icon}
          size={compact ? 21 : 24}
          color={isActive ? activeColor : colors.textMuted}
        />
      </Animated.View>
      <Text
        style={[
          styles.dockText,
          compact && { fontSize: 9.5 },
          { color: isActive ? activeColor : colors.textMuted },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Modal chọn lượng nước: state kéo thả nằm riêng ─────────────────────────
// Kéo núm = setState liên tục; để ở Dashboard sẽ render lại cả màn hình.
const VolumeSheet = memo(function VolumeSheet({
  colors,
  maxVolume,
  initialVolume,
  fillPercent,
  containerType,
  compact,
  onConfirm,
  onCancel,
  onDockTarget,
}) {
  useEffect(() => () => onDockTarget?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Mở thẻ với mức nước AI ước lượng (không có -> đầy); người dùng vẫn kéo núm để chỉnh lại
  const startVol = Math.min(Math.max(initialVolume ?? maxVolume, 10), maxVolume);
  const hasAiGuess = initialVolume != null;
  const [volume, setVolume] = useState(startVol);
  const volumeRef = useRef(startVol);
  const startVolumeRef = useRef(startVol);
  const maxVolumeRef = useRef(maxVolume);
  const heightRef = useRef(CONTAINER_HEIGHT[containerType] ?? 135);
  maxVolumeRef.current = maxVolume;
  heightRef.current = CONTAINER_HEIGHT[containerType] ?? 135;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startVolumeRef.current = volumeRef.current;
      },
      onPanResponderMove: (_, { dy }) => {
        const delta = -(dy / heightRef.current) * maxVolumeRef.current;
        let newVol = Math.round((startVolumeRef.current + delta) / 10) * 10;
        newVol = Math.min(Math.max(newVol, 10), maxVolumeRef.current);
        if (newVol === volumeRef.current) return; // bước nhảy 10ml: bỏ qua nhịp trùng
        volumeRef.current = newVol;
        setVolume(newVol);
      },
    }),
  ).current;

  const containerLabel = CONTAINER_LABELS[containerType] ?? "Vật chứa nước";
  const displayHeight = CONTAINER_HEIGHT[containerType] ?? 135;
  const waterHeight = maxVolume > 0 ? (volume / maxVolume) * displayHeight : 0;
  const containerStyle =
    containerType === "mug"
      ? styles.mugShape
      : containerType === "thermos"
        ? styles.thermosShape
        : containerType === "bottle"
          ? styles.bottleShape
          : styles.glassShape;

  return (
    <View style={styles.modalWaterOverlay}>
      <View
        style={[
          styles.modalWaterCard,
          { backgroundColor: colors.card, paddingTop: compact ? 44 : 52 },
        ]}
        onLayout={(e) => {
          // Báo tâm "ghế" nằm vắt qua mép trên thẻ để nút AI nổi bay tới đứng đó
          const { x, y, width } = e.nativeEvent.layout;
          onDockTarget?.({ x: x + width / 2, y, size: 64 });
        }}
      >
        <View pointerEvents="none" style={styles.volSeatWrap}>
          <View
            style={[
              styles.volSeat,
              { backgroundColor: colors.card, borderColor: colors.card },
            ]}
          />
        </View>
        <View
          style={[
            styles.containerBadge,
            {
              backgroundColor: colors.primarySoft,
              borderColor: colors.primaryBorder,
            },
          ]}
        >
          <Ionicons name="water" size={13} color={colors.primaryText} />
          <Text
            style={[styles.containerBadgeText, { color: colors.primaryText }]}
          >
            {containerLabel}
          </Text>
        </View>
        <Text
          style={[styles.volumeDisplayValue, { color: colors.primaryText }]}
        >
          {volume}{" "}
          <Text style={{ fontSize: 18, fontWeight: "600" }}>
            / {maxVolume} ml
          </Text>
        </Text>
        {hasAiGuess && (
          <Text style={[styles.aiGuessHint, { color: colors.textMuted }]}>
            ✨ AI ước lượng ~{startVol} ml
            {typeof fillPercent === "number" ? ` (${fillPercent}%)` : ""} ✨
          </Text>
        )}

        <View
          style={[
            styles.interactiveArea,
            compact && { height: 190, marginBottom: 12 },
          ]}
        >
          <View style={styles.glassWrapper}>
            {containerType === "thermos" && (
              <View style={styles.thermosTopArea}>
                <View style={[styles.thermosCap, { backgroundColor: colors.primaryDark }]} />
                <View style={[styles.thermosNeck, { backgroundColor: colors.primary }]} />
              </View>
            )}
            {containerType === "bottle" && (
              <View style={styles.bottleTopArea}>
                <View style={[styles.bottleCap, { backgroundColor: colors.primaryDark }]} />
                <View style={[styles.bottleNeck, { backgroundColor: colors.primaryPale }]} />
              </View>
            )}
            {containerType === "mug" && (
              <View style={[styles.mugHandle, { borderColor: colors.primary }]} />
            )}

            <View
              style={[
                styles.glassOutline,
                { backgroundColor: colors.card },
                containerStyle,
                { borderColor: colors.primary },
              ]}
            >
              <View
                style={[
                  styles.waterFill,
                  { height: waterHeight, backgroundColor: colors.primary },
                ]}
              />
              <Ionicons
                name="water"
                size={36}
                color="rgba(255,255,255,0.4)"
                style={styles.glassIconOverlay}
              />
            </View>

            <View
              style={[
                styles.draggerContainer,
                { bottom: Math.max(0, waterHeight - 20) },
              ]}
              {...panResponder.panHandlers}
            >
              <View
                style={[
                  styles.knob,
                  { borderColor: colors.primary, shadowColor: colors.primary },
                ]}
              >
                <View
                  style={[
                    styles.knobInner,
                    { backgroundColor: colors.primaryPale },
                  ]}
                />
              </View>
              <View style={styles.waterSurfaceLine} />
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.confirmWaterBtn,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
          ]}
          onPress={() => onConfirm(volumeRef.current)}
        >
          <Text style={styles.confirmWaterBtnText}>Xác nhận uống</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={8}
          style={styles.cancelVolBtn}
          accessibilityRole="button"
          accessibilityLabel="Huỷ"
        >
          <Text style={[styles.cancelVolText, { color: colors.textMuted }]}>Huỷ, chụp lại</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  // paddingBottom giờ được ghép động (xem dockClearance) để tự thích ứng
  // với insets thực tế của từng máy Android thay vì số cố định.
  scrollContent: { paddingHorizontal: 16, paddingTop: 2, flex: 1 },
  hiddenTab: { display: "none" },

  // ── Header modal Nhắc nhở ──────────────────────────────────────────────
  notifModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  notifModalCloseBtn: { padding: 6 },
  notifModalTitle: { fontSize: 17, fontWeight: "800" },

  // Điều chỉnh riêng cho Android tại các Tab còn lại để thu nhỏ chiều cao phần tử
  profileContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 12 : 20,
  },
  roadmapContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 12 : 20,
  },

  // Dock
  dockWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  appleDock: {
    flexDirection: "row",
    height: 62,
    borderRadius: 31,
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: -10,
    paddingHorizontal: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  dockItem: { alignItems: "center", justifyContent: "center", flex: 1 },
  dockText: { fontSize: 11, marginTop: 3, fontWeight: "700" },

  // Camera overlay
  cameraOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  miniCamContainer: {
    borderRadius: 32,
    padding: 24,
    width: "85%",
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 15,
  },
  miniCamTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  miniCamTitleIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  miniCamTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3 },
  miniCamSubtitle: {
    fontSize: 12.5,
    marginBottom: 18,
    marginTop: 2,
    fontWeight: "500",
  },
  cameraFrameBorder: {
    width: 286,
    aspectRatio: 3 / 4,
    borderRadius: 27,
    padding: 3,
    marginBottom: 4,
  },
  cameraFrame: {
    flex: 1,
    width: 280,
    aspectRatio: 3 / 4,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  cameraView: { flex: 1 },

  viewfinderCorner: {
    position: "absolute",
    width: 22,
    height: 22,
    borderColor: "rgba(255,255,255,0.85)",
  },
  cornerTL: {
    top: 10,
    left: 10,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 10,
    right: 10,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 10,
    left: 10,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 10,
    right: 10,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },

  zoomBadge: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  zoomBadgeText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 22,
    paddingHorizontal: 8,
  },
  closeCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  shutterBtnShadow: {
    shadowColor: "#0ea5e9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  shutterBtnOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterBtnInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffffff",
  },
  flashCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  flashCircleActive: {
    backgroundColor: "#fef9c3",
    borderWidth: 1,
    borderColor: "#fef08a",
  },

  // Volume modal
  modalWaterOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalWaterCard: {
    width: "90%",
    maxWidth: 350,
    borderRadius: 32,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  waterModalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 12 },
  volumeDisplayValue: {
    fontSize: 32,
    fontWeight: "900",
    color: "#0ea5e9",
    letterSpacing: -1,
    marginBottom: 16,
  },
  containerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  containerBadgeText: { fontSize: 12.5, fontWeight: "800" },
  aiGuessHint: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginTop: -10,
    marginBottom: 10,
  },
  interactiveArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 220,
    marginBottom: 20,
  },
  glassWrapper: {
    position: "relative",
    marginHorizontal: 16,
    justifyContent: "flex-end",
  },
  glassOutline: { overflow: "hidden", justifyContent: "flex-end", zIndex: 2 },

  // Container shapes
  glassShape: {
    width: 80,
    height: 135,
    borderBottomWidth: 5,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderColor: "#0ea5e9",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  mugShape: {
    width: 110,
    height: 120,
    borderBottomWidth: 6,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderColor: "#0ea5e9",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  thermosShape: {
    width: 95,
    height: 170,
    borderWidth: 6,
    borderColor: "#475569",
    borderRadius: 16,
  },
  bottleShape: {
    width: 70,
    height: 200,
    borderWidth: 4,
    borderColor: "#94a3b8",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  waterFill: { width: "100%", backgroundColor: "#0ea5e9" },
  glassIconOverlay: { position: "absolute", bottom: 12, alignSelf: "center" },
  mugHandle: {
    position: "absolute",
    right: -25,
    top: 20,
    width: 45,
    height: 70,
    borderWidth: 6,
    borderColor: "#0ea5e9",
    borderLeftWidth: 0,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 25,
    zIndex: 1,
  },
  thermosTopArea: {
    position: "absolute",
    top: -32,
    alignSelf: "center",
    alignItems: "center",
    zIndex: 3,
  },
  thermosCap: {
    width: 64,
    height: 22,
    backgroundColor: "#334155",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  thermosNeck: {
    width: 80,
    height: 10,
    backgroundColor: "#475569",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  bottleTopArea: {
    position: "absolute",
    top: -28,
    alignSelf: "center",
    alignItems: "center",
    zIndex: 3,
  },
  bottleCap: {
    width: 26,
    height: 14,
    backgroundColor: "#3b82f6",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  bottleNeck: { width: 28, height: 14, backgroundColor: "#cbd5e1" },

  draggerContainer: {
    position: "absolute",
    left: -20,
    width: 140,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  knob: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: "#0ea5e9",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0ea5e9",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    marginRight: -8,
    zIndex: 11,
  },
  knobInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#bae6fd",
  },
  waterSurfaceLine: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },

  confirmWaterBtn: {
    backgroundColor: "#0ea5e9",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#0ea5e9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmWaterBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "750" },
  volumeHost: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 30,
  },
  volSeatWrap: { position: "absolute", top: -32, left: 0, right: 0, alignItems: "center" },
  volSeat: { width: 64, height: 64, borderRadius: 32, borderWidth: 4 },
  cancelVolBtn: { marginTop: 12, paddingVertical: 4 },
  cancelVolText: { fontSize: 13.5, fontWeight: "700" },

  // Loading overlay
  globalLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#0ea5e9",
  },

  // Streak recovery
  recoveryBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff7ed",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "#fed7aa",
  },
  recoveryBannerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  recoveryBannerTitle: { fontSize: 14, fontWeight: "800", color: "#ea580c" },
  recoveryBannerSub: {
    fontSize: 12,
    color: "#c2410c",
    marginTop: 2,
    fontWeight: "500",
  },
  recoveryModalTitle: { fontSize: 20, fontWeight: "900", marginBottom: 12 },
  recoveryModalBody: { fontSize: 14, lineHeight: 22, textAlign: "center" },
});