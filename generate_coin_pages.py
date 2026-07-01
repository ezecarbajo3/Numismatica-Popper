#!/usr/bin/env python3
"""
Genera una página estática por moneda en moneda/<id>.html a partir de coins.json.

Cada página trae metatags og:image/og:title propios (foto A de la moneda) para que,
al compartir el link por WhatsApp, se previsualice esa moneda en vez del logo genérico.
Para una persona real, redirige de inmediato a detalle.html?id=<id>.

Correr después de cualquier cambio a coins.json (moneda nueva, cambio de foto, etc.):
    python3 generate_coin_pages.py
"""
import html
import json
import os

BASE_URL = "https://numismaticapopper.com"
REPO_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(REPO_DIR, "moneda")

TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} | Numismática Popper</title>
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:image" content="{image_url}" />
  <meta property="og:url" content="{page_url}" />
  <meta property="og:type" content="website" />
  <link rel="icon" type="image/png" href="../images/og-image.png" />
  <meta http-equiv="refresh" content="0; url={detail_url}" />
</head>
<body>
  <script>window.location.replace("{detail_url}");</script>
  <p>Redirigiendo… <a href="{detail_url}">Ver moneda</a></p>
</body>
</html>
"""


def build_page(coin):
    coin_id = coin["id"]
    images = coin.get("images") or []
    image_path = images[0] if images else "images/og-image.png"
    title = html.escape(coin.get("title") or "Moneda")
    description = html.escape(f"{coin.get('country', '')} · {coin.get('price', 'Consultar')}".strip(" ·"))
    return TEMPLATE.format(
        title=title,
        description=description,
        image_url=f"{BASE_URL}/{image_path}",
        page_url=f"{BASE_URL}/moneda/{coin_id}.html",
        detail_url=f"../detalle.html?id={coin_id}",
    )


def main():
    with open(os.path.join(REPO_DIR, "coins.json"), encoding="utf-8") as f:
        coins = json.load(f)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for coin in coins:
        page = build_page(coin)
        out_path = os.path.join(OUTPUT_DIR, f"{coin['id']}.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(page)

    print(f"Generadas {len(coins)} páginas en {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
