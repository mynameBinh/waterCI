import { Ionicons } from "@expo/vector-icons";
import { CameraView } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Khung camera check-in dùng chung ─────────────────────────────────────────
//  • DashboardScreen: dùng như cũ (không truyền `large`) -> giao diện y hệt trước đây.
//  • AIChatModal:     truyền `large` + `frameWidth` -> khung to hơn, nút chụp to hơn, có dòng gợi ý.
//
//  Props:
//    colors        bảng màu từ ThemeContext
//    title         tiêu đề (mặc định: "Chụp ảnh để bắt đầu kiểm tra")
//    subtitle      dòng mô tả dưới tiêu đề
//    hint          (tuỳ chọn) dòng nhỏ dưới khung camera, vd "Vuốt lên / xuống để zoom"
//    frameWidth    bề rộng khung ngắm (px). null -> 280 như cũ. Khung luôn tỉ lệ 3:4
//    large         true -> container tự giãn theo frameWidth, nút to hơn
//    quality       chất lượng JPEG 0..1 (mặc định 0.5)
//    skipProcessing  true (mặc định) chụp nhanh hơn; chat truyền false để ảnh luôn đúng chiều
//    aiLoading     true -> chặn bấm chụp
//    onPicture(uri), onClose()

// Camera: vuốt dọc để zoom (thang zoom của expo-camera là [0, 1])
const ZOOM_MIN = 0;
const ZOOM_MAX = 1;
const ZOOM_SWIPE_SENSITIVITY = 400; // càng lớn thì vuốt càng "chậm" (mượt hơn)
const DEFAULT_ZOOM = 0.2; // 0.2 = camera 1x (chuẩn iPhone 3 mắt)

// Trước đây camZoom/flash nằm ở Dashboard -> mỗi nhịp vuốt zoom render lại cả
// màn hình. Giờ chỉ component này render lại.
const CameraOverlay = memo(function CameraOverlay({
  colors,
  title = "Chụp ảnh để bắt đầu kiểm tra",
  subtitle,
  hint,
  frameWidth = null,
  large = false,
  quality = 0.5,
  skipProcessing = true,
  aiLoading = false,
  onPicture,
  onClose,
}) {
  const [flash, setFlash] = useState("off");
  const [camZoom, setCamZoom] = useState(DEFAULT_ZOOM);
  const cameraRef = useRef(null);
  const camZoomRef = useRef(DEFAULT_ZOOM); // giá trị zoom mới nhất, dùng trong PanResponder
  const zoomStartRef = useRef(DEFAULT_ZOOM); // giá trị zoom tại thời điểm bắt đầu vuốt
  const aiLoadingRef = useRef(aiLoading);
  aiLoadingRef.current = aiLoading;

  // Hiện ra: nền mờ dần + thẻ camera nảy lên nhẹ
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220, mass: 0.9 }).start();
  }, [enter]);

  // Vuốt dọc để zoom: lên = zoom in, xuống = zoom out. Chỉ setState khi giá trị
  // (làm tròn 0.01) thực sự đổi.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        zoomStartRef.current = camZoomRef.current;
      },
      onPanResponderMove: (_evt, g) => {
        const delta = -g.dy / ZOOM_SWIPE_SENSITIVITY;
        const next = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomStartRef.current + delta)) * 100) / 100;
        if (next === camZoomRef.current) return;
        camZoomRef.current = next;
        setCamZoom(next);
      },
    }),
  ).current;

  const takingRef = useRef(false);
  const handleTake = useCallback(async () => {
    if (!cameraRef.current || aiLoadingRef.current || takingRef.current) return;
    takingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality, skipProcessing });
      // onPicture đóng camera rồi mới làm bước tiếp theo -> không đè lên nút chụp
      onPicture(photo.uri);
    } catch {
      takingRef.current = false; // chụp lỗi: cho bấm lại
    }
  }, [onPicture, quality, skipProcessing]);

  const frameStyle = frameWidth != null ? { width: frameWidth } : null;
  const borderStyle = frameWidth != null ? { width: frameWidth + 6 } : null;
  const cardStyle = large && frameWidth != null ? { width: frameWidth + 6 + 48, maxWidth: "96%" } : null;

  return (
    <Animated.View style={[styles.cameraOverlay, { opacity: enter }]}>
      <Animated.View
        style={[
          styles.miniCamContainer,
          cardStyle,
          { backgroundColor: colors.card, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
        ]}
      >
        <View style={styles.miniCamTitleRow}>
          <View style={[styles.miniCamTitleIconWrap, large && styles.miniCamTitleIconWrapL, { backgroundColor: colors.primarySoft || "#e0f2fe" }]}>
            <Ionicons name="camera" size={large ? 18 : 16} color={colors.primary} />
          </View>
          <Text style={[styles.miniCamTitle, large && { fontSize: 17.5 }, { color: colors.text }]}>{title}</Text>
        </View>
        {!!subtitle && (
          <Text style={[styles.miniCamSubtitle, large && { fontSize: 13.5, textAlign: "center" }, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        )}

        {/* ── Khung camera kiểu viewfinder ── */}
        <LinearGradient colors={[colors.primaryLight, colors.primary]} style={[styles.cameraFrameBorder, borderStyle]}>
          <View style={[styles.cameraFrame, frameStyle]} {...panResponder.panHandlers}>
            <CameraView
              style={styles.cameraView}
              facing="back"
              flash={flash}
              enableTorch={flash === "on"}
              ref={cameraRef}
              zoom={camZoom}
            />

            {/* Góc ngắm viewfinder */}
            <View style={[styles.viewfinderCorner, styles.cornerTL]} />
            <View style={[styles.viewfinderCorner, styles.cornerTR]} />
            <View style={[styles.viewfinderCorner, styles.cornerBL]} />
            <View style={[styles.viewfinderCorner, styles.cornerBR]} />

            {/* Badge zoom */}
            <View style={styles.zoomBadge}>
              <Text style={styles.zoomBadgeText}>{(1 + (camZoom - DEFAULT_ZOOM) * 5).toFixed(1)}x</Text>
            </View>
          </View>
        </LinearGradient>

        {!!hint && <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>}

        <View style={[styles.actionRow, large && { marginTop: 18 }]}>
          <TouchableOpacity
            style={[
              styles.sideCircle,
              large && styles.sideCircleL,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Đóng camera"
          >
            <Ionicons name="close" size={large ? 25 : 22} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleTake}
            style={[styles.shutterBtnShadow, { shadowColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Chụp ảnh"
          >
            <LinearGradient
              colors={[colors.primaryLight, colors.primary]}
              style={[styles.shutterBtnOuter, large && styles.shutterBtnOuterL]}
            >
              <View style={[styles.shutterBtnInner, large && styles.shutterBtnInnerL]} />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sideCircle,
              large && styles.sideCircleL,
              { backgroundColor: colors.background, borderColor: colors.border },
              flash === "on" && styles.flashCircleActive,
            ]}
            onPress={() => setFlash((prev) => (prev === "off" ? "on" : "off"))}
            accessibilityRole="button"
            accessibilityLabel={flash === "on" ? "Tắt đèn flash" : "Bật đèn flash"}
          >
            <Ionicons
              name={flash === "on" ? "flash" : "flash-off"}
              size={large ? 23 : 20}
              color={flash === "on" ? "#eab308" : colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

export default CameraOverlay;

const styles = StyleSheet.create({
  cameraOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
    elevation: 60,
  },
  miniCamContainer: {
    borderRadius: 32,
    padding: 24,
    width: "85%",
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 15,
  },
  miniCamTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  miniCamTitleIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  miniCamTitleIconWrapL: { width: 30, height: 30, borderRadius: 15 },
  miniCamTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3 },
  miniCamSubtitle: { fontSize: 12.5, marginBottom: 18, marginTop: 2, fontWeight: "500" },
  cameraFrameBorder: { width: 286, aspectRatio: 3 / 4, borderRadius: 27, padding: 3, marginBottom: 4 },
  cameraFrame: { flex: 1, width: 280, aspectRatio: 3 / 4, borderRadius: 24, overflow: "hidden", backgroundColor: "#000" },
  cameraView: { flex: 1 },
  hint: { fontSize: 12, fontWeight: "600", marginTop: 8 },

  viewfinderCorner: { position: "absolute", width: 22, height: 22, borderColor: "rgba(255,255,255,0.85)" },
  cornerTL: { top: 10, left: 10, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 10, right: 10, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 10, left: 10, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 10, right: 10, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },

  zoomBadge: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  zoomBadgeText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 22,
    paddingHorizontal: 8,
  },
  sideCircle: { width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  sideCircleL: { width: 52, height: 52, borderRadius: 26 },
  flashCircleActive: { backgroundColor: "#fef9c3", borderWidth: 1, borderColor: "#fef08a" },
  shutterBtnShadow: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  shutterBtnOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterBtnOuterL: { width: 82, height: 82, borderRadius: 41 },
  shutterBtnInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#ffffff" },
  shutterBtnInnerL: { width: 60, height: 60, borderRadius: 30 },
});
