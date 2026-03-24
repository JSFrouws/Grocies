const fs = require('fs');
const path = require('path');

const DEFAULTS = {
    // Household
    household_size: 4,           // default servings per recipe

    // Recipe selection
    avoid_days: 14,              // days before a recipe can repeat
    expiry_boost_days: 7,        // days before expiry to trigger weight boost
    expiry_boost_factor: 3.0,    // how much to boost expiring-ingredient recipes

    // Recipe generation
    recipe_language: 'Dutch',    // language for LLM-generated recipes

    // Jumbo session
    session_ttl_hours: 4,        // hours before re-checking Jumbo session

    // GitHub integration
    github_repo: 'JSFrouws/Grocies',
    github_token: '',            // personal access token with repo scope

    // Claude / Anthropic
    anthropic_api_key: '',       // Anthropic API key for Claude LLM

    // Mistral (voice transcription)
    mistral_api_key: '',         // Mistral API key for Vox speech-to-text

    // App metadata
    app_name: 'Grocies',
    app_version: '1.0.0'
};

class SettingsService {
    constructor(settingsPath = './data/settings.json') {
        this.settingsPath = settingsPath;
        this.settings = { ...DEFAULTS };
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const raw = fs.readFileSync(this.settingsPath, 'utf8');
                const stored = JSON.parse(raw);
                this.settings = { ...DEFAULTS, ...stored };
            }
        } catch (e) {
            console.warn('Settings load error, using defaults:', e.message);
            this.settings = { ...DEFAULTS };
        }
    }

    save() {
        try {
            const dir = path.dirname(this.settingsPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
        } catch (e) {
            console.error('Settings save error:', e.message);
            throw e;
        }
    }

    getAll() {
        // Never expose the token in full — mask it for the UI
        const safe = { ...this.settings };
        if (safe.github_token && safe.github_token.length > 8) {
            safe.github_token_masked = safe.github_token.slice(0, 4) + '••••' + safe.github_token.slice(-4);
        }
        if (safe.anthropic_api_key && safe.anthropic_api_key.length > 8) {
            safe.anthropic_api_key_masked = safe.anthropic_api_key.slice(0, 4) + '••••' + safe.anthropic_api_key.slice(-4);
        }
        if (safe.mistral_api_key && safe.mistral_api_key.length > 8) {
            safe.mistral_api_key_masked = safe.mistral_api_key.slice(0, 4) + '••••' + safe.mistral_api_key.slice(-4);
        }
        return safe;
    }

    get(key) {
        return this.settings[key] !== undefined ? this.settings[key] : DEFAULTS[key];
    }

    update(updates) {
        // Validate numeric fields
        const numericFields = ['household_size', 'avoid_days', 'expiry_boost_days',
                               'expiry_boost_factor', 'session_ttl_hours'];
        for (const field of numericFields) {
            if (updates[field] !== undefined) {
                updates[field] = parseFloat(updates[field]);
                if (isNaN(updates[field])) delete updates[field];
            }
        }
        // Don't allow overwriting app_version via API
        delete updates.app_version;

        this.settings = { ...this.settings, ...updates };
        this.save();
        return this.getAll();
    }

    getDefaults() {
        return { ...DEFAULTS };
    }

    hasGitHubToken() {
        return !!(this.settings.github_token && this.settings.github_token.trim().length > 0);
    }
}

module.exports = SettingsService;
