// ─── Disable browser auto-scroll restoration ─────────────────────────────────
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// ─── SVG constants ────────────────────────────────────────────────────────────
const SVG_CHEVRON_LEFT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;
const SVG_CHEVRON_RIGHT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const searchInput        = document.getElementById('searchInput');
const clearSearchBtn     = document.getElementById('clearSearch');
const resetFiltersButton = document.getElementById('resetFilters');
const resultsCount       = document.getElementById('resultsCount');
const coinsGrid          = document.getElementById('coinsGrid');
const coinCardTemplate   = document.getElementById('coinCardTemplate');
const subFilterBar       = document.getElementById('subFilterBar');
const subFilterList      = document.getElementById('subFilterList');

// ─── State ────────────────────────────────────────────────────────────────────
let allCoins        = [];
let groupMinPriceMap = new Map(); // group_id → { val: number, str: string }
let activeCategory  = null;
let activeSubFilter = null;
let revealObserver  = null;

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

function isBlister(coin) {
  const title = (coin.title || '').trim();
  return /^bls[.\s]/i.test(title) || /blister/i.test(title) ||
    (/^lote\s/i.test(title) && !isLotePlata(coin));
}

function isBook(coin) {
  const title = (coin.title || '').trim().toLowerCase();
  return title.includes('libro') || title.includes('catálogo') || title.includes('catalogo') || title.includes('album') || title.includes('red book');
}

function isBlisterOnly(coin) {
  const title = (coin.title || '').trim();
  return /^bls[.\s]/i.test(title) || /blister/i.test(title);
}

function isLoteOnly(coin) {
  const title = (coin.title || '').trim();
  return /^lote\s/i.test(title) && !isLotePlata(coin);
}

function parsePriceUSD(priceStr) {
  if (!priceStr) return Infinity;
  const n = parseFloat(String(priceStr).replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? Infinity : n;
}

function isEconomica(coin) {
  return (
    parsePriceUSD(coin.price) < 5 &&
    !isArgentinaCoin(coin) &&
    !isMedalOrToken(coin) &&
    !isBlister(coin) &&
    !isBook(coin)
  );
}

function isExonumia(coin) {
  return isMedalOrToken(coin) || isBook(coin);
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
  // Try grade_short first (most reliable)
  let raw = String(coin.grade_short || '').trim().replace(/\s+/g, '').toUpperCase().replace(/\*+$/, '');
  if (raw && raw !== '-' && GRADE_RANK_MAP[raw] !== undefined) return GRADE_RANK_MAP[raw];

  // Fall back: parse full grade text
  const g = String(coin.grade || '').toUpperCase();
  const hasMinus = /[-]\s*$| -/.test(g);
  const hasPlus  = /[+]\s*$| \+/.test(g);
  const mod = hasMinus ? '-' : hasPlus ? '+' : '';
  if (/^SIN\s*CIRC|^SC\b|^UNC\b|^FDC\b/i.test(g))   return GRADE_RANK_MAP['SC'];
  if (/^EXCEL/i.test(g))  return GRADE_RANK_MAP['EX'  + mod] ?? GRADE_RANK_MAP['EX'];
  if (/^MUY\s*B/i.test(g)) return GRADE_RANK_MAP['MB' + mod] ?? GRADE_RANK_MAP['MB'];
  if (/^BUENO/i.test(g))  return GRADE_RANK_MAP['B'   + mod] ?? GRADE_RANK_MAP['B'];
  if (/^REGULAR/i.test(g)) return GRADE_RANK_MAP['R'  + mod] ?? GRADE_RANK_MAP['R'];
  return 0; // unknown
}

function buildGroupMinPrices() {
  groupMinPriceMap = new Map();
  for (const coin of allCoins) {
    if (!coin.group_id || coin.status === 'sold') continue;
    const p = parsePriceUSD(coin.price);
    const existing = groupMinPriceMap.get(coin.group_id);
    if (!existing || p < existing.val) {
      groupMinPriceMap.set(coin.group_id, { val: p, str: coin.price });
    }
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
  return allCoins.filter(c => c.group_id === groupId && c.status !== 'sold').length;
}

const CATEGORY_PREDICATES = {
  plata:           isInvestment,
  inversion:       isInvestment,      // kept for sessionStorage backwards compat
  argentina:       isArgentinaCoin,
  internacional:   (c) => !isArgentinaCoin(c) && !isMedalOrToken(c) && !isBlister(c) && !isBook(c),
  medallas:        isMedalOrToken,
  'medallas-libros': (c) => isMedalOrToken(c) || isBook(c),
  blisters:        isBlister,
  libros:          isBook,
  blister_only:    isBlisterOnly,
  lotes:           isLoteOnly,
  economicas:      isEconomica,
  exonumia:        isExonumia,
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

    case 'plata':
    case 'inversion': {
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

    case 'medallas': {
      const pool = allCoins.filter(isMedalOrToken);
      const specs = [
        { label: 'Medallas', value: 'Medallas', match: isMedal },
        { label: 'Tokens',   value: 'Tokens',   match: isToken  },
      ];
      return specs.filter(s => pool.some(s.match));
    }

    case 'medallas-libros': {
      const pool = allCoins.filter(c => isMedalOrToken(c) || isBook(c));
      const specs = [
        { label: 'Medallas', value: 'Medallas', match: isMedal },
        { label: 'Tokens',   value: 'Tokens',   match: isToken  },
        { label: 'Libros',   value: 'Libros',   match: isBook   },
      ];
      return specs.filter(s => pool.some(s.match));
    }

    default:
      return null; // blisters have no sub-filters
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
    case 'inversion':
      if (subFilter === 'lotes') return isLotePlata(coin);
      return getSilverPurity(coin) === parseInt(subFilter, 10);
    case 'medallas':
    case 'medallas-libros':
      if (subFilter === 'Medallas') return isMedal(coin);
      if (subFilter === 'Tokens')   return isToken(coin);
      if (subFilter === 'Libros')   return isBook(coin);
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
  if (category === 'plata' || category === 'inversion') {
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

// ─── Image preview overlay ────────────────────────────────────────────────────

function showImagePreview(src, altText) {
  hideImagePreview(true); // instant-remove any stale overlay

  const overlay = document.createElement('div');
  overlay.id = 'imgPreviewOverlay';
  overlay.className = 'img-preview-overlay';

  const img = document.createElement('img');
  img.src = src;
  img.alt = altText || '';
  img.className = 'img-preview-img';
  overlay.appendChild(img);
  document.body.appendChild(overlay);

  // Double rAF to ensure the browser paints once before adding the class
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-visible')));
}

function hideImagePreview(instant = false) {
  const overlay = document.getElementById('imgPreviewOverlay');
  if (!overlay) return;
  if (instant) { overlay.remove(); return; }
  overlay.classList.remove('is-visible');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  setTimeout(() => overlay.remove(), 600); // failsafe
}

// ─── Landing / Catalog view ───────────────────────────────────────────────────

function showLanding() {
  document.body.dataset.view = 'landing';
}

function showCatalog() {
  document.body.dataset.view = 'catalog';
}

function goToLanding() {
  searchInput.value = '';
  clearSearchBtn.classList.remove('is-visible');
  activeCategory  = null;
  activeSubFilter = null;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('is-active'));
  closeSubFilterBar();
  hideImagePreview(true);
  try { sessionStorage.removeItem(STATE_KEY); } catch (_) {}
  showLanding();
}

function enterCatalog(categoryKey) {
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
  saveState();
  renderCoins(getFilteredCoins());
  initRevealEffects();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ─── State persistence ────────────────────────────────────────────────────────

function saveState(scrollY = null) {
  const state = {
    view:      document.body.dataset.view || 'landing',
    category:  activeCategory,
    subFilter: activeSubFilter,
    search:    searchInput.value,
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

function applyRestoredState(state) {
  // Migrate old 'inversion' category key to 'plata'
  if (state.category === 'inversion') state.category = 'plata';

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

  renderCoins(getFilteredCoins(), true);
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadCoins() {
  try {
    const response = await fetch('coins.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar coins.json');
    const data = await response.json();
    allCoins = Array.isArray(data) ? data : [];
    buildGroupMinPrices();
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isSoldExpired(coin) {
  return coin.status === 'sold' && coin.soldAt &&
    (Date.now() - new Date(coin.soldAt).getTime() > THIRTY_DAYS_MS);
}

const SEARCH_ALIASES = {
  'usa':  'estados unidos',
  'eeuu': 'estados unidos',
  'uk':   'reino unido',
  'urss': 'union sovietica',
};

function stripAccents(str) {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeSearch(str) {
  return stripAccents(String(str || '').trim().toLowerCase());
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
      // Default view: hide books and medals/tokens (exclusive to their own filters)
      if (isBook(coin) || isMedalOrToken(coin)) return false;
    }

    if (activeSubFilter && activeCategory) {
      if (!matchesSubFilter(coin, activeCategory, activeSubFilter)) return false;
    }

    if (searchTerm) {
      const text = normalizeSearch([
        coin.title, getCountryDisplayLabel(coin.country), coin.country,
        coin.metal, coin.year, coin.price, coin.description,
        coin.reference, coin.grade, coin.grade_short, coin.mintage,
      ].filter(Boolean).join(' '));
      if (!text.includes(searchTerm)) return false;
    }

    return true;
  });
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function getPrimaryImage(coin) {
  if (Array.isArray(coin.images) && coin.images.length > 0) {
    const imageA = coin.images.find(img => {
      const fileName = img.split('/').pop()?.toUpperCase() || '';
      return fileName.includes('A.');
    });
    return imageA || coin.images[0];
  }
  if (coin.image) return coin.image;
  return 'https://via.placeholder.com/800x600?text=Sin+imagen';
}

// Devuelve la miniatura WebP (~500px, generada por generate_thumbs.sh) que usa el
// grid en vez del original de ~2800px. Si el src no es una foto local de images/
// (ej. placeholder remoto), lo devuelve tal cual. El original se sigue usando en la
// vista de detalle y el zoom; si la miniatura no existiera, attachImgRetry cae al
// original automáticamente.
function thumbFor(src) {
  if (!src || !src.startsWith('images/') || src.startsWith('images/thumbs/')) return src;
  const base = src.split('/').pop().replace(/\.[^.]+$/, '');
  return `images/thumbs/${base}.webp`;
}

function getGradeShort(coin) {
  return coin.grade_short || coin.gradeShort || coin.grade_short_label || '';
}

// Re-fetches an <img> if its load fails (up to 2 times, with a cache-buster).
// Fixes "broken image" thumbnails after back/forward navigation, where the
// browser aborts in-flight requests when leaving the page.
function attachImgRetry(img, maxTries = 2) {
  let triedOriginal = false;
  let tries = 0;
  img.addEventListener('error', () => {
    const current = img.src.split('?')[0];
    // Si falló una miniatura WebP (ej. moneda nueva aún sin thumb generado), caer
    // al JPEG original una sola vez antes de reintentar con cache-buster.
    if (!triedOriginal && img.dataset.fullSrc && current.includes('/thumbs/')) {
      triedOriginal = true;
      img.src = img.dataset.fullSrc;
      return;
    }
    if (tries >= maxTries) return;
    tries += 1;
    setTimeout(() => { img.src = `${current}?r=${Date.now()}`; }, 250 * tries);
  });
}

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

function getCountrySortGroup(country) {
  const normalized = normalizeCountryValue(country);
  return ARGENTINA_GROUP_VALUES.has(normalized) ? 'Argentina' : normalized;
}

function getFaceValue(title) {
  const m = String(title || '').match(/^(\d+(?:\.\d+)?)\s/);
  return m ? parseFloat(m[1]) : 1;
}

// Separa "[valor facial] [año]" del texto extra de un título de moneda.
// Año = token de 4 dígitos (1500–2099) que aparezca DESPUÉS de una palabra (denominación),
// para no confundir el valor facial (ej. "2000 Pesos 1992" → base "2000 Pesos 1992").
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
    // Sin año pero con valor facial: base = hasta la denominación (primera palabra),
    // absorbiendo un año/fecha/rango pegado (ej. "1854/40", "1861-1863").
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

function sortCoins(coins) {
  // Inversión view: Lote Plata first, then by purity descending, then year
  if (activeCategory === 'plata' || activeCategory === 'inversion') {
    return [...coins].sort((a, b) => {
      const lotA = isLotePlata(a) ? 0 : 1;
      const lotB = isLotePlata(b) ? 0 : 1;
      if (lotA !== lotB) return lotA - lotB;
      const purA = getSilverPurity(a);
      const purB = getSilverPurity(b);
      if (purA !== purB) return purB - purA;
      return (Number(a.year) || 0) - (Number(b.year) || 0);
    });
  }

  // Default: country A→Z, Argentina subsections, year ascending, face value ascending
  return [...coins].sort((a, b) => {
    const normA = normalizeCountryValue(a.country);
    const normB = normalizeCountryValue(b.country);
    const groupA = ARGENTINA_GROUP_VALUES.has(normA) ? 'Argentina' : normA;
    const groupB = ARGENTINA_GROUP_VALUES.has(normB) ? 'Argentina' : normB;

    // 1. Country alphabetically (A → Z)
    const byCountry = groupA.localeCompare(groupB, 'es');
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
    const valA = getFaceValue(a.title);
    const valB = getFaceValue(b.title);
    return valA - valB;
  });
}

function renderCoins(coins, skipAnimation = false) {
  coinsGrid.innerHTML = '';

  if (!coins.length) {
    coinsGrid.innerHTML =
      '<div class="empty-state">No hay monedas que coincidan con los filtros seleccionados.</div>';
    resultsCount.textContent = '0 monedas encontradas';
    return;
  }

  const fragment = document.createDocumentFragment();
  const hasPointerFine = window.matchMedia('(pointer: fine)').matches;
  const displayCoins = collapseGroups(sortCoins(coins));

  displayCoins.forEach((coin, idx) => {
    const card = coinCardTemplate.content.cloneNode(true);

    const article   = card.querySelector('.coin-card');
    const imageWrap = card.querySelector('.coin-image-wrap');
    const image     = card.querySelector('.coin-image');
    const title     = card.querySelector('.coin-title');
    const yearTag   = card.querySelector('.coin-year-tag');
    const meta      = card.querySelector('.coin-meta');
    const badgeRow  = card.querySelector('.coin-badge-row');
    const price     = card.querySelector('.coin-price');

    if (skipAnimation) article.classList.remove('reveal');

    // Above-fold cards: eager + high priority. The rest are lazy so the browser
    // only fetches them as the user scrolls (native lazy-loading).
    // Keep the eager set small — these are full-weight photos.
    if (idx < 4) {
      image.loading = 'eager';
      image.fetchPriority = idx < 2 ? 'high' : 'auto';
    } else {
      image.loading = 'lazy';
      image.fetchPriority = 'low';
    }

    // Auto-heal images that fail to load (aborted requests on navigation,
    // transient network errors, etc.) — retries with a cache-buster so the
    // user never has to hit F5 to recover broken thumbnails.
    // El grid usa la miniatura WebP; el original queda en data-fullSrc para el
    // zoom/preview y como fallback si la miniatura no existiera.
    const primaryFull = getPrimaryImage(coin);
    image.dataset.fullSrc = primaryFull;
    attachImgRetry(image);

    image.src = thumbFor(primaryFull);
    image.alt = coin.title || 'Moneda';

    if (coin.group_id) {
      article.classList.add('is-group');
      applyCoinTitle(title, coin.group_label || coin.title);
      yearTag.textContent = '';
      const count = getGroupMemberCount(coin.group_id);
      price.style.display = 'none'; // Hide price element to allow badgeRow to center
      badgeRow.innerHTML = count > 1
        ? `<span class="coin-grade-badge">${count} variantes</span>`
        : (count === 1 ? `<span class="coin-grade-badge">1 variante</span>` : '');
    } else {
      article.classList.remove('is-group');
      applyCoinTitle(title, coin.title || 'Sin título');
      yearTag.textContent = coin.year  || '';
      price.style.display = 'block'; 
      if (coin.original_price) {
        price.innerHTML = `<span class="price-original">${coin.original_price}</span><span class="price-current">${coin.price}</span>`;
      } else {
        price.textContent = coin.price || 'Consultar';
      }
      const grade = getGradeShort(coin);
      let badgesHTML = grade ? `<span class="coin-grade-badge">${grade}</span>` : '';
      badgeRow.innerHTML = badgesHTML;
    }

    meta.textContent = getCountryDisplayLabel(coin.country);

    // ── Sold state ────────────────────────────────────────────────────────────
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

    // ── Inline image carousel ─────────────────────────────────────────────────
    const images = Array.isArray(coin.images) ? coin.images : [];
    if (images.length > 1) {
      let currentIdx = 0;
      let carouselPreloaded = false;
      let swapToken = 0;

      const updateDots = () => {
        imageWrap.querySelectorAll('.card-dot').forEach((dot, i) =>
          dot.classList.toggle('is-active', i === currentIdx)
        );
      };

      // Decode the target off-screen before swapping the visible <img>, so the
      // photo changes in a single click with no half-painted/blank flash. The
      // dots update immediately to give instant feedback even while decoding.
      // A token guards against out-of-order swaps when clicking quickly.
      const setIdx = (newIdx) => {
        currentIdx = ((newIdx % images.length) + images.length) % images.length;
        updateDots();
        const targetFull = images[currentIdx];
        const targetSrc = thumbFor(targetFull);
        image.dataset.fullSrc = targetFull; // el zoom/preview usa el original
        const myToken = ++swapToken;
        const pre = new Image();
        pre.src = targetSrc;
        const apply = () => { if (myToken === swapToken) image.src = targetSrc; };
        if (pre.decode) {
          pre.decode().then(apply).catch(apply);
        } else if (pre.complete) {
          apply();
        } else {
          pre.onload = apply;
          pre.onerror = apply;
        }
      };

      // Preload secondary images so the first arrow tap is instant. For the
      // above-fold cards this runs at render; the rest wait until first
      // hover/touch to avoid a burst of off-screen requests.
      const preloadCarousel = () => {
        if (carouselPreloaded) return;
        carouselPreloaded = true;
        images.forEach((src, i) => { if (i > 0) { const p = new Image(); p.src = thumbFor(src); } });
      };
      if (idx < 4) preloadCarousel();

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

      prevBtn.addEventListener('click', (e) => { e.stopPropagation(); setIdx(currentIdx - 1); });
      nextBtn.addEventListener('click', (e) => { e.stopPropagation(); setIdx(currentIdx + 1); });
      imageWrap.appendChild(prevBtn);
      imageWrap.appendChild(nextBtn);
      imageWrap.appendChild(dotsWrap);

      article.addEventListener('mouseenter', preloadCarousel);

      // Touch swipe (mobile) — swipe left → next, swipe right → prev
      let touchStartX = 0;
      imageWrap.addEventListener('touchstart', (e) => {
        preloadCarousel();
        touchStartX = e.changedTouches[0].clientX;
      }, { passive: true });
      imageWrap.addEventListener('touchend', (e) => {
        const delta = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) > 40) {
          e.stopPropagation();
          setIdx(delta < 0 ? currentIdx + 1 : currentIdx - 1);
        }
      }, { passive: false });
    }

    // ── Hover image preview — shows fixed-position overlay after 3 s ──────────
    // Gated to pointer:fine so it never fires on touch screens.
    if (hasPointerFine) {
      let zoomTimer = null;

      article.addEventListener('mouseenter', () => {
        zoomTimer = setTimeout(() => {
          article.classList.add('is-zoomed');
          // Muestra la foto original full-res (no la miniatura), respetando la
          // posición actual del carrusel.
          showImagePreview(image.dataset.fullSrc || image.src, coin.title);
        }, 3000);
      });

      article.addEventListener('mouseleave', () => {
        clearTimeout(zoomTimer);
        zoomTimer = null;
        article.classList.remove('is-zoomed');
        hideImagePreview();
      });
    }

    // ── Card navigation ───────────────────────────────────────────────────────
    if (coin.status !== 'sold') {
      article.addEventListener('click', () => goToDetail(coin.id));
      article.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          goToDetail(coin.id);
        }
      });
    }

    fragment.appendChild(card);
  });

  coinsGrid.appendChild(fragment);
  const displayCount = displayCoins.length;
  resultsCount.textContent = `${displayCount} ${displayCount === 1 ? 'ítem encontrado' : 'ítems encontrados'}`;
}

// ─── Reveal animations ────────────────────────────────────────────────────────

function initRevealEffects() {
  if (revealObserver) revealObserver.disconnect();

  const revealItems = document.querySelectorAll('.coin-card, .results-bar');
  revealItems.forEach(item => item.classList.add('reveal'));

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

  revealItems.forEach(item => revealObserver.observe(item));
}

// ─── Apply filters ────────────────────────────────────────────────────────────

function applyFilters() {
  renderCoins(getFilteredCoins(), true);
  saveState();
}

// ─── Event listeners ──────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  clearSearchBtn.classList.toggle('is-visible', searchInput.value.length > 0);
  applyFilters();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.classList.remove('is-visible');
  applyFilters();
  searchInput.focus();
});

resetFiltersButton.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.classList.remove('is-visible');
  activeCategory  = null;
  activeSubFilter = null;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('is-active'));
  closeSubFilterBar();
  hideImagePreview(true);
  saveState();
  renderCoins(getFilteredCoins());
  initRevealEffects();
});

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

// Landing button event listeners
document.querySelectorAll('.landing-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.landingCategory;
    enterCatalog(cat === 'todas' ? null : cat);
  });
});

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

loadCoins().then((ok) => {
  if (!ok) return;

  const isBackFwd = isBackForwardNavigation();
  const state     = loadSavedState();

  // Only restore catalog on back/forward navigation
  if (isBackFwd && state && state.view === 'catalog') {
    showCatalog();
    applyRestoredState(state);
    if (state.scrollY) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.scrollTo({ top: state.scrollY, behavior: 'instant' });
      }));
    } else {
      initRevealEffects();
    }
    return;
  }

  // Fresh load or reload → always show landing
  showLanding();
});

// ─── Back/forward cache restore ────────────────────────────────────────────────
// When the page is restored from the bfcache (e.g. the browser/app "back"
// button), the bootstrap above does NOT re-run. Re-assert the scroll position
// and kick any thumbnails the browser left in a broken state back into loading.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;

  const state = loadSavedState();
  if (state && state.view === 'catalog' && state.scrollY) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: state.scrollY, behavior: 'instant' });
    }));
  }

  document.querySelectorAll('.coin-image').forEach((img) => {
    if (!img.complete || img.naturalWidth === 0) {
      const base = img.src.split('?')[0];
      img.src = `${base}?r=${Date.now()}`;
    }
  });
});

