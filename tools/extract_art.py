"""Cut the official artwork in 'Box Graphics/' into transparent web assets in art/."""
import pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "Box Graphics", ROOT / "art"
LOGO = np.asarray(Image.open(SRC / "CONTROVERSY_LinkedIn_logo_1-tm.png").convert("RGB")).astype(float)
BG = np.array([0, 144, 186], float)  # logo background blue


def unmatte(rgb, alpha):
    """Recover the foreground colour of pixels blended over the flat blue background."""
    a = np.clip(alpha, 1e-3, 1)[..., None]
    fg = np.clip((rgb - (1 - a) * BG) / a, 0, 255)
    return np.dstack([fg, alpha * 255]).astype(np.uint8)


def trim(img, pad=8):
    l, t, r, b = img.getbbox()
    return img.crop((max(l - pad, 0), max(t - pad, 0), r + pad, b + pad))


# Flame: warm pixels (red well above blue) are foreground.
flame = LOGO[100:1100, 350:1100]
a = np.clip((flame[..., 0] - flame[..., 2] + 186) / 382, 0, 1)
a = np.clip((a - 0.5) * 2.2 + 0.5, 0, 1)  # tighten the edge; kills blue drop shadow
trim(Image.fromarray(unmatte(flame, a))).save(OUT / "flame.png", optimize=True)

# Wordmark: light grey letters over blue; red channel is ~0 in the background and its shadow.
word = LOGO[1120:1400, 90:1480]
a = np.clip(word[..., 0] / 215, 0, 1)
wm = trim(Image.fromarray(unmatte(word, a)), 4)
wm.resize((900, round(900 * wm.height / wm.width)), Image.LANCZOS).save(OUT / "wordmark.png", optimize=True)

# Hero: faces + flame + bridge panel from the box top, without title / age badge / orange bands.
top = Image.open(SRC / "Controversy - BOX - Preview - Top.png").convert("RGB")
hero = top.crop((0, 256, 592, 692))
# The art is mirror-symmetric, so patch the age badge with the mirrored left side.
patch = hero.crop((0, 0, 110, 72)).transpose(Image.FLIP_LEFT_RIGHT)
hero.paste(patch, (592 - 110, 0))
hero.save(OUT / "hero.jpg", quality=88)

# Bridge: the white suspension bridge from the box top, then snapped in half for Bridge-Burner cards.
t = np.asarray(top).astype(float)[380:640, 60:540]
a = np.clip((t.min(axis=2) - 150) / 80, 0, 1)
bridge = Image.fromarray(np.dstack([np.full(a.shape + (3,), 255.0), a * 255]).astype(np.uint8))
bridge = bridge.crop(bridge.getbbox())
w, h = bridge.size
mid, gap = w // 2, w // 5
canvas = Image.new("RGBA", (w + gap, h + h // 2), (0, 0, 0, 0))
from PIL import ImageDraw
for side in (0, 1):
    # jagged break line down the middle of the span
    mask = Image.new("L", (w, h), 0)
    jag = [(mid + (12 if i % 2 else -12), y) for i, y in enumerate(range(0, h + 1, max(h // 8, 1)))]
    poly = [(0, 0)] + jag + [(0, h)] if side == 0 else [(w, 0)] + jag + [(w, h)]
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    half = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    half.paste(bridge, (0, 0), Image.fromarray((np.asarray(mask) / 255 * np.asarray(bridge)[..., 3]).astype(np.uint8)))
    half = half.rotate(-10 if side == 0 else 10, resample=Image.BICUBIC, center=(0 if side == 0 else w, h), expand=False)
    canvas.alpha_composite(half, (0 if side == 0 else gap, h // 4))
canvas.crop(canvas.getbbox()).save(OUT / "bridge-broken.png", optimize=True)

for f in sorted(OUT.iterdir()):
    print(f.name, Image.open(f).size, f.stat().st_size // 1024, "KB")
