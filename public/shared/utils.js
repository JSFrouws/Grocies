// =====================
// Grocies Shared Utilities
// =====================

const API_BASE = '/api';

// =====================
// Toast Notification System
// =====================
function showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '\u2713', error: '\u2715', info: '\u2139' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">\u2715</button>
    `;

    container.appendChild(toast);

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
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner-large"></div>
            <div class="loading-text">${text}</div>
        `;
        document.body.appendChild(overlay);
    } else {
        const loadingText = overlay.querySelector('.loading-text');
        if (loadingText) loadingText.textContent = text;
    }
    overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
}

// =====================
// API Helper
// =====================
async function apiRequest(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    // Don't set Content-Type for FormData (multer)
    if (options.body instanceof FormData) {
        delete config.headers['Content-Type'];
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    } catch (error) {
        if (error.message !== 'Failed to fetch') {
            showToast(error.message, 'error');
        } else {
            showToast('Verbinding mislukt. Draait de server?', 'error');
        }
        throw error;
    }
}

// =====================
// Basket Sidebar
// =====================
function openBasketSidebar() {
    const sidebar = document.getElementById('basket-sidebar');
    const overlay = document.getElementById('basket-overlay');
    if (sidebar) sidebar.classList.add('active');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeBasketSidebar() {
    const sidebar = document.getElementById('basket-sidebar');
    const overlay = document.getElementById('basket-overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// =====================
// Modal Helpers
// =====================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// =====================
// Header Loader
// =====================
async function loadHeader(currentPage) {
    try {
        const response = await fetch('/shared/header.html');
        const html = await response.text();

        // Insert header and basket sidebar at the top of body
        const headerContainer = document.createElement('div');
        headerContainer.innerHTML = html;
        const firstChild = document.body.firstChild;
        while (headerContainer.firstElementChild) {
            document.body.insertBefore(headerContainer.firstElementChild, firstChild);
        }

        // Set active nav link
        const navLinks = document.querySelectorAll('.main-header nav a');
        navLinks.forEach(link => {
            if (link.getAttribute('href').includes(currentPage)) {
                link.classList.add('active');
            }
        });

        // Setup basket button
        const basketBtn = document.getElementById('basket-btn');
        if (basketBtn) {
            basketBtn.addEventListener('click', () => viewBasket());
        }

        // Setup close basket
        const closeBtn = document.getElementById('close-basket-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeBasketSidebar);

        const basketOverlay = document.getElementById('basket-overlay');
        if (basketOverlay) basketOverlay.addEventListener('click', closeBasketSidebar);

        // Setup close auth sidebar
        const closeAuthBtn = document.getElementById('close-auth-btn');
        if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeAuthSidebar);

        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) authOverlay.addEventListener('click', closeAuthSidebar);

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeBasketSidebar();
                closeAuthSidebar();
                document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            }
        });

        // Update queue count badge
        updateQueueBadge();

        // Kick off background session check — non-blocking
        checkAndEnsureSession();

    } catch (error) {
        console.error('Failed to load header:', error);
    }
}

// =====================
// Badge Updates
// =====================
async function updateQueueBadge() {
    try {
        const data = await apiRequest('/queue');
        const badge = document.getElementById('queue-count');
        if (badge) {
            badge.textContent = data.count || 0;
            badge.classList.toggle('hidden', !data.count);
        }
    } catch (e) {
        // Silently fail - badge is not critical
    }
}

async function updateBasketBadge(count) {
    const badge = document.getElementById('basket-count');
    if (badge) {
        badge.textContent = count || 0;
        badge.classList.toggle('hidden', !count);
    }
}

// =====================
// Basket Functions (shared across pages)
// =====================
async function viewBasket() {
    openBasketSidebar();
    const content = document.getElementById('basket-content');
    if (content) {
        content.innerHTML = '<div class="basket-loading"><div class="spinner"></div> Mandje laden...</div>';
    }

    try {
        const data = await apiRequest('/store/basket');
        displayBasket(data);
        updateBasketBadge(data.itemCount || 0);
    } catch (error) {
        if (content) {
            content.innerHTML = '<p class="basket-empty">Kon mandje niet laden. Ben je ingelogd?</p>';
        }
    }
}

function displayBasket(data) {
    const content = document.getElementById('basket-content');
    if (!content) return;

    if (!data || !data.items || data.items.length === 0) {
        content.innerHTML = '<p class="basket-empty">Je mandje is leeg</p>';
        return;
    }

    const itemsHTML = data.items.map(item => {
        const details = item.details || {};
        const price = details.price?.price || 0;
        const title = details.title || item.sku;
        const image = details.image || '';

        return `
        <div class="basket-item">
            ${image ? `<img src="${image}" alt="${title}" class="basket-item-image">` : ''}
            <div class="basket-item-info">
                <div class="basket-item-title">${title}</div>
                <div class="basket-item-details">${details.brand || ''}</div>
                <div class="basket-item-controls" style="display:flex;gap:10px;align-items:center;margin-top:8px;">
                    <div class="quantity-controls">
                        <button class="qty-btn" onclick="updateBasketQty('${item.sku}', ${item.quantity}, -1)">\u2212</button>
                        <input type="number" class="qty-input" value="${item.quantity}" min="1" max="99"
                               onchange="setBasketQty('${item.sku}', ${item.quantity}, this.value)">
                        <button class="qty-btn" onclick="updateBasketQty('${item.sku}', ${item.quantity}, 1)">+</button>
                    </div>
                    <button class="btn-icon" style="border-color:var(--error);color:var(--error)"
                            onclick="removeBasketItem('${item.id}', '${title.replace(/'/g, "\\'")}')">
                        \uD83D\uDDD1
                    </button>
                </div>
            </div>
            <div class="basket-item-price">\u20AC${((price * item.quantity) / 100).toFixed(2)}</div>
        </div>`;
    }).join('');

    const total = data.items.reduce((sum, item) => {
        return sum + ((item.details?.price?.price || 0) * item.quantity);
    }, 0);

    content.innerHTML = `
        ${itemsHTML}
        <div class="basket-total">
            <strong>Artikelen:</strong> ${data.itemCount}<br>
            <strong>Totaal:</strong> \u20AC${(total / 100).toFixed(2)}
        </div>
    `;
}

window.updateBasketQty = async function(sku, currentQty, delta) {
    const newQty = currentQty + delta;
    if (newQty < 1) return;
    try {
        const data = await apiRequest('/store/basket/update', {
            method: 'PUT',
            body: JSON.stringify({ sku, quantity: delta })
        });
        if (data.success) {
            displayBasket(data);
            updateBasketBadge(data.itemCount || 0);
        }
    } catch (e) { /* handled by apiRequest */ }
};

window.setBasketQty = async function(sku, currentQty, newValue) {
    const newQty = parseInt(newValue);
    if (isNaN(newQty) || newQty < 1) { viewBasket(); return; }
    const delta = newQty - currentQty;
    if (delta === 0) return;
    try {
        const data = await apiRequest('/store/basket/update', {
            method: 'PUT',
            body: JSON.stringify({ sku, quantity: delta })
        });
        if (data.success) {
            displayBasket(data);
            updateBasketBadge(data.itemCount || 0);
        }
    } catch (e) { viewBasket(); }
};

window.removeBasketItem = async function(lineId, title) {
    try {
        const data = await apiRequest('/store/basket/remove', {
            method: 'DELETE',
            body: JSON.stringify({ lineId })
        });
        if (data.success) {
            showToast('Item verwijderd', 'success', 2000);
            displayBasket(data);
            updateBasketBadge(data.itemCount || 0);
        }
    } catch (e) { /* handled */ }
};

// =====================
// Utility Functions
// =====================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTime(minutes) {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// =====================
// Auth / Connection Sidebar
// =====================

function openAuthSidebar() {
    const sidebar = document.getElementById('auth-sidebar');
    const overlay = document.getElementById('auth-overlay');
    if (sidebar) sidebar.classList.add('active');
    if (overlay) overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    // Refresh status display when sidebar opens
    refreshAuthSidebarDisplay();
}

function closeAuthSidebar() {
    const sidebar = document.getElementById('auth-sidebar');
    const overlay = document.getElementById('auth-overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// dot states: 'ok' | 'stale' | 'offline' | 'checking'
function setAuthDot(state, label) {
    const dotIds = ['auth-dot', 'auth-sidebar-dot'];
    const states = { ok: 'auth-dot--ok', stale: 'auth-dot--stale', offline: 'auth-dot--offline', checking: 'auth-dot--checking' };
    dotIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'auth-dot ' + (states[state] || states.checking);
    });
    const labelEl = document.getElementById('auth-dot-label');
    if (labelEl) labelEl.textContent = label || '';
    const sidebarText = document.getElementById('auth-sidebar-status-text');
    if (sidebarText) sidebarText.textContent = label || '';
}

function refreshAuthSidebarDisplay(status) {
    // status is the last known /api/auth/status response object (optional)
    const loginSection = document.getElementById('auth-login-section');
    const loggedinSection = document.getElementById('auth-loggedin-section');
    const reloginSection = document.getElementById('auth-relogin-section');
    const userEl = document.getElementById('auth-sidebar-user');
    const ageEl = document.getElementById('auth-sidebar-age');

    if (!loginSection) return; // sidebar not in DOM yet

    if (!status) {
        // No info yet — hide everything
        if (loginSection) loginSection.style.display = 'none';
        if (loggedinSection) loggedinSection.style.display = 'none';
        if (reloginSection) reloginSection.style.display = 'none';
        return;
    }

    if (status._relogining) {
        loginSection.style.display = 'none';
        loggedinSection.style.display = 'none';
        reloginSection.style.display = 'block';
        return;
    }

    reloginSection.style.display = 'none';

    if (status.isAuthenticated) {
        loginSection.style.display = 'none';
        loggedinSection.style.display = 'block';
        if (userEl) userEl.textContent = status.username ? `Ingelogd als ${status.username}` : 'Ingelogd';
        if (ageEl && status.sessionAge != null) {
            const mins = Math.round(status.sessionAge / 60000);
            const freshFor = status.sessionTTL ? Math.round((status.sessionTTL - status.sessionAge) / 60000) : null;
            ageEl.textContent = `Sessie gevalideerd ${mins} minuten geleden` +
                (freshFor != null && freshFor > 0 ? ` · volgende check over ~${freshFor} min` : '');
        } else if (ageEl) {
            ageEl.textContent = '';
        }
    } else {
        loginSection.style.display = 'block';
        loggedinSection.style.display = 'none';
        if (userEl) userEl.textContent = '';
        if (ageEl) ageEl.textContent = '';
    }
}

// Main session health routine — called once per page load from loadHeader().
// 1. GET /api/auth/status (fast, no Jumbo call)
// 2. If not healthy → try background re-login
// 3. Update the status dot accordingly
async function checkAndEnsureSession() {
    setAuthDot('checking', '...');
    let status;
    try {
        status = await fetch('/api/auth/status').then(r => r.json());
    } catch (e) {
        setAuthDot('offline', 'Geen server');
        return;
    }

    refreshAuthSidebarDisplay(status);

    if (status.isAuthenticated && status.sessionHealthy) {
        setAuthDot('ok', status.username || 'Verbonden');
        return;
    }

    if (status.isAuthenticated && !status.sessionHealthy) {
        // Cookies loaded but TTL expired — re-authenticate in background
        setAuthDot('stale', 'Sessie verloopt...');
    } else {
        // Not authenticated
        if (!status.hasSavedCredentials) {
            setAuthDot('offline', 'Niet ingelogd');
            refreshAuthSidebarDisplay(status);
            return;
        }
        setAuthDot('stale', 'Herverbinden...');
    }

    // Attempt silent re-login
    refreshAuthSidebarDisplay({ ...status, _relogining: true });
    try {
        const result = await fetch('/api/auth/relogin', { method: 'POST' }).then(r => r.json());
        if (result.success) {
            const fresh = await fetch('/api/auth/status').then(r => r.json());
            setAuthDot('ok', fresh.username || 'Verbonden');
            refreshAuthSidebarDisplay(fresh);
        } else {
            setAuthDot('offline', 'Niet ingelogd');
            refreshAuthSidebarDisplay({ ...status, isAuthenticated: false });
        }
    } catch (e) {
        setAuthDot('offline', 'Herverbinden mislukt');
    }
}

// Login form submit
window.doJumboLogin = async function() {
    const email = document.getElementById('auth-email')?.value?.trim();
    const password = document.getElementById('auth-password')?.value;
    const errEl = document.getElementById('auth-login-error');
    const btn = document.getElementById('auth-login-btn');
    if (!email || !password) {
        if (errEl) { errEl.textContent = 'Vul e-mail en wachtwoord in.'; errEl.style.display = 'block'; }
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Bezig met inloggen...'; }
    setAuthDot('checking', 'Inloggen...');
    if (errEl) errEl.style.display = 'none';
    try {
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, remember: true })
        });
        if (result.success) {
            if (document.getElementById('auth-password')) document.getElementById('auth-password').value = '';
            const fresh = await fetch('/api/auth/status').then(r => r.json());
            setAuthDot('ok', fresh.username || 'Verbonden');
            refreshAuthSidebarDisplay(fresh);
            showToast('Ingelogd bij Jumbo', 'success');
        }
    } catch (e) {
        setAuthDot('offline', 'Inloggen mislukt');
        if (errEl) { errEl.textContent = e.message || 'Inloggen mislukt'; errEl.style.display = 'block'; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Inloggen'; }
    }
};

// Logout
window.doJumboLogout = async function() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
        setAuthDot('offline', 'Niet ingelogd');
        const status = { isAuthenticated: false, hasSavedCredentials: false };
        refreshAuthSidebarDisplay(status);
        showToast('Uitgelogd', 'info', 2000);
    } catch (e) { /* handled by apiRequest */ }
};
