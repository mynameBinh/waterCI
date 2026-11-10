import { Ionicons } from "@expo/vector-icons";
import MaskedView from "@react-native-masked-view/masked-view";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, {
    Easing,
    FadeInDown,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

// Màu chủ đạo lấy từ ThemeContext (colors.primary...) nên đổi theo theme màu người dùng chọn.
// Thẻ pastel xoay vòng: thẻ 1 theo màu chủ đạo, 2 thẻ còn lại giữ cam / vàng.
const makeTones = (colors) => [
  {
    bg: colors.primarySoft,
    pill: `rgba(${colors.primaryRgb},0.24)`,
    label: colors.primaryText,
  },
  {
    bg: "rgba(249,115,22,0.14)",
    pill: "rgba(249,115,22,0.22)",
    label: "#ea580c",
  },
  {
    bg: "rgba(234,179,8,0.18)",
    pill: "rgba(234,179,8,0.28)",
    label: "#a16207",
  },
];

const MAX_PLACEHOLDERS = 3; // số ô "chờ check-in" tối đa hiển thị
const CTA_LOWER = 22; // hạ nút camera + chữ xuống (px) -> danh sách task được thêm đúng chừng đó chỗ

const todayLabel = () => {
  try {
    return new Date().toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return "";
  }
};

// ─── Thẻ tiến độ: nền chạy từ trái sang phải + sọc chéo trôi (khác sóng nước) ───
const PROG_H = 120;
const PROG_CONTENT_OFFSET_Y = 20; // dịch tiêu đề / số lần / % xuống (px)
const STRIPE_P = 26; // chu kỳ sọc (px)
const STRIPE_W = 11; // bề rộng mỗi sọc (px)
const STRIPE_SHIFT = 34; // độ nghiêng của sọc (px)

// Fill chạy từ trái sang phải bằng translateX (không animate prop SVG -> ổn định trên Fabric).
// color="#000" + stripes=false khi dùng làm mask cho chữ trắng.
const FillShape = memo(
  ({ width, progress, phase, color, stripes = true, opacity = 1 }) => {
    const stripePath = useMemo(() => {
      if (!stripes) return "";
      const svgW = width + STRIPE_P + STRIPE_SHIFT;
      let d = "";
      for (let x = -STRIPE_SHIFT; x < svgW; x += STRIPE_P) {
        d += `M ${x} ${PROG_H} L ${x + STRIPE_W} ${PROG_H} L ${x + STRIPE_W + STRIPE_SHIFT} 0 L ${x + STRIPE_SHIFT} 0 Z `;
      }
      return d;
    }, [width, stripes]);

    const fillStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: -(1 - progress.value) * width }],
    }));
    const stripeStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: -phase.value * STRIPE_P }],
    }));

    return (
      <Animated.View
        pointerEvents="none"
        needsOffscreenAlphaCompositing
        style={[
          styles.fill,
          { width, backgroundColor: color, opacity },
          fillStyle,
        ]}
      >
        {stripes && (
          <Animated.View
            style={[
              styles.stripes,
              { width: width + STRIPE_P + STRIPE_SHIFT },
              stripeStyle,
            ]}
          >
            <Svg width={width + STRIPE_P + STRIPE_SHIFT} height={PROG_H}>
              <Path d={stripePath} fill="rgba(255,255,255,0.16)" />
            </Svg>
          </Animated.View>
        )}
        {stripes && <View style={styles.fillEdge} />}
      </Animated.View>
    );
  },
);

// Nội dung thẻ (vẽ 2 lần: chữ tối ở nền, chữ trắng bị mask theo phần đã fill)
const ProgressContent = memo(
  ({
    white,
    title,
    done,
    target,
    pctText,
    reached,
    textColor,
    mutedColor,
    primary,
  }) => {
    const main = white ? "#ffffff" : textColor;
    const muted = white ? "rgba(255,255,255,0.8)" : mutedColor;
    return (
      <View style={styles.progContent}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={styles.progTitleRow}>
            <Ionicons
              name={reached ? "checkmark-circle" : "flag"}
              size={17}
              color={white ? "#ffffff" : primary}
            />
            <Text
              style={[styles.progTitle, { color: muted }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>
          <View style={styles.progValueRow}>
            <Text style={[styles.progValue, { color: main }]}>{done}</Text>
            <Text style={[styles.progUnit, { color: muted }]} numberOfLines={1}>
              / {target} lần
            </Text>
          </View>
        </View>
        <View style={styles.progRight}>
          <Text style={[styles.progPct, { color: main }]} numberOfLines={1}>
            {pctText}%
          </Text>
        </View>
      </View>
    );
  },
);

const ProgressCard = memo(
  ({
    title,
    done,
    target,
    pct,
    reached,
    textColor,
    mutedColor,
    cardColor,
    shadowColor,
    primary,
  }) => {
    const [width, setWidth] = useState(0);
    const progress = useSharedValue(0);
    const phase = useSharedValue(0);

    useEffect(() => {
      progress.value = withTiming(pct, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      });
    }, [pct, progress]);

    useEffect(() => {
      phase.value = 0;
      phase.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.linear }),
        -1,
        false,
      );
      return () => cancelAnimation(phase);
    }, [phase]);

    const pctText = Math.floor(pct * 100).toString();
    const contentProps = {
      title,
      done,
      target,
      pctText,
      reached,
      textColor,
      mutedColor,
      primary,
    };

    return (
      <View
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        style={[styles.progCard, { backgroundColor: cardColor, shadowColor }]}
      >
        <ProgressContent white={false} {...contentProps} />

        {width > 0 && (
          <>
            <FillShape
              width={width}
              progress={progress}
              phase={phase}
              color={primary}
              opacity={0.92}
            />
            <MaskedView
              style={[StyleSheet.absoluteFill, styles.noTouch]}
              maskElement={
                <View style={StyleSheet.absoluteFill}>
                  <FillShape
                    width={width}
                    progress={progress}
                    phase={phase}
                    color="#000000"
                    stripes={false}
                  />
                </View>
              }
            >
              <ProgressContent white {...contentProps} />
            </MaskedView>
          </>
        )}
      </View>
    );
  },
);

// ─── Một dòng trên timeline: [giờ] [đường + chấm] [thẻ] ───
const TimelineRow = memo(
  ({ time, done, isFirst, isLast, delay, lineColor, children }) => {
    const { colors } = useTheme();
    return (
      <Animated.View
        entering={FadeInDown.delay(delay).duration(300)}
        style={styles.tlRow}
      >
        <Text
          style={[
            styles.tlTime,
            { color: done ? colors.text : colors.textMuted },
          ]}
        >
          {time}
        </Text>

        <View style={styles.tlTrack}>
          <View
            style={[
              styles.tlLine,
              { backgroundColor: lineColor },
              isFirst && { top: 22 },
              isLast && { height: 22 },
            ]}
          />
          <View
            style={[
              styles.tlDot,
              done
                ? {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  }
                : { backgroundColor: colors.card, borderColor: lineColor },
            ]}
          />
        </View>

        <View style={styles.tlContent}>{children}</View>
      </Animated.View>
    );
  },
);

// ─── Chip chọn mục tiêu (khi có nhiều mục tiêu cùng lúc) ───
const isTaskDone = (t) =>
  (t.done_today ?? 0) >= Math.max(t.target_per_day ?? 1, 1);

const TaskChip = memo(({ t, selected, onPress, colors }) => {
  const d = t.done_today ?? 0;
  const tg = Math.max(t.target_per_day ?? 1, 1);
  const finished = d >= tg;
  const pct = Math.min(d / tg, 1);
  const fg = selected ? "#ffffff" : colors.text;
  const sub = selected ? "rgba(255,255,255,0.8)" : colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              shadowOpacity: 0.28,
            }
          : { backgroundColor: colors.card, shadowColor: colors.dockShadow },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={styles.chipRow}>
        <Ionicons
          name={finished ? "checkmark-circle" : "flag"}
          size={15}
          color={selected ? "#ffffff" : colors.primary}
        />
        <Text style={[styles.chipTitle, { color: fg }]} numberOfLines={1}>
          {t.title}
        </Text>
        <Text style={[styles.chipCount, { color: sub }]}>
          {d}/{tg}
        </Text>
      </View>
      {/* Track phủ trọn chiều ngang chip (left:0 + right:0, KHÔNG phụ thuộc padding),
          thanh bên trong chiếm % của track -> 100% là chạy kín hết nút */}
      <View style={styles.chipBarTrack} pointerEvents="none">
        <View
          style={[
            styles.chipBar,
            {
              width: `${pct * 100}%`,
              backgroundColor: selected
                ? "rgba(255,255,255,0.85)"
                : colors.primary,
            },
          ]}
        />
      </View>
    </Pressable>
  );
});

// ─── Pill "x/y mục tiêu": vừa hiện tiến độ, vừa là nút mở form thêm mục tiêu ───
const TasksPill = memo(({ done, total, onPress }) => {
  const { colors } = useTheme();
  const tappable = !!onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={!tappable}
      hitSlop={8}
      accessibilityRole={tappable ? "button" : undefined}
      accessibilityLabel={
        tappable
          ? `${done}/${total} mục tiêu. Chạm để thêm mục tiêu mới`
          : undefined
      }
      style={({ pressed }) => [
        styles.summaryPill,
        { backgroundColor: colors.primarySoft },
        tappable && { paddingRight: 5 },
        pressed && tappable && { transform: [{ scale: 0.96 }], opacity: 0.85 },
      ]}
    >
      <Ionicons name="checkmark-done" size={14} color={colors.primary} />
      <Text style={[styles.summaryText, { color: colors.primary }]}>
        {done}/{total} mục tiêu
      </Text>
      {tappable && (
        <View style={[styles.pillPlus, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={14} color="#ffffff" />
        </View>
      )}
    </Pressable>
  );
});

// ─── Nút "+" lớn ở giữa khi chưa có mục tiêu nào (có vòng sóng lan toả) ───
const EmptyAddButton = memo(({ onPress }) => {
  const { colors } = useTheme();
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(ring);
  }, [ring]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - ring.value),
    transform: [{ scale: 1 + 0.55 * ring.value }],
  }));
  return (
    <Animated.View entering={FadeInDown.duration(350)} style={styles.emptyPlusWrap}>
      <Animated.View
        pointerEvents="none"
        style={[styles.emptyPlusRing, { backgroundColor: colors.primary }, ringStyle]}
      />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Thêm mục tiêu mới"
        style={({ pressed }) => [
          styles.emptyPlus,
          {
            backgroundColor: colors.primarySoft,
            borderColor: colors.primaryBorder,
          },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        <Ionicons name="add" size={46} color={colors.primary} />
      </Pressable>
    </Animated.View>
  );
});

// ─── Dòng mô tả + (Xoá nếu là mục tiêu tự thêm | nhãn "Được giao" nếu do admin giao) ───
const TaskMetaRow = memo(({ task, onDeleteTask }) => {
  const { colors } = useTheme();
  const [deleting, setDeleting] = useState(false);
  const canDelete = !!task.is_mine && !!onDeleteTask;
  const assigned = !task.is_mine; // admin / em bé giao: chỉ hoàn thành, không xoá được

  const confirmDelete = () => {
    if (deleting) return;
    Alert.alert(
      "Xoá mục tiêu?",
      `"${task.title}" và các lượt check-in của mục tiêu này sẽ bị xoá.`,
      [
        { text: "Huỷ", style: "cancel" },
        {
          text: "Xoá",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await onDeleteTask(task.id);
            } catch (e) {
              Alert.alert(
                "Không xoá được",
                e?.message || "Thử lại sau nhé.",
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (!task.description && !canDelete && !assigned) return null;
  return (
    <View style={styles.metaRow}>
      <View style={{ flex: 1 }}>
        {!!task.description && (
          <Text
            style={[styles.metaDesc, { color: colors.textMuted }]}
            numberOfLines={3}
          >
            {task.description}
          </Text>
        )}
      </View>
      {canDelete ? (
        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Xoá mục tiêu"
          style={({ pressed }) => [
            styles.delBtn,
            pressed && { transform: [{ scale: 0.95 }], opacity: 0.8 },
          ]}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
              <Text style={styles.delText}>Xoá</Text>
            </>
          )}
        </Pressable>
      ) : assigned ? (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
          <Text style={[styles.lockText, { color: colors.textMuted }]}>
            Được giao
          </Text>
        </View>
      ) : null}
    </View>
  );
});

// ─── Form thêm mục tiêu (bottom sheet) ───
const REPEAT_OPTIONS = [
  { key: "daily", label: "Hằng ngày", icon: "repeat" },
  { key: "today", label: "Chỉ hôm nay", icon: "today-outline" },
];

function AddTaskModal({ visible, onClose, onSubmit }) {
  const { colors } = useTheme();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState(1);
  const [repeat, setRepeat] = useState("daily");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Mỗi lần mở form -> xoá dữ liệu cũ
  useEffect(() => {
    if (visible) {
      setTitle("");
      setDesc("");
      setTarget(1);
      setRepeat("daily");
      setBusy(false);
      setError("");
    }
  }, [visible]);

  const canSubmit = title.trim().length > 0 && desc.trim().length > 0 && !busy;
  const inputBg = "rgba(148,163,184,0.12)";

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit?.({
        title: title.trim(),
        verify_description: desc.trim(),
        target_per_day: target,
        repeat,
      });
      onClose?.();
    } catch (e) {
      setError(e?.message || "Không thêm được mục tiêu, thử lại nhé.");
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View
            style={[styles.sheetGrabber, { backgroundColor: colors.border ?? "rgba(148,163,184,0.4)" }]}
          />
          <Text style={[styles.sheetTitle, { color: colors.text }]}>
            Thêm mục tiêu mới
          </Text>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
            Tên mục tiêu
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            placeholder="VD: Tập thể dục"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { backgroundColor: inputBg, color: colors.text }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
            Ảnh cần chụp thể hiện gì?
          </Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            maxLength={300}
            multiline
            placeholder="VD: Đôi giày chạy bộ hoặc đồng hồ hiển thị quãng đường"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              styles.inputMulti,
              { backgroundColor: inputBg, color: colors.text },
            ]}
          />
          <Text style={[styles.fieldHint, { color: colors.textMuted }]}>
            AI sẽ dựa vào mô tả này để xác nhận ảnh check-in của bạn.
          </Text>

          <View style={styles.rowBetween}>
            <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 0 }]}>
              Số lần mỗi ngày
            </Text>
            <View style={styles.stepper}>
              <Pressable
                hitSlop={8}
                onPress={() => setTarget((n) => Math.max(1, n - 1))}
                style={[styles.stepBtn, { backgroundColor: inputBg }]}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.stepValue, { color: colors.text }]}>{target}</Text>
              <Pressable
                hitSlop={8}
                onPress={() => setTarget((n) => Math.min(20, n + 1))}
                style={[styles.stepBtn, { backgroundColor: inputBg }]}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.repeatRow}>
            {REPEAT_OPTIONS.map((o) => {
              const on = repeat === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setRepeat(o.key)}
                  style={[
                    styles.repeatChip,
                    {
                      backgroundColor: on ? colors.primary : inputBg,
                    },
                  ]}
                >
                  <Ionicons
                    name={o.icon}
                    size={14}
                    color={on ? "#ffffff" : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.repeatText,
                      { color: on ? "#ffffff" : colors.text },
                    ]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: colors.primary },
              !canSubmit && { opacity: 0.45 },
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitText}>Thêm mục tiêu</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Khi chưa có mục tiêu nào: dấu "+" lớn ở giữa để tự thêm ───
function EmptyTasks({ onCreateTask }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Mục tiêu</Text>
          <Text style={[styles.headerDate, { color: colors.textMuted }]}>
            {todayLabel()}
          </Text>
        </View>
      </View>
      <View style={styles.emptyWrap}>
        {onCreateTask ? (
          <EmptyAddButton onPress={() => setOpen(true)} />
        ) : (
          <Ionicons name="flag-outline" size={40} color={colors.textMuted} />
        )}
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          Hôm nay chưa có mục tiêu nào
        </Text>
        {!!onCreateTask && (
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            Chạm dấu + để tự thêm mục tiêu của bạn
          </Text>
        )}
      </View>
      {!!onCreateTask && (
        <AddTaskModal
          visible={open}
          onClose={() => setOpen(false)}
          onSubmit={onCreateTask}
        />
      )}
    </View>
  );
}

/**
 * Tab "Mục tiêu" — check-in theo mục tiêu do admin đặt hoặc do chính user tự thêm.
 * Props:
 *  - tasks: [{ id, title, description, target_per_day, done_today, is_mine, history: [{id, time}] }]
 *      is_mine = true: mục tiêu do chính user tự thêm -> được xoá. Ngược lại (admin / em bé giao): chỉ hoàn thành.
 *  - selectedId: id mục tiêu đang xem / sẽ chụp ảnh cho
 *  - onSelect(id): đổi mục tiêu đang chọn
 *  - onOpenCamera: mở camera ở chế độ task (cho mục tiêu đang chọn)
 *  - onCreateTask(payload): async, tự thêm mục tiêu. payload = { title, verify_description,
 *      target_per_day, repeat }. Throw Error(message) nếu lỗi để form hiện thông báo.
 *      Không truyền prop này -> ẩn nút thêm. Có mục tiêu -> pill "x/y mục tiêu" chính là nút thêm.
 *  - onDeleteTask(id): async, xoá mục tiêu tự thêm (DELETE /api/tasks/mine/{id}). Throw Error(message) nếu lỗi.
 *  - disabled: đang xử lý AI
 */
export default function TaskCheckinTab(props) {
  const { tasks = [], selectedId } = props;
  const task = tasks.find((t) => t.id === selectedId) ?? tasks[0];
  if (!task) return <EmptyTasks onCreateTask={props.onCreateTask} />;
  return <TaskCheckinContent {...props} tasks={tasks} task={task} />;
}

function TaskCheckinContent({
  tasks,
  task,
  onSelect,
  onOpenCamera,
  onCreateTask,
  onDeleteTask,
  disabled,
}) {
  const { colors } = useTheme();
  const [addOpen, setAddOpen] = useState(false);

  const multi = tasks.length > 1;
  const doneTasks = tasks.filter(isTaskDone).length;
  const nextTask = tasks.find((t) => !isTaskDone(t));

  const done = task.done_today ?? 0;
  const target = Math.max(task.target_per_day ?? 1, 1);
  const reached = done >= target;
  const pct = Math.min(done / target, 1);
  const inactive = disabled || reached;

  // history từ server: mới nhất đứng đầu -> đảo lại để timeline chạy theo thời gian
  const items = useMemo(
    () => (task.history ?? []).slice().reverse(),
    [task.history],
  );
  const remaining = Math.max(target - done, 0);
  const placeholderCount = Math.min(remaining, MAX_PLACEHOLDERS);
  const hiddenRemaining = remaining - placeholderCount;
  const lineColor = colors.border ?? "rgba(148,163,184,0.35)";
  const tones = useMemo(() => makeTones(colors), [colors]);

  const totalRows = items.length + placeholderCount;

  // Danh sách task chỉ có timeline mới cuộn; mỗi lần đổi mục tiêu (bấm chip)
  // hoặc có check-in mới -> tự cuộn xuống cuối để thấy task cuối cùng.
  const listRef = useRef(null);
  const scrollToBottom = (animated = true) =>
    listRef.current?.scrollToEnd({ animated });
  useEffect(() => {
    const t = setTimeout(() => scrollToBottom(true), 400); // chờ animation vào xong
    return () => clearTimeout(t);
  }, [task.id, items.length]);

  return (
    <View style={{ flex: 1 }}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Mục tiêu
          </Text>
          <Text style={[styles.headerDate, { color: colors.textMuted }]}>
            {todayLabel()}
          </Text>
        </View>
        {/* Pill "x/y mục tiêu" cũng chính là nút thêm mục tiêu */}
        {(multi || !!onCreateTask) && (
          <TasksPill
            done={doneTasks}
            total={tasks.length}
            onPress={onCreateTask ? () => setAddOpen(true) : undefined}
          />
        )}
      </View>

      {multi && (
        <View style={styles.chipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
          >
            {tasks.map((t) => (
              <TaskChip
                key={t.id}
                t={t}
                colors={colors}
                selected={t.id === task.id}
                onPress={() => onSelect?.(t.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Thẻ tiến độ (nền chạy + sọc chéo) — CỐ ĐỊNH, không cuộn ── */}
      <View>
        <Animated.View entering={FadeInDown.duration(350)}>
          <ProgressCard
            title={task.title}
            done={done}
            target={target}
            pct={pct}
            reached={reached}
            textColor={colors.text}
            mutedColor={colors.textMuted}
            cardColor={colors.card}
            shadowColor={colors.dockShadow}
            primary={colors.primary}
          />
          <TaskMetaRow task={task} onDeleteTask={onDeleteTask} />
        </Animated.View>
      </View>

      {/* ── Chỉ phần timeline này cuộn ── */}
      <ScrollView
        ref={listRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
        onContentSizeChange={() => scrollToBottom(true)}
      >
        {/* ── Timeline ── */}
        <View style={{ marginTop: 12 }}>
          {items.map((h, i) => {
            const tone = tones[i % tones.length];
            return (
              <TimelineRow
                key={`${task.id}-${h.id}`}
                time={h.time}
                done
                isFirst={i === 0}
                isLast={i === totalRows - 1}
                delay={Math.min(i, 6) * 50 + 80}
                lineColor={lineColor}
              >
                <View style={[styles.card, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.cardLabel, { color: tone.label }]}>
                    LẦN {i + 1}
                  </Text>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    Check-in thành công
                  </Text>
                  <View style={styles.pillRow}>
                    <View style={[styles.pill, { backgroundColor: tone.pill }]}>
                      <Ionicons name="checkmark" size={11} color={tone.label} />
                      <Text style={[styles.pillText, { color: tone.label }]}>
                        ĐÃ XÁC NHẬN
                      </Text>
                    </View>
                  </View>
                </View>
              </TimelineRow>
            );
          })}

          {/* ô chờ check-in cho các lần còn lại */}
          {Array.from({ length: placeholderCount }).map((_, k) => {
            const idx = items.length + k;
            return (
              <TimelineRow
                key={`${task.id}-todo-${k}`}
                time="--:--"
                done={false}
                isFirst={idx === 0}
                isLast={idx === totalRows - 1}
                delay={Math.min(idx, 6) * 50 + 80}
                lineColor={lineColor}
              >
                <View
                  style={[
                    styles.card,
                    styles.cardTodo,
                    { borderColor: lineColor },
                  ]}
                >
                  <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                    LẦN {idx + 1}
                  </Text>
                  <Text style={[styles.cardTitle, { color: colors.textMuted }]}>
                    Chờ check-in
                  </Text>
                </View>
              </TimelineRow>
            );
          })}

          {hiddenRemaining > 0 && (
            <Text style={[styles.moreText, { color: colors.textMuted }]}>
              +{hiddenRemaining} lần nữa
            </Text>
          )}

          {reached && (
            <Animated.View
              entering={FadeInDown.delay(200).duration(300)}
              style={styles.doneNote}
            >
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={colors.primary}
              />
              <Text style={[styles.doneNoteText, { color: colors.primary }]}>
                Đã hoàn thành mục tiêu hôm nay
              </Text>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      {/* ── Nút camera tròn: điểm nhấn chính, ghim dưới cùng ── */}
      <View style={styles.ctaWrap}>
        <View
          style={[
            styles.ctaHalo,
            { backgroundColor: `rgba(${colors.primaryRgb},0.16)` },
            reached && { backgroundColor: `rgba(${colors.primaryRgb},0.08)` },
          ]}
        >
          <Pressable
            onPress={onOpenCamera}
            disabled={inactive}
            accessibilityRole="button"
            accessibilityLabel="Chụp ảnh check-in"
            style={({ pressed }) => [
              styles.cta,
              reached
                ? [
                    styles.ctaDone,
                    { backgroundColor: `rgba(${colors.primaryRgb},0.14)` },
                  ]
                : [
                    styles.ctaPrimary,
                    {
                      backgroundColor: colors.primary,
                      shadowColor: colors.primary,
                    },
                  ],
              disabled && !reached && { opacity: 0.7 },
              pressed && { transform: [{ scale: 0.93 }] },
            ]}
          >
            <Ionicons
              name={
                reached
                  ? "checkmark"
                  : disabled
                    ? "hourglass-outline"
                    : "camera"
              }
              size={32}
              color={reached ? colors.primary : "#ffffff"}
            />
          </Pressable>
        </View>
        {multi && (
          <Text
            style={[styles.ctaCaption, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {reached
              ? nextTask
                ? "Mục tiêu này đã xong — chọn mục tiêu khác"
                : "Đã hoàn thành tất cả mục tiêu 🎉"
              : `Chụp cho: ${task.title}`}
          </Text>
        )}
      </View>

      {!!onCreateTask && (
        <AddTaskModal
          visible={addOpen}
          onClose={() => setAddOpen(false)}
          onSubmit={onCreateTask}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  headerDate: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  summaryPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(14,165,233,0.12)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryText: {
    color: "#0ea5e9",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 5,
  },

  pillPlus: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Dòng mô tả + Xoá / Được giao ──
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
    paddingHorizontal: 4,
  },
  metaDesc: { fontSize: 13, lineHeight: 19, fontWeight: "500", paddingRight: 10 },
  delBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 58,
    height: 28,
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: "rgba(239,68,68,0.10)",
  },
  delText: { color: "#ef4444", fontSize: 12, fontWeight: "800", marginLeft: 4 },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    borderRadius: 10,
    paddingHorizontal: 9,
    backgroundColor: "rgba(148,163,184,0.14)",
  },
  lockText: { fontSize: 11.5, fontWeight: "700", marginLeft: 4 },

  // ── Nút "+" lớn ở trạng thái trống ──
  emptyPlusWrap: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyPlusRing: { position: "absolute", width: 88, height: 88, borderRadius: 44 },
  emptyPlus: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Nút "+" thêm mục tiêu (cũ, không còn dùng) ──
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Form thêm mục tiêu ──
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetGrabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  fieldLabel: { fontSize: 12.5, fontWeight: "700", marginTop: 16, marginBottom: 6 },
  fieldHint: { fontSize: 11.5, fontWeight: "500", marginTop: 6 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: "600",
  },
  inputMulti: { minHeight: 70, textAlignVertical: "top" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
  },
  stepper: { flexDirection: "row", alignItems: "center" },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: {
    minWidth: 34,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
  },
  repeatRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  repeatChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 10,
  },
  repeatText: { fontSize: 13, fontWeight: "700", marginLeft: 6 },
  errorText: { color: "#ef4444", fontSize: 12.5, fontWeight: "600", marginTop: 12 },
  submitBtn: {
    marginTop: 20,
    borderRadius: 16,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { color: "#ffffff", fontSize: 15.5, fontWeight: "800" },

  // ── Trạng thái trống ──
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  emptyText: { fontSize: 15, fontWeight: "700", marginTop: 12 },
  emptyHint: { fontSize: 12.5, fontWeight: "500", marginTop: 4 },

  // ── Chip chọn mục tiêu ──
  chipsWrap: { marginBottom: 14, marginHorizontal: -4 },
  chipsContent: { paddingHorizontal: 4, paddingVertical: 6, gap: 10 },
  chip: {
    minWidth: 120,
    maxWidth: 210,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 13,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chipRow: { flexDirection: "row", alignItems: "center" },
  chipTitle: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: "700",
    marginLeft: 6,
  },
  chipCount: { fontSize: 12, fontWeight: "700", marginLeft: 8 },
  chipBarTrack: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3 },
  chipBar: { height: 3 },
  // ── Nút camera tròn ──
  ctaWrap: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 0,
    marginBottom: -CTA_LOWER, // kéo đáy khối xuống => ScrollView phía trên cao thêm CTA_LOWER
  },
  ctaCaption: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 14, // cách xa nút camera hơn (halo đã bị hạ 8px bằng translateY nên cần bù thêm)
    maxWidth: "90%",
  },
  ctaHalo: {
    width: 95,
    height: 95,
    borderRadius: 47.5,
    transform: [{ translateY: 8 }], // hạ nút xuống thấp hơn
    backgroundColor: "rgba(14,165,233,0.16)",
    justifyContent: "center",
    alignItems: "center",
  },
  cta: {
    width: 73,
    height: 73,
    borderRadius: 36.5,
    justifyContent: "center",
    alignItems: "center",
  },
  ctaPrimary: {
    backgroundColor: "#0ea5e9",
    shadowColor: "#0ea5e9",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  ctaDone: { backgroundColor: "rgba(14,165,233,0.14)" },

  // ── Thẻ tiến độ ──
  progCard: {
    height: PROG_H,
    borderRadius: 26,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  noTouch: { pointerEvents: "none" },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: PROG_H,
    overflow: "hidden",
  },
  stripes: { position: "absolute", top: 0, left: 0, height: PROG_H },
  fillEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  progContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    // Dùng chung cho cả lớp chữ tối và chữ trắng (mask) nên luôn khớp nhau
    transform: [{ translateY: PROG_CONTENT_OFFSET_Y }],
  },
  progTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  progTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
    letterSpacing: -0.1,
  },
  progValueRow: { flexDirection: "row", alignItems: "baseline" },
  progValue: {
    fontSize: 38,
    fontWeight: "800",
    marginRight: 6,
    letterSpacing: -0.5,
  },
  progUnit: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  progRight: { minWidth: 84, alignItems: "flex-end", justifyContent: "center" },
  progPct: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
    textAlign: "right",
  },
  progDesc: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    marginTop: 10,
    paddingHorizontal: 4,
  },

  // ── Timeline ──
  tlRow: { flexDirection: "row", alignItems: "stretch", marginBottom: 12 },
  tlTime: {
    width: 48,
    paddingTop: 15,
    fontSize: 12,
    fontWeight: "700",
  },
  tlTrack: { width: 22, alignItems: "center" },
  tlLine: {
    position: "absolute",
    top: -12, // nối liền sang dòng trước (bù marginBottom)
    bottom: -12,
    width: 2,
    borderRadius: 1,
  },
  tlDot: {
    position: "absolute",
    top: 17,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  tlContent: { flex: 1 },

  // ── Thẻ pastel ──
  card: { borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  cardTodo: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  cardLabel: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8 },
  cardTitle: { fontSize: 15, fontWeight: "700", marginTop: 4 },
  pillRow: { flexDirection: "row", marginTop: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginLeft: 3,
  },

  moreText: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  doneNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  doneNoteText: {
    color: "#0ea5e9",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
  },
});