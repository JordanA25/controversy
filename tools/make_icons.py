"""Build the app icons from the official flame (art/flame.png, made by tools/extract_art.py)."""
import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
FLAME = Image.open(ROOT / "art" / "flame.png")
BLUE = "#0090BA"  # logo background


def render(size, rounded=True, flame_h=0.74):
    s = 4  # supersample
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.22), fill=BLUE)
    else:
        d.rectangle([0, 0, W, W], fill=BLUE)
    h = int(W * flame_h)
    f = FLAME.resize((int(h * FLAME.width / FLAME.height), h), Image.LANCZOS)
    img.alpha_composite(f, ((W - f.width) // 2, (W - h) // 2))
    return img.resize((size, size), Image.LANCZOS)


render(192).save(OUT / "icon-192.png")
render(512).save(OUT / "icon-512.png")
render(512, rounded=False, flame_h=0.6).save(OUT / "icon-maskable-512.png")
render(180, rounded=False).save(OUT / "apple-touch-icon.png")
render(32, flame_h=0.84).save(OUT / "favicon-32.png")
print("ok")
