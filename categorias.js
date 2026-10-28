/**
 * Numismática Popper — qué colección es cada pieza.
 *
 * Predicados de categoría compartidos entre la portada y el catálogo. Salieron
 * tal cual de script.js: la portada los necesita para contar piezas y elegir
 * la foto de cada colección sin cargar el catálogo entero.
 *
 * Depende de common.js (parsePriceUSD, NEW_BADGE_DAYS).
 */

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

// ─── Continentes ──────────────────────────────────────────────────────────────

// El Caribe va con Centroamérica; Rusia y la URSS con Europa; Turquía y el
// Imperio Otomano con Asia. Un país que no está acá no aparece en el filtro de
// continentes (la moneda se sigue viendo en "Todas"): al dar de alta uno
// nuevo, sumarlo a su lista.
const CONTINENTS = [
  { key: 'Sudamérica', countries: [
    'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia', 'Ecuador', 'Guayana Francesa', 'Guyana',
    'Isla de Pascua', 'Islas Malvinas', 'Paraguay', 'Perú', 'Surinam', 'Uruguay', 'Venezuela',
  ] },
  { key: 'Centroamérica', countries: [
    'Antillas Holandesas', 'Antillas Neerlandesas', 'Aruba', 'Bahamas', 'Barbados', 'Belice', 'Caribe Oriental',
    'Costa Rica', 'Cuba', 'Curazao', 'El Salvador', 'Guadalupe', 'Guatemala', 'Haití', 'Honduras',
    'Islas Caimán', 'Islas Vírgenes Británicas', 'Jamaica', 'Martinica', 'Nicaragua', 'Panamá',
    'Puerto Rico', 'República Dominicana', 'San Martín', 'Trinidad y Tobago',
  ] },
  { key: 'Norteamérica', countries: [
    'Bermudas', 'Canadá', 'Chihuahua', 'Estados Unidos', 'Groenlandia', 'México', 'San Pedro y Miquelón', 'Terranova',
  ] },
  { key: 'África', countries: [
    'Angola', 'Argelia', 'Botsuana', 'Burundi', 'Cabo Verde', 'Camerún', 'Congo', 'Congo Belga',
    'Congo Belga y Ruanda-Urundi', 'Costa de Marfil', 'Egipto', 'Etiopía', 'Ghana', 'Kenia', 'Liberia',
    'Libia', 'Madagascar', 'Marruecos', 'Mauricio', 'Mozambique', 'Namibia', 'Nigeria', 'Rodesia',
    'Ruanda', 'Ruanda-Urundi', 'Santa Elena', 'Seychelles', 'Sierra Leona', 'Somalia', 'Sudáfrica',
    'Sudán', 'Swazilandia', 'Tanzania', 'Tristán de Acuña', 'Túnez', 'Uganda', 'Yibuti', 'Zaire',
    'Zambia', 'Zimbabue',
  ] },
  { key: 'Europa', countries: [
    'Alemana, República Democrática', 'Alemania', 'Alemania Federal', 'Alemania Oriental', 'Andorra',
    'Austria', 'Baden', 'Baviera', 'Bielorrusia', 'Bosnia y Herzegovina', 'Bulgaria', 'Bélgica',
    'Checoslovaquia', 'Chipre', 'Croacia', 'Dinamarca', 'Eslovaquia', 'Eslovenia', 'España', 'Estonia',
    'Finlandia', 'Francia', 'Francia - Régimen de Vichy', 'Gibraltar', 'Grecia', 'Guernsey', 'Hungría',
    'Irlanda', 'Isla de Man', 'Islandia', 'Islas Feroe', 'Italia', 'Italia - Estados Preunitarios',
    'Jersey', 'Letonia', 'Liechtenstein', 'Lituania', 'Luxemburgo', 'Malta', 'Mónaco', 'Noruega',
    'Países Bajos', 'Países Bajos - Overijssel', 'Polonia', 'Portugal', 'Prusia', 'Reino Unido',
    'República Checa', 'Rumania', 'Rusia', 'Ruso, Imperio', 'San Marino', 'Serbia', 'Suecia', 'Suiza',
    'Transnistria', 'Ucrania', 'Unión Soviética', 'Utrecht, City of', 'Vaticano, Ciudad del', 'Yugoslavia',
  ] },
  { key: 'Asia', countries: [
    'Afganistán', 'Arabia Saudita', 'Armenia', 'Azerbaiyán', 'Bangladés', 'Baréin', 'Birmania', 'Camboya',
    'China', 'Comisionados de la Moneda de Malaya', 'Corea del Norte', 'Corea del Sur',
    'Emiratos Árabes Unidos', 'Filipinas', 'Georgia', 'Hong Kong', 'Imperio Otomano', 'India',
    'Indias Orientales Neerlandesas', 'Indonesia', 'Irak', 'Irán', 'Israel', 'Japón', 'Jordania',
    'Kazajistán', 'Kirguistán', 'Kuwait', 'Laos', 'Líbano', 'Macao', 'Malasia', 'Malaya', 'Malaya y Borneo',
    'Malaya y Borneo Británico', 'Maldivas', 'Mongolia', 'Nepal', 'Omán', 'Pakistán', 'Qatar',
    'Reino Shahi', 'Singapur', 'Siria', 'Sri Lanka', 'Straits Settlements', 'Tailandia', 'Taiwán',
    'Tayikistán', 'Turquía', 'Uzbekistán', 'Vietnam', 'Yemen',
  ] },
  { key: 'Oceanía', countries: [
    'Australia', 'Fiyi', 'Islas Cook', 'Islas Salomón', 'Kiribati', 'Nueva Caledonia', 'Nueva Zelanda',
    'Papúa Nueva Guinea', 'Polinesia Francesa', 'Samoa', 'Tonga', 'Tuvalu', 'Vanuatu',
  ] },
];

const CONTINENT_OF = new Map(CONTINENTS.flatMap(c => c.countries.map(p => [p, c.key])));

// El país con el que se filtra: Patria, Buenos Aires, Confederación y las
// provincias quedan todas bajo "Argentina".
function filterCountryOf(coin) {
  return isArgentinaCoin(coin) ? 'Argentina' : normalizeCountryValue(coin.country);
}

function continentOf(coin) {
  return CONTINENT_OF.get(filterCountryOf(coin)) || '';
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

// Misma regla que el badge "NUEVO" del catálogo.
function isNewCoin(coin) {
  if (!coin || !coin.publishedAt) return false;
  if (coin.status === 'sold') return false;
  const ts = Date.parse(coin.publishedAt);
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) < NEW_BADGE_DAYS * 86400000;
}

// Las seis colecciones, en el orden de la portada. `key` es el ?cat= del
// catálogo; `desc` es la línea que explica qué hay adentro.
const COLLECTIONS = [
  { key: 'argentina',     label: 'Argentinas', desc: 'República, Patria, Confederación y Buenos Aires.', match: isArgentinaCoin },
  { key: 'internacional', label: 'Mundiales',  desc: 'Monedas de todo el mundo.', match: (c) => !isArgentinaCoin(c) && !isMedalOrToken(c) && !isBlister(c) && !isBook(c) && !isInsumo(c) },
  { key: 'plata',         label: 'Inversión',  desc: 'Plata de ley .900 o superior.', match: isInvestment },
  { key: 'economicas',    label: 'Económicas', desc: 'Monedas del mundo a menos de 5 dólares.', match: isEconomica },
  { key: 'varios',        label: 'Varios',     desc: 'Medallas, fichas, blísteres, lotes y libros.', match: (c) => isMedalOrToken(c) || isBook(c) || isBlister(c) },
  { key: 'insumos',       label: 'Insumos',    desc: 'Carpetas, folios y accesorios para tu colección.', match: isInsumo },
];
