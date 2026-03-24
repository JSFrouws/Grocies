// Voorraad (Stock/Inventory) page logic

let mappedDefaults = []; // cached from /api/mappings/defaults
let selectedMapping = null; // currently selected mapping for add form

document.addEventListener('DOMContentLoaded', async () => {
    await loadHeader('voorraad');
    loadMappedDefaults();
    loadStock();
});

// Load mapped ingredient defaults for autocomplete
async function loadMappedDefaults() {
    try {
        const data = await apiRequest('/mappings/defaults');
        mappedDefaults = data.defaults || [];
    } catch (e) { /* handled */ }
}

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
        // Find preferred unit from mappings
        const mapping = mappedDefaults.find(m => m.ingredient_name === name);
        const prefUnit = mapping ? mapping.package_unit : null;

        html += `<div class="stock-group">`;
        html += `<div class="stock-group-header">${escapeHtml(name)}</div>`;
        for (const item of groupItems) {
            const statusClass = item.isExpired ? 'expired' : (item.isWarning ? 'warning' : '');
            const expiryClass = item.isExpired ? 'expired' : (item.isWarning ? 'warning' : '');

            // Format quantity using preferred unit
            let displayQty = item.quantity_remaining;
            let displayUnit = item.unit;
            if (prefUnit && typeof formatQty === 'function') {
                const fmt = formatQty(item.quantity_remaining, item.unit, prefUnit);
                displayQty = fmt.amount;
                displayUnit = fmt.unit;
            }

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
                    <div class="stock-item-qty">${displayQty} ${escapeHtml(displayUnit)}</div>
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

// =====================
// Add Stock Modal with autocomplete
// =====================
function openAddStock() {
    selectedMapping = null;
    document.getElementById('stock-ingredient').value = '';
    document.getElementById('stock-quantity').value = '';
    document.getElementById('stock-unit').value = '';
    document.getElementById('stock-shelf-life').value = '';
    document.getElementById('stock-ingredient-hint').classList.add('hidden');
    document.getElementById('stock-ingredient-info').classList.add('hidden');
    document.getElementById('stock-autocomplete').classList.add('hidden');
    document.getElementById('stock-save-btn').disabled = false;
    openModal('add-stock-modal');
}

// Setup autocomplete on ingredient input
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('stock-ingredient');
    const dropdown = document.getElementById('stock-autocomplete');
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        const hint = document.getElementById('stock-ingredient-hint');
        const info = document.getElementById('stock-ingredient-info');

        if (val.length < 1) {
            dropdown.classList.add('hidden');
            hint.classList.add('hidden');
            info.classList.add('hidden');
            selectedMapping = null;
            return;
        }

        const matches = mappedDefaults.filter(m =>
            m.ingredient_name.toLowerCase().includes(val)
        ).slice(0, 10);

        if (matches.length === 0) {
            dropdown.classList.add('hidden');
            // Show hint: ingredient not mapped
            hint.classList.remove('hidden');
            info.classList.add('hidden');
            selectedMapping = null;
            return;
        }

        hint.classList.add('hidden');
        dropdown.classList.remove('hidden');
        dropdown.innerHTML = matches.map(m => {
            const details = m.product_title ? ` <span class="text-muted">(${escapeHtml(m.product_title)})</span>` : '';
            const pkg = m.package_amount && m.package_unit ? ` - ${m.package_amount} ${m.package_unit}` : '';
            return `<div class="stock-autocomplete-item" data-name="${escapeHtml(m.ingredient_name)}">${escapeHtml(m.ingredient_name)}${details}${pkg}</div>`;
        }).join('');

        dropdown.querySelectorAll('.stock-autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectMappedIngredient(item.dataset.name);
            });
        });
    });

    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.add('hidden'), 200);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dropdown.classList.add('hidden');
        if (e.key === 'Enter') {
            const topItem = dropdown.querySelector('.stock-autocomplete-item');
            if (topItem && !dropdown.classList.contains('hidden')) {
                e.preventDefault();
                selectMappedIngredient(topItem.dataset.name);
                document.getElementById('stock-quantity').focus();
            }
        }
    });

    // Submit stock form on Enter from any field (except ingredient when dropdown is open)
    ['stock-quantity', 'stock-unit', 'stock-shelf-life'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveStock(); }
        });
    });

    // Submit edit-qty form on Enter
    const editQty = document.getElementById('edit-qty-value');
    if (editQty) editQty.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); updateQuantity(); }
    });
});

function selectMappedIngredient(name) {
    const mapping = mappedDefaults.find(m => m.ingredient_name === name);
    if (!mapping) return;

    selectedMapping = mapping;
    const input = document.getElementById('stock-ingredient');
    const dropdown = document.getElementById('stock-autocomplete');
    const hint = document.getElementById('stock-ingredient-hint');
    const info = document.getElementById('stock-ingredient-info');

    input.value = mapping.ingredient_name;
    dropdown.classList.add('hidden');
    hint.classList.add('hidden');

    // Auto-fill defaults from mapping
    if (mapping.package_amount) {
        document.getElementById('stock-quantity').value = mapping.package_amount;
    }
    if (mapping.package_unit) {
        document.getElementById('stock-unit').value = normalizeUnit(mapping.package_unit);
    }
    if (mapping.shelf_life_days) {
        document.getElementById('stock-shelf-life').value = mapping.shelf_life_days;
    }

    // Show info about selected product
    let infoHtml = `<strong>${escapeHtml(mapping.ingredient_name)}</strong>`;
    if (mapping.product_title) infoHtml += ` &rarr; ${escapeHtml(mapping.product_title)}`;
    if (mapping.package_amount && mapping.package_unit) {
        infoHtml += ` (${mapping.package_amount} ${escapeHtml(mapping.package_unit)})`;
    }
    info.innerHTML = infoHtml;
    info.classList.remove('hidden');
}

async function saveStock() {
    const ingredient_name = document.getElementById('stock-ingredient').value.trim();
    const quantity_remaining = document.getElementById('stock-quantity').value;
    const unit = document.getElementById('stock-unit').value;
    const shelf_life_days = document.getElementById('stock-shelf-life').value;

    if (!ingredient_name || !quantity_remaining || !unit) {
        showToast('Vul alle verplichte velden in', 'error');
        return;
    }

    // Validate: ingredient must be in mappings
    const isMapped = mappedDefaults.some(m => m.ingredient_name.toLowerCase() === ingredient_name.toLowerCase().trim());
    if (!isMapped) {
        showToast('Dit ingredi\u00EBnt is niet gekoppeld. Koppel het eerst in de Koppelingen tab.', 'error');
        document.getElementById('stock-ingredient-hint').classList.remove('hidden');
        return;
    }

    try {
        const mapping = mappedDefaults.find(m => m.ingredient_name.toLowerCase() === ingredient_name.toLowerCase().trim());
        await apiRequest('/stock', {
            method: 'POST',
            body: JSON.stringify({
                ingredient_name,
                quantity_remaining: parseFloat(quantity_remaining),
                unit,
                shelf_life_days: shelf_life_days ? parseInt(shelf_life_days) : null,
                jumbo_sku: mapping ? mapping.jumbo_sku : null
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
    const expiredItems = document.querySelectorAll('.stock-item.expired');
    if (expiredItems.length > 0) {
        expiredItems[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
        showToast('Geen verlopen items', 'info');
    }
}
