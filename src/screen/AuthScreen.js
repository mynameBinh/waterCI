import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_BASE = 'https://binhhn21-water-check-in-backend.hf.space';

export default function AuthScreen({ onLoginSuccess }) {
  const [isLogin, setIsLogin]   = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Hiệu ứng logo lơ lửng
  const floatAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -10, duration: 1200, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0,   duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [floatAnim]);

  const resetMessages = useCallback(() => { setError(''); setSuccess(''); }, []);

  const handleAuth = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin.');
      return;
    }
    setLoading(true);
    resetMessages();

    try {
      if (isLogin) {
        const res = await fetch(`${API_BASE}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Đăng nhập thất bại');
        await AsyncStorage.setItem('token', data.access_token);
        onLoginSuccess(data.access_token);
      } else {
        const res = await fetch(`${API_BASE}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Đăng ký thất bại');
        setSuccess('Đăng ký thành công! Hãy đăng nhập.');
        setIsLogin(true);
        setPassword('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isLogin, username, password, onLoginSuccess, resetMessages]);

  const handleToggleMode = useCallback(() => {
    setIsLogin(v => !v);
    resetMessages();
  }, [resetMessages]);

  return (
    <LinearGradient colors={['#E0F2FE', '#BAE6FD', '#7DD3FC']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Animated.Text style={[styles.logo, { transform: [{ translateY: floatAnim }] }]}>
                💧
              </Animated.Text>
              <Text style={styles.title}>Water Tracker</Text>
              <Text style={styles.subtitle}>{isLogin ? 'Chào mừng bạn quay lại' : 'Tạo tài khoản mới'}</Text>
            </View>

            {!!error   && <View style={styles.msgError}><Text style={styles.msgErrorText}>❌ {error}</Text></View>}
            {!!success && <View style={styles.msgSuccess}><Text style={styles.msgSuccessText}>✅ {success}</Text></View>}

            <View style={styles.field}>
              <Text style={styles.label}>Tên đăng nhập</Text>
              <TextInput
                style={styles.input}
                placeholder="Nhập username..."
                placeholderTextColor="#94a3b8"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Mật khẩu</Text>
              <TextInput
                style={styles.input}
                placeholder="Nhập mật khẩu..."
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity style={styles.submitBtnWrapper} onPress={handleAuth} disabled={loading} activeOpacity={0.8}>
              <LinearGradient colors={['#67D8F5', '#0EA5E9']} style={styles.submitBtn}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>{isLogin ? 'Đăng nhập' : 'Đăng ký'}</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toggleBtn} onPress={handleToggleMode}>
              <Text style={styles.toggleText}>
                {isLogin ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  safeArea:        { flex: 1 },
  inner:           { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card:            { width: '100%', maxWidth: 400, backgroundColor: '#ffffff', borderRadius: 24, padding: 30, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 36, elevation: 10 },
  header:          { alignItems: 'center', marginBottom: 28 },
  logo:            { fontSize: 56, marginBottom: 8 },
  title:           { fontSize: 26, fontWeight: '800', color: '#1e293b', letterSpacing: -0.5 },
  subtitle:        { fontSize: 15, color: '#64748b', marginTop: 4 },
  msgError:        { backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', marginBottom: 16 },
  msgErrorText:    { color: '#991b1b', fontSize: 13, fontWeight: '500' },
  msgSuccess:      { backgroundColor: '#dcfce7', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#86efac', marginBottom: 16 },
  msgSuccessText:  { color: '#166534', fontSize: 13, fontWeight: '500' },
  field:           { marginBottom: 20 },
  label:           { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8 },
  input:           { padding: 14, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, fontSize: 16, color: '#1e293b', backgroundColor: '#f8fafc' },
  submitBtnWrapper: { marginTop: 8, shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  submitBtn:       { padding: 16, borderRadius: 30, alignItems: 'center' },
  submitBtnText:   { color: '#fff', fontSize: 17, fontWeight: 'bold', letterSpacing: 0.5 },
  toggleBtn:       { marginTop: 24, alignItems: 'center' },
  toggleText:      { color: '#0ea5e9', fontWeight: '600', fontSize: 15 },
});
