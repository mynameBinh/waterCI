import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

export const API_BASE = "https://binhhn21-water-check-in-backend.hf.space";

// Ảnh thumbnail nhỏ (~30-60KB) do backend sinh, thay vì tải ảnh gốc vài MB
export const thumbUrl = (u) => (u ? `${API_BASE}/api/thumb/${u.split("/").pop()}?w=480` : null);

// "date" của check-in có thể là DD/MM/YYYY, YYYY-MM-DD, ISO có múi giờ, hoặc "11/11"...
// Không đoán được định dạng -> giữ lại (không ẩn nhầm).
export const isToday = (s) => {
  if (!s) return true;
  const str = String(s);
  const now = new Date();
  const d0 = now.getDate();
  const m0 = now.getMonth() + 1;
  const y0 = now.getFullYear();
  if (/^\d{4}-\d{2}-\d{2}T/.test(str) && /(Z|[+-]\d{2}:?\d{2})$/.test(str)) {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime()))
      return d.getDate() === d0 && d.getMonth() + 1 === m0 && d.getFullYear() === y0;
  }
  let m = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return +m[1] === y0 && +m[2] === m0 && +m[3] === d0;
  m = str.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return +m[3] === y0 && +m[2] === m0 && +m[1] === d0;
  m = str.match(/(\d{1,2})[/\-.](\d{1,2})(?![\d/\-.])/);
  if (m) return +m[2] === m0 && +m[1] === d0;
  if (/hôm qua|yesterday/i.test(str)) return false;
  return true;
};

// ── Thẻ tổng quan: dùng chung cho "Uống nước" và "Mục tiêu" ─────────────────
//  hàng đầu: biểu tượng + tiêu đề · (tuỳ chọn) thanh tiến độ · hàng 3 số liệu cân nhau
export const SummaryCard = memo(function SummaryCard({
  colors,
  icon,
  iconColor,
  title,
  subtitle,
  progress, // 0..1 | undefined
  stats, // [{ value, label, icon?, iconColor? }] (3 mục là đẹp nhất)
}) {
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={[styles.summary, { backgroundColor: colors.card }]}>
      <View style={styles.summaryTop}>
        <View style={[styles.summaryTile, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={22} color={iconColor || colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={1} style={[styles.summaryTitle, { color: colors.text }]}>
            {title}
          </Text>
          {!!subtitle && (
            <Text numberOfLines={1} style={[styles.summarySub, { color: colors.textMuted }]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {progress != null && (
        <View style={[styles.track, { backgroundColor: colors.primarySoft }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: colors.primary, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` },
            ]}
          />
        </View>
      )}

      <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
        {stats.map((s, i) => (
          <View
            key={s.label}
            style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}
          >
            <View style={styles.statValueRow}>
              {!!s.icon && <Ionicons name={s.icon} size={16} color={s.iconColor || colors.primary} style={{ marginRight: 4 }} />}
              <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
});

// ── Tiêu đề từng khu (trái: tên + số lượng, phải: hành động) ────────────────
export const SectionHeader = memo(function SectionHeader({ colors, title, count, right }) {
  return (
    <View style={styles.sectionRow}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
        <Text numberOfLines={1} style={[styles.sectionTitle, { color: colors.text, flexShrink: 1 }]}>
          {title}
        </Text>
        {count != null && (
          <View style={[styles.countPill, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.countText, { color: colors.primaryText }]}>{count}</Text>
          </View>
        )}
      </View>
      {right}
    </View>
  );
});

// ── Lưới ảnh check-in 2 cột (cùng 1 kiểu cho cả 2 tab) ──────────────────────
export const PhotoGrid = memo(function PhotoGrid({ colors, items, badge, placeholderIcon = "image-outline" }) {
  return (
    <View style={styles.grid}>
      {items.map((item, index) => (
        <Animated.View
          key={String(item.id)}
          entering={FadeInDown.delay(Math.min(index, 6) * 50 + 80).duration(300)}
          style={[styles.photoCard, { backgroundColor: colors.card, borderColor: colors.border || "#dbeafe" }]}
        >
          <View style={styles.photoHeader}>
            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
            <Text numberOfLines={1} style={[styles.photoTime, { color: colors.textMuted }]}>
              {item.time}
            </Text>
            {!!badge?.(item) && (
              <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.badgeText, { color: colors.primaryText }]}>{badge(item)}</Text>
              </View>
            )}
          </View>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name={placeholderIcon} size={28} color={colors.primary} />
            </View>
          )}
        </Animated.View>
      ))}
    </View>
  );
});

export const EmptyState = memo(function EmptyState({ colors, icon, text }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  summary: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryTop: { flexDirection: "row", alignItems: "center" },
  summaryTile: { width: 44, height: 44, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  summaryTitle: { fontSize: 16, fontWeight: "800" },
  summarySub: { fontSize: 12, marginTop: 2 },
  track: { height: 8, borderRadius: 4, overflow: "hidden", marginTop: 14 },
  fill: { height: "100%", borderRadius: 4 },
  statsRow: { flexDirection: "row", marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  statValueRow: { flexDirection: "row", alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "900" },
  statLabel: { fontSize: 11.5, fontWeight: "600", marginTop: 3, textAlign: "center" },

  sectionRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, minHeight: 32 },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  countPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  countText: { fontSize: 12, fontWeight: "800" },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  photoCard: { width: "48.5%", borderRadius: 16, borderWidth: 1.5, padding: 10, marginBottom: 12 },
  photoHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  photoTime: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  badge: { marginLeft: "auto", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  photo: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: "#0f172a" },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },

  emptyWrap: { alignItems: "center", paddingVertical: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  emptyText: { marginTop: 12, fontSize: 13, fontWeight: "600", textAlign: "center", paddingHorizontal: 24, lineHeight: 19 },
});
