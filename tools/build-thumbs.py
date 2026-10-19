# -*- coding: utf-8 -*-
"""
为英雄素材生成两套 WebP：
  英雄缩略图/<相对路径>.webp   320px  —— 网页里浏览/搜索用
  英雄优化/<相对路径>.webp    1024px —— 生成数据图时实际使用的图（原图 2000px、个别 70MB 太重）
"""
import os, sys
from PIL import Image, ImageFile

ImageFile.MAX_TEXT_CHUNK = 512 * 1024 * 1024
ImageFile.MAX_TEXT_MEMORY = 512 * 1024 * 1024

ROOT = r"D:\Agent data\Codex\PKC比赛图表制作"
SRC = os.path.join(ROOT, "英雄半身像")
DST = os.path.join(ROOT, "英雄缩略图")
DST2 = os.path.join(ROOT, "英雄优化")
SIZE = 320
SIZE2 = 1024
Image.MAX_IMAGE_PIXELS = None

counts = {DST: 0, DST2: 0}
for dirpath, _, files in os.walk(SRC):
    for fn in files:
        if os.path.splitext(fn)[1].lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        full = os.path.join(dirpath, fn)
        rel = os.path.relpath(full, SRC)
        try:
            with Image.open(full) as im:
                im = im.convert("RGBA")
                for dst, size, q in ((DST, SIZE, 82), (DST2, SIZE2, 88)):
                    out = os.path.join(dst, os.path.splitext(rel)[0] + ".webp")
                    if os.path.exists(out):
                        continue
                    os.makedirs(os.path.dirname(out), exist_ok=True)
                    t = im.copy()
                    t.thumbnail((size, size), Image.LANCZOS)
                    t.save(out, "WEBP", quality=q, method=4)
                    counts[dst] += 1
        except Exception as e:
            print("跳过", rel, type(e).__name__, e)

for d in (DST, DST2):
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(d) for f in fs)
    n = sum(len(fs) for _, _, fs in os.walk(d))
    print(f"{os.path.basename(d)}: {n} 张 / {total/1024/1024:.1f} MB（本次新增 {counts[d]}）")
