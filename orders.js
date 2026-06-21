/**
 * Orders Page — Grouped order cards with lifecycle actions
 */
let allOrders = [];
let groupedOrders = {};
let activeTab = "All";
let activePayFilter = "All";
let allReturns = [];
let inventoryCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupPaymentFilters();
  document.getElementById("searchOrders").addEventListener("input", renderOrders);
  document.getElementById("dateFrom").addEventListener("change", renderOrders);
  document.getElementById("dateTo").addEventListener("change", renderOrders);

  // Close modal on overlay click
  document.getElementById("updateModal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) closeUpdateModal();
  });
  document.getElementById("paymentModal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) closePaymentModal();
  });
  document.getElementById("returnModal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) closeReturnModal();
  });

  await loadOrders();
});

function setupTabs() {
  document.querySelectorAll("#statusTabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector("#statusTabs .tab-btn.active").classList.remove("active");
      btn.classList.add("active");
      activeTab = btn.dataset.status;
      renderOrders();
      toggleReturnsPanel();
    });
  });
}

function setupPaymentFilters() {
  document.querySelectorAll("#paymentFilters .pill-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelector("#paymentFilters .pill-filter.active").classList.remove("active");
      btn.classList.add("active");
      activePayFilter = btn.dataset.pay;
      renderOrders();
    });
  });
}

async function loadOrders() {
  try {
    // Load inventory for product images and return qty lookups
    const [ordersData, returnsData, invData] = await Promise.all([
      Api.getOrders().catch(err => ({ error: err.message })),
      Api.getReturns().catch(err => ({ error: err.message })),
      Api.getInventory().catch(err => ({ error: err.message }))
    ]);

    // If orders API fundamentally failed (network or parse error)
    if (ordersData && ordersData.error) {
      throw new Error("Orders API failed: " + ordersData.error);
    }
    // Also if it returned a backend error object
    if (!Array.isArray(ordersData)) {
      if (ordersData && ordersData.error) throw new Error(ordersData.error);
      allOrders = [];
    } else {
      allOrders = ordersData;
    }

    allReturns = Array.isArray(returnsData) ? returnsData : [];
    inventoryCache = Array.isArray(invData) ? invData : [];
    
    groupOrders();
    renderOrders();
    toggleReturnsPanel();
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("orders-list").classList.remove("hidden");
  } catch (err) {
    console.error("loadOrders failed:", err);
    document.getElementById("loading").innerHTML = `<div style="text-align:center;padding:40px;"><i class="ri-wifi-off-line" style="font-size:48px;color:var(--text-muted);display:block;margin-bottom:12px;"></i><p style="color:var(--text-muted);font-size:14px;">Failed to load orders. Check your connection.</p><button class="btn btn-primary" onclick="loadOrders()" style="margin-top:12px;"><i class="ri-refresh-line"></i> Retry</button></div>`;
  }
}

window.resetOrderFilters = () => {
  document.getElementById("searchOrders").value = "";
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
  // Reset payment filter
  document.querySelector('#paymentFilters .pill-filter.active')?.classList.remove('active');
  document.querySelector('#paymentFilters .pill-filter[data-pay="All"]')?.classList.add('active');
  activePayFilter = "All";
  // Switch back to All tab
  document.querySelector('.tab-btn[data-status="All"]').click();
};
function groupOrders() {
  groupedOrders = {};
  allOrders.forEach((row) => {
    const id = row.order_id;
    if (!id) return;
    if (!groupedOrders[id]) {
      groupedOrders[id] = {
        order_id: id,
        date: row.date,
        time: row.time,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        customer_address: row.customer_address || "",
        delivery_status: row.delivery_status || "Pending",
        payment_status: row.payment_status || "Unpaid",
        notes: row.notes || "",
        discount: row.discount || "",
        total: 0,
        paid_amount: 0,
        due_amount: 0,
        rows: [],
      };
    }
    groupedOrders[id].rows.push(row);
    // Prefer total_amount (single-row) over summing total_price (legacy multi-row)
    const rowTotal = parseFloat(row.total_amount) || parseFloat(row.total_price) || 0;
    if (parseFloat(row.total_amount)) {
      groupedOrders[id].total = rowTotal;
    } else {
      groupedOrders[id].total += rowTotal;
    }
    if (row.delivery_status) groupedOrders[id].delivery_status = row.delivery_status;
    if (row.payment_status) groupedOrders[id].payment_status = row.payment_status;
    if (row.paid_amount !== undefined) groupedOrders[id].paid_amount = parseFloat(row.paid_amount) || 0;
    if (row.due_amount !== undefined) groupedOrders[id].due_amount = parseFloat(row.due_amount) || 0;
    if (row.discount) groupedOrders[id].discount = row.discount;
  });
}

// Open Order Detail Popup
window.toggleAccordion = function(orderId) {
  openOrderDetail(orderId);
};

// Find matching product image from inventory cache
function getProductImage(serial, name, color) {
  const match = inventoryCache.find(i => String(i.SERIAL) === String(serial) || (String(i.NAME) === String(name) && String(i.COLOR) === String(color)));
  if (match) {
    return getFirstImageUrl(match["IMAGE LINK"], match.IMAGES);
  }
  return "";
}

// Safely convert API field values to string — handles objects, arrays, nulls
function safeStr(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// Parse comma-separated item fields from a consolidated order row and build cards with images
function buildItemRows(order) {
  const firstRow = order.rows[0];
  const serials = safeStr(firstRow.serial).split(",").map(s => s.trim());
  const categories = safeStr(firstRow.category).split(",").map(s => s.trim());
  const colors = safeStr(firstRow.color).split(",").map(s => s.trim());
  const sizes = safeStr(firstRow.size).split(",").map(s => s.trim());
  const quantities = safeStr(firstRow.quantity).split(",").map(s => s.trim());
  const unitPrices = safeStr(firstRow.unit_price).split(",").map(s => s.trim());

  return serials.map((serial, idx) => {
    const category = categories[idx] || categories[0] || "Product";
    const color = colors[idx] || colors[0] || "-";
    const size = sizes[idx] || sizes[0] || "-";
    const qty = quantities[idx] || quantities[0] || "1";
    const uPrice = unitPrices[idx] || unitPrices[0] || "0";
    const imgUrl = getProductImage(serial, category, color);

    const match = inventoryCache.find(i => String(i.SERIAL) === String(serial) || (String(i.NAME) === String(category) && String(i.COLOR) === String(color)));
    const setSize = match ? (parseInt(match["CHURI IN A SET"]) || 12) : 12;
    const setPrice = parseFloat(uPrice) * setSize;
    const qtyDisplay = formatStockDisplay(parseInt(qty), setSize);

    return `
      <div class="order-item-card" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; gap:12px; align-items:center;">
          ${imgUrl ? `<img src="${imgUrl}" class="order-item-img" referrerpolicy="no-referrer">` : `<div class="order-item-img"></div>`}
          <div class="order-item-info">
            <div class="order-item-title">${category}</div>
            <div class="order-item-meta">${color} · Size ${size} · Serial: ${serial}</div>
            <div class="order-item-meta" style="font-weight:600;color:var(--text);margin-top:4px;">${qtyDisplay} (৳${formatCurrency(setPrice)}/set)</div>
          </div>
        </div>
        ${order.delivery_status !== "Returned" && order.delivery_status !== "Pending" ? 
          `<button class="btn-icon danger" onclick="openReturnModal('${order.order_id}', '${serial}', '${category.replace(/'/g,"\\'").replace(/"/g,'&quot;')}', '${color}', '${size}', '${uPrice}', '${qty}')" title="Return Item">
             <i class="ri-arrow-go-back-line"></i>
           </button>` : ''}
      </div>
    `;
  }).join("");
}

function renderOrderStats() {
  const fromVal = document.getElementById("dateFrom").value;
  const toVal = document.getElementById("dateTo").value;
  const container = document.getElementById("orderStatsRow");
  if (!container) return;

  const counts = { All: 0, Pending: 0, Packed: 0, Dispatched: 0, Delivered: 0, Returned: 0, Cancelled: 0 };

  Object.keys(groupedOrders).forEach(id => {
    const order = groupedOrders[id];
    const orderDate = parseOrderDate(order.date);
    if (orderDate) {
      if (fromVal) {
        const fp = fromVal.split("-");
        if (orderDate < new Date(fp[0], fp[1] - 1, fp[2])) return;
      }
      if (toVal) {
        const tp = toVal.split("-");
        const toDate = new Date(tp[0], tp[1] - 1, tp[2], 23, 59, 59);
        if (orderDate > toDate) return;
      }
    }
    counts.All++;
    const status = order.delivery_status || "Pending";
    if (counts[status] !== undefined) counts[status]++;
  });

  const cardConfig = [
    { key: "All", icon: "ri-file-list-3-line", color: "#3b82f6" },
    { key: "Pending", icon: "ri-time-line", color: "#f59e0b" },
    { key: "Packed", icon: "ri-inbox-archive-line", color: "#06b6d4" },
    { key: "Dispatched", icon: "ri-truck-line", color: "#8b5cf6" },
    { key: "Delivered", icon: "ri-check-double-line", color: "#10b981" },
    { key: "Returned", icon: "ri-arrow-go-back-line", color: "#ef4444" },
    { key: "Cancelled", icon: "ri-close-circle-line", color: "#64748b" },
  ];

  container.innerHTML = cardConfig.map(c => {
    const isActive = activeTab === c.key;
    return `
      <div onclick="switchTab('${c.key}')" style="
        cursor:pointer; padding:14px 12px; border-radius:10px; text-align:center;
        background:${isActive ? c.color + '18' : 'var(--panel-solid)'};
        border:1px solid ${isActive ? c.color + '60' : 'var(--border)'};
        transition: all 0.2s;
      ">
        <i class="${c.icon}" style="font-size:20px; color:${c.color}; display:block; margin-bottom:4px;"></i>
        <div style="font-size:22px; font-weight:700; color:var(--text);">${counts[c.key]}</div>
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px;">${c.key}</div>
      </div>
    `;
  }).join("");
}

function switchTab(status) {
  activeTab = status;
  document.querySelectorAll("#statusTabs .tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.status === status);
  });
  renderOrders();
  toggleReturnsPanel();
}

function renderOrders() {
  renderOrderStats();
  const search = document.getElementById("searchOrders").value.toLowerCase();
  const fromVal = document.getElementById("dateFrom").value;
  const toVal = document.getElementById("dateTo").value;
  const container = document.getElementById("orders-list");
  container.innerHTML = "";

  // Sort orders by date descending (newest first)
  const orderIds = Object.keys(groupedOrders).reverse();

  let rendered = 0;
  orderIds.forEach((id) => {
    const order = groupedOrders[id];

    // Tab filter (delivery status)
    if (activeTab !== "All" && order.delivery_status !== activeTab) return;

    // Payment status filter
    if (activePayFilter !== "All" && order.payment_status !== activePayFilter) return;

    // Search filter
    if (search) {
      const haystack = `${order.order_id} ${order.customer_name} ${order.customer_phone}`.toLowerCase();
      if (!haystack.includes(search)) return;
    }
    
    // Date filter
    const orderDate = parseOrderDate(order.date);
    if (orderDate) {
      if (fromVal) {
        const fp = fromVal.split("-");
        if (orderDate < new Date(fp[0], fp[1] - 1, fp[2])) return;
      }
      if (toVal) {
        const tp = toVal.split("-");
        const toDate = new Date(tp[0], tp[1] - 1, tp[2], 23, 59, 59);
        if (orderDate > toDate) return;
      }
    }

    // Format dates to look nice
    const cleanDate = new Date(order.date).toLocaleDateString('en-GB') !== 'Invalid Date' 
      ? new Date(order.date).toLocaleDateString('en-GB') 
      : order.date;
      
    let cleanTime = order.time;
    if (String(order.time).includes('T')) {
      const timeObj = new Date(order.time);
      if (!isNaN(timeObj.getTime())) {
        cleanTime = timeObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
    }

    const noteHtml = order.notes ? `<div style="font-size:12px;color:var(--danger);margin-top:8px;padding:6px 10px;background:rgba(239,68,68,0.08);border-radius:6px;border-left:3px solid var(--danger)"><i class="ri-sticky-note-line"></i> ${order.notes}</div>` : "";

    const itemCount = String(order.rows[0]?.serial || "").split(",").filter(s => s.trim()).length;

    const card = document.createElement("div");
    card.className = "order-accordion";
    card.style.cursor = "pointer";
    card.onclick = () => openOrderDetail(id);
    card.innerHTML = `
      <div class="order-accordion-header" style="cursor:pointer;">
        <div class="accordion-left">
          <div style="font-weight:600;color:var(--text)">${order.order_id}</div>
          <div style="font-size:12px;color:var(--text-muted)"><i class="ri-user-line"></i> ${order.customer_name} · ${order.customer_phone}${order.customer_address ? ' · ' + order.customer_address : ''}</div>
          <div style="font-size:12px;color:var(--text-muted)">${cleanDate} · ${cleanTime} · ${itemCount} item${itemCount > 1 ? 's' : ''}</div>
          ${noteHtml}
        </div>
        <div class="accordion-right">
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div style="display:flex;gap:4px">
              ${createBadge(order.delivery_status)}
              ${createBadge(order.payment_status)}
            </div>
            <div style="font-weight:700;color:var(--text)">${formatCurrency(order.total)}</div>
            ${order.payment_status === "Partial" ? `<div style="font-size:11px;color:var(--danger)">Due: ${formatCurrency(order.due_amount || 0)}</div>` : ""}
          </div>
          <i class="ri-arrow-right-s-line" style="font-size:20px;color:var(--text-muted)"></i>
        </div>
      </div>
    `;
    container.appendChild(card);
    rendered++;
  });

  if (rendered === 0) {
    container.innerHTML = '<div class="no-data">No orders found</div>';
  }
}

// ─── Returns History Panel ────────────────────────────
function toggleReturnsPanel() {
  const panel = document.getElementById("returns-history");
  if (activeTab === "Returned") {
    panel.classList.remove("hidden");
    renderReturns();
  } else {
    panel.classList.add("hidden");
  }
}

function renderReturns() {
  const container = document.getElementById("returns-list");
  const search = document.getElementById("searchOrders").value.toLowerCase();
  container.innerHTML = "";

  const filtered = allReturns.filter(r => {
    if (!search) return true;
    const haystack = `${r.return_id} ${r.order_id} ${r.name} ${r.color} ${r.serial}`.toLowerCase();
    return haystack.includes(search);
  });

  document.getElementById("returnsCount").textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="no-data">No returns found</div>';
    return;
  }

  // Newest first
  filtered.reverse().forEach(ret => {
    const isFull = ret.return_type === "Full Return";
    const spareBadge = !isFull ? createSpareBadge(ret.spare_status) : "";
    const card = document.createElement("div");
    card.className = "order-card glass";
    card.innerHTML = `
      <div class="order-card-header">
        <div>
          <div class="order-id">${ret.return_id}</div>
          <div class="order-date">${ret.return_date} · Order: ${ret.order_id}</div>
        </div>
        <div style="display:flex;gap:6px">
          ${isFull ? '<span class="badge badge-success">Full Return</span>' : '<span class="badge badge-warning">Damaged</span>'}
          ${spareBadge}
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">
        <strong>${ret.name}</strong> · ${ret.color} · Size ${ret.size} · Serial: ${ret.serial}
      </div>
      <div style="display:flex;gap:16px;font-size:13px;flex-wrap:wrap">
        <span>Set: <strong>${ret.set_size}</strong></span>
        <span>Broken: <strong style="color:${ret.broken_count > 0 ? 'var(--danger)' : 'var(--accent)'}">${ret.broken_count}</strong></span>
        <span>Good: <strong style="color:var(--accent)">${ret.good_count}</strong></span>
        <span>Action: <strong>${ret.action_taken}</strong></span>
      </div>
      ${ret.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic"><i class="ri-chat-3-line"></i> ${ret.notes}</div>` : ""}
    `;
    container.appendChild(card);
  });
}

function createSpareBadge(status) {
  if (status === "Available") return '<span class="badge badge-info">Spares Available</span>';
  if (status === "Used in Rebuild") return '<span class="badge badge-success">Rebuilt</span>';
  return "";
}

// ─── Quick Status Update ────────────────────────────────
async function quickUpdate(orderId, newStatus) {
  try {
    const result = await Api.updateOrder({ order_id: orderId, delivery_status: newStatus });
    if (!result.success) throw new Error(result.error);
    showToast(`Order marked as ${newStatus}`, "success");
    if (groupedOrders[orderId]) {
      groupedOrders[orderId].delivery_status = newStatus;
      groupedOrders[orderId].items.forEach((i) => (i.delivery_status = newStatus));
    }
    renderOrders();
  } catch (err) {
    showToast(err.message || "Update failed", "error");
  }
}

// ─── Payment Modal ──────────────────────────────────────
function openPaymentModal(orderId) {
  const order = groupedOrders[orderId];
  if (!order) return;
  document.getElementById("payModalOrderId").value = orderId;
  document.getElementById("payModalTotal").textContent = formatCurrency(order.total);
  document.getElementById("payModalPrevPaid").textContent = formatCurrency(order.paid_amount || 0);
  document.getElementById("payModalDue").textContent = formatCurrency(order.due_amount || (order.total - (order.paid_amount || 0)));
  document.getElementById("payModalAmount").value = "";
  document.getElementById("payModalFull").checked = true;
  togglePayModalAmount();
  document.getElementById("paymentModal").classList.add("open");
}

function closePaymentModal() {
  document.getElementById("paymentModal").classList.remove("open");
}

function togglePayModalAmount() {
  const isFull = document.getElementById("payModalFull").checked;
  document.getElementById("payModalAmountRow").style.display = isFull ? "none" : "block";
}

async function confirmPayment() {
  const orderId = document.getElementById("payModalOrderId").value;
  const order = groupedOrders[orderId];
  if (!order) return;

  const isFull = document.getElementById("payModalFull").checked;
  let newPaidAmount;
  let newPayStatus;
  let newDueAmount;

  if (isFull) {
    newPaidAmount = order.total;
    newPayStatus = "Paid";
    newDueAmount = 0;
  } else {
    const additionalPay = parseFloat(document.getElementById("payModalAmount").value) || 0;
    if (additionalPay <= 0) return showToast("Enter a valid amount", "error");
    newPaidAmount = (order.paid_amount || 0) + additionalPay;
    newDueAmount = Math.max(0, order.total - newPaidAmount);
    newPayStatus = newDueAmount <= 0 ? "Paid" : "Partial";
  }

  document.getElementById("confirmPayBtn").disabled = true;
  try {
    const result = await Api.updateOrder({
      order_id: orderId,
      payment_status: newPayStatus,
      paid_amount: newPaidAmount,
      due_amount: newDueAmount,
    });
    if (!result.success) throw new Error(result.error);
    showToast(`Payment updated to ${newPayStatus}`, "success");
    if (groupedOrders[orderId]) {
      groupedOrders[orderId].payment_status = newPayStatus;
      groupedOrders[orderId].paid_amount = newPaidAmount;
      groupedOrders[orderId].due_amount = newDueAmount;
      groupedOrders[orderId].rows.forEach((i) => {
        i.payment_status = newPayStatus;
        i.paid_amount = newPaidAmount;
        i.due_amount = newDueAmount;
      });
    }
    closePaymentModal();
    renderOrders();
  } catch (err) {
    showToast(err.message || "Payment update failed", "error");
  } finally {
    document.getElementById("confirmPayBtn").disabled = false;
  }
}

// ─── Update Modal ───────────────────────────────────────
function openUpdateModal(orderId) {
  const order = groupedOrders[orderId];
  if (!order) return;
  document.getElementById("updateOrderId").value = orderId;
  document.getElementById("updateDelivery").value = order.delivery_status;
  document.getElementById("updatePayStatus").value = order.payment_status;
  document.getElementById("updateNotes").value = order.notes;
  document.getElementById("updateModal").classList.add("open");
}

function closeUpdateModal() {
  document.getElementById("updateModal").classList.remove("open");
}

async function saveUpdate() {
  const orderId = document.getElementById("updateOrderId").value;
  const payload = {
    order_id: orderId,
    delivery_status: document.getElementById("updateDelivery").value,
    payment_status: document.getElementById("updatePayStatus").value,
    payment_method: document.getElementById("updatePayMethod").value,
    notes: document.getElementById("updateNotes").value,
  };

  document.getElementById("saveUpdateBtn").disabled = true;
  try {
    const result = await Api.updateOrder(payload);
    if (!result.success) throw new Error(result.error);
    showToast("Order updated", "success");
    // Update local state
    if (groupedOrders[orderId]) {
      Object.assign(groupedOrders[orderId], payload);
      groupedOrders[orderId].rows.forEach((i) => Object.assign(i, payload));
    }
    closeUpdateModal();
    renderOrders();
  } catch (err) {
    showToast(err.message || "Update failed", "error");
  } finally {
    document.getElementById("saveUpdateBtn").disabled = false;
  }
}

// ─── Return Management ──────────────────────────────────
let pendingRebuild = null;
let returnMaxQty = 0;

function openReturnModal(orderId, serial, name, color, size, unitPrice, qty) {
  const order = groupedOrders[orderId];
  if (!order) return;

  document.getElementById("returnOrderId").value = orderId;
  document.getElementById("returnSerial").value = serial;
  document.getElementById("returnName").value = name;
  document.getElementById("returnColor").value = color;
  document.getElementById("returnSize").value = size;

  let unitPriceInput = document.getElementById("returnUnitPrice");
  if (!unitPriceInput) {
    unitPriceInput = document.createElement("input");
    unitPriceInput.type = "hidden";
    unitPriceInput.id = "returnUnitPrice";
    document.querySelector("#returnModal .modal-body").appendChild(unitPriceInput);
  }
  unitPriceInput.value = unitPrice;

  const invItem = inventoryCache.find(i => String(i.SERIAL) === String(serial));
  const setSize = invItem ? (parseInt(invItem["CHURI IN A SET"]) || 12) : 12;
  const setPrice = parseFloat(unitPrice) * setSize;

  // Validate qty — fallback to inventory set size if order data is corrupted
  let parsedQty = parseInt(qty) || 0;
  if (parsedQty <= 0 || parsedQty > 500) {
    parsedQty = setSize;
  }
  returnMaxQty = parsedQty;
  document.getElementById("returnTotalCount").value = returnMaxQty;
  document.getElementById("returnBrokenCount").value = "0";
  document.getElementById("returnNotes").value = "";
  document.getElementById("returnPreview").style.display = "none";

  document.getElementById("returnItemInfo").innerHTML = `
    <strong>${orderId}</strong> — ${name} · ${color} · Size ${size}<br>
    <span style="color:var(--text-muted)">Customer: ${order.customer_name} · ${order.customer_phone}${order.customer_address ? ' · ' + order.customer_address : ''}</span><br>
    <span style="color:var(--accent);font-weight:600">Set Price: ৳${formatCurrency(setPrice)}</span>
  `;

  updateReturnPreview();
  document.getElementById("returnModal").classList.add("open");
}

function adjustReturnQty(delta) {
  const input = document.getElementById("returnTotalCount");
  const newVal = Math.max(1, Math.min(returnMaxQty, (parseInt(input.value) || 0) + delta));
  input.value = newVal;
  // Ensure damaged doesn't exceed total
  const brokenInput = document.getElementById("returnBrokenCount");
  if (parseInt(brokenInput.value) > newVal) brokenInput.value = newVal;
  updateReturnPreview();
}

function adjustDamagedQty(delta) {
  const totalCount = parseInt(document.getElementById("returnTotalCount").value) || 0;
  const input = document.getElementById("returnBrokenCount");
  const newVal = Math.max(0, Math.min(totalCount, (parseInt(input.value) || 0) + delta));
  input.value = newVal;
  updateReturnPreview();
}

function updateReturnPreview() {
  const totalReturning = parseInt(document.getElementById("returnTotalCount").value) || 0;
  const broken = parseInt(document.getElementById("returnBrokenCount").value) || 0;
  const good = Math.max(0, totalReturning - broken);
  const unitPrice = parseFloat(document.getElementById("returnUnitPrice")?.value) || 0;
  const preview = document.getElementById("returnPreview");

  document.getElementById("returnGoodDisplay").textContent = good;
  document.getElementById("returnDamagedDisplay").textContent = broken;

  if (totalReturning > 0) {
    preview.style.display = "block";
    preview.style.background = "rgba(59, 130, 246, 0.1)";
    preview.style.color = "#3b82f6";
    preview.innerHTML = `<strong>Refund: ৳${formatCurrency(totalReturning * unitPrice)}</strong> — ${good} good + ${broken} damaged`;
    document.getElementById("confirmReturnBtn").disabled = false;
  } else {
    preview.style.display = "none";
    document.getElementById("confirmReturnBtn").disabled = true;
  }

  // Wire live input events
  document.getElementById("returnTotalCount").oninput = () => { adjustReturnQty(0); };
  document.getElementById("returnBrokenCount").oninput = () => { adjustDamagedQty(0); };
}


function closeReturnModal() {
  document.getElementById("returnModal").classList.remove("open");
}

async function confirmReturn() {
  const btn = document.getElementById("confirmReturnBtn");
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0 auto"></div>';

  const totalReturning = parseInt(document.getElementById("returnTotalCount").value) || 0;
  const brokenCount = parseInt(document.getElementById("returnBrokenCount").value) || 0;
  const goodCount = Math.max(0, totalReturning - brokenCount);

  const payload = {
    order_id: document.getElementById("returnOrderId").value,
    serial: document.getElementById("returnSerial").value,
    name: document.getElementById("returnName").value,
    color: document.getElementById("returnColor").value,
    size: document.getElementById("returnSize").value,
    unit_price: parseFloat(document.getElementById("returnUnitPrice").value) || 0,
    good_count: goodCount,
    broken_count: brokenCount,
    notes: document.getElementById("returnNotes").value,
  };

  try {
    const result = await Api.processReturn(payload);
    if (!result.success) throw new Error(result.error || "Return failed");

    if (brokenCount === 0) {
      showToast("Return processed — All pieces restocked", "success");
    } else {
      showToast(`Return processed — ${goodCount} restocked, ${brokenCount} damaged`, "warning");
    }

    closeReturnModal();
    await loadOrders();

    try {
        inventory = await Api.getInventory();
    } catch(e) {}

  } catch (err) {
    showToast(err.message || "Return failed", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Process Return";
  }
}

// ─── Automated Invoice Printing ───────────────────────
function printOrder(id) {
  const order = groupedOrders[id];
  if (!order) return;

  const printWindow = window.open('', '_blank');
  
  let itemsHtml = '';
  order.rows.forEach(row => {
    const qty = parseInt(row.quantity) || 1;
    const price = parseFloat(row.unit_price) || 0;
    const match = inventoryCache.find(i => String(i.SERIAL) === String(row.serial));
    const setSize = match ? (parseInt(match["CHURI IN A SET"]) || 12) : 12;
    
    const sets = Math.floor(qty / setSize);
    const pieces = qty % setSize;
    let qtyDisplay = '';
    if (sets > 0) qtyDisplay += `${sets} Set${sets > 1 ? 's' : ''}`;
    if (pieces > 0) qtyDisplay += (sets > 0 ? ' + ' : '') + `${pieces} Pcs`;
    if (!qtyDisplay) qtyDisplay = `${qty} Pcs`;

    itemsHtml += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${row.category} - ${row.color} (Size ${row.size})</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${qtyDisplay}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">৳${formatCurrency(price * qty)}</td>
      </tr>
    `;
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${order.order_id}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #000; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; letter-spacing: 2px; }
        .details { margin-bottom: 20px; font-size: 14px; }
        .details strong { width: 100px; display: inline-block; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
        th { background: #f5f5f5; padding: 10px 8px; text-align: left; border-bottom: 2px solid #000; }
        .totals { float: right; width: 300px; font-size: 14px; }
        .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
        .totals-row.grand { font-size: 18px; font-weight: bold; border-top: 2px solid #000; padding-top: 8px; }
      </style>
    </head>
    <body onload="window.print(); window.close();">
      <div class="header">
        <h1>MIHIRA</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #555;">Point of Sale Receipt</p>
      </div>
      
      <div class="details">
        <p><strong>Order ID:</strong> ${order.order_id}</p>
        <p><strong>Date:</strong> ${order.date} ${order.time}</p>
        <p><strong>Customer:</strong> ${order.customer_name}</p>
        <p><strong>Phone:</strong> ${order.customer_phone}</p>
        ${order.customer_address ? `<p><strong>Address:</strong> ${order.customer_address}</p>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="totals">
        ${order.discount ? `<div class="totals-row"><span>Discount:</span><span>${order.discount}</span></div>` : ''}
        <div class="totals-row grand"><span>Total:</span><span>৳${order.total}</span></div>
        <div class="totals-row"><span>Paid:</span><span>৳${order.paid_amount || 0}</span></div>
        <div class="totals-row"><span>Due:</span><span>৳${order.due_amount || 0}</span></div>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

// ─── Order Detail Popup ─────────────────────────────────
function openOrderDetail(orderId) {
  const order = groupedOrders[orderId];
  if (!order) return;

  const cleanDate = new Date(order.date).toLocaleDateString('en-GB') !== 'Invalid Date'
    ? new Date(order.date).toLocaleDateString('en-GB') : order.date;
  let cleanTime = order.time;
  if (String(order.time).includes('T')) {
    const timeObj = new Date(order.time);
    if (!isNaN(timeObj.getTime())) {
      cleanTime = timeObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
  }

  document.getElementById("detailOrderId").textContent = order.order_id;
  document.getElementById("detailOrderMeta").textContent = `${cleanDate} · ${cleanTime}`;
  document.getElementById("detailCustomerInfo").innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;padding:14px;background:rgba(201,168,130,0.06);border:1px solid rgba(201,168,130,0.12);border-radius:10px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:40px;height:40px;border-radius:50%;background:rgba(201,168,130,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="ri-user-3-line" style="font-size:20px;color:var(--primary);"></i>
        </div>
        <div>
          <div style="font-size:17px;font-weight:700;color:var(--text);letter-spacing:0.3px;">${order.customer_name}</div>
          <a href="tel:${order.customer_phone}" style="font-size:14px;color:var(--primary);text-decoration:none;font-weight:500;">
            <i class="ri-phone-line" style="font-size:13px;"></i> ${order.customer_phone}
          </a>
        </div>
      </div>
      ${order.customer_address ? `
        <div style="display:flex;align-items:flex-start;gap:8px;padding-top:8px;border-top:1px dashed rgba(201,168,130,0.15);">
          <i class="ri-map-pin-2-line" style="font-size:16px;color:var(--warning);margin-top:1px;flex-shrink:0;"></i>
          <span style="font-size:13px;color:var(--text-muted);line-height:1.5;">${order.customer_address}</span>
        </div>
      ` : ''}
    </div>
  `;
  document.getElementById("detailBadges").innerHTML = createBadge(order.delivery_status) + createBadge(order.payment_status);

  // Build item cards
  document.getElementById("detailItemsList").innerHTML = buildDetailItemCards(order);

  // Notes
  const notesSection = document.getElementById("detailNotesSection");
  if (order.notes) {
    notesSection.style.display = "block";
    document.getElementById("detailNotes").innerHTML = `<i class="ri-sticky-note-line"></i> ${order.notes}`;
  } else {
    notesSection.style.display = "none";
  }

  // Financials
  const paidAmt = order.paid_amount || 0;
  const dueAmt = order.due_amount || (order.total - paidAmt);
  document.getElementById("detailFinancials").innerHTML = `
    ${order.discount ? `<div style="display:flex;justify-content:space-between;"><span>Discount</span><span style="color:var(--accent)">${order.discount}</span></div>` : ""}
    ${order.payment_status === "Partial" ? `
      <div style="display:flex;justify-content:space-between;"><span>Paid</span><span style="color:var(--accent)">${formatCurrency(paidAmt)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Due</span><span style="color:var(--danger)">${formatCurrency(dueAmt)}</span></div>
    ` : ""}
    <div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);font-size:18px;font-weight:700;">
      <span>Total</span><span>${formatCurrency(order.total)}</span>
    </div>
  `;

  // Actions
  const id = order.order_id;
  let actionsHtml = `<button class="btn btn-outline" style="flex:1;border:1px solid var(--border);background:transparent;color:var(--text)" onclick="closeOrderDetail();printOrder('${id}')"><i class="ri-printer-line"></i> Print</button>`;
  if (order.delivery_status === "Pending") {
    actionsHtml += `<button class="btn btn-info" style="flex:1" onclick="closeOrderDetail();quickUpdate('${id}','Packed')"><i class="ri-inbox-archive-line"></i> Pack</button>`;
  }
  if (order.delivery_status === "Packed") {
    actionsHtml += `<button class="btn btn-warning" style="flex:1" onclick="closeOrderDetail();quickUpdate('${id}','Dispatched')"><i class="ri-truck-line"></i> Dispatch</button>`;
  }
  if (order.delivery_status === "Dispatched") {
    actionsHtml += `<button class="btn btn-info" style="flex:1" onclick="closeOrderDetail();quickUpdate('${id}','Delivered')"><i class="ri-check-line"></i> Delivered</button>`;
  }
  if (order.payment_status !== "Paid") {
    actionsHtml += `<button class="btn btn-success" style="flex:1" onclick="closeOrderDetail();openPaymentModal('${id}')"><i class="ri-money-dollar-circle-line"></i> Pay</button>`;
  }
  // Edit Products — only for Pending or Packed orders
  if (order.delivery_status === "Pending" || order.delivery_status === "Packed") {
    actionsHtml += `<button class="btn btn-outline" style="flex:1;border:1px solid var(--info);background:transparent;color:var(--info)" onclick="closeOrderDetail();openEditOrderModal('${id}')"><i class="ri-edit-line"></i> Edit</button>`;
  }
  actionsHtml += `<button class="btn btn-outline" style="flex:1;border:1px solid var(--border);background:transparent;color:var(--text)" onclick="closeOrderDetail();openUpdateModal('${id}')"><i class="ri-settings-4-line"></i> Update</button>`;
  // Cancel Order — only for non-delivered, non-cancelled orders
  if (order.delivery_status !== "Delivered" && order.delivery_status !== "Cancelled" && order.delivery_status !== "Returned") {
    actionsHtml += `<button class="btn btn-danger" style="flex:1" onclick="closeOrderDetail();cancelOrder('${id}')"><i class="ri-close-circle-line"></i> Cancel</button>`;
  }
  document.getElementById("detailActions").innerHTML = actionsHtml;

  document.getElementById("orderDetailModal").classList.add("open");
}

function closeOrderDetail() {
  document.getElementById("orderDetailModal").classList.remove("open");
}

function buildDetailItemCards(order) {
  const firstRow = order.rows[0];
  const serials = safeStr(firstRow.serial).split(",").map(s => s.trim());
  const categories = safeStr(firstRow.category).split(",").map(s => s.trim());
  const colors = safeStr(firstRow.color).split(",").map(s => s.trim());
  const sizes = safeStr(firstRow.size).split(",").map(s => s.trim());
  const quantities = safeStr(firstRow.quantity).split(",").map(s => s.trim());
  const unitPrices = safeStr(firstRow.unit_price).split(",").map(s => s.trim());

  return serials.map((serial, idx) => {
    const category = categories[idx] || categories[0] || "Product";
    const color = colors[idx] || colors[0] || "-";
    const size = sizes[idx] || sizes[0] || "-";
    const qty = quantities[idx] || quantities[0] || "1";
    const uPrice = unitPrices[idx] || unitPrices[0] || "0";
    const imgUrl = getProductImage(serial, category, color);
    const lineTotal = parseFloat(uPrice) * parseInt(qty);

    const canReturn = order.delivery_status !== "Returned" && order.delivery_status !== "Pending";
    return `
      <div class="order-item-card" style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0;">
          ${imgUrl ? `<img src="${imgUrl}" class="order-item-img" referrerpolicy="no-referrer">` : `<div class="order-item-img"></div>`}
          <div class="order-item-info" style="min-width:0;">
            <div class="order-item-title">${category}</div>
            <div class="order-item-meta">${color} · Size ${size} · #${serial}</div>
            <div style="display:flex;gap:12px;margin-top:4px;font-size:12px;">
              <span style="font-weight:600;color:var(--text);">× ${qty} pcs</span>
              <span style="font-weight:600;color:var(--accent);">${formatCurrency(lineTotal)}</span>
            </div>
          </div>
        </div>
        ${canReturn ? `
          <button class="btn-icon danger" onclick="closeOrderDetail();openReturnModal('${order.order_id}','${serial}','${category.replace(/'/g,"\\\\'").replace(/"/g,'&quot;')}','${color}','${size}','${uPrice}','${qty}')" title="Return Item" style="flex-shrink:0;">
            <i class="ri-arrow-go-back-line"></i>
          </button>` : ""}
      </div>`;
  }).join("");
}

// Wire modal overlay close
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("orderDetailModal")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) closeOrderDetail();
  });
  document.getElementById("editOrderModal")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) closeEditOrderModal();
  });
});

// ─── Cancel Order ───────────────────────────────────────
async function cancelOrder(orderId) {
  if (!confirm(`Are you sure you want to cancel order ${orderId}?\n\nThe customer data will be kept, but this order will not count toward revenue.`)) return;

  try {
    const result = await Api.updateOrder({
      order_id: orderId,
      delivery_status: "Cancelled",
    });
    if (!result.success) throw new Error(result.error);
    showToast("Order cancelled", "warning");
    if (groupedOrders[orderId]) {
      groupedOrders[orderId].delivery_status = "Cancelled";
      groupedOrders[orderId].rows.forEach(r => r.delivery_status = "Cancelled");
    }
    renderOrders();
  } catch (err) {
    showToast(err.message || "Cancel failed", "error");
  }
}

// ─── Edit Order Products ────────────────────────────────
function openEditOrderModal(orderId) {
  const order = groupedOrders[orderId];
  if (!order) return;

  const firstRow = order.rows[0];
  const serials = safeStr(firstRow.serial).split(",").map(s => s.trim());
  const categories = safeStr(firstRow.category).split(",").map(s => s.trim());
  const colors = safeStr(firstRow.color).split(",").map(s => s.trim());
  const sizes = safeStr(firstRow.size).split(",").map(s => s.trim());
  const quantities = safeStr(firstRow.quantity).split(",").map(s => s.trim());
  const unitPrices = safeStr(firstRow.unit_price).split(",").map(s => s.trim());

  document.getElementById("editOrderId").value = orderId;
  const container = document.getElementById("editItemsContainer");

  container.innerHTML = serials.map((serial, idx) => {
    const cat = categories[idx] || categories[0] || "";
    const col = colors[idx] || colors[0] || "";
    const sz = sizes[idx] || sizes[0] || "";
    const qty = quantities[idx] || quantities[0] || "1";
    const price = unitPrices[idx] || unitPrices[0] || "0";

    return `
      <div class="edit-item-row" style="background:var(--input-bg);padding:12px;border-radius:8px;border:1px solid var(--border);display:flex;flex-direction:column;gap:8px;" data-idx="${idx}">
        <div style="font-size:13px;font-weight:600;color:var(--text);">${cat} · ${col} · Size ${sz}</div>
        <div style="font-size:11px;color:var(--text-muted);">Serial: ${serial}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">Quantity</label>
            <input type="number" class="edit-qty" value="${qty}" min="1" data-serial="${serial}" style="padding:8px;">
          </div>
          <div class="form-group" style="margin:0;">
            <label style="font-size:11px;">Unit Price (৳)</label>
            <input type="number" class="edit-price" value="${price}" min="0" data-serial="${serial}" style="padding:8px;">
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("editOrderModal").classList.add("open");
}

function closeEditOrderModal() {
  document.getElementById("editOrderModal").classList.remove("open");
}

async function saveEditOrder() {
  const orderId = document.getElementById("editOrderId").value;
  const order = groupedOrders[orderId];
  if (!order) return;

  const qtyInputs = document.querySelectorAll("#editItemsContainer .edit-qty");
  const priceInputs = document.querySelectorAll("#editItemsContainer .edit-price");

  const newQuantities = Array.from(qtyInputs).map(i => i.value);
  const newPrices = Array.from(priceInputs).map(i => i.value);

  // Calculate new total
  let newTotal = 0;
  newQuantities.forEach((q, i) => {
    newTotal += (parseInt(q) || 0) * (parseFloat(newPrices[i]) || 0);
  });

  // Apply discount if any
  const discount = order.discount || "";
  if (discount.includes("%")) {
    const pct = parseFloat(discount) || 0;
    newTotal = newTotal * (1 - pct / 100);
  } else if (discount && parseFloat(discount)) {
    newTotal -= parseFloat(discount);
  }
  newTotal = Math.max(0, Math.round(newTotal));

  const btn = document.getElementById("saveEditOrderBtn");
  btn.disabled = true;

  try {
    const result = await Api.updateOrder({
      order_id: orderId,
      quantity: newQuantities.join(","),
      unit_price: newPrices.join(","),
      total_amount: newTotal,
      due_amount: Math.max(0, newTotal - (order.paid_amount || 0)),
    });
    if (!result.success) throw new Error(result.error);
    showToast("Order products updated", "success");

    // Update local state
    const firstRow = order.rows[0];
    firstRow.quantity = newQuantities.join(",");
    firstRow.unit_price = newPrices.join(",");
    order.total = newTotal;
    order.due_amount = Math.max(0, newTotal - (order.paid_amount || 0));
    order.rows.forEach(r => {
      r.total_amount = newTotal;
      r.due_amount = order.due_amount;
    });

    closeEditOrderModal();
    renderOrders();
  } catch (err) {
    showToast(err.message || "Edit failed", "error");
  } finally {
    btn.disabled = false;
  }
}
