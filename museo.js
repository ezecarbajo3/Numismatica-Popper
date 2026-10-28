/**
 * Numismática Popper — comportamiento compartido del rediseño.
 *
 * Selector de dólares/pesos, alto de la cabecera, fundido de fotos,
 * diapositivas (portada y Sala), aparición de elementos sueltos, la carga
 * única de coins.json y la tarjeta de moneda que comparten portada y Sala.
 * Depende de common.js.
 */

// ─── Dólares / pesos ─────────────────────────────────────────────────────────

// En la compu, las dos opciones a la vista en la cabecera. En el celular se ve
// un solo botón con la moneda actual (el CSS oculta la otra): cada toque pasa
// de US$ a $ y de vuelta. setCurrency() avisa con popper:currency-changed y de
// ahí se repintan precios y carrito.
(function () {
  const buttons = document.querySelectorAll('.moneda-switch [data-moneda]');
  if (!buttons.length) return;
  const celu = window.matchMedia('(max-width: 960px)');
  const sync = () => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.moneda === getCurrency())));
  buttons.forEach(b => b.addEventListener('click', () => {
    const inHeader = b.closest('.mh');
    if (inHeader && celu.matches) setCurrency(getCurrency() === 'USD' ? 'ARS' : 'USD');
    else setCurrency(b.dataset.moneda);
  }));
  window.addEventListener('popper:currency-changed', sync);
  sync();
})();

// ─── Alto de la cabecera ─────────────────────────────────────────────────────

// En el celular la cabecera tiene dos renglones y su alto depende de la letra.
// Las diapositivas lo descuentan de la pantalla: se mide y se deja en --mh-h.
(function () {
  const mh = document.getElementById('mh');
  if (!mh) return;
  const root = document.documentElement;
  const write = () => root.style.setProperty('--mh-h', `${Math.round(mh.getBoundingClientRect().height)}px`);
  write();
  if ('ResizeObserver' in window) new ResizeObserver(write).observe(mh);
  // Al llegar la Garamond el alto cambia un pelo.
  if (document.fonts) document.fonts.ready.then(write);
})();

// ─── Fundido de fotos ────────────────────────────────────────────────────────

// Las img.fundido arrancan transparentes y aparecen al terminar de bajar. Un
// solo listener en captura cubre también las que se crean después y los
// cambios de src (otra variante, otra foto en la ficha). Si falla, igual se
// muestra: mejor el texto alternativo que un hueco.
(function () {
  const show = img => img.classList.add('is-cargada');
  const onDone = e => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.classList.contains('fundido')) show(img);
  };
  document.addEventListener('load', onDone, true);
  document.addEventListener('error', onDone, true);
  const sweep = () => document.querySelectorAll('img.fundido:not(.is-cargada)').forEach(img => {
    if (img.complete && img.naturalWidth) show(img);
  });
  sweep();
  document.addEventListener('DOMContentLoaded', sweep);
})();

// Para cambiar la foto de un img.fundido con fundido: baja, cambia y sube
// (la subida la hace el listener de arriba cuando llega la foto nueva).
function swapFundido(img, apply) {
  if (prefersReducedMotion() || !img.classList.contains('is-cargada')) { apply(); return; }
  img.classList.remove('is-cargada');
  setTimeout(apply, 200);
}

// ─── Diapositivas ────────────────────────────────────────────────────────────

// Portada y Sala: cada .diapo es una pantalla (el snap lo hace el CSS en
// html.diapos). Esto agrega lo que el CSS no puede: el indicador lateral que
// dice dónde estás y permite saltar, y el paso de a una diapositiva con las
// flechas, Re Pág / Av Pág, espacio, Inicio y Fin. Se llama después de armar
// las diapositivas que se crean con JS (las piezas de la Sala).
function setupDiapositivas() {
  if (!document.documentElement.classList.contains('diapos')) return;
  const slides = Array.from(document.querySelectorAll('.diapo')).filter(s => !s.hidden);
  const footer = document.querySelector('.mf');
  const stops = footer ? [...slides, footer] : slides;
  const reduced = prefersReducedMotion();

  // Indicador: un filete por diapositiva (el pie no lleva).
  document.querySelector('.diapo-indice')?.remove();
  const nav = el('nav', 'diapo-indice');
  nav.setAttribute('aria-label', 'Secciones de la página');
  const links = new Map();
  slides.forEach((slide, i) => {
    if (!slide.id) slide.id = `diapo-${i + 1}`;
    const name = slide.dataset.diapo || `Sección ${i + 1}`;
    const a = el('a');
    a.href = `#${slide.id}`;
    a.setAttribute('aria-label', name);
    a.appendChild(el('span', '', name));
    nav.appendChild(a);
    links.set(slide, a);
  });
  document.body.appendChild(nav);

  // Activa: la que cruza la línea media de la pantalla.
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const a = links.get(entry.target);
      if (!a) return;
      a.classList.toggle('is-active', entry.isIntersecting);
      if (entry.isIntersecting) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }, { rootMargin: '-50% 0px -50% 0px' });
  slides.forEach(s => io.observe(s));

  // Teclado. Se calcula por posición (no por la "activa") para que dos
  // toques seguidos avancen dos diapositivas aunque la primera no terminó.
  const line = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mh-h')) || 0;
  const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
  const go = target => target && target.scrollIntoView({
    behavior: reduced ? 'auto' : 'smooth',
    block: target === footer ? 'end' : 'start',
  });

  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    // Escribiendo, en el carrito o en la foto ampliada, las teclas son de ellos.
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable], .cart-drawer, .visor')) return;
    // Sobre un botón o link, el espacio lo activa.
    if (e.key === ' ' && e.target.closest && e.target.closest('button, a')) return;
    if (document.querySelector('.cart-drawer.is-open')) return;
    const y = line();
    let target;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
      target = stops.find(s => s.getBoundingClientRect().top > y + 8 && !(s === footer && atBottom()));
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
      target = slides.slice().reverse().find(s => s.getBoundingClientRect().top < y - 8);
    } else if (e.key === 'Home') {
      target = stops[0];
    } else if (e.key === 'End') {
      target = stops[stops.length - 1];
    } else {
      return;
    }
    e.preventDefault();
    go(target);
  });
}

// ─── Aparición ───────────────────────────────────────────────────────────────

// Aparición de los `.aparece`, también de los que se agregan después de cargar.
function observeAparece(root = document) {
  const items = root.querySelectorAll('.aparece:not(.is-visible)');
  if (prefersReducedMotion()) {
    items.forEach(el => el.classList.add('is-visible'));
    return;
  }
  createRevealObserver(Array.from(items));
}

document.addEventListener('DOMContentLoaded', () => observeAparece());

// ─── Datos ───────────────────────────────────────────────────────────────────

// coins.json una sola vez por página, con la validación del carrito.
let coinsPromise = null;

function loadAllCoins() {
  if (!coinsPromise) {
    coinsPromise = fetch('coins.json')
      .then(r => {
        if (!r.ok) throw new Error('No se pudo cargar coins.json');
        return r.json();
      })
      .then(data => {
        const coins = Array.isArray(data) ? data : [];
        if (window.PopperCart && typeof window.PopperCart.validateSoldItems === 'function') {
          window.PopperCart.validateSoldItems(coins);
        }
        return coins;
      });
  }
  return coinsPromise;
}

// Piezas que se pueden mostrar como disponibles.
function isAvailable(coin) {
  return !coin.hidden && coin.status !== 'sold' && getImagesArray(coin).length > 0;
}

// ─── Precios ─────────────────────────────────────────────────────────────────

// Precios que se repintan solos al cambiar dólares/pesos: cualquier elemento
// con data-price-id toma el precio formateado de esa moneda.
const priceCoins = new Map();

function paintPrice(node, coin) {
  priceCoins.set(String(coin.id), coin);
  node.dataset.priceId = String(coin.id);
  node.innerHTML = formatCoinPrice(coin);
}

window.addEventListener('popper:currency-changed', () => {
  document.querySelectorAll('[data-price-id]').forEach(node => {
    const coin = priceCoins.get(node.dataset.priceId);
    if (coin) node.innerHTML = formatCoinPrice(coin);
  });
});

// ─── Textos ──────────────────────────────────────────────────────────────────

// "Argentina - Patria" → "Argentina"; el resto queda igual.
function countryLabel(coin) {
  const country = String(coin.country || '').trim();
  return country.startsWith('Argentina') ? 'Argentina' : country;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ─── Tarjeta ─────────────────────────────────────────────────────────────────

// Foto, número opcional, nombre (ya trae el año), país y, en una fila, el
// precio con la cápsula del estado. Lleva a la ficha salvo que se pase otro
// destino.
function tarjeta(coin, { href, src, num } = {}) {
  const link = el('a', 'tarjeta');
  link.href = href || `detalle.html?id=${encodeURIComponent(coin.id)}`;

  const img = el('img', 'tarjeta__img fundido');
  img.src = src || thumbFor(getPrimaryImage(coin));
  img.dataset.fullSrc = getPrimaryImage(coin);
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 400;
  img.height = 400;
  attachImgRetry(img);
  link.appendChild(img);

  if (num) link.appendChild(el('span', 'tarjeta__num', num));
  const title = el('h3', 'tarjeta__title');
  applyCoinTitle(title, coin.title);
  const pie = el('span', 'tarjeta__pie');
  const price = el('span', 'price');
  paintPrice(price, coin);
  pie.appendChild(price);
  const grade = getGradeShort(coin);
  if (grade) {
    const cap = el('span', 'capsula', grade);
    if (coin.grade) cap.title = coin.grade;
    pie.appendChild(cap);
  }
  link.append(title, el('span', 'tarjeta__meta', countryLabel(coin)), pie);
  return link;
}
