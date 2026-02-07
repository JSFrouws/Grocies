// Shopping List page logic
let currentShoppingList = null;

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

    // Summary
    const summary = document.getElementById('summary');
    const totalMapped = list.mappedItems?.length || 0;
    const totalUnmapped = list.unmappedItems?.length || 0;
    const recipes = list.recipes || [];

    summary.innerHTML = `
        <span class="tag">${recipes.length} recipe${recipes.length !== 1 ? 's' : ''}</span>
        <span class="tag">${totalMapped} mapped</span>
        ${totalUnmapped > 0 ? `<span class="tag tag-warning">${totalUnmapped} unmapped</span>` : ''}
    `;

    // Recipes
    const recipesEl = document.getElementById('recipes-in-list');
    if (recipes.length > 0) {
        recipesEl.innerHTML = `
            <div class="recipe-chips">
                ${recipes.map(r => `<span class="tag">${escapeHtml(r.name)}</span>`).join(' ')}
            </div>`;
    } else {
        recipesEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">&#128722;</div>
                <p>No recipes in queue</p>
                <a href="/queue/" class="btn btn-primary">Go to Queue</a>
            </div>`;
    }

    // Mapped items - grouped by category
    const mappedEl = document.getElementById('mapped-items');
    const categorized = list.categorized || {};

    if (totalMapped > 0) {
        let html = '';
        for (const [category, items] of Object.entries(categorized)) {
            html += `<h3 class="category-header">${escapeHtml(category)}</h3>`;
            html += items.map(item => {
                const qty = (item.aggregatedQuantity || [])
                    .map(q => `${q.amount} ${q.unit}`)
                    .join(' + ');
                const details = item.productDetails || {};
                return `
                <div class="shopping-item">
                    <div class="shopping-item-check">
                        <input type="checkbox" checked data-sku="${item.jumboSku}">
                    </div>
                    <div class="shopping-item-info">
                        <div class="shopping-item-name">${escapeHtml(item.ingredientName)} <span class="text-muted">(${qty})</span></div>
                        <div class="shopping-item-product">
                            ${details.image ? `<img src="${details.image}" class="shopping-item-image">` : ''}
                            <span>${escapeHtml(details.title || item.jumboSku)}</span>
                        </div>
                    </div>
                    ${details.price ? `<div class="shopping-item-price">\u20AC${(details.price / 100).toFixed(2)}</div>` : ''}
                </div>`;
            }).join('');
        }
        mappedEl.innerHTML = html;
    } else {
        mappedEl.innerHTML = '<p class="text-muted">No mapped ingredients</p>';
    }

    // Unmapped items
    const unmappedSection = document.getElementById('unmapped-section');
    const unmappedEl = document.getElementById('unmapped-items');

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
                    <div class="text-muted" style="font-size:12px">No Jumbo product mapped</div>
                </div>
            </div>`;
        }).join('');
    } else {
        unmappedSection.classList.add('hidden');
    }

    // Disable basket button if nothing to add
    document.getElementById('add-to-basket-btn').disabled = totalMapped === 0;
}

// Add all to basket
async function addAllToBasket() {
    if (!currentShoppingList || !currentShoppingList.mappedItems?.length) {
        showToast('No mapped items to add', 'error');
        return;
    }

    openModal('progress-modal');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressResults = document.getElementById('progress-results');
    const progressFooter = document.getElementById('progress-footer');

    progressBar.style.width = '0%';
    progressText.textContent = 'Adding items to basket...';
    progressResults.classList.add('hidden');
    progressFooter.classList.add('hidden');

    try {
        const data = await apiRequest('/shopping-list/generate', {
            method: 'POST'
        });

        progressBar.style.width = '100%';
        const results = data.results;

        let html = '';
        if (results.added?.length > 0) {
            html += `<p style="color:var(--success)">\u2713 Added ${results.added.length} items</p>`;
            html += '<ul class="result-list">';
            results.added.forEach(item => {
                html += `<li>${escapeHtml(item.ingredientName)} \u2192 ${escapeHtml(item.productName)} (x${item.quantity})</li>`;
            });
            html += '</ul>';
        }
        if (results.failed?.length > 0) {
            html += `<p style="color:var(--error);margin-top:10px">\u2715 Failed: ${results.failed.length} items</p>`;
            html += '<ul class="result-list">';
            results.failed.forEach(item => {
                html += `<li>${escapeHtml(item.ingredientName)}: ${escapeHtml(item.error)}</li>`;
            });
            html += '</ul>';
        }

        progressText.textContent = `Done! ${results.added?.length || 0} items added.`;
        progressResults.innerHTML = html;
        progressResults.classList.remove('hidden');
        progressFooter.classList.remove('hidden');

        updateBasketBadge((results.added?.length || 0) + (results.failed?.length || 0));
    } catch (e) {
        progressBar.style.width = '100%';
        progressBar.style.background = 'var(--error)';
        progressText.textContent = 'Failed to add items to basket';
        progressFooter.classList.remove('hidden');
    }
}

// Export as text
async function exportAsText() {
    try {
        const response = await fetch('/api/shopping-list/export');
        const text = await response.text();

        await navigator.clipboard.writeText(text);
        showToast('Shopping list copied to clipboard', 'success');
    } catch (e) {
        showToast('Failed to export', 'error');
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadHeader('shopping-list');
    loadPreview();
});
