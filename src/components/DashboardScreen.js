import { Ionicons } from '@expo/vector-icons'; // Dùng thư viện icon xịn
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import HeaderComponent from '../components/HeaderComponent';
import HistoryComponent from '../components/HistoryComponent';
import MainActionButtonComponent from '../components/MainActionButtonComponent';

export default function DashboardScreen({ token, onLogout }) {
  const [currentWater, setCurrentWater] = useState(750);
  const [goalMl, setGoalMl]             = useState(2000);
  const [username, setUsername]         = useState('Sếp Tổng');
  const [history, setHistory]           = useState([
    { id: '1', time: '08:15', volume: 250 },
    { id: '2', time: '10:30', volume: 500 }
  ]);

  // Hàm xử lý khi bấm vào tab "Tôi"
  const handleProfileClick = () => {
    Alert.alert(
      "Tài khoản của tôi",
      "Sếp có muốn đăng xuất khỏi ứng dụng không?",
      [
        { text: "Hủy", style: "cancel" },
        { text: "Đăng xuất", onPress: onLogout, style: "destructive" } // Bấm Đăng xuất sẽ gọi hàm onLogout
      ]
    );
  };

  return (
    <View style={styles.container}>
      
      {/* 
        Dùng SafeAreaView ở đây để phần Header tự động né 
        "Tai thỏ" hoặc "Dynamic Island" trên iPhone 
      */}
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* HeaderComponent nay đẩy lên trên cùng */}
          <HeaderComponent currentWater={currentWater} goalMl={goalMl} username={username} streak={6} />
          
          <MainActionButtonComponent onOpen={() => alert('Mở camera chụp ảnh')} disabled={false} />
          
          <HistoryComponent history={history} />
        </ScrollView>
      </SafeAreaView>

      {/* Dock Bar (Bottom Navigation) thay thế cho Top-bar */}
      <SafeAreaView edges={['bottom']} style={styles.dockBar}>
        <View style={styles.dockContainer}>
          
          {/* Nút Trang chủ (Sáng màu - Trạng thái đang Active) */}
          <TouchableOpacity style={styles.dockItem} activeOpacity={0.7}>
            <Ionicons name="home" size={24} color="#0ea5e9" />
            <Text style={[styles.dockText, styles.dockTextActive]}>Trang chủ</Text>
          </TouchableOpacity>

          {/* Nút Tôi (Tối màu - Gọi chức năng Đăng xuất) */}
          <TouchableOpacity style={styles.dockItem} activeOpacity={0.7} onPress={handleProfileClick}>
            <Ionicons name="person-outline" size={24} color="#94a3b8" />
            <Text style={styles.dockText}>Tôi</Text>
          </TouchableOpacity>
          
        </View>
      </SafeAreaView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  // paddingBottom: 100 để danh sách lịch sử khi cuộn xuống dưới cùng không bị Dock Bar đè lên
  scrollContent: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 10 }, 
  
  /* --- GIAO DIỆN DOCK BAR CHUẨN IOS --- */
  dockBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 10,
  },
  dockContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 60,
    paddingTop: 8,
  },
  dockItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  dockText: {
    fontSize: 12,
    marginTop: 4,
    color: '#94a3b8',
    fontWeight: '600',
  },
  dockTextActive: {
    color: '#0ea5e9', // Màu xanh lam của app
  }
});