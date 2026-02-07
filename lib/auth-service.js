const { JumboBrowserAuth } = require('../jumbo/jumbo-auth-browser');
const fs = require('fs');
const path = require('path');

class AuthService {
    constructor(credentialsPath = './data/credentials.json') {
        this.credentialsPath = credentialsPath;
        this.jumboAuth = new JumboBrowserAuth();
        this.currentUser = null;
        this.authCookies = null;

        // Load saved credentials if they exist
        this.loadSavedCredentials();
    }

    // Load saved credentials from file
    loadSavedCredentials() {
        try {
            if (fs.existsSync(this.credentialsPath)) {
                const data = fs.readFileSync(this.credentialsPath, 'utf8');
                const saved = JSON.parse(data);

                if (saved.cookies && saved.customerId) {
                    this.authCookies = saved.cookies;
                    this.currentUser = {
                        customerId: saved.customerId,
                        email: saved.email || null
                    };
                    console.log('✓ Loaded saved Jumbo credentials');
                }
            }
        } catch (error) {
            console.error('Error loading saved credentials:', error.message);
        }
    }

    // Save credentials to file
    saveCredentials(email, cookies, customerId) {
        try {
            const dataDir = path.dirname(this.credentialsPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const data = {
                email,
                cookies,
                customerId,
                savedAt: new Date().toISOString()
            };

            fs.writeFileSync(this.credentialsPath, JSON.stringify(data, null, 2));
            console.log('✓ Saved Jumbo credentials');
        } catch (error) {
            console.error('Error saving credentials:', error.message);
        }
    }

    // Login with Jumbo credentials
    async login(email, password, remember = true) {
        try {
            console.log(`Attempting Jumbo login for ${email}...`);

            // Use JumboBrowserAuth to login
            const result = await this.jumboAuth.login(email, password);

            if (!result || !result.cookies || !result.customerId) {
                throw new Error('Authentication failed: Invalid response from Jumbo');
            }

            // Store authentication data
            this.authCookies = result.cookies;
            this.currentUser = {
                customerId: result.customerId,
                email: email
            };

            // Save credentials if remember is true
            if (remember) {
                this.saveCredentials(email, result.cookies, result.customerId);
            }

            console.log(`✓ Successfully logged in as ${email}`);
            console.log(`  Customer ID: ${result.customerId}`);

            return {
                success: true,
                customerId: result.customerId,
                email: email
            };

        } catch (error) {
            console.error('Login error:', error.message);
            this.currentUser = null;
            this.authCookies = null;

            return {
                success: false,
                error: error.message
            };
        }
    }

    // Logout
    logout() {
        this.currentUser = null;
        this.authCookies = null;

        // Delete saved credentials
        try {
            if (fs.existsSync(this.credentialsPath)) {
                fs.unlinkSync(this.credentialsPath);
                console.log('✓ Logged out and cleared saved credentials');
            }
        } catch (error) {
            console.error('Error clearing credentials:', error.message);
        }

        return { success: true };
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null && this.authCookies !== null;
    }

    // Get current user info
    getCurrentUser() {
        return this.currentUser;
    }

    // Get authentication cookies
    getAuthCookies() {
        return this.authCookies;
    }

    // Get customer ID
    getCustomerId() {
        return this.currentUser ? this.currentUser.customerId : null;
    }

    // Authentication middleware
    requireAuth() {
        return (req, res, next) => {
            if (!this.isAuthenticated()) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required. Please log in with your Jumbo credentials.'
                });
            }

            // Attach user info to request
            req.user = this.currentUser;
            req.authCookies = this.authCookies;
            next();
        };
    }
}

module.exports = AuthService;
