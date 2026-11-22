// =============================================================================
// CoupleHeart — "tim đôi": hai con cá (agent đang dùng, đổi màu theo theme) quay MẶT VÀO NHAU, bơi trên đường nhịp tim.
//   - Mỗi người xong tới đâu thì cá của người đó bơi lại gần trái tim tới đó (myProgress / partnerProgress 0..1).
//     Sau lưng mỗi con cá có vệt nước (tô đậm đường nhịp tim từ mép tới cá) nên cá và nhịp tim dính liền nhau.
//   - Có chuỗi (streak > 0): số chuỗi hiện TRONG quả tim giữa, thay cho icon trái tim.
//   - Khi CẢ HAI xong và có chuỗi (bothDone && streak > 0): hai cá bơi sát tim -> "BÙM" tim nổ, sóng xung kích + tia lửa bắn ra,
//     ngọn lửa (có số chuỗi) bật lên rồi bay lên phía trên đầu, nhường chỗ cho hai cá xích lại HÔN nhau (không ai đè ai).
//     Hôn xong hai cá bơi ra xa hai bên, con cá con MỚI của hôm nay bắn ra giữa hai cá. Đàn cá con (số cá = số chuỗi, màu lai + lệch gen ngẫu nhiên cố định)
//     ở lại mãi theo chuỗi, qua ngày mới vẫn còn; quá đông thì cá cũ lùi ra sau: nhỏ hơn, mờ hơn, bơi cao hơn cho có chiều sâu.
//   - Không còn khung tròn quanh cá (ảnh cá đã xoá phông, bo tròn sẽ cắt hình). frameStyle / partnerFrameStyle vẫn được
//     nhận để nơi gọi cũ không lỗi nhưng không còn tác dụng.
//   - Cảnh biển: 2 lớp sóng nước trôi ngược chiều nhau phía sau, 1 dải sóng mỏng PHÍA TRƯỚC che phần bụng cá (cá như đang
//     ngập trong nước), cá nghiêng đầu + nhấp nhô + tiến về phía nhau, bọt nước bắn sau đuôi, bong bóng nổi lên, san hô mờ ở đáy.
// Props giữ nguyên: colors, mood ("flat"|"calm"|"happy"), partnerName, myProgress, partnerProgress, streak, bothDone,
//   waveStyle, pulseColor, partnerDim, mirrorPartner (true = hai cá nhìn vào nhau), celebrate.
// Hiệu năng: tất cả chuyển động dùng native driver, trừ strokeDashoffset của xung sáng (SVG buộc JS). Loop dừng khi unmount.
// =============================================================================
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { getAiAvatar, getAiAvatarStyle } from "../../context/aiThemes";
import { useTheme } from "../../context/ThemeContext";
import { buildWave } from "./CoupleHeartCatalog";
import FlameStreak, { FLAME } from "./FlameStreak";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const WH = 81; // cạnh ảnh cá (vuông, không crop)
const COLW = 84; // bề rộng cột cá
const FLAME_ROOM = 0; // GIỮ 0 để bố cục/chiều cao thẻ y như cũ (tăng sẽ làm thẻ cao thêm -> hụt ảnh nền)
const START_BACK = 14; // cá xuất phát lùi về sau (ra mép ngoài) bấy nhiêu px -> quãng đường dài hơn, tiến độ 0 không còn như đã đi sẵn ~20%
const WHALE_TOP = 14 + FLAME_ROOM; // cá đặt thấp xuống để bụng chìm dưới mặt nước (tăng nếu muốn chìm sâu hơn)
const MINE_FADE_IN = 140; // cá "Bạn" hiện dần (nằm sau nút AI, cùng cỡ nên không lộ) — nút AI chỉ bắt đầu mờ SAU lúc này (FloatingAIButton: HANDOFF_FADE_DELAY)
const MINE_GROW_DELAY = 200; // chờ nút AI bắt đầu mờ rồi cá mới lớn dần từ cỡ nút lên WH
// Quầng sáng quanh cá để nổi khỏi ảnh nền (chỉnh các số này cho vừa mắt; muốn tắt: GLOW_ON = false)
const GLOW_ON = true;
const GLOW_HALO_OP = 0.4; // độ đậm quầng sáng mềm phía sau cá (0..1)
const GLOW_HALO_SCALE = 1.7; // quầng rộng gấp mấy lần cá
const GLOW_EDGE_OP = 0.8; // độ đậm viền sáng bám theo hình cá (chỉ iOS: Android không vẽ bóng theo hình ảnh)
const GLOW_EDGE_R = 6; // độ toả của viền sáng
const WATER_OPACITY = 0.39; // độ đậm của 3 lớp sóng nước so với trước (1 = như cũ; càng nhỏ càng trong, 0.6 = trong hơn 40%)
const SEA_BACK_OP = 1; // độ đậm phần TÔ NỀN của 2 lớp sóng sau lưng (lớp phủ xuống tận đáy thẻ, nằm dưới chữ tên). 0 = bỏ hẳn mảng nền (vẫn còn đường sóng trắng), 1 = như cũ; muốn nhạt thì thử 0.15-0.3
const CORAL_OP = 1; // hệ số độ đậm 2 cụm san hô tự vẽ ở hai góc đáy (chỉ có khi backdrop=false; chúng nằm ngay sau chữ tên). 0 = ẩn, 1 = như cũ (0.22 / 0.18)
const FAB = 56; // cỡ nút AI nổi (FloatingAIButton SIZE): cá 'Bạn' lớn dần từ cỡ này lên WH khi nút nhập vào cá
const HEART = 40;
const GAP = -2; // khoảng hở giữa cá và tim khi progress = 1 (âm = cá chạm nhẹ vào vòng số chuỗi giữa; tăng lên nếu thấy đè nhiều, 6 = như cũ)
const EDGE = 4; // lề của vệt nước
export const LINE_Y = 62 + FLAME_ROOM; // đường nhịp tim (cá "bơi" ngay trên đường này)
const WAVE_H = 36;
const NAME_DROP = 10; // hạ tên người dùng xuống thấp hơn (px); 0 = vị trí cũ. Khung cao thêm đúng bằng số này để tên không bị cắt
const NAME_TOP = 96 + NAME_DROP + FLAME_ROOM;
const ROW_H = 122 + NAME_DROP + FLAME_ROOM;
const SEA_TOP = LINE_Y - 12; // mép trên của cảnh nước (mặt nước nằm ở LINE_Y)
const SEA_H = ROW_H - SEA_TOP;
const STRIP_H = 38; // dải sóng phía trước (cao SEA_TOP..SEA_TOP+STRIP_H)
const STRIP_FULL = true; // true = dải sóng phía trước kéo dài xuống hết khung nước (tới đáy thẻ) -> không còn mép cứng dưới dải; false = chỉ cao STRIP_H như cũ
// bọt nước bắn sau đuôi: ox = cách mép ngoài của cột cá, dx = bay ra ngoài, dy = bay lên (âm)
const WAKE = [
  { ox: 6, dx: 8, dy: -16, s: 4, dur: 1500, delay: 0 },
  { ox: 10, dx: 14, dy: -11, s: 3, dur: 1900, delay: 500 },
  { ox: 4, dx: 5, dy: -21, s: 2.5, dur: 1700, delay: 900 },
  { ox: 12, dx: 18, dy: -8, s: 3.5, dur: 2100, delay: 1300 },
];
const FLAME_W = 84;
const FLAME_POP = 0.45; // cỡ ngọn lửa lúc bùm lên giữa tim (vừa khe hở hẹp giữa hai cá)
const FLAME_END = 0.5; // cỡ ngọn lửa khi đã bay lên đứng trên đầu hai cá
const FLAME_CY = LINE_Y - 6; // tâm ngọn lửa lúc bùm
const FLAME_DROP = 15; // hạ ngọn lửa chuỗi (sau khi hoàn thành) xuống thêm bấy nhiêu px so với trước; 0 = vị trí cũ
const FLAME_END_CY = WHALE_TOP - 3 - (FLAME_W * FLAME_END) / 2 - 1 + FLAME_DROP; // tâm ngọn lửa khi đã bay lên: đáy lửa nằm ngay trên đỉnh ảnh cá (tính cả biên độ nhấp nhô 3px). Có thể âm = lửa nhô lên trên mép khung, không làm đổi chiều cao khung
const BABY = 26; // cỡ cá con
const BABY_STEP = 30; // bước giữa hai cá con liền kề
const BABY_MIN_Y = LINE_Y - 8; // cá con bơi từ ngang mặt nước trở xuống (chỉnh số này để bơi cao/thấp hơn)
// Đàn cá con theo CHUỖI: số cá = streak (tồn tại suốt, qua ngày mới cũng không mất). Cá mới nhất ở lớp trước (to, rõ);
// khi lớp trước đầy thì cá cũ hơn lùi dần ra lớp sau: nhỏ hơn, mờ hơn, bơi cao hơn (xa hơn) -> có chiều sâu mà vẫn đủ số lượng.
//   size/alpha: cỡ + độ đậm; rows: số hàng chỗ xuất hiện; step: bước ngang; y0/dy: chỗ xuất hiện; down: nhấc đáy vùng bơi lên bấy nhiêu px (xa hơn = nông hơn)
//   lite: lớp xa dùng hoạt ảnh nhẹ (ít chặng bơi, không nhún) để đỡ tốn máy khi chuỗi dài
const MAX_BABIES = 60; // số cá con tối đa thật sự vẽ (chuỗi dài hơn thì vẽ 60 con mới nhất) — tăng được nhưng sẽ nặng máy hơn
const BABY_TIERS = [
  { size: BABY, alpha: 1, rows: 2, step: BABY_STEP, y0: LINE_Y + 12, dy: 28, minY: BABY_MIN_Y, down: 0, lite: false },
  { size: 20, alpha: 0.62, rows: 2, step: 24, y0: LINE_Y + 6, dy: 20, minY: BABY_MIN_Y, down: 14, lite: false },
  { size: 15, alpha: 0.4, rows: 3, step: 18, y0: LINE_Y, dy: 11, minY: BABY_MIN_Y + 4, down: 30, lite: true },
  { size: 11, alpha: 0.26, rows: 4, step: 14, y0: LINE_Y - 2, dy: 7, minY: BABY_MIN_Y + 6, down: 44, lite: true },
];
const centerOut = (n) => {
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, k) => k).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
};
// số ngẫu nhiên CỐ ĐỊNH theo hạt giống (cá con thứ i luôn ra đúng màu đó, mở app lúc nào cũng vậy -> "tồn tại mãi")
const hashStr = (str) => {
  let h = 2166136261;
  for (let k = 0; k < str.length; k += 1) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const seeded = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const KISS_CLOSE = 4; // xích sát thêm bấy nhiêu px khi hôn (0 = vừa chạm khung ảnh; tăng nữa thì mõm hai cá chồng lên nhau, giảm nếu thấy đè)
const KISS_DIST = HEART / 2 + GAP - 1 + KISS_CLOSE; // mỗi cá xích thêm bấy nhiêu px vào giữa để hôn
const SPARKS = 14;
export const FACES_LEFT = true; // ảnh cá gốc quay sang TRÁI; nếu ảnh mới quay phải thì đặt false

const MOODS = {
  flat: { bpm: 40, amp: 0, line: 0.3 },
  calm: { bpm: 66, amp: 1, line: 0.9 },
  happy: { bpm: 92, amp: 1.2, line: 1 },
};
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));

// Tâm con cá "Bạn" so với góc trên-trái của vùng `row` (rộng w) ứng với tiến độ `progress` -> nơi nút AI nổi vào "ngồi".
export const coupleSeat = (w, progress) => {
  const travelMax = Math.max(0, w / 2 - HEART / 2 - GAP - COLW) + START_BACK;
  return { x: COLW / 2 - START_BACK + travelMax * clamp01(progress), y: WHALE_TOP + WH / 2, size: WH };
};

// Ảnh cá: luôn hiện trọn ảnh (contain), không bo tròn nếu theme đã xoá phông, không phóng to thêm
const Agent = memo(function Agent({ source, themeKey, size, flip, dim, glow, gid = "g", alpha = 1 }) {
  const base = getAiAvatarStyle(themeKey) || {};
  const transparent = base.borderRadius === 0;
  const glowing = GLOW_ON && !!glow && !dim; // cá mờ (người kia chưa làm) thì không phát sáng
  const halo = size * GLOW_HALO_SCALE;
  return (
    <View
      style={[
        { width: size, height: size },
        // viền sáng bám theo hình cá (iOS tính bóng theo phần không trong suốt của ảnh)
        glowing && { shadowColor: glow, shadowOpacity: GLOW_EDGE_OP, shadowRadius: GLOW_EDGE_R, shadowOffset: { width: 0, height: 0 } },
      ]}
    >
      {glowing && (
        // quầng sáng mềm toả đều phía sau cá (chạy cả iOS lẫn Android)
        <View pointerEvents="none" style={{ position: "absolute", left: (size - halo) / 2, top: (size - halo) / 2, width: halo, height: halo }}>
        <Svg width={halo} height={halo}>
          <Defs>
            <RadialGradient id={`glow${gid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={glow} stopOpacity={GLOW_HALO_OP} />
              <Stop offset="55%" stopColor={glow} stopOpacity={GLOW_HALO_OP * 0.45} />
              <Stop offset="100%" stopColor={glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={halo / 2} cy={halo / 2} r={halo / 2} fill={`url(#glow${gid})`} />
        </Svg>
        </View>
      )}
      <Image
        source={source}
        resizeMode={transparent ? "contain" : "cover"}
        fadeDuration={0}
        style={{
          width: size,
          height: size,
          borderRadius: transparent ? 0 : size * 0.3,
          opacity: dim ? 0.4 : alpha,
          transform: flip ? [{ scaleX: -1 }] : undefined,
        }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
});

// Lớp sóng nước: path sin dài (w + period) trôi ngang đúng 1 chu kỳ rồi lặp -> liền mạch. Native driver (translateX).
const Water = memo(function Water({ w, amp, period, phase = 0, base, height, color, opacity, reverse, dur, live, crest }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) return undefined;
    const run = Animated.loop(Animated.timing(t, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }));
    run.start();
    return () => run.stop();
  }, [live, dur, t]);
  const total = w + period;
  const { fill, line } = useMemo(() => {
    const pts = [];
    for (let x = 0; x <= total + 4; x += 4) pts.push([x, base + amp * Math.sin((2 * Math.PI * x) / period + phase)]);
    const lineD = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1][0];
    return { line: lineD, fill: `${lineD} L${last} ${height + 2} L0 ${height + 2} Z` }; // +2: tô dư xuống dưới, khung cha (overflow hidden) cắt lại -> không còn khe do khử răng cưa
  }, [total, amp, period, phase, base, height]);
  const x = t.interpolate({ inputRange: [0, 1], outputRange: reverse ? [-period, 0] : [0, -period] });
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: total, height, transform: [{ translateX: x }] }}>
      <Svg width={total} height={height + 2} style={{ position: "absolute", left: 0, top: 0 }}>
        <Path d={fill} fill={color} fillOpacity={opacity} />
        {crest ? <Path d={line} stroke="#ffffff" strokeOpacity={crest} strokeWidth={1.4} fill="none" strokeLinecap="round" /> : null}
      </Svg>
    </Animated.View>
  );
});

// Hạt nhỏ lặp vô hạn: bọt nước bắn (đặc, bay vòng cung) hoặc bong bóng (rỗng, nổi thẳng lên).
const Particle = memo(function Particle({ live, x, y, dx, dy, size, dur, delay, color, ring }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) return undefined;
    v.setValue(0);
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(v, { toValue: 1, duration: dur, easing: ring ? Easing.linear : Easing.out(Easing.quad), useNativeDriver: true })),
    ]);
    run.start();
    return () => run.stop();
  }, [live, delay, dur, ring, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", left: x, top: y, width: size, height: size, borderRadius: size,
        backgroundColor: ring ? "transparent" : color, borderWidth: ring ? 1 : 0, borderColor: color,
        opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, ring ? 0.7 : 0.9, 0] }),
        transform: [
          { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, ring ? dx : dx * 0.6, dx] }) },
          { translateY: v.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, dy, ring ? dy : dy + 10] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, ring ? 1.15 : 0.5] }) },
        ],
      }}
    />
  );
});

// Trái tim nhỏ bay lên giữa hai cá khi hôn nhau (lặp vô hạn, native driver)
const KissHeart = memo(function KissHeart({ x, y, dx, dy, size, dur, delay, color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    ]);
    run.start();
    return () => run.stop();
  }, [delay, dur, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", left: x - size / 2, top: y,
        opacity: v.interpolate({ inputRange: [0, 0.2, 0.7, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [
          { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.1] }) },
        ],
      }}
    >
      <Ionicons name="heart" size={size} color={color} />
    </Animated.View>
  );
});

// Cá con: bắn ra từ chỗ hai cá vừa hôn tới vị trí của mình (spring), rồi BƠI LUNG TUNG tự do trong vùng giữa (bounds):
// mỗi con tự chọn các điểm đến ngẫu nhiên, tốc độ riêng, nghỉ ngắn giữa các chặng, quay đầu theo hướng bơi. children = ảnh cá (hoặc chip "+N" thì wander = false)
const Baby = memo(function Baby({ x, y, size, fromX, fromY, delay, phase, wander, minX, maxX, minY, maxY, instant, alpha = 1, lite = false, children }) {
  const appear = useRef(new Animated.Value(instant ? 1 : 0)).current; // instant: đã xem hoạt ảnh rồi -> hiện sẵn tại chỗ, không bắn ra lại
  const bob = useRef(new Animated.Value(phase)).current;
  const px = useRef(new Animated.Value(0)).current; // dịch ngang so với vị trí xếp ban đầu
  const py = useRef(new Animated.Value(0)).current;
  const face = useRef(new Animated.Value(Math.random() < 0.5 ? 1 : -1)).current; // scaleX: hướng mặt (lật qua 0 nên có cảm giác xoay đầu)
  const legs = useMemo(() => {
    if (!wander) return [];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const out = [];
    let cx = x;
    let cy = y;
    const N = lite ? 4 : 10; // nhiều chặng hơn -> đường bơi ít lặp lại (cá lớp xa chỉ cần ít chặng)
    for (let k = 0; k < N; k += 1) {
      const last = k === N - 1;
      const tx = last ? x : rnd(minX, Math.max(minX, maxX));
      const ty = last ? y : rnd(minY, Math.max(minY, maxY));
      const dist = Math.hypot(tx - cx, ty - cy);
      const speed = Math.random() < 0.25 ? rnd(48, 75) : rnd(24, 40); // px/giây; thỉnh thoảng phóng vọt một đoạn
      out.push({ dx: tx - x, dy: ty - y, dur: Math.max(900, Math.min(4500, (dist / speed) * 1000)), right: tx >= cx, rest: rnd(0, 300) });
      cx = tx;
      cy = ty;
    }
    return out;
  }, [wander, lite, x, y, minX, maxX, minY, maxY]);
  useEffect(() => {
    const swim = legs.length
      ? Animated.loop(Animated.sequence(legs.flatMap((l) => [
          Animated.parallel([
            Animated.timing(px, { toValue: l.dx, duration: l.dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(py, { toValue: l.dy, duration: l.dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(face, { toValue: (l.right ? -1 : 1) * (FACES_LEFT ? 1 : -1), duration: 220, useNativeDriver: true }),
          ]),
          Animated.delay(l.rest),
        ])))
      : null;
    const a = Animated.sequence([
      ...(instant ? [] : [
        Animated.delay(delay),
        Animated.spring(appear, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      ]),
      ...(swim ? [swim] : []),
    ]);
    const b = lite ? null : Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1100 + phase * 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1100 + phase * 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    b?.start();
    return () => { a.stop(); b?.stop(); };
  }, [delay, phase, legs, instant, lite, appear, bob, px, py, face]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", left: x, top: y, width: size, height: size,
        opacity: appear.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, alpha, alpha], extrapolate: "clamp" }),
        transform: [
          { translateX: Animated.add(appear.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }), px) },
          { translateY: Animated.add(appear.interpolate({ inputRange: [0, 1], outputRange: [fromY, 0] }), py) },
          { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
        ],
      }}
    >
      <Animated.View style={{ transform: [
        { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [1.5, -1.5] }) },
        { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ["3deg", "-3deg"] }) },
        ...(wander ? [{ scaleX: face }] : []),
      ] }}>
        {children}
      </Animated.View>
    </Animated.View>
  );
});

// Ngôi sao lấp lánh quanh cặp đôi khi hoàn thành (lặp vô hạn, native driver)
const Twinkle = memo(function Twinkle({ x, y, size, dur, delay, color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(dur * 0.5),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])),
    ]);
    run.start();
    return () => run.stop();
  }, [delay, dur, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", left: x - size / 2, top: y - size / 2,
        opacity: v.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0, 1, 0.9, 0] }),
        transform: [
          { scale: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, 1.15, 0.4] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) },
        ],
      }}
    >
      <Ionicons name="star" size={size} color={color} />
    </Animated.View>
  );
});

// Cá con MÀU LAI: cùng hình dáng cá, xếp chồng ảnh theo màu chủ đạo của mình (lớp dưới, đặc) và của người kia (lớp trên, mờ một phần)
// -> màu pha giữa hai màu mà vẫn giữ nguyên chi tiết (mắt, vây).
//   gene = false (mặc định, thanh tiến độ dùng): như cũ, tỉ lệ pha nhích nhẹ theo i, không đột biến.
//   gene = true (cá con trong khung tim): "biến đổi gen" — tỉ lệ pha ngẫu nhiên 25–75% + (70% số cá) có thêm một lớp màu thứ ba
//   lấy ngẫu nhiên từ bảng màu -> mỗi con lệch màu một chút, tự nhiên. Ngẫu nhiên theo hạt giống (seedKey + màu + i) nên cá thứ i
//   luôn ra đúng màu đó mỗi lần mở app, không đổi theo ngày.
export const BabyFish = memo(function BabyFish({ i, shapeKey, accentA, accentB, size = BABY, gene = false, seedKey = "" }) {
  const { accents } = useTheme();
  const layers = useMemo(() => {
    const mix = !!accentB && accentB !== accentA;
    if (!gene) {
      return [
        { src: getAiAvatar(shapeKey, accentA), a: 1 },
        ...(mix ? [{ src: getAiAvatar(shapeKey, accentB), a: 0.4 + ((i * 7) % 5) * 0.05 }] : []),
      ];
    }
    const rnd = seeded(hashStr(`${seedKey}|${shapeKey}|${accentA}|${accentB || ""}|${i}`));
    const out = [{ src: getAiAvatar(shapeKey, accentA), a: 1 }];
    if (mix) out.push({ src: getAiAvatar(shapeKey, accentB), a: 0.25 + rnd() * 0.5 });
    const keys = Object.keys(accents || {}).filter((k) => k !== accentA && k !== accentB);
    const roll = rnd();
    const pick = rnd();
    const amount = 0.12 + rnd() * 0.28;
    if (keys.length && roll < 0.7) out.push({ src: getAiAvatar(shapeKey, keys[Math.floor(pick * keys.length)]), a: amount });
    return out;
  }, [gene, i, shapeKey, accentA, accentB, seedKey, accents]);
  return (
    <View style={{ width: size, height: size }}>
      {layers.map((l, k) =>
        l.src ? (
          k === 0 ? (
            <Agent key={k} source={l.src} themeKey={shapeKey} size={size} />
          ) : (
            <View key={k} pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Agent source={l.src} themeKey={shapeKey} size={size} alpha={l.a} />
            </View>
          )
        ) : null,
      )}
    </View>
  );
});

const Coral = ({ color, style }) => (
  <Svg width={34} height={26} viewBox="0 0 34 26" style={style}>
    <Path d="M10 26 C10 18 9 13 6 8 M10 20 C12 15 15 12 17 6 M10 22 C9 19 4 17 2 14 M24 26 C24 19 25 14 28 9 M24 21 C22 17 19 15 18 11"
      stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" />
  </Svg>
);

const CoupleHeart = memo(function CoupleHeart({
  colors,
  mood = "flat",
  partnerName,
  myProgress = 0,
  partnerProgress = 0,
  streak = 0,
  bothDone = false,
  waveStyle = "ecg",
  pulseColor,
  partnerDim = false,
  mirrorPartner = true,
  celebrate = true,
  onPartnerPress, // có hàm này thì chạm vào con cá của người kia sẽ gọi nó (tab Cặp đôi dùng để mở "Theo dõi")
  bleed = 0, // nước tràn ra hai bên bằng đúng padding ngang của thẻ chứa (ProfileTab: 16) để không bị viền trống
  backdrop = false, // true = thẻ chứa đã có ảnh nền biển: giữ sóng nước động, bỏ san hô tự vẽ (ảnh đã có)
  labelColor, // màu tên hai người (mặc định colors.text)
  partnerAccent, // màu chủ đạo của người kia (lấy từ server) -> cá bên phải đổi màu theo; thiếu thì dùng màu của mình
  partnerAiTheme, // AI-agent người kia đang dùng
  bleedBottom = 0, // tràn xuống đáy bằng padding dưới của thẻ (nếu bên dưới không có chữ)
  hideMine = false, // true = chưa có cá "Bạn": nút AI nổi đang bay tới (hoặc chưa tới) -> ẩn cả cá, chữ "Bạn" và bọt nước.
  //                   Đặt lại false khi nút đã tới nơi -> cá "Bạn" hiện ra thế chỗ (nút mờ đi cùng lúc), từ đó có đủ nhấp nhô + núp sau sóng
}) {
  const { aiThemeKey, accentKey, accents } = useTheme();
  const agentSrc = getAiAvatar(aiThemeKey, accentKey);
  const partnerThemeKey = partnerAiTheme || aiThemeKey;
  const partnerSrc = getAiAvatar(partnerThemeKey, partnerAccent || accentKey); // cá của người kia theo theme CỦA HỌ
  const tint = pulseColor || colors.primary;
  const glowColor = colors.primaryLight || tint; // màu quầng sáng quanh cá: sáng hơn màu chủ đạo để nổi trên nền
  const partnerGlow = accents?.[partnerAccent]?.light || glowColor;
  const cfg = MOODS[mood] || MOODS.flat;
  const active = mood !== "flat";
  const showFlame = bothDone && streak > 0;
  // Cá bên trái phải bị lật nếu ảnh gốc nhìn sang trái (để nhìn vào giữa); cá bên phải thì giữ nguyên
  const flipLeft = mirrorPartner && FACES_LEFT;
  const flipRight = mirrorPartner && !FACES_LEFT;

  const [w, setW] = useState(0);
  const [kissOn, setKissOn] = useState(false); // hai cá đã hôn -> bật tim nhỏ bay lên + sao lấp lánh
  const [babyOn, setBabyOn] = useState(false); // hai cá đã tách ra -> cá con hiện ở giữa
  const live = true; // cá vẫn ở lại trên màn hình sau khi "bùm" nên các loop luôn chạy

  const k = waveStyle === "love" ? 0.85 : 0.62;
  const { d, len } = useMemo(() => buildWave(waveStyle, w, WAVE_H / 2, cfg.amp * k), [waveStyle, w, cfg.amp, k]);
  const seg = Math.min(70, len * 0.4);
  const travelBase = Math.max(0, w / 2 - HEART / 2 - GAP - COLW); // quãng từ mép cột cá tới sát tim
  const travelMax = travelBase + START_BACK; // quãng cá bơi thật sự khi progress 0 -> 1 (cá xuất phát lùi START_BACK)

  // ── giá trị animation ──
  const beatT = useRef(new Animated.Value(0)).current; // 0..1 theo nhịp tim (native loop)
  const bobL = useRef(new Animated.Value(0)).current; // cá nhấp nhô
  const bobR = useRef(new Animated.Value(0.5)).current;
  const travel = useRef(new Animated.Value(0)).current; // xung sáng chạy dọc sóng (JS)
  const left = useRef(new Animated.Value(0)).current; // tiến độ (spring)
  const right = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current; // ngọn lửa bay lên trên đầu hai cá
  const kiss = useRef(new Animated.Value(0)).current; // hai cá xích lại hôn nhau
  const apart = useRef(new Animated.Value(0)).current; // hai cá bơi ra xa hai bên sau khi hôn
  const ting = useRef(new Animated.Value(0)).current; // ngọn lửa nảy lên một nhịp "ting" báo hoàn thành
  const waveOp = useRef(new Animated.Value(1)).current; // độ đậm cảnh nước (giờ giữ nguyên vì cá không biến mất)
  const heartPop = useRef(new Animated.Value(1)).current;
  const heartOp = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const flameIn = useRef(new Animated.Value(0)).current;
  const flick = useRef(new Animated.Value(0)).current; // ngọn lửa bập bùng (loop 0..1)
  const mineOp = useRef(new Animated.Value(hideMine ? 0 : 1)).current; // độ hiện của ảnh cá "Bạn"
  const mineScale = useRef(new Animated.Value(hideMine ? FAB / WH : 1)).current; // cỡ cá "Bạn": bằng cỡ nút AI lúc mới hiện, lớn dần sau khi nút đã mờ
  const shown = useRef(false);
  const seq = useRef(null);
  const timers = useRef([]);

  // nhịp tim: một loop native duy nhất điều khiển tim đập + vòng sóng toả ra
  useEffect(() => {
    if (!live) return undefined;
    beatT.setValue(0);
    const loop = Animated.loop(Animated.timing(beatT, { toValue: 1, duration: 60000 / cfg.bpm, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [cfg.bpm, live, beatT]);

  // cá nhấp nhô nhẹ (lệch pha nhau)
  useEffect(() => {
    if (!live) return undefined;
    const mk = (v) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    const a = mk(bobL);
    const b = mk(bobR);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [live, bobL, bobR]);

  // cá "Bạn" chỉ hiện khi nút AI nổi đã bay tới ghế (hideMine = false): hiện dần đúng lúc nút mờ đi -> như nút "hoá" thành cá
  // Thứ tự: (1) cá hiện đủ ngay sau nút, cùng cỡ  (2) nút AI mờ đi  (3) cá lớn dần lên WH. Rời ghế thì ngược lại.
  useEffect(() => {
    const run = hideMine
      ? Animated.sequence([
          Animated.delay(80),
          Animated.parallel([
            Animated.timing(mineOp, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(mineScale, { toValue: FAB / WH, duration: 160, useNativeDriver: true }),
          ]),
        ])
      : Animated.parallel([
          Animated.timing(mineOp, { toValue: 1, duration: MINE_FADE_IN, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(MINE_GROW_DELAY),
            Animated.timing(mineScale, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]);
    run.start();
    return () => run.stop();
  }, [hideMine, mineOp, mineScale]);

  // xung sáng chạy dọc sóng (strokeDashoffset: buộc useNativeDriver false)
  useEffect(() => {
    if (!live || !cfg.amp) return undefined;
    travel.setValue(0);
    const run = Animated.loop(Animated.timing(travel, { toValue: 1, duration: (60000 / cfg.bpm) * 2, easing: Easing.linear, useNativeDriver: false }));
    run.start();
    return () => run.stop();
  }, [cfg.bpm, cfg.amp, live, travel]);

  // cá bơi lại gần tim theo tiến độ (khi có chuỗi + cả hai xong thì ép về 1 để lao vào tim đúng chỗ)
  useEffect(() => {
    const go = (v, to) => Animated.spring(v, { toValue: clamp01(to), friction: 9, tension: 55, useNativeDriver: true }).start();
    go(left, showFlame ? 1 : myProgress);
    go(right, showFlame ? 1 : partnerProgress);
  }, [myProgress, partnerProgress, showFlame, left, right]);

  // "BÙM"
  useEffect(() => {
    const clearTimers = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    if (!showFlame) {
      shown.current = false;
      clearTimers();
      seq.current?.stop();
      [rise, kiss, apart, ting, flameIn, burst, flash, ring1, ring2].forEach((v) => v.setValue(0));
      heartOp.setValue(1);
      heartPop.setValue(1);
      setKissOn(false);
      setBabyOn(false);
      return undefined;
    }
    if (shown.current) return undefined;
    shown.current = true;
    if (!celebrate) {
      left.setValue(1); // trạng thái cuối hiện sẵn (đã xem hoạt ảnh rồi): cá về đúng chỗ ngay, không bơi từ ngoài vào
      right.setValue(1);
      rise.setValue(1);
      apart.setValue(1);
      heartOp.setValue(0);
      flameIn.setValue(1);
      burst.setValue(1);
      setKissOn(true);
      setBabyOn(true);
      return undefined;
    }
    const after = (ms, a) => Animated.sequence([Animated.delay(ms), a]);
    const t = (v, to, duration, ease, delay = 0) =>
      after(delay, Animated.timing(v, { toValue: to, duration, easing: ease, useNativeDriver: true }));
    //    0 ms  hai cá đang bơi sát tim (spring ở effect phía trên)
    //  350 ms  tim phồng lên
    //  470 ms  BÙM: tim biến mất, loé sáng + 2 vòng xung kích, tia lửa bắn ra, ngọn lửa bật lên giữa tim
    // 1150 ms  ngọn lửa bay lên phía trên đầu (650 ms)
    // 1650 ms  hai cá xích lại hôn nhau (520 ms), tim nhỏ + sao lấp lánh, lửa "ting"
    // 2800 ms  hai cá bơi ra xa hai bên (700 ms)
    // 3100 ms  cá con (số = streak) bắn ra giữa hai cá
    const T_POP = 350;
    const T_BOOM = 470;
    const T_RISE = 1150;
    const T_KISS = 1650;
    const T_APART = 2800;
    const T_BABY = T_APART + 300;
    seq.current = Animated.parallel([
      t(heartPop, 1.5, 140, Easing.out(Easing.quad), T_POP),
      t(heartOp, 0, 150, undefined, T_BOOM),
      after(T_BOOM, Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 320, useNativeDriver: true }),
      ])),
      t(ring1, 1, 700, Easing.out(Easing.quad), T_BOOM),
      t(ring2, 1, 850, Easing.out(Easing.quad), T_BOOM + 140),
      t(burst, 1, 1000, Easing.out(Easing.cubic), T_BOOM + 30),
      after(T_BOOM + 30, Animated.spring(flameIn, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true })),
      t(rise, 1, 650, Easing.inOut(Easing.cubic), T_RISE),
      Animated.sequence([
        Animated.delay(T_KISS),
        Animated.timing(kiss, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(T_APART - T_KISS - 520),
        Animated.timing(kiss, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
      t(apart, 1, 700, Easing.inOut(Easing.cubic), T_APART),
      after(T_KISS + 450, Animated.sequence([
        Animated.timing(ting, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(ting, { toValue: 0, friction: 4, tension: 160, useNativeDriver: true }),
      ])),
    ]);
    seq.current.start();
    timers.current.push(
      setTimeout(() => {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* thiết bị không rung */ }
      }, T_BOOM),
      setTimeout(() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* thiết bị không rung */ }
        setKissOn(true);
      }, T_KISS + 450),
      setTimeout(() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* thiết bị không rung */ }
        setBabyOn(true);
      }, T_BABY),
    );
    return undefined;
  }, [showFlame, celebrate, left, right, rise, kiss, apart, ting, flameIn, burst, flash, ring1, ring2, heartOp, heartPop]);

  // ngọn lửa bập bùng + lắc nhẹ
  useEffect(() => {
    if (!showFlame) return undefined;
    flick.setValue(0);
    const loop = Animated.loop(Animated.timing(flick, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [showFlame, flick]);

  // dọn dẹp khi unmount
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      seq.current?.stop();
    },
    [],
  );

  // ── nội suy (tất cả native, trừ dashOffset) ──
  const dashOffset = travel.interpolate({ inputRange: [0, 1], outputRange: [seg, -len] });
  const leftX = left.interpolate({ inputRange: [0, 1], outputRange: [0, travelMax] });
  const rightX = right.interpolate({ inputRange: [0, 1], outputRange: [0, -travelMax] });
  // dịch ngang thêm: +kiss (xích vào hôn) rồi trả về 0 và -apart (bơi ra mép ngoài, về đúng chỗ xuất phát)
  const kissL = Animated.add(kiss.interpolate({ inputRange: [0, 1], outputRange: [0, KISS_DIST] }), apart.interpolate({ inputRange: [0, 1], outputRange: [0, -travelMax] }));
  const kissR = Animated.add(kiss.interpolate({ inputRange: [0, 1], outputRange: [0, -KISS_DIST] }), apart.interpolate({ inputRange: [0, 1], outputRange: [0, travelMax] }));
  const kissTiltL = kiss.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-7deg"] }); // hai cá chúi mõm lên về phía nhau
  const kissTiltR = kiss.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "7deg"] });
  const riseY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, FLAME_END_CY - FLAME_CY] });
  const riseScale = rise.interpolate({ inputRange: [0, 1], outputRange: [1, FLAME_END / FLAME_POP] });
  const bobYL = bobL.interpolate({ inputRange: [0, 1], outputRange: [3, -3] });
  const bobYR = bobR.interpolate({ inputRange: [0, 1], outputRange: [3, -3] });
  // cá ngẩng đầu khi trồi lên, chúi đầu khi lặn xuống, và nhích dần về phía nhau (ảnh cá trái quay phải, cá phải quay trái)
  const tiltL = bobL.interpolate({ inputRange: [0, 1], outputRange: ["3deg", "-4deg"] });
  const tiltR = bobR.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "4deg"] });
  const swayL = bobL.interpolate({ inputRange: [0, 1], outputRange: [-2, 2] });
  const swayR = bobR.interpolate({ inputRange: [0, 1], outputRange: [2, -2] });

  // cảnh nước
  const seaW = w + bleed * 2;
  const seaH = SEA_H + bleedBottom;
  const ampW = 1.5 + cfg.amp * 2.2;
  const slow = mood === "flat" ? 1.5 : 1;
  const bubbles = useMemo(
    () =>
      [0.1, 0.24, 0.36, 0.64, 0.76, 0.9].map((f, i) => ({
        x: Math.round(seaW * f),
        y: Math.min(seaH, SEA_H + 40) - 12 - (i % 3) * 4,
        dx: i % 2 ? 3 : -3,
        dy: -(26 + (i % 3) * 8),
        size: 3 + (i % 3),
        dur: 3200 + i * 450,
        delay: i * 520,
      })),
    [seaW, seaH],
  );

  const beatScale = useMemo(
    () => beatT.interpolate({ inputRange: [0, 0.1, 0.22, 0.32, 0.44, 1], outputRange: active ? [1, 1.26, 1, 1.14, 1, 1] : [1, 1.05, 1, 1.02, 1, 1] }),
    [beatT, active],
  );
  const heartScale = Animated.multiply(beatScale, heartPop);
  const beatRingScale = beatT.interpolate({ inputRange: [0, 0.55], outputRange: [1, 1.9], extrapolate: "clamp" });
  const beatRingOp = beatT.interpolate({ inputRange: [0, 0.02, 0.55], outputRange: [0, 0.35, 0], extrapolate: "clamp" });

  // vệt nước sau lưng cá: tô đậm đường nhịp tim từ mép tới cá (neo mép ngoài, co giãn theo tiến độ)
  // (kéo dài thêm KISS_DIST khi hai cá xích lại hôn nhau)
  const lFull = COLW / 2 - EDGE + travelBase; // dài nhất khi cá sát tim
  const lMin = Math.max(1, COLW / 2 - START_BACK - EDGE); // ngắn nhất lúc progress = 0
  const trailLen = Math.max(1, lFull + KISS_DIST);
  const sMin = lMin / trailLen;
  const sFull = lFull / trailLen;
  const half = trailLen / 2;
  const kissSc = kiss.interpolate({ inputRange: [0, 1], outputRange: [0, KISS_DIST / trailLen] });
  const apartSc = apart.interpolate({ inputRange: [0, 1], outputRange: [0, -travelMax / trailLen] }); // bơi ra xa -> vệt ngắn lại
  const trailScaleL = Animated.add(Animated.add(left.interpolate({ inputRange: [0, 1], outputRange: [sMin, sFull] }), kissSc), apartSc);
  const trailScaleR = Animated.add(Animated.add(right.interpolate({ inputRange: [0, 1], outputRange: [sMin, sFull] }), kissSc), apartSc);
  const trailXL = Animated.add(Animated.add(left.interpolate({ inputRange: [0, 1], outputRange: [-half * (1 - sMin), -half * (1 - sFull)] }), kiss.interpolate({ inputRange: [0, 1], outputRange: [0, KISS_DIST / 2] })), apart.interpolate({ inputRange: [0, 1], outputRange: [0, -travelMax / 2] }));
  const trailXR = Animated.add(Animated.add(right.interpolate({ inputRange: [0, 1], outputRange: [half * (1 - sMin), half * (1 - sFull)] }), kiss.interpolate({ inputRange: [0, 1], outputRange: [0, -KISS_DIST / 2] })), apart.interpolate({ inputRange: [0, 1], outputRange: [0, travelMax / 2] }));

  // ngọn lửa
  const flameBase = flameIn.interpolate({ inputRange: [0, 1], outputRange: [0.15, FLAME_POP] });
  const tingScale = ting.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const flameScale = Animated.multiply(Animated.multiply(flameBase, tingScale), flick.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 1.05, 0.98, 1.04, 1] }));
  const flameRot = flick.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ["0deg", "-3deg", "0deg", "3deg", "0deg"] });
  const flameY = flameIn.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const flameOp = flameIn.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1], extrapolate: "clamp" });
  const glowOp = Animated.multiply(flameOp, flick.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.16, 0.28, 0.16] }));

  const sparks = useMemo(
    () =>
      Array.from({ length: SPARKS }, (_, i) => {
        const a = (i / SPARKS) * Math.PI * 2 + 0.25;
        const dist = 44 + (i % 3) * 14;
        return {
          dx: Math.cos(a) * dist * 1.25,
          dy: Math.sin(a) * dist * 0.75 - 6,
          c: [FLAME, "#ffd166", tint][i % 3],
          s: 6 + (i % 3) * 2,
          heart: i % 4 === 3,
        };
      }),
    [tint],
  );

  // đàn cá con: số cá = streak (tối đa MAX_BABIES con mới nhất). Cá mới nhất ở lớp trước; lớp trước đầy thì lùi ra lớp sau nhỏ/mờ hơn.
  // Chỗ xuất hiện của cá thứ i trong lớp = i % sức chứa lớp -> ngày mới chỉ cá ở ranh giới lớp đổi chỗ, các con khác đứng yên.
  const babyLayout = useMemo(() => {
    if (!w || streak <= 0) return [];
    const availW = w - 2 * (COLW - START_BACK) - 12;
    const tiers = BABY_TIERS.map((t) => {
      const perRow = Math.max(1, Math.min(10, Math.floor(availW / t.step)));
      return { ...t, perRow, cap: perRow * t.rows, order: centerOut(perRow) };
    });
    const total = Math.min(Math.floor(streak), MAX_BABIES);
    const out = [];
    for (let r = 0; r < total; r += 1) {
      const i = Math.floor(streak) - 1 - r; // chỉ số tuyệt đối của cá (0 = con đầu tiên)
      let ti = 0;
      let rem = r;
      while (ti < tiers.length - 1 && rem >= tiers[ti].cap) {
        rem -= tiers[ti].cap;
        ti += 1;
      }
      const t = tiers[ti];
      const slot = i % t.cap;
      const row = Math.floor(slot / t.perRow);
      const col = t.order[slot % t.perRow];
      out.push({
        i,
        ti,
        size: t.size,
        alpha: t.alpha,
        lite: t.lite,
        x: w / 2 + (col - (t.perRow - 1) / 2) * t.step - t.size / 2,
        y: t.y0 - ((t.rows - 1) * t.dy) / 2 + row * t.dy, // chỗ xuất hiện ban đầu: dưới mặt nước
        minY: t.minY,
        maxY: ROW_H - t.size - 2 - t.down,
      });
    }
    return out.sort((a, b) => b.ti - a.ti || a.i - b.i); // lớp xa vẽ trước (nằm sau)
  }, [w, streak]);

  const pct = (v) => Math.round(clamp01(v) * 100);
  const pName = partnerName || "người kia";
  const label = showFlame
    ? `Cả hai đã xong hôm nay, chuỗi chung ${streak} ngày`
    : `Tiến độ hôm nay: bạn ${pct(myProgress)} phần trăm, ${pName} ${pct(partnerProgress)} phần trăm`;
  const filledHeart = bothDone && !showFlame; // cả hai xong nhưng không có chuỗi: tim tô đặc

  return (
    <View style={styles.wrap} accessible={!onPartnerPress} accessibilityRole="image" accessibilityLabel={label}>
      <View style={styles.row} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {w > 0 && (
          <>
            {/* biển phía sau: 2 lớp sóng trôi ngược chiều + san hô + bong bóng */}
            <Animated.View pointerEvents="none"
              style={[styles.sea, { left: -bleed, right: -bleed, height: seaH, borderRadius: bleed ? 0 : 14, opacity: waveOp }]}>
              <Water w={seaW} amp={ampW} period={110} phase={0} base={9} height={seaH} color={tint} opacity={(backdrop ? 0.14 : 0.2) * WATER_OPACITY * SEA_BACK_OP} crest={0.18 * WATER_OPACITY} dur={9000 * slow} live={live} />
              <Water w={seaW} amp={ampW} period={78} phase={2} base={12} height={seaH} color={tint} opacity={(backdrop ? 0.2 : 0.26) * WATER_OPACITY * SEA_BACK_OP} reverse dur={6500 * slow} live={live} />
              {!backdrop && (
                <>
                  <Coral color={tint} style={[styles.coral, { left: bleed + 10, opacity: 0.22 * CORAL_OP }]} />
                  <Coral color={tint} style={[styles.coral, { right: bleed + 12, opacity: 0.18 * CORAL_OP, transform: [{ scaleX: -1 }] }]} />
                </>
              )}
              {active && bubbles.map((b, i) => (
                <Particle key={i} live={live} ring x={b.x} y={b.y} dx={b.dx} dy={b.dy} size={b.size} dur={b.dur} delay={b.delay} color={tint} />
              ))}
            </Animated.View>

            {/* đường nhịp tim (nền) */}
            <Animated.View style={[styles.wave, { opacity: waveOp }]} pointerEvents="none">
              <Svg width={w} height={WAVE_H}>
                <Path d={d} stroke={tint} strokeOpacity={active ? 0.22 : 0.3} strokeWidth={2} fill="none" strokeLinecap="round"
                  strokeLinejoin="round" strokeDasharray={active ? undefined : [4, 6]} />
                {cfg.amp > 0 && (
                  <AnimatedPath d={d} stroke={tint} strokeOpacity={cfg.line} strokeWidth={2.8} fill="none" strokeLinecap="round"
                    strokeLinejoin="round" strokeDasharray={[seg, len]} strokeDashoffset={dashOffset} />
                )}
              </Svg>
            </Animated.View>

            {/* vệt nước sau lưng mỗi con cá */}
            {active && (
              <>
                <Animated.View pointerEvents="none"
                  style={[styles.trail, { left: EDGE, width: trailLen, backgroundColor: tint, opacity: waveOp.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }),
                    transform: [{ translateX: trailXL }, { scaleX: trailScaleL }] }]} />
                <Animated.View pointerEvents="none"
                  style={[styles.trail, { right: EDGE, width: trailLen, backgroundColor: tint, opacity: waveOp.interpolate({ inputRange: [0, 1], outputRange: [0, partnerDim ? 0.15 : 0.4] }),
                    transform: [{ translateX: trailXR }, { scaleX: trailScaleR }] }]} />
              </>
            )}

            {/* vòng sóng mỗi nhịp tim */}
            {active && (
              <Animated.View pointerEvents="none"
                style={[styles.beatRing, { left: w / 2 - HEART / 2, borderColor: tint, opacity: Animated.multiply(beatRingOp, heartOp),
                  transform: [{ scale: beatRingScale }] }]} />
            )}

            {/* đàn cá con theo chuỗi: nằm SAU hai cá lớn (cá lớn bơi qua mặt đàn con) và sau dải sóng phía trước; luôn có khi streak > 0,
                qua ngày mới (chưa xong nhiệm vụ) vẫn ở lại. Chỉ con MỚI sinh hôm nay mới bắn ra từ chỗ hai cá hôn nhau. */}
            {streak > 0 && babyLayout.map((b) => {
              const newborn = showFlame && celebrate && b.i === Math.floor(streak) - 1;
              if (newborn && !babyOn) return null;
              return (
                <Baby key={b.i} x={b.x} y={b.y} size={b.size} alpha={b.alpha} lite={b.lite}
                  fromX={w / 2 - b.size / 2 - b.x} fromY={WHALE_TOP + 40 - b.y} delay={0} phase={(b.i % 2) * 0.5} instant={!newborn}
                  wander minX={COLW - START_BACK} maxX={w - (COLW - START_BACK) - b.size} minY={b.minY} maxY={b.maxY}>
                  <BabyFish i={b.i} gene size={b.size} seedKey={partnerName || ""}
                    shapeKey={b.i % 2 ? partnerThemeKey : aiThemeKey} accentA={accentKey} accentB={partnerAccent} />
                </Baby>
              );
            })}

            {/* hai con cá: nhìn vào nhau, bơi lại gần tim theo tiến độ; bọt nước bắn sau đuôi (phía mép ngoài) */}
            <Animated.View pointerEvents="none"
              style={[styles.col, { left: -START_BACK, transform: [{ translateX: leftX }, { translateX: kissL }] }]}>
              <Animated.View style={{ marginTop: WHALE_TOP, opacity: mineOp, transform: [{ translateY: bobYL }, { translateX: swayL }, { rotate: tiltL }, { rotate: kissTiltL }, { scale: mineScale }] }}>
                <Agent source={agentSrc} themeKey={aiThemeKey} size={WH} flip={flipLeft} glow={glowColor} gid="L" />
              </Animated.View>
              {active && (
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: mineOp }]}>
                  {WAKE.map((p, i) => (
                    <Particle key={i} live={live} x={p.ox} y={LINE_Y - 8} dx={-p.dx} dy={p.dy} size={p.s} dur={p.dur} delay={p.delay} color={tint} />
                  ))}
                </Animated.View>
              )}
              <Animated.Text style={[styles.name, { color: labelColor || colors.text, opacity: mineOp }]} numberOfLines={1}>Bạn</Animated.Text>
            </Animated.View>
            <Animated.View pointerEvents={onPartnerPress ? "box-none" : "none"}
              style={[styles.col, { right: -START_BACK, transform: [{ translateX: rightX }, { translateX: kissR }] }]}>
              <Animated.View style={{ marginTop: WHALE_TOP, transform: [{ translateY: bobYR }, { translateX: swayR }, { rotate: tiltR }, { rotate: kissTiltR }] }}>
                {onPartnerPress ? (
                  <Pressable onPress={onPartnerPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Xem theo dõi của ${pName}`}>
                    <Agent source={partnerSrc} themeKey={partnerThemeKey} size={WH} flip={flipRight} dim={partnerDim} glow={partnerGlow} gid="R" />
                  </Pressable>
                ) : (
                  <Agent source={partnerSrc} themeKey={partnerThemeKey} size={WH} flip={flipRight} dim={partnerDim} glow={partnerGlow} gid="R" />
                )}
              </Animated.View>
              {active && !partnerDim && WAKE.map((p, i) => (
                <Particle key={i} live={live} x={COLW - p.ox - p.s} y={LINE_Y - 8} dx={p.dx} dy={p.dy} size={p.s} dur={p.dur} delay={p.delay + 350} color={tint} />
              ))}
              <Text style={[styles.name, { color: labelColor || colors.text, opacity: partnerDim ? 0.5 : 1 }]} numberOfLines={1}>{partnerName}</Text>
            </Animated.View>

            {/* dải sóng PHÍA TRƯỚC: che phần bụng cá cho cảm giác đang ngập trong nước */}
            <Animated.View pointerEvents="none" style={[styles.strip, { left: -bleed, right: -bleed, height: STRIP_FULL ? seaH : STRIP_H, borderRadius: bleed ? 0 : 14, opacity: waveOp }]}>
              <Water w={seaW} amp={ampW} period={64} phase={4} base={12} height={STRIP_FULL ? seaH : STRIP_H} color={tint} opacity={(backdrop ? 0.34 : 0.42) * WATER_OPACITY} crest={0.45 * WATER_OPACITY} dur={4800 * slow} live={live} />
            </Animated.View>

            {/* trái tim giữa */}
            <Animated.View pointerEvents="none"
              style={[styles.heart, { left: w / 2 - HEART / 2, backgroundColor: filledHeart ? tint : colors.card,
                borderColor: filledHeart ? tint : colors.primaryBorder || colors.border, opacity: heartOp, transform: [{ scale: heartScale }] }]}>
              {streak > 0 ? (
                <Text allowFontScaling={false} numberOfLines={1}
                  style={[styles.heartNum, { color: filledHeart ? "#ffffff" : active ? tint : colors.textMuted, fontSize: streak >= 1000 ? 10 : streak >= 100 ? 13 : 16 }]}>
                  {streak}
                </Text>
              ) : (
                <Ionicons name={active ? "heart" : "heart-outline"} size={20} color={filledHeart ? "#ffffff" : active ? tint : colors.textMuted} />
              )}
            </Animated.View>

            {/* BÙM: loé sáng, sóng xung kích, tia lửa + ngọn lửa chứa số ngày */}
            {showFlame && (
              <>
                <View style={[styles.fx, { left: w / 2, top: LINE_Y }]} pointerEvents="none">
                  <Animated.View style={[styles.flash, { opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
                    transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }] }]} />
                  {[ring1, ring2].map((r, i) => (
                    <Animated.View key={i}
                      style={[styles.shock, { borderColor: i ? tint : FLAME, opacity: r.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.7, 0] }),
                        transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.9] }) }] }]} />
                  ))}
                  {sparks.map((p, i) => (
                    <Animated.View key={i}
                      style={[styles.spark, { left: -p.s / 2, top: -p.s / 2, opacity: burst.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 0.85, 0] }),
                        transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                          { translateY: burst.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, p.dy, p.dy + 12] }) },
                          { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.2, 0.8] }) }] }]}>
                      {p.heart ? (
                        <Ionicons name="heart" size={p.s + 5} color={tint} style={styles.sparkHeart} />
                      ) : (
                        <View style={{ width: p.s, height: p.s, borderRadius: p.s, backgroundColor: p.c }} />
                      )}
                    </Animated.View>
                  ))}
                </View>
                <View style={[styles.flameBox, { left: w / 2 - FLAME_W / 2 }]} pointerEvents="none">
                  {/* lớp ngoài: bay lên + phóng nhẹ; lớp trong: bật lên, bập bùng */}
                  <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", transform: [{ translateY: riseY }, { scale: riseScale }] }]}>
                    <Animated.View style={[styles.glow, { opacity: glowOp, transform: [{ scale: flameScale }] }]} />
                    <Animated.View style={{ opacity: flameOp, transform: [{ translateY: flameY }, { rotate: flameRot }, { scale: flameScale }] }}>
                      <FlameStreak count={streak} size={FLAME_W} inside />
                    </Animated.View>
                  </Animated.View>
                </View>
                {/* hai cá hôn nhau: tim nhỏ bay lên giữa hai cá */}
                {kissOn && (
                  <>
                    {!babyOn && <KissHeart x={w / 2 - 4} y={WHALE_TOP + 14} dx={-4} dy={-14} size={11} dur={1700} delay={0} color={tint} />}
                    {!babyOn && <KissHeart x={w / 2 + 5} y={WHALE_TOP + 14} dx={5} dy={-14} size={8} dur={1700} delay={850} color={tint} />}
                    {/* sao lấp lánh hai bên ngọn lửa, trên đầu hai cá (vùng trống, không đè lên cá/lửa) */}
                    {[
                      { dx: -34, y: 4, s: 9, d: 0, c: "#ffd166" },
                      { dx: 34, y: 4, s: 9, d: 250, c: "#ffd166" },
                      { dx: -62, y: -4, s: 8, d: 500, c: tint },
                      { dx: 62, y: -4, s: 8, d: 750, c: tint },
                      { dx: -92, y: 6, s: 7, d: 1000, c: "#ffd166" },
                      { dx: 92, y: 6, s: 7, d: 1250, c: "#ffd166" },
                    ].map((p, i) => (
                      <Twinkle key={i} x={w / 2 + p.dx} y={p.y} size={p.s} dur={900} delay={p.d} color={p.c} />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
});

export default CoupleHeart;

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  row: { height: ROW_H },
  wave: { position: "absolute", left: 0, right: 0, top: LINE_Y - WAVE_H / 2, height: WAVE_H },
  trail: { position: "absolute", top: LINE_Y - 2, height: 4, borderRadius: 2 },
  beatRing: { position: "absolute", top: LINE_Y - HEART / 2, width: HEART, height: HEART, borderRadius: HEART / 2, borderWidth: 2 },
  heart: {
    position: "absolute",
    top: LINE_Y - HEART / 2,
    width: HEART,
    height: HEART,
    borderRadius: HEART / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  sea: { position: "absolute", left: 0, right: 0, top: SEA_TOP, height: SEA_H, overflow: "hidden", borderRadius: 14 },
  strip: { position: "absolute", left: 0, right: 0, top: SEA_TOP, height: STRIP_H, overflow: "hidden" },
  coral: { position: "absolute", bottom: 0 },
  col: { position: "absolute", top: 0, width: COLW, height: ROW_H, alignItems: "center" },
  name: { position: "absolute", top: NAME_TOP, width: COLW + 28, textAlign: "center", fontSize: 12.5, fontWeight: "700" },
  fx: { position: "absolute", width: 0, height: 0 },
  flash: { position: "absolute", left: -32, top: -32, width: 64, height: 64, borderRadius: 32, backgroundColor: FLAME },
  shock: { position: "absolute", left: -22, top: -22, width: 44, height: 44, borderRadius: 22, borderWidth: 2.5 },
  spark: { position: "absolute", alignItems: "center", justifyContent: "center" },
  sparkHeart: { marginLeft: 0 },
  heartNum: { fontWeight: "800", textAlign: "center", includeFontPadding: false },
  flameBox: { position: "absolute", top: FLAME_CY - FLAME_W / 2, width: FLAME_W, height: FLAME_W, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute", width: FLAME_W * 1.25, height: FLAME_W * 1.25, borderRadius: FLAME_W, backgroundColor: FLAME },
});