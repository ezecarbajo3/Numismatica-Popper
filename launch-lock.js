/* ============================================================================
   Numismática Popper · Pantalla de bloqueo previa al lanzamiento
   ----------------------------------------------------------------------------
   Overlay "coming soon" infranqueable con cuenta regresiva.
   Módulo autocontenido: inyecta sus propios estilos y DOM, y se elimina solo
   al alcanzar el momento de apertura.

   Para retirar el bloqueo manualmente: borrá el <script src="launch-lock.js">
   de index.html y detalle.html (la lógica del sitio queda intacta debajo).
   ============================================================================ */
(function () {
  "use strict";

  /* Momento exacto de apertura: mañana 20:00 hs (hora de Argentina, UTC−3).
     Se ancla a un instante absoluto para que todos los visitantes cuenten
     hacia el mismo momento sin importar su zona horaria. */
  var LAUNCH = new Date("2026-06-18T20:00:00-03:00").getTime();

  /* Si ya pasó la hora de lanzamiento, no bloqueamos nada. */
  if (Date.now() >= LAUNCH) return;

  /* ---- Estilos (heredan la paleta y la tipografía globales del sitio) ---- */
  var css = '\
#launch-lock{position:fixed;inset:0;z-index:2147483647;\
  display:flex;align-items:center;justify-content:center;\
  background:#0a0a0a;\
  background-image:\
    radial-gradient(120% 90% at 50% -10%, rgba(207,172,107,.10), transparent 60%),\
    radial-gradient(100% 80% at 50% 120%, rgba(168,132,74,.08), transparent 55%),\
    repeating-linear-gradient(135deg, rgba(255,255,255,.012) 0 2px, transparent 2px 5px);\
  color:#f5f0e6;overflow:hidden;\
  -webkit-user-select:none;user-select:none;\
  animation:ll-fade .9s ease both;}\
@keyframes ll-fade{from{opacity:0}to{opacity:1}}\
#launch-lock .ll-inner{width:min(92%,640px);text-align:center;\
  padding:clamp(24px,6vw,56px);}\
#launch-lock .ll-lock{width:clamp(88px,16vw,132px);height:auto;display:block;\
  margin:0 auto clamp(22px,4vw,38px);\
  filter:drop-shadow(0 6px 26px rgba(207,172,107,.32));\
  animation:ll-glow 3.4s ease-in-out infinite;}\
@keyframes ll-glow{0%,100%{filter:drop-shadow(0 6px 22px rgba(207,172,107,.22))}\
  50%{filter:drop-shadow(0 6px 34px rgba(239,217,162,.45))}}\
#launch-lock .ll-eyebrow{font-family:"Cinzel",Georgia,serif;\
  font-size:clamp(.62rem,1.6vw,.78rem);letter-spacing:.42em;\
  text-transform:uppercase;color:#b2a38d;margin:0 0 18px;padding-left:.42em;}\
#launch-lock .ll-title{font-family:"Cinzel",Georgia,serif;font-weight:600;\
  font-size:clamp(1.5rem,4.6vw,2.7rem);line-height:1.18;margin:0 0 16px;\
  background:linear-gradient(180deg,#efd9a2 0%,#cfac6b 52%,#a8844a 100%);\
  -webkit-background-clip:text;background-clip:text;\
  -webkit-text-fill-color:transparent;color:#cfac6b;}\
#launch-lock .ll-copy{font-family:"Cinzel",Georgia,serif;font-weight:400;\
  font-size:clamp(.86rem,2.3vw,1.06rem);line-height:1.6;color:#f5f0e6;\
  max-width:30ch;margin:0 auto clamp(30px,6vw,46px);opacity:.92;}\
#launch-lock .ll-copy b{color:#efd9a2;font-weight:600;white-space:nowrap;}\
#launch-lock .ll-countdown{display:flex;justify-content:center;\
  gap:clamp(10px,3vw,26px);}\
#launch-lock .ll-unit{display:flex;flex-direction:column;align-items:center;\
  min-width:clamp(54px,15vw,74px);}\
#launch-lock .ll-num{font-family:"Cinzel",Georgia,serif;font-weight:700;\
  font-size:clamp(1.7rem,7vw,3rem);line-height:1;color:#efd9a2;\
  font-variant-numeric:tabular-nums;font-feature-settings:"tnum";\
  text-shadow:0 2px 18px rgba(207,172,107,.28);}\
#launch-lock .ll-lab{font-family:"Cinzel",Georgia,serif;\
  font-size:clamp(.54rem,1.5vw,.66rem);letter-spacing:.24em;\
  text-transform:uppercase;color:#b2a38d;margin-top:10px;}\
#launch-lock .ll-sep{font-family:"Cinzel",Georgia,serif;font-weight:600;\
  font-size:clamp(1.4rem,6vw,2.4rem);color:rgba(207,172,107,.4);\
  align-self:flex-start;margin-top:clamp(2px,1vw,6px);}\
#launch-lock .ll-rule{width:48px;height:1px;margin:clamp(30px,6vw,46px) auto 0;\
  background:linear-gradient(90deg,transparent,#cfac6b,transparent);}\
#launch-lock .ll-foot{font-family:"Cinzel",Georgia,serif;\
  font-size:clamp(.58rem,1.5vw,.7rem);letter-spacing:.3em;text-transform:uppercase;\
  color:#7a6f5d;margin:18px 0 0;}\
@media (max-width:380px){#launch-lock .ll-sep{display:none}\
  #launch-lock .ll-countdown{gap:8px}}';

  var style = document.createElement("style");
  style.id = "launch-lock-style";
  style.textContent = css;
  document.head.appendChild(style);

  /* ---- Bloqueo de scroll / interacción de fondo ---- */
  var root = document.documentElement;
  root.style.overflow = "hidden";
  // Refuerzo aplicado en cuanto exista el <body>.
  function lockBody() {
    if (document.body) document.body.style.overflow = "hidden";
  }
  lockBody();

  /* ---- Markup del overlay ---- */
  var lockSVG =
    '<svg class="ll-lock" viewBox="0 0 64 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="ll-gold" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#efd9a2"/>' +
        '<stop offset="50%" stop-color="#cfac6b"/>' +
        '<stop offset="100%" stop-color="#a8844a"/>' +
      '</linearGradient></defs>' +
      '<path d="M18 34V24a14 14 0 0 1 28 0v10" fill="none" stroke="url(#ll-gold)" stroke-width="3.4" stroke-linecap="round"/>' +
      '<rect x="9" y="33" width="46" height="40" rx="9" fill="none" stroke="url(#ll-gold)" stroke-width="3.4"/>' +
      '<circle cx="32" cy="50" r="4.4" fill="url(#ll-gold)"/>' +
      '<path d="M32 54v8" stroke="url(#ll-gold)" stroke-width="3.4" stroke-linecap="round"/>' +
    '</svg>';

  var overlay = document.createElement("div");
  overlay.id = "launch-lock";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Apertura próximamente");
  overlay.innerHTML =
    '<div class="ll-inner">' +
      lockSVG +
      '<p class="ll-eyebrow">Numismática Popper</p>' +
      '<h2 class="ll-title">El tesoro está por descubrirse</h2>' +
      '<p class="ll-copy">Apertura de la plataforma: <b>mañana 20:00 hs.</b> El catálogo se desbloqueará para todos.</p>' +
      '<div class="ll-countdown" aria-live="off">' +
        '<div class="ll-unit"><span class="ll-num" data-d>00</span><span class="ll-lab">Días</span></div>' +
        '<span class="ll-sep">:</span>' +
        '<div class="ll-unit"><span class="ll-num" data-h>00</span><span class="ll-lab">Horas</span></div>' +
        '<span class="ll-sep">:</span>' +
        '<div class="ll-unit"><span class="ll-num" data-m>00</span><span class="ll-lab">Minutos</span></div>' +
        '<span class="ll-sep">:</span>' +
        '<div class="ll-unit"><span class="ll-num" data-s>00</span><span class="ll-lab">Segundos</span></div>' +
      '</div>' +
      '<div class="ll-rule"></div>' +
      '<p class="ll-foot">Aumentando tu colección desde 2020</p>' +
    '</div>';

  function mount() {
    lockBody();
    document.body.appendChild(overlay);
  }
  if (document.body) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }

  /* ---- Bloqueo defensivo de teclado de scroll ---- */
  function blockKeys(e) {
    if (!document.getElementById("launch-lock")) return;
    var k = e.key;
    if (k === " " || k === "PageDown" || k === "PageUp" ||
        k === "Home" || k === "End" ||
        k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
    }
  }
  window.addEventListener("keydown", blockKeys, { passive: false });

  /* ---- Cuenta regresiva ---- */
  var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  var $ = function (sel) { return overlay.querySelector(sel); };

  function tick() {
    var diff = LAUNCH - Date.now();
    if (diff <= 0) {
      unlock();
      return;
    }
    var s = Math.floor(diff / 1000);
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var eD = $("[data-d]"), eH = $("[data-h]"), eM = $("[data-m]"), eS = $("[data-s]");
    if (eD) eD.textContent = pad(d);
    if (eH) eH.textContent = pad(h);
    if (eM) eM.textContent = pad(m);
    if (eS) eS.textContent = pad(sec);
  }

  function unlock() {
    clearInterval(timer);
    window.removeEventListener("keydown", blockKeys, { passive: false });
    root.style.overflow = "";
    if (document.body) document.body.style.overflow = "";
    var el = document.getElementById("launch-lock");
    if (el) {
      el.style.transition = "opacity .8s ease";
      el.style.opacity = "0";
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 850);
    }
    var st = document.getElementById("launch-lock-style");
    if (st && st.parentNode) {
      setTimeout(function () { st.parentNode.removeChild(st); }, 900);
    }
  }

  tick();
  var timer = setInterval(tick, 1000);
})();
