import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
// 👇 Gọi bộ não Theme vào đây
import { useTheme } from '../context/ThemeContext';

export default function HistoryComponent({ history }) {
  const { colors } = useTheme(); // Lấy bảng màu hiện tại

  return (
    <View style={styles.historyContainer}>
      {/* Đổi màu tiêu đề */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Lịch sử hôm nay</Text>

      {history.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
          <Ionicons name="water-outline" size={32} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Sếp chưa check-in ly nào!</Text>
        </View>
      ) : (
        history.map((item, index) => (
          <View 
            key={item.id} 
            // Đổi nền thẻ lịch sử theo theme
            style={[styles.historyItem, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}
          >
            <View style={styles.historyLeft}>
              <View style={styles.iconBg}>
                <Ionicons name="time-outline" size={20} color="#0ea5e9" />
              </View>
              {/* Đổi màu giờ check-in */}
              <Text style={[styles.timeText, { color: colors.text }]}>{item.time}</Text>
            </View>
            {/* Đổi màu lượng nước */}
            <Text style={[styles.volumeText, { color: colors.text }]}>+{item.volume} ml</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  historyContainer: { marginTop: 10, paddingBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  emptyCard: { borderRadius: 16, padding: 30, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: 'transparent' },
  emptyText: { marginTop: 12, fontSize: 14, fontWeight: '500' },
  historyItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
  historyLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBg: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(14, 165, 233, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  timeText: { fontSize: 15, fontWeight: '600' },
  volumeText: { fontSize: 16, fontWeight: '800', color: '#0ea5e9' }, // Lượng nước thì vẫn giữ xanh cho nổi bật
});