import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function MainActionButtonComponent({ onOpen, disabled }) {
  // Tạo hiệu ứng sóng lan tỏa (Pulse effect)[cite: 5]
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    let animation;
    
    // Nếu không bị disabled (App đang ở trạng thái bình thường) thì kích hoạt sóng chạy
    if (!disabled) {
      // Khởi tạo lại giá trị gốc để sóng lan tỏa mượt mà không bị khựng
      pulseAnim.setValue(1);
      opacityAnim.setValue(0.6);

      animation = Animated.loop(
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.6, duration: 2000, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0, duration: 2000, useNativeDriver: true })
        ])
      );
      animation.start();
    }

    // Hàm dọn dẹp: Khi nút bị disabled hoặc component bị tắt, chủ động dừng animation lại
    return () => {
      if (animation) animation.stop();
    };
  }, [disabled, pulseAnim, opacityAnim]); // 👈 Thêm biến "disabled" vào đây để ép buộc animation khởi động lại khi chụp xong

  return (
    <View style={styles.wrapper}>
      <View style={styles.btnContainer}>
        {/* Vòng sóng tỏa ra[cite: 5] */}
        {!disabled && (
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }], opacity: opacityAnim }]} />
        )}
        
        <TouchableOpacity activeOpacity={0.8} onPress={onOpen} disabled={disabled} style={styles.btnShadow}>
          <LinearGradient 
            colors={disabled ? ['#cbd5e1', '#94a3b8'] : ['#67D8F5', '#0EA5E9']} 
            style={styles.button}
          >
            <Image 
              source={require('../../assets/camera.png')} 
              style={[styles.iconImage, disabled && styles.iconImageDisabled]} 
              resizeMode="contain"
            />
          </LinearGradient>
        </TouchableOpacity>
      </View>
      
      <Text style={[styles.label, disabled && styles.labelDisabled]}>
        {disabled ? 'ĐANG PHÂN TÍCH AI...' : 'CHỤP ẢNH UỐNG NƯỚC'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', marginVertical: 35 },
  btnContainer: { width: 148, height: 148, justifyContent: 'center', alignItems: 'center' },
  pulseRing: {
    position: 'absolute', width: 148, height: 148, borderRadius: 74,
    borderWidth: 4, borderColor: '#38BDF8'
  },
  btnShadow: {
    shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 12
  },
  button: { width: 148, height: 148, borderRadius: 74, justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#e0f2fe' },
  iconImage: { width: 64, height: 64, tintColor: '#ffffff' },
  iconImageDisabled: { tintColor: '#f1f5f9' },
  label: { marginTop: 20, fontSize: 15, fontWeight: '800', color: '#0ea5e9', letterSpacing: 0.5 },
  labelDisabled: { color: '#94a3b8' }
});