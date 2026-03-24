// Settings page logic
let currentSettings = {};

document.addEventListener('DOMContentLoaded', async () => {
    await loadHeader('settings');
    await loadSettings();
});

async function loadSettings() {
    try {
        const data = await apiRequest('/settings');
        currentSettings = data.settings;
        populateForm(data.settings);
    } catch (e) {
        showToast('Kon instellingen niet laden: ' + e.message, 'error');
    }
}

function populateForm(s) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    set('household_size', s.household_size);
    set('avoid_days', s.avoid_days);
    set('expiry_boost_days', s.expiry_boost_days);
    set('expiry_boost_factor', s.expiry_boost_factor);
    set('recipe_language', s.recipe_language);
    set('session_ttl_hours', s.session_ttl_hours);
    set('github_repo', s.github_repo);

    // Token: show masked version as placeholder, leave input empty so user can type a new one
    const tokenInput = document.getElementById('github_token');
    if (tokenInput) {
        tokenInput.value = '';
        tokenInput.placeholder = s.github_token_masked || 'ghp_…';
    }

    const anthropicInput = document.getElementById('anthropic_api_key');
    if (anthropicInput) {
        anthropicInput.value = '';
        anthropicInput.placeholder = s.anthropic_api_key_masked || 'sk-ant-…';
    }

    const mistralInput = document.getElementById('mistral_api_key');
    if (mistralInput) {
        mistralInput.value = '';
        mistralInput.placeholder = s.mistral_api_key_masked || 'sk-…';
    }

    // App info
    const versionEl = document.getElementById('info-version');
    if (versionEl) versionEl.textContent = s.app_version || '—';

    const repoLinkEl = document.getElementById('info-repo-link');
    if (repoLinkEl && s.github_repo) {
        repoLinkEl.href = `https://github.com/${s.github_repo}`;
        repoLinkEl.textContent = `github.com/${s.github_repo}`;
    }
}

async function saveAll() {
    const btn = document.getElementById('save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Opslaan…'; }

    const updates = {
        household_size: document.getElementById('household_size')?.value,
        avoid_days: document.getElementById('avoid_days')?.value,
        expiry_boost_days: document.getElementById('expiry_boost_days')?.value,
        expiry_boost_factor: document.getElementById('expiry_boost_factor')?.value,
        recipe_language: document.getElementById('recipe_language')?.value,
        session_ttl_hours: document.getElementById('session_ttl_hours')?.value,
        github_repo: document.getElementById('github_repo')?.value?.trim()
    };

    // Only include tokens if the user actually typed something new
    const tokenVal = document.getElementById('github_token')?.value?.trim();
    if (tokenVal) updates.github_token = tokenVal;

    const anthropicVal = document.getElementById('anthropic_api_key')?.value?.trim();
    if (anthropicVal) updates.anthropic_api_key = anthropicVal;

    const mistralVal = document.getElementById('mistral_api_key')?.value?.trim();
    if (mistralVal) updates.mistral_api_key = mistralVal;

    try {
        const data = await apiRequest('/settings', {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
        currentSettings = data.settings;
        populateForm(data.settings);
        showToast('Instellingen opgeslagen', 'success');
    } catch (e) {
        showToast('Opslaan mislukt: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Opslaan'; }
    }
}

async function resetDefaults() {
    if (!confirm('Alle instellingen terugzetten naar standaard?')) return;
    try {
        const data = await apiRequest('/settings/reset', { method: 'POST' });
        currentSettings = data.settings;
        populateForm(data.settings);
        showToast('Instellingen teruggezet', 'info');
    } catch (e) {
        showToast('Reset mislukt: ' + e.message, 'error');
    }
}

async function testGitHub() {
    const btn = document.getElementById('test-gh-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Testen…'; }

    const repo = document.getElementById('github_repo')?.value?.trim()
                 || currentSettings.github_repo;

    if (!repo) {
        showToast('Vul eerst een GitHub repository in', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Verbinding testen'; }
        return;
    }

    try {
        const r = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: { 'User-Agent': 'Grocies-App/1.0', 'Accept': 'application/vnd.github.v3+json' }
        });
        const json = await r.json();
        const statusRow = document.getElementById('token-status-row');
        const statusEl = document.getElementById('token-status');
        if (statusRow) statusRow.style.display = 'flex';
        if (r.ok) {
            if (statusEl) statusEl.innerHTML = `✅ Repository gevonden: <strong>${json.full_name}</strong> (${json.visibility})`;
            showToast('GitHub repository bereikbaar', 'success');
        } else {
            if (statusEl) statusEl.textContent = `❌ ${json.message}`;
            showToast('Repository niet bereikbaar: ' + json.message, 'error');
        }
    } catch (e) {
        showToast('GitHub test mislukt: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Verbinding testen'; }
    }
}

function toggleTokenVisibility() {
    const input = document.getElementById('github_token');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

function toggleAnthropicKeyVisibility() {
    const input = document.getElementById('anthropic_api_key');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

function toggleMistralKeyVisibility() {
    const input = document.getElementById('mistral_api_key');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}
