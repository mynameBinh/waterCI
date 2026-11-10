import { Ionicons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_HEIGHT = 135;

// Dịch toàn bộ nội dung trong thẻ (icon, chữ, %) xuống dưới (px)
const CONTENT_OFFSET_Y = 25;

// Màn hình hẹp: thu nhỏ chữ một chút tránh tràn dòng
const IS_COMPACT = CARD_WIDTH < 300;

// ─── Thông số sóng ───
const WAVE_AMP = 8; // biên độ sóng (px)
const WAVE_LEN = CARD_WIDTH / 1.75; // 1 chu kỳ sóng (px) - giống bản cũ (3.5π trên cả chiều rộng)
const WAVE_W = CARD_WIDTH + WAVE_LEN; // rộng thêm đúng 1 chu kỳ để cuộn lặp liền mạch
const WAVE_H = WAVE_AMP * 2;
const WAVE_DURATION = 1999;

// Path sóng TĨNH (vẽ 1 lần). Chuyển động dùng transform -> chạy ổn trên cả
// Fabric / Reanimated 4, không phải animate prop `d` của SVG nữa.
const CREST_PATH = (() => {
  const step = 4;
  const n = Math.ceil(WAVE_W / step);
  let d = "";
  for (let i = 0; i <= n; i++) {
    const x = Math.min(i * step, WAVE_W);
    const y = WAVE_AMP - Math.sin((x / WAVE_LEN) * Math.PI * 2) * WAVE_AMP;
    d += (i === 0 ? "M " : " L ") + x.toFixed(2) + " " + y.toFixed(2);
  }
  d += ` L ${WAVE_W} ${WAVE_H} L 0 ${WAVE_H} Z`;
  return d;
})();

// ─── Khối nước: sóng (trôi ngang) + thân nước, cả khối dịch lên/xuống theo % ───
// Dùng cho cả lớp nước màu lẫn mask của chữ trắng.
const WaterShape = memo(({ progress, phase, color, opacity = 1 }) => {
  // p=0: sóng nằm hẳn dưới thẻ; p=1: mặt nước nằm hẳn trên thẻ -> không bị "nhảy" ở 0% / 100%
  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: CARD_HEIGHT - progress.value * (CARD_HEIGHT + WAVE_AMP * 2),
      },
    ],
  }));

  const crestStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -phase.value * WAVE_LEN }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      needsOffscreenAlphaCompositing
      style={[styles.waterContainer, { opacity }, containerStyle]}
    >
      <Animated.View style={[styles.crest, crestStyle]}>
        <Svg width={WAVE_W} height={WAVE_H}>
          <Path d={CREST_PATH} fill={color} />
        </Svg>
      </Animated.View>
      <View style={[styles.waterBody, { backgroundColor: color }]} />
    </Animated.View>
  );
});

// ─── Sub-component tách riêng + memo để tránh re-render không cần thiết ───
const ContentLayer = memo(
  ({ isWhiteMode, currentWater, goalMl, progressText, colors }) => {
    const main = isWhiteMode ? "#ffffff" : colors.text;
    const muted = isWhiteMode ? "rgba(255,255,255,0.8)" : colors.textMuted;

    return (
      <View style={styles.cardContentWrapper}>
        <View style={styles.cardLeftContent}>
          <View style={styles.statHeader}>
            <Ionicons
              name="water"
              size={18}
              color={isWhiteMode ? "#ffffff" : colors.primary}
            />
            <Text style={[styles.statTitle, { color: muted }]}>Đã uống</Text>
          </View>
          <View style={styles.valueContainer}>
            <Text
              style={[
                styles.statValue,
                IS_COMPACT && styles.statValueCompact,
                { color: main },
              ]}
              numberOfLines={1}
            >
              {currentWater}
            </Text>
            <Text style={[styles.statUnit, { color: muted }]} numberOfLines={1}>
              / {goalMl} ml
            </Text>
          </View>
        </View>

        <View style={styles.cardRightContent}>
          <Text
            style={[
              styles.hugePercentText,
              IS_COMPACT && styles.hugePercentCompact,
              { color: main },
            ]}
            numberOfLines={1}
          >
            {progressText}%
          </Text>
        </View>
      </View>
    );
  },
);

// ─── Component chính ───
export default function HeaderComponent({
  currentWater,
  goalMl,
  username,
  streak,
  completedDates = [],
}) {
  const { colors } = useTheme();
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);

  const progress = useSharedValue(0);
  const phase = useSharedValue(0); // 0 -> 1 lặp vô hạn

  // Chặn chia cho 0 / giá trị âm
  const safeGoal = goalMl > 0 ? goalMl : 1;
  const ratio = Math.min(Math.max(currentWater / safeGoal, 0), 1);
  const progressText = Math.floor(ratio * 100).toString(); // floor: 99.6% không hiện thành 100%

  useEffect(() => {
    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, { duration: WAVE_DURATION, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(phase);
  }, [phase]);

  useEffect(() => {
    progress.value = withTiming(ratio, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [ratio, progress]);

  const markedDates = useMemo(() => {
    const result = {};
    completedDates.forEach((date) => {
      result[date] = {
        selected: true,
        selectedColor: colors.primary,
        selectedTextColor: "#ffffff",
      };
    });
    return result;
  }, [completedDates, colors.primary]);

  const openCalendar = useCallback(() => setIsCalendarVisible(true), []);
  const closeCalendar = useCallback(() => setIsCalendarVisible(false), []);

  return (
    <View style={styles.headerContainer}>
      {/* ─── Greeting row ─── */}
      <View style={styles.greetingRow}>
        <View>
          <Text style={[styles.greetingText, { color: colors.textMuted }]}>
            Xin chào,
          </Text>
          <Text style={[styles.usernameText, { color: colors.text }]}>
            {username}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.streakHeaderBadge,
            { backgroundColor: colors.card, shadowColor: colors.dockShadow },
          ]}
          onPress={openCalendar}
          activeOpacity={0.7}
        >
          <Ionicons name="flame" size={20} color="#f97316" />
          <Text style={[styles.streakHeaderNumber, { color: colors.text }]}>
            {streak}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Water card ─── */}
      <View
        style={[
          styles.mainCard,
          { backgroundColor: colors.card, shadowColor: colors.dockShadow },
        ]}
      >
        {/* Layer 1: text tối (nền) */}
        <ContentLayer
          isWhiteMode={false}
          currentWater={currentWater}
          goalMl={goalMl}
          progressText={progressText}
          colors={colors}
        />

        {/* Layer 2: sóng nước */}
        <WaterShape
          progress={progress}
          phase={phase}
          color={colors.primary}
          opacity={0.88}
        />

        {/* Layer 3: text trắng, mask theo đúng hình nước */}
        <MaskedView
          style={[StyleSheet.absoluteFill, styles.noTouch]}
          maskElement={
            <View style={StyleSheet.absoluteFill}>
              <WaterShape progress={progress} phase={phase} color="#000000" />
            </View>
          }
        >
          <ContentLayer
            isWhiteMode
            currentWater={currentWater}
            goalMl={goalMl}
            progressText={progressText}
            colors={colors}
          />
        </MaskedView>
      </View>

      {/* ─── Calendar Modal ─── */}
      <Modal
        visible={isCalendarVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCalendar}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarCard, { backgroundColor: colors.card }]}>
            <View
              style={[
                styles.calendarHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <View style={styles.calendarTitleContainer}>
                <Ionicons
                  name="calendar-outline"
                  size={22}
                  color={colors.primary}
                />
                <Text style={[styles.calendarTitle, { color: colors.text }]}>
                  Lịch Sử Hoàn Thành
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeCalendar}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Calendar
              key={colors.themeKey} // đổi theme thì lịch vẽ lại đúng màu
              markedDates={markedDates}
              theme={{
                calendarBackground: colors.card,
                textSectionTitleColor: colors.textMuted,
                dayTextColor: colors.text,
                textDisabledColor: colors.border,
                todayTextColor: colors.primary,
                monthTextColor: colors.text,
                indicatorColor: colors.primary,
                textDayFontWeight: "600",
                textMonthFontWeight: "800",
                textDayHeaderFontWeight: "600",
                arrowColor: colors.primary,
              }}
            />

            <View style={[styles.legendRow, { borderTopColor: colors.border }]}>
              <View style={styles.legendItem}>
                <View
                  style={[styles.dot, { backgroundColor: colors.primary }]}
                />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>
                  Hoàn thành mục tiêu
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: colors.background,
                      borderWidth: 1,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>
                  Ngày thường
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: { marginBottom: 24, marginTop: 10, alignItems: "center" },
  greetingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
    width: CARD_WIDTH,
    paddingHorizontal: 4,
  },
  greetingText: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  usernameText: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },

  streakHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
  },
  streakHeaderNumber: { fontSize: 16, fontWeight: "800", marginLeft: 4 },

  mainCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 26,
    position: "relative",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  noTouch: { pointerEvents: "none" },

  // ─── Nước ───
  // Container luôn bắt đầu ở (0,0) của thẻ, chỉ dịch bằng translateY -> không còn lệch vị trí
  waterContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT + WAVE_AMP * 4,
    overflow: "hidden",
  },
  crest: {
    position: "absolute",
    top: 0,
    left: 0,
    width: WAVE_W,
    height: WAVE_H,
  },
  waterBody: {
    position: "absolute",
    top: WAVE_H - 1, // chồng 1px lên sóng để không hở đường kẻ
    left: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT + WAVE_AMP * 2,
  },

  cardContentWrapper: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    // Dùng chung cho cả lớp chữ tối và lớp chữ trắng (mask) nên luôn khớp nhau
    transform: [{ translateY: CONTENT_OFFSET_Y }],
  },
  cardLeftContent: { flex: 1, justifyContent: "center", paddingRight: 8 },
  // minWidth cố định + căn phải: số % đổi 5% -> 100% không làm cột bên trái xê dịch
  cardRightContent: {
    minWidth: 84,
    justifyContent: "center",
    alignItems: "flex-end",
  },

  statHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  statTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 5,
    letterSpacing: -0.1,
  },
  valueContainer: { flexDirection: "row", alignItems: "baseline" },
  statValue: {
    fontSize: 32,
    fontWeight: "800",
    marginRight: 4,
    letterSpacing: -0.5,
  },
  statValueCompact: { fontSize: 27 },
  statUnit: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  hugePercentText: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
    textAlign: "right",
  },
  hugePercentCompact: { fontSize: 25 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  calendarCard: {
    width: "100%",
    borderRadius: 28,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  calendarTitleContainer: { flexDirection: "row", alignItems: "center" },
  calendarTitle: { fontSize: 18, fontWeight: "800", marginLeft: 8 },
  closeButton: { padding: 4 },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  legendItem: { flexDirection: "row", alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12, fontWeight: "600" },
});
