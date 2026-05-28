/**
 * Jumbo Browser Authentication Module
 *
 * Uses Puppeteer to perform real browser login through the Auth0 flow at auth.jumbo.com.
 * Jumbo's login page is a Nuxt SPA that JS-redirects to auth.jumbo.com — we handle both
 * the SPA redirect and the multi-hop callback chain back to www.jumbo.com.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class JumboBrowserAuth {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.headless = options.headless !== false;
        this.screenshotDir = options.screenshotDir || './data';
    }

    log(...args) {
        if (this.verbose) console.log('[JumboAuth]', ...args);
    }

    /**
     * Login using real browser automation.
     * Handles the full Auth0 flow:
     *   www.jumbo.com/account/inloggen (Nuxt SPA)
     *     → auth.jumbo.com/u/login?state=... (Auth0 Universal Login)
     *     → (form submit)
     *     → auth.jumbo.com/authorize/resume?state=...
     *     → www.jumbo.com/api/auth/callback?code=...
     *     → www.jumbo.com/ (logged in)
     */
    async login(username, password) {
        this.log('Starting browser-based login...');

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: this.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--lang=nl-NL'
                ]
            });

            const page = await browser.newPage();

            // Hide Puppeteer automation signals to avoid bot detection
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'languages', { get: () => ['nl-NL', 'nl', 'en'] });
                window.chrome = { runtime: {} };
            });

            await page.setViewport({ width: 1280, height: 720 });
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            );

            // Accept cookies header to avoid consent popups blocking the form
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'nl-NL,nl;q=0.9' });

            // Step 1: Navigate to Jumbo login page (Nuxt SPA)
            this.log('Navigating to www.jumbo.com/account/inloggen...');
            await page.goto('https://www.jumbo.com/account/inloggen', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            this.log('After goto, URL:', page.url());

            // Step 2: Nuxt SPA may redirect to auth.jumbo.com via JS — wait for it
            if (!page.url().includes('auth.jumbo.com')) {
                this.log('Waiting for Auth0 redirect from Nuxt SPA...');
                try {
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
                    this.log('After redirect, URL:', page.url());
                } catch (navErr) {
                    this.log('No navigation detected after goto — current URL:', page.url());
                }
            }

            // If still not on auth.jumbo.com, try the direct auth endpoint
            if (!page.url().includes('auth.jumbo.com')) {
                this.log('Not on auth.jumbo.com, trying direct auth endpoint...');
                await page.goto('https://www.jumbo.com/api/auth/login?returnTo=%2F', {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
                this.log('After direct auth, URL:', page.url());

                if (!page.url().includes('auth.jumbo.com')) {
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
                    this.log('After second wait, URL:', page.url());
                }
            }

            // Step 3: Wait for the login form on auth.jumbo.com
            this.log('Waiting for login form...');
            await page.waitForSelector(
                'input[name="username"], input[type="email"], #username, input[autocomplete="username"]',
                { timeout: 15000, visible: true }
            );
            this.log('Login form found, URL:', page.url());

            // Step 4: Fill in email/username
            const emailSelectors = [
                'input[name="username"]',
                'input[type="email"]',
                '#username',
                'input[autocomplete="username"]',
                'input[autocomplete="email"]'
            ];
            let emailField = null;
            for (const sel of emailSelectors) {
                emailField = await page.$(sel);
                if (emailField) { this.log('Email field:', sel); break; }
            }
            if (!emailField) throw new Error('Could not find email field');

            await emailField.click({ clickCount: 3 });
            await emailField.type(username, { delay: 40 });

            // Step 5: Some Auth0 forms are two-step (email → continue → password).
            // Check if password is already visible, or if we need to click continue first.
            let passwordField = await page.$('input[name="password"]') ||
                                await page.$('input[type="password"]');

            if (!passwordField) {
                this.log('Password not visible yet, looking for continue button...');
                const continueButton = await page.$('button[type="submit"]');
                if (continueButton) {
                    await continueButton.click();
                    await page.waitForSelector(
                        'input[name="password"], input[type="password"]',
                        { timeout: 10000, visible: true }
                    ).catch(() => {});
                    passwordField = await page.$('input[name="password"]') ||
                                   await page.$('input[type="password"]');
                }
            }

            if (!passwordField) throw new Error('Could not find password field');
            this.log('Password field found');

            await passwordField.click({ clickCount: 3 });
            await passwordField.type(password, { delay: 40 });

            // Step 6: Submit and wait for the full redirect chain back to www.jumbo.com
            this.log('Submitting login form...');
            const submitButton = await page.$('button[type="submit"]') ||
                                 await page.$('button[name="action"]');
            if (!submitButton) throw new Error('Could not find submit button');

            // The chain: auth.jumbo.com/u/login → auth.jumbo.com/authorize/resume
            //   → jumbo.com/api/auth/callback → www.jumbo.com/api/auth/callback → www.jumbo.com/
            // We wait for the FIRST navigation (away from the login form), then poll until
            // we land on www.jumbo.com (not auth.jumbo.com).
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
                submitButton.click()
            ]);

            // Follow remaining redirects until we're on www.jumbo.com
            const deadline = Date.now() + 20000;
            while (
                (page.url().includes('auth.jumbo.com') || page.url().includes('/api/auth/callback')) &&
                Date.now() < deadline
            ) {
                this.log('Still in redirect chain, URL:', page.url());
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
            }

            this.log('Final URL after login:', page.url());

            // Small pause for cookies to settle
            await new Promise(r => setTimeout(r, 1500));

            // Step 7: Collect cookies
            const cookies = await page.cookies();
            this.log('Total cookies:', cookies.length);

            const jumboContextCookies = cookies.filter(c =>
                c.domain && (c.domain.includes('jumbo.com') || c.domain.includes('.jumbo.com'))
            );

            // Find auth indicators
            const cdIdCookie = jumboContextCookies.find(c => c.name === 'CdId');
            const authTokenCookie = jumboContextCookies.find(c =>
                c.name === 'authentication-token' ||
                c.name.toLowerCase().includes('auth') ||
                c.name.toLowerCase().includes('token') ||
                c.name.toLowerCase().includes('session')
            );

            if (this.verbose) {
                this.log('Jumbo cookies:', jumboContextCookies.map(c => c.name).join(', '));
            }

            if (!cdIdCookie && !authTokenCookie && !page.url().startsWith('https://www.jumbo.com')) {
                await this._saveDebugScreenshot(page, 'login-failed');
                throw new Error(
                    `Login failed — not redirected to jumbo.com (URL: ${page.url()}). ` +
                    'Debug screenshot saved to data/login-failed.png'
                );
            }

            // Even if CdId is missing, if we landed on www.jumbo.com the login likely succeeded
            if (!cdIdCookie && !authTokenCookie) {
                this.log('Warning: no explicit auth cookie found, but landed on www.jumbo.com — assuming success');
            }

            const cookieString = jumboContextCookies
                .map(c => `${c.name}=${c.value}`)
                .join('; ');

            const customerId = cdIdCookie ? cdIdCookie.value : 'unknown';
            this.log('Login successful, customerId:', customerId);

            await browser.close();
            return { success: true, cookies: cookieString, customerId };

        } catch (error) {
            console.error('[JumboAuth] Login failed:', error.message);

            if (browser) {
                try {
                    const pages = await browser.pages();
                    if (pages.length > 0) {
                        await this._saveDebugScreenshot(pages[0], 'login-error');
                    }
                } catch (_) {}
                await browser.close();
            }

            return { success: false, error: error.message };
        }
    }

    async _saveDebugScreenshot(page, name) {
        try {
            const screenshotPath = path.join(this.screenshotDir, `${name}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`[JumboAuth] Debug screenshot saved: ${screenshotPath}`);
        } catch (e) {
            console.warn('[JumboAuth] Could not save screenshot:', e.message);
        }
    }
}

module.exports = { JumboBrowserAuth };
