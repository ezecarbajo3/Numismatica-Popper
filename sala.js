/**
 * Numismática Popper — Sala de Rarezas.
 *
 * Diapositivas: la entrada, una pieza por pantalla con su cédula y, al final,
 * el archivo con las que ya se vendieron. La moneda gira con el scroll: entra
 * mostrando el reverso, se da vuelta mientras sube y queda en el anverso al
 * asentarse; al irse sigue girando. Los botones Anverso y Reverso (o tocar la
 * moneda) la dan vuelta a mano. La cédula es corta a propósito: nombre, un
 * texto sobre la pieza y "Ver especificaciones", que lleva a la publicación
 * (ahí están el precio, el estado, la ficha técnica y el carrito).
 *
 * El giro es un rotateY sobre un elemento chico por pieza. Depende de
 * common.js y museo.js (setupDiapositivas).
 */

// Archivo: una fila de cuatro (2×2 en el celular), para que entre en una
// pantalla. Son las más recientes.
const ARCHIVO_MAX = 4;
const ICON_FICHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5"/></svg>';
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function coinImage(src, className, eager) {
  const img = el('img', `${className} fundido`);
  img.src = largeFor(src);
  img.dataset.fullSrc = src;
  img.alt = '';
  img.decoding = 'async';
  img.loading = eager ? 'eager' : 'lazy';
  img.width = 580;
  img.height = 580;
  attachImgRetry(img);
  return img;
}

// ─── Cédula ──────────────────────────────────────────────────────────────────

// Textos de la Sala (época, contexto, curiosidades). Viven en sala-notas.json
// hasta que se publiquen como sala_nota en coins.json, que tiene prioridad.
function loadNotas() {
  return fetch('sala-notas.json')
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}

function buildPieza(coin, index, total, notas) {
  const article = el('article', 'pieza diapo');
  article.id = `p-${coin.id}`;
  article.dataset.diapo = coin.title;
  article.setAttribute('aria-label', coin.title);

  // Escenario: la moneda en 3D y los botones de cara.
  const stage = el('div', 'pieza__stage');
  const front = getPrimaryImage(coin);
  const back = getReverseImage(coin);
  const coinBox = el(back ? 'button' : 'div', 'pieza__coin');
  const coin3d = el('div', 'moneda3d');
  const inner = el('div', 'moneda3d__inner');
  inner.appendChild(coinImage(front, 'moneda3d__face', index < 2));
  if (back) inner.appendChild(coinImage(back, 'moneda3d__face moneda3d__face--back', index < 2));
  coin3d.appendChild(inner);
  coinBox.appendChild(coin3d);
  stage.appendChild(coinBox);

  let caras = null;
  if (back) {
    coinBox.type = 'button';
    coinBox.setAttribute('aria-label', `Dar vuelta la moneda ${coin.title}`);
    const wrap = el('div', 'caras');
    caras = el('div', 'moneda-switch');
    caras.setAttribute('role', 'group');
    caras.setAttribute('aria-label', 'Cara de la moneda');
    const anverso = el('button', '', 'Anverso');
    const reverso = el('button', '', 'Reverso');
    anverso.type = reverso.type = 'button';
    anverso.dataset.cara = 'anverso';
    reverso.dataset.cara = 'reverso';
    caras.append(anverso, reverso);
    wrap.appendChild(caras);
    stage.appendChild(wrap);
  }

  // Encabezado: número, país y nombre. En el celular va arriba de la moneda.
  const head = el('header', 'pieza__head');
  const top = el('p', 'cedula__top');
  const num = el('span', 'cedula__num', `N° ${pad2(index + 1)}`);
  num.setAttribute('aria-label', `Pieza ${index + 1} de ${total}`);
  top.append(num, el('span', 'cedula__country', countryLabel(coin)));
  const title = el('h2', 'display cedula__title');
  applyCoinTitle(title, coin.title);
  head.append(top, title);

  // Cédula: el texto y el camino a la publicación, que es donde están el
  // precio, el estado, la ficha técnica y el carrito.
  const cedula = el('div', 'cedula');
  const nota = coin.sala_nota || notas[String(coin.id)];
  if (nota) cedula.appendChild(el('p', 'cedula__nota', nota));
  const ficha = el('a', 'link-icono cedula__specs');
  ficha.innerHTML = `<span>Ver especificaciones</span>${ICON_FICHA}`;
  ficha.href = `detalle.html?id=${encodeURIComponent(coin.id)}`;
  cedula.appendChild(ficha);

  article.append(head, stage, cedula);
  return { article, stage, coinBox, inner, caras };
}

// ─── Giro ────────────────────────────────────────────────────────────────────

// El giro sigue la posición de la diapositiva: -180° cuando está una pantalla
// más abajo, 0° asentada y 180° cuando ya se fue una pantalla para arriba. Así
// el giro se ve durante el deslizamiento entre piezas y siempre llega
// mostrando el anverso. Si la persona elige una cara, esa pieza queda en la
// cara elegida hasta que sale de la pantalla y vuelve a seguir el scroll.
function setupGiro(piezas) {
  const reduced = prefersReducedMotion();
  const visible = new Set();
  let ticking = false;

  function paint(p, giro) {
    p.inner.style.setProperty('--giro', giro);
    const showsBack = Math.abs(giro) >= 90;
    p.caras.querySelectorAll('button').forEach(b => {
      b.setAttribute('aria-pressed', String((b.dataset.cara === 'reverso') === showsBack));
    });
  }

  function update() {
    ticking = false;
    // Asentada, la diapositiva queda debajo de la cabecera fija (--mh-h).
    const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mh-h')) || 0;
    const span = window.innerHeight - head;
    visible.forEach(p => {
      if (p.manual != null) return;
      const offset = (p.article.getBoundingClientRect().top - head) / span;
      paint(p, reduced ? 0 : Math.min(Math.max(-offset, -1), 1) * 180);
    });
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function choose(p, cara) {
    p.manual = cara === 'reverso' ? 180 : 0;
    if (!reduced) {
      p.inner.classList.add('is-animando');
      clearTimeout(p.timer);
      p.timer = setTimeout(() => p.inner.classList.remove('is-animando'), 1400);
    }
    paint(p, p.manual);
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const p = piezas.find(x => x.article === entry.target);
      if (!p || !p.caras) return;
      if (entry.isIntersecting) {
        visible.add(p);
      } else {
        visible.delete(p);
        p.manual = null;
      }
    });
    requestUpdate();
  });

  piezas.forEach(p => {
    if (!p.caras) return;
    p.manual = null;
    paint(p, 0);
    io.observe(p.article);
    p.caras.addEventListener('click', e => {
      const btn = e.target.closest('[data-cara]');
      if (btn) choose(p, btn.dataset.cara);
    });
    p.coinBox.addEventListener('click', () => {
      const current = parseFloat(p.inner.style.getPropertyValue('--giro')) || 0;
      choose(p, Math.abs(current) >= 90 ? 'anverso' : 'reverso');
    });
  });

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  requestUpdate();
}

// ─── Archivo ─────────────────────────────────────────────────────────────────

function renderArchivo(archive) {
  if (!archive.length) return;
  document.getElementById('archivo').hidden = false;
  const grid = document.getElementById('archivoGrid');
  archive.slice(0, ARCHIVO_MAX).forEach(coin => {
    // En el archivo no hay precio ni estado: en su lugar, cuándo se vendió.
    const card = tarjeta(coin, { precio: false });
    card.classList.add('archivada');
    const sold = coin.soldAt ? new Date(coin.soldAt) : null;
    const when = sold && !Number.isNaN(sold.getTime())
      ? `Vendida en ${MONTHS[sold.getMonth()]} de ${sold.getFullYear()}`
      : 'Vendida';
    card.appendChild(el('span', 'archivada__estado', when));
    grid.appendChild(card);
  });
}

// ─── Arranque ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  Promise.all([loadAllCoins(), loadNotas()])
    .then(([coins, notas]) => {
      const sala = getSalaCoins(coins).filter(isAvailable);
      const archive = getSalaArchive(coins).filter(c => getImagesArray(c).length > 0);

      const wrap = document.getElementById('piezas');
      const piezas = sala.map((coin, i) => buildPieza(coin, i, sala.length, notas));
      piezas.forEach(p => wrap.appendChild(p.article));

      setupGiro(piezas);
      renderArchivo(archive);
      setupDiapositivas();
      arrancarArriba();

      // Las piezas se arman después de cargar: el salto a #p-<id> (desde el
      // hero o la vitrina de la portada) hay que hacerlo a mano. Instantáneo:
      // con el scroll suave de html el salto queda a mitad de camino.
      if (location.hash.startsWith('#p-')) {
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) setTimeout(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }), 60);
      }
    })
    .catch(err => console.error(err));
});
