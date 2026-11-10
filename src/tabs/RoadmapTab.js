import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

// ─── Hằng số bố cục ──────────────────────────────────────────────────────────
const ROW = 118; // khoảng cách dọc giữa 2 mốc
const TOP = 56; // y của nút "Bắt đầu"
const NODE = 62; // đường kính nút mốc thường
const NODE_BIG = 78; // nút mốc lớn (bội số của 100)
const START = 42; // đường kính nút "Bắt đầu"
const LABEL_W = 100; // bề rộng vùng chứa nút + nhãn
const MARKER = 30; // đường kính huy hiệu "bạn đang ở đây"
const HERO_TOP = 12; // khoảng cách từ mép trên tab tới thẻ "Chuỗi hiện tại"
const HERO_GAP = 14; // khoảng hở giữa thẻ và phần roadmap cuộn bên dưới

// ─── Hằng số hiệu năng / thời gian ───────────────────────────────────────────
const DRAW_START = 520; // ms: bắt đầu vẽ đường (sau khi thẻ hạ cánh)
const BUFFER = 2; // số hàng đệm trên/dưới màn hình vẫn được render (ảo hoá)
const INTRO_BUF = 0.5; // đệm của "cửa sổ" các nút được chạy hiệu ứng mở đầu
const VIEW_FALLBACK = 700; // chiều cao màn hình dự phòng khi chưa đo được
const SEG_PAD = 6; // chừa lề quanh mỗi đoạn SVG cho nét + đầu bo tròn
const DOT_PERIOD = 12; // chu kỳ nét chấm (khớp strokeDasharray "0.1 12")
const REVEAL_PAD = 8; // đệm dưới cùng của vùng "vẽ" đường đã đi

// Các mốc quà: 10 → 1000 (bước nhảy tăng dần như bản cũ)
const MILESTONES = (() => {
  const ms = [];
  let cur = 10;
  while (cur <= 1000) {
    ms.push(cur);
    if (cur < 100) cur += 20;
    else if (cur < 500) cur += 30;
    else cur += 40;
  }
  if (!ms.includes(1000)) ms.push(1000);
  return ms;
})();
const POINTS = [0, ...MILESTONES]; // 0 = "Bắt đầu"
const PATH_HEIGHT = TOP + (POINTS.length - 1) * ROW + 110;

const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
const SIN = Easing.inOut(Easing.sin);
const HERO_TEXT_STYLE = { flex: 1, marginLeft: 12 };

// Lấy mẫu đường cong bezier (điểm điều khiển thẳng đứng -> hình chữ S mượt)
const sampleSegment = (a, b) => {
  const dy = ROW * 0.55;
  const p1y = a.y + dy;
  const p2y = b.y - dy;
  const pts = [{ x: a.x, y: a.y, l: 0 }];
  let len = 0;
  let prev = pts[0];
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    const u = 1 - t;
    const x =
      u * u * u * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * b.x;
    const y =
      u * u * u * a.y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * b.y;
    len += Math.hypot(x - prev.x, y - prev.y);
    prev = { x, y, l: len };
    pts.push(prev);
  }
  return { len, pts };
};

const pointAtLength = (pts, l) => {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].l >= l) {
      const seg = pts[i].l - pts[i - 1].l || 1;
      const k = (l - pts[i - 1].l) / seg;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k,
      };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
};

// ─── Tiện ích animation dùng lại ─────────────────────────────────────────────

// Hiện dần + trượt nhẹ (hoặc nảy "pop"). Chạy lại mỗi khi playKey đổi.
const Reveal = memo(function Reveal({
  delay = 0,
  playKey = 0,
  dx = 0,
  dy = 10,
  pop = false,
  style,
  children,
}) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(p);
    if (reduce) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withDelay(
      delay,
      pop
        ? withSpring(1, { damping: 10, stiffness: 180 })
        : withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
    );
  }, [playKey, delay, pop, reduce, p]);
  const s = useAnimatedStyle(() =>
    pop
      ? {
          opacity: Math.min(p.value * 2, 1),
          transform: [{ scale: 0.5 + 0.5 * p.value }],
        }
      : {
          opacity: p.value,
          transform: [
            { translateX: dx * (1 - p.value) },
            { translateY: dy * (1 - p.value) },
          ],
        },
  );
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
});

// Nhấn xuống thì co lại, thả ra thì nảy về (phản hồi theo thao tác của người dùng)
const PressScale = memo(function PressScale({
  onPress,
  style,
  wrapStyle,
  scaleTo = 0.92,
  hitSlop,
  accessibilityLabel,
  children,
}) {
  const s = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        s.value = withSpring(scaleTo, { damping: 15, stiffness: 420 });
      }}
      onPressOut={() => {
        s.value = withSpring(1, { damping: 8, stiffness: 260 });
      }}
      hitSlop={hitSlop}
      style={wrapStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[style, st]}>{children}</Animated.View>
    </Pressable>
  );
});

// Số đếm tăng dần từ 0 tới giá trị (dùng rAF; chỉ setState khi số nguyên đổi)
const CountUp = memo(function CountUp({ value, playKey, delay = 300, style }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce || value <= 0) {
      setN(value);
      return;
    }
    setN(0);
    const dur = Math.min(1000, 450 + value * 5);
    let raf;
    let t0;
    const timer = setTimeout(() => {
      const tick = (t) => {
        if (t0 == null) t0 = t;
        const k = Math.min((t - t0) / dur, 1);
        setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value, playKey, delay, reduce]);
  return <Text style={style}>{n}</Text>;
});

// Hình tròn trôi chậm (trang trí nền). Chỉ chạy khi tab đang hiện.
const Drift = memo(function Drift({ style, amp = 6, dur = 4200, running }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(p);
    if (reduce || !running) return;
    p.value = withRepeat(withTiming(1, { duration: dur, easing: SIN }), -1, true);
    return () => cancelAnimation(p);
  }, [p, dur, reduce, running]);
  const s = useAnimatedStyle(() => ({
    transform: [
      { translateX: amp * (p.value - 0.5) * 2 },
      { translateY: amp * (0.5 - p.value) },
    ],
  }));
  return <Animated.View pointerEvents="none" style={[style, s]} />;
});

// ─── Vòng sóng lan toả (chỉ chạy khi tab đang hiện) ──────────────────────────
const PulseRing = memo(({ color, size, running }) => {
  const reduce = useReducedMotion();
  const p = useSharedValue(1); // 1 = đã tắt hẳn (opacity 0)
  useEffect(() => {
    cancelAnimation(p);
    if (reduce || !running) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withRepeat(
      withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(p);
  }, [p, reduce, running]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - p.value),
    transform: [{ scale: 1 + 0.7 * p.value }],
  }));
  if (reduce) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
});

// ─── Thanh tiến độ: chạy đầy + vệt sáng quét qua sau khi đầy ────────────────
const ProgressBar = memo(
  ({
    pct,
    trackColor,
    fillColor,
    height = 10,
    delay = 0,
    shimmer = false,
    shimmerColor = "rgba(255,255,255,0.6)",
  }) => {
    const reduce = useReducedMotion();
    const p = useSharedValue(0);
    const sh = useSharedValue(0);
    const [w, setW] = useState(0);

    useEffect(() => {
      if (reduce) {
        p.value = pct;
        return;
      }
      p.value = withDelay(
        delay,
        withTiming(pct, { duration: 1000, easing: Easing.out(Easing.cubic) }),
      );
      if (shimmer && pct > 0) {
        sh.value = 0;
        sh.value = withDelay(
          delay + 900,
          withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
        );
      }
    }, [pct, delay, shimmer, reduce, p, sh]);

    const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
    const shStyle = useAnimatedStyle(() => ({
      opacity: sh.value > 0 && sh.value < 1 ? 1 : 0,
      transform: [{ translateX: -56 + (w * pct + 56) * sh.value }],
    }));

    return (
      <View
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: trackColor,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            {
              height,
              borderRadius: height / 2,
              backgroundColor: fillColor,
              overflow: "hidden",
            },
            fillStyle,
          ]}
        >
          {shimmer && (
            <Animated.View
              pointerEvents="none"
              style={[
                { position: "absolute", top: 0, bottom: 0, width: 56 },
                shStyle,
              ]}
            >
              <LinearGradient
                colors={["rgba(255,255,255,0)", shimmerColor, "rgba(255,255,255,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          )}
        </Animated.View>
      </View>
    );
  },
);

// ─── Ngọn lửa trong thẻ: nảy ra rồi "thở" nhẹ ────────────────────────────────
const HeroFlame = memo(function HeroFlame({ playKey, active, style }) {
  const reduce = useReducedMotion();
  const pop = useSharedValue(0);
  const flick = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(pop);
    if (reduce) {
      pop.value = 1;
      return;
    }
    pop.value = 0;
    pop.value = withDelay(240, withSpring(1, { damping: 7, stiffness: 150 }));
    return () => cancelAnimation(pop);
  }, [playKey, reduce, pop]);
  useEffect(() => {
    cancelAnimation(flick);
    if (reduce || !active) {
      flick.value = 0;
      return;
    }
    flick.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: SIN }),
          withTiming(0, { duration: 900, easing: SIN }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(flick);
  }, [active, reduce, flick]);
  const circle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  const flame = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + 0.1 * flick.value },
      { rotate: `${-4 + 8 * flick.value}deg` },
    ],
  }));
  return (
    <Animated.View style={[style, circle]}>
      <Animated.View style={flame}>
        <Ionicons name="flame" size={26} color="#ffffff" />
      </Animated.View>
    </Animated.View>
  );
});

// ─── Một nút mốc quà ─────────────────────────────────────────────────────────
// animate=false: nút hiện sẵn, KHÔNG chạy spring/delay (các nút ngoài màn hình
// mở đầu, hoặc nút mới được cuộn tới) -> không tốn công khi chuyển tab.
const MilestoneNode = memo(function MilestoneNode({
  milestone,
  x,
  y,
  state, // "done" | "next" | "locked"
  animate,
  delay,
  active,
  playKey,
  colors,
  styles,
  onPress,
}) {
  const reduce = useReducedMotion();
  const handlePress = useCallback(() => onPress(milestone), [onPress, milestone]);
  const isBig = milestone % 100 === 0;
  const size = isBig ? NODE_BIG : NODE;

  const pop = useSharedValue(animate ? 0 : 1);
  const badge = useSharedValue(animate ? 0 : 1);
  const breathe = useSharedValue(0);

  // Phát hiệu ứng xuất hiện (chỉ khi tab đang hiện)
  useEffect(() => {
    if (!animate || !active) return;
    cancelAnimation(pop);
    cancelAnimation(badge);
    if (reduce) {
      pop.value = 1;
      badge.value = 1;
      return;
    }
    pop.value = 0;
    badge.value = 0;
    pop.value = withDelay(
      delay,
      withSpring(1, { damping: 11, stiffness: 170, mass: 0.8 }),
    );
    badge.value = withDelay(
      delay + 260,
      withSpring(1, { damping: 7, stiffness: 220 }),
    );
    // `active` cố ý không nằm trong deps: tab mở lại sẽ đổi playKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, delay, animate, reduce]);

  // Ẩn khi tab ẩn (không nháy lúc mở lại); nút không animate luôn hiện
  useEffect(() => {
    if (!animate) {
      pop.value = 1;
      badge.value = 1;
    } else if (!active) {
      pop.value = 0;
      badge.value = 0;
    }
  }, [animate, active, pop, badge]);

  // mốc kế tiếp "thở" nhẹ để gợi ý đây là đích đến
  useEffect(() => {
    cancelAnimation(breathe);
    if (state !== "next" || reduce || !active) {
      breathe.value = 0;
      return;
    }
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 950, easing: SIN }),
        withTiming(0, { duration: 950, easing: SIN }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(breathe);
  }, [state, reduce, active, breathe]);

  const wrapAnim = useAnimatedStyle(() => ({
    opacity: Math.min(pop.value * 1.5, 1),
    transform: [
      { translateY: 16 * (1 - pop.value) },
      { scale: 0.6 + 0.4 * pop.value },
    ],
  }));
  const breatheAnim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.05 * breathe.value }],
  }));
  const badgeAnim = useAnimatedStyle(() => ({
    transform: [{ scale: badge.value }],
  }));

  const nodeStyle =
    state === "done"
      ? {
          backgroundColor: colors.primary,
          borderColor: colors.primaryPale,
          borderWidth: 4,
          shadowColor: colors.primary,
          shadowOpacity: 0.4,
        }
      : state === "next"
        ? {
            backgroundColor: colors.card,
            borderColor: colors.primary,
            borderWidth: 4,
            shadowColor: colors.primary,
            shadowOpacity: 0.25,
          }
        : {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: 3,
            shadowColor: colors.dockShadow,
            shadowOpacity: 0.06,
          };

  const iconName =
    state === "locked"
      ? "lock-closed"
      : isBig
        ? state === "done"
          ? "trophy"
          : "trophy-outline"
        : state === "done"
          ? "gift"
          : "gift-outline";
  const iconColor =
    state === "done"
      ? "#ffffff"
      : state === "next"
        ? colors.primary
        : colors.textMuted;

  const pill =
    state === "done"
      ? { bg: colors.primarySoft, fg: colors.primaryText, border: colors.primaryBorder }
      : state === "next"
        ? { bg: colors.primary, fg: "#ffffff", border: colors.primary }
        : { bg: colors.card, fg: colors.textMuted, border: colors.border };

  return (
    <Animated.View
      style={[
        styles.nodeWrap,
        { left: x - LABEL_W / 2, top: y - size / 2, width: LABEL_W },
        wrapAnim,
      ]}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          },
          breatheAnim,
        ]}
      >
        {state === "next" && (
          <PulseRing color={colors.primary} size={size} running={active} />
        )}
        <PressScale
          hitSlop={6}
          onPress={handlePress}
          accessibilityLabel={`Mốc ${milestone} ngày`}
          style={[
            styles.node,
            { width: size, height: size, borderRadius: size / 2 },
            nodeStyle,
          ]}
        >
          {state === "done" && (
            <LinearGradient
              colors={[colors.primaryLight, colors.primary]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
            />
          )}
          <Ionicons name={iconName} size={isBig ? 32 : 26} color={iconColor} />
        </PressScale>
        {state === "done" && (
          <Animated.View
            pointerEvents="none"
            style={[styles.checkBadge, badgeAnim]}
          >
            <Ionicons name="checkmark" size={11} color="#ffffff" />
          </Animated.View>
        )}
      </Animated.View>

      <View
        style={[
          styles.labelPill,
          { backgroundColor: pill.bg, borderColor: pill.border },
        ]}
      >
        <Text style={[styles.labelText, { color: pill.fg }]}>
          {milestone} ngày
        </Text>
      </View>
    </Animated.View>
  );
});

// ─── Lớp SVG đường đi ─────────────────────────────────────────────────────────
// Trước đây: 1 <Svg> cao ~3900dp (Android cấp 1 bitmap cỡ cả view ≈ 40MB+) và
// animate strokeDashoffset -> mỗi frame vẽ lại toàn bộ bitmap đó.
// Giờ: mỗi đoạn nối 2 mốc là 1 <Svg> nhỏ, TĨNH, và chỉ render các đoạn gần màn
// hình. Hiệu ứng "vẽ dần" làm bằng transform của khung cắt (chạy trên UI thread,
// không vẽ lại SVG).
const TrackSegment = memo(function TrackSegment({ seg, color }) {
  return (
    <Svg
      width={seg.w}
      height={seg.h}
      pointerEvents="none"
      style={{ position: "absolute", left: seg.left, top: seg.top }}
    >
      <Path
        d={seg.d}
        stroke={color}
        strokeOpacity={0.4}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="0.1 12"
        strokeDashoffset={seg.phase}
        fill="none"
      />
    </Svg>
  );
});

const ProgressSegment = memo(function ProgressSegment({ seg, color }) {
  const partial = seg.frac < 1;
  return (
    <Svg
      width={seg.w}
      height={seg.h}
      pointerEvents="none"
      style={{ position: "absolute", left: seg.left, top: seg.top }}
    >
      <Path
        d={seg.d}
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={
          partial ? `${seg.len * seg.frac} ${seg.len + 10}` : undefined
        }
        fill="none"
      />
    </Svg>
  );
});

const PathLayer = memo(function PathLayer({
  segs,
  range,
  draw,
  revealH,
  hasProgress,
  pathW,
  mutedColor,
  primaryColor,
}) {
  // Khung cắt trượt xuống, nội dung bên trong trượt ngược lại -> lộ dần từ trên
  // xuống (đường đi luôn đơn điệu theo trục y nên giống hệt "vẽ theo đường").
  const clipStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -revealH * (1 - draw.value) }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: revealH * (1 - draw.value) }],
  }));

  if (!range) return null;
  // đoạn j nối nút j với nút j+1
  const lo = Math.max(range.a - 1, 0);
  const hi = Math.min(range.b, segs.length - 1);
  const visible = [];
  for (let j = lo; j <= hi; j++) visible.push(segs[j]);

  return (
    <>
      {visible.map((seg) => (
        <TrackSegment key={`t${seg.j}`} seg={seg} color={mutedColor} />
      ))}
      {hasProgress && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              width: pathW,
              height: revealH,
              overflow: "hidden",
            },
            clipStyle,
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", left: 0, top: 0, width: pathW, height: revealH },
              innerStyle,
            ]}
          >
            {visible.map(
              (seg) =>
                seg.frac > 0 && (
                  <ProgressSegment
                    key={`p${seg.j}`}
                    seg={seg}
                    color={primaryColor}
                  />
                ),
            )}
          </Animated.View>
        </Animated.View>
      )}
    </>
  );
});

// ─── Hiệu ứng pháo giấy khi mở quà ───────────────────────────────────────────
const Particle = memo(function Particle({ cfg }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      cfg.delay,
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) }),
    );
  }, [p, cfg.delay]);
  const s = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : p.value < 0.55 ? 1 : (1 - p.value) / 0.45,
    transform: [
      { translateX: Math.cos(cfg.angle) * cfg.dist * p.value },
      {
        translateY:
          Math.sin(cfg.angle) * cfg.dist * p.value + 36 * p.value * p.value,
      },
      { rotate: `${cfg.spin * p.value}deg` },
      { scale: 1 - 0.3 * p.value },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: cfg.size,
          height: cfg.size * (cfg.round ? 1 : 1.6),
          marginLeft: -cfg.size / 2,
          marginTop: -cfg.size / 2,
          borderRadius: cfg.round ? cfg.size / 2 : 2,
          backgroundColor: cfg.color,
        },
        s,
      ]}
    />
  );
});

const ConfettiBurst = memo(function ConfettiBurst({ colors, center }) {
  const reduce = useReducedMotion();
  const parts = useMemo(() => {
    const palette = [
      colors.primary,
      colors.primaryLight,
      "#fbbf24",
      "#22c55e",
      "#60a5fa",
      "#f472b6",
    ];
    const N = 14;
    return Array.from({ length: N }, (_, i) => ({
      angle: (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
      dist: 70 + Math.random() * 50,
      size: 6 + Math.random() * 5,
      color: palette[i % palette.length],
      round: i % 3 === 0,
      spin: (Math.random() - 0.5) * 540,
      delay: 200 + Math.random() * 80,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (reduce) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: center, top: center }}
    >
      {parts.map((cfg, i) => (
        <Particle key={i} cfg={cfg} />
      ))}
    </View>
  );
});

// Icon trong modal: nảy vào rồi lắc (quà: vui; khoá: từ chối nhẹ)
const ModalIcon = memo(function ModalIcon({ unlocked, colors, styles }) {
  const reduce = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    const T = (v, d) =>
      withTiming(v, { duration: d, easing: Easing.inOut(Easing.quad) });
    r.value = unlocked
      ? withDelay(
          380,
          withSequence(T(-14, 90), T(12, 110), T(-8, 100), T(5, 90), T(0, 90)),
        )
      : withDelay(
          300,
          withSequence(T(-10, 60), T(10, 70), T(-8, 60), T(6, 60), T(0, 60)),
        );
  }, [unlocked, reduce, r]);
  const rot = useAnimatedStyle(() => ({
    transform: [{ rotate: `${r.value}deg` }],
  }));
  return (
    <Animated.View
      entering={ZoomIn.delay(120).springify().damping(10)}
      style={[
        styles.modalIconWrap,
        { backgroundColor: unlocked ? colors.primarySoft : colors.background },
      ]}
    >
      {unlocked && <ConfettiBurst colors={colors} center={44} />}
      <Animated.View style={rot}>
        <Ionicons
          name={unlocked ? "gift" : "lock-closed"}
          size={44}
          color={unlocked ? colors.primary : colors.textMuted}
        />
      </Animated.View>
    </Animated.View>
  );
});

// ─── Modal quà tặng (tách riêng + memo: nội dung chỉ mount khi mở) ───────────
const GiftModal = memo(function GiftModal({
  data,
  streak,
  colors,
  styles,
  onClose,
}) {
  const unlocked = data?.type === "unlocked";
  const remain = data ? Math.max(data.streak - streak, 0) : 0;
  return (
    <Modal
      visible={!!data}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          entering={ZoomIn.springify().damping(15).mass(0.8)}
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.card,
              borderColor: unlocked ? colors.primaryPale : colors.border,
            },
          ]}
        >
          <ModalIcon unlocked={unlocked} colors={colors} styles={styles} />

          <Animated.View
            entering={FadeInDown.delay(220).duration(300)}
            style={[
              styles.modalBadge,
              {
                backgroundColor: unlocked ? colors.primarySoft : colors.background,
              },
            ]}
          >
            <Ionicons
              name={unlocked ? "checkmark-circle" : "lock-closed"}
              size={13}
              color={unlocked ? colors.primaryText : colors.textMuted}
            />
            <Text
              style={[
                styles.modalBadgeText,
                { color: unlocked ? colors.primaryText : colors.textMuted },
              ]}
            >
              {unlocked ? "ĐÃ MỞ KHOÁ" : "CHƯA MỞ KHOÁ"}
            </Text>
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.delay(280).duration(300)}
            style={[styles.modalTitle, { color: colors.text }]}
          >
            Mốc {data?.streak} ngày
          </Animated.Text>

          <Animated.View
            entering={FadeInDown.delay(340).duration(320)}
            style={[
              styles.modalMessageBox,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalMessage, { color: colors.text }]}>
              {data?.message}
            </Text>
          </Animated.View>

          {!unlocked && data && (
            <Animated.View
              entering={FadeInDown.delay(400).duration(320)}
              style={{ width: "100%", marginTop: 16 }}
            >
              <ProgressBar
                delay={500}
                pct={clamp01(streak / data.streak)}
                trackColor={colors.border}
                fillColor={colors.primary}
                height={8}
                shimmer
              />
              <Text style={[styles.modalRemain, { color: colors.textMuted }]}>
                {streak}/{data.streak} ngày · còn {remain} ngày nữa
              </Text>
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInDown.delay(460).duration(320)}
            style={{ width: "100%" }}
          >
            <PressScale
              scaleTo={0.96}
              onPress={onClose}
              accessibilityLabel="Đóng"
              wrapStyle={{ width: "100%" }}
              style={[
                styles.closeBtn,
                { backgroundColor: colors.primary, shadowColor: colors.primary },
              ]}
            >
              <Text style={styles.closeBtnText}>Đóng</Text>
            </PressScale>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
});

// ─── Cụm cố định: tiêu đề + thẻ "Chuỗi hiện tại" (tách riêng + memo) ─────────
// Component này không bị render lại khi cuộn danh sách mốc.
const HeroDock = memo(function HeroDock({
  streak,
  unlockedCount,
  nextMilestone,
  heroPct,
  active,
  playKey,
  onPlay,
  onDockHeight,
  colors,
  styles,
}) {
  const reduce = useReducedMotion();
  const [heroH, setHeroH] = useState(0);
  const dropY = useSharedValue(-500);

  // Thẻ thả xuống mỗi lần tab xuất hiện. Khi tab ẩn: đẩy ra khỏi mép trên.
  useEffect(() => {
    cancelAnimation(dropY);
    if (!active) {
      dropY.value = -500;
      return;
    }
    if (heroH <= 0) return;
    if (reduce) {
      dropY.value = 0;
      onPlay();
      return;
    }
    dropY.value = -(heroH + HERO_TOP + 30);
    dropY.value = withDelay(
      80,
      withSpring(0, { damping: 15, stiffness: 120, mass: 0.9 }),
    );
    onPlay();
  }, [active, heroH, reduce, dropY, onPlay]);

  const dropStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dropY.value }],
  }));

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => onDockHeight(Math.round(e.nativeEvent.layout.height))}
      style={styles.heroDock}
    >
      <View style={styles.dockHeader}>
        <Text style={styles.title}>Bản đồ của em bé 🎀</Text>
        <Text style={styles.subtitle}>Dành riêng cho "Em bé của Bình"</Text>
      </View>

      {/* khung cắt: thẻ trượt xuống từ dưới mép tiêu đề */}
      <View style={styles.heroClip}>
        <Animated.View
          onLayout={(e) => setHeroH(Math.round(e.nativeEvent.layout.height))}
          style={dropStyle}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Drift
              style={styles.heroBlobA}
              amp={6}
              dur={4600}
              running={active}
            />
            <Drift
              style={styles.heroBlobB}
              amp={5}
              dur={5400}
              running={active}
            />

            <View style={styles.heroTop}>
              <HeroFlame
                playKey={playKey}
                active={active}
                style={styles.heroFlame}
              />
              <Reveal
                delay={300}
                playKey={playKey}
                dx={-10}
                dy={0}
                style={HERO_TEXT_STYLE}
              >
                <Text style={styles.heroLabel}>CHUỖI HIỆN TẠI</Text>
                <View style={styles.heroValueRow}>
                  <CountUp
                    value={streak}
                    playKey={playKey}
                    delay={360}
                    style={styles.heroValue}
                  />
                  <Text style={styles.heroUnit}>ngày</Text>
                </View>
              </Reveal>
              <Reveal pop delay={520} playKey={playKey} style={styles.heroChip}>
                <Ionicons name="gift" size={13} color="#ffffff" />
                <Text style={styles.heroChipText}>
                  {unlockedCount}/{MILESTONES.length}
                </Text>
              </Reveal>
            </View>

            <ProgressBar
              key={playKey}
              delay={380}
              pct={heroPct}
              trackColor="rgba(255,255,255,0.28)"
              fillColor="#ffffff"
              height={9}
              shimmer
              shimmerColor={colors.primaryLight}
            />
            <Reveal delay={700} playKey={playKey} dy={6}>
              <Text style={styles.heroHint}>
                {nextMilestone
                  ? `Còn ${nextMilestone - streak} ngày nữa để mở quà mốc ${nextMilestone}`
                  : "Bạn đã mở hết mọi mốc quà! 🎉"}
              </Text>
            </Reveal>
          </LinearGradient>
        </Animated.View>
      </View>
    </View>
  );
});

// ─── Màn hình chính ──────────────────────────────────────────────────────────
const RoadmapTab = memo(function RoadmapTab({
  streak,
  gifts,
  selectedGiftModal,
  setSelectedGiftModal,
  roadmapContent,
  active = true, // tab Quà tặng đang được mở -> mỗi lần mở lại chạy hiệu ứng mở đầu
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduce = useReducedMotion();

  const scrollRef = useRef(null);
  const didScroll = useRef(false);
  const scrollY = useRef(0);
  const [dockH, setDockH] = useState(0); // chiều cao cả cụm cố định (tiêu đề + thẻ)
  const [playKey, setPlayKey] = useState(0); // đổi key -> hiệu ứng mở đầu chạy lại
  const [pathW, setPathW] = useState(0);
  const [pathY, setPathY] = useState(null);
  const [viewH, setViewH] = useState(0);
  const [ready, setReady] = useState(false); // hoãn phần nặng sang khung hình sau
  const [range, setRange] = useState(null); // {a,b}: các nút đang được render (ảo hoá)
  const [intro, setIntro] = useState(null); // {a,b}: các nút chạy hiệu ứng mở đầu

  const draw = useSharedValue(0); // 0 → 1: tiến độ vẽ đường đã đi
  const markerPop = useSharedValue(0);
  const bob = useSharedValue(0);

  const handlePlay = useCallback(() => setPlayKey((k) => k + 1), []);

  // Cho khung hình đầu (thẻ + khung) và hiệu ứng chuyển tab chạy trước,
  // rồi mới dựng phần nặng (2 khung hình + một nhịp ngắn).
  useEffect(() => {
    let r2;
    let timer;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        timer = setTimeout(() => setReady(true), 120);
      });
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const blockH = dockH + 2; // roadmap bắt đầu ngay dưới cụm cố định

  // ── Số liệu tổng quan ──
  const unlockedCount = useMemo(
    () => MILESTONES.filter((m) => streak >= m).length,
    [streak],
  );
  const nextIdx = MILESTONES.findIndex((m) => m > streak); // -1 = mở hết
  const nextMilestone = nextIdx >= 0 ? MILESTONES[nextIdx] : null;
  const prevMilestone = nextIdx > 0 ? MILESTONES[nextIdx - 1] : 0;
  const heroPct = nextMilestone
    ? clamp01((streak - prevMilestone) / (nextMilestone - prevMilestone))
    : 1;

  // ── Hình học của đường đi (tính lại khi đổi bề rộng hoặc streak) ──
  const geo = useMemo(() => {
    if (pathW <= 0) return null;
    const nodes = POINTS.map((m, j) => ({
      m,
      j,
      x: j === 0 ? pathW / 2 : j % 2 === 1 ? pathW * 0.27 : pathW * 0.73,
      y: TOP + j * ROW,
    }));
    const dy = ROW * 0.55;
    const segs = []; // mỗi đoạn = 1 <Svg> nhỏ với toạ độ cục bộ
    let progLen = 0;
    let partial = null;
    let endY = TOP; // y (trong hệ toạ độ đường đi) nơi phần đã đi kết thúc
    let cumLen = 0; // chiều dài tích luỹ, dùng để nối liền pha nét chấm
    for (let j = 0; j < nodes.length - 1; j++) {
      const a = nodes[j];
      const b = nodes[j + 1];
      const { len, pts } = sampleSegment(a, b);
      const left = Math.min(a.x, b.x) - SEG_PAD;
      const top = a.y - SEG_PAD;
      const ax = a.x - left;
      const bx = b.x - left;
      const d = `M ${ax} ${SEG_PAD} C ${ax} ${SEG_PAD + dy}, ${bx} ${SEG_PAD + ROW - dy}, ${bx} ${SEG_PAD + ROW}`;
      const frac = clamp01((streak - a.m) / (b.m - a.m));
      segs.push({
        j,
        d,
        len,
        frac,
        left,
        top,
        w: Math.abs(b.x - a.x) + SEG_PAD * 2,
        h: ROW + SEG_PAD * 2,
        phase: cumLen % DOT_PERIOD,
      });
      cumLen += len;
      if (frac >= 1) {
        progLen += len;
        endY = b.y;
      } else if (frac > 0) {
        progLen += len * frac;
        const marker = pointAtLength(pts, len * frac);
        partial = { marker };
        endY = marker.y;
      }
    }
    const drawDur = Math.min(Math.max(progLen * 1.1, 650), 1800);
    return {
      nodes,
      segs,
      progLen,
      partial,
      drawDur,
      endY,
      revealH: endY + REVEAL_PAD,
    };
  }, [pathW, streak]);

  // ── Ảo hoá: chỉ render các nút nằm gần màn hình ──
  const calcRange = useCallback(
    (y, buf) => {
      const vh = viewH || VIEW_FALLBACK;
      const py = pathY ?? 0;
      const lo = Math.ceil((y - buf * ROW - py - TOP) / ROW);
      const hi = Math.floor((y + vh + buf * ROW - py - TOP) / ROW);
      return { a: Math.max(lo, 0), b: Math.min(hi, POINTS.length - 1) };
    },
    [viewH, pathY],
  );

  const onScroll = useCallback(
    (e) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollY.current = y;
      if (!didScroll.current) return;
      const r = calcRange(y, BUFFER);
      setRange((prev) => (prev && prev.a === r.a && prev.b === r.b ? prev : r));
    },
    [calcRange],
  );

  // Đo lại viewH / pathY xong thì tính lại cửa sổ ảo hoá (không cần chờ cuộn)
  useEffect(() => {
    if (!didScroll.current) return;
    const r = calcRange(scrollY.current, BUFFER);
    setRange((prev) => (prev && prev.a === r.a && prev.b === r.b ? prev : r));
  }, [calcRange]);

  // ── Nhảy thẳng tới mốc hiện tại lần đầu (không animate -> không giật) ──
  useEffect(() => {
    if (didScroll.current || !geo || pathY == null || !ready || dockH <= 0) {
      return;
    }
    const idx = nextIdx >= 0 ? nextIdx + 1 : POINTS.length - 1;
    const y = Math.max(pathY + geo.nodes[idx].y - 300, 0);
    didScroll.current = true;
    scrollY.current = y;
    scrollRef.current?.scrollTo({ y, animated: false });
    setRange(calcRange(y, BUFFER));
    setIntro(calcRange(y, INTRO_BUF));
  }, [geo, pathY, ready, dockH, nextIdx, calcRange]);

  // Khi tab ẩn: chốt "cửa sổ" nút sẽ chạy hiệu ứng ở lần mở lại
  useEffect(() => {
    if (!active && didScroll.current) {
      setIntro(calcRange(scrollY.current, INTRO_BUF));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const introHasStart = !!intro && intro.a <= 1;

  // ── Vẽ đường đã đi + huy hiệu "bạn đang ở đây" ──
  useEffect(() => {
    cancelAnimation(draw);
    cancelAnimation(markerPop);
    if (!active || !geo || !intro) {
      draw.value = 0;
      markerPop.value = 0;
      return;
    }
    if (reduce) {
      draw.value = 1;
      markerPop.value = 1;
      return;
    }
    markerPop.value = 0;
    if (introHasStart) {
      // điểm bắt đầu đang trong màn hình -> vẽ đường dần dần
      draw.value = 0;
      draw.value = withDelay(
        DRAW_START,
        withTiming(1, {
          duration: geo.drawDur,
          easing: Easing.inOut(Easing.cubic),
        }),
      );
      markerPop.value = withDelay(
        DRAW_START + geo.drawDur - 80,
        withSpring(1, { damping: 9, stiffness: 170 }),
      );
    } else {
      // đang ở sâu phía dưới: đường hiện sẵn, chỉ nảy huy hiệu
      draw.value = 1;
      markerPop.value = withDelay(
        DRAW_START,
        withSpring(1, { damping: 9, stiffness: 170 }),
      );
    }
  }, [active, geo, intro, introHasStart, playKey, reduce, draw, markerPop]);

  // huy hiệu bồng bềnh nhẹ (chỉ khi tab hiện)
  useEffect(() => {
    cancelAnimation(bob);
    if (reduce || !active) {
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: SIN }),
        withTiming(0, { duration: 1100, easing: SIN }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(bob);
  }, [active, reduce, bob]);

  const markerStyle = useAnimatedStyle(() => ({
    opacity: Math.min(markerPop.value * 2, 1),
    transform: [{ translateY: -4 * bob.value }, { scale: markerPop.value }],
  }));

  // thời điểm bật lên của từng nút trong cửa sổ mở đầu
  const revealDelay = (j) => {
    if (!geo || !intro) return 0;
    if (!introHasStart) return DRAW_START - 200 + (j - intro.a) * 65;
    if (geo.nodes[j].y <= geo.endY) {
      // nút bật lên đúng lúc "đầu bút" (khung cắt) lướt tới nó
      return DRAW_START + clamp01(geo.nodes[j].y / geo.revealH) * geo.drawDur;
    }
    return DRAW_START + geo.drawDur + Math.min((j - unlockedCount) * 70, 560);
  };

  const handleMilestonePress = useCallback(
    (milestone) => {
      const giftObj = gifts?.find((g) => g.streak_required === milestone);
      if (streak >= milestone) {
        setSelectedGiftModal({
          type: "unlocked",
          streak: milestone,
          message:
            giftObj?.gift_text ??
            "Quà anh chưa chuẩn bị kịp, em nhắn đòi quà anh nha! 🎁",
        });
      } else {
        setSelectedGiftModal({
          type: "locked",
          streak: milestone,
          message: `Ráng uống nước ngoan thêm chút nữa! Đạt chuỗi ${milestone} ngày để mở quà bí mật nhe 💖`,
        });
      }
    },
    [gifts, streak, setSelectedGiftModal],
  );

  const handleCloseModal = useCallback(
    () => setSelectedGiftModal(null),
    [setSelectedGiftModal],
  );

  const visibleNodes =
    geo && ready && range
      ? geo.nodes.slice(Math.max(range.a, 1), range.b + 1)
      : [];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[roadmapContent, { paddingTop: blockH }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={onScroll}
        onLayout={(e) => setViewH(Math.round(e.nativeEvent.layout.height))}
      >
        {/* ── Đường đi quà tặng ── */}
        <View
          style={{ height: PATH_HEIGHT, marginTop: 22 }}
          onLayout={(e) => {
            setPathW(Math.round(e.nativeEvent.layout.width));
            setPathY(e.nativeEvent.layout.y);
          }}
        >
          {geo && ready && (
            <>
              <PathLayer
                segs={geo.segs}
                range={range}
                draw={draw}
                revealH={geo.revealH}
                hasProgress={geo.progLen > 0}
                pathW={pathW}
                mutedColor={colors.textMuted}
                primaryColor={colors.primary}
              />

              {/* Nút "Bắt đầu" */}
              <Reveal
                pop
                delay={DRAW_START - 120}
                playKey={playKey}
                style={[
                  styles.nodeWrap,
                  {
                    left: geo.nodes[0].x - LABEL_W / 2,
                    top: geo.nodes[0].y - START / 2,
                    width: LABEL_W,
                  },
                ]}
              >
                <View
                  style={[
                    styles.startNode,
                    { width: START, height: START, borderRadius: START / 2 },
                  ]}
                >
                  <Ionicons name="flag" size={20} color="#ffffff" />
                </View>
                <View
                  style={[
                    styles.labelPill,
                    {
                      backgroundColor: colors.primarySoft,
                      borderColor: colors.primaryBorder,
                    },
                  ]}
                >
                  <Text style={[styles.labelText, { color: colors.primaryText }]}>
                    Bắt đầu
                  </Text>
                </View>
              </Reveal>

              {/* Các mốc quà (chỉ những nút gần màn hình) */}
              {visibleNodes.map((n) => {
                const animate = !!intro && n.j >= intro.a && n.j <= intro.b;
                return (
                  <MilestoneNode
                    key={n.m}
                    milestone={n.m}
                    x={n.x}
                    y={n.y}
                    animate={animate}
                    delay={animate ? revealDelay(n.j) : 0}
                    active={active}
                    playKey={playKey}
                    state={
                      streak >= n.m
                        ? "done"
                        : n.j - 1 === nextIdx
                          ? "next"
                          : "locked"
                    }
                    colors={colors}
                    styles={styles}
                    onPress={handleMilestonePress}
                  />
                );
              })}

              {/* Huy hiệu "bạn đang ở đây" trên đoạn đường đang đi dở */}
              {geo.partial && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.markerWrap,
                    {
                      left: geo.partial.marker.x - MARKER / 2,
                      top: geo.partial.marker.y - MARKER / 2,
                    },
                    markerStyle,
                  ]}
                >
                  <PulseRing
                    color={colors.primary}
                    size={MARKER}
                    running={active}
                  />
                  <View style={styles.marker}>
                    <Ionicons name="flame" size={16} color={colors.primary} />
                  </View>
                </Animated.View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <HeroDock
        streak={streak}
        unlockedCount={unlockedCount}
        nextMilestone={nextMilestone}
        heroPct={heroPct}
        active={active}
        playKey={playKey}
        onPlay={handlePlay}
        onDockHeight={setDockH}
        colors={colors}
        styles={styles}
      />

      <GiftModal
        data={selectedGiftModal}
        streak={streak}
        colors={colors}
        styles={styles}
        onClose={handleCloseModal}
      />
    </View>
  );
});

export default RoadmapTab;

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (c) =>
  StyleSheet.create({
    // Tiêu đề (nằm trong cụm cố định)
    dockHeader: { paddingHorizontal: 20, paddingTop: HERO_TOP },
    title: {
      fontSize: 26,
      fontWeight: "900",
      color: c.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 13.5,
      fontWeight: "600",
      color: c.textMuted,
      marginTop: 3,
    },

    // Thẻ "Chuỗi hiện tại" cố định
    heroDock: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      paddingBottom: HERO_GAP,
      backgroundColor: c.background, // che phần roadmap cuộn ngang qua vùng cố định
    },
    heroClip: {
      marginTop: 12,
      marginHorizontal: 20,
      borderRadius: 24,
      overflow: "hidden", // thẻ chui ra từ dưới mép tiêu đề, không tràn lên trên
    },
    hero: {
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 14,
      overflow: "hidden",
    },
    heroBlobA: {
      position: "absolute",
      right: -36,
      top: -46,
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    heroBlobB: {
      position: "absolute",
      left: -28,
      bottom: -56,
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor: "rgba(255,255,255,0.08)",
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    heroFlame: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    heroLabel: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 10.5,
      fontWeight: "800",
      letterSpacing: 1,
    },
    heroValueRow: { flexDirection: "row", alignItems: "baseline", marginTop: 0 },
    heroValue: {
      color: "#ffffff",
      fontSize: 34,
      fontWeight: "900",
      letterSpacing: -1,
      fontVariant: ["tabular-nums"], // số đếm không bị giật bề rộng
    },
    heroUnit: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 15,
      fontWeight: "700",
      marginLeft: 6,
    },
    heroHint: {
      color: "rgba(255,255,255,0.92)",
      fontSize: 12.5,
      fontWeight: "600",
      marginTop: 8,
    },
    heroChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(255,255,255,0.2)",
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    heroChipText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },

    // Nút + nhãn trên đường đi
    nodeWrap: { position: "absolute", alignItems: "center" },
    node: {
      alignItems: "center",
      justifyContent: "center",
      shadowOffset: { width: 0, height: 5 },
      shadowRadius: 9,
      elevation: 5,
    },
    startNode: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      borderWidth: 3,
      borderColor: c.primaryPale,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 4,
    },
    checkBadge: {
      position: "absolute",
      right: -2,
      top: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "#22c55e",
      borderWidth: 2.5,
      borderColor: c.background,
      alignItems: "center",
      justifyContent: "center",
    },
    labelPill: {
      marginTop: 8,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 3.5,
    },
    labelText: { fontSize: 11.5, fontWeight: "800" },
    markerWrap: {
      position: "absolute",
      width: MARKER,
      height: MARKER,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 20,
    },
    marker: {
      width: MARKER,
      height: MARKER,
      borderRadius: MARKER / 2,
      backgroundColor: c.card,
      borderWidth: 3,
      borderColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 6,
      elevation: 6,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(15,23,42,0.65)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalCard: {
      width: "88%",
      maxWidth: 350,
      borderRadius: 32,
      borderWidth: 2.5,
      padding: 24,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 12,
    },
    modalIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    modalBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 14,
    },
    modalBadgeText: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8 },
    modalTitle: { fontSize: 22, fontWeight: "900", marginTop: 10 },
    modalMessageBox: {
      width: "100%",
      borderRadius: 18,
      borderWidth: 1,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginTop: 14,
    },
    modalMessage: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      fontWeight: "500",
    },
    modalRemain: {
      fontSize: 12,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 8,
    },
    closeBtn: {
      width: "100%",
      paddingVertical: 14,
      borderRadius: 16,
      alignItems: "center",
      marginTop: 22,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    closeBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  });