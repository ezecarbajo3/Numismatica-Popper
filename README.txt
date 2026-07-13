# Numismática Popper — Catálogo

Sitio estático (HTML/CSS/JS, sin build) desplegado con GitHub Pages en
https://numismaticapopper.com

## Archivos principales
- `index.html`     — landing + catálogo (grilla de monedas)
- `detalle.html`   — ficha individual de moneda (?id=N)
- `styles.css`     — estilos de todo el sitio
- `script.js`      — lógica del catálogo (filtros, búsqueda, carrusel)
- `detalle.js`     — lógica de la ficha de detalle
- `coins.json`     — fuente de datos (array de monedas). Es la única fuente de verdad.
- `images/`        — fotos originales (~2800px)
- `images/thumbs/` — miniaturas WebP para la grilla (generadas por generate_thumbs.sh)
- `moneda/<id>.html` — página de previsualización por moneda (og:image propio para
                       compartir por WhatsApp). Redirige a detalle.html?id=<id>.

## Scripts de mantenimiento
- `generate_coin_pages.py` — regenera moneda/<id>.html a partir de coins.json.
                             Correr tras cualquier cambio de fotos/altas en coins.json.
- `generate_thumbs.sh`     — genera/actualiza las miniaturas WebP en images/thumbs/.
- `mark_sold.js` / `mark_sold.py` — marcan monedas como vendidas (status/soldAt).

## Cómo cargar una moneda
Editar `coins.json` y agregar un objeto al array. Campos habituales:

```json
{
  "id": 618,
  "title": "2 Pesos 1881",
  "country": "Argentina",
  "metal": "Plata .900",
  "year": 1881,
  "price": "USD 95",
  "images": ["images/618A.jpeg", "images/618B.jpeg"],
  "grade": "Excelente",
  "grade_short": "EX",
  "reference": "CJ# 1",
  "mintage": "1000000",
  "description": "Muy linda pieza argentina."
}
```

Notas:
- La imagen frontal es la que termina en "A" (ej. 618A) — script.js la usa como principal.
- No repetir IDs. Mantener siempre los mismos nombres de país y metal para que los
  filtros no se fragmenten.
- Tras editar coins.json: correr `generate_thumbs.sh` (nuevas fotos) y
  `python3 generate_coin_pages.py` (altas/cambios de foto).
