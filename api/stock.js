const express = require('express');
const router = express.Router();

function setupStockRoutes(stockService, mappingService, recipeService) {

    // IMPORTANT: Specific routes MUST come before /:id

    // GET /api/stock/expired - Get expired items
    router.get('/expired', (req, res) => {
        try {
            const items = stockService.getExpiredItems();
            res.json({ success: true, items, count: items.length });
        } catch (error) {
            console.error('Get expired stock error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/stock/available - Get available ingredients summary
    router.get('/available', (req, res) => {
        try {
            const available = stockService.getAvailableIngredients();
            res.json({ success: true, available });
        } catch (error) {
            console.error('Get available stock error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/stock/recipe-check - Which recipes can be made from stock
    router.get('/recipe-check', (req, res) => {
        try {
            const recipes = recipeService.getAllRecipes();
            const results = stockService.checkRecipesFromStock(recipes);
            res.json({ success: true, recipes: results });
        } catch (error) {
            console.error('Recipe stock check error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/stock - List all stock
    router.get('/', (req, res) => {
        try {
            const includeDiscarded = req.query.includeDiscarded === 'true';
            const items = stockService.getAllStock(includeDiscarded);
            res.json({ success: true, items, count: items.length });
        } catch (error) {
            console.error('Get stock error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/stock - Add stock item
    router.post('/', (req, res) => {
        try {
            const { ingredient_name, jumbo_sku, quantity_remaining, unit, shelf_life_days } = req.body;
            if (!ingredient_name || quantity_remaining === undefined || !unit) {
                return res.status(400).json({
                    success: false,
                    error: 'ingredient_name, quantity_remaining, and unit zijn verplicht'
                });
            }
            const item = stockService.addStock({
                ingredient_name,
                jumbo_sku,
                quantity_remaining: parseFloat(quantity_remaining),
                unit,
                shelf_life_days: shelf_life_days ? parseInt(shelf_life_days) : null
            });
            res.status(201).json({ success: true, item });
        } catch (error) {
            console.error('Add stock error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/stock/from-shopping-list - Bulk add from shopping list
    router.post('/from-shopping-list', (req, res) => {
        try {
            const { items } = req.body;
            if (!items || !Array.isArray(items)) {
                return res.status(400).json({ success: false, error: 'items array is verplicht' });
            }
            const added = stockService.addStockFromShoppingList(items, mappingService);
            res.json({ success: true, added, count: added.length });
        } catch (error) {
            console.error('Add stock from shopping list error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PUT /api/stock/:id - Update stock quantity
    router.put('/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { quantity_remaining } = req.body;
            if (quantity_remaining === undefined) {
                return res.status(400).json({ success: false, error: 'quantity_remaining is verplicht' });
            }
            const item = stockService.updateStockQuantity(id, parseFloat(quantity_remaining));
            if (!item) {
                return res.status(404).json({ success: false, error: 'Voorraad item niet gevonden' });
            }
            res.json({ success: true, item });
        } catch (error) {
            console.error('Update stock error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DELETE /api/stock/:id - Discard stock item (GFT!)
    router.delete('/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const success = stockService.discardItem(id);
            if (!success) {
                return res.status(404).json({ success: false, error: 'Voorraad item niet gevonden' });
            }
            res.json({ success: true, message: 'Item bij GFT gedaan' });
        } catch (error) {
            console.error('Discard stock error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = setupStockRoutes;
