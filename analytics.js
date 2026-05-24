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
    
    document.getElementById("weeklyChartRange").addEventListener("change", () => {
      const validSalesData = getFilteredOrders().filter(r => r.delivery_status !== "Returned" && r.delivery_status !== "Cancelled");
      const weeksCount = parseInt(document.getElementById("weeklyChartRange").value) || 4;
      renderWeeklyChart(validSalesData, weeksCount);
    });

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
        let minDate = null;
        let maxDate = null;
        allOrders.forEach(o => {
          const d = parseOrderDate(o.date);
          if (d) {
            if (!minDate || d < minDate) minDate = d;
            if (!maxDate || d > maxDate) maxDate = d;
          }
        });
        if (minDate && maxDate) {
          from.value = formatDateInput(minDate);
          to.value = formatDateInput(maxDate);
        } else {
          from.value = ""; to.value = "";
        }
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
  
  const weeksCount = parseInt(document.getElementById("weeklyChartRange")?.value) || 4;
  renderWeeklyChart(validSalesData, weeksCount);
  
  renderMonthlyChart(validSalesData);
  renderTopProducts(validSalesData);
  renderTopProductsRevenue(validSalesData);
  renderColorsChart(validSalesData);
  renderHighestStock();
  renderHighestStockColors();
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

  // Customer Analysis — build a map of order_id → first row for accurate per-customer spend
  const customerOrders = {};
  const customerSpend = {};
  const orderRowMap = {};
  data.forEach(r => {
    const phone = r.customer_phone || r.customer_id;
    if (!phone) return;
    if (!customerOrders[phone]) customerOrders[phone] = new Set();
    customerOrders[phone].add(r.order_id);
    // Keep only the first row per order_id to avoid double-counting total_amount
    if (!orderRowMap[r.order_id]) orderRowMap[r.order_id] = r;
  });

  // Sum spend per customer using one row per unique order
  Object.values(orderRowMap).forEach(r => {
    const phone = r.customer_phone || r.customer_id;
    if (!phone) return;
    customerSpend[phone] = (customerSpend[phone] || 0) + (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0);
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
  const avgSetsPerOrder = uniqueOrders.size > 0 ? (totalSetsSold / uniqueOrders.size).toFixed(1) : 0;

  // Compute Discount Metrics
  let totalDiscount = 0;
  let customersWithDiscount = new Set();
  
  data.forEach(r => {
    const discountStr = String(r.discount || "").trim();
    let discAmt = 0;
    const subtotal = parseFloat(r.total_price) || 0;
    
    if (discountStr.includes("%")) {
      discAmt = subtotal * ((parseFloat(discountStr) || 0) / 100);
    } else {
      discAmt = parseFloat(discountStr.replace(/[^\d.]/g, "")) || 0;
    }
    
    if (discAmt > 0) {
      totalDiscount += discAmt;
      const phone = r.customer_phone || r.customer_id || r.customer_name || r.order_id; // fallback to order_id if no customer data
      customersWithDiscount.add(phone);
    }
  });

  const discountPercentage = (totalRevenue + totalDiscount) > 0 ? (totalDiscount / (totalRevenue + totalDiscount)) * 100 : 0;
  const avgDiscountPerPerson = customersWithDiscount.size > 0 ? (totalDiscount / customersWithDiscount.size) : 0;

  const kpiCards = [
    { icon: "ri-money-dollar-circle-line", color: "green", label: "Total Revenue", value: formatCurrency(totalRevenue) },
    { icon: "ri-line-chart-line", color: "blue", label: "Avg Order Value", value: formatCurrency(aov) },
    { icon: "ri-file-list-3-line", color: "cyan", label: "Total Orders", value: uniqueOrders.size },
    { icon: "ri-bar-chart-2-line", color: "indigo", label: "Avg Daily Orders", value: avgDailyOrders },
    { icon: "ri-stack-line", color: "yellow", label: "Sets Sold", value: totalSetsSold },
    { icon: "ri-shopping-bag-3-line", color: "warning", label: "Avg Sets / Order", value: avgSetsPerOrder },
    { icon: "ri-error-warning-line", color: "red", label: "Pending Due", value: formatCurrency(pendingCollection) },
    { icon: "ri-user-heart-line", color: "green", label: "Repeat Customers", value: repeatCustomers },
    { icon: "ri-star-smile-line", color: "violet", label: "Above Avg Customers", value: aboveAvgCustomers },
    { icon: "ri-price-tag-3-line", color: "coral", label: "Total Discount Given", value: formatCurrency(totalDiscount) },
    { icon: "ri-percent-line", color: "emerald", label: "Discount %", value: discountPercentage.toFixed(1) + "%" },
    { icon: "ri-user-smile-line", color: "info", label: "Avg Discount / Person", value: formatCurrency(avgDiscountPerPerson) },
  ];

  document.getElementById("kpiRow").innerHTML = kpiCards.map((c, i) => `
    <div class="stat-card glass" style="position:relative;">
      <button class="btn-icon kpi-download" onclick="downloadCard(this.closest('.stat-card'), '${c.label.replace(/\s+/g, '_')}')" title="Download Card" style="position:absolute;top:6px;right:6px;opacity:0;transition:opacity .2s;"><i class="ri-download-cloud-2-line" style="font-size:14px;"></i></button>
      <div class="stat-icon ${c.color}"><i class="${c.icon}"></i></div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
    </div>
  `).join("");
}

// ─── Chart Helpers ──────────────────────────────────────
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); } }

function createBarWithTrend(canvasId, labels, values, label) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");

  // Linear regression trend line: y = mx + b
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

  // Inline plugin: draw value labels on top of each bar
  const barLabelPlugin = {
    id: 'barLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      chart.data.datasets.forEach((dataset, di) => {
        if (dataset.type === 'line') return;
        chart.getDatasetMeta(di).data.forEach((bar, i) => {
          const val = dataset.data[i];
          if (!val) return;
          const txt = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : String(Math.round(val));
          ctx.save();
          ctx.font = 'bold 9px Inter, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(txt, bar.x, bar.y - 2);
          ctx.restore();
        });
      });
    }
  };

  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label, data: values, backgroundColor: chartColors.primary + "80", borderColor: chartColors.primary, borderWidth: 1, borderRadius: 4, order: 2 },
        { label: "Trend", data: trendData, type: "line", borderColor: chartColors.success, borderWidth: 2, pointRadius: 0, tension: 0, order: 1 },
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
    plugins: [barLabelPlugin],
  });
}

function createDoughnut(canvasId, labels, values) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");

  // Inline plugin: draw percentage labels inside each doughnut slice
  const doughnutLabelPlugin = {
    id: 'doughnutLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const dataset = chart.data.datasets[0];
      const total = dataset.data.reduce((a, b) => a + b, 0);
      if (!total) return;
      chart.getDatasetMeta(0).data.forEach((arc, i) => {
        const val = dataset.data[i];
        if (!val) return;
        const pct = Math.round(val / total * 100);
        if (pct < 5) return; // skip tiny slices to avoid overlap
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const r = (arc.innerRadius + arc.outerRadius) / 2;
        const x = arc.x + Math.cos(angle) * r;
        const y = arc.y + Math.sin(angle) * r;
        ctx.save();
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pct + '%', x, y);
        ctx.restore();
      });
    }
  };

  charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: palette.slice(0, labels.length), borderWidth: 0 }] },
    options: { responsive: true, plugins: { legend: { position: "bottom", labels: { padding: 10, usePointStyle: true, font: { size: 11 } } } } },
    plugins: [doughnutLabelPlugin],
  });
}

function createHorizontalBar(canvasId, labels, values) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext("2d");

  // Inline plugin: draw value at the right edge of each horizontal bar
  const hbarLabelPlugin = {
    id: 'hbarLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const dataset = chart.data.datasets[0];
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const val = dataset.data[i];
        if (!val) return;
        const txt = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : String(Math.round(val));
        ctx.save();
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, bar.x + 4, bar.y);
        ctx.restore();
      });
    }
  };

  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: palette.slice(0, labels.length), borderRadius: 4, borderWidth: 0 }] },
    options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { ticks: { autoSkip: false } } } },
    plugins: [hbarLabelPlugin],
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

// ─── Weekly Revenue ──────────────────────────────────────
function renderWeeklyChart(data, weeksCount) {
  const weeks = {};
  const now = new Date();
  
  // Find Monday of the current week
  const currentDay = now.getDay();
  const diffToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);

  for (let i = weeksCount - 1; i >= 0; i--) {
    const weekStart = new Date(startOfThisWeek.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
    const weekEnd = new Date(weekStart.getTime() + (6 * 24 * 60 * 60 * 1000));
    const label = `${weekStart.getDate()} ${weekStart.toLocaleString('default', { month: 'short' })}`;
    // Store exact start and end timestamps (inclusive)
    weeks[label] = { 
      start: weekStart.getTime(), 
      end: weekEnd.getTime() + (24*60*60*1000) - 1, 
      value: 0 
    };
  }

  data.forEach(r => {
    const d = parseOrderDate(r.date);
    if (!d) return;
    // ensure order date is compared accurately
    const time = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    
    for (const [label, week] of Object.entries(weeks)) {
      if (time >= week.start && time <= week.end) {
        week.value += (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0);
        break;
      }
    }
  });

  const labels = Object.keys(weeks);
  const values = labels.map(k => weeks[k].value);
  createBarWithTrend("weeklyChart", labels, values, "Revenue");
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

// ─── Top 10 Products (Revenue) ──────────────────────────
function renderTopProductsRevenue(data) {
  const products = {};
  data.forEach((r) => {
    const rawNames = String(r.category || "Unknown");
    const rawQtys = String(r.quantity || "1");
    const rawPrices = String(r.unit_price || "0");
    const rawSerials = String(r.serial || "");
    const names = rawNames.split(",").map(s => s.trim());
    const qtys = rawQtys.split(",").map(s => parseInt(s.trim()) || 1);
    const prices = rawPrices.split(",").map(s => parseFloat(s.trim()) || 0);
    const serials = rawSerials.split(",").map(s => s.trim());

    names.forEach((name, idx) => {
      if (!name) return;
      let qty = qtys[idx] || qtys[0] || 1;
      const serial = serials[idx] || serials[0];
      
      const invItem = allInventory.find(i => String(i.SERIAL) === serial);
      const setSize = invItem ? (parseInt(invItem["CHURI IN A SET"]) || 1) : 1;
      const sellingPrice = invItem ? (parseFloat(invItem["SELLING PRICE"]) || 0) : 0;
      
      const sets = qty / setSize;
      products[name] = (products[name] || 0) + (sets * sellingPrice);
    });
  });
  const sorted = Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createHorizontalBar("topProductsRevenueChart", sorted.map((s) => s[0]), sorted.map((s) => Math.round(s[1])));
}

// ─── Highest Stock Available ────────────────────────────
function renderHighestStock() {
  const products = {};
  allInventory.forEach(item => {
    const name = item.NAME || "Unknown";
    const remaining = getStock(item);
    const setSize = parseInt(item["CHURI IN A SET"]) || 1;
    if (remaining > 0) {
      products[name] = (products[name] || 0) + (remaining / setSize); // Stock in sets
    }
  });
  
  const sorted = Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createHorizontalBar("highestStockChart", sorted.map(s => s[0]), sorted.map(s => Math.round(s[1] * 10) / 10));
}

// ─── Highest Stock Available (Colors) ───────────────────
function renderHighestStockColors() {
  const colors = {};
  allInventory.forEach(item => {
    const color = item.COLOR || "Unknown";
    const remaining = getStock(item);
    const setSize = parseInt(item["CHURI IN A SET"]) || 1;
    if (remaining > 0) {
      colors[color] = (colors[color] || 0) + (remaining / setSize); // Stock in sets
    }
  });
  
  const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 10);
  createHorizontalBar("highestStockColorsChart", sorted.map(s => s[0]), sorted.map(s => Math.round(s[1] * 10) / 10));
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
function downloadCard(element, name) {
  if (!element || typeof html2canvas === "undefined") return;
  html2canvas(element, { scale: 2, useCORS: true, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--panel-solid') || "#ffffff" })
    .then(canvas => {
      const link = document.createElement("a");
      link.download = `${name}_${formatDateInput(new Date())}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
}


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
