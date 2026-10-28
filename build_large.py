#!/usr/bin/env python3
"""Genera las fotos grandes (WebP ~1400px) de la Sala de Rarezas.

La Sala muestra cada pieza a pantalla completa: la miniatura de 500px se ve
blanda y el original de ~2800px pesa demasiado para un celular. Estas versiones
viven en images-large/<base>.webp, fuera de images/ a propósito.

Misma regla que isSalaCoin() de common.js. Solo genera lo que falta o quedó
más viejo que el original (si se cambia una foto, se rehace).

También escribe images-large/fondos.json: qué fotos tienen fondo negro (las
cuatro esquinas oscuras). El hero de la portada elige solo entre esas; una
foto con la mano o con fondo de color no luce a ese tamaño.

Uso: python3 build_large.py [--force]
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "images-large"
SIZE = 1400
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


def main():
    force = "--force" in sys.argv
    coins = json.loads((ROOT / "coins.json").read_text())
    OUT.mkdir(exist_ok=True)
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
                im = im.convert("RGB")
                im.thumbnail((SIZE, SIZE), Image.LANCZOS)
                im.save(dest, "WEBP", quality=84, method=6)
            done += 1
    fondos = {p.stem: fondo_negro(p) for p in sorted(OUT.glob("*.webp"))}
    (OUT / "fondos.json").write_text(json.dumps(fondos, indent=0))
    print(f"Generadas {done}, salteadas {skipped} -> {OUT}")
    print(f"Fondo negro: {sum(fondos.values())} de {len(fondos)}")


if __name__ == "__main__":
    main()
