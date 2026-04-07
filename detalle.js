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
        <img id="detailMainImage" class="detail-main-image" src="${mainImage}" />
      </div>

      <div class="detail-thumbs" id="detailThumbs"></div>
    </div>

    <div class="detail-info">
      <p class="detail-country">${coin.country}</p>
      <h1 class="detail-title">${coin.title}</h1>

      <div class="detail-specs">
        <p><strong>Estado:</strong> ${coin.grade}</p>
        <p><strong>Año:</strong> ${coin.year}</p>
      </div>

      <p class="detail-price">${coin.price}</p>

      <a class="detail-whatsapp" href="${buildWhatsAppLink(coin.title)}" target="_blank">
        Consultar por WhatsApp
      </a>
    </div>
  `;

  const thumbsContainer = document.getElementById("detailThumbs");
  const mainImageElement = document.getElementById("detailMainImage");

  images.forEach((src) => {
    const img = document.createElement("img");
    img.src = src;
    img.style.width = "60px";
    img.style.cursor = "pointer";

    img.addEventListener("click", () => {
      mainImageElement.src = src;
    });

    thumbsContainer.appendChild(img);
  });
}

async function loadCoinDetail() {
  const coinId = Number(getQueryParam("id"));

  const response = await fetch("coins.json");
  const coins = await response.json();

  const coin = coins.find(c => c.id === coinId);

  if (coin) {
    renderCoinDetail(coin);
  } else {
    detailContainer.innerHTML = "<p>No se encontró la moneda</p>";
  }
}

loadCoinDetail();
