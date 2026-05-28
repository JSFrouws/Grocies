/**
 * Standalone Jumbo login debug script.
 *
 * Run with: node experiments/test-jumbo-login.js
 *
 * Reads credentials from data/credentials.json, or pass inline:
 *   JUMBO_EMAIL=you@example.com JUMBO_PASS=secret node experiments/test-jumbo-login.js
 *
 * Saves a screenshot of every step and prints all cookies so you can see exactly
 * what Puppeteer sees vs. a real browser.
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const CREDENTIALS_PATH = path.join(__dirname, '../data/credentials.json');
const SCREENSHOT_DIR   = path.join(__dirname, 'screenshots');

let EMAIL = process.env.JUMBO_EMAIL;
let PASS  = process.env.JUMBO_PASS;

if (!EMAIL || !PASS) {
    try {
        const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        EMAIL = EMAIL || creds.email;
        PASS  = PASS  || creds.password;
    } catch (_) {}
}

if (!EMAIL || !PASS) {
    console.error('No credentials found. Set JUMBO_EMAIL and JUMBO_PASS env vars, or populate data/credentials.json');
    process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let stepCount = 0;
async function snap(page, label) {
    const file = path.join(SCREENSHOT_DIR, `${String(++stepCount).padStart(2, '0')}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  📸 ${file}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\n🧪 Jumbo Login Debug Test\n' + '='.repeat(50));
    console.log(`Email: ${EMAIL}`);
    console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--lang=nl-NL'
        ]
    });

    const page = await browser.newPage();

    // Hide webdriver fingerprint
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', { get: () => ['nl-NL', 'nl', 'en'] });
        window.chrome = { runtime: {} };
    });

    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'nl-NL,nl;q=0.9' });

    // Track all navigations
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
            console.log('  → navigation:', frame.url());
        }
    });

    try {
        // ── Step 1: Jumbo login page ───────────────────────────────────────────
        console.log('\n[1] Navigating to www.jumbo.com/account/inloggen...');
        await page.goto('https://www.jumbo.com/account/inloggen', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await snap(page, 'jumbo-login-page');
        console.log('    URL:', page.url());

        // ── Step 2: Wait for Auth0 redirect ───────────────────────────────────
        if (!page.url().includes('auth.jumbo.com')) {
            console.log('\n[2] Waiting for Auth0 redirect...');
            try {
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
                await snap(page, 'after-auth0-redirect');
                console.log('    URL:', page.url());
            } catch (e) {
                console.log('    No navigation — trying direct auth endpoint...');
                await page.goto('https://www.jumbo.com/api/auth/login?returnTo=%2F', {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
                if (!page.url().includes('auth.jumbo.com')) {
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
                }
                await snap(page, 'after-direct-auth');
                console.log('    URL:', page.url());
            }
        }

        // ── Step 3: Inspect form fields ───────────────────────────────────────
        console.log('\n[3] Looking for login form on:', page.url());
        const inputs = await page.$$eval('input', els =>
            els.map(e => ({ type: e.type, name: e.name, id: e.id, placeholder: e.placeholder }))
        );
        console.log('    Inputs found:', JSON.stringify(inputs, null, 2));

        const buttons = await page.$$eval('button', els =>
            els.map(e => ({ type: e.type, name: e.name, text: e.textContent.trim().substring(0, 40) }))
        );
        console.log('    Buttons found:', JSON.stringify(buttons, null, 2));

        // ── Step 4: Fill email ─────────────────────────────────────────────────
        await page.waitForSelector(
            'input[name="username"], input[type="email"], #username',
            { timeout: 15000, visible: true }
        );
        console.log('\n[4] Filling email...');
        const emailSel = ['input[name="username"]', 'input[type="email"]', '#username']
            .find(async s => await page.$(s));
        // Fallback: just type into the first text-like input
        await page.click('input[name="username"], input[type="email"], #username', { clickCount: 3 });
        await page.type('input[name="username"], input[type="email"], #username', EMAIL, { delay: 40 });
        await snap(page, 'email-filled');

        // ── Step 5: Check for password or two-step ────────────────────────────
        console.log('\n[5] Looking for password field...');
        let passField = await page.$('input[name="password"]') || await page.$('input[type="password"]');

        if (!passField) {
            console.log('    Password not visible, clicking continue...');
            const btn = await page.$('button[type="submit"]');
            if (btn) {
                await btn.click();
                await page.waitForSelector('input[name="password"], input[type="password"]', {
                    timeout: 10000, visible: true
                }).catch(() => {});
                await snap(page, 'after-continue');
            }
            passField = await page.$('input[name="password"]') || await page.$('input[type="password"]');
        }

        if (!passField) {
            console.error('    ❌ Password field not found!');
            await snap(page, 'no-password-field');
            await browser.close();
            return;
        }

        console.log('    ✓ Password field found');
        await passField.click({ clickCount: 3 });
        await passField.type(PASS, { delay: 40 });
        await snap(page, 'password-filled');

        // ── Step 6: Submit ─────────────────────────────────────────────────────
        console.log('\n[6] Submitting form...');
        const submitBtn = await page.$('button[type="submit"]');
        if (!submitBtn) {
            console.error('    ❌ Submit button not found!');
            await snap(page, 'no-submit-button');
            await browser.close();
            return;
        }

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
            submitBtn.click()
        ]);

        // Follow redirect chain
        const deadline = Date.now() + 20000;
        while (
            (page.url().includes('auth.jumbo.com') || page.url().includes('/api/auth/callback')) &&
            Date.now() < deadline
        ) {
            console.log('    → following redirect:', page.url());
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
        }

        await snap(page, 'after-login');
        console.log('\n    Final URL:', page.url());

        // ── Step 7: Inspect cookies ────────────────────────────────────────────
        await new Promise(r => setTimeout(r, 1500));
        const cookies = await page.cookies();
        const jumboCookies = cookies.filter(c => c.domain && c.domain.includes('jumbo.com'));

        console.log(`\n[7] Cookies (${cookies.length} total, ${jumboCookies.length} for jumbo.com):`);
        jumboCookies.forEach(c => {
            console.log(`    ${c.name}=${c.value.substring(0, 40)}${c.value.length > 40 ? '...' : ''}`);
        });

        const success = page.url().startsWith('https://www.jumbo.com') &&
                        !page.url().includes('auth.jumbo.com') &&
                        !page.url().includes('login');

        console.log(`\n${'='.repeat(50)}`);
        console.log(success ? '✅ LOGIN SUCCEEDED' : '❌ LOGIN MAY HAVE FAILED');
        if (!success) {
            console.log('   URL suggests not logged in:', page.url());
        }

        // Save cookie string for manual testing
        const cookieString = jumboCookies.map(c => `${c.name}=${c.value}`).join('; ');
        fs.writeFileSync(path.join(SCREENSHOT_DIR, 'cookies.txt'), cookieString);
        console.log(`\n   Cookie string saved to: ${path.join(SCREENSHOT_DIR, 'cookies.txt')}`);

    } catch (err) {
        console.error('\n❌ Error:', err.message);
        try {
            await snap(page, 'error');
        } catch (_) {}
    }

    await browser.close();
    console.log('\n📁 All screenshots in:', SCREENSHOT_DIR, '\n');
})();
