// Wachtrij pagina logica
let draggedItem = null;
let draggedIndex = -1;
let allQueueItems = [];
let stockFilterActive = false;
let stockRecipeData = null;

// Load queue
async function loadQueue() {
    try {
        const data = await apiRequest('/queue');
        allQueueItems = data.queue || [];
        document.getElementById('queue-info').innerHTML =
            `<span class="tag">${data.count || 0} recepten in wachtrij</span>`;

        // Load stock check data if filter is active
        if (stockFilterActive) {
            await loadStockCheck();
        }

        renderQueue(getFilteredQueue());
    } catch (e) { /* handled */ }
}

function getFilteredQueue() {
    if (!stockFilterActive || !stockRecipeData) return allQueueItems;

    return allQueueItems.filter(item => {
        const check = stockRecipeData.find(r => r.recipeId === item.recipe_id);
        return check && check.coveragePercent > 0;
    }).sort((a, b) => {
        const checkA = stockRecipeData.find(r => r.recipeId === a.recipe_id);
        const checkB = stockRecipeData.find(r => r.recipeId === b.recipe_id);
        const coverageA = checkA ? checkA.coveragePercent : 0;
        const coverageB = checkB ? checkB.coveragePercent : 0;
        return coverageB - coverageA;
    });
}

async function loadStockCheck() {
    try {
        const data = await apiRequest('/stock/recipe-check');
        stockRecipeData = data.recipes || [];
    } catch (e) {
        stockRecipeData = [];
    }
}

function toggleStockFilter() {
    stockFilterActive = document.getElementById('stock-filter-checkbox').checked;
    loadQueue();
}

function renderQueue(queue) {
    const list = document.getElementById('queue-list');

    if (queue.length === 0) {
        const emptyMsg = stockFilterActive
            ? 'Geen recepten met ingredi\u00EBnten uit voorraad'
            : 'Je wachtrij is leeg';
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">&#127869;</div>
                <p>${emptyMsg}</p>
                <div style="display:flex;gap:10px;justify-content:center">
                    <button class="btn btn-secondary" onclick="addRandomRecipe()">Willekeurig recept toevoegen</button>
                    <a href="/recipes/" class="btn btn-primary">Recepten bekijken</a>
                </div>
            </div>`;
        return;
    }

    list.innerHTML = queue.map((item, index) => {
        const totalTime = (item.prep_time || 0) + (item.cook_time || 0);

        // Stock coverage indicator
        let stockBadge = '';
        if (stockRecipeData) {
            const check = stockRecipeData.find(r => r.recipeId === item.recipe_id);
            if (check) {
                if (check.coveragePercent >= 100) {
                    stockBadge = '<span class="stock-badge full" title="Alle ingredi\u00EBnten op voorraad">\u2713 Voorraad</span>';
                } else if (check.coveragePercent > 0) {
                    stockBadge = `<span class="stock-badge partial" title="${Math.round(check.coveragePercent)}% op voorraad">${Math.round(check.coveragePercent)}% voorraad</span>`;
                }
            }
        }

        return `
        <div class="queue-item" draggable="true" data-id="${item.id}" data-index="${index}"
             ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event)"
             ondragend="onDragEnd(event)">
            <div class="queue-drag-handle">&#9776;</div>
            <div class="queue-item-image">
                ${item.image_path
                    ? `<img src="/uploads/recipes/${item.image_path.split('/').pop()}" alt="${escapeHtml(item.name)}">`
                    : `<span class="queue-placeholder">${(item.cuisine || '?')[0].toUpperCase()}</span>`
                }
            </div>
            <div class="queue-item-info">
                <div class="queue-item-name">${escapeHtml(item.name)} ${stockBadge}</div>
                <div class="queue-item-meta">
                    ${item.cuisine ? `<span>${escapeHtml(item.cuisine)}</span>` : ''}
                    ${totalTime ? `<span>${formatTime(totalTime)}</span>` : ''}
                    <span>${item.servings || 4} porties</span>
                </div>
            </div>
            <div class="queue-item-actions">
                <button class="btn btn-primary btn-small" onclick="consumeRecipe(${item.id}, '${escapeHtml(item.name).replace(/'/g, "\\'")}')">Consumeren</button>
                <button class="btn btn-danger btn-small" onclick="removeFromQueue(${item.id})">Verwijderen</button>
            </div>
        </div>`;
    }).join('');
}

// Add random recipe
async function addRandomRecipe() {
    try {
        const data = await apiRequest('/queue/random', { method: 'POST' });
        showToast(`"${data.queueItem.name}" toegevoegd aan wachtrij`, 'success');
        loadQueue();
        updateQueueBadge();
    } catch (e) { /* handled */ }
}

// Consume recipe
async function consumeRecipe(id, name) {
    try {
        const data = await apiRequest(`/queue/${id}/consume`, { method: 'POST' });

        // Show stock consumption feedback
        let msg = `"${name}" geconsumeerd`;
        if (data.stockConsumption && data.stockConsumption.length > 0) {
            const consumed = data.stockConsumption.map(sc => sc.ingredient).join(', ');
            msg += ` \u2014 voorraad bijgewerkt: ${consumed}`;
        }
        showToast(msg, 'success', 5000);

        loadQueue();
        loadHistory();
        updateQueueBadge();
    } catch (e) { /* handled */ }
}

// Remove from queue
async function removeFromQueue(id) {
    if (!confirm('Verwijderen uit wachtrij?')) return;
    try {
        await apiRequest(`/queue/${id}`, { method: 'DELETE' });
        showToast('Verwijderd uit wachtrij', 'success');
        loadQueue();
        updateQueueBadge();
    } catch (e) { /* handled */ }
}

// =====================
// Drag & Drop
// =====================
window.onDragStart = function(e) {
    draggedItem = e.currentTarget;
    draggedIndex = parseInt(draggedItem.dataset.index);
    draggedItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
};

window.onDragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.currentTarget;
    if (target !== draggedItem && target.classList.contains('queue-item')) {
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            target.parentElement.insertBefore(draggedItem, target);
        } else {
            target.parentElement.insertBefore(draggedItem, target.nextSibling);
        }
    }
};

window.onDrop = function(e) {
    e.preventDefault();
};

window.onDragEnd = async function(e) {
    if (draggedItem) draggedItem.classList.remove('dragging');
    draggedItem = null;

    const items = document.querySelectorAll('.queue-item');
    const itemOrders = [];
    items.forEach((el, index) => {
        itemOrders.push({ id: parseInt(el.dataset.id), list_index: index + 1 });
    });

    try {
        await apiRequest('/queue/reorder', {
            method: 'PUT',
            body: JSON.stringify({ itemOrders })
        });
    } catch (e) { /* handled */ }
};

// =====================
// History
// =====================
async function loadHistory() {
    try {
        const data = await apiRequest('/queue/history?limit=10');
        const list = document.getElementById('history-list');

        if (!data.history || data.history.length === 0) {
            list.innerHTML = '<p class="text-muted">Nog geen geschiedenis</p>';
            return;
        }

        list.innerHTML = data.history.map(h => `
            <div class="history-item">
                <div class="history-name">${escapeHtml(h.name)}</div>
                <div class="history-meta">
                    ${h.cuisine ? `<span>${escapeHtml(h.cuisine)}</span>` : ''}
                    <span>${new Date(h.consumed_date).toLocaleDateString('nl-NL')}</span>
                </div>
            </div>
        `).join('');
    } catch (e) { /* handled */ }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadHeader('queue');
    loadQueue();
    loadHistory();
});
