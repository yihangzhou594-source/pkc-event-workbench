from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT = ROOT / "直播素材" / "直播间背景-4x3-iPad.png"

LW, LH = 2048, 1536
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


def spaced_text(draw: ImageDraw.ImageDraw, center_x: float, y: float, text: str, font_obj, fill, spacing: float) -> None:
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
            (0.00, "#040a15"),
            (0.22, "#0a1729"),
            (0.52, "#0b1525"),
            (0.70, "#080d16"),
            (0.76, "#050810"),
            (1.00, "#030507"),
        ],
    )

    soft_ellipse(base, (-900, -760, 1000, 1150), rgba("#2b6cff", 92), 260)
    soft_ellipse(base, (1050, -760, 2950, 1150), rgba("#e5484d", 80), 260)
    soft_ellipse(base, (390, -700, 1660, 820), rgba("#e9c37f", 50), 270)

    # Central vertical stage light.
    col = Image.new("RGBA", base.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(col)
    cd.polygon(
        [(sc(820), sc(0)), (sc(1228), sc(0)), (sc(1152), sc(1120)), (sc(896), sc(1120))],
        fill=rgba("#ffe6b3", 17),
    )
    base.alpha_composite(col.filter(ImageFilter.GaussianBlur(sc(62))))

    # Side shards.
    shards = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shards)
    for poly in [
        [(0, 150), (360, 64), (460, 248), (92, 370)],
        [(0, 435), (278, 382), (420, 590), (0, 720)],
        [(0, 812), (330, 730), (460, 990), (0, 1070)],
    ]:
        sd.polygon([(sc(x), sc(y)) for x, y in poly], fill=rgba("#2b6cff", 10))
    for poly in [
        [(2048, 150), (1688, 64), (1588, 248), (1956, 370)],
        [(2048, 435), (1770, 382), (1628, 590), (2048, 720)],
        [(2048, 812), (1718, 730), (1588, 990), (2048, 1070)],
    ]:
        sd.polygon([(sc(x), sc(y)) for x, y in poly], fill=rgba("#e5484d", 9))
    base.alpha_composite(shards.filter(ImageFilter.GaussianBlur(sc(10))))

    # Ring geometry around the central crest.
    rings = Image.new("RGBA", base.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(rings)
    cx, cy = 1024, 610
    for radius, alpha, width in [(300, 16, 1), (390, 24, 1), (500, 14, 1), (640, 10, 1)]:
        rd.ellipse(
            (sc(cx - radius), sc(cy - radius), sc(cx + radius), sc(cy + radius)),
            outline=(233, 195, 127, alpha),
            width=sc(width),
        )
    for angle in range(0, 360, 30):
        rad = math.radians(angle)
        x1, y1 = cx + math.cos(rad) * 292, cy + math.sin(rad) * 292
        x2, y2 = cx + math.cos(rad) * 652, cy + math.sin(rad) * 652
        rd.line([(sc(x1), sc(y1)), (sc(x2), sc(y2))], fill=(214, 230, 255, 5), width=1)
    base.alpha_composite(rings.filter(ImageFilter.GaussianBlur(sc(0.4))))

    # Arena perspective floor.
    floor = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(floor)
    vx, vy = 1024, 850
    for x in range(-900, 3001, 250):
        fd.line([(sc(vx), sc(vy)), (sc(x), sc(1150))], fill=(220, 234, 255, 9), width=1)
    for y in [930, 1000, 1070, 1140]:
        fd.line([(sc(0), sc(y)), (sc(2048), sc(y))], fill=(233, 195, 127, 7), width=1)
    base.alpha_composite(floor)

    emblem = Image.open(ASSETS / "pkc-emblem.png").convert("RGBA")
    halo = Image.new("RGBA", base.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse((sc(580), sc(90), sc(1468), sc(1010)), fill=rgba("#e9c37f", 28))
    base.alpha_composite(halo.filter(ImageFilter.GaussianBlur(sc(95))))

    # The crest is a watermark rather than a solid centerpiece: this keeps the
    # middle readable for a host, game capture, captions or other live overlays.
    crest = emblem.resize((sc(720), sc(729)), Image.Resampling.LANCZOS)
    ca = np.array(crest)
    ca[:, :, 3] = (ca[:, :, 3].astype(np.float32) * 0.34).astype(np.uint8)
    crest = Image.fromarray(ca, "RGBA")
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    glow.alpha_composite(crest, (sc(664), sc(244)))
    ga = np.array(glow)
    ga[:, :, 0] = 233
    ga[:, :, 1] = 195
    ga[:, :, 2] = 127
    ga[:, :, 3] = (ga[:, :, 3].astype(np.float32) * 0.28).astype(np.uint8)
    base.alpha_composite(Image.fromarray(ga, "RGBA").filter(ImageFilter.GaussianBlur(sc(22))))
    base.alpha_composite(crest, (sc(664), sc(244)))

    # Headline typography below the crest; still low-contrast for overlay use.
    typo = Image.new("RGBA", base.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(typo)
    spaced_text(td, 1024, 1000, "PKC LIVE STAGE", font("C:/Windows/Fonts/bahnschrift.ttf", 54), (238, 244, 255, 25), 18)
    spaced_text(td, 1024, 1080, "POK FU LAM KING CUP  ·  2026", font("C:/Windows/Fonts/bahnschrift.ttf", 16), (233, 195, 127, 58), 7)
    td.line([(sc(790), sc(1120)), (sc(1258), sc(1120))], fill=(233, 195, 127, 32), width=sc(1))
    base.alpha_composite(typo)

    # Outer frame.
    frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.line([(sc(0), sc(2)), (sc(2048), sc(2))], fill=(233, 195, 127, 140), width=sc(1))
    fd.line([(sc(34), sc(0)), (sc(34), sc(1150))], fill=(233, 195, 127, 35), width=sc(1))
    fd.line([(sc(2014), sc(0)), (sc(2014), sc(1150))], fill=(233, 195, 127, 31), width=sc(1))
    for x, y, dx, dy in [(34, 30, 1, 1), (2014, 30, -1, 1), (34, 1142, 1, -1), (2014, 1142, -1, -1)]:
        fd.line([(sc(x), sc(y)), (sc(x + 42 * dx), sc(y))], fill=(233, 195, 127, 84), width=sc(1.2))
        fd.line([(sc(x), sc(y)), (sc(x), sc(y + 42 * dy))], fill=(233, 195, 127, 84), width=sc(1.2))
    base.alpha_composite(frame.filter(ImageFilter.GaussianBlur(sc(0.3))))

    # Brand lockup.
    brand_panel = Image.new("RGBA", base.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(brand_panel)
    bd.rounded_rectangle(
        (sc(54), sc(38), sc(548), sc(126)),
        radius=sc(13),
        fill=(4, 9, 17, 140),
        outline=(233, 195, 127, 38),
        width=sc(1),
    )
    base.alpha_composite(brand_panel)
    emblem_small = emblem.resize((sc(72), sc(73)), Image.Resampling.LANCZOS)
    base.alpha_composite(emblem_small, (sc(76), sc(46)))
    wordmark = Image.open(ASSETS / "pkc-wordmark.png").convert("RGBA")
    wordmark = wordmark.resize((sc(302), sc(81)), Image.Resampling.LANCZOS)
    base.alpha_composite(wordmark, (sc(178), sc(56)))

    # Live badge, top-right.
    badge = Image.new("RGBA", base.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    bd.rounded_rectangle(
        (sc(1742), sc(44), sc(1992), sc(112)),
        radius=sc(10),
        fill=(4, 9, 17, 120),
        outline=(233, 195, 127, 32),
        width=sc(1),
    )
    bd.ellipse((sc(1766), sc(70), sc(1782), sc(86)), fill=(235, 62, 76, 230))
    bd.text(
        (sc(1796), sc(58)),
        "LIVE STAGE",
        font=font("C:/Windows/Fonts/bahnschrift.ttf", 22),
        fill=(248, 231, 196, 228),
    )
    bd.text(
        (sc(1796), sc(88)),
        "PKC 2026",
        font=font("C:/Windows/Fonts/bahnschrift.ttf", 11),
        fill=(223, 230, 244, 100),
    )
    base.alpha_composite(badge)

    # Particles concentrated near the left / right sides.
    particles = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(particles)
    rng = np.random.default_rng(20261019)
    for _ in range(150):
        x = float(rng.uniform(0, 2048))
        y = float(rng.uniform(70, 1150))
        edge = min(x, 2048 - x) / 1024
        if rng.random() > (0.15 + edge * 0.85):
            continue
        color = (82, 146, 255, int(rng.integers(22, 72))) if x < 1024 else (255, 104, 118, int(rng.integers(20, 66)))
        if rng.random() < 0.24:
            color = (233, 195, 127, int(rng.integers(32, 88)))
        r = float(rng.uniform(0.7, 1.9))
        pd.ellipse((sc(x - r), sc(y - r), sc(x + r), sc(y + r)), fill=color)
    base.alpha_composite(particles.filter(ImageFilter.GaussianBlur(sc(0.55))))

    # Calm lower area for host / captions / live widgets.
    cover = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ca = np.array(cover)
    start, end = sc(1152), sc(1536)
    for y in range(start, end):
        t = (y - start) / max(1, end - start)
        alpha = int(215 + 34 * min(1, t * 1.7))
        ca[y, :, 0] = 4
        ca[y, :, 1] = 7
        ca[y, :, 2] = 12
        ca[y, :, 3] = alpha
    base.alpha_composite(Image.fromarray(ca, "RGBA"))

    sep = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sep)
    sd.line([(sc(52), sc(1156)), (sc(1996), sc(1156))], fill=(233, 195, 127, 54), width=sc(1))
    sd.line([(sc(872), sc(1156)), (sc(1176), sc(1156))], fill=(233, 195, 127, 130), width=sc(1))
    sd.polygon(
        [(sc(1016), sc(1149)), (sc(1024), sc(1142)), (sc(1032), sc(1149)), (sc(1024), sc(1156))],
        fill=(233, 195, 127, 180),
    )
    base.alpha_composite(sep.filter(ImageFilter.GaussianBlur(sc(0.2))))

    soft_ellipse(base, (-700, 1180, 500, 1770), rgba("#2b6cff", 28), 220)
    soft_ellipse(base, (1550, 1180, 2750, 1770), rgba("#e5484d", 24), 220)

    # Vignette.
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt(((xx - W / 2) / (W * 0.68)) ** 2 + ((yy - H * 0.43) / (H * 0.70)) ** 2)
    vig = np.clip((dist - 0.46) / 0.72, 0, 1) ** 1.7
    arr = np.array(base).astype(np.float32)
    arr[:, :, :3] *= (1 - vig[..., None] * 0.20)
    base = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")

    final = base.resize((LW, LH), Image.Resampling.LANCZOS)
    arr = np.array(final).astype(np.float32)
    grain = np.random.default_rng(20261020).normal(0, 1.45, (LH, LW, 1))
    arr[:, :, :3] = np.clip(arr[:, :, :3] + grain, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


if __name__ == "__main__":
    image = build()
    image.convert("RGB").save(OUT, "PNG", optimize=True)
    print(OUT)
