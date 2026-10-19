from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT = ROOT / "直播素材" / "直播间背景-上下4x3-iPad留位.png"

W, H = 1920, 1080
CENTER = (360, 96, 1560, 996)  # 1200 × 900 = 4:3

GOLD = (233, 195, 127, 220)
BLUE = (78, 145, 255, 215)
RED = (240, 92, 108, 215)


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


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


def spaced_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font_obj, fill, spacing: int) -> None:
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font_obj, fill=fill)
        x += int(draw.textlength(ch, font=font_obj)) + spacing


def vertical_label(base: Image.Image, text: str, xy: tuple[int, int], fill, font_obj) -> None:
    box = font_obj.getbbox(text)
    layer = Image.new("RGBA", (box[2] - box[0] + 8, box[3] - box[1] + 8), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((4 - box[0], 4 - box[1]), text, font=font_obj, fill=fill)
    base.alpha_composite(layer.rotate(90, expand=True), xy)


def team_box(base: Image.Image, box, side: str, label: str) -> None:
    x0, y0, x1, y1 = box
    is_blue = side == "blue"
    accent = BLUE if is_blue else RED
    fill = "#071a31" if is_blue else "#260a13"

    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x0 + 4, y0 + 6, x1 + 4, y1 + 6), radius=9, fill=(0, 0, 0, 120)
    )
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(9)))

    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((x0, y0, x1, y1), radius=9, fill=(*rgba(fill)[:3], 238), outline=(*accent[:3], 75), width=1)
    d.line([(x0, y0 + 12), (x0, y1 - 12)], fill=accent, width=3)
    if not is_blue:
        d.line([(x1, y0 + 12), (x1, y1 - 12)], fill=accent, width=3)
    d.text((x0 + 16, y0 + 10), label, font=font("C:/Windows/Fonts/msyhbd.ttc", 12), fill=(238, 244, 255, 235))
    d.line([(x0 + 16, y0 + 32), (x1 - 16, y0 + 32)], fill=(*accent[:3], 65), width=1)
    d.line([(x0 + 16, y1 - 16), (x1 - 16, y1 - 16)], fill=(233, 195, 127, 48), width=1)
    base.alpha_composite(layer)


def score_box(base: Image.Image, box) -> None:
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((x0, y0, x1, y1), radius=9, fill=(3, 8, 15, 232), outline=(233, 195, 127, 62), width=1)
    d.line([(x0 + 16, y0 + 11), (x0 + 16, y1 - 11)], fill=BLUE, width=2)
    d.line([(x1 - 16, y0 + 11), (x1 - 16, y1 - 11)], fill=RED, width=2)
    d.text((x0 + 28, y0 + 7), "SCORE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 10), fill=(233, 195, 127, 185))
    d.text((x1 - 28, y0 + 7), "SCORE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 10), fill=(233, 195, 127, 185), anchor="ra")
    d.text((x0 + 62, y0 + 35), "0", font=font("C:/Windows/Fonts/bahnschrift.ttf", 28), fill=(*BLUE[:3], 235), anchor="ma")
    d.text((x1 - 62, y0 + 35), "0", font=font("C:/Windows/Fonts/bahnschrift.ttf", 28), fill=(*RED[:3], 235), anchor="ma")
    d.line([((x0 + x1) // 2, y0 + 30), ((x0 + x1) // 2, y1 - 12)], fill=(233, 195, 127, 70), width=1)
    base.alpha_composite(layer)


def build() -> Image.Image:
    base = gradient_background(
        (W, H),
        [
            (0.00, "#06101d"),
            (0.28, "#0a1729"),
            (0.56, "#08131f"),
            (0.75, "#050a12"),
            (1.00, "#030508"),
        ],
    )
    soft_ellipse(base, (-660, -480, 840, 1040), rgba("#2b6cff", 88), 230)
    soft_ellipse(base, (1080, -480, 2580, 1040), rgba("#e5484d", 76), 230)
    soft_ellipse(base, (400, -520, 1520, 640), rgba("#e9c37f", 38), 250)

    # Side atmosphere, deliberately quieter than the 左右留位版.
    side = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(side)
    for x, color, alpha in [(0, "#4d8dff", 18), (32, "#4d8dff", 7), (1700, "#ff6674", 16), (1728, "#ff6674", 6)]:
        sd.line([(x, 980), (x + 320, 28)], fill=rgba(color, alpha), width=2)
    base.alpha_composite(side.filter(ImageFilter.GaussianBlur(1.2)))
    vertical_label(base, "BLUE SIDE", (18, 450), (83, 147, 255, 54), font("C:/Windows/Fonts/bahnschrift.ttf", 10))
    vertical_label(base, "RED SIDE", (1868, 450), (240, 92, 108, 48), font("C:/Windows/Fonts/bahnschrift.ttf", 10))

    # Central 4:3 iPad area.
    x0, y0, x1, y1 = CENTER
    cw, ch = x1 - x0, y1 - y0
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x0 - 6, y0 - 5, x1 + 8, y1 + 10), radius=16, fill=(0, 0, 0, 180))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))

    screen = gradient_background((cw, ch), [(0.0, "#07111d"), (1.0, "#0c1727")])
    base.alpha_composite(screen, (x0, y0))

    glow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((cw * 0.15, -ch * 0.30, cw * 0.84, ch * 0.80), fill=(77, 137, 255, 14))
    gd.ellipse((cw * 0.50, -ch * 0.28, cw * 1.16, ch * 0.84), fill=(229, 72, 77, 10))
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(90)), (x0, y0))

    frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle((x0 - 6, y0 - 6, x1 + 6, y1 + 6), radius=6, outline=(*GOLD[:3], 212), width=2)
    fd.rounded_rectangle((x0 + 2, y0 + 2, x1 - 2, y1 - 2), radius=3, outline=(255, 241, 203, 42), width=1)
    for cx, cy, dx, dy in [
        (x0 - 6, y0 - 6, 1, 1),
        (x1 + 6, y0 - 6, -1, 1),
        (x0 - 6, y1 + 6, 1, -1),
        (x1 + 6, y1 + 6, -1, -1),
    ]:
        fd.line([(cx, cy), (cx + 28 * dx, cy)], fill=(255, 238, 191, 230), width=2)
        fd.line([(cx, cy), (cx, cy + 28 * dy)], fill=(255, 238, 191, 230), width=2)
    base.alpha_composite(frame)

    # Top info bar.
    bar = Image.new("RGBA", base.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    bd.rounded_rectangle((34, 14, 1886, 84), radius=11, fill=(3, 8, 15, 226), outline=(233, 195, 127, 47), width=1)
    base.alpha_composite(bar)

    team_box(base, (54, 24, 790, 76), "blue", "TEAM A  /  队名")
    score_box(base, (812, 22, 1108, 78))
    team_box(base, (1130, 24, 1866, 76), "red", "TEAM B  /  队名")

    # Footer.
    foot = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(foot)
    for y in range(996, 1080):
        a = int(236 + 18 * ((y - 996) / 84))
        fd.line([(0, y), (W, y)], fill=(2, 5, 9, min(255, a)))
    fd.line([(34, 996), (1886, 996)], fill=(233, 195, 127, 64), width=1)
    fd.text((64, 1033), "PKC", font=font("C:/Windows/Fonts/bahnschrift.ttf", 23), fill=(233, 195, 127, 230))
    footer_text = "薄扶林王者杯  ·  POK FU LAM KING CUP  ·  2026"
    fnt = font("C:/Windows/Fonts/msyh.ttc", 17)
    tw = fd.textlength(footer_text, font=fnt)
    fd.text(((W - tw) / 2, 1033), footer_text, font=fnt, fill=(240, 224, 190, 225))
    fd.text((1856, 1033), "LIVE", font=font("C:/Windows/Fonts/bahnschrift.ttf", 17), fill=(241, 74, 88, 225), anchor="ra")
    base.alpha_composite(foot)

    # Small 4:3 placement note outside the content frame.
    note = Image.new("RGBA", base.size, (0, 0, 0, 0))
    nd = ImageDraw.Draw(note)
    nd.text((360, 908), "IPAD  /  4:3", font=font("C:/Windows/Fonts/bahnschrift.ttf", 10), fill=(233, 195, 127, 92))
    base.alpha_composite(note)

    edge = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rectangle((0, 0, W - 1, H - 1), outline=(233, 195, 127, 28), width=1)
    ed.line([(0, 2), (W, 2)], fill=(233, 195, 127, 118), width=1)
    base.alpha_composite(edge)
    return base


if __name__ == "__main__":
    image = build()
    image.convert("RGB").save(OUT, "PNG", optimize=True)
    print(OUT)
