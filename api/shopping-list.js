const express = require('express');
const router = express.Router();

function setupShoppingListRoutes(shoppingListService, authService, getJumboClient) {

    // GET /api/shopping-list/preview - Preview shopping list from queue
    router.get('/preview', (req, res) => {
        try {
            const shoppingList = shoppingListService.generateShoppingList();

            // Categorize mapped items
            const categorized = shoppingListService.categorizeIngredients(shoppingList.mappedItems);

            res.json({
                success: true,
                shoppingList: {
                    ...shoppingList,
                    categorized
                }
            });
        } catch (error) {
            console.error('Preview shopping list error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/shopping-list/generate - Add all items to Jumbo basket
    router.post('/generate', authService.requireAuth(), async (req, res) => {
        try {
            const shoppingList = shoppingListService.generateShoppingList();

            if (shoppingList.mappedItems.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No mapped items to add to basket',
                    unmappedCount: shoppingList.unmappedItems.length
                });
            }

            const jumboClient = getJumboClient();
            const customerId = authService.getCustomerId();

            // Add items to basket
            const results = await shoppingListService.addToJumboBasket(
                jumboClient,
                customerId,
                shoppingList.mappedItems
            );

            res.json({
                success: true,
                results,
                message: `Added ${results.added.length} items to basket`
            });

        } catch (error) {
            console.error('Generate shopping list error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET /api/shopping-list/export - Export shopping list as text
    router.get('/export', (req, res) => {
        try {
            const shoppingList = shoppingListService.generateShoppingList();
            const textList = shoppingListService.exportAsText(shoppingList);

            res.type('text/plain');
            res.send(textList);

        } catch (error) {
            console.error('Export shopping list error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
}

module.exports = setupShoppingListRoutes;
