const express = require('express');
const router = express.Router();

function setupAuthRoutes(authService, getJumboClient) {

    // GET /api/auth/status - Fast check (no Jumbo call)
    router.get('/status', (req, res) => {
        const isAuthenticated = authService.isAuthenticated();
        const user = authService.getCurrentUser();
        const sessionAge = authService.getSessionAge();
        const sessionTTL = authService.getSessionTTL();
        res.json({
            success: true,
            isAuthenticated,
            isLoggedIn: isAuthenticated,
            username: user?.email || null,
            user: user || null,
            sessionAge,
            sessionTTL,
            sessionHealthy: sessionAge !== null && sessionAge < sessionTTL,
            hasSavedCredentials: authService.hasSavedCredentials()
        });
    });

    // GET /api/auth/validate - Actively test session against Jumbo (calls getProfile)
    router.get('/validate', async (req, res) => {
        try {
            const result = await authService.validateSession(getJumboClient());
            res.json({ success: true, ...result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/auth/relogin - Silent re-auth using saved credentials
    router.post('/relogin', async (req, res) => {
        try {
            const result = await authService.autoLogin();
            res.status(result.success ? 200 : 401).json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/auth/login - Login with explicit credentials
    router.post('/login', async (req, res) => {
        try {
            const { email, username, password, remember } = req.body;
            const loginEmail = email || username;
            if (!loginEmail || !password) {
                return res.status(400).json({ success: false, error: 'Email and password are required' });
            }
            const result = await authService.login(loginEmail, password, remember !== false);
            res.status(result.success ? 200 : 401).json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/auth/logout
    router.post('/logout', (req, res) => {
        try {
            res.json(authService.logout());
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = setupAuthRoutes;
