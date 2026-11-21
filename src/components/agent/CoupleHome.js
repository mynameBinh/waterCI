// =============================================================================
// CoupleHome — phần nội dung CUỘN của tab "Cặp đôi" (nằm dưới khung cá CoupleHeart đã ghim cố định):
//   1. Thẻ tiến độ của cả hai (thanh phát sáng + ảnh đại diện, dùng leftLines của CoupleSheet cho "việc còn lại")[cite: 1]
//   2. Hai ô ngang hàng:[cite: 1]
//        • Nhật ký  — "Câu hỏi hôm nay" + câu trả lời của người kia (avatar + bong bóng như đoạn chat). Chạm -> bảng Nhật ký[cite: 1]
//        • Kỷ niệm  — trái tim to đập nhịp + số ngày bên nhau. Chạm -> bảng Kỷ niệm[cite: 1]
//   3. Các bảng BottomSheet cho Nhật ký, Kỷ niệm, và Tuỳ chỉnh (mở từ icon bánh răng trên CoupleTab).
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../Avatar";
import { useTheme } from "../../context/ThemeContext";
import { DiaryTab, useDiary } from "./CoupleDiary";
import { BabyFish, FACES_LEFT } from "./CoupleHeart";
import { MemoriesTab, useFetch } from "./CoupleMemories";
import { SettingsTab } from "./CoupleSettings";
import { leftLines } from "./CoupleSheet";

// ── bảng trượt từ dưới lên ──[cite: 1]
const BottomSheet = ({ visible, onClose, title, colors, children }) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetRoot} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)", opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              height: height * 0.86,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [height * 0.5, 0] }) }],
            },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Đóng"
              style={[styles.sheetClose, { backgroundColor: colors.background }]}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.sheetBody}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// kéo để làm mới cho từng bảng[cite: 1]
function useSheetRefresh(colors, fn) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fn();
    } finally {
      setRefreshing(false);
    }
  };
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />;
}

// ── trái tim to đập nhịp (native driver) ──[cite: 1]
const BeatHeart = memo(function BeatHeart({ color, size = 70 }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  const scale = t.interpolate({ inputRange: [0, 0.12, 0.26, 0.38, 0.52, 1], outputRange: [1, 1.2, 1, 1.1, 1, 1] });
  const ringScale = t.interpolate({ inputRange: [0, 0.6], outputRange: [0.8, 1.55], extrapolate: "clamp" });
  const ringOp = t.interpolate({ inputRange: [0, 0.02, 0.6], outputRange: [0, 0.3, 0], extrapolate: "clamp" });
  const box = size + 26;
  return (
    <View style={{ width: box, height: box, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        pointerEvents="none"
        style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color, opacity: ringOp, transform: [{ scale: ringScale }] }}
      />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name="heart" size={size} color={color} />
      </Animated.View>
    </View>
  );
});

const Dot = ({ colors }) => <View style={[styles.dot, { backgroundColor: colors.primary }]} />;

// ── 1. tiến độ của cả hai ──
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
const progOf = (x) => (typeof x?.progress === "number" ? x.progress : x?.day_complete ? 1 : 0);

const SwimFish = memo(function SwimFish({ i, shapeKey, accentA, accentB }) {
  return (
    <View style={{ transform: [{ scaleX: FACES_LEFT ? -1 : 1 }] }}>
      <BabyFish i={i} shapeKey={shapeKey} accentA={accentA} accentB={accentB} />
    </View>
  );
});

const GlowBar = memo(function GlowBar({ colors, value, done, fish, tint }) {
  const bar = tint || colors.primary;
  const target = done ? 1 : clamp01(value);
  const grow = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(grow, { toValue: target, friction: 9, tension: 50, useNativeDriver: false }).start();
  }, [target, grow]);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  const width = grow.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={[styles.track, { backgroundColor: colors.border }]}>
      <Animated.View style={[styles.fillGlow, { width, backgroundColor: bar, shadowColor: bar }]}>
        <View style={styles.fillClip}>
          <View style={styles.fillTop} />
        </View>
        <Animated.View pointerEvents="none"
          style={[styles.tip, { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [1.5, -1.5] }) }] }]}>
          {fish}
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const PersonProgress = ({ colors, name, st, avatar, fish, tint }) => {
  const done = !!st?.day_complete;
  const pct = Math.round(clamp01(done ? 1 : progOf(st)) * 100);
  const lines = leftLines(st).slice(0, 2);
  return (
    <View style={styles.person}>
      <Avatar name={name} size={34} ringColor={done ? tint || colors.primary : colors.primaryBorder} {...avatar} />
      <View style={{ flex: 1 }}>
        <View style={styles.personHead}>
          <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          {done ? (
            <View style={[styles.donePill, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
              <Text style={[styles.doneText, { color: colors.primaryText }]}>Xong hôm nay</Text>
            </View>
          ) : (
            <Text style={[styles.pct, { color: colors.primaryText }]}>{pct}%</Text>
          )}
        </View>
        <GlowBar colors={colors} value={progOf(st)} done={done} fish={fish} tint={tint} />
        {lines.map((l, i) => (
          <View key={i} style={styles.leftRow}>
            <Ionicons name={l.icon} size={13} color={colors.textMuted} />
            <Text style={[styles.leftText, { color: colors.textMuted }]} numberOfLines={1}>{l.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const ProgressCard = ({ colors, c, avatars }) => {
  const p = c.partner;
  const shown = !!c.visible && !!p;
  const bothDone = shown && !!c.me?.day_complete && !!p.day_complete;
  const myAv = { uri: avatars.myUri, source: avatars.myUri ? null : avatars.mySource };
  const pAv = { source: avatars.partnerSource };
  const { aiThemeKey, accentKey, accents } = useTheme();
  const pTheme = c.partner_theme || {};
  const pShape = pTheme.ai_theme || aiThemeKey;
  const pAccent = pTheme.accent || accentKey;
  const pTint = accents?.[pAccent]?.primary || colors.primary;
  const myFish = <SwimFish i={0} shapeKey={aiThemeKey} accentA={accentKey} />;
  const pFish = <SwimFish i={1} shapeKey={pShape} accentA={pAccent} />;
  return (
    <View style={[styles.card, styles.progressCard, { backgroundColor: colors.card, borderColor: colors.primaryBorder, shadowColor: colors.primary }]}>
      <View style={styles.progHead}>
        <Ionicons name="sparkles" size={16} color={colors.primary} />
        <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 6 }]}>Tiến độ hôm nay</Text>
        <View style={{ flex: 1 }} />
        {bothDone && <Text style={[styles.together, { color: colors.primaryText }]}>Cùng về đích rồi</Text>}
      </View>
      {shown ? (
        <View>
          <PersonProgress colors={colors} name="Bạn" st={c.me} avatar={myAv} fish={myFish} tint={colors.primary} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <PersonProgress colors={colors} name={p.name || c.partner_username} st={p} avatar={pAv} fish={pFish} tint={pTint} />
        </View>
      ) : (
        <Text style={[styles.msg, { color: colors.textMuted }]}>
          Cần cả hai bật chia sẻ tiến độ để cùng thấy nhau. Bạn có thể bật trong biểu tượng bánh răng góc trên.
        </Text>
      )}
    </View>
  );
};

// ── 2a. ô Nhật ký ──[cite: 1]
const DiaryTile = ({ colors, c, avatars, partnerName, attention, onPress }) => {
  let partnerText = null;
  if (c.question) {
    if (c.partner_answer) partnerText = c.partner_answer;
    else if (!c.my_answer) partnerText = "Bạn trả lời trước để xem câu trả lời của bạn ấy nhé.";
    else partnerText = "Bạn ấy chưa trả lời.";
  }
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button" accessibilityLabel="Mở nhật ký"
      style={[styles.tile, styles.tileDiary, { backgroundColor: colors.card }]}>
      <View style={styles.tileHead}>
        <Ionicons name="book-outline" size={16} color={colors.primary} />
        <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 6 }]}>Nhật ký</Text>
        {attention && <Dot colors={colors} />}
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
      </View>
      <Text style={[styles.label, { color: colors.textMuted }]}>Câu hỏi hôm nay</Text>
      <Text style={[styles.question, { color: colors.text }]} numberOfLines={3}>
        {c.question || "Chưa có câu hỏi hôm nay."}
      </Text>
      {!!partnerText && (
        <View style={styles.chatRow}>
          <Avatar name={partnerName} size={24} ringColor={colors.primaryBorder} source={avatars.partnerSource} />
          <View style={[styles.bubble, { backgroundColor: colors.background }]}>
            <Text style={[styles.bubbleText, { color: c.partner_answer ? colors.text : colors.textMuted }]} numberOfLines={3}>
              {partnerText}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ── 2b. ô Kỷ niệm ──[cite: 1]
const MemoriesTile = ({ colors, c, attention, onPress }) => {
  const since = c.together_since;
  const pending = c.pending;
  let big = null;
  let small = "";
  if (since && !pending) {
    big = String(c.together_days ?? 0);
    small = "ngày bên nhau";
  } else if (pending) {
    small = pending.by_me ? "Đang chờ bạn ấy xác nhận ngày" : "Bạn ấy đề xuất một ngày, chạm để xem";
  } else {
    small = "Chạm để đặt ngày bên nhau";
  }
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button" accessibilityLabel="Mở kỷ niệm"
      style={[styles.tile, { backgroundColor: colors.card }]}>
      <View style={styles.tileHead}>
        <Ionicons name="ribbon-outline" size={16} color={colors.primary} />
        <Text style={[styles.cardTitle, { color: colors.text, marginLeft: 6 }]}>Kỷ niệm</Text>
        {attention && <Dot colors={colors} />}
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
      </View>
      <View style={styles.memBody}>
        <BeatHeart color={colors.primary} />
        {big != null && <Text style={[styles.bigNum, { color: colors.primaryText }]}>{big}</Text>}
        <Text style={[styles.memSmall, { color: colors.textMuted }]}>{small}</Text>
      </View>
    </TouchableOpacity>
  );
};

const CoupleHome = ({ colors, couple, avatars, settingsOpen, onCloseSettings }) => {
  const { c, api } = couple;
  const [sheet, setSheet] = useState(null); // "diary" | "memories" | null[cite: 1]
  const linked = !!c?.linked;
  const diary = useDiary(api, linked && sheet === "diary");
  const together = useFetch(api, "/api/couple/together", linked && sheet === "memories");
  const weekly = useFetch(api, "/api/couple/weekly", linked && sheet === "memories");
  const close = () => setSheet(null);

  const diaryRefresh = useSheetRefresh(colors, () => Promise.all([couple.reload(), diary.reload()]));
  const memRefresh = useSheetRefresh(colors, () => Promise.all([couple.reload(), together.reload(), weekly.reload()]));
  const setRefresh = useSheetRefresh(colors, () => couple.reload());

  const answer = async (text) => {
    const ok = await couple.sendAnswer(text);
    if (ok) diary.reload();
    return ok;
  };
  const partnerName = c.partner_username;

  return (
    <View>
      <ProgressCard colors={colors} c={c} avatars={avatars} />

      <View style={styles.tiles}>
        <DiaryTile colors={colors} c={c} avatars={avatars} partnerName={partnerName} attention={couple.needsAttention}
          onPress={() => setSheet("diary")} />
        <MemoriesTile colors={colors} c={c} attention={couple.memoriesAttention} onPress={() => setSheet("memories")} />
      </View>

      <BottomSheet visible={sheet === "diary"} onClose={close} title="Nhật ký" colors={colors}>
        <DiaryTab colors={colors} diary={diary} avatars={avatars} partnerName={partnerName} refreshControl={diaryRefresh}
          todayInfo={{ question: c.question, my_answer: c.my_answer, partner_answer: c.partner_answer }} onAnswer={answer} answerErr={couple.err} />
      </BottomSheet>
      <BottomSheet visible={sheet === "memories"} onClose={close} title="Kỷ niệm" colors={colors}>
        <MemoriesTab colors={colors} couple={couple} together={together} weekly={weekly} avatars={avatars} partnerName={partnerName}
          refreshControl={memRefresh} />
      </BottomSheet>
      <BottomSheet visible={!!settingsOpen} onClose={onCloseSettings} title="Tuỳ chỉnh" colors={colors}>
        <SettingsTab colors={colors} couple={couple} heart={couple.heart} saveHeart={couple.saveHeart} partnerName={partnerName}
          refreshControl={setRefresh} />
      </BottomSheet>
    </View>
  );
};

export default CoupleHome;

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 14.5, fontWeight: "800" },
  msg: { fontSize: 13, lineHeight: 19 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  progressCard: { borderWidth: 1, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, overflow: "visible" },
  progHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  together: { fontSize: 12.5, fontWeight: "800" },
  person: { flexDirection: "row", alignItems: "center", gap: 12 },
  personHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  personName: { flex: 1, fontSize: 13.5, fontWeight: "700", marginRight: 8 },
  pct: { fontSize: 13, fontWeight: "800" },
  donePill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  doneText: { fontSize: 12, fontWeight: "800" },
  track: { height: 12, borderRadius: 6 },
  fillGlow: { height: 12, borderRadius: 6, shadowOpacity: 0.55, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } },
  fillClip: { ...StyleSheet.absoluteFillObject, borderRadius: 6, overflow: "hidden" },
  fillTop: { position: "absolute", left: 0, right: 0, top: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.28)" },
  tip: { position: "absolute", right: -13, top: -7, width: 26, height: 26 },
  leftRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  leftText: { flex: 1, fontSize: 12 },
  tiles: { flexDirection: "row", gap: 12, alignItems: "stretch", marginBottom: 12 },
  tile: { flex: 1, borderRadius: 16, padding: 12, minHeight: 190 },
  tileDiary: { flex: 1.45 },
  tileHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  label: { fontSize: 11.5, fontWeight: "700" },
  question: { fontSize: 13.5, lineHeight: 19, fontWeight: "700", marginTop: 2 },
  chatRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10 },
  bubble: { flex: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  bubbleText: { fontSize: 12.5, lineHeight: 17 },
  memBody: { flex: 1, alignItems: "center", justifyContent: "center" },
  bigNum: { fontSize: 28, fontWeight: "800", marginTop: 2 },
  memSmall: { fontSize: 12, textAlign: "center", marginTop: 2 },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, flexShrink: 1 },
  sheetHandle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginBottom: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  sheetClose: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  sheetBody: { flex: 1, paddingHorizontal: 20, paddingTop: 6 },
});