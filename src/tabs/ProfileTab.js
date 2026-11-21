import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import CoupleHeart, { coupleSeat } from "../components/agent/CoupleHeart";
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

// Ảnh nền biển của thẻ Cặp đôi: mỗi màu chủ đạo (accent) một ảnh, đổi theo theme người dùng chọn. Thiếu màu -> ocean (xanh dương).
// Metro bắt buộc require là đường dẫn tĩnh nên phải liệt kê từng ảnh. Tỉ lệ lấy từ chính file ảnh -> vẽ đúng tỉ lệ, KHÔNG cắt, KHÔNG méo.
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const COUPLE_PLAY_DELAY = 350; // ms: sau khi tab Tôi hiện ra (hiệu ứng chuyển tab ~220ms) mới cho cá bơi / bùm
const COUPLE_BG_SOURCES = {
  ocean: require("../../assets/background-couple/background-on-sea-blue.png"),
  pink: require("../../assets/background-couple/background-on-sea-pink.png"),
  yellow: require("../../assets/background-couple/background-on-sea-yellow.png"),
  green: require("../../assets/background-couple/background-on-sea-green.png"),
  purple: require("../../assets/background-couple/background-on-sea-purple.png"),
  orange: require("../../assets/background-couple/background-on-sea-orange.png"),
};
const COUPLE_BGS = Object.fromEntries(
  Object.entries(COUPLE_BG_SOURCES).map(([key, source]) => {
    const meta = Image.resolveAssetSource(source) || {};
    return [key, { source, ratio: meta.width && meta.height ? meta.width / meta.height : 0 }];
  }),
);
const getCoupleBg = (accentKey) => COUPLE_BGS[accentKey] || COUPLE_BGS.ocean;
const CARD_BORDER = 1.5;

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
  active = true, // tab Tôi đang hiện
  coupleSync = 0, // Dashboard tăng số này sau mỗi lần check-in (nước / mục tiêu) -> tải lại tiến độ Cặp đôi để cá bơi theo
  onAiSeat, // ({ x, y, size, face, handoff } | null) -> báo cho Dashboard chỗ nút AI nổi cần bay tới
  aiSeated = false, // nút AI nổi đã tới ghế và mờ đi -> cá "Bạn" hiện ra thế chỗ
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

  // ── Đồng bộ tiến độ cá: check-in xong (coupleSync đổi) hoặc vừa mở lại tab Tôi -> tải lại dữ liệu Cặp đôi ──
  const lastCoupleSync = useRef(coupleSync);
  useEffect(() => {
    if (!token || lastCoupleSync.current === coupleSync) return;
    lastCoupleSync.current = coupleSync;
    couple.reload();
  }, [coupleSync, token, couple.reload]);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current && token) couple.reload();
    wasActive.current = active;
  }, [active, token, couple.reload]);

  // ── Báo theme của mình (màu chủ đạo + AI-agent) lên server để người kia thấy cá của mình đúng màu ──
  const themeSent = useRef("");
  const myTheme = couple.c?.my_theme;
  useEffect(() => {
    if (!token || !couple.c) return;
    if (myTheme?.accent === accentKey && myTheme?.ai_theme === aiThemeKey) return; // server đã đúng
    const sig = `${accentKey}|${aiThemeKey}`;
    if (themeSent.current === sig) return;
    themeSent.current = sig;
    coupleApi("/api/couple/theme", { method: "PUT", body: JSON.stringify({ accent: accentKey, ai_theme: aiThemeKey }) }).catch(
      () => {
        themeSent.current = ""; // lỗi mạng: lần sau thử lại
      },
    );
  }, [token, couple.c, myTheme?.accent, myTheme?.ai_theme, accentKey, aiThemeKey, coupleApi]);

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

  // ── Ảnh nền thẻ Cặp đôi: bề rộng thẻ -> chiều cao ảnh đúng tỉ lệ ──
  const [cardW, setCardW] = useState(0);
  const [cardH, setCardH] = useState(0);
  const bgW = Math.max(0, cardW - CARD_BORDER * 2);
  const coupleBg = getCoupleBg(accentKey); // ảnh nền theo màu chủ đạo đang chọn
  const bgH = coupleBg.ratio && bgW ? bgW / coupleBg.ratio : 0;

  // ── Nút AI nổi "hoá" thành cá "Bạn" ──
  // Mở tab: KHÔNG có cá nào chờ sẵn. Nút AI bay tới ghế (hiện đúng chỗ cá "Bạn"), tới nơi thì nút mờ đi và cá "Bạn" hiện ra thế chỗ
  // -> cá có đủ nhấp nhô / nghiêng đầu / núp sau dải sóng như cá đối diện. Từ đó ghế CỐ ĐỊNH: cuộn trang chỉ làm cá cuộn theo thẻ,
  // nút không rời ghế rồi quay lại nữa (chỉ rời khi sang tab khác / cá lao vào tim).
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const heartRef = useRef(null);
  const [heartW, setHeartW] = useState(0);
  const [heartBox, setHeartBox] = useState({ y: 0, h: 0 }); // vị trí + cao của khung cá trong thẻ (để nước tràn xuống tận đáy thẻ)
  const heartLive = coupleLinked && couple.c ? coupleHeartProps(couple.c, colors, couple.heart) : null; // dữ liệu mới nhất từ server
  const flameOn = !!heartLive && !!heartLive.bothDone && (heartLive.streak || 0) > 0; // đã hoàn thành + có chuỗi (bùm -> hôn -> cá con)
  // Sau hoàn thành cá "Bạn" VẪN ở lại (bơi ra mép ngoài) nên nút AI nổi vẫn phải nhập vào cá và ẨN suốt thời gian ở tab Tôi (không để hiện thêm 1 con cá thứ hai)
  const wantSeat = !!onAiSeat && !!heartLive; // thẻ Cặp đôi dùng cơ chế nút AI -> cá
  const seatOn = wantSeat && active && heartW > 0;
  const [gaveUp, setGaveUp] = useState(false); // quá lâu không gọi được nút AI sang -> cho cá "Bạn" hiện để thẻ không bị thiếu cá
  const seatSentRef = useRef(false);
  const hideMine = wantSeat && !aiSeated && !gaveUp; // chưa có nút AI tới nơi -> chưa có cá "Bạn"

  // ── Hoạt ảnh cá CHỈ chạy khi người dùng đang nhìn thấy tab Tôi ──
  // Tab Tôi luôn được dựng sẵn (ẩn). Nếu để CoupleHeart nhận dữ liệu mới ngay khi check-in xong thì cá bơi / "bùm" / cá con chạy lúc tab
  // đang ẩn và lúc mở tab chẳng còn gì để xem. Nên khi tab ẩn ta "đóng băng" props đang hiển thị (lần đầu: tiến độ 0, chưa bùm); khi tab
  // hiện ra (và nút AI đã nhập vào cá "Bạn") đợi PLAY_DELAY cho hiệu ứng chuyển tab xong rồi mới cấp dữ liệu mới -> cá bơi, bùm, hôn, cá con.
  //
  // Hoạt ảnh HOÀN THÀNH (bùm -> hôn -> cá con) chỉ xem MỘT lần mỗi ngày + mỗi mức streak: xem xong lưu `ngày|streak` vào máy.
  // Thoát app vào lại (cùng ngày, cùng streak) thì hiện thẳng trạng thái cuối (cá ở hai bên, cá con bơi, lửa trên đầu), không phát lại.
  const celebStore = `couple_celebrated:${username || ""}`;
  const seenRef = useRef(""); // giá trị đã lưu: "ngày|streak" của lần hoàn thành đã xem
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(celebStore)
      .then((v) => { seenRef.current = v || ""; })
      .catch(() => { seenRef.current = ""; })
      .finally(() => { if (alive) setSeenLoaded(true); });
    return () => { alive = false; };
  }, [celebStore]);
  const celebKey = flameOn ? `${localDay()}|${heartLive.streak}` : null;
  const celebDecision = useRef(null); // { key, play } — quyết định MỘT lần cho mỗi celebKey, không đổi giữa chừng khi vừa lưu "đã xem"
  if (celebKey && seenLoaded && celebDecision.current?.key !== celebKey) celebDecision.current = { key: celebKey, play: seenRef.current !== celebKey };
  const skipCeleb = !!celebKey && celebDecision.current?.key === celebKey && !celebDecision.current.play; // đã xem hôm nay -> bỏ qua hoạt ảnh

  const [playOn, setPlayOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setPlayOn(false); // tab ẩn lại -> đóng băng, lần mở sau sẽ phát tiếp phần mới
      return undefined;
    }
    if (hideMine || !seenLoaded) return undefined; // nút AI còn đang bay vào (chưa có cá "Bạn") hoặc chưa đọc xong "đã xem" -> chờ
    const id = setTimeout(() => setPlayOn(true), COUPLE_PLAY_DELAY);
    return () => clearTimeout(id);
  }, [active, hideMine, seenLoaded]);
  // đã ở lại tab đủ lâu (qua cú hôn) -> ghi nhận "đã xem"
  useEffect(() => {
    if (!playOn || !celebKey || !celebDecision.current?.play) return undefined;
    const id = setTimeout(() => {
      seenRef.current = celebKey;
      AsyncStorage.setItem(celebStore, celebKey).catch(() => {});
    }, 3000);
    return () => clearTimeout(id);
  }, [playOn, celebKey, celebStore]);

  const shownRef = useRef(null);
  if (!heartLive) shownRef.current = null;
  else if (!shownRef.current) shownRef.current = { ...heartLive, myProgress: 0, partnerProgress: 0, bothDone: false };
  else if (playOn || skipCeleb) shownRef.current = heartLive;
  const heartP = shownRef.current; // props CoupleHeart thực sự nhận
  const myProg = heartP?.myProgress ?? 0;
  const aiSeatedRef = useRef(aiSeated);
  aiSeatedRef.current = aiSeated;

  const measureSeat = useCallback(() => {
    if (!seatOn || !heartRef.current || aiSeatedRef.current) return; // đã vào ghế rồi thì giữ nguyên, không đo lại
    heartRef.current.measureInWindow((px, py, rw) => {
      if (!rw) return; // tab đang ẩn (display:none) -> chưa có toạ độ thật
      const s = coupleSeat(heartW, flameOn ? 0 : myProg); // đã hoàn thành: cá "Bạn" đứng ở mép ngoài (tiến độ 0) sau khi bơi ra xa
      const x = px + s.x;
      const y = py + s.y;
      if (y < insets.top + 8 || y > winH - insets.bottom - 110) {
        // ghế đang nằm ngoài vùng nhìn thấy (cuộn ra khỏi màn hình / dưới dock) -> nút ở lại mép, cuộn tới nơi sẽ bay vào
        onAiSeat(null);
        return;
      }
      seatSentRef.current = true;
      onAiSeat({ x, y, size: s.size, face: "right", handoff: true });
    });
  }, [seatOn, heartW, myProg, flameOn, insets.top, insets.bottom, winH, onAiSeat]);

  // Thẻ Cặp đôi đã được dựng sẵn khi tab còn ẩn (dữ liệu + ảnh tải trước), nên vừa mở tab là gọi nút AI sang ngay
  useEffect(() => {
    if (!seatOn) {
      onAiSeat?.(null);
      seatSentRef.current = false;
      return undefined;
    }
    setGaveUp(false);
    // đo ngay rồi đo lại liên tục tới khi nút vào ghế (tab còn đang trượt / chưa có toạ độ thì lần sau sửa); toạ độ đổi thì nút tự đổi hướng
    let tries = 0;
    const first = setTimeout(measureSeat, 60);
    const poll = setInterval(() => {
      if (aiSeatedRef.current || ++tries > 25) {
        clearInterval(poll);
        return;
      }
      measureSeat();
    }, 120);
    const giveUp = setTimeout(() => {
      if (!aiSeatedRef.current && !seatSentRef.current) setGaveUp(true);
    }, 2800);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [seatOn, measureSeat, username, memberTier, onAiSeat]);

  // Cuộn: chỉ quan trọng khi nút CHƯA vào ghế (đang bay / chưa bay) -> huỷ chuyến bay theo toạ độ cũ, cuộn xong đo lại.
  // Nút đã vào ghế thì bỏ qua hoàn toàn: ghế cố định, không rời đi.
  const onScrollStart = useCallback(() => {
    if (seatOn && !aiSeatedRef.current) onAiSeat(null);
  }, [seatOn, onAiSeat]);
  const onScrollEnd = useCallback(() => {
    if (!aiSeatedRef.current) setTimeout(measureSeat, 60);
  }, [measureSeat]);

  return (
    <ScrollView
      contentContainerStyle={profileContent}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={onScrollStart}
      onScrollEndDrag={onScrollEnd}
      onMomentumScrollEnd={onScrollEnd}
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
          coupleLinked && bgH > 0 && { minHeight: bgH + CARD_BORDER * 2 }, // thẻ không bao giờ thấp hơn ảnh nền
        ]}
        onLayout={(e) => {
          setCardW(Math.round(e.nativeEvent.layout.width));
          setCardH(Math.ceil(e.nativeEvent.layout.height)); // làm tròn LÊN: làm tròn xuống có thể thiếu nửa pixel ở đáy nước
        }}
        onPress={() => setCoupleOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Cặp đôi"
      >
        {coupleLinked && bgH > 0 && (
          // Ảnh nền: đúng tỉ lệ gốc (không cắt, không méo), neo đáy thẻ; thẻ cao hơn ảnh thì phần trên là màu nền thẻ
          <Image
            source={coupleBg.source}
            resizeMode="stretch"
            fadeDuration={0}
            pointerEvents="none"
            style={{ position: "absolute", left: 0, bottom: 0, width: bgW, height: bgH }}
          />
        )}
        <View style={styles.coupleHead}>
          <Ionicons name="heart" size={18} color={colors.primary} />
          <Text style={[styles.coupleTitle, { color: colors.text }]}>Cặp đôi</Text>
          {couple.needsAttention && (
            <View style={[styles.coupleDot, { backgroundColor: colors.primary }]} />
          )}
          <View style={{ flex: 1 }} />
          {!coupleLinked || !couple.c?.linked ? (
            <Text
              style={[styles.coupleSummary, { color: colors.primaryText }]}
              numberOfLines={1}
            >
              {coupleLinked ? "Đang chờ" : "Liên kết ngay"}
            </Text>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
        </View>
        {coupleLinked ? (
          <>
            <View
              ref={heartRef}
              collapsable={false}
              onLayout={(e) => {
                const { y, width, height } = e.nativeEvent.layout;
                setHeartW(Math.round(width));
                setHeartBox({ y, h: height });
              }}
            >
              <CoupleHeart
                colors={colors}
                partnerName={partnerName}
                bleed={16}
                bleedBottom={
                  bgH > 0 && cardH > 0 && heartBox.h > 0
                    ? // có ảnh nền: nước tràn xuống tận đáy thẻ (thẻ có thể cao hơn nội dung vì minHeight = chiều cao ảnh nền).
                      // +4 = marginBottom của CoupleHeart: heartBox.h gồm lề này nhưng đáy khung nước (ROW_H) thì không -> trước đây hụt vài px
                      Math.max(12, Math.ceil(cardH - CARD_BORDER - (heartBox.y + heartBox.h)) + 4)
                    : couple.c?.linked && couple.c?.together_days > 0 ? 0 : 12
                }
                backdrop={bgH > 0}
                labelColor={bgH > 0 ? "#ffffff" : undefined}
                hideMine={hideMine}
                {...heartP}
                celebrate={!skipCeleb}
              />
            </View>
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
    overflow: "hidden", // nước của CoupleHeart tràn sát viền thẻ, bo theo góc thẻ
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