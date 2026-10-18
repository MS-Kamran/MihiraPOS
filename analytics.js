/**
 * Analytics Page — KPIs + Charts powered by Chart.js
 * Includes: Today/Week/Month/All filters, Sets Sold, Daily Revenue,
 * Top Customers, Revenue vs Collection, and more.
 */
let allOrders = [];
let allInventory = [];
let activeInventory = [];
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
    activeInventory = allInventory;
    initAnalyticsProductFilters();

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

function initAnalyticsProductFilters() {
  const typeEl = document.getElementById("analyticsFilterType");
  const nameEl = document.getElementById("analyticsFilterName");
  const designEl = document.getElementById("analyticsFilterDesign");
  const colorEl = document.getElementById("analyticsFilterColor");
  const shadeEl = document.getElementById("analyticsFilterColorShade");
  const sizeEl = document.getElementById("analyticsFilterSize");

  if (!typeEl) return;

  populateDropdown(typeEl, extractUniqueValues(allInventory, "Type"), "All Types");
  populateDropdown(colorEl, extractUniqueValues(allInventory, "COLOR"), "All Colors");
  populateDropdown(sizeEl, extractUniqueValues(allInventory, "SIZE"), "All Sizes");

  function getAnalyticsScopedItems() {
    const selectedType = typeEl ? typeEl.value : "all";
    const selectedName = nameEl ? nameEl.value : "all";
    const selectedDesign = designEl ? designEl.value : "all";

    let scoped = allInventory;
    if (selectedType !== "all") scoped = scoped.filter(i => String(i.Type || "").trim() === selectedType);
    if (selectedName !== "all") scoped = scoped.filter(i => String(i.NAME || "").trim() === selectedName);
    if (selectedDesign !== "all") scoped = scoped.filter(i => String(i.Design || "").trim() === selectedDesign);
    return scoped;
  }

  function syncAnalyticsAvailableColors() {
    if (!colorEl) return;
    const scoped = getAnalyticsScopedItems();
    const availableColors = extractUniqueValues(scoped, "COLOR");
    const prevColor = colorEl.value;

    populateDropdown(colorEl, availableColors, "All Colors");

    if (prevColor !== "all" && availableColors.includes(prevColor)) {
      colorEl.value = prevColor;
      syncAnalyticsAvailableShades(scoped, prevColor);
    } else {
      colorEl.value = "all";
      if (shadeEl) {
        shadeEl.value = "all";
        shadeEl.classList.add("hidden");
      }
    }
  }

  function syncAnalyticsAvailableShades(scopedItems, selectedColor) {
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

  window.syncAnalyticsAvailableColors = syncAnalyticsAvailableColors;

  typeEl.addEventListener("change", () => {
    const selectedType = typeEl.value;
    if (selectedType === "all") {
      nameEl.classList.add("hidden");
      nameEl.value = "all";
      designEl.classList.add("hidden");
      designEl.value = "all";
    } else {
      const matching = allInventory.filter(i => String(i.Type || "").trim() === selectedType);
      const names = extractUniqueValues(matching, "NAME");
      populateDropdown(nameEl, names, "All Names");
      nameEl.value = "all";
      nameEl.classList.remove("hidden");
      nameEl.classList.add("filter-appear");

      designEl.classList.add("hidden");
      designEl.value = "all";
    }
    syncAnalyticsAvailableColors();
    refresh();
  });

  nameEl.addEventListener("change", () => {
    const selectedType = typeEl.value;
    const selectedName = nameEl.value;
    if (selectedName === "all") {
      designEl.classList.add("hidden");
      designEl.value = "all";
    } else {
      const matching = allInventory.filter(i =>
        (selectedType === "all" || String(i.Type || "").trim() === selectedType) &&
        String(i.NAME || "").trim() === selectedName
      );
      const designs = extractUniqueValues(matching, "Design");
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
    syncAnalyticsAvailableColors();
    refresh();
  });

  if (designEl) {
    designEl.addEventListener("change", () => {
      syncAnalyticsAvailableColors();
      refresh();
    });
  }

  colorEl.addEventListener("change", () => {
    const scoped = getAnalyticsScopedItems();
    syncAnalyticsAvailableShades(scoped, colorEl.value);
    refresh();
  });

  if (shadeEl) shadeEl.addEventListener("change", refresh);
  if (sizeEl) sizeEl.addEventListener("change", refresh);
}

window.resetAnalyticsProductFilters = function() {
  const typeEl = document.getElementById("analyticsFilterType");
  const nameEl = document.getElementById("analyticsFilterName");
  const designEl = document.getElementById("analyticsFilterDesign");
  const colorEl = document.getElementById("analyticsFilterColor");
  const shadeEl = document.getElementById("analyticsFilterColorShade");
  const sizeEl = document.getElementById("analyticsFilterSize");

  if (typeEl) typeEl.value = "all";
  if (nameEl) { nameEl.value = "all"; nameEl.classList.add("hidden"); }
  if (designEl) { designEl.value = "all"; designEl.classList.add("hidden"); }
  if (colorEl) colorEl.value = "all";
  if (shadeEl) { shadeEl.value = "all"; shadeEl.classList.add("hidden"); }
  if (sizeEl) sizeEl.value = "all";

  if (window.syncAnalyticsAvailableColors) {
    window.syncAnalyticsAvailableColors();
  }

  refresh();
};

function updateActiveInventory() {
  const typeFilter = document.getElementById("analyticsFilterType")?.value || "all";
  const nameFilter = document.getElementById("analyticsFilterName")?.value || "all";
  const designFilter = document.getElementById("analyticsFilterDesign")?.value || "all";
  const colorFilter = document.getElementById("analyticsFilterColor")?.value || "all";
  const shadeFilter = document.getElementById("analyticsFilterColorShade")?.value || "all";
  const sizeFilter = document.getElementById("analyticsFilterSize")?.value || "all";

  const isFiltered = typeFilter !== "all" || nameFilter !== "all" || designFilter !== "all" ||
                     colorFilter !== "all" || shadeFilter !== "all" || sizeFilter !== "all";

  const noticeEl = document.getElementById("analyticsProductFilterNotice");
  if (!isFiltered) {
    activeInventory = allInventory;
    if (noticeEl) noticeEl.textContent = "";
    return false;
  }

  activeInventory = allInventory.filter(item => {
    const itemType = String(item.Type || "").trim();
    const itemName = String(item.NAME || "").trim();
    const itemDesign = String(item.Design || "").trim();
    const itemColor = String(item.COLOR || "").trim();
    const itemShade = String(item["Color Shade"] || "").trim();
    const itemSize = String(item.SIZE || "").trim();

    const typeMatch = typeFilter === "all" || itemType === typeFilter;
    const nameMatch = nameFilter === "all" || itemName === nameFilter;
    const designMatch = designFilter === "all" || itemDesign === designFilter;
    const colorMatch = colorFilter === "all" || itemColor === colorFilter;
    const shadeMatch = shadeFilter === "all" || itemShade === shadeFilter;
    const sizeMatch = sizeFilter === "all" || itemSize === sizeFilter;

    return typeMatch && nameMatch && designMatch && colorMatch && shadeMatch && sizeMatch;
  });

  if (noticeEl) {
    noticeEl.textContent = `Filtered to ${activeInventory.length} product(s)`;
  }
  return true;
}

function getFilteredOrders() {
  const fromVal = document.getElementById("dateFrom").value;
  const toVal = document.getElementById("dateTo").value;

  let orders = allOrders;

  if (fromVal || toVal) {
    orders = orders.filter((o) => {
      const orderDate = parseOrderDate(o.date);
      if (!orderDate) return true;
      
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

  // Filter orders by active inventory if product filters applied
  if (activeInventory.length !== allInventory.length) {
    const matchingSerials = new Set(activeInventory.map(i => String(i.SERIAL || i.SKU)));
    const matchingNames = new Set(activeInventory.map(i => String(i.NAME || "").trim().toLowerCase()));

    orders = orders.filter((o) => {
      const serials = String(o.serial || "").split(",").map(s => s.trim());
      const categories = String(o.category || "").split(",").map(c => c.trim().toLowerCase());
      const hasSerialMatch = serials.some(s => s && matchingSerials.has(s));
      const hasNameMatch = categories.some(c => c && matchingNames.has(c));
      return hasSerialMatch || hasNameMatch;
    });
  }

  return orders;
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
  updateActiveInventory();
  const data = getFilteredOrders();
  const validSalesData = data.filter(r => r.delivery_status !== "Returned" && r.delivery_status !== "Cancelled");

  renderSalesTargets(validSalesData);
  renderKPIs(validSalesData, data);
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
  renderProductStockExplorer();
  renderTopCustomers(validSalesData);
  renderRevenueVsCollection(validSalesData);
  renderDeliveryChart(data);
  renderPaymentChart(data);
  renderLowStockAlerts();
  renderLowStockTable();
  renderTrendingFinishingSoon(validSalesData);
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

  const lowStockItems = activeInventory.filter(item => {
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
function renderKPIs(data, allFilteredData) {
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

  // Return / Cancellation Metrics — computed from the full filtered dataset
  const returnCancelOrders = (allFilteredData || []).filter(r =>
    r.delivery_status === "Returned" || r.delivery_status === "Cancelled"
  );
  const returnCancelUniqueOrders = new Set(returnCancelOrders.map(r => r.order_id));
  const allUniqueOrders = new Set((allFilteredData || []).map(r => r.order_id));
  const returnCancelOrderPct = allUniqueOrders.size > 0
    ? (returnCancelUniqueOrders.size / allUniqueOrders.size) * 100
    : 0;

  // Revenue lost to returns/cancellations (use first row per order to avoid double-counting)
  const returnCancelOrderRowMap = {};
  returnCancelOrders.forEach(r => {
    if (!returnCancelOrderRowMap[r.order_id]) returnCancelOrderRowMap[r.order_id] = r;
  });
  const returnCancelRevenue = Object.values(returnCancelOrderRowMap)
    .reduce((sum, r) => sum + (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0), 0);

  // Gross revenue = valid revenue + returned/cancelled revenue
  const grossRevenue = totalRevenue + returnCancelRevenue;
  const returnCancelRevenuePct = grossRevenue > 0
    ? (returnCancelRevenue / grossRevenue) * 100
    : 0;

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
    { icon: "ri-arrow-go-back-line", color: "red", label: "Return / Cancel %", value: returnCancelOrderPct.toFixed(1) + "%" },
    { icon: "ri-refund-2-line", color: "red", label: "Return / Cancel Revenue", value: formatCurrency(returnCancelRevenue) },
    { icon: "ri-funds-line", color: "yellow", label: "Revenue Loss %", value: returnCancelRevenuePct.toFixed(1) + "%" },
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
  activeInventory.forEach(item => {
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
  activeInventory.forEach(item => {
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

// ─── Product Stock Explorer (Enhanced with Cascading Filters & Intelligence) ───
let pseListenersInitialized = false;
let pseSelectedProduct = "";
let pseCurrentView = "chart";

window.switchPseView = function(view) {
  pseCurrentView = view;
  const tabChart = document.getElementById("pseViewTabChart");
  const tabTable = document.getElementById("pseViewTabTable");
  const chartContainer = document.getElementById("pseChartContainer");
  const tableContainer = document.getElementById("pseTableContainer");

  if (view === "chart") {
    if (tabChart) tabChart.classList.add("active");
    if (tabTable) tabTable.classList.remove("active");
    if (chartContainer) chartContainer.style.display = "block";
    if (tableContainer) tableContainer.style.display = "none";
  } else {
    if (tabChart) tabChart.classList.remove("active");
    if (tabTable) tabTable.classList.add("active");
    if (chartContainer) chartContainer.style.display = "none";
    if (tableContainer) tableContainer.style.display = "block";
  }
};

window.resetPseFilters = function() {
  const typeEl = document.getElementById("pseFilterType");
  const searchEl = document.getElementById("pseProductSearch");
  const designEl = document.getElementById("pseFilterDesign");
  const colorEl = document.getElementById("pseFilterColor");
  const shadeEl = document.getElementById("pseFilterColorShade");
  const sizeEl = document.getElementById("pseFilterSize");
  const stockEl = document.getElementById("pseFilterStockStatus");
  const unitEl = document.getElementById("pseUnitToggle");

  if (typeEl) typeEl.value = "all";
  if (searchEl) searchEl.value = "";
  pseSelectedProduct = "";
  if (designEl) { designEl.value = "all"; designEl.classList.add("hidden"); }
  if (colorEl) colorEl.value = "all";
  if (shadeEl) { shadeEl.value = "all"; shadeEl.classList.add("hidden"); }
  if (sizeEl) sizeEl.value = "all";
  if (stockEl) stockEl.value = "all";
  if (unitEl) unitEl.value = "sets";

  syncPseAvailableColors();
  updatePseDisplay();
};

function getPseScopedItems() {
  const selectedType = document.getElementById("pseFilterType")?.value || "all";
  const searchVal = (document.getElementById("pseProductSearch")?.value || "").trim().toLowerCase();
  const selectedProduct = pseSelectedProduct || (searchVal ? searchVal : "");
  const selectedDesign = document.getElementById("pseFilterDesign")?.value || "all";

  let scoped = allInventory;
  if (selectedType !== "all") {
    scoped = scoped.filter(i => String(i.Type || "").trim() === selectedType);
  }
  if (selectedProduct) {
    scoped = scoped.filter(i => {
      const name = String(i.NAME || "").trim().toLowerCase();
      const sku = String(i.SKU || "").trim().toLowerCase();
      const serial = String(i.SERIAL || "").trim().toLowerCase();
      return name === selectedProduct.toLowerCase() || name.includes(selectedProduct.toLowerCase()) || sku.includes(selectedProduct.toLowerCase()) || serial.includes(selectedProduct.toLowerCase());
    });
  }
  if (selectedDesign !== "all") {
    scoped = scoped.filter(i => String(i.Design || "").trim() === selectedDesign);
  }
  return scoped;
}

function syncPseAvailableColors() {
  const colorEl = document.getElementById("pseFilterColor");
  const shadeEl = document.getElementById("pseFilterColorShade");
  if (!colorEl) return;

  const scoped = getPseScopedItems();
  const availableColors = extractUniqueValues(scoped, "COLOR");
  const prevColor = colorEl.value;

  populateDropdown(colorEl, availableColors, "All Colors");

  if (prevColor !== "all" && availableColors.includes(prevColor)) {
    colorEl.value = prevColor;
    syncPseAvailableShades(scoped, prevColor);
  } else {
    colorEl.value = "all";
    if (shadeEl) {
      shadeEl.value = "all";
      shadeEl.classList.add("hidden");
    }
  }
}

function syncPseAvailableShades(scopedItems, selectedColor) {
  const shadeEl = document.getElementById("pseFilterColorShade");
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

function setupPseListeners() {
  if (pseListenersInitialized) return;
  pseListenersInitialized = true;

  const typeEl = document.getElementById("pseFilterType");
  const searchInput = document.getElementById("pseProductSearch");
  const dropdown = document.getElementById("pseProductSearchDropdown");
  const designEl = document.getElementById("pseFilterDesign");
  const colorEl = document.getElementById("pseFilterColor");
  const shadeEl = document.getElementById("pseFilterColorShade");
  const sizeEl = document.getElementById("pseFilterSize");
  const stockEl = document.getElementById("pseFilterStockStatus");
  const unitEl = document.getElementById("pseUnitToggle");

  if (typeEl) {
    typeEl.addEventListener("change", () => {
      const selectedType = typeEl.value;
      if (selectedType !== "all" && pseSelectedProduct) {
        const item = allInventory.find(i => String(i.NAME || "").trim() === pseSelectedProduct);
        if (item && String(item.Type || "").trim() !== selectedType) {
          pseSelectedProduct = "";
          if (searchInput) searchInput.value = "";
        }
      }
      syncPseDesigns();
      syncPseAvailableColors();
      updatePseDisplay();
    });
  }

  function renderSearchDropdown(query) {
    if (!dropdown) return;
    const q = (query || "").trim().toLowerCase();
    const selectedType = typeEl ? typeEl.value : "all";

    let pool = allInventory;
    if (selectedType !== "all") {
      pool = pool.filter(i => String(i.Type || "").trim() === selectedType);
    }

    const uniqueProductNames = [...new Set(pool.map(i => String(i.NAME || "").trim()).filter(Boolean))].sort();
    const matches = q
      ? uniqueProductNames.filter(n => n.toLowerCase().includes(q))
      : uniqueProductNames;

    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding:10px 12px; color:var(--text-muted); font-size:12px;">No matching products found</div>';
      dropdown.style.display = "block";
      return;
    }

    dropdown.innerHTML = matches.slice(0, 30).map(name => {
      const variants = pool.filter(i => String(i.NAME || "").trim() === name);
      const totalStock = variants.reduce((s, i) => s + getStock(i), 0);
      const setSize = parseInt(variants[0]["CHURI IN A SET"]) || 1;
      const sets = Math.floor(totalStock / setSize);
      const imgUrl = getFirstImageUrl(variants[0]["IMAGE LINK"], variants[0].IMAGES);
      const typeBadge = variants[0].Type ? `<span class="badge-type" style="font-size:9px;padding:1px 4px;">${variants[0].Type}</span>` : '';

      return `
        <div class="pse-search-item" data-name="${name}" style="display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer; transition:background 0.15s; border-bottom:1px solid var(--border);">
          ${imgUrl
            ? `<img src="${imgUrl}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;flex-shrink:0;" referrerpolicy="no-referrer">`
            : '<i class="ri-image-line" style="font-size:20px;color:var(--text-muted);width:32px;text-align:center;flex-shrink:0;"></i>'}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>
              ${typeBadge}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">
              ${variants.length} variant${variants.length > 1 ? 's' : ''} · <strong>${sets} sets</strong> (${totalStock} pcs)
            </div>
          </div>
        </div>
      `;
    }).join("");

    dropdown.style.display = "block";

    dropdown.querySelectorAll(".pse-search-item").forEach(el => {
      el.addEventListener("click", () => {
        const chosenName = el.dataset.name;
        pseSelectedProduct = chosenName;
        if (searchInput) searchInput.value = chosenName;
        dropdown.style.display = "none";
        syncPseDesigns();
        syncPseAvailableColors();
        updatePseDisplay();
      });
      el.addEventListener("mouseenter", () => { el.style.background = "var(--bg)"; });
      el.addEventListener("mouseleave", () => { el.style.background = "transparent"; });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("focus", () => renderSearchDropdown(searchInput.value));
    searchInput.addEventListener("input", () => {
      pseSelectedProduct = searchInput.value.trim();
      renderSearchDropdown(searchInput.value);
      syncPseDesigns();
      syncPseAvailableColors();
      updatePseDisplay();
    });
  }

  document.addEventListener("click", (e) => {
    const wrap = document.getElementById("pseProductSearchWrapper");
    if (wrap && !wrap.contains(e.target) && dropdown) {
      dropdown.style.display = "none";
    }
  });

  function syncPseDesigns() {
    if (!designEl) return;
    const scoped = getPseScopedItems();
    const availableDesigns = extractUniqueValues(scoped, "Design");
    if (availableDesigns.length > 0 && pseSelectedProduct) {
      populateDropdown(designEl, availableDesigns, "All Designs");
      designEl.value = "all";
      designEl.classList.remove("hidden");
      designEl.classList.add("filter-appear");
    } else {
      designEl.value = "all";
      designEl.classList.add("hidden");
    }
  }

  if (designEl) {
    designEl.addEventListener("change", () => {
      syncPseAvailableColors();
      updatePseDisplay();
    });
  }

  if (colorEl) {
    colorEl.addEventListener("change", () => {
      const scoped = getPseScopedItems();
      syncPseAvailableShades(scoped, colorEl.value);
      updatePseDisplay();
    });
  }

  if (shadeEl) shadeEl.addEventListener("change", updatePseDisplay);
  if (sizeEl) sizeEl.addEventListener("change", updatePseDisplay);
  if (stockEl) stockEl.addEventListener("change", updatePseDisplay);
  if (unitEl) unitEl.addEventListener("change", updatePseDisplay);
}

function renderProductStockExplorer() {
  setupPseListeners();

  const typeEl = document.getElementById("pseFilterType");
  const colorEl = document.getElementById("pseFilterColor");
  const sizeEl = document.getElementById("pseFilterSize");
  const searchInput = document.getElementById("pseProductSearch");

  // Populate initial dropdown options if not populated
  if (typeEl && typeEl.options.length <= 1) {
    populateDropdown(typeEl, extractUniqueValues(allInventory, "Type"), "All Types");
  }
  if (colorEl && colorEl.options.length <= 1) {
    populateDropdown(colorEl, extractUniqueValues(allInventory, "COLOR"), "All Colors");
  }
  if (sizeEl && sizeEl.options.length <= 1) {
    populateDropdown(sizeEl, extractUniqueValues(allInventory, "SIZE"), "All Sizes");
  }

  // If no product selected yet, pick the top product from allInventory
  if (!pseSelectedProduct && (!searchInput || !searchInput.value.trim())) {
    const sortedByStock = [...allInventory].sort((a, b) => getStock(b) - getStock(a));
    const firstWithStock = sortedByStock.find(i => (i.NAME || "").trim());
    if (firstWithStock) {
      pseSelectedProduct = String(firstWithStock.NAME).trim();
      if (searchInput) searchInput.value = pseSelectedProduct;
      syncPseAvailableColors();
    }
  }

  updatePseDisplay();
}

function updatePseDisplay() {
  const chartWrapper = document.getElementById("productStockChartWrapper");
  const canvas = document.getElementById("productStockChart");
  const banner = document.getElementById("pseProductBanner");
  const alertsContainer = document.getElementById("pseAlertsContainer");
  const badgeEl = document.getElementById("pseActiveCountBadge");
  const tableBody = document.getElementById("pseVariantTableBody");

  if (!chartWrapper || !canvas) return;

  const selectedType = document.getElementById("pseFilterType")?.value || "all";
  const searchVal = (document.getElementById("pseProductSearch")?.value || "").trim().toLowerCase();
  const selectedDesign = document.getElementById("pseFilterDesign")?.value || "all";
  const selectedColor = document.getElementById("pseFilterColor")?.value || "all";
  const selectedShade = document.getElementById("pseFilterColorShade")?.value || "all";
  const selectedSize = document.getElementById("pseFilterSize")?.value || "all";
  const stockFilter = document.getElementById("pseFilterStockStatus")?.value || "all";
  const unitMode = document.getElementById("pseUnitToggle")?.value || "sets";

  // Filter pool
  const variants = allInventory.filter(item => {
    const itemType = String(item.Type || "").trim();
    const itemName = String(item.NAME || "").trim();
    const itemDesign = String(item.Design || "").trim();
    const itemColor = String(item.COLOR || "").trim();
    const itemShade = String(item["Color Shade"] || "").trim();
    const itemSize = String(item.SIZE || "").trim();
    const itemSku = String(item.SKU || "").trim();
    const itemSerial = String(item.SERIAL || "").trim();
    const stock = getStock(item);
    const requests = parseInt(item.REQUEST || item.Request) || 0;

    const typeMatch = selectedType === "all" || itemType === selectedType;
    let prodMatch = true;
    if (pseSelectedProduct) {
      prodMatch = itemName.toLowerCase() === pseSelectedProduct.toLowerCase();
    } else if (searchVal) {
      prodMatch = itemName.toLowerCase().includes(searchVal) ||
                  itemSku.toLowerCase().includes(searchVal) ||
                  itemSerial.toLowerCase().includes(searchVal);
    }

    const designMatch = selectedDesign === "all" || itemDesign === selectedDesign;
    const colorMatch = selectedColor === "all" || itemColor === selectedColor;
    const shadeMatch = selectedShade === "all" || itemShade === selectedShade;
    const sizeMatch = selectedSize === "all" || itemSize === selectedSize;

    let stockMatch = true;
    if (stockFilter === "in_stock") stockMatch = stock > 0;
    else if (stockFilter === "low_stock") stockMatch = stock > 0 && stock < 5;
    else if (stockFilter === "out_of_stock") stockMatch = stock <= 0;
    else if (stockFilter === "has_requests") stockMatch = requests > 0;

    return typeMatch && prodMatch && designMatch && colorMatch && shadeMatch && sizeMatch && stockMatch;
  });

  if (variants.length === 0) {
    if (badgeEl) badgeEl.textContent = "0 Variants";
    if (banner) banner.style.display = "none";
    if (alertsContainer) alertsContainer.style.display = "none";
    chartWrapper.style.display = "block";
    chartWrapper.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:13px;">
        <i class="ri-search-eye-line" style="font-size:36px; display:block; margin-bottom:8px; opacity:0.3;"></i>
        No variants match the current explorer filters. Try adjusting your search, Type, or Stock Status.
      </div>`;
    canvas.style.display = "none";
    destroyChart("productStockChart");
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);">No matching variants</td></tr>';
    return;
  }

  if (badgeEl) badgeEl.textContent = `${variants.length} Variant${variants.length > 1 ? 's' : ''}`;

  // Metrics computation
  const setSize = parseInt(variants[0]["CHURI IN A SET"]) || 12;
  const sellingPrice = parseFloat(variants[0]["SELLING PRICE"]) || 0;
  const lastPrice = parseFloat(variants[0]["LAST PRICE"]) || 0;
  const profitMargin = sellingPrice > 0 ? Math.round(((sellingPrice - lastPrice) / sellingPrice) * 100) : 0;

  const totalStockPcs = variants.reduce((s, i) => s + getStock(i), 0);
  const totalStockSets = Math.floor(totalStockPcs / setSize);

  const totalSoldPcs = variants.reduce((s, i) => s + (parseInt(i.SOLD) || 0), 0);
  const totalSoldSets = Math.round(totalSoldPcs / setSize);

  const totalCapacityPcs = variants.reduce((s, i) => s + (parseInt(i["TOTAL UNIT"]) || 0), 0);
  const sellThroughRate = totalCapacityPcs > 0 ? Math.round((totalSoldPcs / totalCapacityPcs) * 100) : 0;

  const totalStockValue = totalStockSets * sellingPrice;
  const totalCostCapital = totalStockSets * lastPrice;

  const totalDamagedPcs = variants.reduce((s, i) => s + (parseInt(i.DAMAGED) || 0), 0);
  const totalRequests = variants.reduce((s, i) => s + (parseInt(i.REQUEST || i.Request) || 0), 0);

  // Compute 15-day sales velocity for these variants
  let recent15dSoldPcs = 0;
  const now = new Date();
  const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  const variantSerials = new Set(variants.map(v => String(v.SERIAL || v.SKU)));
  const variantNames = new Set(variants.map(v => String(v.NAME || "").toLowerCase()));

  allOrders.forEach(o => {
    if (o.delivery_status === "Returned" || o.delivery_status === "Cancelled") return;
    const oDate = parseOrderDate(o.date);
    if (!oDate || oDate < fifteenDaysAgo) return;

    const serials = String(o.serial || "").split(",").map(s => s.trim());
    const qtys = String(o.quantity || "1").split(",").map(q => parseInt(q.trim()) || 1);
    const names = String(o.category || "").split(",").map(n => n.trim().toLowerCase());

    serials.forEach((ser, idx) => {
      const q = qtys[idx] || qtys[0] || 1;
      const n = names[idx] || names[0];
      if ((ser && variantSerials.has(ser)) || (n && variantNames.has(n))) {
        recent15dSoldPcs += q;
      }
    });
  });
  const recent15dSets = Math.round(recent15dSoldPcs / setSize);

  // Render Banner
  if (banner) {
    const mainImg = getFirstImageUrl(variants[0]["IMAGE LINK"], variants[0].IMAGES);
    const displayName = pseSelectedProduct || variants[0].NAME;
    const typeLabel = variants[0].Type ? `<span class="badge-type">${variants[0].Type}</span>` : '';
    const designLabel = variants[0].Design ? `<span style="font-size:12px;color:var(--text-muted);font-weight:400;">(${variants[0].Design})</span>` : '';

    banner.style.display = "flex";
    banner.innerHTML = `
      <div style="display:flex; align-items:center; gap:14px; min-width:240px; flex:1;">
        ${mainImg
          ? `<img src="${mainImg}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.12);" referrerpolicy="no-referrer">`
          : '<div style="width:52px;height:52px;border-radius:10px;background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--text-muted);flex-shrink:0;"><i class="ri-image-line" style="font-size:24px;"></i></div>'}
        <div style="flex:1;min-width:0;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-weight:700; font-size:15px; color:var(--text);">${displayName}</span>
            ${designLabel}
            ${typeLabel}
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:4px; flex-wrap:wrap;">
            <span class="badge-set-pcs"><i class="ri-stack-line"></i> ${setSize} pcs/set</span>
            <span style="font-size:12px; font-weight:700; color:var(--primary);">${formatCurrency(sellingPrice)}</span>
            <span style="font-size:11px; color:var(--text-muted);">(Cost: ${formatCurrency(lastPrice)} · ${profitMargin}% Margin)</span>
          </div>
        </div>
      </div>

      <div class="pse-kpi-grid">
        <div class="pse-kpi-item">
          <div class="kpi-val" style="color:var(--success);">${totalStockSets} <span style="font-size:11px;font-weight:500;">Sets</span></div>
          <div class="kpi-lbl">Remaining (${totalStockPcs} pcs)</div>
        </div>
        <div class="pse-kpi-item">
          <div class="kpi-val" style="color:var(--info);">${totalSoldSets} <span style="font-size:11px;font-weight:500;">Sets</span></div>
          <div class="kpi-lbl">Sold (${sellThroughRate}%)</div>
        </div>
        <div class="pse-kpi-item">
          <div class="kpi-val" style="color:var(--accent);">${recent15dSets} <span style="font-size:11px;font-weight:500;">Sets</span></div>
          <div class="kpi-lbl">15-Day Velocity</div>
        </div>
        <div class="pse-kpi-item">
          <div class="kpi-val" style="color:var(--primary);">${formatCurrency(totalStockValue)}</div>
          <div class="kpi-lbl">Retail Value</div>
        </div>
        <div class="pse-kpi-item">
          <div class="kpi-val" style="color:${totalRequests > 0 ? '#ef4444' : 'var(--text-muted)'};">${totalRequests}</div>
          <div class="kpi-lbl">Backorders</div>
        </div>
        <div class="pse-kpi-item">
          <div class="kpi-val" style="color:var(--warning);">${totalDamagedPcs}</div>
          <div class="kpi-lbl">Damaged</div>
        </div>
      </div>
    `;
  }

  // Stock Alerts
  if (alertsContainer) {
    const alerts = [];
    const outVariants = variants.filter(v => getStock(v) <= 0);
    const lowVariants = variants.filter(v => { const q = getStock(v); return q > 0 && q < 5; });
    const reqVariants = variants.filter(v => (parseInt(v.REQUEST || v.Request) || 0) > 0);

    if (outVariants.length > 0) {
      const outSummary = [...new Set(outVariants.map(v => `${v.COLOR || 'Item'} (${v.SIZE || 'All'})`))].slice(0, 5).join(", ");
      alerts.push(`
        <div class="pse-alert-strip pse-alert-danger">
          <i class="ri-error-warning-fill" style="font-size:16px;"></i>
          <span><strong>Out of Stock:</strong> ${outVariants.length} variant${outVariants.length > 1 ? 's' : ''} sold out (${outSummary}${outVariants.length > 5 ? '...' : ''}). Consider restocking!</span>
        </div>
      `);
    }

    if (reqVariants.length > 0) {
      alerts.push(`
        <div class="pse-alert-strip pse-alert-purple">
          <i class="ri-notification-fill" style="font-size:16px;"></i>
          <span><strong>Customer Demand:</strong> ${totalRequests} customer backorder request(s) waiting for these items.</span>
        </div>
      `);
    }

    if (lowVariants.length > 0) {
      const lowSummary = [...new Set(lowVariants.map(v => `${v.COLOR || 'Item'} (${v.SIZE || 'All'})`))].slice(0, 4).join(", ");
      alerts.push(`
        <div class="pse-alert-strip pse-alert-warning">
          <i class="ri-alert-fill" style="font-size:16px;"></i>
          <span><strong>Low Stock:</strong> ${lowVariants.length} variant(s) have less than 5 pieces left (${lowSummary}).</span>
        </div>
      `);
    }

    if (alerts.length > 0) {
      alertsContainer.style.display = "flex";
      alertsContainer.innerHTML = alerts.join("");
    } else {
      alertsContainer.style.display = "none";
    }
  }

  // Render Table View
  if (tableBody) {
    tableBody.innerHTML = variants.map(v => {
      const stock = getStock(v);
      const isOut = stock <= 0;
      const isLow = stock > 0 && stock < 5;
      const vSetSize = parseInt(v["CHURI IN A SET"]) || setSize;
      const sold = parseInt(v.SOLD) || 0;
      const soldSets = Math.round(sold / vSetSize);
      const damaged = parseInt(v.DAMAGED) || 0;
      const requests = parseInt(v.REQUEST || v.Request) || 0;
      const vImg = getFirstImageUrl(v["IMAGE LINK"], v.IMAGES);
      const stockBadge = isOut
        ? '<span class="stock-badge stock-out">Out of Stock</span>'
        : isLow
          ? `<span class="stock-badge stock-low">${formatStockDisplay(stock, vSetSize)}</span>`
          : `<span class="stock-badge stock-ok">${formatStockDisplay(stock, vSetSize)}</span>`;

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              ${vImg ? `<img src="${vImg}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;" referrerpolicy="no-referrer">` : '<i class="ri-image-line" style="font-size:16px;color:var(--text-muted);"></i>'}
              <div>
                <div style="font-weight:600;">${v.SERIAL || v.SKU || '—'}</div>
                <div style="font-size:10px;color:var(--text-muted);">${v["SKU NAME"] || v.NAME}</div>
              </div>
            </div>
          </td>
          <td>
            <div>
              <strong>${v.COLOR || '—'}</strong>
              ${v["Color Shade"] ? `<span class="badge-shade" style="margin-left:4px;">${v["Color Shade"]}</span>` : ''}
            </div>
          </td>
          <td>${v.Design || '—'}</td>
          <td><span class="size-badge">Size ${v.SIZE || '—'}</span></td>
          <td>${vSetSize} pcs</td>
          <td>${stockBadge}</td>
          <td><strong>${soldSets} sets</strong> <span style="font-size:10px;color:var(--text-muted);">(${sold} pcs)</span></td>
          <td>${damaged > 0 ? `<span style="color:var(--warning);font-weight:600;">${damaged}</span>` : '0'}</td>
          <td>${requests > 0 ? `<span style="color:#ef4444;font-weight:700;"><i class="ri-notification-line"></i> ${requests}</span>` : '0'}</td>
          <td>
            <a href="pos.html?search=${encodeURIComponent(v.SERIAL || v.SKU || v.NAME)}" target="_blank" class="btn btn-sm btn-outline" style="padding:4px 8px;font-size:11px;" title="Find in POS">
              <i class="ri-shopping-cart-line"></i> POS
            </a>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Render Bar Chart View
  chartWrapper.style.display = "none";
  canvas.style.display = "block";

  // Build matrix: Color -> { Size -> value }
  const colorStockMap = {};
  const allSizes = new Set();

  variants.forEach(v => {
    const color = v.COLOR || "Standard";
    const size = v.SIZE || "Standard";
    const stock = getStock(v);
    const vSetSize = parseInt(v["CHURI IN A SET"]) || setSize;
    const value = unitMode === "pieces" ? stock : (Math.round((stock / vSetSize) * 10) / 10);

    allSizes.add(size);
    if (!colorStockMap[color]) colorStockMap[color] = {};
    colorStockMap[color][size] = (colorStockMap[color][size] || 0) + value;
  });

  const sortedSizes = [...allSizes].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  const colorTotals = Object.entries(colorStockMap).map(([color, sizeMap]) => {
    const total = Object.values(sizeMap).reduce((s, val) => s + val, 0);
    return { color, total };
  }).sort((a, b) => b.total - a.total);

  const sortedColors = colorTotals.map(c => c.color);

  const datasets = sortedSizes.map((size, i) => {
    const hue = (i * 137.5) % 360;
    return {
      label: `Size ${size}`,
      data: sortedColors.map(color => colorStockMap[color]?.[size] || 0),
      backgroundColor: `hsla(${hue}, 70%, 55%, 0.85)`,
      borderColor: `hsla(${hue}, 70%, 42%, 1)`,
      borderWidth: 1,
      borderRadius: 4,
    };
  });

  destroyChart("productStockChart");
  const ctx = canvas.getContext("2d");

  const stockLabelPlugin = {
    id: 'stockBarLabels',
    afterDatasetsDraw(chart) {
      const ctx2 = chart.ctx;
      chart.data.datasets.forEach((dataset, di) => {
        chart.getDatasetMeta(di).data.forEach((bar, i) => {
          const val = dataset.data[i];
          if (!val || val <= 0) return;
          ctx2.save();
          ctx2.font = 'bold 9px Inter, sans-serif';
          ctx2.fillStyle = 'rgba(255,255,255,0.95)';
          ctx2.textAlign = 'center';
          ctx2.textBaseline = 'bottom';
          ctx2.fillText(val, bar.x, bar.y - 3);
          ctx2.restore();
        });
      });
    }
  };

  charts["productStockChart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sortedColors,
      datasets
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: { usePointStyle: true, padding: 10, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const u = unitMode === "pieces" ? "pcs" : "sets";
              return `${context.dataset.label}: ${context.parsed.y} ${u}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Color", font: { size: 11, weight: '600' } },
          ticks: { autoSkip: false, maxRotation: 45, minRotation: 25, font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: unitMode === "pieces" ? "Pieces" : "Sets", font: { size: 11, weight: '600' } },
          ticks: {
            stepSize: unitMode === "pieces" ? 6 : 1,
            callback: function(value) { return Number.isInteger(value) ? value : ''; }
          }
        }
      }
    },
    plugins: [stockLabelPlugin]
  });
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

  // Deduplicate by order_id — keep one row per order to avoid double-counting
  const orderRowMap = {};
  data.forEach(r => {
    if (!orderRowMap[r.order_id]) orderRowMap[r.order_id] = r;
  });
  const uniqueRows = Object.values(orderRowMap);

  const totalRevenue = uniqueRows.reduce((s, r) => s + (parseFloat(r.total_amount) || parseFloat(r.total_price) || 0), 0);
  const totalCollected = uniqueRows.reduce((s, r) => s + (parseFloat(r.paid_amount) || 0), 0);
  const totalDue = uniqueRows.reduce((s, r) => s + (parseFloat(r.due_amount) || 0), 0);

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
  const statuses = { Pending: 0, Packed: 0, Dispatched: 0, Delivered: 0, Returned: 0 };
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

// ─── Top 10 Low Stock Products (Table) ──────────────────
function renderLowStockTable() {
  const wrapper = document.getElementById("lowStockTableWrapper");
  if (!wrapper) return;

  // Aggregate stock by product NAME only (not per color/size variant)
  const productMap = {};
  activeInventory.forEach(item => {
    const name = item.NAME || "Unknown";
    const remaining = getStock(item);
    const setSize = parseInt(item["CHURI IN A SET"]) || 1;

    if (!productMap[name]) {
      productMap[name] = {
        name,
        remaining: 0,
        totalCapacity: 0,
        imgUrl: getFirstImageUrl(item["IMAGE LINK"], item.IMAGES),
        setSize,
        variantCount: 0
      };
    }
    productMap[name].remaining += remaining;
    productMap[name].totalCapacity += (parseInt(item["TOTAL UNIT"]) || 0);
    productMap[name].variantCount++;
  });

  // Filter to items that still have stock > 0, sorted ascending by remaining
  const lowStockItems = Object.values(productMap)
    .filter(v => v.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 10);

  if (lowStockItems.length === 0) {
    wrapper.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">No products currently in stock.</span>';
    return;
  }

  const rows = lowStockItems.map((item, idx) => {
    const pct = item.totalCapacity > 0 ? Math.round((item.remaining / item.totalCapacity) * 100) : 0;
    const urgencyColor = pct <= 10 ? "var(--danger)" : pct <= 25 ? "var(--warning)" : "var(--success)";
    const setsDisplay = Math.floor(item.remaining / item.setSize);
    const piecesDisplay = item.remaining;

    return `
      <tr>
        <td style="font-weight:600;color:var(--text-muted);text-align:center;width:32px;">${idx + 1}</td>
        <td style="width:40px;">
          ${item.imgUrl
            ? `<img src="${item.imgUrl}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;" referrerpolicy="no-referrer">`
            : '<i class="ri-image-line" style="font-size:20px;color:var(--text-muted);"></i>'}
        </td>
        <td>
          <div style="font-weight:600;font-size:13px;">${item.name}</div>
          <div style="font-size:11px;color:var(--text-muted);">${item.variantCount} variant${item.variantCount > 1 ? 's' : ''}</div>
        </td>
        <td style="text-align:right;white-space:nowrap;">
          <div style="font-weight:800;font-size:16px;color:${urgencyColor};">${setsDisplay} <span style="font-size:12px;font-weight:600;">Sets</span></div>
          <div style="font-size:11px;color:var(--text-muted);">${piecesDisplay} Pcs Total</div>
        </td>
        <td style="width:120px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;height:6px;background:rgba(0,0,0,0.06);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${urgencyColor};border-radius:3px;transition:width 0.4s;"></div>
            </div>
            <span style="font-size:10px;color:var(--text-muted);min-width:28px;text-align:right;">${pct}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  wrapper.innerHTML = `
    <table class="data-table" style="min-width:500px;">
      <thead>
        <tr>
          <th style="width:32px;">#</th>
          <th style="width:40px;"></th>
          <th>Product</th>
          <th style="text-align:right;">Remaining</th>
          <th style="width:120px;">Stock Level</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─── Trending Products — Finishing Soon ─────────────────
function renderTrendingFinishingSoon(salesData) {
  const wrapper = document.getElementById("trendingFinishTableWrapper");
  if (!wrapper) return;

  // Determine date span of sales data to compute daily sell rate
  let minDate = null;
  let maxDate = null;
  salesData.forEach(row => {
    const d = parseOrderDate(row.date);
    if (!d) return;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  });
  const now = new Date();
  const salesDays = minDate && maxDate
    ? Math.max(1, Math.round((now - minDate) / (1000 * 60 * 60 * 24)))
    : 30;

  // Step 1: Compute total sets sold per product name
  const productSales = {};
  salesData.forEach(row => {
    const rawNames = String(row.category || "Unknown");
    const rawQtys = String(row.quantity || "1");
    const rawSerials = String(row.serial || "");
    const names = rawNames.split(",").map(s => s.trim());
    const qtys = rawQtys.split(",").map(s => parseInt(s.trim()) || 1);
    const serials = rawSerials.split(",").map(s => s.trim());

    names.forEach((name, idx) => {
      if (!name) return;
      let qty = qtys[idx] || qtys[0] || 1;
      const serial = serials[idx] || serials[0];
      const invItem = allInventory.find(i => String(i.SERIAL) === serial);
      const setSize = invItem ? (parseInt(invItem["CHURI IN A SET"]) || 1) : 1;
      if (qty > 500 || qty <= 0) qty = setSize;
      productSales[name] = (productSales[name] || 0) + (qty / setSize);
    });
  });

  // Step 2: Compute current stock per product name
  const productStock = {};
  const productMeta = {};
  activeInventory.forEach(item => {
    const name = item.NAME || "Unknown";
    const remaining = getStock(item);
    const setSize = parseInt(item["CHURI IN A SET"]) || 1;
    productStock[name] = (productStock[name] || 0) + remaining;
    if (!productMeta[name]) {
      productMeta[name] = {
        setSize,
        imgUrl: getFirstImageUrl(item["IMAGE LINK"], item.IMAGES)
      };
    }
  });

  // Step 3: Merge — compute daily sell rate & estimated days left
  const merged = Object.keys(productSales)
    .filter(name => (productStock[name] || 0) > 0)
    .map(name => {
      const totalSold = Math.round(productSales[name] * 10) / 10;
      const remaining = productStock[name] || 0;
      const meta = productMeta[name] || { setSize: 1, imgUrl: "" };
      const remainingSets = Math.round((remaining / meta.setSize) * 10) / 10;
      const dailySellRate = totalSold / salesDays;
      // Estimated days until stock runs out based on sell rate
      const daysLeft = dailySellRate > 0 ? Math.round(remainingSets / dailySellRate) : 999;
      return { name, totalSold, remaining, remainingSets, dailySellRate, daysLeft, ...meta };
    })
    // Primary sort: fewest days left first (most urgent to source)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 10);

  if (merged.length === 0) {
    wrapper.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">No trending products at risk.</span>';
    return;
  }

  const rows = merged.map((item, idx) => {
    const isCritical = item.daysLeft <= 7;
    const isUrgent = item.daysLeft <= 14;
    const daysColor = isCritical ? "var(--danger)" : isUrgent ? "var(--warning)" : "var(--success)";
    const daysLabel = item.daysLeft >= 999 ? "∞" : `~${item.daysLeft}d`;

    const statusBadge = isCritical
      ? '<span class="badge badge-danger">Source Now</span>'
      : isUrgent
        ? '<span class="badge badge-warning">Source Soon</span>'
        : '<span class="badge badge-success">OK</span>';

    const dailyRateDisplay = item.dailySellRate >= 1
      ? `${Math.round(item.dailySellRate * 10) / 10}/day`
      : `${Math.round(item.dailySellRate * 70) / 10}/wk`;

    return `
      <tr>
        <td style="font-weight:600;color:var(--text-muted);text-align:center;width:32px;">${idx + 1}</td>
        <td style="width:40px;">
          ${item.imgUrl
            ? `<img src="${item.imgUrl}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;" referrerpolicy="no-referrer">`
            : '<i class="ri-image-line" style="font-size:20px;color:var(--text-muted);"></i>'}
        </td>
        <td>
          <div style="font-weight:600;font-size:13px;">${item.name}</div>
          <div style="font-size:11px;color:var(--text-muted);">Selling ${dailyRateDisplay}</div>
        </td>
        <td style="text-align:right;">
          <div style="font-weight:800;font-size:15px;color:var(--info);">${item.totalSold} <span style="font-size:11px;font-weight:600;">Sets</span></div>
        </td>
        <td style="text-align:right;white-space:nowrap;">
          <div style="font-weight:800;font-size:16px;color:${isCritical ? 'var(--danger)' : isUrgent ? 'var(--warning)' : 'var(--text)'};">${item.remainingSets} <span style="font-size:12px;font-weight:600;">Sets</span></div>
          <div style="font-size:11px;color:var(--text-muted);">${item.remaining} Pcs Total</div>
        </td>
        <td style="text-align:center;">
          <div style="font-weight:800;font-size:15px;color:${daysColor};line-height:1;">${daysLabel}</div>
          <div style="font-size:10px;color:var(--text-muted);">left</div>
        </td>
        <td style="text-align:center;">${statusBadge}</td>
      </tr>
    `;
  }).join("");

  wrapper.innerHTML = `
    <table class="data-table" style="min-width:640px;">
      <thead>
        <tr>
          <th style="width:32px;">#</th>
          <th style="width:40px;"></th>
          <th>Product</th>
          <th style="text-align:right;">Total Sold</th>
          <th style="text-align:right;">Stock Left</th>
          <th style="text-align:center;">Days Left</th>
          <th style="text-align:center;">Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
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
