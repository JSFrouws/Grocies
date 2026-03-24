// Recepten pagina logica
let allRecipes = [];
let generationCountries = [];
let existingIngredients = [];

// Load recipes
async function loadRecipes() {
    const search = document.getElementById('recipe-search').value;
    const cuisine = document.getElementById('cuisine-filter').value;
    const country = document.getElementById('country-filter').value;

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (cuisine) params.set('cuisine', cuisine);
    if (country) params.set('country', country);

    try {
        const data = await apiRequest(`/recipes?${params}`);
        allRecipes = data.recipes || [];
        renderRecipeGrid();
    } catch (e) { /* handled */ }
}

function renderRecipeGrid() {
    const grid = document.getElementById('recipe-grid');
    if (allRecipes.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#127858;</div><p>Nog geen recepten</p><button class="btn btn-primary" onclick="openRecipeForm()">Maak je eerste recept</button></div>';
        return;
    }

    grid.innerHTML = allRecipes.map(r => {
        const totalTime = (r.prep_time || 0) + (r.cook_time || 0);
        const tags = (r.tags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ');

        return `
        <div class="card recipe-card" onclick="viewRecipe(${r.id})">
            ${r.image_path
                ? `<img src="/uploads/recipes/${r.image_path.split('/').pop()}" class="recipe-card-image" alt="${escapeHtml(r.name)}">`
                : `<div class="recipe-card-image recipe-placeholder">
                    <label class="photo-upload-btn" onclick="event.stopPropagation()" title="Foto toevoegen">
                        <input type="file" accept="image/*" class="hidden" onchange="uploadCardPhoto(${r.id}, this)">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                        </svg>
                        <span>+</span>
                    </label>
                  </div>`
            }
            <div class="recipe-card-body">
                <div class="recipe-card-title-row">
                    <h3 class="recipe-card-title">${escapeHtml(r.name)}</h3>
                    <button class="btn-trash btn-trash--confirm" onclick="event.stopPropagation(); confirmDeleteRecipe(this, ${r.id})" title="Recept verwijderen">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                    </button>
                </div>
                <div class="recipe-card-meta">
                    ${r.cuisine ? `<span>${escapeHtml(r.cuisine)}</span>` : ''}
                    ${r.country_of_origin ? `<span>${escapeHtml(r.country_of_origin)}</span>` : ''}
                    ${totalTime ? `<span>${formatTime(totalTime)}</span>` : ''}
                </div>
                <div class="recipe-card-tags">${tags}</div>
            </div>
        </div>`;
    }).join('');
}

// Load filter options
async function loadFilters() {
    try {
        const [cuisines, countries] = await Promise.all([
            apiRequest('/recipes/meta/cuisines'),
            apiRequest('/recipes/meta/countries')
        ]);

        const cuisineSelect = document.getElementById('cuisine-filter');
        (cuisines.cuisines || []).forEach(c => {
            cuisineSelect.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
        });

        const countrySelect = document.getElementById('country-filter');
        (countries.countries || []).forEach(c => {
            countrySelect.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
        });
    } catch (e) { /* handled */ }
}

// Load generation countries
async function loadGenerationCountries() {
    try {
        const data = await apiRequest('/recipes/meta/generation-countries');
        generationCountries = data.countries || [];
        const select = document.getElementById('generate-country');
        select.innerHTML = '<option value="">Selecteer een land...</option>' +
            generationCountries.map(c => `<option value="${c}">${c}</option>`).join('');
    } catch (e) { /* handled */ }
}

// Filter events
document.getElementById('recipe-search').addEventListener('input', debounce(loadRecipes));
document.getElementById('cuisine-filter').addEventListener('change', loadRecipes);
document.getElementById('country-filter').addEventListener('change', loadRecipes);

// =====================
// Recipe Form
// =====================
function openRecipeForm(recipe = null) {
    document.getElementById('form-title').textContent = (recipe && recipe.id) ? 'Recept bewerken' : 'Recept aanmaken';
    document.getElementById('recipe-id').value = (recipe && recipe.id) ? recipe.id : '';
    document.getElementById('recipe-name').value = recipe ? recipe.name : '';
    document.getElementById('recipe-cuisine').value = recipe ? (recipe.cuisine || '') : '';
    document.getElementById('recipe-country').value = recipe ? (recipe.country_of_origin || '') : '';
    document.getElementById('recipe-servings').value = recipe ? recipe.servings : 4;
    document.getElementById('recipe-prep').value = recipe ? (recipe.prep_time || '') : '';
    document.getElementById('recipe-cook').value = recipe ? (recipe.cook_time || '') : '';
    document.getElementById('recipe-tags').value = recipe ? (recipe.tags || []).join(', ') : '';
    document.getElementById('recipe-weight').value = recipe ? recipe.frequency_weight : 1.0;
    document.getElementById('weight-val').textContent = recipe ? recipe.frequency_weight : '1.0';
    document.getElementById('recipe-instructions').value = recipe ? recipe.instructions : '';

    // Image
    document.getElementById('recipe-image').value = '';
    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('image-preview-img');
    if (recipe && recipe.image_path) {
        preview.classList.remove('hidden');
        previewImg.src = `/uploads/recipes/${recipe.image_path.split('/').pop()}`;
    } else {
        preview.classList.add('hidden');
    }

    // Ingredients
    const list = document.getElementById('ingredients-list');
    list.innerHTML = '';
    if (recipe && recipe.ingredients) {
        recipe.ingredients.forEach(ing => addIngredientRow(ing));
    } else {
        addIngredientRow();
        addIngredientRow();
        addIngredientRow();
    }

    openModal('recipe-form-modal');
}

function addIngredientRow(ing = null) {
    const list = document.getElementById('ingredients-list');
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    const unitVal = ing ? normalizeUnit(ing.unit || '') : '';
    const unitOptions = ['L', 'mL', 'g', 'kg', 'stuks'].map(u =>
        `<option value="${u}"${unitVal === u ? ' selected' : ''}>${u}</option>`
    ).join('');
    row.innerHTML = `
        <div class="ing-name-wrapper">
            <input type="text" placeholder="Ingredi\u00EBnt" class="ing-name" value="${ing ? escapeHtml(ing.name) : ''}" required autocomplete="off">
            <div class="ing-autocomplete hidden"></div>
        </div>
        <input type="text" placeholder="Hoeveelheid" class="ing-amount" value="${ing ? ing.amount : ''}">
        <select class="ing-unit">
            <option value="">Eenheid</option>
            ${unitOptions}
        </select>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="border-color:var(--error);color:var(--error)">&times;</button>
    `;
    list.appendChild(row);

    const nameInput = row.querySelector('.ing-name');
    const dropdown = row.querySelector('.ing-autocomplete');
    setupIngredientAutocomplete(nameInput, dropdown, row);
}

function setupIngredientAutocomplete(input, dropdown, row) {
    input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        if (val.length < 1) {
            dropdown.classList.add('hidden');
            return;
        }
        const matches = existingIngredients.filter(name => name.includes(val)).slice(0, 8);
        if (matches.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }
        dropdown.classList.remove('hidden');
        dropdown.innerHTML = matches.map(m =>
            `<div class="ing-autocomplete-item">${escapeHtml(m)}</div>`
        ).join('');
        dropdown.querySelectorAll('.ing-autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = item.textContent;
                dropdown.classList.add('hidden');
                // Auto-fill unit from mapping defaults if available
                if (row && window._mappedIngredientDefaults) {
                    const mapping = window._mappedIngredientDefaults.find(
                        m => m.ingredient_name === item.textContent.toLowerCase().trim()
                    );
                    if (mapping && mapping.package_unit) {
                        const unitSelect = row.querySelector('.ing-unit');
                        if (unitSelect) {
                            unitSelect.value = normalizeUnit(mapping.package_unit);
                        }
                    }
                }
            });
        });
    });
    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.add('hidden'), 150);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dropdown.classList.add('hidden');
        if (e.key === 'Enter') {
            const topItem = dropdown.querySelector('.ing-autocomplete-item');
            if (topItem && !dropdown.classList.contains('hidden')) {
                e.preventDefault();
                topItem.dispatchEvent(new Event('mousedown'));
                // Move focus to amount field
                const amountInput = row.querySelector('.ing-amount');
                if (amountInput) amountInput.focus();
            }
        }
    });
}

async function loadExistingIngredients() {
    try {
        const data = await apiRequest('/recipes/meta/ingredients');
        existingIngredients = data.ingredients || [];
    } catch (e) { /* handled */ }
}

async function loadMappedIngredientDefaults() {
    try {
        const data = await apiRequest('/mappings/defaults');
        window._mappedIngredientDefaults = data.defaults || [];
    } catch (e) { /* handled */ }
}

async function saveRecipe() {
    const id = document.getElementById('recipe-id').value;
    const name = document.getElementById('recipe-name').value.trim();
    const instructions = document.getElementById('recipe-instructions').value.trim();

    if (!name || !instructions) {
        showToast('Naam en bereidingswijze zijn verplicht', 'error');
        return;
    }

    // Collect ingredients
    const rows = document.querySelectorAll('.ingredient-row');
    const ingredients = [];
    rows.forEach(row => {
        const n = row.querySelector('.ing-name').value.trim();
        const a = row.querySelector('.ing-amount').value.trim();
        const u = row.querySelector('.ing-unit').value.trim();
        if (n) ingredients.push({ name: n, amount: a, unit: u });
    });

    if (ingredients.length === 0) {
        showToast('Voeg minimaal \u00E9\u00E9n ingredi\u00EBnt toe', 'error');
        return;
    }

    const tagsStr = document.getElementById('recipe-tags').value;
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    const recipeData = {
        name,
        cuisine: document.getElementById('recipe-cuisine').value.trim() || null,
        country_of_origin: document.getElementById('recipe-country').value.trim() || null,
        servings: parseInt(document.getElementById('recipe-servings').value) || 4,
        prep_time: parseInt(document.getElementById('recipe-prep').value) || null,
        cook_time: parseInt(document.getElementById('recipe-cook').value) || null,
        frequency_weight: parseFloat(document.getElementById('recipe-weight').value) || 1.0,
        ingredients,
        instructions,
        tags
    };

    try {
        let recipeId = id;
        if (id) {
            await apiRequest(`/recipes/${id}`, {
                method: 'PUT',
                body: JSON.stringify(recipeData)
            });
            showToast('Recept bijgewerkt', 'success');
        } else {
            const result = await apiRequest('/recipes', {
                method: 'POST',
                body: JSON.stringify(recipeData)
            });
            recipeId = result.recipe?.id;
            showToast('Recept aangemaakt', 'success');
        }

        // Upload image if selected
        const imageInput = document.getElementById('recipe-image');
        if (imageInput.files.length > 0 && recipeId) {
            const formData = new FormData();
            formData.append('image', imageInput.files[0]);
            await apiRequest(`/recipes/${recipeId}/image`, {
                method: 'POST',
                body: formData
            });
        }

        closeModal('recipe-form-modal');
        loadRecipes();
        loadFilters();
    } catch (e) { /* handled */ }
}

// =====================
// View Recipe Detail
// =====================
async function viewRecipe(id) {
    try {
        const data = await apiRequest(`/recipes/${id}`);
        const r = data.recipe;

        document.getElementById('detail-title').textContent = r.name;

        const totalTime = (r.prep_time || 0) + (r.cook_time || 0);
        const ingredientsList = (r.ingredients || [])
            .map(i => `<li>${escapeHtml(i.name)} - ${i.amount} ${i.unit}</li>`)
            .join('');

        document.getElementById('detail-body').innerHTML = `
            ${r.image_path ? `<img src="/uploads/recipes/${r.image_path.split('/').pop()}" class="detail-image">` : ''}
            <div class="detail-meta">
                ${r.cuisine ? `<span class="tag">${escapeHtml(r.cuisine)}</span>` : ''}
                ${r.country_of_origin ? `<span class="tag">${escapeHtml(r.country_of_origin)}</span>` : ''}
                ${totalTime ? `<span class="tag">${formatTime(totalTime)}</span>` : ''}
                <span class="tag">${r.servings} porties</span>
            </div>
            <h3 style="margin:16px 0 8px">Ingredi\u00EBnten</h3>
            <ul class="detail-ingredients">${ingredientsList}</ul>
            <h3 style="margin:16px 0 8px">Bereidingswijze</h3>
            <div class="detail-instructions">${escapeHtml(r.instructions).replace(/\n/g, '<br>')}</div>
        `;

        document.getElementById('detail-footer').innerHTML = `
            <button class="btn btn-secondary" onclick="addToQueue(${r.id})">Aan wachtrij toevoegen</button>
            <button class="btn btn-secondary" onclick="closeModal('recipe-detail-modal');openRecipeForm(${JSON.stringify(r).replace(/"/g, '&quot;')})">Bewerken</button>
            <button class="btn-trash btn-trash--confirm" onclick="confirmDeleteRecipe(this, ${r.id})" title="Recept verwijderen" style="padding:8px">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
        `;

        openModal('recipe-detail-modal');
    } catch (e) { /* handled */ }
}

window.viewRecipe = viewRecipe;

async function addToQueue(recipeId) {
    try {
        const data = await apiRequest(`/queue/add/${recipeId}`, { method: 'POST' });
        showToast(`"${data.queueItem.name}" toegevoegd aan wachtrij`, 'success');
        updateQueueBadge();
        closeModal('recipe-detail-modal');
    } catch (e) { /* handled */ }
}

async function deleteRecipe(id) {
    try {
        await apiRequest(`/recipes/${id}`, { method: 'DELETE' });
        showToast('Recept verwijderd', 'success');
        closeModal('recipe-detail-modal');
        loadRecipes();
    } catch (e) { /* handled */ }
}

let confirmDeleteTimer = null;
function confirmDeleteRecipe(btn, id) {
    if (btn.classList.contains('armed')) {
        clearTimeout(confirmDeleteTimer);
        btn.classList.remove('armed');
        deleteRecipe(id);
        return;
    }
    btn.classList.add('armed');
    confirmDeleteTimer = setTimeout(() => btn.classList.remove('armed'), 3000);
}

// =====================
// Generate Recipe (LLM)
// =====================
function openGenerateModal() {
    document.getElementById('generate-status').classList.add('hidden');
    document.getElementById('generate-raw').classList.add('hidden');
    document.getElementById('generate-btn').disabled = false;
    openModal('generate-modal');
}

function randomCountry() {
    if (generationCountries.length === 0) return;
    const idx = Math.floor(Math.random() * generationCountries.length);
    document.getElementById('generate-country').value = generationCountries[idx];
}

async function generateRecipe() {
    const country = document.getElementById('generate-country').value;
    if (!country) {
        showToast('Selecteer eerst een land', 'error');
        return;
    }

    document.getElementById('generate-btn').disabled = true;
    const statusEl = document.getElementById('generate-status');
    const rawEl = document.getElementById('generate-raw');
    statusEl.classList.remove('hidden');
    rawEl.classList.add('hidden');
    document.getElementById('generate-status-text').textContent = `Recept genereren uit ${country}...`;

    try {
        const instructions = document.getElementById('generate-instructions').value.trim();
        const data = await apiRequest('/recipes/generate', {
            method: 'POST',
            body: JSON.stringify({ country, instructions: instructions || undefined })
        });

        statusEl.classList.add('hidden');

        if (data.success && data.recipe) {
            closeModal('generate-modal');
            openRecipeForm(data.recipe);
            showToast(`Gegenereerd: ${data.recipe.name}`, 'success');
        } else {
            rawEl.classList.remove('hidden');
            document.getElementById('generate-raw-text').value = data.raw || data.error || 'Geen respons';
            showToast('Recept verwerken mislukt. Zie ruwe respons hieronder.', 'error');
        }
    } catch (e) {
        statusEl.classList.add('hidden');
        rawEl.classList.remove('hidden');
        document.getElementById('generate-raw-text').value = e.message;
    } finally {
        document.getElementById('generate-btn').disabled = false;
    }
}

function copyRaw() {
    const text = document.getElementById('generate-raw-text').value;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Gekopieerd naar klembord', 'success', 2000);
    });
}

// =====================
// Upload photo from recipe card
// =====================
async function uploadCardPhoto(recipeId, input) {
    const file = input.files[0];
    if (!file) return;
    try {
        const formData = new FormData();
        formData.append('image', file);
        await apiRequest(`/recipes/${recipeId}/image`, {
            method: 'POST',
            body: formData
        });
        showToast('Foto toegevoegd', 'success');
        loadRecipes();
    } catch (e) {
        showToast('Foto uploaden mislukt', 'error');
    }
}

// =====================
// Init
// =====================
document.addEventListener('DOMContentLoaded', () => {
    loadHeader('recipes');

    // Image preview on file select
    document.getElementById('recipe-image').addEventListener('change', (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById('image-preview');
        const previewImg = document.getElementById('image-preview-img');
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                previewImg.src = ev.target.result;
                preview.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        } else {
            preview.classList.add('hidden');
        }
    });

    loadRecipes();
    loadFilters();
    loadGenerationCountries();
    loadExistingIngredients();
    loadMappedIngredientDefaults();
});
