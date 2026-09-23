"""OGP画像（1200x630）を作る。パステルピンクの水玉の上に、白い角丸の札とサイト名。

キャラクターの絵は使わない（権利者の画像を置かないため）。ハート・星・雲だけで飾る。
使い方: python scripts/make-og.py
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
SS = 2
ROOT = Path(__file__).resolve().parent.parent
FONT = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"
FONT_R = "C:/Windows/Fonts/BIZ-UDGothicR.ttc"

BG = (255, 228, 236)
DOT = (255, 206, 220)
INK = (90, 64, 64)
PINK = (240, 98, 146)
PINK_L = (255, 143, 171)
LEMON = (255, 212, 59)
SKY = (116, 192, 252)
LAV = (177, 151, 252)
MINT = (140, 233, 154)
WHITE = (255, 255, 255)


def s(v):
    return int(v * SS)


img = Image.new("RGB", (W * SS, H * SS), BG)
d = ImageDraw.Draw(img)

# 水玉
for y in range(0, H + 40, 40):
    for x in range(0, W + 40, 40):
        ox = 20 if (y // 40) % 2 else 0
        cx, cy = x + ox, y
        d.ellipse((s(cx - 4), s(cy - 4), s(cx + 4), s(cy + 4)), fill=DOT)


def heart(cx, cy, r, color):
    pts = []
    for i in range(200):
        t = math.pi * 2 * i / 200
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((s(cx + x * r / 16), s(cy + y * r / 16)))
    d.polygon(pts, fill=color)


def star(cx, cy, r, color, rot=0):
    pts = []
    for i in range(10):
        a = math.pi / 2 + rot + math.pi * i / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((s(cx + rr * math.cos(a)), s(cy - rr * math.sin(a))))
    d.polygon(pts, fill=color)


# 札（影 → 本体）
cx0, cy0, cx1, cy1 = 150, 130, 1050, 500
d.rounded_rectangle((s(cx0), s(cy0 + 14), s(cx1), s(cy1 + 14)), radius=s(48), fill=(255, 190, 208))
d.rounded_rectangle((s(cx0), s(cy0), s(cx1), s(cy1)), radius=s(48), fill=WHITE, outline=(255, 201, 214), width=s(6))

# 飾り
heart(205, 120, 34, PINK_L)
star(1010, 125, 34, LEMON, 0.2)
star(1072, 190, 16, SKY, 0.5)
heart(1000, 520, 22, LAV)
star(180, 510, 20, MINT, 0.1)
heart(125, 300, 14, LEMON)
heart(1085, 360, 16, PINK_L)

title_font = ImageFont.truetype(FONT, s(112))
sub_font = ImageFont.truetype(FONT, s(34))
url_font = ImageFont.truetype(FONT_R, s(24))


def center_text(text, font, y, fill, **kw):
    l, t, r, b = d.textbbox((0, 0), text, font=font, **kw)
    d.text(((W * SS - (r - l)) / 2 - l, s(y)), text, font=font, fill=fill, **kw)
    return r - l


# サイト名。「速報」だけピンクにする
a, b = "ちいかわ", "速報"
wa = d.textbbox((0, 0), a, font=title_font)[2]
wb = d.textbbox((0, 0), b, font=title_font)[2]
x = (W * SS - (wa + wb)) / 2
ty = s(200)
d.text((x + s(5), ty + s(5)), a + b, font=title_font, fill=(255, 214, 224))
d.text((x, ty), a, font=title_font, fill=INK)
d.text((x + wa, ty), b, font=title_font, fill=PINK)

center_text("グッズ・コラボ・イベント・アニメのニュースまとめ", sub_font, 355, (176, 112, 127))
center_text("chiikawamatome.gamelab.website", url_font, 430, (190, 150, 160))

img = img.resize((W, H), Image.LANCZOS)
for p in ("site/assets/og.png", "docs/assets/og.png"):
    img.save(ROOT / p, optimize=True)
print("saved")
