import { Ionicons } from '@expo/vector-icons';
import { Camera, CameraView } from 'expo-camera';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PanResponder, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
// THAY ĐỔI: Thêm useSafeAreaInsets để lấy khoảng cách tai thỏ chính xác
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderComponent from '../components/HeaderComponent';
import HistoryComponent from '../components/HistoryComponent';
import MainActionButtonComponent from '../components/MainActionButtonComponent';
import { useTheme } from '../context/ThemeContext';

const API_BASE = 'https://binhhn21-water-check-in-backend.hf.space';

// Thiết lập cách App phản hồi khi có thông báo tới (lúc app đang mở)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function DashboardScreen({ token, onLogout }) {
  const { themePreference, changeTheme, colors } = useTheme();
  const insets = useSafeAreaInsets(); // 👈 Lấy thông số phần viền an toàn hệ thống (tai thỏ & thanh vuốt)

  const [activeTab, setActiveTab]       = useState('home');
  const [currentWater, setCurrentWater] = useState(0); 
  const [goalMl, setGoalMl]             = useState(1800);
  const [username, setUsername]         = useState('Đang tải...');
  const [memberTier, setMemberTier]     = useState('Thành viên'); 
  const [streak, setStreak]             = useState(0);
  const [completedDates, setCompletedDates] = useState([]);
  const [history, setHistory]           = useState([]);
  
  // Roadmap Quà tặng
  const [gifts, setGifts]               = useState([]);
  const [selectedGiftModal, setSelectedGiftModal] = useState(null); 
  
  const [aiLoading, setAiLoading]       = useState(false);
  const [showMiniCam, setShowMiniCam]   = useState(false);
  const [flash, setFlash]               = useState('off'); 
  const cameraRef                       = useRef(null);

  const [showVolumeModal, setShowVolumeModal] = useState(false);
  const [selectedVolume, setSelectedVolumeState] = useState(250); 
  const [maxVolume, setMaxVolume]                 = useState(250); 
  const [containerType, setContainerType]         = useState('unknown'); 
  
  // Tab Thông Báo
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  
  const [showSoundModal, setShowSoundModal] = useState(false);
  const [selectedSound, setSelectedSound] = useState('Chuông ngân (Mặc định)');
  const soundOptions = ['Tiếng nước chảy', 'Ting ting', 'Tiếng chim hót', 'Chuông ngân (Mặc định)'];
  
  const [selectedTimes, setSelectedTimes] = useState(['08:00', '12:00', '15:00', '20:00']);
  const presetTimes = ['07:00', '08:00', '10:00', '12:00', '15:00', '18:00', '20:00', '22:00'];
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('');

  const selectedVolumeRef = useRef(250);
  const maxVolumeRef = useRef(250);
  const startVolumeRef = useRef(250);
  const activeHeightRef = useRef(135);

  useEffect(() => {
    if (containerType === 'mug') activeHeightRef.current = 120;
    else if (containerType === 'thermos') activeHeightRef.current = 170;
    else if (containerType === 'bottle') activeHeightRef.current = 200; 
    else activeHeightRef.current = 135; 
  }, [containerType]);

  const setSelectedVolume = (val) => {
    selectedVolumeRef.current = val;
    setSelectedVolumeState(val);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startVolumeRef.current = selectedVolumeRef.current; },
      onPanResponderMove: (evt, gestureState) => {
        const deltaVolume = -(gestureState.dy / activeHeightRef.current) * maxVolumeRef.current;
        let newVol = Math.round((startVolumeRef.current + deltaVolume) / 10) * 10;
        if (newVol > maxVolumeRef.current) newVol = maxVolumeRef.current;
        if (newVol < 10) newVol = 10;
        setSelectedVolume(newVol);
      },
    })
  ).current;

  const syncScheduledReminders = async (timesList, enabled) => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      if (!enabled || timesList.length === 0) {
        console.log("🚫 [REMINDER] Đã hủy toàn bộ lịch nhắc nhở theo giờ.");
        return;
      }

      for (const timeStr of timesList) {
        const [hourStr, minuteStr] = timeStr.split(':');
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Giờ uống nước đến rồi !!! 💧",
            body: `${timeStr} Đã điểm, vào check-in uống nước để duy trì chuỗi nào!`,
            // THAY ĐỔI: Dùng âm thanh tùy chỉnh "pouring-water" thay cho âm mặc định của hệ thống
            // iOS cần đuôi .wav, Android dùng nguyên .mp3 (kèm đuôi trong tên file)
            sound: Platform.OS === 'ios' ? 'pouring_water.wav' : 'pouring_water.mp3',
            priority: Notifications.AndroidNotificationPriority.HIGH,
            ...(Platform.OS === 'android' && { channelId: 'water-reminder' }),
          },
          trigger: {
            type: 'calendar',
            hour: hour,
            minute: minute,
            repeats: true,
          },
        });
      }
      console.log(`✅ [REMINDER] Đã đồng bộ thành công ${timesList.length} mốc giờ nhắc nhở lên hệ thống máy!`);
    } catch (error) {
      console.log("❌ [REMINDER] Lỗi cấu hình lịch hẹn giờ:", error);
    }
  };

  useEffect(() => {
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Nhận thông báo khi đang mở app:', notification);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('User bấm vào thông báo:', response);
      setActiveTab('notifications');
    });

    return () => {
      if (notificationListener) notificationListener.remove();
      if (responseListener) responseListener.remove();
    };
  }, []);

  useEffect(() => {
    if (token) {
      try {
        const payload = token.split('.')[1];
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let str = String(payload).replace(/=+$/, '');
        let output = '';
        for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) { buffer = chars.indexOf(buffer); }
        setUsername(JSON.parse(output).sub); 
      } catch (e) {}
    }

    const loadData = async () => {
      try {
        const [meRes, histRes, streakRes, giftsRes] = await Promise.all([
          fetch(`${API_BASE}/api/me`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_BASE}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_BASE}/api/streak`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_BASE}/api/gifts`, { headers: { 'Authorization': `Bearer ${token}` } })
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
            id: item.id, time: new Date(item.timestamp.endsWith('Z') ? item.timestamp : `${item.timestamp}Z`).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), volume: item.volume_ml,
          })));
          setCurrentWater(hData.reduce((sum, i) => sum + i.volume_ml, 0));
        }
        if (giftsRes.ok) {
          const gData = await giftsRes.json();
          setGifts(gData);
        }
      } catch (err) {}
    };

    if (token) loadData();
  }, [token]);

  const registerForPushNotificationsAsync = async () => {
    let pushToken;
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        Alert.alert('Chưa cấp quyền', 'Phải bật quyền thông báo thì mới nhận được lời nhắc nha!');
        return null;
      }

      try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        if (!projectId) {
          Alert.alert('Lỗi cấu hình', 'Chưa có projectId. Vui lòng chạy "eas init" trong terminal.');
          return null;
        }

        pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } catch (error) {
        console.error("Lỗi lấy Push Token:", error);
        Alert.alert('Lỗi', 'Không thể lấy được token thông báo.');
      }
    } else {
      Alert.alert('Lưu ý', 'Cần dùng thiết bị thật để nhận Push Notification');
    }

    if (Platform.OS === 'android') {
      // THAY ĐỔI: Tạo channel riêng có âm thanh tùy chỉnh "pouring-water"
      // (channel 'default' cũ không gán sound nên không đổi được âm sau khi đã tạo)
      Notifications.setNotificationChannelAsync('water-reminder', {
        name: 'Nhắc nhở uống nước',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0ea5e9',
        sound: 'pouring_water.mp3',
      });
    }
    return pushToken;
  };

  const updatePushTokenToBackend = async (pushToken) => {
    try {
      const res = await fetch(`${API_BASE}/api/users/update-push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ push_token: pushToken })
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.log("Cập nhật token lên server thất bại. Lỗi từ Backend:", errorText);
      } else {
        console.log("Cập nhật Token lên Backend thành công rực rỡ!");
      }
    } catch (e) {
      console.error("Lỗi kết nối mạng khi gửi push token:", e);
    }
  };

  const handleTogglePush = async (value) => {
    setIsPushEnabled(value);
    if (value) {
      const pToken = await registerForPushNotificationsAsync();
      if (pToken) {
        setExpoPushToken(pToken);
        console.log("Token thiết bị:", pToken);
        await updatePushTokenToBackend(pToken); 
      } else {
        setIsPushEnabled(false);
      }
      await syncScheduledReminders(selectedTimes, true);
    } else {
      setExpoPushToken('');
      await updatePushTokenToBackend(''); 
      await syncScheduledReminders([], false);
    }
  };

  const handleActivationCamera = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Quyền truy cập', 'Cần cấp quyền Camera nhé!'); return; }
    setFlash('off');
    setShowMiniCam(true); 
  };

  const handleTakePicture = async () => {
    if (cameraRef.current && !aiLoading) {
      try {
        setAiLoading(true);
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: false });
        setShowMiniCam(false); 
        submitImage(photo.uri);
      } catch (err) { setAiLoading(false); }
    }
  };

  const submitImage = async (uri) => {
    setAiLoading(true);
    try {
      const formData = new FormData(); 
      formData.append('image', { uri: uri, name: 'photo.jpg', type: 'image/jpeg' });
      const res = await fetch(`${API_BASE}/api/checkin`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }, body: formData });
      if (!res.ok) throw new Error('Không tìm thấy nước hoặc vật chứa hợp lệ');
      const data = await res.json();
      setAiLoading(false);
      
      setMaxVolume(data.max_volume || 250); maxVolumeRef.current = data.max_volume || 250; 
      setContainerType(data.container_type || 'unknown'); setSelectedVolume(data.max_volume || 250); 
      setShowVolumeModal(true);
    } catch (err) { Alert.alert('Check-in thất bại ❌', err.message); setAiLoading(false); }
  };

  const handleConfirmVolume = () => {
    setShowVolumeModal(false);
    setCurrentWater(prev => prev + selectedVolume);
    setHistory([{ id: Date.now(), time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), volume: selectedVolume }, ...history]);
    Alert.alert('Tuyệt vời!', `Check-in thành công ${selectedVolume}ml nước. 💧`);
  };

  const handleLogoutPrompt = () => {
    Alert.alert('Đăng xuất', 'Đăng xuất tài khoản này ư?', [{ text: 'Hủy', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: onLogout }]);
  };

  const getContainerLabel = () => {
    if (containerType === 'glass') return 'Ly thủy tinh';
    if (containerType === 'mug') return 'Cốc có quai cầm';
    if (containerType === 'thermos') return 'Bình giữ nhiệt';
    if (containerType === 'bottle') return 'Chai nước lọc';
    return 'Vật chứa nước';
  };

  const toggleTimeSelection = (time) => {
    let updatedTimes = [];
    if (selectedTimes.includes(time)) {
      updatedTimes = selectedTimes.filter(t => t !== time);
    } else {
      updatedTimes = [...selectedTimes, time].sort();
    }
    setSelectedTimes(updatedTimes);
    if (isPushEnabled) {
      syncScheduledReminders(updatedTimes, true);
    }
  };

  const handleAddCustomTime = () => {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (regex.test(customTimeInput)) {
      let updatedTimes = [...selectedTimes];
      if (!selectedTimes.includes(customTimeInput)) {
        updatedTimes = [...selectedTimes, customTimeInput].sort();
        setSelectedTimes(updatedTimes);
      }
      setShowCustomTimeModal(false);
      setCustomTimeInput('');
      if (isPushEnabled) {
        syncScheduledReminders(updatedTimes, true);
      }
    } else {
      Alert.alert('Lỗi định dạng', 'Vui lòng nhập đúng giờ theo chuẩn HH:MM (VD: 09:30)');
    }
  };

  let containerStyle = styles.glassShape;
  if (containerType === 'mug') containerStyle = styles.mugShape;
  if (containerType === 'thermos') containerStyle = styles.thermosShape;
  if (containerType === 'bottle') containerStyle = styles.bottleShape;

  let currentDisplayHeight = 135;
  if (containerType === 'mug') currentDisplayHeight = 120;
  if (containerType === 'thermos') currentDisplayHeight = 170;
  if (containerType === 'bottle') currentDisplayHeight = 200;

  const waterHeight = maxVolume > 0 ? (selectedVolume / maxVolume) * currentDisplayHeight : 0;

  const roadmapMilestones = React.useMemo(() => {
    const milestones = [];
    let currentM = 10;
    while (currentM <= 1000) {
      milestones.push(currentM);
      if (currentM < 100) currentM += 20;
      else if (currentM < 500) currentM += 30;
      else currentM += 40;
    }
    if (!milestones.includes(1000)) milestones.push(1000);
    return milestones;
  }, []);

  const handleMilestoneClick = (milestoneStreak) => {
    const giftObj = gifts.find(g => g.streak_required === milestoneStreak);
    if (streak >= milestoneStreak) {
      setSelectedGiftModal({ 
        type: 'unlocked', 
        streak: milestoneStreak, 
        message: giftObj ? giftObj.gift_text : 'Quà anh chưa chuẩn bị kịp, em nhắn đòi quà anh nha! 🎁' 
      });
    } else {
      setSelectedGiftModal({ 
        type: 'locked', 
        streak: milestoneStreak, 
        message: `Ráng uống nước ngoan thêm chút nữa! Đạt chuỗi ${milestoneStreak} ngày để mở quà bí mật nhe 💖` 
      });
    }
  };

  // THAY ĐỔI: Sử dụng thẻ View thường có insets để loại bỏ hoàn toàn khoảng trắng trên và dưới màn hình iPhone
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {activeTab === 'home' ? (
          <View style={styles.scrollContent}>
            <HeaderComponent currentWater={currentWater} goalMl={goalMl} username={username} streak={streak} completedDates={completedDates} />
            <View style={{ marginTop: -12, marginBottom: -4, zIndex: 10 }}>
              <MainActionButtonComponent onOpen={handleActivationCamera} disabled={aiLoading} />
            </View>
            <HistoryComponent history={history} />
          </View>
        ) : activeTab === 'gifts' ? (
          <View style={{ flex: 1, position: 'relative' }}>
            <View style={[styles.floatingStreakBadge, { top: 16 }]}>
              <Ionicons name="flame" size={20} color="#f43f5e" />
              <Text style={styles.floatingStreakText}>Streak: {streak} ngày</Text>
            </View>

            <ScrollView contentContainerStyle={styles.roadmapContent} showsVerticalScrollIndicator={false} removeClippedSubviews={Platform.OS === 'android'}>
              <View style={[styles.roadmapHeader, { marginBottom: 20 , marginTop: 70}]}>
                <Text style={styles.roadmapTitle}>Bản đồ Quà Tặng 🎀</Text>
                <Text style={styles.roadmapSub}>Dành riêng cho "Em bé của admin"</Text>
              </View>

              <View style={styles.roadmapPathContainer}>
              {roadmapMilestones.map((milestone, index) => {
                const isUnlocked = streak >= milestone;
                const isCurrentNext = milestone > streak && (index === roadmapMilestones.length - 1 || streak >= roadmapMilestones[index + 1]);
                const isLeft = index % 2 === 0;

                return (
                  <View key={milestone} style={[styles.milestoneWrapper, isLeft ? { alignItems: 'flex-start' } : { alignItems: 'flex-end' }]}>
                    {index < roadmapMilestones.length - 1 && (
                      <View style={[styles.dashedLine, isLeft ? styles.dashedLineRightToLeft : styles.dashedLineLeftToRight]} />
                    )}

                    <TouchableOpacity 
                      style={[styles.milestoneNode, isUnlocked ? styles.milestoneNodeUnlocked : (isCurrentNext ? styles.milestoneNodeNext : styles.milestoneNodeLocked)]} 
                      onPress={() => handleMilestoneClick(milestone)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.milestoneIconWrapper}>
                        <Ionicons name={isUnlocked ? "gift" : "lock-closed"} size={26} color={isUnlocked ? "#fff" : "#94a3b8"} />
                      </View>
                      <View style={styles.milestoneLabelBox}>
                        <Text style={[styles.milestoneLabelText, isUnlocked && { color: '#f43f5e' }]}>Mốc {milestone}</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            </ScrollView>
          </View>
        ) : activeTab === 'notifications' ? (
          <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
             <View style={styles.profileHeader}>
                <Ionicons name="notifications" size={50} color="#0ea5e9" style={{marginBottom: 10}} />
                <Text style={[styles.profileName, { color: colors.text }]}>Cài đặt thông báo</Text>
                <Text style={[styles.profileRole, { color: colors.textMuted }]}>Nhắc nhở uống nước mỗi ngày</Text>
            </View>

            <View style={[styles.settingsCard, { backgroundColor: colors.card, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
              <View style={{flex: 1}}>
                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>Cho phép thông báo</Text>
                <Text style={styles.sectionSubtitle}>Nhận tin nhắn nhắc nhở</Text>
              </View>
              <Switch
                trackColor={{ false: "#cbd5e1", true: "#10b981" }}
                thumbColor={"#ffffff"}
                ios_backgroundColor="#cbd5e1"
                onValueChange={handleTogglePush}
                value={isPushEnabled}
                style={{ transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] }}
              />
            </View>

            <View style={[styles.settingsCard, { backgroundColor: colors.card, opacity: isPushEnabled ? 1 : 0.5 }]} pointerEvents={isPushEnabled ? "auto" : "none"}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Âm thanh thông báo</Text>
              <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowSoundModal(true)}>
                <Text style={{color: colors.text, fontSize: 15, fontWeight: '500'}}>{selectedSound}</Text>
                <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.settingsCard, { backgroundColor: colors.card, opacity: isPushEnabled ? 1 : 0.5 }]} pointerEvents={isPushEnabled ? "auto" : "none"}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Các mốc giờ nhắc nhở</Text>
                <TouchableOpacity style={styles.addTimeBtn} onPress={() => setShowCustomTimeModal(true)}>
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.chipsContainer}>
                {presetTimes.concat(selectedTimes.filter(t => !presetTimes.includes(t))).sort().map(time => {
                  const isSelected = selectedTimes.includes(time);
                  return (
                    <TouchableOpacity 
                      key={time} 
                      style={[styles.timeChip, isSelected ? styles.timeChipActive : { backgroundColor: colors.background, borderColor: colors.border }]}
                      onPress={() => toggleTimeSelection(time)}
                    >
                      <Text style={[styles.timeChipText, isSelected ? { color: '#0ea5e9' } : { color: colors.textMuted }]}>{time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
            <View style={styles.profileHeader}>
              <View style={[styles.avatarWrapper, { borderColor: colors.card, backgroundColor: colors.background }]}>
                <Ionicons name="person" size={50} color="#0ea5e9" />
              </View>
              <Text style={[styles.profileName, { color: colors.text }]}>{username}</Text>
              <Text style={[styles.profileRole, { color: colors.textMuted }]}>{memberTier}</Text>
            </View>

            <View style={[styles.settingsCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Mục tiêu sức khỏe</Text>
              <Text style={styles.sectionSubtitle}>Dung tích nước cần uống mỗi ngày (Chỉ Admin mới có quyền điều chỉnh).</Text>
              <View style={[styles.goalCalculatedRow, { borderColor: colors.border, borderTopWidth: 0, paddingTop: 0 }]}>
                <View style={styles.profileRowLeft}>
                  <Ionicons name="water-outline" size={20} color="#10b981" style={{ marginRight: 10 }} />
                  <Text style={[styles.profileRowText, { color: colors.text }]}>Mục tiêu uống nước</Text>
                </View>
                <Text style={styles.goalCalculatedValue}>{goalMl} ml / ngày</Text>
              </View>
            </View>

            <View style={[styles.settingsCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Giao diện ứng dụng</Text>
              <View style={styles.themeRow}>
                <TouchableOpacity style={[styles.themeBtn, themePreference === 'light' ? styles.themeBtnActive : { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => changeTheme('light')}>
                  <Ionicons name="sunny" size={24} color={themePreference === 'light' ? '#0ea5e9' : colors.textMuted} />
                  <Text style={[styles.themeText, { color: themePreference === 'light' ? '#0ea5e9' : colors.textMuted }]}>Sáng</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.themeBtn, themePreference === 'dark' ? styles.themeBtnActive : { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => changeTheme('dark')}>
                  <Ionicons name="moon" size={24} color={themePreference === 'dark' ? '#0ea5e9' : colors.textMuted} />
                  <Text style={[styles.themeText, { color: themePreference === 'dark' ? '#0ea5e9' : colors.textMuted }]}>Tối</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.themeBtn, themePreference === 'system' ? styles.themeBtnActive : { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => changeTheme('system')}>
                  <Ionicons name="settings-outline" size={24} color={themePreference === 'system' ? '#0ea5e9' : colors.textMuted} />
                  <Text style={[styles.themeText, { color: themePreference === 'system' ? '#0ea5e9' : colors.textMuted }]}>Hệ thống</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogoutPrompt} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={22} color="#ef4444" />
              <Text style={styles.logoutBtnText}>Đăng xuất tài khoản</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* Modal Quà tặng */}
      <Modal visible={!!selectedGiftModal} transparent={true} animationType="fade">
        <View style={styles.modalWaterOverlay}>
          <View style={[styles.modalWaterCard, { backgroundColor: colors.card, borderColor: selectedGiftModal?.type === 'unlocked' ? '#fbcfe8' : colors.border, borderWidth: 3 }]}>
            {selectedGiftModal?.type === 'unlocked' ? (
              <Ionicons name="gift" size={60} color="#f43f5e" style={{marginBottom: 10}} />
            ) : (
              <Ionicons name="lock-closed" size={50} color="#94a3b8" style={{marginBottom: 10}} />
            )}
            <Text style={[styles.waterModalTitle, { color: selectedGiftModal?.type === 'unlocked' ? '#f43f5e' : colors.text, textAlign: 'center' }]}>
              {selectedGiftModal?.type === 'unlocked' ? 'Mở quà thành công!' : `Mốc ${selectedGiftModal?.streak} Ngày`}
            </Text>
            <Text style={[styles.waterModalSub, {fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 10}]}>
              {selectedGiftModal?.message}
            </Text>
            <TouchableOpacity style={[styles.confirmWaterBtn, { marginTop: 24, backgroundColor: selectedGiftModal?.type === 'unlocked' ? '#f43f5e' : '#64748b' }]} onPress={() => setSelectedGiftModal(null)}>
              <Text style={styles.confirmWaterBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Chọn Âm thanh */}
      <Modal visible={showSoundModal} transparent={true} animationType="fade">
        <View style={styles.modalWaterOverlay}>
           <View style={[styles.modalWaterCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.waterModalTitle, { color: colors.text, marginBottom: 16 }]}>Chọn âm thanh 🎵</Text>
              <View style={{ width: '100%', marginBottom: 20 }}>
                {soundOptions.map(sound => (
                  <TouchableOpacity 
                    key={sound} 
                    style={[styles.dropdownOption, selectedSound === sound && { backgroundColor: '#f0f9ff' }]}
                    onPress={() => { setSelectedSound(sound); setShowSoundModal(false); }}
                  >
                    <Text style={{ fontSize: 16, color: selectedSound === sound ? '#0ea5e9' : colors.text, fontWeight: selectedSound === sound ? '700' : '500' }}>{sound}</Text>
                    {selectedSound === sound && <Ionicons name="checkmark-circle" size={24} color="#0ea5e9" />}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.confirmWaterBtn, {backgroundColor: '#64748b'}]} onPress={() => setShowSoundModal(false)}>
                <Text style={styles.confirmWaterBtnText}>Đóng</Text>
              </TouchableOpacity>
           </View>
        </View>
      </Modal>

      {/* Modal Chọn Custom Time */}
      <Modal visible={showCustomTimeModal} transparent={true} animationType="fade">
        <View style={styles.modalWaterOverlay}>
           <View style={[styles.modalWaterCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.waterModalTitle, { color: colors.text, marginBottom: 10 }]}>Thêm mốc thời gian ⏰</Text>
              <Text style={[styles.sectionSubtitle, {textAlign: 'center', marginBottom: 16}]}>Nhập giờ nhắc nhở theo định dạng HH:MM</Text>
              <TextInput
                style={[styles.customTimeInput, { color: colors.text, borderColor: colors.border }]}
                placeholder="VD: 09:30"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={5}
                value={customTimeInput}
                onChangeText={text => {
                  let formatted = text.replace(/[^0-9]/g, '');
                  if(formatted.length >= 3) {
                    formatted = formatted.slice(0,2) + ':' + formatted.slice(2);
                  }
                  setCustomTimeInput(formatted);
                }}
              />
              <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                <TouchableOpacity style={[styles.confirmWaterBtn, {flex: 1, backgroundColor: '#64748b'}]} onPress={() => {setShowCustomTimeModal(false); setCustomTimeInput('')}}>
                  <Text style={styles.confirmWaterBtnText}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmWaterBtn, {flex: 1, backgroundColor: '#10b981'}]} onPress={handleAddCustomTime}>
                  <Text style={styles.confirmWaterBtnText}>Lưu</Text>
                </TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>

      {/* Mini Cam (Chụp ảnh AI) */}
      {showMiniCam && (
        <View style={styles.cameraOverlay}>
          <View style={[styles.miniCamContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.miniCamTitle, { color: colors.text }]}>Chụp ảnh để bắt đầu kiểm tra</Text>
            <View style={styles.cameraFrame}>
              <CameraView style={styles.cameraView} facing="back" flash={flash} enableTorch={flash === 'on'} ref={cameraRef} zoom={0.2} />
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setShowMiniCam(false)}><Ionicons name="close" size={22} color="#64748b" /></TouchableOpacity>
              <TouchableOpacity style={styles.shutterBtnOuter} onPress={handleTakePicture}><View style={styles.shutterBtnInner} /></TouchableOpacity>
              <TouchableOpacity style={[styles.flashCircle, flash === 'on' && styles.flashCircleActive]} onPress={() => setFlash(prev => prev === 'off' ? 'on' : 'off')}><Ionicons name={flash === 'on' ? "flash" : "flash-off"} size={20} color={flash === 'on' ? "#eab308" : "#64748b"} /></TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Modal Chọn Dung Tích Uống */}
      <Modal visible={showVolumeModal} transparent={true} animationType="fade">
        <View style={styles.modalWaterOverlay}>
          <View style={[styles.modalWaterCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.waterModalTitle, { color: colors.text }]}>AI nhận diện: {getContainerLabel()}! 🎉</Text>
            <Text style={styles.volumeDisplayValue}>{selectedVolume} <Text style={{ fontSize: 18, fontWeight: '600' }}>/ {maxVolume} ml</Text></Text>
            <View style={styles.interactiveArea}>
              <View style={styles.glassWrapper}>
                {containerType === 'thermos' && (<View style={styles.thermosTopArea}><View style={styles.thermosCap} /><View style={styles.thermosNeck} /></View>)}
                {containerType === 'bottle' && (<View style={styles.bottleTopArea}><View style={styles.bottleCap} /><View style={styles.bottleNeck} /></View>)}
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

      {/* THANH ĐIỀU HƯỚNG DƯỚI (DOCK) */}
      {/* THAY ĐỔI: Chỉnh lại bottom của dock dựa theo viền dưới thiết bị */}
      <View style={[styles.dockWrapper, { bottom: Math.max(insets.bottom, 10) }]}>
        <View style={[styles.appleDock, { backgroundColor: colors.dockBg, shadowColor: colors.dockShadow, width: memberTier === 'Em bé của admin' ? 320 : 280 }]}>
          <TouchableOpacity style={styles.dockItem} activeOpacity={0.7} onPress={() => setActiveTab('home')}>
            <Ionicons name={activeTab === 'home' ? "water" : "water-outline"} size={24} color={activeTab === 'home' ? "#0ea5e9" : colors.textMuted} />
            <Text style={[styles.dockText, activeTab === 'home' ? { color: '#0ea5e9' } : { color: colors.textMuted }]}>Check-in</Text>
          </TouchableOpacity>

          {memberTier === 'Em bé của admin' && (
            <TouchableOpacity style={styles.dockItem} activeOpacity={0.7} onPress={() => setActiveTab('gifts')}>
              <Ionicons name={activeTab === 'gifts' ? "gift" : "gift-outline"} size={24} color={activeTab === 'gifts' ? "#f43f5e" : colors.textMuted} />
              <Text style={[styles.dockText, activeTab === 'gifts' ? { color: '#f43f5e' } : { color: colors.textMuted }]}>Quà tặng</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.dockItem} activeOpacity={0.7} onPress={() => setActiveTab('notifications')}>
            <Ionicons name={activeTab === 'notifications' ? "notifications" : "notifications-outline"} size={24} color={activeTab === 'notifications' ? "#0ea5e9" : colors.textMuted} />
            <Text style={[styles.dockText, activeTab === 'notifications' ? { color: '#0ea5e9' } : { color: colors.textMuted }]}>Nhắc nhở</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dockItem} activeOpacity={0.7} onPress={() => setActiveTab('profile')}>
            <Ionicons name={activeTab === 'profile' ? "person" : "person-outline"} size={24} color={activeTab === 'profile' ? "#0ea5e9" : colors.textMuted} />
            <Text style={[styles.dockText, activeTab === 'profile' ? { color: '#0ea5e9' } : { color: colors.textMuted }]}>Tôi</Text>
          </TouchableOpacity>
        </View>
      </View>

      {aiLoading && (
        <View style={styles.globalLoading}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>AI đang phân loại thiết bị vật chứa...</Text>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// GRAPHIC STYLESHEET
// =============================================================================
const styles = StyleSheet.create({
  container: { flex: 1 }, 
  scrollContent: { paddingHorizontal: 16, paddingBottom: 125, paddingTop: 2, flex: 1 }, 
  profileContent: { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 20 },
  
  roadmapContent: { paddingHorizontal: 20, paddingBottom: 150, paddingTop: 20 },
  roadmapHeader: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  roadmapTitle: { fontSize: 28, fontWeight: '900', color: '#f43f5e', marginBottom: 6 },
  roadmapSub: { fontSize: 14, color: '#f472b6', fontWeight: '600', marginBottom: 12 },
  
  floatingStreakBadge: { position: 'absolute', right: 20, zIndex: 999, flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, alignItems: 'center', borderWidth: 2, borderColor: '#f43f5e', shadowColor: '#f43f5e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6 },
  floatingStreakText: { color: '#f43f5e', fontWeight: '900', marginLeft: 6, fontSize: 16 },
  
  roadmapPathContainer: { position: 'relative', alignItems: 'center', marginVertical: 20 },
  milestoneWrapper: { width: '100%', paddingHorizontal: 40, height: 100, justifyContent: 'center' },
  milestoneNode: { width: 70, height: 70, borderRadius: 35, borderWidth: 4, justifyContent: 'center', alignItems: 'center', zIndex: 10, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
  milestoneNodeUnlocked: { backgroundColor: '#f43f5e', borderColor: '#fbcfe8', shadowColor: '#f43f5e' },
  milestoneNodeNext: { backgroundColor: '#fff', borderColor: '#f43f5e', borderStyle: 'dashed' },
  milestoneNodeLocked: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  
  milestoneLabelBox: { position: 'absolute', bottom: -25, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.1, shadowRadius: 4 },
  milestoneLabelText: { fontSize: 12, fontWeight: '800', color: '#94a3b8' },
  
  dashedLine: { position: 'absolute', top: '100%', height: 40, width: 140, borderLeftWidth: 4, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#fbcfe8', borderStyle: 'dashed', zIndex: 1 },
  dashedLineLeftToRight: { left: 75, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, borderTopWidth: 0 },
  dashedLineRightToLeft: { right: 75, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, borderTopWidth: 0, borderLeftWidth: 4, borderRightWidth: 0 },

  profileHeader: { alignItems: 'center', marginBottom: 32, marginTop: 20 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 4, shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  profileName: { fontSize: 24, fontWeight: '800' },
  profileRole: { fontSize: 14, marginTop: 4, fontWeight: '500' },
  settingsCard: { borderRadius: 20, padding: 20, marginBottom: 24, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  sectionSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 16, lineHeight: 16 },
  
  dropdownSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(148, 163, 184, 0.1)' },
  dropdownOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  timeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  timeChipActive: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  timeChipText: { fontWeight: '700', fontSize: 14 },
  addTimeBtn: { backgroundColor: '#0ea5e9', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  customTimeInput: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, textAlign: 'center', fontWeight: '700', marginBottom: 24, width: '100%' },

  profileRowLeft: { flexDirection: 'row', alignItems: 'center' },
  profileRowText: { fontSize: 14, fontWeight: '600' },
  goalCalculatedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 },
  goalCalculatedValue: { color: '#10b981', fontSize: 15, fontWeight: '800' },

  themeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  themeBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, marginHorizontal: 4, borderWidth: 1 },
  themeBtnActive: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  themeText: { marginTop: 8, fontSize: 13, fontWeight: '600' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2', paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#fecaca' },
  logoutBtnText: { marginLeft: 8, fontSize: 16, fontWeight: '700', color: '#ef4444' },

  cameraOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  miniCamContainer: { borderRadius: 32, padding: 24, width: '85%', maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 30, elevation: 15 },
  miniCamTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, letterSpacing: -0.3 },
  cameraFrame: { width: 280, aspectRatio: 3 / 4, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  cameraView: { flex: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 24, paddingHorizontal: 8 },
  closeCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  shutterBtnOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#0ea5e9', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  shutterBtnInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#0ea5e9' },
  flashCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  flashCircleActive: { backgroundColor: '#fef9c3', borderWidth: 1, borderColor: '#fef08a' },
  globalLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#0ea5e9' },
  dockWrapper: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  appleDock: { flexDirection: 'row', height: 62, borderRadius: 31, justifyContent: 'space-around', alignItems: 'center', marginBottom: -10 , paddingHorizontal: 8, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8 },
  dockItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  dockText: { fontSize: 11, marginTop: 3, fontWeight: '700' },

  modalWaterOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center' },
  modalWaterCard: { width: '90%', maxWidth: 350, borderRadius: 32, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },
  waterModalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },

  volumeDisplayValue: { fontSize: 32, fontWeight: '900', color: '#0ea5e9', letterSpacing: -1, marginBottom: 16 },
  interactiveArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 220, marginBottom: 20 },
  glassWrapper: { position: 'relative', marginHorizontal: 16, justifyContent: 'flex-end' },
  glassOutline: { overflow: 'hidden', justifyContent: 'flex-end', zIndex: 2 },
  
  glassShape: { width: 80, height: 135, borderBottomWidth: 5, borderLeftWidth: 4, borderRightWidth: 4, borderColor: '#0ea5e9', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  mugShape: { width: 110, height: 120, borderBottomWidth: 6, borderLeftWidth: 5, borderRightWidth: 5, borderColor: '#0ea5e9', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  thermosShape: { width: 95, height: 170, borderWidth: 6, borderColor: '#475569', borderRadius: 16 },
  bottleShape: { width: 70, height: 200, borderWidth: 4, borderColor: '#94a3b8', borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 },

  waterFill: { width: '100%', backgroundColor: '#0ea5e9' },
  glassIconOverlay: { position: 'absolute', bottom: 12, alignSelf: 'center' },
  mugHandle: { position: 'absolute', right: -25, top: 20, width: 45, height: 70, borderWidth: 6, borderColor: '#0ea5e9', borderLeftWidth: 0, borderTopRightRadius: 25, borderBottomRightRadius: 25, zIndex: 1 },
  thermosTopArea: { position: 'absolute', top: -32, alignSelf: 'center', alignItems: 'center', zIndex: 3 },
  thermosCap: { width: 64, height: 22, backgroundColor: '#334155', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  thermosNeck: { width: 80, height: 10, backgroundColor: '#475569', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  bottleTopArea: { position: 'absolute', top: -28, alignSelf: 'center', alignItems: 'center', zIndex: 3 },
  bottleCap: { width: 26, height: 14, backgroundColor: '#3b82f6', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  bottleNeck: { width: 28, height: 14, backgroundColor: '#cbd5e1' },

  draggerContainer: { position: 'absolute', left: -20, width: 140, height: 40, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  knob: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center', shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 6, marginRight: -8, zIndex: 11 },
  knobInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#bae6fd' },
  waterSurfaceLine: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.8)', borderTopRightRadius: 2, borderBottomRightRadius: 2 },

  confirmWaterBtn: { backgroundColor: '#0ea5e9', width: '100%', paddingVertical: 14, borderRadius: 16, alignItems: 'center', shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  confirmWaterBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '750' }
});