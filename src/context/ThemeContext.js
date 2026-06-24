import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

export const ThemeContext = createContext();

// Khai báo mã màu cho Sáng / Tối
export const lightColors = {
  background: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  textMuted: '#64748b',
  border: '#f1f5f9',
  dockBg: 'rgba(255, 255, 255, 0.96)',
  dockShadow: '#0f172a'
};

export const darkColors = {
  background: '#0f172a',
  card: '#1e293b',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  border: '#334155',
  dockBg: 'rgba(30, 41, 59, 0.96)',
  dockShadow: '#000000'
};

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme(); // Tự động nghe lén theme của điện thoại
  const [themePreference, setThemePreference] = useState('system');
  const [isReady, setIsReady] = useState(false);

  // Vừa mở app là móc trong kho ra xem trước đó sếp chọn theme gì
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('themePreference');
        if (savedTheme) setThemePreference(savedTheme);
      } catch (e) {} finally {
        setIsReady(true);
      }
    };
    loadTheme();
  }, []);

  // Hàm lưu theme sếp vừa bấm
  const changeTheme = async (newTheme) => {
    setThemePreference(newTheme);
    await AsyncStorage.setItem('themePreference', newTheme);
  };

  // Tính toán xem cuối cùng là xài màu Sáng hay Tối
  const activeTheme = themePreference === 'system' ? (systemColorScheme || 'light') : themePreference;
  const colors = activeTheme === 'dark' ? darkColors : lightColors;

  if (!isReady) return null;

  return (
    <ThemeContext.Provider value={{ themePreference, changeTheme, activeTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook xài nhanh cho các màn hình
export const useTheme = () => useContext(ThemeContext);