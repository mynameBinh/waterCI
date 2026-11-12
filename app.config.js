// Đặt cạnh app.json. Expo nạp app.json trước rồi truyền vào `config` để file này chỉnh tiếp.
//
// Icon app cho từng agent + màu chủ đạo. Với mỗi agent (id "TieuDau", file "tieudau"):
//   assets/app-icons/app-tieudau.png          -> icon "TieuDau"       (dự phòng khi thiếu màu)
//   assets/app-icons/app-tieudau-pink.png     -> icon "TieuDauPink"   (theo màu pink)
//   ... ocean / pink / yellow / green / purple / orange
// File nào chưa có thì bị bỏ qua (build không lỗi). Tạo hàng loạt: python tools/make_app_icons.py --batch
// Ảnh: PNG 1024x1024, KHÔNG trong suốt.
const fs = require("fs");
const path = require("path");

// `id` phải khớp AGENT_META[key].appIcon trong src/context/aiAgents.js
const AGENT_ICONS = [
  { id: "TieuDau", file: "tieudau" },
  { id: "Whale", file: "whale" },
];
const ACCENT_KEYS = ["ocean", "pink", "yellow", "green", "purple", "orange"];

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const exists = (p) => fs.existsSync(path.join(__dirname, p));

module.exports = ({ config }) => {
  const icons = [];
  for (const a of AGENT_ICONS) {
    const base = `./assets/app-icons/app-${a.file}.png`;
    if (exists(base)) icons.push({ name: a.id, ios: base });
    for (const acc of ACCENT_KEYS) {
      const f = `./assets/app-icons/app-${a.file}-${acc}.png`;
      if (exists(f)) icons.push({ name: a.id + cap(acc), ios: f });
    }
  }
  console.log(`[app.config] icon phụ: ${icons.length ? icons.map((i) => i.name).join(", ") : "(chưa có file nào)"}`);

  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      ...(icons.length ? [["expo-alternate-app-icons", icons]] : []),
    ],
    // runtime đọc danh sách này để chỉ chọn icon đã được build vào app
    extra: { ...(config.extra || {}), appIcons: icons.map((i) => i.name) },
  };
};
