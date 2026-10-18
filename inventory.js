/**
 * Inventory Page — Stats, Grid, Cascading Priority Filters, Detail Modal, Add Modal
 */
let inventory = [];
let currentPage = 1;
const itemsPerPage = 20;

document.addEventListener("DOMContentLoaded", async () => {
  setupFilterListeners();

  // Instant render from cache while fresh data loads
  const cached = Api.getCachedInventory();
  if (cached) {
    inventory = cached.filter((i) => (i.SKU || i.SERIAL) && i.NAME);
    inventory.sort((a, b) => (parseInt(b.SOLD) || 0) - (parseInt(a.SOLD) || 0));
    populateInitialFilters();
    renderGrid();
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("product-grid").classList.remove("hidden");
  }

  try {
    const data = await Api.getInventory();
    inventory = data.filter((i) => (i.SKU || i.SERIAL) && i.NAME);
    inventory.sort((a, b) => (parseInt(b.SOLD) || 0) - (parseInt(a.SOLD) || 0));
    populateInitialFilters();
    renderGrid();
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("product-grid").classList.remove("hidden");
  } catch (err) {
    if (!cached) showToast("Failed to load inventory", "error");
    console.error("Inventory load failed:", err);
  }
});

/**
 * ─── Filter Setup & Cascading Priority Logic ─────────────────────────────
 * Branch A: Type (Priority 1) -> NAME (Priority 2) -> Design (Priority 3)
 * Branch B: COLOR (Priority 1) -> Color Shade (Priority 2)
 */
function setupFilterListeners() {
  const typeEl = document.getElementById("filterType");
  const nameEl = document.getElementById("filterName");
  const designEl = document.getElementById("filterDesign");
  const colorEl = document.getElementById("filterColor");
  const shadeEl = document.getElementById("filterColorShade");
  const sizeEl = document.getElementById("filterSize");
  const stockEl = document.getElementById("filterStock");
  const searchEl = document.getElementById("searchInput");

  // Type change -> Show Name filter populated for this Type and sync Colors
  typeEl.addEventListener("change", () => {
    currentPage = 1;
    const selectedType = typeEl.value;
    if (selectedType === "all") {
      nameEl.classList.add("hidden");
      nameEl.value = "all";
      designEl.classList.add("hidden");
      designEl.value = "all";
    } else {
      const matchingItems = inventory.filter(i => String(i.Type || "").trim() === selectedType);
      const names = extractUniqueValues(matchingItems, "NAME");
      populateDropdown(nameEl, names, "All Names");
      nameEl.value = "all";
      nameEl.classList.remove("hidden");
      nameEl.classList.add("filter-appear");

      // Design stays hidden until a specific Name is selected
      designEl.classList.add("hidden");
      designEl.value = "all";
    }
    syncAvailableColors();
    renderGrid();
  });

  // Name change -> Show Design filter populated for this Type + Name and sync Colors
  nameEl.addEventListener("change", () => {
    currentPage = 1;
    const selectedType = typeEl.value;
    const selectedName = nameEl.value;

    if (selectedName === "all") {
      designEl.classList.add("hidden");
      designEl.value = "all";
    } else {
      const matchingItems = inventory.filter(i =>
        (selectedType === "all" || String(i.Type || "").trim() === selectedType) &&
        String(i.NAME || "").trim() === selectedName
      );
      const designs = extractUniqueValues(matchingItems, "Design");
      if (designs.length > 0) {
        populateDropdown(designEl, designs, "All Designs");
        designEl.value = "all";
        designEl.classList.remove("hidden");
        designEl.classList.add("filter-appear");
      } else {
        designEl.classList.add("hidden");
        designEl.value = "all";
      }
    }
    syncAvailableColors();
    renderGrid();
  });

  // Design change -> Sync Colors
  designEl.addEventListener("change", () => {
    currentPage = 1;
    syncAvailableColors();
    renderGrid();
  });

  // Color change -> Show Color Shade filter populated for this Color
  colorEl.addEventListener("change", () => {
    currentPage = 1;
    const scoped = getScopedItemsForColor();
    syncAvailableShades(scoped, colorEl.value);
    renderGrid();
  });

  // Color Shade change
  shadeEl.addEventListener("change", () => {
    currentPage = 1;
    renderGrid();
  });

  sizeEl.addEventListener("change", () => { currentPage = 1; renderGrid(); });
  stockEl.addEventListener("change", () => { currentPage = 1; renderGrid(); });
  searchEl.addEventListener("input", () => { currentPage = 1; renderGrid(); });
}

function getScopedItemsForColor() {
  const selectedType = document.getElementById("filterType")?.value || "all";
  const selectedName = document.getElementById("filterName")?.value || "all";
  const selectedDesign = document.getElementById("filterDesign")?.value || "all";

  let scoped = inventory;
  if (selectedType !== "all") scoped = scoped.filter(i => String(i.Type || "").trim() === selectedType);
  if (selectedName !== "all") scoped = scoped.filter(i => String(i.NAME || "").trim() === selectedName);
  if (selectedDesign !== "all") scoped = scoped.filter(i => String(i.Design || "").trim() === selectedDesign);
  return scoped;
}

function syncAvailableColors() {
  const scoped = getScopedItemsForColor();
  const colorEl = document.getElementById("filterColor");
  const shadeEl = document.getElementById("filterColorShade");
  if (!colorEl) return;

  const availableColors = extractUniqueValues(scoped, "COLOR");
  const prevColor = colorEl.value;

  populateDropdown(colorEl, availableColors, "All Colors");

  if (prevColor !== "all" && availableColors.includes(prevColor)) {
    colorEl.value = prevColor;
    syncAvailableShades(scoped, prevColor);
  } else {
    colorEl.value = "all";
    if (shadeEl) {
      shadeEl.value = "all";
      shadeEl.classList.add("hidden");
    }
  }
}

function syncAvailableShades(scopedItems, selectedColor) {
  const shadeEl = document.getElementById("filterColorShade");
  if (!shadeEl) return;

  if (selectedColor === "all") {
    shadeEl.value = "all";
    shadeEl.classList.add("hidden");
    return;
  }

  const colorItems = scopedItems.filter(i => String(i.COLOR || "").trim() === selectedColor);
  const availableShades = extractUniqueValues(colorItems, "Color Shade");

  if (availableShades.length > 0) {
    const prevShade = shadeEl.value;
    populateDropdown(shadeEl, availableShades, "All Shades");
    if (prevShade !== "all" && availableShades.includes(prevShade)) {
      shadeEl.value = prevShade;
    } else {
      shadeEl.value = "all";
    }
    shadeEl.classList.remove("hidden");
    shadeEl.classList.add("filter-appear");
  } else {
    shadeEl.value = "all";
    shadeEl.classList.add("hidden");
  }
}

function populateInitialFilters() {
  const typeEl = document.getElementById("filterType");
  const colorEl = document.getElementById("filterColor");
  const sizeEl = document.getElementById("filterSize");

  populateDropdown(typeEl, extractUniqueValues(inventory, "Type"), "All Types");
  populateDropdown(colorEl, extractUniqueValues(inventory, "COLOR"), "All Colors");
  populateDropdown(sizeEl, extractUniqueValues(inventory, "SIZE"), "All Sizes");

  populateAddModalSuggestions();
}

function populateAddModalSuggestions() {
  const typeList = document.getElementById("typeSuggestions");
  const nameList = document.getElementById("nameSuggestions");
  const designList = document.getElementById("designSuggestions");
  const colorList = document.getElementById("colorSuggestions");
  const shadeList = document.getElementById("shadeSuggestions");

  if (typeList) typeList.innerHTML = extractUniqueValues(inventory, "Type").map(v => `<option value="${v}">`).join("");
  if (nameList) nameList.innerHTML = extractUniqueValues(inventory, "NAME").map(v => `<option value="${v}">`).join("");
  if (designList) designList.innerHTML = extractUniqueValues(inventory, "Design").map(v => `<option value="${v}">`).join("");
  if (colorList) colorList.innerHTML = extractUniqueValues(inventory, "COLOR").map(v => `<option value="${v}">`).join("");
  if (shadeList) shadeList.innerHTML = extractUniqueValues(inventory, "Color Shade").map(v => `<option value="${v}">`).join("");
}

/**
 * Filter items according to active cascading & common filters
 */
function getFilteredItems() {
  const search = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  const typeFilter = document.getElementById("filterType")?.value || "all";
  const nameFilter = document.getElementById("filterName")?.value || "all";
  const designFilter = document.getElementById("filterDesign")?.value || "all";
  const colorFilter = document.getElementById("filterColor")?.value || "all";
  const shadeFilter = document.getElementById("filterColorShade")?.value || "all";
  const sizeFilter = document.getElementById("filterSize")?.value || "all";
  const stockFilter = document.getElementById("filterStock")?.value || "all";

  return inventory.filter((item) => {
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

    let stockMatch = true;
    const itemStock = getStock(item);
    if (stockFilter === "in_stock") stockMatch = itemStock > 0;
    else if (stockFilter === "low_stock") stockMatch = itemStock > 0 && itemStock < 5;
    else if (stockFilter === "out_of_stock") stockMatch = itemStock <= 0;

    const typeMatch = typeFilter === "all" || itemType.trim() === typeFilter;
    const nameMatch = nameFilter === "all" || itemName.trim() === nameFilter;
    const designMatch = designFilter === "all" || itemDesign.trim() === designFilter;
    const colorMatch = colorFilter === "all" || itemColor.trim() === colorFilter;
    const shadeMatch = shadeFilter === "all" || itemShade.trim() === shadeFilter;
    const sizeMatch = sizeFilter === "all" || itemSize.trim() === sizeFilter;

    return ms && stockMatch && typeMatch && nameMatch && designMatch && colorMatch && shadeMatch && sizeMatch;
  });
}

/**
 * ─── Dynamic Stat Cards (Dynamically reflects filtered subset) ────────────
 */
function renderStats(itemsToUse) {
  const isFiltered = itemsToUse.length !== inventory.length;
  const noticeEl = document.getElementById("statsFilterNotice");

  if (noticeEl) {
    if (isFiltered) {
      const activeFilters = [];
      const t = document.getElementById("filterType")?.value;
      const n = document.getElementById("filterName")?.value;
      const d = document.getElementById("filterDesign")?.value;
      const c = document.getElementById("filterColor")?.value;
      const s = document.getElementById("filterColorShade")?.value;
      const sz = document.getElementById("filterSize")?.value;
      const st = document.getElementById("filterStock")?.value;
      const q = document.getElementById("searchInput")?.value?.trim();

      if (t && t !== "all") activeFilters.push(`Type: <strong>${t}</strong>`);
      if (n && n !== "all") activeFilters.push(`Name: <strong>${n}</strong>`);
      if (d && d !== "all") activeFilters.push(`Design: <strong>${d}</strong>`);
      if (c && c !== "all") activeFilters.push(`Color: <strong>${c}</strong>`);
      if (s && s !== "all") activeFilters.push(`Shade: <strong>${s}</strong>`);
      if (sz && sz !== "all") activeFilters.push(`Size: <strong>${sz}</strong>`);
      if (st && st !== "all") activeFilters.push(`Stock: <strong>${st.replace('_', ' ')}</strong>`);
      if (q) activeFilters.push(`Search: "<strong>${escapeHtml(q)}</strong>"`);

      noticeEl.style.display = "flex";
      noticeEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <i class="ri-filter-3-fill" style="color:var(--primary);font-size:16px;"></i>
          <span>Filtered Stats: Showing <strong>${itemsToUse.length}</strong> of ${inventory.length} products ${activeFilters.length ? `(${activeFilters.join(" · ")})` : ""}</span>
        </div>
        <a onclick="resetFilters()" style="color:var(--primary); font-weight:600; cursor:pointer;"><i class="ri-refresh-line"></i> Reset to All</a>
      `;
    } else {
      noticeEl.style.display = "none";
    }
  }

  const totalSKUs = itemsToUse.length;
  const totalSetsEver = itemsToUse.reduce((s, i) => {
    const totalUnit = parseInt(i["TOTAL UNIT"]) || 0;
    const setSize = parseInt(i["CHURI IN A SET"]) || 1;
    return s + Math.round(totalUnit / setSize);
  }, 0);

  const remainingSets = itemsToUse.reduce((s, i) => {
    const stock = getStock(i);
    const setSize = parseInt(i["CHURI IN A SET"]) || 1;
    return s + Math.floor(stock / setSize);
  }, 0);

  const soldSets = itemsToUse.reduce((s, i) => {
    const sold = parseInt(i["SOLD"]) || 0;
    const setSize = parseInt(i["CHURI IN A SET"]) || 1;
    return s + Math.round(sold / setSize);
  }, 0);

  const soldPercent = totalSetsEver > 0 ? Math.round((soldSets / totalSetsEver) * 100) : 0;
  const lowStock = itemsToUse.filter((i) => { const q = getStock(i); return q > 0 && q < 5; }).length;
  const outOfStock = itemsToUse.filter((i) => getStock(i) <= 0).length;

  const totalValue = itemsToUse.reduce((s, i) => {
    const stock = getStock(i);
    const setSize = parseInt(i["CHURI IN A SET"]) || 1;
    const sets = Math.floor(stock / setSize);
    return s + (parseFloat(i["SELLING PRICE"]) || 0) * sets;
  }, 0);

  const totalSaleValue = itemsToUse.reduce((s, i) => {
    const sold = parseInt(i["SOLD"]) || 0;
    const setSize = parseInt(i["CHURI IN A SET"]) || 1;
    const sets = Math.round(sold / setSize);
    return s + sets * (parseFloat(i["SELLING PRICE"]) || 0);
  }, 0);

  const totalPotentialRevenue = totalSaleValue + totalValue;
  const revenuePercent = totalPotentialRevenue > 0 ? Math.round((totalSaleValue / totalPotentialRevenue) * 100) : 0;

  const totalDamaged = itemsToUse.reduce((s, i) => s + (parseInt(i["DAMAGED"]) || 0), 0);
  const totalUnitsEver = itemsToUse.reduce((s, i) => s + (parseInt(i["TOTAL UNIT"]) || 0), 0);
  const damagedPercent = totalUnitsEver > 0 ? ((totalDamaged / totalUnitsEver) * 100).toFixed(1) : "0.0";

  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card glass"><div class="stat-icon gold"><i class="ri-percent-line"></i></div><div class="stat-label">Stock Sold</div><div class="stat-value">${soldPercent}%</div></div>
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-funds-line"></i></div><div class="stat-label">Revenue Sold</div><div class="stat-value">${revenuePercent}%</div></div>
    <div class="stat-card glass"><div class="stat-icon orange"><i class="ri-hammer-line"></i></div><div class="stat-label">Damaged</div><div class="stat-value">${damagedPercent}%</div></div>
    <div class="stat-card glass"><div class="stat-icon blue"><i class="ri-archive-line"></i></div><div class="stat-label">Total SKUs</div><div class="stat-value">${totalSKUs}</div></div>
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-stack-line"></i></div><div class="stat-label">Remaining Sets</div><div class="stat-value">${remainingSets}</div></div>
    <div class="stat-card glass"><div class="stat-icon indigo"><i class="ri-shopping-bag-3-line"></i></div><div class="stat-label">Sold Sets</div><div class="stat-value">${soldSets}</div></div>
    <div class="stat-card glass"><div class="stat-icon yellow"><i class="ri-error-warning-line"></i></div><div class="stat-label">Low Stock</div><div class="stat-value">${lowStock}</div></div>
    <div class="stat-card glass"><div class="stat-icon red"><i class="ri-close-circle-line"></i></div><div class="stat-label">Out of Stock</div><div class="stat-value">${outOfStock}</div></div>
    <div class="stat-card glass"><div class="stat-icon cyan"><i class="ri-price-tag-3-line"></i></div><div class="stat-label">Stock Value</div><div class="stat-value">${formatCurrency(totalValue)}</div></div>
    <div class="stat-card glass"><div class="stat-icon violet"><i class="ri-money-dollar-circle-line"></i></div><div class="stat-label">Total Sale Value</div><div class="stat-value">${formatCurrency(totalSaleValue)}</div></div>
  `;
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  
  const typeEl = document.getElementById("filterType");
  const nameEl = document.getElementById("filterName");
  const designEl = document.getElementById("filterDesign");
  const colorEl = document.getElementById("filterColor");
  const shadeEl = document.getElementById("filterColorShade");
  const sizeEl = document.getElementById("filterSize");
  const stockEl = document.getElementById("filterStock");

  if (typeEl) typeEl.value = "all";
  if (nameEl) { nameEl.value = "all"; nameEl.classList.add("hidden"); }
  if (designEl) { designEl.value = "all"; designEl.classList.add("hidden"); }
  if (colorEl) colorEl.value = "all";
  if (shadeEl) { shadeEl.value = "all"; shadeEl.classList.add("hidden"); }
  if (sizeEl) sizeEl.value = "all";
  if (stockEl) stockEl.value = "all";

  syncAvailableColors();
  currentPage = 1;
  renderGrid();
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderGrid();
  }
}

function nextPage() {
  currentPage++;
  renderGrid();
}

/**
 * ─── Render Product Grid ──────────────────────────────────────────────────
 */
function renderGrid() {
  const filtered = getFilteredItems();
  renderStats(filtered);

  const grid = document.getElementById("product-grid");
  const paginationControls = document.getElementById("paginationControls");
  grid.innerHTML = "";

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="no-data" style="grid-column:1/-1">No products found matching criteria</div>';
    paginationControls.classList.add("hidden");
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
    const reqCount = parseInt(item["REQUEST"] || item["Request"]) || 0;

    const card = document.createElement("div");
    card.className = `product-card ${isOut ? "out-of-stock" : ""}`;
    card.style.cursor = "pointer";
    card.innerHTML = `
      <div class="product-img">${imgUrl ? `<img src="${imgUrl}" alt="${item.NAME}" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<i class=\\'ri-image-line\\' style=\\'font-size:28px\\'></i>'">` : '<i class="ri-image-line" style="font-size:28px"></i>'}</div>
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
          <span class="stock-badge ${isOut ? "stock-out" : isLow ? "stock-low" : "stock-ok"}">${isOut ? "Out of Stock" : formatStockDisplay(stock, setSize)}</span>
        </div>
        ${isOut ? `<button class="btn btn-sm btn-request" onclick="event.stopPropagation(); requestProduct('${item.SERIAL || item.SKU}')" style="margin-top:8px;width:100%;padding:6px;font-size:12px"><i class="ri-notification-line"></i> Request (${reqCount})</button>` : `<button class="btn btn-sm btn-accent" onclick="event.stopPropagation(); goToPOS('${item.SERIAL || item.SKU}')" style="margin-top:8px;width:100%;padding:6px;font-size:12px"><i class="ri-shopping-cart-line"></i> Add to POS</button>`}
      </div>`;
    card.addEventListener("click", () => openModal(item));
    grid.appendChild(card);
  });

  paginationControls.classList.remove("hidden");
  document.getElementById("pageIndicator").textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prevPageBtn").disabled = currentPage === 1;
  document.getElementById("nextPageBtn").disabled = currentPage === totalPages;
}

/**
 * ─── Product Detail Modal ─────────────────────────────────────────────────
 */
function openModal(item) {
  document.getElementById("modalTitle").textContent = item.NAME + (item.Design ? ` - ${item.Design}` : "");
  const imageLink = typeof item["IMAGE LINK"] === "string" ? item["IMAGE LINK"].trim() : "";
  const imagesField = typeof item.IMAGES === "string" ? item.IMAGES.trim() : "";
  const allImageStrings = [imageLink, imagesField].filter(Boolean).join(",");
  const imageUrls = allImageStrings.split(",").map(u => u.trim()).filter(Boolean).map(u => getFirstImageUrl(u));
  const imagesHtml = imageUrls.length > 0
    ? imageUrls.map((u) => `<img src="${u}" referrerpolicy="no-referrer" style="width:100%;border-radius:8px;margin-bottom:8px" onerror="this.style.display='none'">`).join("")
    : '<div style="text-align:center;padding:20px;color:var(--text-muted)">No images</div>';

  const setSize = parseInt(item["CHURI IN A SET"]) || 12;
  const stock = getStock(item);
  const damaged = parseInt(item["DAMAGED"]) || 0;
  const reqCount = parseInt(item["REQUEST"] || item["Request"]) || 0;

  document.getElementById("modalBody").innerHTML = `
    ${imagesHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group"><label>SERIAL</label><span>${item.SERIAL || item.SKU}</span></div>
      <div class="form-group"><label>SKU Name</label><span style="word-break:break-all;">${item["SKU NAME"] || "-"}</span></div>
      <div class="form-group"><label>Type</label><span>${item.Type || "-"}</span></div>
      <div class="form-group"><label>Name</label><span>${item.NAME}</span></div>
      <div class="form-group"><label>Design</label><span>${item.Design || "-"}</span></div>
      <div class="form-group"><label>Color</label><span>${item.COLOR}</span></div>
      <div class="form-group"><label>Color Shade</label><span>${item["Color Shade"] || "-"}</span></div>
      <div class="form-group"><label>Size</label><span>${item.SIZE}</span></div>
      <div class="form-group"><label>Selling Price</label><span>${formatCurrency(item["SELLING PRICE"])}</span></div>
      <div class="form-group"><label>Last Price (Cost)</label><span>${item["LAST PRICE"] ? formatCurrency(item["LAST PRICE"]) : "-"}</span></div>
      <div class="form-group"><label>Set Quantity</label><span>${item["SET QUANTITY"]}</span></div>
      <div class="form-group"><label>Churi In A Set</label><span>${setSize}</span></div>
      <div class="form-group"><label>Total Unit</label><span>${item["TOTAL UNIT"]}</span></div>
      <div class="form-group"><label>Sold</label><span>${item.SOLD || 0}</span></div>
      <div class="form-group"><label>Damaged</label><span style="color:${damaged > 0 ? 'var(--danger)' : 'var(--text-muted)'};font-weight:${damaged > 0 ? '600' : '400'}">${damaged}</span></div>
      <div class="form-group"><label>Requests</label><span>${reqCount}</span></div>
      <div class="form-group" style="grid-column:span 2;background:rgba(99,102,241,0.08);padding:10px;border-radius:8px;border:1px solid rgba(99,102,241,0.2)">
        <label style="font-size:13px;font-weight:700;color:var(--accent)">Remaining Stock</label>
        <span style="font-size:16px;font-weight:700">${formatStockDisplay(stock, setSize)}</span>
      </div>
    </div>`;
  document.getElementById("productModal").classList.add("open");
}

function closeModal() {
  document.getElementById("productModal").classList.remove("open");
}

document.getElementById("productModal").addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) closeModal();
});

document.getElementById("addModal").addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) closeAddModal();
});

function openAddModal() {
  populateAddModalSuggestions();
  document.getElementById("addModal").classList.add("open");
}

function closeAddModal() {
  document.getElementById("addModal").classList.remove("open");
}

function clearAddForm() {
  document.getElementById("addType").value = "";
  document.getElementById("addName").value = "";
  document.getElementById("addDesign").value = "";
  document.getElementById("addColor").value = "";
  document.getElementById("addShade").value = "";
  document.querySelectorAll(".size-cb").forEach(cb => cb.checked = false);
  document.getElementById("addSetQty").value = "";
  document.getElementById("addChuriInSet").value = "";
  document.getElementById("addLastPrice").value = "";
  document.getElementById("addSellingPrice").value = "";
  document.getElementById("addImages").value = "";
}

/**
 * ─── Save New Product ─────────────────────────────────────────────────────
 */
async function saveNewProduct() {
  const btn = document.getElementById("saveProductBtn");
  const type = document.getElementById("addType").value.trim();
  const name = document.getElementById("addName").value.trim();
  const design = document.getElementById("addDesign").value.trim();
  const color = document.getElementById("addColor").value.trim();
  const shade = document.getElementById("addShade").value.trim();

  const sizeCheckboxes = document.querySelectorAll(".size-cb:checked");
  const sizes = Array.from(sizeCheckboxes).map(cb => cb.value);

  const setQty = parseInt(document.getElementById("addSetQty").value) || 0;
  const churiInSet = parseInt(document.getElementById("addChuriInSet").value) || 0;
  const lastPrice = parseFloat(document.getElementById("addLastPrice").value) || 0;
  const sellingPrice = parseFloat(document.getElementById("addSellingPrice").value) || 0;
  const images = document.getElementById("addImages").value.trim();

  if (!name || !color || sizes.length === 0 || !setQty || !churiInSet || !sellingPrice) {
    showToast("Please fill in Name, Color, Sizes, Quantities, and Selling Price", "error");
    return;
  }

  const totalUnit = setQty * churiInSet;
  const now = new Date();
  const dateStr = now.toISOString();

  const itemsToSave = sizes.map((size) => {
    // Generate clean unique serial
    const serial = "PRD-" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
    // Standard SKU NAME pattern
    const skuName = `${serial}_${type || 'Product'}_${name}${design ? '_' + design : ''}_${color}${shade ? '_' + shade : ''}`;

    return {
      "Date": dateStr,
      "SKU NAME": skuName,
      "SERIAL": serial,
      "Type": type,
      "NAME": name,
      "Design": design,
      "COLOR": color,
      "Color Shade": shade,
      "IMAGE LINK": images.split(",")[0]?.trim() || "",
      "IMAGES": images,
      "SIZE": size,
      "SET QUANTITY": setQty,
      "CHURI IN A SET": churiInSet,
      "TOTAL UNIT": totalUnit,
      "LAST PRICE": lastPrice,
      "SELLING PRICE": sellingPrice,
      "SOLD": 0,
      "DAMAGED": 0,
      "REMAIN UNIT": totalUnit,
      "REQUEST": ""
    };
  });

  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Saving...';

  try {
    const result = await Api.saveInventory({ items: itemsToSave });
    if (!result.success) throw new Error(result.error || "Save failed");

    showToast("Product(s) added successfully!", "success");

    if (!document.getElementById("keepDetailsCheckbox").checked) {
      clearAddForm();
      closeAddModal();
    } else {
      document.getElementById("addColor").value = "";
      document.getElementById("addShade").value = "";
      document.querySelectorAll(".size-cb").forEach(cb => cb.checked = false);
      showToast("Ready for next variation!", "info");
    }

    // Refresh inventory freshly
    const data = await Api.getInventory();
    inventory = data.filter((i) => (i.SKU || i.SERIAL) && i.NAME);
    populateInitialFilters();
    renderGrid();
  } catch (err) {
    showToast(err.message || "Failed to add products", "error");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Save Product";
  }
}

function goToPOS(serial) {
  window.location.href = `pos.html?search=${encodeURIComponent(serial)}`;
}

async function requestProduct(serial) {
  try {
    const result = await Api.requestProduct({ serial });
    if (!result.success) throw new Error(result.error || "Request failed");
    showToast("Product requested!", "success");
    const item = inventory.find(i => String(i.SERIAL || i.SKU) === String(serial));
    if (item) {
      const cur = parseInt(item["REQUEST"] || item["Request"]) || 0;
      item["REQUEST"] = cur + 1;
    }
    renderGrid();
  } catch (err) {
    showToast(err.message || "Request failed", "error");
  }
}
