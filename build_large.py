#!/usr/bin/env python3
"""Genera las fotos grandes (WebP ~1400px) de la Sala de Rarezas.

La Sala muestra cada pieza a pantalla completa: la miniatura de 500px se ve
blanda y el original de ~2800px pesa demasiado para un celular. Estas versiones
viven en images-large/<base>.webp, fuera de images/ a propósito.

Misma regla que isSalaCoin() de common.js. Solo genera lo que falta o quedó
más viejo que el original (si se cambia una foto, se rehace).

Encuadre parejo: la pieza (moneda, blíster o cartón) ocupa siempre el 88 % del
cuadro, centrada. Unas fotos venían recortadas al ras y otras con mucho margen,
y en la Sala se veían de tamaños distintos. Se mide el objeto contra el color
del borde, se recorta un cuadrado alrededor y se rellena con negro (o con el
color del fondo si es claro). Una moneda sobre tela u otro fondo oscuro que no
es negro se recorta en círculo sobre negro. Si la detección falla en alguna
foto, images-large/recortes.json la fija a mano: {"1847A": [cx, cy, r]}, en
fracciones del ancho/alto de la foto (r, del ancho).

También escribe images-large/fondos.json: qué fotos tienen fondo negro (las
cuatro esquinas oscuras). El hero de la portada elige solo entre esas; una
foto con la mano o con fondo de color no luce a ese tamaño.

Uso: python3 build_large.py [--force]
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "images-large"
SIZE = 1400
OCUPA = 0.88          # fracción del cuadro que ocupa la pieza
UMBRAL = 35           # diferencia de gris con el fondo que cuenta como pieza
SALA_MIN_USD = 100


def price_usd(coin):
    raw = str(coin.get("price") or "")
    num = re.sub(r"[^\d.]", "", raw.replace(",", "."))
    try:
        return float(num)
    except ValueError:
        return None


def is_gold(coin):
    metal = str(coin.get("metal") or "").lower()
    return metal.startswith("oro") and "nórdico" not in metal


def is_sala(coin):
    if coin.get("sala") is False:
        return False
    if coin.get("sala") is True or is_gold(coin):
        return True
    p = price_usd(coin)
    return p is not None and p >= SALA_MIN_USD


def fondo_negro(path):
    with Image.open(path) as im:
        im = im.convert("L")
        w, h = im.size
        m = max(4, min(w, h) // 50)
        corners = [(m, m), (w - m - 1, m), (m, h - m - 1), (w - m - 1, h - m - 1)]
        return all(im.getpixel(c) < 24 for c in corners)


def _caja_objeto(im):
    """(x0, y0, x1, y1) de la pieza y el gris del fondo (mediana de los bordes)."""
    g = np.asarray(im.convert("L"), dtype=np.int16)
    h, w = g.shape
    b = max(4, min(w, h) // 100)
    fondo = int(np.median(np.concatenate([g[:b].ravel(), g[-b:].ravel(),
                                          g[:, :b].ravel(), g[:, -b:].ravel()])))
    mask = np.abs(g - fondo) > UMBRAL
    # Sin la textura del fondo (tela, polvo) y con la pieza entera: se abre para
    # sacar puntos sueltos, se cierra y se rellena, y queda la mancha más grande.
    k = max(3, min(w, h) // 120)
    mask = ndimage.binary_opening(mask, structure=np.ones((k, k)))
    mask = ndimage.binary_closing(mask, structure=np.ones((k, k)))
    mask = ndimage.binary_fill_holes(mask)
    etiquetas, n = ndimage.label(mask)
    if n == 0:
        return (0, 0, w, h), fondo
    tam = ndimage.sum(mask, etiquetas, range(1, n + 1))
    sl = ndimage.find_objects(etiquetas)[int(np.argmax(tam))]
    return (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop), fondo


def encuadrar(im, stem, recortes):
    """La foto con la pieza centrada ocupando OCUPA del cuadro."""
    w, h = im.size
    manual = recortes.get(stem)
    if manual:
        cx, cy, r = manual
        caja = (cx * w - r * w, cy * h - r * w, cx * w + r * w, cy * h + r * w)
        fondo = None
    else:
        caja, fondo = _caja_objeto(im)
    x0, y0, x1, y1 = caja
    bw, bh = x1 - x0, y1 - y0
    if bw < min(w, h) * 0.2 or bh < min(w, h) * 0.2:
        return im          # no se encontró nada razonable: tal cual
    lado = int(round(max(bw, bh) / OCUPA))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    ox, oy = int(round(cx - lado / 2)), int(round(cy - lado / 2))

    claro = fondo is not None and fondo >= 120
    redonda = 0.85 <= bw / bh <= 1.18
    if claro:
        borde = np.asarray(im)[:4].reshape(-1, 3)
        relleno = tuple(int(v) for v in np.median(borde, axis=0))
    else:
        relleno = (0, 0, 0)
    lienzo = Image.new("RGB", (lado, lado), relleno)
    lienzo.paste(im, (-ox, -oy))

    # Moneda sobre un fondo oscuro que no es negro (tela, madera): en círculo.
    if (manual or (fondo is not None and 12 < fondo < 120)) and redonda:
        m = Image.new("L", (lado, lado), 0)
        d = ImageDraw.Draw(m)
        r = max(bw, bh) / 2 + max(2, lado // 200)
        c = lado / 2
        d.ellipse((c - r, c - r, c + r, c + r), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(max(1, lado // 300)))
        lienzo = Image.composite(lienzo, Image.new("RGB", (lado, lado), (0, 0, 0)), m)
    return lienzo


def main():
    force = "--force" in sys.argv
    coins = json.loads((ROOT / "coins.json").read_text())
    OUT.mkdir(exist_ok=True)
    rec_path = OUT / "recortes.json"
    recortes = json.loads(rec_path.read_text()) if rec_path.exists() else {}
    done = skipped = 0
    for coin in coins:
        if coin.get("hidden") or not is_sala(coin):
            continue
        for src in coin.get("images") or []:
            if not src.startswith("images/") or src.lower().endswith(".mp4"):
                continue
            path = ROOT / src
            dest = OUT / (Path(src).stem + ".webp")
            if not path.exists() or (dest.exists() and not force
                                     and dest.stat().st_mtime >= path.stat().st_mtime):
                skipped += 1
                continue
            with Image.open(path) as im:
                im = encuadrar(im.convert("RGB"), path.stem, recortes)
                im.thumbnail((SIZE, SIZE), Image.LANCZOS)
                im.save(dest, "WEBP", quality=84, method=6)
            done += 1
    fondos = {p.stem: fondo_negro(p) for p in sorted(OUT.glob("*.webp"))}
    (OUT / "fondos.json").write_text(json.dumps(fondos, indent=0))
    print(f"Generadas {done}, salteadas {skipped} -> {OUT}")
    print(f"Fondo negro: {sum(fondos.values())} de {len(fondos)}")


if __name__ == "__main__":
    main()
