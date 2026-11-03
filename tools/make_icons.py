#!/usr/bin/env python3
"""Gera icons/icon-192.png, icon-512.png e icon-maskable-512.png (carta dourada sobre fundo escuro)."""
from PIL import Image, ImageDraw
import os
BG, GOLD, DARK = (8, 9, 12), (242, 184, 75), (27, 18, 0)

def draw(size, safe):
    im = Image.new('RGB', (size, size), BG)
    d = ImageDraw.Draw(im)
    h = size * safe * 0.62          # altura da carta
    w = h * 63 / 88
    cx, cy = size / 2, size / 2
    box = (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    d.rounded_rectangle(box, radius=w * 0.07, fill=GOLD)
    m = w * 0.1
    d.rounded_rectangle((box[0] + m, box[1] + m, box[2] - m, box[1] + m + h * 0.52), radius=w * 0.04, fill=DARK)
    # estrela de 4 pontas (triagem "bomba")
    sx, sy, r = cx, box[1] + m + h * 0.26, w * 0.2
    d.polygon([(sx, sy - r), (sx + r * .28, sy - r * .28), (sx + r, sy), (sx + r * .28, sy + r * .28),
               (sx, sy + r), (sx - r * .28, sy + r * .28), (sx - r, sy), (sx - r * .28, sy - r * .28)], fill=GOLD)
    for i, f in enumerate((0.72, 0.55)):
        y = box[1] + m + h * 0.52 + m + i * h * 0.1
        d.rounded_rectangle((box[0] + m, y, box[0] + m + (w - 2 * m) * f, y + h * 0.045), radius=h * 0.02, fill=DARK)
    return im

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(out, exist_ok=True)
draw(512, 1.0).resize((192, 192), Image.LANCZOS).save(os.path.join(out, 'icon-192.png'))
draw(512, 1.0).save(os.path.join(out, 'icon-512.png'))
draw(512, 0.78).save(os.path.join(out, 'icon-maskable-512.png'))   # miolo seguro para máscara circular
