import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// Thư viện lịch hiển thị chuỗi ngày hoàn thành
import { Calendar } from 'react-native-calendars';
import Animated, {
    Easing,
    useAnimatedProps,
    useSharedValue,
    withRepeat,
    withTiming
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
// Bộ não Theme của hệ thống
import { useTheme } from '../context/ThemeContext';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Lấy độ rộng thực tế của màn hình thiết bị
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - 32; 
const CARD_HEIGHT = 135;

// Hằng số đệm giúp sóng tràn khít ra ngoài viền thẻ, chống răng cưa
const OFFSET = 15; 

// Dữ liệu ngày mẫu để kiểm tra lịch (định dạng YYYY-MM-DD)
const sampleCompletedDates = ['2026-06-21', '2026-06-22', '2026-06-24'];

export default function HeaderComponent({ currentWater, goalMl, username, streak, completedDates = sampleCompletedDates }) {
  const { colors } = useTheme();
  
  // State quản lý việc đóng/mở Dashboard Lịch Popup
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);

  // Các giá trị tạo hiệu ứng sóng nhấp nhô cho nền
  const progressAnim = useSharedValue(0);
  const wavePhase = useSharedValue(0);

  const progressPercent = Math.min((currentWater / goalMl) * 100, 100);
  const progressText = progressPercent.toFixed(0);

  useEffect(() => {
    // Sóng di chuyển ngang vô hạn cuộn trào siêu tốc
    wavePhase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 2500, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  useEffect(() => {
    // Di chuyển mực nước lên xuống mượt mà theo tiến độ uống nước
    const target = Math.min(currentWater / goalMl, 1);
    progressAnim.value = withTiming(target, { duration: 800 });
  }, [currentWater, goalMl]);

  // Thuật toán vẽ ngọn sóng hình sin tràn viền hoàn toàn tốc độ cao
  const animatedWaveProps = useAnimatedProps(() => {
    const waterY = CARD_HEIGHT - (progressAnim.value * CARD_HEIGHT);
    const amplitude = progressAnim.value > 0 && progressAnim.value < 1 ? 10 : 0; 
    
    let path = `M ${-OFFSET} ${waterY}`;
    
    // Vòng lặp vẽ tọa độ gợn sóng với bước nhảy mịn x += 6 và tần suất 5.5
    for (let x = -OFFSET; x <= CARD_WIDTH + OFFSET; x += 6) {
      const y = waterY + Math.sin((x / CARD_WIDTH) * Math.PI * 3.5 + wavePhase.value) * amplitude;
      path += ` L ${x} ${y}`;
    }
    
    path += ` L ${CARD_WIDTH + OFFSET} ${waterY}`; 
    path += ` L ${CARD_WIDTH + OFFSET} ${CARD_HEIGHT + OFFSET} L ${-OFFSET} ${CARD_HEIGHT + OFFSET} Z`;
    
    return { d: path };
  });

  // Hàm format dữ liệu sang dạng Object để thư viện Calendar tô màu Đỏ/Đen
  const getMarkedDates = () => {
    let marked = {};
    completedDates.forEach((date) => {
      if (!date) return;
      marked[date] = {
        marked: true,
        selected: true,
        selectedColor: '#ef4444', // Ngày hoàn thành: Đỏ rực
        selectedTextColor: '#ffffff',
      };
    });
    return marked;
  };

  const isWaterHigh = progressPercent > 45;
  const dynamicTextColor = isWaterHigh ? '#ffffff' : colors.text;
  const dynamicMutedColor = isWaterHigh ? 'rgba(255, 255, 255, 0.75)' : colors.textMuted;

  return (
    <View style={styles.headerContainer}>
      {/* 1. Phần lời chào bên trên kèm Nút Streak tạo điểm nhấn */}
      <View style={styles.greetingRow}>
        <View>
          <Text style={[styles.greetingText, { color: colors.textMuted }]}>Xin chào,</Text>
          <Text style={[styles.usernameText, { color: colors.text }]}>{username} 👋</Text>
        </View>
        
        {/* Nút bấm Streak để kích hoạt hiển thị Dashboard Lịch */}
        <TouchableOpacity 
          style={[styles.streakHeaderBadge, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}
          onPress={() => setIsCalendarVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="flame" size={20} color="#f97316" />
          <Text style={[styles.streakHeaderNumber, { color: colors.text }]}>{streak}</Text>
          <Text style={styles.streakHeaderLabel}>ngày</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Thẻ chính Full Width tích hợp sóng nước nền cuộn siêu tốc */}
      <View style={[styles.mainCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
        
        {/* Lớp chứa SVG mở rộng kích thước bao phủ khít viền */}
        <View style={styles.svgContainer}>
          <Svg width={CARD_WIDTH + OFFSET * 2} height={CARD_HEIGHT + OFFSET * 2} viewBox={`-${OFFSET} 0 ${CARD_WIDTH + OFFSET * 2} ${CARD_HEIGHT + OFFSET * 2}`}>
            <AnimatedPath fill="#0ea5e9" opacity={0.88} animatedProps={animatedWaveProps} />
          </Svg>
        </View>

        {/* NỘI DUNG CHÍNH BÊN TRÁI: Thống kê ml nước */}
        <View style={styles.cardLeftContent}>
          <View style={styles.statHeader}>
            <Ionicons name="water" size={18} color={isWaterHigh ? '#fff' : '#0ea5e9'} />
            <Text style={[styles.statTitle, { color: dynamicMutedColor }]}>Đã uống</Text>
          </View>
          <View style={styles.valueContainer}>
            <Text style={[styles.statValue, { color: dynamicTextColor }]}>{currentWater}</Text>
            <Text style={[styles.statUnit, { color: dynamicMutedColor }]}>/ {goalMl} ml</Text>
          </View>
        </View>

        {/* NỘI DUNG CHÍNH BÊN PHẢI: Số phần trăm lớn hòa vào làn sóng */}
        <View style={styles.cardRightContent}>
          <Text style={[styles.hugePercentText, { color: dynamicTextColor }]}>
            {progressText}%
          </Text>
        </View>
      </View>

      {/* 3. POPUP MODAL: Dashboard Lịch Sử Chuỗi Ngày Hoàn Thành */}
      <Modal
        visible={isCalendarVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCalendarVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarCard, { backgroundColor: colors.card }]}>
            
            {/* Header của Popup lịch */}
            <View style={styles.calendarHeader}>
              <View style={styles.calendarTitleContainer}>
                <Ionicons name="calendar-outline" size={22} color="#ef4444" />
                <Text style={[styles.calendarTitle, { color: colors.text }]}>Lịch Sử Hoàn Thành</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCalendarVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Thư viện Lịch hiển thị màu Đỏ/Đen phân cấp */}
            <Calendar
              markingType="simple"
              markedDates={getMarkedDates()}
              theme={{
                calendarBackground: colors.card,
                textSectionTitleColor: colors.textMuted,
                dayTextColor: '#111111',               // Ngày chưa hoàn thành: Đen sẫm
                todayTextColor: '#ef4444',             
                monthTextColor: colors.text,
                indicatorColor: '#ef4444',
                textDayFontWeight: '600',
                textMonthFontWeight: '800',
                textDayHeaderFontWeight: '600',
                arrowColor: '#ef4444',
              }}
            />

            {/* Chú thích màu sắc */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>Hoàn thành mục tiêu</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: '#cbd5e1' }]} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>Ngày thường</Text>
              </View>
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
  
  // Style cụm Badge ghim chỉ số Streak ngày trên góc phải
  streakHeaderBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 8, 
    paddingHorizontal: 14, 
    borderRadius: 20, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.04, 
    shadowRadius: 6, 
    elevation: 3 
  },
  streakHeaderNumber: { fontSize: 16, fontWeight: '800', marginLeft: 4 },
  streakHeaderLabel: { fontSize: 12, fontWeight: '650', color: '#f97316', marginLeft: 2, marginTop: 2 },
  
  // Kiểu dáng thẻ lớn nền chứa sóng nước
  mainCard: { 
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderRadius: 26, 
    paddingHorizontal: 22, 
    position: 'relative',
    overflow: 'hidden', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.06, 
    shadowRadius: 16, 
    elevation: 4 
  },

  svgContainer: {
    ...StyleSheet.absoluteFillObject,
    top: -OFFSET,
    left: -OFFSET,
    right: -OFFSET,
    bottom: -OFFSET,
    zIndex: 0,
  },

  cardLeftContent: { flex: 1, justifyContent: 'center', zIndex: 1, marginTop: 12 },
  cardRightContent: { justifyContent: 'center', alignItems: 'center', zIndex: 1, marginTop: 12 },
  
  statHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  statTitle: { fontSize: 13, fontWeight: '700', marginLeft: 5, letterSpacing: -0.1 },

  valueContainer: { flexDirection: 'row', alignItems: 'baseline' },
  statValue: { fontSize: 32, fontWeight: '800', marginRight: 4, letterSpacing: -0.5 },
  statUnit: { fontSize: 14, fontWeight: '600' },
  hugePercentText: {fontSize: 30,fontWeight: '900',letterSpacing: -1,opacity: 0.48},

  // Kiểu dáng màn hình Modal mờ và Card Lịch sử
  modalOverlay: {flex: 1,backgroundColor: 'rgba(0,0,0,0.45)',justifyContent: 'center',alignItems: 'center',paddingHorizontal: 20,},
  calendarCard: {
    width: '100%',
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    },

    calendarHeader: {flexDirection: 'row',justifyContent: 'space-between',alignItems: 'center',marginBottom: 16,paddingBottom: 10,borderBottomWidth: 1,borderBottomColor: '#f1f5f9',},

    calendarTitleContainer: {flexDirection: 'row',alignItems: 'center',},
    calendarTitle: {fontSize: 18,fontWeight: '800',marginLeft: 8,},
    closeButton: {padding: 4,},
    legendRow: {flexDirection: 'row',justifyContent: 'space-around',marginTop: 18,paddingTop: 12,borderTopWidth: 1,borderTopColor: '#f1f5f9',},
    legendItem: {flexDirection: 'row',alignItems: 'center',},
    dot: {width: 10,height: 10,borderRadius: 5,marginRight: 6,},
    legendText: {fontSize: 12,fontWeight: '600',},
});