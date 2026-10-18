/**
 * POS Page Logic — Cart, Checkout, 15-Day Trending Highlight, Cascading Priority Filters
 */
let inventory = [];
let cart = [];
let el = {};
let currentPage = 1;
const itemsPerPage = 20;

// Trending sales tracker (last 15 days)
let sales15dBySerial = {};
let sales15dByName = {};

document.addEventListener("DOMContentLoaded", async () => {
  el = {
    loading: document.getElementById("loading"),
    grid: document.getElementById("product-grid"),
    searchInput: document.getElementById("searchInput"),
    filterType: document.getElementById("filterType"),
    filterName: document.getElementById("filterName"),
    filterDesign: document.getElementById("filterDesign"),
    filterColor: document.getElementById("filterColor"),
    filterColorShade: document.getElementById("filterColorShade"),
    filterSize: document.getElementById("filterSize"),
    filterStock: document.getElementById("filterStock"),
    cartItems: document.getElementById("cart-items"),
    cartCount: document.getElementById("cartCount"),
    cartTotal: document.getElementById("cartTotal"),
    clearCartBtn: document.getElementById("clearCartBtn"),
    checkoutBtn: document.getElementById("checkoutBtn"),
    custPhone: document.getElementById("custPhone"),
    custName: document.getElementById("custName"),
    custAddress: document.getElementById("custAddress"),
    paymentMethod: document.getElementById("paymentMethod"),
    paymentStatus: document.getElementById("paymentStatus"),
    partialRow: document.getElementById("partialRow"),
    paidAmount: document.getElementById("paidAmount"),
    dueAmount: document.getElementById("dueAmount"),
    deliveryFee: document.getElementById("deliveryFee"),
    discountType: document.getElementById("discountType"),
    discountValue: document.getElementById("discountValue"),
    cartSubtotal: document.getElementById("cartSubtotal"),
    deliveryFeeRow: document.getElementById("deliveryFeeRow"),
    deliveryFeeDisplay: document.getElementById("deliveryFeeDisplay"),
    discountRow: document.getElementById("discountRow"),
    discountDisplay: document.getElementById("discountDisplay"),
    resetFiltersBtn: document.getElementById("resetFiltersBtn"),
    paginationControls: document.getElementById("paginationControls"),
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    pageIndicator: document.getElementById("pageIndicator"),
    orderNote: document.getElementById("orderNote"),
  };

  setupListeners();
  await loadData();
});

/**
 * ─── Filter Listeners & Cascading Priority Setup ─────────────────────────
 * Priority Branch 1: Type (Priority 1) -> NAME (Priority 2) -> Design (Priority 3)
 * Priority Branch 2: COLOR (Priority 1) -> Color Shade (Priority 2)
 */
function setupListeners() {
  const resetPageAndRender = () => { currentPage = 1; renderProducts(); };

  el.searchInput.addEventListener("input", resetPageAndRender);
  el.clearCartBtn.addEventListener("click", clearCart);
  el.checkoutBtn.addEventListener("click", handleCheckout);
  el.paymentStatus.addEventListener("change", togglePartialRow);
  el.paidAmount.addEventListener("input", calcDue);
  el.deliveryFee.addEventListener("input", recalcTotals);
  el.discountType.addEventListener("change", () => {
    const isNone = el.discountType.value === "none";
    el.discountValue.style.display = isNone ? "none" : "block";
    if (isNone) el.discountValue.value = "";
    recalcTotals();
  });
  el.discountValue.addEventListener("input", recalcTotals);

  // Type change -> Cascades to Name filter and syncs Colors
  if (el.filterType) {
    el.filterType.addEventListener("change", () => {
      currentPage = 1;
      const selectedType = el.filterType.value;
      if (selectedType === "all") {
        el.filterName.classList.add("hidden");
        el.filterName.value = "all";
        el.filterDesign.classList.add("hidden");
        el.filterDesign.value = "all";
      } else {
        const matching = inventory.filter(i => String(i.Type || "").trim() === selectedType);
        const names = extractUniqueValues(matching, "NAME");
        populateDropdown(el.filterName, names, "All Names");
        el.filterName.value = "all";
        el.filterName.classList.remove("hidden");
        el.filterName.classList.add("filter-appear");

        el.filterDesign.classList.add("hidden");
        el.filterDesign.value = "all";
      }
      syncAvailableColors();
      renderProducts();
    });
  }

  // Name change -> Cascades to Design filter and syncs Colors
  if (el.filterName) {
    el.filterName.addEventListener("change", () => {
      currentPage = 1;
      const selectedType = el.filterType.value;
      const selectedName = el.filterName.value;

      if (selectedName === "all") {
        el.filterDesign.classList.add("hidden");
        el.filterDesign.value = "all";
      } else {
        const matching = inventory.filter(i =>
          (selectedType === "all" || String(i.Type || "").trim() === selectedType) &&
          String(i.NAME || "").trim() === selectedName
        );
        const designs = extractUniqueValues(matching, "Design");
        if (designs.length > 0) {
          populateDropdown(el.filterDesign, designs, "All Designs");
          el.filterDesign.value = "all";
          el.filterDesign.classList.remove("hidden");
          el.filterDesign.classList.add("filter-appear");
        } else {
          el.filterDesign.classList.add("hidden");
          el.filterDesign.value = "all";
        }
      }
      syncAvailableColors();
      renderProducts();
    });
  }

  // Design change -> Syncs Colors
  if (el.filterDesign) {
    el.filterDesign.addEventListener("change", () => {
      currentPage = 1;
      syncAvailableColors();
      renderProducts();
    });
  }

  // Color change -> Cascades to Color Shade filter
  if (el.filterColor) {
    el.filterColor.addEventListener("change", () => {
      currentPage = 1;
      const scoped = getScopedItemsForColor();
      syncAvailableShades(scoped, el.filterColor.value);
      renderProducts();
    });
  }

  if (el.filterColorShade) el.filterColorShade.addEventListener("change", resetPageAndRender);
  if (el.filterSize) el.filterSize.addEventListener("change", resetPageAndRender);
  if (el.filterStock) el.filterStock.addEventListener("change", resetPageAndRender);
}

function getScopedItemsForColor() {
  const selectedType = el.filterType ? el.filterType.value : "all";
  const selectedName = el.filterName ? el.filterName.value : "all";
  const selectedDesign = el.filterDesign ? el.filterDesign.value : "all";

  let scoped = inventory;
  if (selectedType !== "all") scoped = scoped.filter(i => String(i.Type || "").trim() === selectedType);
  if (selectedName !== "all") scoped = scoped.filter(i => String(i.NAME || "").trim() === selectedName);
  if (selectedDesign !== "all") scoped = scoped.filter(i => String(i.Design || "").trim() === selectedDesign);
  return scoped;
}

function syncAvailableColors() {
  if (!el.filterColor) return;
  const scoped = getScopedItemsForColor();
  const availableColors = extractUniqueValues(scoped, "COLOR");
  const prevColor = el.filterColor.value;

  populateDropdown(el.filterColor, availableColors, "All Colors");

  if (prevColor !== "all" && availableColors.includes(prevColor)) {
    el.filterColor.value = prevColor;
    syncAvailableShades(scoped, prevColor);
  } else {
    el.filterColor.value = "all";
    if (el.filterColorShade) {
      el.filterColorShade.value = "all";
      el.filterColorShade.classList.add("hidden");
    }
  }
}

function syncAvailableShades(scopedItems, selectedColor) {
  if (!el.filterColorShade) return;
  if (selectedColor === "all") {
    el.filterColorShade.value = "all";
    el.filterColorShade.classList.add("hidden");
    return;
  }

  const colorItems = scopedItems.filter(i => String(i.COLOR || "").trim() === selectedColor);
  const availableShades = extractUniqueValues(colorItems, "Color Shade");

  if (availableShades.length > 0) {
    const prevShade = el.filterColorShade.value;
    populateDropdown(el.filterColorShade, availableShades, "All Shades");
    if (prevShade !== "all" && availableShades.includes(prevShade)) {
      el.filterColorShade.value = prevShade;
    } else {
      el.filterColorShade.value = "all";
    }
    el.filterColorShade.classList.remove("hidden");
    el.filterColorShade.classList.add("filter-appear");
  } else {
    el.filterColorShade.value = "all";
    el.filterColorShade.classList.add("hidden");
  }
}

/**
 * ─── Data Loading & 15-Day Trending Calculation ───────────────────────────
 */
async function loadData() {
  // Instant render from cached inventory
  const cached = Api.getCachedInventory();
  if (cached) {
    inventory = cached.filter((item) => (item.SKU || item.SERIAL) && item.NAME);
    inventory.sort((a, b) => (parseInt(b.SOLD) || 0) - (parseInt(a.SOLD) || 0));
    populateInitialFilters();
    renderProducts();
    el.loading.classList.add("hidden");
    el.grid.classList.remove("hidden");
  }

  try {
    const [invData, ordersData] = await Promise.all([
      Api.getInventory(),
      Api.getOrders().catch(() => [])
    ]);

    inventory = invData.filter((item) => (item.SKU || item.SERIAL) && item.NAME);

    // Compute 15-day trending from orders
    calculate15DayTrending(ordersData);
    applyTrendingAndSort();

    populateInitialFilters();

    // Auto-search if redirected from inventory with ?search= param
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get("search");
    if (searchParam && !el.searchInput.value) {
      el.searchInput.value = searchParam;
    }

    renderProducts();
    el.loading.classList.add("hidden");
    el.grid.classList.remove("hidden");
  } catch (err) {
    if (!cached) showToast("Failed to load POS data", "error");
    console.error(err);
  }
}

/**
 * Calculate popularity / sold volume within the last 15 days
 */
function calculate15DayTrending(orders) {
  sales15dBySerial = {};
  sales15dByName = {};
  if (!Array.isArray(orders)) return;

  const now = new Date();
  const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

  orders.forEach((order) => {
    if (order.delivery_status === "Returned" || order.delivery_status === "Cancelled") return;
    const orderDate = parseOrderDate(order.date);
    if (!orderDate || orderDate < fifteenDaysAgo) return;

    const rawSerials = String(order.serial || "").split(",").map(s => s.trim());
    const rawQtys = String(order.quantity || "").split(",").map(q => parseInt(q.trim()) || 1);
    const rawNames = String(order.category || "").split(",").map(n => n.trim());

    rawSerials.forEach((ser, idx) => {
      const qty = rawQtys[idx] || rawQtys[0] || 1;
      if (ser) {
        sales15dBySerial[ser] = (sales15dBySerial[ser] || 0) + qty;
      }
      const name = rawNames[idx] || rawNames[0];
      if (name) {
        sales15dByName[name] = (sales15dByName[name] || 0) + qty;
      }
    });
  });
}

/**
 * Apply 15-day trending score and sort products
 * 1. Highest 15-day sold first
 * 2. All-time SOLD descending
 * 3. Available stock
 */
function applyTrendingAndSort() {
  inventory.forEach((item) => {
    const ser = String(item.SERIAL || item.SKU);
    const setSize = parseInt(item["CHURI IN A SET"]) || 1;
    const pieces15d = sales15dBySerial[ser] || 0;
    item.soldPieces15d = pieces15d;
    item.soldSets15d = Math.round(pieces15d / setSize);
  });

  inventory.sort((a, b) => {
    const tA = a.soldPieces15d || 0;
    const tB = b.soldPieces15d || 0;
    if (tB !== tA) return tB - tA;

    const soldA = parseInt(a.SOLD) || 0;
    const soldB = parseInt(b.SOLD) || 0;
    if (soldB !== soldA) return soldB - soldA;

    return getStock(b) - getStock(a);
  });
}

function populateInitialFilters() {
  populateDropdown(el.filterType, extractUniqueValues(inventory, "Type"), "All Types");
  populateDropdown(el.filterColor, extractUniqueValues(inventory, "COLOR"), "All Colors");
  populateDropdown(el.filterSize, extractUniqueValues(inventory, "SIZE"), "All Sizes");
}

function extractUniqueValues(data, key) {
  const values = data.map(i => String(i[key] || "").trim()).filter(Boolean);
  return [...new Set(values)].sort();
}

function resetFilters() {
  el.searchInput.value = "";
  if (el.filterType) el.filterType.value = "all";
  if (el.filterName) { el.filterName.value = "all"; el.filterName.classList.add("hidden"); }
  if (el.filterDesign) { el.filterDesign.value = "all"; el.filterDesign.classList.add("hidden"); }
  if (el.filterColor) el.filterColor.value = "all";
  if (el.filterColorShade) { el.filterColorShade.value = "all"; el.filterColorShade.classList.add("hidden"); }
  if (el.filterSize) el.filterSize.value = "all";
  if (el.filterStock) el.filterStock.value = "in_stock"; // Default back to In Stock on front page!
  syncAvailableColors();
  currentPage = 1;
  renderProducts();
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderProducts();
  }
}

function nextPage() {
  currentPage++;
  renderProducts();
}

/**
 * ─── Render Product Grid (Excludes Out of Stock by Default) ───────────────
 */
function renderProducts() {
  const search = el.searchInput.value.toLowerCase().trim();
  const typeFilter = el.filterType ? el.filterType.value : "all";
  const nameFilter = el.filterName ? el.filterName.value : "all";
  const designFilter = el.filterDesign ? el.filterDesign.value : "all";
  const colorFilter = el.filterColor ? el.filterColor.value : "all";
  const shadeFilter = el.filterColorShade ? el.filterColorShade.value : "all";
  const sizeFilter = el.filterSize ? el.filterSize.value : "all";
  const stockFilter = el.filterStock ? el.filterStock.value : "in_stock";

  const filtered = inventory.filter((item) => {
    const idField = String(item.SERIAL || item.SKU || "");
    const skuName = String(item["SKU NAME"] || "");
    const itemType = String(item.Type || "");
    const itemName = String(item.NAME || "");
    const itemDesign = String(item.Design || "");
    const itemColor = String(item.COLOR || "");
    const itemShade = String(item["Color Shade"] || "");
    const itemSize = String(item.SIZE || "");

    const ms = !search ||
      idField.toLowerCase().includes(search) ||
      skuName.toLowerCase().includes(search) ||
      itemType.toLowerCase().includes(search) ||
      itemName.toLowerCase().includes(search) ||
      itemDesign.toLowerCase().includes(search) ||
      itemColor.toLowerCase().includes(search) ||
      itemShade.toLowerCase().includes(search);

    const itemStock = getStock(item);
    let stockMatch = true;
    if (stockFilter === "in_stock") stockMatch = itemStock > 0;
    else if (stockFilter === "low_stock") stockMatch = itemStock > 0 && itemStock < 5;
    else if (stockFilter === "out_of_stock") stockMatch = itemStock <= 0;
    // "all" allows everything, but default front page is "in_stock"

    const typeMatch = typeFilter === "all" || itemType.trim() === typeFilter;
    const nameMatch = nameFilter === "all" || itemName.trim() === nameFilter;
    const designMatch = designFilter === "all" || itemDesign.trim() === designFilter;
    const colorMatch = colorFilter === "all" || itemColor.trim() === colorFilter;
    const shadeMatch = shadeFilter === "all" || itemShade.trim() === shadeFilter;
    const sizeMatch = sizeFilter === "all" || itemSize.trim() === sizeFilter;

    return ms && stockMatch && typeMatch && nameMatch && designMatch && colorMatch && shadeMatch && sizeMatch;
  });

  el.grid.innerHTML = "";

  if (filtered.length === 0) {
    el.grid.innerHTML = '<div class="no-data" style="grid-column:1/-1;">No products found</div>';
    el.paginationControls.classList.add("hidden");
    return;
  }

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;

  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginated = filtered.slice(startIdx, startIdx + itemsPerPage);

  paginated.forEach((item) => {
    const stock = getStock(item);
    const price = parseFloat(item["SELLING PRICE"]) || 0;
    const setSize = parseInt(item["CHURI IN A SET"]) || 12;
    const isOut = stock <= 0;
    const isLow = stock > 0 && stock < 5;
    const imgUrl = getFirstImageUrl(item["IMAGE LINK"], item.IMAGES);
    const isTrending = (item.soldPieces15d || 0) > 0;
    const trendingSets = item.soldSets15d || Math.round((item.soldPieces15d || 0) / setSize);

    const card = document.createElement("div");
    card.className = `product-card ${isOut ? "out-of-stock" : ""}`;
    card.innerHTML = `
      <div class="product-img-wrapper">
        <div class="product-img">${imgUrl ? `<img src="${imgUrl}" alt="${item.NAME}" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<i class=\\'ri-image-line\\' style=\\'font-size:28px\\'></i>'">` : '<i class="ri-image-line" style="font-size:28px"></i>'}</div>
        ${isTrending ? `<div class="badge-trending"><i class="ri-fire-fill"></i> ${trendingSets > 0 ? trendingSets + ' Sets (15d)' : 'Trending'}</div>` : ''}
        ${!isOut ? `<button class="quick-add-btn" onclick="addToCartByData('${item.SERIAL || item.SKU}'); event.stopPropagation()"><i class="ri-add-line"></i></button>` : ''}
      </div>
      <div class="product-info">
        <h3>${item.NAME}${item.Design ? ` <span style="font-weight:400;color:var(--text-muted);font-size:12px;">(${item.Design})</span>` : ''}</h3>
        <div class="product-meta">
          ${item.Type ? `<span class="badge-type">${item.Type}</span>` : ''}
          <span class="badge-set-pcs"><i class="ri-stack-line"></i> ${setSize} pcs/set</span>
          <span>${item.COLOR}${item['Color Shade'] ? ` · ${item['Color Shade']}` : ''}</span>
          <span class="size-badge">Size ${item.SIZE}</span>
        </div>
        <div class="product-footer">
          <span class="product-price">${formatCurrency(price)} <span class="price-unit">(${setSize} pcs)</span></span>
          <span class="stock-badge ${isOut ? "stock-out" : isLow ? "stock-low" : "stock-ok"}">${isOut ? "Out" : formatStockDisplay(stock, setSize)}</span>
        </div>
      </div>`;

    if (!isOut) card.addEventListener("click", () => addToCart(item));
    el.grid.appendChild(card);
  });

  // Pagination controls
  el.paginationControls.classList.remove("hidden");
  el.pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
  el.prevPageBtn.disabled = currentPage === 1;
  el.nextPageBtn.disabled = currentPage === totalPages;
}

/**
 * ─── Cart Management ──────────────────────────────────────────────────────
 */
function addToCartByData(idField) {
  const product = inventory.find((i) => String(i.SERIAL || i.SKU) === idField);
  if (product) addToCart(product);
}

function addToCart(product) {
  const stock = getStock(product);
  const idField = String(product.SERIAL || product.SKU);
  const existing = cart.find((i) => String(i.SERIAL || i.SKU) === idField);
  const setPieces = parseInt(product["CHURI IN A SET"]) || 1;

  if (existing) {
    if (existing.cartQty + setPieces > stock) return showToast("Not enough stock for another set", "error");
    existing.cartQty += setPieces;
  } else {
    if (stock < setPieces) return showToast("Not enough stock", "error");
    cart.push({ ...product, cartQty: setPieces });
  }
  showToast(`${product.NAME} added (${setPieces} pcs)`, "success");
  renderCart();
}

function updateCartQty(id, delta) {
  const idx = cart.findIndex((i) => String(i.SERIAL || i.SKU) === String(id));
  if (idx === -1) return;
  const item = cart[idx];
  const max = getStock(item);
  const newQty = item.cartQty + delta;

  if (newQty <= 0) cart.splice(idx, 1);
  else if (newQty > max) showToast("Max stock reached", "error");
  else item.cartQty = newQty;
  renderCart();
}

function clearCart() {
  cart = [];
  renderCart();
}

function renderCart() {
  el.cartItems.innerHTML = "";

  if (cart.length === 0) {
    el.cartItems.innerHTML = '<div class="empty-cart"><i class="ri-shopping-cart-2-line"></i><p>Cart is empty</p></div>';
    el.cartCount.textContent = "0";
    el.cartTotal.textContent = "৳0";
    el.checkoutBtn.disabled = true;
    updateFabBadge(0);
    calcDue();
    return;
  }

  let total = 0;
  let totalSets = 0;

  cart.forEach((item) => {
    const setPrice = parseFloat(item["SELLING PRICE"]) || 0;
    const setSize = parseInt(item["CHURI IN A SET"]) || 1;
    const numberOfSets = Math.floor(item.cartQty / setSize);
    const extraPieces = item.cartQty % setSize;
    const lineTotal = setPrice * numberOfSets + (extraPieces > 0 ? (setPrice / setSize) * extraPieces : 0);

    total += lineTotal;
    totalSets += numberOfSets;
    const imgUrl = getFirstImageUrl(item["IMAGE LINK"], item.IMAGES);
    const idField = item.SERIAL || item.SKU;

    const qtyDisplay = extraPieces > 0 ? `${numberOfSets} Set + ${extraPieces} Pcs` : `${numberOfSets} Set`;

    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      ${imgUrl ? `<img src="${imgUrl}" class="cart-item-img" referrerpolicy="no-referrer">` : '<div class="cart-item-img"></div>'}
      <div class="cart-item-details">
        <h4>${item.NAME}${item.Design ? ` (${item.Design})` : ''}</h4>
        <div class="cart-item-meta">${item.COLOR}${item['Color Shade'] ? ` · ${item['Color Shade']}` : ''} · Size ${item.SIZE}</div>
        <div class="cart-item-meta" style="color:var(--accent);font-weight:600;margin-top:2px;">৳${setPrice}/set · ${setSize} pcs/set</div>
      </div>
      <div class="cart-item-controls">
        <div class="cart-item-price">${formatCurrency(lineTotal)}</div>
        <div style="font-size:11px;color:var(--text-muted);text-align:right;">${qtyDisplay}</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="qty-control">
            <button class="qty-btn" onclick="updateCartQty('${idField}', -${setSize})" title="Remove Set" style="font-size:11px; font-weight:700; color: var(--text-secondary)">-1</button>
            <span class="qty-val">${numberOfSets}${extraPieces > 0 ? `+${extraPieces}` : ''}</span>
            <button class="qty-btn" onclick="updateCartQty('${idField}', ${setSize})" title="Add Set" style="font-size:11px; font-weight:700; color: var(--text-secondary)">+1</button>
          </div>
          <button class="btn-icon danger" onclick="updateCartQty('${idField}', -999999)" style="padding:4px; margin:0;" title="Remove Item">
            <i class="ri-delete-bin-line"></i>
          </button>
        </div>
      </div>`;

    // Swipe Gestures
    let touchStartX = 0;
    div.addEventListener("touchstart", e => touchStartX = e.changedTouches[0].screenX, {passive: true});
    div.addEventListener("touchend", e => {
      let touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) {
        updateCartQty(idField, -item.cartQty);
      } else if (touchEndX - touchStartX > 50) {
        updateCartQty(idField, setSize);
      }
    });

    el.cartItems.appendChild(div);
  });

  el.cartCount.textContent = totalSets;
  el.cartSubtotal.textContent = formatCurrency(total);
  el.checkoutBtn.disabled = false;
  updateFabBadge(totalSets);
  recalcTotals();
}

function toggleMobileCart() {
  const cartEl = document.querySelector(".pos-cart");
  cartEl.classList.toggle("cart-open");
}

function updateFabBadge(count) {
  const badge = document.getElementById("fabBadge");
  if (badge) badge.textContent = count;
}

function recalcTotals() {
  const subtotalText = el.cartSubtotal.textContent.replace(/[৳,]/g, "");
  const subtotal = parseFloat(subtotalText) || 0;

  const deliveryFee = parseFloat(el.deliveryFee.value) || 0;
  el.deliveryFeeRow.style.display = deliveryFee > 0 ? "flex" : "none";
  el.deliveryFeeDisplay.textContent = formatCurrency(deliveryFee);

  let discountAmount = 0;
  const discType = el.discountType.value;
  const discVal = parseFloat(el.discountValue.value) || 0;
  if (discType === "percent" && discVal > 0) discountAmount = subtotal * (discVal / 100);
  else if (discType === "fixed" && discVal > 0) discountAmount = discVal;
  el.discountRow.style.display = discountAmount > 0 ? "flex" : "none";
  el.discountDisplay.textContent = `-${formatCurrency(discountAmount)}`;

  const grandTotal = Math.max(0, subtotal + deliveryFee - discountAmount);
  el.cartTotal.textContent = formatCurrency(grandTotal);
  calcDue();
}

function togglePartialRow() {
  el.partialRow.classList.toggle("hidden", el.paymentStatus.value !== "Partial");
  calcDue();
}

function calcDue() {
  const totalText = el.cartTotal.textContent.replace(/[৳,]/g, "");
  const total = parseFloat(totalText) || 0;
  const paid = parseFloat(el.paidAmount.value) || 0;
  el.dueAmount.value = formatCurrency(Math.max(0, total - paid));
}

/**
 * ─── Checkout ─────────────────────────────────────────────────────────────
 */
let isProcessingCheckout = false;
async function handleCheckout() {
  if (isProcessingCheckout) return;
  if (cart.length === 0) return showToast("Cart is empty", "error");
  const phone = el.custPhone.value.trim();
  if (!phone) {
    showToast("Phone number is required", "error");
    el.custPhone.focus();
    return;
  }

  // Check for low stock warnings
  const lowStockItems = cart.filter(item => {
    const stock = getStock(item);
    return stock < 5;
  });

  if (lowStockItems.length > 0) {
    const confirmMsg = "Warning: Some items in your cart are Low Stock or Out of Stock in inventory. Do you still want to proceed?";
    if (!confirm(confirmMsg)) return;
  }

  isProcessingCheckout = true;
  el.checkoutBtn.disabled = true;
  el.checkoutBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Processing...';

  const orderId = "ORD-" + Date.now().toString().slice(-8);
  const now = new Date();
  const custName = el.custName.value.trim() || "Guest";
  const custAddress = el.custAddress.value.trim() || "";
  const payMethod = el.paymentMethod.value;
  const payStatus = el.paymentStatus.value;
  const subtotalText = el.cartSubtotal.textContent.replace(/[৳,]/g, "");
  const subtotal = parseFloat(subtotalText) || 0;
  const deliveryFee = parseFloat(el.deliveryFee.value) || 0;
  const discType = el.discountType.value;
  const discVal = parseFloat(el.discountValue.value) || 0;
  let discountAmount = 0;
  if (discType === "percent" && discVal > 0) discountAmount = subtotal * (discVal / 100);
  else if (discType === "fixed" && discVal > 0) discountAmount = discVal;
  const orderTotal = Math.max(0, subtotal + deliveryFee - discountAmount);
  const paidAmt = payStatus === "Paid" ? orderTotal : payStatus === "Partial" ? parseFloat(el.paidAmount.value) || 0 : 0;
  const dueAmt = Math.max(0, orderTotal - paidAmt);
  const noteParts = [];
  if (deliveryFee > 0) noteParts.push(`Delivery: ৳${deliveryFee}`);
  if (discountAmount > 0) noteParts.push(`Discount: ${discType === "percent" ? discVal + "%" : "৳" + discVal}`);
  const discountLabel = discountAmount > 0 ? (discType === "percent" ? `${discVal}%` : `৳${discVal}`) : "";

  const serialList = cart.map(i => i.SERIAL || i.SKU).join(", ");
  const categoryList = cart.map(i => i.NAME).join(", ");
  const colorList = cart.map(i => i.COLOR).join(", ");
  const sizeList = cart.map(i => i.SIZE).join(", ");
  const qtyList = cart.map(i => i.cartQty).join(", ");
  const unitPriceList = cart.map(i => {
    const setPrice = parseFloat(i["SELLING PRICE"]) || 0;
    const setSize = parseInt(i["CHURI IN A SET"]) || 1;
    return setPrice / setSize;
  }).join(", ");
  const totalQty = cart.reduce((s, i) => s + i.cartQty, 0);

  const orderRow = {
    order_id: orderId, timestamp: now.toISOString(), date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(), customer_id: phone, customer_name: custName,
    customer_phone: phone, customer_address: custAddress,
    serial: serialList, category: categoryList, color: colorList,
    size: sizeList, quantity: qtyList, total_quantity: totalQty, unit_price: unitPriceList,
    total_price: subtotal, discount: discountLabel, total_amount: orderTotal,
    action: "Sale", payment_status: payStatus,
    paid_amount: paidAmt, due_amount: dueAmt, delivery_status: "Pending", notes: (el.orderNote.value || "").trim(),
  };

  try {
    const result = await Api.saveOrder({
      items: [orderRow],
      customer: { Phone: phone, Name: custName, Address: custAddress, _addToTotalOrders: 1, _addToTotalSpent: orderTotal },
    });

    if (!result.success) throw new Error(result.error || "Save failed");

    showToast("Order completed successfully!", "success");
    // Increment SOLD locally
    cart.forEach((ci) => {
      const idField = ci.SERIAL || ci.SKU;
      const inv = inventory.find((i) => (i.SERIAL || i.SKU) === idField);
      if (inv) inv["SOLD"] = (parseInt(inv["SOLD"]) || 0) + ci.cartQty;
    });
    el.custPhone.value = "";
    el.custName.value = "";
    el.custAddress.value = "";
    el.orderNote.value = "";
    el.paidAmount.value = "";
    el.deliveryFee.value = "80";
    el.discountType.value = "none";
    el.discountValue.value = "";
    el.discountValue.style.display = "none";
    populateInitialFilters();
    clearCart();
    renderProducts();
  } catch (err) {
    showToast(err.message || "Checkout failed", "error");
    console.error(err);
  } finally {
    isProcessingCheckout = false;
    el.checkoutBtn.innerHTML = "Complete Checkout";
    el.checkoutBtn.disabled = cart.length === 0;
  }
}
