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

function buildWhatsAppLink(title) {
  const message = `Hola, me interesa la moneda ${title}.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function renderCoinDetail(coin) {
  const images = getImagesArray(coin);
  const mainImage = images[0];

  detailContainer.innerHTML = `
    <div class="detail-gallery">
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

    <div class="detail-info">
      <p class="detail-country">${coin.country || "País no informado"}</p>
      <h1 class="detail-title">${coin.title || "Sin título"}</h1>

      <div class="detail-specs">
        <div class="detail-spec-row">
          <div class="detail-spec-label">Referencia</div>
          <div class="detail-spec-value">${coin.reference || "NA"}</div>
        </div>

        <div class="detail-spec-row">
          <div class="detail-spec-label">Estado</div>
          <div class="detail-spec-value">${coin.grade || "NA"}</div>
        </div>

        <div class="detail-spec-row">
          <div class="detail-spec-label">Material</div>
          <div class="detail-spec-value">${coin.metal || "NA"}</div>
        </div>

        <div class="detail-spec-row">
          <div class="detail-spec-label">Acuñación</div>
          <div class="detail-spec-value">${coin.mintage || "NA"}</div>
        </div>
      </div>

      <p class="detail-price">${coin.price || "Consultar"}</p>

      <p class="detail-description">${coin.description || ""}</p>

      <a
        class="detail-whatsapp"
        href="${buildWhatsAppLink(coin.title || "Sin título")}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Consultar por WhatsApp
      </a>
    </div>
  `;

  const thumbsContainer = document.getElementById("detailThumbs");
  const mainImageElement = document.getElementById("detailMainImage");

  images.forEach((src, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `detail-thumb${index === 0 ? " is-active" : ""}`;
    button.dataset.image = src;

    const img = document.createElement("img");
    img.src = src;
    img.alt = `${coin.title || "Moneda"} ${index + 1}`;

    button.appendChild(img);

    button.addEventListener("click", () => {
      mainImageElement.src = src;

      const allThumbs = thumbsContainer.querySelectorAll(".detail-thumb");
      allThumbs.forEach((thumb) => thumb.classList.remove("is-active"));
      button.classList.add("is-active");
    });

    thumbsContainer.appendChild(button);
  });
}

async function loadCoinDetail() {
  const coinId = Number(getQueryParam("id"));

  if (!coinId) {
    detailContainer.innerHTML = "<p>No se indicó ninguna moneda.</p>";
    return;
  }

  try {
    const response = await fetch("coins.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("No se pudo cargar coins.json");
    }

    const coins = await response.json();
    const coin = coins.find((c) => Number(c.id) === coinId);

    if (coin) {
      renderCoinDetail(coin);
    } else {
      detailContainer.innerHTML = "<p>No se encontró la moneda.</p>";
    }
  } catch (error) {
    console.error(error);
    detailContainer.innerHTML = "<p>Hubo un error al cargar la moneda.</p>";
  }
}

loadCoinDetail();
