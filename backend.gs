const INVENTORY_SHEET = "INVENTORY";
const CUSTOMERS_SHEET = "CUSTOMERS";
const ORDERS_SHEET = "ORDERS";
const RETURNS_SHEET = "RETURNS";

// ─── GET Handler ────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;

  if (action === "getInventory") {
    return createJsonResponse(getSheetDataAsJson(INVENTORY_SHEET));
  }
  if (action === "getCustomers") {
    return createJsonResponse(getSheetDataAsJson(CUSTOMERS_SHEET));
  }
  if (action === "getOrders") {
    return createJsonResponse(getSheetDataAsJson(ORDERS_SHEET));
  }
  if (action === "getReturns") {
    return createJsonResponse(getSheetDataAsJson(RETURNS_SHEET));
  }

  return createJsonResponse({ error: "Invalid action" });
}

// ─── POST Handler ───────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === "saveOrder") return handleSaveOrder(data.payload);
    if (action === "updateOrder") return handleUpdateOrder(data.payload);
    if (action === "saveCustomer") return handleSaveCustomer(data.payload);
    if (action === "saveInventory") return handleSaveInventory(data.payload);
    if (action === "requestProduct") return handleRequestProduct(data.payload);
    if (action === "processReturn") return handleProcessReturn(data.payload);
    if (action === "checkRebuild") return handleCheckRebuild(data.payload);
    if (action === "executeRebuild") return handleExecuteRebuild(data.payload);

    return createJsonResponse({ error: "Invalid POST action" });
  } catch (error) {
    return createJsonResponse({ error: error.toString() });
  }
}

// ─── Save Order (line-item rows) ────────────────────────
function handleSaveOrder(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_SHEET);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRows = [];

  payload.items.forEach(function (item) {
    var row = [];
    headers.forEach(function (header) {
      var cleanHeader = String(header).trim();
      row.push(item[cleanHeader] !== undefined ? item[cleanHeader] : "");
    });
    newRows.push(row);
  });

  if (newRows.length === 0) {
    return createJsonResponse({ error: "No items provided" });
  }

  sheet
    .getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length)
    .setValues(newRows);

  updateInventoryLevels(payload.items);

  // Upsert customer record if phone is provided
  if (payload.customer) {
    handleSaveCustomer(payload.customer);
  }

  return createJsonResponse({ success: true, message: "Order saved" });
}

// ─── Update Order (by order_id) ─────────────────────────
// Updates delivery_status, payment_status, paid_amount,
// due_amount, and notes for ALL rows matching a given order_id.
function handleUpdateOrder(payload) {
  var orderId = payload.order_id;
  if (!orderId) {
    return createJsonResponse({ error: "order_id is required" });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_SHEET);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var orderIdIdx = headers.indexOf("order_id");
  if (orderIdIdx === -1) {
    return createJsonResponse({ error: "order_id column not found" });
  }

  // Columns we allow updating
  var allowedFields = [
    "delivery_status",
    "payment_status",
    "paid_amount",
    "due_amount",
    "payment_method",
    "notes",
    "action",
  ];

  var updatedCount = 0;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][orderIdIdx]) !== String(orderId)) continue;

    allowedFields.forEach(function (field) {
      if (payload[field] === undefined) return;

      var colIdx = headers.indexOf(field);
      if (colIdx === -1) return;

      sheet.getRange(i + 1, colIdx + 1).setValue(payload[field]);
    });

    updatedCount++;
  }

  // If marking as Returned, reverse the inventory
  if (payload.delivery_status === "Returned") {
    reverseInventoryForOrder(orderId, data, headers);
  }

  return createJsonResponse({
    success: true,
    message: updatedCount + " row(s) updated",
  });
}

// ─── Save / Update Customer ─────────────────────────────
// Uses Phone as the unique key. If exists → updates, else → appends.
function handleSaveCustomer(payload) {
  var phone = String(payload.Phone || "").trim();
  if (!phone) {
    return createJsonResponse({ error: "Phone is required" });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CUSTOMERS_SHEET);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var phoneIdx = headers.indexOf("Phone");

  if (phoneIdx === -1) {
    return createJsonResponse({ error: "Phone column not found" });
  }

  // Check if customer already exists
  var existingRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][phoneIdx]).trim() === phone) {
      existingRow = i;
      break;
    }
  }

  if (existingRow > -1) {
    // Update existing customer — merge provided fields
    headers.forEach(function (header, colIdx) {
      var cleanHeader = String(header).trim();
      if (payload[cleanHeader] !== undefined) {
        sheet.getRange(existingRow + 1, colIdx + 1).setValue(payload[cleanHeader]);
      }
    });

    // Increment TotalOrders and TotalSpent if provided
    if (payload._addToTotalOrders) {
      var ordersIdx = headers.indexOf("TotalOrders");
      if (ordersIdx > -1) {
        var current = parseInt(data[existingRow][ordersIdx]) || 0;
        sheet
          .getRange(existingRow + 1, ordersIdx + 1)
          .setValue(current + payload._addToTotalOrders);
      }
    }
    if (payload._addToTotalSpent) {
      var spentIdx = headers.indexOf("TotalSpent");
      if (spentIdx > -1) {
        var currentSpent = parseFloat(data[existingRow][spentIdx]) || 0;
        sheet
          .getRange(existingRow + 1, spentIdx + 1)
          .setValue(currentSpent + payload._addToTotalSpent);
      }
    }
  } else {
    // New customer — append row
    var newRow = [];
    headers.forEach(function (header) {
      var cleanHeader = String(header).trim();
      if (cleanHeader === "JoinDate") {
        newRow.push(payload[cleanHeader] || new Date().toLocaleDateString());
      } else if (cleanHeader === "TotalOrders") {
        newRow.push(payload._addToTotalOrders || 0);
      } else if (cleanHeader === "TotalSpent") {
        newRow.push(payload._addToTotalSpent || 0);
      } else {
        newRow.push(payload[cleanHeader] || "");
      }
    });
    sheet.appendRow(newRow);
  }

  return createJsonResponse({ success: true, message: "Customer saved" });
}

// ─── Save Inventory ─────────────────────────────────────
function handleSaveInventory(payload) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_SHEET);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var newRows = [];

  payload.items.forEach(function (item) {
    var row = [];
    headers.forEach(function (header) {
      var cleanHeader = String(header).trim();
      row.push(item[cleanHeader] !== undefined ? item[cleanHeader] : "");
    });
    newRows.push(row);
  });

  if (newRows.length === 0) {
    return createJsonResponse({ error: "No items provided" });
  }

  sheet
    .getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length)
    .setValues(newRows);

  return createJsonResponse({ success: true, message: "Inventory saved" });
}

// ─── Inventory Stock Helpers ────────────────────────────
function updateInventoryLevels(items) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_SHEET);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var skuIndex = headers.indexOf("SERIAL");
  var stockIndex = headers.indexOf("SET QUANTITY");
  var soldIndex = headers.indexOf("SOLD");

  if (skuIndex === -1 || stockIndex === -1) return;

  // Aggregate sold quantities by SKU
  var salesMap = {};
  items.forEach(function (item) {
    var sku = item["serial"];
    var qty = parseInt(item["quantity"]) || 0;
    if (sku) {
      salesMap[sku] = (salesMap[sku] || 0) + qty;
    }
  });

  for (var i = 1; i < data.length; i++) {
    var rowSku = data[i][skuIndex];
    if (!salesMap[rowSku]) continue;

    var currentStock = parseInt(data[i][stockIndex]) || 0;
    var soldQty = salesMap[rowSku];

    sheet
      .getRange(i + 1, stockIndex + 1)
      .setValue(Math.max(0, currentStock - soldQty));

    if (soldIndex !== -1) {
      var currentSold = parseInt(data[i][soldIndex]) || 0;
      sheet.getRange(i + 1, soldIndex + 1).setValue(currentSold + soldQty);
    }
  }
}

function reverseInventoryForOrder(orderId, orderData, orderHeaders) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_SHEET);
  var invData = sheet.getDataRange().getValues();
  var invHeaders = invData[0];
  var skuIndex = invHeaders.indexOf("SERIAL");
  var soldIndex = invHeaders.indexOf("SOLD");

  var orderIdIdx = orderHeaders.indexOf("order_id");
  var serialIdx = orderHeaders.indexOf("serial");
  var qtyIdx = orderHeaders.indexOf("quantity");

  if (skuIndex === -1 || soldIndex === -1) return;

  // Aggregate quantities to reverse
  var reverseMap = {};
  for (var i = 1; i < orderData.length; i++) {
    if (String(orderData[i][orderIdIdx]) !== String(orderId)) continue;
    var sku = orderData[i][serialIdx];
    var qty = parseInt(orderData[i][qtyIdx]) || 0;
    if (sku) {
      reverseMap[sku] = (reverseMap[sku] || 0) + qty;
    }
  }

  // Only reverse SOLD, never touch SET QUANTITY
  for (var j = 1; j < invData.length; j++) {
    var rowSku = invData[j][skuIndex];
    if (!reverseMap[rowSku]) continue;

    var currentSold = parseInt(invData[j][soldIndex]) || 0;
    sheet.getRange(j + 1, soldIndex + 1).setValue(Math.max(0, currentSold - reverseMap[rowSku]));
  }
}

// ─── Request Product ────────────────────────────────
function handleRequestProduct(payload) {
  var serial = String(payload.serial || "").trim();
  if (!serial) return createJsonResponse({ error: "Serial is required" });

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_SHEET);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var skuIndex = headers.indexOf("SERIAL");
  var reqIndex = headers.indexOf("Request");

  if (skuIndex === -1) return createJsonResponse({ error: "SERIAL column not found" });
  if (reqIndex === -1) return createJsonResponse({ error: "Request column not found" });

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][skuIndex]) === serial) {
      var currentReq = parseInt(data[i][reqIndex]) || 0;
      sheet.getRange(i + 1, reqIndex + 1).setValue(currentReq + 1);
      return createJsonResponse({ success: true, message: "Request recorded", count: currentReq + 1 });
    }
  }

  return createJsonResponse({ error: "Product not found" });
}

// ─── Return Management ──────────────────────────────────
function handleProcessReturn(payload) {
  var orderId = String(payload.order_id || "").trim();
  var serial = String(payload.serial || "").trim();
  var name = String(payload.name || "").trim();
  var color = String(payload.color || "").trim();
  var size = String(payload.size || "").trim();
  var setSize = parseInt(payload.set_size) || 12;
  var brokenCount = parseInt(payload.broken_count) || 0;
  var notes = String(payload.notes || "");

  if (!orderId || !serial) return createJsonResponse({ error: "order_id and serial are required" });
  if (brokenCount < 0 || brokenCount > setSize) return createJsonResponse({ error: "Invalid broken count" });

  var goodCount = setSize - brokenCount;
  var returnType = brokenCount === 0 ? "Full Return" : "Damaged Return";
  var actionTaken = brokenCount === 0 ? "Restocked" : "Sent to Spares";
  // spare_status tracks if spare pieces are still available or used in a rebuild
  var spareStatus = brokenCount === 0 ? "" : "Available";
  var returnId = "RET-" + Date.now();
  var returnDate = new Date().toLocaleDateString("en-GB");

  // Log to RETURNS sheet (includes spare tracking columns)
  var returnSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RETURNS_SHEET);
  if (!returnSheet) return createJsonResponse({ error: "RETURNS sheet not found" });
  var retHeaders = returnSheet.getRange(1, 1, 1, returnSheet.getLastColumn()).getValues()[0];
  var retRow = [];
  var retData = {
    return_id: returnId, return_date: returnDate, order_id: orderId,
    serial: serial, name: name, color: color, size: size,
    set_size: setSize, broken_count: brokenCount, good_count: goodCount,
    return_type: returnType, action_taken: actionTaken, spare_status: spareStatus, notes: notes
  };
  retHeaders.forEach(function(h) { retRow.push(retData[String(h).trim()] !== undefined ? retData[String(h).trim()] : ""); });
  returnSheet.appendRow(retRow);

  // Update order delivery status to Returned
  markOrderReturned(orderId);

  // Full return: decrement SOLD to restore stock
  if (brokenCount === 0) {
    var invSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_SHEET);
    var invData = invSheet.getDataRange().getValues();
    var invHeaders = invData[0];
    var serialIdx = invHeaders.indexOf("SERIAL");
    var soldIdx = invHeaders.indexOf("SOLD");
    if (serialIdx !== -1 && soldIdx !== -1) {
      for (var i = 1; i < invData.length; i++) {
        if (String(invData[i][serialIdx]) === serial) {
          var currentSold = parseInt(invData[i][soldIdx]) || 0;
          invSheet.getRange(i + 1, soldIdx + 1).setValue(Math.max(0, currentSold - 1));
          break;
        }
      }
    }
    return createJsonResponse({ success: true, return_id: returnId, type: "full", message: "Product restocked" });
  }

  // Damaged return: check if rebuild is now possible
  var rebuildCheck = checkRebuildInternal(name, color, size, setSize);
  return createJsonResponse({
    success: true, return_id: returnId, type: "damaged",
    spare_pieces: goodCount, can_rebuild: rebuildCheck.canRebuild,
    available_pieces: rebuildCheck.totalPieces
  });
}

// Helper: mark order as Returned in ORDERS sheet
function markOrderReturned(orderId) {
  var orderSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_SHEET);
  var orderData = orderSheet.getDataRange().getValues();
  var orderHeaders = orderData[0];
  var orderIdIdx = orderHeaders.indexOf("order_id");
  var delStatusIdx = orderHeaders.indexOf("delivery_status");
  if (orderIdIdx === -1 || delStatusIdx === -1) return;
  for (var j = 1; j < orderData.length; j++) {
    if (String(orderData[j][orderIdIdx]) === orderId) {
      orderSheet.getRange(j + 1, delStatusIdx + 1).setValue("Returned");
      break;
    }
  }
}

// Check rebuild possibility using RETURNS sheet (spare_status = Available)
function checkRebuildInternal(name, color, size, setSize) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RETURNS_SHEET);
  if (!sheet) return { canRebuild: false, totalPieces: 0 };
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var nameIdx = headers.indexOf("name");
  var colorIdx = headers.indexOf("color");
  var sizeIdx = headers.indexOf("size");
  var goodIdx = headers.indexOf("good_count");
  var spareIdx = headers.indexOf("spare_status");

  var totalPieces = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][nameIdx]) === name && String(data[i][colorIdx]) === color &&
        String(data[i][sizeIdx]) === size && String(data[i][spareIdx]) === "Available") {
      totalPieces += parseInt(data[i][goodIdx]) || 0;
    }
  }
  return { canRebuild: totalPieces >= setSize, totalPieces: totalPieces, setSize: setSize };
}

function handleCheckRebuild(payload) {
  var name = String(payload.name || "");
  var color = String(payload.color || "");
  var size = String(payload.size || "");
  var setSize = parseInt(payload.set_size) || 12;
  var result = checkRebuildInternal(name, color, size, setSize);
  return createJsonResponse({ success: true, can_rebuild: result.canRebuild, available_pieces: result.totalPieces, set_size: setSize });
}

function handleExecuteRebuild(payload) {
  var name = String(payload.name || "");
  var color = String(payload.color || "");
  var size = String(payload.size || "");
  var setSize = parseInt(payload.set_size) || 12;

  var check = checkRebuildInternal(name, color, size, setSize);
  if (!check.canRebuild) return createJsonResponse({ error: "Not enough pieces to rebuild (" + check.totalPieces + "/" + setSize + ")" });

  // Consume spare pieces from RETURNS rows
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RETURNS_SHEET);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var nameIdx = headers.indexOf("name");
  var colorIdx = headers.indexOf("color");
  var sizeIdx = headers.indexOf("size");
  var goodIdx = headers.indexOf("good_count");
  var spareIdx = headers.indexOf("spare_status");
  var actionIdx = headers.indexOf("action_taken");

  var remaining = setSize;
  for (var i = 1; i < data.length && remaining > 0; i++) {
    if (String(data[i][nameIdx]) === name && String(data[i][colorIdx]) === color &&
        String(data[i][sizeIdx]) === size && String(data[i][spareIdx]) === "Available") {
      var piecesHere = parseInt(data[i][goodIdx]) || 0;
      if (piecesHere <= remaining) {
        sheet.getRange(i + 1, spareIdx + 1).setValue("Used in Rebuild");
        sheet.getRange(i + 1, actionIdx + 1).setValue("Rebuilt");
        remaining -= piecesHere;
      } else {
        sheet.getRange(i + 1, goodIdx + 1).setValue(piecesHere - remaining);
        remaining = 0;
      }
    }
  }

  // Add 1 to SET QUANTITY in INVENTORY
  var invSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVENTORY_SHEET);
  var invData = invSheet.getDataRange().getValues();
  var invHeaders = invData[0];
  var invNameIdx = invHeaders.indexOf("NAME");
  var invColorIdx = invHeaders.indexOf("COLOR");
  var invSizeIdx = invHeaders.indexOf("SIZE");
  var invQtyIdx = invHeaders.indexOf("SET QUANTITY");

  for (var j = 1; j < invData.length; j++) {
    if (String(invData[j][invNameIdx]) === name && String(invData[j][invColorIdx]) === color &&
        String(invData[j][invSizeIdx]) === size) {
      var currentQty = parseInt(invData[j][invQtyIdx]) || 0;
      invSheet.getRange(j + 1, invQtyIdx + 1).setValue(currentQty + 1);
      break;
    }
  }

  return createJsonResponse({ success: true, message: "Rebuilt 1 set of " + name + " " + color + " Size " + size });
}

// ─── Utilities ──────────────────────────────────────────
function getSheetDataAsJson(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // Skip completely empty rows
    var isEmpty = row.every(function (cell) {
      return cell === "" || cell === null || cell === undefined;
    });
    if (isEmpty) continue;

    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }
  return result;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}
