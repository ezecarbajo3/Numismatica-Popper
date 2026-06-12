const detailContainer = document.getElementById("coinDetail");
const WHATSAPP_NUMBER = "5492235429132";

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function getImagesArray(coin) {
  if (Array.isArray(coin.images) && coin.images.length > 0) return coin.images;
  if (coin.image) return [coin.image];
  return ["https://via.placeholder.com/900x900?text=Sin+imagen"];
}

function buildWhatsAppLink(coin) {
  const title   = coin.title   || "Sin título";
  const country = coin.country || "País no informado";
  const price   = coin.price   || "precio no informado";
  const id      = coin.id      || "sin id";
  const message = `Hola Numismatica Popper!\nEstoy interesado en:\n*${title}*\n*${country}*\n*${price}*\n*${id}*\nMuchas gracias!`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// ─── Dynamic update (called when switching variants) ─────────────────────────

function updateCoinContent(coin) {
  const mainImg        = document.getElementById("detailMainImage");
  const thumbsContainer = document.getElementById("detailThumbs");
  const images         = getImagesArray(coin);

  // Main image
  if (mainImg) mainImg.src = images[0];

  // Rebuild image gallery thumbs
  if (thumbsContainer) {
    thumbsContainer.innerHTML = "";
    if (images.length > 1) {
      images.forEach((src, i) => {
        const btn = document.createElement("button");
        btn.type      = "button";
        btn.className = "detail-thumb" + (i === 0 ? " is-active" : "");
        const img = document.createElement("img");
        img.src = src;
        img.alt = `${coin.title || "Moneda"} ${i + 1}`;
        btn.appendChild(img);
        btn.addEventListener("click", () => {
          if (mainImg) mainImg.src = src;
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
  if (titleEl) titleEl.textContent = coin.title || "Sin título";

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

  // Update URL so sharing/back-button works
  history.replaceState(null, "", `?id=${coin.id}`);
}

// ─── Full render (called once on page load) ───────────────────────────────────

function renderCoinDetail(coin, groupMembers) {
  const images    = getImagesArray(coin);
  const mainImage = images[0];

  detailContainer.innerHTML = `
    <div class="detail-gallery reveal">
      <div class="detail-main-image-wrap">
        <img
          id="detailMainImage"
          class="detail-main-image"
          src="${mainImage}"
          alt="${coin.title || "Moneda"}"
        />
      </div>
      <div class="detail-thumbs" id="detailThumbs"></div>
    </div>

    <div class="detail-info reveal">
      <p class="detail-country" id="detailCountry">${coin.country || "País no informado"}</p>
      <h1 class="detail-title" id="detailTitle">${coin.title || "Sin título"}</h1>

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

      ${groupMembers && groupMembers.length > 1 ? `
      <div class="variants-section" id="detailVariants">
        <h3 class="variants-heading">Variantes</h3>
        <div class="variants-list" id="variantsList"></div>
      </div>
      ` : ""}
    </div>
  `;

  // ── Build image gallery thumbs ────────────────────────────────────────────
  const thumbsContainer = document.getElementById("detailThumbs");
  const mainImageEl     = document.getElementById("detailMainImage");

  images.forEach((src, index) => {
    const button  = document.createElement("button");
    button.type      = "button";
    button.className = `detail-thumb${index === 0 ? " is-active" : ""}`;
    button.dataset.image = src;
    const img = document.createElement("img");
    img.src = src;
    img.alt = `${coin.title || "Moneda"} ${index + 1}`;
    button.appendChild(img);
    button.addEventListener("click", () => {
      mainImageEl.src = src;
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

      const yearMatch = (member.title || "").match(/\b(1[5-9]\d{2}|20\d{2})\b/);
      const yearLabel = yearMatch ? yearMatch[1] : (member.title || "").slice(0, 10);

      const yearEl = document.createElement("span");
      yearEl.className   = "variant-year";
      yearEl.textContent = yearLabel;

      const priceEl = document.createElement("span");
      priceEl.className   = "variant-price";
      priceEl.textContent = member.status === "sold" ? "Vendido" : (member.price || "?");

      info.appendChild(yearEl);
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
      groupMembers = allCoins
        .filter(c => c.group_id === coin.group_id)
        .sort((a, b) => a.id - b.id);
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
