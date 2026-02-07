const express = require('express');
const router = express.Router();

function setupAuthRoutes(authService) {

    // GET /api/auth/status - Check authentication status
    router.get('/status', (req, res) => {
        const isAuthenticated = authService.isAuthenticated();
        const user = authService.getCurrentUser();

        res.json({
            success: true,
            isAuthenticated,
            isLoggedIn: isAuthenticated,
            username: user?.email || null,
            user: user || null
        });
    });

    // POST /api/auth/login - Login with Jumbo credentials
    router.post('/login', async (req, res) => {
        try {
            const { email, username, password, remember } = req.body;
            const loginEmail = email || username;

            if (!loginEmail || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and password are required'
                });
            }

            const result = await authService.login(loginEmail, password, remember !== false);

            if (result.success) {
                res.json(result);
            } else {
                res.status(401).json(result);
            }

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/auth/logout - Logout
    router.post('/logout', (req, res) => {
        try {
            const result = authService.logout();
            res.json(result);
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
}

module.exports = setupAuthRoutes;
