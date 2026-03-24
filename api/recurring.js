const express = require('express');
const router = express.Router();

function setupRecurringRoutes(recurringService, mappingService) {

    // GET /api/recurring/mappings - List all preferred mappings for autocomplete
    router.get('/mappings', (req, res) => {
        try {
            const mappings = mappingService.getAllMappings({ preferred: true });
            res.json({
                success: true,
                mappings: mappings.map(m => ({
                    id: m.id,
                    ingredient_name: m.ingredient_name,
                    jumbo_sku: m.jumbo_sku,
                    package_amount: m.package_amount,
                    package_unit: m.package_unit,
                    product_details: m.product_details
                }))
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/recurring - List all recurring items
    router.get('/', (req, res) => {
        try {
            const includeDisabled = req.query.all === '1';
            const items = recurringService.getAll(includeDisabled);
            res.json({ success: true, items });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/recurring/:id - Get single item
    router.get('/:id', (req, res) => {
        try {
            const item = recurringService.getById(parseInt(req.params.id));
            if (!item) return res.status(404).json({ success: false, error: 'Item niet gevonden' });
            res.json({ success: true, item });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/recurring - Create new item
    router.post('/', (req, res) => {
        try {
            const { item_name, category, occurrence_rate, quantity, mapping_id } = req.body;
            if (!item_name) return res.status(400).json({ success: false, error: 'item_name is verplicht' });

            const item = recurringService.create({ item_name, category, occurrence_rate, quantity, mapping_id });
            res.json({ success: true, item });
        } catch (error) {
            if (error.message.includes('UNIQUE')) {
                return res.status(409).json({ success: false, error: 'Item met deze naam bestaat al' });
            }
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PUT /api/recurring/:id - Update item
    router.put('/:id', (req, res) => {
        try {
            const item = recurringService.update(parseInt(req.params.id), req.body);
            if (!item) return res.status(404).json({ success: false, error: 'Item niet gevonden' });
            res.json({ success: true, item });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PATCH /api/recurring/:id/toggle - Toggle enabled/disabled
    router.patch('/:id/toggle', (req, res) => {
        try {
            const item = recurringService.toggle(parseInt(req.params.id));
            if (!item) return res.status(404).json({ success: false, error: 'Item niet gevonden' });
            res.json({ success: true, item });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DELETE /api/recurring/:id - Delete item
    router.delete('/:id', (req, res) => {
        try {
            const deleted = recurringService.delete(parseInt(req.params.id));
            if (!deleted) return res.status(404).json({ success: false, error: 'Item niet gevonden' });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = setupRecurringRoutes;
