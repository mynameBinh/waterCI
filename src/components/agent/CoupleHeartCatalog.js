// =============================================================================
// CoupleHeartCatalog — danh mục tuỳ biến nhịp tim (sóng / màu) + vẽ đường sóng.
// Tất cả mở sẵn (không còn mở khoá theo chuỗi). Server (assistant/logic.py: HEART_WAVES / HEART_COLORS) vẫn kiểm tra khoá hợp lệ
// ở PUT /api/couple/heart nên danh sách key ở đây PHẢI khớp. Khung quanh cá đã bỏ (field `frame` vẫn được giữ nguyên khi lưu).
// =============================================================================
export const HEART_WAVES = [
  { key: "ecg", label: "Nhịp tim" },
  { key: "sine", label: "Sóng mượt" },
  { key: "zigzag", label: "Răng cưa" },
  { key: "love", label: "Chuỗi trái tim" },
];

// color: null = theo màu chủ đạo của app (accent) đang chọn
export const HEART_COLORS = [
  { key: "accent", label: "Theo màu app", color: null },
  { key: "rose", label: "Hồng đào", color: "#f43f5e" },
  { key: "sky", label: "Trời xanh", color: "#38bdf8" },
  { key: "mint", label: "Bạc hà", color: "#34d399" },
  { key: "violet", label: "Tím mộng", color: "#a78bfa" },
  { key: "gold", label: "Vàng nắng", color: "#eab308" },
];

export const DEFAULT_HEART = { wave: "ecg", color: "accent", frame: "ring", share: false };

export const colorOf = (key, accent) => HEART_COLORS.find((c) => c.key === key)?.color || accent;

// ── vẽ đường sóng ──────────────────────────────────────────────────────────
// Trả về { d, len }: `d` là path SVG đi từ x=0 tới x=width quanh đường giữa `mid`; `len` là độ dài (để chạy xung sáng).
// amp = 0 -> đường thẳng. Hàm thuần: có thể kiểm tra bằng node.
const ECG = [[0, 0], [8, 0], [11, -4], [14, 0], [18, 0], [20, 5], [24, -20], [28, 15], [31, 0], [36, 0], [40, -6], [46, 0], [56, 0]];
const ECG_W = 56;

function heartLoop(cx, mid, s) {
  // đường cong trái tim kín, xuất phát và kết thúc ở mũi tim (nằm đúng trên đường giữa)
  const pts = [];
  const cy = mid - 17 * s;    // tâm hình: mũi tim thấp hơn tâm 17*s
  for (let i = 0; i <= 28; i++) {
    const t = Math.PI + (i / 28) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([cx + x * s, cy - y * s]);
  }
  return pts;
}

export function buildWave(style, width, mid, amp) {
  const pts = [[0, mid]];
  if (amp > 0 && width > 120) {
    if (style === "sine") {
      for (let x = 4; x < width; x += 4) pts.push([x, mid + Math.sin((x / width) * Math.PI * 6) * 9 * amp]);
    } else if (style === "zigzag") {
      const step = 14;
      for (let x = step, k = 0; x < width - step; x += step, k++) pts.push([x, mid + (k % 2 ? 1 : -1) * 9 * amp]);
    } else if (style === "love") {
      const n = Math.max(2, 2 * Math.floor(width / 150)); // số chẵn: chừa chỗ giữa cho trái tim
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.5) * width) / n;
        pts.push([cx, mid]);
        pts.push(...heartLoop(cx, mid, 0.55 * amp));
      }
    } else {
      const n = 2 * Math.max(1, Math.floor(width / 200));
      for (let i = 0; i < n; i++) {
        const x0 = ((i + 0.5) * width) / n - ECG_W / 2;
        for (const [dx, dy] of ECG) pts.push([x0 + dx, mid + dy * amp]);
      }
    }
  }
  pts.push([width, mid]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return { d, len: Math.max(len, 1) };
}