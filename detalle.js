const detailContainer = document.getElementById("coinDetail");
const WHATSAPP_NUMBER = "5492235429132";

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// splitCoinTitle, applyCoinTitle, getImagesArray, attachImgRetry, thumbFor,
// gradeRank y escapeHTML viven en common.js: son exactamente las mismas que usa
// el catálogo. Antes estaban duplicadas acá y dos ya habían divergido — la copia
// de esta página tomaba `images[0]` como foto principal en vez de la que termina
// en "A", así que la moneda 1018 se veía distinta en la grilla y en la ficha.

/**
 * Puntaje de conservación para ORDENAR LAS VARIANTES de un grupo.
 *
 * Deliberadamente NO es `gradeRank` de common.js: esta escala penaliza el
 * sufijo "**" (pieza con defecto) restando 15 y separa SC de SC-, cosas que la
 * del catálogo no distingue. Entre las monedas agrupadas hay 9 con "**" y 4 con
 * "SC-", así que unificarlas cambiaría el orden en que se listan las variantes.
 * Se deja tal cual a propósito; si algún día se unifican, hay que revisar esas
 * 13 fichas a ojo.
 */
function getVariantGradeScore(c) {
  const grade = (c.grade_short || "").toUpperCase().trim();
  if (grade.startsWith("SC")) {
    return grade.includes("-") ? 140 : 150;
  }
  if (grade.startsWith("EX")) {
    let score = 110;
    if (grade.includes("+")) score = 120;
    if (grade.includes("-")) score = 100;
    if (grade.includes("**")) score -= 15;
    return score;
  }
  if (grade.startsWith("MB")) {
    let score = 80;
    if (grade.includes("+")) score = 90;
    if (grade.includes("-")) score = 70;
    if (grade.includes("**")) score -= 15;
    return score;
  }
  if (grade.startsWith("B")) {
    let score = 50;
    if (grade.includes("+")) score = 60;
    if (grade.includes("-")) score = 40;
    if (grade.includes("**")) score -= 15;
    return score;
  }
  if (grade.startsWith("R")) {
    let score = 20;
    if (grade.includes("+")) score = 30;
    if (grade.includes("**")) score -= 15;
    return score;
  }
  return 0;
}

function buildWhatsAppLink(coin) {
  const title   = coin.title   || "Sin título";
  const country = coin.country || "País no informado";
  const price   = coin.price   || "precio no informado";
  const id      = coin.id      || "sin id";
  const descLine = coin.description ? `\n*${coin.description}*` : "";
  const message = `Hola Numismatica Popper!\nEstoy interesado en:\n*${title}*\n*${country}*${descLine}\n*${price}*\n*${id}*\nMuchas gracias!`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// ─── Galería ─────────────────────────────────────────────────────────────────
//
// La tira de miniaturas se construía DOS veces con código distinto (una en el
// render inicial y otra al cambiar de variante), y la segunda copia se había
// quedado sin el reintento de imagen y sin el `loading`. Ahora hay una sola.

const isVideoSrc = (src) => /\.mp4$/i.test(String(src || ""));

// La foto grande sí va en resolución original: es la que se mira de cerca.
function setMainMedia(src) {
  const mainImg   = document.getElementById("detailMainImage");
  const mainVideo = document.getElementById("detailMainVideo");
  if (isVideoSrc(src)) {
    if (mainImg)   { mainImg.removeAttribute("src"); mainImg.style.display = "none"; }
    if (mainVideo) { mainVideo.src = src; mainVideo.style.display = ""; }
  } else {
    if (mainImg)   { mainImg.src = src || ""; mainImg.style.display = ""; }
    if (mainVideo) { mainVideo.removeAttribute("src"); mainVideo.style.display = "none"; }
  }
}

function buildThumbStrip(coin) {
  const thumbsContainer = document.getElementById("detailThumbs");
  if (!thumbsContainer) return;

  thumbsContainer.innerHTML = "";
  const images = getImagesArray(coin);
  if (images.length <= 1) return;

  // La activa es la que se está viendo en grande, que es la de portada — no
  // necesariamente la primera del array.
  const primary = getPrimaryImage(coin);

  images.forEach((src, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `detail-thumb${src === primary ? " is-active" : ""}`;
    button.dataset.image = src;

    if (isVideoSrc(src)) {
      const video = document.createElement("video");
      video.src = src;
      video.preload = "metadata";
      video.muted = true;
      button.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.loading = src === primary ? "eager" : "lazy";
      img.decoding = "async";
      // Miniatura WebP de ~49 KB, no el original de ~530 KB: esto es un
      // cuadradito de 60px. Una ficha con 4 fotos bajaba ~2 MB para dibujarlos.
      img.dataset.fullSrc = src;
      img.src = thumbFor(src);
      img.alt = `${coin.title || "Moneda"} ${index + 1}`;
      attachImgRetry(img);
      button.appendChild(img);
    }

    button.addEventListener("click", () => {
      setMainMedia(src);
      if (isVideoSrc(src)) {
        const mainVideo = document.getElementById("detailMainVideo");
        if (mainVideo) mainVideo.play().catch(() => {});
      }
      thumbsContainer.querySelectorAll(".detail-thumb")
        .forEach(t => t.classList.toggle("is-active", t === button));
    });

    thumbsContainer.appendChild(button);
  });
}

// Estado "vendida" de la moneda principal. La ficha no lo miraba en absoluto:
// solo lo consultaba para las variantes. Como cada moneda tiene su
// moneda/<id>.html público, abrir un link viejo de WhatsApp de una pieza ya
// vendida mostraba precio normal y el botón de consulta activo.
function applySoldState(coin) {
  const isSold = coin.status === "sold";
  document.body.classList.toggle("is-sold-detail", isSold);

  const wrap = document.querySelector(".detail-main-image-wrap");
  if (wrap) {
    const existing = wrap.querySelector(".sold-ribbon");
    if (isSold && !existing) {
      const ribbon = document.createElement("div");
      ribbon.className = "sold-ribbon";
      ribbon.textContent = "VENDIDO";
      wrap.appendChild(ribbon);
    } else if (!isSold && existing) {
      existing.remove();
    }
  }

  const priceEl = document.getElementById("detailPrice");
  if (priceEl) priceEl.classList.toggle("is-sold-price", isSold);

  const waEl = document.getElementById("detailWhatsapp");
  if (waEl) {
    waEl.hidden = isSold;
    waEl.setAttribute("aria-hidden", isSold ? "true" : "false");
    if (isSold) waEl.setAttribute("tabindex", "-1");
    else waEl.removeAttribute("tabindex");
  }
}

// ─── Dynamic update (called when switching variants) ─────────────────────────

function updateCoinContent(coin) {
  // getPrimaryImage y no images[0]: la foto de portada es la que termina en "A".
  // Es exactamente la que muestra la grilla, así que abrir una tarjeta ya no
  // cambia de foto (la moneda 1018 tiene ["1018C","1018A","1018B"]).
  setMainMedia(getPrimaryImage(coin));
  buildThumbStrip(coin);

  // Text / spec fields
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value || "NA";
  };

  const countryEl = document.getElementById("detailCountry");
  if (countryEl) countryEl.textContent = coin.country || "País no informado";

  const titleEl = document.getElementById("detailTitle");
  applyCoinTitle(titleEl, coin.title || "Sin título");

  const descEl = document.getElementById("detailDescription");
  if (descEl) {
    if (coin.description) {
      descEl.innerHTML = escapeHTML(coin.description).replace(/\n/g, "<br>");
      descEl.style.display = "";
    } else {
      descEl.style.display = "none";
    }
  }

  set("specReference", coin.reference);
  set("specGrade",     coin.grade);
  set("specMetal",     coin.metal);
  set("specId",        coin.id != null ? String(coin.id) : "NA");

  const mintageRow = document.getElementById("specMintageRow");
  const mintageVal = document.getElementById("specMintage");
  if (mintageRow && mintageVal) {
    if (coin.mintage) {
      mintageVal.textContent = Number(String(coin.mintage).replace(/[.,]/g, "")).toLocaleString("es-AR");
      mintageRow.style.display = "";
    } else {
      mintageRow.style.display = "none";
    }
  }

  const priceEl = document.getElementById("detailPrice");
  if (priceEl) {
    if (coin.original_price) {
      // `.price-current` es la clase que el catálogo aplica al precio nuevo;
      // acá faltaba, así que el precio rebajado se veía sin su estilo.
      priceEl.innerHTML =
        `<span class="price-original">${escapeHTML(coin.original_price)}</span> ` +
        `<span class="price-current">${escapeHTML(coin.price || "Consultar")}</span>`;
    } else {
      priceEl.textContent = coin.price || "Consultar";
    }
  }

  const waEl = document.getElementById("detailWhatsapp");
  if (waEl) waEl.href = buildWhatsAppLink(coin);

  const shareEl = document.getElementById("detailShare");
  if (shareEl) shareEl.dataset.shareUrl = `https://numismaticapopper.com/moneda/${coin.id}.html`;

  applySoldState(coin);

  // Update URL so sharing/back-button works
  history.replaceState(null, "", `?id=${coin.id}`);
}

// ─── Full render (called once on page load) ───────────────────────────────────

// Todo lo que se interpola en este template pasa por escapeHTML(). No es
// paranoia: la moneda 463 se titula `1 Dollar 2021 "Peace Dollar"` y sus
// comillas ya rompían el atributo alt de la foto principal.
function renderCoinDetail(coin, groupMembers) {
  const images    = getImagesArray(coin);
  // La foto de portada es la que termina en "A", igual que en la grilla.
  const mainImage = getPrimaryImage(coin) || images[0];
  const mainIsVideo = isVideoSrc(mainImage);

  detailContainer.innerHTML = `
    ${groupMembers && groupMembers.length > 1 ? `
    <div class="variants-section" id="detailVariants">
      <h3 class="variants-heading">Variantes</h3>
      <div class="variants-list" id="variantsList"></div>
    </div>
    <div class="scroll-hint" aria-hidden="true">Desliza para ver más variantes<span class="scroll-hint-arrow">→</span></div>
    ` : ""}

    <div class="detail-row">
    <div class="detail-gallery reveal">
      <div class="detail-main-image-wrap">
        <img
          id="detailMainImage"
          class="detail-main-image"
          src="${mainIsVideo ? '' : escapeHTML(mainImage)}"
          alt="${escapeHTML(coin.title || "Moneda")}"
          decoding="async"
          style="${mainIsVideo ? 'display:none' : ''}"
        />
        <video
          id="detailMainVideo"
          class="detail-main-image"
          src="${mainIsVideo ? escapeHTML(mainImage) : ''}"
          controls
          style="${mainIsVideo ? '' : 'display:none'}"
        ></video>
      </div>
      <div class="detail-thumbs" id="detailThumbs"></div>
    </div>

    <div class="detail-info reveal">
      <p class="detail-country" id="detailCountry">${escapeHTML(coin.country || "País no informado")}</p>
      <h1 class="detail-title" id="detailTitle"></h1>

      <p class="detail-description" id="detailDescription"
        ${coin.description ? "" : 'style="display:none"'}
      >${coin.description ? escapeHTML(coin.description).replace(/\n/g, "<br>") : ""}</p>

      <div class="detail-divider"></div>

      <div class="detail-specs">
        <div class="detail-spec-row">
          <div class="detail-spec-label">Referencia</div>
          <div class="detail-spec-value" id="specReference">${escapeHTML(coin.reference || "NA")}</div>
        </div>
        <div class="detail-spec-row">
          <div class="detail-spec-label">Estado de conservación</div>
          <div class="detail-spec-value" id="specGrade">${escapeHTML(coin.grade || "NA")}</div>
        </div>
        <div class="detail-spec-row">
          <div class="detail-spec-label">Material</div>
          <div class="detail-spec-value" id="specMetal">${escapeHTML(coin.metal || "NA")}</div>
        </div>
        <div class="detail-spec-row" id="specMintageRow" ${coin.mintage ? "" : 'style="display:none"'}>
          <div class="detail-spec-label">Acuñación</div>
          <div class="detail-spec-value" id="specMintage">${coin.mintage ? Number(String(coin.mintage).replace(/[.,]/g, "")).toLocaleString("es-AR") : ""}</div>
        </div>
        <div class="detail-spec-row">
          <div class="detail-spec-label">Referencia interna</div>
          <div class="detail-spec-value" id="specId">${coin.id != null ? escapeHTML(coin.id) : "NA"}</div>
        </div>
      </div>

      <p class="detail-price" id="detailPrice">${coin.original_price
        ? `<span class="price-original">${escapeHTML(coin.original_price)}</span> <span class="price-current">${escapeHTML(coin.price || "Consultar")}</span>`
        : escapeHTML(coin.price || "Consultar")}</p>

      <a
        class="detail-whatsapp"
        id="detailWhatsapp"
        href="${escapeHTML(buildWhatsAppLink(coin))}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true" style="flex-shrink:0">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Consultar por WhatsApp
      </a>

      <button
        type="button"
        class="detail-share"
        id="detailShare"
        data-share-url="https://numismaticapopper.com/moneda/${coin.id}.html"
      >
        Copiar link para compartir
      </button>
    </div>
    </div>
  `;

  applyCoinTitle(document.getElementById("detailTitle"), coin.title || "Sin título");

  const shareBtn = document.getElementById("detailShare");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const url = shareBtn.dataset.shareUrl;
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        const tempInput = document.createElement("textarea");
        tempInput.value = url;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
      }
      const original = shareBtn.textContent;
      shareBtn.textContent = "¡Link copiado!";
      setTimeout(() => { shareBtn.textContent = original; }, 2000);
    });
  }

  // ── Galería ────────────────────────────────────────────────────────────────
  const mainImageEl = document.getElementById("detailMainImage");
  if (mainImageEl) attachImgRetry(mainImageEl);
  buildThumbStrip(coin);
  applySoldState(coin);

  // ── Build variant switcher ────────────────────────────────────────────────
  if (groupMembers && groupMembers.length > 1) {
    const variantsList = document.getElementById("variantsList");

    groupMembers.forEach(member => {
      const btn = document.createElement("button");
      btn.type      = "button";
      btn.className = "variant-thumb" + (member.id === coin.id ? " is-active" : "");
      if (member.status === "sold") btn.classList.add("is-sold");
      btn.dataset.coinId = member.id;

      // Miniatura WebP, no el original: una ficha de un grupo con 15 variantes
      // bajaba ~8 MB de fotos de 2800px para dibujar cuadraditos de 80px.
      const memberPrimary = getPrimaryImage(member);
      const img = document.createElement("img");
      img.dataset.fullSrc = memberPrimary;
      img.src = thumbFor(memberPrimary);
      img.alt = member.title || "Variante";
      img.loading = "lazy";
      img.decoding = "async";
      attachImgRetry(img);

      const info = document.createElement("div");
      info.className = "variant-info";

      const isQuarters = member.group_id && member.group_id.includes("quarters");
      const isMillennium = member.group_id === "ca-25cents-2000-millennium";
      const isCommemorative = member.group_id && member.group_id.includes("conmemorativas");

      const descLabel = String(member.description || "").trim() || "–";
      const gradeLabel = String(member.grade_short || "").trim() || "–";
      const yearLabel  = String(member.year || "").trim() || "–";

      const labelEl = document.createElement("span");
      labelEl.className   = "variant-year"; // Reusing class for consistency

      if ((isQuarters || isMillennium || isCommemorative) && descLabel !== "–") {
        labelEl.textContent = descLabel;
      } else {
        const parts = [yearLabel, gradeLabel].filter(p => p && p !== "–" && p !== "-");
        labelEl.textContent = parts.length ? parts.join(" ") : "–";
      }

      const priceEl = document.createElement("span");
      priceEl.className   = "variant-price";
      priceEl.textContent = member.status === "sold" ? "Vendido" : (member.price || "?");

      info.appendChild(labelEl);
      info.appendChild(priceEl);
      btn.appendChild(img);
      btn.appendChild(info);

      if (member.status !== "sold") {
        btn.addEventListener("click", () => {
          variantsList.querySelectorAll(".variant-thumb")
            .forEach(t => t.classList.toggle("is-active", t === btn));
          updateCoinContent(member);
        });
      }

      variantsList.appendChild(btn);
    });

    // Mostrar el cartel "Desliza para ver más variantes" solo si la lista
    // realmente tiene scroll horizontal (el contenido no entra en el ancho visible).
    const scrollHint = document.querySelector(".scroll-hint");
    function updateScrollHint() {
      if (!scrollHint) return;
      const scrollable = variantsList.scrollWidth > variantsList.clientWidth + 1; // +1px tolerancia
      scrollHint.classList.toggle("is-hidden", !scrollable);
    }
    requestAnimationFrame(updateScrollHint);
    window.addEventListener("resize", updateScrollHint);
  }
}

// ─── Reveal animations ────────────────────────────────────────────────────────

function initDetailRevealEffects() {
  const revealItems = document.querySelectorAll(
    ".detail-gallery, .detail-info, .detail-thumbs, .back-link"
  );
  // `.detail-gallery`, `.detail-info` y `.back-link` ya traen la clase desde el
  // markup; `.detail-thumbs` no, así que se agrega acá para todos por igual.
  revealItems.forEach(item => item.classList.add("reveal"));
  createRevealObserver(revealItems);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function loadCoinDetail() {
  const coinId = Number(getQueryParam("id"));

  if (!coinId) {
    detailContainer.innerHTML = '<p class="detail-error">No se indicó ninguna moneda.</p>';
    return false;
  }

  try {
    // Caché normal del navegador (ver el comentario en script.js/loadCoins):
    // con `no-store` cada apertura de ficha re-descargaba los 353 KB.
    const response = await fetch("coins.json");
    if (!response.ok) throw new Error("No se pudo cargar coins.json");

    const allCoins = await response.json();
    const coin     = allCoins.find(c => Number(c.id) === coinId);

    if (!coin) {
      detailContainer.innerHTML = '<p class="detail-error">No se encontró la moneda.</p>';
      return false;
    }

    // El catálogo esconde las ocultas a mano y las vendidas cuya ventana de 30
    // días ya venció, pero la ficha no filtraba nada: 63 monedas seguían
    // accesibles por URL (y con su moneda/<id>.html público) después de haber
    // desaparecido del sitio.
    if (!isCoinPubliclyVisible(coin)) {
      detailContainer.innerHTML =
        '<p class="detail-error">Esta moneda ya no está disponible. ' +
        '<a href="index.html">Ver el catálogo</a></p>';
      return false;
    }

    let groupMembers = null;
    if (coin.group_id) {
      const getYear = (c) => {
        const y = parseInt(c.year, 10);
        return Number.isNaN(y) ? 0 : y;
      };

      groupMembers = allCoins
        .filter(c => c.group_id === coin.group_id)
        .sort((a, b) => {
          // 1. Año ascendente (más antigua primero)
          const yearA = getYear(a);
          const yearB = getYear(b);
          if (yearA !== yearB) {
            return yearA - yearB;
          }
          // 2. Mismo año: mejor grado primero
          const scoreA = getVariantGradeScore(a);
          const scoreB = getVariantGradeScore(b);
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }
          // 3. Desempate estable por id
          return a.id - b.id;
        });
    }

    renderCoinDetail(coin, groupMembers);
    return true;
  } catch (error) {
    console.error(error);
    detailContainer.innerHTML = '<p class="detail-error">Hubo un error al cargar la moneda.</p>';
    return false;
  }
}

loadCoinDetail().then(() => {
  initDetailRevealEffects();
});

// "← Volver" usa history.back() para que script.js restaure el catálogo en la
// posición exacta donde estaba, en vez de mostrar la portada.
//
// La condición NO puede ser `history.length > 1`: ese contador es de toda la
// pestaña, no de este sitio. Quien abre un link compartido por WhatsApp en una
// pestaña que ya tenía historial —el caso de uso mismo de las páginas
// moneda/<id>.html— salía del dominio al tocar "Volver". Lo que corresponde
// preguntar es si venimos del catálogo, y eso lo dice el referrer.
function cameFromOwnCatalog() {
  if (!document.referrer) return false;
  try {
    const ref = new URL(document.referrer);
    return ref.origin === window.location.origin && !/\/moneda\//.test(ref.pathname);
  } catch (_) {
    return false;
  }
}

const backLink = document.querySelector('.back-link');
if (backLink) {
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (cameFromOwnCatalog()) {
      history.back();
    } else {
      window.location.href = backLink.getAttribute('href') || 'index.html';
    }
  });
}
