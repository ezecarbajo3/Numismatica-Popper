/**
 * Numismática Popper — catálogo.
 *
 * Grilla con filtros que se combinan (colección, continente o países de un
 * continente, metal, ingresos de la semana, precio máximo, estado), buscador y
 * orden. Todo el estado vive en la URL (?continente=Europa&metal=Oro&hasta=20):
 * se puede compartir un link filtrado y "volver" desde una ficha deja todo
 * como estaba.
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

// Las colecciones del panel. Argentinas, Mundiales y Económicas ya no son
// colecciones: se llega por continente, país o precio máximo. Cada una se
// abre en sus tipos (`tipo`): Inversión por ley, Varios por clase de pieza.
const CATS = [
  { key: 'plata',  label: 'Inversión', todas: 'Toda la inversión',
    match: (c) => isInvestment(c) || metalKey(c) === 'Oro', tipo: investKey },
  { key: 'varios', label: 'Varios',    todas: 'Todo lo de Varios',
    match: (c) => isMedalOrToken(c) || isBook(c) || isBlister(c) || isInsumo(c), tipo: variosKey },
];

const VARIOS_TIPOS = ['Blísteres', 'Insumos', 'Libros', 'Lotes', 'Medallas', 'Fichas'];

function investKey(coin) {
  return isLotePlata(coin) ? 'Lotes de plata' : metalKey(coin);
}

function variosKey(coin) {
  if (isInsumo(coin)) return 'Insumos';
  if (isBook(coin)) return 'Libros';
  if (isBlisterOnly(coin)) return 'Blísteres';
  if (isLoteVario(coin)) return 'Lotes';
  if (isToken(coin)) return 'Fichas';
  if (isMedal(coin)) return 'Medallas';
  return '';
}

// Los rangos fijos de antes (?precio=5-20) se leen como su tope.
const LEGACY_PRECIO = { '0-5': 5, '5-20': 20, '20-50': 50, '50-100': 100 };

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
const CAT_ALIASES = { inversion: 'plata', blisters: 'varios', 'medallas-libros': 'varios', insumos: 'varios' };

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
const ICON_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5.5l6.5 6.5L9 18.5"/></svg>';
const ICON_CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

let allCoins = [];
let coinsById = new Map();
let groupInfo = new Map();
let shown = PAGE;
let currentPool = [];
let precioTimer;

// Qué desplegables están abiertos ('continente', 'metal', 'cont:Europa'). No
// va a la URL: es cómo quedó el panel, no qué se está filtrando.
const abiertos = new Set();

const state = {
  cat: '',
  tipos: new Set(),
  q: '',
  continentes: new Set(),
  paises: new Set(),
  metales: new Set(),
  precioMax: null,
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
  return CATS.find(c => c.key === key) || null;
}

// Cada filtro por separado, para poder contar las opciones de uno aplicando
// todos los demás (así los números de cada opción son siempre ciertos).
const MATCHERS = {
  cat(coin) {
    const col = collectionOf(state.cat);
    if (col) return col.match(coin) && (!state.tipos.size || state.tipos.has(col.tipo(coin)));
    // "Todas": sin búsqueda, solo monedas (ni libros, ni medallas, ni insumos).
    if (searchTerm()) return true;
    return !(isBook(coin) || isMedalOrToken(coin) || isInsumo(coin));
  },
  q(coin) {
    const term = searchTerm();
    return !term || (coin._searchText || '').includes(term);
  },
  // Países (todos de un mismo continente) o, si no hay, continentes enteros.
  geo(coin) {
    if (state.paises.size) return state.paises.has(filterCountryOf(coin));
    return !state.continentes.size || state.continentes.has(continentOf(coin));
  },
  metales(coin) { return !state.metales.size || state.metales.has(metalKey(coin)); },
  precio(coin) {
    if (state.precioMax == null) return true;
    const p = groupPrice(coin);
    return Number.isFinite(p) && p <= state.precioMax;
  },
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
// En Inversión va primero el oro y después manda la ley de la plata.
function compareDefault(a, b) {
  if (state.cat === 'plata') {
    const oro = (metalKey(a) === 'Oro' ? 0 : 1) - (metalKey(b) === 'Oro' ? 0 : 1);
    if (oro) return oro;
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
  // Los links viejos usaban ?cat=ingresos y ?cat=todas, y la portada sigue
  // mandando a Argentinas, Mundiales y Económicas.
  state.nuevos = p.get('nuevos') === '1' || cat === 'ingresos';
  state.paises = new Set(p.getAll('pais').map(v => {
    const n = normalizeCountryValue(v);
    return n.startsWith('Argentina') ? 'Argentina' : n;
  }));
  if (cat === 'argentina') state.paises.add('Argentina');
  state.continentes = state.paises.size ? new Set()
    : new Set(p.getAll('continente').filter(k => CONTINENTS.some(c => c.key === k)));
  const hasta = parseFloat(String(p.get('hasta') || '').replace(',', '.'));
  state.precioMax = hasta > 0 ? hasta : (LEGACY_PRECIO[p.get('precio')] || null);
  if (cat === 'economicas') state.precioMax = 5;
  if (!collectionOf(cat)) cat = '';
  state.cat = cat;
  state.tipos = new Set(cat ? p.getAll('tipo') : []);
  state.q = p.get('q') || p.get('buscar') || p.get('search') || '';
  state.metales = new Set(p.getAll('metal'));
  state.estados = new Set(p.getAll('estado').filter(k => GRADES.some(g => g.key === k)));
  state.orden = SORTS.some(s => s.key === p.get('orden')) ? p.get('orden') : '';
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.cat) p.set('cat', state.cat);
  state.tipos.forEach(v => p.append('tipo', v));
  if (state.q.trim()) p.set('q', state.q.trim());
  state.continentes.forEach(v => p.append('continente', v));
  state.paises.forEach(v => p.append('pais', v));
  state.metales.forEach(v => p.append('metal', v));
  if (state.precioMax != null) p.set('hasta', String(state.precioMax));
  state.estados.forEach(v => p.append('estado', v));
  if (state.nuevos) p.set('nuevos', '1');
  if (state.orden) p.set('orden', state.orden);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function activeFilterCount() {
  return (state.cat ? Math.max(1, state.tipos.size) : 0) + state.continentes.size + state.paises.size + state.metales.size +
    (state.precioMax != null ? 1 : 0) + state.estados.size + (state.nuevos ? 1 : 0);
}

// ─── Panel de filtros ────────────────────────────────────────────────────────

// `checked` puede ser 'mixed': un continente con algunos de sus países elegidos.
function opcion({ label, count, checked, radio, onToggle }) {
  const li = el('li');
  const btn = el('button', `opcion${radio ? ' opcion--radio' : ''}`);
  btn.type = 'button';
  btn.setAttribute('role', radio ? 'radio' : 'checkbox');
  btn.setAttribute('aria-checked', checked === 'mixed' ? 'mixed' : String(!!checked));
  const box = el('span', 'opcion__box');
  box.innerHTML = ICON_CHECK;
  btn.append(box, el('span', 'opcion__label', label));
  if (count != null) btn.appendChild(el('span', 'opcion__count', String(count)));
  btn.addEventListener('click', onToggle);
  li.appendChild(btn);
  return li;
}

// Una sección del panel: un renglón con el nombre y la flecha que despliega lo
// de abajo. Todas son iguales (Continente, Metal, Estado, Precio); `resumen`
// es lo elegido adentro, para que se lea aunque esté cerrada.
function seccion(key, label, resumen, fill, activo = !!resumen) {
  const box = el('div', 'filtro');
  const btn = el('button', `filtro__toggle${activo ? ' is-activo' : ''}`);
  btn.type = 'button';
  btn.setAttribute('aria-expanded', String(abiertos.has(key)));
  btn.appendChild(el('span', 'filtro__toggle__label', label));
  if (resumen) btn.appendChild(el('span', 'filtro__toggle__resumen', resumen));
  const chev = el('span', 'chev');
  chev.innerHTML = ICON_CHEV;
  btn.appendChild(chev);
  btn.addEventListener('click', () => {
    toggleIn(abiertos, key);
    renderFiltros(currentPool);
  });
  box.appendChild(btn);
  if (abiertos.has(key)) {
    const content = el('div', 'filtro__contenido');
    fill(content);
    box.appendChild(content);
  }
  return box;
}

// Un renglón igual a los de las secciones pero que no despliega nada (Todas
// las monedas, Ingresos de la semana): en el lugar de la flecha, su marca.
function fila({ label, activo, radio, onClick }) {
  const box = el('div', 'filtro');
  const btn = el('button', `filtro__toggle${activo ? ' is-activo' : ''}`);
  btn.type = 'button';
  btn.setAttribute('role', radio ? 'radio' : 'checkbox');
  btn.setAttribute('aria-checked', String(!!activo));
  btn.appendChild(el('span', 'filtro__toggle__label', label));
  const marca = el('span', `marca${radio ? ' marca--radio' : ''}`);
  if (!radio) marca.innerHTML = ICON_CHECK;
  btn.appendChild(marca);
  btn.addEventListener('click', onClick);
  box.appendChild(btn);
  return box;
}

// "Toda la inversión" (o todo Varios): elegirla de nuevo la apaga.
function toggleCat(key) {
  if (state.cat === key && !state.tipos.size) update({ cat: '', tipos: new Set() });
  else update({ cat: key, tipos: new Set() });
}

// Un tipo dentro de una colección; se pueden sumar varios de la misma.
function toggleTipo(key, tipo) {
  if (state.cat !== key) {
    state.cat = key;
    state.tipos = new Set([tipo]);
  } else {
    toggleIn(state.tipos, tipo);
  }
  update();
}

function lista(items) {
  const list = el('ul', 'opciones');
  items.forEach(item => list.appendChild(item));
  return list;
}

function toggleIn(set, value) {
  if (set.has(value)) set.delete(value); else set.add(value);
}

function resumenDe(values) {
  const list = [...values];
  return list.length > 2 ? `${list.slice(0, 2).join(', ')} y ${list.length - 2} más` : list.join(', ');
}

function formatHasta(usd) {
  return `Hasta ${String(usd).replace('.', ',')} dólares`;
}

// Las secciones arrancan abiertas si adentro hay algo elegido.
function abrirLoElegido() {
  if (state.continentes.size || state.paises.size) abiertos.add('continente');
  state.continentes.forEach(k => abiertos.add(`cont:${k}`));
  state.paises.forEach(k => { const c = CONTINENT_OF.get(k); if (c) abiertos.add(`cont:${c}`); });
  if (state.metales.size) abiertos.add('metal');
  if (state.estados.size) abiertos.add('estado');
  if (state.cat) abiertos.add(`cat:${state.cat}`);
  if (state.precioMax != null) abiertos.add('precio');
}

// Un continente entero (se puede sumar más de uno). Elegirlo borra los países
// sueltos y lo abre para que se vean sus países.
function toggleContinente(key) {
  if (state.continentes.has(key)) {
    state.continentes.delete(key);
  } else {
    state.paises.clear();
    state.continentes.add(key);
    abiertos.add(`cont:${key}`);
  }
  update();
}

// Países sueltos, siempre de un mismo continente: elegir uno de otro
// continente empieza de nuevo.
function togglePais(key, continente) {
  state.continentes.clear();
  if (state.paises.has(key)) {
    state.paises.delete(key);
  } else {
    if ([...state.paises].some(k => CONTINENT_OF.get(k) !== continente)) state.paises.clear();
    state.paises.add(key);
  }
  update();
}

function ramaContinente(key, count, paisCounts) {
  const li = el('li', 'rama');
  const fila = el('div', 'rama__fila');
  const elegidos = [...state.paises].filter(k => CONTINENT_OF.get(k) === key).length;
  const checked = state.continentes.has(key) ? true : (elegidos ? 'mixed' : false);
  const op = opcion({ label: key, count, checked, onToggle: () => toggleContinente(key) });
  fila.appendChild(op.firstChild);
  const abrir = el('button', 'rama__abrir');
  abrir.type = 'button';
  abrir.setAttribute('aria-expanded', String(abiertos.has(`cont:${key}`)));
  abrir.setAttribute('aria-label', `Ver países de ${key}`);
  abrir.innerHTML = `<span class="chev">${ICON_CHEV}</span>`;
  abrir.addEventListener('click', () => {
    toggleIn(abiertos, `cont:${key}`);
    renderFiltros(currentPool);
  });
  fila.appendChild(abrir);
  li.appendChild(fila);

  if (abiertos.has(`cont:${key}`)) {
    const paises = [...paisCounts.entries()].sort((a, b) => COLLATOR.compare(a[0], b[0]));
    const sub = el('ul', 'opciones subopciones');
    paises.forEach(([k, n]) => sub.appendChild(opcion({
      label: k, count: n, checked: state.paises.has(k),
      onToggle: () => togglePais(k, key),
    })));
    li.appendChild(sub);
  }
  return li;
}

function campoPrecio() {
  const label = el('label', 'precio-hasta');
  label.appendChild(el('span', '', 'Hasta'));
  const input = el('input');
  input.id = 'precioHasta';
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.placeholder = 'sin límite';
  input.setAttribute('aria-label', 'Precio máximo en dólares');
  input.value = state.precioMax != null ? String(state.precioMax).replace('.', ',') : '';
  const aplicar = () => {
    clearTimeout(precioTimer);
    const v = parseFloat(input.value.replace(',', '.'));
    const max = v > 0 ? v : null;
    if (max !== state.precioMax) update({ precioMax: max });
  };
  input.addEventListener('input', () => {
    clearTimeout(precioTimer);
    precioTimer = setTimeout(aplicar, 450);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { aplicar(); input.blur(); } });
  label.append(input, el('span', '', 'dólares'));
  return label;
}

function renderFiltros(pool) {
  const body = document.getElementById('filtrosCuerpo');
  const keepScroll = document.getElementById('filtros').scrollTop;
  // El campo de precio se rearma con cada filtro: si se estaba escribiendo
  // ahí, se le devuelve el foco y el cursor.
  const act = document.activeElement;
  const escribiendo = act && act.id === 'precioHasta'
    ? { value: act.value, start: act.selectionStart, end: act.selectionEnd } : null;
  body.replaceChildren();

  // Continente, lo primero: despliega los continentes y, dentro de cada uno,
  // sus países. El orden de abajo: colecciones, metal, ingresos, precio y
  // conservación.
  const geoPool = collapseGroups(filterExcept(pool, 'geo'));
  const porContinente = new Map();
  for (const coin of geoPool) {
    const cont = continentOf(coin);
    if (!cont) continue;
    if (!porContinente.has(cont)) porContinente.set(cont, { n: 0, paises: new Map() });
    const c = porContinente.get(cont);
    c.n += 1;
    const pais = filterCountryOf(coin);
    c.paises.set(pais, (c.paises.get(pais) || 0) + 1);
  }
  state.paises.forEach(k => {
    const cont = CONTINENT_OF.get(k);
    if (!cont) return;
    if (!porContinente.has(cont)) porContinente.set(cont, { n: 0, paises: new Map() });
    const c = porContinente.get(cont);
    if (!c.paises.has(k)) c.paises.set(k, 0);
  });
  const conts = CONTINENTS.filter(c => porContinente.has(c.key) || state.continentes.has(c.key));
  if (conts.length) {
    body.appendChild(seccion('continente', 'Continente',
      resumenDe(state.paises.size ? state.paises : state.continentes), content => {
        content.appendChild(lista(conts.map(c => {
          const info = porContinente.get(c.key) || { n: 0, paises: new Map() };
          return ramaContinente(c.key, info.n, info.paises);
        })));
      }));
  }

  // Todas las monedas, Inversión y Varios: mismos renglones que el resto.
  // Inversión y Varios se abren en sus tipos.
  body.appendChild(fila({
    label: 'Todas las monedas', radio: true, activo: !state.cat,
    onClick: () => update({ cat: '', tipos: new Set() }),
  }));
  const sinCat = collapseGroups(filterExcept(pool, 'cat'));
  CATS.forEach(col => {
    const enCol = sinCat.filter(col.match);
    const activa = state.cat === col.key;
    if (!enCol.length && !activa) return;
    const tipoCounts = new Map();
    enCol.forEach(c => { const k = col.tipo(c); if (k) tipoCounts.set(k, (tipoCounts.get(k) || 0) + 1); });
    if (activa) state.tipos.forEach(k => { if (!tipoCounts.has(k)) tipoCounts.set(k, 0); });
    const tipos = col.key === 'varios'
      ? VARIOS_TIPOS.filter(k => tipoCounts.has(k))
      : [...tipoCounts.keys()].sort((x, y) => {
        const [ga, sa] = metalOrder(x), [gb, sb] = metalOrder(y);
        return ga - gb || sa - sb || COLLATOR.compare(x, y);
      });
    body.appendChild(seccion(`cat:${col.key}`, col.label, activa ? resumenDe(state.tipos) : '', content => {
      content.appendChild(lista([
        opcion({
          label: col.todas, count: enCol.length, radio: true, checked: activa && !state.tipos.size,
          onToggle: () => toggleCat(col.key),
        }),
        ...tipos.map(k => opcion({
          label: k, count: tipoCounts.get(k), checked: activa && state.tipos.has(k),
          onToggle: () => toggleTipo(col.key, k),
        })),
      ]));
    }, activa));
  });

  // Metal.
  const metalCounts = countBy(pool, 'metales', metalKey);
  state.metales.forEach(k => { if (!metalCounts.has(k)) metalCounts.set(k, 0); });
  const metales = [...metalCounts.entries()].sort((a, b) => {
    const [ga, sa] = metalOrder(a[0]), [gb, sb] = metalOrder(b[0]);
    return ga - gb || sa - sb || COLLATOR.compare(a[0], b[0]);
  });
  if (metales.length > 1 || state.metales.size) {
    body.appendChild(seccion('metal', 'Metal', resumenDe(state.metales), content => {
      content.appendChild(lista(metales.map(([k, n]) => opcion({
        label: k, count: n, checked: state.metales.has(k),
        onToggle: () => { toggleIn(state.metales, k); update(); },
      }))));
    }));
  }

  // Ingresos de la semana.
  const nuevosN = collapseGroups(filterExcept(pool, 'nuevos')).filter(isNewCard).length;
  if (nuevosN || state.nuevos) {
    body.appendChild(fila({
      label: 'Ingresos de la semana', activo: state.nuevos,
      onClick: () => update({ nuevos: !state.nuevos }),
    }));
  }

  // Precio: solo un tope.
  body.appendChild(seccion('precio', 'Precio',
    state.precioMax != null ? formatHasta(state.precioMax) : '',
    content => content.appendChild(campoPrecio())));

  // Estado de conservación.
  const gradeCounts = countBy(pool, 'estados', gradeKey);
  const grades = GRADES.filter(g => gradeCounts.get(g.key) || state.estados.has(g.key));
  if (grades.length > 1 || state.estados.size) {
    const elegidos = GRADES.filter(g => state.estados.has(g.key)).map(g => g.label);
    body.appendChild(seccion('estado', 'Conservación', resumenDe(elegidos), content => {
      content.appendChild(lista(grades.map(g => opcion({
        label: g.label, count: gradeCounts.get(g.key) || 0, checked: state.estados.has(g.key),
        onToggle: () => { toggleIn(state.estados, g.key); update(); },
      }))));
    }));
  }

  document.getElementById('filtros').scrollTop = keepScroll;
  if (escribiendo) {
    const input = document.getElementById('precioHasta');
    input.value = escribiendo.value;
    input.focus({ preventScroll: true });
    input.setSelectionRange(escribiendo.start, escribiendo.end);
  }
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
  update({ cat: '', tipos: new Set(), q: '', precioMax: null, nuevos: false, continentes: new Set(), paises: new Set(), metales: new Set(), estados: new Set() });
  document.getElementById('buscar').value = '';
}

function renderEstado(total) {
  const box = document.getElementById('catEstado');
  box.replaceChildren(el('strong', '', `${total.toLocaleString('es-AR')} ${total === 1 ? 'pieza' : 'piezas'}`));
  const chips = [];
  if (state.q.trim()) chips.push(chip(`"${state.q.trim()}"`, () => { document.getElementById('buscar').value = ''; update({ q: '' }); }));
  if (state.cat && !state.tipos.size) chips.push(chip(collectionOf(state.cat).label, () => update({ cat: '' })));
  state.tipos.forEach(k => chips.push(chip(k, () => {
    state.tipos.delete(k);
    if (!state.tipos.size) state.cat = '';
    update();
  })));
  if (state.nuevos) chips.push(chip('Ingresos de la semana', () => update({ nuevos: false })));
  state.continentes.forEach(k => chips.push(chip(k, () => { state.continentes.delete(k); update(); })));
  state.paises.forEach(k => chips.push(chip(k, () => { state.paises.delete(k); update(); })));
  state.metales.forEach(k => chips.push(chip(k, () => { state.metales.delete(k); update(); })));
  if (state.precioMax != null) {
    chips.push(chip(formatHasta(state.precioMax), () => update({ precioMax: null })));
  }
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
  if (col && state.tipos.size === 1) titulo = [...state.tipos][0];
  if (!col) {
    if (state.paises.size === 1) titulo = [...state.paises][0];
    else if (!state.paises.size && state.continentes.size === 1) titulo = [...state.continentes][0];
    else if (state.nuevos) titulo = 'Ingresos de la semana';
  }
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
  currentPool = pool;
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
  abrirLoElegido();
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
