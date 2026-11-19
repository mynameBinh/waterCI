import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  LayoutAnimation,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAgentApi } from "../components/agent/AgentHomeCards";
import CoupleHeart from "../components/agent/CoupleHeart";
import FlameStreak from "../components/agent/FlameStreak";
import {
  Avatar,
  avatarSource,
  deleteRemoteAvatar,
  pickAvatar,
  removeAvatar,
  uploadAvatar,
  useAvatarUri,
} from "../components/Avatar";
import { CoupleSheetBody, coupleHeartProps, useCouple } from "../components/agent/CoupleSheet";
import { getAgentName } from "../context/aiAgents";
import { getAiAvatar } from "../context/aiThemes";
import { useTheme } from "../context/ThemeContext";

const THEME_OPTIONS = [
  { key: "light", icon: "sunny", label: "Sáng" },
  { key: "dark", icon: "moon", label: "Tối" },
  { key: "system", icon: "settings-outline", label: "Hệ thống" },
];

// Tiêu đề của từng khối: tên mục bên trái, giá trị đang chọn bên phải (các lựa chọn hiện sẵn, không xổ xuống)
const SectionHeader = ({ title, value, colors }) => (
  <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
      {title}
    </Text>
    {!!value && (
      <Text
        style={[styles.sectionValue, { color: colors.primaryText }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    )}
  </View>
);

// Dòng cài đặt gọn: icon nhỏ + tên mục bên trái, giá trị đang chọn + mũi tên bên phải; chạm vào mới mở bảng chọn
const PickerRow = ({ icon, title, valueNode, onPress, colors, first, badge }) => (
  <>
    {!first && (
      <View style={[styles.rowLine, { backgroundColor: colors.border }]} />
    )}
    <TouchableOpacity
      style={styles.compactRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.compactIcon}>
        <Ionicons name={icon} size={19} color={colors.textMuted} />
        {badge && (
          <View
            style={[
              styles.compactBadge,
              { backgroundColor: colors.primary, borderColor: colors.card },
            ]}
          />
        )}
      </View>
      <Text
        style={[styles.compactTitle, { color: colors.text }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={styles.pickerRowRight}>
        {valueNode}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  </>
);

// Nhãn (tag) đặt phía trên mỗi nhóm cài đặt
const SectionTag = ({ label, colors }) => (
  <Text style={[styles.tagText, { color: colors.textMuted }]}>{label}</Text>
);

// Bảng chọn trượt từ dưới lên: chạm vùng tối bên ngoài, bấm X hoặc nút Back (Android) là đóng.
// Không xổ nội dung trong trang nên không phải kéo màn hình để tìm lựa chọn.
const PickerSheet = ({ visible, onClose, title, colors, children, tall = false }) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  if (!mounted) return null;

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.sheetRoot}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.45)", opacity: anim },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              ...(tall ? { height: height * 0.86 } : { maxHeight: height * 0.8 }),
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height * 0.5, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              activeOpacity={0.7}
              style={[styles.sheetClose, { backgroundColor: colors.background }]}
              accessibilityRole="button"
              accessibilityLabel="Đóng"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {tall ? (
            // `tall`: không bọc ScrollView — nội dung (tab, danh sách, kéo để làm mới) tự quản lý cuộn
            <View style={styles.sheetBodyFlex}>{children}</View>
          ) : (
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetBody}
            >
              {children}
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const ProfileTab = memo(function ProfileTab({
  username,
  memberTier,
  goalMl,
  onLogout,
  profileContent,
  isPushEnabled,
  reminderTimesCount,
  onOpenNotifications,
  token,
  apiBase,
  authFetch,
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
    aiThemes,
    aiThemeKey,
    changeAiTheme,
  } = useTheme();
  const accentList = Object.entries(accents || {});
  const currentAccent = accents?.[accentKey];
  const decoList = decorations || [];
  const currentDeco = decoList.find((d) => d.key === decorationKey);
  const aiThemeList = Object.entries(aiThemes || {});
  const currentAgentName = getAgentName(aiThemeKey);
  const currentTheme =
    THEME_OPTIONS.find((o) => o.key === themePreference) || THEME_OPTIONS[2];
  const [aiOpen, setAiOpen] = useState(false); // bảng chọn AI-agent
  const [styleOpen, setStyleOpen] = useState(false); // bảng "Màu & nút chụp"
  const [themeOpen, setThemeOpen] = useState(false); // bảng "Chế độ hiển thị" (sáng / tối / hệ thống)
  const [settingsOpen, setSettingsOpen] = useState(false); // mục "Cài đặt" sổ xuống / thu gọn
  const toggleSettings = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSettingsOpen((v) => !v);
  }, []);
  const [coupleOpen, setCoupleOpen] = useState(false); // bảng "Cặp đôi"
  const coupleApi = useAgentApi(token, apiBase, authFetch);
  const couple = useCouple(coupleApi, !!token, username);

  // ── Ảnh đại diện: lưu trên máy (hiện ở mọi nơi), đồng bộ lên server để người kia trong Cặp đôi thấy ──
  const myAvatarUri = useAvatarUri(username);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const syncArgs = useMemo(() => ({ token, apiBase, authFetch }), [token, apiBase, authFetch]);
  const myServerV = couple.c?.my_avatar_v;
  const partnerServerV = couple.c?.partner_avatar_v;

  const syncUp = useCallback(
    async (uri) => {
      if (!token || !uri) return;
      try {
        await uploadAvatar({ uri, ...syncArgs });
        couple.reload();
      } catch {
        /* offline: ảnh vẫn dùng được trên máy, lần mở sau sẽ tự đồng bộ lại */
      }
    },
    [token, syncArgs, couple.reload],
  );

  const onPickAvatar = useCallback(async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    try {
      const uri = await pickAvatar(username);
      if (uri) await syncUp(uri);
    } catch {
      Alert.alert("Không chọn được ảnh", "Hãy cho phép truy cập ảnh trong Cài đặt rồi thử lại nhé.");
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarBusy, username, syncUp]);

  const onAvatarPress = useCallback(() => {
    if (!myAvatarUri) return onPickAvatar();
    Alert.alert("Ảnh đại diện", undefined, [
      { text: "Chọn ảnh mới", onPress: onPickAvatar },
      {
        text: "Xoá ảnh",
        style: "destructive",
        onPress: async () => {
          await removeAvatar(username);
          if (token) deleteRemoteAvatar(syncArgs).then(couple.reload).catch(() => {});
        },
      },
      { text: "Huỷ", style: "cancel" },
    ]);
  }, [myAvatarUri, onPickAvatar, username, token, syncArgs, couple.reload]);

  // Có ảnh trên máy mà server chưa có (đổi máy, mất mạng lúc chọn...) -> tự gửi lên 1 lần
  const reuploaded = useRef(false);
  useEffect(() => {
    if (reuploaded.current || !myAvatarUri || !couple.c || myServerV) return;
    reuploaded.current = true;
    syncUp(myAvatarUri);
  }, [myAvatarUri, couple.c, myServerV, syncUp]);

  // Ảnh của mình: ưu tiên ảnh trên máy; máy mới chưa có thì lấy bản trên server
  const mySource = useMemo(
    () => avatarSource({ apiBase, token, username, version: myServerV }),
    [apiBase, token, username, myServerV],
  );
  const partnerName = couple.c?.partner_username;
  const partnerSource = useMemo(
    () => avatarSource({ apiBase, token, username: partnerName, version: partnerServerV }),
    [apiBase, token, partnerName, partnerServerV],
  );
  const coupleAvatars = useMemo(
    () => ({ myName: username, myUri: myAvatarUri, mySource: myAvatarUri ? null : mySource, partnerSource }),
    [username, myAvatarUri, mySource, partnerSource],
  );

  const coupleLinked = !!couple.c?.partner_username;

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
        <TouchableOpacity
          onPress={onAvatarPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Đổi ảnh đại diện"
        >
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
            <Avatar
              name={username}
              uri={myAvatarUri}
              source={myAvatarUri ? null : mySource}
              size={92}
            />
          </View>
        </TouchableOpacity>
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


      {/* Cặp đôi — thẻ nổi bật ngay dưới mục tiêu: hai ảnh đại diện + sóng nhịp tim, chạm để mở */}
      <TouchableOpacity
        style={[
          styles.coupleCard,
          { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
        ]}
        onPress={() => setCoupleOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Cặp đôi"
      >
        <View style={styles.coupleHead}>
          <Ionicons name="heart" size={18} color={colors.primary} />
          <Text style={[styles.coupleTitle, { color: colors.text }]}>Cặp đôi</Text>
          {couple.needsAttention && (
            <View style={[styles.coupleDot, { backgroundColor: colors.primary }]} />
          )}
          <View style={{ flex: 1 }} />
          {coupleLinked && couple.c?.visible && couple.c?.joint_streak > 0 ? (
            <View style={styles.coupleStreakRow}>
              <Text
                style={[styles.coupleSummary, { color: colors.primaryText }]}
                numberOfLines={1}
              >
                {couple.c.partner_username}
              </Text>
              <FlameStreak count={couple.c.joint_streak} size={15} />
            </View>
          ) : (
            <Text
              style={[styles.coupleSummary, { color: colors.primaryText }]}
              numberOfLines={1}
            >
              {coupleLinked ? couple.summary : "Liên kết ngay"}
            </Text>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
        </View>
        {coupleLinked ? (
          <>
            <CoupleHeart
              colors={colors}
              partnerName={partnerName}
              {...coupleHeartProps(couple.c, colors, couple.heart)}
            />
            {couple.c?.linked && couple.c?.together_days > 0 && (
              <Text style={[styles.coupleDays, { color: colors.primaryText }]}>
                Ngày thứ {couple.c.together_days} bên nhau
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.coupleHint, { color: colors.textMuted }]}>
            {couple.summary === "Chưa liên kết"
              ? "Liên kết với người kia để xem tiến độ của nhau, giữ chuỗi chung và trả lời câu hỏi mỗi ngày."
              : couple.summary}
          </Text>
        )}
      </TouchableOpacity>
      <PickerSheet
        visible={coupleOpen}
        onClose={() => setCoupleOpen(false)}
        title="Cặp đôi"
        colors={colors}
        tall
      >
        <CoupleSheetBody colors={colors} couple={couple} avatars={coupleAvatars} />
      </PickerSheet>

      {/* Cài đặt: thu gọn mặc định, chạm vào để sổ xuống */}
      <TouchableOpacity
        style={[
          styles.settingsCard,
          styles.settingsHeader,
          { backgroundColor: colors.card, shadowColor: colors.dockShadow },
          settingsOpen && { marginBottom: 16 },
        ]}
        onPress={toggleSettings}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Cài đặt"
        accessibilityState={{ expanded: settingsOpen }}
      >
        <Ionicons name="settings-outline" size={19} color={colors.textMuted} />
        <Text style={[styles.settingsHeaderText, { color: colors.text }]}>Cài đặt</Text>
        <Ionicons
          name={settingsOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.textMuted}
        />
      </TouchableOpacity>
      {settingsOpen && (
        <View>
          <SectionTag label="Chung" colors={colors} />
          <View style={[styles.settingsCard, styles.compactCard, styles.tagged, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
            <PickerRow
              first
              icon="notifications-outline"
              title="Nhắc nhở"
              colors={colors}
              onPress={onOpenNotifications}
              valueNode={
                <Text style={[styles.rowValue, { color: colors.textMuted }]}>
                  {isPushEnabled ? "Bật" : "Tắt"} · {reminderTimesCount} giờ
                </Text>
              }
            />
            {/* AI-agent: dòng thu gọn, chạm vào mở bảng chọn trượt từ dưới lên.
                Ảnh dùng resizeMode="contain" và KHÔNG phóng to -> PNG xoá phông luôn hiện đủ, không bị cắt. */}
            {aiThemeList.length > 0 && (
              <>
                <PickerRow
                  icon="sparkles-outline"
                  title="AI-agent"
                  colors={colors}
                  onPress={() => setAiOpen(true)}
                  valueNode={
                    <>
                      <Image
                        source={getAiAvatar(aiThemeKey, accentKey)}
                        fadeDuration={0}
                        resizeMode="contain"
                        style={styles.miniThumb}
                      />
                      <Text style={[styles.rowValue, { color: colors.textMuted }]}>
                        {currentAgentName}
                      </Text>
                    </>
                  }
                />
                <PickerSheet
                  visible={aiOpen}
                  onClose={() => setAiOpen(false)}
                  title="Chọn AI-agent"
                  colors={colors}
                >
                  <View style={styles.agentGrid}>
                    {aiThemeList.map(([key]) => {
                      const active = aiThemeKey === key;
                      const name = getAgentName(key);
                      return (
                        <TouchableOpacity
                          key={key}
                          style={styles.agentItem}
                          onPress={() => {
                            changeAiTheme?.(key);
                            setTimeout(() => setAiOpen(false), 220); // cho thấy dấu tích rồi mới đóng
                          }}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`AI-agent ${name}`}
                          accessibilityState={{ selected: active }}
                        >
                          <View
                            style={[
                              styles.agentBox,
                              {
                                borderColor: active ? colors.primary : colors.border,
                                backgroundColor: active
                                  ? colors.primarySoft
                                  : colors.background,
                              },
                            ]}
                          >
                            <Image
                              source={getAiAvatar(key, accentKey)}
                              fadeDuration={0}
                              resizeMode="contain"
                              style={styles.agentImg}
                            />
                            {active && (
                              <View
                                style={[
                                  styles.checkBadge,
                                  {
                                    backgroundColor: colors.primary,
                                    borderColor: colors.card,
                                  },
                                ]}
                              >
                                <Ionicons name="checkmark" size={12} color="#ffffff" />
                              </View>
                            )}
                          </View>
                          <Text
                            style={[
                              styles.itemLabel,
                              {
                                color: active ? colors.text : colors.textMuted,
                                fontWeight: active ? "700" : "600",
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </PickerSheet>
              </>
            )}
          </View>

          <SectionTag label="Giao diện" colors={colors} />
          <View style={[styles.settingsCard, styles.compactCard, styles.tagged, { backgroundColor: colors.card, shadowColor: colors.dockShadow }]}>
            <PickerRow
              first
              icon="contrast-outline"
              title="Chế độ hiển thị"
              colors={colors}
              onPress={() => setThemeOpen(true)}
              valueNode={
                <>
                  <Ionicons
                    name={currentTheme.icon}
                    size={16}
                    color={colors.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.rowValue, { color: colors.textMuted }]}>
                    {currentTheme.label}
                  </Text>
                </>
              }
            />
            <PickerSheet
              visible={themeOpen}
              onClose={() => setThemeOpen(false)}
              title="Chế độ hiển thị"
              colors={colors}
            >
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
                      onPress={() => {
                        changeTheme(key);
                        setTimeout(() => setThemeOpen(false), 220); // cho thấy đã chọn rồi mới đóng
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: active }}
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
            </PickerSheet>

            {/* Màu & nút chụp: dòng thu gọn, chạm vào mở bảng chọn (chọn nhiều lần, chạm ra ngoài để đóng) */}
            {accentList.length === 0 && decoList.length === 0 ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Text style={[styles.notifSub, { color: colors.textMuted }]}>
                  Chưa có bảng màu / trang trí nút — hãy thay file
                  src/context/ThemeContext.js bằng bản mới.
                </Text>
              </>
            ) : (
              <>
                <PickerRow
                  icon="color-palette-outline"
                  title="Màu & nút chụp"
                  colors={colors}
                  onPress={() => setStyleOpen(true)}
                  valueNode={
                    <>
                      <View
                        style={[
                          styles.miniDot,
                          { backgroundColor: currentAccent?.primary },
                        ]}
                      />
                    </>
                  }
                />
                <PickerSheet
                  visible={styleOpen}
                  onClose={() => setStyleOpen(false)}
                  title="Màu & nút chụp"
                  colors={colors}
                >
                  {accentList.length > 0 && (
                    <>
                      <SectionHeader
                        title="Màu chủ đạo"
                        value={currentAccent?.label}
                        colors={colors}
                      />
                      <View style={styles.swatchRow}>
                        {accentList.map(([key, a]) => {
                          const active = accentKey === key;
                          return (
                            <TouchableOpacity
                              key={key}
                              style={styles.swatchItem}
                              onPress={() => changeAccent?.(key)}
                              activeOpacity={0.8}
                              accessibilityRole="button"
                              accessibilityLabel={`Màu ${a.label}`}
                              accessibilityState={{ selected: active }}
                            >
                              <View
                                style={[
                                  styles.swatchRing,
                                  { borderColor: active ? a.primary : "transparent" },
                                ]}
                              >
                                <View
                                  style={[styles.swatchDot, { backgroundColor: a.primary }]}
                                >
                                  {active && (
                                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                                  )}
                                </View>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {decoList.length > 0 && (
                    <>
                      <View
                        style={[
                          styles.divider,
                          { backgroundColor: colors.border, marginTop: 20 },
                        ]}
                      />
                      <SectionHeader
                        title="Trang trí nút chụp"
                        value={currentDeco?.label}
                        colors={colors}
                      />
                      <View style={styles.chipWrap}>
                        {decoList.map((d) => {
                          const active = decorationKey === d.key;
                          return (
                            <TouchableOpacity
                              key={d.key}
                              onPress={() => changeDecoration?.(d.key)}
                              activeOpacity={0.8}
                              accessibilityRole="button"
                              accessibilityLabel={`Trang trí ${d.label}`}
                              accessibilityState={{ selected: active }}
                              style={[
                                styles.chip,
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
                              <Text style={styles.chipEmoji}>{d.emoji}</Text>
                              <Text
                                style={[
                                  styles.chipText,
                                  {
                                    color: active ? colors.primaryText : colors.textMuted,
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
                    </>
                  )}
                </PickerSheet>
              </>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
});

export default ProfileTab;

const styles = StyleSheet.create({
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    marginBottom: 24,
  },
  settingsHeaderText: { flex: 1, fontSize: 15, fontWeight: "700", marginLeft: 10 },
  tagText: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginLeft: 6,
    marginBottom: 8,
  },
  tagged: { marginBottom: 22 },
  coupleCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 24,
  },
  coupleHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  coupleTitle: { fontSize: 16, fontWeight: "800", marginLeft: 8 },
  coupleDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  coupleStreakRow: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  coupleSummary: { fontSize: 13, fontWeight: "700", marginRight: 6, flexShrink: 1 },
  coupleHint: { fontSize: 13, lineHeight: 19, marginBottom: 2 },
  coupleDays: { fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 2 },
  compactCard: { paddingVertical: 4, paddingHorizontal: 16 },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: 8,
  },
  compactIcon: { width: 26, alignItems: "flex-start", justifyContent: "center" },
  compactBadge: {
    position: "absolute",
    top: -2,
    left: 11,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  compactTitle: { fontSize: 14.5, fontWeight: "600", marginRight: 12 },
  rowLine: { height: StyleSheet.hairlineWidth },
  rowValueFlex: { flexShrink: 1, textAlign: "right" },
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
  coupleBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
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
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerRowRight: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  rowValue: { fontSize: 13, fontWeight: "600", marginRight: 4 },
  miniThumb: { width: 26, height: 26, marginRight: 8 },
  miniDot: { width: 16, height: 16, borderRadius: 8, marginRight: 8 },
  miniEmoji: { fontSize: 16, marginRight: 8 },
  // bảng chọn trượt từ dưới lên
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    flexShrink: 1, // co lại khi bàn phím mở để không tràn lên trên
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetBody: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8 },
  sheetBodyFlex: { flex: 1, paddingHorizontal: 20, paddingTop: 6 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionValue: { fontSize: 13, fontWeight: "700", marginLeft: 12, flexShrink: 1 },
  itemLabel: { fontSize: 12.5, marginTop: 8 },
  checkBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  // AI-agent: ô vuông có chừa lề trong, ảnh co vừa khung (contain), không phóng to, không bo cắt ảnh
  agentGrid: { flexDirection: "row", flexWrap: "wrap" },
  agentItem: { width: "33.333%", alignItems: "center", marginBottom: 6 },
  agentBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 2,
    padding: 8,
  },
  agentImg: { width: "100%", height: "100%" },
  // Màu chủ đạo: 1 hàng, chia đều chiều ngang
  swatchRow: { flexDirection: "row", marginHorizontal: -2 },
  swatchItem: { flex: 1, alignItems: "center" },
  swatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    justifyContent: "center",
    alignItems: "center",
  },
  swatchDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  // Trang trí nút chụp
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginRight: -8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
  },
  chipEmoji: { fontSize: 18, marginRight: 6 },
  chipText: { fontSize: 13.5 },
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