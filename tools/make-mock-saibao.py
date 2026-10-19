# -*- coding: utf-8 -*-
"""生成一张类赛宝战绩表的模拟截图，用来验证 OCR 结构化管线。"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1720, 1080
img = Image.new("RGB", (W, H), "#ffffff")
d = ImageDraw.Draw(img)
F = lambda s, b=False: ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc" if b else r"C:\Windows\Fonts\msyh.ttc", s)

d.rectangle([0, 0, W, 92], fill="#1b2430")
d.text((40, 26), "对局详情  第3局", font=F(34, True), fill="#ffffff")
d.text((W-380, 34), "KHEL  2 : 1  BG", font=F(28, True), fill="#ffd76a")

COLS = ["位置", "选手", "英雄", "击杀", "死亡", "助攻", "补刀", "分均经济", "伤害占比", "承伤占比", "参团率"]
LW = [58, 100, 100, 52, 52, 52, 58, 76, 76, 76, 70]
BLOCK_W = sum(LW) + 30

OUR = [("上单","巫术","吕布",5,2,7,198,652,"24.5%","19.3%","76%"),
       ("打野","长坂坡","露娜",8,1,9,142,704,"27.8%","22.6%","81%"),
       ("中路","栀力夏","不知火舞",6,3,11,186,668,"31.2%","11.4%","85%"),
       ("发育路","夏半星","伽罗",9,2,6,241,726,"34.6%","7.2%","79%"),
       ("游走","相遇猫鼠","张飞",1,3,16,74,452,"6.8%","34.2%","88%")]
OPP = [("上单","主峰城","关羽",3,4,5,176,615,"29.4%","5.8%","69%"),
       ("打野","Azzy","镜",4,6,4,151,648,"22.1%","14.2%","61%"),
       ("中路","gaadbye","西施",2,5,8,193,641,"18.6%","9.8%","74%"),
       ("发育路","Yrainy","公孙离",5,7,3,228,702,"30.9%","6.4%","64%"),
       ("游走","久低","鲁班大师",0,8,11,69,438,"4.2%","28.6%","68%")]


def block(x0, y0, title, color, rows):
    d.rounded_rectangle([x0, y0, x0 + BLOCK_W, y0 + 610], radius=14, outline="#dde3ec", width=2)
    d.rectangle([x0, y0, x0 + BLOCK_W, y0 + 48], fill=color)
    d.text((x0 + 18, y0 + 10), title, font=F(24, True), fill="#ffffff")
    x = x0 + 16
    x_offsets = []
    for c, w in zip(COLS, LW):
        d.text((x, y0 + 62), c, font=F(17), fill="#666f7d")
        x_offsets.append(x)
        x += w
    for i, r in enumerate(rows):
        y = y0 + 100 + i * 96
        d.line([x0 + 12, y - 12, x0 + BLOCK_W - 12, y - 12], fill="#eef1f6")
        for j, v in enumerate(r):
            f = F(21, j < 3)
            d.text((x_offsets[j], y + 12), str(v), font=f, fill="#111a26" if j < 3 else "#2b3648")


block(28, 120, "我方 · KHEL 长坂坡", "#d8a007", OUR)
block(28 + BLOCK_W + 52, 120, "对方 · BG 超会玩", "#2f6bff", OPP)
d.text((28, 800), "KHEL 2 : 1 BG   2026-10-01   数据来自王者赛宝", font=F(24), fill="#7b8798")

out = r"D:\Agent data\Codex\PKC比赛图表制作\预览\_模拟赛宝截图.png"
img.save(out)
print("已生成", out)
