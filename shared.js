/**
 * Mihira POS — Shared Utilities
 * Loaded on every page. Provides API client, sidebar, toasts, and formatters.
 */

const API_URL = window.APP_CONFIG?.API_URL || "";

// Fields that change frequently and must always be fresh from the sheet
const FRESH_FIELDS = ["SET QUANTITY", "SOLD", "TOTAL UNIT"];
const CACHE_KEY_INVENTORY = "mihira_inventory_cache";
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes for product details

// ─── Apply Theme Immediately ──────────────────────────────
if (localStorage.getItem("mihira_theme") === "dark") {
  document.documentElement.setAttribute("data-theme", "dark");
}

const Api = {
  async get(action) {
    const response = await fetch(`${API_URL}?action=${action}&_t=${Date.now()}`, { 
      redirect: "follow",
      cache: "no-store"
    });
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

  // Always returns fresh data from the sheet; cache is only for instant skeleton renders
  async getInventory() {
    const freshData = await this.get("getInventory");
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
};

// Available stock = TOTAL UNIT - SOLD - DAMAGED (never mutate TOTAL UNIT)
function getStock(item) {
  const totalQty = parseInt(item["TOTAL UNIT"]) || 0;
  const sold = parseInt(item["SOLD"]) || 0;
  const damaged = parseInt(item["DAMAGED"]) || 0;
  return Math.max(0, totalQty - sold - damaged);
}

// Format stock into Sets and Pieces (e.g. "10 Sets + 9 Pcs")
function formatStockDisplay(totalPieces, setSize) {
  if (!setSize || setSize <= 1) return `${totalPieces} Pcs`;
  const sets = Math.floor(totalPieces / setSize);
  const pieces = totalPieces % setSize;
  if (sets === 0 && pieces === 0) return "0";
  if (sets === 0) return `${pieces} Pcs`;
  if (pieces === 0) return `<span style="color:var(--accent);font-weight:700">${sets} Sets</span>`;
  return `<span style="color:var(--accent);font-weight:700">${sets} Sets</span> + ${pieces} Pcs`;
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

// ─── Date Parser (shared across orders + analytics) ─────
function parseOrderDate(dateStr) {
  if (!dateStr) return null;
  // Handle DD/MM/YYYY or DD-MM-YYYY
  if (typeof dateStr === "string" && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(dateStr)) {
    const parts = dateStr.split(/[\/\-]/);
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
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
    <div class="sidebar-brand" style="cursor:pointer;" onclick="window.location.href='pos.html'" title="Go to POS">
      <img src="Logo/MihiraLogo.png" alt="Mihira" style="width:36px;height:36px;border-radius:6px;">
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
    <div class="sidebar-footer-actions">
      <button id="theme-toggle" class="nav-link" style="width:100%; background:transparent; border:none; cursor:pointer;" title="Toggle Theme">
        <i class="ri-moon-line" id="theme-icon"></i>
        <span>Dark Theme</span>
      </button>
      <button class="nav-link" onclick="clearSystemCache()" style="background:transparent; border:none; width:100%; cursor:pointer; text-align:left; padding:12px 16px; border-radius:8px; display:flex; align-items:center; gap:12px;" data-tooltip="Clear Cache">
        <i class="ri-refresh-line" style="font-size:20px; color:var(--text-muted);"></i>
        <span style="font-weight:500;">Clear Cache</span>
      </button>
    </div>
    <!-- Mobile-only: expandable settings drawer -->
    <div class="mobile-settings-drawer">
      <button id="mobileSettingsToggle" class="mobile-settings-toggle" title="Settings">
        <i class="ri-settings-3-line"></i>
      </button>
      <div id="mobileSettingsPanel" class="mobile-settings-panel">
        <button id="theme-toggle-mobile" class="nav-link" style="width:100%; background:transparent; border:none; cursor:pointer;" title="Toggle Theme">
          <i class="ri-moon-line" id="theme-icon-mobile"></i>
          <span>Theme</span>
        </button>
        <button class="nav-link" onclick="clearSystemCache()" style="background:transparent; border:none; width:100%; cursor:pointer;" data-tooltip="Clear Cache">
          <i class="ri-refresh-line"></i>
          <span>Cache</span>
        </button>
      </div>
    </div>
    <button id="sidebar-toggle" class="sidebar-toggle-btn" title="Toggle Sidebar">
      <i class="ri-menu-fold-line"></i>
    </button>
  `;

  initSidebar();
  initThemeToggle();
  initMobileSettingsDrawer();
}

// ─── Theme Toggle Logic ─────────────────────────────────
function initThemeToggle() {
  const currentTheme = localStorage.getItem("mihira_theme") || "light";

  function applyTheme(isDark) {
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("mihira_theme", isDark ? "dark" : "light");
    syncThemeButtons(isDark);
  }

  function syncThemeButtons(isDark) {
    // Desktop button
    const icon = document.getElementById("theme-icon");
    const btn = document.getElementById("theme-toggle");
    if (icon) icon.className = isDark ? "ri-sun-line" : "ri-moon-line";
    if (btn) {
      const span = btn.querySelector("span");
      if (span) span.textContent = isDark ? "Light Theme" : "Dark Theme";
    }
    // Mobile button
    const iconM = document.getElementById("theme-icon-mobile");
    const btnM = document.getElementById("theme-toggle-mobile");
    if (iconM) iconM.className = isDark ? "ri-sun-line" : "ri-moon-line";
    if (btnM) {
      const spanM = btnM.querySelector("span");
      if (spanM) spanM.textContent = isDark ? "Light" : "Dark";
    }
  }

  // Set initial state
  syncThemeButtons(currentTheme === "dark");

  // Wire desktop toggle
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      applyTheme(!isDark);
    });
  }

  // Wire mobile toggle
  const btnM = document.getElementById("theme-toggle-mobile");
  if (btnM) {
    btnM.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      applyTheme(!isDark);
    });
  }
}

// ─── Mobile Settings Drawer (expandable arrow) ──────────
function initMobileSettingsDrawer() {
  const toggle = document.getElementById("mobileSettingsToggle");
  const panel = document.getElementById("mobileSettingsPanel");
  if (!toggle || !panel) return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.toggle("open");
    toggle.querySelector("i").className = isOpen ? "ri-close-line" : "ri-settings-3-line";
  });

  // Close when tapping outside on mobile
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && !toggle.contains(e.target)) {
      panel.classList.remove("open");
      toggle.querySelector("i").className = "ri-settings-3-line";
    }
  });
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
    Packed: "badge-info",
    Dispatched: "badge-info",
    Delivered: "badge-success",
    Returned: "badge-danger",
    Cancelled: "badge-default",
    Paid: "badge-success",
    Unpaid: "badge-danger",
    Partial: "badge-warning",
  };
  const cls = badgeMap[text] || "badge-default";
  return `<span class="badge ${cls}">${text}</span>`;
}

// ─── PWA & Notifications ─────────────────────────────────
function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.error('Service Worker registration failed', err));
  }
}

function requestNotificationPermission() {
  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }
}

function sendNotification(title, options) {
  if ('Notification' in window && Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  }
}

// Polling for new orders
let lastKnownOrderCount = null;
function startOrderPolling() {
  // Check every 3 minutes
  setInterval(async () => {
    try {
      const orders = await Api.getOrders();
      if (lastKnownOrderCount === null) {
        lastKnownOrderCount = orders.length;
        return;
      }
      if (orders.length > lastKnownOrderCount) {
        const newOrdersCount = orders.length - lastKnownOrderCount;
        const latestOrder = orders[orders.length - 1]; 
        sendNotification('New Order Received! 🛍️', {
          body: `You have ${newOrdersCount} new order(s)! Latest: ${latestOrder.customer_name}`,
          icon: '/Logo/MihiraLogo.png',
          badge: '/Logo/MihiraLogo.png'
        });
        showToast(`🔔 ${newOrdersCount} new order(s) received!`);
        lastKnownOrderCount = orders.length;
        
        // Refresh local dashboard if we are on orders page
        if (window.location.pathname.includes('orders.html') && typeof loadOrders === 'function') {
           loadOrders();
        }
      }
    } catch (e) {}
  }, 3 * 60 * 1000); 
}

window.clearSystemCache = async function() {
  if (confirm("Clear all cache and reload the system freshly from the server?")) {
    // 1. Clear LocalStorage caches
    localStorage.removeItem(CACHE_KEY_INVENTORY);
    
    // 2. Clear Browser Cache Storage (Service Worker Caches)
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      } catch (e) {}
    }
    
    // 3. Unregister Service Workers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      } catch (e) {}
    }
    
    // 4. Force reload page
    window.location.reload();
  }
};

// ─── Init on DOM Ready ──────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderSidebar();
  initPWA();
  
  // Request permission upon interaction to avoid aggressive popups
  document.body.addEventListener('click', () => {
    requestNotificationPermission();
  }, { once: true });
  
  // Setup baseline order count immediately
  Api.getOrders().then(o => lastKnownOrderCount = o.length).catch(e => {});
  startOrderPolling();
});
