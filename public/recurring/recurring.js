let allItems = [];
let allMappings = [];
let selectedMappingId = null;


function updateTotalDisplay() {
    const el = document.getElementById('total-display');
    const qty = parseInt(document.getElementById('item-quantity').value) || 0;
    const rate = document.getElementById('item-rate').value;
    const mapping = allMappings.find(m => m.id === selectedMappingId);

    if (!mapping || !mapping.package_amount || !mapping.package_unit || qty < 1) {
        el.textContent = '';
        return;
    }

    // Calculate per-week amount
    const rateDivisor = rate === 'biweekly' ? 2 : rate === 'monthly' ? 4 : 1;
    const weeklyQty = qty / rateDivisor;
    const weeklyTotal = weeklyQty * mapping.package_amount;

    el.textContent = `${formatTotalValue(weeklyTotal, mapping.package_unit)} / week`;
}

function formatTotalValue(total, pkgUnit) {
    const unit = pkgUnit.toLowerCase().trim();

    if ((unit === 'g' || unit === 'gram') && total >= 1000) {
        const v = total / 1000;
        return `${v % 1 === 0 ? v : v.toFixed(1)} kg`;
    }
    if (unit === 'g' || unit === 'gram') return `${round(total)} g`;

    if ((unit === 'ml' || unit === 'milliliter') && total >= 1000) {
        const v = total / 1000;
        return `${v % 1 === 0 ? v : v.toFixed(1)} L`;
    }
    if (unit === 'ml' || unit === 'milliliter') return `${round(total)} ml`;

    if (unit === 'kg' || unit === 'kilogram') return `${round(total)} kg`;
    if (unit === 'l' || unit === 'liter') return `${round(total)} L`;

    if (unit === 'stuk' || unit === 'stuks' || unit === 'st') {
        return `${round(total)} ${total === 1 ? 'stuk' : 'stuks'}`;
    }

    return `${round(total)} ${pkgUnit}`;
}

function round(v) {
    return v % 1 === 0 ? v : parseFloat(v.toFixed(1));
}

document.addEventListener('DOMContentLoaded', () => {
    loadHeader();
    loadMappings();
    loadItems();

    // Autocomplete on typing
    const mappingSearch = document.getElementById('mapping-search');
    mappingSearch.addEventListener('input', onSearchInput);
    mappingSearch.addEventListener('focus', onSearchInput);
    mappingSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const listEl = document.getElementById('autocomplete-list');
            const topOption = listEl?.querySelector('.autocomplete-option');
            if (topOption && !listEl.classList.contains('hidden')) {
                e.preventDefault();
                selectMapping(parseInt(topOption.dataset.id));
                document.getElementById('item-name').focus();
            }
        }
    });

    // Close autocomplete on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            document.getElementById('autocomplete-list').classList.add('hidden');
        }
    });

    // Submit recurring form on Enter from form fields
    ['item-quantity', 'item-rate', 'item-category'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveItem(); }
        });
    });
});

async function loadMappings() {
    try {
        const res = await fetch(`${API_BASE}/recurring/mappings`);
        const data = await res.json();
        if (data.success) allMappings = data.mappings;
    } catch (err) { /* silent */ }
}

async function loadItems() {
    try {
        const res = await fetch(`${API_BASE}/recurring?all=1`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        allItems = data.items;
        renderItems();
    } catch (err) {
        showToast('Fout bij laden: ' + err.message, 'error');
    }
}

function renderItems() {
    const list = document.getElementById('items-list');
    const empty = document.getElementById('empty-state');

    if (allItems.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');

    // Group by category
    const groups = {};
    for (const item of allItems) {
        const cat = item.category || 'Overig';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    }

    const rateLabels = { weekly: 'Wekelijks', biweekly: 'Om de week', monthly: 'Maandelijks' };

    let html = '';
    for (const [category, items] of Object.entries(groups)) {
        html += `<div class="category-group">`;
        html += `<div class="category-title">${category}</div>`;
        for (const item of items) {
            const disabledClass = item.enabled ? '' : ' disabled';
            const img = item.product_details?.image
                ? `<img class="item-image" src="${item.product_details.image}" alt="">`
                : `<div class="item-image-placeholder">&#128722;</div>`;

            const productTitle = item.product_details?.title || item.ingredient_name || '';
            const rateDivisor = item.occurrence_rate === 'biweekly' ? 2 : item.occurrence_rate === 'monthly' ? 4 : 1;
            const weeklyPerUnit = item.quantity / rateDivisor;
            const weeklyStr = item.package_amount && item.package_unit
                ? formatTotalValue(weeklyPerUnit * item.package_amount, item.package_unit) + ' / week'
                : '';

            const unlinkedBadge = !item.mapping_id
                ? `<span class="item-badge badge-unlinked">Niet gekoppeld</span>` : '';

            html += `
                <div class="recurring-item${disabledClass}" data-id="${item.id}">
                    ${img}
                    <div class="item-info">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-product">${productTitle}</div>
                        <div class="item-meta">${rateLabels[item.occurrence_rate] || item.occurrence_rate}${weeklyStr ? ` &middot; ${weeklyStr}` : ''}</div>
                    </div>
                    <div class="item-badges">
                        <span class="item-badge badge-quantity">${item.quantity}x</span>
                        ${unlinkedBadge}
                    </div>
                    <div class="item-actions">
                        <button class="btn-icon" onclick="toggleItem(${item.id})" title="${item.enabled ? 'Uitschakelen' : 'Inschakelen'}">
                            ${item.enabled ? '&#10003;' : '&#9675;'}
                        </button>
                        <button class="btn-icon" onclick="editItem(${item.id})" title="Bewerken">&#9998;</button>
                        <button class="btn-icon danger" onclick="deleteItem(${item.id})" title="Verwijderen">&#128465;</button>
                    </div>
                </div>`;
        }
        html += `</div>`;
    }

    list.innerHTML = html;
}

// =====================
// Autocomplete
// =====================
function onSearchInput() {
    const query = document.getElementById('mapping-search').value.toLowerCase().trim();
    const listEl = document.getElementById('autocomplete-list');

    if (!query) {
        // Show all mappings when focused with empty input
        renderAutocomplete(allMappings.slice(0, 15));
        return;
    }

    const filtered = allMappings.filter(m => {
        const name = (m.ingredient_name || '').toLowerCase();
        const title = (m.product_details?.title || '').toLowerCase();
        return name.includes(query) || title.includes(query);
    }).slice(0, 15);

    renderAutocomplete(filtered);
}

function renderAutocomplete(mappings) {
    const listEl = document.getElementById('autocomplete-list');

    if (mappings.length === 0) {
        listEl.innerHTML = '<div class="autocomplete-empty">Geen koppelingen gevonden</div>';
        listEl.classList.remove('hidden');
        return;
    }

    listEl.innerHTML = mappings.map(m => {
        const details = m.product_details || {};
        const pkg = m.package_amount && m.package_unit ? ` (${m.package_amount} ${m.package_unit})` : '';
        const price = details.price ? `\u20AC${(details.price / 100).toFixed(2)}` : '';

        return `
        <div class="autocomplete-option" data-id="${m.id}">
            ${details.image ? `<img src="${details.image}" alt="">` : '<div class="autocomplete-img-placeholder"></div>'}
            <div class="autocomplete-option-info">
                <div class="autocomplete-option-name">${m.ingredient_name}</div>
                <div class="autocomplete-option-product">${details.title || m.jumbo_sku}${pkg} ${price}</div>
            </div>
        </div>`;
    }).join('');

    listEl.classList.remove('hidden');

    // Attach click handlers
    listEl.querySelectorAll('.autocomplete-option').forEach(el => {
        el.addEventListener('click', () => selectMapping(parseInt(el.dataset.id)));
    });
}

function selectMapping(mappingId) {
    const mapping = allMappings.find(m => m.id === mappingId);
    if (!mapping) return;

    selectedMappingId = mappingId;
    document.getElementById('selected-mapping-id').value = mappingId;
    document.getElementById('autocomplete-list').classList.add('hidden');
    document.getElementById('mapping-search').value = '';

    const details = mapping.product_details || {};
    const pkg = mapping.package_amount && mapping.package_unit ? `${mapping.package_amount} ${mapping.package_unit}` : '';

    const el = document.getElementById('selected-mapping');
    el.innerHTML = `
        ${details.image ? `<img src="${details.image}" alt="">` : ''}
        <div class="selected-mapping-info">
            <div class="selected-mapping-name">${mapping.ingredient_name}</div>
            <div class="selected-mapping-product">${details.title || mapping.jumbo_sku}${pkg ? ` - ${pkg}` : ''}</div>
        </div>
        <button class="btn-icon danger" onclick="clearMapping()" title="Verwijderen">&#10005;</button>
    `;
    el.classList.remove('hidden');
    updateTotalDisplay();
}

function clearMapping() {
    selectedMappingId = null;
    document.getElementById('selected-mapping-id').value = '';
    document.getElementById('selected-mapping').classList.add('hidden');
    document.getElementById('selected-mapping').innerHTML = '';
    updateTotalDisplay();
}

// =====================
// CRUD
// =====================
function openItemForm(item = null) {
    const modal = document.getElementById('item-modal');
    const title = document.getElementById('modal-title');

    document.getElementById('edit-id').value = item ? item.id : '';
    document.getElementById('item-quantity').value = item ? item.quantity : 1;
    document.getElementById('item-rate').value = item ? item.occurrence_rate : 'weekly';
    document.getElementById('item-category').value = item ? (item.category || '') : '';
    document.getElementById('mapping-search').value = '';

    // Reset mapping selection
    clearMapping();

    if (item && item.mapping_id) {
        selectMapping(item.mapping_id);
    }

    title.textContent = item ? 'Item bewerken' : 'Item toevoegen';
    modal.classList.add('active');
    updateTotalDisplay();
}

function closeItemForm() {
    document.getElementById('item-modal').classList.remove('active');
}

function editItem(id) {
    const item = allItems.find(i => i.id === id);
    if (item) openItemForm(item);
}

async function saveItem() {
    const id = document.getElementById('edit-id').value;
    const mappingId = parseInt(document.getElementById('selected-mapping-id').value);

    if (!mappingId) return showToast('Selecteer een product uit de koppelingen', 'error');

    // Use mapping's ingredient_name as item_name
    const mapping = allMappings.find(m => m.id === mappingId);
    const itemName = mapping?.product_details?.title || mapping?.ingredient_name || 'Onbekend';

    const body = {
        item_name: itemName,
        quantity: parseInt(document.getElementById('item-quantity').value) || 1,
        occurrence_rate: document.getElementById('item-rate').value,
        category: document.getElementById('item-category').value || null,
        mapping_id: mappingId
    };

    try {
        const url = id ? `${API_BASE}/recurring/${id}` : `${API_BASE}/recurring`;
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(id ? 'Item bijgewerkt' : 'Item toegevoegd', 'success');
        closeItemForm();
        loadItems();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleItem(id) {
    try {
        const res = await fetch(`${API_BASE}/recurring/${id}/toggle`, { method: 'PATCH' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        loadItems();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteItem(id) {
    const item = allItems.find(i => i.id === id);
    if (!confirm(`'${item?.item_name}' verwijderen?`)) return;

    try {
        const res = await fetch(`${API_BASE}/recurring/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        showToast('Verwijderd', 'success');
        loadItems();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
