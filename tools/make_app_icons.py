#!/usr/bin/env python3
"""Tạo icon app 1024x1024 NỀN ĐẶC (iOS không nhận icon trong suốt). Cần: pip install pillow

Một icon:
  python tools/make_app_icons.py <ảnh_nguồn> <ảnh_xuất> [màu_nền=#FFFFFF] [tỉ_lệ=0.8]

Tất cả agent x màu (chạy ở thư mục gốc dự án):
  python tools/make_app_icons.py --batch
  -> assets/app-icons/app-<agent>.png và app-<agent>-<màu>.png  (khớp app.config.js)
Sửa SETS bên dưới khi thêm agent mới.
"""
import os, sys
from PIL import Image

PALE = {  # nền = màu "pale" của từng accent trong ThemeContext.js
    "ocean": "#bae6fd", "pink": "#fbcfe8", "yellow": "#fde68a",
    "green": "#bbf7d0", "purple": "#ddd6fe", "orange": "#fed7aa",
}
SETS = {
    "tieudau": {  # ảnh có nền riêng -> phủ gần kín (ratio cao)
        "ratio": 1.0,
        "dir": "assets/avata/ai-avata",
        "files": {"ocean": "ai-avata-xanhduong.png", "pink": "ai-avata-hong.png", "yellow": "ai-avata-vang.png",
                  "orange": "ai-avata-cam.png", "purple": "ai-avata-tim.png", "green": "ai-avata-xanhla.png"},
    },
    "whale": {  # ảnh xoá phông -> chừa lề
        "ratio": 0.82,
        "dir": "assets/avata/whale-avata",
        "files": {"ocean": "blue-whale.png", "pink": "pink-whale.png", "yellow": "yelow-whale.png",
                  "orange": "orange-whale.png", "purple": "purple-whale.png", "green": "green-whale.png"},
    },
}
OUT = "assets/app-icons"

def make(src, dst, bg="#FFFFFF", ratio=0.8):
    S = 1024
    canvas = Image.new("RGB", (S, S), bg)
    img = Image.open(src).convert("RGBA")
    box = int(S * ratio)
    img.thumbnail((box, box), Image.LANCZOS)
    canvas.paste(img, ((S - img.width) // 2, (S - img.height) // 2), img)
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    canvas.save(dst, "PNG")
    print("OK ->", dst)

def batch():
    for agent, cfg in SETS.items():
        for accent, fname in cfg["files"].items():
            src = os.path.join(cfg["dir"], fname)
            if not os.path.exists(src):
                print("bỏ qua (thiếu ảnh):", src); continue
            make(src, f"{OUT}/app-{agent}-{accent}.png", PALE[accent], cfg["ratio"])
            if accent == "ocean":  # bản dự phòng khi thiếu màu
                make(src, f"{OUT}/app-{agent}.png", PALE[accent], cfg["ratio"])

if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["--batch"]:
        batch()
    elif len(a) >= 2:
        make(a[0], a[1], a[2] if len(a) > 2 else "#FFFFFF", float(a[3]) if len(a) > 3 else 0.8)
    else:
        print(__doc__); sys.exit(1)
