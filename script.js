// ─── Disable browser auto-scroll restoration ─────────────────────────────
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// ─── DOM refs ────────────────────────────────────────────────────────────────
const searchInput       = document.getElementById('searchInput');
const clearSearchBtn    = document.getElementById('clearSearch');
const resetFiltersButton = document.getElementById('resetFilters');
const resultsCount      = document.getElementById('resultsCount');
const coinsGrid         = document.getElementById('coinsGrid');
const coinCardTemplate  = document.getElementById('coinCardTemplate');
const subFilterBar      = document.getElementById('subFilterBar');
const subFilterList     = document.getElementById('subFilterList');

// ─── State ───────────────────────────────────────────────────────────────────
let allCoins        = [];
let activeCategory  = null;
let activeSubFilter = null;
let revealObserver  = null;

const STATE_KEY = 'nump_filter_state';

// ─── Country lookup helpers ──────────────────────────────────────────────────

const ARGENTINA_EQUIVALENTS = {
  'Argentina': 'Argentina',
  'Argentina - Patria': 'Argentina - Patria',
  'Patria': 'Argentina - Patria',
  'Argentina - Buenos Aires': 'Argentina - Buenos Aires',
  'Buenos Aires': 'Argentina - Buenos Aires',
  'Argentina - Confed. Arg.': 'Argentina - Confed. Arg.',
  'Confed. Arg.': 'Argentina - Confed. Arg.',
  'Argentina - Confederación Argentina': 'Argentina - Confed. Arg.',
  'Confederación Argentina': 'Argentina - Confed. Arg.',
};

const ARGENTINA_GROUP_VALUES = new Set([
  'Argentina',
  'Argentina - Patria',
  'Argentina - Buenos Aires',
  'Argentina - Confed. Arg.',
]);

// Maps Argentina sub-filter labels → normalized country values
const ARGENTINA_SUB_MAP = {
  'República':              'Argentina',
  'Bs As':                  'Argentina - Buenos Aires',
  'Confederación Argentina':'Argentina - Confed. Arg.',
  'Patria':                 'Argentina - Patria',
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

// ─── Category predicates ─────────────────────────────────────────────────────

function isArgentinaCoin(coin) {
  return (coin.country || '').trim().startsWith('Argentina');
}

function isMedalOrToken(coin) {
  const country = (coin.country || '').trim().toLowerCase();
  const title   = (coin.title   || '').trim().toLowerCase();
  return (
    country === 'token'        ||
    country === 'medalla'      ||
    country.includes('token')  ||
    country.includes('medalla')||
    title.includes('medalla')
  );
}

function isBlister(coin) {
  const title = (coin.title || '').trim();
  return /^bls[.\s]/i.test(title) || /blister/i.test(title);
}

function isBook(coin) {
  const title = (coin.title || '').trim().toLowerCase();
  return title.includes('libro') || title.includes('catálogo') || title.includes('catalogo');
}

function getSilverPurity(coin) {
  const m = /[Pp]lata\s*\.?(\d{3,4})/.exec(coin.metal || '');
  return m ? parseInt(m[1], 10) : 0;
}

function isInvestment(coin) {
  const purity = getSilverPurity(coin);
  if (purity >= 900) return true;
  return /^[Pp]lata$/i.test((coin.metal || '').trim());
}

const CATEGORY_PREDICATES = {
  argentina:     isArgentinaCoin,
  internacional: (c) => !isArgentinaCoin(c) && !isMedalOrToken(c) && !isBlister(c) && !isBook(c),
  medallas:      isMedalOrToken,
  blisters:      isBlister,
  libros:        isBook,
  inversion:     isInvestment,
};

// ─── Sub-filter helpers ──────────────────────────────────────────────────────

/**
 * Returns the array of {label, value} options for the contextual dropdown,
 * applying the critical data rule (omit options with 0 matching items).
 */
function getSubFilterOptions(category) {
  switch (category) {
    case 'argentina': {
      const pool = allCoins.filter(isArgentinaCoin);
      const specs = [
        { label: 'República',              value: 'República',               country: 'Argentina' },
        { label: 'Bs As',                  value: 'Bs As',                   country: 'Argentina - Buenos Aires' },
        { label: 'Confederación Argentina',value: 'Confederación Argentina',  country: 'Argentina - Confed. Arg.' },
        { label: 'Patria',                 value: 'Patria',                  country: 'Argentina - Patria' },
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

    case 'inversion': {
      const pool = allCoins.filter(isInvestment);
      const specs = [
        { label: 'Plata',  value: 'Plata', match: c => /^[Pp]lata$/i.test((c.metal || '').trim()) },
        { label: '.900',   value: '900',   match: c => getSilverPurity(c) === 900 },
        { label: '.925',   value: '925',   match: c => getSilverPurity(c) === 925 },
        { label: '.999',   value: '999',   match: c => getSilverPurity(c) === 999 },
        { label: '.9999',  value: '9999',  match: c => getSilverPurity(c) === 9999 },
      ];
      return specs.filter(s => pool.some(s.match));
    }

    default:
      return null; // blisters, medallas, libros have no sub-filters
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
    case 'inversion':
      if (subFilter === 'Plata') return /^[Pp]lata$/i.test((coin.metal || '').trim());
      return getSilverPurity(coin) === parseInt(subFilter, 10);
    default:
      return true;
  }
}

/**
 * Builds the contextual dropdown. Pass restoredSubFilter to re-activate a
 * previously-selected sub-filter (used during state restoration only).
 */
function buildSubFilterBar(category, restoredSubFilter = null) {
  subFilterList.innerHTML = '';
  activeSubFilter = null;

  const options = getSubFilterOptions(category);

  if (!options || options.length === 0) {
    subFilterBar.classList.remove('is-open');
    return;
  }

  options.forEach(({ label, value }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sub-filter-btn';
    btn.textContent = label;
    btn.dataset.value = value;

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
  subFilterBar.classList.remove('is-open');
  subFilterList.innerHTML = '';
  activeSubFilter = null;
}

// ─── State persistence ───────────────────────────────────────────────────────

function saveState(scrollY = null) {
  const state = {
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

// ─── Data loading ────────────────────────────────────────────────────────────

async function loadCoins() {
  try {
    const response = await fetch('coins.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar coins.json');
    const data = await response.json();
    allCoins = Array.isArray(data) ? data : [];
    return true;
  } catch (error) {
    console.error(error);
    coinsGrid.innerHTML =
      '<div class="empty-state">No se pudieron cargar las monedas. Revisá que exista el archivo <strong>coins.json</strong>.</div>';
    resultsCount.textContent = 'Error al cargar monedas';
    return false;
  }
}

// ─── Filtering ───────────────────────────────────────────────────────────────

function getFilteredCoins() {
  const searchTerm = searchInput.value.trim().toLowerCase();

  return allCoins.filter((coin) => {
    if (activeCategory) {
      const predicate = CATEGORY_PREDICATES[activeCategory];
      if (predicate && !predicate(coin)) return false;
    }

    if (activeSubFilter && activeCategory) {
      if (!matchesSubFilter(coin, activeCategory, activeSubFilter)) return false;
    }

    if (searchTerm) {
      const text = [
        coin.title, getCountryDisplayLabel(coin.country), coin.country,
        coin.metal, coin.year, coin.price, coin.description,
        coin.reference, coin.grade, coin.grade_short, coin.mintage,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!text.includes(searchTerm)) return false;
    }

    return true;
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

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

function getGradeShort(coin) {
  return coin.grade_short || coin.gradeShort || coin.grade_short_label || '';
}

function goToDetail(coinId) {
  saveState(window.scrollY);
  window.location.href = `detalle.html?id=${coinId}`;
}

function getCountrySortGroup(country) {
  const normalized = normalizeCountryValue(country);
  return ARGENTINA_GROUP_VALUES.has(normalized) ? 'Argentina' : normalized;
}

function sortCoins(coins) {
  return [...coins].sort((a, b) => {
    const groupA = getCountrySortGroup(a.country);
    const groupB = getCountrySortGroup(b.country);
    const byCountry = groupA.localeCompare(groupB, 'es');
    if (byCountry !== 0) return byCountry;
    const yearA = Number(a.year) || 0;
    const yearB = Number(b.year) || 0;
    if (yearA !== yearB) return yearA - yearB;
    return String(a.title || '').localeCompare(String(b.title || ''), 'es');
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

  sortCoins(coins).forEach((coin) => {
    const card = coinCardTemplate.content.cloneNode(true);

    const article  = card.querySelector('.coin-card');
    const imageWrap = card.querySelector('.coin-image-wrap');
    const image    = card.querySelector('.coin-image');
    const title    = card.querySelector('.coin-title');
    const meta     = card.querySelector('.coin-meta');
    const badgeRow = card.querySelector('.coin-badge-row');
    const price    = card.querySelector('.coin-price');

    if (skipAnimation) article.classList.remove('reveal');

    image.src = getPrimaryImage(coin);
    image.alt = coin.title || 'Moneda';
    title.textContent = coin.title || 'Sin título';
    meta.textContent  = getCountryDisplayLabel(coin.country);
    price.textContent = coin.price || 'Consultar';

    const grade = getGradeShort(coin);
    badgeRow.innerHTML = grade ? `<span class="coin-grade-badge">${grade}</span>` : '';

    // ── Inline image carousel ──────────────────────────────────────────────
    const images = Array.isArray(coin.images) ? coin.images : [];
    if (images.length > 1) {
      let currentIdx = 0;

      const setIdx = (newIdx) => {
        currentIdx = ((newIdx % images.length) + images.length) % images.length;
        image.src = images[currentIdx];
        imageWrap.querySelectorAll('.card-dot').forEach((dot, i) =>
          dot.classList.toggle('is-active', i === currentIdx)
        );
      };

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'card-arrow card-arrow--prev';
      prevBtn.setAttribute('aria-label', 'Imagen anterior');
      prevBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'card-arrow card-arrow--next';
      nextBtn.setAttribute('aria-label', 'Imagen siguiente');
      nextBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`;

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
    }

    // ── Hover zoom (3-second delay, pointer:fine only) ─────────────────────
    if (hasPointerFine) {
      let zoomTimer = null;
      article.addEventListener('mouseenter', () => {
        zoomTimer = setTimeout(() => article.classList.add('is-zoomed'), 3000);
      });
      article.addEventListener('mouseleave', () => {
        clearTimeout(zoomTimer);
        zoomTimer = null;
        article.classList.remove('is-zoomed');
      });
    }

    // ── Navigation ─────────────────────────────────────────────────────────
    article.addEventListener('click', () => goToDetail(coin.id));
    article.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        goToDetail(coin.id);
      }
    });

    fragment.appendChild(card);
  });

  coinsGrid.appendChild(fragment);
  resultsCount.textContent = `${coins.length} moneda${coins.length === 1 ? '' : 's'} encontrada${coins.length === 1 ? '' : 's'}`;
}

// ─── Reveal animations ───────────────────────────────────────────────────────

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

// ─── Apply filters ───────────────────────────────────────────────────────────

function applyFilters() {
  renderCoins(getFilteredCoins(), true);
  saveState();
}

// ─── Event listeners ────────────────────────────────────────────────────────

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
  saveState();
  renderCoins(allCoins);
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

// ─── Bootstrap ───────────────────────────────────────────────────────────────

loadCoins().then((ok) => {
  if (!ok) return;

  if (isBackForwardNavigation()) {
    const state = loadSavedState();
    if (state) {
      applyRestoredState(state);
      if (state.scrollY) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: state.scrollY, behavior: 'instant' });
          });
        });
      }
      return;
    }
  }

  renderCoins(allCoins);
  initRevealEffects();
});

// ─── Smooth scroll inertia (desktop/mouse only) ──────────────────────────────

(function initSmoothScroll() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const EASE = 0.1;
  let scrollCurrent = window.scrollY;
  let scrollTarget  = window.scrollY;
  let rafId         = null;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function getMaxScroll() { return document.documentElement.scrollHeight - window.innerHeight; }

  function getNormalisedDelta(e) {
    if (e.deltaMode === 1) return e.deltaY * 40;
    if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
    return e.deltaY;
  }

  function isInsideScrollable(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const oy    = style.overflowY;
      if ((oy === 'scroll' || oy === 'auto') && node.scrollHeight > node.clientHeight + 1) return true;
      node = node.parentElement;
    }
    return false;
  }

  function loop() {
    const diff = scrollTarget - scrollCurrent;
    if (Math.abs(diff) < 0.5) {
      scrollCurrent = scrollTarget;
      window.scrollTo(0, scrollCurrent);
      rafId = null;
      return;
    }
    scrollCurrent = lerp(scrollCurrent, scrollTarget, EASE);
    window.scrollTo(0, scrollCurrent);
    rafId = requestAnimationFrame(loop);
  }

  window.addEventListener('wheel', (e) => {
    if (isInsideScrollable(e.target)) return;
    e.preventDefault();
    scrollTarget = Math.max(0, Math.min(scrollTarget + getNormalisedDelta(e), getMaxScroll()));
    if (!rafId) {
      scrollCurrent = window.scrollY;
      rafId = requestAnimationFrame(loop);
    }
  }, { passive: false });

  window.addEventListener('scroll', () => {
    if (!rafId) scrollCurrent = scrollTarget = window.scrollY;
  }, { passive: true });
})();
