# -*- coding: utf-8 -*-
# 在赛宝截图上试跑「英雄图标 -> 英雄名」匹配，并输出对照图供人工确认
import os, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\Agent data\Codex\PKC比赛图表制作"
SHOT = r"C:\Users\12113\AppData\Local\Temp\codex-clipboard-2c1a5cb1-eac6-491a-9fc5-11a3b644cb65.jpg"
ICON_DIR = os.path.join(ROOT, "素材", "_官方头像")
N = 24

def feature(img):
    im = img.convert("RGB").resize((N, N), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32).reshape(-1, 3)
    a = a - a.mean(axis=0)
    a = a / (a.std() + 1e-6)
    return a.reshape(-1)

def main():
    icons = []
    for f in sorted(glob.glob(os.path.join(ICON_DIR, "*.jpg"))):
        icons.append((os.path.splitext(os.path.basename(f))[0], feature(Image.open(f))))
    M = np.stack([v for _, v in icons])
    shot = Image.open(SHOT)
    W, H = shot.size
    print("shot", W, H, "icons", len(icons))
    ys = [0.3374, 0.4748, 0.6135, 0.7515, 0.8896]      # 实测：每组头像中心 y
    S = int(W * 0.095)                                   # 头像边长
    boxes = []
    for i, ry in enumerate(ys):
        cy = ry * H
        lx = int(W * 0.090)
        boxes.append(("our" + str(i + 1), (lx - S // 2, int(cy) - S // 2, lx + S // 2, int(cy) + S // 2)))
        boxes.append(("opp" + str(i + 1), (W - lx - S // 2, int(cy) - S // 2, W - lx + S // 2, int(cy) + S // 2)))
    out = Image.new("RGB", (940, len(boxes) * 72 + 30), (255, 255, 255))
    d = ImageDraw.Draw(out)
    F = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 15)
    for k, (label, box) in enumerate(boxes):
        crop = shot.crop(box)
        v = feature(crop)
        sim = (M @ v) / v.shape[0] * 3
        order = np.argsort(-sim)[:3]
        top = [(icons[j][0], float(sim[j])) for j in order]
        print(label, " -> ".join(f"{n}({s:.2f})" for n, s in top))
        y0 = 30 + k * 72
        out.paste(crop.resize((64, 64), Image.LANCZOS), (6, y0 + 4))
        d.text((80, y0 + 24), label + " ->", font=F, fill=(40, 48, 60))
        for j, (n, s) in enumerate(top):
            im = Image.open(os.path.join(ICON_DIR, n + ".jpg")).resize((56, 56), Image.LANCZOS)
            out.paste(im, (190 + j * 170, y0 + 8))
            d.text((190 + j * 170, y0 + 66), f"{n} {s:.2f}", font=F, fill=(40, 48, 60))
    out.save(os.path.join(ROOT, "预览", "_英雄匹配测试.png"))
    print("sheet ->", os.path.join(ROOT, "预览", "_英雄匹配测试.png"))

main()
