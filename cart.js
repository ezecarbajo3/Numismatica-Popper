/**
 * Numismática Popper — Carrito y Checkout
 *
 * Persistencia en localStorage sin dependencias externas.
 * Cotización Dólar Blue Venta (dolarapi.com) con respaldo.
 * Despacho automático de pedidos a numismaticapopper@gmail.com vía FormSubmit.
 * Diseño sobrio, profesional, editorial y minimalista.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'popper_cart_items_v1';
  const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares/blue';
  const DOLAR_FALLBACK_VENTA = 1495;
  const SHIPPING_PARQUE_ARS = 500;
  const SHIPPING_SUCURSAL_ARS = 8500;
  const SHIPPING_DOMICILIO_ARS = 11500;
  const WHATSAPP_NUMBER = '5492235429132';
  const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/numismaticapopper@gmail.com';

  // ─── Estado interno ────────────────────────────────────────────────────────
  let cartItems = [];
  let blueRate = DOLAR_FALLBACK_VENTA;
  let isRateLoaded = false;
  let currentStep = 'cart'; // 'cart' | 'checkout' | 'payment-select' | 'payment-instructions'

  let orderData = {
    fullName: '',
    phone: '',
    dni: '',
    email: '',
    deliveryType: 'acumular', // 'acumular' | 'parque' | 'sucursal' | 'domicilio'
    city: '',
    postalCode: '',
    branchOrAddress: '',
    pickupPerson: '',
    deliveryNotes: '',
    paymentMethod: 'pesos', // 'pesos' | 'usd' | 'deposito_mp'
    totalUSD: 0,
    totalARS: 0,
    shippingCostARS: 0,
    shippingCostUSD: 0,
  };
  let lastPurchasedOrder = null;

  // ─── Carga y persistencia ──────────────────────────────────────────────────
  function loadCartFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          cartItems = parsed.filter(it => it && it.id != null && Number.isFinite(it.priceUSD) && it.priceUSD > 0);
        }
      }
    } catch (e) {
      console.warn('PopperCart: Error leyendo storage', e);
      cartItems = [];
    }
  }

  function saveCartToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    } catch (e) {
      console.warn('PopperCart: Error guardando storage', e);
    }
    emitCartUpdated();
  }

  function emitCartUpdated() {
    window.dispatchEvent(new CustomEvent('popper:cart-updated', { detail: { items: cartItems } }));
    updateBadge();
  }

  // ─── Cotización Dólar Blue Venta ───────────────────────────────────────────
  async function fetchBlueRate() {
    try {
      const res = await fetch(DOLAR_API_URL);
      if (res.ok) {
        const data = await res.json();
        const venta = Number(data && (data.venta ?? data.value_sell));
        if (Number.isFinite(venta) && venta > 0) {
          const oldRate = blueRate;
          blueRate = venta;
          isRateLoaded = true;
          renderDrawerContent();
          if (oldRate !== venta && getCurrentCurrency() === 'ARS') {
            window.dispatchEvent(new CustomEvent('popper:currency-changed', {
              detail: { currency: 'ARS', rate: blueRate }
            }));
          }
          return;
        }
      }
    } catch (err) {
      console.info('PopperCart: Cotización de respaldo ($' + DOLAR_FALLBACK_VENTA + ')');
    }
    blueRate = DOLAR_FALLBACK_VENTA;
    isRateLoaded = true;
  }

  // ─── Verificación de inventario ───────────────────────────────────────────
  function validateSoldItems(allCoinsList) {
    if (!Array.isArray(allCoinsList) || !cartItems.length) return;
    const coinsMap = new Map(allCoinsList.map(c => [String(c.id), c]));
    const validItems = [];
    let removedCount = 0;

    for (const item of cartItems) {
      const live = coinsMap.get(String(item.id));
      if (!live || live.status === 'sold' || live.hidden || !live.price || String(live.price).trim().toLowerCase() === 'consultar' || parsePrice(live.price) <= 0) {
        removedCount++;
      } else {
        item.title = live.title || item.title;
        item.priceUSD = parsePrice(live.price);
        item.priceStr = live.price;
        item.country = live.country || item.country;
        validItems.push(item);
      }
    }

    if (removedCount > 0) {
      cartItems = validItems;
      saveCartToStorage();
      showToast(`Se removieron ${removedCount} pieza(s) no disponibles.`);
      renderDrawerContent();
    }
  }

  // ─── Operaciones del carrito ───────────────────────────────────────────────
  function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const n = parseFloat(String(priceStr).replace(/,/g, '.').replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function has(coinId) {
    const sId = String(coinId);
    return cartItems.some(item => String(item.id) === sId);
  }

  function add(coin, triggerEl) {
    if (!coin || coin.status === 'sold') return;
    const sId = String(coin.id);
    if (has(sId)) return;

    const priceNum = parsePrice(coin.price);
    if (priceNum <= 0 || !coin.price || String(coin.price).trim().toLowerCase() === 'consultar') {
      showToast('Esta pieza no tiene precio fijado. Consultanos por WhatsApp.');
      return;
    }

    let imageSrc = '';
    if (Array.isArray(coin.images) && coin.images.length > 0) {
      const imgA = coin.images.find(img => String(img).toUpperCase().includes('A.'));
      imageSrc = imgA || coin.images[0];
    }

    cartItems.push({
      id: coin.id,
      title: coin.title || 'Moneda sin título',
      country: coin.country || '',
      year: coin.year || '',
      priceUSD: priceNum,
      priceStr: coin.price || `${priceNum} USD`,
      image: imageSrc,
      grade_short: coin.grade_short || '',
      grade: coin.grade || '',
      metal: coin.metal || '',
      reference: coin.reference || '',
    });

    saveCartToStorage();
    animateFlyToCart(triggerEl);
    renderDrawerContent();

    showToast('Pieza agregada al carrito', 'VER CARRITO', openDrawer);
  }

  function remove(coinId) {
    const sId = String(coinId);
    cartItems = cartItems.filter(item => String(item.id) !== sId);
    saveCartToStorage();
    renderDrawerContent();
    showToast('Pieza quitada del carrito');
  }

  function clear() {
    if (!cartItems.length) return;
    cartItems = [];
    saveCartToStorage();
    renderDrawerContent();
    showToast('Carrito vaciado');
  }

  function toggle(coin, triggerEl) {
    if (!coin) return;
    if (has(coin.id)) {
      remove(coin.id);
    } else {
      add(coin, triggerEl);
    }
  }

  // ─── Cálculos ──────────────────────────────────────────────────────────────
  function roundARS(amount) {
    if (window.PopperCurrency && typeof window.PopperCurrency.roundARS === 'function') {
      return window.PopperCurrency.roundARS(amount);
    }
    const val = Number(amount);
    if (!Number.isFinite(val) || val <= 0) return 0;
    if (val <= 10000) return Math.max(100, Math.round(val / 100) * 100);
    if (val <= 50000) return Math.round(val / 500) * 500;
    return Math.round(val / 1000) * 1000;
  }

  function getSubtotalUSD() {
    return cartItems.reduce((acc, it) => acc + (it.priceUSD || 0), 0);
  }

  function getSubtotalARS() {
    return roundARS(getSubtotalUSD() * blueRate);
  }

  function formatARS(amount) {
    return '$' + roundARS(amount).toLocaleString('es-AR');
  }

  function formatUSD(amount) {
    return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' USD';
  }

  function getCurrentCurrency() {
    if (typeof getCurrency === 'function') return getCurrency();
    if (window.PopperCurrency && typeof window.PopperCurrency.get === 'function') {
      return window.PopperCurrency.get();
    }
    try {
      const saved = localStorage.getItem('popper_currency_pref');
      if (saved === 'ARS' || saved === 'USD') return saved;
    } catch (_) {}
    return 'USD';
  }

  function formatDualPrice(valUSD, valARS) {
    const isARS = getCurrentCurrency() === 'ARS';
    const primary = isARS ? formatARS(valARS) : formatUSD(valUSD);
    const secondary = isARS ? formatUSD(valUSD) : formatARS(valARS);
    return {
      primary,
      secondary,
      text: `${primary} (${secondary})`,
    };
  }

  // ─── Próximo envío al Parque Rivadavia ────────────────────────────────────
  // Se despacha el miércoles previo al 2º domingo del mes (la semana de la
  // segunda feria del mes), para entregarse a partir de ese domingo en adelante.
  function getNextParqueSchedule(refDate = new Date()) {
    function getDatesForMonth(year, monthIndex) {
      let sundayCount = 0;
      let secondSundayDate = null;
      for (let day = 1; day <= 31; day++) {
        const d = new Date(year, monthIndex, day);
        if (d.getMonth() !== monthIndex) break;
        if (d.getDay() === 0) { // Domingo
          sundayCount++;
          if (sundayCount === 2) {
            secondSundayDate = day;
            break;
          }
        }
      }
      // Miércoles de esa misma semana (4 días antes del 2º domingo)
      const dispatchDay = secondSundayDate - 4;
      const dispatchDate = new Date(year, monthIndex, dispatchDay);
      const deliveryDate = new Date(year, monthIndex, secondSundayDate);
      return { dispatchDate, deliveryDate };
    }

    const now = new Date(refDate);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const currentSchedule = getDatesForMonth(currentYear, currentMonth);

    // Límite de corte para despachar en la tanda del mes: miércoles a las 18:00 hs
    const cutoff = new Date(currentSchedule.dispatchDate);
    cutoff.setHours(18, 0, 0, 0);

    let target;
    if (now.getTime() < cutoff.getTime()) {
      target = currentSchedule;
    } else {
      const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
      target = getDatesForMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth());
    }

    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const dDate = target.dispatchDate;
    const sDate = target.deliveryDate;

    const dispatchDDMM = `${String(dDate.getDate()).padStart(2, '0')}/${String(dDate.getMonth() + 1).padStart(2, '0')}`;
    const deliveryDDMM = `${String(sDate.getDate()).padStart(2, '0')}/${String(sDate.getMonth() + 1).padStart(2, '0')}`;

    return {
      dispatchDate: dDate,
      deliveryDate: sDate,
      dispatchDDMM,
      deliveryDDMM,
      dispatchDayName: 'miércoles',
      dispatchDayNum: dDate.getDate(),
      dispatchMonthName: months[dDate.getMonth()],
      dispatchText: `miércoles ${dDate.getDate()} de ${months[dDate.getMonth()]}`,
      deliveryText: `domingo ${sDate.getDate()} de ${months[sDate.getMonth()]}`,
      deliveryDayNum: sDate.getDate(),
      deliveryMonthName: months[sDate.getMonth()],
    };
  }

  // ─── Verificación de ejemplares con ID no numérico (F, P, R, etc.) ─────────
  function isNonNumericId(id) {
    if (!id) return false;
    return !/^\d+$/.test(String(id).trim());
  }

  function hasNonNumericItems() {
    return cartItems.some(item => isNonNumericId(item.id));
  }

  // ─── Formato de línea para WhatsApp ────────────────────────────────────────
  function formatCoinLineForMessage(item) {
    const country = item.country ? String(item.country).trim() : 'País no informado';
    const year = String(item.year || '').trim();
    let facial = String(item.title || '').trim();

    if (year && facial.includes(year)) {
      facial = facial.replace(new RegExp('\\b' + year + '\\b', 'g'), '').trim();
      facial = facial.replace(/\s+/g, ' ').replace(/^[, -]+|[, -]+$/g, '');
    }

    const monto = item.priceStr ? item.priceStr.trim() : `${item.priceUSD || 0} USD`;
    const idRef = item.id != null ? ` (ID: ${item.id})` : '';
    return `${country}, ${facial || item.title}, ${year || 'S/A'}, ${monto}${idRef}`;
  }

  function buildPrivateInquiryWhatsAppURL(isStockCheck = false) {
    if (!cartItems.length) return '';
    const lines = cartItems.map(formatCoinLineForMessage).join('\n');
    const totUSD = getSubtotalUSD();
    const totARS = getSubtotalARS();

    let header;
    if (isStockCheck) {
      const isSingular = cartItems.length === 1;
      header = isSingular
        ? 'Hola Numismatica Popper, quisiera hacer una consulta de compra y verificar stock del siguiente ejemplar:'
        : 'Hola Numismatica Popper, quisiera hacer una consulta de compra y verificar stock de los siguientes ejemplares:';
    } else {
      header = 'Hola Numismatica Popper, estoy interesado en:';
    }

    const isARS = getCurrentCurrency() === 'ARS';
    const totalLine = isARS
      ? `Total: ${formatARS(totARS)} (${totUSD} USD)`
      : `Total: ${totUSD} USD (${formatARS(totARS)})`;

    const text =
      `${header}\n` +
      `${lines}\n\n` +
      totalLine;

    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }

  // ─── Animaciones y Notificaciones ──────────────────────────────────────────
  function animateFlyToCart() {
    const floatingBtn = document.getElementById('floatingCartBtn');
    if (floatingBtn) {
      floatingBtn.classList.remove('cart-pulse');
      void floatingBtn.offsetWidth;
      floatingBtn.classList.add('cart-pulse');
    }
  }

  function showToast(message, actionText, actionCallback) {
    let toast = document.getElementById('popperToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'popperToast';
      toast.className = 'popper-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <span class="popper-toast__msg">${escapeHTML(message)}</span>
      ${actionText ? `<button type="button" class="popper-toast__action" id="popperToastAction">${escapeHTML(actionText)} →</button>` : ''}
    `;

    if (actionText && actionCallback) {
      const actBtn = toast.querySelector('#popperToastAction');
      if (actBtn) {
        actBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          actionCallback();
          toast.classList.remove('is-visible');
        });
      }
    }

    toast.classList.add('is-visible');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3200);
  }

  // ─── Elementos UI Base ─────────────────────────────────────────────────────
  function ensureElements() {
    let actionsWrap = document.getElementById('siteFloatingActions');
    if (!actionsWrap) {
      actionsWrap = document.createElement('div');
      actionsWrap.id = 'siteFloatingActions';
      actionsWrap.className = 'site-floating-actions';
      document.body.appendChild(actionsWrap);
    }

    let currBtn = document.getElementById('currencyToggleBtn');
    if (!currBtn) {
      currBtn = document.createElement('button');
      currBtn.type = 'button';
      currBtn.id = 'currencyToggleBtn';
      currBtn.className = 'currency-toggle-btn';
      actionsWrap.appendChild(currBtn);
    }

    function renderCurrencyBtnState() {
      const c = getCurrentCurrency();
      if (c === 'ARS') {
        currBtn.textContent = 'ARS';
        currBtn.className = 'currency-toggle-btn is-ars';
        currBtn.setAttribute('aria-label', 'Moneda activa: Pesos (ARS). Clic para cambiar a dólares (USD)');
        currBtn.setAttribute('title', 'Moneda activa: Pesos (ARS) · Clic para cambiar a dólares (USD)');
      } else {
        currBtn.textContent = 'USD';
        currBtn.className = 'currency-toggle-btn is-usd';
        currBtn.setAttribute('aria-label', 'Moneda activa: Dólares (USD). Clic para cambiar a pesos (ARS)');
        currBtn.setAttribute('title', 'Moneda activa: Dólares (USD) · Clic para cambiar a pesos (ARS)');
      }
    }

    currBtn.onclick = () => {
      if (typeof toggleCurrency === 'function') {
        toggleCurrency();
      }
      renderCurrencyBtnState();
    };

    renderCurrencyBtnState();
    window.addEventListener('popper:currency-changed', () => {
      renderCurrencyBtnState();
      renderDrawerContent();
    });

    let btn = document.getElementById('floatingCartBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'floatingCartBtn';
      btn.className = 'cart-floating-btn';
      btn.setAttribute('aria-label', 'Ver carrito');
      btn.setAttribute('title', 'Ver carrito');
      btn.innerHTML = `
        <svg class="cart-floating-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span class="cart-floating-badge" id="floatingCartBadge">0</span>
      `;
      actionsWrap.appendChild(btn);
    } else if (btn.parentElement !== actionsWrap) {
      actionsWrap.appendChild(btn);
    }
    btn.onclick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      openDrawer();
    };

    if (!document.getElementById('cartDrawerOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'cartDrawerOverlay';
      overlay.className = 'cart-drawer-overlay';
      overlay.addEventListener('click', closeDrawer);
      document.body.appendChild(overlay);

      const drawer = document.createElement('aside');
      drawer.id = 'cartDrawer';
      drawer.className = 'cart-drawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-label', 'Carrito de compras');
      document.body.appendChild(drawer);
    }
  }

  function updateBadge() {
    const badge = document.getElementById('floatingCartBadge');
    if (badge) {
      badge.textContent = String(cartItems.length);
      badge.classList.toggle('has-items', cartItems.length > 0);
    }

    // Sincronizar botones de tarjeta en catálogo
    document.querySelectorAll('.card-cart-btn').forEach(btn => {
      const article = btn.closest('.coin-card');
      if (article && article.dataset.coinId) {
        const inCart = has(article.dataset.coinId);
        btn.classList.toggle('is-in-cart', inCart);
        btn.setAttribute('aria-label', inCart ? 'En tu carrito · Clic para quitar' : 'Agregar al carrito');
        btn.setAttribute('title', inCart ? 'En tu carrito · Clic para quitar' : 'Agregar al carrito');
      }
    });

    // Sincronizar botón en ficha de detalle
    const detailBtn = document.getElementById('detailAddToCart');
    if (detailBtn && detailBtn.dataset.coinId) {
      const inCart = has(detailBtn.dataset.coinId);
      detailBtn.classList.toggle('is-in-cart', inCart);
      detailBtn.innerHTML = inCart
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> <span>En tu Carrito · <strong>Ver Carrito</strong></span>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> <span>Agregar al Carrito</span>`;
      detailBtn.setAttribute('title', inCart ? 'Pieza en tu carrito · Clic para ver carrito' : 'Agregar al carrito');
    }
  }

  function openDrawer() {
    ensureElements();
    currentStep = 'cart';
    renderDrawerContent();
    document.getElementById('cartDrawerOverlay').classList.add('is-open');
    document.getElementById('cartDrawer').classList.add('is-open');
    document.body.classList.add('cart-drawer-lock');
  }

  function closeDrawer() {
    const overlay = document.getElementById('cartDrawerOverlay');
    const drawer = document.getElementById('cartDrawer');
    if (overlay) overlay.classList.remove('is-open');
    if (drawer) drawer.classList.remove('is-open');
    document.body.classList.remove('cart-drawer-lock');
  }

  // ─── Renderizado del Drawer ────────────────────────────────────────────────
  function renderDrawerContent() {
    const drawer = document.getElementById('cartDrawer');
    if (!drawer) return;

    // Si el carrito contiene piezas con ID no numérico, no permitir avanzar a checkout/pago
    if (hasNonNumericItems() && currentStep !== 'cart') {
      currentStep = 'cart';
    }

    if (currentStep === 'cart') {
      renderStepCart(drawer);
    } else if (currentStep === 'checkout') {
      renderStepCheckout(drawer);
    } else if (currentStep === 'payment-select') {
      renderStepPaymentSelect(drawer);
    } else if (currentStep === 'payment-instructions') {
      renderStepPaymentInstructions(drawer);
    }
  }

  // ─── PASO 1: Lista del Carrito (Tu Selección) ──────────────────────────────
  function renderStepCart(drawer) {
    const count = cartItems.length;
    const subUSD = getSubtotalUSD();
    const subARS = getSubtotalARS();
    const nonNumericCount = cartItems.filter(item => isNonNumericId(item.id)).length;
    const requiresVerification = nonNumericCount > 0;
    const verificationMessage = nonNumericCount === 1
      ? 'Tenemos que verificar si dicho ejemplar lo tenemos en stock'
      : 'Tenemos que verificar si dichos ejemplares los tenemos en stock';

    let itemsHtml = '';
    if (count === 0) {
      itemsHtml = `
        <div class="cart-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="cart-empty-icon" aria-hidden="true">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <p class="cart-empty-title">Tu carrito está vacío</p>
          <p class="cart-empty-subtitle">Explorá el catálogo para sumar piezas a tu colección.</p>
        </div>
      `;
    } else {
      itemsHtml = `
        <ul class="cart-items-list">
          ${cartItems.map(item => {
            const thumb = (item.image && typeof thumbFor === 'function') ? thumbFor(item.image) : (item.image || '');
            const itemARS = roundARS((item.priceUSD || 0) * blueRate);
            const isARS = getCurrentCurrency() === 'ARS';
            const itemPrimary = isARS ? formatARS(itemARS) : formatUSD(item.priceUSD);
            const itemSecondary = isARS ? formatUSD(item.priceUSD) : formatARS(itemARS);
            return `
              <li class="cart-item" data-id="${escapeHTML(item.id)}">
                <div class="cart-item__thumb">
                  ${thumb ? `<img src="${escapeHTML(thumb)}" alt="${escapeHTML(item.title)}" loading="lazy" />` : `<div class="cart-item__no-thumb">NP</div>`}
                </div>
                <div class="cart-item__details">
                  <div class="cart-item__head">
                    <h4 class="cart-item__title">${escapeHTML(item.title)}</h4>
                    <button type="button" class="cart-item__remove" data-remove-id="${escapeHTML(item.id)}" title="Quitar pieza" aria-label="Quitar pieza">✕</button>
                  </div>
                  <div class="cart-item__meta">
                    ${item.country ? `<span>${escapeHTML(item.country)}</span>` : ''}
                    ${item.year ? `<span>• ${escapeHTML(item.year)}</span>` : ''}
                    ${item.grade_short ? `<span class="cart-grade-badge">${escapeHTML(item.grade_short)}</span>` : ''}
                  </div>
                  <div class="cart-item__pricing">
                    <strong class="cart-price-primary cart-price-usd">${escapeHTML(itemPrimary)}</strong>
                    <span class="cart-price-secondary cart-price-ars">(${escapeHTML(itemSecondary)})</span>
                  </div>
                </div>
              </li>
            `;
          }).join('')}
        </ul>
      `;
    }

    const isARS = getCurrentCurrency() === 'ARS';
    const subPrimary = isARS ? formatARS(subARS) : formatUSD(subUSD);
    const subSecondary = isARS ? formatUSD(subUSD) : formatARS(subARS);

    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <div class="cart-drawer__header-left">
          <span class="cart-drawer__tag">CARRITO</span>
          <span class="cart-drawer__count">[ ${count} ]</span>
        </div>
        <div class="cart-drawer__header-actions">
          ${count > 0 ? `<button type="button" class="cart-clear-btn" id="cartClearBtn">Vaciar</button>` : ''}
          <button type="button" class="cart-close-btn" id="cartCloseBtn" aria-label="Cerrar">✕</button>
        </div>
      </div>

      <div class="cart-drawer__body">
        ${itemsHtml}
      </div>

      ${count > 0 ? `
        <div class="cart-drawer__footer">
          <div class="cart-totals-table">
            <div class="cart-totals-row">
              <span>Subtotal</span>
              <strong class="cart-totals-val">${escapeHTML(subPrimary)} <span class="cart-totals-usd cart-totals-secondary">(${escapeHTML(subSecondary)})</span></strong>
            </div>
            <div class="cart-rate-line">
              <span>Cotización Dólar Blue: $${blueRate.toLocaleString('es-AR')}</span>
            </div>
          </div>

          ${requiresVerification ? `
            <div class="cart-stock-notice">
              <svg class="cart-stock-notice__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span class="cart-stock-notice__text">${verificationMessage}</span>
            </div>
          ` : ''}

          <div class="cart-actions-stack">
            ${requiresVerification ? `
              <a href="${escapeHTML(buildPrivateInquiryWhatsAppURL(true))}" target="_blank" rel="noopener noreferrer" class="cart-btn cart-btn--wpp" id="cartInquiryWppBtn">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 018.23 8.24c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.74 2.66 4.22 3.73.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/></svg>
                CONSULTAR POR WHATSAPP
              </a>
            ` : `
              <button type="button" class="cart-btn cart-btn--primary" id="cartStartCheckoutBtn">
                CONTINUAR CON LA COMPRA →
              </button>
              <a href="${escapeHTML(buildPrivateInquiryWhatsAppURL(false))}" target="_blank" rel="noopener noreferrer" class="cart-btn cart-btn--secondary" id="cartConsultBtn">
                CONSULTAR POR WHATSAPP
              </a>
            `}
          </div>
        </div>
      ` : ''}
    `;

    const closeBtn = drawer.querySelector('#cartCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    const clearBtn = drawer.querySelector('#cartClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', clear);

    const startCheckoutBtn = drawer.querySelector('#cartStartCheckoutBtn');
    if (startCheckoutBtn) {
      startCheckoutBtn.addEventListener('click', () => {
        currentStep = 'checkout';
        renderDrawerContent();
      });
    }

    drawer.querySelectorAll('[data-remove-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        remove(btn.dataset.removeId);
      });
    });
  }

  // ─── PASO 2: Entrega y Datos del Comprador ────────────────────────────────
  function renderStepCheckout(drawer) {
    const isAcumular = orderData.deliveryType === 'acumular';
    const isParque = orderData.deliveryType === 'parque';
    const isSucursal = orderData.deliveryType === 'sucursal';
    const isDomicilio = orderData.deliveryType === 'domicilio';
    const parqueSchedule = getNextParqueSchedule();

    const parqueUSD = Number((SHIPPING_PARQUE_ARS / blueRate).toFixed(1));
    const sucursalUSD = Number((SHIPPING_SUCURSAL_ARS / blueRate).toFixed(1));
    const domicilioUSD = Number((SHIPPING_DOMICILIO_ARS / blueRate).toFixed(1));

    const parquePriceDual = formatDualPrice(parqueUSD, SHIPPING_PARQUE_ARS);
    const sucursalPriceDual = formatDualPrice(sucursalUSD, SHIPPING_SUCURSAL_ARS);
    const domicilioPriceDual = formatDualPrice(domicilioUSD, SHIPPING_DOMICILIO_ARS);

    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <button type="button" class="cart-back-btn" id="checkoutBackBtn">← CARRITO</button>
        <span class="cart-step-pill">01 / ENTREGA</span>
        <button type="button" class="cart-close-btn" id="checkoutCloseBtn" aria-label="Cerrar">✕</button>
      </div>

      <div class="cart-drawer__body">
        <div class="checkout-section">
          <span class="section-label">MODALIDAD DE ENTREGA</span>
          <div class="delivery-list">
            <label class="delivery-row ${isAcumular ? 'is-selected' : ''}">
              <input type="radio" name="deliveryChoice" value="acumular" ${isAcumular ? 'checked' : ''} />
              <span class="radio-custom"></span>
              <div class="delivery-row__info">
                <span class="delivery-row__name">Acumular compras</span>
                <span class="delivery-row__sub">Guardalas para un futuro envío</span>
              </div>
              <span class="delivery-row__price">GRATIS</span>
            </label>

            <label class="delivery-row ${isParque ? 'is-selected' : ''}">
              <input type="radio" name="deliveryChoice" value="parque" ${isParque ? 'checked' : ''} />
              <span class="radio-custom"></span>
              <div class="delivery-row__info">
                <span class="delivery-row__name">Envío al Parque Rivadavia</span>
                <span class="delivery-row__sub">Próximo envío ${parqueSchedule.dispatchDDMM}</span>
              </div>
              <span class="delivery-row__price">${escapeHTML(parquePriceDual.primary)} <span class="delivery-price-secondary">(${escapeHTML(parquePriceDual.secondary)})</span></span>
            </label>

            <label class="delivery-row ${isSucursal ? 'is-selected' : ''}">
              <input type="radio" name="deliveryChoice" value="sucursal" ${isSucursal ? 'checked' : ''} />
              <span class="radio-custom"></span>
              <div class="delivery-row__info">
                <span class="delivery-row__name">Envío a Sucursal</span>
                <span class="delivery-row__sub">A través de Andreani</span>
              </div>
              <span class="delivery-row__price">${escapeHTML(sucursalPriceDual.primary)} <span class="delivery-price-secondary">(${escapeHTML(sucursalPriceDual.secondary)})</span></span>
            </label>

            <label class="delivery-row ${isDomicilio ? 'is-selected' : ''}">
              <input type="radio" name="deliveryChoice" value="domicilio" ${isDomicilio ? 'checked' : ''} />
              <span class="radio-custom"></span>
              <div class="delivery-row__info">
                <span class="delivery-row__name">Envío a Domicilio</span>
                <span class="delivery-row__sub">A través de Andreani</span>
              </div>
              <span class="delivery-row__price">${escapeHTML(domicilioPriceDual.primary)} <span class="delivery-price-secondary">(${escapeHTML(domicilioPriceDual.secondary)})</span></span>
            </label>
          </div>
        </div>

        <form id="checkoutForm" class="checkout-form" novalidate style="margin-top: 24px;">
          <div class="checkout-section">
            <div class="form-group">
              <label for="inputFullName">NOMBRE Y APELLIDO *</label>
              <input type="text" id="inputFullName" class="form-input" placeholder="Ej: Juan Pérez" value="${escapeHTML(orderData.fullName)}" required />
            </div>

            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label for="inputWhatsApp">WHATSAPP / TEL *</label>
                <input type="tel" id="inputWhatsApp" class="form-input" placeholder="Ej: 11 2345 6789" value="${escapeHTML(orderData.phone)}" required />
              </div>
              <div class="form-group" style="flex: 1;">
                <label for="inputDni">DNI ${isSucursal || isDomicilio ? '*' : '(OPCIONAL)'}</label>
                <input type="text" id="inputDni" class="form-input" placeholder="Ej: 38123456" value="${escapeHTML(orderData.dni)}" ${isSucursal || isDomicilio ? 'required' : ''} />
              </div>
            </div>

            <div class="form-group">
              <label for="inputEmail">CORREO ELECTRÓNICO *</label>
              <input
                type="email"
                id="inputEmail"
                class="form-input"
                placeholder="correo@ejemplo.com"
                value="${escapeHTML(orderData.email)}"
                required
                autocomplete="email"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
              />
            </div>
          </div>

          <div class="checkout-section" style="margin-top: 18px;">
            <span class="section-label">DETALLES DE ENTREGA</span>

            ${isParque ? `
              <div class="delivery-parque-card" style="margin-top: 4px; margin-bottom: 14px;">
                <div class="delivery-parque-card__title">
                  PUNTO DE RETIRO: FERIA DE PARQUE RIVADAVIA (CABA)
                </div>
                <div class="delivery-parque-card__desc">
                  Despacho: <strong>miércoles ${parqueSchedule.dispatchDDMM}</strong>. Podés retirar tu pedido a partir del <strong>domingo ${parqueSchedule.deliveryDDMM}</strong> por la mañana, o cualquier domingo posterior. Entrega Diego Cepeda de Dac Monedas. Te dejo su número para combinar la entrega: <a href="https://wa.me/5491154028935" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline;">+54 9 11 5402-8935</a>.
                </div>
              </div>

              <div class="form-group">
                <label for="inputPickupPerson">¿QUIÉN RETIRA EN EL PARQUE? (OPCIONAL)</label>
                <input
                  type="text"
                  id="inputPickupPerson"
                  class="form-input"
                  placeholder="Dejar en blanco si retira el titular"
                  value="${escapeHTML(orderData.pickupPerson || '')}"
                />
              </div>
            ` : isAcumular ? `
              <div class="delivery-parque-card" style="margin-top: 4px; margin-bottom: 14px; border-color: rgba(var(--accent-rgb), 0.25);">
                <div class="delivery-parque-card__title">
                  MODALIDAD: ACUMULAR COMPRAS
                </div>
                <div class="delivery-parque-card__desc">
                  Tus piezas quedan <strong>guardadas y reservadas a tu nombre</strong>. Podés seguir sumando piezas en futuras compras y solicitar el despacho cuando quieras.
                </div>
              </div>
            ` : `
              <div class="form-row" style="margin-top: 4px;">
                <div class="form-group" style="flex: 1.4;">
                  <label for="inputCity">CIUDAD Y PROVINCIA *</label>
                  <input type="text" id="inputCity" class="form-input" placeholder="Ej: Mar del Plata, Bs As" value="${escapeHTML(orderData.city)}" required />
                </div>
                <div class="form-group" style="flex: 0.8;">
                  <label for="inputCp">CÓDIGO POSTAL *</label>
                  <input type="text" id="inputCp" class="form-input" placeholder="Ej: 7600" value="${escapeHTML(orderData.postalCode)}" required />
                </div>
              </div>

              <div class="form-group">
                <label for="inputBranchOrAddress">
                  ${isSucursal ? 'SUCURSAL DE CORREO DESEADA *' : 'DIRECCIÓN COMPLETA *'}
                </label>
                <input
                  type="text"
                  id="inputBranchOrAddress"
                  class="form-input"
                  placeholder="${isSucursal ? 'Ej: Andreani Centro o dirección de la sucursal' : 'Ej: San Martín 1234, 3º B'}"
                  value="${escapeHTML(orderData.branchOrAddress)}"
                  required
                />
              </div>

              ${isDomicilio ? `
                <div class="form-group">
                  <label for="inputDeliveryNotes">ACLARACIONES O REFERENCIAS (OPCIONAL)</label>
                  <input
                    type="text"
                    id="inputDeliveryNotes"
                    class="form-input"
                    placeholder="Ej: Timbre A, entrecalles o dejar en recepción"
                    value="${escapeHTML(orderData.deliveryNotes || '')}"
                  />
                </div>
              ` : ''}
            `}
          </div>

          <div class="checkout-error" id="checkoutError" style="display: none;"></div>

          <button type="submit" class="cart-btn cart-btn--primary checkout-submit-btn">
            CONTINUAR AL PAGO →
          </button>
        </form>
      </div>
    `;

    drawer.querySelector('#checkoutBackBtn').addEventListener('click', () => {
      saveCurrentForm(drawer);
      currentStep = 'cart';
      renderDrawerContent();
    });
    drawer.querySelector('#checkoutCloseBtn').addEventListener('click', closeDrawer);

    drawer.querySelectorAll('input[name="deliveryChoice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        orderData.deliveryType = e.target.value;
        saveCurrentForm(drawer);
        renderStepCheckout(drawer);
      });
    });

    drawer.querySelectorAll('.form-input').forEach(input => {
      input.addEventListener('input', () => {
        const err = drawer.querySelector('#checkoutError');
        if (err && err.style.display !== 'none') {
          err.style.display = 'none';
        }
      });
    });

    const form = drawer.querySelector('#checkoutForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveCurrentForm(drawer);
      const errEl = drawer.querySelector('#checkoutError');

      if (!orderData.fullName || !orderData.phone || !orderData.email) {
        errEl.textContent = 'Por favor completá Nombre, WhatsApp y Correo electrónico.';
        errEl.style.display = 'block';
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
      if (!emailRegex.test(orderData.email)) {
        errEl.textContent = 'Por favor ingresá un correo electrónico válido.';
        errEl.style.display = 'block';
        return;
      }

      if (orderData.deliveryType === 'sucursal' || orderData.deliveryType === 'domicilio') {
        if (!orderData.dni) {
          errEl.textContent = 'El DNI es obligatorio para la guía de despacho por correo.';
          errEl.style.display = 'block';
          return;
        }
        if (!orderData.city || !orderData.postalCode || !orderData.branchOrAddress) {
          errEl.textContent = orderData.deliveryType === 'sucursal'
            ? 'Por favor indicá ciudad, código postal y sucursal de correo deseada.'
            : 'Por favor indicá ciudad, código postal y dirección completa para el envío.';
          errEl.style.display = 'block';
          return;
        }
      }

      // Costos finales de envío
      if (orderData.deliveryType === 'parque') {
        orderData.shippingCostARS = SHIPPING_PARQUE_ARS;
        orderData.shippingCostUSD = Number((SHIPPING_PARQUE_ARS / blueRate).toFixed(1));
      } else if (orderData.deliveryType === 'sucursal') {
        orderData.shippingCostARS = SHIPPING_SUCURSAL_ARS;
        orderData.shippingCostUSD = Number((SHIPPING_SUCURSAL_ARS / blueRate).toFixed(1));
      } else if (orderData.deliveryType === 'domicilio') {
        orderData.shippingCostARS = SHIPPING_DOMICILIO_ARS;
        orderData.shippingCostUSD = Number((SHIPPING_DOMICILIO_ARS / blueRate).toFixed(1));
      } else {
        orderData.shippingCostARS = 0;
        orderData.shippingCostUSD = 0;
      }

      const subUSD = getSubtotalUSD();
      const subARS = getSubtotalARS();
      orderData.totalUSD = Number((subUSD + orderData.shippingCostUSD).toFixed(1));
      orderData.totalARS = subARS + orderData.shippingCostARS;

      currentStep = 'payment-select';
      renderDrawerContent();
    });
  }

  function saveCurrentForm(drawer) {
    const fn = drawer.querySelector('#inputFullName');
    const ph = drawer.querySelector('#inputWhatsApp');
    const dni = drawer.querySelector('#inputDni');
    const em = drawer.querySelector('#inputEmail');
    const city = drawer.querySelector('#inputCity');
    const cp = drawer.querySelector('#inputCp');
    const addr = drawer.querySelector('#inputBranchOrAddress');
    const pp = drawer.querySelector('#inputPickupPerson');
    const notes = drawer.querySelector('#inputDeliveryNotes');

    if (fn) orderData.fullName = fn.value.trim();
    if (ph) orderData.phone = ph.value.trim();
    if (dni) orderData.dni = dni.value.trim();
    if (em) {
      let rawEmail = String(em.value || '');
      try { rawEmail = rawEmail.normalize('NFKC'); } catch (_) {}
      rawEmail = rawEmail.replace(/[\uFF20\uFE6B]/g, '@').replace(/\s+/g, '').trim();
      orderData.email = rawEmail.toLowerCase();
    }
    if (city) orderData.city = city.value.trim();
    if (cp) orderData.postalCode = cp.value.trim();
    if (addr) orderData.branchOrAddress = addr.value.trim();
    if (pp) orderData.pickupPerson = pp.value.trim();
    if (notes) orderData.deliveryNotes = notes.value.trim();
  }

  // ─── PASO 3: Medio de Pago y Confirmación ──────────────────────────────────
  function renderStepPaymentSelect(drawer) {
    const subUSD = getSubtotalUSD();
    const subARS = getSubtotalARS();
    const shipARS = orderData.shippingCostARS;
    const shipUSD = orderData.shippingCostUSD;
    const totUSD = orderData.totalUSD;
    const totARS = orderData.totalARS;
    const totDual = formatDualPrice(totUSD, totARS);
    const shipDual = formatDualPrice(shipUSD, shipARS);

    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <button type="button" class="cart-back-btn" id="paymentBackBtn">← ENTREGA</button>
        <span class="cart-step-pill">02 / PAGO</span>
        <button type="button" class="cart-close-btn" id="paymentCloseBtn" aria-label="Cerrar">✕</button>
      </div>

      <div class="cart-drawer__body">
        <div class="checkout-section">
          <span class="section-label">RESUMEN DEL PEDIDO</span>
          <div class="order-spec-table">
            <div class="order-spec-items">
              ${cartItems.map(item => {
                const itemARS = roundARS((item.priceUSD || 0) * blueRate);
                const dual = formatDualPrice(item.priceUSD, itemARS);
                return `
                <div class="order-spec-row order-spec-row--item">
                  <span class="order-spec-item-title">${escapeHTML(item.title)}</span>
                  <span class="order-spec-item-price">${escapeHTML(dual.primary)} <span class="price-alt">(${escapeHTML(dual.secondary)})</span></span>
                </div>
              `;}).join('')}
            </div>
            <div class="order-spec-row">
              <span>${
                orderData.deliveryType === 'acumular' ? 'Acumular compras' :
                orderData.deliveryType === 'parque' ? 'Envío a Parque Rivadavia' :
                orderData.deliveryType === 'sucursal' ? 'Envío a Sucursal (Andreani)' :
                'Envío a Domicilio (Andreani)'
              }</span>
              <span>${
                orderData.deliveryType === 'acumular' || shipARS === 0 ? 'GRATIS' : `${escapeHTML(shipDual.primary)} <span class="price-alt">(${escapeHTML(shipDual.secondary)})</span>`
              }</span>
            </div>
            <div class="order-spec-divider"></div>
            <div class="order-spec-row order-spec-row--total">
              <span>TOTAL A ABONAR</span>
              <div class="order-spec-total-val">
                <strong>${escapeHTML(totDual.primary)}</strong>
                <small>(${escapeHTML(totDual.secondary)})</small>
              </div>
            </div>
          </div>
        </div>

        <div class="checkout-section" style="margin-top: 24px;">
          <span class="section-label">ELEGÍ EL MEDIO DE PAGO</span>
          <div class="payment-list">
            <label class="payment-row ${orderData.paymentMethod === 'pesos' ? 'is-selected' : ''}">
              <input type="radio" name="paymentChoice" value="pesos" ${orderData.paymentMethod === 'pesos' ? 'checked' : ''} />
              <span class="radio-custom"></span>
              <span class="payment-row__title">Transferencia en Pesos</span>
            </label>

            <label class="payment-row ${orderData.paymentMethod === 'usd' ? 'is-selected' : ''}">
              <input type="radio" name="paymentChoice" value="usd" ${orderData.paymentMethod === 'usd' ? 'checked' : ''} />
              <span class="radio-custom"></span>
              <span class="payment-row__title">Transferencia en Dólares</span>
            </label>

            <label class="payment-row ${orderData.paymentMethod === 'deposito_mp' ? 'is-selected' : ''}">
              <input type="radio" name="paymentChoice" value="deposito_mp" ${orderData.paymentMethod === 'deposito_mp' ? 'checked' : ''} />
              <span class="radio-custom"></span>
              <span class="payment-row__title">Depósito en Efectivo (Rapipago / Pago Fácil)</span>
            </label>
          </div>
        </div>

        <button type="button" class="cart-btn cart-btn--primary checkout-submit-btn" id="confirmAndPayBtn" style="margin-top: 24px;">
          CONFIRMAR PEDIDO →
        </button>
      </div>
    `;

    drawer.querySelector('#paymentBackBtn').addEventListener('click', () => {
      currentStep = 'checkout';
      renderDrawerContent();
    });
    drawer.querySelector('#paymentCloseBtn').addEventListener('click', closeDrawer);

    drawer.querySelectorAll('input[name="paymentChoice"]').forEach(r => {
      r.addEventListener('change', (e) => {
        orderData.paymentMethod = e.target.value;
        drawer.querySelectorAll('.payment-row').forEach(c => c.classList.remove('is-selected'));
        e.target.closest('.payment-row').classList.add('is-selected');
      });
    });

    const confirmBtn = drawer.querySelector('#confirmAndPayBtn');
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'REGISTRANDO Y ENVIANDO...';

      const purchasedSnapshot = [...cartItems];
      lastPurchasedOrder = {
        items: purchasedSnapshot,
        orderData: { ...orderData },
        date: new Date().toISOString(),
      };

      try {
        await dispatchOrderEmail(purchasedSnapshot);
      } catch (e) {
        console.warn('PopperCart: Excepción al despachar pedido:', e);
      }

      cartItems = [];
      saveCartToStorage();
      currentStep = 'payment-instructions';
      renderDrawerContent();
    });
  }

  // ─── Formato limpio de moneda para email ────────────────────────────────────
  function formatCoinLineClean(item) {
    const id = item.id != null ? `ID #${item.id}` : '';
    const country = item.country ? String(item.country).trim() : '';
    const year = String(item.year || '').trim();
    let facial = String(item.title || '').trim();

    if (year && facial.includes(year)) {
      facial = facial.replace(new RegExp('\\b' + year + '\\b', 'g'), '').trim();
      facial = facial.replace(/\s+/g, ' ').replace(/^[, -]+|[, -]+$/g, '');
    }

    const grade = item.grade_short || item.grade || '';
    const gradePart = grade ? ` (${grade})` : '';

    const coinUSD = item.priceUSD || 0;
    const coinARS = roundARS(coinUSD * blueRate);
    const pricePart = `${coinUSD} USD / ${formatARS(coinARS)}`;

    const parts = [];
    if (id) parts.push(id);
    if (country) parts.push(country);
    if (facial) parts.push(facial);
    if (year) parts.push(year);

    return `${parts.join(' · ')}${gradePart} — ${pricePart}`;
  }

  // ─── Despacho de pedido por correo vía FormSubmit ─────────────────────────
  async function dispatchOrderEmail(purchasedItems) {
    if (!Array.isArray(purchasedItems) || !purchasedItems.length) {
      console.warn('PopperCart: No hay piezas para despachar en el email.');
      return false;
    }

    const parqueInfo = getNextParqueSchedule();
    const retiraQuien = orderData.pickupPerson || orderData.fullName;
    const subUSD = purchasedItems.reduce((acc, it) => acc + (it.priceUSD || 0), 0);
    const subARS = roundARS(subUSD * blueRate);
    const isUSD = orderData.paymentMethod === 'usd';
    const totalDisplay = isUSD ? formatUSD(orderData.totalUSD) : formatARS(orderData.totalARS);

    const monedasObj = {};
    if (purchasedItems.length === 1) {
      monedasObj['Moneda'] = formatCoinLineClean(purchasedItems[0]);
    } else {
      purchasedItems.forEach((it, idx) => {
        monedasObj[`Moneda ${idx + 1}`] = formatCoinLineClean(it);
      });
    }

    let metodoEnvio = '';
    const envioDetalleObj = {};

    if (orderData.deliveryType === 'parque') {
      metodoEnvio = 'Feria Parque Rivadavia (CABA)';
      envioDetalleObj['Quién retira'] = retiraQuien;
      envioDetalleObj['Cronograma'] = `Despacho: miércoles ${parqueInfo.dispatchDDMM} · Retiro a partir de: domingo ${parqueInfo.deliveryDDMM}`;
      envioDetalleObj['Entrega'] = 'Diego Cepeda de Dac Monedas (+54 9 11 5402-8935)';
      if (orderData.dni) envioDetalleObj['DNI'] = orderData.dni;
      envioDetalleObj['WhatsApp'] = orderData.phone;
      if (orderData.email) envioDetalleObj['Email'] = orderData.email;
    } else if (orderData.deliveryType === 'acumular') {
      metodoEnvio = 'Acumular compras (Sin despacho)';
      envioDetalleObj['Aclaración'] = 'Guardar piezas a nombre del cliente para futuros envíos';
      if (orderData.dni) envioDetalleObj['DNI'] = orderData.dni;
      envioDetalleObj['WhatsApp'] = orderData.phone;
      if (orderData.email) envioDetalleObj['Email'] = orderData.email;
    } else if (orderData.deliveryType === 'sucursal') {
      metodoEnvio = 'Envío a Sucursal de Correo (Andreani)';
      envioDetalleObj['Sucursal deseada'] = orderData.branchOrAddress;
      envioDetalleObj['Localidad y CP'] = `${orderData.city} (CP ${orderData.postalCode})`;
      envioDetalleObj['DNI'] = orderData.dni;
      envioDetalleObj['WhatsApp'] = orderData.phone;
      envioDetalleObj['Email'] = orderData.email;
    } else {
      metodoEnvio = 'Envío a Domicilio (Andreani)';
      envioDetalleObj['Dirección de entrega'] = orderData.branchOrAddress + (orderData.deliveryNotes ? ` (${orderData.deliveryNotes})` : '');
      envioDetalleObj['Localidad y CP'] = `${orderData.city} (CP ${orderData.postalCode})`;
      envioDetalleObj['DNI'] = orderData.dni;
      envioDetalleObj['WhatsApp'] = orderData.phone;
      envioDetalleObj['Email'] = orderData.email;
    }

    let formaPagoTexto = '';
    if (orderData.paymentMethod === 'usd') {
      formaPagoTexto = 'Transferencia en Dólares';
    } else if (orderData.paymentMethod === 'pesos') {
      formaPagoTexto = 'Transferencia en Pesos';
    } else {
      formaPagoTexto = 'Depósito en Efectivo (Rapipago / Pago Fácil)';
    }

    const payload = {
      _subject: `🪙 Pedido Popper: ${orderData.fullName} — ${totalDisplay}`,
      _template: 'table',
      _captcha: 'false',
      _replyto: orderData.email || 'numismaticapopper@gmail.com',

      "Nombre": orderData.fullName,
      ...monedasObj,
      "Método de envío": metodoEnvio,
      ...envioDetalleObj,
      "Medio de pago": formaPagoTexto,
      "Subtotal piezas": `${formatUSD(subUSD)} (${formatARS(subARS)})`,
      "Costo de envío": orderData.shippingCostARS > 0 ? formatARS(orderData.shippingCostARS) : 'Gratis ($0)',
      "TOTAL A PAGAR": `${formatARS(orderData.totalARS)} / ${formatUSD(orderData.totalUSD)}`,
      "Fecha": new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    };

    console.info('PopperCart: Despachando notificación de pedido a FormSubmit...', payload);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(FORMSUBMIT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const json = await res.json().catch(() => null);
      console.info('PopperCart: Respuesta de FormSubmit:', json);

      if (json && (json.success === 'true' || json.success === true)) {
        return true;
      }
      if (json && json.message) {
        console.warn('PopperCart: FormSubmit respondió:', json.message);
      }
      return false;
    } catch (err) {
      console.warn('PopperCart: Error despachando pedido vía FormSubmit:', err);
      return false;
    }
  }

  // ─── PASO 4: Instrucciones de Pago ─────────────────────────────────────────
  function renderStepPaymentInstructions(drawer) {
    const isUSD = orderData.paymentMethod === 'usd';
    const isPesos = orderData.paymentMethod === 'pesos';
    const isMP = orderData.paymentMethod === 'deposito_mp';
    const totFormatted = isUSD ? formatUSD(orderData.totalUSD) : formatARS(orderData.totalARS);
    const totAlt = isUSD ? formatARS(orderData.totalARS) : formatUSD(orderData.totalUSD);

    const purchasedShortIds = (lastPurchasedOrder && lastPurchasedOrder.items && lastPurchasedOrder.items.length)
      ? lastPurchasedOrder.items.map(it => `#${it.id}`).join(', ')
      : '';
    const itemsWppText = purchasedShortIds ? ` (Piezas: ${purchasedShortIds})` : '';
    const wppMsg = `Hola Numismatica Popper, ya realicé el pago de mi pedido a nombre de ${orderData.fullName} por un monto de ${totFormatted}${itemsWppText}. Te adjunto el comprobante.`;

    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <span class="cart-drawer__tag">CONFIRMACIÓN</span>
        <button type="button" class="cart-close-btn" id="finishCloseBtn" aria-label="Cerrar">✕</button>
      </div>

      <div class="cart-drawer__body">
        <div class="order-confirmed-banner">
          <span class="confirmed-check">✓</span>
          <h3 class="confirmed-title">PEDIDO REGISTRADO</h3>
          <p class="confirmed-desc">Tus piezas quedaron reservadas. Realizá la transferencia por el importe exacto para completar la compra.</p>
        </div>

        <div class="payment-total-callout">
          <span class="callout-label">IMPORTE A TRANSFERIR</span>
          <strong class="callout-val">${escapeHTML(totFormatted)} <span class="callout-val-secondary">(${escapeHTML(totAlt)})</span></strong>
        </div>

        ${isUSD ? `
          <div class="bank-spec">
            <span class="section-label">DATOS BANCARIOS — DÓLARES</span>
            <div class="spec-row">
              <span class="spec-label">TITULAR</span>
              <span class="spec-val">Ezequiel Carbajo</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">ALIAS</span>
              <span class="spec-val spec-val--copy" id="valAliasUSD">ATADO.ESPUMA.LOGRO</span>
              <button type="button" class="spec-copy-btn" data-copy="valAliasUSD">COPIAR</button>
            </div>
            <div class="spec-row">
              <span class="spec-label">CBU</span>
              <span class="spec-val spec-val--copy" id="valCbuUSD">1430001714004473420025</span>
              <button type="button" class="spec-copy-btn" data-copy="valCbuUSD">COPIAR</button>
            </div>
          </div>
        ` : ''}

        ${isPesos ? `
          <div class="bank-spec">
            <span class="section-label">DATOS BANCARIOS — PESOS</span>
            <div class="spec-row">
              <span class="spec-label">TITULAR</span>
              <span class="spec-val">Ezequiel Carbajo</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">ALIAS</span>
              <span class="spec-val spec-val--copy" id="valAliasARS">numismatica.popper.1</span>
              <button type="button" class="spec-copy-btn" data-copy="valAliasARS">COPIAR</button>
            </div>
            <div class="spec-row">
              <span class="spec-label">CVU</span>
              <span class="spec-val spec-val--copy" id="valCvuARS">0000003100081217918159</span>
              <button type="button" class="spec-copy-btn" data-copy="valCvuARS">COPIAR</button>
            </div>
          </div>
        ` : ''}

        ${isMP ? `
          <div class="bank-spec">
            <span class="section-label">DEPÓSITO EN EFECTIVO</span>
            <div class="spec-row">
              <span class="spec-label">SUCURSAL</span>
              <span class="spec-val">Cualquier Rapipago o Pago Fácil</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">CÓDIGO</span>
              <span class="spec-val spec-val--copy" id="valMpCode">97148 98714</span>
              <button type="button" class="spec-copy-btn" data-copy="valMpCode">COPIAR</button>
            </div>
            <div class="spec-row">
              <span class="spec-label">MONTO</span>
              <span class="spec-val">${escapeHTML(totFormatted)} <span class="spec-val-secondary">(${escapeHTML(totAlt)})</span></span>
            </div>
          </div>
        ` : ''}

        <div class="order-final-actions">
          <a
            href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(wppMsg)}"
            target="_blank"
            rel="noopener noreferrer"
            class="cart-btn cart-btn--wpp"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 018.23 8.24c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.74 2.66 4.22 3.73.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/></svg>
            ENVIAR COMPROBANTE POR WHATSAPP →
          </a>

          <button type="button" class="cart-btn cart-btn--secondary" id="backToCatalogBtn">
            FINALIZAR Y VOLVER AL CATÁLOGO
          </button>
        </div>
      </div>
    `;

    drawer.querySelector('#finishCloseBtn').addEventListener('click', closeDrawer);
    drawer.querySelector('#backToCatalogBtn').addEventListener('click', closeDrawer);

    drawer.querySelectorAll('.spec-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetId = btn.dataset.copy;
        const targetEl = drawer.querySelector('#' + targetId);
        if (targetEl) {
          const text = targetEl.textContent.trim().replace(/\s+/g, (targetId === 'valMpCode' ? ' ' : ''));
          let success = false;
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
              await navigator.clipboard.writeText(text);
              success = true;
            } catch (_) {}
          }
          if (!success) {
            try {
              const temp = document.createElement('textarea');
              temp.value = text;
              temp.setAttribute('readonly', '');
              temp.style.position = 'fixed';
              temp.style.opacity = '0';
              temp.style.left = '-9999px';
              document.body.appendChild(temp);
              temp.focus();
              temp.select();
              success = !!document.execCommand('copy');
              document.body.removeChild(temp);
            } catch (_) {
              success = false;
            }
          }

          if (success) {
            const original = btn.textContent;
            btn.textContent = 'COPIADO ✓';
            btn.classList.add('is-copied');
            setTimeout(() => {
              btn.textContent = original;
              btn.classList.remove('is-copied');
            }, 1800);
          } else {
            showToast('No se pudo copiar automáticamente');
          }
        }
      });
    });
  }

  // ─── Escapeo de cadenas ────────────────────────────────────────────────────
  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Delegación global y atajos ──────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('#floatingCartBtn, .cart-floating-btn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      openDrawer();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const drawer = document.getElementById('cartDrawer');
      if (drawer && drawer.classList.contains('is-open')) {
        closeDrawer();
      }
    }
  });

  // ─── Inicialización ────────────────────────────────────────────────────────
  function init() {
    loadCartFromStorage();
    ensureElements();
    updateBadge();
    fetchBlueRate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ─── Función de prueba de email ──────────────────────────────────────────
  async function sendTestEmail() {
    console.info('PopperCart: Ejecutando prueba de despacho de correo...');
    const testItems = [
      {
        id: 1493,
        title: '1 Centavo 1940',
        country: 'Comisionados de la Moneda de Malaya',
        year: 1940,
        priceUSD: 15,
        priceStr: '15 USD',
        grade_short: 'SC',
        grade: 'Sin Circular',
      },
      {
        id: 1490,
        title: 'Cápsula 31 mm',
        country: 'Insumos',
        year: '',
        priceUSD: 1,
        priceStr: '1 USD',
        grade_short: 'NUEVO',
        grade: 'Nuevo',
      }
    ];

    const prevOrder = { ...orderData };
    orderData.fullName = 'Prueba Numismática Popper';
    orderData.phone = '+54 9 11 2345-6789';
    orderData.email = 'numismaticapopper@gmail.com';
    orderData.dni = '30123456';
    orderData.deliveryType = 'domicilio';
    orderData.city = 'Buenos Aires';
    orderData.postalCode = '1405';
    orderData.branchOrAddress = 'Av. Rivadavia 4900, Piso 3 Depto B';
    orderData.deliveryNotes = 'Prueba técnica de vinculación y formato';
    orderData.paymentMethod = 'pesos';
    orderData.shippingCostARS = SHIPPING_DOMICILIO_ARS;
    orderData.shippingCostUSD = Number((SHIPPING_DOMICILIO_ARS / blueRate).toFixed(1));
    orderData.totalUSD = 16 + orderData.shippingCostUSD;
    orderData.totalARS = roundARS(16 * blueRate) + SHIPPING_DOMICILIO_ARS;

    const ok = await dispatchOrderEmail(testItems);
    orderData = prevOrder;
    if (ok) {
      showToast('¡Prueba enviada con éxito por email!');
    } else {
      showToast('Aviso: FormSubmit requiere abrir vía servidor web');
    }
    return ok;
  }

  // ─── API pública ───────────────────────────────────────────────────────────
  window.PopperCart = {
    has,
    add,
    remove,
    clear,
    toggle,
    open: openDrawer,
    close: closeDrawer,
    validateSoldItems,
    getItems: () => [...cartItems],
    getBlueRate: () => blueRate,
    isNonNumericId,
    hasNonNumericItems,
    sendTestEmail,
  };

})();
