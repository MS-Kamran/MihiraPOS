/**
 * Inventory Page — Stats, Grid, Detail Modal
 */
let inventory = [];
let currentPage = 1;
const itemsPerPage = 20;

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("searchInput").addEventListener("input", () => { currentPage = 1; renderGrid(); });
  document.getElementById("filterName").addEventListener("change", () => { currentPage = 1; renderGrid(); });
  document.getElementById("filterColor").addEventListener("change", () => { currentPage = 1; renderGrid(); });
  document.getElementById("filterSize").addEventListener("change", () => { currentPage = 1; renderGrid(); });
  document.getElementById("filterStock").addEventListener("change", () => { currentPage = 1; renderGrid(); });

  // Instant render from cache while fresh data loads
  const cached = Api.getCachedInventory();
  if (cached) {
    inventory = cached.filter((i) => (i.SKU || i.SERIAL) && i.NAME);
    populateFiltersAndRender();
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("product-grid").classList.remove("hidden");
  }

  try {
    const data = await Api.getInventory();
    inventory = data.filter((i) => (i.SKU || i.SERIAL) && i.NAME);
    populateFiltersAndRender();
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("product-grid").classList.remove("hidden");
  } catch (err) {
    if (!cached) showToast("Failed to load inventory", "error");
  }
});

function populateFiltersAndRender() {
  populateDropdown(document.getElementById("filterName"), extractUniqueValues(inventory, "NAME"), "All Designs");
  populateDropdown(document.getElementById("filterColor"), extractUniqueValues(inventory, "COLOR"), "All Colors");
  populateDropdown(document.getElementById("filterSize"), extractUniqueValues(inventory, "SIZE"), "All Sizes");
  populateSuggestions();
  renderStats();
  renderGrid();
}

function populateSuggestions() {
  const nameList = document.getElementById("nameSuggestions");
  const colorList = document.getElementById("colorSuggestions");
  
  const names = extractUniqueValues(inventory, "NAME");
  const colors = extractUniqueValues(inventory, "COLOR");
  
  nameList.innerHTML = names.map(n => `<option value="${n}">`).join("");
  colorList.innerHTML = colors.map(c => `<option value="${c}">`).join("");
}

function renderStats() {
  const totalSKUs = inventory.length;
  const totalStock = inventory.reduce((s, i) => s + getStock(i), 0);
  const lowStock = inventory.filter((i) => { const q = getStock(i); return q > 0 && q < 5; }).length;
  const totalValue = inventory.reduce((s, i) => s + (parseFloat(i["SELLING PRICE"]) || 0) * getStock(i), 0);
  const outOfStock = inventory.filter((i) => getStock(i) <= 0).length;

  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card glass"><div class="stat-icon blue"><i class="ri-archive-line"></i></div><div class="stat-label">Total SKUs</div><div class="stat-value">${totalSKUs}</div></div>
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-stack-line"></i></div><div class="stat-label">Total Stock</div><div class="stat-value">${totalStock}</div></div>
    <div class="stat-card glass"><div class="stat-icon yellow"><i class="ri-error-warning-line"></i></div><div class="stat-label">Low Stock</div><div class="stat-value">${lowStock}</div></div>
    <div class="stat-card glass"><div class="stat-icon red"><i class="ri-close-circle-line"></i></div><div class="stat-label">Out of Stock</div><div class="stat-value">${outOfStock}</div></div>
    <div class="stat-card glass"><div class="stat-icon cyan"><i class="ri-money-dollar-circle-line"></i></div><div class="stat-label">Total Value</div><div class="stat-value">${formatCurrency(totalValue)}</div></div>
  `;
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterName").value = "all";
  document.getElementById("filterColor").value = "all";
  document.getElementById("filterSize").value = "all";
  document.getElementById("filterStock").value = "all";
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

function renderGrid() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const name = document.getElementById("filterName").value;
  const color = document.getElementById("filterColor").value;
  const size = document.getElementById("filterSize").value;
  const stockFilter = document.getElementById("filterStock").value;
  const grid = document.getElementById("product-grid");

  const filtered = inventory.filter((item) => {
    const idField = item.SERIAL || item.SKU || "";
    const ms = !search || String(idField).toLowerCase().includes(search) || String(item.NAME).toLowerCase().includes(search) || String(item.COLOR).toLowerCase().includes(search);
    
    let stockMatch = true;
    const itemStock = getStock(item);
    if (stockFilter === "in_stock") stockMatch = itemStock > 0;
    else if (stockFilter === "low_stock") stockMatch = itemStock > 0 && itemStock < 5;
    else if (stockFilter === "out_of_stock") stockMatch = itemStock <= 0;

    return ms && stockMatch && (name === "all" || item.NAME === name) && (color === "all" || item.COLOR === color) && (size === "all" || String(item.SIZE) === size);
  });

  grid.innerHTML = "";
  const paginationControls = document.getElementById("paginationControls");

  if (filtered.length === 0) { 
    grid.innerHTML = '<div class="no-data" style="grid-column:1/-1">No products found</div>'; 
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
    const isOut = stock <= 0;
    const isLow = stock > 0 && stock < 5;
    const imgUrl = getFirstImageUrl(item["IMAGE LINK"], item.IMAGES);
    const reqCount = parseInt(item["Request"]) || 0;

    const card = document.createElement("div");
    card.className = `product-card ${isOut ? "out-of-stock" : ""}`;
    card.style.cursor = "pointer";
    card.innerHTML = `
      <div class="product-img">${imgUrl ? `<img src="${imgUrl}" alt="${item.NAME}" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<i class=\\'ri-image-line\\' style=\\'font-size:28px\\'></i>'">` : '<i class="ri-image-line" style="font-size:28px"></i>'}</div>
      <div class="product-info">
        <h3>${item.NAME}</h3>
        <div class="product-meta"><span>${item.COLOR}</span><span class="size-badge">Size ${item.SIZE}</span></div>
        <div class="product-footer">
          <span class="product-price">${formatCurrency(price)}</span>
          <span class="stock-badge ${isOut ? "stock-out" : isLow ? "stock-low" : "stock-ok"}">${isOut ? "Out of Stock" : "Stk: " + stock}</span>
        </div>
        ${isOut ? `<button class="btn btn-sm btn-request" onclick="event.stopPropagation(); requestProduct('${item.SERIAL || item.SKU}')" style="margin-top:8px;width:100%;padding:6px;font-size:12px"><i class="ri-notification-line"></i> Request (${reqCount})</button>` : `<button class="btn btn-sm btn-accent" onclick="event.stopPropagation(); goToPOS('${item.SERIAL || item.SKU}')" style="margin-top:8px;width:100%;padding:6px;font-size:12px"><i class="ri-shopping-cart-line"></i> Add to POS</button>`}
      </div>`;
    card.addEventListener("click", () => openModal(item));
    grid.appendChild(card);
  });

  // Pagination controls
  paginationControls.classList.remove("hidden");
  document.getElementById("pageIndicator").textContent = `Page ${currentPage} of ${totalPages}`;
  document.getElementById("prevPageBtn").disabled = currentPage === 1;
  document.getElementById("nextPageBtn").disabled = currentPage === totalPages;
}

function openModal(item) {
  document.getElementById("modalTitle").textContent = item.NAME;
  const imageLink = typeof item["IMAGE LINK"] === "string" ? item["IMAGE LINK"].trim() : "";
  const imagesField = typeof item.IMAGES === "string" ? item.IMAGES.trim() : "";
  const allImageStrings = [imageLink, imagesField].filter(Boolean).join(",");
  const imageUrls = allImageStrings.split(",").map(u => u.trim()).filter(Boolean).map(u => getFirstImageUrl(u));
  const imagesHtml = imageUrls.length > 0
    ? imageUrls.map((u) => `<img src="${u}" referrerpolicy="no-referrer" style="width:100%;border-radius:8px;margin-bottom:8px" onerror="this.style.display='none'">`).join("")
    : '<div style="text-align:center;padding:20px;color:var(--text-muted)">No images</div>';

  document.getElementById("modalBody").innerHTML = `
    ${imagesHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group"><label>SERIAL</label><span>${item.SERIAL || item.SKU}</span></div>
      <div class="form-group"><label>SKU Name</label><span>${item["SKU NAME"] || "-"}</span></div>
      <div class="form-group"><label>Design</label><span>${item.NAME}</span></div>
      <div class="form-group"><label>Color</label><span>${item.COLOR}</span></div>
      <div class="form-group"><label>Size</label><span>${item.SIZE}</span></div>
      <div class="form-group"><label>Selling Price</label><span>${formatCurrency(item["SELLING PRICE"])}</span></div>
      <div class="form-group"><label>Last Price</label><span>${formatCurrency(item["LAST PRICE"])}</span></div>
      <div class="form-group"><label>Set Quantity</label><span>${item["SET QUANTITY"]}</span></div>
      <div class="form-group"><label>Churi In A Set</label><span>${item["CHURI IN A SET"]}</span></div>
      <div class="form-group"><label>Total Unit</label><span>${item["TOTAL UNIT"]}</span></div>
      <div class="form-group"><label>Sold</label><span>${item.SOLD || 0}</span></div>
    </div>`;
  document.getElementById("productModal").classList.add("open");
}

function closeModal() {
  document.getElementById("productModal").classList.remove("open");
}

// Close modal on overlay click
document.getElementById("productModal").addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) closeModal();
});

document.getElementById("addModal").addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) closeAddModal();
});

function openAddModal() {
  document.getElementById("addModal").classList.add("open");
}

function closeAddModal() {
  document.getElementById("addModal").classList.remove("open");
}

function clearAddForm() {
  document.getElementById("addName").value = "";
  document.getElementById("addColor").value = "";
  document.querySelectorAll(".size-cb").forEach(cb => cb.checked = false);
  document.getElementById("addSetQty").value = "";
  document.getElementById("addChuriInSet").value = "";
  document.getElementById("addLastPrice").value = "";
  document.getElementById("addSellingPrice").value = "";
  document.getElementById("addImages").value = "";
}

async function saveNewProduct() {
  const btn = document.getElementById("saveProductBtn");
  const name = document.getElementById("addName").value.trim();
  const color = document.getElementById("addColor").value.trim();
  
  const sizeCheckboxes = document.querySelectorAll(".size-cb:checked");
  const sizes = Array.from(sizeCheckboxes).map(cb => cb.value);

  const setQty = parseInt(document.getElementById("addSetQty").value) || 0;
  const churiInSet = parseInt(document.getElementById("addChuriInSet").value) || 0;
  const lastPrice = parseFloat(document.getElementById("addLastPrice").value) || 0;
  const sellingPrice = parseFloat(document.getElementById("addSellingPrice").value) || 0;
  const images = document.getElementById("addImages").value.trim();

  if (!name || !color || sizes.length === 0 || !setQty || !churiInSet || !sellingPrice) {
    showToast("Please fill in all required fields and select at least one size", "error");
    return;
  }

  const totalUnit = setQty * churiInSet;
  const now = new Date();
  const dateTimeStr = now.toLocaleDateString() + " " + now.toLocaleTimeString();

  const itemsToSave = sizes.map((size) => {
    // Generate a unique serial: PRD-TIMESTAMP-RANDOM
    const serial = "PRD-" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
    const skuName = `${name} - ${color} - ${size}`;

    return {
      "Date Time": dateTimeStr,
      "SKU NAME": skuName,
      "SERIAL": serial,
      "NAME": name,
      "COLOR": color,
      "IMAGE LINK": images.split(",")[0] || "",
      "IMAGES": images,
      "SIZE": size,
      "SET QUANTITY": setQty,
      "CHURI IN A SET": churiInSet,
      "TOTAL UNIT": totalUnit,
      "LAST PRICE": lastPrice,
      "SELLING PRICE": sellingPrice,
      "SOLD": 0
    };
  });

  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Saving...';

  try {
    const result = await Api.saveInventory({ items: itemsToSave });
    if (!result.success) throw new Error(result.error || "Save failed");

    showToast("Products added successfully!", "success");
    
    if (!document.getElementById("keepDetailsCheckbox").checked) {
      clearAddForm();
      closeAddModal();
    } else {
      // Keep Name, Price, Qty. Just clear Color and Sizes for rapid variation entry.
      document.getElementById("addColor").value = "";
      document.querySelectorAll(".size-cb").forEach(cb => cb.checked = false);
      showToast("Ready for next variation!", "info");
    }

    // Reload inventory
    const data = await Api.getInventory();
    inventory = data.filter((i) => (i.SKU || i.SERIAL) && i.NAME);
    populateSuggestions();
    renderStats();
    renderGrid();
  } catch (err) {
    showToast(err.message || "Failed to add products", "error");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Save Product";
  }
}

// Navigate to POS with product pre-searched
function goToPOS(serial) {
  window.location.href = `pos.html?search=${encodeURIComponent(serial)}`;
}

// Request an out-of-stock product
async function requestProduct(serial) {
  try {
    const result = await Api.requestProduct({ serial });
    if (!result.success) throw new Error(result.error || "Request failed");
    showToast("Product requested!", "success");
    // Update local state
    const item = inventory.find(i => String(i.SERIAL || i.SKU) === String(serial));
    if (item) item["Request"] = (parseInt(item["Request"]) || 0) + 1;
    renderGrid();
  } catch (err) {
    showToast(err.message || "Request failed", "error");
  }
}
