import { Ionicons } from "@expo/vector-icons";
import { memo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";

const THEME_OPTIONS = [
  { key: "light", icon: "sunny", label: "Sáng" },
  { key: "dark", icon: "moon", label: "Tối" },
  { key: "system", icon: "settings-outline", label: "Hệ thống" },
];

// Khối thu gọn: chỉ hiện 1 dòng (tiêu đề + giá trị đang chọn), bấm vào mới xổ nội dung
const PickerSection = ({ title, valueNode, open, onToggle, colors, children }) => (
  <>
    <View style={[styles.divider, { backgroundColor: colors.border }]} />
    <TouchableOpacity
      style={styles.accentHeader}
      onPress={onToggle}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded: open }}
    >
      <Text
        style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}
      >
        {title}
      </Text>
      <View style={styles.accentHeaderRight}>
        {valueNode}
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textMuted}
        />
      </View>
    </TouchableOpacity>
    {open && (
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOutUp.duration(150)}
      >
        {children}
      </Animated.View>
    )}
  </>
);

const ProfileTab = memo(function ProfileTab({
  username,
  memberTier,
  goalMl,
  onLogout,
  profileContent,
  isPushEnabled,
  reminderTimesCount,
  onOpenNotifications,
}) {
  const {
    themePreference,
    changeTheme,
    colors,
    accentKey,
    changeAccent,
    accents,
    decorations,
    decorationKey,
    changeDecoration,
  } = useTheme();
  const accentList = Object.entries(accents || {});
  const [accentOpen, setAccentOpen] = useState(false); // mặc định thu gọn
  const currentAccent = accents?.[accentKey];
  const [decoOpen, setDecoOpen] = useState(false); // mặc định thu gọn
  const decoList = decorations || [];
  const currentDeco = decoList.find((d) => d.key === decorationKey);

  return (
    <ScrollView
      contentContainerStyle={profileContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar */}
      <View style={styles.profileHeader}>
        {/* Đăng xuất: nút icon nhỏ ở góc phải */}
        <TouchableOpacity
          style={styles.logoutIconBtn}
          onPress={onLogout}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Đăng xuất"
        >
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
        </TouchableOpacity>
        <View
          style={[
            styles.avatarWrapper,
            {
              borderColor: colors.card,
              backgroundColor: colors.background,
              shadowColor: colors.primary,
            },
          ]}
        >
          <Ionicons name="person" size={50} color={colors.primary} />
        </View>
        <Text style={[styles.profileName, { color: colors.text }]}>
          {username}
        </Text>
        <Text style={[styles.profileRole, { color: colors.textMuted }]}>
          {memberTier}
        </Text>
      </View>

      {/* Mục tiêu — bản gọn: bỏ mô tả dài, gộp về 1 dòng */}
      <View
        style={[
          styles.settingsCard,
          styles.goalCard,
          { backgroundColor: colors.card, shadowColor: colors.dockShadow },
        ]}
      >
        <View style={styles.goalRow}>
          <View style={styles.rowLeft}>
            <Ionicons
              name="water-outline"
              size={20}
              color="#10b981"
              style={{ marginRight: 10 }}
            />
            <Text style={[styles.rowText, { color: colors.text }]}>
              Mục tiêu uống nước
            </Text>
          </View>
          <Text style={styles.goalValue}>{goalMl} ml / ngày</Text>
        </View>
      </View>

      {/* Nhắc nhở */}
      <TouchableOpacity
        style={[
          styles.settingsCard,
          styles.notifCard,
          { backgroundColor: colors.card, shadowColor: colors.dockShadow },
        ]}
        onPress={onOpenNotifications}
        activeOpacity={0.75}
      >
        <View style={styles.rowLeft}>
          <View
            style={[
              styles.notifIconWrap,
              { backgroundColor: colors.primarySoft },
            ]}
          >
            <Ionicons name="notifications" size={20} color={colors.primary} />
          </View>
          <View>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text, marginBottom: 2 },
              ]}
            >
              Cài đặt nhắc nhở
            </Text>
            <Text style={[styles.notifSub, { color: colors.textMuted }]}>
              {isPushEnabled ? "Đang bật" : "Đang tắt"} · {reminderTimesCount}{" "}
              khung giờ
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Theme sáng / tối */}
      <View
        style={[
          styles.settingsCard,
          { backgroundColor: colors.card, shadowColor: colors.dockShadow },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Giao diện & màu sắc
        </Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map(({ key, icon, label }) => {
            const active = themePreference === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.themeBtn,
                  active
                    ? {
                        backgroundColor: colors.primarySoft,
                        borderColor: colors.primaryBorder,
                      }
                    : {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                ]}
                onPress={() => changeTheme(key)}
              >
                <Ionicons
                  name={icon}
                  size={24}
                  color={active ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.themeText,
                    { color: active ? colors.primary : colors.textMuted },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Màu chủ đạo — thu gọn, bấm vào mới xổ danh sách */}
        {accentList.length === 0 ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.notifSub, { color: colors.textMuted }]}>
              Chưa có bảng màu — hãy thay file src/context/ThemeContext.js bằng
              bản mới.
            </Text>
          </>
        ) : (
          <PickerSection
            title="Màu chủ đạo"
            colors={colors}
            open={accentOpen}
            onToggle={() => setAccentOpen((v) => !v)}
            valueNode={
              <>
                <View
                  style={[
                    styles.accentMiniDot,
                    { backgroundColor: currentAccent?.primary },
                  ]}
                />
                <Text
                  style={[styles.accentCurrentLabel, { color: colors.textMuted }]}
                >
                  {currentAccent?.label}
                </Text>
              </>
            }
          >
            <View style={styles.accentGrid}>
              {accentList.map(([key, a]) => {
                const active = accentKey === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.accentItem}
                    onPress={() => {
                      changeAccent?.(key);
                      setAccentOpen(false); // chọn xong tự thu gọn lại
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Màu ${a.label}`}
                    accessibilityState={{ selected: active }}
                  >
                    <View
                      style={[
                        styles.accentRing,
                        { borderColor: active ? a.primary : "transparent" },
                      ]}
                    >
                      <View
                        style={[styles.accentDot, { backgroundColor: a.primary }]}
                      >
                        {active && (
                          <Ionicons name="checkmark" size={20} color="#ffffff" />
                        )}
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.accentLabel,
                        {
                          color: active ? colors.text : colors.textMuted,
                          fontWeight: active ? "700" : "600",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </PickerSection>
        )}

        {/* Trang trí nút chụp ảnh — cũng thu gọn như màu chủ đạo */}
        {decoList.length === 0 ? (
          <>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.notifSub, { color: colors.textMuted }]}>
              Chưa có tuỳ chọn trang trí nút — hãy thay file
              src/context/ThemeContext.js bằng bản mới.
            </Text>
          </>
        ) : (
          <PickerSection
            title="Trang trí nút chụp"
            colors={colors}
            open={decoOpen}
            onToggle={() => setDecoOpen((v) => !v)}
            valueNode={
              <>
                <Text style={styles.decoMiniEmoji}>{currentDeco?.emoji}</Text>
                <Text
                  style={[styles.accentCurrentLabel, { color: colors.textMuted }]}
                >
                  {currentDeco?.label}
                </Text>
              </>
            }
          >
            <View style={styles.accentGrid}>
              {decoList.map((d) => {
                const active = decorationKey === d.key;
                return (
                  <TouchableOpacity
                    key={d.key}
                    style={styles.decoItem}
                    onPress={() => {
                      changeDecoration?.(d.key);
                      setDecoOpen(false); // chọn xong tự thu gọn lại
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Trang trí ${d.label}`}
                    accessibilityState={{ selected: active }}
                  >
                    <View
                      style={[
                        styles.decoBox,
                        active
                          ? {
                              backgroundColor: colors.primarySoft,
                              borderColor: colors.primary,
                            }
                          : {
                              backgroundColor: colors.background,
                              borderColor: colors.border,
                            },
                      ]}
                    >
                      <Text style={styles.decoEmoji}>{d.emoji}</Text>
                    </View>
                    <Text
                      style={[
                        styles.accentLabel,
                        {
                          color: active ? colors.text : colors.textMuted,
                          fontWeight: active ? "700" : "600",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </PickerSection>
        )}
      </View>

    </ScrollView>
  );
});

export default ProfileTab;

const styles = StyleSheet.create({
  profileHeader: { alignItems: "center", marginBottom: 32, marginTop: 20 },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 4,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  profileName: {
    fontSize: Platform.OS === "android" ? 20 : 24,
    fontWeight: "800",
  },
  profileRole: { fontSize: 14, marginTop: 4, fontWeight: "500" },
  settingsCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  goalCard: { paddingVertical: 16 }, // gọn hơn vì không còn mô tả dài
  notifCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notifIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  notifSub: { fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  goalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLeft: { flexDirection: "row", alignItems: "center" },
  rowText: { fontSize: 14, fontWeight: "600" },
  goalValue: { color: "#10b981", fontSize: 15, fontWeight: "800" },
  themeRow: { flexDirection: "row", justifyContent: "space-between" },
  themeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 4,
    borderWidth: 1,
  },
  themeText: { marginTop: 8, fontSize: 13, fontWeight: "600" },
  divider: { height: 1, marginTop: 18, marginBottom: 16 },
  accentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accentHeaderRight: { flexDirection: "row", alignItems: "center" },
  accentMiniDot: { width: 16, height: 16, borderRadius: 8, marginRight: 8 },
  accentCurrentLabel: { fontSize: 13, fontWeight: "600", marginRight: 6 },
  accentGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 16 },
  accentItem: { width: "33.333%", alignItems: "center", marginBottom: 14 },
  accentRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    justifyContent: "center",
    alignItems: "center",
  },
  accentDot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
  },
  accentLabel: { marginTop: 6, fontSize: 12.5 },
  decoMiniEmoji: { fontSize: 16, marginRight: 8 },
  decoItem: { width: "25%", alignItems: "center", marginBottom: 14 },
  decoBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  decoEmoji: { fontSize: 26 },
  logoutIconBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239,68,68,0.10)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 5,
  },
});