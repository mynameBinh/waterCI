import { Ionicons } from '@expo/vector-icons';
import { Camera } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import HeaderComponent from '../components/HeaderComponent';
import HistoryComponent from '../components/HistoryComponent';
import MainActionButtonComponent from '../components/MainActionButtonComponent';
import { useTheme } from '../context/ThemeContext';

const API_BASE = 'https://binhhn21-water-check-in-backend.hf.space';
const CHECKIN_ML = 250;

export default function DashboardScreen({ token, onLogout }) {
  const { themePreference, changeTheme, colors } = useTheme();

  const [activeTab, setActiveTab]       = useState('home');
  const [currentWater, setCurrentWater] = useState(0); 
  const [goalMl, setGoalMl]             = useState(2000);
  const [username, setUsername]         = useState('Đang tải...');
  
  // 👇 State hứng Danh hiệu (Tier) từ Backend
  const [memberTier, setMemberTier]     = useState('Thành viên'); 
  
  const [streak, setStreak]             = useState(0);
  const [history, setHistory]           = useState([]);
  const [completedDates, setCompletedDates] = useState([]);
  
  const [aiLoading, setAiLoading]       = useState(false);
  const [showMiniCam, setShowMiniCam]   = useState(false);
  const cameraRef                       = useRef(null);

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
        const [meRes, histRes, streakRes] = await Promise.all([
          fetch(`${API_BASE}/api/me`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_BASE}/api/history`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${API_BASE}/api/streak`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (meRes.ok) { 
          const me = await meRes.json(); 
          setGoalMl(me.daily_goal); 
          // 👇 Gắn dữ liệu tier từ Backend trả về vào State
          setMemberTier(me.tier || 'Thành viên'); 
        }
        if (streakRes.ok) { const st = await streakRes.json(); setStreak(st.streak); }
        if (histRes.ok) {
          const hData = await histRes.json();
          setHistory(hData.map(item => {
            const rawTimestamp = item.timestamp || item.created_at || item.date || '';
            const normalizedTime = rawTimestamp ? new Date(rawTimestamp.endsWith('Z') ? rawTimestamp : `${rawTimestamp}Z`) : null;
            return {
              id: item.id,
              time: normalizedTime ? normalizedTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—',
              volume: item.volume_ml,
            };
          }));
          setCurrentWater(hData.reduce((sum, i) => sum + i.volume_ml, 0));

          const dates = Array.from(new Set(
            hData
              .map((item) => {
                const raw = item.timestamp || item.created_at || item.date || '';
                const datePart = raw.slice(0, 10);
                return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
              })
              .filter(Boolean)
          ));
          setCompletedDates(dates);
        }
      } catch (err) {}
    };

    if (token) loadData();
  }, [token]);

  const handleActivationCamera = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Quyền truy cập', 'Sếp cần cấp quyền Camera nhé!'); return; }
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
      const formData = new FormData(); formData.append('image', { uri: uri, name: 'photo.jpg', type: 'image/jpeg' });
      const res = await fetch(`${API_BASE}/api/checkin`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }, body: formData });
      if (!res.ok) throw new Error('Không tìm thấy nước hoặc không phải nước');
      setCurrentWater(prev => prev + CHECKIN_ML);
      setHistory([{ id: Date.now(), time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), volume: CHECKIN_ML }, ...history]);
      Alert.alert('Tuyệt vời!', 'Sếp đã check-in thành công 250ml nước. 💧');
    } catch (err) { Alert.alert('Check-in thất bại ❌', err.message); } finally { setAiLoading(false); }
  };

  const handleLogoutPrompt = () => {
    Alert.alert("Đăng xuất", "Xác nhận đăng xuất", [{ text: "Hủy", style: "cancel" }, { text: "Đăng xuất", onPress: onLogout, style: "destructive" }]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {activeTab === 'home' ? (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <HeaderComponent currentWater={currentWater} goalMl={goalMl} username={username} streak={streak} completedDates={completedDates} />
            <MainActionButtonComponent onOpen={handleActivationCamera} disabled={aiLoading} />
            <HistoryComponent history={history} />
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
            <View style={styles.profileHeader}>
              <View style={[styles.avatarWrapper, { borderColor: colors.card, backgroundColor: colors.background }]}>
                <Ionicons name="person" size={50} color="#0ea5e9" />
              </View>
              <Text style={[styles.profileName, { color: colors.text }]}>{username}</Text>
              
              {/* 👇 Hiển thị biến chức danh (Tier) từ Backend */}
              <Text style={[styles.profileRole, { color: colors.textMuted }]}>{memberTier}</Text>
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
      </SafeAreaView>

      {/* MINI CAMERA OVERLAY */}
      {showMiniCam && (
        <View style={styles.cameraOverlay}>
          <View style={[styles.miniCamContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.miniCamTitle, { color: colors.text }]}>Chụp ảnh để bắt đầu kiểm tra</Text>
            {/* zoom={0} để mở góc rộng chuẩn 1x, không bị méo hình */}
            <View style={styles.cameraFrame}><Camera style={styles.cameraView} type={Camera.Constants.Type.back} ref={cameraRef} zoom={0} /></View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.closeCircle} onPress={() => setShowMiniCam(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.shutterBtnOuter} onPress={handleTakePicture}><View style={styles.shutterBtnInner} /></TouchableOpacity>
              <View style={{ width: 44 }} /> 
            </View>
          </View>
        </View>
      )}

      {/* APPLE FLOATING DOCK */}
      <View style={styles.dockWrapper}>
        <View style={[styles.appleDock, { backgroundColor: colors.dockBg, shadowColor: colors.dockShadow }]}>
          <TouchableOpacity style={styles.dockItem} activeOpacity={0.7} onPress={() => setActiveTab('home')}>
            <Ionicons name={activeTab === 'home' ? "water" : "water-outline"} size={24} color={activeTab === 'home' ? "#0ea5e9" : colors.textMuted} />
            <Text style={[styles.dockText, activeTab === 'home' ? { color: '#0ea5e9' } : { color: colors.textMuted }]}>Check-in</Text>
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
          <Text style={styles.loadingText}>AI đang phân tích ly nước...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, 
  scrollContent: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 10 }, 
  profileContent: { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 20 },
  profileHeader: { alignItems: 'center', marginBottom: 32, marginTop: 20 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 4, shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  profileName: { fontSize: 24, fontWeight: '800' },
  profileRole: { fontSize: 14, marginTop: 4, fontWeight: '500' },
  settingsCard: { borderRadius: 20, padding: 20, marginBottom: 24, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  themeBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, marginHorizontal: 4, borderWidth: 1 },
  themeBtnActive: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  themeText: { marginTop: 8, fontSize: 13, fontWeight: '600' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2', paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#fecaca' },
  logoutBtnText: { marginLeft: 8, fontSize: 16, fontWeight: '700', color: '#ef4444' },
  cameraOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  miniCamContainer: { borderRadius: 32, padding: 24, width: '85%', maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 30, elevation: 15 },
  miniCamTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, letterSpacing: -0.3 },
  cameraFrame: { width: 260, height: 260, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  cameraView: { flex: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 20, paddingHorizontal: 10 },
  closeCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  shutterBtnOuter: { width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#0ea5e9', justifyContent: 'center', alignItems: 'center', marginRight: 44 },
  shutterBtnInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#0ea5e9' },
  globalLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#0ea5e9' },
  dockWrapper: { position: 'absolute', bottom: Platform.OS === 'ios' ? 16 : 10, left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  appleDock: { flexDirection: 'row', width: 230, height: 62, borderRadius: 31, justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 8, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8 },
  dockItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  dockText: { fontSize: 11, marginTop: 3, fontWeight: '700' }
});