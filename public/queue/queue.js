// Queue page logic
let draggedItem = null;
let draggedIndex = -1;

// Load queue
async function loadQueue() {
    try {
        const data = await apiRequest('/queue');
        renderQueue(data.queue || []);
        document.getElementById('queue-info').innerHTML =
            `<span class="tag">${data.count || 0} recipes in queue</span>`;
    } catch (e) { /* handled */ }
}

function renderQueue(queue) {
    const list = document.getElementById('queue-list');

    if (queue.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">&#127869;</div>
                <p>Your queue is empty</p>
                <div style="display:flex;gap:10px;justify-content:center">
                    <button class="btn btn-secondary" onclick="addRandomRecipe()">Add Random Recipe</button>
                    <a href="/recipes/" class="btn btn-primary">Browse Recipes</a>
                </div>
            </div>`;
        return;
    }

    list.innerHTML = queue.map((item, index) => {
        const totalTime = (item.prep_time || 0) + (item.cook_time || 0);
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
                <div class="queue-item-name">${escapeHtml(item.name)}</div>
                <div class="queue-item-meta">
                    ${item.cuisine ? `<span>${escapeHtml(item.cuisine)}</span>` : ''}
                    ${totalTime ? `<span>${formatTime(totalTime)}</span>` : ''}
                    <span>${item.servings || 4} servings</span>
                </div>
            </div>
            <div class="queue-item-actions">
                <button class="btn btn-primary btn-small" onclick="consumeRecipe(${item.id}, '${escapeHtml(item.name).replace(/'/g, "\\'")}')">Consume</button>
                <button class="btn btn-danger btn-small" onclick="removeFromQueue(${item.id})">Remove</button>
            </div>
        </div>`;
    }).join('');
}

// Add random recipe
async function addRandomRecipe() {
    try {
        const data = await apiRequest('/queue/random', { method: 'POST' });
        showToast(`Added "${data.queueItem.name}" to queue`, 'success');
        loadQueue();
        updateQueueBadge();
    } catch (e) { /* handled */ }
}

// Consume recipe
async function consumeRecipe(id, name) {
    try {
        await apiRequest(`/queue/${id}/consume`, { method: 'POST' });
        showToast(`Marked "${name}" as consumed`, 'success');
        loadQueue();
        loadHistory();
        updateQueueBadge();
    } catch (e) { /* handled */ }
}

// Remove from queue
async function removeFromQueue(id) {
    if (!confirm('Remove from queue?')) return;
    try {
        await apiRequest(`/queue/${id}`, { method: 'DELETE' });
        showToast('Removed from queue', 'success');
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

    // Collect new order
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
            list.innerHTML = '<p class="text-muted">No consumption history yet</p>';
            return;
        }

        list.innerHTML = data.history.map(h => `
            <div class="history-item">
                <div class="history-name">${escapeHtml(h.name)}</div>
                <div class="history-meta">
                    ${h.cuisine ? `<span>${escapeHtml(h.cuisine)}</span>` : ''}
                    <span>${new Date(h.consumed_date).toLocaleDateString()}</span>
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
