/*
╔══════════════════════════════════════════════════════════════╗
║                         APP.JS                              ║
║          ОСНОВНОЙ КЛИЕНТСКИЙ СКРИПТ САЙТА                  ║
╚══════════════════════════════════════════════════════════════╝
*/

"use strict";

/* ============================================================
   1. КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ
   ============================================================ */

/* ============================================================
   1. КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ
   ============================================================ */

const APP_CONFIG = {
  storageKey: "sushi_shop_cart_v1",
  menuApiUrl: "/api/menu",
  promoApiUrl: "/api/promo/validate",
  checkoutApiUrl: "/api/checkout",
  yandexMaps: {
    enabled: true,
    apiKey: "3ac6cb66-4b7f-440d-b36e-8992f63f0831",
    latitude: 53.307724,
    longitude: 83.560264,
    zoom: 16,
    shopName: "Калифорния",
    shopAddress: "Барнаул, Мозаичная 44б"
  },
  currency: "RUB",
  locale: "ru-RU"
};

/* ============================================================
   2. ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
   ============================================================ */

const appState = {
  cart: [],
  promo: null,
  fulfillmentType: "delivery",
  mapLoaded: false,
  map: null,
  toastTimer: null
};

/*
 * Меню сайта.
 *
 * Раньше эти данные приходили из отдельного статического файла
 * menu-data.js, который нужно было подключать <script> ДО app.js
 * и вручную обновлять при каждом изменении ассортимента.
 *
 * Теперь меню приходит с сервера (GET /api/menu, PostgreSQL) —
 * см. loadMenuFromServer() в разделе 6. Если этот файл всё ещё
 * подключён в HTML — его нужно убрать, он больше не нужен
 * и его содержимое просто не будет использовано.
 *
 * До первой успешной загрузки — null, чтобы остальной код
 * (validateMenuData) видел явно "меню ещё не готово",
 * а не путал это с "меню пустое".
 */
let menuData = {
  categories: null,
  products: null
};

/* ============================================================
   3. DOM ELEMENTS
   ============================================================ */

const DOM = {};

function cacheDomElements() {
  DOM.categoryNav = document.getElementById("categoryNav");
  DOM.menuCategories = document.getElementById("menuCategories");
  DOM.openCartButton = document.getElementById("openCartButton");
  DOM.floatingCartButton = document.getElementById("floatingCartButton");
  DOM.closeCartButton = document.getElementById("closeCartButton");
  DOM.cartModal = document.getElementById("cartModal");
  DOM.checkoutModal = document.getElementById("checkoutModal");
  DOM.modalOverlay = document.getElementById("modalOverlay");
  DOM.cartItems = document.getElementById("cartItems");
  DOM.emptyCart = document.getElementById("emptyCart");
  DOM.cartSummary = document.getElementById("cartSummary");
  DOM.headerCartCount = document.getElementById("headerCartCount");
  DOM.floatingCartCount = document.getElementById("floatingCartCount");
  DOM.floatingCartTotal = document.getElementById("floatingCartTotal");
  DOM.cartSubtotal = document.getElementById("cartSubtotal");
  DOM.cartDelivery = document.getElementById("cartDelivery");
  DOM.cartTotal = document.getElementById("cartTotal");
  DOM.checkoutTotal = document.getElementById("checkoutTotal");
  DOM.checkoutButton = document.getElementById("checkoutButton");
  DOM.closeCheckoutButton = document.getElementById("closeCheckoutButton");
  DOM.checkoutForm = document.getElementById("checkoutForm");
  DOM.promoCode = document.getElementById("promoCode");
  DOM.applyPromoButton = document.getElementById("applyPromoButton");
  DOM.promoMessage = document.getElementById("promoMessage");
  DOM.toast = document.getElementById("toast");
  DOM.toastMessage = document.getElementById("toastMessage");
  DOM.deliveryMap = document.getElementById("deliveryMap");
}

/* ============================================================
   4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ============================================================ */

function formatPrice(price) {
  const numericPrice = Number(price) || 0;
  return new Intl.NumberFormat(APP_CONFIG.locale, {
    style: "currency",
    currency: APP_CONFIG.currency,
    maximumFractionDigits: 0
  }).format(numericPrice);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizePhone(phone) {
  return String(phone || "").trim().replace(/[^\d+]/g, "");
}

function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function getProductById(productId) {
  if (typeof menuData === "undefined" || !Array.isArray(menuData.products)) return null;
  return menuData.products.find(product => product.id === productId) || null;
}

/* ============================================================
   5. TOAST
   ============================================================ */

function showToast(message) {
  if (!DOM.toast || !DOM.toastMessage) return;
  DOM.toastMessage.textContent = message;
  DOM.toast.classList.add("toast-visible");

  clearTimeout(appState.toastTimer);
  appState.toastTimer = setTimeout(() => {
    DOM.toast.classList.remove("toast-visible");
  }, 2800);
}

/* ============================================================
   6. ЗАГРУЗКА МЕНЮ С СЕРВЕРА
   ============================================================ */

/*
 * Тянет меню с GET /api/menu (PostgreSQL на бэкенде) и приводит
 * его к той же форме, в которой раньше жил статический menuData
 * из menu-data.js — чтобы весь остальной код файла (renderMenu,
 * getProductById, корзина и т.д.) остался БЕЗ ИЗМЕНЕНИЙ.
 *
 * Важный нюанс: id категорий и товаров в БД — числа (SERIAL),
 * а весь код ниже сравнивает id со строками из data-атрибутов
 * (button.dataset.productId и т.п., они всегда строки). Поэтому
 * здесь id сразу приводятся к строке — один раз, в одном месте,
 * а не в десятке сравнений по всему файлу.
 */
async function loadMenuFromServer() {
  try {
    const response = await fetch(APP_CONFIG.menuApiUrl, {
      headers: { "Accept": "application/json" }
    });

    let data = null;
    try { data = await response.json(); } catch { data = null; }

    if (!response.ok || !data || data.success !== true || !Array.isArray(data.categories)) {
      throw new Error(data?.message || "Сервер вернул некорректное меню.");
    }

    const categories = data.categories.map(category => ({
      id: String(category.id),
      name: category.name,
      slug: category.slug
      // description в текущей схеме БД нет — секция сама
      // корректно обходится без неё (см. renderCategorySection).
    }));

    const products = data.categories.flatMap(category =>
      (category.products || []).map(product => ({
        id: String(product.id),
        category: String(category.id),
        name: product.name,
        description: product.description,
        price: product.price,
        image: product.imageUrl,
        available: product.isActive !== false
        // badge и weight в текущей схеме БД нет — карточка
        // товара просто не покажет эти необязательные элементы.
      }))
    );

    menuData = { categories, products };
  } catch (error) {
    console.error("Не удалось загрузить меню с сервера:", error);
    menuData = { categories: null, products: null };
  }
}

/* ============================================================
   7. РЕНДЕРИНГ МЕНЮ
   ============================================================ */

function renderMenu() {
  if (!DOM.categoryNav || !DOM.menuCategories) {
    console.error("Не найдены контейнеры меню.");
    return;
  }

  DOM.categoryNav.innerHTML = "";
  DOM.menuCategories.innerHTML = "";

  if (typeof menuData === "undefined" || !Array.isArray(menuData.categories)) {
    DOM.menuCategories.innerHTML = `<div class="no-products">Не удалось загрузить меню.</div>`;
    return;
  }

  menuData.categories.forEach((category, index) => {
    renderCategoryNavigationItem(category, index);
    renderCategorySection(category, index);
  });

  initCategoryObserver();
}

function renderCategoryNavigationItem(category, index) {
  const button = document.createElement("a");
  button.className = "category-button";
  button.href = `#category-${encodeURIComponent(category.id)}`;
  button.dataset.categoryId = category.id;
  button.textContent = category.name;

  if (index === 0) button.classList.add("active");
  DOM.categoryNav.appendChild(button);
}

function renderCategorySection(category, index) {
  const section = document.createElement("section");
  section.className = "category-section";
  section.id = `category-${category.id}`;
  section.dataset.categoryId = category.id;

  const header = document.createElement("div");
  header.className = "category-header";
  header.innerHTML = `
    <div>
      <h2>${escapeHtml(category.name)}</h2>
      ${category.description ? `<p>${escapeHtml(category.description)}</p>` : ""}
    </div>
  `;
  section.appendChild(header);

  const productsGrid = document.createElement("div");
  productsGrid.className = "products-grid";

  const products = menuData.products.filter(product => product.category === category.id);

  if (products.length === 0) {
    productsGrid.innerHTML = `<div class="no-products">В этой категории пока нет товаров.</div>`;
  } else {
    products.forEach(product => {
      productsGrid.appendChild(createProductCard(product));
    });
  }

  section.appendChild(productsGrid);
  DOM.menuCategories.appendChild(section);
}

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";
  card.dataset.productId = product.id;

  if (!product.available) card.classList.add("product-unavailable");

  const imageHtml = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="product-image-placeholder" style="display:none;" aria-hidden="true">🍣</div>`
    : `<div class="product-image-placeholder" aria-hidden="true">🍣</div>`;

  card.innerHTML = `
    <div class="product-image">
      ${imageHtml}
      ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ""}
      ${!product.available ? `<span class="unavailable-label">Нет в наличии</span>` : ""}
    </div>
    <div class="product-content">
      <h3 class="product-title">${escapeHtml(product.name)}</h3>
      <p class="product-description">${escapeHtml(product.description || product.composition || "")}</p>
      ${product.weight ? `<div class="product-weight">${escapeHtml(product.weight)}</div>` : ""}
      <div class="product-footer">
        <strong class="product-price">${formatPrice(product.price)}</strong>
        <button type="button" class="add-to-cart-button" data-product-id="${escapeHtml(product.id)}" ${!product.available ? "disabled" : ""}>
          ${product.available ? "В корзину" : "Недоступно"}
        </button>
      </div>
    </div>
  `;
  return card;
}

function handleMenuClick(event) {
  const button = event.target.closest(".add-to-cart-button");
  if (!button) return;
  addToCart(button.dataset.productId);
}

/* ============================================================
   8. НАВИГАЦИЯ ПО КАТЕГОРИЯМ
   ============================================================ */

function handleCategoryNavigation(event) {
  const button = event.target.closest(".category-button");
  if (!button) return;
  event.preventDefault();
  scrollToCategory(button.dataset.categoryId);
}

function scrollToCategory(categoryId) {
  const section = document.querySelector(`.category-section[data-category-id="${CSS.escape(categoryId)}"]`);
  if (!section) return;

  section.scrollIntoView({ behavior: "smooth", block: "start" });
  setActiveCategory(categoryId);

  if (history.replaceState) {
    history.replaceState(null, "", `#category-${encodeURIComponent(categoryId)}`);
  }
}

function setActiveCategory(categoryId) {
  document.querySelectorAll(".category-button").forEach(button => {
    button.classList.toggle("active", button.dataset.categoryId === categoryId);
  });
}

function initCategoryObserver() {
  const sections = document.querySelectorAll(".category-section");
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    entries => {
      const visibleSections = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visibleSections.length) {
        setActiveCategory(visibleSections[0].target.dataset.categoryId);
      }
    },
    { root: null, rootMargin: "-140px 0px -55% 0px", threshold: [0.1, 0.25, 0.5] }
  );

  sections.forEach(section => observer.observe(section));
}

/* ============================================================
   9. LOCAL STORAGE
   ============================================================ */

function saveCartToStorage() {
  try {
    localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(appState.cart));
  } catch (error) {
    console.error("Не удалось сохранить корзину:", error);
  }
}

function loadCartFromStorage() {
  try {
    const storedCart = localStorage.getItem(APP_CONFIG.storageKey);
    if (!storedCart) { appState.cart = []; return; }
    const parsed = JSON.parse(storedCart);
    if (!Array.isArray(parsed)) { appState.cart = []; return; }

    appState.cart = parsed
      .filter(item => item && typeof item.id === "string" && Number.isFinite(Number(item.quantity)))
      .map(item => ({ id: item.id, quantity: Math.max(1, Math.floor(Number(item.quantity))) }))
      .filter(item => getProductById(item.id) !== null);

    saveCartToStorage();
  } catch (error) {
    console.error("Не удалось загрузить корзину:", error);
    appState.cart = [];
  }
}

/* ============================================================
   10. КОРЗИНА
   ============================================================ */

function addToCart(productId) {
  const product = getProductById(productId);
  if (!product) { showToast("Товар не найден."); return; }
  if (!product.available) { showToast("Этот товар сейчас недоступен."); return; }

  const existingItem = appState.cart.find(item => item.id === productId);
  if (existingItem) existingItem.quantity += 1;
  else appState.cart.push({ id: productId, quantity: 1 });

  saveCartToStorage();
  updateCartUI();
  showToast(`${product.name} добавлен в корзину`);
}

function removeFromCart(productId) {
  const product = getProductById(productId);
  appState.cart = appState.cart.filter(item => item.id !== productId);
  saveCartToStorage();
  updateCartUI();
  if (product) showToast(`${product.name} удалён из корзины`);
}

function changeCartQuantity(productId, delta) {
  const item = appState.cart.find(cartItem => cartItem.id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) { removeFromCart(productId); return; }
  saveCartToStorage();
  updateCartUI();
}

function clearCart() {
  appState.cart = [];
  appState.promo = null;
  if (DOM.promoCode) DOM.promoCode.value = "";
  if (DOM.promoMessage) { DOM.promoMessage.textContent = ""; DOM.promoMessage.className = "promo-message"; }
  saveCartToStorage();
  updateCartUI();
}

function getCartProducts() {
  return appState.cart.map(cartItem => {
    const product = getProductById(cartItem.id);
    return product ? { ...product, quantity: cartItem.quantity } : null;
  }).filter(Boolean);
}

function getCartQuantity() {
  return getCartProducts().reduce((total, p) => total + p.quantity, 0);
}

function getCartSubtotal() {
  return getCartProducts().reduce((total, p) => total + (Number(p.price) * p.quantity), 0);
}

function getPromoDiscount() {
  if (!appState.promo) return 0;
  const discount = Number(appState.promo.discount);
  if (!Number.isFinite(discount) || discount < 0) return 0;
  return Math.min(discount, getCartSubtotal());
}

function getCartTotal() {
  return Math.max(0, getCartSubtotal() - getPromoDiscount());
}

/* ============================================================
   11. ОТРИСОВКА КОРЗИНЫ
   ============================================================ */

function updateCartUI() {
  renderCartItems();
  updateCartCounters();
  updateCartSummary();
}

function updateCartCounters() {
  const quantity = getCartQuantity();
  if (DOM.headerCartCount) DOM.headerCartCount.textContent = quantity;
  if (DOM.floatingCartCount) DOM.floatingCartCount.textContent = quantity;
  if (DOM.floatingCartTotal) DOM.floatingCartTotal.textContent = formatPrice(getCartTotal());
}

function renderCartItems() {
  if (!DOM.cartItems) return;
  const products = getCartProducts();
  DOM.cartItems.innerHTML = "";
  products.forEach(product => DOM.cartItems.appendChild(createCartItem(product)));

  if (DOM.emptyCart) DOM.emptyCart.hidden = products.length > 0;
  if (DOM.cartSummary) DOM.cartSummary.hidden = products.length === 0;
}

function createCartItem(product) {
  const item = document.createElement("div");
  item.className = "cart-item";
  const imageHtml = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none';">`
    : `<div class="cart-item-placeholder" aria-hidden="true">🍣</div>`;

  item.innerHTML = `
    <div class="cart-item-image">${imageHtml}</div>
    <div class="cart-item-main">
      <h3>${escapeHtml(product.name)}</h3>
      <strong>${formatPrice(product.price)}</strong>
      <div class="cart-item-controls">
        <button type="button" class="quantity-button" data-cart-action="decrease" data-product-id="${escapeHtml(product.id)}" aria-label="Уменьшить quantity">−</button>
        <span>${product.quantity}</span>
        <button type="button" class="quantity-button" data-cart-action="increase" data-product-id="${escapeHtml(product.id)}" aria-label="Увеличить quantity">+</button>
      </div>
    </div>
    <button type="button" class="remove-cart-item" data-cart-action="remove" data-product-id="${escapeHtml(product.id)}" aria-label="Удалить ${escapeHtml(product.name)}">×</button>
  `;
  return item;
}

function handleCartClick(event) {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;
  const action = button.dataset.cartAction;
  const productId = button.dataset.productId;

  if (action === "increase") changeCartQuantity(productId, 1);
  if (action === "decrease") changeCartQuantity(productId, -1);
  if (action === "remove") removeFromCart(productId);
}

function updateCartSummary() {
  const subtotal = getCartSubtotal();
  const discount = getPromoDiscount();
  const total = getCartTotal();

  if (DOM.cartSubtotal) DOM.cartSubtotal.textContent = formatPrice(subtotal);
  if (DOM.cartDelivery) {
    DOM.cartDelivery.textContent = appState.fulfillmentType === "pickup" ? "Самовывоз" : "Рассчитаем после оформления";
  }
  if (DOM.cartTotal) DOM.cartTotal.textContent = formatPrice(total);
  if (DOM.checkoutTotal) DOM.checkoutTotal.textContent = formatPrice(total);

  renderDiscountRow(discount);
}

function renderDiscountRow(discount) {
  if (!DOM.cartSummary) return;
  let discountRow = DOM.cartSummary.querySelector(".promo-discount-row");

  if (discount <= 0) {
    if (discountRow) discountRow.remove();
    return;
  }

  if (!discountRow) {
    discountRow = document.createElement("div");
    discountRow.className = "summary-row promo-discount-row";
    const totalRow = DOM.cartSummary.querySelector(".summary-total");
    if (totalRow) DOM.cartSummary.insertBefore(discountRow, totalRow);
    else DOM.cartSummary.appendChild(discountRow);
  }

  discountRow.innerHTML = `
    <span>Скидка ${appState.promo?.code ? `(${escapeHtml(appState.promo.code)})` : ""}</span>
    <strong>−${formatPrice(discount)}</strong>
  `;
}

/* ============================================================
   12. МОДАЛЬНЫЕ ОКНА
   ============================================================ */

function openCart() {
  if (!DOM.cartModal) return;
  DOM.cartModal.classList.add("modal-visible");
  if (DOM.modalOverlay) DOM.modalOverlay.classList.add("overlay-visible");
  DOM.cartModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  updateCartUI();
}

function closeCart() {
  if (!DOM.cartModal) return;
  DOM.cartModal.classList.remove("modal-visible");
  DOM.cartModal.setAttribute("aria-hidden", "true");
  closeOverlayIfNecessary();
}

function openCheckout() {
  if (getCartProducts().length === 0) {
    showToast("Сначала добавьте товары в корзину.");
    return;
  }
  closeCart();
  if (!DOM.checkoutModal) return;

  DOM.checkoutModal.classList.add("modal-visible");
  if (DOM.modalOverlay) DOM.modalOverlay.classList.add("overlay-visible");
  DOM.checkoutModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  updateCheckoutFormState();
  updateCartSummary();
}

function closeCheckout() {
  if (!DOM.checkoutModal) return;
  DOM.checkoutModal.classList.remove("modal-visible");
  DOM.checkoutModal.setAttribute("aria-hidden", "true");
  closeOverlayIfNecessary();
}

function closeOverlayIfNecessary() {
  const cartVisible = DOM.cartModal?.classList.contains("modal-visible");
  const checkoutVisible = DOM.checkoutModal?.classList.contains("modal-visible");

  if (!cartVisible && !checkoutVisible) {
    DOM.modalOverlay?.classList.remove("overlay-visible");
    document.body.classList.remove("modal-open");
  }
}

function closeAllModals() {
  DOM.cartModal?.classList.remove("modal-visible");
  DOM.checkoutModal?.classList.remove("modal-visible");
  DOM.modalOverlay?.classList.remove("overlay-visible");
  DOM.cartModal?.setAttribute("aria-hidden", "true");
  DOM.checkoutModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

/* ============================================================
   13. СПОСОБ ПОЛУЧЕНИЯ
   ============================================================ */

function ensureFulfillmentControls() {
  if (!DOM.checkoutForm || DOM.checkoutForm.querySelector(".fulfillment-type-group")) return;
  const addressGroup = document.getElementById("customerAddress")?.closest(".form-group");
  if (!addressGroup) return;

  const wrapper = document.createElement("fieldset");
  wrapper.className = "payment-fieldset fulfillment-type-group";
  wrapper.innerHTML = `
    <legend>Способ получения</legend>
    <label class="radio-card">
      <input type="radio" name="fulfillmentType" value="delivery" checked>
      <span class="radio-card-content">
        <strong>🚗 Доставка</strong>
        <small>Курьер привезёт заказ</small>
      </span>
    </label>
    <label class="radio-card">
      <input type="radio" name="fulfillmentType" value="pickup">
      <span class="radio-card-content">
        <strong>🏪 Самовывоз</strong>
        <small>Забрать заказ из магазина</small>
      </span>
    </label>
  `;

  addressGroup.parentNode.insertBefore(wrapper, addressGroup);
  wrapper.querySelectorAll('input[name="fulfillmentType"]').forEach(radio => {
    radio.addEventListener("change", handleFulfillmentChange);
  });
}

function handleFulfillmentChange(event) {
  appState.fulfillmentType = event.target.value;
  updateCheckoutFormState();
  updateCartSummary();
}

function getFulfillmentType() {
  const selected = DOM.checkoutForm?.querySelector('input[name="fulfillmentType"]:checked');
  return selected?.value || appState.fulfillmentType || "delivery";
}

function updateCheckoutFormState() {
  if (!DOM.checkoutForm) return;

  const addressInput = document.getElementById("customerAddress");
  const apartmentInput = document.getElementById("customerApartment");
  const entranceInput = document.getElementById("customerEntrance");
  const addressGroup = addressInput?.closest(".form-group");
  const apartmentGroup = apartmentInput?.closest(".form-group");
  const entranceGroup = entranceInput?.closest(".form-group");

  const isDelivery = getFulfillmentType() === "delivery";
  const paymentInput = DOM.checkoutForm.querySelector('input[name="payment"]:checked');
  const isCash = paymentInput?.value === "cash";

  const changeFromGroup = document.getElementById("changeFromGroup");
  const changeFromInput = document.getElementById("changeFrom");

  const needChangeFrom = isDelivery && isCash;

  if (changeFromGroup) {
    changeFromGroup.style.display = needChangeFrom ? "" : "none";
  }

  if (changeFromInput) {
    changeFromInput.disabled = !needChangeFrom;
    changeFromInput.required = false;

    if (!needChangeFrom) {
      changeFromInput.value = "";
    }
  }
  if (addressInput) { addressInput.disabled = !isDelivery; addressInput.required = isDelivery; }
  if (apartmentInput) apartmentInput.disabled = !isDelivery;
  if (entranceInput) entranceInput.disabled = !isDelivery;

  if (addressGroup) addressGroup.style.display = isDelivery ? "" : "none";
  if (apartmentGroup && entranceGroup) {
    const row = apartmentGroup.closest(".form-row");
    if (row) row.style.display = isDelivery ? "" : "none";
  }

  appState.fulfillmentType = getFulfillmentType();
}

/* ============================================================
   14. ПРОМОКОДЫ
   ============================================================ */

function clearPromo() {
  appState.promo = null;
  if (DOM.promoMessage) { DOM.promoMessage.textContent = ""; DOM.promoMessage.className = "promo-message"; }
  updateCartSummary();
}

async function validatePromoCode() {
  if (!DOM.promoCode) return;
  const code = DOM.promoCode.value.trim().toUpperCase();

  if (!code) { clearPromo(); showPromoMessage("Введите промокод.", "error"); return; }
  const cartProducts = getCartProducts();
  if (cartProducts.length === 0) { showPromoMessage("Корзина пуста.", "error"); return; }

  setPromoButtonLoading(true);

  try {
    /*
     * Раньше сюда отправлялся готовый subtotal числом — тот же
     * риск подмены суммы, что и в checkout, только в миниатюре.
     * Теперь отправляем id+quantity, а сумму для проверки скидки
     * сервер сам считает по честным ценам из БД (см. server.js).
     */
    const response = await fetch(APP_CONFIG.promoApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        code,
        items: cartProducts.map(product => ({ id: product.id, quantity: product.quantity }))
      })
    });

    let data = null;
    try { data = await response.json(); } catch { data = null; }

    if (!response.ok || !data || data.success !== true) {
      clearPromo();
      showPromoMessage(data?.message || "Промокод недействителен.", "error");
      return;
    }

    const serverPromo = data.promo || {};
    const discount = Number(serverPromo.discount);
    const subtotal = getCartSubtotal();

    if (!Number.isFinite(discount) || discount < 0) {
      clearPromo();
      showPromoMessage("Сервер вернул некорректную скидку.", "error");
      return;
    }

    appState.promo = {
      code: serverPromo.code || code,
      type: serverPromo.type || "percent",
      value: Number(serverPromo.value) || 0,
      discount: Math.min(discount, subtotal)
    };

    showPromoMessage(data.message || `Промокод ${code} применён.`, "success");
    updateCartUI();

  } catch (error) {
    console.error("Ошибка проверки промокода:", error);
    clearPromo();
    showPromoMessage("Не удалось проверить промокод. Попробуйте позже.", "error");
  } finally {
    setPromoButtonLoading(false);
  }
}

function showPromoMessage(message, type) {
  if (!DOM.promoMessage) return;
  DOM.promoMessage.textContent = message;
  DOM.promoMessage.className = `promo-message ${type}`;
}

function setPromoButtonLoading(loading) {
  if (!DOM.applyPromoButton) return;
  DOM.applyPromoButton.disabled = loading;
  DOM.applyPromoButton.textContent = loading ? "Проверка..." : "Применить";
}

/* ============================================================
   15. ВАЛИДАЦИЯ ФОРМЫ
   ============================================================ */

function clearFormErrors() {
  DOM.checkoutForm?.querySelectorAll(".field-error").forEach(el => el.remove());
  DOM.checkoutForm?.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
}

function showFieldError(input, message) {
  if (!input) return;
  input.classList.add("input-error");
  const error = document.createElement("small");
  error.className = "field-error";
  error.textContent = message;
  input.insertAdjacentElement("afterend", error);
}

function ensureValidationStyles() {
  if (document.getElementById("app-validation-styles")) return;
  const style = document.createElement("style");
  style.id = "app-validation-styles";
  style.textContent = `
    .input-error { border-color: #D93025 !important; box-shadow: 0 0 0 3px rgba(217, 48, 37, 0.08) !important; }
    .field-error { display: block; margin-top: 5px; color: #D93025; font-size: 11px; line-height: 1.3; }
  `;
  document.head.appendChild(style);
}

function validateCheckoutForm() {
  clearFormErrors();
  if (!DOM.checkoutForm) return { valid: false, errors: ["Форма оформления не найдена."] };

  const errors = [];
  const nameInput = document.getElementById("customerName");
  const phoneInput = document.getElementById("customerPhone");
  const addressInput = document.getElementById("customerAddress");
  const fulfillmentType = getFulfillmentType();

  if ((nameInput?.value.trim() || "").length < 2) {
    errors.push("Укажите ваше имя.");
    showFieldError(nameInput, "Введите имя.");
  }

  if (!isValidPhone(phoneInput?.value.trim() || "")) {
    errors.push("Укажите корректный номер телефона.");
    showFieldError(phoneInput, "Введите корректный номер телефона.");
  }

  if (fulfillmentType === "delivery" && (addressInput?.value.trim() || "").length < 5) {
    errors.push("Укажите адрес доставки.");
    showFieldError(addressInput, "Укажите улицу, дом и необходимые данные.");
  }
  const paymentInput = DOM.checkoutForm?.querySelector('input[name="payment"]:checked');
  const changeFromInput = document.getElementById("changeFrom");

  const isCashDelivery =
    fulfillmentType === "delivery" &&
    paymentInput?.value === "cash";

  if (isCashDelivery && changeFromInput?.value) {
    const changeFrom = Number(changeFromInput.value);
    const orderTotal = getCartTotal();

    if (!Number.isFinite(changeFrom) || changeFrom <= 0) {
      errors.push("Укажите корректную сумму для сдачи.");
      showFieldError(changeFromInput, "Введите сумму больше нуля.");
    } else if (changeFrom < orderTotal) {
      errors.push("Сумма для сдачи не может быть меньше суммы заказа.");
      showFieldError(
        changeFromInput,
        `Укажите сумму не меньше ${formatPrice(orderTotal)}.`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ============================================================
   16. ФОРМИРОВАНИЕ ЗАКАЗА
   ============================================================ */

function buildCheckoutPayload() {
  const nameInput = document.getElementById("customerName");
  const phoneInput = document.getElementById("customerPhone");
  const addressInput = document.getElementById("customerAddress");
  const apartmentInput = document.getElementById("customerApartment");
  const entranceInput = document.getElementById("customerEntrance");
  const commentInput = document.getElementById("customerComment");
  const paymentInput = DOM.checkoutForm?.querySelector('input[name="payment"]:checked');
  const fulfillmentType = getFulfillmentType();

  /*
   * ВАЖНО: раньше сюда клали name/price/total по каждому товару
   * и отдельный объект pricing с итоговой суммой. Сервер теперь
   * их даже не читает — цену и состав заказа он полностью
   * пересчитывает сам по id из PostgreSQL (см. /api/checkout
   * в server.js), поэтому здесь достаточно id и количества.
   * Отправлять цену с браузера больше нет смысла: даже если
   * её подделать, на итоговую сумму заказа это не повлияет.
   */
  return {
    customer: {
      name: nameInput?.value.trim() || "",
      phone: normalizePhone(phoneInput?.value)
    },
    fulfillment: {
      type: fulfillmentType,
      address: fulfillmentType === "delivery" ? addressInput?.value.trim() || "" : "",
      apartment: fulfillmentType === "delivery" ? apartmentInput?.value.trim() || "" : "",
      entrance: fulfillmentType === "delivery" ? entranceInput?.value.trim() || "" : "",
      comment: commentInput?.value.trim() || ""
    },
    payment: {
      method: paymentInput?.value || "cash",
      changeFrom: (
        fulfillmentType === "delivery" &&
        paymentInput?.value === "cash"
      )
        ? Number(document.getElementById("changeFrom")?.value || 0)
        : null
    },
    items: getCartProducts().map(product => ({
      id: product.id,
      quantity: product.quantity
    })),
    promo: appState.promo ? { code: appState.promo.code } : null
  };
}

/* ============================================================
   17. ОТПРАВКА ЗАКАЗА
   ============================================================ */

function setCheckoutButtonLoading(loading) {
  const button = DOM.checkoutForm?.querySelector(".submit-order-button");
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Отправляем заказ..." : "Отправить заказ";
}

async function submitCheckout(event) {
  event.preventDefault();
  const validation = validateCheckoutForm();

  if (!validation.valid) {
    showToast(validation.errors[0] || "Проверьте заполнение формы.");
    DOM.checkoutForm?.querySelector(".input-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (!getCartProducts().length) {
    showToast("Корзина пуста.");
    closeCheckout();
    return;
  }

  setCheckoutButtonLoading(true);

  try {
    const response = await fetch(APP_CONFIG.checkoutApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(buildCheckoutPayload())
    });

    let data = null;
    try { data = await response.json(); } catch { data = null; }

    if (!response.ok || !data || data.success !== true) {
      throw new Error(data?.message || "Не удалось оформить заказ.");
    }

    showToast(data.message || "Заказ успешно оформлен!");
    clearCart();
    DOM.checkoutForm.reset();

    const deliveryRadio = DOM.checkoutForm.querySelector('input[name="fulfillmentType"][value="delivery"]');
    if (deliveryRadio) deliveryRadio.checked = true;
    appState.fulfillmentType = "delivery";
    updateCheckoutFormState();
    closeCheckout();

  } catch (error) {
    console.error("Ошибка отправки заказа:", error);
    showToast(error.message || "Не удалось отправить заказ. Попробуйте ещё раз.");
  } finally {
    setCheckoutButtonLoading(false);
  }
}

/* ============================================================
   18. ЯНДЕКС.КАРТЫ
   ============================================================ */

function renderMapPlaceholder(message) {
  if (!DOM.deliveryMap) return;
  const existingPlaceholder = DOM.deliveryMap.querySelector(".map-placeholder");

  if (existingPlaceholder) {
    let messageElement = existingPlaceholder.querySelector(".map-api-message");
    if (!messageElement) {
      messageElement = document.createElement("div");
      messageElement.className = "map-api-message";
      messageElement.style.cssText = `
        position: absolute; left: 50%; top: 20px; z-index: 10;
        transform: translateX(-50%); padding: 8px 12px; border-radius: 999px;
        background: rgba(255,255,255,.94); color: #555; font-size: 11px;
        font-weight: 700; white-space: nowrap; box-shadow: 0 4px 20px rgba(0,0,0,.08);
      `;
      existingPlaceholder.appendChild(messageElement);
    }
    messageElement.textContent = message;
    return;
  }

  DOM.deliveryMap.innerHTML = `
    <div class="map-placeholder" style="min-height:300px; display:flex; align-items:center; justify-content:center; padding:30px; text-align:center; background:#f3eee8; color:#555;">
      ${escapeHtml(message)}
    </div>
  `;
}

function loadYandexMapsScript() {
  return new Promise((resolve, reject) => {
    if (window.ymaps) { resolve(window.ymaps); return; }
    if (!APP_CONFIG.yandexMaps.apiKey) { reject(new Error("API key Яндекс.Карт не указан.")); return; }

    const existingScript = document.querySelector('script[data-yandex-maps="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => window.ymaps ? resolve(window.ymaps) : reject(new Error("Ошибка загрузки.")));
      existingScript.addEventListener("error", () => reject(new Error("Ошибка сетевого запроса.")));
      return;
    }

    const script = document.createElement("script");
    script.dataset.yandexMaps = "true";
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(APP_CONFIG.yandexMaps.apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = () => window.ymaps ? resolve(window.ymaps) : reject(new Error("y-maps отсутствует."));
    script.onerror = () => reject(new Error("Ошибка сети."));
    document.head.appendChild(script);
  });
}

async function initYandexMap() {
  if (!APP_CONFIG.yandexMaps.enabled || !DOM.deliveryMap) return;
  if (!APP_CONFIG.yandexMaps.apiKey) {
    renderMapPlaceholder("Укажите API key Яндекс.Карт в app.js");
    return;
  }

  try {
    const ymaps = await loadYandexMapsScript();
    await new Promise(resolve => ymaps.ready(resolve));

    const latitude = Number(APP_CONFIG.yandexMaps.latitude);
    const longitude = Number(APP_CONFIG.yandexMaps.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Некорректные координаты.");
    }

    DOM.deliveryMap.innerHTML = "";
    appState.map = new ymaps.Map(DOM.deliveryMap, {
      center: [latitude, longitude],
      zoom: APP_CONFIG.yandexMaps.zoom,
      controls: ["zoomControl", "fullscreenControl"]
    });

    const placemark = new ymaps.Placemark(
      [latitude, longitude],
      {
        balloonContentHeader: escapeHtml(APP_CONFIG.yandexMaps.shopName),
        balloonContentBody: escapeHtml(APP_CONFIG.yandexMaps.shopAddress),
        hintContent: escapeHtml(APP_CONFIG.yandexMaps.shopName)
      },
      { preset: "islands#orangeFoodIcon" }
    );

    appState.map.geoObjects.add(placemark);
    window.addEventListener("resize", () => appState.map?.container.fitToViewport());
    appState.mapLoaded = true;

  } catch (error) {
    console.error("Ошибка Яндекс.Карт:", error);
    renderMapPlaceholder("Карта временно недоступна");
  }
}

/* ============================================================
   19. ОБРАБОТЧИКИ СОБЫТИЙ И ИНИЦИАЛИЗАЦИЯ
   ============================================================ */

function handleEmptyCartMenuButton() {
  document.getElementById("emptyCartMenuButton")?.addEventListener("click", () => {
    closeCart();
    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
  });
}

function initMenuEvents() {
  DOM.menuCategories?.addEventListener("click", handleMenuClick);
  DOM.categoryNav?.addEventListener("click", handleCategoryNavigation);
}

function initCartEvents() {
  DOM.openCartButton?.addEventListener("click", openCart);
  DOM.floatingCartButton?.addEventListener("click", openCart);
  DOM.closeCartButton?.addEventListener("click", closeCart);
  DOM.cartItems?.addEventListener("click", handleCartClick);
  DOM.checkoutButton?.addEventListener("click", openCheckout);
  DOM.closeCheckoutButton?.addEventListener("click", closeCheckout);
  DOM.modalOverlay?.addEventListener("click", closeAllModals);
  handleEmptyCartMenuButton();
}

function initKeyboardEvents() {
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeAllModals();
  });
}

function initCheckoutEvents() {
  DOM.checkoutForm?.addEventListener("submit", submitCheckout);
  DOM.applyPromoButton?.addEventListener("click", validatePromoCode);
  DOM.checkoutForm?.querySelectorAll('input[name="payment"]').forEach(radio => {
    radio.addEventListener("change", updateCheckoutFormState);
  });
  DOM.promoCode?.addEventListener("input", () => { if (appState.promo) clearPromo(); });
  DOM.promoCode?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      validatePromoCode();
    }
  });
}

function restoreCategoryFromHash() {
  const hash = window.location.hash;
  if (!hash.startsWith("#category-")) return;
  const categoryId = decodeURIComponent(hash.replace("#category-", ""));
  setTimeout(() => scrollToCategory(categoryId), 100);
}

function initImageErrorHandling() {
  document.addEventListener("error", event => {
    const image = event.target;
    if (image.tagName !== "IMG" || image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";

    const productImage = image.closest(".product-image");
    if (productImage) {
      image.style.display = "none";
      const placeholder = productImage.querySelector(".product-image-placeholder");
      if (placeholder) placeholder.style.display = "flex";
    }

    const cartImage = image.closest(".cart-item-image");
    if (cartImage) image.style.display = "none";
  }, true);
}

function validateMenuData() {
  if (!menuData || !Array.isArray(menuData.categories) || !Array.isArray(menuData.products)) {
    console.error("Меню не загружено или повреждено (см. ошибку запроса GET /api/menu выше).");

    if (DOM.menuCategories) {
      DOM.menuCategories.innerHTML = `<div class="no-products">Не удалось загрузить меню. Обновите страницу.</div>`;
    }

    showToast("Не удалось загрузить меню. Проверьте соединение и обновите страницу.");
    return false;
  }
  return true;
}

async function initApp() {
  cacheDomElements();

  await loadMenuFromServer();
  if (!validateMenuData()) return;

  ensureValidationStyles();
  loadCartFromStorage();
  renderMenu();
  ensureFulfillmentControls();
  updateCheckoutFormState();
  updateCartUI();

  initMenuEvents();
  initCartEvents();
  initCheckoutEvents();
  initKeyboardEvents();
  initImageErrorHandling();

  restoreCategoryFromHash();
  initYandexMap();

  if (!window.location.hash) window.scrollTo(0, 0);
  console.info("Sushi Shop App успешно запущен.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
