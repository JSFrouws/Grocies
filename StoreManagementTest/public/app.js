// API base URL
const API_BASE_URL = 'http://localhost:3000/api';

// DOM Elements
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loginForm = document.getElementById('login-form');
const searchForm = document.getElementById('search-form');
const productsGrid = document.getElementById('products-grid');
const basketContent = document.getElementById('basket-content');
const userInfo = document.getElementById('user-info');
const viewBasketBtn = document.getElementById('view-basket-btn');
const logoutBtn = document.getElementById('logout-btn');
const toastContainer = document.getElementById('toast-container');
const loadingOverlay = document.getElementById('loading-overlay');
const loginBtn = document.getElementById('login-btn');
const basketSidebar = document.getElementById('basket-sidebar');
const basketOverlay = document.getElementById('basket-overlay');
const closeBasketBtn = document.getElementById('close-basket-btn');
const basketCountEl = document.getElementById('basket-count');

// State
let currentUser = null;
let basketItemCount = 0;

// =====================
// Toast Notification System
// =====================
function showToast(message, type = 'info', duration = 5000) {
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
    `;

    toastContainer.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
}

// =====================
// Loading Overlay
// =====================
function showLoading(text = 'Laden...') {
    const loadingText = loadingOverlay.querySelector('.loading-text');
    if (loadingText) loadingText.textContent = text;
    loadingOverlay.classList.add('active');
}

function hideLoading() {
    loadingOverlay.classList.remove('active');
}

// =====================
// Basket Sidebar
// =====================
function openBasketSidebar() {
    basketSidebar.classList.add('active');
    basketOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeBasketSidebar() {
    basketSidebar.classList.remove('active');
    basketOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

function updateBasketCount(count) {
    basketItemCount = count;
    if (count > 0) {
        basketCountEl.textContent = count;
        basketCountEl.classList.remove('hidden');
    } else {
        basketCountEl.classList.add('hidden');
    }
}

// =====================
// Login Button State
// =====================
function setLoginButtonLoading(loading) {
    const spinner = loginBtn.querySelector('.spinner');
    const btnText = loginBtn.querySelector('.btn-text');

    if (loading) {
        loginBtn.classList.add('btn-loading');
        loginBtn.disabled = true;
        spinner.style.display = 'inline-block';
        btnText.textContent = 'Inloggen...';
    } else {
        loginBtn.classList.remove('btn-loading');
        loginBtn.disabled = false;
        spinner.style.display = 'none';
        btnText.textContent = 'Login';
    }
}

// =====================
// API Functions
// =====================
async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/status`);
        const data = await response.json();

        if (data.isLoggedIn) {
            currentUser = data.username;
            showAppSection();
            showToast(`Welkom terug, ${data.username}!`, 'success');
        } else {
            showLoginSection();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        showLoginSection();
    }
}

async function login(username, password, remember) {
    setLoginButtonLoading(true);
    showLoading('Inloggen via browser... Dit kan even duren');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password, remember }),
        });

        const data = await response.json();

        hideLoading();
        setLoginButtonLoading(false);

        if (data.success) {
            currentUser = username;
            const hasBasket = data.hasCustomerId ? ' (met basket functionaliteit)' : '';
            showToast(`Login successful!${hasBasket}`, 'success');
            setTimeout(() => {
                showAppSection();
            }, 500);
        } else {
            showToast(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        hideLoading();
        setLoginButtonLoading(false);
        showToast('Login error: ' + error.message, 'error');
    }
}

async function logout() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
        });

        const data = await response.json();

        if (data.success) {
            currentUser = null;
            showLoginSection();
            showToast('Uitgelogd', 'success');
        }
    } catch (error) {
        showToast('Logout error: ' + error.message, 'error');
    }
}

async function searchProducts(query) {
    showToast('Zoeken...', 'info', 2000);

    try {
        const response = await fetch(`${API_BASE_URL}/products/search?q=${encodeURIComponent(query)}&limit=20`);
        const data = await response.json();

        if (data.success) {
            displayProducts(data.products);
            showToast(`${data.products.length} producten gevonden`, 'success', 3000);
        } else {
            showToast(data.message || 'Search failed', 'error');
        }
    } catch (error) {
        showToast('Search error: ' + error.message, 'error');
    }
}

async function addToBasket(sku, quantity = 1, productTitle = '') {
    try {
        const response = await fetch(`${API_BASE_URL}/basket/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sku, quantity }),
        });

        const data = await response.json();

        if (data.success) {
            showToast(`${quantity}x "${productTitle}" toegevoegd aan basket!`, 'success');
            // Update basket count
            if (data.itemCount !== undefined) {
                updateBasketCount(data.itemCount);
            }
        } else {
            showToast(data.message || 'Failed to add to basket', 'error');
        }
    } catch (error) {
        showToast('Error adding to basket: ' + error.message, 'error');
    }
}

async function viewBasket() {
    openBasketSidebar();
    basketContent.innerHTML = '<div class="basket-loading"><div class="spinner"></div> Basket laden...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/basket`);
        const data = await response.json();

        if (data.success) {
            displayBasket(data);
            updateBasketCount(data.itemCount || 0);
        } else {
            showToast(data.message || 'Failed to load basket', 'error');
            basketContent.innerHTML = '<p class="basket-empty">Kon basket niet laden</p>';
        }
    } catch (error) {
        showToast('Error loading basket: ' + error.message, 'error');
        basketContent.innerHTML = '<p class="basket-empty">Error loading basket</p>';
    }
}

// =====================
// Display Functions
// =====================
function showLoginSection() {
    loginSection.classList.remove('hidden');
    appSection.classList.add('hidden');
    userInfo.textContent = '';
}

function showAppSection() {
    loginSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    userInfo.textContent = `Logged in as: ${currentUser}`;
}

function displayProducts(products) {
    if (!products || products.length === 0) {
        productsGrid.innerHTML = '<p class="basket-empty">No products found. Try a different search term.</p>';
        return;
    }

    productsGrid.innerHTML = products.map(product => `
        <div class="product-card">
            ${product.image ? `<img src="${product.image}" alt="${product.title}" class="product-image">` : '<div class="product-image" style="display: flex; align-items: center; justify-content: center; color: #666;">No Image</div>'}
            <div class="product-title">${product.title}</div>
            <div class="product-price">€${(product.price / 100).toFixed(2)}</div>
            <div class="product-sku">SKU: ${product.sku}</div>
            ${product.quantity ? `<div class="product-sku">${product.quantity}</div>` : ''}
            <div class="product-actions">
                <div class="quantity-controls">
                    <button class="qty-btn qty-minus" onclick="adjustProductQty('${product.sku}', -1)">−</button>
                    <input type="number" class="qty-input-edit" value="1" min="1" max="99" id="qty-${product.sku}"
                           onkeypress="if(event.key === 'Enter') this.blur()">
                    <button class="qty-btn qty-plus" onclick="adjustProductQty('${product.sku}', 1)">+</button>
                </div>
                <button class="btn btn-add" onclick="addToBasketFromUI('${product.sku}', '${product.title.replace(/'/g, "\\'")}')">
                    Add
                </button>
            </div>
        </div>
    `).join('');
}

function displayBasket(data) {
    if (!data || !data.items || data.items.length === 0) {
        basketContent.innerHTML = '<p class="basket-empty">Your basket is empty</p>';
        return;
    }

    const itemsHTML = data.items.map(item => {
        const details = item.details || {};
        const price = details.price?.price || 0;
        const title = details.title || item.sku;
        const brand = details.brand || '';
        const image = details.image || '';
        const lineId = item.id;

        return `
        <div class="basket-item" data-sku="${item.sku}" data-line-id="${lineId}">
            ${image ? `<img src="${image}" alt="${title}" class="basket-item-image">` : ''}
            <div class="basket-item-info">
                <div class="basket-item-title">${title}</div>
                <div class="basket-item-details">
                    ${brand ? `${brand}` : ''}
                </div>
                <div class="basket-item-controls">
                    <div class="quantity-controls">
                        <button class="qty-btn qty-minus" onclick="updateQuantity('${item.sku}', ${item.quantity}, -1)">−</button>
                        <input type="number" class="qty-input-edit" value="${item.quantity}" min="1" max="99"
                               onchange="setQuantity('${item.sku}', ${item.quantity}, this.value)"
                               onkeypress="if(event.key === 'Enter') this.blur()">
                        <button class="qty-btn qty-plus" onclick="updateQuantity('${item.sku}', ${item.quantity}, 1)">+</button>
                    </div>
                    <button class="btn-delete" onclick="removeItem('${lineId}', '${title.replace(/'/g, "\\'")}')">
                        <span class="delete-icon">🗑</span>
                    </button>
                </div>
            </div>
            <div class="basket-item-price">€${((price * item.quantity) / 100).toFixed(2)}</div>
        </div>
        `;
    }).join('');

    // Calculate total
    const total = data.items.reduce((sum, item) => {
        const price = item.details?.price?.price || 0;
        return sum + (price * item.quantity);
    }, 0);

    basketContent.innerHTML = `
        ${itemsHTML}
        <div class="basket-total">
            <strong>Total Items:</strong> ${data.itemCount}<br>
            <strong>Total Price:</strong> €${(total / 100).toFixed(2)}
        </div>
    `;
}

// =====================
// Helper Functions
// =====================
window.adjustProductQty = function(sku, delta) {
    const qtyInput = document.getElementById(`qty-${sku}`);
    if (qtyInput) {
        const currentQty = parseInt(qtyInput.value) || 1;
        const newQty = Math.max(1, Math.min(99, currentQty + delta));
        qtyInput.value = newQty;
    }
};

window.addToBasketFromUI = function(sku, title) {
    const qtyInput = document.getElementById(`qty-${sku}`);
    const quantity = qtyInput ? parseInt(qtyInput.value) : 1;
    addToBasket(sku, quantity, title);
};

window.updateQuantity = async function(sku, currentQuantity, delta) {
    const newQuantity = currentQuantity + delta;

    if (newQuantity < 1) {
        showToast('Gebruik de prullenbak om items te verwijderen', 'info', 3000);
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/basket/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku, quantity: delta })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Aantal aangepast', 'success', 2000);
            displayBasket(data);
            updateBasketCount(data.itemCount || 0);
        } else {
            showToast(data.message || 'Kon aantal niet aanpassen', 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
};

window.setQuantity = async function(sku, currentQuantity, newValue) {
    const newQuantity = parseInt(newValue);

    // Validate input
    if (isNaN(newQuantity) || newQuantity < 1) {
        showToast('Gebruik de prullenbak om items te verwijderen', 'info', 3000);
        // Refresh basket to reset the input
        viewBasket();
        return;
    }

    // Calculate delta
    const delta = newQuantity - currentQuantity;

    if (delta === 0) {
        return; // No change
    }

    try {
        const response = await fetch(`${API_BASE_URL}/basket/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku, quantity: delta })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Aantal aangepast', 'success', 2000);
            displayBasket(data);
            updateBasketCount(data.itemCount || 0);
        } else {
            showToast(data.message || 'Kon aantal niet aanpassen', 'error');
            viewBasket(); // Refresh to reset
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
        viewBasket(); // Refresh to reset
    }
};

window.removeItem = async function(lineId, title) {
    try {
        const response = await fetch(`${API_BASE_URL}/basket/remove`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lineId })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Product verwijderd', 'success', 2000);
            displayBasket(data);
            updateBasketCount(data.itemCount || 0);
        } else {
            showToast(data.message || 'Kon product niet verwijderen', 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
};

// =====================
// Event Listeners
// =====================
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;
    login(username, password, remember);
});

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = document.getElementById('search-input').value;
    if (query.trim()) {
        searchProducts(query);
    }
});

viewBasketBtn.addEventListener('click', () => {
    viewBasket();
});

closeBasketBtn.addEventListener('click', () => {
    closeBasketSidebar();
});

basketOverlay.addEventListener('click', () => {
    closeBasketSidebar();
});

// Close sidebar on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && basketSidebar.classList.contains('active')) {
        closeBasketSidebar();
    }
});

logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        logout();
    }
});

// =====================
// Initialize App
// =====================
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
});
