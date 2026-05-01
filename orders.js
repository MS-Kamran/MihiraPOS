/**
 * Orders Page — Grouped order cards with lifecycle actions
 */
let allOrders = [];
let groupedOrders = {};
let activeTab = "All";
let allReturns = [];
let inventoryCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
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

async function loadOrders() {
  try {
    // Load inventory cache for product images
    inventoryCache = Api.getCachedInventory() || [];
    
    const [ordersData, returnsData] = await Promise.all([Api.getOrders(), Api.getReturns()]);
    allOrders = ordersData;
    allReturns = returnsData;
    groupOrders();
    renderOrders();
    toggleReturnsPanel();
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("orders-list").classList.remove("hidden");
  } catch (err) {
    showToast("Failed to load orders", "error");
  }
}

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

// Toggle accordion open/close
window.toggleAccordion = function(orderId) {
  const el = document.getElementById(`acc-${orderId}`);
  if (el) el.classList.toggle("open");
};

// Find matching product image from inventory cache
function getProductImage(serial, name, color) {
  const match = inventoryCache.find(i => String(i.SERIAL) === String(serial) || (String(i.NAME) === String(name) && String(i.COLOR) === String(color)));
  if (match) {
    return getFirstImageUrl(match["IMAGE LINK"], match.IMAGES);
  }
  return "";
}

// Parse comma-separated item fields from a consolidated order row and build cards with images
function buildItemRows(order) {
  const firstRow = order.rows[0];
  const serials = String(firstRow.serial || "").split(",").map(s => s.trim());
  const categories = String(firstRow.category || "").split(",").map(s => s.trim());
  const colors = String(firstRow.color || "").split(",").map(s => s.trim());
  const sizes = String(firstRow.size || "").split(",").map(s => s.trim());
  const quantities = String(firstRow.quantity || "").split(",").map(s => s.trim());

  return serials.map((serial, idx) => {
    const category = categories[idx] || categories[0] || "Product";
    const color = colors[idx] || colors[0] || "-";
    const size = sizes[idx] || sizes[0] || "-";
    const qty = quantities[idx] || quantities[0] || "1";
    const imgUrl = getProductImage(serial, category, color);

    return `
      <div class="order-item-card">
        ${imgUrl ? `<img src="${imgUrl}" class="order-item-img" referrerpolicy="no-referrer">` : `<div class="order-item-img"></div>`}
        <div class="order-item-info">
          <div class="order-item-title">${category}</div>
          <div class="order-item-meta">${color} · Size ${size} · Serial: ${serial}</div>
        </div>
        <div style="font-weight:600;font-size:14px">× ${qty}</div>
      </div>
    `;
  }).join("");
}

function renderOrders() {
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

    // Tab filter
    if (activeTab !== "All" && order.delivery_status !== activeTab) return;

    // Search filter
    if (search) {
      const haystack = `${order.order_id} ${order.customer_name} ${order.customer_phone}`.toLowerCase();
      if (!haystack.includes(search)) return;
    }
    
    // Date filter
    const orderDate = new Date(order.date);
    if (!isNaN(orderDate.getTime())) {
      if (fromVal && orderDate < new Date(fromVal)) return;
      if (toVal) {
        const toDate = new Date(toVal);
        toDate.setHours(23, 59, 59);
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
    
    const card = document.createElement("div");
    card.className = "order-accordion";
    card.id = `acc-${id}`;
    card.innerHTML = `
      <div class="order-accordion-header" onclick="toggleAccordion('${id}')">
        <div class="accordion-left">
          <div style="font-weight:600;color:var(--text)">${order.order_id}</div>
          <div style="font-size:12px;color:var(--text-muted)"><i class="ri-user-line"></i> ${order.customer_name} · ${order.customer_phone}</div>
          <div style="font-size:12px;color:var(--text-muted)">${cleanDate} · ${cleanTime}</div>
        </div>
        <div class="accordion-right">
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div style="display:flex;gap:4px">
              ${createBadge(order.delivery_status)}
              ${createBadge(order.payment_status)}
            </div>
            <div style="font-weight:700;color:var(--text)">${formatCurrency(order.total)}</div>
          </div>
          <i class="ri-arrow-down-s-line accordion-toggle-icon"></i>
        </div>
      </div>
      <div class="order-accordion-body">
        ${noteHtml}
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;margin-bottom:12px;border-bottom:1px dashed var(--border)">
          <div style="font-size:13px;color:var(--text-muted)">
            <strong>Actions</strong>
          </div>
          <div class="order-actions">
            ${order.delivery_status === "Pending" ? `<button class="btn btn-warning" onclick="quickUpdate('${id}','Dispatched')"><i class="ri-truck-line"></i> Dispatch</button>` : ""}
            ${order.delivery_status === "Dispatched" ? `<button class="btn btn-info" onclick="quickUpdate('${id}','Delivered')"><i class="ri-check-line"></i> Delivered</button>` : ""}
            ${order.delivery_status === "Delivered" ? `<button class="btn btn-danger" onclick="openReturnModal('${id}')"><i class="ri-arrow-go-back-line"></i> Return</button>` : ""}
            ${order.payment_status !== "Paid" ? `<button class="btn btn-success" onclick="openPaymentModal('${id}')"><i class="ri-money-dollar-circle-line"></i> Mark Paid</button>` : ""}
            <button class="btn btn-outline" style="border: 1px solid var(--border); background: transparent; color: var(--text)" onclick="openUpdateModal('${id}')"><i class="ri-settings-4-line"></i> Manual Update</button>
          </div>
        </div>
        <div style="margin-top:12px;margin-bottom:12px;max-height:240px;overflow-y:auto;padding-right:8px;" class="custom-scrollbar">
          ${buildItemRows(order)}
        </div>
        <div style="display:flex;justify-content:flex-end;align-items:center;padding-top:12px;border-top:1px dashed var(--border)">
          <div style="font-size:13px;color:var(--text-muted)">
            ${order.discount ? `Disc: <span style="color:var(--accent)">${order.discount}</span>` : ""}
            ${order.payment_status === "Partial" ? ` | Paid: ${formatCurrency(order.paid_amount || 0)} | Due: ${formatCurrency(order.due_amount || 0)}` : ""}
          </div>
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

function openReturnModal(orderId) {
  const order = groupedOrders[orderId];
  if (!order) return;
  const firstRow = order.rows[0];
  const serial = String(firstRow.serial || "");
  const name = String(firstRow.category || firstRow.name || firstRow.serial || "");
  const color = String(firstRow.color || "");
  const size = String(firstRow.size || "");

  document.getElementById("returnOrderId").value = orderId;
  document.getElementById("returnSerial").value = serial;
  document.getElementById("returnName").value = name;
  document.getElementById("returnColor").value = color;
  document.getElementById("returnSize").value = size;
  document.getElementById("returnBrokenCount").value = "0";
  document.getElementById("returnNotes").value = "";
  document.getElementById("returnPreview").style.display = "none";

  document.getElementById("returnItemInfo").innerHTML = `
    <strong>${orderId}</strong> — ${name} · ${color} · Size ${size}<br>
    <span style="color:var(--text-muted)">Customer: ${order.customer_name} · ${order.customer_phone}</span>
  `;

  // Live preview
  const brokenInput = document.getElementById("returnBrokenCount");
  const setSizeInput = document.getElementById("returnSetSize");
  const updatePreview = () => {
    const setSize = parseInt(setSizeInput.value) || 12;
    const broken = parseInt(brokenInput.value) || 0;
    const preview = document.getElementById("returnPreview");
    if (broken === 0) {
      preview.style.display = "block";
      preview.style.background = "rgba(16,185,129,0.1)";
      preview.style.color = "#34d399";
      preview.innerHTML = "<strong>Full Return</strong> — Product will be restocked automatically";
    } else if (broken > 0 && broken <= setSize) {
      preview.style.display = "block";
      preview.style.background = "rgba(245,158,11,0.1)";
      preview.style.color = "#fbbf24";
      preview.innerHTML = `<strong>Damaged Return</strong> — ${setSize - broken} good pieces will be saved as spares`;
    } else {
      preview.style.display = "none";
    }
  };
  brokenInput.oninput = updatePreview;
  setSizeInput.oninput = updatePreview;
  updatePreview();

  document.getElementById("returnModal").classList.add("open");
}

function closeReturnModal() {
  document.getElementById("returnModal").classList.remove("open");
}

async function confirmReturn() {
  const btn = document.getElementById("confirmReturnBtn");
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0 auto"></div>';

  const payload = {
    order_id: document.getElementById("returnOrderId").value,
    serial: document.getElementById("returnSerial").value,
    name: document.getElementById("returnName").value,
    color: document.getElementById("returnColor").value,
    size: document.getElementById("returnSize").value,
    set_size: parseInt(document.getElementById("returnSetSize").value) || 12,
    broken_count: parseInt(document.getElementById("returnBrokenCount").value) || 0,
    notes: document.getElementById("returnNotes").value,
  };

  try {
    const result = await Api.processReturn(payload);
    if (!result.success) throw new Error(result.error || "Return failed");

    if (result.type === "full") {
      showToast("Full return processed — product restocked!", "success");
    } else {
      showToast(`Damaged return processed — ${result.spare_pieces} pieces saved as spares`, "info");
      if (result.can_rebuild) {
        showRebuildBanner(payload.name, payload.color, payload.size, payload.set_size, result.available_pieces);
      }
    }

    closeReturnModal();
    await loadOrders();
  } catch (err) {
    showToast(err.message || "Return failed", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Process Return";
  }
}

function showRebuildBanner(name, color, size, setSize, availablePieces) {
  pendingRebuild = { name, color, size, set_size: setSize };
  document.getElementById("rebuildInfo").textContent =
    `${availablePieces} spare pieces of ${name} ${color} Size ${size} available — enough to rebuild a full set of ${setSize}!`;
  document.getElementById("rebuildBanner").style.display = "block";
}

function dismissRebuild() {
  document.getElementById("rebuildBanner").style.display = "none";
  pendingRebuild = null;
}

async function executeRebuild() {
  if (!pendingRebuild) return;
  try {
    const result = await Api.executeRebuild(pendingRebuild);
    if (!result.success) throw new Error(result.error || "Rebuild failed");
    showToast(result.message, "success");
    dismissRebuild();
  } catch (err) {
    showToast(err.message || "Rebuild failed", "error");
  }
}
