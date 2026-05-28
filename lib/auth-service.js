const { JumboBrowserAuth } = require('../jumbo/jumbo-auth-browser');
const fs = require('fs');
const path = require('path');

// Session is considered fresh for this long without a real Jumbo check
const SESSION_TTL_MS = (parseInt(process.env.AUTH_SESSION_TTL_HOURS) || 4) * 60 * 60 * 1000;
// Minimum gap between auto-login attempts after a failure
const RELOGIN_COOLDOWN_MS = 5 * 60 * 1000;

class AuthService {
    constructor(credentialsPath = './data/credentials.json') {
        this.credentialsPath = credentialsPath;
        this.jumboAuth = new JumboBrowserAuth({ verbose: true, screenshotDir: './data' });
        this.currentUser = null;
        this.authCookies = null;
        this.sessionValidatedAt = null;
        this._reloginInProgress = false;
        this._reloginPromise = null;   // active autoLogin() promise while in progress
        this._lastLoginFailedAt = null; // timestamp of last failed auto-login
        this._savedPassword = null;

        this.loadSavedCredentials();
    }

    loadSavedCredentials() {
        try {
            if (fs.existsSync(this.credentialsPath)) {
                const data = fs.readFileSync(this.credentialsPath, 'utf8');
                const saved = JSON.parse(data);
                if (saved.cookies && saved.customerId) {
                    this.authCookies = saved.cookies;
                    this.currentUser = { customerId: saved.customerId, email: saved.email || null };
                    this._savedPassword = saved.password || null;
                    console.log('✓ Loaded saved Jumbo credentials');
                }
            }
        } catch (error) {
            console.error('Error loading saved credentials:', error.message);
        }
    }

    saveCredentials(email, password, cookies, customerId) {
        try {
            const dataDir = path.dirname(this.credentialsPath);
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            const data = { email, password, cookies, customerId, savedAt: new Date().toISOString() };
            fs.writeFileSync(this.credentialsPath, JSON.stringify(data, null, 2));
            console.log('✓ Saved Jumbo credentials');
        } catch (error) {
            console.error('Error saving credentials:', error.message);
        }
    }

    async login(email, password, remember = true) {
        try {
            console.log(`Attempting Jumbo login for ${email}...`);
            const result = await this.jumboAuth.login(email, password);

            if (!result || !result.cookies) {
                throw new Error('Authentication failed: no cookies returned from Jumbo');
            }

            this.authCookies = result.cookies;
            // customerId may be 'unknown' if CdId cookie wasn't present but login still succeeded
            const customerId = result.customerId !== 'unknown' ? result.customerId : (this.currentUser?.customerId || 'unknown');
            this.currentUser = { customerId, email };
            this._savedPassword = password;
            this.sessionValidatedAt = Date.now();
            this._lastLoginFailedAt = null;

            if (remember) this.saveCredentials(email, password, result.cookies, customerId);

            console.log(`✓ Logged in as ${email} (ID: ${customerId})`);
            return { success: true, customerId, email };
        } catch (error) {
            console.error('Login error:', error.message);
            this.currentUser = null;
            this.authCookies = null;
            this.sessionValidatedAt = null;
            this._lastLoginFailedAt = Date.now();
            return { success: false, error: error.message };
        }
    }

    // Silently re-authenticate using saved credentials
    async autoLogin() {
        if (this._reloginInProgress) {
            // Return the already-running promise so callers can await it
            return this._reloginPromise || { success: false, error: 'Relogin already in progress' };
        }
        try {
            if (!fs.existsSync(this.credentialsPath)) return { success: false, error: 'No saved credentials' };
            const saved = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
            if (!saved.email || !saved.password) return { success: false, error: 'No password in saved credentials' };

            this._reloginInProgress = true;
            console.log('Auto-login: re-authenticating with saved credentials...');
            return await this.login(saved.email, saved.password, true);
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            this._reloginInProgress = false;
            this._reloginPromise = null;
        }
    }

    /**
     * Fire-and-forget background auto-login.
     * Respects a cooldown to avoid hammering Puppeteer when repeated requests arrive
     * while a Jumbo session is not yet established.
     * Safe to call on every request — it is a no-op when already logged in,
     * already re-logging in, or within the cooldown window.
     */
    triggerAutoLogin() {
        if (this.isAuthenticated()) return;
        if (this._reloginInProgress) return;
        if (!this.hasSavedCredentials()) return;

        // Don't retry within the cooldown window after a failure
        if (this._lastLoginFailedAt && (Date.now() - this._lastLoginFailedAt) < RELOGIN_COOLDOWN_MS) return;

        console.log('Background auto-login triggered...');
        this._reloginPromise = this.autoLogin().then(result => {
            if (!result.success) {
                console.warn('Background auto-login failed:', result.error);
            } else {
                console.log('✓ Background auto-login successful');
            }
            return result;
        });
    }

    /**
     * Wait until the app is authenticated, up to timeoutMs.
     * Triggers auto-login if not already in progress.
     * Returns true if authenticated, false if timed out or no credentials.
     */
    async ensureLoggedIn(timeoutMs = 90000) {
        if (this.isAuthenticated()) return true;
        if (!this.hasSavedCredentials()) return false;

        this.triggerAutoLogin();

        if (!this._reloginPromise) return false;

        const result = await Promise.race([
            this._reloginPromise,
            new Promise(resolve => setTimeout(() => resolve({ success: false, error: 'timeout' }), timeoutMs))
        ]);

        return result.success === true;
    }

    // Test whether current cookies are still accepted by Jumbo (calls getProfile).
    // If within SESSION_TTL_MS of last successful check, returns cached result without hitting Jumbo.
    async validateSession(jumboGraphQL) {
        if (!this.isAuthenticated()) return { valid: false, reason: 'not_authenticated' };

        if (this.sessionValidatedAt && (Date.now() - this.sessionValidatedAt) < SESSION_TTL_MS) {
            return { valid: true, cached: true };
        }

        try {
            await jumboGraphQL.getProfile();
            this.sessionValidatedAt = Date.now();
            return { valid: true };
        } catch (err) {
            console.warn('Jumbo session check failed:', err.message);
            // Session expired — clear auth state so triggerAutoLogin kicks in on next request
            this.authCookies = null;
            this.currentUser = null;
            this.sessionValidatedAt = null;
            return { valid: false, reason: 'session_expired' };
        }
    }

    logout() {
        this.currentUser = null;
        this.authCookies = null;
        this.sessionValidatedAt = null;
        this._savedPassword = null;
        this._lastLoginFailedAt = null;
        try {
            if (fs.existsSync(this.credentialsPath)) fs.unlinkSync(this.credentialsPath);
            console.log('✓ Logged out and cleared credentials');
        } catch (error) {
            console.error('Error clearing credentials:', error.message);
        }
        return { success: true };
    }

    hasSavedCredentials() {
        try {
            if (!fs.existsSync(this.credentialsPath)) return false;
            const saved = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
            return !!(saved.email && saved.password);
        } catch (e) { return false; }
    }

    isAuthenticated() { return this.currentUser !== null && this.authCookies !== null; }
    getCurrentUser() { return this.currentUser; }
    getAuthCookies() { return this.authCookies; }
    getCustomerId() { return this.currentUser ? this.currentUser.customerId : null; }
    getSessionAge() { return this.sessionValidatedAt ? Date.now() - this.sessionValidatedAt : null; }
    getSessionTTL() { return SESSION_TTL_MS; }
    isReloginInProgress() { return this._reloginInProgress; }

    requireAuth() {
        return (req, res, next) => {
            if (!this.isAuthenticated()) {
                return res.status(401).json({ success: false, error: 'Authentication required.' });
            }
            req.user = this.currentUser;
            req.authCookies = this.authCookies;
            next();
        };
    }
}

module.exports = AuthService;
