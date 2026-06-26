import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import React, { useEffect, useState } from 'react';
import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - 32; 
const CARD_HEIGHT = 135;
const OFFSET = 15; 

export default function HeaderComponent({ currentWater, goalMl, username, streak, completedDates = [] }) {
  const { colors } = useTheme();
  
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const progressAnim = useSharedValue(0);
  const wavePhase = useSharedValue(0);

  const progressPercent = Math.min((currentWater / goalMl) * 100, 100);
  const progressText = progressPercent.toFixed(0);

  useEffect(() => {
    wavePhase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 2500, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  useEffect(() => {
    const target = Math.min(currentWater / goalMl, 1);
    progressAnim.value = withTiming(target, { duration: 800 });
  }, [currentWater, goalMl]);

  const animatedWaveProps = useAnimatedProps(() => {
    const waterY = CARD_HEIGHT - (progressAnim.value * CARD_HEIGHT);
    const amplitude = progressAnim.value > 0 && progressAnim.value < 1 ? 10 : 0; 
    
    let path = `M ${-OFFSET} ${waterY}`;
    for (let x = -OFFSET; x <= CARD_WIDTH + OFFSET; x += 6) {
      const y = waterY + Math.sin((x / CARD_WIDTH) * Math.PI * 3.5 + wavePhase.value) * amplitude;
      path += ` L ${x} ${y}`;
    }
    path += ` L ${CARD_WIDTH + OFFSET} ${waterY}`; 
    path += ` L ${CARD_WIDTH + OFFSET} ${CARD_HEIGHT + OFFSET} L ${-OFFSET} ${CARD_HEIGHT + OFFSET} Z`;
    
    return { d: path };
  });

  const getMarkedDates = () => {
    let marked = {};
    completedDates.forEach((date) => {
      marked[date] = { selected: true, selectedColor: '#ef4444', selectedTextColor: '#ffffff' };
    });
    return marked;
  };

  // 💡 Sub-component giúp tái sử dụng layout cho 2 lớp chữ (Trắng và Đen)
  const ContentLayer = ({ isWhiteMode }) => (
    <View style={styles.cardContentWrapper}>
      <View style={styles.cardLeftContent}>
        <View style={styles.statHeader}>
          <Ionicons name="water" size={18} color={isWhiteMode ? '#ffffff' : '#0ea5e9'} />
          <Text style={[styles.statTitle, { color: isWhiteMode ? 'rgba(255, 255, 255, 0.75)' : colors.textMuted }]}>Đã uống</Text>
        </View>
        <View style={styles.valueContainer}>
          <Text style={[styles.statValue, { color: isWhiteMode ? '#ffffff' : colors.text }]}>{currentWater}</Text>
          <Text style={[styles.statUnit, { color: isWhiteMode ? 'rgba(255, 255, 255, 0.75)' : colors.textMuted }]}>/ {goalMl} ml</Text>
        </View>
      </View>

      <View style={styles.cardRightContent}>
        <Text style={[styles.hugePercentText, { color: isWhiteMode ? '#ffffff' : colors.text }]}>
          {progressText}%
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.headerContainer}>
      <View style={styles.greetingRow}>
        <View>
          <Text style={[styles.greetingText, { color: colors.textMuted }]}>Xin chào,</Text>
          <Text style={[styles.usernameText, { color: colors.text }]}>{username}</Text>
        </View>
        
        <TouchableOpacity 
          style={[styles.streakHeaderBadge, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}
          onPress={() => setIsCalendarVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="flame" size={20} color="#f97316" />
          <Text style={[styles.streakHeaderNumber, { color: colors.text }]}>{streak}</Text>
          <Text style={styles.streakHeaderLabel}></Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.mainCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
        
        {/* 1. LAYER CHỮ GỐC (Nằm dưới đáy, màu tối) */}
        <ContentLayer isWhiteMode={false} />

        {/* 2. LAYER SÓNG NƯỚC */}
        <View style={styles.svgContainer} pointerEvents="none">
          <Svg width={CARD_WIDTH + OFFSET * 2} height={CARD_HEIGHT + OFFSET * 2} viewBox={`-${OFFSET} 0 ${CARD_WIDTH + OFFSET * 2} ${CARD_HEIGHT + OFFSET * 2}`}>
            <AnimatedPath fill="#0ea5e9" opacity={0.88} animatedProps={animatedWaveProps} />
          </Svg>
        </View>

        {/* 3. LAYER CHỮ TRẮNG NẰM TRONG MẶT NẠ CỦA SÓNG NƯỚC */}
        <MaskedView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          maskElement={
            <View style={styles.svgContainer}>
              <Svg width={CARD_WIDTH + OFFSET * 2} height={CARD_HEIGHT + OFFSET * 2} viewBox={`-${OFFSET} 0 ${CARD_WIDTH + OFFSET * 2} ${CARD_HEIGHT + OFFSET * 2}`}>
                {/* Vẽ mặt nạ đen đặc theo đúng quỹ đạo sóng */}
                <AnimatedPath fill="#000000" animatedProps={animatedWaveProps} />
              </Svg>
            </View>
          }
        >
          {/* Chữ trắng chỉ được phép hiện ở những nơi mà Mặt nạ sóng đi qua */}
          <ContentLayer isWhiteMode={true} />
        </MaskedView>

      </View>

      <Modal visible={isCalendarVisible} transparent={true} animationType="fade" onRequestClose={() => setIsCalendarVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarCard, { backgroundColor: colors.card }]}>
            <View style={styles.calendarHeader}>
              <View style={styles.calendarTitleContainer}>
                <Ionicons name="calendar-outline" size={22} color="#ef4444" />
                <Text style={[styles.calendarTitle, { color: colors.text }]}>Lịch Sử Hoàn Thành</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCalendarVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Calendar markedDates={getMarkedDates()} theme={{ calendarBackground: colors.card, textSectionTitleColor: colors.textMuted, dayTextColor: '#111111', todayTextColor: '#ef4444', monthTextColor: colors.text, indicatorColor: '#ef4444', textDayFontWeight: '600', textMonthFontWeight: '800', textDayHeaderFontWeight: '600', arrowColor: '#ef4444' }} />
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#ef4444' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Hoàn thành mục tiêu</Text></View>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: '#cbd5e1' }]} /><Text style={[styles.legendText, { color: colors.textMuted }]}>Ngày thường</Text></View>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: { marginBottom: 24, marginTop: 10, alignItems: 'center' },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, width: CARD_WIDTH, paddingHorizontal: 4 },
  greetingText: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  usernameText: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  
  streakHeaderBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 3 },
  streakHeaderNumber: { fontSize: 16, fontWeight: '800', marginLeft: 4 },
  streakHeaderLabel: { fontSize: 12, fontWeight: '650', color: '#f97316', marginLeft: 2, marginTop: 2 },
  
  mainCard: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 26, position: 'relative', overflow: 'hidden', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 4 },

  svgContainer: { ...StyleSheet.absoluteFillObject, top: -OFFSET, left: -OFFSET, right: -OFFSET, bottom: -OFFSET, zIndex: 0 },

  // 💡 Layout chung cho content để đè lên nhau chuẩn xác
  cardContentWrapper: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22 },
  cardLeftContent: { flex: 1, justifyContent: 'center' },
  cardRightContent: { justifyContent: 'center', alignItems: 'center' },
  
  statHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  statTitle: { fontSize: 13, fontWeight: '700', marginLeft: 5, letterSpacing: -0.1 },
  valueContainer: { flexDirection: 'row', alignItems: 'baseline' },
  statValue: { fontSize: 32, fontWeight: '800', marginRight: 4, letterSpacing: -0.5 },
  statUnit: { fontSize: 14, fontWeight: '600' },
  hugePercentText: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  calendarCard: { width: '100%', borderRadius: 28, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  calendarTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  calendarTitle: { fontSize: 18, fontWeight: '800', marginLeft: 8 },
  closeButton: { padding: 4 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12, fontWeight: '600' },
});