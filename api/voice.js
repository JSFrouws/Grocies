const express = require('express');
const multer = require('multer');
const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

function setupVoiceRoutes(voiceServiceRef) {
    // Support both direct instance and { get: () => instance } for hot-reload
    const getService = typeof voiceServiceRef?.get === 'function'
        ? voiceServiceRef.get
        : () => voiceServiceRef;

    function requireService(res) {
        const svc = getService();
        if (!svc) {
            res.status(503).json({ success: false, error: 'Spraakservice niet beschikbaar. Stel een Anthropic API key in via Instellingen.' });
            return null;
        }
        return svc;
    }

    // POST /api/voice/command - Full pipeline: audio → transcript → actions → results
    router.post('/command', upload.single('audio'), async (req, res) => {
        try {
            const voiceService = requireService(res);
            if (!voiceService) return;

            if (!req.file) {
                return res.status(400).json({ success: false, error: 'Geen audiobestand ontvangen' });
            }

            const mimeType = req.file.mimetype || 'audio/webm';
            const result = await voiceService.processVoiceCommand(req.file.buffer, mimeType);

            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            console.error('Voice command error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/voice/interpret - Retry just the LLM interpretation step
    router.post('/interpret', async (req, res) => {
        try {
            const voiceService = requireService(res);
            if (!voiceService) return;
            const { transcript } = req.body;
            if (!transcript) {
                return res.status(400).json({ success: false, error: 'Transcript vereist' });
            }

            const result = await voiceService.interpretAndExecute(transcript);
            res.json({ success: true, transcript, ...result });
        } catch (error) {
            console.error('Voice interpret error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/voice/confirm - Confirm and execute a pending action
    router.post('/confirm', async (req, res) => {
        try {
            const voiceService = requireService(res);
            if (!voiceService) return;
            const { action } = req.body;
            if (!action) {
                return res.status(400).json({ success: false, error: 'Geen actie opgegeven' });
            }

            const result = await voiceService.executeAction(action);
            res.json({ success: true, ...result });
        } catch (error) {
            console.error('Voice confirm error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/voice/retry - Retry interpretation with feedback
    router.post('/retry', upload.single('audio'), async (req, res) => {
        try {
            const voiceService = requireService(res);
            if (!voiceService) return;
            const { transcript, feedback } = req.body;
            if (!transcript || !feedback) {
                return res.status(400).json({ success: false, error: 'Transcript en feedback vereist' });
            }

            const context = await voiceService.buildContext();
            const interpretation = await voiceService.interpretCommand(transcript, context, feedback);

            // Execute the new actions
            const results = [];
            for (const action of interpretation.actions) {
                if (voiceService.needsConfirmation(action)) {
                    results.push({
                        action,
                        status: 'needs_confirmation',
                        message: action.description
                    });
                } else {
                    const result = await voiceService.executeAction(action);
                    results.push({
                        action,
                        status: result.success ? 'success' : 'error',
                        message: result.message,
                        data: result.data
                    });
                }
            }

            res.json({
                success: true,
                transcript,
                understanding: interpretation.understanding,
                results,
                isRetry: true
            });
        } catch (error) {
            console.error('Voice retry error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = setupVoiceRoutes;
