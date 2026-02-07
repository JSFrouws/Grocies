// Store page logic
const loginSection = document.getElementById('login-section');
const storeSection = document.getElementById('store-section');
const loginForm = document.getElementById('login-form');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const productsGrid = document.getElementById('products-grid');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const loginBtn = document.getElementById('login-btn');

// Check auth status on load
async function checkAuth() {
    try {
        const data = await apiRequest('/auth/status');
        if (data.isLoggedIn || data.isAuthenticated) {
            showStoreSection(data.username || data.user?.email || '');
        } else {
            showLoginSection();
        }
    } catch (e) {
        showLoginSection();
    }
}

function showLoginSection() {
    loginSection.classList.remove('hidden');
    storeSection.classList.add('hidden');
}

function showStoreSection(email) {
    loginSection.classList.add('hidden');
    storeSection.classList.remove('hidden');
    if (userInfo) userInfo.textContent = email ? `Logged in as ${email}` : '';
}

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;

    loginBtn.disabled = true;
    loginBtn.querySelector('.spinner').classList.remove('hidden');
    loginBtn.querySelector('.btn-text').textContent = 'Logging in...';
    showLoading('Logging in via browser... This may take a moment');

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password, remember })
        });

        hideLoading();
        if (data.success) {
            showToast('Login successful!', 'success');
            showStoreSection(username);
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        hideLoading();
        // apiRequest already shows toast
    } finally {
        loginBtn.disabled = false;
        loginBtn.querySelector('.spinner').classList.add('hidden');
        loginBtn.querySelector('.btn-text').textContent = 'Login';
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to logout?')) return;
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
        showToast('Logged out', 'success');
        showLoginSection();
    } catch (e) { /* handled */ }
});

// Search
async function searchProducts(query) {
    if (!query.trim()) return;
    showToast('Searching...', 'info', 2000);

    try {
        const data = await apiRequest(`/store/search?q=${encodeURIComponent(query)}&limit=20`);
        if (data.success) {
            displayProducts(data.products);
            showToast(`${data.products.length} products found`, 'success', 2000);
        }
    } catch (e) { /* handled */ }
}

searchBtn.addEventListener('click', () => searchProducts(searchInput.value));
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchProducts(searchInput.value);
    }
});

// Display products
function displayProducts(products) {
    if (!products || products.length === 0) {
        productsGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128269;</div><p>No products found</p></div>';
        return;
    }

    productsGrid.innerHTML = products.map(p => `
        <div class="product-card">
            ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.title)}" class="product-image">` : '<div class="product-image" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted)">No Image</div>'}
            <div class="product-title">${escapeHtml(p.title)}</div>
            <div class="product-price">\u20AC${(p.price / 100).toFixed(2)}</div>
            <div class="product-sku">SKU: ${p.sku}</div>
            <div class="product-actions">
                <div class="quantity-controls">
                    <button class="qty-btn" onclick="adjustQty('${p.sku}', -1)">\u2212</button>
                    <input type="number" class="qty-input" value="1" min="1" max="99" id="qty-${p.sku}">
                    <button class="qty-btn" onclick="adjustQty('${p.sku}', 1)">+</button>
                </div>
                <button class="btn btn-primary btn-small" onclick="addProductToBasket('${p.sku}', '${escapeHtml(p.title).replace(/'/g, "\\'")}')">Add</button>
            </div>
        </div>
    `).join('');
}

// Quantity helpers
window.adjustQty = function(sku, delta) {
    const input = document.getElementById(`qty-${sku}`);
    if (input) {
        input.value = Math.max(1, Math.min(99, parseInt(input.value || 1) + delta));
    }
};

window.addProductToBasket = async function(sku, title) {
    const input = document.getElementById(`qty-${sku}`);
    const quantity = input ? parseInt(input.value) : 1;

    try {
        const data = await apiRequest('/store/basket/add', {
            method: 'POST',
            body: JSON.stringify({ sku, quantity })
        });
        if (data.success) {
            showToast(`${quantity}x "${title}" added to basket`, 'success');
            updateBasketBadge(data.itemCount || 0);
        }
    } catch (e) { /* handled */ }
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadHeader('store');
    checkAuth();
});
