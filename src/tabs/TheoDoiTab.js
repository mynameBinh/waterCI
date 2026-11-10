import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Animated, {
  Easing,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "../context/ThemeContext";
import TheoDoiGoalsSection, { prefetchGoals } from "./TheoDoiGoalsSection";

const API_BASE = "https://binhhn21-water-check-in-backend.hf.space";
const BADGE_TITLE = "Bình đẹp zai vippro";
const REFRESH_INTERVAL_MS = 10000; // tự động cập nhật mỗi 10 giây (chỉ khi đang mở tab)

// Ảnh thumbnail nhỏ (~30-60KB) do backend sinh, thay vì tải ảnh gốc vài MB
const thumbUrl = (u) =>
  u ? `${API_BASE}/api/thumb/${u.split("/").pop()}?w=480` : null;

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
export default function TheoDoiTab({ token, containerStyle, active = true }) {
  const { colors } = useTheme();
  const [section, setSection] = useState("water"); // "water" | "goals"

  // Thanh trượt (pill) chạy qua lại giữa 2 nút phân đoạn
  const [segW, setSegW] = useState(0);
  const pillX = useSharedValue(0);
  useEffect(() => {
    if (segW <= 0) return;
    pillX.value = withTiming(section === "goals" ? (segW - 8) / 2 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [section, segW, pillX]);
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  // Nếu đã từng fetch trước đó (kể cả ở lần mount trước, do chuyển tab),
  // dùng luôn dữ liệu cache -> không hiện loading spinner nữa.
  const [loading, setLoading] = useState(!hasFetchedOnce);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(cachedErrorMsg);
  const [targetInfo, setTargetInfo] = useState(cachedTargetInfo); // { username, streak, total_checkins_today, checkins }

  const busy = useRef(false);

  // silent = true: không đụng tới state `loading` (dùng cho polling nền)
  const loadData = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (busy.current) return; // đang có 1 request chạy -> không chồng thêm
      busy.current = true;
      if (!silent) setErrorMsg(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/tier-tracking?tier=${encodeURIComponent(BADGE_TITLE)}`,
          { headers: { Authorization: `Bearer ${token}` } },
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
        setErrorMsg(null);
        // Dữ liệu không đổi -> không setState => không render lại cả danh sách ảnh
        if (JSON.stringify(data) !== JSON.stringify(cachedTargetInfo)) {
          cachedTargetInfo = data;
          setTargetInfo(data);
        }
      } catch {
        // Khi polling nền lỗi, giữ nguyên dữ liệu cũ, không hiện lỗi đè lên UI
        if (!silent) {
          const msg = "Không thể tải dữ liệu. Vui lòng thử lại.";
          cachedErrorMsg = msg;
          setErrorMsg(msg);
        }
      } finally {
        hasFetchedOnce = true;
        busy.current = false;
      }
    },
    [token],
  );

  // Lần đầu tiên (toàn app, chưa từng fetch): hiện loading rồi tải.
  // Những lần mount sau (chuyển tab qua lại): không tải lại ngay, dùng cache.
  useEffect(() => {
    if (!hasFetchedOnce) {
      setLoading(true);
      loadData().finally(() => setLoading(false));
    }
  }, [loadData]);

  // Tải trước tab "Mục tiêu" ở nền -> bấm sang là có dữ liệu ngay.
  useEffect(() => {
    prefetchGoals(token);
  }, [token]);

  // Polling chỉ chạy khi đang MỞ tab này (tab ẩn không tốn mạng / không tranh băng thông
  // với các tab khác). Vừa chuyển sang tab -> làm mới ngầm ngay, dữ liệu cũ vẫn hiện sẵn.
  useEffect(() => {
    if (!active) return;
    loadData(true);
    const intervalId = setInterval(() => loadData(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [loadData, active]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const checkins = (targetInfo?.checkins || []).map((c) => ({
    id: c.id,
    volume: c.volume_ml,
    time: c.time,
    date: c.date,
    imageUrl: thumbUrl(c.image_url),
  }));

  // Nạp sẵn ảnh vào cache để cuộn/mở tab là hiện ngay
  useEffect(() => {
    checkins.forEach((c) => {
      if (c.imageUrl) Image.prefetch(c.imageUrl).catch(() => {});
    });
  }, [targetInfo]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalMlToday = checkins.reduce((sum, c) => sum + (c.volume || 0), 0);
  const streak = targetInfo?.streak ?? 0;

  const renderItem = ({ item, index }) => (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 6) * 50 + 120).duration(300)}
      style={[
        styles.checkinCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border || "#dbeafe",
        },
      ]}
    >
      <View style={styles.checkinHeader}>
        <View style={styles.checkinTimeRow}>
          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
          <Text
            style={[styles.checkinTime, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {item.time}
          </Text>
        </View>
        <View
          style={[styles.volumeBadge, { backgroundColor: colors.primarySoft }]}
        >
          <Text style={[styles.volumeBadgeText, { color: colors.primaryText }]}>
            +{item.volume}ml
          </Text>
        </View>
      </View>

      {item.date && (
        <Text style={[styles.checkinDate, { color: colors.textMuted }]}>
          {item.date}
        </Text>
      )}

      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.checkinImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.checkinImage, styles.checkinImagePlaceholder]}>
          <Ionicons name="water" size={28} color={colors.primary} />
        </View>
      )}
    </Animated.View>
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {/* ── Header: danh hiệu người dùng ── */}
      <View style={styles.headerRow}>
        <View style={styles.badgeIconWrap}>
          <Ionicons name="star" size={22} color="#f59e0b" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.badgeTitle, { color: colors.text }]}>
            {BADGE_TITLE}
          </Text>
          <Text style={[styles.badgeSub, { color: colors.textMuted }]}>
            {targetInfo?.username
              ? `Tài khoản: ${targetInfo.username}`
              : "Theo dõi hoạt động uống nước"}
          </Text>
        </View>
      </View>

      {/* ── Chuyển giữa theo dõi nước / mục tiêu ── */}
      <View
        style={[styles.segment, { backgroundColor: colors.card }]}
        onLayout={(e) => setSegW(Math.round(e.nativeEvent.layout.width))}
      >
        {segW > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.segmentPill,
              { width: (segW - 8) / 2, backgroundColor: colors.primary },
              pillStyle,
            ]}
          />
        )}
        {[
          { key: "water", label: "Uống nước", icon: "water" },
          { key: "goals", label: "Mục tiêu", icon: "flag" },
        ].map((o) => {
          const active = section === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => setSection(o.key)}
              style={styles.segmentItem}
            >
              <Ionicons
                name={o.icon}
                size={14}
                color={active ? "#ffffff" : colors.textMuted}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: active ? "#ffffff" : colors.textMuted },
                ]}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Animated.View
        key={section}
        entering={(section === "goals" ? FadeInRight : FadeInLeft)
          .duration(280)
          .easing(Easing.out(Easing.cubic))}
        style={{ flex: 1 }}
      >
      {section === "goals" ? (
        <TheoDoiGoalsSection token={token} colors={colors} active={active} />
      ) : loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 30 }}
        />
      ) : errorMsg ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={colors.textMuted}
          />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {errorMsg}
          </Text>
        </View>
      ) : (
        <>
          {/* ── Thống kê nhanh (của người giữ danh hiệu) ── */}
          <View style={styles.statsRow}>
            <Animated.View
              entering={FadeInDown.delay(130).duration(320)}
              style={[styles.statCard, { backgroundColor: colors.card }]}
            >
              <Ionicons name="water" size={22} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {totalMlToday}ml
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Tổng ml hôm nay
              </Text>
            </Animated.View>
            <Animated.View
              entering={FadeInDown.delay(200).duration(320)}
              style={[styles.statCard, { backgroundColor: colors.card }]}
            >
              <Ionicons name="flame" size={22} color="#f97316" />
              <Text style={[styles.statValue, { color: colors.text }]}>
                {streak}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Streak hiện tại
              </Text>
            </Animated.View>
          </View>

          {/* ── Danh sách check-in (ảnh + giờ) ── */}
          <Animated.Text
            entering={FadeInDown.delay(260).duration(320)}
            style={[styles.sectionTitle, { color: colors.text }]}
          >
            Lịch sử check-in hôm nay
          </Animated.Text>

          {checkins.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons
                name="water-outline"
                size={40}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Chưa có lần check-in nào hôm nay
              </Text>
            </View>
          ) : (
            <FlatList
              data={checkins}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderItem}
              numColumns={2}
              columnWrapperStyle={styles.checkinRow}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                />
              }
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  badgeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fffbeb",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeTitle: { fontSize: 16, fontWeight: "800" },
  badgeSub: { fontSize: 12, marginTop: 2 },

  segment: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  segmentPill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 11,
  },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 11,
  },
  segmentText: { fontSize: 13, fontWeight: "800" },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: "900", marginTop: 6 },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: "600" },

  sectionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10 },

  checkinRow: { justifyContent: "space-between" },
  checkinCard: {
    width: "48.5%",
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 10,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  checkinHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  checkinTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  checkinTime: { fontSize: 12, fontWeight: "700" },
  checkinDate: {
    fontSize: 10,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: -2,
  },

  volumeBadge: {
    backgroundColor: "#d1fae5",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  volumeBadgeText: { fontSize: 10, fontWeight: "800", color: "#059669" },

  checkinImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#0f172a",
  },
  checkinImagePlaceholder: { justifyContent: "center", alignItems: "center" },

  emptyWrap: { alignItems: "center", marginTop: 40 },
  emptyText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});