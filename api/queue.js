const express = require('express');
const router = express.Router();

function setupQueueRoutes(queueService) {

    // IMPORTANT: Specific routes MUST come before /:id to avoid matching

    // GET /api/queue/history - Get consumption history
    router.get('/history', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const history = queueService.getConsumptionHistory(limit, offset);
            res.json({ success: true, history, limit, offset });
        } catch (error) {
            console.error('Get history error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/queue/stats - Get consumption statistics
    router.get('/stats', (req, res) => {
        try {
            const stats = queueService.getConsumptionStats();
            res.json({ success: true, stats });
        } catch (error) {
            console.error('Get stats error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/queue/random - Add random recipe (weighted)
    router.post('/random', (req, res) => {
        try {
            const avoidDays = req.body.avoidDays || 14;
            const queueItem = queueService.addRandomRecipe(avoidDays);
            res.status(201).json({
                success: true,
                queueItem,
                message: `Added random recipe: ${queueItem.name}`
            });
        } catch (error) {
            console.error('Add random recipe error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PUT /api/queue/reorder - Reorder queue items
    router.put('/reorder', (req, res) => {
        try {
            const { itemOrders } = req.body;
            if (!Array.isArray(itemOrders)) {
                return res.status(400).json({ success: false, error: 'itemOrders must be an array' });
            }
            const queue = queueService.reorderQueue(itemOrders);
            res.json({ success: true, queue, message: 'Queue reordered' });
        } catch (error) {
            console.error('Reorder queue error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/queue/add/:recipeId - Add recipe to queue
    router.post('/add/:recipeId', (req, res) => {
        try {
            const recipeId = parseInt(req.params.recipeId);
            const queueItem = queueService.addToQueue(recipeId);
            res.status(201).json({ success: true, queueItem, message: 'Recipe added to queue' });
        } catch (error) {
            console.error('Add to queue error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/queue - Get current queue
    router.get('/', (req, res) => {
        try {
            const queue = queueService.getQueue();
            const count = queueService.getQueueCount();
            res.json({ success: true, queue, count });
        } catch (error) {
            console.error('Get queue error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/queue/:id/consume - Mark recipe as consumed
    router.post('/:id/consume', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { rating, notes } = req.body;
            const result = queueService.consumeRecipe(id, rating, notes);

            if (!result) {
                return res.status(404).json({ success: false, error: 'Queue item not found' });
            }

            res.json({ success: true, result, message: `Marked "${result.name}" as consumed` });
        } catch (error) {
            console.error('Consume recipe error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DELETE /api/queue/:id - Remove from queue
    router.delete('/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const success = queueService.removeFromQueue(id);

            if (!success) {
                return res.status(404).json({ success: false, error: 'Queue item not found' });
            }

            res.json({ success: true, message: 'Removed from queue' });
        } catch (error) {
            console.error('Remove from queue error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = setupQueueRoutes;
