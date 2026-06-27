import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// Android màn hình dài hơn nhưng navigation bar chiếm chỗ → thu nhỏ để vừa
const IS_ANDROID      = Platform.OS === 'android';
const MAX_LIST_HEIGHT = IS_ANDROID ? 190 : 240;
const ITEM_PADDING    = IS_ANDROID ? 11  : 16;
const ITEM_MARGIN_B   = IS_ANDROID ? 8   : 12;
const ICON_BOX        = IS_ANDROID ? 30  : 36;
const FONT_TIME       = IS_ANDROID ? 13  : 15;
const FONT_VOL        = IS_ANDROID ? 14  : 16;
const TITLE_SIZE      = IS_ANDROID ? 16  : 18;

// ─── Item tách riêng + memo: chỉ re-render khi item thực sự thay đổi ───
const HistoryItem = memo(({ item, colors }) => (
  <View style={[styles.historyItem, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
    <View style={styles.historyLeft}>
      <View style={[styles.iconBg, { width: ICON_BOX, height: ICON_BOX, borderRadius: ICON_BOX / 2 }]}>
        <Ionicons name="time-outline" size={IS_ANDROID ? 16 : 20} color="#0ea5e9" />
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
          <Ionicons name="water" size={IS_ANDROID ? 13 : 16} color="#0ea5e9" style={styles.waterIcon} />
          <Text style={[styles.drinkCount, { color: colors.text }]}>{history.length} Lần uống</Text>
        </View>
      </View>

      {history.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
          <Ionicons name="water-outline" size={IS_ANDROID ? 24 : 32} color={colors.textMuted} />
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
  historyContainer: { marginTop: IS_ANDROID ? 6 : 10 },
  headerRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: IS_ANDROID ? 10 : 16, paddingHorizontal: 2 },
  sectionTitle:     { fontSize: TITLE_SIZE, fontWeight: '700' },
  rightHeader:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(14,165,233,0.08)', paddingHorizontal: 10, paddingVertical: IS_ANDROID ? 3 : 5, borderRadius: 20 },
  waterIcon:        { marginRight: 4 },
  drinkCount:       { fontSize: IS_ANDROID ? 12 : 14, fontWeight: '700' },
  scrollWrapper:    { maxHeight: MAX_LIST_HEIGHT },
  scrollArea:       { marginHorizontal: -4, paddingHorizontal: 4 },
  scrollContent:    { paddingBottom: 10 },
  emptyCard:        { borderRadius: 16, padding: IS_ANDROID ? 20 : 30, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#cbd5e1' },
  emptyText:        { marginTop: 8, fontSize: IS_ANDROID ? 13 : 14, fontWeight: '500' },
  historyItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: ITEM_PADDING, borderRadius: 14, marginBottom: ITEM_MARGIN_B, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  historyLeft:      { flexDirection: 'row', alignItems: 'center' },
  iconBg:           { backgroundColor: 'rgba(14,165,233,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: IS_ANDROID ? 8 : 12 },
  timeText:         { fontSize: FONT_TIME, fontWeight: '600' },
  volumeText:       { fontSize: FONT_VOL, fontWeight: '800', color: '#0ea5e9' },
});
