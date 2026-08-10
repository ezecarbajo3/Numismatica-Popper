/**
 * Numismática Popper — helpers compartidos entre el catálogo y la ficha.
 *
 * Estas funciones vivían duplicadas en script.js y detalle.js, y dos de ellas ya
 * habían divergido en silencio:
 *
 *   - `getPrimaryImage`: el catálogo prefería la foto que termina en "A", la
 *     ficha tomaba `images[0]` a secas. La moneda 1018 tiene
 *     ["1018C","1018A","1018B"], así que la grilla mostraba una foto y la ficha
 *     otra distinta.
 *   - `attachImgRetry`: la copia de la ficha había perdido el fallback de
 *     miniatura WebP → JPEG original.
 *
 * Se conservó en ambos casos la versión del catálogo, que era la correcta.
 *
 * Se carga con `defer` ANTES de script.js / detalle.js en las dos páginas.
 */

// ─── Preferencias del sistema ────────────────────────────────────────────────

// Se consulta en cada uso (no se cachea) porque el usuario puede cambiar la
// preferencia del sistema con la pestaña ya abierta.
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ─── Constantes de negocio ───────────────────────────────────────────────────

// Una moneda vendida sigue visible este tiempo antes de desaparecer del sitio.
// `mark_sold.js --purge` usa la misma ventana: si divergen, el script borra
// monedas que el sitio todavía muestra.
const SOLD_RETENTION_DAYS = 30;
const SOLD_RETENTION_MS   = SOLD_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// Días que dura el cartelito "NUEVO" desde publishedAt.
const NEW_BADGE_DAYS = 7;

function isSoldExpired(coin) {
  return coin.status === 'sold' && coin.soldAt &&
    (Date.now() - new Date(coin.soldAt).getTime() > SOLD_RETENTION_MS);
}

// Una moneda no se muestra si está oculta a mano o si ya venció su ventana de
// vendida. El catálogo la filtra de la grilla; la ficha responde "no disponible".
function isCoinPubliclyVisible(coin) {
  return !!coin && !coin.hidden && !isSoldExpired(coin);
}

// ─── Precios ─────────────────────────────────────────────────────────────────

// Los precios vienen como texto ("95 USD", "2,5 USD"). La coma es decimal en
// este dataset. El `g` importa: sin él, "1,200 USD" se leía como 1.2.
function parsePriceUSD(priceStr) {
  if (!priceStr) return Infinity;
  const n = parseFloat(String(priceStr).replace(/,/g, '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? Infinity : n;
}

// ─── Estado de conservación ──────────────────────────────────────────────────

const GRADE_RANK_MAP = {
  'R-':4,'R':5,'R+':6,
  'B-':7,'B':8,'B+':9,
  'MB-':10,'MB':11,'MB+':12,
  'EX-':13,'EBC-':13,
  'EX':14,'EBC':14,
  'EX+':15,'EBC+':15,
  'SC':16,'UNC':16,'FDC':16,'MS':16,
};

function gradeRank(coin) {
  // grade_short primero (es el campo confiable)
  const raw = String(coin.grade_short || '').trim().replace(/\s+/g, '').toUpperCase().replace(/\*+$/, '');
  if (raw && raw !== '-' && GRADE_RANK_MAP[raw] !== undefined) return GRADE_RANK_MAP[raw];

  // Si no, se parsea el texto completo del grado.
  const g = String(coin.grade || '').toUpperCase();
  const hasMinus = /[-]\s*$| -/.test(g);
  const hasPlus  = /[+]\s*$| \+/.test(g);
  const mod = hasMinus ? '-' : hasPlus ? '+' : '';
  if (/^SIN\s*CIRC|^SC\b|^UNC\b|^FDC\b/i.test(g))   return GRADE_RANK_MAP['SC'];
  if (/^EXCEL/i.test(g))  return GRADE_RANK_MAP['EX'  + mod] ?? GRADE_RANK_MAP['EX'];
  if (/^MUY\s*B/i.test(g)) return GRADE_RANK_MAP['MB' + mod] ?? GRADE_RANK_MAP['MB'];
  if (/^BUENO/i.test(g))  return GRADE_RANK_MAP['B'   + mod] ?? GRADE_RANK_MAP['B'];
  if (/^REGULAR/i.test(g)) return GRADE_RANK_MAP['R'  + mod] ?? GRADE_RANK_MAP['R'];
  return 0; // desconocido
}

function getGradeShort(coin) {
  return coin.grade_short || '';
}

// ─── Imágenes ────────────────────────────────────────────────────────────────

function getImagesArray(coin) {
  return Array.isArray(coin && coin.images) ? coin.images : [];
}

// La foto frontal es la que termina en "A" (ver README). No alcanza con
// images[0]: hay monedas cuyo array quedó reordenado.
function getPrimaryImage(coin) {
  const images = getImagesArray(coin);
  if (images.length > 0) {
    const imageA = images.find(img => {
      const fileName = img.split('/').pop()?.toUpperCase() || '';
      return fileName.includes('A.');
    });
    return imageA || images[0];
  }
  return '';
}

// Devuelve la miniatura WebP (~500px, generada por generate_thumbs.sh) en vez
// del original de ~2800px. Si el src no es una foto local de images/ lo devuelve
// tal cual. El original se sigue usando en la foto grande de la ficha y el zoom;
// si la miniatura no existiera, attachImgRetry cae al original automáticamente.
function thumbFor(src) {
  if (!src || !src.startsWith('images/') || src.startsWith('images/thumbs/')) return src;
  if (/\.mp4$/i.test(src)) return src; // los videos no tienen miniatura
  const base = src.split('/').pop().replace(/\.[^.]+$/, '');
  return `images/thumbs/${base}.webp`;
}

// Reintenta cargar una <img> que falló (hasta maxTries veces, con cache-buster).
// Cubre las peticiones abortadas al navegar y los errores transitorios de red,
// así el usuario nunca tiene que apretar F5 por una miniatura rota.
//
// El estado del reintento vive en el dataset y no en un closure: así la grilla
// puede atender las 448 imágenes con UN solo listener delegado en vez de uno por
// tarjeta. `attachImgRetry` sigue existiendo para la ficha, que tiene pocas.
function handleImgError(img, maxTries = 2) {
  const current = img.src.split('?')[0];
  // Si falló una miniatura WebP (ej. moneda nueva aún sin thumb generado),
  // caer al original una sola vez antes de reintentar con cache-buster.
  if (img.dataset.triedOriginal !== '1' && img.dataset.fullSrc && current.includes('/thumbs/')) {
    img.dataset.triedOriginal = '1';
    img.src = img.dataset.fullSrc;
    return;
  }
  const tries = Number(img.dataset.retryTries || 0);
  if (tries >= maxTries) return;
  img.dataset.retryTries = String(tries + 1);
  setTimeout(() => { img.src = `${current}?r=${Date.now()}`; }, 250 * (tries + 1));
}

function attachImgRetry(img, maxTries = 2) {
  if (!img) return;
  img.addEventListener('error', () => handleImgError(img, maxTries));
}

// ─── Títulos ─────────────────────────────────────────────────────────────────

// Separa "[valor facial] [año]" del texto extra de un título de moneda.
// Año = token de 4 dígitos (1500–2099) que aparezca DESPUÉS de una palabra
// (denominación), para no confundir el valor facial
// (ej. "2000 Pesos 1992" → base "2000 Pesos 1992").
function splitCoinTitle(rawTitle) {
  const title = String(rawTitle || '').trim();
  if (!title) return { base: '', extra: '' };
  const tokens = title.split(/\s+/);
  const isYear = (t) => /^\(?(1[5-9]\d{2}|20\d{2})\)?$/.test(t);
  const isAlpha = (t) => /[A-Za-zÀ-ÿ]/.test(t);

  let yearIndex = -1, sawAlpha = false;
  for (let i = 0; i < tokens.length; i++) {
    if (isYear(tokens[i]) && sawAlpha) yearIndex = i; // último año válido
    if (isAlpha(tokens[i])) sawAlpha = true;
  }

  let cut; // índice del último token que pertenece al base
  if (yearIndex >= 0) {
    cut = yearIndex;
  } else if (!/^\d/.test(tokens[0])) {
    // Sin año y sin valor facial numérico al inicio (nombres, "Medalla…",
    // "Catalogo…", "Troy Ounce", "Lote…"): todo el título es base, sin extra.
    cut = tokens.length - 1;
  } else {
    // Sin año pero con valor facial: base = hasta la denominación (primera
    // palabra), absorbiendo un año/fecha/rango pegado ("1854/40", "1861-1863").
    const firstAlpha = tokens.findIndex(isAlpha);
    cut = firstAlpha === -1 ? tokens.length - 1 : firstAlpha;
    while (cut + 1 < tokens.length && /\d{4}/.test(tokens[cut + 1])) cut++;
  }
  return {
    base: tokens.slice(0, cut + 1).join(' '),
    extra: tokens.slice(cut + 1).join(' '),
  };
}

// Setea el título en un elemento: base en crema, texto extra en dorado.
function applyCoinTitle(el, rawTitle) {
  if (!el) return;
  const { base, extra } = splitCoinTitle(rawTitle);
  el.textContent = base;
  if (extra) {
    if (base) el.appendChild(document.createTextNode(' '));
    const span = document.createElement('span');
    span.className = 'coin-title-extra';
    span.textContent = extra;
    el.appendChild(span);
  }
}

// ─── Reveal ──────────────────────────────────────────────────────────────────

// Observador de aparición progresiva. Devuelve el observer para que quien lo
// llame pueda desconectarlo antes de rehacer el contenido.
function createRevealObserver(items) {
  if (!('IntersectionObserver' in window)) {
    items.forEach(item => item.classList.add('is-visible'));
    return null;
  }
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  items.forEach(item => observer.observe(item));
  return observer;
}

// ─── Escapeo ─────────────────────────────────────────────────────────────────

// Los títulos vienen del catálogo, no del usuario, pero igual hay comillas
// dobles en los datos (la moneda 463 es `1 Dollar 2021 "Peace Dollar"`) y sin
// escapar rompen el atributo HTML donde se interpolan.
function escapeHTML(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── SVG ─────────────────────────────────────────────────────────────────────

const SVG_CHEVRON_LEFT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;
const SVG_CHEVRON_RIGHT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;
