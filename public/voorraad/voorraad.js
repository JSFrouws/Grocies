// Voorraad (Stock/Inventory) page logic

document.addEventListener('DOMContentLoaded', async () => {
    await loadHeader('voorraad');
    loadStock();
});

async function loadStock() {
    try {
        const data = await apiRequest('/stock');
        renderStock(data.items || []);
        checkExpired();
    } catch (e) { /* handled */ }
}

function renderStock(items) {
    const list = document.getElementById('stock-list');
    const empty = document.getElementById('empty-state');

    if (items.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');

    // Group by ingredient name
    const groups = {};
    for (const item of items) {
        const key = item.ingredient_name;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    }

    let html = '';
    for (const [name, groupItems] of Object.entries(groups)) {
        html += `<div class="stock-group">`;
        html += `<div class="stock-group-header">${escapeHtml(name)}</div>`;
        for (const item of groupItems) {
            const statusClass = item.isExpired ? 'expired' : (item.isWarning ? 'warning' : '');
            const expiryClass = item.isExpired ? 'expired' : (item.isWarning ? 'warning' : '');

            let expiryText = '';
            if (item.expiry_date) {
                if (item.isExpired) {
                    expiryText = `Verlopen (${Math.abs(item.daysLeft)} dagen geleden)`;
                } else if (item.daysLeft === 0) {
                    expiryText = 'Verloopt vandaag!';
                } else if (item.daysLeft === 1) {
                    expiryText = 'Verloopt morgen';
                } else {
                    expiryText = `Nog ${item.daysLeft} dagen`;
                }
            } else {
                expiryText = 'Geen vervaldatum';
            }

            html += `
            <div class="stock-item ${statusClass}">
                <div class="stock-item-info">
                    <div class="stock-item-name">${escapeHtml(item.ingredient_name)}</div>
                    <div class="stock-item-qty">${item.quantity_remaining} ${escapeHtml(item.unit)}</div>
                </div>
                <div class="stock-item-expiry ${expiryClass}">${expiryText}</div>
                <div class="stock-item-actions">
                    <button class="btn btn-secondary btn-small" onclick="editQuantity(${item.id}, ${item.quantity_remaining}, '${escapeHtml(item.unit)}')">Aanpassen</button>
                    ${item.isExpired ? `<button class="btn-gft" onclick="discardItem(${item.id}, '${escapeHtml(item.ingredient_name)}')">GFT!</button>` : ''}
                </div>
            </div>`;
        }
        html += `</div>`;
    }

    list.innerHTML = html;
}

async function checkExpired() {
    try {
        const data = await apiRequest('/stock/expired');
        const alert = document.getElementById('expired-alert');
        const count = document.getElementById('expired-count');
        if (data.items && data.items.length > 0) {
            count.textContent = `${data.items.length} verlopen item(s) in je voorraad`;
            alert.classList.remove('hidden');
        } else {
            alert.classList.add('hidden');
        }
    } catch (e) { /* handled */ }
}

function openAddStock() {
    document.getElementById('stock-ingredient').value = '';
    document.getElementById('stock-quantity').value = '';
    document.getElementById('stock-unit').value = '';
    document.getElementById('stock-shelf-life').value = '';
    openModal('add-stock-modal');
}

async function saveStock() {
    const ingredient_name = document.getElementById('stock-ingredient').value.trim();
    const quantity_remaining = document.getElementById('stock-quantity').value;
    const unit = document.getElementById('stock-unit').value.trim();
    const shelf_life_days = document.getElementById('stock-shelf-life').value;

    if (!ingredient_name || !quantity_remaining || !unit) {
        showToast('Vul alle verplichte velden in', 'error');
        return;
    }

    try {
        await apiRequest('/stock', {
            method: 'POST',
            body: JSON.stringify({
                ingredient_name,
                quantity_remaining: parseFloat(quantity_remaining),
                unit,
                shelf_life_days: shelf_life_days ? parseInt(shelf_life_days) : null
            })
        });
        closeModal('add-stock-modal');
        showToast('Voorraad toegevoegd', 'success');
        loadStock();
    } catch (e) { /* handled */ }
}

function editQuantity(id, currentQty, unit) {
    document.getElementById('edit-stock-id').value = id;
    document.getElementById('edit-qty-value').value = currentQty;
    document.getElementById('edit-qty-label').textContent = `Resterende hoeveelheid (${unit})`;
    openModal('edit-qty-modal');
}

async function updateQuantity() {
    const id = document.getElementById('edit-stock-id').value;
    const quantity = document.getElementById('edit-qty-value').value;

    if (!quantity || parseFloat(quantity) < 0) {
        showToast('Ongeldige hoeveelheid', 'error');
        return;
    }

    try {
        await apiRequest(`/stock/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity_remaining: parseFloat(quantity) })
        });
        closeModal('edit-qty-modal');
        showToast('Hoeveelheid bijgewerkt', 'success');
        loadStock();
    } catch (e) { /* handled */ }
}

async function discardItem(id, name) {
    if (!confirm(`"${name}" bij het GFT doen?`)) return;

    try {
        await apiRequest(`/stock/${id}`, { method: 'DELETE' });
        showToast('Item bij GFT gedaan', 'success');
        loadStock();
    } catch (e) { /* handled */ }
}

function showExpired() {
    // Scroll to first expired item or show message
    const expiredItems = document.querySelectorAll('.stock-item.expired');
    if (expiredItems.length > 0) {
        expiredItems[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        showToast('Geen verlopen items', 'info');
    }
}
