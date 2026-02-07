const express = require('express');
const router = express.Router();

function setupMappingsRoutes(mappingService) {

    // IMPORTANT: Specific routes MUST come before /:id to avoid matching

    // GET /api/mappings/unmapped - Get unmapped ingredients in queue
    router.get('/unmapped', (req, res) => {
        try {
            res.json({
                success: true,
                unmapped: [],
                message: 'Use /api/shopping-list/preview to see unmapped ingredients'
            });
        } catch (error) {
            console.error('Get unmapped error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/mappings/similar/:name - Get similar existing mappings
    router.get('/similar/:name', (req, res) => {
        try {
            const ingredientName = decodeURIComponent(req.params.name);
            const similar = mappingService.findSimilarMappings(ingredientName);
            res.json({ success: true, ingredient: ingredientName, similar, count: similar.length });
        } catch (error) {
            console.error('Get similar mappings error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/mappings/ingredient/:name - Get mappings for ingredient
    router.get('/ingredient/:name', (req, res) => {
        try {
            const ingredientName = decodeURIComponent(req.params.name);
            const mappings = mappingService.getMappingsForIngredient(ingredientName);
            res.json({ success: true, ingredient: ingredientName, mappings, count: mappings.length });
        } catch (error) {
            console.error('Get ingredient mappings error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/mappings - List all mappings
    router.get('/', (req, res) => {
        try {
            const filters = {
                ingredient_name: req.query.ingredient,
                preferred: req.query.preferred !== undefined ? req.query.preferred === 'true' : undefined
            };
            const mappings = mappingService.getAllMappings(filters);
            res.json({ success: true, mappings, count: mappings.length });
        } catch (error) {
            console.error('Get mappings error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/mappings - Create mapping
    router.post('/', (req, res) => {
        try {
            const mappingData = req.body;
            if (!mappingData.ingredient_name || !mappingData.jumbo_sku) {
                return res.status(400).json({
                    success: false,
                    error: 'ingredient_name and jumbo_sku are required'
                });
            }
            const mapping = mappingService.createMapping(mappingData);
            res.status(201).json({ success: true, mapping, message: 'Mapping created successfully' });
        } catch (error) {
            console.error('Create mapping error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PUT /api/mappings/:id - Update mapping
    router.put('/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const mapping = mappingService.updateMapping(id, req.body);
            if (!mapping) {
                return res.status(404).json({ success: false, error: 'Mapping not found' });
            }
            res.json({ success: true, mapping, message: 'Mapping updated successfully' });
        } catch (error) {
            console.error('Update mapping error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DELETE /api/mappings/:id - Delete mapping
    router.delete('/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const success = mappingService.deleteMapping(id);
            if (!success) {
                return res.status(404).json({ success: false, error: 'Mapping not found' });
            }
            res.json({ success: true, message: 'Mapping deleted successfully' });
        } catch (error) {
            console.error('Delete mapping error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = setupMappingsRoutes;
