const WHATSAPP_NUMBER = "5492236184003";

const searchInput = document.getElementById("searchInput");
const countryFilter = document.getElementById("countryFilter");
const metalFilter = document.getElementById("metalFilter");
const statusFilter = document.getElementById("statusFilter");
const resetFiltersButton = document.getElementById("resetFilters");
const resultsCount = document.getElementById("resultsCount");
const coinsGrid = document.getElementById("coinsGrid");
const coinCardTemplate = document.getElementById("coinCardTemplate");

let allCoins = [];

async function loadCoins() {
  try {
    const response = await fetch("coins.json");
    if (!response.ok) {
      throw new Error("No se pudo cargar coins.json");
    }

    allCoins = await response.json();
    populateFilters(allCoins);
    renderCoins(allCoins);
  } catch (error) {
    console.error(error);
    coinsGrid.innerHTML = '<div class="empty-state">No se pudieron cargar las monedas. Revisá que exista el archivo <strong>coins.json</strong> en la misma carpeta.</div>';
    resultsCount.textContent = "Error al cargar monedas";
  }
}

function uniqueSortedValues(array, key) {
  return [...new Set(array.map((item) => item[key]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));
}

function populateFilters(coins) {
  fillSelect(countryFilter, uniqueSortedValues(coins, "country"), "Todos");
  fillSelect(metalFilter, uniqueSortedValues(coins, "metal"), "Todos");
  fillSelect(statusFilter, uniqueSortedValues(coins, "status"), "Todos");
}

function fillSelect(select, values) {
  const currentFirstOption = select.querySelector('option[value=""]');
  select.innerHTML = "";
  select.appendChild(currentFirstOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function getFilteredCoins() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedCountry = countryFilter.value;
  const selectedMetal = metalFilter.value;
  const selectedStatus = statusFilter.value;

  return allCoins.filter((coin) => {
    const matchesSearch =
      !searchTerm ||
      [
        coin.title,
        coin.country,
        coin.metal,
        coin.year,
        coin.price,
        coin.description,
        coin.reference,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchTerm);

    const matchesCountry = !selectedCountry || coin.country === selectedCountry;
    const matchesMetal = !selectedMetal || coin.metal === selectedMetal;
    const matchesStatus = !selectedStatus || coin.status === selectedStatus;

    return matchesSearch && matchesCountry && matchesMetal && matchesStatus;
  });
}

function buildWhatsAppLink(coin) {
  const message = `Hola, te consulto por esta moneda: ${coin.title} (${coin.country}, ${coin.year}). ¿Sigue disponible?`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function renderCoins(coins) {
  coinsGrid.innerHTML = "";

  if (!coins.length) {
    coinsGrid.innerHTML = '<div class="empty-state">No hay monedas que coincidan con los filtros seleccionados.</div>';
    resultsCount.textContent = "0 monedas encontradas";
    return;
  }

  const fragment = document.createDocumentFragment();

  coins.forEach((coin) => {
    const card = coinCardTemplate.content.cloneNode(true);

    const image = card.querySelector(".coin-image");
    const title = card.querySelector(".coin-title");
    const status = card.querySelector(".coin-status");
    const meta = card.querySelector(".coin-meta");
    const description = card.querySelector(".coin-description");
    const details = card.querySelector(".coin-details");
    const price = card.querySelector(".coin-price");
    const whatsappButton = card.querySelector(".whatsapp-button");

    image.src = coin.image || "https://via.placeholder.com/800x600?text=Sin+imagen";
    image.alt = coin.title || "Moneda";
    title.textContent = coin.title || "Sin título";
    status.textContent = coin.status || "Sin estado";
    meta.textContent = `${coin.country || "País no informado"} · ${coin.year || "Año no informado"} · ${coin.metal || "Metal no informado"}`;
    description.textContent = coin.description || "Sin descripción";
    price.textContent = coin.price || "Consultar";
    whatsappButton.href = buildWhatsAppLink(coin);

    const detailItems = [
      coin.reference ? `Referencia: ${coin.reference}` : null,
      coin.grade ? `Estado: ${coin.grade}` : null,
      coin.weight ? `Peso: ${coin.weight}` : null,
      coin.diameter ? `Diámetro: ${coin.diameter}` : null,
    ].filter(Boolean);

    detailItems.forEach((item) => {
      const pill = document.createElement("span");
      pill.className = "detail-pill";
      pill.textContent = item;
      details.appendChild(pill);
    });

    fragment.appendChild(card);
  });

  coinsGrid.appendChild(fragment);
  resultsCount.textContent = `${coins.length} moneda${coins.length === 1 ? "" : "s"} encontrada${coins.length === 1 ? "" : "s"}`;
}

function applyFilters() {
  const filteredCoins = getFilteredCoins();
  renderCoins(filteredCoins);
}

[searchInput, countryFilter, metalFilter, statusFilter].forEach((element) => {
  element.addEventListener("input", applyFilters);
  element.addEventListener("change", applyFilters);
});

resetFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  countryFilter.value = "";
  metalFilter.value = "";
  statusFilter.value = "";
  renderCoins(allCoins);
});

loadCoins();
