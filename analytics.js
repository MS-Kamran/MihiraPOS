/**
 * Analytics Page — KPIs + 6 Charts powered by Chart.js
 */
let allOrders = [];
let charts = {};

const chartColors = {
  primary: "#3b82f6", accent: "#10b981", warning: "#f59e0b", danger: "#ef4444",
  info: "#06b6d4", purple: "#8b5cf6", pink: "#ec4899", orange: "#f97316",
  lime: "#84cc16", teal: "#14b8a6",
};
const palette = Object.values(chartColors);

// Chart.js global defaults for dark theme
Chart.defaults.color = "#94a3b8";
Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
Chart.defaults.font.family = "Inter";

document.addEventListener("DOMContentLoaded", async () => {
  setupPresets();
  document.getElementById("dateFrom").addEventListener("change", refresh);
  document.getElementById("dateTo").addEventListener("change", refresh);

  try {
    allOrders = await Api.getOrders();
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

      if (preset === "week") {
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

function refresh() {
  const data = getFilteredOrders();
  renderKPIs(data);
  renderMonthlyChart(data);
  renderWeeklyChart(data);
  renderTopProducts(data);
  renderColorsChart(data);
  renderDeliveryChart(data);
  renderPaymentChart(data);
}

// ─── KPIs ───────────────────────────────────────────────
function renderKPIs(data) {
  const uniqueOrders = new Set(data.map((r) => r.order_id));
  const totalRevenue = data.reduce((s, r) => s + (parseFloat(r.total_price) || 0), 0);
  const aov = uniqueOrders.size > 0 ? totalRevenue / uniqueOrders.size : 0;
  const totalUnits = data.reduce((s, r) => s + (parseInt(r.quantity) || 0), 0);
  const pendingCollection = data.filter((r) => r.payment_status !== "Paid").reduce((s, r) => s + (parseFloat(r.due_amount) || 0), 0);

  document.getElementById("kpiRow").innerHTML = `
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-money-dollar-circle-line"></i></div><div class="stat-label">Total Revenue</div><div class="stat-value">${formatCurrency(totalRevenue)}</div></div>
    <div class="stat-card glass"><div class="stat-icon blue"><i class="ri-line-chart-line"></i></div><div class="stat-label">AOV</div><div class="stat-value">${formatCurrency(aov)}</div></div>
    <div class="stat-card glass"><div class="stat-icon cyan"><i class="ri-file-list-3-line"></i></div><div class="stat-label">Total Orders</div><div class="stat-value">${uniqueOrders.size}</div></div>
    <div class="stat-card glass"><div class="stat-icon yellow"><i class="ri-stack-line"></i></div><div class="stat-label">Units Sold</div><div class="stat-value">${totalUnits}</div></div>
    <div class="stat-card glass"><div class="stat-icon red"><i class="ri-error-warning-line"></i></div><div class="stat-label">Pending Collection</div><div class="stat-value">${formatCurrency(pendingCollection)}</div></div>
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
        { label: "Trend", data: values, type: "line", borderColor: chartColors.accent, borderWidth: 2, pointRadius: 3, pointBackgroundColor: chartColors.accent, tension: 0.4, order: 1 },
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
    options: { responsive: true, plugins: { legend: { position: "bottom", labels: { padding: 12, usePointStyle: true } } } },
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

// ─── Monthly Revenue ────────────────────────────────────
function renderMonthlyChart(data) {
  const months = {};
  data.forEach((r) => {
    const d = parseOrderDate(r.date);
    if (!d) return;
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    months[key] = (months[key] || 0) + (parseFloat(r.total_price) || 0);
  });
  const sorted = Object.keys(months).sort();
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const labels = sorted.map((k) => monthNames[parseInt(k.split("-")[1]) - 1] + " " + k.split("-")[0].slice(2));
  createBarWithTrend("monthlyChart", labels, sorted.map((k) => months[k]), "Revenue");
}

// ─── Weekly Revenue ─────────────────────────────────────
function renderWeeklyChart(data) {
  const weeks = {};
  data.forEach((r) => {
    const d = parseOrderDate(r.date);
    if (!d) return;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().split("T")[0];
    weeks[key] = (weeks[key] || 0) + (parseFloat(r.total_price) || 0);
  });
  const sorted = Object.keys(weeks).sort().slice(-12);
  const labels = sorted.map((k) => { const d = new Date(k); return (d.getMonth()+1) + "/" + d.getDate(); });
  createBarWithTrend("weeklyChart", labels, sorted.map((k) => weeks[k]), "Revenue");
}

// ─── Top 10 Products ────────────────────────────────────
function renderTopProducts(data) {
  const products = {};
  data.forEach((r) => {
    const key = r.serial || r.category || "Unknown";
    products[key] = (products[key] || 0) + (parseInt(r.quantity) || 0);
  });
  const sorted = Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createHorizontalBar("topProductsChart", sorted.map((s) => s[0]), sorted.map((s) => s[1]));
}

// ─── Trending Colors ────────────────────────────────────
function renderColorsChart(data) {
  const colors = {};
  data.forEach((r) => {
    const c = r.color || "Unknown";
    colors[c] = (colors[c] || 0) + (parseInt(r.quantity) || 0);
  });
  const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]);
  createDoughnut("colorsChart", sorted.map((s) => s[0]), sorted.map((s) => s[1]));
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
