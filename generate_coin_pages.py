#!/usr/bin/env python3
"""
Genera una página estática por moneda en moneda/<id>.html a partir de coins.json,
más sitemap.xml y robots.txt.

Cada moneda/<id>.html es una ficha COMPLETA, legible por Google sin ejecutar nada:
título, país, descripción, especificaciones, precio, foto y datos estructurados
(schema.org Product). Antes era un stub que redirigía por JavaScript a
detalle.html?id=<id>, y para Google no tenía contenido.

La página se arma sobre detalle.html (misma cabecera, estilos, carrito y pie), así
que cualquier cambio de diseño en detalle.html se hereda al regenerar. Para una
persona, detalle.js la vuelve a pintar con los datos frescos de coins.json: el
precio y el estado que ve siempre están al día aunque la página no se haya
regenerado. Lo que se desactualiza sin regenerar es solo la versión para Google.

Los metatags og:* se mantienen igual que antes para que la previsualización de
WhatsApp no cambie.

Correr después de cualquier cambio a coins.json (alta, venta, foto, precio):
    python3 generate_coin_pages.py
"""
import html
import json
import os
import re
from datetime import datetime, timezone, timedelta

BASE_URL = "https://numismaticapopper.com"
REPO_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(REPO_DIR, "moneda")
SHELL_PATH = os.path.join(REPO_DIR, "detalle.html")

# Igual que SOLD_RETENTION_DAYS en common.js: una vendida se sigue mostrando
# (como VENDIDO) durante estos días y después desaparece del sitio.
SOLD_RETENTION_DAYS = 14

SITE_NAME = "Numismática Popper"
META_DESC_MAX = 155

# Páginas fijas que van al sitemap además de las monedas.
STATIC_PAGES = ["", "insumos.html"]


# ─── Helpers de datos ─────────────────────────────────────────────────────────

def esc(value):
    return html.escape(str(value), quote=True)


def primary_image(images):
    """La foto de portada es la que termina en 'A', igual que en el catálogo.

    Con images[0] a secas, una moneda cuyo array quedó reordenado (la 1018 es
    ["1018C","1018A","1018B"]) se previsualizaba en WhatsApp con una foto y se
    abría con otra.
    """
    for img in images:
        name = img.split("/")[-1].upper()
        if "A." in name:
            return img
    return images[0] if images else None


def is_video(src):
    return bool(src) and src.lower().endswith(".mp4")


def parse_iso(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def is_sold(coin):
    return coin.get("status") == "sold"


def is_publicly_visible(coin, now):
    """Mismo criterio que isCoinPubliclyVisible() en common.js."""
    if coin.get("hidden"):
        return False
    if is_sold(coin):
        sold_at = parse_iso(coin.get("soldAt"))
        if sold_at and now - sold_at > timedelta(days=SOLD_RETENTION_DAYS):
            return False
    return True


def parse_price_usd(price):
    """Mismo criterio que parsePriceUSD() en common.js. None si no es numérico."""
    if not price:
        return None
    cleaned = re.sub(r"[^\d.]", "", str(price).replace(",", "."))
    try:
        return float(cleaned)
    except ValueError:
        return None


def format_price_number(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


def format_medida(value):
    """Mismo formato que formatMedida() en detalle.js: 2 decimales, coma."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return ""
    return format_price_number(round(n * 100) / 100).replace(".", ",")


def format_mintage(value):
    digits = re.sub(r"[.,\s]", "", str(value or ""))
    if not digits.isdigit():
        return ""
    return f"{int(digits):,}".replace(",", ".")


def clean_grade(grade):
    """'Muy Bueno **' → 'Muy Bueno'. Los asteriscos son una marca interna."""
    return re.sub(r"\s*\*+\s*", " ", grade or "").strip()


def main_country(country):
    """'Argentina - Patria' → 'Argentina'."""
    return (country or "").split(" - ")[0].strip()


def truncate(text, limit):
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,.;·-")
    return cut + "…"


# ─── Contenido SEO ────────────────────────────────────────────────────────────

def page_title(coin):
    title = coin.get("title") or "Moneda"
    country = main_country(coin.get("country"))
    if country and country.lower() not in title.lower():
        return f"{title} – {country} | {SITE_NAME}"
    return f"{title} | {SITE_NAME}"


def meta_description(coin, sold):
    """Frase natural, lo más importante primero, cortada en 155 caracteres."""
    title = coin.get("title") or "Moneda"
    country = coin.get("country")
    first = f"Moneda {title}" + (f" de {country}" if country else "")
    details = []
    if coin.get("metal"):
        details.append(coin["metal"][:1].lower() + coin["metal"][1:])
    grade = clean_grade(coin.get("grade"))
    if grade:
        details.append(f"estado {grade}")
    if coin.get("reference"):
        details.append(coin["reference"])
    if details:
        first += ", " + ", ".join(details)
    parts = [first + "."]

    if sold:
        parts.append("Vendida. Mirá monedas similares en el catálogo.")
    else:
        price = parse_price_usd(coin.get("price"))
        if price is not None:
            parts.append(f"{format_price_number(price)} USD.")
        parts.append("Comprá online con envío a todo el país.")
    return truncate(" ".join(parts), META_DESC_MAX)


def og_description(coin):
    # Sin cambios respecto de la versión anterior: así se ve en WhatsApp.
    return f"{coin.get('country', '')} · {coin.get('price', 'Consultar')}".strip(" ·")


def json_ld(coin, page_url, sold):
    images = [f"{BASE_URL}/{img}" for img in (coin.get("images") or []) if not is_video(img)]
    product = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": coin.get("title") or "Moneda",
        "sku": str(coin["id"]),
        "url": page_url,
        "category": "Monedas de colección",
        "description": (coin.get("description") or meta_description(coin, sold)).strip(),
    }
    if images:
        product["image"] = images
    if coin.get("reference"):
        product["mpn"] = coin["reference"]

    props = []
    for label, key in (("País", "country"), ("Año", "year"), ("Material", "metal"),
                       ("Estado de conservación", "grade"), ("Referencia", "reference")):
        val = coin.get(key)
        if key == "grade":
            val = clean_grade(val)
        if val not in (None, ""):
            props.append({"@type": "PropertyValue", "name": label, "value": str(val)})
    if coin.get("peso"):
        props.append({"@type": "PropertyValue", "name": "Peso",
                      "value": format_medida(coin["peso"]), "unitCode": "GRM"})
    if coin.get("diametro"):
        props.append({"@type": "PropertyValue", "name": "Diámetro",
                      "value": format_medida(coin["diametro"]), "unitCode": "MMT"})
    if props:
        product["additionalProperty"] = props

    price = parse_price_usd(coin.get("price"))
    if price is not None:
        product["offers"] = {
            "@type": "Offer",
            "url": page_url,
            "priceCurrency": "USD",
            "price": format_price_number(price),
            "availability": "https://schema.org/SoldOut" if sold else "https://schema.org/InStock",
            "itemCondition": "https://schema.org/UsedCondition",
            "seller": {"@type": "Organization", "name": SITE_NAME},
        }

    raw = json.dumps(product, ensure_ascii=False, indent=2)
    # Un "</script>" dentro de una descripción cerraría la etiqueta antes de tiempo.
    return raw.replace("</", "<\\/")


# ─── HTML ─────────────────────────────────────────────────────────────────────

def spec_row(label, value, unit=None):
    unit_html = f' <span class="detail-spec-unit">({esc(unit)})</span>' if unit else ""
    return (
        '        <div class="detail-spec-row">\n'
        f'          <div class="detail-spec-label">{esc(label)}{unit_html}</div>\n'
        f'          <div class="detail-spec-value">{esc(value)}</div>\n'
        '        </div>\n'
    )


def prerendered_detail(coin, visible, sold):
    """Versión estática de la ficha. detalle.js la reemplaza al cargar; queda
    para Google y para quien tenga JavaScript apagado. Usa las mismas clases
    que renderCoinDetail() para que el cambio no se note."""
    if not visible:
        return ('<p class="detail-error">Esta moneda ya no está disponible. '
                '<a href="index.html">Ver el catálogo</a></p>')

    title = coin.get("title") or "Moneda"
    images = [img for img in (coin.get("images") or []) if not is_video(img)]
    main = primary_image(images)

    gallery = ""
    if main:
        gallery = (
            '    <div class="detail-gallery">\n'
            '      <div class="detail-main-image-wrap">\n'
            f'        <img class="detail-main-image" src="{esc(main)}" alt="{esc(title)}" decoding="async" />\n'
            '      </div>\n'
            '    </div>\n'
        )

    specs = ""
    if coin.get("reference"):
        specs += spec_row("Referencia", coin["reference"])
    if coin.get("grade"):
        specs += spec_row("Estado de conservación", coin["grade"])
    if coin.get("metal"):
        specs += spec_row("Material", coin["metal"])
    if coin.get("year"):
        specs += spec_row("Año", coin["year"])
    mintage = format_mintage(coin.get("mintage"))
    if mintage:
        specs += spec_row("Acuñación", mintage)
    if coin.get("peso"):
        specs += spec_row("Peso", format_medida(coin["peso"]), "g")
    if coin.get("diametro"):
        specs += spec_row("Diámetro", format_medida(coin["diametro"]), "mm")
    specs += spec_row("Referencia interna", coin["id"])

    description = ""
    if coin.get("description"):
        body = esc(coin["description"]).replace("\n", "<br>")
        description = f'      <p class="detail-description">{body}</p>\n'

    price = "VENDIDO" if sold else esc(coin.get("price") or "Consultar")

    return (
        '<div class="detail-row">\n'
        f'{gallery}'
        '    <div class="detail-info">\n'
        f'      <p class="detail-country">{esc(coin.get("country") or "")}</p>\n'
        f'      <h1 class="detail-title">{esc(title)}</h1>\n'
        f'{description}'
        '      <div class="detail-divider"></div>\n'
        '      <div class="detail-specs">\n'
        f'{specs}'
        '      </div>\n'
        f'      <p class="detail-price">{price}</p>\n'
        '    </div>\n'
        '    </div>'
    )


SHELL_ANCHORS = {
    "meta charset": r'<meta charset="UTF-8" />',
    "bloque <title>…og:type": r'<title>.*?<meta property="og:type"[^>]*/>',
    "placeholder de carga": r'<p class="detail-loading">[^<]*</p>',
    "script detalle.js": r'<script src="detalle\.js[^"]*" defer></script>',
}


def load_shell():
    """detalle.html, validando que estén los puntos de anclaje. Si alguien
    cambia detalle.html y desaparece uno, el script se frena con un mensaje
    claro en vez de generar 800 páginas rotas."""
    with open(SHELL_PATH, encoding="utf-8") as f:
        shell = f.read()
    for name, pattern in SHELL_ANCHORS.items():
        if not re.search(pattern, shell, flags=re.S):
            raise SystemExit(f"ERROR: no encontré '{name}' en detalle.html. "
                             "¿Cambió su estructura? No se generó nada.")
    # detalle.html lleva noindex (ver comentario allí); las fichas no.
    shell = re.sub(r'\s*<!--[^>]*?noindex.*?-->', "", shell, flags=re.S)
    shell = re.sub(r'\s*<meta name="robots"[^>]*/>', "", shell)
    return shell


def build_page(shell, coin, now):
    coin_id = str(coin["id"])
    visible = is_publicly_visible(coin, now)
    sold = is_sold(coin)
    indexable = visible and not sold
    page_url = f"{BASE_URL}/moneda/{coin_id}.html"

    images = coin.get("images") or []
    og_image = primary_image([i for i in images if not is_video(i)]) or "images/og-image.png"

    head = "\n  ".join(filter(None, [
        f"<title>{esc(page_title(coin))}</title>",
        f'<meta name="description" content="{esc(meta_description(coin, sold))}" />',
        f'<link rel="canonical" href="{page_url}" />',
        None if indexable else '<meta name="robots" content="noindex, follow" />',
        f'<meta property="og:title" content="{esc(coin.get("title") or "Moneda")}" />',
        f'<meta property="og:description" content="{esc(og_description(coin))}" />',
        f'<meta property="og:image" content="{BASE_URL}/{esc(og_image)}" />',
        f'<meta property="og:url" content="{page_url}" />',
        '<meta property="og:type" content="website" />',
        (f'<script type="application/ld+json">\n{json_ld(coin, page_url, sold)}\n  </script>'
         if visible else None),
    ]))

    page = shell
    # La ficha vive en /moneda/ pero todos los recursos (CSS, JS, coins.json,
    # images/, index.html) están en la raíz y se piden con ruta relativa.
    page = page.replace('<meta charset="UTF-8" />',
                        '<meta charset="UTF-8" />\n  <base href="../" />', 1)
    page = re.sub(SHELL_ANCHORS["bloque <title>…og:type"], lambda _: head, page, count=1, flags=re.S)
    page = re.sub(SHELL_ANCHORS["placeholder de carga"],
                  lambda _: prerendered_detail(coin, visible, sold), page, count=1)
    page = re.sub("(" + SHELL_ANCHORS["script detalle.js"] + ")",
                  lambda m: f"<script>window.POPPER_COIN_ID = {json.dumps(coin_id)};</script>\n  {m.group(1)}",
                  page, count=1)
    return page, indexable


def lastmod_for(coin):
    dt = parse_iso(coin.get("publishedAt"))
    return dt.date().isoformat() if dt else None


def build_sitemap(entries):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in entries:
        lines.append("  <url>")
        lines.append(f"    <loc>{esc(loc)}</loc>")
        if lastmod:
            lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


ROBOTS_TXT = f"""User-agent: *
Allow: /
Disallow: /gracias.html

Sitemap: {BASE_URL}/sitemap.xml
"""


def main():
    with open(os.path.join(REPO_DIR, "coins.json"), encoding="utf-8") as f:
        coins = json.load(f)

    shell = load_shell()
    now = datetime.now(timezone.utc)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    sitemap_entries = [(f"{BASE_URL}/{p}", None) for p in STATIC_PAGES]
    indexed = 0
    for coin in coins:
        page, indexable = build_page(shell, coin, now)
        with open(os.path.join(OUTPUT_DIR, f"{coin['id']}.html"), "w", encoding="utf-8") as f:
            f.write(page)
        if indexable:
            indexed += 1
            sitemap_entries.append((f"{BASE_URL}/moneda/{coin['id']}.html", lastmod_for(coin)))

    with open(os.path.join(REPO_DIR, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(build_sitemap(sitemap_entries))
    with open(os.path.join(REPO_DIR, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(ROBOTS_TXT)

    # Limpieza de huérfanas: si una moneda desaparece de coins.json, su página
    # quedaba para siempre apuntando a una ficha inexistente.
    vigentes = {f"{coin['id']}.html" for coin in coins}
    huerfanas = [n for n in os.listdir(OUTPUT_DIR) if n.endswith(".html") and n not in vigentes]
    for name in huerfanas:
        os.remove(os.path.join(OUTPUT_DIR, name))

    print(f"Generadas {len(coins)} páginas en {OUTPUT_DIR} "
          f"({indexed} indexables, {len(coins) - indexed} con noindex)")
    print(f"sitemap.xml: {len(sitemap_entries)} URLs · robots.txt actualizado")
    if huerfanas:
        print(f"Borradas {len(huerfanas)} páginas huérfanas: {', '.join(sorted(huerfanas))}")


if __name__ == "__main__":
    main()
