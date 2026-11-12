/**
 * Numismática Popper — páginas de ayuda (Cómo comprar y Estados de
 * conservación).
 *
 * Cómo comprar: escribe la próxima fecha de retiro en Parque Rivadavia, la
 * misma que calcula el carrito. Conservación: al lado de cada estado muestra
 * una pieza del catálogo que lo tiene, como ejemplo real.
 * Depende de common.js, cart.js y museo.js.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ─── Próxima entrega en el parque ───────────────────────────────────────────
  const proxima = document.getElementById('proximaParque');
  if (proxima && window.PopperCart && typeof window.PopperCart.getNextParqueSchedule === 'function') {
    const fecha = window.PopperCart.getNextParqueSchedule();
    if (fecha && fecha.deliveryDDMM) {
      proxima.textContent = `Próxima entrega: desde el domingo ${fecha.deliveryDDMM}.`;
      proxima.hidden = false;
    }
  }

  // ─── Un ejemplo real por estado ──────────────────────────────────────────────
  const grados = document.querySelectorAll('.grado[data-grado]');
  if (!grados.length) return;
  loadAllCoins().then(coins => {
    // Monedas sueltas, con foto y con el estado exacto (sin + ni −): que el
    // ejemplo sea el caso típico. De las que hay, la más cara: suele ser la
    // mejor fotografiada.
    const candidatas = coins.filter(c => isAvailable(c) && !c.group_id && Number.isFinite(parsePriceUSD(c.price)));
    grados.forEach(li => {
      const key = li.dataset.grado;
      const pool = candidatas.filter(c => String(c.grade_short || '').trim().toUpperCase() === key);
      if (!pool.length) return;
      const coin = pool.sort((a, b) => parsePriceUSD(b.price) - parsePriceUSD(a.price))[0];
      const link = li.querySelector('.grado__ejemplo');
      link.href = `detalle.html?id=${encodeURIComponent(coin.id)}`;
      const img = el('img', 'fundido');
      img.src = thumbFor(getPrimaryImage(coin));
      img.dataset.fullSrc = getPrimaryImage(coin);
      img.alt = `Ejemplo de estado ${key}: ${coin.title}, ${countryLabel(coin)}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 220;
      img.height = 220;
      attachImgRetry(img);
      const pie = el('span', 'grado__pie');
      pie.append(el('i', '', 'Ejemplo: '), document.createTextNode(coin.title));
      link.append(img, pie);
      link.hidden = false;
    });
  }).catch(err => console.error(err));
});
