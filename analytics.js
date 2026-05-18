/**
 * Analytics Page — KPIs + Charts powered by Chart.js
 * Includes: Today/Week/Month/All filters, Sets Sold, Daily Revenue,
 * Top Customers, Revenue vs Collection, and more.
 */
let allOrders = [];
let allInventory = [];
let charts = {};

const chartColors = {
  primary: "#c9a882", accent: "#d4b896", success: "#10b981",
  warning: "#f59e0b", danger: "#ef4444", info: "#06b6d4",
  purple: "#8b5cf6", pink: "#ec4899", orange: "#f97316",
  lime: "#84cc16", teal: "#14b8a6",
};
const palette = Object.values(chartColors);

// Chart.js global defaults for dark teal theme
Chart.defaults.color = "#8a9a8a";
Chart.defaults.borderColor = "rgba(201,168,130,0.08)";
Chart.defaults.font.family = "Inter";

document.addEventListener("DOMContentLoaded", async () => {
  setupPresets();
  document.getElementById("dateFrom").addEventListener("change", refresh);
  document.getElementById("dateTo").addEventListener("change", refresh);

  try {
    const [ordersData, invData] = await Promise.all([
      Api.getOrders(),
      Api.getInventory()
    ]);
    allOrders = ordersData;
    allInventory = invData;
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("analyticsContent").classList.remove("hidden");
    refresh();
  } catch (err) {
    showToast("Failed to load data", "error");
  }
});

function setupPresets() {
  document.querySelectorAll("#presetTabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector("#presetTabs .tab-btn.active").classList.remove("active");
      btn.classList.add("active");
      const preset = btn.dataset.preset;
      const now = new Date();
      const from = document.getElementById("dateFrom");
      const to = document.getElementById("dateTo");

      if (preset === "today") {
        from.value = formatDateInput(now);
        to.value = formatDateInput(now);
      } else if (preset === "week") {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        from.value = formatDateInput(weekAgo); to.value = formatDateInput(now);
      } else if (preset === "month") {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        from.value = formatDateInput(monthStart); to.value = formatDateInput(now);
      } else {
        from.value = ""; to.value = "";
      }
      refresh();
    });
  });
}

function formatDateInput(d) {
  return d.toISOString().split("T")[0];
}

function getFilteredOrders() {
  const fromVal = document.getElementById("dateFrom").value;
  const toVal = document.getElementById("dateTo").value;

  if (!fromVal && !toVal) return allOrders;

  return allOrders.filter((o) => {
    const orderDate = parseOrderDate(o.date);
    if (!orderDate) return true;
    if (fromVal && orderDate < new Date(fromVal)) return false;
    if (toVal) { const toDate = new Date(toVal); toDate.setHours(23,59,59); if (orderDate > toDate) return false; }
    return true;
  });
}

function parseOrderDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// Parse comma-separated quantities correctly
function sumQuantities(qtyStr) {
  return String(qtyStr || "0").split(",").reduce((sum, q) => sum + (parseInt(q.trim()) || 0), 0);
}

function refresh() {
  const data = getFilteredOrders();
  const validSalesData = data.filter(r => r.delivery_status !== "Returned");

  renderKPIs(validSalesData);
  renderDailyChart(validSalesData);
  renderMonthlyChart(validSalesData);
  renderTopProducts(validSalesData);
  renderColorsChart(validSalesData);
  renderTopCustomers(validSalesData);
  renderRevenueVsCollection(validSalesData);
  renderDeliveryChart(data);
  renderPaymentChart(data);
  renderLowStockAlerts();
}

// ─── Low Stock Alerts ───────────────────────────────────
function renderLowStockAlerts() {
  const container = document.getElementById("lowStockList");
  if (!container) return;
  container.innerHTML = "";

  const lowStockItems = allInventory.filter(item => {
    const remaining = getStock(item);
    return remaining > 0 && remaining <= 5;
  }).sort((a, b) => getStock(a) - getStock(b));

  if (lowStockItems.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">No items are currently low on stock.</span>';
    return;
  }

  lowStockItems.forEach(item => {
    const rem = getStock(item);
    const imgUrl = getFirstImageUrl(item["IMAGE LINK"], item.IMAGES);
    const div = document.createElement("div");
    div.style.cssText = "min-width:120px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:3px;align-items:center;";
    div.innerHTML = `
      ${imgUrl ? `<img src="${imgUrl}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;" referrerpolicy="no-referrer">` : '<i class="ri-image-line" style="font-size:20px;color:rgba(239,68,68,0.4)"></i>'}
      <div style="font-size:11px;font-weight:600;text-align:center;color:var(--text);">${item.NAME}</div>
      <div style="font-size:10px;color:var(--text-muted);">${item.COLOR} · Sz ${item.SIZE}</div>
      <div style="font-size:12px;font-weight:700;color:#ef4444;">${rem} Left</div>
    `;
    container.appendChild(div);
  });
}

// ─── KPIs ───────────────────────────────────────────────
function renderKPIs(data) {
  const uniqueOrders = new Set(data.map((r) => r.order_id));
  const totalRevenue = data.reduce((s, r) => s + (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0), 0);
  const aov = uniqueOrders.size > 0 ? totalRevenue / uniqueOrders.size : 0;

  // Sets Sold: sum per-item quantities and divide by set size from inventory
  let totalSetsSold = 0;
  data.forEach(r => {
    const serials = String(r.serial || "").split(",").map(s => s.trim()).filter(Boolean);
    const qtys = String(r.quantity || "0").split(",").map(s => parseInt(s.trim()) || 0);
    serials.forEach((serial, idx) => {
      let qty = qtys[idx] || qtys[0] || 0;
      const invItem = allInventory.find(i => String(i.SERIAL) === serial);
      const setSize = invItem ? (parseInt(invItem["CHURI IN A SET"]) || 1) : 1;
      // Reject corrupted qty values (>500 pieces per line item is unrealistic)
      if (qty > 500 || qty <= 0) qty = setSize;
      totalSetsSold += qty / setSize;
    });
  });
  totalSetsSold = Math.round(totalSetsSold);

  const pendingCollection = data.filter((r) => r.payment_status !== "Paid").reduce((s, r) => s + (parseFloat(r.due_amount) || 0), 0);
  const totalPaid = data.reduce((s, r) => s + (parseFloat(r.paid_amount) || 0), 0);

  // Repeat customers (>1 order)
  const customerOrderCount = {};
  data.forEach(r => {
    const phone = r.customer_phone || r.customer_id;
    if (phone) customerOrderCount[phone] = (customerOrderCount[phone] || 0) + 1;
  });
  const repeatCustomers = Object.values(customerOrderCount).filter(c => c > 1).length;

  // Today's stats
  const todayStr = formatDateInput(new Date());
  const todayOrders = data.filter(r => {
    const d = parseOrderDate(r.date);
    return d && formatDateInput(d) === todayStr;
  });
  const todayRevenue = todayOrders.reduce((s, r) => s + (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0), 0);
  const todayOrderCount = new Set(todayOrders.map(r => r.order_id)).size;

  document.getElementById("kpiRow").innerHTML = `
    <div class="stat-card glass"><div class="stat-icon gold"><i class="ri-calendar-check-line"></i></div><div class="stat-label">Today's Revenue</div><div class="stat-value">${formatCurrency(todayRevenue)}</div></div>
    <div class="stat-card glass"><div class="stat-icon cyan"><i class="ri-shopping-bag-line"></i></div><div class="stat-label">Today's Orders</div><div class="stat-value">${todayOrderCount}</div></div>
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-money-dollar-circle-line"></i></div><div class="stat-label">Total Revenue</div><div class="stat-value">${formatCurrency(totalRevenue)}</div></div>
    <div class="stat-card glass"><div class="stat-icon blue"><i class="ri-line-chart-line"></i></div><div class="stat-label">AOV</div><div class="stat-value">${formatCurrency(aov)}</div></div>
    <div class="stat-card glass"><div class="stat-icon cyan"><i class="ri-file-list-3-line"></i></div><div class="stat-label">Total Orders</div><div class="stat-value">${uniqueOrders.size}</div></div>
    <div class="stat-card glass"><div class="stat-icon yellow"><i class="ri-stack-line"></i></div><div class="stat-label">Sets Sold</div><div class="stat-value">${totalSetsSold}</div></div>
    <div class="stat-card glass"><div class="stat-icon red"><i class="ri-error-warning-line"></i></div><div class="stat-label">Pending Due</div><div class="stat-value">${formatCurrency(pendingCollection)}</div></div>
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-user-heart-line"></i></div><div class="stat-label">Repeat Customers</div><div class="stat-value">${repeatCustomers}</div></div>
  `;
}

// ─── Chart Helpers ──────────────────────────────────────
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); } }

function createBarWithTrend(canvasId, labels, values, label) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");
  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label, data: values, backgroundColor: chartColors.primary + "80", borderColor: chartColors.primary, borderWidth: 1, borderRadius: 4, order: 2 },
        { label: "Trend", data: values, type: "line", borderColor: chartColors.success, borderWidth: 2, pointRadius: 3, pointBackgroundColor: chartColors.success, tension: 0.4, order: 1 },
      ],
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

function createDoughnut(canvasId, labels, values) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");
  charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: palette.slice(0, labels.length), borderWidth: 0 }] },
    options: { responsive: true, plugins: { legend: { position: "bottom", labels: { padding: 10, usePointStyle: true, font: { size: 11 } } } } },
  });
}

function createHorizontalBar(canvasId, labels, values) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");
  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: palette.slice(0, labels.length), borderRadius: 4, borderWidth: 0 }] },
    options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
  });
}

// ─── Daily Revenue (last 14 days) ───────────────────────
function renderDailyChart(data) {
  const days = {};
  const now = new Date();
  // Pre-populate last 14 days
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days[formatDateInput(d)] = 0;
  }

  data.forEach((r) => {
    const d = parseOrderDate(r.date);
    if (!d) return;
    const key = formatDateInput(d);
    if (days[key] !== undefined) {
      days[key] += (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0);
    }
  });

  const sorted = Object.keys(days).sort();
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const labels = sorted.map(k => {
    const d = new Date(k);
    return dayNames[d.getDay()] + " " + d.getDate();
  });
  createBarWithTrend("dailyChart", labels, sorted.map(k => days[k]), "Revenue");
}

// ─── Monthly Revenue ────────────────────────────────────
function renderMonthlyChart(data) {
  const months = {};
  data.forEach((r) => {
    const d = parseOrderDate(r.date);
    if (!d) return;
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    months[key] = (months[key] || 0) + (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0);
  });
  const sorted = Object.keys(months).sort();
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const labels = sorted.map((k) => monthNames[parseInt(k.split("-")[1]) - 1] + " " + k.split("-")[0].slice(2));
  createBarWithTrend("monthlyChart", labels, sorted.map((k) => months[k]), "Revenue");
}

// ─── Top 10 Products ────────────────────────────────────
function renderTopProducts(data) {
  const products = {};
  data.forEach((r) => {
    const rawNames = String(r.category || "Unknown");
    const rawQtys = String(r.quantity || "1");
    const names = rawNames.split(",").map(s => s.trim());
    const qtys = rawQtys.split(",").map(s => parseInt(s.trim()) || 1);
    names.forEach((name, idx) => {
      if (!name) return;
      const qty = qtys[idx] || qtys[0] || 1;
      products[name] = (products[name] || 0) + qty;
    });
  });
  const sorted = Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createHorizontalBar("topProductsChart", sorted.map((s) => s[0]), sorted.map((s) => s[1]));
}

// ─── Trending Colors (Top 10) ───────────────────────────
function renderColorsChart(data) {
  const colors = {};
  data.forEach((r) => {
    const rawColors = String(r.color || "Unknown");
    const rawQtys = String(r.quantity || "1");
    const colorList = rawColors.split(",").map(s => s.trim());
    const qtys = rawQtys.split(",").map(s => parseInt(s.trim()) || 1);
    colorList.forEach((c, idx) => {
      if (!c) return;
      const qty = qtys[idx] || qtys[0] || 1;
      colors[c] = (colors[c] || 0) + qty;
    });
  });
  const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createHorizontalBar("colorsChart", sorted.map((s) => s[0]), sorted.map((s) => s[1]));
}

// ─── Top 5 Customers ────────────────────────────────────
function renderTopCustomers(data) {
  const customers = {};
  data.forEach(r => {
    const name = r.customer_name || "Unknown";
    const phone = String(r.customer_phone || "");
    const key = `${name} (${phone.slice(-4) || "?"})`;
    customers[key] = (customers[key] || 0) + (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0);
  });
  const sorted = Object.entries(customers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  createHorizontalBar("topCustomersChart", sorted.map(s => s[0]), sorted.map(s => s[1]));
}

// ─── Revenue vs Collection ──────────────────────────────
function renderRevenueVsCollection(data) {
  destroyChart("revenueVsCollectionChart");
  const totalRevenue = data.reduce((s, r) => s + (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0), 0);
  const totalCollected = data.reduce((s, r) => s + (parseFloat(r.paid_amount) || 0), 0);
  const totalDue = Math.max(0, totalRevenue - totalCollected);

  const ctx = document.getElementById("revenueVsCollectionChart").getContext("2d");
  charts["revenueVsCollectionChart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Revenue", "Collected", "Due"],
      datasets: [{
        data: [totalRevenue, totalCollected, totalDue],
        backgroundColor: [chartColors.primary + "cc", chartColors.success + "cc", chartColors.danger + "cc"],
        borderRadius: 6,
        borderWidth: 0,
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

// ─── Delivery Pipeline ──────────────────────────────────
function renderDeliveryChart(data) {
  const statuses = { Pending: 0, Dispatched: 0, Delivered: 0, Returned: 0 };
  const seen = new Set();
  data.forEach((r) => {
    if (seen.has(r.order_id)) return;
    seen.add(r.order_id);
    const s = r.delivery_status || "Pending";
    statuses[s] = (statuses[s] || 0) + 1;
  });
  createDoughnut("deliveryChart", Object.keys(statuses), Object.values(statuses));
}

// ─── Payment Status ─────────────────────────────────────
function renderPaymentChart(data) {
  const statuses = { Paid: 0, Unpaid: 0, Partial: 0 };
  const seen = new Set();
  data.forEach((r) => {
    if (seen.has(r.order_id)) return;
    seen.add(r.order_id);
    const s = r.payment_status || "Unpaid";
    statuses[s] = (statuses[s] || 0) + 1;
  });
  createDoughnut("paymentChart", Object.keys(statuses), Object.values(statuses));
}
