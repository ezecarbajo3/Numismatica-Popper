/**
 * Numismática Popper — ficha de una moneda (detalle.html y moneda/<id>.html).
 *
 * Foto grande con miniaturas y "Ampliar foto", nombre, precio, botones de
 * compra y consulta, ficha técnica, variantes del grupo y piezas parecidas.
 * Si la pieza es de la Sala de Rarezas lo dice y lleva a su lugar en la Sala;
 * si es de la Sala y ya se vendió, se sigue viendo (es parte del archivo).
 *
 * Depende de common.js y museo.js (tarjeta, paintPrice, isAvailable).
 */

const detailContainer = document.getElementById("coinDetail");
const WHATSAPP_NUMBER = "5492235429132";
const RELACIONADAS = 4;
let activeCoin = null;
let allCoins = [];

const ICON_CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 018.23 8.24c0 4.54-3.7 8.23-8.24 8.23z"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>';
const ICON_ZOOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21M8 11h6M11 8v6"/></svg>';

// ─── Carrito ─────────────────────────────────────────────────────────────────

function hasFixedPrice(coin) {
  return !!coin.price && !String(coin.price).toLowerCase().includes("consultar") &&
    Number.isFinite(parsePriceUSD(coin.price)) && parsePriceUSD(coin.price) > 0;
}

function updateDetailCartBtn(coin) {
  const cartBtn = document.getElementById("detailAddToCart");
  if (!cartBtn || !coin) return;
  cartBtn.dataset.coinId = coin.id;
  if (coin.status === "sold" || !hasFixedPrice(coin)) {
    cartBtn.hidden = true;
    return;
  }
  cartBtn.hidden = false;
  const inCart = !!(window.PopperCart && window.PopperCart.has(coin.id));
  cartBtn.classList.toggle("is-in-cart", inCart);
  cartBtn.innerHTML = inCart
    ? `${ICON_CHECK}<span>Ya está en tu carrito · Ver carrito</span>`
    : `${ICON_CART}<span>Agregar al carrito</span>`;
}

window.addEventListener("popper:cart-updated", () => {
  if (activeCoin) updateDetailCartBtn(activeCoin);
});

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Puntaje de conservación para ORDENAR LAS VARIANTES de un grupo.
 *
 * Deliberadamente NO es `gradeRank` de common.js: esta escala penaliza el
 * sufijo "**" (pieza con defecto) restando 15 y separa SC de SC-, cosas que la
 * del catálogo no distingue. Entre las monedas agrupadas hay 9 con "**" y 4 con
 * "SC-", así que unificarlas cambiaría el orden en que se listan las variantes.
 */
function getVariantGradeScore(c) {
  const grade = (c.grade_short || "").toUpperCase().trim();
  if (grade.startsWith("SC")) return grade.includes("-") ? 140 : 150;
  const scale = [["EX", 110], ["MB", 80], ["B", 50], ["R", 20]];
  for (const [prefix, base] of scale) {
    if (!grade.startsWith(prefix)) continue;
    let score = base;
    if (grade.includes("+")) score = base + 10;
    if (grade.includes("-") && prefix !== "R") score = base - 10;
    if (grade.includes("**")) score -= 15;
    return score;
  }
  return 0;
}

// Peso y diámetro se guardan como número crudo (1.6915, 15.8): acá se
// redondean a 2 decimales para no mostrar "1,6915".
function formatMedida(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

function buildWhatsAppLink(coin) {
  const title   = coin.title   || "Sin título";
  const country = coin.country || "País no informado";
  let price     = coin.price   || "precio no informado";
  if (getCurrency() === "ARS" && coin.price) {
    const curUSD = parsePriceUSD(coin.price);
    if (Number.isFinite(curUSD) && curUSD > 0) {
      price = `${formatPriceARS(curUSD * getBlueRate())} (${coin.price})`;
    }
  }
  const id       = coin.id || "sin id";
  const descLine = coin.description ? `\n*${coin.description}*` : "";
  const message  = `Hola Numismatica Popper!\nEstoy interesado en:\n*${title}*\n*${country}*${descLine}\n*${price}*\n*${id}*\nMuchas gracias!`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// ─── Galería ─────────────────────────────────────────────────────────────────

const isVideoSrc = (src) => /\.mp4$/i.test(String(src || ""));

// La foto grande va en resolución original: es la que se mira de cerca. Para
// que no quede un cuadro negro mientras baja (~500 KB), primero se pone la
// miniatura, que suele estar en caché, y se cambia por la original al llegar.
function showProgressive(img, src) {
  const token = String(Date.now() + Math.random());
  img.dataset.token = token;
  img.dataset.fullSrc = src;
  const thumb = thumbFor(src);
  img.src = thumb !== src ? thumb : src;
  if (thumb === src) return;
  const full = new Image();
  full.onload = () => { if (img.dataset.token === token) img.src = src; };
  full.src = src;
}

function setMainMedia(src) {
  const mainImg   = document.getElementById("detailMainImage");
  const mainVideo = document.getElementById("detailMainVideo");
  const zoomBtn   = document.getElementById("detailZoom");
  const video = isVideoSrc(src);
  if (video) {
    if (mainImg)   { mainImg.removeAttribute("src"); mainImg.hidden = true; }
    if (mainVideo) { mainVideo.src = src; mainVideo.hidden = false; }
  } else {
    // Con fundido: la foto que está se apaga, cambia y la nueva aparece.
    if (mainImg)   { if (src) swapFundido(mainImg, () => showProgressive(mainImg, src)); mainImg.hidden = false; }
    if (mainVideo) { mainVideo.removeAttribute("src"); mainVideo.hidden = true; }
  }
  if (zoomBtn) zoomBtn.hidden = video || !src;
}

function buildThumbStrip(coin) {
  const thumbsContainer = document.getElementById("detailThumbs");
  if (!thumbsContainer) return;

  thumbsContainer.innerHTML = "";
  const images = getImagesArray(coin);
  if (images.length <= 1) return;

  // La activa es la de portada (la que termina en "A"), no la primera del array.
  const primary = getPrimaryImage(coin);

  images.forEach((src, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `detail-thumb${src === primary ? " is-active" : ""}`;
    const fotosSolo = images.filter(f => !isVideoSrc(f));
    button.setAttribute("aria-label", isVideoSrc(src) ? "Ver video" : `Ver ${nombreFoto(fotosSolo.indexOf(src), fotosSolo.length).toLowerCase()}`);
    button.setAttribute("aria-pressed", String(src === primary));

    if (isVideoSrc(src)) {
      const video = document.createElement("video");
      video.src = src;
      video.preload = "metadata";
      video.muted = true;
      button.appendChild(video);
      button.appendChild(el("span", "detail-thumb__tag", "Video"));
    } else {
      const img = document.createElement("img");
      img.loading = src === primary ? "eager" : "lazy";
      img.decoding = "async";
      img.dataset.fullSrc = src;
      img.src = thumbFor(src);
      img.alt = "";
      attachImgRetry(img);
      button.appendChild(img);
    }

    button.addEventListener("click", () => {
      setMainMedia(src);
      if (isVideoSrc(src)) {
        const mainVideo = document.getElementById("detailMainVideo");
        if (mainVideo) mainVideo.play().catch(() => {});
      }
      thumbsContainer.querySelectorAll(".detail-thumb").forEach(t => {
        t.classList.toggle("is-active", t === button);
        t.setAttribute("aria-pressed", String(t === button));
      });
    });

    thumbsContainer.appendChild(button);
  });
}

// Foto ampliada con zoom: la original de ~2800px. Se acerca con los botones,
// la rueda, doble toque o pellizcando, y se arrastra para recorrerla. Abajo se
// pasa de una foto a otra (anverso, reverso) sin salir.
function setupVisor() {
  const visor = document.getElementById("visor");
  if (!visor) return;
  visor.setAttribute("role", "dialog");
  visor.setAttribute("aria-modal", "true");
  visor.setAttribute("aria-label", "Foto ampliada");
  visor.innerHTML = `
    <div class="visor__escena" id="visorEscena"><img class="visor__img" id="visorImg" alt="" draggable="false" /></div>
    <div class="visor__barra">
      <div class="visor__zoom" role="group" aria-label="Zoom">
        <button type="button" id="visorMenos" aria-label="Alejar">−</button>
        <button type="button" id="visorMas" aria-label="Acercar">+</button>
      </div>
      <div class="moneda-switch visor__caras" id="visorCaras" role="group" aria-label="Foto"></div>
      <button type="button" class="visor__cerrar" id="visorCerrar" aria-label="Cerrar la foto ampliada">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <p class="visor__pista" id="visorPista">Pellizcá o tocá dos veces para acercar</p>`;
  const escena = document.getElementById("visorEscena");
  const img = document.getElementById("visorImg");
  const caras = document.getElementById("visorCaras");
  const MAX = 6;
  let scale = 1, tx = 0, ty = 0, fotos = [], actual = 0, opener = null;
  const pointers = new Map();
  let pinch = null, lastTap = 0, moved = false;

  // La foto no se va de la pantalla: como mucho, su borde llega al centro.
  function clamp() {
    const r = escena.getBoundingClientRect();
    const maxX = Math.max(0, (img.offsetWidth * scale - r.width) / 2 + r.width * 0.25 * (scale > 1 ? 1 : 0));
    const maxY = Math.max(0, (img.offsetHeight * scale - r.height) / 2 + r.height * 0.25 * (scale > 1 ? 1 : 0));
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }

  function paint(animar) {
    clamp();
    img.classList.toggle("is-animando", !!animar && !prefersReducedMotion());
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    escena.classList.toggle("is-acercada", scale > 1.01);
    document.getElementById("visorMenos").disabled = scale <= 1.01;
    document.getElementById("visorMas").disabled = scale >= MAX - 0.01;
    if (scale > 1.01) document.getElementById("visorPista").hidden = true;
  }

  // Acercar manteniendo fijo el punto (x, y) de la pantalla.
  function zoomTo(next, x, y, animar) {
    const r = escena.getBoundingClientRect();
    const cx = (x ?? r.left + r.width / 2) - (r.left + r.width / 2);
    const cy = (y ?? r.top + r.height / 2) - (r.top + r.height / 2);
    next = Math.min(MAX, Math.max(1, next));
    const k = next / scale;
    tx = cx - (cx - tx) * k;
    ty = cy - (cy - ty) * k;
    scale = next;
    if (scale === 1) { tx = 0; ty = 0; }
    paint(animar);
  }

  function show(index) {
    actual = index;
    scale = 1; tx = 0; ty = 0;
    const src = fotos[index];
    const token = String(Math.random());
    img.dataset.token = token;
    // Primero la que ya está en caché, y la original al llegar.
    img.src = thumbFor(src);
    const full = new Image();
    full.onload = () => { if (img.dataset.token === token && !visor.hidden) img.src = src; };
    full.src = src;
    img.alt = `${activeCoin ? activeCoin.title : "Moneda"}: ${nombreFoto(index, fotos.length).toLowerCase()}`;
    caras.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
    paint(false);
  }

  function open(src) {
    fotos = getImagesArray(activeCoin).filter(f => !isVideoSrc(f));
    if (!fotos.length) return;
    caras.replaceChildren(...fotos.map((_, i) => {
      const b = el("button", "", nombreFoto(i, fotos.length));
      b.type = "button";
      b.addEventListener("click", () => show(i));
      return b;
    }));
    caras.hidden = fotos.length < 2;
    opener = document.activeElement;
    visor.hidden = false;
    document.documentElement.style.overflow = "hidden";
    document.getElementById("visorPista").hidden = !matchMedia("(pointer: coarse)").matches;
    show(Math.max(0, fotos.indexOf(src)));
    document.getElementById("visorCerrar").focus({ preventScroll: true });
  }

  function close() {
    visor.hidden = true;
    img.removeAttribute("src");
    pointers.clear();
    document.documentElement.style.overflow = "";
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#detailZoom, #detailMainImage")) return;
    const main = document.getElementById("detailMainImage");
    if (!main || !main.src || main.hidden) return;
    open(main.dataset.fullSrc || main.src);
  });

  document.getElementById("visorCerrar").addEventListener("click", close);
  document.getElementById("visorMas").addEventListener("click", () => zoomTo(scale * 1.6, null, null, true));
  document.getElementById("visorMenos").addEventListener("click", () => zoomTo(scale / 1.6, null, null, true));

  escena.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomTo(scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY, false);
  }, { passive: false });

  escena.addEventListener("pointerdown", (e) => {
    escena.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  });

  escena.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(pinch.scale * dist / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2, false);
      moved = true;
    } else if (pointers.size === 1 && scale > 1.01) {
      tx += cur.x - prev.x;
      ty += cur.y - prev.y;
      if (Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) > 2) moved = true;
      paint(false);
    }
  });

  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size || moved) return;
    // Doble toque (o doble clic): acerca a ese punto, o vuelve a entera.
    const now = Date.now();
    if (now - lastTap < 320) {
      lastTap = 0;
      zoomTo(scale > 1.01 ? 1 : 2.8, e.clientX, e.clientY, true);
    } else {
      lastTap = now;
      // Un toque sobre el negro, con la foto entera, cierra.
      if (e.target === escena && scale <= 1.01) close();
    }
  };
  escena.addEventListener("pointerup", up);
  escena.addEventListener("pointercancel", (e) => { pointers.delete(e.pointerId); pinch = null; });

  document.addEventListener("keydown", (e) => {
    if (visor.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "+" || e.key === "=") zoomTo(scale * 1.6, null, null, true);
    else if (e.key === "-") zoomTo(scale / 1.6, null, null, true);
    else if (e.key === "ArrowRight" && fotos.length > 1) show((actual + 1) % fotos.length);
    else if (e.key === "ArrowLeft" && fotos.length > 1) show((actual - 1 + fotos.length) % fotos.length);
    else if (e.key === "Tab") {
      // El foco da la vuelta adentro del visor.
      const items = [...visor.querySelectorAll("button:not([disabled])")].filter(n => n.offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener("resize", () => { if (!visor.hidden) paint(false); });
}

// Con dos fotos son anverso y reverso; con más, se numeran.
function nombreFoto(index, total) {
  if (total === 2) return index === 0 ? "Anverso" : "Reverso";
  return `Foto ${index + 1}`;
}

// ─── Ficha técnica ───────────────────────────────────────────────────────────

// Solo las filas con dato: nada de "NA".
function renderSpecs(coin) {
  const box = document.getElementById("detailSpecs");
  if (!box) return;
  const mintage = coin.mintage
    ? Number(String(coin.mintage).replace(/[.,]/g, "")).toLocaleString("es-AR")
    : "";
  // De lo que identifica la pieza a lo que la mide. El estado lleva a la guía.
  const rows = [
    ["País", coin.country],
    ["Año", coin.year],
    ["Metal", coin.metal],
    ["Estado", coin.grade ? `${coin.grade}${coin.grade_short ? ` (${coin.grade_short})` : ""}` : "", "conservacion.html"],
    ["Catálogo", coin.reference],
    ["Tirada", mintage && mintage !== "NaN" ? `${mintage} piezas` : ""],
    ["Peso", coin.peso ? `${formatMedida(coin.peso)} g` : ""],
    ["Diámetro", coin.diametro ? `${formatMedida(coin.diametro)} mm` : ""],
    ["Conmemora", coin.commemorates],
    ["Código", coin.id != null ? `#${coin.id}` : ""],
  ];
  box.replaceChildren();
  const sinDato = v => v == null || /^(|s\/f|n\/a|na)$/i.test(String(v).trim());
  rows.filter(([, v]) => !sinDato(v)).forEach(([k, v, href]) => {
    const row = el("div", "detail-spec-row");
    const dd = el("dd", "detail-spec-value");
    if (href) {
      const a = el("a", "detail-spec-link", String(v));
      a.href = href;
      a.title = "Qué significa cada estado de conservación";
      dd.appendChild(a);
    } else {
      dd.textContent = String(v);
    }
    row.append(el("dt", "detail-spec-label", k), dd);
    box.appendChild(row);
  });
}

// ─── Vendida ─────────────────────────────────────────────────────────────────

// Un link viejo de WhatsApp a una pieza vendida tiene que decirlo claro: sin
// precio, sin carrito, con un camino a piezas parecidas.
function applySoldState(coin) {
  const isSold = coin.status === "sold";
  document.body.classList.toggle("is-sold-detail", isSold);

  const wrap = document.querySelector(".detail-main-image-wrap");
  if (wrap) {
    const existing = wrap.querySelector(".sold-ribbon");
    if (isSold && !existing) wrap.appendChild(el("div", "sold-ribbon", "Vendida"));
    else if (!isSold && existing) existing.remove();
  }

  const waEl = document.getElementById("detailWhatsapp");
  if (waEl) waEl.hidden = isSold;
  const garantias = document.getElementById("detailGarantias");
  if (garantias) garantias.hidden = isSold;

  const aviso = document.getElementById("detailVendida");
  if (aviso) {
    aviso.hidden = !isSold;
    aviso.querySelector("p").textContent = isSalaCoin(coin)
      ? "Esta pieza estuvo en la Sala de Rarezas y ya fue vendida."
      : "Esta pieza ya fue vendida.";
  }
}

// ─── Contenido ───────────────────────────────────────────────────────────────

function renderPrice(coin) {
  const priceEl = document.getElementById("detailPrice");
  if (!priceEl) return;
  if (coin.status === "sold") {
    priceEl.textContent = "Vendida";
    priceEl.classList.add("is-sold-price");
  } else {
    priceEl.innerHTML = formatCoinPrice(coin);
    priceEl.classList.remove("is-sold-price");
  }
}

// Todo lo que cambia al elegir otra variante del grupo.
function updateCoinContent(coin, { replaceUrl = true } = {}) {
  setMainMedia(getPrimaryImage(coin));
  buildThumbStrip(coin);

  const countryEl = document.getElementById("detailCountry");
  if (countryEl) countryEl.textContent = coin.country || "País no informado";
  applyCoinTitle(document.getElementById("detailTitle"), coin.title || "Sin título");

  const main = document.getElementById("detailMainImage");
  if (main) main.alt = [coin.title || "Moneda", coin.country].filter(Boolean).join(", ");

  const descEl = document.getElementById("detailDescription");
  if (descEl) {
    descEl.innerHTML = coin.description ? escapeHTML(coin.description).replace(/\n/g, "<br>") : "";
    descEl.hidden = !coin.description;
  }

  const sala = document.getElementById("detailSala");
  if (sala) {
    sala.hidden = !isSalaCoin(coin);
    sala.href = `sala.html#p-${encodeURIComponent(coin.id)}`;
  }

  const nota = document.getElementById("detailNota");
  if (nota) {
    nota.hidden = !coin.sala_nota;
    nota.querySelector("p").textContent = coin.sala_nota || "";
  }

  renderSpecs(coin);
  renderPrice(coin);

  const waEl = document.getElementById("detailWhatsapp");
  if (waEl) waEl.href = buildWhatsAppLink(coin);

  activeCoin = coin;
  updateDetailCartBtn(coin);
  applySoldState(coin);
  // En moneda/<id>.html el <title> lo escribe generate_coin_pages.py pensando
  // en Google: no se pisa. En detalle.html?id= sí, para que la pestaña diga qué es.
  if (!window.POPPER_COIN_ID) document.title = `${coin.title || "Moneda"} | Numismática Popper`;

  if (replaceUrl) history.replaceState(null, "", `?id=${coin.id}`);
}

function renderVariants(coin, groupMembers) {
  const box = document.getElementById("detailVariants");
  if (!box) return;
  const disponibles = groupMembers.filter(m => m.status !== "sold").length;
  box.querySelector(".variants-heading").textContent =
    `${groupMembers.length} variantes${disponibles < groupMembers.length ? ` · ${disponibles} disponibles` : ""}`;
  const list = box.querySelector(".variants-list");

  const isDescribed = (m) => m.group_id && (
    m.group_id.includes("quarters") || m.group_id === "ca-25cents-2000-millennium" ||
    m.group_id.includes("conmemorativas") || m.group_id.includes("fauna") || m.group_id.includes("ceramicos")
  );

  // Si todas son del mismo año, el año ya está en el título: no se repite en
  // cada variante y el estado pasa a ser su nombre.
  const sameYear = new Set(groupMembers.map(m => String(m.year || ""))).size === 1;

  groupMembers.forEach(member => {
    const btn = el("button", "variant-thumb" + (member.id === coin.id ? " is-active" : ""));
    btn.type = "button";
    btn.dataset.coinId = member.id;
    if (member.status === "sold") {
      btn.classList.add("is-sold");
      btn.disabled = true;
    }

    const img = el("img");
    const memberPrimary = getPrimaryImage(member);
    img.dataset.fullSrc = memberPrimary;
    img.src = thumbFor(memberPrimary);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    attachImgRetry(img);

    const info = el("span", "variant-info");
    let label;
    if (isDescribed(member) && String(member.description || "").trim()) {
      label = String(member.description).trim();
    } else {
      const { extra } = splitCoinTitle(member.title);
      label = sameYear ? (extra || "") : ([member.year, extra].filter(Boolean).join(" ") || member.title);
    }
    if (label) {
      info.appendChild(el("span", "variant-year", label));
      if (member.grade) info.appendChild(el("span", "variant-grade", member.grade));
    } else if (member.grade) {
      info.appendChild(el("span", "variant-year", member.grade));
    }
    const priceEl = el("span", "variant-price");
    if (member.status === "sold") priceEl.textContent = "Vendida";
    else paintPrice(priceEl, member);
    info.appendChild(priceEl);

    btn.append(img, info);
    if (member.status !== "sold") {
      btn.addEventListener("click", () => {
        list.querySelectorAll(".variant-thumb").forEach(t => t.classList.toggle("is-active", t === btn));
        updateCoinContent(member);
      });
    }
    list.appendChild(btn);
  });
}

function renderCoinDetail(coin, groupMembers) {
  const hasVariants = groupMembers && groupMembers.length > 1;
  const mainImage = getPrimaryImage(coin);
  const mainIsVideo = isVideoSrc(mainImage);

  detailContainer.innerHTML = `
    <div class="detail-row">
      <div class="detail-gallery">
        ${hasVariants ? `
        <!-- Las variantes van primero: se elige la pieza y después se mira. -->
        <div class="variants-section" id="detailVariants">
          <h2 class="variants-heading"></h2>
          <div class="variants-list"></div>
        </div>` : ""}
        <div class="detail-main-image-wrap">
          <img id="detailMainImage" class="detail-main-image fundido" alt="" decoding="async"${mainIsVideo ? " hidden" : ""} />
          <video id="detailMainVideo" class="detail-main-image" controls playsinline
            ${mainIsVideo ? `src="${escapeHTML(mainImage)}"` : "hidden"}></video>
        </div>
        <div class="detail-gallery__bar">
          <div class="detail-thumbs" id="detailThumbs"></div>
          <button type="button" class="detail-zoom" id="detailZoom">${ICON_ZOOM}Ampliar foto</button>
        </div>
      </div>

      <div class="detail-info">
        <a class="detail-sala" id="detailSala" href="sala.html" hidden>Sala de Rarezas</a>
        <p class="detail-country" id="detailCountry"></p>
        <h1 class="display detail-title" id="detailTitle"></h1>

        <p class="detail-price price" id="detailPrice"></p>

        <div class="detail-vendida" id="detailVendida" hidden>
          <p></p>
          <a class="arrow-link" href="#relacionadas">Ver piezas parecidas</a>
        </div>

        <!-- Dos botones claros: comprar (el principal) y consultar. Compartir
             queda como link. -->
        <div class="detail-actions">
          <button type="button" class="btn btn--solid detail-cart" id="detailAddToCart" hidden></button>
          <a class="btn btn--quiet detail-wa" id="detailWhatsapp" href="#" target="_blank" rel="noopener noreferrer">${ICON_WA}<span>Consultar por WhatsApp</span></a>
          <button type="button" class="link-icono" id="detailShare">${ICON_SHARE}<span>Compartir</span></button>
        </div>

        <ul class="detail-garantias" id="detailGarantias">
          <li>La pieza de la foto es la que recibís.</li>
          <li>Entrega en Parque Rivadavia o envío a todo el país.</li>
          <li>Pagás recién al coordinar: transferencia o Mercado Pago.</li>
        </ul>

        <div class="detail-nota" id="detailNota" hidden>
          <h2>Nota</h2>
          <p></p>
        </div>

        <h2 class="detail-subtitle">Ficha técnica</h2>
        <dl class="detail-specs" id="detailSpecs"></dl>

        <h2 class="detail-subtitle" id="detailDescTitle">Descripción</h2>
        <p class="detail-description" id="detailDescription" hidden></p>
      </div>
    </div>
  `;

  const mainImageEl = document.getElementById("detailMainImage");
  if (mainImageEl) attachImgRetry(mainImageEl);

  updateCoinContent(coin, { replaceUrl: false });
  // El subtítulo "Descripción" se va con su texto.
  const descTitle = document.getElementById("detailDescTitle");
  const syncDescTitle = () => { descTitle.hidden = document.getElementById("detailDescription").hidden; };
  syncDescTitle();
  new MutationObserver(syncDescTitle).observe(document.getElementById("detailDescription"), { attributes: true });

  if (hasVariants) renderVariants(coin, groupMembers);

  document.getElementById("detailAddToCart").addEventListener("click", (e) => {
    if (!window.PopperCart || !activeCoin) return;
    if (window.PopperCart.has(activeCoin.id)) {
      window.PopperCart.open();
    } else if (window.PopperCart.add(activeCoin, e.currentTarget, { silent: true })) {
      updateDetailCartBtn(activeCoin);
      window.PopperCart.open();
    }
  });

  setupCompraFija();

  // En el celular, el menú de compartir del teléfono (WhatsApp, etc.); en la
  // compu, copiar el link.
  const shareBtn = document.getElementById("detailShare");
  shareBtn.addEventListener("click", async () => {
    const url = `https://numismaticapopper.com/moneda/${activeCoin.id}.html`;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: activeCoin.title, url });
        return;
      } catch (_) { /* canceló: no hace falta avisar */ return; }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch (_) {
      const temp = document.createElement("textarea");
      temp.value = url;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    const label = shareBtn.querySelector("span");
    label.textContent = "Link copiado";
    setTimeout(() => { label.textContent = "Compartir"; }, 2000);
  });
}

// ─── Compra fija (celular) ───────────────────────────────────────────────────

// En el celular, cuando el botón de comprar quedó arriba (se está leyendo la
// ficha técnica o mirando piezas parecidas), una barra al pie lo trae de
// vuelta: nombre, precio y agregar. Mientras se ve, el botón flotante de
// WhatsApp se corre para no taparla.
function setupCompraFija() {
  const boton = document.getElementById("detailAddToCart");
  if (!boton || !("IntersectionObserver" in window)) return;
  const barra = el("div", "compra-fija");
  barra.hidden = true;
  const info = el("div", "compra-fija__info");
  const nombre = el("span", "compra-fija__nombre");
  const precio = el("span", "price compra-fija__precio");
  info.append(nombre, precio);
  const btn = el("button", "btn btn--solid compra-fija__btn");
  btn.type = "button";
  barra.append(info, btn);
  document.body.appendChild(barra);

  let fuera = false;
  const sync = () => {
    const coin = activeCoin;
    const comprable = coin && coin.status !== "sold" && hasFixedPrice(coin);
    const visible = fuera && comprable;
    barra.hidden = !visible;
    document.body.classList.toggle("con-compra-fija", !!visible);
    if (!comprable) return;
    nombre.textContent = coin.title || "";
    precio.innerHTML = formatCoinPrice(coin);
    const inCart = !!(window.PopperCart && window.PopperCart.has(coin.id));
    btn.textContent = inCart ? "Ver carrito" : "Agregar";
    btn.setAttribute("aria-label", inCart ? "Ver el carrito" : `Agregar ${coin.title} al carrito`);
  };
  btn.addEventListener("click", () => boton.click());
  new IntersectionObserver(([entry]) => {
    // Solo cuando el botón quedó ARRIBA de la pantalla, no antes de llegar a él.
    fuera = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
    sync();
  }).observe(boton);
  window.addEventListener("popper:cart-updated", sync);
  window.addEventListener("popper:currency-changed", sync);
  new MutationObserver(sync).observe(document.getElementById("detailTitle"), { childList: true, subtree: true });
}

// ─── Piezas parecidas ────────────────────────────────────────────────────────

// Del mismo país (o argentinas con argentinas) y de precio parecido, una por
// grupo de variantes.
function renderRelacionadas(coin) {
  const section = document.getElementById("relacionadas");
  if (!section) return;
  const country = countryLabel(coin);
  const target = parsePriceUSD(coin.price);
  const distance = (c) => {
    const p = parsePriceUSD(c.price);
    if (!Number.isFinite(p) || !Number.isFinite(target) || p <= 0 || target <= 0) return 99;
    return Math.abs(Math.log(p / target));
  };
  const seen = new Set(coin.group_id ? [coin.group_id] : []);
  const picks = allCoins
    .filter(c => isAvailable(c) && String(c.id) !== String(coin.id) && countryLabel(c) === country)
    .sort((a, b) => distance(a) - distance(b))
    .filter(c => {
      if (!c.group_id) return true;
      if (seen.has(c.group_id)) return false;
      seen.add(c.group_id);
      return true;
    })
    .slice(0, RELACIONADAS);
  if (!picks.length) return;

  const grid = document.getElementById("relacionadasGrid");
  grid.replaceChildren(...picks.map(c => tarjeta(c)));
  document.getElementById("relacionadasTitulo").textContent = `Más monedas de ${country}`;
  const link = document.getElementById("relacionadasLink");
  link.firstChild.textContent = `Ver todas las de ${country} `;
  link.href = country === "Argentina"
    ? "catalogo.html?origen=argentina"
    : `catalogo.html?pais=${encodeURIComponent(String(coin.country || "").trim())}`;
  section.hidden = false;
}

// ─── Arranque ────────────────────────────────────────────────────────────────

function showError(message) {
  detailContainer.innerHTML = `
    <div class="detail-error">
      <p>${message}</p>
      <a class="btn btn--solid" href="catalogo.html">Ver el catálogo</a>
    </div>`;
}

async function loadCoinDetail() {
  // moneda/<id>.html no lleva ?id=: trae el id en window.POPPER_COIN_ID
  // (lo escribe generate_coin_pages.py).
  const rawId = getQueryParam("id") || window.POPPER_COIN_ID;
  if (!rawId || !String(rawId).trim()) {
    showError("No se indicó ninguna moneda.");
    return;
  }
  const cleanId = String(rawId).trim().toLowerCase();

  try {
    allCoins = await loadAllCoins();
    const coin = allCoins.find(c => String(c.id).toLowerCase() === cleanId);
    if (!coin) {
      showError("No encontramos esta moneda.");
      return;
    }

    // Las ocultas y las vendidas vencidas no se muestran, salvo las de la Sala:
    // esas siguen visibles como parte de su archivo.
    const archivada = !coin.hidden && coin.status === "sold" && isSalaCoin(coin);
    if (!isCoinPubliclyVisible(coin) && !archivada) {
      showError("Esta moneda ya no está disponible.");
      return;
    }

    let groupMembers = null;
    if (coin.group_id) {
      const year = (c) => {
        const y = parseInt(c.year, 10);
        return Number.isNaN(y) ? 0 : y;
      };
      groupMembers = allCoins
        .filter(c => c.group_id === coin.group_id && !c.hidden && !isSoldExpired(c))
        .sort((a, b) =>
          (year(a) - year(b)) ||
          (getVariantGradeScore(b) - getVariantGradeScore(a)) ||
          String(a.id).localeCompare(String(b.id), "es", { numeric: true })
        );
    }

    renderCoinDetail(coin, groupMembers);
    renderRelacionadas(coin);
    arrancarArriba();
  } catch (error) {
    console.error(error);
    showError("Hubo un error al cargar la moneda. Probá recargar la página.");
  }
}

setupVisor();
loadCoinDetail();

// "Volver al catálogo" usa history.back() si venimos del sitio, para que el
// catálogo quede con sus filtros y en la misma posición. NO alcanza con
// `history.length > 1`: quien abre un link de WhatsApp en una pestaña con
// historial saldría del sitio. Lo que importa es de dónde viene (el referrer).
function cameFromOwnSite() {
  if (!document.referrer) return false;
  try {
    const ref = new URL(document.referrer);
    return ref.origin === window.location.origin && !/\/moneda\//.test(ref.pathname);
  } catch (_) {
    return false;
  }
}

const backLink = document.querySelector(".back-link");
if (backLink) {
  backLink.addEventListener("click", (e) => {
    if (!cameFromOwnSite()) return;
    e.preventDefault();
    history.back();
  });
}

// ─── Dólares / pesos ─────────────────────────────────────────────────────────

// Los precios de variantes y relacionadas los repinta museo.js (data-price-id).
window.addEventListener("popper:currency-changed", () => {
  if (!activeCoin) return;
  renderPrice(activeCoin);
  const waEl = document.getElementById("detailWhatsapp");
  if (waEl) waEl.href = buildWhatsAppLink(activeCoin);
});
