#!/usr/bin/env python3
"""Copia la cabecera y el pie de _partials/ en cada página del rediseño.

El sitio no tiene build: cada .html tiene que ser completo. Para no mantener
la misma cabecera a mano en varias páginas, vive una sola vez en _partials/ y
este script la pega entre las marcas <!-- @cabecera --> … <!-- /@cabecera -->
(y lo mismo con @pie). Marca el link de la página actual con aria-current.

Uso: python3 armar.py   (después de tocar algo de _partials/)
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGES = [
    "index.html", "sala.html", "catalogo.html", "detalle.html",
    "envios-y-devoluciones.html", "terminos.html", "privacidad.html", "arrepentimiento.html",
    "gracias.html",
]


def fill(html, name, block):
    pattern = re.compile(rf"(<!-- @{name} -->).*?(<!-- /@{name} -->)", re.S)
    if not pattern.search(html):
        raise SystemExit(f"falta la marca @{name}")
    return pattern.sub(lambda m: f"{m.group(1)}\n  {block.strip()}\n  {m.group(2)}", html)


def main():
    header = (ROOT / "_partials/cabecera.html").read_text()
    footer = (ROOT / "_partials/pie.html").read_text()
    for page in PAGES:
        path = ROOT / page
        html = path.read_text()
        current = header.replace(
            f'class="mh__link" href="{page}"', f'class="mh__link" href="{page}" aria-current="page"'
        )
        html = fill(html, "cabecera", current)
        html = fill(html, "pie", footer)
        path.write_text(html)
        print("armada", page)


if __name__ == "__main__":
    main()
