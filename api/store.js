const express = require('express');
const router = express.Router();

function setupStoreRoutes(authService, getJumboClient) {

    // GET /api/store/search - Search Jumbo products
    router.get('/search', async (req, res) => {
        const { q, limit = 20 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        try {
            const jumboClient = getJumboClient();

            const result = await jumboClient.searchProducts(q);
            const products = result.searchProducts?.products || [];

            // Format products for frontend
            const formattedProducts = products.slice(0, parseInt(limit)).map(p => ({
                id: p.id,
                sku: p.id,
                title: p.title,
                subtitle: p.subtitle || '',
                price: p.prices?.price || 0,
                currency: 'EUR',
                image: p.image || p.imageInfo?.primaryView?.[0]?.url || null,
                brand: p.brand || '',
                available: p.availability?.isAvailable || false,
                link: p.link || ''
            }));

            res.json({
                success: true,
                products: formattedProducts,
                count: formattedProducts.length,
                total: result.searchProducts?.count || formattedProducts.length
            });

        } catch (error) {
            console.error('Product search error:', error);
            res.status(500).json({
                success: false,
                error: 'Search failed: ' + error.message
            });
        }
    });

    // GET /api/store/products/:id - Get product details
    router.get('/products/:id', async (req, res) => {
        try {
            const jumboClient = getJumboClient();
            const product = await jumboClient.product().getProductFromId(req.params.id);

            res.json({
                success: true,
                product: product.product?.data || product
            });

        } catch (error) {
            console.error('Get product error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get product: ' + error.message
            });
        }
    });

    // GET /api/store/basket - Get current basket
    router.get('/basket', authService.requireAuth(), async (req, res) => {
        try {
            const jumboClient = getJumboClient();
            const customerId = authService.getCustomerId();

            if (!customerId) {
                return res.status(401).json({
                    success: false,
                    error: 'Customer ID not found. Please log in again.'
                });
            }

            const result = await jumboClient.getBasket(customerId);
            const basket = result.activeBasket?.basket;

            if (!basket) {
                return res.json({
                    success: true,
                    basket: null,
                    itemCount: 0,
                    items: []
                });
            }

            res.json({
                success: true,
                basket: basket,
                itemCount: basket.totalProductCount || 0,
                items: basket.lines || []
            });

        } catch (error) {
            console.error('Get basket error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get basket: ' + error.message
            });
        }
    });

    // POST /api/store/basket/add - Add item to basket
    router.post('/basket/add', authService.requireAuth(), async (req, res) => {
        const { sku, quantity = 1 } = req.body;

        if (!sku) {
            return res.status(400).json({
                success: false,
                error: 'Product SKU is required'
            });
        }

        try {
            const jumboClient = getJumboClient();
            const customerId = authService.getCustomerId();

            const result = await jumboClient.addToBasket(
                customerId,
                sku,
                parseInt(quantity)
            );

            const basket = result.addBasketLines;

            res.json({
                success: true,
                message: 'Item added to basket',
                basket: basket,
                itemCount: basket?.totalProductCount || 0,
                items: basket?.lines || []
            });

        } catch (error) {
            console.error('Add to basket error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add item: ' + error.message
            });
        }
    });

    // PUT /api/store/basket/update - Update basket item quantity
    router.put('/basket/update', authService.requireAuth(), async (req, res) => {
        const { sku, quantity } = req.body;

        if (!sku || quantity === undefined) {
            return res.status(400).json({
                success: false,
                error: 'SKU and quantity are required'
            });
        }

        try {
            const jumboClient = getJumboClient();
            const result = await jumboClient.updateBasketLine(sku, parseInt(quantity));
            const basket = result.addBasketLines;

            res.json({
                success: true,
                message: 'Basket updated',
                basket: basket,
                itemCount: basket?.totalProductCount || 0,
                items: basket?.lines || []
            });

        } catch (error) {
            console.error('Update basket error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update basket: ' + error.message
            });
        }
    });

    // DELETE /api/store/basket/remove - Remove item from basket
    router.delete('/basket/remove', authService.requireAuth(), async (req, res) => {
        const { lineId } = req.body;

        if (!lineId) {
            return res.status(400).json({
                success: false,
                error: 'Line ID is required'
            });
        }

        try {
            const jumboClient = getJumboClient();
            const result = await jumboClient.removeBasketLine(lineId);
            const basket = result.removeBasketLines;

            res.json({
                success: true,
                message: 'Item removed from basket',
                basket: basket,
                itemCount: basket?.totalProductCount || 0,
                items: basket?.lines || []
            });

        } catch (error) {
            console.error('Remove from basket error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove item: ' + error.message
            });
        }
    });

    return router;
}

module.exports = setupStoreRoutes;
