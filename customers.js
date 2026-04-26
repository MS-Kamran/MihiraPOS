/**
 * Customers Page — Table, Search, Sort, Detail Panel
 */
let customers = [];
let orders = [];

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("searchCust").addEventListener("input", renderTable);
  document.getElementById("sortCust").addEventListener("change", renderTable);

  try {
    const [custData, orderData] = await Promise.all([Api.getCustomers(), Api.getOrders()]);
    customers = custData;
    orders = orderData;
    renderStats();
    renderTable();
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("custTable").classList.remove("hidden");
  } catch (err) {
    showToast("Failed to load data", "error");
  }
});

function renderStats() {
  const total = customers.length;
  const totalSpent = customers.reduce((s, c) => s + (parseFloat(c.TotalSpent) || 0), 0);
  const avgSpent = total > 0 ? totalSpent / total : 0;

  document.getElementById("custStats").innerHTML = `
    <div class="stat-card glass"><div class="stat-icon blue"><i class="ri-user-heart-line"></i></div><div class="stat-label">Total Customers</div><div class="stat-value">${total}</div></div>
    <div class="stat-card glass"><div class="stat-icon green"><i class="ri-money-dollar-circle-line"></i></div><div class="stat-label">Total Revenue</div><div class="stat-value">${formatCurrency(totalSpent)}</div></div>
    <div class="stat-card glass"><div class="stat-icon cyan"><i class="ri-line-chart-line"></i></div><div class="stat-label">Avg Spent / Customer</div><div class="stat-value">${formatCurrency(avgSpent)}</div></div>
  `;
}

function renderTable() {
  const search = document.getElementById("searchCust").value.toLowerCase();
  const sort = document.getElementById("sortCust").value;
  const tbody = document.getElementById("custBody");

  let filtered = customers.filter((c) => {
    const haystack = `${c.Phone} ${c.Name} ${c.Email} ${c.City}`.toLowerCase();
    return !search || haystack.includes(search);
  });

  // Sort
  filtered.sort((a, b) => {
    if (sort === "spent") return (parseFloat(b.TotalSpent) || 0) - (parseFloat(a.TotalSpent) || 0);
    if (sort === "orders") return (parseInt(b.TotalOrders) || 0) - (parseInt(a.TotalOrders) || 0);
    return String(a.Name || "").localeCompare(String(b.Name || ""));
  });

  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No customers found</td></tr>';
    return;
  }

  filtered.forEach((c) => {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.innerHTML = `
      <td>${c.Phone}</td><td>${c.Name || "-"}</td><td>${c.Email || "-"}</td>
      <td>${c.City || "-"}</td><td>${c.JoinDate || "-"}</td>
      <td>${c.TotalOrders || 0}</td><td>${formatCurrency(c.TotalSpent)}</td>
    `;
    tr.addEventListener("click", () => openPanel(c));
    tbody.appendChild(tr);
  });
}

function openPanel(customer) {
  document.getElementById("panelCustName").textContent = customer.Name || customer.Phone;

  // Filter orders for this customer
  const custOrders = orders.filter((o) => String(o.customer_phone) === String(customer.Phone));

  // Group by order_id
  const grouped = {};
  custOrders.forEach((row) => {
    if (!row.order_id) return;
    if (!grouped[row.order_id]) grouped[row.order_id] = { items: [], total: 0, date: row.date, status: row.delivery_status };
    grouped[row.order_id].items.push(row);
    grouped[row.order_id].total += parseFloat(row.total_price) || 0;
  });

  const orderHtml = Object.keys(grouped).length > 0
    ? Object.entries(grouped).reverse().map(([id, o]) => `
      <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:8px;margin-bottom:8px">
        <div class="flex-between" style="margin-bottom:8px">
          <span style="font-weight:600;font-size:13px">${id}</span>
          ${createBadge(o.status || "Pending")}
        </div>
        <div class="text-sm text-muted" style="margin-bottom:6px">${o.date}</div>
        ${o.items.map((i) => `<div class="order-item-row"><span>${i.serial} · ${i.color} × ${i.quantity}</span><span>${formatCurrency(i.total_price)}</span></div>`).join("")}
        <div style="text-align:right;font-weight:700;margin-top:8px">${formatCurrency(o.total)}</div>
      </div>`).join("")
    : '<div class="no-data">No orders yet</div>';

  document.getElementById("panelBody").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="form-group"><label>Phone</label><span>${customer.Phone}</span></div>
      <div class="form-group"><label>Email</label><span>${customer.Email || "-"}</span></div>
      <div class="form-group"><label>Address</label><span>${customer.Address || "-"}</span></div>
      <div class="form-group"><label>City</label><span>${customer.City || "-"}</span></div>
      <div class="form-group"><label>Total Orders</label><span>${customer.TotalOrders || 0}</span></div>
      <div class="form-group"><label>Total Spent</label><span>${formatCurrency(customer.TotalSpent)}</span></div>
    </div>
    <h3 style="font-size:14px;margin-bottom:12px">Order History</h3>
    ${orderHtml}
  `;

  document.getElementById("custPanel").classList.add("open");
}

function closePanel() {
  document.getElementById("custPanel").classList.remove("open");
}
