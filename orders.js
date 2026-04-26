/**
 * Orders Page — Grouped order cards with lifecycle actions
 */
let allOrders = [];
let groupedOrders = {};
let activeTab = "All";

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  document.getElementById("searchOrders").addEventListener("input", renderOrders);

  // Close modal on overlay click
  document.getElementById("updateModal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) closeUpdateModal();
  });
  document.getElementById("paymentModal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) closePaymentModal();
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
    });
  });
}

async function loadOrders() {
  try {
    allOrders = await Api.getOrders();
    groupOrders();
    renderOrders();
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

// Parse comma-separated item fields from a consolidated order row
function buildItemRows(order) {
  const firstRow = order.rows[0];
  const serials = String(firstRow.serial || "").split(",").map(s => s.trim());
  const colors = String(firstRow.color || "").split(",").map(s => s.trim());
  const sizes = String(firstRow.size || "").split(",").map(s => s.trim());
  const quantities = String(firstRow.quantity || "").split(",").map(s => s.trim());

  // If only one serial, render as a single line
  if (serials.length <= 1) {
    return `<div class="order-item-row"><span>${firstRow.serial || "-"} · ${firstRow.color || "-"} · Size ${firstRow.size || "-"} × ${firstRow.quantity || 1}</span></div>`;
  }

  return serials.map((serial, idx) => {
    const color = colors[idx] || colors[0] || "-";
    const size = sizes[idx] || sizes[0] || "-";
    const qty = quantities[idx] || "1";
    return `<div class="order-item-row"><span>${serial} · ${color} · Size ${size} × ${qty}</span></div>`;
  }).join("");
}

function renderOrders() {
  const search = document.getElementById("searchOrders").value.toLowerCase();
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

    const card = document.createElement("div");
    card.className = "order-card glass";
    card.innerHTML = `
      <div class="order-card-header">
        <div>
          <div class="order-id">${order.order_id}</div>
          <div class="order-date">${order.date} ${order.time}</div>
        </div>
        <div style="display:flex;gap:6px">
          ${createBadge(order.delivery_status)}
          ${createBadge(order.payment_status)}
        </div>
      </div>
      <div class="order-customer"><i class="ri-user-line"></i> ${order.customer_name} · ${order.customer_phone}</div>
      <div class="order-items-list">
        ${buildItemRows(order)}
      </div>
      <div class="order-footer">
        <div class="order-total">${formatCurrency(order.total)}${order.discount ? ` <span style="font-size:12px;color:var(--accent)">(Disc: ${order.discount})</span>` : ""}${order.payment_status === "Partial" ? ` <span style="font-size:12px;color:var(--text-muted)">(Paid: ${formatCurrency(order.paid_amount || 0)}, Due: ${formatCurrency(order.due_amount || 0)})</span>` : ""}</div>
        <div class="order-actions">
          ${order.delivery_status === "Pending" ? `<button class="btn btn-warning" onclick="quickUpdate('${id}','Dispatched')"><i class="ri-truck-line"></i> Dispatch</button>` : ""}
          ${order.delivery_status === "Dispatched" ? `<button class="btn btn-info" onclick="quickUpdate('${id}','Delivered')"><i class="ri-check-line"></i> Delivered</button>` : ""}
          ${order.payment_status !== "Paid" ? `<button class="btn btn-success" onclick="openPaymentModal('${id}')"><i class="ri-money-dollar-circle-line"></i> Mark Paid</button>` : ""}
          <button class="btn btn-ghost" onclick="openUpdateModal('${id}')"><i class="ri-edit-line"></i> Update</button>
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
      groupedOrders[orderId].items.forEach((i) => {
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
      groupedOrders[orderId].items.forEach((i) => Object.assign(i, payload));
    }
    closeUpdateModal();
    renderOrders();
  } catch (err) {
    showToast(err.message || "Update failed", "error");
  } finally {
    document.getElementById("saveUpdateBtn").disabled = false;
  }
}


