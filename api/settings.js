const express = require('express');
const https = require('https');
const router = express.Router();

function setupSettingsRoutes(settingsService) {

    // GET /api/settings - Return all settings (token masked)
    router.get('/', (req, res) => {
        res.json({ success: true, settings: settingsService.getAll(), defaults: settingsService.getDefaults() });
    });

    // PUT /api/settings - Update settings
    router.put('/', (req, res) => {
        try {
            const updated = settingsService.update(req.body);
            res.json({ success: true, settings: updated, message: 'Instellingen opgeslagen' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // POST /api/settings/reset - Reset to defaults
    router.post('/reset', (req, res) => {
        try {
            const updated = settingsService.update(settingsService.getDefaults());
            res.json({ success: true, settings: updated, message: 'Instellingen teruggezet naar standaard' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // POST /api/issues - Create a GitHub issue
    router.post('/issues', async (req, res) => {
        const { title, body, labels = ['bug'] } = req.body;
        if (!title) return res.status(400).json({ success: false, error: 'title is required' });

        const repo = settingsService.get('github_repo');
        const token = settingsService.get('github_token');

        if (!repo) return res.status(400).json({ success: false, error: 'GitHub repo not configured in settings' });
        if (!token) return res.status(400).json({ success: false, error: 'GitHub token not configured in settings' });

        const payload = JSON.stringify({ title, body: body || '', labels });

        const options = {
            hostname: 'api.github.com',
            path: `/repos/${repo}/issues`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'Authorization': `token ${token}`,
                'User-Agent': 'Grocies-App/1.0',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const ghReq = https.request(options, (ghRes) => {
            let data = '';
            ghRes.on('data', c => data += c);
            ghRes.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (ghRes.statusCode === 201) {
                        res.json({ success: true, issue: { number: json.number, url: json.html_url, title: json.title } });
                    } else {
                        res.status(ghRes.statusCode).json({ success: false, error: json.message || 'GitHub API error', details: json });
                    }
                } catch (e) {
                    res.status(500).json({ success: false, error: 'Invalid response from GitHub' });
                }
            });
        });

        ghReq.on('error', e => res.status(500).json({ success: false, error: e.message }));
        ghReq.write(payload);
        ghReq.end();
    });

    return router;
}

module.exports = setupSettingsRoutes;
