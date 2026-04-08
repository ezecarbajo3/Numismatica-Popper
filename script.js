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
    return true;
  } catch (error) {
    console.error(error);
    coinsGrid.innerHTML =
      '<div class="empty-state">No se pudieron cargar las monedas. Revisá que exista el archivo <strong>coins.json</strong> en la misma carpeta.</div>';
    resultsCount.textContent = "Error al cargar monedas";
    return false;
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
  initCustomSelects();
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

function buildCustomSelect(selectId) {
  const nativeSelect = document.getElementById(selectId);
  const customSelect = document.querySelector(`.custom-select[data-target="${selectId}"]`);

  if (!nativeSelect || !customSelect) return;

  const trigger = customSelect.querySelector(".custom-select-trigger");
  const value = customSelect.querySelector(".custom-select-value");
  const menu = customSelect.querySelector(".custom-select-menu");

  if (!trigger || !value || !menu) return;

  menu.innerHTML = "";

  Array.from(nativeSelect.options).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "custom-select-option";
    button.textContent = option.textContent;
    button.dataset.value = option.value;

    if (option.value === nativeSelect.value) {
      button.classList.add("is-selected");
      value.textContent = option.textContent;
    }

    button.addEventListener("click", (event) => {
      event.stopPropagation();

      nativeSelect.value = option.value;
      value.textContent = option.textContent;

      menu.querySelectorAll(".custom-select-option").forEach((item) => {
        item.classList.remove("is-selected");
      });

      button.classList.add("is-selected");
      customSelect.classList.remove("open");

      nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    menu.appendChild(button);
  });

  trigger.onclick = (event) => {
    event.stopPropagation();

    document.querySelectorAll(".custom-select").forEach((item) => {
      if (item !== customSelect) {
        item.classList.remove("open");
      }
    });

    customSelect.classList.toggle("open");
  };
}

function initCustomSelects() {
  buildCustomSelect("countryFilter");
  buildCustomSelect("metalFilter");
}

document.addEventListener("click", () => {
  document.querySelectorAll(".custom-select").forEach((item) => {
    item.classList.remove("open");
  });
});

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
        coin.grade_short,
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

function getGradeShort(coin) {
  return coin.grade_short || coin.gradeShort || coin.grade_short_label || "";
}

function createGradeBadge(value) {
  const wrap = document.createElement("div");
  wrap.className = "coin-badge-row";

  if (!value) {
    return wrap;
  }

  const badge = document.createElement("span");
  badge.className = "coin-grade-badge";
  badge.textContent = value;

  wrap.appendChild(badge);
  return wrap;
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
    const badgeRow = card.querySelector(".coin-badge-row");
    const price = card.querySelector(".coin-price");

    image.src = getPrimaryImage(coin);
    image.alt = coin.title || "Moneda";
    title.textContent = coin.title || "Sin título";
    meta.textContent = coin.country || "País no informado";
    price.textContent = coin.price || "Consultar";

    badgeRow.innerHTML = "";

const grade = getGradeShort(coin);

if (grade) {
  const badge = document.createElement("span");
  badge.className = "coin-grade-badge";
  badge.textContent = grade;
  badgeRow.appendChild(badge);
}

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
  initRevealEffects();
}

function initRevealEffects() {
  const revealItems = document.querySelectorAll(".coin-card, .results-bar, .controls");

  revealItems.forEach((item) => item.classList.add("reveal"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
    }
  );

  revealItems.forEach((item) => observer.observe(item));
}

[searchInput, countryFilter, metalFilter].forEach((element) => {
  element.addEventListener("input", applyFilters);
  element.addEventListener("change", applyFilters);
});

resetFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  countryFilter.value = "";
  metalFilter.value = "";

  document.querySelectorAll(".custom-select").forEach((customSelect) => {
    const selectId = customSelect.dataset.target;
    const nativeSelect = document.getElementById(selectId);
    const value = customSelect.querySelector(".custom-select-value");

    if (!nativeSelect || !value) return;

    nativeSelect.value = "";
    value.textContent = nativeSelect.options[0]?.textContent || "";

    customSelect.querySelectorAll(".custom-select-option").forEach((option, index) => {
      option.classList.toggle("is-selected", index === 0);
    });

    customSelect.classList.remove("open");
  });

  renderCoins(allCoins);
  initRevealEffects();
});

loadCoins().then(() => {
  initRevealEffects();
});
