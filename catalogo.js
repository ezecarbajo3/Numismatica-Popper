/**
 * Numismática Popper — catálogo.
 *
 * Grilla con filtros que se combinan, buscador y orden. El panel va de lo más
 * amplio a lo más fino, en el orden en que piensa quien compra:
 *
 *   1. Qué buscás   (monedas, inversión, medallas, lotes, libros, insumos)
 *   2. Origen       (Argentina y sus secciones · resto del mundo por
 *                    continente y país)
 *   3. Metal        (familias; en Inversión, la ley de la plata)
 *   4. Época
 *   5. Estado de conservación
 *   6. Precio       (desde / hasta, en la moneda que se está viendo)
 *   7. Novedades    (ingresos de la semana)
 *
 * Reglas:
 *   - Dentro de un filtro las opciones se SUMAN (Francia o Italia); entre
 *     filtros se CRUZAN (Francia y plata). Nunca se pisan entre sí.
 *   - Cada opción dice cuántas piezas tiene con el resto de los filtros
 *     aplicados. Las que quedan en cero se ven apagadas y no se pueden tocar:
 *     desde el panel no se llega a una grilla vacía.
 *   - Todo el estado vive en la URL. Cada cambio suma un paso al historial:
 *     "atrás" deshace el último filtro y un link filtrado se puede compartir.
 *     Lo que viene en la URL y no existe (un país sin piezas, un metal mal
 *     escrito) se descarta en vez de dejar la grilla vacía.
 *   - Sin búsqueda, se ven solo monedas (ni libros, ni medallas, ni insumos):
 *     "Qué buscás" lo dice a la vista. Buscando, se busca en todo.
 *   - Las variantes de un mismo grupo (group_id) van en UNA tarjeta.
 *   - Las vendidas se ven SOLD_RETENTION_DAYS días, al final.
 *
 * Rendimiento: se dibujan de a PAGE tarjetas ("Mostrar más"), sin blend ni
 * animación por tarjeta. Depende de common.js, categorias.js y museo.js.
 */

const PAGE = 48;
const SCROLL_KEY = 'popper_catalogo_scroll';

// ─── Definición de los filtros ───────────────────────────────────────────────

const esMoneda = (c) => !(isBook(c) || isMedalOrToken(c) || isInsumo(c));
const esInversion = (c) => isInvestment(c) || isGoldCoin(c);

// "Qué buscás". `oculto` son claves que solo llegan por links viejos.
const TIPOS = [
  { key: 'monedas',   label: 'Monedas',                titulo: 'Monedas',             match: esMoneda },
  { key: 'inversion', label: 'Inversión: oro y plata', titulo: 'Inversión',           match: esInversion },
  { key: 'medallas',  label: 'Medallas y fichas',      titulo: 'Medallas y fichas',   match: isMedalOrToken },
  { key: 'lotes',     label: 'Lotes y blísteres',      titulo: 'Lotes y blísteres',   match: isBlister },
  { key: 'libros',    label: 'Libros y catálogos',     titulo: 'Libros y catálogos',  match: isBook },
  { key: 'insumos',   label: 'Insumos',                titulo: 'Insumos',             match: isInsumo },
  { key: 'todo',      label: 'Todo',                   titulo: 'Todo el catálogo',    match: () => true },
  { key: 'varios',    label: 'Medallas, fichas, lotes y libros', titulo: 'Varios', oculto: true,
    match: (c) => isMedalOrToken(c) || isBook(c) || isBlister(c) },
];
const TIPO_DE = new Map(TIPOS.map(t => [t.key, t]));

const EPOCAS = [
  { key: 'antes-1900', label: 'Hasta 1899',        match: y => y <= 1899 },
  { key: '1900-1949',  label: '1900 a 1949',       match: y => y >= 1900 && y <= 1949 },
  { key: '1950-1999',  label: '1950 a 1999',       match: y => y >= 1950 && y <= 1999 },
  { key: '2000',       label: '2000 en adelante',  match: y => y >= 2000 },
];

const GRADES = [
  { key: 'SC', label: 'Sin circular' },
  { key: 'EX', label: 'Excelente' },
  { key: 'MB', label: 'Muy bueno' },
  { key: 'B',  label: 'Bueno' },
  { key: 'R',  label: 'Regular' },
];

const METALES = ['Oro', 'Plata', 'Cobre, bronce y latón', 'Níquel y cuproníquel', 'Bimetálicas', 'Aluminio', 'Acero y hierro', 'Otros'];

const SORTS = [
  { key: '',            label: 'País y año' },
  { key: 'nuevas',      label: 'Recién llegadas' },
  { key: 'precio',      label: 'Precio: de menor a mayor' },
  { key: 'precio-desc', label: 'Precio: de mayor a menor' },
  { key: 'antiguas',    label: 'Las más antiguas primero' },
  { key: 'modernas',    label: 'Las más modernas primero' },
  { key: 'estado',      label: 'Mejor conservadas primero' },
];

// Atajos de precio, según la moneda en la que se están viendo los precios.
const ATAJOS_PRECIO = { USD: [5, 20, 50, 100], ARS: [10000, 30000, 75000, 150000] };

// ─── Links viejos ────────────────────────────────────────────────────────────

// ?cat= era la colección. Cada clave vieja se traduce a los filtros de ahora.
const CAT_LEGACY = {
  argentina:         { arg: true },
  internacional:     { mundo: true },
  plata:             { ver: 'inversion' },
  inversion:         { ver: 'inversion' },
  economicas:        { mundo: true, precioMax: 5 },
  varios:            { ver: 'varios' },
  'medallas-libros': { ver: 'varios' },
  blisters:          { ver: 'lotes' },
  insumos:           { ver: 'insumos' },
  ingresos:          { nuevos: true },
  todas:             { ver: 'todo' },
};

// ?tipo= era el tipo dentro de Varios o de Inversión.
const TIPO_LEGACY = {
  'Blísteres': 'lotes', 'Lotes': 'lotes', 'Insumos': 'insumos', 'Libros': 'libros',
  'Medallas': 'medallas', 'Fichas': 'medallas',
};

const LEGACY_PRECIO = { '0-5': 5, '5-20': 20, '20-50': 50, '50-100': 100 };

const SEARCH_ALIASES = {
  usa: 'estados unidos', eeuu: 'estados unidos', uk: 'reino unido', urss: 'union sovietica',
  inglaterra: 'reino unido', holanda: 'paises bajos',
  insumo: 'insumos', sobres: 'sobre', carpetas: 'carpeta', folios: 'folio',
  carton: 'cartoncito', cartones: 'cartoncito',
};

const ARGENTINA_ORDER = {
  'Argentina - Patria': 1, 'Argentina - Confed. Arg.': 2, 'Argentina - Buenos Aires': 3, 'Argentina': 5,
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
let listo = false;

// Qué desplegables están abiertos. No va a la URL: es cómo quedó el panel, no
// qué se está filtrando. Los dos primeros arrancan abiertos: son por donde se
// empieza.
const abiertos = new Set(['ver', 'origen']);

const state = {
  ver: '',                  // '' = automático: monedas, o todo si se está buscando
  q: '',
  arg: false,               // toda Argentina
  secciones: new Set(),     // secciones de Argentina sueltas (Patria, Buenos Aires…)
  mundo: false,             // todo lo que no es Argentina
  continentes: new Set(),
  paises: new Set(),        // países sueltos (nunca Argentina)
  metales: new Set(),
  epocas: new Set(),
  estados: new Set(),
  precioMin: null,          // siempre en dólares
  precioMax: null,
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
    default: return key.startsWith('Argentina - ') ? `Argentina · ${key.slice(12)}` : key;
  }
}

// Cómo se llama cada sección de Argentina dentro del filtro de origen.
function seccionName(key) {
  switch (key) {
    case 'Argentina':                return 'República';
    case 'Argentina - Patria':       return 'Patria';
    case 'Argentina - Buenos Aires': return 'Buenos Aires';
    case 'Argentina - Confed. Arg.': return 'Confederación';
    default: return key.replace(/^Argentina - /, '');
  }
}

function tipoActual() {
  return state.ver || (searchTokens().length ? 'todo' : 'monedas');
}

// Un país sin continente cargado en categorias.js no queda afuera del filtro:
// va a "Otros".
function contOf(coin) {
  return continentOf(coin) || 'Otros';
}

// Metales en familias que un cliente reconoce.
function metalFamily(coin) {
  const m = String(coin.metal || '').toLowerCase();
  if (!m) return '';
  if (isGoldCoin(coin)) return 'Oro';
  if (m.includes('plata')) return 'Plata';
  if (m.includes('bimet')) return 'Bimetálicas';
  if (m.includes('níquel') || m.includes('niquel') || m.includes('acmonital')) return 'Níquel y cuproníquel';
  if (m.includes('bronce') || m.includes('cobre') || m.includes('latón') || m.includes('nórdico') || m.includes('bronzital')) return 'Cobre, bronce y latón';
  if (m.includes('aluminio')) return 'Aluminio';
  if (m.includes('acero') || m.includes('hierro')) return 'Acero y hierro';
  return 'Otros';
}

// En Inversión el metal se abre por ley: para quien invierte es lo primero.
function metalFino(coin) {
  if (isLotePlata(coin)) return 'Lotes de plata';
  if (isGoldCoin(coin)) return 'Oro';
  const m = String(coin.metal || '').toLowerCase();
  if (m.includes('plata')) {
    const purity = getSilverPurity(coin);
    return purity ? `Plata .${purity}` : 'Plata sin ley indicada';
  }
  return metalFamily(coin);
}

function metalOptionKey(coin) {
  return tipoActual() === 'inversion' ? metalFino(coin) : metalFamily(coin);
}

function metalOrder(key) {
  const i = METALES.indexOf(key);
  if (i >= 0) return [i, 0];
  if (key.startsWith('Plata')) return [1, -(parseInt(key.replace(/\D/g, ''), 10) || 0)];
  if (key === 'Lotes de plata') return [1, 1];
  return [METALES.length, 0];
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

function yearOf(coin) {
  const y = Number(coin.year);
  return Number.isFinite(y) && y > 0 ? y : null;
}

function epocaKey(coin) {
  const y = yearOf(coin);
  if (y == null) return '';
  const e = EPOCAS.find(x => x.match(y));
  return e ? e.key : '';
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

// Minúsculas, sin acentos y sin signos: "CJ# 19" y "cj 19" son lo mismo.
function normalizeSearch(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[#"'’“”().,;:\/\-–]/g, ' ').replace(/\s+/g, ' ').trim();
}

// El texto de búsqueda de cada pieza se arma una vez al cargar.
function prepareCoins() {
  for (const coin of allCoins) {
    coin._ref = normalizeSearch(coin.reference);
    coin._searchText = ` ${normalizeSearch([
      coin.id, coin.title, coin.group_label, countryName(countryKey(coin)), coin.country,
      continentOf(coin), coin.metal, coin.year, coin.description, coin.commemorates,
      coin.reference, coin.grade, coin.grade_short,
      isBook(coin) ? 'libro catalogo' : '', isInsumo(coin) ? 'insumos' : '',
      isMedal(coin) ? 'medalla' : '', isToken(coin) ? 'ficha token' : '',
    ].filter(Boolean).join(' '))} `;
  }
}

// La búsqueda se parte en palabras y cada una tiene que estar, en cualquier
// orden: "argentina 1882" y "1882 argentina" dan lo mismo. Se cachea por texto.
// Prefijos de los catálogos de referencia (Janson, Krause, Yeoman…).
const REF_RE = /^(cj|km|y|x|n|pn|tn|sch|kr|jm|c) ?\d+[a-z]?(\.\d+)?$/;

let tokensCache = { q: null, tokens: [], ref: '', frase: '' };

function searchInfo() {
  if (tokensCache.q === state.q) return tokensCache;
  const frase = normalizeSearch(state.q);
  const tokens = frase ? frase.split(' ').map(t => SEARCH_ALIASES[t] || t) : [];
  // "cj 19", "km 172a": es una referencia de catálogo y se busca exacta, no
  // como dos palabras sueltas (19 está en todos los 19xx).
  const ref = REF_RE.test(frase) ? frase.replace(/^([a-z]+) ?/, '$1 ') : '';
  tokensCache = { q: state.q, tokens, ref, frase };
  return tokensCache;
}

function searchTokens() {
  return searchInfo().tokens;
}

// Una palabra coincide si alguna del texto EMPIEZA con ella ("peso" encuentra
// "pesos", pero "oro" no encuentra "tesoro"), o sin su plural ("pesos"
// encuentra "peso").
function tokenMatches(text, token) {
  if (text.includes(` ${token}`)) return true;
  if (token.length > 4 && token.endsWith('es') && text.includes(` ${token.slice(0, -2)}`)) return true;
  if (token.length > 3 && token.endsWith('s') && text.includes(` ${token.slice(0, -1)}`)) return true;
  return false;
}

function matchesSearch(coin) {
  const info = searchInfo();
  if (!info.tokens.length) return true;
  if (info.ref) {
    const r = ` ${coin._ref || ''} `;
    return r.includes(` ${info.ref} `);
  }
  const text = coin._searchText || '';
  return info.tokens.every(t => tokenMatches(text, t));
}

// Para ordenar: primero lo que tiene la frase tal cual o la referencia exacta.
function searchScore(coin) {
  const info = searchInfo();
  if (!info.frase) return 0;
  return (coin._searchText || '').includes(` ${info.frase}`) ? 1 : 0;
}

// ─── Filtrado ────────────────────────────────────────────────────────────────

function geoActivo() {
  return state.arg || state.mundo || state.secciones.size || state.continentes.size || state.paises.size;
}

// Cada filtro por separado, para poder contar las opciones de uno aplicando
// todos los demás (así los números de cada opción son siempre ciertos).
const MATCHERS = {
  ver(coin) { return TIPO_DE.get(tipoActual()).match(coin); },
  q: matchesSearch,
  // Origen: todo lo elegido se suma.
  geo(coin) {
    if (!geoActivo()) return true;
    if (isArgentinaCoin(coin)) return state.arg || state.secciones.has(countryKey(coin));
    return state.mundo || state.paises.has(filterCountryOf(coin)) || state.continentes.has(contOf(coin));
  },
  metales(coin) {
    return !state.metales.size || state.metales.has(metalFamily(coin)) || state.metales.has(metalFino(coin));
  },
  epocas(coin) { return !state.epocas.size || state.epocas.has(epocaKey(coin)); },
  estados(coin) { return !state.estados.size || state.estados.has(gradeKey(coin)); },
  precio(coin) {
    if (state.precioMin == null && state.precioMax == null) return true;
    const p = groupPrice(coin);
    if (!Number.isFinite(p)) return false;
    return (state.precioMin == null || p >= state.precioMin) && (state.precioMax == null || p <= state.precioMax);
  },
  nuevos(coin) { return !state.nuevos || isNewCard(coin); },
};

function baseCoins() {
  return allCoins.filter(c => !c.hidden && !isSoldExpired(c));
}

function filterExcept(pool, skip) {
  return pool.filter(coin => Object.entries(MATCHERS).every(([k, fn]) => k === skip || fn(coin)));
}

// Una tarjeta es una pieza suelta o un grupo entero de variantes.
function cardId(coin) {
  return coin.group_id ? `g:${coin.group_id}` : `c:${coin.id}`;
}

// Cuántas tarjetas distintas hay en una lista de monedas.
function cardCount(coins) {
  return new Set(coins.map(cardId)).size;
}

// Cuántas tarjetas (no monedas sueltas) hay por cada valor de un filtro. Se
// cuenta sobre las monedas, no sobre la que representa a cada grupo: si un
// grupo tiene una variante de aluminio, suma en aluminio aunque su tapa no lo
// sea. Así el número de la opción es exactamente lo que se ve al elegirla.
function countBy(pool, skip, keyFn) {
  const sets = new Map();
  for (const coin of filterExcept(pool, skip)) {
    const key = keyFn(coin);
    if (!key) continue;
    if (!sets.has(key)) sets.set(key, new Set());
    sets.get(key).add(cardId(coin));
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}

// ─── Orden ───────────────────────────────────────────────────────────────────

function faceValue(title) {
  const m = String(title || '').match(/^(\d+(?:\.\d+)?)\s/);
  return m ? parseFloat(m[1]) : 1;
}

// Lo que no es moneda va después de las monedas en el orden de siempre.
function claseOrden(coin) {
  if (isInsumo(coin)) return 4;
  if (isBook(coin)) return 3;
  if (isMedalOrToken(coin)) return 2;
  if (isBlister(coin)) return 1;
  return 0;
}

// El orden de siempre: país A→Z (Argentina por secciones), año, valor facial.
// En Inversión va primero el oro y después manda la ley de la plata.
function compareDefault(a, b) {
  if (tipoActual() === 'inversion') {
    const oro = (isGoldCoin(a) ? 0 : 1) - (isGoldCoin(b) ? 0 : 1);
    if (oro) return oro;
    const lot = (isLotePlata(a) ? 0 : 1) - (isLotePlata(b) ? 0 : 1);
    if (lot) return lot;
    const pur = getSilverPurity(b) - getSilverPurity(a);
    if (pur) return pur;
    return (Number(a.year) || 0) - (Number(b.year) || 0);
  }
  const clase = claseOrden(a) - claseOrden(b);
  if (clase) return clase;
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

// Lo que no tiene dato (sin precio, sin año, sin estado) va siempre al final.
function compareNullable(va, vb, dir) {
  const aOk = va != null && Number.isFinite(va), bOk = vb != null && Number.isFinite(vb);
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  if (!aOk && !bOk) return 0;
  return (va - vb) * dir;
}

function sortCards(cards) {
  const list = cards.slice();
  const rank = c => gradeRank(c) || null;
  const by = {
    nuevas: (a, b) => publishTs(b) - publishTs(a),
    precio: (a, b) => compareNullable(groupPrice(a), groupPrice(b), 1),
    'precio-desc': (a, b) => compareNullable(groupPrice(a), groupPrice(b), -1),
    antiguas: (a, b) => compareNullable(yearOf(a), yearOf(b), 1),
    modernas: (a, b) => compareNullable(yearOf(a), yearOf(b), -1),
    estado: (a, b) => compareNullable(rank(a), rank(b), -1),
  }[state.orden];
  const buscando = !by && searchTokens().length > 0;
  list.sort((a, b) => {
    // Las vendidas, al final: se muestran para que se vea movimiento, pero no
    // le ganan lugar a lo que se puede comprar.
    const sold = (a.status === 'sold') - (b.status === 'sold');
    if (sold) return sold;
    if (buscando) {
      const s = searchScore(b) - searchScore(a);
      if (s) return s;
    }
    return (by && by(a, b)) || compareDefault(a, b);
  });
  return list;
}

// ─── URL ─────────────────────────────────────────────────────────────────────

function num(value) {
  const n = parseFloat(String(value || '').replace(',', '.'));
  return n > 0 ? n : null;
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  const legacy = CAT_LEGACY[p.get('cat') || p.get('categoria') || p.get('category') || ''] || {};

  const ver = p.get('ver') || legacy.ver || '';
  state.ver = TIPO_DE.has(ver) ? ver : '';
  state.q = p.get('q') || p.get('buscar') || p.get('search') || '';

  const origen = p.getAll('origen');
  state.arg = origen.includes('argentina') || !!legacy.arg;
  state.mundo = origen.includes('mundo') || !!legacy.mundo;
  state.secciones = new Set(p.getAll('seccion').map(v => normalizeCountryValue(v.startsWith('Argentina') ? v : `Argentina - ${v}`))
    .map(v => (v === 'Argentina - República' ? 'Argentina' : v)));
  state.continentes = new Set(p.getAll('continente'));
  state.paises = new Set();
  p.getAll('pais').forEach(v => {
    const n = normalizeCountryValue(v);
    if (n === 'Argentina') state.arg = true;
    else if (n.startsWith('Argentina')) state.secciones.add(n);
    else state.paises.add(n);
  });

  state.metales = new Set(p.getAll('metal'));
  // ?tipo= viejo: un tipo de Varios pasa a "Qué buscás"; uno de Inversión, a metal.
  p.getAll('tipo').forEach(v => {
    if (TIPO_LEGACY[v]) state.ver = TIPO_LEGACY[v];
    else state.metales.add(v);
  });
  state.epocas = new Set(p.getAll('epoca').filter(k => EPOCAS.some(e => e.key === k)));
  state.estados = new Set(p.getAll('estado').filter(k => GRADES.some(g => g.key === k)));
  state.precioMin = num(p.get('desde'));
  state.precioMax = num(p.get('hasta')) || LEGACY_PRECIO[p.get('precio')] || legacy.precioMax || null;
  if (state.precioMin != null && state.precioMax != null && state.precioMin > state.precioMax) {
    [state.precioMin, state.precioMax] = [state.precioMax, state.precioMin];
  }
  state.nuevos = p.get('nuevos') === '1' || !!legacy.nuevos;
  state.orden = SORTS.some(s => s.key === p.get('orden')) ? p.get('orden') : '';
  normalizeGeo();
}

// Lo elegido adentro de algo que ya está elegido entero sobra.
function normalizeGeo() {
  if (state.arg) state.secciones.clear();
  if (state.mundo) { state.continentes.clear(); state.paises.clear(); }
}

// Con las monedas ya cargadas: lo que vino en la URL y no existe en el
// catálogo se descarta, así un link viejo o mal escrito no deja la grilla
// vacía con un filtro fantasma.
function sanitizeState(pool) {
  const paises = new Set(), conts = new Set(), secciones = new Set(), metales = new Set(['Lotes de plata']);
  pool.forEach(c => {
    if (isArgentinaCoin(c)) secciones.add(countryKey(c));
    else { paises.add(filterCountryOf(c)); conts.add(contOf(c)); }
    metales.add(metalFamily(c));
    metales.add(metalFino(c));
  });
  const keep = (set, valid) => [...set].forEach(v => { if (!valid.has(v)) set.delete(v); });
  keep(state.paises, paises);
  keep(state.continentes, conts);
  keep(state.secciones, secciones);
  keep(state.metales, metales);
  // Un país suelto de un continente que ya está entero sobra.
  [...state.paises].forEach(k => { if (state.continentes.has(continenteDePais(k))) state.paises.delete(k); });
}

let contDePais = new Map();

function continenteDePais(pais) {
  return contDePais.get(pais) || CONTINENT_OF.get(pais) || 'Otros';
}

function buildQuery() {
  const p = new URLSearchParams();
  if (state.ver) p.set('ver', state.ver);
  if (state.q.trim()) p.set('q', state.q.trim());
  if (state.arg) p.append('origen', 'argentina');
  if (state.mundo) p.append('origen', 'mundo');
  state.secciones.forEach(v => p.append('seccion', seccionName(v)));
  state.continentes.forEach(v => p.append('continente', v));
  state.paises.forEach(v => p.append('pais', v));
  state.metales.forEach(v => p.append('metal', v));
  state.epocas.forEach(v => p.append('epoca', v));
  state.estados.forEach(v => p.append('estado', v));
  if (state.precioMin != null) p.set('desde', String(state.precioMin));
  if (state.precioMax != null) p.set('hasta', String(state.precioMax));
  if (state.nuevos) p.set('nuevos', '1');
  if (state.orden) p.set('orden', state.orden);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

// `replace` para lo que se va escribiendo (buscador, precio): si cada letra
// fuera un paso, "atrás" no serviría.
function writeUrl(replace) {
  const qs = buildQuery();
  if (qs === location.search) return;
  const url = qs || location.pathname;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

function activeFilterCount() {
  return (state.ver && state.ver !== 'monedas' ? 1 : 0) + (state.arg ? 1 : 0) + (state.mundo ? 1 : 0) +
    state.secciones.size + state.continentes.size + state.paises.size + state.metales.size +
    state.epocas.size + state.estados.size +
    (state.precioMin != null || state.precioMax != null ? 1 : 0) + (state.nuevos ? 1 : 0);
}

// ─── Panel de filtros ────────────────────────────────────────────────────────

// `checked` puede ser 'mixed': algo con solo una parte de lo de adentro elegido.
// Una opción sin piezas se ve apagada y no se puede tocar (salvo que esté
// elegida: tiene que poder sacarse).
function opcion({ label, count, checked, radio, onToggle }) {
  const li = el('li');
  const btn = el('button', `opcion${radio ? ' opcion--radio' : ''}`);
  btn.type = 'button';
  btn.setAttribute('role', radio ? 'radio' : 'checkbox');
  btn.setAttribute('aria-checked', checked === 'mixed' ? 'mixed' : String(!!checked));
  const box = el('span', 'opcion__box');
  box.innerHTML = ICON_CHECK;
  btn.append(box, el('span', 'opcion__label', label));
  if (count != null) {
    const n = el('span', 'opcion__count', String(count));
    n.setAttribute('aria-label', count === 1 ? '1 pieza' : `${count} piezas`);
    btn.appendChild(n);
    if (!count && !checked) {
      btn.disabled = true;
      btn.classList.add('is-vacia');
    }
  }
  btn.addEventListener('click', onToggle);
  li.appendChild(btn);
  return li;
}

// Una sección del panel: un renglón con el nombre y la flecha que despliega lo
// de abajo. `resumen` es lo elegido adentro, para que se lea aunque esté cerrada.
function seccion(key, label, resumen, fill) {
  const box = el('div', 'filtro');
  const btn = el('button', `filtro__toggle${resumen ? ' is-activo' : ''}`);
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
    focusToggle(label);
  });
  box.appendChild(btn);
  if (abiertos.has(key)) {
    const content = el('div', 'filtro__contenido');
    fill(content);
    box.appendChild(content);
  }
  return box;
}

// El panel se rearma entero en cada cambio: el foco vuelve a donde estaba.
function focusToggle(label) {
  const btn = [...document.querySelectorAll('#filtrosCuerpo .filtro__toggle')]
    .find(b => b.firstChild && b.firstChild.textContent === label);
  if (btn) btn.focus({ preventScroll: true });
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

// Las secciones arrancan abiertas si adentro hay algo elegido.
function abrirLoElegido() {
  if (state.secciones.size) abiertos.add('arg');
  state.continentes.forEach(k => abiertos.add(`cont:${k}`));
  state.paises.forEach(k => abiertos.add(`cont:${continenteDePais(k)}`));
  if (geoActivo()) abiertos.add('origen');
  if (state.metales.size) abiertos.add('metal');
  if (state.epocas.size) abiertos.add('epoca');
  if (state.estados.size) abiertos.add('estado');
  if (state.precioMin != null || state.precioMax != null) abiertos.add('precio');
}

// ─── Origen ──────────────────────────────────────────────────────────────────
//
// Un árbol: Argentina → secciones; Resto del mundo → continentes → países.
// Elegir algo entero limpia lo suelto de adentro; tocar algo de adentro de un
// entero lo cambia por "todo menos eso". Nada se pisa con otra rama.

let geoInfo = { secciones: new Map(), conts: new Map() };

function toggleArg() {
  state.arg = !state.arg;
  state.secciones.clear();
  update();
}

function toggleSeccion(key) {
  if (state.arg) {
    state.arg = false;
    state.secciones = new Set([...geoInfo.secciones.keys()].filter(k => k !== key));
  } else {
    toggleIn(state.secciones, key);
    // Con todas las secciones elegidas, es Argentina entera.
    if (geoInfo.secciones.size > 1 && [...geoInfo.secciones.keys()].every(k => state.secciones.has(k))) {
      state.arg = true;
      state.secciones.clear();
    }
  }
  update();
}

function toggleMundo() {
  state.mundo = !state.mundo;
  state.continentes.clear();
  state.paises.clear();
  update();
}

function toggleContinente(key) {
  if (state.mundo) {
    state.mundo = false;
    state.continentes = new Set([...geoInfo.conts.keys()].filter(k => k !== key));
  } else if (state.continentes.has(key)) {
    state.continentes.delete(key);
  } else {
    state.continentes.add(key);
    [...state.paises].forEach(p => { if (continenteDePais(p) === key) state.paises.delete(p); });
  }
  update();
}

function togglePais(key, continente) {
  const hermanos = [...(geoInfo.conts.get(continente)?.paises.keys() || [])];
  if (state.mundo) {
    state.mundo = false;
    state.continentes = new Set([...geoInfo.conts.keys()].filter(k => k !== continente));
    hermanos.forEach(p => { if (p !== key) state.paises.add(p); });
  } else if (state.continentes.has(continente)) {
    state.continentes.delete(continente);
    hermanos.forEach(p => { if (p !== key) state.paises.add(p); });
  } else {
    toggleIn(state.paises, key);
  }
  update();
}

// Una rama: casilla + nombre + conteo y, aparte, la flecha que abre lo de adentro.
function rama({ key, label, count, checked, onToggle, hijos, abrirLabel }) {
  const li = el('li', 'rama');
  const fila = el('div', 'rama__fila');
  fila.appendChild(opcion({ label, count, checked, onToggle }).firstChild);
  if (hijos && hijos.length) {
    const abrir = el('button', 'rama__abrir');
    abrir.type = 'button';
    abrir.setAttribute('aria-expanded', String(abiertos.has(key)));
    abrir.setAttribute('aria-label', abrirLabel);
    abrir.innerHTML = `<span class="chev">${ICON_CHEV}</span>`;
    abrir.addEventListener('click', () => {
      toggleIn(abiertos, key);
      renderFiltros(currentPool);
      const again = document.querySelector(`#filtrosCuerpo .rama__abrir[aria-label="${abrirLabel}"]`);
      if (again) again.focus({ preventScroll: true });
    });
    fila.appendChild(abrir);
  }
  li.appendChild(fila);
  if (hijos && hijos.length && abiertos.has(key)) {
    const sub = el('ul', 'opciones subopciones');
    hijos.forEach(h => sub.appendChild(h));
    li.appendChild(sub);
  }
  return li;
}

function renderOrigen(pool) {
  // Qué hay en el catálogo (para saber qué países existen) y cuántas piezas
  // tiene cada cosa con el resto de los filtros puestos.
  const secciones = new Map(), conts = new Map();
  pool.forEach(c => {
    if (!TIPO_DE.get(tipoActual()).match(c)) return;
    if (isArgentinaCoin(c)) { secciones.set(countryKey(c), 0); return; }
    const cont = contOf(c);
    if (!conts.has(cont)) conts.set(cont, { n: 0, paises: new Map() });
    conts.get(cont).paises.set(filterCountryOf(c), 0);
  });
  const sinGeo = filterExcept(pool, 'geo');
  const nArg = cardCount(sinGeo.filter(isArgentinaCoin));
  const nMundo = cardCount(sinGeo.filter(c => !isArgentinaCoin(c)));
  countBy(pool, 'geo', c => (isArgentinaCoin(c) ? countryKey(c) : '')).forEach((n, k) => secciones.set(k, n));
  countBy(pool, 'geo', c => (isArgentinaCoin(c) ? '' : contOf(c))).forEach((n, k) => { if (conts.has(k)) conts.get(k).n = n; });
  countBy(pool, 'geo', c => (isArgentinaCoin(c) ? '' : filterCountryOf(c))).forEach((n, k) => {
    const info = conts.get(continenteDePais(k));
    if (info) info.paises.set(k, n);
  });
  geoInfo = { secciones, conts };

  const items = [];
  if (secciones.size || state.arg) {
    const orden = [...secciones.keys()].sort((a, b) =>
      (ARGENTINA_ORDER[a] || 4) - (ARGENTINA_ORDER[b] || 4) || COLLATOR.compare(a, b));
    items.push(rama({
      key: 'arg', label: 'Argentina', count: nArg, abrirLabel: 'Ver secciones de Argentina',
      checked: state.arg ? true : (state.secciones.size ? 'mixed' : false),
      onToggle: toggleArg,
      hijos: orden.length > 1 ? orden.map(k => opcion({
        label: seccionName(k), count: secciones.get(k),
        checked: state.arg || state.secciones.has(k),
        onToggle: () => toggleSeccion(k),
      })) : null,
    }));
  }

  if (conts.size || state.mundo) {
    const algo = state.continentes.size || state.paises.size;
    items.push(opcion({
      label: 'Resto del mundo', count: nMundo,
      checked: state.mundo ? true : (algo ? 'mixed' : false),
      onToggle: toggleMundo,
    }));
    const ordenConts = [...CONTINENTS.map(c => c.key), 'Otros'].filter(k => conts.has(k));
    const subs = ordenConts.map(k => {
      const info = conts.get(k);
      const sueltos = [...state.paises].filter(p => continenteDePais(p) === k).length;
      const entero = state.mundo || state.continentes.has(k);
      const paises = [...info.paises.entries()]
        // Los países sin piezas con estos filtros no se listan (serían decenas
        // de renglones apagados); los elegidos se ven siempre.
        .filter(([p, n]) => n > 0 || state.paises.has(p))
        .sort((a, b) => COLLATOR.compare(a[0], b[0]));
      return rama({
        key: `cont:${k}`, label: k, count: info.n, abrirLabel: `Ver países de ${k}`,
        checked: entero ? true : (sueltos ? 'mixed' : false),
        onToggle: () => toggleContinente(k),
        hijos: paises.map(([p, n]) => opcion({
          label: p, count: n, checked: entero || state.paises.has(p),
          onToggle: () => togglePais(p, k),
        })),
      });
    });
    const sub = el('li');
    const ul = el('ul', 'opciones subopciones');
    subs.forEach(s => ul.appendChild(s));
    sub.appendChild(ul);
    items.push(sub);
  }
  return lista(items);
}

function origenResumen() {
  const partes = [];
  if (state.arg) partes.push('Argentina');
  state.secciones.forEach(k => partes.push(seccionName(k)));
  if (state.mundo) partes.push('Resto del mundo');
  state.continentes.forEach(k => partes.push(k));
  state.paises.forEach(k => partes.push(k));
  return resumenDe(partes);
}

// ─── Precio ──────────────────────────────────────────────────────────────────

// El filtro guarda dólares; el campo se muestra y se escribe en la moneda en
// la que se están viendo los precios.
function precioAVista(usd) {
  if (usd == null) return '';
  if (getCurrency() === 'ARS') return String(Math.round(usd * getBlueRate() / 100) * 100);
  return String(Math.round(usd * 100) / 100).replace('.', ',');
}

function precioDeVista(text) {
  const n = parseFloat(String(text).replace(/\./g, getCurrency() === 'ARS' ? '' : '.').replace(',', '.'));
  if (!(n > 0)) return null;
  return getCurrency() === 'ARS' ? Math.round(n / getBlueRate() * 100) / 100 : n;
}

function formatMonto(usd) {
  if (getCurrency() === 'ARS') return formatPriceARS(usd * getBlueRate());
  return `${String(Math.round(usd * 100) / 100).replace('.', ',')} USD`;
}

function precioResumen() {
  const a = state.precioMin, b = state.precioMax;
  if (a != null && b != null) return `De ${formatMonto(a)} a ${formatMonto(b)}`;
  if (a != null) return `Desde ${formatMonto(a)}`;
  if (b != null) return `Hasta ${formatMonto(b)}`;
  return '';
}

function campoPrecio() {
  const wrap = el('div', 'precio');
  const ars = getCurrency() === 'ARS';
  const fila = el('div', 'precio__campos');
  const campo = (id, texto, value, key) => {
    const label = el('label', 'precio__campo');
    label.appendChild(el('span', '', texto));
    const input = el('input');
    input.id = id;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.placeholder = ars ? '$' : 'USD';
    input.setAttribute('aria-label', `Precio ${texto.toLowerCase()}, en ${ars ? 'pesos' : 'dólares'}`);
    input.value = precioAVista(value);
    const aplicar = () => {
      clearTimeout(precioTimer);
      const v = precioDeVista(input.value);
      if (v === state[key]) return;
      state[key] = v;
      if (state.precioMin != null && state.precioMax != null && state.precioMin > state.precioMax) {
        // Al revés: se acomoda solo en vez de dejar la grilla vacía.
        [state.precioMin, state.precioMax] = [state.precioMax, state.precioMin];
      }
      update(null, { replace: true });
    };
    input.addEventListener('input', () => {
      clearTimeout(precioTimer);
      precioTimer = setTimeout(aplicar, 600);
    });
    input.addEventListener('change', aplicar);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { aplicar(); input.blur(); } });
    label.appendChild(input);
    return label;
  };
  fila.append(
    campo('precioDesde', 'Desde', state.precioMin, 'precioMin'),
    campo('precioHasta', 'Hasta', state.precioMax, 'precioMax'),
  );
  wrap.appendChild(fila);

  // Atajos: un toque y listo.
  const atajos = el('div', 'precio__atajos');
  ATAJOS_PRECIO[ars ? 'ARS' : 'USD'].forEach(monto => {
    const usd = ars ? Math.round(monto / getBlueRate() * 100) / 100 : monto;
    const activo = state.precioMin == null && state.precioMax != null && Math.abs(state.precioMax - usd) < 0.005;
    const b = el('button', `atajo${activo ? ' is-activo' : ''}`,
      `Hasta ${ars ? `$${monto.toLocaleString('es-AR')}` : `${monto} USD`}`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(activo));
    b.addEventListener('click', () => update(activo ? { precioMax: null } : { precioMin: null, precioMax: usd }));
    atajos.appendChild(b);
  });
  wrap.appendChild(atajos);
  wrap.appendChild(el('p', 'precio__nota', ars
    ? 'En pesos, al dólar blue del día.'
    : 'En dólares. Podés ver todo en pesos desde el menú de arriba.'));
  return wrap;
}

// ─── Render del panel ────────────────────────────────────────────────────────

function renderFiltros(pool) {
  const body = document.getElementById('filtrosCuerpo');
  const scroller = document.getElementById('filtrosScroll');
  const keepScroll = scroller.scrollTop;
  // El panel se rearma con cada filtro: si se estaba escribiendo un precio, se
  // le devuelve el foco y el cursor.
  const act = document.activeElement;
  const escribiendo = act && (act.id === 'precioHasta' || act.id === 'precioDesde')
    ? { id: act.id, value: act.value, start: act.selectionStart, end: act.selectionEnd } : null;
  body.replaceChildren();

  // 1. Qué buscás.
  const tipo = tipoActual();
  const sinTipo = filterExcept(pool, 'ver');
  body.appendChild(seccion('ver', 'Qué buscás',
    tipo !== 'monedas' ? TIPO_DE.get(tipo).titulo : '', content => {
      content.appendChild(lista(TIPOS.filter(t => !t.oculto || t.key === tipo).map(t => opcion({
        label: t.label, count: cardCount(sinTipo.filter(t.match)), radio: true, checked: t.key === tipo,
        // "Monedas" sin buscar es lo de siempre y no ensucia la URL.
        onToggle: () => update({ ver: t.key === 'monedas' && !searchTokens().length ? '' : t.key }),
      }))));
    }));

  // 2. Origen.
  const origen = renderOrigen(pool);
  if (origen.children.length) {
    body.appendChild(seccion('origen', 'Origen', origenResumen(), content => content.appendChild(origen)));
  }

  // 3. Metal.
  const metalCounts = countBy(pool, 'metales', metalOptionKey);
  const metalKeys = tipo === 'inversion'
    ? [...new Set([...metalCounts.keys(), ...state.metales])]
    : [...new Set([...METALES, ...state.metales])];
  metalKeys.sort((a, b) => {
    const [ga, sa] = metalOrder(a), [gb, sb] = metalOrder(b);
    return ga - gb || sa - sb || COLLATOR.compare(a, b);
  });
  // Un metal elegido que no es de esta lista (una ley fina fuera de
  // Inversión) se cuenta con su propia clave.
  const conteoMetal = k => metalCounts.get(k) ??
    cardCount(filterExcept(pool, 'metales').filter(c => metalFino(c) === k || metalFamily(c) === k));
  body.appendChild(seccion('metal', 'Metal', resumenDe(state.metales), content => {
    content.appendChild(lista(metalKeys.map(k => opcion({
      label: k, count: conteoMetal(k), checked: state.metales.has(k),
      onToggle: () => { toggleIn(state.metales, k); update(); },
    }))));
  }));

  // 4. Época.
  const epocaCounts = countBy(pool, 'epocas', epocaKey);
  body.appendChild(seccion('epoca', 'Época',
    resumenDe(EPOCAS.filter(e => state.epocas.has(e.key)).map(e => e.label)), content => {
      content.appendChild(lista(EPOCAS.map(e => opcion({
        label: e.label, count: epocaCounts.get(e.key) || 0, checked: state.epocas.has(e.key),
        onToggle: () => { toggleIn(state.epocas, e.key); update(); },
      }))));
    }));

  // 5. Estado de conservación.
  const gradeCounts = countBy(pool, 'estados', gradeKey);
  body.appendChild(seccion('estado', 'Estado',
    resumenDe(GRADES.filter(g => state.estados.has(g.key)).map(g => g.label)), content => {
      content.appendChild(lista(GRADES.map(g => opcion({
        label: `${g.label} (${g.key})`, count: gradeCounts.get(g.key) || 0, checked: state.estados.has(g.key),
        onToggle: () => { toggleIn(state.estados, g.key); update(); },
      }))));
      const guia = el('a', 'filtro__ayuda', '¿Qué significa cada estado?');
      guia.href = 'conservacion.html';
      content.appendChild(guia);
    }));

  // 6. Precio.
  body.appendChild(seccion('precio', 'Precio', precioResumen(), content => content.appendChild(campoPrecio())));

  // 7. Novedades: un renglón con su casilla, sin desplegar.
  const nuevosN = cardCount(filterExcept(pool, 'nuevos').filter(isNewCard));
  const nov = el('div', 'filtro filtro--suelto');
  nov.appendChild(lista([opcion({
    label: 'Solo ingresos de la semana', count: nuevosN, checked: state.nuevos,
    onToggle: () => update({ nuevos: !state.nuevos }),
  })]));
  body.appendChild(nov);

  scroller.scrollTop = keepScroll;
  if (escribiendo) {
    const input = document.getElementById(escribiendo.id);
    if (input) {
      input.value = escribiendo.value;
      input.focus({ preventScroll: true });
      input.setSelectionRange(escribiendo.start, escribiendo.end);
    }
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
  update({
    ver: '', q: '', arg: false, mundo: false, secciones: new Set(), continentes: new Set(), paises: new Set(),
    metales: new Set(), epocas: new Set(), estados: new Set(), precioMin: null, precioMax: null, nuevos: false,
  });
  syncControls();
}

function plural(n) {
  return `${n.toLocaleString('es-AR')} ${n === 1 ? 'pieza' : 'piezas'}`;
}

function renderEstado(total) {
  const box = document.getElementById('catEstado');
  box.replaceChildren(el('strong', '', plural(total)));
  const chips = [];
  const del = (set, k) => () => { set.delete(k); update(); };
  if (state.q.trim()) chips.push(chip(`“${state.q.trim()}”`, () => { update({ q: '' }); syncControls(); }));
  if (state.ver && state.ver !== 'monedas') chips.push(chip(TIPO_DE.get(state.ver).titulo, () => update({ ver: '' })));
  if (state.arg) chips.push(chip('Argentina', () => update({ arg: false })));
  state.secciones.forEach(k => chips.push(chip(`Argentina · ${seccionName(k)}`, del(state.secciones, k))));
  if (state.mundo) chips.push(chip('Resto del mundo', () => update({ mundo: false })));
  state.continentes.forEach(k => chips.push(chip(k, del(state.continentes, k))));
  state.paises.forEach(k => chips.push(chip(k, del(state.paises, k))));
  state.metales.forEach(k => chips.push(chip(k, del(state.metales, k))));
  EPOCAS.forEach(e => { if (state.epocas.has(e.key)) chips.push(chip(e.label, del(state.epocas, e.key))); });
  GRADES.forEach(g => { if (state.estados.has(g.key)) chips.push(chip(g.label, del(state.estados, g.key))); });
  if (precioResumen()) chips.push(chip(precioResumen(), () => update({ precioMin: null, precioMax: null })));
  if (state.nuevos) chips.push(chip('Ingresos de la semana', () => update({ nuevos: false })));
  chips.forEach(c => box.appendChild(c));
  if (chips.length) {
    const all = el('button', 'chip chip--limpiar', 'Limpiar todo');
    all.type = 'button';
    all.addEventListener('click', clearAll);
    box.appendChild(all);
  }

  const n = activeFilterCount();
  document.getElementById('abrirFiltrosTexto').textContent = n ? `Filtrar (${n})` : 'Filtrar';
  document.getElementById('filtrosVer').textContent = `Ver ${plural(total)}`;
  document.getElementById('filtrosLimpiar').hidden = !chips.length;
}

function tituloActual() {
  const tipo = tipoActual();
  const base = tipo === 'todo' ? 'Catálogo' : TIPO_DE.get(tipo).titulo;
  const lugares = [];
  if (state.arg) lugares.push('Argentina');
  else if (state.secciones.size === 1) lugares.push(`Argentina · ${seccionName([...state.secciones][0])}`);
  else if (state.secciones.size) lugares.push('Argentina');
  if (state.mundo) lugares.push('todo el mundo');
  state.continentes.forEach(k => lugares.push(k));
  state.paises.forEach(k => lugares.push(k));
  if (lugares.length === 1) return `${base} de ${lugares[0]}`;
  if (state.nuevos && !lugares.length) return tipo === 'monedas' ? 'Ingresos de la semana' : `${base}: ingresos de la semana`;
  if (tipo === 'monedas' && !lugares.length) return state.q.trim() ? `Resultados para “${state.q.trim()}”` : 'Todas las monedas';
  return base;
}

function renderTitulo(total) {
  const titulo = tituloActual();
  const head = document.getElementById('catTitulo');
  head.textContent = titulo;
  // Con todas las monedas el catálogo arranca directo en el buscador; el
  // título solo se ve al filtrar.
  const simple = titulo === 'Todas las monedas';
  head.parentElement.classList.toggle('is-oculto', simple);
  document.title = `${simple ? 'Catálogo' : titulo} | Numismática Popper`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) {
    if (!desc.dataset.base) desc.dataset.base = desc.content;
    desc.content = simple ? desc.dataset.base
      : `${titulo}: ${plural(total)} en Numismática Popper. Fotos reales, estado de conservación y precio en cada una.`;
  }
}

// ─── Tarjetas ────────────────────────────────────────────────────────────────

function syncCartButtons() {
  document.querySelectorAll('.ficha__agregar[data-coin-id]').forEach(btn => {
    const inCart = !!(window.PopperCart && window.PopperCart.has(btn.dataset.coinId));
    btn.classList.toggle('is-in-cart', inCart);
    btn.innerHTML = inCart ? ICON_CHECK : ICON_CART;
    const nombre = btn.dataset.nombre || 'esta pieza';
    btn.setAttribute('aria-label', inCart ? `${nombre} está en tu carrito. Tocá para quitarla` : `Agregar ${nombre} al carrito`);
    btn.setAttribute('aria-pressed', String(inCart));
    btn.title = inCart ? 'Está en tu carrito. Tocá para quitarla' : 'Agregar al carrito';
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

// Nombre (ya trae el año), país abajo y, en la fila del precio, la cápsula con
// el estado. El carrito es un botón en la esquina de la foto; una tarjeta con
// variantes lleva en su lugar el rótulo que dice cuántas hay.
function ficha(coin) {
  const g = groupOf(coin);
  const isGroup = !!(g && g.count > 1);
  const sold = coin.status === 'sold';
  const href = `detalle.html?id=${encodeURIComponent(coin.id)}`;
  const title = isGroup ? (coin.group_label || coin.title) : coin.title;
  const pais = countryName(countryKey(coin));

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
    img.alt = `${title}, ${pais}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 300;
    img.height = 300;
    fotoLink.appendChild(img);
  } else {
    fotoLink.appendChild(el('span', 'ficha__sin-foto', 'Sin foto'));
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
    btn.dataset.nombre = title;
    foto.appendChild(btn);
  } else if (isGroup && !sold) {
    const variantes = el('a', 'ficha__variantes', `${g.count} variantes`);
    variantes.href = href;
    variantes.tabIndex = -1;
    variantes.setAttribute('aria-hidden', 'true');
    foto.appendChild(variantes);
  }
  art.appendChild(foto);

  const body = el('div', 'ficha__body');
  const h = el('h2', 'ficha__title');
  const a = el('a');
  a.href = href;
  applyCoinTitle(a, title);
  h.appendChild(a);
  body.appendChild(h);
  const meta = [pais, isGroup ? `${g.count} variantes para elegir` : null].filter(Boolean).join(' · ');
  body.appendChild(el('p', 'ficha__meta', meta));

  const pie = el('div', 'ficha__pie');
  const price = el('span', 'price');
  paintCardPrice(price, coin);
  pie.appendChild(price);
  // La cápsula es el estado de una pieza suelta; un grupo tiene varios.
  const grade = isGroup ? '' : getGradeShort(coin);
  if (grade) {
    const cap = el('span', 'capsula', grade);
    if (coin.grade) {
      cap.title = coin.grade;
      cap.setAttribute('aria-label', `Estado: ${coin.grade}`);
    }
    pie.appendChild(cap);
  }
  body.appendChild(pie);
  art.appendChild(body);
  return art;
}

// ─── Render ──────────────────────────────────────────────────────────────────

let currentCards = [];

// Sin resultados: se dice por qué y se ofrece la salida más corta. Desde el
// panel no se llega acá (las opciones en cero están apagadas); sí buscando o
// con un precio a mano.
function renderVacio(grid) {
  const vacio = el('div', 'cat-vacio');
  const q = state.q.trim();
  vacio.appendChild(el('p', 'cat-vacio__titulo', q
    ? `No encontramos nada para “${q}”${activeFilterCount() ? ' con estos filtros' : ''}.`
    : 'No hay piezas con esta combinación de filtros.'));
  const acciones = el('div', 'cat-vacio__acciones');
  if (q && activeFilterCount()) {
    const sinFiltros = el('button', 'btn btn--quiet', `Buscar “${q}” en todo el catálogo`);
    sinFiltros.type = 'button';
    sinFiltros.addEventListener('click', () => { const keep = state.q; clearAll(); update({ q: keep }); syncControls(); });
    acciones.appendChild(sinFiltros);
  }
  const btn = el('button', 'btn btn--quiet', q && !activeFilterCount() ? 'Ver todo el catálogo' : 'Limpiar todo');
  btn.type = 'button';
  btn.addEventListener('click', clearAll);
  acciones.appendChild(btn);
  vacio.appendChild(acciones);
  const wa = el('p', 'cat-vacio__wa');
  wa.append('¿Buscás una pieza en particular? ');
  const link = el('a', '', 'Escribime por WhatsApp');
  link.href = `https://wa.me/5492235429132?text=${encodeURIComponent(q ? `Hola! Estoy buscando: ${q}` : 'Hola! Estoy buscando una pieza en particular.')}`;
  link.target = '_blank';
  link.rel = 'noopener';
  wa.append(link, ' y la busco.');
  vacio.appendChild(wa);
  grid.appendChild(vacio);
}

function renderGrid() {
  const grid = document.getElementById('catGrid');
  grid.replaceChildren();

  if (!currentCards.length) {
    renderVacio(grid);
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

function update(patch, { replace = false } = {}) {
  if (patch) Object.assign(state, patch);
  normalizeGeo();
  shown = PAGE;
  writeUrl(replace);
  render();
}

function render() {
  if (!listo) return;
  const pool = baseCoins();
  currentPool = pool;
  currentCards = sortCards(collapseGroups(filterExcept(pool, null)));
  renderTitulo(currentCards.length);
  renderFiltros(pool);
  renderEstado(currentCards.length);
  renderGrid();
}

// ─── Hoja de filtros (celular) ───────────────────────────────────────────────

function setupSheet() {
  const panel = document.getElementById('filtros');
  const velo = document.getElementById('filtrosVelo');
  const trigger = document.getElementById('abrirFiltros');
  const isOpen = () => panel.classList.contains('is-open');
  const open = () => {
    panel.classList.add('is-open');
    velo.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    trigger.setAttribute('aria-expanded', 'true');
    document.getElementById('filtrosCerrar').focus({ preventScroll: true });
  };
  const close = () => {
    if (!isOpen()) return;
    panel.classList.remove('is-open');
    velo.hidden = true;
    document.documentElement.style.overflow = '';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus({ preventScroll: true });
  };
  trigger.addEventListener('click', open);
  document.getElementById('filtrosCerrar').addEventListener('click', close);
  document.getElementById('filtrosLimpiar').addEventListener('click', clearAll);
  document.getElementById('filtrosVer').addEventListener('click', () => {
    close();
    document.querySelector('.cat-layout').scrollIntoView({ behavior: 'instant' });
  });
  velo.addEventListener('click', close);
  document.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { close(); return; }
    // Con la hoja abierta, el Tab da la vuelta adentro.
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll('button:not([disabled]), a[href], input')]
      .filter(n => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Si se agranda la ventana con la hoja abierta, se suelta el scroll.
  window.matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) close(); });
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

// Buscador y orden reflejan el estado (al limpiar todo, al volver atrás).
function syncControls() {
  const input = document.getElementById('buscar');
  if (document.activeElement !== input || !state.q) input.value = state.q;
  document.getElementById('buscarLimpiar').hidden = !input.value;
  document.getElementById('orden').value = state.orden;
}

function setupControls() {
  const input = document.getElementById('buscar');
  const limpiar = document.getElementById('buscarLimpiar');
  let timer;
  input.addEventListener('input', () => {
    limpiar.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(() => update({ q: input.value }, { replace: true }), 220);
  });
  // Enter cierra el teclado del celular y deja ver los resultados.
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    clearTimeout(timer);
    update({ q: input.value }, { replace: true });
    input.blur();
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
  orden.addEventListener('change', () => update({ orden: orden.value }));
  syncControls();

  document.getElementById('catMasBtn').addEventListener('click', () => {
    const from = shown;
    shown += PAGE;
    const grid = document.getElementById('catGrid');
    const frag = document.createDocumentFragment();
    currentCards.slice(from, shown).forEach(c => frag.appendChild(ficha(c)));
    grid.appendChild(frag);
    syncCartButtons();
    renderMas();
    // El foco sigue en la primera tarjeta nueva, no se pierde en el botón.
    const nueva = grid.children[from];
    const link = nueva && nueva.querySelector('.ficha__title a');
    if (link) link.focus({ preventScroll: true });
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
  // Al pasar de dólares a pesos cambian los rangos de las tarjetas y también
  // el campo de precio, sus atajos y su chip.
  window.addEventListener('popper:currency-changed', () => {
    document.querySelectorAll('.ficha .price[data-rango]').forEach(n => {
      n.textContent = formatRango(groupInfo.get(n.dataset.rango));
    });
    if (listo) {
      renderFiltros(currentPool);
      renderEstado(currentCards.length);
    }
  });

  // "Atrás" y "adelante" entre filtros.
  window.addEventListener('popstate', () => {
    readUrl();
    sanitizeState(currentPool);
    abrirLoElegido();
    shown = PAGE;
    syncControls();
    render();
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
      const pool = baseCoins();
      contDePais = new Map(pool.filter(c => !isArgentinaCoin(c)).map(c => [filterCountryOf(c), contOf(c)]));
      sanitizeState(pool);
      abrirLoElegido();
      // La URL queda con la forma de ahora (links viejos, valores descartados).
      writeUrl(true);
      listo = true;
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
