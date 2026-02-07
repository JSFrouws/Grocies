/**
 * Jumbo Browser Authentication Module
 *
 * Uses Puppeteer to perform real browser login
 * This bypasses Cloudflare/Auth0 bot detection
 */

const puppeteer = require('puppeteer');

class JumboBrowserAuth {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.headless = options.headless !== false; // Default to headless
    }

    log(...args) {
        if (this.verbose) console.log(...args);
    }

    /**
     * Login using real browser automation
     * Returns cookies string on success
     */
    async login(username, password) {
        this.log('\n🌐 Starting browser-based login...\n');

        let browser;
        try {
            // Launch browser
            this.log('Launching browser...');
            browser = await puppeteer.launch({
                headless: this.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();

            // Set viewport and user agent
            await page.setViewport({ width: 1280, height: 720 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36');

            // Navigate to login page
            this.log('Navigating to Jumbo login page...');
            await page.goto('https://www.jumbo.com/account/inloggen', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for login form to appear
            this.log('Waiting for login form...');
            await page.waitForSelector('input[name="username"], input[type="email"], #username', {
                timeout: 15000
            });

            // Fill in credentials
            this.log('Entering credentials...');

            // Try different selector patterns for email field
            const emailSelectors = ['input[name="username"]', 'input[type="email"]', '#username', 'input[autocomplete="email"]'];
            let emailField = null;
            for (const selector of emailSelectors) {
                emailField = await page.$(selector);
                if (emailField) {
                    this.log(`  Found email field: ${selector}`);
                    break;
                }
            }

            if (!emailField) {
                throw new Error('Could not find email input field');
            }

            await emailField.click({ clickCount: 3 }); // Select all
            await emailField.type(username, { delay: 50 });

            // Try different selector patterns for password field
            const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];
            let passwordField = null;
            for (const selector of passwordSelectors) {
                passwordField = await page.$(selector);
                if (passwordField) {
                    this.log(`  Found password field: ${selector}`);
                    break;
                }
            }

            if (!passwordField) {
                throw new Error('Could not find password input field');
            }

            await passwordField.click({ clickCount: 3 }); // Select all
            await passwordField.type(password, { delay: 50 });

            // Click login button
            this.log('Clicking login button...');
            const buttonSelectors = ['button[type="submit"]', 'button[name="action"]', '.auth0-lock-submit', 'button:contains("Inloggen")'];
            let loginButton = null;
            for (const selector of buttonSelectors) {
                try {
                    loginButton = await page.$(selector);
                    if (loginButton) {
                        this.log(`  Found login button: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Selector not found, try next
                }
            }

            if (!loginButton) {
                // Try finding by text content
                loginButton = await page.evaluateHandle(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    return buttons.find(b => b.textContent.toLowerCase().includes('inloggen') || b.textContent.toLowerCase().includes('login'));
                });
            }

            if (!loginButton) {
                throw new Error('Could not find login button');
            }

            // Click and wait for navigation
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                loginButton.click()
            ]);

            // Wait a bit for cookies to be set
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Check if login was successful by looking for account page or customer ID cookie
            this.log('Checking login result...');
            const cookies = await page.cookies();

            // Find CdId cookie (Customer ID)
            const cdIdCookie = cookies.find(c => c.name === 'CdId');
            const authTokenCookie = cookies.find(c => c.name === 'authentication-token');

            if (cdIdCookie || authTokenCookie) {
                this.log('\n✅ Login successful!');

                // Format cookies as string
                const cookieString = cookies
                    .filter(c => c.domain.includes('jumbo.com'))
                    .map(c => `${c.name}=${c.value}`)
                    .join('; ');

                const customerId = cdIdCookie ? cdIdCookie.value : null;
                this.log(`  Customer ID: ${customerId}`);
                this.log(`  Cookies: ${cookieString.substring(0, 100)}...`);

                await browser.close();

                return {
                    success: true,
                    cookies: cookieString,
                    customerId: customerId
                };
            } else {
                // Check for error messages
                const errorText = await page.evaluate(() => {
                    const errorEl = document.querySelector('.error, .alert-danger, [class*="error"]');
                    return errorEl ? errorEl.textContent : null;
                });

                if (errorText) {
                    throw new Error(`Login failed: ${errorText}`);
                }

                throw new Error('Login failed - no authentication cookies received');
            }

        } catch (error) {
            this.log(`\n❌ Login failed: ${error.message}`);

            if (browser) {
                await browser.close();
            }

            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = { JumboBrowserAuth };
