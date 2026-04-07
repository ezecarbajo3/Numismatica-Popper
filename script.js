const searchInput = document.getElementById("searchInput");
const countryFilter = document.getElementById("countryFilter");
const metalFilter = document.getElementById("metalFilter");
const resetFiltersButton = document.getElementById("resetFilters");
const resultsCount = document.getElementById("resultsCount");
const coinsGrid = document.getElementById("coinsGrid");
const coinCardTemplate = document.getElementById("coinCardTemplate");

let allCoins = [];

async function loadCoins() {
  try {
    const response = await fetch("coins.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("No se pudo cargar coins.json");
    }

    const data = await response.json();
    allCoins = Array.isArray(data) ? data : [];

    populateFilters(allCoins);
    renderCoins(allCoins);
  } catch (error) {
    console.error(error);
    coinsGrid.innerHTML =
      '<div class="empty-state">No se pudieron cargar las monedas. Revisá que exista el archivo <strong>coins.json</strong> en la misma carpeta.</div>';
    resultsCount.textContent = "Error al cargar monedas";
  }
}

function uniqueSortedValues(array, key) {
  return [...new Set(array.map((item) => item[key]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "es")
  );
}

function populateFilters(coins) {
  fillSelect(countryFilter, uniqueSortedValues(coins, "country"), "Todos los países");
  fillSelect(metalFilter, uniqueSortedValues(coins, "metal"), "Todos los materiales");
}

function fillSelect(select, values, defaultText) {
  select.innerHTML = `<option value="">${defaultText}</option>`;

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
        coin.grade,
        coin.mintage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchTerm);

    const matchesCountry = !selectedCountry || coin.country === selectedCountry;
    const matchesMetal = !selectedMetal || coin.metal === selectedMetal;

    return matchesSearch && matchesCountry && matchesMetal;
  });
}

function createDetailLine(label, value) {
  const line = document.createElement("div");
  line.className = "detail-line";
  line.innerHTML = `<strong>${label}:</strong> ${value || "NA"}`;
  return line;
}

function getPrimaryImage(coin) {
  if (Array.isArray(coin.images) && coin.images.length > 0) {
    const imageA = coin.images.find((img) => {
      const fileName = img.split("/").pop()?.toUpperCase() || "";
      return fileName.includes("A.");
    });

    return imageA || coin.images[0];
  }

  if (coin.image) {
    return coin.image;
  }

  return "https://via.placeholder.com/800x600?text=Sin+imagen";
}

function goToDetail(coinId) {
  window.location.href = `detalle.html?id=${coinId}`;
}

function renderCoins(coins) {
  coinsGrid.innerHTML = "";

  if (!coins.length) {
    coinsGrid.innerHTML =
      '<div class="empty-state">No hay monedas que coincidan con los filtros seleccionados.</div>';
    resultsCount.textContent = "0 monedas encontradas";
    return;
  }

  const fragment = document.createDocumentFragment();

  coins.forEach((coin) => {
    const card = coinCardTemplate.content.cloneNode(true);

    const article = card.querySelector(".coin-card");
    const image = card.querySelector(".coin-image");
    const title = card.querySelector(".coin-title");
    const meta = card.querySelector(".coin-meta");
    const description = card.querySelector(".coin-description");
    const details = card.querySelector(".coin-details");
    const price = card.querySelector(".coin-price");

    image.src = getPrimaryImage(coin);
    image.alt = coin.title || "Moneda";
    title.textContent = coin.title || "Sin título";
    meta.textContent = coin.country || "País no informado";
    description.textContent = coin.description || "";
    price.textContent = coin.price || "Consultar";

    details.innerHTML = "";
    details.appendChild(createDetailLine("Referencia", coin.reference));
    details.appendChild(createDetailLine("Estado", coin.grade));
    details.appendChild(createDetailLine("Material", coin.metal));
    details.appendChild(createDetailLine("Acuñación", coin.mintage));

    article.addEventListener("click", () => goToDetail(coin.id));

    article.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goToDetail(coin.id);
      }
    });

    fragment.appendChild(card);
  });

  coinsGrid.appendChild(fragment);
  resultsCount.textContent = `${coins.length} moneda${coins.length === 1 ? "" : "s"} encontrada${coins.length === 1 ? "" : "s"}`;
}

function applyFilters() {
  renderCoins(getFilteredCoins());
}

[searchInput, countryFilter, metalFilter].forEach((element) => {
  element.addEventListener("input", applyFilters);
  element.addEventListener("change", applyFilters);
});

resetFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  countryFilter.value = "";
  metalFilter.value = "";
  renderCoins(allCoins);
});

loadCoins();
