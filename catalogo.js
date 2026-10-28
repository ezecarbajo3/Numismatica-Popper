/**
 * Numismática Popper — catálogo.
 *
 * Grilla con filtros que se combinan (colección, país, metal, precio, estado,
 * ingresos de la semana), buscador y orden. Todo el estado vive en la URL
 * (?cat=argentina&metal=Oro&orden=precio): se puede compartir un link filtrado
 * y "volver" desde una ficha deja todo como estaba.
 *
 * Reglas que vienen del catálogo anterior (script.js) y se conservan:
 *   - Sin búsqueda ni colección, "todas" no muestra libros, medallas, fichas
 *     ni insumos (no son monedas); buscándolos por nombre sí aparecen.
 *   - Las variantes de un mismo grupo (group_id) van en UNA tarjeta, con la
 *     de mejor estado como representante y el precio más bajo como "Desde".
 *   - Las vendidas se ven SOLD_RETENTION_DAYS días y después desaparecen.
 *   - El orden por defecto es el de siempre: país, año, valor facial.
 *   - Nunca se ofrece un filtro que lleva a una grilla vacía: las opciones
 *     sin piezas no se muestran.
 *
 * Rendimiento: se dibujan de a PAGE tarjetas ("Mostrar más"), sin blend ni
 * animación por tarjeta. Depende de common.js, categorias.js y museo.js.
 */

const PAGE = 48;
const SCROLL_KEY = 'popper_catalogo_scroll';

const PRICE_RANGES = [
  { key: '0-5',    label: 'Hasta 5 dólares',       min: 0,   max: 5 },
  { key: '5-20',   label: 'De 5 a 20 dólares',     min: 5,   max: 20 },
  { key: '20-50',  label: 'De 20 a 50 dólares',    min: 20,  max: 50 },
  { key: '50-100', label: 'De 50 a 100 dólares',   min: 50,  max: 100 },
  { key: '100',    label: 'Más de 100 dólares',    min: 100, max: Infinity },
];

const GRADES = [
  { key: 'SC', label: 'Sin circular' },
  { key: 'EX', label: 'Excelente' },
  { key: 'MB', label: 'Muy bueno' },
  { key: 'B',  label: 'Bueno' },
  { key: 'R',  label: 'Regular' },
];

const SORTS = [
  { key: '',            label: 'País y año' },
  { key: 'nuevas',      label: 'Recién llegadas' },
  { key: 'precio',      label: 'Precio: de menor a mayor' },
  { key: 'precio-desc', label: 'Precio: de mayor a menor' },
  { key: 'antiguas',    label: 'Las más antiguas primero' },
  { key: 'modernas',    label: 'Las más modernas primero' },
];

// Claves viejas de ?cat= que pueden venir de links compartidos.
const CAT_ALIASES = { inversion: 'plata', blisters: 'varios', 'medallas-libros': 'varios' };

const SEARCH_ALIASES = {
  usa: 'estados unidos', eeuu: 'estados unidos', uk: 'reino unido', urss: 'union sovietica',
  insumo: 'insumos', sobres: 'sobre', carpetas: 'carpeta', folios: 'folio',
  carton: 'cartoncito', cartones: 'cartoncito',
};

const ARGENTINA_ORDER = {
  'Argentina - Patria': 1, 'Argentina - Confed. Arg.': 2, 'Argentina - Buenos Aires': 3, 'Argentina': 4,
};

const COLLATOR = new Intl.Collator('es');

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const ICON_CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

let allCoins = [];
let coinsById = new Map();
let groupInfo = new Map();
let shown = PAGE;

const state = {
  cat: '',
  q: '',
  paises: new Set(),
  metales: new Set(),
  precio: '',
  estados: new Set(),
  nuevos: false,
  orden: '',
};

// ─── Claves de cada filtro ───────────────────────────────────────────────────

function countryKey(coin) {
  return normalizeCountryValue(coin.country) || 'Sin país';
}

function countryName(key) {
  switch (key) {
    case 'Argentina':                return 'Argentina';
    case 'Argentina - Patria':       return 'Argentina · Patria';
    case 'Argentina - Buenos Aires': return 'Argentina · Buenos Aires';
    case 'Argentina - Confed. Arg.': return 'Argentina · Confederación';
    default: return key;
  }
}

// Metales agrupados en familias que un cliente reconoce. La plata se separa
// por ley porque para quien invierte es lo primero que mira.
function metalKey(coin) {
  const m = String(coin.metal || '').toLowerCase();
  if (!m) return '';
  if (m.startsWith('oro') && !m.includes('nórdico')) return 'Oro';
  if (m.includes('plata')) {
    const purity = getSilverPurity(coin);
    return purity ? `Plata .${purity}` : 'Plata';
  }
  if (m.includes('bimet')) return 'Bimetálica';
  if (m.includes('níquel') || m.includes('niquel')) return 'Níquel y cuproníquel';
  if (m.includes('bronce') || m.includes('cobre') || m.includes('latón') || m.includes('nórdico')) return 'Bronce, cobre y latón';
  if (m.includes('aluminio')) return 'Aluminio';
  if (m.includes('acero') || m.includes('hierro')) return 'Acero';
  return 'Otros metales';
}

function metalOrder(key) {
  if (key === 'Oro') return [0, 0];
  if (key.startsWith('Plata')) return [1, -(parseInt(key.replace(/\D/g, ''), 10) || 0)];
  if (key === 'Otros metales') return [3, 0];
  return [2, 0];
}

function gradeKey(coin) {
  const rank = gradeRank(coin);
  if (rank >= 16) return 'SC';
  if (rank >= 13) return 'EX';
  if (rank >= 10) return 'MB';
  if (rank >= 7) return 'B';
  if (rank >= 4) return 'R';
  return '';
}

function priceKey(coin) {
  const p = groupPrice(coin);
  if (!Number.isFinite(p)) return '';
  const range = PRICE_RANGES.find(r => p >= r.min && p < r.max);
  return range ? range.key : '';
}

// ─── Grupos de variantes ─────────────────────────────────────────────────────

function buildGroupInfo() {
  groupInfo = new Map();
  for (const coin of allCoins) {
    if (!coin.group_id || coin.hidden) continue;
    let g = groupInfo.get(coin.group_id);
    if (!g) {
      g = { count: 0, minVal: Infinity, maxVal: -Infinity, minStr: '', isNew: false, latest: 0 };
      groupInfo.set(coin.group_id, g);
    }
    if (coin.status !== 'sold') {
      g.count += 1;
      const p = parsePriceUSD(coin.price);
      if (p < g.minVal) { g.minVal = p; g.minStr = coin.price; }
      if (p > g.maxVal) g.maxVal = p;
    }
    if (isNewCoin(coin)) g.isNew = true;
    const ts = Date.parse(coin.publishedAt || '');
    if (!Number.isNaN(ts) && ts > g.latest) g.latest = ts;
  }
}

// La de mejor estado representa al grupo; si empatan, la de id más bajo.
function collapseGroups(coins) {
  const rep = new Map();
  for (const coin of coins) {
    if (!coin.group_id) continue;
    const ex = rep.get(coin.group_id);
    if (!ex) { rep.set(coin.group_id, coin); continue; }
    const exSold = ex.status === 'sold', cSold = coin.status === 'sold';
    if (exSold && !cSold) { rep.set(coin.group_id, coin); continue; }
    if (!exSold && cSold) continue;
    const ra = gradeRank(ex), rc = gradeRank(coin);
    if (rc > ra || (rc === ra && String(coin.id) < String(ex.id))) rep.set(coin.group_id, coin);
  }
  return coins.filter(c => !c.group_id || rep.get(c.group_id) === c);
}

function groupOf(coin) {
  return coin.group_id ? groupInfo.get(coin.group_id) : null;
}

// Precio con el que se evalúa una tarjeta: el mínimo del grupo si hay variantes.
function groupPrice(coin) {
  const g = groupOf(coin);
  if (g && g.count > 0) return g.minVal;
  return parsePriceUSD(coin.price);
}

function isNewCard(coin) {
  const g = groupOf(coin);
  return g ? g.isNew : isNewCoin(coin);
}

function publishTs(coin) {
  const g = groupOf(coin);
  if (g && g.latest) return g.latest;
  const ts = Date.parse(coin.publishedAt || '');
  return Number.isNaN(ts) ? 0 : ts;
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

function normalizeSearch(str) {
  return String(str || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// El texto de búsqueda de cada pieza se arma una vez al cargar.
function prepareCoins() {
  for (const coin of allCoins) {
    coin._searchText = normalizeSearch([
      coin.id != null ? `${coin.id} #${coin.id}` : '',
      coin.title, coin.group_label, countryName(countryKey(coin)), coin.country,
      coin.metal, coin.year, coin.price, coin.description,
      coin.reference, coin.grade, coin.grade_short, coin.mintage,
    ].filter(Boolean).join(' '));
  }
}

function searchTerm() {
  const raw = normalizeSearch(state.q);
  return SEARCH_ALIASES[raw] || raw;
}

// ─── Filtrado ────────────────────────────────────────────────────────────────

function collectionOf(key) {
  return COLLECTIONS.find(c => c.key === key) || null;
}

// Cada filtro por separado, para poder contar las opciones de uno aplicando
// todos los demás (así los números de cada opción son siempre ciertos).
const MATCHERS = {
  cat(coin) {
    const col = collectionOf(state.cat);
    if (col) return col.match(coin);
    // "Todas": sin búsqueda, solo monedas (ni libros, ni medallas, ni insumos).
    if (searchTerm()) return true;
    return !(isBook(coin) || isMedalOrToken(coin) || isInsumo(coin));
  },
  q(coin) {
    const term = searchTerm();
    return !term || (coin._searchText || '').includes(term);
  },
  paises(coin) { return !state.paises.size || state.paises.has(countryKey(coin)); },
  metales(coin) { return !state.metales.size || state.metales.has(metalKey(coin)); },
  precio(coin) { return !state.precio || priceKey(coin) === state.precio; },
  estados(coin) { return !state.estados.size || state.estados.has(gradeKey(coin)); },
  nuevos(coin) { return !state.nuevos || isNewCard(coin); },
};

function baseCoins() {
  return allCoins.filter(c => !c.hidden && !isSoldExpired(c));
}

function filterExcept(pool, skip) {
  return pool.filter(coin => Object.entries(MATCHERS).every(([k, fn]) => k === skip || fn(coin)));
}

// Cuántas tarjetas (no monedas sueltas) hay por cada valor de un filtro.
function countBy(pool, skip, keyFn) {
  const counts = new Map();
  for (const coin of collapseGroups(filterExcept(pool, skip))) {
    const key = keyFn(coin);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// ─── Orden ───────────────────────────────────────────────────────────────────

function faceValue(title) {
  const m = String(title || '').match(/^(\d+(?:\.\d+)?)\s/);
  return m ? parseFloat(m[1]) : 1;
}

function yearOf(coin) {
  const y = Number(coin.year);
  return Number.isFinite(y) && y > 0 ? y : null;
}

// El orden de siempre: país A→Z (Argentina por secciones), año, valor facial.
// En Inversión manda la ley de la plata.
function compareDefault(a, b) {
  if (state.cat === 'plata') {
    const lot = (isLotePlata(a) ? 0 : 1) - (isLotePlata(b) ? 0 : 1);
    if (lot) return lot;
    const pur = getSilverPurity(b) - getSilverPurity(a);
    if (pur) return pur;
    return (Number(a.year) || 0) - (Number(b.year) || 0);
  }
  const na = countryKey(a), nb = countryKey(b);
  const ga = na.startsWith('Argentina') ? 'Argentina' : na;
  const gb = nb.startsWith('Argentina') ? 'Argentina' : nb;
  const byCountry = COLLATOR.compare(ga, gb);
  if (byCountry) return byCountry;
  if (ga === 'Argentina') {
    const sub = (ARGENTINA_ORDER[na] || 4) - (ARGENTINA_ORDER[nb] || 4);
    if (sub) return sub;
  }
  const ya = Number(a.year) || 0, yb = Number(b.year) || 0;
  if (ya !== yb) return ya - yb;
  return faceValue(a.title) - faceValue(b.title);
}

// Lo que no tiene dato (sin precio, sin año) va siempre al final.
function compareNullable(va, vb, dir) {
  const aOk = va != null && Number.isFinite(va), bOk = vb != null && Number.isFinite(vb);
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  if (!aOk && !bOk) return 0;
  return (va - vb) * dir;
}

function sortCards(cards) {
  const list = cards.slice();
  const by = {
    nuevas: (a, b) => publishTs(b) - publishTs(a),
    precio: (a, b) => compareNullable(groupPrice(a), groupPrice(b), 1),
    'precio-desc': (a, b) => compareNullable(groupPrice(a), groupPrice(b), -1),
    antiguas: (a, b) => compareNullable(yearOf(a), yearOf(b), 1),
    modernas: (a, b) => compareNullable(yearOf(a), yearOf(b), -1),
  }[state.orden];
  list.sort((a, b) => {
    // Las vendidas, al final: se muestran para que se vea movimiento, pero no
    // le ganan lugar a lo que se puede comprar.
    const sold = (a.status === 'sold') - (b.status === 'sold');
    if (sold) return sold;
    return (by && by(a, b)) || compareDefault(a, b);
  });
  return list;
}

// ─── URL ─────────────────────────────────────────────────────────────────────

function readUrl() {
  const p = new URLSearchParams(location.search);
  let cat = p.get('cat') || p.get('categoria') || p.get('category') || '';
  cat = CAT_ALIASES[cat] || cat;
  // Los links viejos usaban ?cat=ingresos y ?cat=todas.
  state.nuevos = p.get('nuevos') === '1' || cat === 'ingresos';
  if (cat === 'todas' || cat === 'ingresos' || !collectionOf(cat)) cat = '';
  state.cat = cat;
  state.q = p.get('q') || p.get('buscar') || p.get('search') || '';
  state.paises = new Set(p.getAll('pais'));
  state.metales = new Set(p.getAll('metal'));
  state.precio = PRICE_RANGES.some(r => r.key === p.get('precio')) ? p.get('precio') : '';
  state.estados = new Set(p.getAll('estado').filter(k => GRADES.some(g => g.key === k)));
  state.orden = SORTS.some(s => s.key === p.get('orden')) ? p.get('orden') : '';
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.cat) p.set('cat', state.cat);
  if (state.q.trim()) p.set('q', state.q.trim());
  state.paises.forEach(v => p.append('pais', v));
  state.metales.forEach(v => p.append('metal', v));
  if (state.precio) p.set('precio', state.precio);
  state.estados.forEach(v => p.append('estado', v));
  if (state.nuevos) p.set('nuevos', '1');
  if (state.orden) p.set('orden', state.orden);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function activeFilterCount() {
  return (state.cat ? 1 : 0) + state.paises.size + state.metales.size +
    (state.precio ? 1 : 0) + state.estados.size + (state.nuevos ? 1 : 0);
}

// ─── Panel de filtros ────────────────────────────────────────────────────────

function opcion({ label, count, checked, radio, onToggle }) {
  const li = el('li');
  const btn = el('button', `opcion${radio ? ' opcion--radio' : ''}`);
  btn.type = 'button';
  btn.setAttribute('role', radio ? 'radio' : 'checkbox');
  btn.setAttribute('aria-checked', String(!!checked));
  const box = el('span', 'opcion__box');
  box.innerHTML = ICON_CHECK;
  btn.append(box, el('span', 'opcion__label', label));
  if (count != null) btn.appendChild(el('span', 'opcion__count', String(count)));
  btn.addEventListener('click', onToggle);
  li.appendChild(btn);
  return li;
}

function filtro(title, items, { largas, buscable } = {}) {
  const box = el('div', 'filtro');
  box.appendChild(el('h3', '', title));
  const list = el('ul', `opciones${largas ? ' opciones--largas' : ''}`);
  if (buscable) {
    const input = el('input', 'filtro__buscar');
    input.type = 'search';
    input.placeholder = 'Buscar país';
    input.setAttribute('aria-label', 'Buscar país');
    input.addEventListener('input', () => {
      const term = normalizeSearch(input.value);
      list.querySelectorAll('li').forEach(li => {
        li.hidden = term && !normalizeSearch(li.textContent).includes(term);
      });
    });
    box.appendChild(input);
  }
  items.forEach(item => list.appendChild(item));
  box.appendChild(list);
  return box;
}

function toggleIn(set, value) {
  if (set.has(value)) set.delete(value); else set.add(value);
}

function renderFiltros(pool) {
  const body = document.getElementById('filtrosCuerpo');
  const keepScroll = document.getElementById('filtros').scrollTop;
  body.replaceChildren();

  // Colección (una sola a la vez).
  const catCounts = new Map(COLLECTIONS.map(c => [c.key, 0]));
  const sinCat = collapseGroups(filterExcept(pool, 'cat'));
  COLLECTIONS.forEach(c => catCounts.set(c.key, sinCat.filter(c.match).length));
  const colItems = [opcion({
    label: 'Todas las monedas', radio: true, checked: !state.cat,
    onToggle: () => update({ cat: '' }),
  })];
  COLLECTIONS.forEach(c => {
    const n = catCounts.get(c.key);
    if (!n && state.cat !== c.key) return;
    colItems.push(opcion({
      label: c.label, count: n, radio: true, checked: state.cat === c.key,
      onToggle: () => update({ cat: c.key }),
    }));
  });
  body.appendChild(filtro('Colección', colItems));

  // Ingresos de la semana.
  const nuevosN = collapseGroups(filterExcept(pool, 'nuevos')).filter(isNewCard).length;
  if (nuevosN || state.nuevos) {
    body.appendChild(filtro('Novedades', [opcion({
      label: 'Solo ingresos de la semana', count: nuevosN, checked: state.nuevos,
      onToggle: () => update({ nuevos: !state.nuevos }),
    })]));
  }

  // Precio (un rango a la vez).
  const precioCounts = countBy(pool, 'precio', priceKey);
  const precioItems = [opcion({
    label: 'Cualquier precio', radio: true, checked: !state.precio,
    onToggle: () => update({ precio: '' }),
  })];
  PRICE_RANGES.forEach(r => {
    const n = precioCounts.get(r.key) || 0;
    if (!n && state.precio !== r.key) return;
    precioItems.push(opcion({
      label: r.label, count: n, radio: true, checked: state.precio === r.key,
      onToggle: () => update({ precio: r.key }),
    }));
  });
  body.appendChild(filtro('Precio', precioItems));

  // País.
  const paisCounts = countBy(pool, 'paises', countryKey);
  state.paises.forEach(k => { if (!paisCounts.has(k)) paisCounts.set(k, 0); });
  const paises = [...paisCounts.entries()].sort((a, b) => COLLATOR.compare(countryName(a[0]), countryName(b[0])));
  if (paises.length > 1 || state.paises.size) {
    body.appendChild(filtro('País', paises.map(([k, n]) => opcion({
      label: countryName(k), count: n, checked: state.paises.has(k),
      onToggle: () => { toggleIn(state.paises, k); update(); },
    })), { largas: true, buscable: paises.length > 12 }));
  }

  // Metal.
  const metalCounts = countBy(pool, 'metales', metalKey);
  state.metales.forEach(k => { if (!metalCounts.has(k)) metalCounts.set(k, 0); });
  const metales = [...metalCounts.entries()].sort((a, b) => {
    const [ga, sa] = metalOrder(a[0]), [gb, sb] = metalOrder(b[0]);
    return ga - gb || sa - sb || COLLATOR.compare(a[0], b[0]);
  });
  if (metales.length > 1 || state.metales.size) {
    body.appendChild(filtro('Metal', metales.map(([k, n]) => opcion({
      label: k, count: n, checked: state.metales.has(k),
      onToggle: () => { toggleIn(state.metales, k); update(); },
    }))));
  }

  // Estado de conservación.
  const gradeCounts = countBy(pool, 'estados', gradeKey);
  const grades = GRADES.filter(g => gradeCounts.get(g.key) || state.estados.has(g.key));
  if (grades.length > 1 || state.estados.size) {
    body.appendChild(filtro('Estado de conservación', grades.map(g => opcion({
      label: g.label, count: gradeCounts.get(g.key) || 0, checked: state.estados.has(g.key),
      onToggle: () => { toggleIn(state.estados, g.key); update(); },
    }))));
  }

  document.getElementById('filtros').scrollTop = keepScroll;
}

// ─── Estado y chips ──────────────────────────────────────────────────────────

function chip(label, onRemove) {
  const b = el('button', 'chip');
  b.type = 'button';
  b.setAttribute('aria-label', `Quitar filtro: ${label}`);
  b.append(el('span', '', label));
  b.insertAdjacentHTML('beforeend', ICON_X);
  b.addEventListener('click', onRemove);
  return b;
}

function clearAll() {
  update({ cat: '', q: '', precio: '', nuevos: false, paises: new Set(), metales: new Set(), estados: new Set() });
  document.getElementById('buscar').value = '';
}

function renderEstado(total) {
  const box = document.getElementById('catEstado');
  box.replaceChildren(el('strong', '', `${total.toLocaleString('es-AR')} ${total === 1 ? 'pieza' : 'piezas'}`));
  const chips = [];
  if (state.q.trim()) chips.push(chip(`"${state.q.trim()}"`, () => { document.getElementById('buscar').value = ''; update({ q: '' }); }));
  if (state.cat) chips.push(chip(collectionOf(state.cat).label, () => update({ cat: '' })));
  if (state.nuevos) chips.push(chip('Ingresos de la semana', () => update({ nuevos: false })));
  if (state.precio) chips.push(chip(PRICE_RANGES.find(r => r.key === state.precio).label, () => update({ precio: '' })));
  state.paises.forEach(k => chips.push(chip(countryName(k), () => { state.paises.delete(k); update(); })));
  state.metales.forEach(k => chips.push(chip(k, () => { state.metales.delete(k); update(); })));
  state.estados.forEach(k => chips.push(chip(GRADES.find(g => g.key === k).label, () => { state.estados.delete(k); update(); })));
  chips.forEach(c => box.appendChild(c));
  if (chips.length > 1) {
    const all = el('button', 'chip chip--limpiar', 'Quitar todos');
    all.type = 'button';
    all.addEventListener('click', clearAll);
    box.appendChild(all);
  }

  const n = activeFilterCount();
  document.getElementById('abrirFiltrosTexto').textContent = n ? `Filtrar (${n})` : 'Filtrar';
  document.getElementById('filtrosVer').textContent = `Ver ${total.toLocaleString('es-AR')} ${total === 1 ? 'pieza' : 'piezas'}`;
}

function renderTitulo() {
  const col = collectionOf(state.cat);
  let titulo = col ? col.label : 'Todas las monedas';
  if (state.nuevos && !col) titulo = 'Ingresos de la semana';
  const head = document.getElementById('catTitulo');
  head.textContent = titulo;
  // Con todas las monedas el catálogo arranca directo en el buscador; el
  // título solo se ve al entrar a una colección o a los ingresos.
  head.parentElement.classList.toggle('is-oculto', titulo === 'Todas las monedas');
  document.title = `${titulo} | Numismática Popper`;
}

// ─── Tarjetas ────────────────────────────────────────────────────────────────

function syncCartButtons() {
  document.querySelectorAll('.ficha__agregar[data-coin-id]').forEach(btn => {
    const inCart = !!(window.PopperCart && window.PopperCart.has(btn.dataset.coinId));
    btn.classList.toggle('is-in-cart', inCart);
    btn.innerHTML = inCart ? ICON_CHECK : ICON_CART;
    const label = inCart ? 'Está en tu carrito. Tocá para quitarla' : 'Agregar al carrito';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  });
}

// Grupo de variantes: el rango de precios, cada punta redondeada para abajo
// ("12,5-15 USD" queda "12-15 USD"). Debajo de 1 USD no se redondea (0,7
// quedaría en 0). Si todas valen lo mismo, va el precio tal cual.
function puntaRango(usd) {
  return usd >= 1 ? Math.floor(usd) : usd;
}

function formatRango(g) {
  const lo = puntaRango(g.minVal);
  const hi = puntaRango(g.maxVal);
  if (getCurrency() === 'ARS') {
    const rate = getBlueRate();
    const a = formatPriceARS(lo * rate);
    const b = formatPriceARS(hi * rate);
    return a === b ? a : `${a}-${b}`;
  }
  const fmt = n => String(n).replace('.', ',');
  return lo === hi ? `${fmt(lo)} USD` : `${fmt(lo)}-${fmt(hi)} USD`;
}

function paintCardPrice(node, coin) {
  const g = groupOf(coin);
  if (g && g.count > 1 && coin.status !== 'sold' && Number.isFinite(g.minVal) && g.minVal !== g.maxVal) {
    node.dataset.rango = coin.group_id;
    node.textContent = formatRango(g);
    return;
  }
  if (g && g.count > 1 && coin.status !== 'sold' && g.minStr) {
    // Todas las variantes al mismo precio: ese precio, sin rango.
    paintPrice(node, { id: `g:${coin.group_id}`, price: g.minStr });
    return;
  }
  paintPrice(node, coin);
}

// Como en la página original: nombre (ya trae el año), país abajo y, en la
// fila del precio, la cápsula con el estado. El carrito es un botón chico en
// la esquina de abajo a la derecha de la foto.
function ficha(coin) {
  const g = groupOf(coin);
  const isGroup = !!(g && g.count > 1);
  const sold = coin.status === 'sold';
  const href = `detalle.html?id=${encodeURIComponent(coin.id)}`;
  const title = isGroup ? (coin.group_label || coin.title) : coin.title;

  const art = el('article', `ficha${sold ? ' ficha--vendida' : ''}`);

  const foto = el('div', 'ficha__foto');
  const fotoLink = el('a', 'ficha__foto-link');
  fotoLink.href = href;
  fotoLink.tabIndex = -1;
  fotoLink.setAttribute('aria-hidden', 'true');
  const src = getPrimaryImage(coin);
  if (src) {
    const img = el('img');
    img.src = thumbFor(src);
    img.dataset.fullSrc = src;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 300;
    img.height = 300;
    fotoLink.appendChild(img);
  }
  foto.appendChild(fotoLink);
  if (sold) foto.appendChild(el('span', 'ficha__marca ficha__marca--vendida', 'Vendida'));
  else if (isNewCard(coin)) foto.appendChild(el('span', 'ficha__marca', 'Nuevo'));
  else if (isSalaCoin(coin)) {
    // En el celular dice solo "Sala": entero ocupa dos renglones y tapa la foto.
    const marca = el('span', 'ficha__marca ficha__marca--sala', 'Sala');
    marca.appendChild(el('span', 'solo-compu', ' de Rarezas'));
    foto.appendChild(marca);
  }

  const buyable = !sold && !isGroup && Number.isFinite(parsePriceUSD(coin.price)) &&
    !(typeof coin.cantidad === 'number' && coin.cantidad <= 0);
  if (buyable) {
    const btn = el('button', 'ficha__agregar');
    btn.type = 'button';
    btn.dataset.coinId = String(coin.id);
    foto.appendChild(btn);
  }
  art.appendChild(foto);

  const body = el('div', 'ficha__body');
  const h = el('h2', 'ficha__title');
  const a = el('a');
  a.href = href;
  applyCoinTitle(a, title);
  h.appendChild(a);
  body.appendChild(h);
  const meta = [countryName(countryKey(coin)), isGroup ? `${g.count} variantes` : null].filter(Boolean).join(' · ');
  body.appendChild(el('p', 'ficha__meta', meta));

  const pie = el('div', 'ficha__pie');
  const price = el('span', 'price');
  paintCardPrice(price, coin);
  pie.appendChild(price);
  // La cápsula es el estado de una pieza suelta; un grupo tiene varios.
  const grade = isGroup ? '' : getGradeShort(coin);
  if (grade) {
    const cap = el('span', 'capsula', grade);
    if (coin.grade) cap.title = coin.grade;
    pie.appendChild(cap);
  }
  body.appendChild(pie);
  art.appendChild(body);
  return art;
}

// ─── Render ──────────────────────────────────────────────────────────────────

let currentCards = [];

function renderGrid() {
  const grid = document.getElementById('catGrid');
  grid.replaceChildren();

  if (!currentCards.length) {
    const vacio = el('div', 'cat-vacio');
    vacio.appendChild(el('p', '', 'No encontramos monedas con estos filtros.'));
    const btn = el('button', 'btn btn--quiet', 'Quitar todos los filtros');
    btn.type = 'button';
    btn.addEventListener('click', clearAll);
    vacio.appendChild(btn);
    vacio.appendChild(el('p', '', '¿Buscás una pieza en particular? Escribinos por WhatsApp.'));
    grid.appendChild(vacio);
    document.getElementById('catMas').hidden = true;
    return;
  }

  const frag = document.createDocumentFragment();
  currentCards.slice(0, shown).forEach(c => frag.appendChild(ficha(c)));
  grid.appendChild(frag);
  syncCartButtons();
  renderMas();
}

function renderMas() {
  const rest = currentCards.length - shown;
  const box = document.getElementById('catMas');
  box.hidden = rest <= 0;
  if (rest > 0) {
    document.getElementById('catMasTexto').textContent =
      `Estás viendo ${Math.min(shown, currentCards.length)} de ${currentCards.length} piezas`;
    document.getElementById('catMasBtn').textContent =
      `Mostrar ${Math.min(PAGE, rest)} más`;
  }
}

function update(patch) {
  if (patch) Object.assign(state, patch);
  shown = PAGE;
  writeUrl();
  render();
}

function render() {
  const pool = baseCoins();
  currentCards = sortCards(collapseGroups(filterExcept(pool, null)));
  renderTitulo();
  renderFiltros(pool);
  renderEstado(currentCards.length);
  renderGrid();
}

// ─── Hoja de filtros (celular) ───────────────────────────────────────────────

function setupSheet() {
  const panel = document.getElementById('filtros');
  const velo = document.getElementById('filtrosVelo');
  const open = () => {
    panel.classList.add('is-open');
    velo.hidden = false;
    document.documentElement.style.overflow = 'hidden';
  };
  const close = () => {
    panel.classList.remove('is-open');
    velo.hidden = true;
    document.documentElement.style.overflow = '';
  };
  document.getElementById('abrirFiltros').addEventListener('click', open);
  document.getElementById('filtrosCerrar').addEventListener('click', close);
  document.getElementById('filtrosVer').addEventListener('click', () => {
    close();
    document.querySelector('.cat-layout').scrollIntoView({ behavior: 'instant' });
  });
  velo.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// ─── Volver desde una ficha ──────────────────────────────────────────────────

// Al entrar a una ficha se guarda cuántas tarjetas había y dónde estaba el
// scroll; al volver con "atrás" se deja todo igual.
function saveScroll() {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ url: location.search, y: window.scrollY, shown }));
  } catch (_) {}
}

function restoreScroll() {
  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (!nav || nav.type !== 'back_forward') return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null');
    return saved && saved.url === location.search ? saved : null;
  } catch (_) {
    return null;
  }
}

// ─── Arranque ────────────────────────────────────────────────────────────────

function setupControls() {
  const input = document.getElementById('buscar');
  const limpiar = document.getElementById('buscarLimpiar');
  input.value = state.q;
  limpiar.hidden = !state.q;
  let timer;
  input.addEventListener('input', () => {
    limpiar.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(() => update({ q: input.value }), 220);
  });
  limpiar.addEventListener('click', () => {
    input.value = '';
    limpiar.hidden = true;
    update({ q: '' });
    input.focus();
  });

  const orden = document.getElementById('orden');
  SORTS.forEach(s => {
    const o = el('option', '', s.label);
    o.value = s.key;
    orden.appendChild(o);
  });
  orden.value = state.orden;
  orden.addEventListener('change', () => update({ orden: orden.value }));

  document.getElementById('catMasBtn').addEventListener('click', () => {
    const from = shown;
    shown += PAGE;
    const grid = document.getElementById('catGrid');
    const frag = document.createDocumentFragment();
    currentCards.slice(from, shown).forEach(c => frag.appendChild(ficha(c)));
    grid.appendChild(frag);
    syncCartButtons();
    renderMas();
  });

  // Un solo listener para todas las tarjetas.
  const grid = document.getElementById('catGrid');
  grid.addEventListener('click', e => {
    const btn = e.target.closest('.ficha__agregar[data-coin-id]');
    if (btn) {
      const coin = coinsById.get(btn.dataset.coinId);
      if (coin && window.PopperCart) window.PopperCart.toggle(coin, btn);
      return;
    }
    if (e.target.closest('a[href^="detalle.html"]')) saveScroll();
  });
  grid.addEventListener('error', e => {
    if (e.target.tagName === 'IMG') handleImgError(e.target);
  }, true);

  window.addEventListener('popper:cart-updated', syncCartButtons);
  window.addEventListener('popper:currency-changed', () => {
    document.querySelectorAll('.ficha .price[data-rango]').forEach(n => {
      n.textContent = formatRango(groupInfo.get(n.dataset.rango));
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  readUrl();
  setupControls();
  setupSheet();
  loadAllCoins()
    .then(coins => {
      allCoins = coins;
      coinsById = new Map(coins.map(c => [String(c.id), c]));
      prepareCoins();
      buildGroupInfo();
      const saved = restoreScroll();
      if (saved && saved.shown > PAGE) shown = saved.shown;
      render();
      if (saved) requestAnimationFrame(() => requestAnimationFrame(() => instantScrollTo(saved.y)));
      else arrancarArriba();
    })
    .catch(err => {
      console.error(err);
      document.getElementById('catEstado').textContent =
        'No pudimos cargar las monedas. Probá recargar la página.';
    });
});
