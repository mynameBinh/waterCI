// =============================================================================
// CoupleTab — tab "Cặp đôi" ở dock (chuyển toàn bộ từ thẻ Cặp đôi của tab Tôi sang đây).
//   • Trên cùng bên trái: tiêu đề "♥ Cặp đôi" + dòng chữ nhỏ ngày bắt đầu quen nhau; bên phải: nút bánh răng mở Tuỳ chỉnh.
//   • Ngay dưới: khung CoupleHeart (ảnh nền biển + hai con cá) GHIM CỐ ĐỊNH, không cuộn theo nội dung bên dưới.
//     Chạm vào con cá của người kia -> mở tab "Theo dõi" (chỉ có khi Dashboard cho phép, qua onOpenTheoDoi).
//   • Phần cuộn bên dưới (CoupleHome): tiến độ cả hai · ô Nhật ký + ô Kỷ niệm.
//   • Chưa liên kết / đang chờ: hiện màn LinkIntro / LinkWaiting (có tim đôi riêng) thay cho khung ghim.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn } from "../components/agent/AgentHomeCards";
import { Skeleton } from "../components/agent/CoupleDiary";
import CoupleHeart, { coupleSeat } from "../components/agent/CoupleHeart";
import CoupleHome from "../components/agent/CoupleHome";
import { LinkIntro, LinkWaiting } from "../components/agent/CoupleLink";
import { coupleHeartProps } from "../components/agent/CoupleSheet";
import { avatarSource, useAvatarUri } from "../components/Avatar";
import { useTheme } from "../context/ThemeContext";

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const formatSinceDate = (raw) => {
  if (!raw) return "";
  const s = String(raw).split("T")[0];
  const parts = s.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return s;
};

const COUPLE_PLAY_DELAY = 350;
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
const CARD_TOP = 14 + 20 + 12;
const AUTO_REFRESH_MS = 15000; // tab đang mở thì tự lấy dữ liệu mới mỗi bấy nhiêu ms
const SYNC_WAIT_MS = 1500; // vừa mở tab: chờ tối đa bấy nhiêu ms cho dữ liệu mới về rồi mới cho cá chạy hoạt ảnh (quá hạn thì chạy luôn)
const CONTENT_SHIFT = 20; // hạ mọi thứ nằm dưới tiêu đề xuống thêm bấy nhiêu px

const CoupleTab = memo(function CoupleTab({
  username,
  token,
  apiBase,
  couple,
  active = true,
  coupleSync = 0,
  onAiSeat,
  aiSeated = false,
  onOpenTheoDoi,
  bottomPad = 110,
}) {
  const { colors, accentKey } = useTheme();
  const { c, failed, reload } = couple;
  const linked = !!c?.linked;
  const hasPartner = !!c?.partner_username;
  const partnerName = c?.partner_username;

  // ── state mở bảng Tuỳ chỉnh ──
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── tải lại khi check-in xong / vừa mở tab ──
  const lastSync = useRef(coupleSync);
  useEffect(() => {
    if (!token || lastSync.current === coupleSync) return;
    lastSync.current = coupleSync;
    reload();
  }, [coupleSync, token, reload]);
  // Vừa mở tab: lấy dữ liệu mới TRƯỚC, trong lúc đó `syncing` = true -> cá chưa chạy hoạt ảnh (tránh chạy theo dữ liệu cũ rồi giật sang dữ liệu mới)
  const wasActive = useRef(active);
  const mountedRef = useRef(true);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => {
    if (active && !wasActive.current && token) {
      let done = false;
      let cap = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(cap);
        if (mountedRef.current) setSyncing(false);
      };
      cap = setTimeout(finish, SYNC_WAIT_MS);
      setSyncing(true);
      Promise.resolve()
        .then(() => reload())
        .catch(() => {})
        .finally(finish);
    }
    wasActive.current = active;
  }, [active, token, reload]);

  // ── TỰ ĐỘNG LÀM MỚI: tab đang hiển thị -> tải lại định kỳ + ngay khi app quay lại từ nền ──
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const busyRef = useRef(false);
  const silentReload = useCallback(async () => {
    if (busyRef.current) return; // chưa xong lần trước thì bỏ qua, không chồng request
    busyRef.current = true;
    try {
      await reloadRef.current?.();
    } catch {
      /* im lặng: lần sau tự thử lại */
    } finally {
      busyRef.current = false;
    }
  }, []);
  useEffect(() => {
    if (!active || !token) return undefined;
    const id = setInterval(() => {
      if (AppState.currentState === "active") silentReload();
    }, AUTO_REFRESH_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") silentReload();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [active, token, silentReload]);

  // ── ảnh đại diện (ảnh người kia lấy từ server) ──
  const myUri = useAvatarUri(username);
  const mySource = useMemo(
    () => avatarSource({ apiBase, token, username, version: c?.my_avatar_v }),
    [apiBase, token, username, c?.my_avatar_v],
  );
  const partnerSource = useMemo(
    () => avatarSource({ apiBase, token, username: partnerName, version: c?.partner_avatar_v }),
    [apiBase, token, partnerName, c?.partner_avatar_v],
  );
  const avatars = useMemo(
    () => ({ myName: username, myUri, mySource: myUri ? null : mySource, partnerSource }),
    [username, myUri, mySource, partnerSource],
  );

  // ── kéo để làm mới ──
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />;

  // ── Ảnh nền khung cá: bề rộng khung -> chiều cao ảnh đúng tỉ lệ ──
  const [cardW, setCardW] = useState(0);
  const [cardH, setCardH] = useState(0);
  const bgW = Math.max(0, cardW - CARD_BORDER * 2);
  const coupleBg = getCoupleBg(accentKey);
  const bgH = coupleBg.ratio && bgW ? bgW / coupleBg.ratio : 0;

  // ── Nút AI nổi "hoá" thành cá "Bạn" ──
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const heartRef = useRef(null);
  const [heartW, setHeartW] = useState(0);
  const [heartBox, setHeartBox] = useState({ y: 0, h: 0 });
  const heartLive = linked ? coupleHeartProps(c, colors, couple.heart) : null;
  const flameOn = !!heartLive && !!heartLive.bothDone && (heartLive.streak || 0) > 0;
  const wantSeat = !!onAiSeat && !!heartLive;
  const seatOn = wantSeat && active && heartW > 0;
  const [gaveUp, setGaveUp] = useState(false);
  const seatSentRef = useRef(false);
  const hideMine = wantSeat && !aiSeated && !gaveUp;

  // ── Hoạt ảnh cá CHỈ chạy khi người dùng đang nhìn thấy tab ──
  const celebStore = `couple_celebrated:${username || ""}`;
  const seenRef = useRef("");
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
  const celebDecision = useRef(null);
  if (celebKey && seenLoaded && celebDecision.current?.key !== celebKey) celebDecision.current = { key: celebKey, play: seenRef.current !== celebKey };
  const skipCeleb = !!celebKey && celebDecision.current?.key === celebKey && !celebDecision.current.play;

  const [playOn, setPlayOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setPlayOn(false);
      return undefined;
    }
    if (hideMine || !seenLoaded || syncing) return undefined;
    const id = setTimeout(() => setPlayOn(true), COUPLE_PLAY_DELAY);
    return () => clearTimeout(id);
  }, [active, hideMine, seenLoaded, syncing]);
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
  else if (!active) {
    // Tab đang ẩn (người dùng không nhìn thấy): cho cá về đúng tiến độ MỚI ngay, lặng lẽ.
    // Chỉ giữ bothDone/streak cũ để màn "BÙM" + cá con mới sinh vẫn chờ tới lúc mở tab mới diễn.
    shownRef.current = { ...heartLive, bothDone: shownRef.current.bothDone, streak: shownRef.current.streak };
  }
  const heartP = shownRef.current;
  const myProg = heartP?.myProgress ?? 0;
  const aiSeatedRef = useRef(aiSeated);
  aiSeatedRef.current = aiSeated;

  const measureSeat = useCallback(() => {
    if (!seatOn || !heartRef.current || aiSeatedRef.current) return;
    heartRef.current.measureInWindow((px, py, rw) => {
      if (!rw) return;
      const s = coupleSeat(heartW, flameOn ? 0 : myProg);
      const x = px + s.x;
      const y = py + s.y;
      if (y < insets.top + 8 || y > winH - insets.bottom - 110) {
        onAiSeat(null);
        return;
      }
      seatSentRef.current = true;
      onAiSeat({ x, y, size: s.size, face: "right", handoff: true });
    });
  }, [seatOn, heartW, myProg, flameOn, insets.top, insets.bottom, winH, onAiSeat]);

  useEffect(() => {
    if (!seatOn) {
      onAiSeat?.(null);
      seatSentRef.current = false;
      return undefined;
    }
    setGaveUp(false);
    let tries = 0;
    const first = setTimeout(measureSeat, 110);
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
  }, [seatOn, measureSeat, username, onAiSeat]);

  // rời tab / tab bị huỷ -> luôn trả nút AI về chỗ cũ (không để ghế treo lại)
  const onAiSeatRef = useRef(onAiSeat);
  onAiSeatRef.current = onAiSeat;
  useEffect(
    () => () => {
      onAiSeatRef.current?.(null);
    },
    [],
  );

  // ── giao diện ──
  // Đã liên kết: bố cục CỐ ĐỊNH, không cuộn (đã có tự làm mới). Các màn chưa liên kết / đang tải cần nhập liệu -> vẫn cuộn được.
  const fixedLayout = !!c && hasPartner && linked;
  let body;
  if (!c) {
    body = failed ? (
      <View>
        <Text style={[styles.msg, { color: colors.textMuted }]}>Chưa tải được thông tin cặp đôi. Kiểm tra kết nối rồi thử lại nhé.</Text>
        <Btn colors={colors} ghost label="Thử lại" onPress={reload} style={styles.fullBtn} />
      </View>
    ) : (
      <Skeleton colors={colors} />
    );
  } else if (!hasPartner) {
    body = (
      <View style={[styles.panel, { backgroundColor: colors.card }]}>
        <LinkIntro colors={colors} couple={couple} myName={username} />
      </View>
    );
  } else if (!linked) {
    body = (
      <View style={[styles.panel, { backgroundColor: colors.card }]}>
        <LinkWaiting colors={colors} couple={couple} myName={username} />
      </View>
    );
  } else {
    body = (
      <>
        {failed && (
          <TouchableBanner colors={colors} onPress={reload} />
        )}
        <CoupleHome
          colors={colors}
          couple={couple}
          avatars={avatars}
          settingsOpen={settingsOpen}
          onCloseSettings={() => setSettingsOpen(false)}
        />
      </>
    );
  }

  return (
    <View style={styles.root}>
      {/* tiêu đề + ngày bắt đầu quen nhau + bánh răng tuỳ chỉnh góc trên bên phải */}
      <View style={styles.titleRow}>
        <View>
          <View style={styles.titleLine}>
            <Ionicons name="heart" size={22} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              Cặp đôi
            </Text>
          </View>
          {linked && !!c?.together_since && !c?.pending && (
            <Text style={[styles.sinceText, { color: colors.textMuted }]}>
              Bên nhau từ {formatSinceDate(c.together_since)}
            </Text>
          )}
        </View>

        <View style={{ flex: 1 }} />

        {linked && (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setSettingsOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Tuỳ chỉnh cặp đôi"
            style={[styles.gearBtn, { backgroundColor: colors.primarySoft }]}
          >
            <Ionicons name="settings-outline" size={19} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* khung cá ghim cố định (không nằm trong ScrollView) */}
      {linked && heartP && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
            bgH > 0 && { minHeight: bgH + CARD_BORDER * 2 },
          ]}
          onLayout={(e) => {
            setCardW(Math.round(e.nativeEvent.layout.width));
            setCardH(Math.ceil(e.nativeEvent.layout.height));
          }}
        >
          {bgH > 0 && (
            <Image
              source={coupleBg.source}
              resizeMode="stretch"
              fadeDuration={0}
              pointerEvents="none"
              style={{ position: "absolute", left: 0, bottom: 0, width: bgW, height: bgH }}
            />
          )}
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
                  ? Math.max(12, Math.ceil(cardH - CARD_BORDER - (heartBox.y + heartBox.h)) + 4)
                  : 12
              }
              backdrop={bgH > 0}
              labelColor={bgH > 0 ? "#ffffff" : undefined}
              hideMine={hideMine}
              {...heartP}
              celebrate={!skipCeleb}
              onPartnerPress={onOpenTheoDoi}
            />
          </View>
        </View>
      )}

      {fixedLayout ? (
        <View style={[styles.flex, { paddingTop: 12, paddingBottom: bottomPad }]}>{body}</View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {body}
        </ScrollView>
      )}
    </View>
  );
});

const TouchableBanner = ({ colors, onPress }) => (
  <Text
    onPress={onPress}
    accessibilityRole="button"
    style={[styles.banner, { backgroundColor: colors.primarySoft, color: colors.primaryText }]}
  >
    Chưa cập nhật được, đang hiện dữ liệu đã có. Chạm để thử lại.
  </Text>
);

export default CoupleTab;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, paddingHorizontal: 20, paddingTop: Platform.OS === "android" ? 12 : 20 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 + CONTENT_SHIFT },
  titleLine: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", marginLeft: 8 },
  sinceText: { fontSize: 12.5, fontWeight: "600", marginTop: 2, marginLeft: 30 },
  gearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: 22,
    borderWidth: CARD_BORDER,
    paddingHorizontal: 16,
    paddingTop: CARD_TOP,
    paddingBottom: 12,
    overflow: "hidden",
  },
  panel: { borderRadius: 16, padding: 14 },
  msg: { fontSize: 13, lineHeight: 19 },
  fullBtn: { width: "100%", marginTop: 12 },
  banner: { fontSize: 12.5, fontWeight: "700", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, overflow: "hidden" },
});