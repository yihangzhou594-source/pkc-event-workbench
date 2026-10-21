#!/usr/bin/env python3
"""赛宝备战页截图 → 头像切图 / 聚类 / 选手对应。

输入：<SessionDir>/capture.json（PowerShell 抓的页面元数据）
输出：<SessionDir>/result.json

只依赖 Pillow + numpy（项目现有工具已经在用）。
"""
import json
import os
import sys
import hashlib
from collections import defaultdict

import numpy as np
from PIL import Image, ImageFilter


def sat_mask(img):
    a = np.asarray(img.convert("RGB"), dtype=np.int16)
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    return ((mx - mn) > 45) & (mx > 65)


def components(mask, min_area=300):
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    out = []
    for y in range(h):
        row = mask[y]
        for x in range(w):
            if not row[x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            xs = []
            ys = []
            while stack:
                cy, cx = stack.pop()
                xs.append(cx)
                ys.append(cy)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(xs) < min_area:
                continue
            x0, x1 = min(xs), max(xs)
            y0, y1 = min(ys), max(ys)
            bw, bh = x1 - x0 + 1, y1 - y0 + 1
            if not (34 <= bw <= 92 and 22 <= bh <= 92):
                continue
            if not (0.62 <= bw / bh <= 2.1):
                continue
            fill = len(xs) / float(bw * bh)
            if fill < 0.30:
                continue
            out.append({
                "x": x0, "y": y0, "w": bw, "h": bh,
                "cx": (x0 + x1) / 2.0, "cy": (y0 + y1) / 2.0,
                "area": len(xs), "fill": fill,
            })
    return out


def find_pick_row(img, pick_row_y=0):
    """选择行是固定 5+5 网格；用饱和度找行，再按窗口宽度铺 10 个框。

    截图按 860px 宽标定：左起 50、步长 72；右起 514；头像 54。
    其他宽度按比例缩放，避免窗口大小变化时错位。
    """
    w, h = img.size
    a = np.asarray(img.convert("RGB"), dtype=np.int16)
    mx = a.max(axis=2)
    sat = ((mx - a.min(axis=2)) > 35) & (mx > 50)
    rows = sat.sum(axis=1).astype(np.float64)
    lo, hi = int(h * 0.60), int(h * 0.75)
    if hi <= lo:
        return []
    size = 0.0628 * w
    # 这一带里饱和度最高的一行就是「选择」行；禁用行是灰度，资源行只有 4 个小图标。
    yc = lo + int(np.argmax(rows[lo:hi]))
    top = yc - size / 2.0
    step = 0.0721 * w
    starts = (0.0581 * w, 0.5977 * w)
    # 固定网格，保证同一英雄在不同局里裁切位置一致
    row_dx = 0
    items = []
    scores = []
    for start in starts:
        for i in range(5):
            x = start + i * step + row_dx
            x0 = int(round(x)); y0 = int(round(top))
            x1 = int(round(x0 + size)); y1 = int(round(y0 + size))
            best_score = float(sat[y0:y1, x0:x1].mean()) if x0 >= 0 and y0 >= 0 and x1 <= w and y1 <= h else 0.0
            scores.append(best_score)
            items.append({
                "x": int(round(x)), "y": int(round(top)),
                "w": int(round(size)), "h": int(round(size)),
                "cx": x + size / 2.0, "cy": top + size / 2.0,
                "area": int(size * size), "fill": 1.0,
            })
    if len(items) < 10:
        return []
    if scores and (sum(scores) / len(scores)) < 0.04:
        return []
    return items


def safe_box(box, w, h):
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0 = max(0, min(w - 1, x0)); y0 = max(0, min(h - 1, y0))
    x1 = max(x0 + 1, min(w, x1)); y1 = max(y0 + 1, min(h, y1))
    return (x0, y0, x1, y1)


def find_ban_boxes(img, pick_y, pick_size):
    """禁用行是灰度头像；按暗块检测，不跟选择行的 x 走（右侧两组起点不同）。"""
    w, h = img.size
    y0 = max(0, int(pick_y - pick_size * 1.25))
    y1 = max(y0 + 1, int(pick_y - 1))
    region = img.crop((0, y0, w, y1)).convert("L")
    a = np.asarray(region, dtype=np.int16)
    mask = (a < 238)
    mi = Image.fromarray((mask * 255).astype(np.uint8), "L")
    mi = mi.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    comps = components(np.asarray(mi) > 0, min_area=420)
    boxes = []
    for c in comps:
        bw, bh = c["w"], c["h"]
        if not (40 <= bw <= 86 and 24 <= bh <= 86):
            continue
        if not (0.6 <= bw / bh <= 2.1):
            continue
        cx = c["cx"]
        s = pick_size
        boxes.append({
            "x": int(round(cx - s / 2)), "y": int(round(c["y"] + y0)),
            "w": int(round(s)), "h": int(round(s)),
            "cx": cx, "cy": c["y"] + y0 + s / 2.0, "area": c["area"], "fill": c["fill"],
        })
    boxes.sort(key=lambda z: z["cx"])
    return boxes


def icon_top(img, box):
    x0, y0, x1, y1 = box
    return img.crop(safe_box((x0, y0, x1, y0 + (y1 - y0) * 0.72), *img.size))


def dhash(img):
    g = img.convert("L").resize((9, 8), Image.BILINEAR)
    a = np.asarray(g, dtype=np.int16)
    bits = (a[:, 1:] > a[:, :-1]).flatten()
    v = 0
    for b in bits:
        v = (v << 1) | (1 if b else 0)
    return v


def color_feat(img, size=10):
    a = np.asarray(img.convert("RGB").resize((size, size), Image.BILINEAR), dtype=np.float32)
    a = a.reshape(-1, 3)
    a = (a - a.mean(axis=0)) / (a.std(axis=0) + 1e-6)
    return a.reshape(-1)


def ham(a, b):
    return bin(a ^ b).count("1")


def cos_dist(a, b):
    na = float(np.linalg.norm(a)) + 1e-6
    nb = float(np.linalg.norm(b)) + 1e-6
    return 1.0 - float(np.dot(a, b) / (na * nb))


class Clusterer:
    def __init__(self, icons_dir):
        self.icons_dir = icons_dir
        self.clusters = []
        self.by_hash = {}

    def add(self, img, box, side, kind, page_id):
        top = icon_top(img, box)
        dh = dhash(top)
        cf = color_feat(top)
        best = None
        best_d = 999.0
        for c in self.clusters:
            if c.get("kind") != kind:
                continue
            hd = ham(c["dhash"], dh)
            if hd > 6:
                continue
            cd = cos_dist(c["feat"], cf)
            if cd < 0.16 and cd < best_d:
                best = c
                best_d = cd
        if best is None:
            cid = hashlib.sha1(("%d" % dh).encode()).hexdigest()[:12]
            # 防碰撞：同 hash 但颜色差很远时加后缀
            base = cid
            n = 2
            while cid in self.by_hash:
                if ham(self.by_hash[cid]["dhash"], dh) <= 6:
                    break
                cid = base + "-%d" % n
                n += 1
            gtop = np.asarray(top.convert("L").resize((10, 10), Image.BILINEAR), dtype=np.float32)
            gtop = (gtop - gtop.mean()) / (gtop.std() + 1e-6)
            best = {"id": cid, "dhash": dh, "feat": cf, "gray": gtop.reshape(-1), "kind": kind, "count": 0}
            self.clusters.append(best)
            self.by_hash[cid] = best
        best["count"] += 1
        # 保存完整头像（带数字也没关系，页面只看图）
        x0, y0, x1, y1 = safe_box(box, *img.size)
        patch = img.crop((x0, y0, x1, y1)).resize((72, 72), Image.LANCZOS)
        sample = os.path.join(self.icons_dir, best["id"] + ".png")
        if not os.path.exists(sample):
            patch.save(sample)
        return {"cluster": best["id"], "kind": kind, "side": side, "page": page_id,
                "feat": cf, "dhash": dh}

    def add_gray(self, img, box, side, page_id):
        """禁用头像单独成簇；和选择头像的彩色半身像不是同一张图。"""
        top = icon_top(img, box)
        a = np.asarray(top.convert("L").resize((10, 10), Image.BILINEAR), dtype=np.float32)
        if a.std() < 18:
            return None
        a = (a - a.mean()) / (a.std() + 1e-6)
        f = a.reshape(-1)
        dh = dhash(top)
        best = None
        best_d = 999.0
        for c in self.clusters:
            if c.get("kind") != "ban":
                continue
            if ham(c["dhash"], dh) > 8:
                continue
            d = cos_dist(c["feat"], f)
            if d < 0.12 and d < best_d:
                best, best_d = c, d
        if best is None:
            cid = hashlib.sha1(("ban-%d" % dh).encode()).hexdigest()[:12]
            base = cid
            n = 2
            while cid in self.by_hash:
                cid = base + "-%d" % n
                n += 1
            best = {"id": cid, "dhash": dh, "feat": f, "gray": f, "kind": "ban", "count": 0}
            self.clusters.append(best)
            self.by_hash[cid] = best
        best["count"] += 1
        x0, y0, x1, y1 = safe_box(box, *img.size)
        patch = img.crop((x0, y0, x1, y1)).resize((72, 72), Image.LANCZOS)
        sample = os.path.join(self.icons_dir, best["id"] + ".png")
        if not os.path.exists(sample):
            patch.save(sample)
        return best["id"]

    def match_gray(self, img, box):
        """禁用头像通常是灰度默认头像；用灰度特征去匹配选择簇。"""
        top = icon_top(img, box)
        g = np.asarray(top.convert("L").resize((10, 10), Image.BILINEAR), dtype=np.float32)
        g = (g - g.mean()) / (g.std() + 1e-6)
        f = g.reshape(-1)
        best = None
        best_d = 999.0
        for c in self.clusters:
            cf = c.get("gray")
            if cf is None:
                continue
            d = cos_dist(cf, f)
            if d < best_d:
                best, best_d = c, d
        if best is not None and best_d < 0.22:
            return best["id"]
        return None

    def finish(self):
        # 给每个簇补一个灰度特征（来自簇代表图）
        for c in self.clusters:
            path = os.path.join(self.icons_dir, c["id"] + ".png")
            try:
                im = Image.open(path).convert("L").resize((10, 10), Image.BILINEAR)
                a = np.asarray(im, dtype=np.float32)
                a = (a - a.mean()) / (a.std() + 1e-6)
                c["gray"] = a.reshape(-1)
            except Exception:
                c["gray"] = None


def detect_player_avatars(img):
    w, h = img.size
    box = (0, int(h * 0.76), w, int(h * 0.99))
    region = img.crop(box)
    m = sat_mask(region)
    mask_img = Image.fromarray((m * 255).astype(np.uint8), "L")
    mask_img = mask_img.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    comps = components(np.asarray(mask_img) > 0, min_area=220)
    for c in comps:
        c["x"] += box[0]; c["y"] += box[1]; c["cx"] += box[0]; c["cy"] += box[1]
    # 只保留下半屏（选手行），按 y 分行
    comps = [c for c in comps if c["cy"] > h * 0.76]
    rows = []
    for c in sorted(comps, key=lambda z: z["cy"]):
        for r in rows:
            if abs(r["cy"] - c["cy"]) <= 14:
                r["items"].append(c)
                r["cy"] = sum(i["cy"] for i in r["items"]) / len(r["items"])
                break
        else:
            rows.append({"cy": c["cy"], "items": [c]})
    out = []
    for r in sorted(rows, key=lambda z: z["cy"]):
        items = sorted(r["items"], key=lambda z: z["cx"])
        # 一侧一行只有一个头像；左边取最左，右边取最右
        if len(items) >= 2:
            out.append({"y": r["cy"], "left": items[0], "right": items[-1]})
        elif len(items) == 1:
            c = items[0]
            side = "left" if c["cx"] < w / 2 else "right"
            out.append({"y": r["cy"], side: c})
    return out[:6]


def nearest_pick(feat, picks):
    best = None
    best_d = 999.0
    for p in picks:
        d = cos_dist(feat, p["feat"])
        if d < best_d:
            best, best_d = p, d
    return best, best_d


def process_page(img, page, clusterer, icons_dir, session):
    items = find_pick_row(img, page.get("pickRowY") or 0)
    if len(items) < 10:
        return None
    left = items[:5]
    right = items[5:10]
    out = {"left": [], "right": [], "bans": {"left": [], "right": []}, "players": {"left": [], "right": []}}

    def add_side(side, boxes):
        picks = []
        for i, c in enumerate(boxes):
            box = (c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"])
            rec = clusterer.add(img, box, side, "pick", page["id"])
            rec["order"] = i + 1
            picks.append(rec)
        return picks

    lp = add_side("left", left)
    rp = add_side("right", right)
    out["left"] = [{"order": p["order"], "cluster": p["cluster"]} for p in lp]
    out["right"] = [{"order": p["order"], "cluster": p["cluster"]} for p in rp]

    # 禁用行：按暗块检测；右侧禁用起点和选择行不同
    pick_y = min(c["y"] for c in items)
    pick_size = max(c["w"] for c in items)
    ban_boxes = find_ban_boxes(img, pick_y, pick_size)
    ban_groups = {
        "left": [c for c in ban_boxes if c["cx"] < img.width / 2][:5],
        "right": [c for c in ban_boxes if c["cx"] >= img.width / 2][:5],
    }
    for side, picks, boxes in (("left", lp, left), ("right", rp, right)):
        for c in ban_groups[side]:
            bx = (c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"])
            x0, y0, x1, y1 = safe_box(bx, *img.size)
            patch = img.crop((x0, y0, x1, y1))
            arr = np.asarray(patch.convert("L"), dtype=np.float32)
            if arr.size == 0 or arr.mean() > 235:
                continue
            # 空 ban 位：浅灰盾牌，均值高、对比低
            if arr.mean() > 215 and arr.std() < 55:
                continue
            edge = float(np.abs(np.diff(arr, axis=1)).mean())
            if edge < 6.0:
                continue
            cid = clusterer.add_gray(img, (x0, y0, x1, y1), side, page["id"])
            if cid:
                out["bans"][side].append({"cluster": cid})

    # 选手头像对应：把选手行头像和同队 5 个选择头像做 5 选 1
    player_img_path = page.get("playerShot")
    if player_img_path:
        pp = os.path.join(session, player_img_path.replace("/", os.sep))
        if os.path.exists(pp):
            pimg = Image.open(pp).convert("RGB")
            rows = detect_player_avatars(pimg)
            names = page.get("players") or {}
            lnames = (names.get("left") if isinstance(names, dict) else []) or []
            rnames = (names.get("right") if isinstance(names, dict) else []) or []
            used_l = set(); used_r = set()
            for i, row in enumerate(rows):
                for side, boxes, picks, names_list, used in (
                    ("left", row.get("left"), lp, lnames, used_l),
                    ("right", row.get("right"), rp, rnames, used_r),
                ):
                    if not boxes:
                        continue
                    box = (boxes["x"], boxes["y"], boxes["x"] + boxes["w"], boxes["y"] + boxes["h"])
                    f = color_feat(icon_top(pimg, box))
                    best, dist = nearest_pick(f, picks)
                    name = names_list[i] if i < len(names_list) else ""
                    if best is not None and dist < 0.34 and best["cluster"] not in used:
                        used.add(best["cluster"])
                        out["players"][side].append({"name": name, "cluster": best["cluster"]})
    return out


def main():
    if len(sys.argv) < 2:
        print("usage: saibao_icons.py <SessionDir>", file=sys.stderr)
        return 2
    session = os.path.abspath(sys.argv[1])
    cap_path = os.path.join(session, "capture.json")
    with open(cap_path, "r", encoding="utf-8-sig") as f:
        cap = json.load(f)
    pages = cap.get("pages") or []
    if isinstance(pages, dict):
        pages = [pages]
    icons_dir = os.path.join(session, "icons")
    os.makedirs(icons_dir, exist_ok=True)
    clusterer = Clusterer(icons_dir)
    parsed = []
    for p in pages:
        if p.get("noData") or not p.get("shot"):
            continue
        path = os.path.join(session, p["shot"].replace("/", os.sep))
        if not os.path.exists(path):
            continue
        img = Image.open(path).convert("RGB")
        data = process_page(img, p, clusterer, icons_dir, session)
        if not data:
            continue
        parsed.append((p, data))
    clusterer.finish()

    # 按 series 聚合
    by_series = defaultdict(list)
    for p, data in parsed:
        by_series[p["seriesId"]].append((p, data))
    series_out = []
    for sid, rows in by_series.items():
        rows.sort(key=lambda x: x[0].get("gameNo") or 0)
        first = rows[0][0]
        teams = first.get("teams") or ["", ""]
        bad = {"全部赛程", "16进8 BO5", "16进8", "双败淘汰赛", "待定", "冠军"}
        if not teams[0] or not teams[1] or any(t in bad for t in teams):
            continue
        score = first.get("score") or [0, 0]
        games = []
        for p, data in rows:
            games.append({
                "no": p.get("gameNo") or len(games) + 1,
                "winner": p.get("winner") or "",
                "duration": p.get("duration") or "",
                "noData": False,
                "left": {"team": teams[0], "side": "红方", "picks": data["left"], "bans": data["bans"]["left"], "players": data["players"]["left"]},
                "right": {"team": teams[1], "side": "蓝方", "picks": data["right"], "bans": data["bans"]["right"], "players": data["players"]["right"]},
            })
        series_out.append({
            "id": sid,
            "stage": "循环赛",
            "group": first.get("group") or "",
            "round": first.get("round") or "",
            "date": first.get("date") or "",
            "teams": teams,
            "seriesScore": score,
            "forfeit": bool(sum(score) > len(games)),
            "noData": False,
            "games": games,
        })

    clusters = {}
    for c in clusterer.clusters:
        clusters[c["id"]] = {
            "count": c["count"],
            "sample": "icons/" + c["id"] + ".png",
            "firstSeen": cap.get("capturedAt") or "",
            "kind": c.get("kind") or "pick",
        }
    out = {
        "event": cap.get("event") or "2026PKC秋季赛",
        "stage": cap.get("stage") or "循环赛",
        "series": series_out,
        "clusters": clusters,
    }
    with open(os.path.join(session, "result.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("pages=%d series=%d clusters=%d" % (len(parsed), len(series_out), len(clusters)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
