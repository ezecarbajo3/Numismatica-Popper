# Numismática Popper — Catálogo

Sitio estático (HTML/CSS/JS, sin build) desplegado con GitHub Pages en
https://numismaticapopper.com

## Archivos principales
- `index.html`     — landing + catálogo (grilla de monedas)
- `detalle.html`   — ficha individual de moneda (?id=N)
- `styles.css`     — estilos de todo el sitio (arranca con un índice de secciones)
- `common.js`      — helpers compartidos por el catálogo y la ficha: títulos,
                     imágenes (foto "A", miniaturas), grados, precios, escapeo.
                     Se carga ANTES que script.js / detalle.js en las dos páginas.
- `script.js`      — lógica del catálogo (filtros, búsqueda, orden, carrusel)
- `detalle.js`     — lógica de la ficha de detalle
- `glow.js`        — halo dorado que sigue al puntero (solo escritorio)
- `coins.json`     — fuente de datos (array de monedas). Es la única fuente de verdad.
- `images/`        — fotos originales (~2800px)
- `images/thumbs/` — miniaturas WebP; las usan la grilla Y la ficha (galería y
                     variantes). El original solo se sirve en la foto grande.
- `moneda/<id>.html` — página de previsualización por moneda (og:image propio para
                       compartir por WhatsApp). Redirige a detalle.html?id=<id>.
- `.nojekyll`      — evita que GitHub Pages corra Jekyll sobre ~2.700 archivos.

## Scripts de mantenimiento
- `generate_coin_pages.py` — regenera moneda/<id>.html a partir de coins.json y
                             borra las páginas de monedas que ya no existen.
                             Correr tras cualquier cambio de fotos/altas en coins.json.
- `generate_thumbs.sh`     — genera/actualiza las miniaturas WebP en images/thumbs/.
- `mark_sold.js`           — marca vendidas y gestiona el ciclo de vida.
                             `--purge` SIMULA la limpieza de vendidas vencidas;
                             borra de verdad solo con `--purge --confirm`.
                             La ventana de retención (30 días) tiene que coincidir
                             con SOLD_RETENTION_DAYS de common.js.
- `mark_sold.py`           — alternativa mínima: marca vendidas por id.
- `stamp_published.py`     — sella la fecha de alta (publishedAt) para el badge "NUEVO".
                             `python3 stamp_published.py 1043 1044` o `--from 1019`.

## Cómo cargar una moneda
Editar `coins.json` y agregar un objeto al array. Campos habituales:

```json
{
  "id": 618,
  "title": "2 Pesos 1881",
  "country": "Argentina",
  "metal": "Plata .900",
  "year": 1881,
  "price": "95 USD",
  "images": ["images/618A.jpeg", "images/618B.jpeg"],
  "grade": "Excelente",
  "grade_short": "EX",
  "reference": "CJ# 1",
  "mintage": "1000000",
  "description": "Muy linda pieza argentina."
}
```

Notas:
- La imagen frontal es la que termina en "A" (ej. 618A). La usan la grilla, la
  ficha y la previsualización de WhatsApp: NO alcanza con ponerla primera en el
  array, tiene que llamarse "A" (ver getPrimaryImage en common.js).
- No repetir IDs. Mantener siempre los mismos nombres de país y metal para que los
  filtros no se fragmenten.
- Tras editar coins.json: correr `generate_thumbs.sh` (nuevas fotos) y
  `python3 generate_coin_pages.py` (altas/cambios de foto). Sin miniatura la
  grilla cae al original, que pesa ~10x más.
- Una moneda puede publicarse sin fotos: la tarjeta muestra un hueco con "Sin
  foto" en vez de una imagen rota.
- Toda moneda nueva debe llevar `publishedAt` (fecha de alta, ISO UTC) para que la
  grilla le muestre el cartelito "NUEVO". Lo más simple es correr
  `python3 stamp_published.py <id1> <id2> ...` justo después del alta — sella la
  fecha actual y nunca pisa un publishedAt existente.
- El badge dura NEW_BADGE_DAYS días (7, definido en common.js) y después desaparece
  solo: no hay que sacarlo a mano. Las monedas sin `publishedAt` nunca lo muestran.
