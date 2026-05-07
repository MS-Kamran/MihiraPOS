/**
 * POS Page Logic — Cart, Checkout, Inventory Display
 */
let inventory = [];
let cart = [];
let el = {};
let currentPage = 1;
const itemsPerPage = 20;

document.addEventListener("DOMContentLoaded", async () => {
  el = {
    loading: document.getElementById("loading"),
    grid: document.getElementById("product-grid"),
    searchInput: document.getElementById("searchInput"),
    visualFilters: document.getElementById("visualFilters"),
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
  await loadInventory();
});

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
  if(document.getElementById("filterName")) document.getElementById("filterName").addEventListener("change", resetPageAndRender);
  if(document.getElementById("filterColor")) document.getElementById("filterColor").addEventListener("change", resetPageAndRender);
  if(document.getElementById("filterSize")) document.getElementById("filterSize").addEventListener("change", resetPageAndRender);
  if(document.getElementById("filterStock")) document.getElementById("filterStock").addEventListener("change", resetPageAndRender);
}

async function loadInventory() {
  // Instant render from cache
  const cached = Api.getCachedInventory();
  if (cached) {
    inventory = cached.filter((item) => (item.SKU || item.SERIAL) && item.NAME);
    inventory.sort((a, b) => (parseInt(b.SOLD) || 0) - (parseInt(a.SOLD) || 0));
    populateFiltersAndShow();
  }

  try {
    const data = await Api.getInventory();
    inventory = data.filter((item) => (item.SKU || item.SERIAL) && item.NAME);
    inventory.sort((a, b) => (parseInt(b.SOLD) || 0) - (parseInt(a.SOLD) || 0));
    populateFiltersAndShow();
  } catch (err) {
    if (!cached) showToast("Failed to load inventory", "error");
    console.error(err);
  }
}

function populateFilters() {
  const nameList = document.getElementById("filterName");
  const colorList = document.getElementById("filterColor");
  const sizeList = document.getElementById("filterSize");
  
  if (!nameList || !colorList || !sizeList) return;

  const names = extractUniqueValues(inventory, "NAME");
  const colors = extractUniqueValues(inventory, "COLOR");
  const sizes = extractUniqueValues(inventory, "SIZE");

  nameList.innerHTML = '<option value="all">All Designs</option>' + names.map(n => `<option value="${n}">${n}</option>`).join("");
  colorList.innerHTML = '<option value="all">All Colors</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join("");
  sizeList.innerHTML = '<option value="all">All Sizes</option>' + sizes.map(s => `<option value="${s}">${s}</option>`).join("");
}

function extractUniqueValues(data, key) {
  const values = data.map(i => String(i[key] || "").trim()).filter(Boolean);
  return [...new Set(values)].sort();
}

function populateFiltersAndShow() {
  populateFilters();

  // Auto-search if redirected from inventory with ?search= param
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get("search");
  if (searchParam && !el.searchInput.value) {
    el.searchInput.value = searchParam;
  }

  renderProducts();
  el.loading.classList.add("hidden");
  el.grid.classList.remove("hidden");
}

function resetFilters() {
  el.searchInput.value = "";
  if(document.getElementById("filterName")) document.getElementById("filterName").value = "all";
  if(document.getElementById("filterColor")) document.getElementById("filterColor").value = "all";
  if(document.getElementById("filterSize")) document.getElementById("filterSize").value = "all";
  if(document.getElementById("filterStock")) document.getElementById("filterStock").value = "all";
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

function renderProducts() {
  const search = el.searchInput.value.toLowerCase();
  const nameFilter = document.getElementById("filterName") ? document.getElementById("filterName").value : "all";
  const colorFilter = document.getElementById("filterColor") ? document.getElementById("filterColor").value : "all";
  const sizeFilter = document.getElementById("filterSize") ? document.getElementById("filterSize").value : "all";
  const stockFilter = document.getElementById("filterStock") ? document.getElementById("filterStock").value : "all";

  const filtered = inventory.filter((item) => {
    const idField = item.SERIAL || item.SKU || "";
    const ms = !search || String(idField).toLowerCase().includes(search) || String(item.NAME).toLowerCase().includes(search) || String(item.COLOR).toLowerCase().includes(search);
    
    let stockMatch = true;
    const itemStock = getStock(item);
    if (stockFilter === "in_stock") stockMatch = itemStock > 0;
    else if (stockFilter === "low_stock") stockMatch = itemStock > 0 && itemStock < 5;
    else if (stockFilter === "out_of_stock") stockMatch = itemStock <= 0;

    const nameMatch = nameFilter === "all" || item.NAME === nameFilter;
    const colorMatch = colorFilter === "all" || item.COLOR === colorFilter;
    const sizeMatch = sizeFilter === "all" || String(item.SIZE) === sizeFilter;

    return ms && stockMatch && nameMatch && colorMatch && sizeMatch;
  });

  el.grid.innerHTML = "";

  if (filtered.length === 0) {
    el.grid.innerHTML = '<div class="no-data">No products found</div>';
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
    const isOut = stock <= 0;
    const isLow = stock > 0 && stock < 5;
    const imgUrl = getFirstImageUrl(item["IMAGE LINK"], item.IMAGES);

    const card = document.createElement("div");
    card.className = `product-card ${isOut ? "out-of-stock" : ""}`;
    card.innerHTML = `
      <div class="product-img-wrapper">
        <div class="product-img">${imgUrl ? `<img src="${imgUrl}" alt="${item.NAME}" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<i class=\\'ri-image-line\\' style=\\'font-size:28px\\'></i>'">` : '<i class="ri-image-line" style="font-size:28px"></i>'}</div>
        ${!isOut ? `<button class="quick-add-btn" onclick="addToCartByData('${item.SERIAL || item.SKU}'); event.stopPropagation()"><i class="ri-add-line"></i></button>` : ''}
      </div>
      <div class="product-info">
        <h3>${item.NAME}</h3>
        <div class="product-meta">
          <span>${item.COLOR}</span>
          <span class="size-badge">Size ${item.SIZE}</span>
        </div>
        <div class="product-footer">
          <span class="product-price">${formatCurrency(price)}</span>
          <span class="stock-badge ${isOut ? "stock-out" : isLow ? "stock-low" : "stock-ok"}">${isOut ? "Out" : formatStockDisplay(stock, parseInt(item["CHURI IN A SET"]) || 12)}</span>
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

// ─── Cart ───────────────────────────────────────────────
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

    // Display quantity as sets
    const qtyDisplay = extraPieces > 0 ? `${numberOfSets} Set + ${extraPieces} Pcs` : `${numberOfSets} Set`;

    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      ${imgUrl ? `<img src="${imgUrl}" class="cart-item-img" referrerpolicy="no-referrer">` : '<div class="cart-item-img"></div>'}
      <div class="cart-item-details">
        <h4>${item.NAME}</h4>
        <div class="cart-item-meta">${item.COLOR} · Size ${item.SIZE}</div>
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

// Mobile cart overlay toggle
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

// ─── Partial Payment ────────────────────────────────────
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

// ─── Checkout ───────────────────────────────────────────
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
    const confirmMsg = "Warning: You have items in your cart that are Low Stock or Out of Stock in inventory. Do you still want to proceed with this order?";
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
    // Store per-piece price for accurate return refund calculations
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

    showToast("Order completed!", "success");
    // Increment SOLD locally (never touch SET QUANTITY)
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
    el.deliveryFee.value = "0";
    el.discountType.value = "none";
    el.discountValue.value = "";
    el.discountValue.style.display = "none";
    populateFilters();
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
