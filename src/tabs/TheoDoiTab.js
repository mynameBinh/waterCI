import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '../context/ThemeContext';

const API_BASE = 'https://binhhn21-water-check-in-backend.hf.space';
const BADGE_TITLE = 'Bình đẹp zai vippro';
const REFRESH_INTERVAL_MS = 10000; // tự động cập nhật mỗi 10 giây

// Cache ở module-level: giữ lại dữ liệu của lần tải gần nhất để khi người
// dùng chuyển tab qua lại, component hiện luôn dữ liệu cũ (không loading
// spinner, không gọi API ngay) — việc cập nhật dữ liệu mới sẽ do polling
// mỗi 10 giây đảm nhiệm.
let cachedTargetInfo = null;
let cachedErrorMsg = null;
let hasFetchedOnce = false;

// ─── Component ───────────────────────────────────────────────────────────────
// Tab "Theo dõi": chỉ tài khoản có role "embe" mới xem được.
// Hiển thị thông tin của NGƯỜI DÙNG đang giữ danh hiệu "Bình đẹp zai vippro"
// (không phải người đang đăng nhập) — số lần uống trong ngày, ảnh + giờ
// check-in, và streak hiện tại của người đó. Dữ liệu lấy qua 1 API duy nhất:
// GET /api/tier-tracking?tier=<BADGE_TITLE>
export default function TheoDoiTab({ token, containerStyle }) {
  const { colors } = useTheme();

  // Nếu đã từng fetch trước đó (kể cả ở lần mount trước, do chuyển tab),
  // dùng luôn dữ liệu cache -> không hiện loading spinner nữa.
  const [loading,    setLoading]    = useState(!hasFetchedOnce);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg,   setErrorMsg]   = useState(cachedErrorMsg);
  const [targetInfo, setTargetInfo] = useState(cachedTargetInfo); // { username, streak, total_checkins_today, checkins }

  // silent = true: không đụng tới state `loading` (dùng cho polling nền)
  const loadData = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setErrorMsg(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/tier-tracking?tier=${encodeURIComponent(BADGE_TITLE)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.status === 403) {
        const msg = 'Chỉ tài khoản "em bé" mới được xem thông tin này.';
        cachedErrorMsg = msg;
        cachedTargetInfo = null;
        setErrorMsg(msg);
        setTargetInfo(null);
        return;
      }
      if (res.status === 404) {
        const msg = `Hiện chưa có ai giữ danh hiệu "${BADGE_TITLE}".`;
        cachedErrorMsg = msg;
        cachedTargetInfo = null;
        setErrorMsg(msg);
        setTargetInfo(null);
        return;
      }
      if (!res.ok) throw new Error();

      const data = await res.json();
      cachedErrorMsg = null;
      cachedTargetInfo = data;
      setErrorMsg(null);
      setTargetInfo(data);
    } catch {
      // Khi polling nền lỗi, giữ nguyên dữ liệu cũ, không hiện lỗi đè lên UI
      if (!silent) {
        const msg = 'Không thể tải dữ liệu. Vui lòng thử lại.';
        cachedErrorMsg = msg;
        setErrorMsg(msg);
      }
    } finally {
      hasFetchedOnce = true;
    }
  }, [token]);

  // Lần đầu tiên (toàn app, chưa từng fetch): hiện loading rồi tải.
  // Những lần mount sau (chuyển tab qua lại): không tải lại ngay, dùng cache.
  useEffect(() => {
    if (!hasFetchedOnce) {
      setLoading(true);
      loadData().finally(() => setLoading(false));
    }
  }, [loadData]);

  // Polling nền: cứ mỗi 10 giây tự động gọi lại API để cập nhật dữ liệu,
  // không hiện loading spinner, không xoá dữ liệu cũ khi đang chờ.
  useEffect(() => {
    const intervalId = setInterval(() => {
      loadData(true);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const checkins = (targetInfo?.checkins || []).map(c => ({
    id:       c.id,
    volume:   c.volume_ml,
    time:     c.time,
    date:     c.date,
    imageUrl: c.image_url ? `${API_BASE}${c.image_url}` : null,
  }));
  const totalMlToday = checkins.reduce((sum, c) => sum + (c.volume || 0), 0);
  const streak = targetInfo?.streak ?? 0;

  const renderItem = ({ item }) => (
    <View style={[styles.checkinCard, { backgroundColor: colors.card, borderColor: colors.border || '#dbeafe' }]}>
      <View style={styles.checkinHeader}>
        <View style={styles.checkinTimeRow}>
          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.checkinTime, { color: colors.textMuted }]} numberOfLines={1}>
            {item.time}
          </Text>
        </View>
        <View style={styles.volumeBadge}>
          <Text style={styles.volumeBadgeText}>+{item.volume}ml</Text>
        </View>
      </View>

      {item.date && (
        <Text style={[styles.checkinDate, { color: colors.textMuted }]}>{item.date}</Text>
      )}

      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.checkinImage} resizeMode="cover" />
      ) : (
        <View style={[styles.checkinImage, styles.checkinImagePlaceholder]}>
          <Ionicons name="water" size={28} color="#0ea5e9" />
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {/* ── Header: danh hiệu người dùng ── */}
      <View style={styles.headerRow}>
        <View style={styles.badgeIconWrap}>
          <Ionicons name="star" size={22} color="#f59e0b" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.badgeTitle, { color: colors.text }]}>{BADGE_TITLE}</Text>
          <Text style={[styles.badgeSub, { color: colors.textMuted }]}>
            {targetInfo?.username ? `Tài khoản: ${targetInfo.username}` : 'Theo dõi hoạt động uống nước'}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0ea5e9" style={{ marginTop: 30 }} />
      ) : errorMsg ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{errorMsg}</Text>
        </View>
      ) : (
        <>
          {/* ── Thống kê nhanh (của người giữ danh hiệu) ── */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.card }]}>
              <Ionicons name="water" size={22} color="#0ea5e9" />
              <Text style={[styles.statValue, { color: colors.text }]}>{totalMlToday}ml</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Tổng ml hôm nay</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card }]}>
              <Ionicons name="flame" size={22} color="#f97316" />
              <Text style={[styles.statValue, { color: colors.text }]}>{streak}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Streak hiện tại</Text>
            </View>
          </View>

          {/* ── Danh sách check-in (ảnh + giờ) ── */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Lịch sử check-in hôm nay</Text>

          {checkins.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="water-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Chưa có lần check-in nào hôm nay</Text>
            </View>
          ) : (
            <FlatList
              data={checkins}
              keyExtractor={item => String(item.id)}
              renderItem={renderItem}
              numColumns={2}
              columnWrapperStyle={styles.checkinRow}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />
              }
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  headerRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  badgeIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fffbeb', justifyContent: 'center', alignItems: 'center' },
  badgeTitle:    { fontSize: 16, fontWeight: '800' },
  badgeSub:      { fontSize: 12, marginTop: 2 },

  statsRow:  { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard:  { flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  statValue: { fontSize: 22, fontWeight: '900', marginTop: 6 },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: '600' },

  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10 },

  checkinRow:  { justifyContent: 'space-between' },
  checkinCard: {
    width: '48.5%', borderRadius: 16, borderWidth: 1.5, padding: 10, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  checkinHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  checkinTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  checkinTime:    { fontSize: 12, fontWeight: '700' },
  checkinDate:    { fontSize: 10, fontWeight: '600', marginBottom: 8, marginTop: -2 },

  volumeBadge:     { backgroundColor: '#d1fae5', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  volumeBadgeText: { fontSize: 10, fontWeight: '800', color: '#059669' },

  checkinImage:            { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#0f172a' },
  checkinImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },

  emptyWrap: { alignItems: 'center', marginTop: 40 },
  emptyText: { marginTop: 10, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20 },
});