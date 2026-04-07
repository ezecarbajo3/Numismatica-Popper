const detailContainer = document.getElementById("coinDetail");
const WHATSAPP_NUMBER = "5492235429132";

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function getImagesArray(coin) {
  if (Array.isArray(coin.images) && coin.images.length > 0) {
    return coin.images;
  }

  if (coin.image) {
    return [coin.image];
  }

  return ["https://via.placeholder.com/900x900?text=Sin+imagen"];
}

function buildWhatsAppLink(coin) {
  const message = `Hola, me interesa la moneda ${coin.title}.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function createThumbButton(src, alt, isActive, onClick) {
  const button = document.createElement("button");
  button.className = `detail-thumb${isActive ? " is-active" : ""}`;
  button.type = "button";

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;

  button.appendChild(img);
  button.addEventListener("click", onClick);

  return button;
}

function createSpecRow(label, value) {
  const row = document.createElement("div");
  row.className = "detail-spec-row";

  const labelEl = document.createElement("div");
  labelEl.className = "detail-spec-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "detail-spec-value";
  valueEl.textContent = value || "NA";

  row.appendChild(labelEl);
  row.appendChild(valueEl);

  return row;
}

function renderCoinDetail(coin) {
  const images = getImagesArray(coin);

  detailContainer.innerHTML = `
    <div class="detail-gallery">
      <div class="detail-main-image-wrap">
        <img class="detail-main-image" id="detailMainImage" src="${images[0]}" alt="${coin.title || "Moneda"}" />
      </div>
      <div class="detail-thumbs" id="detailThumbs"></div>
    </div>

    <div class="detail-info">
      <p class="detail-country">${coin.country || "País no informado"}</p>
      <h1 class="detail-title">${coin.title || "Sin título"}</h1>
      <div class="detail-divider"></div>

      <div class="detail-specs" id="detailSpecs"></div>

      <p class="detail-price">${coin.price || "Consultar"}</p>
      <p class="detail-description">${coin.description || ""}</p>

      <a
        class="detail-whatsapp"
        href="${buildWhatsAppLink(coin)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Consultar por WhatsApp
      </a>
    </div>
  `;

  const mainImage = document.getElementById("detailMainImage");
  const thumbsContainer = document.getElementById("detailThumbs");
  const specsContainer = document.getElementById("detailSpecs");

  specsContainer.appendChild(createSpecRow("Estado", coin.grade || "NA"));
  specsContainer.appendChild(createSpecRow("País", coin.country || "NA"));
  specsContainer.appendChild(createSpecRow("Año", coin.year || "NA"));

  images.forEach((src, index) => {
    const thumb = createThumbButton(
      src,
      `${coin.title || "Moneda"} ${index + 1}`,
      index === 0,
      () => {
        mainImage.src = src;

        const allThumbs = thumbsContainer.querySelectorAll(".detail-thumb");
        allThumbs.forEach((item) => item.classList.remove("is-active"));
        thumb.classList.add("is-active");
      }
    );

    thumbsContainer.appendChild(thumb);
  });
}

async function loadCoinDetail() {
  const coinId = Number(getQueryParam("id"));

  if (!coinId) {
    detailContainer.innerHTML = '<p class="detail-error">No se indicó ninguna moneda.</p>';
    return;
  }

  try {
    const response = await fetch("coins.json");
    if (!response.ok) {
      throw new Error("No se pudo cargar coins.json");
    }

    const coins = await response.json();
    const coin = coins.find((item) => Number(item.id) === coinId);

    if (!coin) {
      detailContainer.innerHTML = '<p class="detail-error">No se encontró la moneda solicitada.</p>';
      return;
    }

    renderCoinDetail(coin);
  } catch (error) {
    console.error(error);
    detailContainer.innerHTML = '<p class="detail-error">Hubo un error al cargar el detalle de la moneda.</p>';
  }
}

loadCoinDetail();
