// Mappings page logic

let unmappedIngredients = [];
let currentUnmappedIndex = -1;
let similarDebounceTimer = null;
let searchResultProducts = [];
let similarResults = [];

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
                    Nog geen koppelingen. Maak er een om ingredi\u00EBnten aan Jumbo producten te koppelen.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = mappings.map(m => {
        const details = m.product_details || {};
        let statusTags = '';
        if (m.preferred) {
            statusTags += '<span class="tag">Voorkeur</span> ';
        } else {
            statusTags += '<span class="tag tag-warning">Alt</span> ';
        }
        if (m.skip_in_list) {
            statusTags += '<span class="tag tag-muted">Overslaan</span>';
        }

        // Package info column
        let packageInfo = '';
        if (m.package_amount && m.package_unit) {
            packageInfo = `${m.package_amount} ${escapeHtml(m.package_unit)}`;
            if (m.shelf_life_days) {
                packageInfo += `<br><span class="text-muted">${m.shelf_life_days} dagen houdbaar</span>`;
            }
        } else {
            packageInfo = '<span class="text-muted">-</span>';
        }

        return `
        <tr>
            <td><strong>${escapeHtml(m.ingredient_name)}</strong></td>
            <td>
                <div style="display:flex;align-items:center;gap:8px">
                    ${details.image ? `<img src="${details.image}" style="width:30px;height:30px;object-fit:contain;border-radius:4px">` : ''}
                    <span>${escapeHtml(details.title || m.jumbo_sku)}</span>
                </div>
            </td>
            <td>${packageInfo}</td>
            <td>${statusTags}</td>
            <td>
                <div style="display:flex;gap:6px">
                    <button class="btn btn-secondary btn-small" onclick="editMapping(${m.id})">Bewerken</button>
                    <button class="btn btn-danger btn-small" onclick="deleteMapping(${m.id})">Verwijderen</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// Check unmapped ingredients
async function checkUnmapped() {
    try {
        const data = await apiRequest('/shopping-list/preview');
        unmappedIngredients = data.shoppingList?.unmappedItems || [];
        const alert = document.getElementById('unmapped-alert');
        const countEl = document.getElementById('unmapped-count');

        if (unmappedIngredients.length > 0) {
            alert.classList.remove('hidden');
            countEl.innerHTML = `<span class="tag tag-warning">${unmappedIngredients.length} ongekoppeld${unmappedIngredients.length > 1 ? 'e' : ''} ingredi\u00EBnt${unmappedIngredients.length > 1 ? 'en' : ''} in wachtrij</span>`;
        } else {
            alert.classList.add('hidden');
        }
    } catch (e) { /* handled silently */ }
}

// Show unmapped ingredients as a clickable list
function showUnmapped() {
    const listEl = document.getElementById('unmapped-list');

    if (unmappedIngredients.length === 0) {
        listEl.classList.add('hidden');
        showToast('Geen ongekoppelde ingredi\u00EBnten in wachtrij', 'info');
        return;
    }

    listEl.classList.remove('hidden');
    listEl.innerHTML = `
        <h3 class="mb-10">Ongekoppelde ingredi\u00EBnten in wachtrij</h3>
        <p class="text-muted mb-10">Klik op een ingredi\u00EBnt om het aan een Jumbo product te koppelen.</p>
        <div class="unmapped-ingredient-list">
            ${unmappedIngredients.map((item, index) => {
                const qty = (item.aggregatedQuantity || [])
                    .map(q => `${q.amount} ${q.unit}`)
                    .join(' + ');
                const recipes = (item.usedInRecipes || [])
                    .map(r => r.recipeName).join(', ');
                return `
                <div class="unmapped-ingredient-item" onclick="mapUnmappedIngredient(${index})">
                    <div class="unmapped-ingredient-name">${escapeHtml(item.ingredientName)}</div>
                    <div class="unmapped-ingredient-details">
                        <span class="text-muted">${qty}</span>
                        ${recipes ? `<span class="text-muted"> &middot; ${escapeHtml(recipes)}</span>` : ''}
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

// Open mapping form pre-filled with an unmapped ingredient
function mapUnmappedIngredient(index) {
    currentUnmappedIndex = index;
    const item = unmappedIngredients[index];
    if (!item) return;

    openMappingForm(null, item.ingredientName);
}

// Filter
document.getElementById('mapping-search').addEventListener('input', debounce(loadMappings));

// =====================
// Similar Mappings
// =====================
function setupSimilarLookup() {
    const ingredientInput = document.getElementById('mapping-ingredient');
    ingredientInput.addEventListener('input', () => {
        clearTimeout(similarDebounceTimer);
        const name = ingredientInput.value.trim();
        if (name.length < 2) {
            document.getElementById('similar-mappings').classList.add('hidden');
            return;
        }
        similarDebounceTimer = setTimeout(() => lookupSimilar(name), 400);
    });
}

async function lookupSimilar(ingredientName) {
    const similarEl = document.getElementById('similar-mappings');
    try {
        const data = await apiRequest(`/mappings/similar/${encodeURIComponent(ingredientName)}`);
        similarResults = data.similar || [];

        if (similarResults.length === 0) {
            similarEl.classList.add('hidden');
            return;
        }

        similarEl.classList.remove('hidden');
        similarEl.innerHTML = `
            <div class="similar-header">Vergelijkbare bestaande koppelingen:</div>
            ${similarResults.map((m, i) => {
                const details = m.product_details || {};
                return `
                <div class="similar-item">
                    <div class="similar-item-info">
                        <span class="similar-ingredient">${escapeHtml(m.ingredient_name)}</span>
                        <span class="text-muted">&rarr;</span>
                        <span>${escapeHtml(details.title || m.jumbo_sku)}</span>
                    </div>
                    <button class="btn btn-secondary btn-small" data-similar-index="${i}">Gebruik dit product</button>
                </div>`;
            }).join('')}`;

        // Attach click handlers
        similarEl.querySelectorAll('[data-similar-index]').forEach(btn => {
            btn.addEventListener('click', () => useSimilarProduct(parseInt(btn.dataset.similarIndex)));
        });
    } catch (e) {
        similarEl.classList.add('hidden');
    }
}

// Use a product from similar mappings
function useSimilarProduct(index) {
    const m = similarResults[index];
    if (!m) return;

    const details = m.product_details || {};
    document.getElementById('mapping-sku').value = m.jumbo_sku;
    document.getElementById('mapping-product-id').value = m.jumbo_product_id;
    document.getElementById('mapping-product-details').value = JSON.stringify(details);

    // Also fill package info from similar mapping
    if (m.package_amount) document.getElementById('mapping-package-amount').value = m.package_amount;
    if (m.package_unit) document.getElementById('mapping-package-unit').value = m.package_unit;
    if (m.shelf_life_days) document.getElementById('mapping-shelf-life').value = m.shelf_life_days;

    const selectedEl = document.getElementById('selected-product');
    selectedEl.classList.remove('hidden');
    document.getElementById('selected-product-info').innerHTML = `
        <div style="display:flex;align-items:center;gap:12px">
            ${details.image ? `<img src="${details.image}" style="width:60px;height:60px;object-fit:contain;border-radius:6px">` : ''}
            <div>
                <div style="font-weight:600">${escapeHtml(details.title || m.jumbo_sku)}</div>
                ${details.price ? `<div style="color:var(--spierings-orange)">\u20AC${(details.price / 100).toFixed(2)}</div>` : ''}
                <div style="font-size:12px;color:var(--text-muted)">SKU: ${m.jumbo_sku}</div>
            </div>
        </div>`;

    document.getElementById('product-results').classList.add('hidden');
    showToast('Product overgenomen van vergelijkbare koppeling', 'success', 2000);
}

// =====================
// Mapping Form
// =====================
function openMappingForm(mapping = null, prefillIngredient = null) {
    document.getElementById('mapping-form-title').textContent = mapping ? 'Koppeling bewerken' : 'Koppeling aanmaken';
    document.getElementById('mapping-id').value = mapping ? mapping.id : '';
    document.getElementById('mapping-ingredient').value = mapping ? mapping.ingredient_name : (prefillIngredient || '');
    document.getElementById('mapping-sku').value = mapping ? mapping.jumbo_sku : '';
    document.getElementById('mapping-product-id').value = mapping ? mapping.jumbo_product_id : '';
    document.getElementById('mapping-preferred').checked = mapping ? mapping.preferred : true;
    document.getElementById('mapping-skip').checked = mapping ? mapping.skip_in_list : false;

    // Package fields
    document.getElementById('mapping-package-amount').value = mapping ? (mapping.package_amount || '') : '';
    document.getElementById('mapping-package-unit').value = mapping ? (mapping.package_unit || '') : '';
    document.getElementById('mapping-shelf-life').value = mapping ? (mapping.shelf_life_days || '') : '';

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
                    ${details.price ? `<div style="color:var(--spierings-orange)">\u20AC${(details.price / 100).toFixed(2)}</div>` : ''}
                </div>
            </div>`;
    } else {
        selectedEl.classList.add('hidden');
        document.getElementById('mapping-product-details').value = '';
    }

    // Reset similar and search results
    document.getElementById('similar-mappings').classList.add('hidden');
    document.getElementById('product-results').classList.add('hidden');

    // Auto-fill search field with ingredient name + biologisch
    const ingredientName = mapping ? mapping.ingredient_name : (prefillIngredient || '');
    document.getElementById('product-search').value = ingredientName ? ingredientName + ' biologisch' : '';

    openModal('mapping-form-modal');

    // Trigger similar lookup and auto-search if we have an ingredient name
    if (ingredientName && !mapping) {
        setTimeout(() => {
            lookupSimilar(ingredientName);
            searchJumboProducts();
        }, 100);
    }
}

// Search Jumbo products
async function searchJumboProducts() {
    const query = document.getElementById('product-search').value.trim();
    if (!query) return;

    const resultsEl = document.getElementById('product-results');
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = '<div class="basket-loading"><div class="spinner"></div> Zoeken...</div>';

    try {
        const data = await apiRequest(`/store/search?q=${encodeURIComponent(query)}&limit=10`);
        searchResultProducts = data.products || [];

        if (searchResultProducts.length === 0) {
            resultsEl.innerHTML = '<p class="text-muted text-center" style="padding:20px">Geen producten gevonden</p>';
            return;
        }

        resultsEl.innerHTML = searchResultProducts.map((p, i) => `
            <div class="product-result-item" data-index="${i}">
                ${p.image ? `<img src="${p.image}" class="product-result-image">` : ''}
                <div class="product-result-info">
                    <div style="font-weight:600;font-size:13px">${escapeHtml(p.title)}</div>
                    <div style="color:var(--spierings-orange);font-weight:700">\u20AC${(p.price / 100).toFixed(2)}</div>
                </div>
            </div>
        `).join('');

        // Attach click and double-click handlers
        resultsEl.querySelectorAll('.product-result-item').forEach(el => {
            el.addEventListener('click', () => selectProduct(parseInt(el.dataset.index)));
            el.addEventListener('dblclick', () => {
                selectProduct(parseInt(el.dataset.index));
                saveMapping();
            });
        });
    } catch (e) {
        resultsEl.innerHTML = '<p class="text-muted text-center" style="padding:20px">Zoeken mislukt. Ben je ingelogd?</p>';
    }
}

document.getElementById('product-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchJumboProducts();
    }
});

// Select product from search results
function selectProduct(index) {
    const p = searchResultProducts[index];
    if (!p) return;

    const details = { title: p.title, price: p.price, image: p.image, brand: p.brand };

    document.getElementById('mapping-sku').value = p.sku;
    document.getElementById('mapping-product-id').value = p.id;
    document.getElementById('mapping-product-details').value = JSON.stringify(details);

    const selectedEl = document.getElementById('selected-product');
    selectedEl.classList.remove('hidden');
    document.getElementById('selected-product-info').innerHTML = `
        <div style="display:flex;align-items:center;gap:12px">
            ${details.image ? `<img src="${details.image}" style="width:60px;height:60px;object-fit:contain;border-radius:6px">` : ''}
            <div>
                <div style="font-weight:600">${escapeHtml(details.title)}</div>
                <div style="color:var(--spierings-orange)">\u20AC${(details.price / 100).toFixed(2)}</div>
                <div style="font-size:12px;color:var(--text-muted)">SKU: ${p.sku}</div>
            </div>
        </div>`;

    document.getElementById('product-results').classList.add('hidden');
    showToast('Product geselecteerd', 'success', 2000);
}

// Save mapping
async function saveMapping() {
    const id = document.getElementById('mapping-id').value;
    const ingredientName = document.getElementById('mapping-ingredient').value.trim();
    const sku = document.getElementById('mapping-sku').value;
    const productId = document.getElementById('mapping-product-id').value;
    const preferred = document.getElementById('mapping-preferred').checked;
    const skipInList = document.getElementById('mapping-skip').checked;
    const detailsStr = document.getElementById('mapping-product-details').value;
    const packageAmount = document.getElementById('mapping-package-amount').value;
    const packageUnit = document.getElementById('mapping-package-unit').value.trim();
    const shelfLife = document.getElementById('mapping-shelf-life').value;

    if (!ingredientName) {
        showToast('Ingredi\u00EBntnaam is verplicht', 'error');
        return;
    }
    if (!sku) {
        showToast('Selecteer eerst een Jumbo product', 'error');
        return;
    }

    const mappingData = {
        ingredient_name: ingredientName,
        jumbo_sku: sku,
        jumbo_product_id: productId || sku,
        preferred,
        skip_in_list: skipInList,
        product_details: detailsStr ? JSON.parse(detailsStr) : null,
        package_amount: packageAmount ? parseFloat(packageAmount) : null,
        package_unit: packageUnit || null,
        shelf_life_days: shelfLife ? parseInt(shelfLife) : null
    };

    try {
        if (id) {
            await apiRequest(`/mappings/${id}`, {
                method: 'PUT',
                body: JSON.stringify(mappingData)
            });
            showToast('Koppeling bijgewerkt', 'success');
        } else {
            await apiRequest('/mappings', {
                method: 'POST',
                body: JSON.stringify(mappingData)
            });
            showToast('Koppeling aangemaakt', 'success');
        }
        closeModal('mapping-form-modal');
        loadMappings();
        checkUnmapped();

        // If we were mapping from the unmapped list, advance to the next one
        if (currentUnmappedIndex >= 0 && !id) {
            unmappedIngredients.splice(currentUnmappedIndex, 1);
            if (unmappedIngredients.length > 0) {
                showUnmapped();
                showToast(`Nog ${unmappedIngredients.length} ongekoppeld${unmappedIngredients.length > 1 ? 'e' : ''} ingredi\u00EBnt${unmappedIngredients.length > 1 ? 'en' : ''}`, 'info', 2000);
            } else {
                document.getElementById('unmapped-list').classList.add('hidden');
                document.getElementById('unmapped-alert').classList.add('hidden');
                showToast('Alle ingredi\u00EBnten gekoppeld!', 'success');
            }
            currentUnmappedIndex = -1;
        }
    } catch (e) { /* handled */ }
}

// Edit mapping
async function editMapping(id) {
    try {
        const data = await apiRequest('/mappings');
        const mapping = (data.mappings || []).find(m => m.id === id);
        if (mapping) openMappingForm(mapping);
    } catch (e) { /* handled */ }
}

// Delete mapping
async function deleteMapping(id) {
    if (!confirm('Deze koppeling verwijderen?')) return;
    try {
        await apiRequest(`/mappings/${id}`, { method: 'DELETE' });
        showToast('Koppeling verwijderd', 'success');
        loadMappings();
        checkUnmapped();
    } catch (e) { /* handled */ }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadHeader('mappings');
    loadMappings();
    checkUnmapped();
    setupSimilarLookup();
});
