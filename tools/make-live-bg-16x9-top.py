from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFERENCE = ROOT / "直播素材" / "直播间背景-上方留位.png"
OUT = ROOT / "直播素材" / "直播间背景-上方留位-精修版.png"

W, H = 1920, 1080
FEED = (192, 170, 1728, 1034)  # 1536 × 864 = 16:9

GOLD = (233, 195, 127, 220)
BLUE = (78, 145, 255, 215)
RED = (240, 92, 108, 215)


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def chamfer_points(box: tuple[int, int, int, int], cut: int = 14) -> list[tuple[int, int]]:
    x0, y0, x1, y1 = box
    return [
        (x0 + cut, y0), (x1 - cut, y0), (x1, y0 + cut), (x1, y1 - cut),
        (x1 - cut, y1), (x0 + cut, y1), (x0, y1 - cut), (x0, y0 + cut),
    ]


def gradient_panel(size: tuple[int, int], top: str, bottom: str, alpha: int = 255) -> Image.Image:
    width, height = size
    arr = np.zeros((height, width, 4), dtype=np.uint8)
    c0 = np.array(rgba(top), dtype=np.float32)
    c1 = np.array(rgba(bottom), dtype=np.float32)
    for y in range(height):
        t = y / max(1, height - 1)
        arr[y, :, :] = np.clip(c0 * (1 - t) + c1 * t, 0, 255).astype(np.uint8)
    arr[:, :, 3] = alpha
    return Image.fromarray(arr, "RGBA")


def soft_ellipse(base: Image.Image, box, color, blur: float) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=color)
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def spaced_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font_obj, fill, spacing: int) -> None:
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font_obj, fill=fill)
        x += int(draw.textlength(ch, font=font_obj)) + spacing


def box_panel(base: Image.Image, box, side: str, label: str) -> None:
    x0, y0, x1, y1 = box
    is_blue = side == "blue"
    accent = BLUE if is_blue else RED
    shape = chamfer_points(box, 13)
    fill = "#081b32" if is_blue else "#280b14"

    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon([(x + 5, y + 7) for x, y in shape], fill=(0, 0, 0, 125))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(12)))

    panel = gradient_panel((x1 - x0, y1 - y0), fill, "#040a13", 238)
    mask = Image.new("L", panel.size, 0)
    ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in shape], fill=255)
    panel = Image.composite(panel, Image.new("RGBA", panel.size, (0, 0, 0, 0)), mask)
    base.alpha_composite(panel, (x0, y0))

    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.line(shape + [shape[0]], fill=(*accent[:3], 110), width=1, joint="curve")
    d.line([(x0, y0 + 18), (x0, y1 - 18)], fill=accent, width=4)
    if not is_blue:
        d.line([(x1, y0 + 18), (x1, y1 - 18)], fill=accent, width=4)
    d.text((x0 + 18, y0 + 10), label, font=font("C:/Windows/Fonts/msyhbd.ttc", 13), fill=(238, 244, 255, 235))
    d.line([(x0 + 18, y0 + 35), (x1 - 18, y0 + 35)], fill=(*accent[:3], 82), width=1)
    d.text((x0 + 18, y1 - 25), "ROSTER", font=font("C:/Windows/Fonts/bahnschrift.ttf", 9), fill=(*accent[:3], 100))
    d.text((x1 - 18, y1 - 25), "PKC 2026", font=font("C:/Windows/Fonts/bahnschrift.ttf", 9), fill=(233, 195, 127, 82), anchor="ra")
    d.ellipse((x1 - 25, y0 + 10, x1 - 17, y0 + 18), fill=(*accent[:3], 165))
    base.alpha_composite(layer)

    sheen = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.polygon(
        [(x0 + 14, y0 + 38), (x1 - 60, y0 + 12), (x1 - 20, y0 + 12), (x0 + 14, y0 + 68)],
        fill=(*accent[:3], 12),
    )
    base.alpha_composite(sheen.filter(ImageFilter.GaussianBlur(9)))


def score_panel(base: Image.Image, box) -> None:
    x0, y0, x1, y1 = box
    shape = chamfer_points(box, 13)
    panel = gradient_panel((x1 - x0, y1 - y0), "#07121f", "#04080e", 240)
    mask = Image.new("L", panel.size, 0)
    ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in shape], fill=255)
    panel = Image.composite(panel, Image.new("RGBA", panel.size, (0, 0, 0, 0)), mask)
    base.alpha_composite(panel, (x0, y0))

    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.line(shape + [shape[0]], fill=(233, 195, 127, 74), width=1, joint="curve")
    d.line([(x0 + 14, y0 + 16), (x0 + 14, y1 - 16)], fill=BLUE, width=2)
    d.line([(x1 - 14, y0 + 16), (x1 - 14, y1 - 16)], fill=RED, width=2)
    d.line([(x0 + 30, y0 + 30), (x0 + 94, y0 + 30)], fill=(233, 195, 127, 72), width=1)
    d.line([(x1 - 94, y0 + 30), (x1 - 30, y0 + 30)], fill=(233, 195, 127, 72), width=1)
    d.text((x0 + 30, y0 + 14), "SCORE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 9), fill=(233, 195, 127, 155))
    d.text((x1 - 30, y0 + 14), "SCORE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 9), fill=(233, 195, 127, 155), anchor="ra")
    # Empty score slots: no 0 and no placeholder dash, ready for later fill.
    d.rounded_rectangle(
        (x0 + 72, y0 + 40, x0 + 180, y1 - 15),
        radius=7,
        fill=(*BLUE[:3], 15),
        outline=(*BLUE[:3], 68),
        width=1,
    )
    d.rounded_rectangle(
        (x1 - 180, y0 + 40, x1 - 72, y1 - 15),
        radius=7,
        fill=(*RED[:3], 13),
        outline=(*RED[:3], 62),
        width=1,
    )
    cxm = (x0 + x1) // 2
    cym = (y0 + y1) // 2 + 2
    d.ellipse((cxm - 25, cym - 25, cxm + 25, cym + 25), fill=(3, 8, 15, 225), outline=(233, 195, 127, 96), width=1)
    base.alpha_composite(layer)
    seal = Image.open(ASSETS / "pkc-emblem.png").convert("RGBA")
    seal = seal.resize((34, 35), Image.Resampling.LANCZOS)
    base.alpha_composite(seal, (cxm - 17, cym - 18))


def build() -> Image.Image:
    base = Image.open(REFERENCE).convert("RGBA")
    if base.size != (W, H):
        base = base.resize((W, H), Image.Resampling.LANCZOS)

    base.alpha_composite(Image.new("RGBA", base.size, (2, 5, 10, 42)))
    soft_ellipse(base, (-550, -500, 760, 1060), rgba("#2b6cff", 72), 210)
    soft_ellipse(base, (1160, -500, 2500, 1060), rgba("#e5484d", 58), 210)
    soft_ellipse(base, (380, -520, 1540, 720), rgba("#e9c37f", 36), 240)

    # Cover the old 16:9 frame and redraw it with a cleaner chamfered bezel.
    cover = gradient_panel((1600, 920), "#06101c", "#0a1422", 252)
    base.alpha_composite(cover, (160, 138))
    soft_ellipse(base, (160, 138, 1760, 486), rgba("#243c66", 32), 90)

    # Ghost crests and texture in the narrow side gutters.
    emblem = Image.open(ASSETS / "pkc-emblem.png").convert("RGBA")
    ghost = emblem.resize((290, 294), Image.Resampling.LANCZOS)
    ga = np.array(ghost)
    mask = ga[:, :, 3].astype(np.float32)
    for x, color, alpha in [(-112, (75, 138, 255), 0.085), (1740, (255, 92, 108), 0.076)]:
        layer = Image.new("RGBA", ghost.size, (0, 0, 0, 0))
        la = np.array(layer)
        la[:, :, 0], la[:, :, 1], la[:, :, 2] = color
        la[:, :, 3] = (mask * alpha).astype(np.uint8)
        base.alpha_composite(Image.fromarray(la, "RGBA"), (x, 620))

    grid = Image.new("RGBA", base.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, 170, 42):
        gd.line([(x, 0), (x, 1040)], fill=(220, 234, 255, 5), width=1)
    for x in range(1750, 1920, 42):
        gd.line([(x, 0), (x, 1040)], fill=(220, 234, 255, 5), width=1)
    for y in range(0, 1040, 42):
        gd.line([(0, y), (160, y)], fill=(220, 234, 255, 4), width=1)
        gd.line([(1760, y), (1920, y)], fill=(220, 234, 255, 4), width=1)
    base.alpha_composite(grid)

    # Feed frame.
    x0, y0, x1, y1 = FEED
    edge_glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    egd = ImageDraw.Draw(edge_glow)
    egd.line([(x0, y0), (x0, y1)], fill=(75, 140, 255, 34), width=10)
    egd.line([(x1, y0), (x1, y1)], fill=(232, 74, 89, 30), width=10)
    egd.line([(x0, y0), (x1, y0)], fill=(233, 195, 127, 26), width=7)
    egd.line([(x0, y1), (x1, y1)], fill=(233, 195, 127, 18), width=7)
    base.alpha_composite(edge_glow.filter(ImageFilter.GaussianBlur(13)))

    frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    outer = chamfer_points((x0 - 8, y0 - 8, x1 + 8, y1 + 8), 19)
    inner = chamfer_points((x0 + 2, y0 + 2, x1 - 2, y1 - 2), 14)
    fd.line(outer + [outer[0]], fill=(*GOLD[:3], 218), width=2, joint="curve")
    fd.line(inner + [inner[0]], fill=(255, 241, 203, 46), width=1, joint="curve")
    fd.line([(x0 + 52, y0 - 8), (x1 - 52, y0 - 8)], fill=(255, 240, 198, 175), width=2)
    fd.line([(x0 + 52, y1 + 8), (x1 - 52, y1 + 8)], fill=(255, 240, 198, 120), width=1)
    fd.line([(x0 - 8, y0 + 52), (x0 - 8, y1 - 52)], fill=(74, 142, 255, 96), width=2)
    fd.line([(x1 + 8, y0 + 52), (x1 + 8, y1 - 52)], fill=(240, 84, 100, 92), width=2)
    for a, b in [(outer[1], outer[2]), (outer[3], outer[4]), (outer[5], outer[6]), (outer[7], outer[0])]:
        fd.line([a, b], fill=(255, 244, 210, 225), width=3)
    fd.polygon([(960, y0 - 15), (968, y0 - 8), (960, y0 - 1), (952, y0 - 8)], fill=(255, 238, 191, 205))
    base.alpha_composite(frame)

    # Top information bar.
    bar = Image.new("RGBA", base.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    bd.rounded_rectangle((28, 14, 1892, 132), radius=12, fill=(3, 8, 15, 255), outline=(233, 195, 127, 54), width=1)
    bd.line([(52, 128), (1868, 128)], fill=(233, 195, 127, 44), width=1)
    base.alpha_composite(bar)
    gap = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(gap).rectangle((0, 132, W, 160), fill=(2, 5, 10, 246))
    base.alpha_composite(gap)
    soft_ellipse(base, (914, 112, 1006, 180), rgba("#e9c37f", 34), 18)
    gap_seal = Image.open(ASSETS / "pkc-emblem.png").convert("RGBA")
    gap_seal = gap_seal.resize((28, 29), Image.Resampling.LANCZOS)
    base.alpha_composite(gap_seal, (946, 132))
    box_panel(base, (52, 28, 786, 118), "blue", "TEAM A  /  队名")
    score_panel(base, (806, 28, 1114, 118))
    box_panel(base, (1134, 28, 1868, 118), "red", "TEAM B  /  队名")

    # Footer.
    foot = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(foot)
    fd.rectangle((0, 1034, W, H), fill=(2, 5, 9, 255))
    fd.line([(34, 1036), (1886, 1036)], fill=(233, 195, 127, 82), width=1)
    fd.rounded_rectangle((34, 1044, 100, 1074), radius=6, fill=(3, 8, 15, 255), outline=(233, 195, 127, 70), width=1)
    fd.text((67, 1059), "PKC", font=font("C:/Windows/Fonts/bahnschrift.ttf", 14), fill=(233, 195, 127, 220), anchor="mm")
    fd.rounded_rectangle((1800, 1044, 1876, 1074), radius=7, fill=(241, 74, 88, 20), outline=(241, 74, 88, 82), width=1)
    fd.ellipse((1812, 1052, 1820, 1060), fill=(241, 74, 88, 225))
    fd.text((1856, 1058), "LIVE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 13), fill=(241, 74, 88, 225), anchor="ra")
    base.alpha_composite(foot)
    footer_wordmark = Image.open(ASSETS / "pkc-wordmark.png").convert("RGBA")
    footer_wordmark = footer_wordmark.resize((158, 42), Image.Resampling.LANCZOS)
    base.alpha_composite(footer_wordmark, ((W - 158) // 2, 1037))

    # Side labels and small stage metadata.
    meta = Image.new("RGBA", base.size, (0, 0, 0, 0))
    md = ImageDraw.Draw(meta)
    md.text((44, 150), "BLUE SIDE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 10), fill=(84, 145, 255, 95))
    md.text((1876, 150), "RED SIDE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 10), fill=(240, 92, 108, 90), anchor="ra")
    md.text((1868, 1006), "GAME FEED  /  16:9  ·  1536×864", font=font("C:/Windows/Fonts/bahnschrift.ttf", 9), fill=(233, 195, 127, 82), anchor="ra")
    base.alpha_composite(meta)

    # Light particles in side gutters.
    particles = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(particles)
    rng = np.random.default_rng(20261023)
    for _ in range(80):
        left = rng.random() < 0.5
        x = float(rng.uniform(8, 155)) if left else float(rng.uniform(1765, 1912))
        y = float(rng.uniform(140, 1010))
        color = (90, 150, 255, int(rng.integers(18, 62))) if left else (255, 108, 122, int(rng.integers(16, 58)))
        if rng.random() < 0.2:
            color = (233, 195, 127, int(rng.integers(28, 88)))
        r = float(rng.uniform(0.6, 1.6))
        pd.ellipse((x - r, y - r, x + r, y + r), fill=color)
    base.alpha_composite(particles.filter(ImageFilter.GaussianBlur(0.45)))

    # Outer finish.
    edge = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rectangle((0, 0, W - 1, H - 1), outline=(233, 195, 127, 30), width=1)
    ed.line([(0, 2), (W, 2)], fill=(233, 195, 127, 120), width=1)
    for cx, cy, dx, dy in [(18, 18, 1, 1), (1902, 18, -1, 1), (18, 1000, 1, -1), (1902, 1000, -1, -1)]:
        ed.line([(cx, cy), (cx + 32 * dx, cy)], fill=(233, 195, 127, 120), width=1)
        ed.line([(cx, cy), (cx, cy + 32 * dy)], fill=(233, 195, 127, 120), width=1)
    base.alpha_composite(edge)

    arr = np.array(base).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt(((xx - W / 2) / (W * 0.70)) ** 2 + ((yy - H * 0.46) / (H * 0.75)) ** 2)
    vig = np.clip((dist - 0.48) / 0.72, 0, 1) ** 1.7
    arr[:, :, :3] *= (1 - vig[..., None] * 0.10)
    grain = np.random.default_rng(20261024).normal(0, 0.9, (H, W, 1))
    arr[:, :, :3] = np.clip(arr[:, :, :3] + grain, 0, 255)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


if __name__ == "__main__":
    image = build()
    image.convert("RGB").save(OUT, "PNG", optimize=True)
    print(OUT)
