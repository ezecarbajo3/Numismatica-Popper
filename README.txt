# Numismática Popper — tienda

Sitio estático (HTML/CSS/JS, sin build) publicado con GitHub Pages en
https://numismaticapopper.com

## Páginas
- `index.html`        — inicio: hero, Sala, ingresos de la semana, colecciones,
                        quién está detrás y cómo comprar (una pantalla cada una).
- `catalogo.html`     — todos los productos, con filtros, buscador y orden.
- `sala.html`         — Sala de Rarezas: una pieza por pantalla, en su vitrina.
- `detalle.html`      — ficha de una pieza (?id=N). `moneda/<id>.html` es la misma
                        ficha ya escrita para Google y para compartir por WhatsApp.
- `sobre-mi.html`     — la historia de la casa, en primera persona.
- `como-comprar.html` — paso a paso, pagos, entregas y preguntas frecuentes.
- `conservacion.html` — qué significa SC, EX, MB, B, R y los signos + − **.
- Legales: `envios-y-devoluciones.html`, `terminos.html`, `privacidad.html`,
  `arrepentimiento.html` (Botón de arrepentimiento, obligatorio). `gracias.html`
  es la confirmación del aviso por mail.
- `insumos.html` e `insumos/` redirigen al catálogo filtrado (links viejos).

## Código
- `museo.css`      — estilos de todo el sitio (arranca con un índice de secciones).
- `cart.css`       — estructura del carrito; `museo.css` la ajusta al sistema.
- `common.js`      — helpers compartidos: precios, moneda, estados, imágenes, títulos.
- `categorias.js`  — qué es cada pieza (argentina, inversión, medalla, insumo…),
                     continentes y las colecciones de la portada.
- `museo.js`       — cabecera, selector Dólares/Pesos, diapositivas, carga única
                     de coins.json y la tarjeta de moneda.
- `cart.js`        — carrito y cierre de compra (pedido por mail vía FormSubmit).
- `catalogo.js`    — filtros, buscador, orden y grilla del catálogo.
- `detalle.js`     — ficha: galería, visor con zoom, variantes, compra.
- `home.js`, `sala.js`, `paginas.js` — portada, Sala y páginas de ayuda.
- `_partials/`     — cabecera y pie, una sola vez. `python3 armar.py` los copia en
                     cada página y pone versión a los .css/.js. CORRERLO después
                     de tocar `_partials/`, un .css o un .js, y antes de publicar.

## Datos
- `coins.json`     — única fuente de verdad (array de piezas).
- `images/`        — fotos originales (~2800px). `images/thumbs/` — miniaturas WebP
                     (grilla y galería). `images-large/` — fotos de ~1400px para la
                     Sala y el hero.
- `sala-notas.json` — textos de la Sala. `discounts.json` — códigos de descuento.

## Filtros del catálogo (catalogo.js)
Orden del panel, de lo amplio a lo fino: Qué buscás → Origen → Metal → Época →
Estado → Precio → Novedades. Todo vive en la URL:

    ?ver=inversion|medallas|lotes|libros|insumos|todo   (sin ?ver = monedas)
    ?origen=argentina   ?origen=mundo   ?seccion=Patria
    ?continente=Europa  ?pais=Francia   (se pueden repetir y combinar)
    ?metal=Plata  ?epoca=antes-1900|1900-1949|1950-1999|2000  ?estado=SC
    ?desde=10&hasta=50 (siempre en dólares)  ?nuevos=1  ?q=texto  ?orden=precio

Los links viejos (?cat=argentina, ?cat=plata, ?precio=5-20, ?tipo=…) se siguen
entendiendo: CAT_LEGACY y TIPO_LEGACY los traducen. Un país nuevo que no esté en
CONTINENTS (categorias.js) aparece bajo "Otros": conviene sumarlo a su lista.

## Scripts de mantenimiento
- `armar.py`               — cabecera, pie y versión de assets en cada página.
- `generate_coin_pages.py` — regenera moneda/<id>.html, sitemap.xml y robots.txt.
                             Lo corre solo GitHub Actions (fichas-seo.yml) cuando
                             cambia coins.json o detalle.html.
- `generate_thumbs.sh`     — miniaturas WebP en images/thumbs/.
- `build_large.py`         — fotos grandes de la Sala en images-large/.
- `mark_sold.js`           — marca vendidas y gestiona el ciclo de vida.
                             `--purge` SIMULA la limpieza de vendidas vencidas;
                             borra de verdad solo con `--purge --confirm`.
                             La ventana de retención (14 días) tiene que coincidir
                             con SOLD_RETENTION_DAYS de common.js.
- `mark_sold.py`           — alternativa mínima: marca vendidas por id.
- `stamp_published.py`     — sella la fecha de alta (publishedAt) para el cartel "NUEVO".
                             `python3 stamp_published.py 1043 1044` o `--from 1019`.
- `validate_grades.py`     — verifica grade/grade_short. Correr tras tocar grados.
- `ml_*.py`, `ngc_precios.py` — herramientas de MercadoLibre y precios (no son del sitio).

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
  "peso": 25,
  "diametro": 37,
  "description": "Muy linda pieza argentina."
}
```

Notas:
- La imagen frontal es la que termina en "A" (ej. 618A). La usan la grilla, la
  ficha y la previsualización de WhatsApp: NO alcanza con ponerla primera en el
  array, tiene que llamarse "A" (ver getPrimaryImage en common.js).
- No repetir IDs. Mantener siempre los mismos nombres de país y metal para que los
  filtros no se fragmenten.
- `peso` (gramos) y `diametro` (milímetros) van como NÚMERO crudo, sin unidad y con
  punto decimal: `"peso": 1.692`. Si no se conocen, se omite la clave entera.
- `year` va como número. Sin fecha, se omite la clave (nada de "S/F" ni "N/A"):
  el filtro de época y el orden por año solo entienden números.
- Conservación: `grade_short` tiene una lista CERRADA de valores — `R`, `B`, `MB`,
  `EX`, `SC`, con `+`, `-` o nada, y opcionalmente `**` al final (pieza con algún
  detalle). Nada de `EXC`, `UNC`, minúsculas ni espacios. `grade` es el texto largo
  que le corresponde, SIEMPRE en sincronía:

      SC → Sin Circular      MB+ → Muy Bueno +      EX-** → Excelente - **
      EX → Excelente         B-  → Bueno -          R     → Regular

  Una pieza puede no tener conservación (libros, insumos): los dos campos en `""`.
- Tras editar coins.json: `generate_thumbs.sh` si hay fotos nuevas. Sin miniatura
  la grilla cae al original, que pesa ~10x más.
- Toda pieza nueva debe llevar `publishedAt` para el cartel "NUEVO" y para
  "Ingresos de la semana": `python3 stamp_published.py <id1> <id2> ...`. Dura
  NEW_BADGE_DAYS días (7, en common.js) y se va solo.
- Sala de Rarezas: entra sola todo el oro y toda pieza de 100 USD o más
  (SALA_MIN_USD en common.js). `"sala": true` la fuerza, `"sala": false` la saca.
- Códigos de descuento del carrito: `discounts.json` (clave = código). Campos:
  `percent`, `highPrice: {overUSD, percent}`, `active`, `expires`, `label`. Es un
  control del lado del cliente: el pedido llega por mail con el código y el
  detalle, y el dueño confirma el monto antes de cobrar.
