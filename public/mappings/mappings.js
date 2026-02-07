// Mappings page logic

// Load all mappings
async function loadMappings() {
    const search = document.getElementById('mapping-search').value;
    const params = search ? `?ingredient=${encodeURIComponent(search)}` : '';

    try {
        const data = await apiRequest(`/mappings${params}`);
        renderMappings(data.mappings || []);
    } catch (e) { /* handled */ }
}

function renderMappings(mappings) {
    const tbody = document.getElementById('mappings-body');

    if (mappings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">
                    No mappings yet. Create one to link ingredients to Jumbo products.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = mappings.map(m => {
        const details = m.product_details || {};
        return `
        <tr>
            <td><strong>${escapeHtml(m.ingredient_name)}</strong></td>
            <td>
                <div style="display:flex;align-items:center;gap:8px">
                    ${details.image ? `<img src="${details.image}" style="width:30px;height:30px;object-fit:contain;border-radius:4px">` : ''}
                    <span>${escapeHtml(details.title || m.jumbo_sku)}</span>
                </div>
            </td>
            <td class="text-muted">${escapeHtml(m.jumbo_sku)}</td>
            <td>${m.preferred ? '<span class="tag">Preferred</span>' : '<span class="tag tag-warning">Alt</span>'}</td>
            <td>
                <div style="display:flex;gap:6px">
                    <button class="btn btn-secondary btn-small" onclick="editMapping(${m.id})">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteMapping(${m.id})">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// Check unmapped ingredients
async function checkUnmapped() {
    try {
        const data = await apiRequest('/shopping-list/preview');
        const unmapped = data.shoppingList?.unmappedItems || [];
        const alert = document.getElementById('unmapped-alert');
        const countEl = document.getElementById('unmapped-count');

        if (unmapped.length > 0) {
            alert.classList.remove('hidden');
            countEl.innerHTML = `<span class="tag tag-warning">${unmapped.length} unmapped ingredient${unmapped.length > 1 ? 's' : ''} in queue</span>`;
        } else {
            alert.classList.add('hidden');
        }
    } catch (e) { /* handled silently */ }
}

function showUnmapped() {
    // Open mapping form - could be enhanced to step through unmapped ingredients
    openMappingForm();
}

// Filter
document.getElementById('mapping-search').addEventListener('input', debounce(loadMappings));

// =====================
// Mapping Form
// =====================
function openMappingForm(mapping = null) {
    document.getElementById('mapping-form-title').textContent = mapping ? 'Edit Mapping' : 'Create Mapping';
    document.getElementById('mapping-id').value = mapping ? mapping.id : '';
    document.getElementById('mapping-ingredient').value = mapping ? mapping.ingredient_name : '';
    document.getElementById('mapping-sku').value = mapping ? mapping.jumbo_sku : '';
    document.getElementById('mapping-product-id').value = mapping ? mapping.jumbo_product_id : '';
    document.getElementById('mapping-preferred').checked = mapping ? mapping.preferred : true;

    const selectedEl = document.getElementById('selected-product');
    if (mapping && mapping.product_details) {
        selectedEl.classList.remove('hidden');
        const details = mapping.product_details;
        document.getElementById('mapping-product-details').value = JSON.stringify(details);
        document.getElementById('selected-product-info').innerHTML = `
            <div style="display:flex;align-items:center;gap:12px">
                ${details.image ? `<img src="${details.image}" style="width:60px;height:60px;object-fit:contain;border-radius:6px">` : ''}
                <div>
                    <div style="font-weight:600">${escapeHtml(details.title || mapping.jumbo_sku)}</div>
                    ${details.price ? `<div style="color:var(--neon-green)">\u20AC${(details.price / 100).toFixed(2)}</div>` : ''}
                </div>
            </div>`;
    } else {
        selectedEl.classList.add('hidden');
    }

    document.getElementById('product-results').classList.add('hidden');
    openModal('mapping-form-modal');
}

// Search Jumbo products
async function searchJumboProducts() {
    const query = document.getElementById('product-search').value.trim();
    if (!query) return;

    const resultsEl = document.getElementById('product-results');
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = '<div class="basket-loading"><div class="spinner"></div> Searching...</div>';

    try {
        const data = await apiRequest(`/store/search?q=${encodeURIComponent(query)}&limit=10`);
        const products = data.products || [];

        if (products.length === 0) {
            resultsEl.innerHTML = '<p class="text-muted text-center" style="padding:20px">No products found</p>';
            return;
        }

        resultsEl.innerHTML = products.map(p => `
            <div class="product-result-item" onclick="selectProduct('${p.sku}', '${p.id}', ${JSON.stringify(JSON.stringify({title: p.title, price: p.price, image: p.image, brand: p.brand}))})">
                ${p.image ? `<img src="${p.image}" class="product-result-image">` : ''}
                <div class="product-result-info">
                    <div style="font-weight:600;font-size:13px">${escapeHtml(p.title)}</div>
                    <div style="color:var(--neon-green);font-weight:700">\u20AC${(p.price / 100).toFixed(2)}</div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        resultsEl.innerHTML = '<p class="text-muted text-center" style="padding:20px">Search failed. Are you logged in?</p>';
    }
}

document.getElementById('product-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchJumboProducts();
    }
});

// Select product from search results
window.selectProduct = function(sku, productId, detailsJson) {
    const details = JSON.parse(detailsJson);
    document.getElementById('mapping-sku').value = sku;
    document.getElementById('mapping-product-id').value = productId;
    document.getElementById('mapping-product-details').value = detailsJson;

    const selectedEl = document.getElementById('selected-product');
    selectedEl.classList.remove('hidden');
    document.getElementById('selected-product-info').innerHTML = `
        <div style="display:flex;align-items:center;gap:12px">
            ${details.image ? `<img src="${details.image}" style="width:60px;height:60px;object-fit:contain;border-radius:6px">` : ''}
            <div>
                <div style="font-weight:600">${escapeHtml(details.title)}</div>
                <div style="color:var(--neon-green)">\u20AC${(details.price / 100).toFixed(2)}</div>
                <div style="font-size:12px;color:var(--text-muted)">SKU: ${sku}</div>
            </div>
        </div>`;

    document.getElementById('product-results').classList.add('hidden');
    showToast('Product selected', 'success', 2000);
};

// Save mapping
async function saveMapping() {
    const id = document.getElementById('mapping-id').value;
    const ingredientName = document.getElementById('mapping-ingredient').value.trim();
    const sku = document.getElementById('mapping-sku').value;
    const productId = document.getElementById('mapping-product-id').value;
    const preferred = document.getElementById('mapping-preferred').checked;
    const detailsStr = document.getElementById('mapping-product-details').value;

    if (!ingredientName) {
        showToast('Ingredient name is required', 'error');
        return;
    }
    if (!sku) {
        showToast('Select a Jumbo product first', 'error');
        return;
    }

    const mappingData = {
        ingredient_name: ingredientName,
        jumbo_sku: sku,
        jumbo_product_id: productId || sku,
        preferred,
        product_details: detailsStr ? JSON.parse(detailsStr) : null
    };

    try {
        if (id) {
            await apiRequest(`/mappings/${id}`, {
                method: 'PUT',
                body: JSON.stringify(mappingData)
            });
            showToast('Mapping updated', 'success');
        } else {
            await apiRequest('/mappings', {
                method: 'POST',
                body: JSON.stringify(mappingData)
            });
            showToast('Mapping created', 'success');
        }
        closeModal('mapping-form-modal');
        loadMappings();
    } catch (e) { /* handled */ }
}

// Edit mapping
async function editMapping(id) {
    try {
        const data = await apiRequest(`/mappings`);
        const mapping = (data.mappings || []).find(m => m.id === id);
        if (mapping) openMappingForm(mapping);
    } catch (e) { /* handled */ }
}

// Delete mapping
async function deleteMapping(id) {
    if (!confirm('Delete this mapping?')) return;
    try {
        await apiRequest(`/mappings/${id}`, { method: 'DELETE' });
        showToast('Mapping deleted', 'success');
        loadMappings();
    } catch (e) { /* handled */ }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadHeader('mappings');
    loadMappings();
    checkUnmapped();
});
