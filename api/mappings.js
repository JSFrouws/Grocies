const express = require('express');
const router = express.Router();

function setupMappingsRoutes(mappingService, llmServiceOrGetter, getJumboClient) {
    const getLLM = typeof llmServiceOrGetter === 'function' ? llmServiceOrGetter : () => llmServiceOrGetter;

    // IMPORTANT: Specific routes MUST come before /:id to avoid matching

    // POST /api/mappings/suggest - LLM-assisted Jumbo product suggestion for an ingredient
    router.post('/suggest', async (req, res) => {
        try {
            const { ingredient_name } = req.body;
            if (!ingredient_name) {
                return res.status(400).json({ success: false, error: 'ingredient_name is required' });
            }

            // Search Jumbo for this ingredient
            let products = [];
            try {
                const jumboClient = getJumboClient();
                const result = await jumboClient.searchProducts(ingredient_name);
                products = (result.searchProducts?.products || []).slice(0, 10).map(p => ({
                    sku: p.id,
                    title: p.title,
                    subtitle: p.subtitle || '',
                    price: p.prices?.price || 0,
                    image: p.image || null,
                    brand: p.brand || '',
                    available: p.availability?.isAvailable || false
                }));
            } catch (e) {
                console.error('Jumbo search error:', e.message);
            }

            if (products.length === 0) {
                return res.json({ success: true, ingredient_name, products: [], suggestion: null, llmAvailable: false });
            }

            // LLM ranking
            let suggestion = null;
            let llmAvailable = false;
            const llm = getLLM();
            if (llm) {
                try {
                    suggestion = await llm.suggestProductMapping(ingredient_name, products);
                    llmAvailable = true;
                } catch (e) {
                    console.error('LLM suggestion error:', e.message);
                }
            }

            // Attach product details to each ranked suggestion
            if (suggestion?.ranked) {
                suggestion.ranked = suggestion.ranked.map(r => ({
                    ...r,
                    product: products.find(p => p.sku === r.sku) || null
                }));
            }

            res.json({ success: true, ingredient_name, products, suggestion, llmAvailable });
        } catch (error) {
            console.error('Suggest mapping error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/mappings/extract-package - LLM-assisted package info extraction from product title
    router.post('/extract-package', async (req, res) => {
        try {
            const { product_title, ingredient_name } = req.body;
            if (!product_title) {
                return res.status(400).json({ success: false, error: 'product_title is required' });
            }
            const llm = getLLM();
            if (!llm) {
                return res.json({ success: true, extracted: null, llmAvailable: false });
            }
            const extracted = await llm.extractPackageInfo(product_title, ingredient_name || '');
            res.json({ success: true, extracted, llmAvailable: true });
        } catch (error) {
            console.error('Extract package error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/mappings/defaults - Get mapped ingredient names with defaults
    router.get('/defaults', (req, res) => {
        try {
            const defaults = mappingService.getMappedIngredientDefaults();
            res.json({ success: true, defaults, count: defaults.length });
        } catch (error) {
            console.error('Get mapping defaults error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

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
