const searchInput = document.getElementById("searchInput");
const countryFilter = document.getElementById("countryFilter");
const metalFilter = document.getElementById("metalFilter");
const resetFiltersButton = document.getElementById("resetFilters");
const resultsCount = document.getElementById("resultsCount");
const coinsGrid = document.getElementById("coinsGrid");
const coinCardTemplate = document.getElementById("coinCardTemplate");

let allCoins = [];
let revealObserver = null;

const COUNTRY_GROUPS = {
  argentina: {
    label: "Argentina",
    children: [
      { label: "Argentina", value: "Argentina" },
      { label: "Confed. Arg.", value: "Argentina - Confed. Arg." },
      { label: "Buenos Aires", value: "Argentina - Buenos Aires" }
      { label: "Patria", value: "Argentina - Patria" }
    ]
  }
};

async function loadCoins() {
  try {
    const response = await fetch("coins.json", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar coins.json");

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

function fillSelect(select, values, defaultText) {
  select.innerHTML = `<option value="">${defaultText}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function populateFilters(coins) {
  const hiddenInMainList = new Set([
    "Argentina - Buenos Aires",
    "Argentina - Patria",
    "Argentina"
  ]);

  const countryValues = uniqueSortedValues(coins, "country").filter(
    (value) => !hiddenInMainList.has(value)
  );

  fillSelect(countryFilter, countryValues, "Todos los países");
  fillSelect(metalFilter, uniqueSortedValues(coins, "metal"), "Todos los materiales");
  initCustomSelects();
}

function createCustomOption({ label, value, nativeSelect, valueNode, customSelect, menu }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "custom-select-option";
  button.textContent = label;
  button.dataset.value = value;

  if (value === nativeSelect.value) {
    button.classList.add("is-selected");
    valueNode.textContent = label;
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    nativeSelect.value = value;
    valueNode.textContent = label;

    menu.querySelectorAll(".custom-select-option").forEach((item) => {
      item.classList.remove("is-selected");
    });

    button.classList.add("is-selected");
    customSelect.classList.remove("open");
    nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });

  return button;
}

function buildCountryCustomSelect(nativeSelect, customSelect, valueNode, menu) {
  const options = Array.from(nativeSelect.options).map((option) => ({
    label: option.textContent,
    value: option.value
  }));

  const defaultOption = options.find((opt) => opt.value === "");
  if (defaultOption) {
    menu.appendChild(
      createCustomOption({
        label: defaultOption.label,
        value: defaultOption.value,
        nativeSelect,
        valueNode,
        customSelect,
        menu
      })
    );
  }

  const argentinaGroup = document.createElement("div");
  argentinaGroup.className = "custom-select-group";

  const argentinaHeader = document.createElement("button");
  argentinaHeader.type = "button";
  argentinaHeader.className = "custom-select-group-title";
  argentinaHeader.innerHTML = `<span>${COUNTRY_GROUPS.argentina.label}</span><span class="custom-select-group-arrow">⌄</span>`;

  const argentinaSubmenu = document.createElement("div");
  argentinaSubmenu.className = "custom-select-submenu";

  COUNTRY_GROUPS.argentina.children.forEach((item) => {
    argentinaSubmenu.appendChild(
      createCustomOption({
        label: item.label,
        value: item.value,
        nativeSelect,
        valueNode,
        customSelect,
        menu
      })
    );
  });

  argentinaHeader.addEventListener("click", (event) => {
    event.stopPropagation();
    argentinaGroup.classList.toggle("open");
  });

  argentinaGroup.appendChild(argentinaHeader);
  argentinaGroup.appendChild(argentinaSubmenu);
  menu.appendChild(argentinaGroup);

  const groupedValues = new Set(COUNTRY_GROUPS.argentina.children.map((item) => item.value));

  options
    .filter((opt) => opt.value && !groupedValues.has(opt.value))
    .forEach((opt) => {
      menu.appendChild(
        createCustomOption({
          label: opt.label,
          value: opt.value,
          nativeSelect,
          valueNode,
          customSelect,
          menu
        })
      );
    });

  const selectedInGroup = COUNTRY_GROUPS.argentina.children.find(
    (item) => item.value === nativeSelect.value
  );

  if (selectedInGroup) {
    argentinaGroup.classList.add("open");
    valueNode.textContent = selectedInGroup.label;
  }
}

function buildDefaultCustomSelect(nativeSelect, customSelect, valueNode, menu) {
  Array.from(nativeSelect.options).forEach((option) => {
    menu.appendChild(
      createCustomOption({
        label: option.textContent,
        value: option.value,
        nativeSelect,
        valueNode,
        customSelect,
        menu
      })
    );
  });
}

function buildCustomSelect(selectId) {
  const nativeSelect = document.getElementById(selectId);
  const customSelect = document.querySelector(`.custom-select[data-target="${selectId}"]`);

  if (!nativeSelect || !customSelect) return;

  const trigger = customSelect.querySelector(".custom-select-trigger");
  const valueNode = customSelect.querySelector(".custom-select-value");
  const menu = customSelect.querySelector(".custom-select-menu");

  if (!trigger || !valueNode || !menu) return;

  menu.innerHTML = "";
  valueNode.textContent = nativeSelect.options[nativeSelect.selectedIndex]?.textContent || "";

  if (selectId === "countryFilter") {
    buildCountryCustomSelect(nativeSelect, customSelect, valueNode, menu);
  } else {
    buildDefaultCustomSelect(nativeSelect, customSelect, valueNode, menu);
  }

  trigger.onclick = (event) => {
    event.stopPropagation();

    document.querySelectorAll(".custom-select").forEach((item) => {
      if (item !== customSelect) item.classList.remove("open");
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
        coin.mintage
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

  if (coin.image) return coin.image;
  return "https://via.placeholder.com/800x600?text=Sin+imagen";
}

function getGradeShort(coin) {
  return coin.grade_short || coin.gradeShort || coin.grade_short_label || "";
}

function goToDetail(coinId) {
  window.location.href = `detalle.html?id=${coinId}`;
}
function sortCoins(coins) {
  return [...coins].sort((a, b) => {
    const countryA = String(a.country || "").toLowerCase();
    const countryB = String(b.country || "").toLowerCase();

    const byCountry = countryA.localeCompare(countryB, "es");
    if (byCountry !== 0) return byCountry;

    const yearA = Number(a.year) || 0;
    const yearB = Number(b.year) || 0;

    return yearA - yearB;
  });
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

sortCoins(coins).forEach((coin) => {
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

    const grade = getGradeShort(coin);
    badgeRow.innerHTML = grade ? `<span class="coin-grade-badge">${grade}</span>` : "";

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

function initRevealEffects() {
  if (revealObserver) revealObserver.disconnect();

  const revealItems = document.querySelectorAll(".coin-card, .results-bar, .controls");
  revealItems.forEach((item) => item.classList.add("reveal"));

  revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

function applyFilters() {
  renderCoins(getFilteredCoins());
  initRevealEffects();
}

function resetCustomSelects() {
  document.querySelectorAll(".custom-select").forEach((customSelect) => {
    const selectId = customSelect.dataset.target;
    const nativeSelect = document.getElementById(selectId);
    const valueNode = customSelect.querySelector(".custom-select-value");

    if (!nativeSelect || !valueNode) return;

    nativeSelect.value = "";
    valueNode.textContent = nativeSelect.options[0]?.textContent || "";
    customSelect.classList.remove("open");
  });

  initCustomSelects();
}

[searchInput, countryFilter, metalFilter].forEach((element) => {
  element.addEventListener("input", applyFilters);
  element.addEventListener("change", applyFilters);
});

resetFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  countryFilter.value = "";
  metalFilter.value = "";
  resetCustomSelects();
  renderCoins(allCoins);
  initRevealEffects();
});

loadCoins().then(() => {
  initRevealEffects();
});
