/**
 * Halo dorado que acompaña al puntero.
 *
 * Es puramente decorativo: el degradado vive en body::before con z-index -1,
 * así que ilumina el fondo pero queda por debajo de las tarjetas y las fotos,
 * y nunca intercepta un click.
 *
 * No se activa en pantallas táctiles (no hay puntero que seguir) ni cuando el
 * sistema pide menos movimiento.
 */
(function () {
  if (!window.matchMedia) return;

  var hasMouse = window.matchMedia('(pointer: fine)').matches;
  var wantsCalm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!hasMouse || wantsCalm) return;

  var root = document.documentElement;
  var x = 0;
  var y = 0;
  var queued = false;
  var lit = false;

  // Una sola escritura de estilo por frame: mover el mouse rápido no encola
  // decenas de repintados.
  function paint() {
    queued = false;
    root.style.setProperty('--glow-x', x + 'px');
    root.style.setProperty('--glow-y', y + 'px');
  }

  window.addEventListener('pointermove', function (event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;

    x = event.clientX;
    y = event.clientY;

    if (!lit) {
      lit = true;
      document.body.classList.add('has-glow');
    }

    if (!queued) {
      queued = true;
      requestAnimationFrame(paint);
    }
  }, { passive: true });

  // Al salir de la ventana el halo se desvanece en vez de quedar congelado.
  document.addEventListener('mouseleave', function () {
    lit = false;
    document.body.classList.remove('has-glow');
  });
})();
