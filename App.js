import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import AuthScreen from './src/screen/AuthScreen';
import DashboardScreen from './src/screen/DashboardScreen';
// 👇 Import bộ não Theme
import { ThemeProvider } from './src/context/ThemeContext';

export default function App() {
  const [token, setToken]       = useState(null);
  const [role, setRole]         = useState(null);
  const [isReady, setIsReady]   = useState(false);

  const checkTokenRole = (userToken) => {
    try {
      const payload = userToken.split('.')[1];
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let str = String(payload).replace(/=+$/, '');
      let output = '';
      for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
      }
      const decoded = JSON.parse(output);
      setRole(decoded.role); 
    } catch (e) { handleLogout(); }
  };

  useEffect(() => {
    const loadStorageToken = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('token');
        if (savedToken) { setToken(savedToken); checkTokenRole(savedToken); }
      } catch (e) {} finally { setIsReady(true); }
    };
    loadStorageToken();
  }, []);

  const handleLoginSuccess = (newToken) => { setToken(newToken); checkTokenRole(newToken); };
  const handleLogout = async () => { await AsyncStorage.removeItem('token'); setToken(null); setRole(null); };

  return (
    // 👇 Bọc ThemeProvider ôm trọn toàn bộ ứng dụng
    <ThemeProvider>
      <SafeAreaProvider>
        {!isReady ? (
          <View style={styles.loadingCenter}><ActivityIndicator size="large" color="#0ea5e9" /></View>
        ) : !token ? (
          <AuthScreen onLoginSuccess={handleLoginSuccess} />
        ) : role === 'admin' ? (
          <SafeAreaView style={styles.loadingCenter}>
            <Text style={{ fontSize: 60, marginBottom: 20 }}>👑</Text>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1e293b', textAlign: 'center' }}>Khu vực quản trị</Text>
            <TouchableOpacity onPress={handleLogout} style={{ marginTop: 30, padding: 12, backgroundColor: '#f1f5f9', borderRadius: 8 }}>
              <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>Đăng xuất</Text>
            </TouchableOpacity>
          </SafeAreaView>
        ) : (
          <DashboardScreen token={token} onLogout={handleLogout} />
        )}
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }
});