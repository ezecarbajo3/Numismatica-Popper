/**
 * Numismática Popper — portada.
 *
 * Arma el hero (una pieza de la Sala al azar), la vitrina con el adelanto de la
 * Sala, los ingresos de la semana y las colecciones con su foto.
 * Depende de common.js, categorias.js y museo.js.
 */

// Cuatro por diapositiva: una fila en la compu, 2×2 en el celular. Con más,
// la diapositiva no entra en una pantalla.
const VITRINA_SIZE = 4;
const INGRESOS_SIZE = 4;

// Qué fotos grandes tienen fondo negro (lo escribe build_large.py). Si el
// archivo no está, no se filtra nada.
function loadFondos() {
  return fetch('images-large/fondos.json')
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}

function hasBlackBackground(coin, fondos) {
  const base = getPrimaryImage(coin).split('/').pop().replace(/\.[^.]+$/, '');
  return fondos[base] !== false;
}

function renderHero(sala, fondos) {
  const stage = document.getElementById('heroStage');
  const img = document.getElementById('heroCoin');
  const caption = document.getElementById('heroCaption');
  if (!sala.length) {
    stage.hidden = true;
    return;
  }
  // El hero es una moneda suelta sobre negro: un blíster, un lote o una foto
  // con fondo de color no lucen a ese tamaño.
  const candidates = sala.filter(c => !isBlister(c) && hasBlackBackground(c, fondos));
  const pool = candidates.length ? candidates : sala;
  const coin = pool[Math.floor(Math.random() * pool.length)];
  stage.href = `detalle.html?id=${encodeURIComponent(coin.id)}`;
  stage.setAttribute('aria-label', `${coin.title}: ver la ficha`);
  img.src = largeFor(getPrimaryImage(coin));
  img.dataset.fullSrc = getPrimaryImage(coin);
  img.alt = `${coin.title}, ${countryLabel(coin)}`;
  attachImgRetry(img);

  const title = el('b');
  applyCoinTitle(title, coin.title);
  caption.replaceChildren(title, document.createTextNode(countryLabel(coin)));
}

function renderVitrina(sala) {
  const wrap = document.getElementById('vitrina');
  sala.slice(0, VITRINA_SIZE).forEach((coin, i) => {
    const card = tarjeta(coin, {
      href: `sala.html#p-${encodeURIComponent(coin.id)}`,
      src: largeFor(getPrimaryImage(coin)),
      num: `N° ${String(i + 1).padStart(2, '0')}`,
      // Como en la Sala: precio y estado se ven en la publicación.
      precio: false,
    });
    card.classList.add('tarjeta--sala', 'aparece');
    wrap.appendChild(card);
  });
}

// Las variantes de un mismo grupo (ej. Quarters 2001) aparecen una sola vez.
function renderIngresos(coins) {
  const fresh = coins
    .filter(c => isAvailable(c) && isNewCoin(c))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  if (!fresh.length) return;

  const seenGroups = new Set();
  const unique = fresh.filter(c => {
    if (!c.group_id) return true;
    if (seenGroups.has(c.group_id)) return false;
    seenGroups.add(c.group_id);
    return true;
  });

  // Se cuentan tarjetas (un grupo de variantes es una), igual que el
  // catálogo: si no, la portada dice 84 y el catálogo muestra 75.
  const total = unique.length;
  document.getElementById('ingresos').hidden = false;
  document.getElementById('ingresosLede').textContent =
    `${total} ${total === 1 ? 'pieza nueva' : 'piezas nuevas'} esta semana.`;
  document.getElementById('ingresosTodos').textContent =
    total > INGRESOS_SIZE ? `Ver los ${total} ingresos` : 'Ver los ingresos';

  const wrap = document.getElementById('franja');
  unique.slice(0, INGRESOS_SIZE).forEach(coin => wrap.appendChild(tarjeta(coin)));
}

// Cada colección muestra su pieza disponible más cara: la que mejor la vende.
function renderColecciones(coins) {
  const wrap = document.getElementById('colecciones');
  const available = coins.filter(isAvailable);
  const byPrice = (a, b) => {
    const pa = parsePriceUSD(a.price), pb = parsePriceUSD(b.price);
    return (Number.isFinite(pb) ? pb : -1) - (Number.isFinite(pa) ? pa : -1);
  };
  // Una pieza puede estar en dos colecciones (el Patacón es Argentina e
  // Inversión): cada tapa usa una foto distinta.
  const usedCovers = new Set();

  COLLECTIONS.forEach(col => {
    const pool = available.filter(col.match);
    if (!pool.length) return;
    const ranked = pool.slice().sort(byPrice);
    const cover = ranked.find(c => !usedCovers.has(c.id)) || ranked[0];
    usedCovers.add(cover.id);

    const link = el('a', 'coleccion');
    link.href = `catalogo.html?cat=${col.key}`;

    const img = el('img', 'coleccion__img');
    img.src = thumbFor(getPrimaryImage(cover));
    img.dataset.fullSrc = getPrimaryImage(cover);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    attachImgRetry(img);

    link.append(
      img,
      el('span', 'coleccion__label', col.label),
      el('span', 'coleccion__desc', col.desc),
    );
    wrap.appendChild(link);
  });
}

// Al recargar, la portada arranca en la primera diapositiva ("Desde 2020"),
// no donde quedó el scroll ni en el #ancla que dejó el indicador.
const IS_RELOAD = performance.getEntriesByType('navigation')[0]?.type === 'reload';
if (IS_RELOAD) {
  history.scrollRestoration = 'manual';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  instantScrollTo(0);
}

document.addEventListener('DOMContentLoaded', () => {
  Promise.all([loadAllCoins(), loadFondos()])
    .then(([coins, fondos]) => {
      const sala = getSalaCoins(coins).filter(isAvailable);
      renderHero(sala, fondos);
      renderVitrina(sala);
      renderIngresos(coins);
      renderColecciones(coins);
      setupDiapositivas();
      observeAparece();
      // La Sala y los ingresos se arman tarde y mueven el layout.
      if (IS_RELOAD) instantScrollTo(0); else arrancarArriba();
    })
    .catch(err => {
      console.error(err);
      setupDiapositivas();
    });
});
