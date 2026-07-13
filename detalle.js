const detailContainer = document.getElementById("coinDetail");
const WHATSAPP_NUMBER = "5492235429132";

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// Separa "[valor facial] [año]" del texto extra de un título de moneda.
// Año = token de 4 dígitos (1500–2099) que aparezca DESPUÉS de una palabra (denominación),
// para no confundir el valor facial (ej. "2000 Pesos 1992" → base "2000 Pesos 1992").
function splitCoinTitle(rawTitle) {
  const title = String(rawTitle || "").trim();
  if (!title) return { base: "", extra: "" };
  const tokens = title.split(/\s+/);
  const isYear = (t) => /^\(?(1[5-9]\d{2}|20\d{2})\)?$/.test(t);
  const isAlpha = (t) => /[A-Za-zÀ-ÿ]/.test(t);

  let yearIndex = -1, sawAlpha = false;
  for (let i = 0; i < tokens.length; i++) {
    if (isYear(tokens[i]) && sawAlpha) yearIndex = i; // último año válido
    if (isAlpha(tokens[i])) sawAlpha = true;
  }

  let cut; // índice del último token que pertenece al base
  if (yearIndex >= 0) {
    cut = yearIndex;
  } else if (!/^\d/.test(tokens[0])) {
    // Sin año y sin valor facial numérico al inicio (nombres, "Medalla…",
    // "Catalogo…", "Troy Ounce", "Lote…"): todo el título es base, sin extra.
    cut = tokens.length - 1;
  } else {
    // Sin año pero con valor facial: base = hasta la denominación (primera palabra),
    // absorbiendo un año/fecha/rango pegado (ej. "1854/40", "1861-1863").
    const firstAlpha = tokens.findIndex(isAlpha);
    cut = firstAlpha === -1 ? tokens.length - 1 : firstAlpha;
    while (cut + 1 < tokens.length && /\d{4}/.test(tokens[cut + 1])) cut++;
  }
  return {
    base: tokens.slice(0, cut + 1).join(" "),
    extra: tokens.slice(cut + 1).join(" "),
  };
}

// Setea el título en un elemento: base en crema, texto extra en dorado.
function applyCoinTitle(el, rawTitle) {
  if (!el) return;
  const { base, extra } = splitCoinTitle(rawTitle);
  el.textContent = base;
  if (extra) {
    if (base) el.appendChild(document.createTextNode(" "));
    const span = document.createElement("span");
    span.className = "coin-title-extra";
    span.textContent = extra;
    el.appendChild(span);
  }
}

function getImagesArray(coin) {
  if (Array.isArray(coin.images) && coin.images.length > 0) return coin.images;
  if (coin.image) return [coin.image];
  return ["https://via.placeholder.com/900x900?text=Sin+imagen"];
}

// Re-fetches an <img> if its load fails (up to 2 times, with a cache-buster).
function attachImgRetry(img, maxTries = 2) {
  let tries = 0;
  img.addEventListener("error", () => {
    if (tries >= maxTries) return;
    tries += 1;
    const base = img.src.split("?")[0];
    setTimeout(() => { img.src = `${base}?r=${Date.now()}`; }, 250 * tries);
  });
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

// ─── Dynamic update (called when switching variants) ─────────────────────────

function updateCoinContent(coin) {
  const mainImg        = document.getElementById("detailMainImage");
  const mainVideo      = document.getElementById("detailMainVideo");
  const thumbsContainer = document.getElementById("detailThumbs");
  const images         = getImagesArray(coin);

  // Main media
  const firstMediaIsVideo = images[0] && images[0].endsWith('.mp4');
  if (firstMediaIsVideo) {
    if (mainImg) { mainImg.src = ""; mainImg.style.display = "none"; }
    if (mainVideo) { mainVideo.src = images[0]; mainVideo.style.display = ""; }
  } else {
    if (mainImg) { mainImg.src = images[0]; mainImg.style.display = ""; }
    if (mainVideo) { mainVideo.src = ""; mainVideo.style.display = "none"; }
  }

  // Rebuild image gallery thumbs
  if (thumbsContainer) {
    thumbsContainer.innerHTML = "";
    if (images.length > 1) {
      images.forEach((src, i) => {
        const btn = document.createElement("button");
        btn.type      = "button";
        btn.className = "detail-thumb" + (i === 0 ? " is-active" : "");
        
        const isVideo = src.endsWith('.mp4');
        if (isVideo) {
          const video = document.createElement("video");
          video.src = src;
          video.preload = "metadata";
          video.muted = true;
          btn.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = src;
          img.alt = `${coin.title || "Moneda"} ${i + 1}`;
          btn.appendChild(img);
        }
        
        btn.addEventListener("click", () => {
          const clickSrcIsVideo = src.endsWith('.mp4');
          if (clickSrcIsVideo) {
            if (mainImg) { mainImg.src = ""; mainImg.style.display = "none"; }
            if (mainVideo) { mainVideo.src = src; mainVideo.style.display = ""; mainVideo.play().catch(()=>{}); }
          } else {
            if (mainImg) { mainImg.src = src; mainImg.style.display = ""; }
            if (mainVideo) { mainVideo.src = ""; mainVideo.style.display = "none"; }
          }
          thumbsContainer.querySelectorAll(".detail-thumb")
            .forEach(t => t.classList.toggle("is-active", t === btn));
        });
        thumbsContainer.appendChild(btn);
      });
    }
  }

  // Text / spec fields
  const set = (id, html, asText = true) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (asText) el.textContent = html || "NA";
    else el.innerHTML = html || "NA";
  };

  const countryEl = document.getElementById("detailCountry");
  if (countryEl) countryEl.textContent = coin.country || "País no informado";

  const titleEl = document.getElementById("detailTitle");
  applyCoinTitle(titleEl, coin.title || "Sin título");

  const descEl = document.getElementById("detailDescription");
  if (descEl) {
    if (coin.description) {
      descEl.innerHTML = coin.description.replace(/\n/g, "<br>");
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
      priceEl.innerHTML = `<span class="price-original">${coin.original_price}</span> ${coin.price || "Consultar"}`;
    } else {
      priceEl.textContent = coin.price || "Consultar";
    }
  }

  const waEl = document.getElementById("detailWhatsapp");
  if (waEl) waEl.href = buildWhatsAppLink(coin);

  const shareEl = document.getElementById("detailShare");
  if (shareEl) shareEl.dataset.shareUrl = `https://numismaticapopper.com/moneda/${coin.id}.html`;

  // Update URL so sharing/back-button works
  history.replaceState(null, "", `?id=${coin.id}`);
}

// ─── Full render (called once on page load) ───────────────────────────────────

function renderCoinDetail(coin, groupMembers) {
  const images    = getImagesArray(coin);
  const mainImage = images[0];
  const mainIsVideo = mainImage && mainImage.endsWith('.mp4');

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
          src="${mainIsVideo ? '' : mainImage}"
          alt="${coin.title || "Moneda"}"
          style="${mainIsVideo ? 'display:none' : ''}"
        />
        <video
          id="detailMainVideo"
          class="detail-main-image"
          src="${mainIsVideo ? mainImage : ''}"
          controls
          style="${mainIsVideo ? '' : 'display:none'}"
        ></video>
      </div>
      <div class="detail-thumbs" id="detailThumbs"></div>
    </div>

    <div class="detail-info reveal">
      <p class="detail-country" id="detailCountry">${coin.country || "País no informado"}</p>
      <h1 class="detail-title" id="detailTitle"></h1>

      <p class="detail-description" id="detailDescription"
        ${coin.description ? "" : 'style="display:none"'}
      >${coin.description ? coin.description.replace(/\n/g, "<br>") : ""}</p>

      <div class="detail-divider"></div>

      <div class="detail-specs">
        <div class="detail-spec-row">
          <div class="detail-spec-label">Referencia</div>
          <div class="detail-spec-value" id="specReference">${coin.reference || "NA"}</div>
        </div>
        <div class="detail-spec-row">
          <div class="detail-spec-label">Estado de conservación</div>
          <div class="detail-spec-value" id="specGrade">${coin.grade || "NA"}</div>
        </div>
        <div class="detail-spec-row">
          <div class="detail-spec-label">Material</div>
          <div class="detail-spec-value" id="specMetal">${coin.metal || "NA"}</div>
        </div>
        <div class="detail-spec-row" id="specMintageRow" ${coin.mintage ? "" : 'style="display:none"'}>
          <div class="detail-spec-label">Acuñación</div>
          <div class="detail-spec-value" id="specMintage">${coin.mintage ? Number(String(coin.mintage).replace(/[.,]/g, "")).toLocaleString("es-AR") : ""}</div>
        </div>
        <div class="detail-spec-row">
          <div class="detail-spec-label">Referencia interna</div>
          <div class="detail-spec-value" id="specId">${coin.id || "NA"}</div>
        </div>
      </div>

      <p class="detail-price" id="detailPrice">${coin.original_price ? `<span class="price-original">${coin.original_price}</span> ` : ""}${coin.price || "Consultar"}</p>

      <a
        class="detail-whatsapp"
        id="detailWhatsapp"
        href="${buildWhatsAppLink(coin)}"
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

  // ── Build image gallery thumbs ────────────────────────────────────────────
  const thumbsContainer = document.getElementById("detailThumbs");
  const mainImageEl     = document.getElementById("detailMainImage");
  const mainVideoEl     = document.getElementById("detailMainVideo");
  if (mainImageEl) attachImgRetry(mainImageEl);

  images.forEach((src, index) => {
    const button  = document.createElement("button");
    button.type      = "button";
    button.className = `detail-thumb${index === 0 ? " is-active" : ""}`;
    button.dataset.image = src;
    
    const isVideo = src.endsWith('.mp4');
    if (isVideo) {
      const video = document.createElement("video");
      video.src = src;
      video.preload = "metadata";
      video.muted = true;
      button.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.loading = index === 0 ? "eager" : "lazy";
      img.src = src;
      img.alt = `${coin.title || "Moneda"} ${index + 1}`;
      attachImgRetry(img);
      button.appendChild(img);
    }

    button.addEventListener("click", () => {
      const clickSrcIsVideo = src.endsWith('.mp4');
      if (clickSrcIsVideo) {
        if (mainImageEl) { mainImageEl.src = ""; mainImageEl.style.display = "none"; }
        if (mainVideoEl) { mainVideoEl.src = src; mainVideoEl.style.display = ""; mainVideoEl.play().catch(()=>{}); }
      } else {
        if (mainImageEl) { mainImageEl.src = src; mainImageEl.style.display = ""; }
        if (mainVideoEl) { mainVideoEl.src = ""; mainVideoEl.style.display = "none"; }
      }
      thumbsContainer.querySelectorAll(".detail-thumb")
        .forEach(t => t.classList.toggle("is-active", t === button));
    });
    thumbsContainer.appendChild(button);
  });

  // ── Build variant switcher ────────────────────────────────────────────────
  if (groupMembers && groupMembers.length > 1) {
    const variantsList = document.getElementById("variantsList");

    groupMembers.forEach(member => {
      const btn = document.createElement("button");
      btn.type      = "button";
      btn.className = "variant-thumb" + (member.id === coin.id ? " is-active" : "");
      if (member.status === "sold") btn.classList.add("is-sold");
      btn.dataset.coinId = member.id;

      const memberImgs = getImagesArray(member);
      const img = document.createElement("img");
      img.src = memberImgs[0];
      img.alt = member.title || "Variante";
      img.loading = "lazy";

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
  revealItems.forEach(item => item.classList.add("reveal"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealItems.forEach(item => observer.observe(item));
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function loadCoinDetail() {
  const coinId = Number(getQueryParam("id"));

  if (!coinId) {
    detailContainer.innerHTML = '<p class="detail-error">No se indicó ninguna moneda.</p>';
    return false;
  }

  try {
    const response = await fetch("coins.json", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar coins.json");

    const allCoins = await response.json();
    const coin     = allCoins.find(c => Number(c.id) === coinId);

    if (!coin) {
      detailContainer.innerHTML = '<p class="detail-error">No se encontró la moneda.</p>';
      return false;
    }

    let groupMembers = null;
    if (coin.group_id) {
      const getGradeScore = (c) => {
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
      };

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
          const scoreA = getGradeScore(a);
          const scoreB = getGradeScore(b);
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

// "← Volver" usa history.back() para que script.js restaure el catálogo
// en la posición exacta donde estaba, en lugar de mostrar la pantalla de bienvenida.
const backLink = document.querySelector('.back-link');
if (backLink) {
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (history.length > 1) {
      history.back();
    } else {
      window.location.href = backLink.getAttribute('href') || 'index.html';
    }
  });
}
