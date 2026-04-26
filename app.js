/**
 * Mihira POS - Core Logic
 */

// --- State Management ---
let state = {
    inventory: [],
    cart: [],
    categories: new Set()
};

// --- DOM Elements ---
const DOM = {
    loading: document.getElementById('loading-indicator'),
    productGrid: document.getElementById('product-grid'),
    categoryFilter: document.getElementById('categoryFilter'),
    searchInput: document.getElementById('searchInput'),
    
    cartItemsContainer: document.getElementById('cart-items'),
    cartCount: document.getElementById('cartCount'),
    cartTotal: document.getElementById('cartTotal'),
    clearCartBtn: document.getElementById('clearCartBtn'),
    
    checkoutBtn: document.getElementById('checkoutBtn'),
    custPhone: document.getElementById('custPhone'),
    custName: document.getElementById('custName'),
    paymentMethod: document.getElementById('paymentMethod'),
    paymentStatus: document.getElementById('paymentStatus'),
    
    toastContainer: document.getElementById('toast-container')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    setupEventListeners();
    await fetchInventory();
}

function setupEventListeners() {
    DOM.searchInput.addEventListener('input', renderProducts);
    DOM.categoryFilter.addEventListener('change', renderProducts);
    DOM.clearCartBtn.addEventListener('click', clearCart);
    DOM.checkoutBtn.addEventListener('click', handleCheckout);
}

// --- API Interactions ---
async function fetchInventory() {
    try {
        DOM.loading.classList.remove('hidden');
        DOM.productGrid.classList.add('hidden');

        const response = await fetch(`${window.APP_CONFIG.API_URL}?action=getInventory`);
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        
        // Filter out empty rows
        state.inventory = data.filter(item => item.SKU && item.NAME);
        
        // Extract unique categories (using NAME or Category if they mapped it)
        state.inventory.forEach(item => {
            if (item.NAME) state.categories.add(item.NAME);
        });

        populateCategoryDropdown();
        renderProducts();

        DOM.loading.classList.add('hidden');
        DOM.productGrid.classList.remove('hidden');

    } catch (error) {
        showToast('Error loading inventory. Please refresh.', 'error');
        console.error(error);
    }
}

// --- UI Rendering ---
function populateCategoryDropdown() {
    DOM.categoryFilter.innerHTML = '<option value="all">All Designs</option>';
    state.categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        DOM.categoryFilter.appendChild(option);
    });
}

function renderProducts() {
    const searchTerm = DOM.searchInput.value.toLowerCase();
    const selectedCategory = DOM.categoryFilter.value;
    
    DOM.productGrid.innerHTML = '';

    const filtered = state.inventory.filter(item => {
        const matchesSearch = item.SKU.toLowerCase().includes(searchTerm) || 
                              item.NAME.toLowerCase().includes(searchTerm) ||
                              item.COLOR.toLowerCase().includes(searchTerm);
        
        const matchesCat = selectedCategory === 'all' || item.NAME === selectedCategory;
        
        return matchesSearch && matchesCat;
    });

    if (filtered.length === 0) {
        DOM.productGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 40px;">No products found.</div>';
        return;
    }

    filtered.forEach(item => {
        const stock = parseInt(item['SET QUANTITY']) || 0;
        const price = parseFloat(item['SELLING PRICE']) || 0;
        const isOutOfStock = stock <= 0;
        
        // Try to get first image if comma separated
        let imgUrl = item.IMAGES || '';
        if (imgUrl.includes(',')) imgUrl = imgUrl.split(',')[0].trim();

        const card = document.createElement('div');
        card.className = `product-card ${isOutOfStock ? 'out-of-stock' : ''}`;
        card.innerHTML = `
            ${imgUrl ? `<img src="${imgUrl}" class="product-img" alt="${item.NAME}" onerror="this.style.display='none'">` : `<div class="product-img"><i class="ri-image-line" style="font-size: 32px"></i></div>`}
            <div class="product-info">
                <h3>${item.NAME}</h3>
                <div class="product-meta">
                    <span>${item.COLOR}</span>
                    <span>Size: ${item.SIZE}</span>
                </div>
                <div class="product-footer">
                    <span class="product-price">৳${price.toFixed(2)}</span>
                    <span class="product-stock ${stock < 5 ? 'stock-low' : ''} ${isOutOfStock ? 'stock-out' : ''}">
                        ${isOutOfStock ? 'Out of Stock' : `Stock: ${stock}`}
                    </span>
                </div>
            </div>
        `;

        if (!isOutOfStock) {
            card.addEventListener('click', () => addToCart(item));
        }

        DOM.productGrid.appendChild(card);
    });
}

// --- Cart Logic ---
function addToCart(product) {
    const stock = parseInt(product['SET QUANTITY']) || 0;
    const existingItem = state.cart.find(item => item.SKU === product.SKU);

    if (existingItem) {
        if (existingItem.cartQty >= stock) {
            showToast('Cannot add more than available stock', 'error');
            return;
        }
        existingItem.cartQty++;
    } else {
        if (stock <= 0) return;
        state.cart.push({ ...product, cartQty: 1 });
    }

    renderCart();
}

function updateCartQty(sku, delta) {
    const itemIndex = state.cart.findIndex(item => item.SKU === sku);
    if (itemIndex > -1) {
        const item = state.cart[itemIndex];
        const maxStock = parseInt(item['SET QUANTITY']) || 0;
        
        const newQty = item.cartQty + delta;
        if (newQty <= 0) {
            state.cart.splice(itemIndex, 1);
        } else if (newQty > maxStock) {
            showToast('Maximum stock reached', 'error');
        } else {
            item.cartQty = newQty;
        }
        renderCart();
    }
}

function clearCart() {
    state.cart = [];
    renderCart();
}

function renderCart() {
    DOM.cartItemsContainer.innerHTML = '';
    
    if (state.cart.length === 0) {
        DOM.cartItemsContainer.innerHTML = `
            <div class="empty-cart-msg">
                <i class="ri-shopping-cart-2-line"></i>
                <p>Cart is empty</p>
            </div>
        `;
        DOM.cartCount.textContent = '0';
        DOM.cartTotal.textContent = '৳0.00';
        DOM.checkoutBtn.disabled = true;
        return;
    }

    let total = 0;
    let count = 0;

    state.cart.forEach(item => {
        const price = parseFloat(item['SELLING PRICE']) || 0;
        const itemTotal = price * item.cartQty;
        total += itemTotal;
        count += item.cartQty;

        // Try to get first image
        let imgUrl = item.IMAGES || '';
        if (imgUrl.includes(',')) imgUrl = imgUrl.split(',')[0].trim();

        const el = document.createElement('div');
        el.className = 'cart-item';
        el.innerHTML = `
            ${imgUrl ? `<img src="${imgUrl}" class="cart-item-img">` : `<div class="cart-item-img"><i class="ri-image-line"></i></div>`}
            <div class="cart-item-details">
                <h4>${item.NAME}</h4>
                <div class="cart-item-meta">${item.COLOR} • Size ${item.SIZE}</div>
            </div>
            <div class="cart-item-controls">
                <div class="cart-item-price">৳${itemTotal.toFixed(2)}</div>
                <div class="qty-control">
                    <button class="qty-btn" onclick="updateCartQty('${item.SKU}', -1)"><i class="ri-subtract-line"></i></button>
                    <span class="qty-val">${item.cartQty}</span>
                    <button class="qty-btn" onclick="updateCartQty('${item.SKU}', 1)"><i class="ri-add-line"></i></button>
                </div>
            </div>
        `;
        DOM.cartItemsContainer.appendChild(el);
    });

    DOM.cartCount.textContent = count;
    DOM.cartTotal.textContent = `৳${total.toFixed(2)}`;
    DOM.checkoutBtn.disabled = false;
}

// --- Checkout Logic ---
async function handleCheckout() {
    const phone = DOM.custPhone.value.trim();
    if (!phone) {
        showToast('Customer phone number is required', 'error');
        DOM.custPhone.focus();
        return;
    }

    DOM.checkoutBtn.disabled = true;
    const originalText = DOM.checkoutBtn.innerHTML;
    DOM.checkoutBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Processing...';

    // Generate Order Data matching user's ORDERS schema
    const orderId = 'ORD-' + Date.now().toString().slice(-6);
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();
    
    const custName = DOM.custName.value.trim() || 'Guest';
    const payMethod = DOM.paymentMethod.value;
    const payStatus = DOM.paymentStatus.value;
    
    // Create an array of line items for the Google Sheet
    const orderItems = state.cart.map(item => {
        const unitPrice = parseFloat(item['SELLING PRICE']) || 0;
        const totalLinePrice = unitPrice * item.cartQty;
        
        return {
            order_id: orderId,
            timestamp: now.toISOString(),
            date: dateStr,
            time: timeStr,
            customer_id: phone,
            customer_name: custName,
            customer_phone: phone,
            serial: item.SKU,
            category: item.NAME,
            color: item.COLOR,
            size: item.SIZE,
            quantity: item.cartQty,
            unit_price: unitPrice,
            total_price: totalLinePrice,
            action: 'Sale',
            payment_status: payStatus,
            paid_amount: payStatus === 'Paid' ? totalLinePrice : 0,
            due_amount: payStatus === 'Unpaid' ? totalLinePrice : 0,
            delivery_status: 'Pending',
            notes: 'Processed via POS'
        };
    });

    try {
        const response = await fetch(window.APP_CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'saveOrder',
                payload: { items: orderItems }
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showToast('Order completed successfully!', 'success');
            
            // Optimistically update local inventory stock
            state.cart.forEach(cartItem => {
                const invItem = state.inventory.find(i => i.SKU === cartItem.SKU);
                if (invItem) {
                    const currentStock = parseInt(invItem['SET QUANTITY']) || 0;
                    invItem['SET QUANTITY'] = Math.max(0, currentStock - cartItem.cartQty);
                }
            });
            
            // Reset form and cart
            DOM.custPhone.value = '';
            DOM.custName.value = '';
            clearCart();
            renderProducts(); // Re-render to show updated stock
        } else {
            throw new Error(result.error || 'Failed to save order');
        }
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Checkout failed. Check connection.', 'error');
    } finally {
        DOM.checkoutBtn.innerHTML = originalText;
        DOM.checkoutBtn.disabled = state.cart.length === 0;
    }
}

// --- Utils ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="ri-${type === 'success' ? 'checkbox-circle-fill' : 'error-warning-fill'}"></i>
        <span>${message}</span>
    `;
    
    DOM.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s forwards reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
