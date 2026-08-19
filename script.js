// ─── Disable browser auto-scroll restoration ─────────────────────────────────
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Los helpers compartidos con la ficha de detalle (títulos, imágenes, grados,
// precios, reveal) viven en common.js, que se carga antes que este archivo.

// ─── DOM refs ─────────────────────────────────────────────────────────────────
//
// Estos elementos son parte del contrato de index.html, la única página que
// carga este archivo: si falta alguno el catálogo no tiene sentido y conviene
// que reviente ruidosamente en la consola. Los opcionales de verdad —los que
// pueden no estar según la vista— sí se consultan con guarda antes de usarse.
const searchInput        = document.getElementById('searchInput');
const clearSearchBtn     = document.getElementById('clearSearch');
const resultsCount       = document.getElementById('resultsCount');
const coinsGrid          = document.getElementById('coinsGrid');
const coinCardTemplate   = document.getElementById('coinCardTemplate');
const subFilterBar       = document.getElementById('subFilterBar');
const subFilterList      = document.getElementById('subFilterList');
const sortButton         = document.getElementById('sortButton');
const sortMenu           = document.getElementById('sortMenu');

// ─── State ────────────────────────────────────────────────────────────────────
let allCoins        = [];
// group_id → { minVal, minStr, count, isNew }. Se arma una sola vez al cargar el
// catálogo: antes cada tarjeta de grupo recorría las 874 monedas dos veces para
// saber su cantidad de variantes y si era nueva (~178.000 iteraciones por render).
let groupIndex      = new Map();
let activeCategory  = null;
let activeSubFilter = null;
let revealObserver  = null;
// Las tarjetas que se están mostrando, por id: la delegación de eventos las
// necesita para resolver un click sin cerrar sobre cada moneda.
let renderedCoinsById = new Map();

// Orden de la grilla. 'asc' es la flecha hacia abajo (de menor a mayor: A→Z,
// del más barato al más caro, de la más antigua a la más nueva) y 'desc' la
// flecha hacia arriba. Cada criterio recuerda su propio sentido, así volver a
// uno ya usado lo devuelve como el usuario lo había dejado.
const SORT_KEYS = ['alfabetico', 'precio', 'antiguedad'];
let activeSort  = 'alfabetico';
let sortDirections = { alfabetico: 'asc', precio: 'asc', antiguedad: 'asc' };

const STATE_KEY = 'nump_filter_state';

// ─── Country lookup helpers ───────────────────────────────────────────────────

const ARGENTINA_EQUIVALENTS = {
  'Argentina':                        'Argentina',
  'Argentina - Patria':               'Argentina - Patria',
  'Patria':                           'Argentina - Patria',
  'Argentina - Buenos Aires':         'Argentina - Buenos Aires',
  'Buenos Aires':                     'Argentina - Buenos Aires',
  'Argentina - Confed. Arg.':         'Argentina - Confed. Arg.',
  'Confed. Arg.':                     'Argentina - Confed. Arg.',
  'Argentina - Confederación Argentina': 'Argentina - Confed. Arg.',
  'Confederación Argentina':          'Argentina - Confed. Arg.',
};

const ARGENTINA_GROUP_VALUES = new Set([
  'Argentina',
  'Argentina - Patria',
  'Argentina - Buenos Aires',
  'Argentina - Confed. Arg.',
]);

// Maps Argentina sub-filter labels → normalized country values
const ARGENTINA_SUB_MAP = {
  'República':               'Argentina',
  'Bs As':                   'Argentina - Buenos Aires',
  'Confederación Argentina': 'Argentina - Confed. Arg.',
  'Patria':                  'Argentina - Patria',
};

function normalizeCountryValue(country) {
  const value = String(country || '').trim();
  return ARGENTINA_EQUIVALENTS[value] || value;
}

function getCountryDisplayLabel(country) {
  const normalized = normalizeCountryValue(country);
  switch (normalized) {
    case 'Argentina - Patria':       return 'Patria';
    case 'Argentina - Buenos Aires': return 'Buenos Aires';
    case 'Argentina - Confed. Arg.': return 'Confed. Arg.';
    case 'Argentina':                return 'Argentina';
    default: return normalized || 'País no informado';
  }
}

// ─── Category predicates ──────────────────────────────────────────────────────

function isArgentinaCoin(coin) {
  return (coin.country || '').trim().startsWith('Argentina');
}

function isMedalOrToken(coin) {
  const country = (coin.country || '').trim().toLowerCase();
  const title   = (coin.title   || '').trim().toLowerCase();
  return (
    country === 'token'         ||
    country === 'medalla'       ||
    country.includes('token')   ||
    country.includes('medalla') ||
    title.includes('medalla')
  );
}

// Granular helpers used for medallas sub-filtering
function isMedal(coin) {
  const country = (coin.country || '').trim().toLowerCase();
  const title   = (coin.title   || '').trim().toLowerCase();
  return country.includes('medalla') || title.includes('medalla');
}

function isToken(coin) {
  const country = (coin.country || '').trim().toLowerCase();
  return country === 'token' || country.includes('token');
}

function isLotePlata(coin) {
  return /^lote\s+plata/i.test((coin.title || '').trim());
}

// "Blisters" y "Lotes" son dos sub-filtros distintos dentro de Varios, así que
// el predicado viejo se parte en dos. isBlister queda como la unión de ambos
// porque es la que usan `internacional` y `economicas` para excluir.
function isBlisterOnly(coin) {
  const title = (coin.title || '').trim();
  return /^bls[.\s]/i.test(title) || /blister/i.test(title);
}

function isLoteVario(coin) {
  const title = (coin.title || '').trim();
  return /^lote\s/i.test(title) && !isLotePlata(coin) && !isBlisterOnly(coin);
}

function isBlister(coin) {
  return isBlisterOnly(coin) || isLoteVario(coin);
}

// Folios, carpetas, sobres y cartoncitos: no son monedas, viven detrás de su
// propio botón y se excluyen a mano de Mundiales, Económicas y "Ver todas".
function isInsumo(coin) {
  return (coin.country || '').trim().toLowerCase() === 'insumos'
      || (coin.title   || '').toLowerCase().includes('insumo');
}

function isBook(coin) {
  const title = (coin.title || '').trim().toLowerCase();
  return title.includes('libro') || title.includes('catálogo') || title.includes('catalogo') || title.includes('album') || title.includes('red book');
}

function isEconomica(coin) {
  return (
    parsePriceUSD(coin.price) < 5 &&
    !isArgentinaCoin(coin) &&
    !isMedalOrToken(coin) &&
    !isBlister(coin) &&
    !isBook(coin) &&
    !isInsumo(coin)
  );
}

function getSilverPurity(coin) {
  const m = /[Pp]lata\s*\.?(\d{3,4})/.exec(coin.metal || '');
  return m ? parseInt(m[1], 10) : 0;
}

function isInvestment(coin) {
  if (isLotePlata(coin)) return true;
  const purity = getSilverPurity(coin);
  if (purity >= 900) return true;
  return /^[Pp]lata$/i.test((coin.metal || '').trim());
}

// ─── Group helpers ────────────────────────────────────────────────────────────

// Índice de grupos, armado una sola vez por carga de catálogo. Reemplaza a tres
// recorridos completos de `allCoins` que se hacían POR TARJETA durante el render
// (precio mínimo, cantidad de variantes y "¿es nueva?"). Con 102 grupos sobre
// 874 monedas eran ~178.000 iteraciones en cada tecla del buscador.
function buildGroupIndex() {
  groupIndex = new Map();
  for (const coin of allCoins) {
    if (!coin.group_id) continue;
    let entry = groupIndex.get(coin.group_id);
    if (!entry) {
      entry = { minVal: Infinity, minStr: '', count: 0, isNew: false };
      groupIndex.set(coin.group_id, entry);
    }
    if (coin.status !== 'sold') {
      entry.count += 1;
      const p = parsePriceUSD(coin.price);
      if (p < entry.minVal) {
        entry.minVal = p;
        entry.minStr = coin.price;
      }
    }
    if (isNewCoin(coin)) entry.isNew = true;
  }
}

function collapseGroups(coins) {
  // Representative = best-grade active coin; tie-break by lowest id
  const repById = new Map();
  for (const coin of coins) {
    if (!coin.group_id) continue;
    const ex = repById.get(coin.group_id);
    if (!ex) { repById.set(coin.group_id, coin); continue; }
    const exSold = ex.status === 'sold';
    const cSold  = coin.status === 'sold';
    // Active beats sold
    if (exSold && !cSold) { repById.set(coin.group_id, coin); continue; }
    if (!exSold && cSold) continue;
    // Among active: higher grade wins; tie → lower id
    const rankEx = gradeRank(ex);
    const rankC  = gradeRank(coin);
    if (rankC > rankEx || (rankC === rankEx && coin.id < ex.id)) {
      repById.set(coin.group_id, coin);
    }
  }
  const seen = new Set();
  return coins.filter(coin => {
    if (!coin.group_id) return true;
    if (repById.get(coin.group_id) !== coin) return false;
    if (seen.has(coin.group_id)) return false;
    seen.add(coin.group_id);
    return true;
  });
}

function getGroupMemberCount(groupId) {
  const entry = groupIndex.get(groupId);
  return entry ? entry.count : 0;
}

// ── Badge "NUEVO" ───────────────────────────────────────────────────────────
// Una moneda se considera nueva durante NEW_BADGE_DAYS días desde publishedAt
// (la constante vive en common.js). Sin publishedAt (todo el catálogo viejo) no
// lleva badge, y el badge se apaga solo al vencer la ventana — no hay nada que
// limpiar a mano.
function isNewCoin(coin) {
  if (!coin || !coin.publishedAt) return false;
  if (coin.status === 'sold') return false; // el ribbon VENDIDO manda
  const ts = Date.parse(coin.publishedAt);
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) < NEW_BADGE_DAYS * 86400000;
}

// Un grupo se marca como nuevo si cualquiera de sus variantes lo es.
function isNewGroup(groupId) {
  const entry = groupIndex.get(groupId);
  return entry ? entry.isNew : false;
}

const CATEGORY_PREDICATES = {
  // "Ingresos" = lo publicado en los últimos NEW_BADGE_DAYS días. Misma regla que
  // el badge "NUEVO" de la grilla (ver renderCoins), así el filtro y el badge
  // nunca se contradicen.
  ingresos:        (c) => (c.group_id ? isNewGroup(c.group_id) : isNewCoin(c)),
  plata:           isInvestment,
  argentina:       isArgentinaCoin,
  internacional:   (c) => !isArgentinaCoin(c) && !isMedalOrToken(c) && !isBlister(c) && !isBook(c) && !isInsumo(c),
  // "Varios" es el cajón de lo que no es moneda de colección corriente:
  // medallas, tokens, libros, blísters y lotes, todo bajo un mismo botón.
  varios:          (c) => isMedalOrToken(c) || isBook(c) || isBlister(c),
  economicas:      isEconomica,
  insumos:         isInsumo,
};

// Claves que ya no existen pero pueden venir de un sessionStorage viejo o de un
// link compartido (?cat=blisters). Sin esto el catálogo abre con una categoría
// que ningún botón reconoce: filtra, pero no hay forma de sacarla.
const LEGACY_CATEGORY_KEYS = {
  inversion:         'plata',
  blisters:          'varios',
  'medallas-libros': 'varios',
};

// ─── Sub-filter helpers ───────────────────────────────────────────────────────

/**
 * Returns an array of { label, value, subtitle?, match? } option specs for the
 * contextual dropdown. Applies the critical data rule: options with 0 matching
 * items are omitted so users never hit an empty result page.
 */
function getSubFilterOptions(category) {
  switch (category) {
    case 'argentina': {
      const pool = allCoins.filter(isArgentinaCoin);
      const specs = [
        { label: 'República',               value: 'República',               subtitle: '1881 – actualidad', country: 'Argentina' },
        { label: 'Buenos Aires',             value: 'Bs As',                   subtitle: '1822 – 1861',       country: 'Argentina - Buenos Aires' },
        { label: 'Confederación',           value: 'Confederación Argentina',  subtitle: '1854',              country: 'Argentina - Confed. Arg.' },
        { label: 'Patria',                  value: 'Patria',                  subtitle: '1813 – 1815',       country: 'Argentina - Patria' },
      ];
      return specs.filter(s => pool.some(c => normalizeCountryValue(c.country) === s.country));
    }

    case 'internacional': {
      const pool = allCoins.filter(CATEGORY_PREDICATES.internacional);
      const countries = [...new Set(pool.map(c => c.country).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es')
      );
      return countries.map(c => ({ label: c, value: c }));
    }

    case 'plata': {
      const pool = allCoins.filter(isInvestment);
      const specs = [
        { label: '.9999', value: '9999',  match: c => getSilverPurity(c) === 9999 },
        { label: '.999',  value: '999',   match: c => getSilverPurity(c) === 999  },
        { label: '.925',  value: '925',   match: c => getSilverPurity(c) === 925  },
        { label: '.900',  value: '900',   match: c => getSilverPurity(c) === 900  },
        { label: 'Lotes', value: 'lotes', match: isLotePlata                      },
      ];
      return specs.filter(s => pool.some(s.match));
    }

    case 'varios': {
      const pool = allCoins.filter(CATEGORY_PREDICATES.varios);
      const specs = [
        { label: 'Medallas', value: 'Medallas', match: isMedal       },
        { label: 'Tokens',   value: 'Tokens',   match: isToken       },
        { label: 'Libros',   value: 'Libros',   match: isBook        },
        { label: 'Blisters', value: 'Blisters', match: isBlisterOnly },
        { label: 'Lotes',    value: 'Lotes',    match: isLoteVario   },
      ];
      return specs.filter(s => pool.some(s.match));
    }

    default:
      return null; // economicas e insumos no se sub-dividen
  }
}

function matchesSubFilter(coin, category, subFilter) {
  switch (category) {
    case 'argentina': {
      const mapped = ARGENTINA_SUB_MAP[subFilter];
      return mapped ? normalizeCountryValue(coin.country) === mapped : false;
    }
    case 'internacional':
      return coin.country === subFilter;
    case 'plata':
      if (subFilter === 'lotes') return isLotePlata(coin);
      return getSilverPurity(coin) === parseInt(subFilter, 10);
    case 'varios':
      if (subFilter === 'Medallas') return isMedal(coin);
      if (subFilter === 'Tokens')   return isToken(coin);
      if (subFilter === 'Libros')   return isBook(coin);
      if (subFilter === 'Blisters') return isBlisterOnly(coin);
      if (subFilter === 'Lotes')    return isLoteVario(coin);
      return true;
    default:
      return true;
  }
}

/**
 * Builds (or rebuilds) the contextual dropdown beneath the active category
 * button. Pass restoredSubFilter to re-activate a persisted selection.
 */
function buildSubFilterBar(category, restoredSubFilter = null) {
  subFilterList.innerHTML = '';
  activeSubFilter = null;

  // Clear layout modifier classes from previous category
  subFilterBar.classList.remove('sub-filter-bar--vertical');
  subFilterList.classList.remove('sub-filter-list--vertical');

  const options = getSubFilterOptions(category);

  if (!options || options.length === 0) {
    subFilterBar.classList.remove('is-open');
    return;
  }

  // Argentina + Internacional → vertical scrollable list
  const isVertical = category === 'internacional' || category === 'argentina';
  if (isVertical) {
    subFilterBar.classList.add('sub-filter-bar--vertical');
    subFilterList.classList.add('sub-filter-list--vertical');
  }

  // Inversión (plata) → prepend static "Pureza de la plata" label
  if (category === 'plata') {
    const labelEl = document.createElement('span');
    labelEl.className = 'sub-filter-purity-label';
    labelEl.textContent = 'Pureza de la plata';
    subFilterList.appendChild(labelEl);
  }

  options.forEach(({ label, value, subtitle }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sub-filter-btn';
    btn.dataset.value = value;

    if (isVertical) btn.classList.add('sub-filter-btn--vertical');

    if (subtitle) {
      // Argentina: name on left, date on right — all inside the button
      btn.classList.add('sub-filter-btn--row');
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const dateEl = document.createElement('span');
      dateEl.className = 'sub-filter-btn-date';
      dateEl.textContent = subtitle;
      btn.appendChild(labelEl);
      btn.appendChild(dateEl);
    } else {
      btn.textContent = label;
    }

    if (value === restoredSubFilter) {
      btn.classList.add('is-active');
      activeSubFilter = value;
    }

    btn.addEventListener('click', () => {
      const wasActive = activeSubFilter === value;
      activeSubFilter = wasActive ? null : value;
      subFilterList.querySelectorAll('.sub-filter-btn').forEach(b =>
        b.classList.toggle('is-active', b.dataset.value === activeSubFilter)
      );
      applyFilters();
    });

    subFilterList.appendChild(btn);
  });

  subFilterBar.classList.add('is-open');
}

function closeSubFilterBar() {
  subFilterBar.classList.remove('is-open', 'sub-filter-bar--vertical');
  subFilterList.classList.remove('sub-filter-list--vertical');
  subFilterList.innerHTML = '';
  activeSubFilter = null;
}

// ─── Landing / Catalog view ───────────────────────────────────────────────────

function showLanding() {
  document.body.dataset.view = 'landing';
}

function showCatalog() {
  document.body.dataset.view = 'catalog';
}

/**
 * Cambio de vista con transición: la vista saliente se funde, se aplica el
 * cambio con las dos vistas invisibles (la entrante todavía en display:none, así
 * que renderizar la grilla acá no parpadea) y la entrante sube escalonada de
 * arriba hacia abajo — cabecera, categorías, buscador y monedas.
 *
 * Solo lo usan los saltos que dispara el usuario. La restauración de
 * back/forward sigue llamando a showCatalog() directo: ahí la animación
 * arruinaría la restauración del scroll.
 */
const VIEW_FADE_MS  = 180;
const VIEW_ENTER_MS = 600;

// Token de generación: dos toques rápidos (portada → categoría → otra categoría)
// lanzaban dos transiciones encimadas, y los timers de la primera apagaban a
// mitad de camino a la segunda — incluida la limpieza del transform del logo,
// que dejaba el logotipo torcido. Cada transición nueva invalida la anterior.
let viewTransitionToken = 0;
let viewFadeTimer  = null;
let viewEnterTimer = null;

function switchView(apply) {
  if (prefersReducedMotion()) { apply(); return; }

  viewTransitionToken += 1;
  const myToken = viewTransitionToken;

  clearTimeout(viewFadeTimer);
  clearTimeout(viewEnterTimer);

  document.body.classList.add('is-view-leaving');
  viewFadeTimer = setTimeout(() => {
    if (myToken !== viewTransitionToken) return;
    document.body.classList.remove('is-view-leaving');
    morphLogo(apply, myToken);
    document.body.classList.add('is-view-entering');
    viewEnterTimer = setTimeout(() => {
      if (myToken !== viewTransitionToken) return;
      document.body.classList.remove('is-view-entering');
    }, VIEW_ENTER_MS);
  }, VIEW_FADE_MS);
}

// ─── Vuelo del logo entre vistas (FLIP) ───────────────────────────────────────
//
// El monograma y el logotipo son el MISMO nodo en las dos vistas: la portada los
// apila centrados y grandes, el catálogo los pone en fila, chicos, en la franja
// fija. Sin esto el salto es instantáneo y no se lee como un recorrido.
//
// Se miden las dos posiciones reales (antes y después del cambio de vista), se
// aplica la transformada que devuelve el elemento a donde estaba y se la deja
// caer a la identidad. Medir en vez de escribir los valores a mano es lo que
// hace que funcione igual en los tres breakpoints sin duplicar ni un clamp.

const LOGO_MORPH_MS    = 620;
const LOGO_MORPH_EASE  = 'cubic-bezier(0.22, 1, 0.36, 1)';
let logoMorphCleanupTimer = null;

/**
 * Caja que envuelve a varios rects. Se usa para el h1: en móvil su caja es un
 * flex del ancho del contenedor en la portada y una caja ajustada al texto en el
 * catálogo, así que medir el borde del h1 daría una escala y un desplazamiento
 * disparatados. Los spans del texto sí son consistentes en las dos vistas.
 */
function unionRect(nodes) {
  const rects = nodes.map(n => n.getBoundingClientRect());
  const left   = Math.min(...rects.map(r => r.left));
  const top    = Math.min(...rects.map(r => r.top));
  const right  = Math.max(...rects.map(r => r.right));
  const bottom = Math.max(...rects.map(r => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

function morphLogo(apply, token) {
  const header   = document.querySelector('.site-header');
  const monogram = header && header.querySelector('.np-monogram');
  const title    = header && header.querySelector('h1');
  const spans    = title ? [...title.querySelectorAll('.h1-numismatica, .h1-popper')] : [];

  if (!monogram || !title || !spans.length) { apply(); return; }

  // El elemento que se transforma y el que sirve de referencia para medir no son
  // necesariamente el mismo (ver unionRect).
  const parts = [
    { el: monogram, anchor: [monogram] },
    { el: title,    anchor: spans      },
  ];

  parts.forEach(p => {
    p.el.style.transition = 'none';
    p.el.style.transform  = '';
    p.firstAnchor = unionRect(p.anchor);
  });

  apply();

  parts.forEach(p => {
    p.lastAnchor = unionRect(p.anchor);
    p.lastOrigin = p.el.getBoundingClientRect();
  });

  let animating = false;

  parts.forEach(p => {
    const first = p.firstAnchor;
    const last  = p.lastAnchor;
    if (!first.height || !last.height) return;

    // Escala uniforme sacada del alto: el tracking del logotipo pasa de .2em a
    // .14em, así que la relación de anchos deformaría el texto a lo alto.
    const s = first.height / last.height;

    // transform-origin es la esquina del elemento, que no coincide con el ancla
    // medida — hay que componer el desplazamiento alrededor de ese origen.
    const ox = p.lastOrigin.left;
    const oy = p.lastOrigin.top;
    const tx = first.left - (ox + s * (last.left - ox));
    const ty = (first.top + first.height / 2)
             - (oy + s * (last.top + last.height / 2 - oy));

    // Sub-píxel: no vale la pena animar un salto invisible.
    if (Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5 && Math.abs(s - 1) < 0.005) return;

    p.el.style.transformOrigin = '0 0';
    p.el.style.willChange      = 'transform';
    p.el.style.transform       = `translate(${tx}px, ${ty}px) scale(${s})`;
    p.pending = true;
    animating = true;
  });

  if (!animating) {
    parts.forEach(p => clearMorphStyles(p.el));
    return;
  }

  document.body.classList.add('is-logo-morphing');

  // Doble rAF: el primero deja que el navegador registre el estado invertido, el
  // segundo estrena la transición. Con uno solo el motor colapsa los dos estilos
  // en el mismo frame y no hay animación.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (token !== undefined && token !== viewTransitionToken) return;
    parts.forEach(p => {
      if (!p.pending) return;
      p.el.style.transition = `transform ${LOGO_MORPH_MS}ms ${LOGO_MORPH_EASE}`;
      p.el.style.transform  = 'none';
    });
  }));

  // Un transform inline que quede pegado convierte al h1 en containing block y
  // rompe el sticky de la cabecera: la limpieza no es opcional. Pero si mientras
  // tanto arrancó otra transición, este timer limpiaría el transform de ESA
  // animación a mitad de camino — por eso el token.
  clearTimeout(logoMorphCleanupTimer);
  logoMorphCleanupTimer = setTimeout(() => {
    if (token !== undefined && token !== viewTransitionToken) return;
    parts.forEach(p => clearMorphStyles(p.el));
    document.body.classList.remove('is-logo-morphing');
  }, LOGO_MORPH_MS + 120);
}

function clearMorphStyles(el) {
  el.style.transition      = '';
  el.style.transform       = '';
  el.style.transformOrigin = '';
  el.style.willChange      = '';
}

function goToLanding() {
  switchView(() => {
    searchInput.value = '';
    clearSearchBtn.classList.remove('is-visible');
    clearTimeout(searchDebounceId);
    activeCategory  = null;
    activeSubFilter = null;
    // El orden también vuelve al de fábrica: si no, reentrar al catálogo lo
    // dejaba ordenado por un criterio que el usuario no volvió a pedir.
    activeSort = 'alfabetico';
    sortDirections = { alfabetico: 'asc', precio: 'asc', antiguedad: 'asc' };
    syncSortUI();
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('is-active'));
    closeSubFilterBar();
    closeSortMenu();
    try { sessionStorage.removeItem(STATE_KEY); } catch (_) {}
    showLanding();
    stopHeaderMuteObserver();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

function enterCatalog(categoryKey) {
  switchView(() => {
    showCatalog();
    activeCategory  = categoryKey || null;
    activeSubFilter = null;
    document.querySelectorAll('.cat-btn').forEach(b =>
      b.classList.toggle('is-active', b.dataset.category === activeCategory)
    );
    if (activeCategory) {
      buildSubFilterBar(activeCategory);
    } else {
      closeSubFilterBar();
    }
    closeSortMenu();
    saveState(0);
    renderCoins(getFilteredCoins());
    initRevealEffects();
    window.scrollTo({ top: 0, behavior: 'instant' });
    scheduleHeaderMuteObserver();
  });
}

// ─── State persistence ────────────────────────────────────────────────────────

function saveState(scrollY = null) {
  const state = {
    view:      document.body.dataset.view || 'landing',
    category:  activeCategory,
    subFilter: activeSubFilter,
    search:    searchInput.value,
    sort:      activeSort,
    sortDirs:  sortDirections,
  };
  if (scrollY !== null) {
    state.scrollY = scrollY;
  } else {
    try {
      const existing = JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}');
      if (existing.scrollY) state.scrollY = existing.scrollY;
    } catch (_) {}
  }
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {}
}

function loadSavedState() {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch (_) { return null; }
}

function isBackForwardNavigation() {
  const entries = performance.getEntriesByType('navigation');
  if (entries.length > 0) return entries[0].type === 'back_forward';
  return performance.navigation?.type === 2;
}

function isReloadNavigation() {
  const entries = performance.getEntriesByType('navigation');
  if (entries.length > 0) return entries[0].type === 'reload';
  return performance.navigation?.type === 1;
}

function applyRestoredState(state) {
  // Categorías renombradas: 'inversion' → 'plata', y 'blisters' /
  // 'medallas-libros' → 'varios' (ver LEGACY_CATEGORY_KEYS).
  if (LEGACY_CATEGORY_KEYS[state.category]) state.category = LEGACY_CATEGORY_KEYS[state.category];

  if (state.search) {
    searchInput.value = state.search;
    clearSearchBtn.classList.toggle('is-visible', state.search.length > 0);
  }

  if (state.category) {
    activeCategory = state.category;
    document.querySelectorAll('.cat-btn').forEach(b =>
      b.classList.toggle('is-active', b.dataset.category === state.category)
    );
    buildSubFilterBar(state.category, state.subFilter || null);
  }

  // El orden vuelve como estaba al entrar a la ficha de la moneda. Se validan
  // las claves: un sessionStorage viejo o tocado a mano no debe dejar la grilla
  // ordenada por un criterio inexistente.
  if (SORT_KEYS.includes(state.sort)) activeSort = state.sort;
  if (state.sortDirs) {
    SORT_KEYS.forEach(key => {
      if (state.sortDirs[key] === 'asc' || state.sortDirs[key] === 'desc') {
        sortDirections[key] = state.sortDirs[key];
      }
    });
  }
  syncSortUI();

  return renderCoins(getFilteredCoins(), true);
}

// ─── Data loading ─────────────────────────────────────────────────────────────

// El catálogo se pide con la caché normal del navegador, NO con `no-store`.
// GitHub Pages lo sirve con ETag y `max-age=600`: dentro de esos 10 minutos el
// fetch resuelve desde disco sin tocar la red, y después revalida con un 304 de
// ~200 bytes. Con `no-store` cada ida y vuelta al detalle re-descargaba los
// 353 KB enteros — era el costo más alto de toda la navegación.
async function loadCoins() {
  try {
    const response = await fetch('coins.json');
    if (!response.ok) throw new Error('No se pudo cargar coins.json');
    const data = await response.json();
    allCoins = Array.isArray(data) ? data : [];
    prepareCoins();
    buildGroupIndex();
    return true;
  } catch (error) {
    console.error(error);
    coinsGrid.innerHTML =
      '<div class="empty-state">No se pudieron cargar las monedas. Revisá que exista el archivo <strong>coins.json</strong>.</div>';
    resultsCount.textContent = 'Error al cargar monedas';
    return false;
  }
}

// ─── Filtering ────────────────────────────────────────────────────────────────

const SEARCH_ALIASES = {
  'usa':        'estados unidos',
  'eeuu':       'estados unidos',
  'uk':         'reino unido',
  'urss':       'union sovietica',
  'insumo':     'insumos',
  'sobres':     'sobre',
  'carpetas':   'carpeta',
  'folios':     'folio',
  'carton':     'cartoncito',
  'cartones':   'cartoncito',
};

function stripAccents(str) {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeSearch(str) {
  return stripAccents(String(str || '').trim().toLowerCase());
}

// El texto sobre el que busca el usuario se arma UNA vez al cargar el catálogo.
// Antes se reconstruía dentro del filter, así que cada tecla disparaba ~800
// `String.normalize('NFD')` + regex Unicode sobre 11 campos. Es lo que hacía que
// escribir en el buscador se sintiera pegajoso.
function prepareCoins() {
  for (const coin of allCoins) {
    coin._searchText = normalizeSearch([
      coin.title, getCountryDisplayLabel(coin.country), coin.country,
      coin.metal, coin.year, coin.price, coin.description,
      coin.reference, coin.grade, coin.grade_short, coin.mintage,
    ].filter(Boolean).join(' '));
  }
}

function getFilteredCoins() {
  const raw = normalizeSearch(searchInput.value);
  const searchTerm = SEARCH_ALIASES[raw] || raw;

  return allCoins.filter((coin) => {
    // Manually hidden items (e.g. retired subsets) — kept in data, never shown
    if (coin.hidden) return false;

    // Auto-hide sold items whose 30-day visibility window has closed
    if (isSoldExpired(coin)) return false;

    if (activeCategory) {
      const predicate = CATEGORY_PREDICATES[activeCategory];
      if (predicate && !predicate(coin)) return false;
    } else {
      // Default view: hide books and medals/tokens when no search term is entered
      // Los insumos van en la misma bolsa: no son monedas, no entran en "Ver
      // todas". Va dentro del `!searchTerm` a propósito, para que buscar
      // "folio" o "insumos" los siga encontrando.
      if (!searchTerm && (isBook(coin) || isMedalOrToken(coin) || isInsumo(coin))) return false;
    }

    if (activeSubFilter && activeCategory) {
      if (!matchesSubFilter(coin, activeCategory, activeSubFilter)) return false;
    }

    if (searchTerm && !(coin._searchText || '').includes(searchTerm)) return false;

    return true;
  });
}

// ─── Accesos a "Ingresos" ─────────────────────────────────────────────────────

/**
 * Cuenta las piezas tal como se van a ver en la grilla: descarta ocultas y
 * vendidas vencidas, aplica el predicado y colapsa los grupos igual que
 * renderCoins, para no contar variantes que después se muestran como una sola.
 */
function countCoinsFor(predicate) {
  const pool = allCoins.filter((coin) =>
    !coin.hidden && !isSoldExpired(coin) && predicate(coin)
  );
  return collapseGroups(pool).length;
}

/**
 * Regla del proyecto: nunca ofrecer un filtro que lleva a una grilla vacía.
 * Si esta semana no entró nada, el acceso de Ingresos no se muestra. Vive solo
 * en la portada. Se llama recién con allCoins cargado.
 */
function hydrateIngresosEntries() {
  const el = document.getElementById('landingIngresos');
  if (el) el.hidden = countCoinsFor(CATEGORY_PREDICATES.ingresos) === 0;
}

// ─── Rendering ────────────────────────────────────────────────────────────────
//
// getPrimaryImage, thumbFor, getGradeShort y attachImgRetry viven en common.js:
// la ficha de detalle usa exactamente las mismas.

function goToDetail(coinId) {
  saveState(window.scrollY);
  window.location.href = `detalle.html?id=${coinId}`;
}

const ARGENTINA_SUBSECTION_ORDER = {
  'Argentina - Patria':       1,
  'Argentina - Confed. Arg.': 2,
  'Argentina - Buenos Aires': 3,
  'Argentina':                4,
};

function getFaceValue(title) {
  const m = String(title || '').match(/^(\d+(?:\.\d+)?)\s/);
  return m ? parseFloat(m[1]) : 1;
}

// splitCoinTitle y applyCoinTitle viven en common.js (las comparte la ficha).

// Comparador histórico del catálogo: es lo que el menú llama "Alfabético", el
// orden por defecto. Se deja intacto — los criterios nuevos se apoyan en él
// para desempatar, así dos monedas del mismo precio o del mismo año siguen
// saliendo en el orden de siempre.
//
// El colador se instancia UNA vez: `localeCompare(x, 'es')` dentro del
// comparador reconstruía la tabla de intercalación en cada una de las ~4.000
// comparaciones de un sort de 448 elementos. Mismo resultado, mucho más barato.
const COUNTRY_COLLATOR = new Intl.Collator('es');

function compareAlfabetico(a, b) {
  // Inversión view: Lote Plata first, then by purity descending, then year
  if (activeCategory === 'plata') {
    const lotA = isLotePlata(a) ? 0 : 1;
    const lotB = isLotePlata(b) ? 0 : 1;
    if (lotA !== lotB) return lotA - lotB;
    const purA = getSilverPurity(a);
    const purB = getSilverPurity(b);
    if (purA !== purB) return purB - purA;
    return (Number(a.year) || 0) - (Number(b.year) || 0);
  }

  // Default: country A→Z, Argentina subsections, year ascending, face value ascending
  const normA = normalizeCountryValue(a.country);
  const normB = normalizeCountryValue(b.country);
  const groupA = ARGENTINA_GROUP_VALUES.has(normA) ? 'Argentina' : normA;
  const groupB = ARGENTINA_GROUP_VALUES.has(normB) ? 'Argentina' : normB;

  // 1. Country alphabetically (A → Z)
  const byCountry = COUNTRY_COLLATOR.compare(groupA, groupB);
  if (byCountry !== 0) return byCountry;

  // 2. Argentina: subsection order (Patria → Confed. → Bs As → República)
  if (groupA === 'Argentina') {
    const subA = ARGENTINA_SUBSECTION_ORDER[normA] ?? 4;
    const subB = ARGENTINA_SUBSECTION_ORDER[normB] ?? 4;
    if (subA !== subB) return subA - subB;
  }

  // 3. Year ascending (oldest first)
  const yearA = Number(a.year) || 0;
  const yearB = Number(b.year) || 0;
  if (yearA !== yearB) return yearA - yearB;

  // 4. Face value ascending (numeric prefix of title; 1 if none)
  return getFaceValue(a.title) - getFaceValue(b.title);
}

/**
 * Precio de la tarjeta tal como se muestra. Una tarjeta de grupo representa a
 * varias variantes y no muestra precio propio: la ordena el mínimo del grupo,
 * que es el número con el que el cliente la evalúa.
 */
function sortPriceValue(coin) {
  if (coin.group_id) {
    const g = groupIndex.get(coin.group_id);
    // `count > 0` = el grupo tiene al menos una variante disponible. Si están
    // todas vendidas no hay precio de grupo y manda el precio propio de la
    // moneda, que es lo que la tarjeta muestra.
    if (g && g.count > 0) return g.minVal;
  }
  return parsePriceUSD(coin.price); // Infinity si no hay precio legible
}

// Hay 7 monedas con año "S/F"/"N/A"/vacío y algunas sin año: no tienen lugar en
// una línea de tiempo, así que van al final en los dos sentidos.
function sortYearValue(coin) {
  const y = Number(coin.year);
  return Number.isFinite(y) && y > 0 ? y : null;
}

/**
 * Ordena según el criterio elegido en el menú "Orden".
 *
 * 'alfabetico' es el orden de siempre; en 'desc' se invierte el array entero,
 * que es el espejo exacto de lo que el usuario ve (Z→A). Los otros dos criterios
 * comparan su valor y caen en compareAlfabetico al empatar. Los registros sin
 * dato utilizable quedan siempre al final, nunca al principio.
 */
function sortCoins(coins) {
  const dir  = sortDirections[activeSort] === 'desc' ? -1 : 1;
  const list = [...coins];

  if (activeSort === 'precio') {
    return list.sort((a, b) => {
      const pa = sortPriceValue(a);
      const pb = sortPriceValue(b);
      const okA = Number.isFinite(pa);
      const okB = Number.isFinite(pb);
      if (okA !== okB) return okA ? -1 : 1;
      if (okA && pa !== pb) return (pa - pb) * dir;
      return compareAlfabetico(a, b);
    });
  }

  if (activeSort === 'antiguedad') {
    return list.sort((a, b) => {
      const ya = sortYearValue(a);
      const yb = sortYearValue(b);
      if ((ya === null) !== (yb === null)) return ya === null ? 1 : -1;
      if (ya !== null && ya !== yb) return (ya - yb) * dir;
      return compareAlfabetico(a, b);
    });
  }

  list.sort(compareAlfabetico);
  return dir === -1 ? list.reverse() : list;
}

// Construye UNA tarjeta. No engancha ningún listener: todo lo que la tarjeta
// hace (abrir la ficha, mover el carrusel, reintentar una foto rota) lo atiende
// la delegación de más abajo. Antes eran 8 listeners por tarjeta, o sea ~3.500
// creados y destruidos en cada búsqueda.
function buildCoinCard(coin, idx, skipAnimation) {
  const card = coinCardTemplate.content.cloneNode(true);

  const article   = card.querySelector('.coin-card');
  const imageWrap = card.querySelector('.coin-image-wrap');
  const image     = card.querySelector('.coin-image');
  const title     = card.querySelector('.coin-title');
  const yearTag   = card.querySelector('.coin-year-tag');
  const meta      = card.querySelector('.coin-meta');
  const badgeRow  = card.querySelector('.coin-badge-row');
  const price     = card.querySelector('.coin-price');

  article.dataset.coinId = coin.id;
  if (skipAnimation) article.classList.remove('reveal');

  // Las primeras tarjetas van eager y con prioridad; el resto lazy, así el
  // navegador solo baja lo que el usuario alcanza scrolleando.
  if (idx < 4) {
    image.loading = 'eager';
    image.fetchPriority = idx < 2 ? 'high' : 'auto';
  } else {
    image.loading = 'lazy';
    image.fetchPriority = 'low';
  }

  // El grid usa la miniatura WebP; el original queda en data-fullSrc como
  // fallback si la miniatura no existiera (lo consume handleImgError).
  const primaryFull = getPrimaryImage(coin);
  if (primaryFull) {
    image.dataset.fullSrc = primaryFull;
    image.src = thumbFor(primaryFull);
    image.alt = coin.title || 'Moneda';
  } else {
    // Hay monedas publicadas todavía sin fotos. Sin esto el navegador dibuja el
    // ícono de imagen rota, que es peor que un hueco prolijo.
    image.remove();
    imageWrap.classList.add('is-photoless');
  }

  if (coin.group_id) {
    article.classList.add('is-group');
    applyCoinTitle(title, coin.group_label || coin.title);
    yearTag.textContent = '';
    const count = getGroupMemberCount(coin.group_id);
    price.style.display = 'none'; // se oculta para que badgeRow quede centrado
    badgeRow.innerHTML = count > 1
      ? `<span class="coin-grade-badge">${count} variantes</span>`
      : (count === 1 ? '<span class="coin-grade-badge">1 variante</span>' : '');
  } else {
    article.classList.remove('is-group');
    applyCoinTitle(title, coin.title || 'Sin título');
    yearTag.textContent = coin.year || '';
    price.style.display = 'block';
    if (coin.original_price) {
      price.innerHTML = `<span class="price-original">${escapeHTML(coin.original_price)}</span><span class="price-current">${escapeHTML(coin.price)}</span>`;
    } else {
      price.textContent = coin.price || 'Consultar';
    }
    const grade = getGradeShort(coin);
    badgeRow.innerHTML = grade ? `<span class="coin-grade-badge">${escapeHTML(grade)}</span>` : '';
  }

  meta.textContent = getCountryDisplayLabel(coin.country);

  // ── Vendida ────────────────────────────────────────────────────────────────
  if (coin.status === 'sold') {
    article.classList.add('is-sold');

    const ribbon = document.createElement('div');
    ribbon.className = 'sold-ribbon';
    ribbon.textContent = 'VENDIDO';
    imageWrap.appendChild(ribbon);

    price.textContent = 'VENDIDO';
    price.classList.add('is-sold-price');
    price.style.display = 'block';
  }

  // ── Badge "NUEVO" ──────────────────────────────────────────────────────────
  if (coin.group_id ? isNewGroup(coin.group_id) : isNewCoin(coin)) {
    const newTag = document.createElement('span');
    newTag.className = 'new-badge';
    newTag.textContent = 'Nuevo';
    imageWrap.appendChild(newTag);
  }

  // ── Carrusel ───────────────────────────────────────────────────────────────
  const images = getImagesArray(coin);
  if (images.length > 1) {
    article.dataset.idx = '0';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'card-arrow card-arrow--prev';
    prevBtn.setAttribute('aria-label', 'Imagen anterior');
    prevBtn.innerHTML = SVG_CHEVRON_LEFT;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'card-arrow card-arrow--next';
    nextBtn.setAttribute('aria-label', 'Imagen siguiente');
    nextBtn.innerHTML = SVG_CHEVRON_RIGHT;

    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'card-dots';
    images.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'card-dot' + (i === 0 ? ' is-active' : '');
      dotsWrap.appendChild(dot);
    });

    imageWrap.appendChild(prevBtn);
    imageWrap.appendChild(nextBtn);
    imageWrap.appendChild(dotsWrap);

    if (idx < 4) preloadCarousel(article, coin);
  }

  return card;
}

// ── Carrusel: operaciones sueltas, sin closures por tarjeta ──────────────────
//
// El índice actual vive en `data-idx` y el token anti-carrera en `data-swap`,
// así una tarjeta no necesita retener nada en memoria entre clicks.

function preloadCarousel(article, coin) {
  if (article.dataset.preloaded === '1') return;
  article.dataset.preloaded = '1';
  getImagesArray(coin).forEach((src, i) => {
    if (i > 0) { const p = new Image(); p.src = thumbFor(src); }
  });
}

// Decodifica la foto destino fuera de pantalla antes de cambiar la <img>
// visible, así el cambio ocurre en un solo paso y sin parpadeo. Los puntitos se
// actualizan enseguida para dar respuesta inmediata mientras decodifica. El
// token protege contra swaps fuera de orden al tocar rápido.
function stepCarousel(article, delta) {
  const coin = renderedCoinsById.get(Number(article.dataset.coinId));
  if (!coin) return;
  const images = getImagesArray(coin);
  if (images.length < 2) return;

  const current = Number(article.dataset.idx || 0);
  const next = ((current + delta) % images.length + images.length) % images.length;
  article.dataset.idx = String(next);

  article.querySelectorAll('.card-dot').forEach((dot, i) =>
    dot.classList.toggle('is-active', i === next)
  );

  const image = article.querySelector('.coin-image');
  if (!image) return;

  const targetFull = images[next];
  const targetSrc  = thumbFor(targetFull);
  image.dataset.fullSrc = targetFull; // fallback si falta la miniatura
  // El reintento arranca de cero para la foto nueva.
  delete image.dataset.triedOriginal;
  delete image.dataset.retryTries;

  const myToken = String(Number(article.dataset.swap || 0) + 1);
  article.dataset.swap = myToken;

  const pre = new Image();
  pre.src = targetSrc;
  const apply = () => { if (article.dataset.swap === myToken) image.src = targetSrc; };
  if (pre.decode) {
    pre.decode().then(apply).catch(apply);
  } else if (pre.complete) {
    apply();
  } else {
    pre.onload = apply;
    pre.onerror = apply;
  }
}

/**
 * Render de la grilla.
 *
 * Las primeras RENDER_FIRST_BATCH tarjetas se montan sincrónicas (son las que
 * el usuario ve) y el resto en tandas por frame. Antes se construían las 448 de
 * una: ~9.400 nodos en un solo tick, y encima en `enterCatalog` eso caía JUSTO
 * entre las dos mediciones del FLIP del logo, forzando un layout completo en el
 * momento más caro de la transición. `content-visibility: auto` ya se ocupa del
 * pintado; esto reparte la construcción.
 */
// Devuelve una promesa que se resuelve cuando TODAS las tarjetas están en el
// DOM. La restauración de scroll depende de eso: si se hace scrollTo con solo
// las primeras 48 montadas, la página todavía no mide lo suficiente y el
// navegador recorta el salto (se quedaba 250–500px más arriba).
const RENDER_FIRST_BATCH = 48;
const RENDER_CHUNK       = 96;
let renderToken = 0;

/**
 * La frase de bienvenida de Insumos vive únicamente detrás de ese botón. Se
 * sincroniza desde renderCoins porque es el único punto por el que pasan TODOS
 * los caminos de pintado —applyFilters, enterCatalog, applyRestoredState y el
 * arranque por ?cat=—, así no hay forma de que quede desfasada.
 */
function syncInsumosIntro() {
  const el = document.getElementById('insumosIntro');
  if (el) el.hidden = activeCategory !== 'insumos';
}

function renderCoins(coins, skipAnimation = false) {
  syncInsumosIntro();

  // Invalida cualquier tanda pendiente de un render anterior (ej. el usuario
  // siguió tecleando antes de que terminara de dibujarse la búsqueda previa).
  renderToken += 1;
  const myToken = renderToken;

  coinsGrid.innerHTML = '';
  renderedCoinsById = new Map();

  if (!coins.length) {
    coinsGrid.innerHTML =
      '<div class="empty-state">No hay monedas que coincidan con los filtros seleccionados.</div>';
    resultsCount.textContent = '0 monedas encontradas';
    return Promise.resolve();
  }

  // Primero se colapsan los grupos y recién después se ordena: así el criterio
  // se aplica sobre las tarjetas que realmente se ven y no sobre variantes que
  // después desaparecen. collapseGroups elige el representante por grado e id,
  // sin depender del orden de entrada, así que el orden por defecto no cambia.
  const displayCoins = sortCoins(collapseGroups(coins));
  displayCoins.forEach(coin => renderedCoinsById.set(Number(coin.id), coin));

  const displayCount = displayCoins.length;
  resultsCount.textContent = `${displayCount} ${displayCount === 1 ? 'ítem encontrado' : 'ítems encontrados'}`;

  const appendRange = (from, to) => {
    const fragment = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      fragment.appendChild(buildCoinCard(displayCoins[i], i, skipAnimation));
    }
    coinsGrid.appendChild(fragment);
  };

  const firstCount = Math.min(RENDER_FIRST_BATCH, displayCount);
  appendRange(0, firstCount);

  if (firstCount >= displayCount) return Promise.resolve();

  return new Promise((resolve) => {
    const pump = (from) => {
      if (myToken !== renderToken) { resolve(); return; } // llegó un render más nuevo
      const to = Math.min(from + RENDER_CHUNK, displayCount);
      appendRange(from, to);
      if (revealObserver) observeRevealItems(coinsGrid.querySelectorAll('.coin-card.reveal:not(.is-visible)'));
      if (to < displayCount) requestAnimationFrame(() => pump(to));
      else resolve();
    };
    requestAnimationFrame(() => pump(firstCount));
  });
}

// ─── Delegación de eventos de la grilla ───────────────────────────────────────
//
// Un listener por tipo sobre #coinsGrid, montado una sola vez, en lugar de ocho
// por tarjeta recreados en cada render.

// Un swipe horizontal termina emitiendo un `click` sintético que sube hasta la
// tarjeta: sin esta bandera, deslizar para ver la otra foto abría la ficha.
let suppressNextCardClick = false;
let touchStartX = 0;
let touchStartY = 0;

function initGridDelegation() {
  // Los eventos `error` no burbujean, pero sí bajan en fase de captura.
  coinsGrid.addEventListener('error', (event) => {
    const img = event.target;
    if (img && img.classList && img.classList.contains('coin-image')) handleImgError(img);
  }, true);

  coinsGrid.addEventListener('click', (event) => {
    const arrow = event.target.closest('.card-arrow');
    if (arrow) {
      event.stopPropagation();
      const article = arrow.closest('.coin-card');
      if (article) stepCarousel(article, arrow.classList.contains('card-arrow--prev') ? -1 : 1);
      return;
    }

    if (suppressNextCardClick) { suppressNextCardClick = false; return; }

    const article = event.target.closest('.coin-card');
    if (!article || article.classList.contains('is-sold')) return;
    goToDetail(Number(article.dataset.coinId));
  });

  coinsGrid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const article = event.target.closest('.coin-card');
    if (!article || article.classList.contains('is-sold')) return;
    event.preventDefault();
    goToDetail(Number(article.dataset.coinId));
  });

  // Las fotos secundarias se precargan al primer hover/toque, no al render:
  // con 448 tarjetas, precargarlas todas serían ~900 pedidos que nadie pidió.
  coinsGrid.addEventListener('mouseenter', (event) => {
    const article = event.target.closest && event.target.closest('.coin-card');
    if (!article) return;
    const coin = renderedCoinsById.get(Number(article.dataset.coinId));
    if (coin) preloadCarousel(article, coin);
  }, true);

  coinsGrid.addEventListener('touchstart', (event) => {
    const article = event.target.closest('.coin-card');
    if (!article) return;
    const coin = renderedCoinsById.get(Number(article.dataset.coinId));
    if (coin) preloadCarousel(article, coin);
    touchStartX = event.changedTouches[0].clientX;
    touchStartY = event.changedTouches[0].clientY;
  }, { passive: true });

  // `passive: true`: este handler nunca llama a preventDefault, y declararlo
  // pasivo evita que el navegador tenga que esperarlo para decidir el scroll.
  coinsGrid.addEventListener('touchend', (event) => {
    const article = event.target.closest('.coin-card');
    if (!article) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;
    // Horizontal de verdad: si el dedo se fue más en vertical, era un scroll.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      suppressNextCardClick = true;
      stepCarousel(article, dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

// ─── Reveal animations ────────────────────────────────────────────────────────

// Observa los elementos que todavía esperan aparecer. NO agrega la clase
// `reveal` a nada: quien construye la tarjeta ya decidió si corresponde
// animarla (en la restauración por back/forward no corresponde), y volver a
// ponerla acá pisaba esa decisión.
function observeRevealItems(items) {
  if (!revealObserver) return;
  items.forEach(item => revealObserver.observe(item));
}

function initRevealEffects() {
  if (revealObserver) revealObserver.disconnect();

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );

  observeRevealItems(document.querySelectorAll('.reveal:not(.is-visible)'));
}

// ─── Barra fija: el modo "estoy dentro de la grilla" ──────────────────────────
//
// El disparador es exacto: el borde de arriba de la grilla pasando por debajo
// de la barra fija. Ni antes ni después. En ese punto pasan las tres cosas a la
// vez — el fondo de la barra se vuelve un poco transparente, el logotipo se va
// a plata y aparece la flecha para subir. Al volver hacia arriba, se deshacen.
//
// Con IntersectionObserver y no con un listener de scroll: sobre una grilla de
// ~450 tarjetas, un handler por frame de scroll es justo lo que hay que evitar.
//
// Se observa #gridTop y no #coinsGrid: la grilla mide >80.000px, siempre está
// cruzada con la pantalla y por lo tanto nunca dejaría de "intersecar". El
// centinela mide 1px y se apoya justo en su borde superior.

let headerMuteObserver = null;
let headerMuteResizeId = null;

function initHeaderMuteObserver() {
  const header  = document.querySelector('.site-header');
  const gridTop = document.getElementById('gridTop');
  if (!header || !gridTop || !('IntersectionObserver' in window)) return;

  if (headerMuteObserver) headerMuteObserver.disconnect();

  // Solo tiene sentido en el catálogo, y además hay que medir la barra ya
  // encogida: en la portada la cabecera es varias veces más alta y el rootMargin
  // saldría mal.
  if (document.body.dataset.view !== 'catalog') return;

  // rootMargin negativo = se sube el borde de arriba de la "pantalla útil"
  // hasta el borde de abajo de la barra fija. Cruzar ese borde ES el disparador.
  headerMuteObserver = new IntersectionObserver(
    ([entry]) => {
      // Comparar contra rootBounds.top y no contra 0: el borde que importa es el
      // de la pantalla ya recortada por el rootMargin, que está a la altura de
      // la barra. Con `< 0` el cambio llegaba tarde, una barra más abajo.
      // El término distingue además "se fue por arriba" de "todavía no llegó
      // desde abajo": con pocos resultados la grilla puede no llenar la pantalla.
      const limite = entry.rootBounds ? entry.rootBounds.top : 0;
      const isPast = !entry.isIntersecting && entry.boundingClientRect.top <= limite;
      document.body.classList.toggle('is-in-grid', isPast);
    },
    { rootMargin: `-${header.offsetHeight}px 0px 0px 0px`, threshold: 0 }
  );

  headerMuteObserver.observe(gridTop);
}

// Se difiere dos frames para que el rootMargin se calcule sobre una cabecera ya
// encogida y con la grilla montada: llamarlo en medio de esos cambios da una
// altura que no es la definitiva y el umbral queda corrido.
function scheduleHeaderMuteObserver() {
  requestAnimationFrame(() => requestAnimationFrame(initHeaderMuteObserver));
}

function stopHeaderMuteObserver() {
  if (headerMuteObserver) {
    headerMuteObserver.disconnect();
    headerMuteObserver = null;
  }
  document.body.classList.remove('is-in-grid');
}

// La barra mide 84px en escritorio y 66px en teléfono: al cambiar de breakpoint
// hay que rehacer el rootMargin, que es un valor fijo en píxeles.
window.addEventListener('resize', () => {
  clearTimeout(headerMuteResizeId);
  headerMuteResizeId = setTimeout(initHeaderMuteObserver, 150);
});

// ─── Apply filters ────────────────────────────────────────────────────────────

// Un cambio de filtro devuelve la grilla al principio, así que el scroll
// guardado deja de valer: se pisa con 0. Antes `saveState()` conservaba el
// scrollY del filtro anterior y, al volver del detalle, saltaba a un offset de
// una grilla que ya no existía.
function applyFilters() {
  renderCoins(getFilteredCoins(), true);
  observeRevealItems(coinsGrid.querySelectorAll('.coin-card.reveal:not(.is-visible)'));
  saveState(0);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Sin debounce, cada tecla rehacía la grilla entera. 150 ms es imperceptible al
// escribir y colapsa una ráfaga de tecleo en un solo render.
const SEARCH_DEBOUNCE_MS = 150;
let searchDebounceId = null;

searchInput.addEventListener('input', () => {
  clearSearchBtn.classList.toggle('is-visible', searchInput.value.length > 0);
  clearTimeout(searchDebounceId);
  searchDebounceId = setTimeout(applyFilters, SEARCH_DEBOUNCE_MS);
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.classList.remove('is-visible');
  clearTimeout(searchDebounceId);
  applyFilters();
  searchInput.focus();
});

// ─── Orden ────────────────────────────────────────────────────────────────────
//
// Cada criterio guarda su propio sentido: tocar el que ya está activo lo da
// vuelta y el panel queda abierto, para que se vea girar la flecha; tocar otro
// lo activa con el sentido que tenía y cierra.

function syncSortUI() {
  if (!sortMenu) return;
  sortMenu.querySelectorAll('.sort-option').forEach(opt => {
    const key = opt.dataset.sort;
    const isActive = key === activeSort;
    opt.classList.toggle('is-active', isActive);
    opt.classList.toggle('is-asc', sortDirections[key] === 'asc');
    opt.setAttribute('aria-selected', String(isActive));
  });
}

function openSortMenu() {
  if (!sortMenu) return;
  sortMenu.classList.add('is-open');
  sortButton.setAttribute('aria-expanded', 'true');
}

function closeSortMenu() {
  if (!sortMenu) return;
  sortMenu.classList.remove('is-open');
  sortButton.setAttribute('aria-expanded', 'false');
}

if (sortButton && sortMenu) {
  sortButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sortMenu.classList.contains('is-open')) closeSortMenu();
    else openSortMenu();
  });

  sortMenu.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = opt.dataset.sort;
      if (!SORT_KEYS.includes(key)) return;

      if (key === activeSort) {
        sortDirections[key] = sortDirections[key] === 'asc' ? 'desc' : 'asc';
      } else {
        activeSort = key;
        closeSortMenu();
      }

      syncSortUI();
      applyFilters();
    });
  });

  // Fuera del panel y Escape lo cierran, como cualquier menú.
  document.addEventListener('click', (e) => {
    if (!sortMenu.classList.contains('is-open')) return;
    if (!e.target.closest('.sort-wrap')) closeSortMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !sortMenu.classList.contains('is-open')) return;
    closeSortMenu();
    sortButton.focus();
  });

  syncSortUI();
}

document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const category = btn.dataset.category;

    if (activeCategory === category) {
      activeCategory = null;
      btn.classList.remove('is-active');
      closeSubFilterBar();
    } else {
      activeCategory = category;
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      buildSubFilterBar(category);
    }

    applyFilters();
  });
});

// Accesos de la portada: los 6 botones de categoría, "Ver todas" y el enlace
// discreto de Ingresos comparten el mismo data-attribute. Solo los 6 de la
// grilla dibujan el aro de presión antes de entrar al catálogo; el resto navega
// en el acto.
//
// Debe coincidir con la duración de `landing-press-ripple` en styles.css.
const LANDING_PRESS_MS = 380;
let landingPressPending = false;

document.querySelectorAll('[data-landing-category]').forEach(btn => {
  btn.addEventListener('click', () => {
    const cat    = btn.dataset.landingCategory;
    const target = cat === 'todas' ? null : cat;
    const isCategoryCard = btn.classList.contains('landing-btn')
      && !btn.classList.contains('landing-btn--all');

    if (!isCategoryCard || prefersReducedMotion()) {
      enterCatalog(target);
      return;
    }
    if (landingPressPending) return; // ya hay un aro en curso

    landingPressPending = true;
    btn.classList.add('is-pressed');
    setTimeout(() => {
      btn.classList.remove('is-pressed');
      landingPressPending = false;
      enterCatalog(target);
    }, LANDING_PRESS_MS);
  });
});

// Flecha "subir": sube al principio del catálogo, no a la portada. Está fuera
// del enlace del logo justamente para que el clic no navegue.
const toTopButton = document.getElementById('toTop');
if (toTopButton) {
  toTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
  });
}

// Logo link: go back to landing when in catalog
const logoLink = document.querySelector('.site-logo-link');
if (logoLink) {
  logoLink.addEventListener('click', (e) => {
    if (document.body.dataset.view === 'catalog') {
      e.preventDefault();
      goToLanding();
    }
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

initGridDelegation();

loadCoins().then((ok) => {
  if (!ok) return;

  hydrateIngresosEntries();

  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get('buscar') || urlParams.get('q') || urlParams.get('search');
  const catParamRaw = urlParams.get('cat') || urlParams.get('categoria') || urlParams.get('category');
  const catParam = LEGACY_CATEGORY_KEYS[catParamRaw] || catParamRaw;
  // `todas` no es una categoría: es la ausencia de filtro, igual que el botón
  // "Ver todas las monedas" de la portada, que entra con null. Sin esto un link
  // ?cat=todas se saltea la vista por defecto y muestra libros, medallas e
  // insumos mezclados con las monedas.

  if (searchParam) {
    showCatalog();
    searchInput.value = searchParam;
    clearSearchBtn.classList.add('is-visible');
    activeCategory = null;
    activeSubFilter = null;
    saveState(0);
    renderCoins(getFilteredCoins(), true);
    initRevealEffects();
    scheduleHeaderMuteObserver();
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }

  if (catParam) {
    enterCatalog(catParam === 'todas' ? null : catParam);
    return;
  }

  const isBackFwd = isBackForwardNavigation();
  const isReload  = isReloadNavigation();
  const state     = loadSavedState();

  // El catálogo se restaura al volver con atrás/adelante y también al recargar:
  // apretar F5 con una categoría puesta no debe devolver a la portada. La
  // diferencia es que la recarga arranca con el buscador limpio y arriba de
  // todo — la búsqueda es momentánea, el filtro no.
  if ((isBackFwd || isReload) && state && state.view === 'catalog') {
    showCatalog();
    if (isReload && !isBackFwd) {
      state.search  = '';
      state.scrollY = 0;
      searchInput.value = '';
      clearSearchBtn.classList.remove('is-visible');
    }
    // initRevealEffects va SIEMPRE, también cuando hay scroll guardado: antes
    // solo corría cuando NO había scrollY, o sea nunca en el caso normal de
    // volver del detalle, y quedaba un observador sin montar.
    applyRestoredState(state).then(() => {
      initRevealEffects();
      scheduleHeaderMuteObserver();
      // El scroll se restaura recién con la grilla entera montada: si no, la
      // página todavía no mide lo suficiente y el navegador recorta el salto.
      if (state.scrollY) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.scrollTo({ top: state.scrollY, behavior: 'instant' });
        }));
      }
      // El scroll guardado apuntaba a la grilla con búsqueda: ya no vale.
      if (isReload && !isBackFwd) saveState(0);
    });
    return;
  }

  // Carga nueva → portada.
  showLanding();
});

// ─── Restauración desde el bfcache ────────────────────────────────────────────
// Al volver desde la caché de atrás/adelante el bootstrap NO se re-ejecuta:
// hay que reafirmar la posición de scroll y recuperar las miniaturas que el
// navegador haya dejado a medio cargar.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;

  const state = loadSavedState();
  if (state && state.view === 'catalog' && state.scrollY) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: state.scrollY, behavior: 'instant' });
    }));
  }

  // Solo las que fallaron de verdad. La condición anterior era
  // `!img.complete || img.naturalWidth === 0`, y `complete` es false para toda
  // imagen lazy que todavía no empezó a cargar — o sea casi toda la grilla. El
  // resultado era reescribirles el src con un cache-buster único y forzar la
  // re-descarga de las ~448 miniaturas justo al volver atrás.
  document.querySelectorAll('.coin-image').forEach((img) => {
    if (img.complete && img.naturalWidth === 0) {
      const base = img.src.split('?')[0];
      img.src = `${base}?r=${Date.now()}`;
    }
  });
});

