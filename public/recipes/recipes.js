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
                : `<div class="recipe-card-image recipe-placeholder">${r.cuisine ? r.cuisine[0].toUpperCase() : '?'}</div>`
            }
            <div class="recipe-card-body">
                <h3 class="recipe-card-title">${escapeHtml(r.name)}</h3>
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
    row.innerHTML = `
        <div class="ing-name-wrapper">
            <input type="text" placeholder="Ingredi\u00EBnt" class="ing-name" value="${ing ? escapeHtml(ing.name) : ''}" required autocomplete="off">
            <div class="ing-autocomplete hidden"></div>
        </div>
        <input type="text" placeholder="Hoeveelheid" class="ing-amount" value="${ing ? ing.amount : ''}">
        <input type="text" placeholder="Eenheid" class="ing-unit" value="${ing ? (ing.unit || '') : ''}">
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="border-color:var(--error);color:var(--error)">&times;</button>
    `;
    list.appendChild(row);

    const nameInput = row.querySelector('.ing-name');
    const dropdown = row.querySelector('.ing-autocomplete');
    setupIngredientAutocomplete(nameInput, dropdown);
}

function setupIngredientAutocomplete(input, dropdown) {
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
            });
        });
    });
    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.add('hidden'), 150);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dropdown.classList.add('hidden');
    });
}

async function loadExistingIngredients() {
    try {
        const data = await apiRequest('/recipes/meta/ingredients');
        existingIngredients = data.ingredients || [];
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
            <button class="btn btn-danger" onclick="deleteRecipe(${r.id})">Verwijderen</button>
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
    if (!confirm('Dit recept verwijderen?')) return;
    try {
        await apiRequest(`/recipes/${id}`, { method: 'DELETE' });
        showToast('Recept verwijderd', 'success');
        closeModal('recipe-detail-modal');
        loadRecipes();
    } catch (e) { /* handled */ }
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
});
