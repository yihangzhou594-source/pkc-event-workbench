from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT = ASSETS / "bp-board-bg.png"

LW, LH = 1920, 1080
S = 2
W, H = LW * S, LH * S


def sc(value: float) -> int:
    return round(value * S)


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def font(path: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, sc(size))


def vertical_gradient(size: tuple[int, int], stops: list[tuple[float, str]]) -> Image.Image:
    width, height = size
    arr = np.zeros((height, width, 3), dtype=np.float32)
    for y in range(height):
        t = y / max(1, height - 1)
        lo, hi = stops[0], stops[-1]
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                lo, hi = stops[i], stops[i + 1]
                break
        k = (t - lo[0]) / max(1e-6, hi[0] - lo[0])
        c0 = np.array(rgba(lo[1])[:3], dtype=np.float32)
        c1 = np.array(rgba(hi[1])[:3], dtype=np.float32)
        arr[y, :, :] = c0 * (1 - k) + c1 * k
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def soft_ellipse(
    base: Image.Image,
    box: tuple[float, float, float, float],
    color: tuple[int, int, int, int],
    blur: float,
) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(tuple(sc(v) for v in box), fill=color)
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(sc(blur))))


def spaced_text(
    draw: ImageDraw.ImageDraw,
    center_x: float,
    y: float,
    text: str,
    font_obj: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    spacing: float,
) -> None:
    widths = [draw.textlength(ch, font=font_obj) for ch in text]
    total = sum(widths) + sc(spacing) * (len(text) - 1)
    x = sc(center_x) - total / 2
    for ch, width in zip(text, widths):
        draw.text((x, sc(y)), ch, font=font_obj, fill=fill)
        x += width + sc(spacing)


def build() -> Image.Image:
    base = vertical_gradient(
        (W, H),
        [
            (0.00, "#040914"),
            (0.22, "#091526"),
            (0.52, "#0c1422"),
            (0.68, "#080d16"),
            (0.71, "#060910"),
            (1.00, "#030508"),
        ],
    )

    # Stage lighting.
    soft_ellipse(base, (-760, -620, 890, 900), rgba("#2b6cff", 90), 230)
    soft_ellipse(base, (1030, -620, 2680, 900), rgba("#e5484d", 78), 230)
    soft_ellipse(base, (430, -520, 1490, 660), rgba("#e9c37f", 58), 250)

    # Central light column.
    col = Image.new("RGBA", base.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(col)
    cd.polygon(
        [
            (sc(790), sc(0)),
            (sc(1130), sc(0)),
            (sc(1060), sc(710)),
            (sc(860), sc(710)),
        ],
        fill=rgba("#ffe6b3", 18),
    )
    base.alpha_composite(col.filter(ImageFilter.GaussianBlur(sc(56))))

    # Angular energy shards on both sides.
    shards = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shards)
    blue_polys = [
        [(0, 120), (300, 54), (382, 194), (112, 288)],
        [(0, 332), (224, 292), (334, 440), (0, 536)],
        [(0, 586), (264, 520), (356, 688), (0, 720)],
    ]
    red_polys = [
        [(1920, 118), (1610, 54), (1532, 194), (1810, 288)],
        [(1920, 330), (1694, 292), (1588, 440), (1920, 536)],
        [(1920, 584), (1658, 520), (1562, 688), (1920, 720)],
    ]
    for poly in blue_polys:
        sd.polygon([(sc(x), sc(y)) for x, y in poly], fill=rgba("#2b6cff", 10))
    for poly in red_polys:
        sd.polygon([(sc(x), sc(y)) for x, y in poly], fill=rgba("#e5484d", 9))
    base.alpha_composite(shards.filter(ImageFilter.GaussianBlur(sc(8))))

    # Arena ring geometry behind the crest.
    rings = Image.new("RGBA", base.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(rings)
    cx, cy = 960, 330
    for radius, alpha, width in [(188, 18, 1), (248, 26, 1), (322, 16, 1), (412, 11, 1)]:
        rd.ellipse(
            (sc(cx - radius), sc(cy - radius), sc(cx + radius), sc(cy + radius)),
            outline=(233, 195, 127, alpha),
            width=sc(width),
        )
    for angle in range(0, 360, 30):
        rad = math.radians(angle)
        x1, y1 = cx + math.cos(rad) * 182, cy + math.sin(rad) * 182
        x2, y2 = cx + math.cos(rad) * 420, cy + math.sin(rad) * 420
        rd.line([(sc(x1), sc(y1)), (sc(x2), sc(y2))], fill=(214, 230, 255, 6), width=1)
    base.alpha_composite(rings.filter(ImageFilter.GaussianBlur(sc(0.3))))

    # Perspective stage floor in the upper working area.
    floor = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(floor)
    vx, vy = 960, 528
    for x in range(-700, 2701, 200):
        fd.line([(sc(vx), sc(vy)), (sc(x), sc(710))], fill=(220, 234, 255, 11), width=1)
    for y in [570, 606, 648, 696]:
        fd.line([(sc(0), sc(y)), (sc(1920), sc(y))], fill=(233, 195, 127, 8), width=1)
    base.alpha_composite(floor)

    # Large crest, with a soft gold halo.
    emblem = Image.open(ASSETS / "pkc-emblem.png").convert("RGBA")
    halo = Image.new("RGBA", base.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse((sc(690), sc(40), sc(1230), sc(610)), fill=rgba("#e9c37f", 32))
    base.alpha_composite(halo.filter(ImageFilter.GaussianBlur(sc(70))))

    crest = emblem.resize((sc(470), sc(476)), Image.Resampling.LANCZOS)
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    glow.alpha_composite(crest, (sc(724), sc(56)))
    gold_glow = Image.new("RGBA", base.size, rgba("#e9c37f", 0))
    ga = np.array(gold_glow)
    ca = np.array(glow)
    mask = ca[:, :, 3]
    ga[:, :, 0] = 233
    ga[:, :, 1] = 195
    ga[:, :, 2] = 127
    ga[:, :, 3] = (mask.astype(np.float32) * 0.26).astype(np.uint8)
    base.alpha_composite(Image.fromarray(ga, "RGBA").filter(ImageFilter.GaussianBlur(sc(18))))
    base.alpha_composite(crest, (sc(724), sc(56)))

    # Large subdued BP typography, intentionally low contrast so panels stay readable.
    typo = Image.new("RGBA", base.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(typo)
    spaced_text(td, 960, 556, "BAN / PICK", font("C:/Windows/Fonts/bahnschrift.ttf", 62), (235, 242, 255, 22), 14)
    spaced_text(td, 960, 632, "POK FU LAM KING CUP", font("C:/Windows/Fonts/bahnschrift.ttf", 15), (233, 195, 127, 46), 7)
    td.line([(sc(820), sc(660)), (sc(1100), sc(660))], fill=(233, 195, 127, 28), width=sc(1))
    base.alpha_composite(typo)

    # Gold frame lines at the outer edge; no schedule placeholder.
    frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.line([(sc(0), sc(2)), (sc(1920), sc(2))], fill=(233, 195, 127, 135), width=sc(1))
    fd.line([(sc(34), sc(0)), (sc(34), sc(700))], fill=(233, 195, 127, 36), width=sc(1))
    fd.line([(sc(1886), sc(0)), (sc(1886), sc(700))], fill=(233, 195, 127, 32), width=sc(1))
    for x, y, dx, dy in [
        (34, 28, 1, 1),
        (1886, 28, -1, 1),
        (34, 692, 1, -1),
        (1886, 692, -1, -1),
    ]:
        fd.line([(sc(x), sc(y)), (sc(x + 38 * dx), sc(y))], fill=(233, 195, 127, 82), width=sc(1.2))
        fd.line([(sc(x), sc(y)), (sc(x), sc(y + 38 * dy))], fill=(233, 195, 127, 82), width=sc(1.2))
    base.alpha_composite(frame.filter(ImageFilter.GaussianBlur(sc(0.3))))

    # Brand lockup and stage tag.
    brand_panel = Image.new("RGBA", base.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(brand_panel)
    bd.rounded_rectangle(
        (sc(48), sc(30), sc(486), sc(112)),
        radius=sc(12),
        fill=(4, 9, 17, 138),
        outline=(233, 195, 127, 36),
        width=sc(1),
    )
    base.alpha_composite(brand_panel)
    emblem_small = emblem.resize((sc(66), sc(67)), Image.Resampling.LANCZOS)
    base.alpha_composite(emblem_small, (sc(68), sc(38)))
    wordmark = Image.open(ASSETS / "pkc-wordmark.png").convert("RGBA")
    wordmark = wordmark.resize((sc(264), sc(71)), Image.Resampling.LANCZOS)
    base.alpha_composite(wordmark, (sc(166), sc(46)))

    text_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(text_layer)
    td.text((sc(1872), sc(52)), "BP STAGE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 25), fill=(248, 231, 196, 224), anchor="ra")
    td.text((sc(1872), sc(86)), "POK FU LAM KING CUP  /  2026", font=font("C:/Windows/Fonts/bahnschrift.ttf", 12), fill=(223, 230, 244, 108), anchor="ra")
    td.line([(sc(1540), sc(102)), (sc(1872), sc(102))], fill=(233, 195, 127, 52), width=sc(1))
    base.alpha_composite(text_layer)

    # Fine particles, concentrated near the sides.
    particles = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(particles)
    rng = np.random.default_rng(20261017)
    for _ in range(120):
        x = float(rng.uniform(0, 1920))
        y = float(rng.uniform(70, 690))
        edge = min(x, 1920 - x) / 960
        if rng.random() > (0.18 + edge * 0.82):
            continue
        if x < 960:
            color = (80, 145, 255, int(rng.integers(24, 78)))
        else:
            color = (255, 105, 118, int(rng.integers(20, 70)))
        if rng.random() < 0.24:
            color = (233, 195, 127, int(rng.integers(35, 95)))
        r = float(rng.uniform(0.6, 1.7))
        pd.ellipse((sc(x - r), sc(y - r), sc(x + r), sc(y + r)), fill=color)
    base.alpha_composite(particles.filter(ImageFilter.GaussianBlur(sc(0.5))))

    # Clean dark reserved area for the BP board.
    cover = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ca = np.array(cover)
    start, end = sc(700), sc(1080)
    for y in range(start, end):
        t = (y - start) / max(1, end - start)
        alpha = int(220 + 28 * min(1, t * 1.8))
        ca[y, :, 0] = 4
        ca[y, :, 1] = 7
        ca[y, :, 2] = 12
        ca[y, :, 3] = alpha
    base.alpha_composite(Image.fromarray(ca, "RGBA"))

    # A thin stage horizon, then keep the reserved area quiet.
    sep = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sep)
    sd.line([(sc(44), sc(704)), (sc(1876), sc(704))], fill=(233, 195, 127, 58), width=sc(1))
    sd.line([(sc(808), sc(704)), (sc(1112), sc(704))], fill=(233, 195, 127, 135), width=sc(1))
    sd.polygon([(sc(952), sc(697)), (sc(960), sc(690)), (sc(968), sc(697)), (sc(960), sc(704))], fill=(233, 195, 127, 180))
    base.alpha_composite(sep.filter(ImageFilter.GaussianBlur(sc(0.2))))

    soft_ellipse(base, (-580, 830, 540, 1340), rgba("#2b6cff", 32), 190)
    soft_ellipse(base, (1380, 830, 2500, 1340), rgba("#e5484d", 28), 190)

    # Vignette.
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt(((xx - W / 2) / (W * 0.66)) ** 2 + ((yy - H * 0.44) / (H * 0.68)) ** 2)
    vig = np.clip((dist - 0.45) / 0.72, 0, 1) ** 1.7
    arr = np.array(base).astype(np.float32)
    arr[:, :, :3] *= (1 - vig[..., None] * 0.20)
    base = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")

    final = base.resize((LW, LH), Image.Resampling.LANCZOS)
    arr = np.array(final).astype(np.float32)
    grain = np.random.default_rng(20261018).normal(0, 1.5, (LH, LW, 1))
    arr[:, :, :3] = np.clip(arr[:, :, :3] + grain, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


if __name__ == "__main__":
    image = build()
    image.convert("RGB").save(OUT, "PNG", optimize=True)
    print(OUT)
