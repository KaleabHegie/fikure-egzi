#!/usr/bin/env python3
"""
Builds every app icon from the official seal (public/logo.png):

  public/icons/      web app / PWA icons (favicon, Apple touch, 192/512, maskable)
  android/.../res/   Android launcher icons (legacy, round, adaptive) and splash screens

Run after replacing the logo:  python3 scripts/generate-icons.py
A larger source logo gives sharper icons (the current seal is 225 px).
Needs Pillow (pip install pillow).
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'logo.png'
WEB = ROOT / 'public' / 'icons'
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'

PAPER = (251, 249, 247, 255)  # brand paper #FBF9F7
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

seal = Image.open(SOURCE).convert('RGBA')
# Trim transparent edges so "fill" means the seal itself, not its padding.
seal = seal.crop(seal.getbbox())


def seal_at(size: int) -> Image.Image:
    # The ring behind the lettering is transparent in the source; back it with
    # white so the seal reads the same on light and dark launchers.
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inset = round(size * 0.05)
    ImageDraw.Draw(img).ellipse((inset, inset, size - 1 - inset, size - 1 - inset), fill=(255, 255, 255, 255))
    img.alpha_composite(seal.resize((size, size), Image.LANCZOS))
    return img


def canvas(size: int, background=None, scale: float = 1.0, circle: bool = False) -> Image.Image:
    """The seal centred on a square canvas, taking `scale` of its width."""
    img = Image.new('RGBA', (size, size), background or (0, 0, 0, 0))
    inner = max(1, round(size * scale))
    offset = (size - inner) // 2
    img.alpha_composite(seal_at(inner), (offset, offset))
    if circle:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        img.putalpha(Image.composite(img.getchannel('A'), mask, mask))
    return img


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f'  {path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}')


print('Web / PWA')
save(canvas(32, scale=1.0), WEB / 'favicon-32.png')
save(canvas(180, PAPER, scale=0.86), WEB / 'apple-touch-icon.png')  # iOS adds its own rounded mask
save(canvas(192, scale=1.0), WEB / 'icon-192.png')
save(canvas(512, scale=1.0), WEB / 'icon-512.png')
# Maskable: launchers crop to any shape inside the central 80% circle.
save(canvas(512, PAPER, scale=0.78), WEB / 'icon-maskable-512.png')

print('Android launcher')
for density, factor in DENSITIES.items():
    folder = RES / f'mipmap-{density}'
    legacy = round(48 * factor)
    # Legacy (pre-Android 8) square and round icons: the seal is already round.
    save(canvas(legacy, PAPER, scale=0.9, circle=True), folder / 'ic_launcher.png')
    save(canvas(legacy, PAPER, scale=0.9, circle=True), folder / 'ic_launcher_round.png')
    # Adaptive foreground: 108dp canvas, only the central 66dp is always visible.
    save(canvas(round(108 * factor), scale=0.6), folder / 'ic_launcher_foreground.png')

print('Android splash')
for path in sorted(RES.glob('drawable*/splash.png')):
    width, height = Image.open(path).size
    img = Image.new('RGBA', (width, height), PAPER)
    size = round(min(width, height) * 0.38)
    img.alpha_composite(seal_at(size), ((width - size) // 2, (height - size) // 2))
    save(img.convert('RGB'), path)

# Adaptive icon background: brand paper instead of white.
background = RES / 'values' / 'ic_launcher_background.xml'
background.write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    '    <color name="ic_launcher_background">#FBF9F7</color>\n</resources>\n'
)
print(f'  {background.relative_to(ROOT)}')
