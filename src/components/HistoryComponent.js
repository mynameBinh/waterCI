import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// ─── Item tách riêng + memo: chỉ re-render khi item thực sự thay đổi ───
const HistoryItem = memo(({ item, colors }) => (
  <View style={[styles.historyItem, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
    <View style={styles.historyLeft}>
      <View style={styles.iconBg}>
        <Ionicons name="time-outline" size={20} color="#0ea5e9" />
      </View>
      <Text style={[styles.timeText, { color: colors.text }]}>{item.time}</Text>
    </View>
    <Text style={styles.volumeText}>+{item.volume} ml</Text>
  </View>
));

export default function HistoryComponent({ history }) {
  const { colors } = useTheme();

  const renderItem = useCallback(
    ({ item }) => <HistoryItem item={item} colors={colors} />,
    [colors]
  );

  const keyExtractor = useCallback((item) => item.id.toString(), []);

  return (
    <View style={styles.historyContainer}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Lịch sử hôm nay</Text>
        <View style={styles.rightHeader}>
          <Ionicons name="water" size={16} color="#0ea5e9" style={styles.waterIcon} />
          <Text style={[styles.drinkCount, { color: colors.text }]}>{history.length} Lần uống</Text>
        </View>
      </View>

      {history.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
          <Ionicons name="water-outline" size={32} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Chưa check-in ly nào nha!</Text>
        </View>
      ) : (
        <View style={styles.scrollWrapper}>
          <FlatList
            data={history}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            removeClippedSubviews
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  historyContainer: { marginTop: 10 },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 2 },
  sectionTitle:     { fontSize: 18, fontWeight: '700' },
  rightHeader:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(14,165,233,0.08)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  waterIcon:        { marginRight: 4 },
  drinkCount:       { fontSize: 14, fontWeight: '700' },
  scrollWrapper:    { maxHeight: 240 },
  scrollArea:       { marginHorizontal: -4, paddingHorizontal: 4 },
  scrollContent:    { paddingBottom: 10 },
  emptyCard:        { borderRadius: 16, padding: 30, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#cbd5e1' },
  emptyText:        { marginTop: 12, fontSize: 14, fontWeight: '500' },
  historyItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  historyLeft:      { flexDirection: 'row', alignItems: 'center' },
  iconBg:           { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(14,165,233,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  timeText:         { fontSize: 15, fontWeight: '600' },
  volumeText:       { fontSize: 16, fontWeight: '800', color: '#0ea5e9' },
});
