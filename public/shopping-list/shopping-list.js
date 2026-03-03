// Boodschappenlijst pagina logica
let currentShoppingList = null;
let currentView = 'recipe';
let searchResultProducts = [];
let similarResults = [];
let similarDebounceTimer = null;
let currentAlternativeIngredient = null;

// Load shopping list preview
async function loadPreview() {
    try {
        const data = await apiRequest('/shopping-list/preview');
        currentShoppingList = data.shoppingList;
        renderPreview(currentShoppingList);
    } catch (e) { /* handled */ }
}

function renderPreview(list) {
    if (!list) return;

    const summary = document.getElementById('summary');
    const totalMapped = list.mappedItems?.length || 0;
    const totalUnmapped = list.unmappedItems?.length || 0;
    const recipes = list.recipes || [];

    summary.innerHTML = `
        <span class="tag">${recipes.length} recept${recipes.length !== 1 ? 'en' : ''}</span>
        <span class="tag">${totalMapped} gekoppeld</span>
        ${totalUnmapped > 0 ? `<span class="tag tag-warning">${totalUnmapped} niet gekoppeld</span>` : ''}
    `;

    renderRecipeView(list);
    renderCategoryView(list);
    renderUnmapped(list);

    document.getElementById('add-to-basket-btn').disabled = totalMapped === 0;

    if (recipes.length === 0) {
        document.getElementById('recipe-view').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">&#128722;</div>
                <p>Geen recepten in wachtrij</p>
                <a href="/queue/" class="btn btn-primary">Naar wachtrij</a>
            </div>`;
        document.getElementById('category-view').innerHTML = '';
    }
}

// =====================
// Recipe View
// =====================
function renderRecipeView(list) {
    const container = document.getElementById('recipe-view');
    const byRecipe = list.byRecipe || [];

    if (byRecipe.length === 0) return;

    let html = '';
    for (const recipe of byRecipe) {
        const isBought = recipe.ingredientsBought;
        const boughtClass = isBought ? ' recipe-bought' : '';
        const boughtBadge = isBought ? '<span class="bought-badge">ingekocht</span>' : '';
        const recipeChecked = !isBought ? 'checked' : '';

        html += `
        <div class="recipe-group${boughtClass}">
            <div class="recipe-group-header">
                <div class="recipe-group-title">
                    <input type="checkbox" class="recipe-checkbox" data-queue-id="${recipe.queueId}"
                        ${recipeChecked} onchange="toggleRecipeCheckbox(this, ${recipe.recipeId})">
                    <h3>${escapeHtml(recipe.recipeName)}</h3>
                    ${boughtBadge}
                </div>
                <div class="recipe-group-actions">
                    <button class="btn btn-secondary btn-small" onclick="toggleRecipeAll(${recipe.recipeId}, true)">Alles selecteren</button>
                    <button class="btn btn-secondary btn-small" onclick="toggleRecipeAll(${recipe.recipeId}, false)">Alles deselecteren</button>
                </div>
            </div>
            <div class="recipe-group-items">`;

        for (const ing of recipe.ingredients) {
            const qty = ing.amount ? `${ing.amount} ${ing.unit}`.trim() : '';
            const checked = ing.mapped && !ing.skipInList && !isBought ? 'checked' : '';
            const skipped = ing.skipInList ? ' skipped' : '';
            const unmappedClass = !ing.mapped ? ' unmapped' : '';

            if (ing.mapped && ing.mapping) {
                const priceStr = ing.mapping.productPrice
                    ? ` \u2014 \u20AC${(ing.mapping.productPrice / 100).toFixed(2)}`
                    : '';

                // Package info
                let packageInfo = '';
                if (ing.mapping.packagesNeeded) {
                    packageInfo = `<span class="package-info">${ing.mapping.packagesNeeded}x pakket`;
                    if (ing.mapping.packageAmount && ing.mapping.packageUnit) {
                        packageInfo += ` (${ing.mapping.packageAmount} ${ing.mapping.packageUnit})`;
                    }
                    packageInfo += '</span>';
                }

                // Stock info
                let stockInfo = '';
                if (ing.mapping.inStock > 0) {
                    stockInfo = `<span class="stock-info">${ing.mapping.inStock} ${ing.mapping.packageUnit || ing.unit || ''} in voorraad</span>`;
                }

                html += `
                <div class="shopping-item${skipped}${unmappedClass}">
                    <div class="shopping-item-check">
                        <input type="checkbox" ${checked}
                            data-sku="${ing.mapping.jumboSku}"
                            data-recipe="${recipe.recipeId}"
                            onchange="updateSelectedCount()">
                    </div>
                    <div class="shopping-item-info">
                        <div class="shopping-item-name">
                            ${escapeHtml(ing.name)}
                            ${qty ? `<span class="text-muted">(${qty})</span>` : ''}
                            ${ing.skipInList ? '<span class="skip-badge">overslaan</span>' : ''}
                        </div>
                        <div class="shopping-item-product">
                            ${ing.mapping.productImage ? `<img src="${ing.mapping.productImage}" class="shopping-item-image">` : ''}
                            <span>${escapeHtml(ing.mapping.productTitle)}${priceStr}</span>
                        </div>
                        ${packageInfo || stockInfo ? `<div class="shopping-item-calc">${stockInfo}${packageInfo}</div>` : ''}
                    </div>
                    <button class="btn btn-secondary btn-small btn-alternative" title="Alternatief kiezen"
                        onclick="openAlternativeModal('${escapeAttr(ing.name)}', true)">\u21C4</button>
                </div>`;
            } else {
                html += `
                <div class="shopping-item unmapped">
                    <div class="shopping-item-check">
                        <input type="checkbox" disabled>
                    </div>
                    <div class="shopping-item-info">
                        <div class="shopping-item-name">
                            ${escapeHtml(ing.name)}
                            ${qty ? `<span class="text-muted">(${qty})</span>` : ''}
                        </div>
                        <div class="text-muted" style="font-size:12px">Niet gekoppeld</div>
                    </div>
                    <button class="btn btn-secondary btn-small btn-alternative" title="Ingredi\u00EBnt koppelen"
                        onclick="openAlternativeModal('${escapeAttr(ing.name)}', false)">+</button>
                </div>`;
            }
        }

        html += `</div></div>`;
    }

    container.innerHTML = html;
}

// Escape string for use in HTML attribute (single-quoted onclick)
function escapeAttr(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// =====================
// Category View
// =====================
function renderCategoryView(list) {
    const container = document.getElementById('category-view');
    const categorized = list.categorized || {};
    const totalMapped = list.mappedItems?.length || 0;

    if (totalMapped === 0) {
        container.innerHTML = '<p class="text-muted">Geen gekoppelde ingredi\u00EBnten</p>';
        return;
    }

    let html = '';
    for (const [category, items] of Object.entries(categorized)) {
        html += `<h3 class="category-header">${escapeHtml(category)}</h3>`;
        html += items.map(item => {
            const qty = (item.aggregatedQuantity || [])
                .map(q => `${q.amount} ${q.unit}`)
                .join(' + ');
            const details = item.productDetails || {};
            const checked = !item.skipInList ? 'checked' : '';
            const skipped = item.skipInList ? ' skipped' : '';

            // Package info
            let packageInfo = '';
            if (item.packagesNeeded) {
                packageInfo = `<span class="package-info">${item.packagesNeeded}x pakket`;
                if (item.packageAmount && item.packageUnit) {
                    packageInfo += ` (${item.packageAmount} ${item.packageUnit})`;
                }
                packageInfo += '</span>';
            }

            // Stock info
            let stockInfo = '';
            if (item.inStock > 0) {
                stockInfo = `<span class="stock-info">${item.inStock} ${item.packageUnit || ''} in voorraad</span>`;
            }

            return `
            <div class="shopping-item${skipped}">
                <div class="shopping-item-check">
                    <input type="checkbox" ${checked} data-sku="${item.jumboSku}" onchange="updateSelectedCount()">
                </div>
                <div class="shopping-item-info">
                    <div class="shopping-item-name">
                        ${escapeHtml(item.ingredientName)}
                        <span class="text-muted">(${qty})</span>
                        ${item.skipInList ? '<span class="skip-badge">overslaan</span>' : ''}
                    </div>
                    <div class="shopping-item-product">
                        ${details.image ? `<img src="${details.image}" class="shopping-item-image">` : ''}
                        <span>${escapeHtml(details.title || item.jumboSku)}</span>
                    </div>
                    ${packageInfo || stockInfo ? `<div class="shopping-item-calc">${stockInfo}${packageInfo}</div>` : ''}
                </div>
                ${details.price ? `<div class="shopping-item-price">\u20AC${(details.price / 100).toFixed(2)}</div>` : ''}
                <button class="btn btn-secondary btn-small btn-alternative" title="Alternatief kiezen"
                    onclick="openAlternativeModal('${escapeAttr(item.ingredientName)}', true)">\u21C4</button>
            </div>`;
        }).join('');
    }
    container.innerHTML = html;
}

// =====================
// Unmapped Items
// =====================
function renderUnmapped(list) {
    const unmappedSection = document.getElementById('unmapped-section');
    const unmappedEl = document.getElementById('unmapped-items');
    const totalUnmapped = list.unmappedItems?.length || 0;

    if (totalUnmapped > 0) {
        unmappedSection.classList.remove('hidden');
        unmappedEl.innerHTML = (list.unmappedItems || []).map(item => {
            const qty = (item.aggregatedQuantity || [])
                .map(q => `${q.amount} ${q.unit}`)
                .join(' + ');
            return `
            <div class="shopping-item unmapped">
                <div class="shopping-item-info">
                    <div class="shopping-item-name">${escapeHtml(item.ingredientName)} <span class="text-muted">(${qty})</span></div>
                    <div class="text-muted" style="font-size:12px">Geen Jumbo product gekoppeld</div>
                </div>
                <button class="btn btn-secondary btn-small btn-alternative" title="Ingredi\u00EBnt koppelen"
                    onclick="openAlternativeModal('${escapeAttr(item.ingredientName)}', false)">+</button>
            </div>`;
        }).join('');
    } else {
        unmappedSection.classList.add('hidden');
    }
}

// =====================
// View Switching
// =====================
function switchView(view) {
    currentView = view;
    document.getElementById('recipe-view').classList.toggle('hidden', view !== 'recipe');
    document.getElementById('category-view').classList.toggle('hidden', view !== 'category');
    document.getElementById('view-recipe-btn').classList.toggle('active', view === 'recipe');
    document.getElementById('view-category-btn').classList.toggle('active', view === 'category');
}

// =====================
// Recipe Checkbox (mark as bought)
// =====================
function toggleRecipeCheckbox(checkbox, recipeId) {
    const checkboxes = document.querySelectorAll(`input[data-recipe="${recipeId}"]`);
    checkboxes.forEach(cb => { cb.checked = checkbox.checked; });
    updateSelectedCount();
}

function toggleRecipeAll(recipeId, checked) {
    const checkboxes = document.querySelectorAll(`input[data-recipe="${recipeId}"]`);
    checkboxes.forEach(cb => { cb.checked = checked; });
    updateSelectedCount();
}

function updateSelectedCount() {
    const activeView = currentView === 'recipe' ? 'recipe-view' : 'category-view';
    const checked = document.querySelectorAll(`#${activeView} input[type="checkbox"][data-sku]:checked`);
    const btn = document.getElementById('add-to-basket-btn');
    btn.textContent = `Geselecteerde toevoegen (${checked.length})`;
    btn.disabled = checked.length === 0;
}

function getSelectedSkus() {
    const activeView = currentView === 'recipe' ? 'recipe-view' : 'category-view';
    const checked = document.querySelectorAll(`#${activeView} input[type="checkbox"][data-sku]:checked`);
    const skus = new Set();
    checked.forEach(cb => skus.add(cb.dataset.sku));
    return Array.from(skus);
}

// Get queue IDs of checked recipe checkboxes
function getCheckedRecipeQueueIds() {
    const checkboxes = document.querySelectorAll('.recipe-checkbox:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.dataset.queueId)).filter(id => !isNaN(id));
}

// =====================
// Add to Basket
// =====================
async function addSelectedToBasket() {
    const selectedSkus = getSelectedSkus();

    if (selectedSkus.length === 0) {
        showToast('Geen items geselecteerd', 'error');
        return;
    }

    openModal('progress-modal');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressResults = document.getElementById('progress-results');
    const progressFooter = document.getElementById('progress-footer');

    progressBar.style.width = '0%';
    progressBar.style.background = '';
    progressText.textContent = `${selectedSkus.length} items toevoegen aan mandje...`;
    progressResults.classList.add('hidden');
    progressFooter.classList.add('hidden');

    try {
        const data = await apiRequest('/shopping-list/generate', {
            method: 'POST',
            body: JSON.stringify({ selectedSkus })
        });

        progressBar.style.width = '100%';
        const results = data.results;

        let html = '';
        if (results.added?.length > 0) {
            html += `<p style="color:var(--success)">\u2713 ${results.added.length} items toegevoegd</p>`;
            html += '<ul class="result-list">';
            results.added.forEach(item => {
                html += `<li>${escapeHtml(item.ingredientName)} \u2192 ${escapeHtml(item.productName)} (x${item.quantity})</li>`;
            });
            html += '</ul>';
        }
        if (results.failed?.length > 0) {
            html += `<p style="color:var(--error);margin-top:10px">\u2715 Mislukt: ${results.failed.length} items</p>`;
            html += '<ul class="result-list">';
            results.failed.forEach(item => {
                html += `<li>${escapeHtml(item.ingredientName)}: ${escapeHtml(item.error)}</li>`;
            });
            html += '</ul>';
        }

        progressText.textContent = `Klaar! ${results.added?.length || 0} items toegevoegd.`;
        progressResults.innerHTML = html;
        progressResults.classList.remove('hidden');
        progressFooter.classList.remove('hidden');

        updateBasketBadge((results.added?.length || 0) + (results.failed?.length || 0));

        // Mark checked recipes as ingredients_bought
        const checkedQueueIds = getCheckedRecipeQueueIds();
        if (checkedQueueIds.length > 0) {
            try {
                await apiRequest('/queue/mark-bought', {
                    method: 'PUT',
                    body: JSON.stringify({ queueIds: checkedQueueIds })
                });
            } catch (e) { /* non-critical */ }
        }
    } catch (e) {
        progressBar.style.width = '100%';
        progressBar.style.background = 'var(--error)';
        progressText.textContent = 'Toevoegen aan mandje mislukt';
        progressFooter.classList.remove('hidden');
    }
}

// =====================
// Alternative / Mapping Modal
// =====================
function openAlternativeModal(ingredientName, hasExistingMapping) {
    currentAlternativeIngredient = ingredientName;

    document.getElementById('mapping-form-title').textContent = hasExistingMapping ? 'Alternatief kiezen' : 'Koppeling aanmaken';
    document.getElementById('mapping-id').value = '';
    document.getElementById('mapping-ingredient').value = ingredientName;
    document.getElementById('mapping-sku').value = '';
    document.getElementById('mapping-product-id').value = '';
    document.getElementById('mapping-product-details').value = '';
    document.getElementById('mapping-replace').checked = true;
    document.getElementById('mapping-skip').checked = false;

    // Package fields
    document.getElementById('mapping-package-amount').value = '';
    document.getElementById('mapping-package-unit').value = '';
    document.getElementById('mapping-shelf-life').value = '';

    // Reset UI
    document.getElementById('selected-product').classList.add('hidden');
    document.getElementById('selected-product-info').innerHTML = '';
    document.getElementById('similar-mappings').classList.add('hidden');
    document.getElementById('product-results').classList.add('hidden');

    // Auto-fill search with ingredient name + biologisch
    document.getElementById('product-search').value = ingredientName ? ingredientName + ' biologisch' : '';

    openModal('mapping-form-modal');

    // Trigger similar lookup and product search
    setTimeout(() => {
        lookupSimilar(ingredientName);
        searchJumboProducts();
    }, 100);
}

// =====================
// Product Search (for modal)
// =====================
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
                saveMappingFromShoppingList();
            });
        });
    } catch (e) {
        resultsEl.innerHTML = '<p class="text-muted text-center" style="padding:20px">Zoeken mislukt. Ben je ingelogd?</p>';
    }
}

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

// =====================
// Similar Mappings Lookup
// =====================
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
            <div class="similar-header">Vergelijkbare koppelingen:</div>
            ${similarResults.map((m, i) => {
                const details = m.product_details || {};
                return `
                <div class="similar-item">
                    <div class="similar-item-info">
                        <span class="similar-ingredient">${escapeHtml(m.ingredient_name)}</span>
                        <span class="text-muted">&rarr;</span>
                        <span>${escapeHtml(details.title || m.jumbo_sku)}</span>
                    </div>
                    <button class="btn btn-secondary btn-small" data-similar-index="${i}">Dit product gebruiken</button>
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

function useSimilarProduct(index) {
    const m = similarResults[index];
    if (!m) return;

    const details = m.product_details || {};
    document.getElementById('mapping-sku').value = m.jumbo_sku;
    document.getElementById('mapping-product-id').value = m.jumbo_product_id;
    document.getElementById('mapping-product-details').value = JSON.stringify(details);

    // Copy package info if available
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
// Save Mapping from Shopping List
// =====================
async function saveMappingFromShoppingList() {
    const ingredientName = document.getElementById('mapping-ingredient').value.trim();
    const sku = document.getElementById('mapping-sku').value;
    const productId = document.getElementById('mapping-product-id').value;
    const replaceMapping = document.getElementById('mapping-replace').checked;
    const skipInList = document.getElementById('mapping-skip').checked;
    const detailsStr = document.getElementById('mapping-product-details').value;

    // Package fields
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
        preferred: replaceMapping,
        skip_in_list: skipInList,
        product_details: detailsStr ? JSON.parse(detailsStr) : null,
        package_amount: packageAmount ? parseFloat(packageAmount) : null,
        package_unit: packageUnit || null,
        shelf_life_days: shelfLife ? parseInt(shelfLife) : null
    };

    try {
        if (replaceMapping) {
            try {
                await apiRequest('/mappings', {
                    method: 'POST',
                    body: JSON.stringify(mappingData)
                });
            } catch (e) {
                const existing = await apiRequest(`/mappings/ingredient/${encodeURIComponent(ingredientName)}`);
                const match = (existing.mappings || []).find(m => m.preferred);
                if (match) {
                    await apiRequest(`/mappings/${match.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(mappingData)
                    });
                }
            }
            showToast('Koppeling opgeslagen', 'success');
        } else {
            mappingData.preferred = false;
            await apiRequest('/mappings', {
                method: 'POST',
                body: JSON.stringify(mappingData)
            });
            showToast('Alternatief toegevoegd', 'success');
        }

        closeModal('mapping-form-modal');
        loadPreview();
    } catch (e) { /* handled */ }
}

// =====================
// Export
// =====================
async function exportAsText() {
    try {
        const response = await fetch('/api/shopping-list/export');
        const text = await response.text();
        await navigator.clipboard.writeText(text);
        showToast('Boodschappenlijst gekopieerd naar klembord', 'success');
    } catch (e) {
        showToast('Exporteren mislukt', 'error');
    }
}

// =====================
// Modal search event listeners
// =====================
function setupModalListeners() {
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchJumboProducts();
            }
        });
    }

    const ingredientInput = document.getElementById('mapping-ingredient');
    if (ingredientInput) {
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
}

// =====================
// Init
// =====================
document.addEventListener('DOMContentLoaded', () => {
    loadHeader('shopping-list');
    loadPreview();
    setupModalListeners();
});
