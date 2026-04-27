/**
 * Mihira POS — Shared Utilities
 * Loaded on every page. Provides API client, sidebar, toasts, and formatters.
 */

const API_URL = window.APP_CONFIG?.API_URL || "";

// Fields that change frequently and must always be fresh from the sheet
const FRESH_FIELDS = ["SET QUANTITY", "SOLD", "TOTAL UNIT"];
const CACHE_KEY_INVENTORY = "mihira_inventory_cache";
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes for product details

const Api = {
  async get(action) {
    const response = await fetch(`${API_URL}?action=${action}&_t=${Date.now()}`, { redirect: "follow" });
    return response.json();
  },

  async post(action, payload) {
    const response = await fetch(API_URL, {
      method: "POST",
      redirect: "follow",
      body: JSON.stringify({ action, payload }),
    });
    return response.json();
  },

  // Cached inventory: renders instantly from cache, then merges fresh stock data
  async getInventory() {
    const cached = this._loadCache();
    const freshData = await this.get("getInventory");

    // If cache exists, merge fresh stock fields into cached product details
    if (cached && cached.length > 0) {
      const freshMap = {};
      freshData.forEach(row => {
        const key = String(row.SERIAL || row.SKU);
        freshMap[key] = row;
      });

      // Update cached items with fresh stock and detect new products
      const updatedCache = freshData.map(freshRow => {
        const key = String(freshRow.SERIAL || freshRow.SKU);
        const cachedRow = cached.find(c => String(c.SERIAL || c.SKU) === key);
        if (!cachedRow) return freshRow;
        // Keep cached product details, overlay fresh stock fields
        const merged = { ...cachedRow };
        FRESH_FIELDS.forEach(f => { merged[f] = freshRow[f]; });
        return merged;
      });

      this._saveCache(updatedCache);
      return updatedCache;
    }

    // No cache — save fresh data as the new cache
    this._saveCache(freshData);
    return freshData;
  },

  // Returns cached inventory with sold/stock fields cleared out
  // so stale quantities are never displayed before fresh data arrives
  getCachedInventory() {
    const cached = this._loadCache();
    if (!cached) return null;
    return cached.map(row => {
      const clean = { ...row };
      FRESH_FIELDS.forEach(f => { delete clean[f]; });
      return clean;
    });
  },

  _loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY_INVENTORY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > CACHE_MAX_AGE_MS) return null;
      return parsed.data;
    } catch (e) { return null; }
  },

  _saveCache(data) {
    try {
      localStorage.setItem(CACHE_KEY_INVENTORY, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {}
  },

  getCustomers() { return this.get("getCustomers"); },
  getOrders()    { return this.get("getOrders"); },

  saveOrder(payload)    { return this.post("saveOrder", payload); },
  updateOrder(payload)  { return this.post("updateOrder", payload); },
  saveCustomer(payload) { return this.post("saveCustomer", payload); },
  saveInventory(payload) { return this.post("saveInventory", payload); },
  requestProduct(payload) { return this.post("requestProduct", payload); },
  processReturn(payload) { return this.post("processReturn", payload); },
  checkRebuild(payload)  { return this.post("checkRebuild", payload); },
  executeRebuild(payload) { return this.post("executeRebuild", payload); },
  getReturns()    { return this.get("getReturns"); },
  getDamagedStock() { return this.get("getDamagedStock"); },
};

// Available stock = SET QUANTITY - SOLD (never mutate SET QUANTITY)
function getStock(item) {
  const setQty = parseInt(item["SET QUANTITY"]) || 0;
  const sold = parseInt(item["SOLD"]) || 0;
  return Math.max(0, setQty - sold);
}

// ─── Toast Notifications ────────────────────────────────
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const iconMap = {
    success: "ri-checkbox-circle-fill",
    error: "ri-error-warning-fill",
    info: "ri-information-fill",
  };

  toast.innerHTML = `
    <i class="${iconMap[type] || iconMap.info}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s forwards reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Currency Formatter ─────────────────────────────────
function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return "৳" + num.toLocaleString("en-BD", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Sidebar ────────────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  if (!sidebar || !toggle) return;

  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  // Highlight active nav link based on current page filename
  const currentPage = window.location.pathname.split("/").pop() || "pos.html";
  const links = sidebar.querySelectorAll(".nav-link");
  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentPage) {
      link.classList.add("active");
    }
  });
}

// ─── Sidebar HTML (injected into each page) ─────────────
function renderSidebar() {
  const sidebarEl = document.getElementById("sidebar");
  if (!sidebarEl) return;

  sidebarEl.innerHTML = `
    <div class="sidebar-brand">
      <span class="brand-icon">💎</span>
      <span class="brand-text">Mihira</span>
    </div>
    <nav class="sidebar-nav">
      <a href="pos.html" class="nav-link" data-tooltip="POS">
        <i class="ri-shopping-cart-2-line"></i>
        <span>POS</span>
      </a>
      <a href="inventory.html" class="nav-link" data-tooltip="Inventory">
        <i class="ri-archive-line"></i>
        <span>Inventory</span>
      </a>
      <a href="orders.html" class="nav-link" data-tooltip="Orders">
        <i class="ri-file-list-3-line"></i>
        <span>Orders</span>
      </a>
      <a href="customers.html" class="nav-link" data-tooltip="Customers">
        <i class="ri-user-heart-line"></i>
        <span>Customers</span>
      </a>
      <a href="analytics.html" class="nav-link" data-tooltip="Analytics">
        <i class="ri-bar-chart-grouped-line"></i>
        <span>Analytics</span>
      </a>
    </nav>
    <button id="sidebar-toggle" class="sidebar-toggle-btn" title="Toggle Sidebar">
      <i class="ri-menu-fold-line"></i>
    </button>
  `;

  initSidebar();
}

// ─── Extract Unique Filter Values ───────────────────────
function extractUniqueValues(data, key) {
  const values = new Set();
  data.forEach((item) => {
    const val = String(item[key] || "").trim();
    if (val) values.add(val);
  });
  return Array.from(values).sort();
}

// ─── Populate a <select> Dropdown ───────────────────────
function populateDropdown(selectElement, values, allLabel = "All") {
  selectElement.innerHTML = `<option value="all">${allLabel}</option>`;
  values.forEach((val) => {
    const option = document.createElement("option");
    option.value = val;
    option.textContent = val;
    selectElement.appendChild(option);
  });
}

// ─── Get First Image URL from Comma-Separated String ────
function getFirstImageUrl(...fields) {
  let finalStr = "";
  for (const field of fields) {
    if (typeof field === "string" && field.trim()) {
      finalStr = field.trim();
      break;
    }
  }
  
  if (!finalStr) return "";
  if (finalStr.includes(",")) finalStr = finalStr.split(",")[0].trim();

  // Convert Google Drive view links to direct embeddable thumbnail links
  try {
    const match = finalStr.match(new RegExp("/file/d/([a-zA-Z0-9_-]+)"));
    if (match) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
    }
    const match2 = finalStr.match(new RegExp("[?&]id=([a-zA-Z0-9_-]+)"));
    if (match2 && finalStr.includes("drive.google.com")) {
      return `https://drive.google.com/thumbnail?id=${match2[1]}&sz=w1000`;
    }
  } catch (e) {}

  return finalStr;
}

// ─── Status Badge Helper ────────────────────────────────
function createBadge(text, type) {
  const badgeMap = {
    Pending: "badge-warning",
    Dispatched: "badge-info",
    Delivered: "badge-success",
    Returned: "badge-danger",
    Paid: "badge-success",
    Unpaid: "badge-danger",
    Partial: "badge-warning",
  };
  const cls = badgeMap[text] || "badge-default";
  return `<span class="badge ${cls}">${text}</span>`;
}

// ─── Init on DOM Ready ──────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderSidebar();
});
