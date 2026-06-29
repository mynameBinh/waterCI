import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Camera, CameraView } from 'expo-camera';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderComponent from '../components/HeaderComponent';
import HistoryComponent from '../components/HistoryComponent';
import MainActionButtonComponent from '../components/MainActionButtonComponent';
import { useTheme } from '../context/ThemeContext';
import NotificationsTab from '../tabs/NotificationsTab';
import ProfileTab from '../tabs/ProfileTab';
import RoadmapTab from '../tabs/RoadmapTab';
import { decodeJWT } from '../utils/jwt';

const API_BASE = 'https://binhhn21-water-check-in-backend.hf.space';

// AsyncStorage keys cho notification settings
const STORAGE_PUSH_ENABLED   = 'notif_push_enabled';
const STORAGE_SELECTED_TIMES = 'notif_selected_times';
const STORAGE_SELECTED_SOUND = 'notif_selected_sound';

// Streak recovery key (lưu tháng đã dùng recovery, format: YYYY-MM)
const STORAGE_STREAK_RECOVERY_USED = 'streak_recovery_used_month';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CONTAINER_LABELS = {
  glass:   'Ly thủy tinh',
  mug:     'Cốc có quai cầm',
  thermos: 'Bình giữ nhiệt',
  bottle:  'Chai nước lọc',
};
const CONTAINER_HEIGHT = { glass: 135, mug: 120, thermos: 170, bottle: 200 };

// ─── Component ───────────────────────────────────────────────────────────────
export default function DashboardScreen({ token, onLogout }) {
  const { colors }  = useTheme();
  const insets      = useSafeAreaInsets();

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState('home');
  const [currentWater,    setCurrentWater]    = useState(0);
  const [goalMl,          setGoalMl]          = useState(1800);
  const [username,        setUsername]        = useState('Đang tải...');
  const [memberTier,      setMemberTier]      = useState('Thành viên');
  const [streak,          setStreak]          = useState(0);
  const [completedDates,  setCompletedDates]  = useState([]);
  const [history,         setHistory]         = useState([]);
  const [gifts,           setGifts]           = useState([]);
  const [selectedGiftModal, setSelectedGiftModal] = useState(null);
  const [showStreakRecovery, setShowStreakRecovery] = useState(false);
  const [streakRecoveryUsed, setStreakRecoveryUsed] = useState(false);

  // Camera / AI
  const [aiLoading,       setAiLoading]       = useState(false);
  const [showMiniCam,     setShowMiniCam]     = useState(false);
  const [flash,           setFlash]           = useState('off');
  const cameraRef = useRef(null);

  // Volume modal
  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [selectedVolume,  setSelectedVolumeState] = useState(250);
  const [maxVolume,       setMaxVolume]       = useState(250);
  const [containerType,   setContainerType]   = useState('unknown');
  const pendingImageUrl = useRef(''); // lưu image_url từ /api/checkin để gửi khi confirm

  // Notifications
  const [isPushEnabled,   setIsPushEnabled]   = useState(false);
  const [expoPushToken,   setExpoPushToken]   = useState('');
  const [showSoundModal,  setShowSoundModal]  = useState(false);
  const [selectedSound,   setSelectedSound]   = useState('Chuông ngân (Mặc định)');
  const soundOptions = useMemo(() => ['Tiếng nước chảy', 'Ting ting', 'Tiếng chim hót', 'Chuông ngân (Mặc định)'], []);
  const [selectedTimes,   setSelectedTimes]   = useState(['08:00', '12:00', '15:00', '20:00']);
  const presetTimes = useMemo(() => ['07:00', '08:00', '10:00', '12:00', '15:00', '18:00', '20:00', '22:00'], []);
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('');

  // ── Refs (cho PanResponder, tránh stale closure) ──────────────────────────
  const selectedVolumeRef = useRef(250);
  const maxVolumeRef      = useRef(250);
  const startVolumeRef    = useRef(250);
  const activeHeightRef   = useRef(135);

  const setSelectedVolume = useCallback((val) => {
    selectedVolumeRef.current = val;
    setSelectedVolumeState(val);
  }, []);

  useEffect(() => {
    activeHeightRef.current = CONTAINER_HEIGHT[containerType] ?? 135;
  }, [containerType]);

  // ── PanResponder ──────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { startVolumeRef.current = selectedVolumeRef.current; },
      onPanResponderMove: (_, { dy }) => {
        const delta  = -(dy / activeHeightRef.current) * maxVolumeRef.current;
        let newVol   = Math.round((startVolumeRef.current + delta) / 10) * 10;
        newVol = Math.min(Math.max(newVol, 10), maxVolumeRef.current);
        setSelectedVolume(newVol);
      },
    })
  ).current;

  // ── Load dữ liệu ban đầu ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    // Lấy username từ token (không cần gọi API thêm)
    const payload = decodeJWT(token);
    if (payload?.sub) setUsername(payload.sub);

    const loadData = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [meRes, histRes, streakRes, giftsRes] = await Promise.all([
          fetch(`${API_BASE}/api/me`,      { headers }),
          fetch(`${API_BASE}/api/history`, { headers }),
          fetch(`${API_BASE}/api/streak`,  { headers }),
          fetch(`${API_BASE}/api/gifts`,   { headers }),
        ]);

        if (meRes.ok) {
          const me = await meRes.json();
          setGoalMl(me.daily_goal);
          setMemberTier(me.tier || 'Thành viên');
        }
        if (streakRes.ok) {
          const st = await streakRes.json();
          setStreak(st.streak);
          setCompletedDates(st.completed_dates || []);
        }
        if (histRes.ok) {
          const hData = await histRes.json();
          setHistory(hData.map(item => ({
            id:     item.id,
            time:   new Date(item.timestamp.endsWith('Z') ? item.timestamp : `${item.timestamp}Z`)
                      .toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            volume: item.volume_ml,
          })));
          setCurrentWater(hData.reduce((sum, i) => sum + i.volume_ml, 0));
        }
        if (giftsRes.ok) {
          setGifts(await giftsRes.json());
        }
      } catch { /* lỗi mạng — giữ nguyên state */ }
    };

    // ── Khôi phục notification settings từ AsyncStorage ──────────────────
    const restoreNotificationSettings = async () => {
      try {
        const [savedEnabled, savedTimes, savedSound, savedRecovery] = await Promise.all([
          AsyncStorage.getItem(STORAGE_PUSH_ENABLED),
          AsyncStorage.getItem(STORAGE_SELECTED_TIMES),
          AsyncStorage.getItem(STORAGE_SELECTED_SOUND),
          AsyncStorage.getItem(STORAGE_STREAK_RECOVERY_USED),
        ]);

        const enabled = savedEnabled === 'true';
        const times   = savedTimes  ? JSON.parse(savedTimes)  : ['08:00', '12:00', '15:00', '20:00'];
        const sound   = savedSound  || 'Chuông ngân (Mặc định)';

        setSelectedTimes(times);
        setSelectedSound(sound);

        if (enabled) {
          // Kiểm tra quyền còn hiệu lực không trước khi restore
          const { status } = await Notifications.getPermissionsAsync();
          if (status === 'granted') {
            setIsPushEnabled(true);
            // Lên lịch lại sau mỗi lần mở app — đảm bảo không mất thông báo
            await syncScheduledReminders(times, true);
          } else {
            // Quyền bị thu hồi — reset về false
            await AsyncStorage.setItem(STORAGE_PUSH_ENABLED, 'false');
          }
        }

        // Kiểm tra xem tháng này đã dùng recovery chưa
        if (savedRecovery) {
          const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
          if (savedRecovery === thisMonth) setStreakRecoveryUsed(true);
        }
      } catch { /* ignore */ }
    };

    loadData();
    restoreNotificationSettings();
  }, [token]);

  // ── Notification listeners ────────────────────────────────────────────────
  useEffect(() => {
    const recvSub = Notifications.addNotificationReceivedListener(() => {});
    const tapSub  = Notifications.addNotificationResponseReceivedListener(() => setActiveTab('notifications'));
    return () => { recvSub.remove(); tapSub.remove(); };
  }, []);

  // ── Notification helpers ──────────────────────────────────────────────────
  const syncScheduledReminders = useCallback(async (timesList, enabled) => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (!enabled || timesList.length === 0) return;

      for (const timeStr of timesList) {
        const [hour, minute] = timeStr.split(':').map(Number);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Giờ uống nước đến rồi !!! 💧',
            body:  `${timeStr} Đã điểm, vào check-in uống nước để duy trì chuỗi nào!`,
            sound: Platform.OS === 'ios' ? 'pouring_water.wav' : 'pouring_water.mp3',
            priority: Notifications.AndroidNotificationPriority.HIGH,
            // Android: icon hiển thị trên status bar và drawer
            // File icon phải nằm ở android/app/src/main/res/drawable/notification_icon.png
            // (ảnh trắng trên nền trong suốt, ~24×24dp)
            ...(Platform.OS === 'android' && {
              channelId: 'water-reminder',
              icon: 'notification_icon', // tên file không có đuôi .png
            }),
          },
          trigger: { type: 'calendar', hour, minute, repeats: true },
        });
      }
    } catch { /* ignore */ }
  }, []);

  // ── Xin quyền thông báo (chỉ cần quyền, không cần push token) ───────────────
  const requestNotificationPermission = useCallback(async () => {
    const { status: existing } = await Notifications.getPermissionsAsync();
    const finalStatus = existing !== 'granted'
      ? (await Notifications.requestPermissionsAsync()).status
      : existing;

    if (finalStatus !== 'granted') {
      Alert.alert('Chưa cấp quyền', 'Phải bật quyền thông báo thì mới nhận được lời nhắc nha!');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('water-reminder', {
        name: 'Nhắc nhở uống nước',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0ea5e9',
        sound: 'pouring_water.mp3',
        // Icon hiển thị trên status bar (tên file không có đuôi, đặt trong drawable/)
        enableVibrate: true,
      });
    }

    return true;
  }, []);

  // ── Lấy push token (tuỳ chọn — bỏ qua nếu không có projectId / Expo Go) ────
  const tryGetPushToken = useCallback(async () => {
    if (!Device.isDevice) return null; // Simulator/Expo Go preview — bỏ qua lặng lẽ

    try {
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      if (!projectId) return null; // Không có projectId — bỏ qua lặng lẽ
      return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch {
      return null; // Lỗi bất kỳ — bỏ qua, không block local notification
    }
  }, []);

  const updatePushTokenToBackend = useCallback(async (pushToken) => {
    if (pushToken === null || pushToken === undefined) return; // Chỉ skip khi chưa từng có token (Expo Go)
    try {
      await fetch(`${API_BASE}/api/users/update-push-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ push_token: pushToken }), // '' khi tắt, token thật khi bật
      });
    } catch { /* ignore */ }
  }, [token]);

  const handleTogglePush = useCallback(async (value) => {
    if (value) {
      // 1. Xin quyền trước — nếu từ chối thì dừng lại
      const granted = await requestNotificationPermission();
      if (!granted) return;

      // 2. Đặt lịch local notification — luôn hoạt động kể cả Expo Go
      setIsPushEnabled(true);
      await AsyncStorage.setItem(STORAGE_PUSH_ENABLED, 'true');
      await syncScheduledReminders(selectedTimes, true);

      // 3. Thử lấy push token (tuỳ chọn)
      const pToken = await tryGetPushToken();
      if (pToken) {
        setExpoPushToken(pToken);
        await updatePushTokenToBackend(pToken);
      }
    } else {
      setIsPushEnabled(false);
      setExpoPushToken('');
      await AsyncStorage.setItem(STORAGE_PUSH_ENABLED, 'false');
      await updatePushTokenToBackend('');
      await syncScheduledReminders([], false);
    }
  }, [requestNotificationPermission, tryGetPushToken, updatePushTokenToBackend, syncScheduledReminders, selectedTimes]);

  const toggleTimeSelection = useCallback((time) => {
    setSelectedTimes(prev => {
      const next = prev.includes(time) ? prev.filter(t => t !== time) : [...prev, time].sort();
      AsyncStorage.setItem(STORAGE_SELECTED_TIMES, JSON.stringify(next));
      if (isPushEnabled) syncScheduledReminders(next, true);
      return next;
    });
  }, [isPushEnabled, syncScheduledReminders]);

  const handleAddCustomTime = useCallback(() => {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(customTimeInput)) {
      Alert.alert('Lỗi định dạng', 'Vui lòng nhập đúng giờ theo chuẩn HH:MM (VD: 09:30)');
      return;
    }
    setSelectedTimes(prev => {
      if (prev.includes(customTimeInput)) return prev;
      const next = [...prev, customTimeInput].sort();
      AsyncStorage.setItem(STORAGE_SELECTED_TIMES, JSON.stringify(next));
      if (isPushEnabled) syncScheduledReminders(next, true);
      return next;
    });
    setShowCustomTimeModal(false);
    setCustomTimeInput('');
  }, [customTimeInput, isPushEnabled, syncScheduledReminders]);

  // Wrapper lưu sound vào AsyncStorage khi user thay đổi
  const handleSetSelectedSound = useCallback((sound) => {
    setSelectedSound(sound);
    AsyncStorage.setItem(STORAGE_SELECTED_SOUND, sound);
  }, []);

  // ── Streak Recovery ───────────────────────────────────────────────────────
  // Kiểm tra xem hôm qua có phải ngày bị bỏ lỡ không (streak > 0 nhưng hôm qua không có trong completedDates)
  const canUseStreakRecovery = useMemo(() => {
    if (streakRecoveryUsed || streak === 0) return false;
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const todayStr     = today.toISOString().slice(0, 10);
    // Chỉ có thể recover nếu: hôm qua không hoàn thành VÀ hôm nay chưa hoàn thành
    const missedYesterday = !completedDates.includes(yesterdayStr);
    const notDoneToday    = !completedDates.includes(todayStr);
    return missedYesterday && notDoneToday && streak > 0;
  }, [streak, completedDates, streakRecoveryUsed]);

  const handleStreakRecovery = useCallback(async () => {
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    try {
      const res = await fetch(`${API_BASE}/api/streak/recover`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setStreak(data.streak);
        setCompletedDates(data.completed_dates || []);
        setStreakRecoveryUsed(true);
        await AsyncStorage.setItem(STORAGE_STREAK_RECOVERY_USED, thisMonth);
        setShowStreakRecovery(false);
        Alert.alert('Streak đã phục hồi! 🔥', `Tuyệt vời! Streak của bạn vẫn là ${data.streak} ngày. Nhớ uống nước hôm nay nha!`);
      } else {
        Alert.alert('Không thể phục hồi', 'Không đủ điều kiện để phục hồi streak lần này.');
        setShowStreakRecovery(false);
      }
    } catch {
      Alert.alert('Lỗi mạng', 'Vui lòng thử lại sau.');
    }
  }, [token]);

  // ── Camera / AI ───────────────────────────────────────────────────────────
  const handleActivationCamera = useCallback(async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Quyền truy cập', 'Cần cấp quyền Camera nhé!'); return; }
    setFlash('off');
    setShowMiniCam(true);
  }, []);

  const handleTakePicture = useCallback(async () => {
    if (!cameraRef.current || aiLoading) return;
    try {
      setAiLoading(true);
      // quality 0.5 + skipProcessing: true → nhanh hơn, nhẹ hơn, AI vẫn nhận diện tốt
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, skipProcessing: true });
      setShowMiniCam(false);
      submitImage(photo.uri);
    } catch { setAiLoading(false); }
  }, [aiLoading]);

  const submitImage = useCallback(async (uri) => {
    setAiLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', { uri, name: 'photo.jpg', type: 'image/jpeg' });
      const res = await fetch(`${API_BASE}/api/checkin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Không phát hiện nước');
      const data = await res.json();
      const vol = data.max_volume || 250;
      // Lưu image_url để gửi kèm khi user xác nhận — chưa lưu DB ở bước này
      pendingImageUrl.current = data.image_url || '';
      setMaxVolume(vol); maxVolumeRef.current = vol;
      setContainerType(data.container_type || 'unknown');
      setSelectedVolume(vol);
      setShowVolumeModal(true);
    } catch (err) {
      Alert.alert('Check-in thất bại ❌', err.message);
    } finally {
      setAiLoading(false);
    }
  }, [token, setSelectedVolume]);

  const handleConfirmVolume = useCallback(async () => {
    // Optimistic UI update ngay lập tức
    const confirmedVol = selectedVolumeRef.current;
    setShowVolumeModal(false);
    setCurrentWater(prev => prev + confirmedVol);
    setHistory(prev => [
      { id: Date.now(), time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), volume: confirmedVol },
      ...prev,
    ]);

    // Gửi volume thực lên backend — lưu DB với đúng số ml user đã chọn
    try {
      const res = await fetch(`${API_BASE}/api/checkin/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume_ml: confirmedVol, image_url: pendingImageUrl.current }),
      });
      if (!res.ok) throw new Error();
      Alert.alert('Tuyệt vời!', `Check-in thành công ${confirmedVol}ml nước. 💧`);
    } catch {
      // Nếu lưu DB thất bại — rollback UI
      setCurrentWater(prev => prev - confirmedVol);
      setHistory(prev => prev.slice(1));
      Alert.alert('Lỗi lưu dữ liệu ❌', 'Không thể lưu check-in, vui lòng thử lại.');
    }
  }, [token]);

  const handleLogoutPrompt = useCallback(() => {
    Alert.alert('Đăng xuất', 'Đăng xuất tài khoản này ư?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: onLogout },
    ]);
  }, [onLogout]);

  // ── Derived values ────────────────────────────────────────────────────────
  const containerLabel = CONTAINER_LABELS[containerType] ?? 'Vật chứa nước';
  const displayHeight  = CONTAINER_HEIGHT[containerType] ?? 135;
  const waterHeight    = maxVolume > 0 ? (selectedVolume / maxVolume) * displayHeight : 0;

  const containerStyle = useMemo(() => {
    if (containerType === 'mug')     return styles.mugShape;
    if (containerType === 'thermos') return styles.thermosShape;
    if (containerType === 'bottle')  return styles.bottleShape;
    return styles.glassShape;
  }, [containerType]);

  // ── Shared style props ────────────────────────────────────────────────────
  const profileContentStyle = styles.profileContent;
  const roadmapContentStyle = styles.roadmapContent;

  // ── Dock width ────────────────────────────────────────────────────────────
  const dockWidth = memberTier === 'Em bé của admin' ? 320 : 280;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>

        {/* ── HOME TAB ── */}
        {activeTab === 'home' && (
          <View style={styles.scrollContent}>
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
                    <Text style={styles.recoveryBannerTitle}>Phục hồi streak!</Text>
                    <Text style={styles.recoveryBannerSub}>Bạn có 1 cơ hội cứu chuỗi {streak} ngày</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#f97316" />
              </TouchableOpacity>
            )}

            <View style={{ marginTop: -12, marginBottom: -4, zIndex: 10 }}>
              <MainActionButtonComponent onOpen={handleActivationCamera} disabled={aiLoading} />
            </View>
            <HistoryComponent history={history} />
          </View>
        )}

        {/* ── GIFTS TAB ── */}
        {activeTab === 'gifts' && (
          <RoadmapTab
            streak={streak}
            gifts={gifts}
            selectedGiftModal={selectedGiftModal}
            setSelectedGiftModal={setSelectedGiftModal}
            roadmapContent={roadmapContentStyle}
          />
        )}

        {/* ── NOTIFICATIONS TAB ── */}
        {activeTab === 'notifications' && (
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
          />
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <ProfileTab
            username={username}
            memberTier={memberTier}
            goalMl={goalMl}
            onLogout={handleLogoutPrompt}
            profileContent={profileContentStyle}
          />
        )}
      </View>

      {/* ── DOCK ── */}
      <View style={[styles.dockWrapper, { bottom: Math.max(insets.bottom, 10) }]}>
        <View style={[styles.appleDock, { backgroundColor: colors.dockBg, shadowColor: colors.dockShadow, width: dockWidth }]}>
          <DockItem tab="home"          activeTab={activeTab} setActiveTab={setActiveTab} icon="water"         activeIcon="water"         label="Check-in"  activeColor="#0ea5e9" colors={colors} />
          {memberTier === 'Em bé của admin' && (
            <DockItem tab="gifts"       activeTab={activeTab} setActiveTab={setActiveTab} icon="gift-outline"  activeIcon="gift"          label="Quà tặng"  activeColor="#f43f5e" colors={colors} />
          )}
          <DockItem tab="notifications" activeTab={activeTab} setActiveTab={setActiveTab} icon="notifications-outline" activeIcon="notifications" label="Nhắc nhở" activeColor="#0ea5e9" colors={colors} />
          <DockItem tab="profile"       activeTab={activeTab} setActiveTab={setActiveTab} icon="person-outline" activeIcon="person"        label="Tôi"       activeColor="#0ea5e9" colors={colors} />
        </View>
      </View>

      {/* ── STREAK RECOVERY MODAL ── */}
      <Modal visible={showStreakRecovery} transparent animationType="fade">
        <View style={styles.modalWaterOverlay}>
          <View style={[styles.modalWaterCard, { backgroundColor: colors.card }]}>
            <Ionicons name="flame" size={56} color="#f97316" style={{ marginBottom: 8 }} />
            <Text style={[styles.recoveryModalTitle, { color: colors.text }]}>Phục hồi Streak 🔥</Text>
            <Text style={[styles.recoveryModalBody, { color: colors.textMuted }]}>
              Bạn đã bỏ lỡ hôm qua nhưng vẫn còn 1 cơ hội phục hồi chuỗi{' '}
              <Text style={{ fontWeight: '800', color: '#f97316' }}>{streak} ngày</Text> của mình.{'\n\n'}
              Mỗi tháng chỉ dùng được 1 lần — hãy dùng thật thông minh nhé! Sau khi phục hồi, nhớ uống đủ nước hôm nay để giữ streak!
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.confirmWaterBtn, { flex: 1, backgroundColor: '#94a3b8' }]}
                onPress={() => setShowStreakRecovery(false)}
              >
                <Text style={styles.confirmWaterBtnText}>Để sau</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmWaterBtn, { flex: 1, backgroundColor: '#f97316' }]}
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
        <View style={styles.cameraOverlay}>
          <View style={[styles.miniCamContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.miniCamTitle, { color: colors.text }]}>Chụp ảnh để bắt đầu kiểm tra</Text>
            <View style={styles.cameraFrame}>
              <CameraView style={styles.cameraView} facing="back" flash={flash} enableTorch={flash === 'on'} ref={cameraRef} zoom={0.2} />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setShowMiniCam(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shutterBtnOuter} onPress={handleTakePicture}>
                <View style={styles.shutterBtnInner} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.flashCircle, flash === 'on' && styles.flashCircleActive]}
                onPress={() => setFlash(prev => prev === 'off' ? 'on' : 'off')}
              >
                <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={20} color={flash === 'on' ? '#eab308' : '#64748b'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* -- VOLUME MODAL -- */}
      <Modal visible={showVolumeModal} transparent animationType="fade">
        <View style={styles.modalWaterOverlay}>
          <View style={[styles.modalWaterCard, { backgroundColor: colors.card }]}>
            
            <Text style={styles.volumeDisplayValue}>
              {selectedVolume} <Text style={{ fontSize: 18, fontWeight: '600' }}>/ {maxVolume} ml</Text>
            </Text>

            <View style={styles.interactiveArea}>
              <View style={styles.glassWrapper}>
                {containerType === 'thermos' && (
                  <View style={styles.thermosTopArea}>
                    <View style={styles.thermosCap} /><View style={styles.thermosNeck} />
                  </View>
                )}
                {containerType === 'bottle' && (
                  <View style={styles.bottleTopArea}>
                    <View style={styles.bottleCap} /><View style={styles.bottleNeck} />
                  </View>
                )}
                {containerType === 'mug' && <View style={styles.mugHandle} />}

                <View style={[styles.glassOutline, { backgroundColor: colors.card }, containerStyle]}>
                  <View style={[styles.waterFill, { height: waterHeight }]} />
                  <Ionicons name="water" size={36} color="rgba(255,255,255,0.4)" style={styles.glassIconOverlay} />
                </View>

                <View style={[styles.draggerContainer, { bottom: Math.max(0, waterHeight - 20) }]} {...panResponder.panHandlers}>
                  <View style={styles.knob}><View style={styles.knobInner} /></View>
                  <View style={styles.waterSurfaceLine} />
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.confirmWaterBtn} onPress={handleConfirmVolume}>
              <Text style={styles.confirmWaterBtnText}>Xác nhận uống</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── AI LOADING OVERLAY ── */}
      {aiLoading && (
        <View style={styles.globalLoading}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>Đang kiểm tra...</Text>
        </View>
      )}
    </View>
  );
}

// ─── Dock item tách riêng + memo ─────────────────────────────────────────────
const DockItem = memo(function DockItem({ tab, activeTab, setActiveTab, icon, activeIcon, label, activeColor, colors }) {
  const isActive = activeTab === tab;
  return (
    <TouchableOpacity style={styles.dockItem} activeOpacity={0.7} onPress={() => setActiveTab(tab)}>
      <Ionicons name={isActive ? activeIcon : icon} size={24} color={isActive ? activeColor : colors.textMuted} />
      <Text style={[styles.dockText, { color: isActive ? activeColor : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:       { flex: 1 },
  scrollContent:   { paddingHorizontal: 16, paddingBottom: 125, paddingTop: 2, flex: 1 },
  profileContent:  { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 20 },
  roadmapContent:  { paddingHorizontal: 20, paddingBottom: 150, paddingTop: 20 },

  // Dock
  dockWrapper:     { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  appleDock:       { flexDirection: 'row', height: 62, borderRadius: 31, justifyContent: 'space-around', alignItems: 'center', marginBottom: -10, paddingHorizontal: 8, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8 },
  dockItem:        { alignItems: 'center', justifyContent: 'center', flex: 1 },
  dockText:        { fontSize: 11, marginTop: 3, fontWeight: '700' },

  // Camera overlay
  cameraOverlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  miniCamContainer: { borderRadius: 32, padding: 24, width: '85%', maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 30, elevation: 15 },
  miniCamTitle:    { fontSize: 16, fontWeight: '700', marginBottom: 16, letterSpacing: -0.3 },
  cameraFrame:     { width: 280, aspectRatio: 3 / 4, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  cameraView:      { flex: 1 },
  actionRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 24, paddingHorizontal: 8 },
  closeCircle:     { width: 46, height: 46, borderRadius: 23, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  shutterBtnOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center' },
  shutterBtnInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#0ea5e9' },
  flashCircle:     { width: 46, height: 46, borderRadius: 23, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  flashCircleActive: { backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fef08a' },

  // Volume modal
  modalWaterOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalWaterCard:  { width: '90%', maxWidth: 350, borderRadius: 32, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },
  waterModalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  volumeDisplayValue: { fontSize: 32, fontWeight: '900', color: '#0ea5e9', letterSpacing: -1, marginBottom: 16 },
  interactiveArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 220, marginBottom: 20 },
  glassWrapper:    { position: 'relative', marginHorizontal: 16, justifyContent: 'flex-end' },
  glassOutline:    { overflow: 'hidden', justifyContent: 'flex-end', zIndex: 2 },

  // Container shapes
  glassShape:      { width: 80,  height: 135, borderBottomWidth: 5, borderLeftWidth: 4, borderRightWidth: 4, borderColor: '#0ea5e9', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  mugShape:        { width: 110, height: 120, borderBottomWidth: 6, borderLeftWidth: 5, borderRightWidth: 5, borderColor: '#0ea5e9', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  thermosShape:    { width: 95,  height: 170, borderWidth: 6, borderColor: '#475569', borderRadius: 16 },
  bottleShape:     { width: 70,  height: 200, borderWidth: 4, borderColor: '#94a3b8', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 },

  waterFill:       { width: '100%', backgroundColor: '#0ea5e9' },
  glassIconOverlay: { position: 'absolute', bottom: 12, alignSelf: 'center' },
  mugHandle:       { position: 'absolute', right: -25, top: 20, width: 45, height: 70, borderWidth: 6, borderColor: '#0ea5e9', borderLeftWidth: 0, borderTopRightRadius: 25, borderBottomRightRadius: 25, zIndex: 1 },
  thermosTopArea:  { position: 'absolute', top: -32, alignSelf: 'center', alignItems: 'center', zIndex: 3 },
  thermosCap:      { width: 64, height: 22, backgroundColor: '#334155', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  thermosNeck:     { width: 80, height: 10, backgroundColor: '#475569', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  bottleTopArea:   { position: 'absolute', top: -28, alignSelf: 'center', alignItems: 'center', zIndex: 3 },
  bottleCap:       { width: 26, height: 14, backgroundColor: '#3b82f6', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  bottleNeck:      { width: 28, height: 14, backgroundColor: '#cbd5e1' },

  draggerContainer: { position: 'absolute', left: -20, width: 140, height: 40, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  knob:            { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center', shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6, marginRight: -8, zIndex: 11 },
  knobInner:       { width: 12, height: 12, borderRadius: 6, backgroundColor: '#bae6fd' },
  waterSurfaceLine: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.8)', borderTopRightRadius: 2, borderBottomRightRadius: 2 },

  confirmWaterBtn: { backgroundColor: '#0ea5e9', width: '100%', paddingVertical: 14, borderRadius: 16, alignItems: 'center', shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  confirmWaterBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '750' },

  // Loading overlay
  globalLoading:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  loadingText:     { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#0ea5e9' },

  // Streak recovery
  recoveryBanner:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff7ed', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 8, borderWidth: 1.5, borderColor: '#fed7aa' },
  recoveryBannerLeft:   { flexDirection: 'row', alignItems: 'center', flex: 1 },
  recoveryBannerTitle:  { fontSize: 14, fontWeight: '800', color: '#ea580c' },
  recoveryBannerSub:    { fontSize: 12, color: '#c2410c', marginTop: 2, fontWeight: '500' },
  recoveryModalTitle:   { fontSize: 20, fontWeight: '900', marginBottom: 12 },
  recoveryModalBody:    { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});