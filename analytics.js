/**
 * Analytics Page — KPIs + Charts powered by Chart.js
 * Includes: Today/Week/Month/All filters, Sets Sold, Daily Revenue,
 * Top Customers, Revenue vs Collection, and more.
 */
let allOrders = [];
let allInventory = [];
let charts = {};

const chartColors = {
  primary: "#1f3d3d", accent: "#c9a882", success: "#10b981",
  warning: "#f59e0b", danger: "#ef4444", info: "#3b82f6",
  coral: "#f43f5e", indigo: "#6366f1", emerald: "#14b8a6",
  violet: "#8b5cf6", slate: "#64748b"
};
const palette = [chartColors.primary, chartColors.accent, chartColors.info, chartColors.emerald, chartColors.coral, chartColors.indigo, chartColors.warning, chartColors.violet, chartColors.slate];

// Chart.js global defaults
Chart.defaults.color = "#64748b";
Chart.defaults.borderColor = "rgba(100,116,139,0.15)";
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
    console.error("Analytics load error:", err);
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getFilteredOrders() {
  const fromVal = document.getElementById("dateFrom").value;
  const toVal = document.getElementById("dateTo").value;

  if (!fromVal && !toVal) return allOrders;

  return allOrders.filter((o) => {
    const orderDate = parseOrderDate(o.date);
    if (!orderDate) return true;
    
    // Convert orderDate to local midnight for accurate comparison
    const orderLocalMidnight = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
    
    if (fromVal) {
      const fromParts = fromVal.split("-");
      const fromDate = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
      if (orderLocalMidnight < fromDate) return false;
    }
    
    if (toVal) { 
      const toParts = toVal.split("-");
      const toDate = new Date(toParts[0], toParts[1] - 1, toParts[2]);
      if (orderLocalMidnight > toDate) return false; 
    }
    return true;
  });
}

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

// Parse comma-separated quantities correctly
function sumQuantities(qtyStr) {
  return String(qtyStr || "0").split(",").reduce((sum, q) => sum + (parseInt(q.trim()) || 0), 0);
}

function refresh() {
  const data = getFilteredOrders();
  const validSalesData = data.filter(r => r.delivery_status !== "Returned" && r.delivery_status !== "Cancelled");

  renderSalesTargets(validSalesData);
  renderKPIs(validSalesData);
  renderDailyChart(validSalesData);
  renderDailyOrdersChart(validSalesData);
  renderMonthlyChart(validSalesData);
  renderTopProducts(validSalesData);
  renderColorsChart(validSalesData);
  renderTopCustomers(validSalesData);
  renderRevenueVsCollection(validSalesData);
  renderDeliveryChart(data);
  renderPaymentChart(data);
  renderLowStockAlerts();
}

// ─── Sales Target Tracker ───────────────────────────────
function renderSalesTargets(data) {
  const container = document.getElementById("salesTargetContainer");
  if (!container) return;
  
  // Calculate Actuals
  const now = new Date();
  const todayStr = formatDateInput(now);
  const weekAgoStr = formatDateInput(new Date(now.getTime() - 7*24*60*60*1000));
  const monthStartStr = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  
  let todayRev = 0, weekRev = 0, monthRev = 0;
  
  data.forEach(r => {
    const d = parseOrderDate(r.date);
    if (!d) return;
    const dateStr = formatDateInput(d);
    const rev = parseFloat(r.total_amount) || parseFloat(r.total_price) || 0;
    
    if (dateStr === todayStr) todayRev += rev;
    if (dateStr >= weekAgoStr) weekRev += rev;
    if (dateStr >= monthStartStr) monthRev += rev;
  });

  // Calculate Auto Targets (Avg of all data + 10%)
  let totalRev = 0;
  let firstDate = new Date();
  data.forEach(r => {
    const d = parseOrderDate(r.date);
    if (!d) return;
    if (d < firstDate) firstDate = d;
    totalRev += parseFloat(r.total_amount) || parseFloat(r.total_price) || 0;
  });
  
  const daysDiff = Math.max(1, (now - firstDate) / (1000*60*60*24));
  const dailyAvg = totalRev / daysDiff;
  
  const autoDaily = Math.round(dailyAvg * 1.1);
  const autoWeekly = Math.round(autoDaily * 7);
  const autoMonthly = Math.round(autoDaily * 30);
  
  // Load Manual Targets if any
  const targets = JSON.parse(localStorage.getItem("mihira_sales_targets") || "{}");
  const targetDaily = parseFloat(targets.daily) || autoDaily;
  const targetWeekly = parseFloat(targets.weekly) || autoWeekly;
  const targetMonthly = parseFloat(targets.monthly) || autoMonthly;

  const renderBar = (label, actual, target) => {
    const pct = Math.min(100, Math.round((actual / target) * 100)) || 0;
    const color = pct >= 100 ? "var(--success)" : "var(--primary)";
    return `
      <div style="background:var(--bg); border:1px solid var(--border); padding:12px; border-radius:8px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px; color:var(--text-muted);">
          <span>${label}</span>
          <span>${pct}%</span>
        </div>
        <div style="font-weight:600; font-size:14px; margin-bottom:8px; color:var(--text);">
          ${formatCurrency(actual)} <span style="font-weight:400; font-size:12px; color:var(--text-muted);">/ ${formatCurrency(target)}</span>
        </div>
        <div style="width:100%; height:6px; background:rgba(0,0,0,0.05); border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${color}; border-radius:3px; transition:width 0.5s ease;"></div>
        </div>
      </div>
    `;
  };

  container.innerHTML = `
    ${renderBar("Today", todayRev, targetDaily)}
    ${renderBar("This Week", weekRev, targetWeekly)}
    ${renderBar("This Month", monthRev, targetMonthly)}
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  const btnSetTarget = document.getElementById("btnSetTarget");
  if (btnSetTarget) {
    btnSetTarget.addEventListener("click", () => {
      const targets = JSON.parse(localStorage.getItem("mihira_sales_targets") || "{}");
      document.getElementById("inputDailyTarget").value = targets.daily || "";
      document.getElementById("inputWeeklyTarget").value = targets.weekly || "";
      document.getElementById("inputMonthlyTarget").value = targets.monthly || "";
      document.getElementById("targetModal").style.display = "flex";
    });
  }
  
  const btnSaveTarget = document.getElementById("btnSaveTarget");
  if (btnSaveTarget) {
    btnSaveTarget.addEventListener("click", () => {
      const daily = document.getElementById("inputDailyTarget").value;
      const weekly = document.getElementById("inputWeeklyTarget").value;
      const monthly = document.getElementById("inputMonthlyTarget").value;
      
      const targets = {};
      if (daily) targets.daily = parseFloat(daily);
      if (weekly) targets.weekly = parseFloat(weekly);
      if (monthly) targets.monthly = parseFloat(monthly);
      
      localStorage.setItem("mihira_sales_targets", JSON.stringify(targets));
      document.getElementById("targetModal").style.display = "none";
      showToast("Sales targets updated");
      refresh();
    });
  }
});


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

  // Customer Analysis
  const customerOrders = {};
  const customerSpend = {};
  data.forEach(r => {
    const phone = r.customer_phone || r.customer_id;
    if (phone) {
      if (!customerOrders[phone]) customerOrders[phone] = new Set();
      customerOrders[phone].add(r.order_id);
      // To avoid double-counting spend for the same order_id since data has row per item,
      // we should only add the total_amount once per order_id. Wait!
      // In the pos.js and backend.gs, total_amount is the order total. If it's duplicated across items,
      // we shouldn't sum it per item! Wait, previously totalRevenue was calculated by dividing? No, totalRevenue was calculated using uniqueOrders.
    }
  });
  
  // Recalculate customer spend accurately by iterating unique orders
  uniqueOrders.forEach(order => {
    const phone = order.customer_phone || order.customer_id;
    if (phone) {
      customerSpend[phone] = (customerSpend[phone] || 0) + (parseFloat(order.total_amount) || parseFloat(order.total_price) || 0);
    }
  });

  const repeatCustomers = Object.values(customerOrders).filter(s => s.size > 1).length;
  const totalCustomers = Object.keys(customerSpend).length;
  const avgCustomerSpend = totalCustomers > 0 ? (totalRevenue / totalCustomers) : 0;
  const aboveAvgCustomers = Object.values(customerSpend).filter(spend => spend > avgCustomerSpend).length;


  // Compute days in current filter range for accurate averages
  const fromVal = document.getElementById("dateFrom").value;
  const toVal = document.getElementById("dateTo").value;
  let filterDays = 1;
  if (fromVal && toVal) {
    const fp = fromVal.split("-"), tp = toVal.split("-");
    const fd = new Date(fp[0], fp[1] - 1, fp[2]);
    const td = new Date(tp[0], tp[1] - 1, tp[2]);
    filterDays = Math.max(1, Math.round((td - fd) / (1000 * 60 * 60 * 24)) + 1);
  } else {
    // "All" — count distinct order days
    const daySet = new Set();
    data.forEach(r => {
      const d = parseOrderDate(r.date);
      if (d) daySet.add(formatDateInput(d));
    });
    filterDays = Math.max(1, daySet.size);
  }
  const avgDailyOrders = Math.round((uniqueOrders.size / filterDays) * 10) / 10;

  document.getElementById("kpiRow").innerHTML = `
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-money-dollar-circle-line"></i></div><div class="stat-label">Total Revenue</div><div class="stat-value">${formatCurrency(totalRevenue)}</div></div>
    <div class="stat-card glass"><div class="stat-icon blue"><i class="ri-line-chart-line"></i></div><div class="stat-label">Avg Order Value</div><div class="stat-value">${formatCurrency(aov)}</div></div>
    <div class="stat-card glass"><div class="stat-icon cyan"><i class="ri-file-list-3-line"></i></div><div class="stat-label">Total Orders</div><div class="stat-value">${uniqueOrders.size}</div></div>
    <div class="stat-card glass"><div class="stat-icon indigo"><i class="ri-bar-chart-2-line"></i></div><div class="stat-label">Avg Daily Orders</div><div class="stat-value">${avgDailyOrders}</div></div>
    <div class="stat-card glass"><div class="stat-icon yellow"><i class="ri-stack-line"></i></div><div class="stat-label">Sets Sold</div><div class="stat-value">${totalSetsSold}</div></div>
    <div class="stat-card glass"><div class="stat-icon red"><i class="ri-error-warning-line"></i></div><div class="stat-label">Pending Due</div><div class="stat-value">${formatCurrency(pendingCollection)}</div></div>
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-user-heart-line"></i></div><div class="stat-label">Repeat Customers</div><div class="stat-value">${repeatCustomers}</div></div>
    <div class="stat-card glass"><div class="stat-icon violet"><i class="ri-star-smile-line"></i></div><div class="stat-label">Above Avg Customers</div><div class="stat-value">${aboveAvgCustomers}</div></div>
  `;
}

// ─── Chart Helpers ──────────────────────────────────────
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); } }

function createBarWithTrend(canvasId, labels, values, label) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");

  // Calculate linear trend line
  const n = values.length;
  let trendData = [...values];
  if (n > 1) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += values[i]; sumXY += i * values[i]; sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    trendData = values.map((_, i) => Math.max(0, slope * i + intercept));
  }

  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label, data: values, backgroundColor: chartColors.primary + "80", borderColor: chartColors.primary, borderWidth: 1, borderRadius: 4, order: 2 },
        { label: "Trend", data: trendData, type: "line", borderColor: chartColors.success, borderWidth: 2, pointRadius: 0, pointBackgroundColor: chartColors.success, tension: 0, order: 1 },
      ],
    },
    options: { 
      responsive: true, 
      plugins: { legend: { display: false } }, 
      scales: { 
        x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } },
        y: { beginAtZero: true } 
      } 
    },
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
    options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { ticks: { autoSkip: false } } } },
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

// ─── Daily Orders (last 14 days) ────────────────────────
function renderDailyOrdersChart(data) {
  const days = {};
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days[formatDateInput(d)] = new Set();
  }

  data.forEach((r) => {
    const d = parseOrderDate(r.date);
    if (!d) return;
    const key = formatDateInput(d);
    if (days[key] !== undefined) {
      days[key].add(r.order_id);
    }
  });

  const sorted = Object.keys(days).sort();
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const labels = sorted.map(k => {
    const d = new Date(k);
    return dayNames[d.getDay()] + " " + d.getDate();
  });
  
  const values = sorted.map(k => days[k].size);
  createBarWithTrend("dailyOrdersChart", labels, values, "Orders");
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
    const rawSerials = String(r.serial || "");
    const names = rawNames.split(",").map(s => s.trim());
    const qtys = rawQtys.split(",").map(s => parseInt(s.trim()) || 1);
    const serials = rawSerials.split(",").map(s => s.trim());

    names.forEach((name, idx) => {
      if (!name) return;
      let qty = qtys[idx] || qtys[0] || 1;
      const serial = serials[idx] || serials[0];
      const invItem = allInventory.find(i => String(i.SERIAL) === serial);
      const setSize = invItem ? (parseInt(invItem["CHURI IN A SET"]) || 1) : 1;
      if (qty > 500 || qty <= 0) qty = setSize; // reject corrupt data
      products[name] = (products[name] || 0) + (qty / setSize);
    });
  });
  const sorted = Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createHorizontalBar("topProductsChart", sorted.map((s) => s[0]), sorted.map((s) => Math.round(s[1] * 10) / 10));
}

// ─── Trending Colors (Top 10) ───────────────────────────
function renderColorsChart(data) {
  const colors = {};
  data.forEach((r) => {
    const rawColors = String(r.color || "Unknown");
    const rawQtys = String(r.quantity || "1");
    const rawSerials = String(r.serial || "");
    const colorList = rawColors.split(",").map(s => s.trim());
    const qtys = rawQtys.split(",").map(s => parseInt(s.trim()) || 1);
    const serials = rawSerials.split(",").map(s => s.trim());

    colorList.forEach((c, idx) => {
      if (!c) return;
      let qty = qtys[idx] || qtys[0] || 1;
      const serial = serials[idx] || serials[0];
      const invItem = allInventory.find(i => String(i.SERIAL) === serial);
      const setSize = invItem ? (parseInt(invItem["CHURI IN A SET"]) || 1) : 1;
      if (qty > 500 || qty <= 0) qty = setSize; // reject corrupt data
      colors[c] = (colors[c] || 0) + (qty / setSize);
    });
  });
  const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createHorizontalBar("colorsChart", sorted.map((s) => s[0]), sorted.map((s) => Math.round(s[1] * 10) / 10));
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

// ─── Downloads ──────────────────────────────────────────
function downloadChart(canvasId, name) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  // Chart.js uses transparent background by default, fill it white for PNG
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const ctx = tempCanvas.getContext("2d");
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel-solid') || "#ffffff";
  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  ctx.drawImage(canvas, 0, 0);

  const link = document.createElement("a");
  link.download = `${name}_${formatDateInput(new Date())}.png`;
  link.href = tempCanvas.toDataURL("image/png");
  link.click();
}

function downloadDashboard() {
  const dashboard = document.getElementById("analyticsContent");
  if (!dashboard) return;
  
  const originalBg = dashboard.style.background;
  dashboard.style.background = getComputedStyle(document.documentElement).getPropertyValue('--bg-color') || "#f8fafc";
  
  html2canvas(dashboard, {
    scale: 2, 
    useCORS: true,
    backgroundColor: dashboard.style.background
  }).then(canvas => {
    dashboard.style.background = originalBg;
    const link = document.createElement("a");
    link.download = `Mihira_Dashboard_${formatDateInput(new Date())}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }).catch(err => {
    dashboard.style.background = originalBg;
    console.error("Failed to capture dashboard", err);
    showToast("Failed to download image", "error");
  });
}
