# -*- coding: utf-8 -*-
# 把 133 张官方英雄头像转成 int8 特征，供网页端做「图标 → 英雄名」匹配
import os, glob, base64, json
import numpy as np
from PIL import Image

ROOT = r"D:\Agent data\Codex\PKC比赛图表制作"
ICON_DIR = os.path.join(ROOT, "素材", "_官方头像")
OUT = os.path.join(ROOT, "assets", "hero-features.js")
N = 16
SCALE = 24.0

names, feats = [], []
for f in sorted(glob.glob(os.path.join(ICON_DIR, "*.jpg"))):
    im = Image.open(f).convert("RGB").resize((N, N), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32).reshape(-1, 3)
    a = a - a.mean(axis=0)
    a = a / (a.std() + 1e-6)
    q = np.clip(a * SCALE, -127, 127).astype(np.int8).reshape(-1)
    names.append(os.path.splitext(os.path.basename(f))[0])
    feats.append(q)

M = np.stack(feats)
b64 = base64.b64encode(M.astype(np.int8).tobytes()).decode("ascii")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("// 自动生成：133 张官方英雄头像的 %d×%d×3 归一化特征（int8，base64）\n" % (N, N))
    fh.write("window.HERO_ICON = " + json.dumps({"n": N, "scale": SCALE, "names": names, "data": b64},
                                                 ensure_ascii=False) + ";\n")
print("英雄数", len(names), "特征维度", M.shape[1], "文件大小 %.1f KB" % (os.path.getsize(OUT)/1024))
