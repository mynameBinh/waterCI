import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// iOS giữ nguyên 148, Android thu nhỏ xuống 106
const BTN_SIZE         = Platform.OS === 'android' ? 130 : 148;
const ICON_SIZE        = Platform.OS === 'android' ? 52  : 64;
const MARGIN_VERTICAL  = Platform.OS === 'android' ? 12  : 35;
const MARGIN_TOP_LABEL = Platform.OS === 'android' ? 10  : 20;
const LABEL_SIZE       = Platform.OS === 'android' ? 12  : 15;

// Tai thỏ (dài, hẹp, đứng thẳng, đặt gần nhau ở giữa đỉnh nút)
const EAR_WIDTH       = BTN_SIZE * 0.24;
const EAR_HEIGHT      = BTN_SIZE * 0.62;
const EAR_INNER_WIDTH  = EAR_WIDTH * 0.5;
const EAR_INNER_HEIGHT = EAR_HEIGHT * 0.62;

const MainActionButtonComponent = memo(function MainActionButtonComponent({ onOpen, disabled }) {
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (disabled) return;

    pulseAnim.setValue(1);
    opacityAnim.setValue(0.6);

    const animation = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseAnim,   { toValue: 1.6, duration: 2000, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0,   duration: 2000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [disabled, pulseAnim, opacityAnim]);

  return (
    <View style={[styles.wrapper, { marginVertical: MARGIN_VERTICAL }]}>
      <View style={[styles.btnContainer, { width: BTN_SIZE, height: BTN_SIZE }]}>
        {!disabled && (
          <Animated.View
            style={[
              styles.pulseRing,
              { width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2 },
              { transform: [{ scale: pulseAnim }], opacity: opacityAnim },
            ]}
          />
        )}

        {/* ── Tai thỏ trái ── */}
        <LinearGradient
          colors={disabled ? ['#cbd5e1', '#94a3b8'] : ['#67D8F5', '#0EA5E9']}
          style={[
            styles.ear,
            styles.earLeft,
            {
              width: EAR_WIDTH, height: EAR_HEIGHT, borderRadius: EAR_WIDTH,
              top: -EAR_HEIGHT * 0.50, left: BTN_SIZE * 0.24,
            },
          ]}
        />
        <View
          style={[
            styles.earInner,
            styles.earLeft,
            {
              width: EAR_INNER_WIDTH, height: EAR_INNER_HEIGHT, borderRadius: EAR_INNER_WIDTH,
              top: -EAR_HEIGHT * 0.33, left: BTN_SIZE * 0.24 + (EAR_WIDTH - EAR_INNER_WIDTH) / 2,
              backgroundColor: disabled ? '#e2e8f0' : '#fae8f0',
            },
          ]}
        />

        {/* ── Tai thỏ phải ── */}
        <LinearGradient
          colors={disabled ? ['#cbd5e1', '#94a3b8'] : ['#67D8F5', '#0EA5E9']}
          style={[
            styles.ear,
            styles.earRight,
            {
              width: EAR_WIDTH, height: EAR_HEIGHT, borderRadius: EAR_WIDTH,
              top: -EAR_HEIGHT * 0.50, right: BTN_SIZE * 0.24,
            },
          ]}
        />
        <View
          style={[
            styles.earInner,
            styles.earRight,
            {
              width: EAR_INNER_WIDTH, height: EAR_INNER_HEIGHT, borderRadius: EAR_INNER_WIDTH,
              top: -EAR_HEIGHT * 0.33, right: BTN_SIZE * 0.24 + (EAR_WIDTH - EAR_INNER_WIDTH) / 2,
              backgroundColor: disabled ? '#e2e8f0' : '#fae8f0',
            },
          ]}
        />

        <TouchableOpacity activeOpacity={1} onPress={onOpen} disabled={disabled} style={styles.btnShadow}>
          <LinearGradient
            colors={disabled ? ['#cbd5e1', '#94a3b8'] : ['#67D8F5', '#0EA5E9']}
            style={[styles.button, { width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2 }]}
          >
            <Image
              source={require('../../assets/camera.png')}
              style={[styles.iconImage, { width: ICON_SIZE, height: ICON_SIZE }, disabled && styles.iconImageDisabled]}
              resizeMode="contain"
            />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { marginTop: MARGIN_TOP_LABEL, fontSize: LABEL_SIZE }, disabled && styles.labelDisabled]}>
        {disabled ? 'ĐANG PHÂN TÍCH AI...' : 'CHỤP ẢNH UỐNG NƯỚC'}
      </Text>
    </View>
  );
});

export default MainActionButtonComponent;

const styles = StyleSheet.create({
  wrapper:           { alignItems: 'center' },
  btnContainer:      { justifyContent: 'center', alignItems: 'center' },
  pulseRing:         { position: 'absolute', borderWidth: 4, borderColor: '#38BDF8' },

  ear:      { position: 'absolute', borderWidth: 4, borderColor: '#e0f2fe', zIndex: 1 },
  earInner: { position: 'absolute', zIndex: 2 },
  earLeft:  { transform: [{ rotate: '-10deg' }] },
  earRight: { transform: [{ rotate: '10deg' }] },

  btnShadow:         { zIndex: 3, shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  button:            { justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#e0f2fe' },
  iconImage:         { tintColor: '#ffffff' },
  iconImageDisabled: { tintColor: '#f1f5f9' },
  label:             { fontWeight: '800', color: '#0ea5e9', letterSpacing: 0.5 },
  labelDisabled:     { color: '#94a3b8' },
});