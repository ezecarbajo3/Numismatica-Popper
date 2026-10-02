/**
 * Numismática Popper — Carrito y Checkout
 *
 * Persistencia en localStorage sin dependencias externas.
 * Cotización Dólar Blue Venta (dolarapi.com) con caché y respaldo.
 * Despacho de pedidos y consultas a numismaticapopper@gmail.com vía FormSubmit
 * (aviso al cliente por envío nativo con captcha; el detalle lo manda el dueño con el link de Gmail del mail del pedido).
 *
 * Piezas con id numérico → checkout normal. Piezas con id de texto (F/P/R…)
 * → "a consultar": no entran en el total ni en el pago, viajan en el mismo
 * mail al dueño para confirmar stock.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'popper_cart_items_v1';
  const LAST_ORDER_KEY = 'popper_last_order_v1';
  const RATE_CACHE_KEY = 'popper_blue_rate_v1';
  const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares/blue';
  const DOLAR_FALLBACK_VENTA = 1495;
  const SHIPPING_PARQUE_ARS = 500;
  const SHIPPING_SUCURSAL_ARS = 8500;
  const SHIPPING_DOMICILIO_ARS = 11500;
  const WHATSAPP_NUMBER = '5492235429132';
  const WHATSAPP_DISPLAY = '+54 9 223 542-9132';
  const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/numismaticapopper@gmail.com';
  const FORMSUBMIT_NATIVE_ENDPOINT = 'https://formsubmit.co/numismaticapopper@gmail.com';
  const DISCOUNTS_URL = 'discounts.json';
  const MAX_QTY = 99;
  const ORDER_TIMEOUT_MS = 15000;
  const LAST_ORDER_TTL_MS = 48 * 60 * 60 * 1000;

  const BANK = {
    holder: 'Ezequiel Carbajo',
    usd: { alias: 'ATADO.ESPUMA.LOGRO', cbu: '1430001714004473420025' },
    ars: { alias: 'numismatica.popper.1', cvu: '0000003100081217918159' },
    mp: { code: '97148 98714' },
  };

  const WPP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 018.23 8.24c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.74 2.66 4.22 3.73.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/></svg>';

  // ─── Estado interno ────────────────────────────────────────────────────────
  let cartItems = [];
  let blueRate = DOLAR_FALLBACK_VENTA;
  let rateSource = 'fallback'; // 'live' | 'cache' | 'fallback'
  let currentStep = 'cart'; // 'cart' | 'checkout' | 'payment-select' | 'payment-instructions' | 'inquiry-sent'
  let isSubmitting = false;
  let cartNotice = '';
  let lastFocusEl = null;
  let clearArmedTimer = null;
  let elementsReady = false;
  let viewportBound = false;
  let discountDraft = '';
  let discountMessage = '';

  let orderData = {
    orderId: '',
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
    paymentMethodTouched: false,
    parqueSchedule: null,
    discountCode: '',
    discountRule: null,
    discountUSD: 0,
    discountARS: 0,
    subtotalUSD: 0,
    subtotalARS: 0,
    totalUSD: 0,
    totalARS: 0,
    shippingCostARS: 0,
    shippingCostUSD: 0,
  };
  let lastPurchasedOrder = null;

  // ─── Storage seguro ────────────────────────────────────────────────────────
  function lsGetJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function lsSetJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('PopperCart: no se pudo guardar en el navegador', key);
      return false;
    }
  }

  function lsRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  // ─── Carga y persistencia ──────────────────────────────────────────────────
  function normalizeStoredItem(it) {
    if (!it || it.id == null || !Number.isFinite(it.priceUSD) || it.priceUSD <= 0) return null;
    const maxQty = Math.min(Math.max(1, Math.floor(Number(it.maxQty) || 1)), MAX_QTY);
    const qty = Math.min(Math.max(1, Math.floor(Number(it.qty) || 1)), maxQty);
    return { ...it, qty, maxQty };
  }

  function loadCartFromStorage() {
    const parsed = lsGetJSON(STORAGE_KEY);
    const seen = new Set();
    const items = [];
    if (Array.isArray(parsed)) {
      for (const raw of parsed) {
        const it = normalizeStoredItem(raw);
        if (!it || seen.has(String(it.id))) continue;
        seen.add(String(it.id));
        items.push(it);
      }
    }
    cartItems = items;
  }

  function saveCartToStorage() {
    lsSetJSON(STORAGE_KEY, cartItems);
    emitCartUpdated();
  }

  function emitCartUpdated() {
    window.dispatchEvent(new CustomEvent('popper:cart-updated', { detail: { items: cartItems } }));
    updateBadge();
  }

  function loadLastOrder() {
    const saved = lsGetJSON(LAST_ORDER_KEY);
    if (saved && saved.orderId && saved.date && (Date.now() - new Date(saved.date).getTime()) < LAST_ORDER_TTL_MS) {
      lastPurchasedOrder = saved;
    } else {
      lastPurchasedOrder = null;
      if (saved) lsRemove(LAST_ORDER_KEY);
    }
  }

  // ─── Cotización Dólar Blue Venta ───────────────────────────────────────────
  function loadCachedRate() {
    const cached = lsGetJSON(RATE_CACHE_KEY);
    if (cached && Number.isFinite(cached.rate) && cached.rate > 0) {
      blueRate = cached.rate;
      rateSource = 'cache';
    }
  }

  async function fetchBlueRate() {
    const cached = lsGetJSON(RATE_CACHE_KEY);
    const refRate = cached && Number.isFinite(cached.rate) && cached.rate > 0 ? cached.rate : 0;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(DOLAR_API_URL, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const venta = Number(data && (data.venta ?? data.value_sell));
        const sane = Number.isFinite(venta) && venta >= 100 && venta <= 100000;
        const plausible = !refRate || Math.abs(venta / refRate - 1) <= 0.3;
        if (sane && plausible) {
          const oldRate = blueRate;
          blueRate = venta;
          rateSource = 'live';
          lsSetJSON(RATE_CACHE_KEY, { rate: venta, at: Date.now() });
          softRender();
          if (oldRate !== venta && getCurrentCurrency() === 'ARS') {
            window.dispatchEvent(new CustomEvent('popper:currency-changed', {
              detail: { currency: 'ARS', rate: blueRate }
            }));
          }
          return;
        }
        console.warn('PopperCart: cotización descartada por inconsistente', venta);
      }
    } catch (err) {
      console.info('PopperCart: cotización de respaldo ($' + blueRate + ', ' + rateSource + ')');
    } finally {
      clearTimeout(timeoutId);
    }
    softRender();
  }

  // ─── Disponibilidad y verificación de inventario ──────────────────────────
  function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const n = typeof parsePriceUSD === 'function'
      ? parsePriceUSD(priceStr)
      : parseFloat(String(priceStr).replace(/,/g, '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function hasFixedPrice(coin) {
    return !!(coin && coin.price && !/consultar/i.test(String(coin.price)) && parsePrice(coin.price) > 0);
  }

  function isAvailable(coin) {
    if (!coin) return false;
    if (coin.status === 'sold' || coin.hidden) return false;
    if (typeof coin.cantidad === 'number' && coin.cantidad <= 0) return false;
    return hasFixedPrice(coin);
  }

  function maxQtyFor(coin) {
    const c = coin && coin.cantidad;
    return (typeof c === 'number' && c > 1) ? Math.min(Math.floor(c), MAX_QTY) : 1;
  }

  function validateSoldItems(allCoinsList) {
    const report = { removed: [], priceChanged: [], qtyAdjusted: [] };
    if (!Array.isArray(allCoinsList) || !cartItems.length) return report;
    const coinsMap = new Map(allCoinsList.map(c => [String(c.id), c]));
    const kept = [];

    for (const item of cartItems) {
      const live = coinsMap.get(String(item.id));
      if (!isAvailable(live)) {
        report.removed.push(item);
        continue;
      }
      const newPrice = parsePrice(live.price);
      if (newPrice !== item.priceUSD) {
        report.priceChanged.push({ title: live.title || item.title, from: item.priceUSD, to: newPrice });
      }
      item.title = live.title || item.title;
      item.priceUSD = newPrice;
      item.priceStr = live.price;
      item.country = live.country || item.country;
      const mq = maxQtyFor(live);
      item.maxQty = mq;
      if (item.qty > mq) {
        report.qtyAdjusted.push({ title: item.title, from: item.qty, to: mq });
        item.qty = mq;
      }
      kept.push(item);
    }

    if (report.removed.length || report.priceChanged.length || report.qtyAdjusted.length) {
      cartItems = kept;
      saveCartToStorage();
      const parts = [];
      if (report.removed.length) {
        parts.push(report.removed.length === 1
          ? 'Se quitó 1 pieza que ya no está disponible.'
          : `Se quitaron ${report.removed.length} piezas que ya no están disponibles.`);
      }
      report.priceChanged.forEach(c => {
        parts.push(`Cambió el precio de ${c.title}: ${formatUSD(c.from)} → ${formatUSD(c.to)}.`);
      });
      report.qtyAdjusted.forEach(c => {
        parts.push(`Ajustamos la cantidad de ${c.title} al stock disponible (${c.to}).`);
      });
      setNotice(parts.join(' '));
      softRender(true);
    }
    return report;
  }

  // Trae coins.json fresco y revalida el carrito. Devuelve null si no pudo.
  async function revalidateStock() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch('coins.json?t=' + Date.now(), { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data)) return null;
      return validateSoldItems(data);
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── Operaciones del carrito ───────────────────────────────────────────────
  function has(coinId) {
    const sId = String(coinId);
    return cartItems.some(item => String(item.id) === sId);
  }

  function add(coin, triggerEl, opts) {
    const silent = !!(opts && opts.silent);
    if (!coin) return false;
    if (coin.status === 'sold' || coin.hidden || (typeof coin.cantidad === 'number' && coin.cantidad <= 0)) {
      showToast('Esta pieza ya no está disponible.');
      return false;
    }
    if (has(coin.id)) return false;

    const priceNum = parsePrice(coin.price);
    if (!hasFixedPrice(coin)) {
      showToast('Esta pieza no tiene precio fijado. Consultanos por WhatsApp.');
      return false;
    }

    const imageSrc = typeof getPrimaryImage === 'function'
      ? getPrimaryImage(coin)
      : (Array.isArray(coin.images) && coin.images[0]) || '';

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
      qty: 1,
      maxQty: maxQtyFor(coin),
    });

    saveCartToStorage();
    animateFlyToCart(triggerEl);
    renderDrawerContent();

    if (!silent) showToast('Pieza agregada al carrito', 'VER CARRITO', openDrawer);
    return true;
  }

  function remove(coinId) {
    const sId = String(coinId);
    cartItems = cartItems.filter(item => String(item.id) !== sId);
    saveCartToStorage();
    renderDrawerContent();
    showToast('Pieza quitada del carrito');
  }

  function setQty(coinId, qty) {
    const sId = String(coinId);
    const item = cartItems.find(it => String(it.id) === sId);
    if (!item) return;
    const next = Math.min(Math.max(1, Math.floor(Number(qty) || 1)), item.maxQty || 1);
    if (next === item.qty) {
      if (qty > next) setNotice(`Stock máximo disponible: ${item.maxQty}.`);
      return;
    }
    item.qty = next;
    saveCartToStorage();
    renderDrawerContent();
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

  // ─── Clasificación: pagables vs a consultar (ids F/P/R…) ───────────────────
  function isNonNumericId(id) {
    if (id == null || id === '') return false;
    return !/^\d+$/.test(String(id).trim());
  }

  function hasNonNumericItems() {
    return cartItems.some(item => isNonNumericId(item.id));
  }

  function payableItems() {
    return cartItems.filter(it => !isNonNumericId(it.id));
  }

  function consultItems() {
    return cartItems.filter(it => isNonNumericId(it.id));
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

  const qtyOf = it => Math.max(1, it.qty || 1);
  const unitARS = it => roundARS((it.priceUSD || 0) * blueRate);
  const lineUSD = it => (it.priceUSD || 0) * qtyOf(it);
  const lineARS = it => unitARS(it) * qtyOf(it);

  function sumUSD(list) {
    return Number(list.reduce((acc, it) => acc + lineUSD(it), 0).toFixed(2));
  }

  // El subtotal ARS es la suma de las líneas ya redondeadas, así lo que se ve
  // en cada renglón siempre suma el total.
  function sumARS(list) {
    return list.reduce((acc, it) => acc + lineARS(it), 0);
  }

  function getSubtotalUSD() { return sumUSD(payableItems()); }
  function getSubtotalARS() { return sumARS(payableItems()); }
  function totalUnits() { return cartItems.reduce((acc, it) => acc + qtyOf(it), 0); }

  function formatARS(amount) {
    // Los montos llegan ya redondeados (por pieza); redondear la suma de nuevo la desfasaba.
    return '$' + Math.round(Number(amount) || 0).toLocaleString('es-AR');
  }

  function formatUSD(amount) {
    return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' USD';
  }

  function getCurrentCurrency() {
    if (typeof getCurrency === 'function') return getCurrency();
    try {
      const saved = localStorage.getItem('popper_currency_pref');
      if (saved === 'ARS' || saved === 'USD') return saved;
    } catch (_) {}
    return 'USD';
  }

  function formatDualPrice(valUSD, valARS) {
    const isARS = getCurrentCurrency() === 'ARS';
    return {
      primary: isARS ? formatARS(valARS) : formatUSD(valUSD),
      secondary: isARS ? formatUSD(valUSD) : formatARS(valARS),
    };
  }

  function rateLabel() {
    return `Cotización Dólar Blue: $${blueRate.toLocaleString('es-AR')}${rateSource === 'live' ? '' : ' (referencial)'}`;
  }

  function recomputeShipping() {
    const map = {
      parque: SHIPPING_PARQUE_ARS,
      sucursal: SHIPPING_SUCURSAL_ARS,
      domicilio: SHIPPING_DOMICILIO_ARS,
    };
    const ars = map[orderData.deliveryType] || 0;
    orderData.shippingCostARS = ars;
    orderData.shippingCostUSD = ars ? Number((ars / blueRate).toFixed(1)) : 0;
  }

  // ─── Códigos de descuento (discounts.json) ─────────────────────────────────
  function normalizeCode(raw) {
    return String(raw || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  }

  // Devuelve { status: 'ok', rule }, { status: 'expired' } o { status: 'invalid' }
  function evaluateDiscountRule(code, raw) {
    if (!raw || typeof raw !== 'object' || raw.active === false) return { status: 'invalid' };
    if (raw.expires) {
      const end = new Date(`${raw.expires}T23:59:59-03:00`);
      if (!isNaN(end.getTime()) && Date.now() > end.getTime()) {
        return { status: 'expired' };
      }
    }
    const percent = Number(raw.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return { status: 'invalid' };
    const rule = { code, label: String(raw.label || '').trim(), percent, highPrice: null };
    const hp = raw.highPrice;
    if (hp && Number(hp.overUSD) > 0 && Number.isFinite(Number(hp.percent)) && Number(hp.percent) >= 0) {
      rule.highPrice = { overUSD: Number(hp.overUSD), percent: Number(hp.percent) };
    }
    return { status: 'ok', rule };
  }

  // 'ok' → {rule} · 'expired' → vencido · 'invalid' → no existe/inactivo · 'network' → no se pudo consultar.
  async function fetchDiscountRule(rawCode) {
    const code = normalizeCode(rawCode);
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return { status: 'invalid' };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${DISCOUNTS_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return { status: 'network' };
      const data = await res.json();
      const key = Object.keys(data || {}).find(k => !k.startsWith('_') && normalizeCode(k) === code);
      if (!key) return { status: 'invalid' };
      return evaluateDiscountRule(code, data[key]);
    } catch (_) {
      return { status: 'network' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // % que le toca a una pieza: el general, o el reducido si su precio unitario supera el umbral.
  function discountPctFor(item, rule) {
    if (!rule) return 0;
    if (rule.highPrice && (item.priceUSD || 0) > rule.highPrice.overUSD) return rule.highPrice.percent;
    return rule.percent;
  }

  function computeDiscount(items, rule) {
    if (!rule) return { usd: 0, ars: 0 };
    let usd = 0;
    let ars = 0;
    items.forEach(it => {
      const pct = discountPctFor(it, rule);
      usd += lineUSD(it) * pct / 100;
      ars += lineARS(it) * pct / 100;
    });
    return { usd: Number(usd.toFixed(2)), ars: Math.round(ars / 100) * 100 };
  }

  function describeRule(rule) {
    const hp = rule.highPrice;
    return `${rule.percent}% off` +
      (hp ? ` · ${hp.percent}% si la pieza supera ${hp.overUSD} USD` : '') +
      ' · sin envío';
  }

  function clearDiscount() {
    orderData.discountCode = '';
    orderData.discountRule = null;
    orderData.discountUSD = 0;
    orderData.discountARS = 0;
  }

  function recomputeTotals() {
    recomputeShipping();
    const pay = payableItems();
    const subUSD = sumUSD(pay);
    const subARS = sumARS(pay);
    const disc = computeDiscount(pay, orderData.discountRule);
    orderData.discountUSD = Math.min(disc.usd, subUSD);
    orderData.discountARS = Math.min(disc.ars, subARS);
    orderData.subtotalUSD = subUSD;
    orderData.subtotalARS = subARS;
    orderData.totalUSD = Number((subUSD - orderData.discountUSD + orderData.shippingCostUSD).toFixed(2));
    orderData.totalARS = subARS - orderData.discountARS + orderData.shippingCostARS;
  }

  // ─── Próximo envío al Parque Rivadavia ────────────────────────────────────
  // Se despacha el miércoles previo al 2º domingo del mes (la semana de la
  // segunda feria del mes), para entregarse a partir de ese domingo en adelante.
  // Todo se calcula con la hora de Buenos Aires, no la del navegador.
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

    let now;
    try {
      now = new Date(new Date(refDate).toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
      if (isNaN(now.getTime())) now = new Date(refDate);
    } catch (_) {
      now = new Date(refDate);
    }
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

    const dDate = target.dispatchDate;
    const sDate = target.deliveryDate;
    const pad = n => String(n).padStart(2, '0');

    return {
      dispatchDDMM: `${pad(dDate.getDate())}/${pad(dDate.getMonth() + 1)}`,
      deliveryDDMM: `${pad(sDate.getDate())}/${pad(sDate.getMonth() + 1)}`,
    };
  }

  // ─── Líneas de texto de cada pieza (WhatsApp y mail) ───────────────────────
  function facialOf(item) {
    const year = String(item.year || '').trim();
    let facial = String(item.title || '').trim();
    if (year && facial.includes(year)) {
      facial = facial.replace(new RegExp('\\b' + year + '\\b', 'g'), '').trim();
      facial = facial.replace(/\s+/g, ' ').replace(/^[, -]+|[, -]+$/g, '');
    }
    return facial || String(item.title || '').trim();
  }

  function formatCoinLineForMessage(item) {
    const country = item.country ? String(item.country).trim() : 'País no informado';
    const year = String(item.year || '').trim();
    const monto = item.priceStr ? String(item.priceStr).trim() : `${item.priceUSD || 0} USD`;
    const qtyPart = qtyOf(item) > 1 ? ` x${qtyOf(item)}` : '';
    const idRef = item.id != null ? ` (ID: ${item.id})` : '';
    return `${country}, ${facialOf(item)}, ${year || 'S/A'}, ${monto}${qtyPart}${idRef}`;
  }

  function buildPrivateInquiryWhatsAppURL(isStockCheck = false) {
    if (!cartItems.length) return '';
    const lines = cartItems.map(formatCoinLineForMessage).join('\n');
    const totUSD = sumUSD(cartItems);
    const totARS = sumARS(cartItems);

    let header;
    if (isStockCheck) {
      header = cartItems.length === 1
        ? 'Hola Numismatica Popper, quisiera hacer una consulta de compra y verificar stock del siguiente ejemplar:'
        : 'Hola Numismatica Popper, quisiera hacer una consulta de compra y verificar stock de los siguientes ejemplares:';
    } else {
      header = 'Hola Numismatica Popper, estoy interesado en:';
    }

    const totalLine = getCurrentCurrency() === 'ARS'
      ? `Total: ${formatARS(totARS)} (${formatUSD(totUSD)})`
      : `Total: ${formatUSD(totUSD)} (${formatARS(totARS)})`;

    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`${header}\n${lines}\n\n${totalLine}`)}`;
  }

  // ─── Avisos ────────────────────────────────────────────────────────────────
  function isDrawerOpen() {
    const drawer = document.getElementById('cartDrawer');
    return !!(drawer && drawer.classList.contains('is-open'));
  }

  // Aviso persistente dentro del drawer (y toast si está cerrado).
  function setNotice(msg) {
    cartNotice = msg || '';
    if (cartNotice && !isDrawerOpen()) showToast(cartNotice, 'VER CARRITO', openDrawer);
  }

  function animateFlyToCart() {
    const floatingBtn = document.getElementById('floatingCartBtn');
    if (floatingBtn) {
      floatingBtn.classList.remove('cart-pulse');
      void floatingBtn.offsetWidth;
      floatingBtn.classList.add('cart-pulse');
    }
  }

  function showToast(message, actionText, actionCallback) {
    // Con el drawer abierto el toast taparía sus botones: la lista ya muestra el cambio.
    if (isDrawerOpen()) return;
    let toast = document.getElementById('popperToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'popperToast';
      toast.className = 'popper-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
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
    }, 4200);
  }

  // ─── Elementos UI Base ─────────────────────────────────────────────────────
  function syncCurrencyBtn() {
    const currBtn = document.getElementById('currencyToggleBtn');
    if (!currBtn) return;
    if (getCurrentCurrency() === 'ARS') {
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

  function ensureElements() {
    if (elementsReady && document.getElementById('cartDrawer')) return;

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
    currBtn.onclick = () => {
      if (typeof toggleCurrency === 'function') toggleCurrency();
      syncCurrencyBtn();
    };
    syncCurrencyBtn();

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
      overlay.setAttribute('aria-hidden', 'true');
      overlay.addEventListener('click', closeDrawer);
      document.body.appendChild(overlay);

      const drawer = document.createElement('aside');
      drawer.id = 'cartDrawer';
      drawer.className = 'cart-drawer';
      drawer.tabIndex = -1;
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-label', 'Carrito de compras');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(drawer);
    }
    elementsReady = true;
  }

  function updateBadge() {
    const units = totalUnits();
    const badge = document.getElementById('floatingCartBadge');
    if (badge) {
      badge.textContent = String(units);
      badge.classList.toggle('has-items', units > 0);
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
    // El botón de la ficha lo repinta detalle.js al recibir popper:cart-updated.
  }

  // Con el teclado virtual abierto, el drawer se acota al viewport visual.
  function syncViewport() {
    const drawer = document.getElementById('cartDrawer');
    const vv = window.visualViewport;
    if (!drawer || !vv || !drawer.classList.contains('is-open')) return;
    drawer.style.setProperty('--vvh', vv.height + 'px');
    drawer.style.setProperty('--vvtop', vv.offsetTop + 'px');
  }

  function bindViewport() {
    if (viewportBound || !window.visualViewport) return;
    viewportBound = true;
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }

  // Con el drawer abierto, el resto de la página no recibe foco ni toques.
  function setBackgroundInert(flag) {
    const keep = new Set(['cartDrawer', 'cartDrawerOverlay', 'popperToast']);
    Array.from(document.body.children).forEach(el => {
      if (keep.has(el.id) || /^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName)) return;
      if (flag) {
        if (!el.hasAttribute('inert')) {
          el.setAttribute('inert', '');
          el.setAttribute('data-cart-inert', '');
        }
      } else if (el.hasAttribute('data-cart-inert')) {
        el.removeAttribute('inert');
        el.removeAttribute('data-cart-inert');
      }
    });
  }

  function openDrawer() {
    ensureElements();
    const drawer = document.getElementById('cartDrawer');
    if (!isDrawerOpen()) lastFocusEl = document.activeElement;
    currentStep = 'cart';
    const toast = document.getElementById('popperToast');
    if (toast) toast.classList.remove('is-visible');
    renderDrawerContent();
    document.getElementById('cartDrawerOverlay').classList.add('is-open');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('cart-drawer-lock');
    setBackgroundInert(true);
    bindViewport();
    syncViewport();
    try { drawer.focus({ preventScroll: true }); } catch (_) {}
  }

  function closeDrawer() {
    // Mientras se envía el pedido no se puede cerrar: se perdería la confirmación.
    if (isSubmitting) return;
    const overlay = document.getElementById('cartDrawerOverlay');
    const drawer = document.getElementById('cartDrawer');
    if (overlay) overlay.classList.remove('is-open');
    if (drawer) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.classList.remove('cart-drawer-lock');
    setBackgroundInert(false);
    if (lastFocusEl && lastFocusEl.isConnected && typeof lastFocusEl.focus === 'function') {
      try { lastFocusEl.focus({ preventScroll: true }); } catch (_) {}
    }
    lastFocusEl = null;
  }

  function setSubmitting(flag) {
    isSubmitting = flag;
    const drawer = document.getElementById('cartDrawer');
    if (!drawer) return;
    drawer.classList.toggle('is-submitting', flag);
    drawer.setAttribute('aria-busy', flag ? 'true' : 'false');
    drawer.querySelectorAll('.cart-back-btn, .cart-close-btn, .checkout-submit-btn, input[type="radio"], .discount-apply, .discount-remove, #inputDiscount').forEach(el => {
      el.disabled = flag;
    });
  }

  // ─── Renderizado del Drawer ────────────────────────────────────────────────
  function renderDrawerContent() {
    const drawer = document.getElementById('cartDrawer');
    if (!drawer) return;

    // Sin piezas no hay checkout; sin piezas pagables no hay paso de pago.
    if ((currentStep === 'checkout' || currentStep === 'payment-select') && !cartItems.length) currentStep = 'cart';
    if (currentStep === 'payment-select' && !payableItems().length) currentStep = 'cart';
    if (currentStep === 'payment-instructions' && !lastPurchasedOrder) currentStep = 'cart';

    if (currentStep === 'checkout') saveCurrentForm(drawer);

    const prevBody = drawer.querySelector('.cart-drawer__body');
    const prevScroll = prevBody ? prevBody.scrollTop : 0;
    const prevStep = drawer.dataset.step;

    if (currentStep === 'cart') {
      renderStepCart(drawer);
    } else if (currentStep === 'checkout') {
      renderStepCheckout(drawer);
    } else if (currentStep === 'payment-select') {
      renderStepPaymentSelect(drawer);
    } else if (currentStep === 'payment-instructions') {
      renderStepPaymentInstructions(drawer);
    } else if (currentStep === 'inquiry-sent') {
      renderStepInquirySent(drawer);
    }

    drawer.dataset.step = currentStep;
    const body = drawer.querySelector('.cart-drawer__body');
    if (body) body.scrollTop = prevStep === currentStep ? prevScroll : 0;
    if (isSubmitting) setSubmitting(true);
  }

  // Re-render sin pisar lo que el usuario está escribiendo.
  function softRender(force) {
    const drawer = document.getElementById('cartDrawer');
    if (!drawer || !drawer.classList.contains('is-open')) {
      renderDrawerContent();
      return;
    }
    if (isSubmitting) return;
    const ae = document.activeElement;
    const typing = ae && drawer.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== 'radio';
    if (!force && currentStep === 'checkout' && typing) return;
    renderDrawerContent();
  }

  function refocus(selector) {
    const drawer = document.getElementById('cartDrawer');
    const el = drawer && drawer.querySelector(selector);
    if (el && !el.disabled) {
      try { el.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function noticeHTML() {
    if (!cartNotice) return '';
    return `
      <div class="cart-notice" role="status">
        <span class="cart-notice__text">${escapeHTML(cartNotice)}</span>
        <button type="button" class="cart-notice__close" data-dismiss-notice aria-label="Descartar aviso">✕</button>
      </div>
    `;
  }

  function bindNotice(drawer) {
    drawer.querySelectorAll('[data-dismiss-notice]').forEach(btn => {
      btn.addEventListener('click', () => {
        cartNotice = '';
        renderDrawerContent();
      });
    });
  }

  function cartItemHTML(item, isConsult) {
    const thumb = (item.image && typeof thumbFor === 'function') ? thumbFor(item.image) : (item.image || '');
    const qty = qtyOf(item);
    const dual = formatDualPrice(lineUSD(item), lineARS(item));
    const unit = formatDualPrice(item.priceUSD, unitARS(item));
    const idAttr = escapeHTML(item.id);
    const qtyControl = (item.maxQty || 1) > 1 ? `
      <div class="cart-qty" role="group" aria-label="Cantidad de ${escapeHTML(item.title)}">
        <button type="button" class="cart-qty__btn" data-qty-dec="${idAttr}" aria-label="Quitar una unidad" ${qty <= 1 ? 'disabled' : ''}>−</button>
        <span class="cart-qty__val">${qty}</span>
        <button type="button" class="cart-qty__btn" data-qty-inc="${idAttr}" aria-label="Sumar una unidad" ${qty >= item.maxQty ? 'disabled' : ''}>+</button>
        <span class="cart-qty__max">máx. ${item.maxQty}</span>
      </div>
    ` : '';
    return `
      <li class="cart-item${isConsult ? ' cart-item--consult' : ''}" data-id="${idAttr}">
        <div class="cart-item__thumb">
          ${thumb ? `<img src="${escapeHTML(thumb)}" alt="${escapeHTML(item.title)}" width="52" height="52" loading="lazy" />` : `<div class="cart-item__no-thumb">NP</div>`}
        </div>
        <div class="cart-item__details">
          <div class="cart-item__head">
            <h3 class="cart-item__title">${escapeHTML(item.title)}</h3>
            <button type="button" class="cart-item__remove" data-remove-id="${idAttr}" title="Quitar pieza" aria-label="Quitar ${escapeHTML(item.title)}">✕</button>
          </div>
          <div class="cart-item__meta">
            ${item.country ? `<span class="cart-item__country">${escapeHTML(item.country)}</span>` : ''}
            ${item.year ? `<span>• ${escapeHTML(item.year)}</span>` : ''}
            ${item.grade_short ? `<span class="cart-grade-badge">${escapeHTML(item.grade_short)}</span>` : ''}
            ${isConsult ? `<span class="cart-consult-tag">A CONSULTAR</span>` : ''}
          </div>
          ${qtyControl}
          <div class="cart-item__pricing">
            <strong class="cart-price-primary cart-price-usd">${escapeHTML(dual.primary)}</strong>
            <span class="cart-price-secondary cart-price-ars">(${escapeHTML(dual.secondary)})</span>
            ${qty > 1 ? `<span class="cart-item__unit">${qty} × ${escapeHTML(unit.primary)}</span>` : ''}
          </div>
        </div>
      </li>
    `;
  }

  // ─── PASO 1: Lista del Carrito (Tu Selección) ──────────────────────────────
  function renderStepCart(drawer) {
    const pay = payableItems();
    const consult = consultItems();
    const count = cartItems.length;
    const units = totalUnits();
    const subUSD = getSubtotalUSD();
    const subARS = getSubtotalARS();
    const sub = formatDualPrice(subUSD, subARS);
    const inquiryOnly = pay.length === 0 && consult.length > 0;
    const consultMessage = inquiryOnly
      ? 'Verificamos el stock y te confirmamos por WhatsApp.'
      : (consult.length === 1
        ? 'Esta pieza no entra en el total: te confirmamos si hay stock. El resto lo podés comprar ya.'
        : 'Estas piezas no entran en el total: te confirmamos si hay stock. El resto lo podés comprar ya.');

    let itemsHtml = '';
    if (count === 0) {
      const lo = lastPurchasedOrder;
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
        ${lo ? `
          <div class="cart-last-order">
            <span class="cart-last-order__label">TU ÚLTIMO PEDIDO · ${escapeHTML(lo.orderId)}</span>
            <button type="button" class="cart-btn cart-btn--secondary" id="cartLastOrderBtn">VER INSTRUCCIONES DE PAGO</button>
          </div>
        ` : ''}
      `;
    } else {
      itemsHtml = `
        ${pay.length ? `<ul class="cart-items-list">${pay.map(it => cartItemHTML(it, false)).join('')}</ul>` : ''}
        ${consult.length ? `
          <div class="cart-subhead">A CONSULTAR STOCK</div>
          <ul class="cart-items-list">${consult.map(it => cartItemHTML(it, true)).join('')}</ul>
            <div class="cart-stock-notice">
              <svg class="cart-stock-notice__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span class="cart-stock-notice__text">${escapeHTML(consultMessage)}</span>
            </div>
        ` : ''}
      `;
    }

    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <div class="cart-drawer__header-left">
          <span class="cart-drawer__tag">CARRITO</span>
          <span class="cart-drawer__count">[ ${units} ]</span>
        </div>
        <div class="cart-drawer__header-actions">
          ${count > 0 ? `<button type="button" class="cart-clear-btn" id="cartClearBtn">Vaciar</button>` : ''}
          <button type="button" class="cart-close-btn" id="cartCloseBtn" aria-label="Cerrar">✕</button>
        </div>
      </div>

      <div class="cart-drawer__body">
        ${noticeHTML()}
        ${itemsHtml}
      </div>

      ${count > 0 ? `
        <div class="cart-drawer__footer">
          ${pay.length ? `
            <div class="cart-totals-table">
              <div class="cart-totals-row">
                <span>Subtotal</span>
                <strong class="cart-totals-val">${escapeHTML(sub.primary)} <span class="cart-totals-usd cart-totals-secondary">(${escapeHTML(sub.secondary)})</span></strong>
              </div>
              <div class="cart-rate-line">
                <span>${escapeHTML(rateLabel())}</span>
              </div>
            </div>
          ` : ''}


          <div class="cart-actions-stack">
            <button type="button" class="cart-btn cart-btn--primary" id="cartStartCheckoutBtn">
              ${inquiryOnly ? 'ENVIAR CONSULTA DE STOCK →' : 'CONTINUAR CON LA COMPRA →'}
            </button>
            <a href="${escapeHTML(buildPrivateInquiryWhatsAppURL(inquiryOnly))}" target="_blank" rel="noopener noreferrer" class="cart-btn ${inquiryOnly ? 'cart-btn--wpp' : 'cart-btn--secondary'}" id="cartConsultBtn">
              ${inquiryOnly ? WPP_ICON : ''}CONSULTAR POR WHATSAPP
            </a>
          </div>
        </div>
      ` : ''}
    `;

    bindNotice(drawer);

    const closeBtn = drawer.querySelector('#cartCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    // "Vaciar" pide un segundo toque (sin diálogos nativos: bloquean en móvil).
    const clearBtn = drawer.querySelector('#cartClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (clearBtn.dataset.armed === '1') {
          clearTimeout(clearArmedTimer);
          clear();
          return;
        }
        clearBtn.dataset.armed = '1';
        clearBtn.textContent = '¿Seguro?';
        clearBtn.classList.add('is-armed');
        clearTimeout(clearArmedTimer);
        clearArmedTimer = setTimeout(() => {
          if (clearBtn.isConnected) {
            clearBtn.dataset.armed = '0';
            clearBtn.textContent = 'Vaciar';
            clearBtn.classList.remove('is-armed');
          }
        }, 3000);
      });
    }

    const startCheckoutBtn = drawer.querySelector('#cartStartCheckoutBtn');
    if (startCheckoutBtn) {
      startCheckoutBtn.addEventListener('click', () => {
        cartNotice = '';
        currentStep = 'checkout';
        renderDrawerContent();
        const body = drawer.querySelector('.cart-drawer__body');
        if (body) body.scrollTop = 0;
      });
    }

    const lastOrderBtn = drawer.querySelector('#cartLastOrderBtn');
    if (lastOrderBtn) {
      lastOrderBtn.addEventListener('click', () => {
        currentStep = 'payment-instructions';
        renderDrawerContent();
      });
    }

    drawer.querySelectorAll('[data-remove-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        remove(btn.dataset.removeId);
      });
    });

    drawer.querySelectorAll('[data-qty-inc], [data-qty-dec]').forEach(btn => {
      btn.addEventListener('click', () => {
        const inc = btn.hasAttribute('data-qty-inc');
        const id = inc ? btn.dataset.qtyInc : btn.dataset.qtyDec;
        const item = cartItems.find(it => String(it.id) === String(id));
        if (!item) return;
        setQty(id, qtyOf(item) + (inc ? 1 : -1));
        const sel = id.replace(/["\\]/g, '\\$&');
        refocus(`[data-qty-${inc ? 'inc' : 'dec'}="${sel}"]`);
        if (!document.activeElement || !document.getElementById('cartDrawer').contains(document.activeElement)) {
          refocus(`[data-qty-${inc ? 'dec' : 'inc'}="${sel}"]`);
        }
      });
    });
  }

  // ─── PASO 2: Entrega y Datos del Comprador ────────────────────────────────
  function renderStepCheckout(drawer) {
    const consult = consultItems();
    const inquiryOnly = payableItems().length === 0;
    const isAcumular = orderData.deliveryType === 'acumular';
    const isParque = orderData.deliveryType === 'parque';
    const isSucursal = orderData.deliveryType === 'sucursal';
    const isDomicilio = orderData.deliveryType === 'domicilio';
    const needsShippingData = !inquiryOnly && (isSucursal || isDomicilio);
    const parqueSchedule = getNextParqueSchedule();

    const isARS = getCurrentCurrency() === 'ARS';
    const parquePrice = isARS ? formatARS(SHIPPING_PARQUE_ARS) : formatUSD(Number((SHIPPING_PARQUE_ARS / blueRate).toFixed(1)));
    const sucursalPrice = isARS ? formatARS(SHIPPING_SUCURSAL_ARS) : formatUSD(Number((SHIPPING_SUCURSAL_ARS / blueRate).toFixed(1)));
    const domicilioPrice = isARS ? formatARS(SHIPPING_DOMICILIO_ARS) : formatUSD(Number((SHIPPING_DOMICILIO_ARS / blueRate).toFixed(1)));

    const consultAlert = inquiryOnly ? `
      <div class="checkout-consult-alert" role="note">
        <strong>Consulta de stock</strong>
        <span>Te escribimos para confirmar el stock. Todavía no hay nada para pagar.</span>
      </div>
    ` : '';

    const deliverySection = inquiryOnly ? '' : `
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
            <span class="delivery-row__price">${escapeHTML(parquePrice)}</span>
          </label>

          <label class="delivery-row ${isSucursal ? 'is-selected' : ''}">
            <input type="radio" name="deliveryChoice" value="sucursal" ${isSucursal ? 'checked' : ''} />
            <span class="radio-custom"></span>
            <div class="delivery-row__info">
              <span class="delivery-row__name">Envío a Sucursal</span>
              <span class="delivery-row__sub">A través de Andreani</span>
            </div>
            <span class="delivery-row__price">${escapeHTML(sucursalPrice)}</span>
          </label>

          <label class="delivery-row ${isDomicilio ? 'is-selected' : ''}">
            <input type="radio" name="deliveryChoice" value="domicilio" ${isDomicilio ? 'checked' : ''} />
            <span class="radio-custom"></span>
            <div class="delivery-row__info">
              <span class="delivery-row__name">Envío a Domicilio</span>
              <span class="delivery-row__sub">A través de Andreani</span>
            </div>
            <span class="delivery-row__price">${escapeHTML(domicilioPrice)}</span>
          </label>
        </div>
      </div>
    `;

    let detailsSection = '';
    if (!inquiryOnly) {
      detailsSection = `
        <div class="checkout-section" style="margin-top: 18px;">
          <span class="section-label">DETALLES DE ENTREGA</span>

          ${isParque ? `
            <div class="delivery-parque-card" style="margin-top: 4px; margin-bottom: 14px;">
              <div class="delivery-parque-card__title">
                PUNTO DE RETIRO: FERIA DE PARQUE RIVADAVIA (CABA)
              </div>
              <div class="delivery-parque-card__desc">
                Despacho: <strong>miércoles ${parqueSchedule.dispatchDDMM}</strong>. Retiro desde el <strong>domingo ${parqueSchedule.deliveryDDMM}</strong>, por la mañana. Entrega Diego Cepeda (Dac Monedas): <a href="https://wa.me/5491154028935" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline;">+54 9 11 5402-8935</a>.
              </div>
            </div>

            <div class="form-group">
              <label for="inputPickupPerson">¿QUIÉN RETIRA EN EL PARQUE? (OPCIONAL)</label>
              <input type="text" id="inputPickupPerson" class="form-input" maxlength="80" autocomplete="off" placeholder="Dejar en blanco si retira el titular" value="${escapeHTML(orderData.pickupPerson || '')}" />
            </div>
          ` : isAcumular ? `
            <div class="delivery-parque-card" style="margin-top: 4px; margin-bottom: 14px; border-color: rgba(var(--accent-rgb), 0.25);">
              <div class="delivery-parque-card__title">
                MODALIDAD: ACUMULAR COMPRAS
              </div>
              <div class="delivery-parque-card__desc">
                Guardamos tus piezas a tu nombre una vez confirmado el pago. Pedí el despacho cuando quieras.
              </div>
            </div>
          ` : `
            <div class="form-row" style="margin-top: 4px;">
              <div class="form-group" style="flex: 1.4;">
                <label for="inputCity">CIUDAD Y PROVINCIA *</label>
                <input type="text" id="inputCity" class="form-input" maxlength="80" autocomplete="address-level2" placeholder="Ej: Mar del Plata, Bs As" value="${escapeHTML(orderData.city)}" required />
              </div>
              <div class="form-group" style="flex: 0.8;">
                <label for="inputCp">CÓDIGO POSTAL *</label>
                <input type="text" id="inputCp" class="form-input" maxlength="8" autocomplete="postal-code" inputmode="numeric" placeholder="Ej: 7600" value="${escapeHTML(orderData.postalCode)}" required />
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
                maxlength="140"
                autocomplete="${isSucursal ? 'off' : 'street-address'}"
                placeholder="${isSucursal ? 'Ej: Andreani Centro o dirección de la sucursal' : 'Ej: San Martín 1234, 3º B'}"
                value="${escapeHTML(orderData.branchOrAddress)}"
                required
              />
            </div>

            ${isDomicilio ? `
              <div class="form-group">
                <label for="inputDeliveryNotes">ACLARACIONES O REFERENCIAS (OPCIONAL)</label>
                <input type="text" id="inputDeliveryNotes" class="form-input" maxlength="140" autocomplete="off" placeholder="Ej: Timbre A, entrecalles o dejar en recepción" value="${escapeHTML(orderData.deliveryNotes || '')}" />
              </div>
            ` : ''}
          `}
        </div>
      `;
    }

    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <button type="button" class="cart-back-btn" id="checkoutBackBtn">← CARRITO</button>
        <span class="cart-step-pill">${inquiryOnly ? 'CONSULTA' : '01 / ENTREGA'}</span>
        <button type="button" class="cart-close-btn" id="checkoutCloseBtn" aria-label="Cerrar">✕</button>
      </div>

      <div class="cart-drawer__body">
        ${consultAlert}
        ${deliverySection}

        <form id="checkoutForm" class="checkout-form" novalidate style="margin-top: ${inquiryOnly ? '8' : '24'}px;">
          <div class="checkout-section">
            <div class="form-group">
              <label for="inputFullName">NOMBRE Y APELLIDO *</label>
              <input type="text" id="inputFullName" class="form-input" maxlength="80" autocomplete="name" autocapitalize="words" placeholder="Ej: Juan Pérez" value="${escapeHTML(orderData.fullName)}" required />
            </div>

            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label for="inputWhatsApp">WHATSAPP / TEL *</label>
                <input type="tel" id="inputWhatsApp" class="form-input" maxlength="24" autocomplete="tel" inputmode="tel" placeholder="Ej: 11 2345 6789" value="${escapeHTML(orderData.phone)}" required />
              </div>
              ${inquiryOnly ? '' : `
              <div class="form-group" style="flex: 1;">
                <label for="inputDni">DNI ${needsShippingData ? '*' : '(OPCIONAL)'}</label>
                <input type="text" id="inputDni" class="form-input" maxlength="10" autocomplete="off" inputmode="numeric" placeholder="Ej: 38123456" value="${escapeHTML(orderData.dni)}" ${needsShippingData ? 'required' : ''} />
              </div>`}
            </div>

            <div class="form-group">
              <label for="inputEmail">CORREO ELECTRÓNICO *</label>
              <input
                type="email"
                id="inputEmail"
                class="form-input"
                maxlength="120"
                placeholder="correo@ejemplo.com"
                value="${escapeHTML(orderData.email)}"
                required
                autocomplete="email"
                inputmode="email"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
              />
            </div>
          </div>

          ${detailsSection}

          <div class="checkout-error" id="checkoutError" role="alert" style="display: none;"></div>

          <button type="submit" class="cart-btn cart-btn--primary checkout-submit-btn" id="checkoutSubmitBtn">
            ${inquiryOnly ? 'ENVIAR CONSULTA →' : 'CONTINUAR AL PAGO →'}
          </button>
        </form>
      </div>
    `;

    drawer.querySelector('#checkoutBackBtn').addEventListener('click', () => {
      if (isSubmitting) return;
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
        refocus('input[name="deliveryChoice"]:checked');
      });
    });

    const inputs = drawer.querySelectorAll('.form-input');
    inputs.forEach((input, idx) => {
      input.setAttribute('enterkeyhint', idx === inputs.length - 1 ? 'go' : 'next');
      input.addEventListener('input', () => {
        if (input.hasAttribute('aria-invalid')) {
          input.removeAttribute('aria-invalid');
          input.removeAttribute('aria-describedby');
          const note = input.closest('.form-group') && input.closest('.form-group').querySelector('.field-error');
          if (note) note.remove();
        }
        const err = drawer.querySelector('#checkoutError');
        if (err && err.style.display !== 'none') err.style.display = 'none';
      });
      // Con el teclado virtual abierto, centrar el campo para que no quede tapado.
      input.addEventListener('focus', () => {
        setTimeout(() => {
          if (document.activeElement === input && typeof input.scrollIntoView === 'function') {
            input.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }, 320);
      });
    });

    const form = drawer.querySelector('#checkoutForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      saveCurrentForm(drawer);

      const problem = validateCheckoutForm(inquiryOnly);
      if (problem) {
        showFieldError(drawer, problem.msg, problem.field);
        return;
      }
      // Reflejar en pantalla el email ya normalizado.
      const em = drawer.querySelector('#inputEmail');
      if (em) em.value = orderData.email;

      if (inquiryOnly) {
        submitInquiry(drawer);
        return;
      }

      orderData.parqueSchedule = orderData.deliveryType === 'parque' ? getNextParqueSchedule() : null;
      recomputeTotals();
      if (!orderData.paymentMethodTouched) {
        orderData.paymentMethod = getCurrentCurrency() === 'USD' ? 'usd' : 'pesos';
      }
      currentStep = 'payment-select';
      renderDrawerContent();
    });
  }

  function validateCheckoutForm(inquiryOnly) {
    const d = orderData;
    if (!d.fullName || d.fullName.length < 3) {
      return { msg: 'Ingresá tu nombre y apellido.', field: '#inputFullName' };
    }
    const phoneDigits = d.phone.replace(/\D/g, '');
    if (!/^[+\d\s()\-.]+$/.test(d.phone) || phoneDigits.length < 8 || phoneDigits.length > 15) {
      return { msg: 'Ingresá un teléfono válido (solo números, mín. 8 dígitos).', field: '#inputWhatsApp' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) {
      return { msg: 'Ingresá un correo electrónico válido para recibir la confirmación.', field: '#inputEmail' };
    }
    if (inquiryOnly) return null;

    const shipping = d.deliveryType === 'sucursal' || d.deliveryType === 'domicilio';
    if ((shipping && !d.dni) || (d.dni && !/^\d{7,8}$/.test(d.dni))) {
      return {
        msg: shipping && !d.dni
          ? 'El DNI es obligatorio para la guía de despacho por correo.'
          : 'El DNI debe tener 7 u 8 números, sin puntos.',
        field: '#inputDni',
      };
    }
    if (shipping) {
      if (!d.city) return { msg: 'Indicá tu ciudad y provincia.', field: '#inputCity' };
      if (!/^(\d{4}|[A-Za-z]\d{4}[A-Za-z]{3})$/.test(d.postalCode)) {
        return { msg: 'Ingresá un código postal válido (4 números).', field: '#inputCp' };
      }
      if (!d.branchOrAddress) {
        return {
          msg: d.deliveryType === 'sucursal'
            ? 'Indicá la sucursal de correo deseada.'
            : 'Indicá la dirección completa para el envío.',
          field: '#inputBranchOrAddress',
        };
      }
    }
    return null;
  }

  // El mensaje va pegado al campo con problema (el botón de enviar queda lejos y
  // en el celular el error quedaría fuera de pantalla).
  function clearFieldErrors(drawer) {
    drawer.querySelectorAll('.field-error').forEach(el => el.remove());
    drawer.querySelectorAll('.form-input[aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
  }

  function showFieldError(drawer, msg, fieldSel) {
    clearFieldErrors(drawer);
    const field = fieldSel && drawer.querySelector(fieldSel);
    const group = field && field.closest('.form-group');
    if (field && group) {
      const note = document.createElement('div');
      note.className = 'field-error';
      note.id = 'fieldError';
      note.setAttribute('role', 'alert');
      note.textContent = msg;
      group.appendChild(note);
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', 'fieldError');
      field.focus();
      return;
    }
    const err = drawer.querySelector('#checkoutError');
    if (err) {
      err.textContent = msg;
      err.style.display = 'block';
    }
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

    if (fn) orderData.fullName = fn.value.replace(/\s+/g, ' ').trim();
    if (ph) orderData.phone = ph.value.trim();
    if (dni) orderData.dni = dni.value.replace(/[.\s]/g, '');
    if (em) {
      let rawEmail = String(em.value || '');
      try { rawEmail = rawEmail.normalize('NFKC'); } catch (_) {}
      rawEmail = rawEmail.replace(/[\uFF20\uFE6B]/g, '@').replace(/\s+/g, '').trim();
      orderData.email = rawEmail.toLowerCase();
    }
    if (city) orderData.city = city.value.trim();
    if (cp) orderData.postalCode = cp.value.replace(/\s+/g, '').toUpperCase();
    if (addr) orderData.branchOrAddress = addr.value.trim();
    if (pp) orderData.pickupPerson = pp.value.trim();
    if (notes) orderData.deliveryNotes = notes.value.trim();
  }

  // ─── Pedido: ids, líneas y resumen ─────────────────────────────────────────
  function generateOrderId() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
    return `POP-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rand}`;
  }

  function deliveryLabel(type) {
    return type === 'acumular' ? 'Acumular compras'
      : type === 'parque' ? 'Envío a Parque Rivadavia'
      : type === 'sucursal' ? 'Envío a Sucursal (Andreani)'
      : 'Envío a Domicilio (Andreani)';
  }

  function paymentLabel(method) {
    return method === 'usd' ? 'Transferencia en Dólares'
      : method === 'pesos' ? 'Transferencia en Pesos'
      : 'Depósito en Efectivo (Rapipago / Pago Fácil)';
  }

  // Formato de una pieza para el mail: ID · país · facial · año (grado) — precio
  function formatCoinLineClean(item) {
    const qty = qtyOf(item);
    const parts = [];
    if (item.id != null) parts.push(`ID #${item.id}`);
    if (item.country) parts.push(String(item.country).trim());
    const facial = facialOf(item);
    if (facial) parts.push(facial);
    const year = String(item.year || '').trim();
    if (year) parts.push(year);
    const grade = item.grade_short || item.grade || '';
    const gradePart = grade ? ` (${grade})` : '';
    const price = qty > 1
      ? `${qty} × ${formatUSD(item.priceUSD || 0)} = ${formatUSD(lineUSD(item))} / ${formatARS(lineARS(item))}`
      : `${formatUSD(item.priceUSD || 0)} / ${formatARS(lineARS(item))}`;
    return `${parts.join(' · ')}${gradePart} — ${price}`;
  }

  function buildSnapshot(type) {
    const d = orderData;
    return {
      type, // 'order' | 'inquiry'
      orderId: d.orderId,
      date: new Date().toISOString(),
      items: payableItems().map(it => ({ ...it })),
      consult: consultItems().map(it => ({ ...it })),
      rate: blueRate,
      rateSource,
      data: {
        fullName: d.fullName,
        phone: d.phone,
        dni: d.dni,
        email: d.email,
        deliveryType: d.deliveryType,
        city: d.city,
        postalCode: d.postalCode,
        branchOrAddress: d.branchOrAddress,
        pickupPerson: d.pickupPerson,
        deliveryNotes: d.deliveryNotes,
        paymentMethod: d.paymentMethod,
        parqueSchedule: d.parqueSchedule,
        shippingCostARS: d.shippingCostARS,
        shippingCostUSD: d.shippingCostUSD,
        discountCode: d.discountCode,
        discountUSD: d.discountUSD,
        discountARS: d.discountARS,
        subtotalUSD: d.subtotalUSD,
        subtotalARS: d.subtotalARS,
        totalUSD: d.totalUSD,
        totalARS: d.totalARS,
      },
      discountRule: d.discountRule,
    };
  }

  function bankLinesFor(method) {
    if (method === 'usd') {
      return [
        'DATOS PARA TRANSFERIR EN DÓLARES',
        `Titular: ${BANK.holder}`,
        `Alias: ${BANK.usd.alias}`,
        `CBU: ${BANK.usd.cbu}`,
      ];
    }
    if (method === 'pesos') {
      return [
        'DATOS PARA TRANSFERIR EN PESOS',
        `Titular: ${BANK.holder}`,
        `Alias: ${BANK.ars.alias}`,
        `CVU: ${BANK.ars.cvu}`,
      ];
    }
    return [
      'DEPÓSITO EN EFECTIVO',
      'En cualquier Rapipago o Pago Fácil',
      `Código: ${BANK.mp.code}`,
    ];
  }

  function totalTextFor(snap) {
    const d = snap.data;
    return d.paymentMethod === 'usd' ? formatUSD(d.totalUSD) : formatARS(d.totalARS);
  }

  // Mail 1 al cliente: solo agradecimiento + "estamos procesando tu pedido".
  // FormSubmit solo manda el autorespondedor con envío nativo (no AJAX).
  function buildProcessingNotice(snap) {
    return {
      email: snap.data.email,
      subject: 'Gracias por su compra — Numismática Popper',
      message: 'Muchas gracias por su compra. Estamos procesando tu pedido.',
      orderId: snap.orderId,
    };
  }

  // Mail 2 al cliente: lo envía el dueño desde su Gmail con el link de confirmación
  // que trae el mail del pedido. Solo nombre, monedas, método de envío y total.
  function buildDetailMail(snap) {
    const d = snap.data;
    const lines = ['Gracias por su compra.', '', `Nombre: ${d.fullName}`];
    snap.items.forEach((it, idx) => lines.push(`Moneda ${idx + 1}: ${formatCoinLineClean(it)}`));
    lines.push(`Método de envío: ${deliveryLabel(d.deliveryType)}`);
    lines.push(`Total: ${totalTextFor(snap)}`);
    return {
      subject: 'Gracias por su compra — Numismática Popper',
      body: lines.join('\n'),
    };
  }

  // Link que abre Gmail (cuenta de la tienda) con el mail 2 ya redactado.
  function confirmComposeURL(snap) {
    const m = buildDetailMail(snap);
    const q = new URLSearchParams({
      view: 'cm', fs: '1', authuser: 'numismaticapopper@gmail.com',
      to: snap.data.email, su: m.subject, body: m.body,
    });
    return `https://mail.google.com/mail/?${q.toString().replace(/\+/g, '%20')}`;
  }

  // Envío nativo en pestaña nueva (lo llama un click del cliente, así no lo bloquea el navegador).
  function sendCustomerCopy(copy) {
    if (!copy || !copy.email) return;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = FORMSUBMIT_NATIVE_ENDPOINT;
    form.target = '_blank';
    form.style.display = 'none';
    const add = (name, value) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    add('email', copy.email);
    add('_subject', `Aviso enviado al cliente — N° ${copy.orderId} (solo informativo)`);
    add('_autoresponse', copy.message);
    add('_template', 'table');
    add('_replyto', copy.email);
    add('_next', `${location.origin}/gracias.html`);
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => form.remove(), 1000);
  }

  function buildOrderPayload(snap) {
    const d = snap.data;
    const isInquiry = snap.type === 'inquiry';
    const isTest = /^\s*prueba/i.test(d.fullName || '');
    const testTag = isTest ? '[PRUEBA] ' : '';

    const subject = isInquiry
      ? `❓ ${testTag}[${snap.orderId}] Consulta de stock: ${d.fullName}`
      : `🪙 ${testTag}[${snap.orderId}] Pedido Popper: ${d.fullName} — ${totalTextFor(snap)}`;

    const payload = {
      _subject: subject,
      _template: 'table',
      _captcha: 'false',
      _honey: '',
      _replyto: d.email,
      email: d.email,
      'Pedido N°': snap.orderId,
      'Tipo': isInquiry ? 'CONSULTA DE STOCK (sin pago)' : 'PEDIDO',
      'Nombre': d.fullName,
      'WhatsApp': d.phone,
    };

    if (!isInquiry) {
      if (snap.items.length === 1) {
        payload['Moneda'] = formatCoinLineClean(snap.items[0]);
      } else {
        snap.items.forEach((it, idx) => { payload[`Moneda ${idx + 1}`] = formatCoinLineClean(it); });
      }
    }
    snap.consult.forEach((it, idx) => {
      payload[snap.consult.length === 1 ? 'CONSULTAR STOCK' : `CONSULTAR STOCK ${idx + 1}`] = formatCoinLineClean(it);
    });

    if (!isInquiry) {
      payload['Método de envío'] = deliveryLabel(d.deliveryType);
      if (d.dni) payload['DNI'] = d.dni;

      if (d.deliveryType === 'parque') {
        const sch = d.parqueSchedule || getNextParqueSchedule();
        payload['Quién retira'] = d.pickupPerson || d.fullName;
        payload['Cronograma'] = `Despacho: miércoles ${sch.dispatchDDMM} · Retiro a partir de: domingo ${sch.deliveryDDMM}`;
        payload['Entrega'] = 'Diego Cepeda de Dac Monedas (+54 9 11 5402-8935)';
      } else if (d.deliveryType === 'acumular') {
        payload['Aclaración'] = 'Guardar piezas a nombre del cliente para futuros envíos';
      } else if (d.deliveryType === 'sucursal') {
        payload['Sucursal deseada'] = d.branchOrAddress;
        payload['Localidad y CP'] = `${d.city} (CP ${d.postalCode})`;
      } else {
        payload['Dirección de entrega'] = d.branchOrAddress + (d.deliveryNotes ? ` (${d.deliveryNotes})` : '');
        payload['Localidad y CP'] = `${d.city} (CP ${d.postalCode})`;
      }

      const subUSD = sumUSD(snap.items);
      const subARS = sumARS(snap.items);
      payload['Medio de pago'] = paymentLabel(d.paymentMethod);
      payload['Subtotal piezas'] = `${formatUSD(subUSD)} (${formatARS(subARS)})`;
      if (d.discountCode && d.discountARS > 0) {
        const detail = snap.items.map(it => `ID #${it.id}: ${discountPctFor(it, snap.discountRule)}%`).join(' · ');
        payload['Código de descuento'] = `${d.discountCode} — −${formatARS(d.discountARS)} (−${formatUSD(d.discountUSD)}) · ${detail}`;
      }
      payload['Costo de envío'] = d.shippingCostARS > 0
        ? `${formatARS(d.shippingCostARS)} (${formatUSD(d.shippingCostUSD)})`
        : 'Gratis ($0)';
      payload['TOTAL A PAGAR'] = `${formatARS(d.totalARS)} / ${formatUSD(d.totalUSD)}`;
      payload['✅ CONFIRMAR COMPRA (abre Gmail con el mail al cliente listo; tocá Enviar)'] = confirmComposeURL(snap);
    }

    payload['Cotización usada'] = `$${snap.rate.toLocaleString('es-AR')} por USD${snap.rateSource === 'live' ? '' : ' (REFERENCIAL: no se pudo leer la cotización en vivo)'}`;
    payload['Fecha'] = new Date(snap.date).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    return payload;
  }

  // ─── Envío por correo vía FormSubmit ───────────────────────────────────────
  async function dispatchOrderEmail(snap) {
    const hasPieces = (snap.items && snap.items.length) || (snap.consult && snap.consult.length);
    if (!snap || !hasPieces) {
      console.warn('PopperCart: no hay piezas para despachar.');
      return false;
    }

    const payload = buildOrderPayload(snap);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ORDER_TIMEOUT_MS);

    try {
      const res = await fetch(FORMSUBMIT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (json && (json.success === 'true' || json.success === true)) return true;
      console.warn('PopperCart: FormSubmit no confirmó el envío', res.status, json && json.message);
      return false;
    } catch (err) {
      console.warn('PopperCart: error despachando pedido vía FormSubmit', err && err.name);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Mensaje de WhatsApp con el pedido completo, por si el mail no sale.
  function buildFallbackWhatsAppURL(snap) {
    const d = snap.data;
    const lines = [];
    lines.push(`Hola Numismatica Popper, quise ${snap.type === 'inquiry' ? 'consultar stock' : 'hacer el pedido'} ${snap.orderId} desde la web pero no se pudo enviar. Te paso los datos:`);
    lines.push(`Nombre: ${d.fullName}`);
    lines.push(`WhatsApp: ${d.phone}`);
    lines.push(`Email: ${d.email}`);
    if (snap.items.length) {
      lines.push('', 'Piezas:');
      snap.items.forEach(it => lines.push(`- ${formatCoinLineForMessage(it)}`));
    }
    if (snap.consult.length) {
      lines.push('', 'A consultar stock:');
      snap.consult.forEach(it => lines.push(`- ${formatCoinLineForMessage(it)}`));
    }
    if (snap.type !== 'inquiry') {
      lines.push('', `Envío: ${deliveryLabel(d.deliveryType)}`);
      if (d.deliveryType === 'sucursal' || d.deliveryType === 'domicilio') {
        lines.push(`${d.branchOrAddress} · ${d.city} (CP ${d.postalCode}) · DNI ${d.dni}`);
      }
      lines.push(`Pago: ${paymentLabel(d.paymentMethod)}`, `Total: ${totalTextFor(snap)}`);
    }
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  function showSubmitError(drawer, snap) {
    const slot = drawer.querySelector('#submitErrorSlot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="checkout-error submit-error" role="alert">
        <strong>No pudimos enviar tu pedido.</strong>
        <span>Revisá tu conexión y reintentá: tu carrito sigue intacto. O mandanos el pedido por WhatsApp.</span>
        <a href="${escapeHTML(buildFallbackWhatsAppURL(snap))}" target="_blank" rel="noopener noreferrer" class="cart-btn cart-btn--wpp" id="fallbackWppBtn">${WPP_ICON}ENVIAR PEDIDO POR WHATSAPP</a>
      </div>
    `;
  }

  // Finaliza un envío exitoso: guarda el pedido, vacía el carrito y avanza.
  function finishOrder(snap) {
    lastPurchasedOrder = {
      orderId: snap.orderId,
      type: snap.type,
      date: snap.date,
      items: snap.items.map(it => ({ id: it.id, title: it.title, qty: qtyOf(it) })),
      consult: snap.consult.map(it => ({ id: it.id, title: it.title, qty: qtyOf(it) })),
      data: {
        discountCode: snap.data.discountCode,
        fullName: snap.data.fullName,
        phone: snap.data.phone,
        email: snap.data.email,
        deliveryType: snap.data.deliveryType,
        paymentMethod: snap.data.paymentMethod,
        totalUSD: snap.data.totalUSD,
        totalARS: snap.data.totalARS,
      },
      mailCopy: snap.type === 'order' ? buildProcessingNotice(snap) : null,
    };
    lsSetJSON(LAST_ORDER_KEY, lastPurchasedOrder);
    cartItems = [];
    saveCartToStorage();
    orderData.orderId = '';
    clearDiscount();
    discountDraft = '';
    discountMessage = '';
    cartNotice = '';
    currentStep = snap.type === 'inquiry' ? 'inquiry-sent' : 'payment-instructions';
  }

  // Revalida stock contra coins.json fresco. Devuelve true si algo cambió.
  async function stockChanged() {
    const report = await revalidateStock();
    if (!report) return false;
    return !!(report.removed.length || report.priceChanged.length || report.qtyAdjusted.length);
  }

  async function submitInquiry(drawer) {
    if (isSubmitting) return;
    const btn = drawer.querySelector('#checkoutSubmitBtn');
    setSubmitting(true);
    if (btn) btn.textContent = 'ENVIANDO CONSULTA...';

    if (await stockChanged()) {
      setSubmitting(false);
      currentStep = 'cart';
      renderDrawerContent();
      return;
    }

    if (!orderData.orderId) orderData.orderId = generateOrderId();
    const snap = buildSnapshot('inquiry');
    const ok = await dispatchOrderEmail(snap);
    const live = document.getElementById('cartDrawer');
    if (ok) {
      setSubmitting(false);
      finishOrder(snap);
      renderDrawerContent();
      return;
    }
    setSubmitting(false);
    if (live) {
      const b = live.querySelector('#checkoutSubmitBtn');
      if (b) b.textContent = 'REINTENTAR ENVÍO →';
      showSubmitError(live, snap);
    }
  }

  // ─── PASO 3: Medio de Pago y Confirmación ──────────────────────────────────
  function renderStepPaymentSelect(drawer) {
    const pay = payableItems();
    recomputeTotals();
    const isUSD = orderData.paymentMethod === 'usd';
    const shipARS = orderData.shippingCostARS;
    const shipUSD = orderData.shippingCostUSD;
    const rule = orderData.discountRule;
    const hasDiscount = !!(rule && orderData.discountARS > 0);

    const subFormatted = isUSD ? formatUSD(orderData.subtotalUSD) : formatARS(orderData.subtotalARS);
    const shipFormatted = shipARS === 0 ? 'GRATIS' : (isUSD ? formatUSD(shipUSD) : formatARS(shipARS));
    const discFormatted = isUSD ? formatUSD(orderData.discountUSD) : formatARS(orderData.discountARS);
    const totFormatted = isUSD ? formatUSD(orderData.totalUSD) : formatARS(orderData.totalARS);

    const discountBox = rule ? `
      <div class="discount-applied">
        <strong class="discount-applied__label">DESCUENTO APLICADO</strong>
        <button type="button" class="discount-remove" id="discountRemoveBtn">QUITAR</button>
      </div>
    ` : `
      <form class="discount-row" id="discountForm" novalidate>
        <input type="text" id="inputDiscount" class="form-input" maxlength="24" placeholder="Ingresá tu código" value="${escapeHTML(discountDraft)}" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Código de descuento" />
        <button type="submit" class="cart-btn cart-btn--secondary discount-apply">APLICAR</button>
      </form>
    `;

    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <button type="button" class="cart-back-btn" id="paymentBackBtn">← ENTREGA</button>
        <span class="cart-step-pill">02 / PAGO</span>
        <button type="button" class="cart-close-btn" id="paymentCloseBtn" aria-label="Cerrar">✕</button>
      </div>

      <div class="cart-drawer__body">
        ${noticeHTML()}

        <div class="checkout-section">
          <span class="section-label">RESUMEN DEL PEDIDO</span>
          <div class="order-spec-table">
            <div class="order-spec-items">
              ${pay.map(item => {
                const priceFormatted = isUSD ? formatUSD(lineUSD(item)) : formatARS(lineARS(item));
                const qty = qtyOf(item);
                return `
                <div class="order-spec-row order-spec-row--item">
                  <span class="order-spec-item-title">${qty > 1 ? `${qty} × ` : ''}${escapeHTML(item.title)}</span>
                  <span class="order-spec-item-price">${escapeHTML(priceFormatted)}</span>
                </div>
              `;}).join('')}
            </div>
            <div class="order-spec-row">
              <span>Subtotal</span>
              <span>${escapeHTML(subFormatted)}</span>
            </div>
            <div class="order-spec-row">
              <span>${escapeHTML(deliveryLabel(orderData.deliveryType))}</span>
              <span>${escapeHTML(shipFormatted)}</span>
            </div>
            ${hasDiscount ? `
              <div class="order-spec-row order-spec-row--discount">
                <span>Descuento (${escapeHTML(orderData.discountCode)})</span>
                <span>−${escapeHTML(discFormatted)}</span>
              </div>
            ` : ''}
            <div class="order-spec-divider"></div>
            <div class="order-spec-row order-spec-row--total">
              <span>TOTAL A ABONAR</span>
              <div class="order-spec-total-val">
                <strong>${escapeHTML(totFormatted)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="checkout-section discount-box" style="margin-top: 24px;">
          <span class="section-label">CÓDIGO DE DESCUENTO</span>
          ${discountBox}
          <p class="discount-msg" id="discountMsg" role="status" ${discountMessage ? '' : 'hidden'}>${escapeHTML(discountMessage)}</p>
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

        <div id="submitErrorSlot"></div>

        <button type="button" class="cart-btn cart-btn--primary checkout-submit-btn" id="confirmAndPayBtn" style="margin-top: 24px;">
          CONFIRMAR PEDIDO →
        </button>
      </div>
    `;

    bindNotice(drawer);

    drawer.querySelector('#paymentBackBtn').addEventListener('click', () => {
      if (isSubmitting) return;
      currentStep = 'checkout';
      renderDrawerContent();
    });
    drawer.querySelector('#paymentCloseBtn').addEventListener('click', closeDrawer);

    drawer.querySelectorAll('input[name="paymentChoice"]').forEach(r => {
      r.addEventListener('change', (e) => {
        orderData.paymentMethodTouched = true;
        orderData.paymentMethod = e.target.value;
        const prevBody = drawer.querySelector('.cart-drawer__body');
        const prevScroll = prevBody ? prevBody.scrollTop : 0;
        renderStepPaymentSelect(drawer);
        const newBody = drawer.querySelector('.cart-drawer__body');
        if (newBody && prevScroll) newBody.scrollTop = prevScroll;
      });
    });

    const discountForm = drawer.querySelector('#discountForm');
    if (discountForm) {
      const input = discountForm.querySelector('#inputDiscount');
      input.addEventListener('input', () => {
        discountDraft = input.value;
      });
      input.addEventListener('focus', () => {
        setTimeout(() => {
          if (document.activeElement === input) input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 320);
      });
      discountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        discountDraft = normalizeCode(input.value);
        if (!discountDraft) {
          discountMessage = 'Ingresá un código de descuento.';
          renderStepPaymentSelect(drawer);
          refocus('#inputDiscount');
          return;
        }
        const btn = discountForm.querySelector('.discount-apply');
        btn.disabled = true;
        btn.textContent = 'VERIFICANDO...';
        const result = await fetchDiscountRule(discountDraft);
        if (currentStep !== 'payment-select') return;
        const live = document.getElementById('cartDrawer');
        if (result.status === 'ok') {
          orderData.discountCode = result.rule.code;
          orderData.discountRule = result.rule;
          discountDraft = '';
          discountMessage = '';
          recomputeTotals();
          if (!(orderData.discountARS > 0)) {
            clearDiscount();
            discountMessage = 'Este código no aplica a las piezas de tu carrito.';
          }
        } else if (result.status === 'expired') {
          discountMessage = 'El código ingresado ya venció.';
        } else if (result.status === 'network') {
          discountMessage = 'No pudimos verificar el código ahora. Probá de nuevo en unos segundos.';
        } else {
          discountMessage = 'El código ingresado no es válido.';
        }
        renderStepPaymentSelect(live);
        if (!orderData.discountRule) refocus('#inputDiscount');
      });
    }
    const removeBtn = drawer.querySelector('#discountRemoveBtn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (isSubmitting) return;
        clearDiscount();
        discountMessage = '';
        recomputeTotals();
        renderStepPaymentSelect(drawer);
        refocus('#inputDiscount');
      });
    }

    const confirmBtn = drawer.querySelector('#confirmAndPayBtn');
    confirmBtn.addEventListener('click', async () => {
      if (isSubmitting) return;
      setSubmitting(true);
      confirmBtn.textContent = 'REGISTRANDO Y ENVIANDO...';
      const slot = drawer.querySelector('#submitErrorSlot');
      if (slot) slot.innerHTML = '';

      // 1) Stock y precios frescos: si algo cambió, se avisa y NO se envía.
      if (await stockChanged()) {
        setSubmitting(false);
        renderDrawerContent();
        return;
      }

      // 2) El código sigue siendo válido (y con las mismas condiciones) o se avisa.
      if (orderData.discountRule) {
        const before = orderData.discountARS;
        const res = await fetchDiscountRule(orderData.discountCode);
        if (res.status === 'invalid' || res.status === 'expired') {
          clearDiscount();
          setSubmitting(false);
          setNotice(res.status === 'expired'
            ? 'El código de descuento ya venció. Revisá el nuevo total antes de confirmar.'
            : 'El código de descuento ya no es válido. Revisá el nuevo total antes de confirmar.');
          renderDrawerContent();
          return;
        }
        if (res.status === 'ok') {
          orderData.discountRule = res.rule;
          recomputeTotals();
          if (orderData.discountARS !== before) {
            setSubmitting(false);
            setNotice('Cambiaron las condiciones del descuento. Revisá el nuevo total antes de confirmar.');
            renderDrawerContent();
            return;
          }
        }
      }

      // 3) Totales recalculados con la cotización vigente.
      recomputeTotals();
      if (!orderData.orderId) orderData.orderId = generateOrderId();
      const snap = buildSnapshot('order');

      // 4) Envío: solo se vacía el carrito si el mail salió.
      const ok = await dispatchOrderEmail(snap);
      setSubmitting(false);
      if (ok) {
        finishOrder(snap);
        renderDrawerContent();
        return;
      }
      const live = document.getElementById('cartDrawer');
      if (live) {
        const b = live.querySelector('#confirmAndPayBtn');
        if (b) b.textContent = 'REINTENTAR ENVÍO →';
        showSubmitError(live, snap);
      }
    });
  }

  // ─── Consulta enviada (carrito solo con piezas a consultar) ────────────────
  function renderStepInquirySent(drawer) {
    const lo = lastPurchasedOrder;
    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <span class="cart-drawer__tag">CONSULTA ENVIADA</span>
        <button type="button" class="cart-close-btn" id="finishCloseBtn" aria-label="Cerrar">✕</button>
      </div>
      <div class="cart-drawer__body">
        <div class="order-confirmed-banner">
          <span class="confirmed-check">✓</span>
          <h3 class="confirmed-title">CONSULTA RECIBIDA</h3>
          <p class="confirmed-desc">${lo ? `Número de consulta <strong>${escapeHTML(lo.orderId)}</strong>. ` : ''}Verificamos el stock y te escribimos por WhatsApp. Todavía no hay nada para pagar.</p>
        </div>
        <div class="order-final-actions">
          <button type="button" class="cart-btn cart-btn--secondary" id="backToCatalogBtn">VOLVER AL CATÁLOGO</button>
        </div>
      </div>
    `;
    drawer.querySelector('#finishCloseBtn').addEventListener('click', closeDrawer);
    drawer.querySelector('#backToCatalogBtn').addEventListener('click', closeDrawer);
  }

  // ─── PASO 4: Instrucciones de Pago ─────────────────────────────────────────
  function renderStepPaymentInstructions(drawer) {
    const lo = lastPurchasedOrder;
    if (!lo) { currentStep = 'cart'; renderStepCart(drawer); return; }
    const d = lo.data;
    const isUSD = d.paymentMethod === 'usd';
    const isPesos = d.paymentMethod === 'pesos';
    const isMP = d.paymentMethod === 'deposito_mp';
    const totFormatted = isUSD ? formatUSD(d.totalUSD) : formatARS(d.totalARS);
    const totAlt = isUSD ? formatARS(d.totalARS) : formatUSD(d.totalUSD);

    const ids = lo.items.map(it => `#${it.id}${it.qty > 1 ? ` x${it.qty}` : ''}`).join(', ');
    const wppMsg = `Hola Numismatica Popper, ya realicé el pago del pedido ${lo.orderId} a nombre de ${d.fullName} por un monto de ${totFormatted}${ids ? ` (Piezas: ${ids})` : ''}. Te adjunto el comprobante.`;

    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <span class="cart-drawer__tag">CONFIRMACIÓN</span>
        <button type="button" class="cart-close-btn" id="finishCloseBtn" aria-label="Cerrar">✕</button>
      </div>

      <div class="cart-drawer__body">
        <div class="order-confirmed-banner">
          <span class="confirmed-check">✓</span>
          <h3 class="confirmed-title">PEDIDO RECIBIDO</h3>
          <p class="confirmed-order-id">N° ${escapeHTML(lo.orderId)}</p>
          <p class="confirmed-desc">Transferí el importe exacto y mandanos el comprobante por WhatsApp.</p>
        </div>

        ${lo.mailCopy ? `
        <div class="order-mail-copy">
          <button type="button" class="cart-btn cart-btn--secondary" id="sendMailCopyBtn">AVISARME POR MAIL</button>
          <p class="order-mail-copy__hint">Se abre una pestaña para confirmar que no sos un robot y te llega un aviso a <strong>${escapeHTML(d.email)}</strong> (mirá también en spam). Cuando confirmemos tu compra, te mandamos el detalle por el mismo mail.</p>
        </div>
        ` : ''}

        <div class="payment-total-callout">
          <span class="callout-label">IMPORTE A TRANSFERIR</span>
          <strong class="callout-val">${escapeHTML(totFormatted)}</strong>
        </div>

        ${isUSD ? `
          <div class="bank-spec">
            <span class="section-label">DATOS BANCARIOS — DÓLARES</span>
            <div class="spec-row">
              <span class="spec-label">TITULAR</span>
              <span class="spec-val">${escapeHTML(BANK.holder)}</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">ALIAS</span>
              <span class="spec-val spec-val--copy" id="valAliasUSD">${escapeHTML(BANK.usd.alias)}</span>
              <button type="button" class="spec-copy-btn" data-copy="valAliasUSD">COPIAR</button>
            </div>
            <div class="spec-row">
              <span class="spec-label">CBU</span>
              <span class="spec-val spec-val--copy" id="valCbuUSD">${escapeHTML(BANK.usd.cbu)}</span>
              <button type="button" class="spec-copy-btn" data-copy="valCbuUSD">COPIAR</button>
            </div>
          </div>
        ` : ''}

        ${isPesos ? `
          <div class="bank-spec">
            <span class="section-label">DATOS BANCARIOS — PESOS</span>
            <div class="spec-row">
              <span class="spec-label">TITULAR</span>
              <span class="spec-val">${escapeHTML(BANK.holder)}</span>
            </div>
            <div class="spec-row">
              <span class="spec-label">ALIAS</span>
              <span class="spec-val spec-val--copy" id="valAliasARS">${escapeHTML(BANK.ars.alias)}</span>
              <button type="button" class="spec-copy-btn" data-copy="valAliasARS">COPIAR</button>
            </div>
            <div class="spec-row">
              <span class="spec-label">CVU</span>
              <span class="spec-val spec-val--copy" id="valCvuARS">${escapeHTML(BANK.ars.cvu)}</span>
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
              <span class="spec-val spec-val--copy" id="valMpCode">${escapeHTML(BANK.mp.code)}</span>
              <button type="button" class="spec-copy-btn" data-copy="valMpCode">COPIAR</button>
            </div>
            <div class="spec-row">
              <span class="spec-label">MONTO</span>
              <span class="spec-val">${escapeHTML(totFormatted)}</span>
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
            ${WPP_ICON}
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
    const mailBtn = drawer.querySelector('#sendMailCopyBtn');
    if (mailBtn) mailBtn.addEventListener('click', () => sendCustomerCopy(lo.mailCopy));

    drawer.querySelectorAll('.spec-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetId = btn.dataset.copy;
        const targetEl = drawer.querySelector('#' + targetId);
        if (!targetEl) return;
        const text = targetEl.textContent.trim();
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
          btn.textContent = 'COPIÁ A MANO';
          setTimeout(() => { btn.textContent = 'COPIAR'; }, 2200);
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

  function focusableIn(root) {
    return Array.from(root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null || el === document.activeElement);
  }

  document.addEventListener('keydown', (e) => {
    const drawer = document.getElementById('cartDrawer');
    if (!drawer || !drawer.classList.contains('is-open')) return;

    if (e.key === 'Escape') {
      closeDrawer();
      return;
    }

    // Trampa de foco: Tab no sale del drawer mientras está abierto.
    if (e.key === 'Tab') {
      const els = focusableIn(drawer);
      if (!els.length) {
        e.preventDefault();
        drawer.focus();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (!drawer.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === drawer)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // ─── Sincronización entre pestañas ─────────────────────────────────────────
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      loadCartFromStorage();
      emitCartUpdated();
      softRender();
    }
    if (e.key === LAST_ORDER_KEY || e.key === null) {
      loadLastOrder();
      softRender();
    }
    if (e.key === RATE_CACHE_KEY) {
      const cached = lsGetJSON(RATE_CACHE_KEY);
      if (cached && Number.isFinite(cached.rate) && cached.rate > 0 && cached.rate !== blueRate) {
        blueRate = cached.rate;
        rateSource = rateSource === 'live' ? 'live' : 'cache';
        softRender();
      }
    }
  });

  // Volver con "atrás" (bfcache) o desde otra pestaña: releer el carrito.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      loadCartFromStorage();
      emitCartUpdated();
      softRender();
    }
  });

  window.addEventListener('popper:currency-changed', () => {
    syncCurrencyBtn();
    softRender();
  });

  // ─── Inicialización ────────────────────────────────────────────────────────
  function init() {
    loadCartFromStorage();
    loadLastOrder();
    loadCachedRate();
    ensureElements();
    updateBadge();
    fetchBlueRate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ─── API pública ───────────────────────────────────────────────────────────
  window.PopperCart = {
    has,
    add,
    remove,
    setQty,
    clear,
    toggle,
    open: openDrawer,
    close: closeDrawer,
    validateSoldItems,
    getItems: () => cartItems.map(it => ({ ...it })),
    getBlueRate: () => blueRate,
    isNonNumericId,
    hasNonNumericItems,
  };

})();
