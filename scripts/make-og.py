"""OGP画像（1200x630）とファビコンを作る。

キャラクターの絵は使わない（権利者の画像を置かないため）。ハート・星・雲・水玉だけで飾る。
サイト名の文字は Hachi Maru Pop（SIL Open Font License）。
フォントは 4MB あるのでリポジトリには入れず、無ければ Google Fonts のリポジトリから取ってくる。

使い方: python scripts/make-og.py
"""
import math
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "scripts" / "fonts"
FONT_POP = FONT_DIR / "HachiMaruPop-Regular.ttf"
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/hachimarupop/HachiMaruPop-Regular.ttf"
FONT_B = "C:/Windows/Fonts/BIZ-UDGothicB.ttc"

BG = (255, 228, 236)
DOT = (255, 255, 255)
INK = (90, 64, 64)
PINK = (240, 98, 146)
PINK_L = (255, 143, 171)
PINK_S = (255, 201, 214)
LEMON = (255, 212, 59)
SKY = (116, 192, 252)
LAV = (177, 151, 252)
MINT = (105, 219, 124)
ORANGE = (255, 169, 77)
WHITE = (255, 255, 255)

if not FONT_POP.exists():
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    print("downloading Hachi Maru Pop ...")
    urllib.request.urlretrieve(FONT_URL, FONT_POP)


# ---------- 図形 ----------
def heart_pts(cx, cy, r, s=1):
    pts = []
    for i in range(160):
        t = math.pi * 2 * i / 160
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append(((cx + x * r / 16) * s, (cy + y * r / 16) * s))
    return pts


def star_pts(cx, cy, r, rot=0.0, s=1, inner=0.47):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + rot + math.pi * i / 5
        rr = r if i % 2 == 0 else r * inner
        pts.append(((cx + rr * math.cos(a)) * s, (cy + rr * math.sin(a)) * s))
    return pts


def sparkle_pts(cx, cy, r, s=1):
    # 4 方向に尖ったきらり
    pts = []
    for i in range(8):
        a = -math.pi / 2 + math.pi * i / 4
        rr = r if i % 2 == 0 else r * 0.28
        pts.append(((cx + rr * math.cos(a)) * s, (cy + rr * math.sin(a)) * s))
    return pts


# ---------- OGP ----------
def make_og():
    W, H, S = 1200, 630, 2
    img = Image.new("RGB", (W * S, H * S), BG)
    d = ImageDraw.Draw(img)

    def circle(cx, cy, r, fill):
        d.ellipse(((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S), fill=fill)

    # 水玉
    for row, y in enumerate(range(0, H + 50, 46)):
        for x in range(0, W + 50, 46):
            circle(x + (23 if row % 2 else 0), y, 5, DOT)

    # 上下の雲
    for i, x in enumerate(range(-40, W + 80, 92)):
        circle(x, H + 30, 78 + (i % 2) * 14, WHITE)
    for i, x in enumerate(range(-10, W + 80, 110)):
        circle(x, -52, 74 + (i % 3) * 8, (255, 214, 226))

    # 飾り（ハート・星・きらり）
    for cx, cy, r, c in [(120, 150, 40, PINK_L), (1090, 470, 34, LAV), (180, 470, 22, SKY), (1040, 150, 18, PINK_L), (70, 330, 16, LEMON), (1150, 300, 14, MINT)]:
        d.polygon(heart_pts(cx, cy, r, S), fill=c)
    for cx, cy, r, rot, c in [(1080, 90, 44, 0.2, LEMON), (215, 90, 20, -0.3, ORANGE), (960, 520, 22, 0.4, SKY), (300, 525, 18, 0.1, LEMON)]:
        d.polygon(star_pts(cx, cy, r, rot, S), fill=c)
    for cx, cy, r, c in [(1000, 70, 20, WHITE), (95, 230, 18, WHITE), (1125, 390, 16, WHITE), (250, 380, 12, WHITE), (870, 110, 12, WHITE)]:
        d.polygon(sparkle_pts(cx, cy, r, S), fill=c)
    for cx, cy, r, c in [(330, 110, 8, SKY), (900, 560, 8, PINK_L), (60, 560, 10, LAV), (1160, 560, 9, LEMON)]:
        circle(cx, cy, r, c)

    # サイト名。白いふちどりとピンクの影をつけ、「速報」だけピンクにする
    title_font = ImageFont.truetype(str(FONT_POP), 168 * S)
    a, b = "ちいかわ", "速報"
    stroke = 16 * S
    wa = d.textlength(a, font=title_font)
    wb = d.textlength(b, font=title_font)
    x = (W * S - (wa + wb)) / 2
    top = d.textbbox((0, 0), a + b, font=title_font)[1]
    y = 170 * S - top
    shadow = (255, 176, 199)
    d.text((x + 9 * S, y + 11 * S), a + b, font=title_font, fill=shadow, stroke_width=stroke, stroke_fill=shadow)
    d.text((x, y), a + b, font=title_font, fill=WHITE, stroke_width=stroke, stroke_fill=WHITE)
    d.text((x, y), a, font=title_font, fill=INK)
    d.text((x + wa, y), b, font=title_font, fill=PINK)

    # タイトル上のリボン
    rib_font = ImageFont.truetype(FONT_B, 28 * S)
    rib = "ちいかわのニュースまとめ"
    rw = d.textlength(rib, font=rib_font)
    rx0 = (W * S - rw) / 2 - 30 * S
    ry0 = 104 * S
    d.rounded_rectangle((rx0, ry0 + 6 * S, rx0 + rw + 60 * S, ry0 + 58 * S), radius=30 * S, fill=(240, 98, 146))
    d.rounded_rectangle((rx0, ry0, rx0 + rw + 60 * S, ry0 + 52 * S), radius=30 * S, fill=PINK_L)
    d.text((rx0 + 30 * S, ry0 + 10 * S), rib, font=rib_font, fill=WHITE)

    # ジャンルの札
    chip_font = ImageFont.truetype(FONT_B, 30 * S)
    chips = [("グッズ", PINK_L), ("くじ", LEMON), ("コラボ", ORANGE), ("イベント", MINT), ("アニメ", SKY)]
    pad, gap = 26 * S, 16 * S
    widths = [d.textlength(t, font=chip_font) + pad * 2 for t, _ in chips]
    cx = (W * S - (sum(widths) + gap * (len(chips) - 1))) / 2
    cy = 430 * S
    for (t, c), w in zip(chips, widths):
        d.rounded_rectangle((cx, cy + 5 * S, cx + w, cy + 62 * S), radius=31 * S, fill=tuple(max(0, v - 40) for v in c))
        d.rounded_rectangle((cx, cy, cx + w, cy + 57 * S), radius=31 * S, fill=WHITE, outline=c, width=5 * S)
        d.text((cx + pad, cy + 9 * S), t, font=chip_font, fill=INK)
        cx += w + gap

    out = img.resize((W, H), Image.LANCZOS)
    for p in ("site/assets/og.png", "docs/assets/og.png"):
        (ROOT / p).parent.mkdir(parents=True, exist_ok=True)
        out.save(ROOT / p, optimize=True)


# ---------- ファビコン ----------
# ピンクの角丸にしろいハート、右上にレモン色の星
FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="18" fill="#ff8fab"/>
<path d="M32 53C18 44 10 36 10 26.5 10 19.5 15.5 14 22 14c4.2 0 7.8 2.3 10 5.8C34.2 16.3 37.8 14 42 14c6.5 0 12 5.5 12 12.5C54 36 46 44 32 53z" fill="#fff"/>
<path d="M50 4l2.6 5.9 6.4.7-4.8 4.3 1.4 6.3L50 18l-5.6 3.2 1.4-6.3L41 10.6l6.4-.7z" fill="#ffd43b" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
<circle cx="24" cy="26" r="3" fill="#ffd6e0"/>
</svg>
"""


def make_favicon():
    S = 16  # 64 の座標を 1024px で描く
    img = Image.new("RGBA", (64 * S, 64 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, 64 * S - 1, 64 * S - 1), radius=18 * S, fill=PINK_L)
    d.polygon(heart_pts(32, 32.5, 22, S), fill=WHITE)
    d.polygon(star_pts(50, 13, 11.5, 0, S), fill=WHITE)
    d.polygon(star_pts(50, 13, 9, 0, S), fill=LEMON)
    d.ellipse(((24 - 3) * S, (26 - 3) * S, (24 + 3) * S, (26 + 3) * S), fill=(255, 214, 224))

    for p in ("site", "docs"):
        base = ROOT / p
        (base / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8")
        img.resize((32, 32), Image.LANCZOS).save(base / "favicon-32.png", optimize=True)
        # iOS のホーム画面用。角丸は端末側で付くので四角く塗りつぶす
        touch = Image.new("RGBA", (180, 180), PINK_L + (255,))
        inner = img.resize((180, 180), Image.LANCZOS)
        touch.alpha_composite(inner)
        touch.convert("RGB").save(base / "apple-touch-icon.png", optimize=True)
        img.save(base / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


make_og()
make_favicon()
print("saved")
