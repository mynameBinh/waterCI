import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

// ── Bottom sheet dùng chung (ChatPlusSheet, SmartCopySheet...) ───────────────
//  • Bấm ra ngoài (vùng tối) là đóng NGAY – không cần bấm "Xong".
//  • Vuốt xuống ở tay nắm / tiêu đề để đóng, thả nhẹ thì bật lại.
//  • Có animation thoát (parent chỉ cần đặt visible=false, sheet tự trượt xuống rồi mới gỡ).
//  • Dùng <Modal> gốc -> luôn nằm trên cùng, nhận chạm đúng, Android back chạy qua onRequestClose.
const BottomSheet = memo(function BottomSheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.85,
  dismissable = true,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [mounted, setMounted] = useState(visible);
  const open = useRef(new Animated.Value(0)).current; // 0 = ẩn, 1 = mở
  const drag = useRef(new Animated.Value(0)).current; // px kéo xuống
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissable);
  dismissRef.current = dismissable;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.setValue(0);
      Animated.spring(open, {
        toValue: 1,
        useNativeDriver: true,
        damping: 22,
        stiffness: 240,
        mass: 0.9,
      }).start();
    } else {
      Animated.timing(open, {
        toValue: 0,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          drag.setValue(0);
        }
      });
    }
  }, [visible, open, drag]);

  const requestClose = useCallback(() => {
    if (dismissRef.current) closeRef.current?.();
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (dismissRef.current && (g.dy > 90 || g.vy > 0.9)) {
            Animated.timing(drag, {
              toValue: height,
              duration: 180,
              useNativeDriver: true,
            }).start(() => closeRef.current?.());
          } else {
            Animated.spring(drag, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 260 }).start();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [drag, height],
  );

  if (!mounted) return null;

  const slide = open.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View style={styles.root}>
        <Animated.View
          style={[styles.backdrop, { opacity: open.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel="Đóng" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
              maxHeight: height * maxHeightRatio,
              transform: [{ translateY: Animated.add(slide, drag) }],
            },
          ]}
        >
          {/* vùng kéo: tay nắm + khoảng đệm, tránh tranh chạm với ScrollView bên dưới */}
          <View {...pan.panHandlers} style={styles.grabZone}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
});

export default BottomSheet;

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  grabZone: { alignItems: "center", paddingTop: 10, paddingBottom: 14, marginHorizontal: -18 },
  grabber: { width: 40, height: 4, borderRadius: 2 },
});
