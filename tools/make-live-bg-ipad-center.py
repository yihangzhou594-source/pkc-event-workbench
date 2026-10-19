from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT = ROOT / "直播素材" / "直播间背景-中间4x3-iPad留位.png"

W, H = 1920, 1080
CENTER = (360, 90, 1560, 990)

GOLD = (233, 195, 127, 220)
GOLD_SOFT = (233, 195, 127, 90)
BLUE = (78, 145, 255, 210)
RED = (240, 92, 108, 210)


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def vertical_panel(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    width, height = size
    arr = np.zeros((height, width, 4), dtype=np.uint8)
    c0 = np.array(rgba(top), dtype=np.float32)
    c1 = np.array(rgba(bottom), dtype=np.float32)
    for y in range(height):
        t = y / max(1, height - 1)
        arr[y, :, :] = np.clip(c0 * (1 - t) + c1 * t, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def gradient_background(size: tuple[int, int], stops: list[tuple[float, str]]) -> Image.Image:
    width, height = size
    arr = np.zeros((height, width, 4), dtype=np.uint8)
    for y in range(height):
        t = y / max(1, height - 1)
        lo, hi = stops[0], stops[-1]
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                lo, hi = stops[i], stops[i + 1]
                break
        k = (t - lo[0]) / max(1e-6, hi[0] - lo[0])
        c0 = np.array(rgba(lo[1]), dtype=np.float32)
        c1 = np.array(rgba(hi[1]), dtype=np.float32)
        arr[y, :, :] = np.clip(c0 * (1 - k) + c1 * k, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def soft_ellipse(base: Image.Image, box, color, blur: float) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=color)
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def spaced_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font_obj, fill, spacing: int) -> int:
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font_obj, fill=fill)
        x += int(draw.textlength(ch, font=font_obj)) + spacing
    return x


def draw_vertical_label(base: Image.Image, text: str, xy: tuple[int, int], fill, font_obj) -> None:
    box = font_obj.getbbox(text)
    layer = Image.new("RGBA", (box[2] - box[0] + 8, box[3] - box[1] + 8), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.text((4 - box[0], 4 - box[1]), text, font=font_obj, fill=fill)
    layer = layer.rotate(90, expand=True)
    base.alpha_composite(layer, xy)


def chamfer_points(box: tuple[int, int, int, int], cut: int = 14) -> list[tuple[int, int]]:
    x0, y0, x1, y1 = box
    return [
        (x0 + cut, y0),
        (x1 - cut, y0),
        (x1, y0 + cut),
        (x1, y1 - cut),
        (x1 - cut, y1),
        (x0 + cut, y1),
        (x0, y1 - cut),
        (x0, y0 + cut),
    ]


def panel(
    base: Image.Image,
    box: tuple[int, int, int, int],
    side: str,
    title: str,
) -> None:
    x0, y0, x1, y1 = box
    is_blue = side == "blue"
    accent = BLUE if is_blue else RED
    fill_top = "#081a31" if is_blue else "#250a12"
    fill_bottom = "#050c18" if is_blue else "#14060c"
    shape = chamfer_points(box, 14)

    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.polygon([(x + 5, y + 8) for x, y in shape], fill=(0, 0, 0, 126))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))

    glass = vertical_panel((x1 - x0, y1 - y0), fill_top, fill_bottom).convert("RGBA")
    alpha = np.array(glass)
    alpha[:, :, 3] = 232
    glass = Image.fromarray(alpha, "RGBA")
    mask = Image.new("L", glass.size, 0)
    ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in shape], fill=255)
    glass = Image.composite(glass, Image.new("RGBA", glass.size, (0, 0, 0, 0)), mask)
    base.alpha_composite(glass, (x0, y0))

    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.line(shape + [shape[0]], fill=(*accent[:3], 112), width=1, joint="curve")
    d.line([(x0, y0 + 22), (x0, y1 - 22)], fill=accent, width=4)
    if not is_blue:
        d.line([(x1, y0 + 22), (x1, y1 - 22)], fill=accent, width=4)

    # A faint diagonal sheen makes the large cards feel like glass instead of
    # flat black rectangles.
    sheen = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shd = ImageDraw.Draw(sheen)
    shd.polygon(
        [(x0 + 10, y0 + 42), (x1 - 50, y0 + 10), (x1 - 10, y0 + 10), (x0 + 10, y0 + 78)],
        fill=(*accent[:3], 12),
    )
    base.alpha_composite(sheen.filter(ImageFilter.GaussianBlur(10)))

    title_font = font("C:/Windows/Fonts/bahnschrift.ttf", 13)
    spaced_text(d, (x0 + 16, y0 + 14), title, title_font, (238, 244, 255, 235), 1)
    d.line([(x0 + 16, y0 + 38), (x1 - 16, y0 + 38)], fill=(*accent[:3], 90), width=1)
    d.ellipse((x1 - 24, y0 + 14, x1 - 16, y0 + 22), fill=(*accent[:3], 165))
    micro = font("C:/Windows/Fonts/bahnschrift.ttf", 9)
    d.text((x0 + 16, y1 - 28), "ROSTER" if title == "TEAM" else "SERIES SCORE", font=micro, fill=(*accent[:3], 105))
    d.text((x1 - 16, y1 - 28), "PKC 2026", font=micro, fill=(233, 195, 127, 86), anchor="ra")
    base.alpha_composite(layer)

    vertical_font = font("C:/Windows/Fonts/bahnschrift.ttf", 10)
    vx = x0 + 12 if is_blue else x1 - 24
    draw_vertical_label(base, "BLUE SIDE" if is_blue else "RED SIDE", (vx, y0 + 52), (*accent[:3], 125), vertical_font)

    if title == "TEAM":
        letter = "A" if is_blue else "B"
        letter_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(letter_layer)
        ld.text(
            (x1 - 56, y0 + 88),
            letter,
            font=font("C:/Windows/Fonts/bahnschrift.ttf", 92),
            fill=(*accent[:3], 23),
            anchor="ra",
        )
        base.alpha_composite(letter_layer)


def build() -> Image.Image:
    base = gradient_background(
        (W, H),
        [
            (0.00, "#050b16"),
            (0.22, "#0a1a30"),
            (0.50, "#0a1728"),
            (0.70, "#070d16"),
            (0.86, "#040810"),
            (1.00, "#020407"),
        ],
    )

    # Round 1: cinematic master grade — deeper edges, stronger side light,
    # and a warm center glow that separates the 4:3 window from the gutters.
    soft_ellipse(base, (-700, -560, 900, 1060), rgba("#245dff", 108), 240)
    soft_ellipse(base, (1020, -560, 2620, 1060), rgba("#ec4355", 92), 240)
    soft_ellipse(base, (380, -620, 1540, 720), rgba("#e9c37f", 54), 270)
    soft_ellipse(base, (460, 890, 1460, 1240), rgba("#3e75ff", 18), 220)

    # Fine technical grid in the side gutters only; the iPad window stays clean.
    grid = Image.new("RGBA", base.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, 360, 48):
        gd.line([(x, 0), (x, 990)], fill=(220, 234, 255, 5), width=1)
    for x in range(1560, 1920, 48):
        gd.line([(x, 0), (x, 990)], fill=(220, 234, 255, 5), width=1)
    for y in range(0, 990, 48):
        gd.line([(0, y), (342, y)], fill=(220, 234, 255, 4), width=1)
        gd.line([(1578, y), (1920, y)], fill=(220, 234, 255, 4), width=1)
    base.alpha_composite(grid)

    # Round 2: a ghosted crest in each side gutter, tinted to its team side.
    emblem_ghost = Image.open(ASSETS / "pkc-emblem.png").convert("RGBA")
    emblem_ghost = emblem_ghost.resize((410, 415), Image.Resampling.LANCZOS)
    ga = np.array(emblem_ghost)
    mask = ga[:, :, 3].astype(np.float32)

    left_ghost = Image.new("RGBA", base.size, (0, 0, 0, 0))
    left_layer = Image.new("RGBA", emblem_ghost.size, (0, 0, 0, 0))
    la = np.array(left_layer)
    la[:, :, 0] = 73
    la[:, :, 1] = 136
    la[:, :, 2] = 255
    la[:, :, 3] = (mask * 0.05).astype(np.uint8)
    left_ghost.alpha_composite(Image.fromarray(la, "RGBA"), (-92, 530))
    base.alpha_composite(left_ghost)

    right_ghost = Image.new("RGBA", base.size, (0, 0, 0, 0))
    right_layer = Image.new("RGBA", emblem_ghost.size, (0, 0, 0, 0))
    ra = np.array(right_layer)
    ra[:, :, 0] = 255
    ra[:, :, 1] = 92
    ra[:, :, 2] = 108
    ra[:, :, 3] = (mask * 0.045).astype(np.uint8)
    right_ghost.alpha_composite(Image.fromarray(ra, "RGBA"), (1600, 530))
    base.alpha_composite(right_ghost)

    # Angled side streaks keep the wide margins from feeling empty.
    streaks = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(streaks)
    for x, color, alpha in [(0, "#4d8dff", 18), (34, "#4d8dff", 8), (1688, "#ff6674", 16), (1718, "#ff6674", 7)]:
        sd.line([(x, 980), (x + 360, 24)], fill=rgba(color, alpha), width=2)
    base.alpha_composite(streaks.filter(ImageFilter.GaussianBlur(1.2)))

    # Round 9: broad stage beams from the upper corners, kept outside the
    # capture window so the iPad area remains visually neutral.
    beams = Image.new("RGBA", base.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(beams)
    bd.polygon([(0, 0), (500, 0), (360, 990), (0, 990)], fill=(65, 132, 255, 10))
    bd.polygon([(1420, 0), (1920, 0), (1920, 990), (1560, 990)], fill=(239, 77, 94, 8))
    bd.polygon([(710, 0), (1210, 0), (1160, 210), (760, 210)], fill=(233, 195, 127, 8))
    base.alpha_composite(beams.filter(ImageFilter.GaussianBlur(34)))

    # Round 2b: sparse light particles in the gutters only.
    particles = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(particles)
    rng = np.random.default_rng(20261021)
    for _ in range(90):
        left = rng.random() < 0.5
        x = float(rng.uniform(8, 340)) if left else float(rng.uniform(1580, 1912))
        y = float(rng.uniform(130, 960))
        color = (90, 150, 255, int(rng.integers(20, 66))) if left else (255, 108, 122, int(rng.integers(18, 60)))
        if rng.random() < 0.22:
            color = (233, 195, 127, int(rng.integers(30, 92)))
        r = float(rng.uniform(0.6, 1.7))
        pd.ellipse((x - r, y - r, x + r, y + r), fill=color)
    base.alpha_composite(particles.filter(ImageFilter.GaussianBlur(0.45)))

    x0, y0, x1, y1 = CENTER
    cw, ch = x1 - x0, y1 - y0

    # Shadow + 4:3 dark screen placeholder.
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x0 - 5, y0 - 4, x1 + 7, y1 + 10), radius=16, fill=(0, 0, 0, 175))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))

    screen = vertical_panel((cw, ch), "#07111d", "#0c1727")
    base.alpha_composite(screen, (x0, y0))

    # Very restrained central light, so the area still reads as “empty”.
    glow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((cw * 0.18, -ch * 0.3, cw * 0.82, ch * 0.78), fill=(77, 137, 255, 14))
    gd.ellipse((cw * 0.52, -ch * 0.25, cw * 1.15, ch * 0.82), fill=(229, 72, 77, 10))
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(90)), (x0, y0))

    # Gold frame around the 4:3 window.
    edge_glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    egd = ImageDraw.Draw(edge_glow)
    egd.line([(x0, y0), (x0, y1)], fill=(75, 140, 255, 34), width=10)
    egd.line([(x1, y0), (x1, y1)], fill=(232, 74, 89, 30), width=10)
    egd.line([(x0, y0), (x1, y0)], fill=(233, 195, 127, 26), width=7)
    egd.line([(x0, y1), (x1, y1)], fill=(233, 195, 127, 18), width=7)
    base.alpha_composite(edge_glow.filter(ImageFilter.GaussianBlur(12)))

    frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    outer = chamfer_points((x0 - 8, y0 - 8, x1 + 8, y1 + 8), 20)
    inner = chamfer_points((x0 + 2, y0 + 2, x1 - 2, y1 - 2), 15)
    fd.line(outer + [outer[0]], fill=(*GOLD[:3], 218), width=2, joint="curve")
    fd.line(inner + [inner[0]], fill=(255, 241, 203, 48), width=1, joint="curve")
    fd.line([(x0 + 48, y0 - 8), (x1 - 48, y0 - 8)], fill=(255, 240, 198, 178), width=2)
    fd.line([(x0 + 48, y1 + 8), (x1 - 48, y1 + 8)], fill=(255, 240, 198, 122), width=1)
    fd.line([(x0 - 8, y0 + 48), (x0 - 8, y1 - 48)], fill=(74, 142, 255, 102), width=2)
    fd.line([(x1 + 8, y0 + 48), (x1 + 8, y1 - 48)], fill=(240, 84, 100, 96), width=2)
    for a, b in [(outer[1], outer[2]), (outer[3], outer[4]), (outer[5], outer[6]), (outer[7], outer[0])]:
        fd.line([a, b], fill=(255, 244, 210, 225), width=3)
    fd.polygon(
        [(960, y0 - 15), (968, y0 - 8), (960, y0 - 1), (952, y0 - 8)],
        fill=(255, 238, 191, 205),
    )
    fd.polygon(
        [(960, y1 + 1), (968, y1 + 8), (960, y1 + 15), (952, y1 + 8)],
        fill=(255, 238, 191, 145),
    )
    base.alpha_composite(frame)

    # Small corner blooms: enough to catch the eye, not enough to fight the UI.
    corner_glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    cgd = ImageDraw.Draw(corner_glow)
    for px, py, color in [
        (x0 - 8, y0 - 8, (85, 150, 255, 36)),
        (x1 + 8, y0 - 8, (241, 92, 108, 32)),
        (x0 - 8, y1 + 8, (85, 150, 255, 26)),
        (x1 + 8, y1 + 8, (241, 92, 108, 24)),
    ]:
        cgd.ellipse((px - 34, py - 34, px + 34, py + 34), fill=color)
    base.alpha_composite(corner_glow.filter(ImageFilter.GaussianBlur(18)))

    # Side cards aligned to the wider margins of the 4:3 layout.
    panel(base, (34, 148, 342, 412), "blue", "TEAM")
    panel(base, (34, 446, 342, 882), "blue", "SCORE")
    panel(base, (1578, 148, 1886, 412), "red", "TEAM")
    panel(base, (1578, 446, 1886, 882), "red", "SCORE")

    # Score circles.
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for cx, color in [(188, (*BLUE[:3], 160)), (1732, (*RED[:3], 160))]:
        ring_glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
        rgd = ImageDraw.Draw(ring_glow)
        rgd.ellipse((cx - 76, 606 - 76, cx + 76, 606 + 76), outline=(*color[:3], 30), width=10)
        base.alpha_composite(ring_glow.filter(ImageFilter.GaussianBlur(16)))
        d.ellipse((cx - 64, 606 - 64, cx + 64, 606 + 64), outline=(*color[:3], 40), width=1)
        d.ellipse((cx - 53, 606 - 53, cx + 53, 606 + 53), outline=(233, 195, 127, 165), width=2)
        for i in range(12):
            angle = math.radians(i * 30)
            r0 = 58 if i % 3 else 61
            r1 = 68 if i % 3 else 72
            x_a = cx + math.cos(angle) * r0
            y_a = 606 + math.sin(angle) * r0
            x_b = cx + math.cos(angle) * r1
            y_b = 606 + math.sin(angle) * r1
            alpha = 150 if i % 3 else 205
            d.line([(x_a, y_a), (x_b, y_b)], fill=(*color[:3], alpha), width=2 if i % 3 == 0 else 1)
        d.polygon(
            [(cx, 601), (cx + 5, 606), (cx, 611), (cx - 5, 606)],
            fill=(233, 195, 127, 145),
        )
    base.alpha_composite(layer)

    # Tiny positioning label outside the 4:3 area, useful during setup.
    label = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(label)
    ld.text(
        (1578, 906),
        "IPAD  /  4:3",
        font=font("C:/Windows/Fonts/bahnschrift.ttf", 11),
        fill=(233, 195, 127, 110),
    )
    base.alpha_composite(label)

    # Top header: fade the old 16:9 header into the new frame and redraw a
    # compact brand lockup in the 90 px top band.
    top = Image.new("RGBA", base.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    for y in range(0, 92):
        a = int(238 * (1 - y / 92))
        td.line([(0, y), (W, y)], fill=(2, 5, 10, a))
    base.alpha_composite(top)
    soft_ellipse(base, (690, -48, 1230, 124), rgba("#e9c37f", 24), 44)

    emblem = Image.open(ASSETS / "pkc-emblem.png").convert("RGBA")
    emblem = emblem.resize((54, 55), Image.Resampling.LANCZOS)
    wordmark = Image.open(ASSETS / "pkc-wordmark.png").convert("RGBA")
    wordmark = wordmark.resize((292, 78), Image.Resampling.LANCZOS)
    lock_w = 54 + 12 + 292
    lock_x = (W - lock_w) // 2
    base.alpha_composite(emblem, (lock_x, 8))
    base.alpha_composite(wordmark, (lock_x + 66, 4))

    # Bottom status strip.
    foot = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(foot)
    for y in range(990, 1080):
        a = int(232 + 22 * ((y - 990) / 90))
        fd.line([(0, y), (W, y)], fill=(2, 5, 9, min(255, a)))
    fd.line([(34, 990), (1886, 990)], fill=(233, 195, 127, 80), width=1)
    fd.rounded_rectangle((34, 1009, 102, 1052), radius=7, fill=(233, 195, 127, 18), outline=(233, 195, 127, 72), width=1)
    fd.text((64, 1029), "PKC", font=font("C:/Windows/Fonts/bahnschrift.ttf", 23), fill=(233, 195, 127, 230))
    footer_text = "薄扶林王者杯  ·  POK FU LAM KING CUP  ·  2026"
    fnt = font("C:/Windows/Fonts/msyh.ttc", 17)
    tw = fd.textlength(footer_text, font=fnt)
    fd.text(((W - tw) / 2, 1029), footer_text, font=fnt, fill=(240, 224, 190, 225))
    fd.rounded_rectangle((1802, 1015, 1876, 1048), radius=8, fill=(241, 74, 88, 22), outline=(241, 74, 88, 90), width=1)
    fd.ellipse((1814, 1027, 1822, 1035), fill=(241, 74, 88, 235))
    fd.text((1856, 1029), "LIVE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 17), fill=(241, 74, 88, 225), anchor="ra")
    base.alpha_composite(foot)

    # Outer corner brackets add a finished broadcast-frame feel without
    # occupying any part of the iPad capture area.
    corners = Image.new("RGBA", base.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(corners)
    for cx, cy, dx, dy in [(18, 18, 1, 1), (1902, 18, -1, 1), (18, 982, 1, -1), (1902, 982, -1, -1)]:
        cd.line([(cx, cy), (cx + 34 * dx, cy)], fill=(233, 195, 127, 125), width=1)
        cd.line([(cx, cy), (cx, cy + 34 * dy)], fill=(233, 195, 127, 125), width=1)
    base.alpha_composite(corners)

    # Outer border to match the reference visual.
    edge = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rectangle((0, 0, W - 1, H - 1), outline=(233, 195, 127, 28), width=1)
    ed.line([(0, 2), (W, 2)], fill=(233, 195, 127, 118), width=1)
    base.alpha_composite(edge)

    # Round 10: final cinematic vignette and a barely visible grain layer keep
    # the large dark gradients from banding on stream encoders.
    arr = np.array(base).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt(((xx - W / 2) / (W * 0.68)) ** 2 + ((yy - H * 0.46) / (H * 0.72)) ** 2)
    vig = np.clip((dist - 0.48) / 0.72, 0, 1) ** 1.7
    arr[:, :, :3] *= (1 - vig[..., None] * 0.10)
    grain = np.random.default_rng(20261022).normal(0, 0.9, (H, W, 1))
    arr[:, :, :3] = np.clip(arr[:, :, :3] + grain, 0, 255)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


if __name__ == "__main__":
    image = build()
    image.convert("RGB").save(OUT, "PNG", optimize=True)
    print(OUT)
