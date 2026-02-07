const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { JumboGraphQL } = require('./jumbo-graphql');
const { JumboBrowserAuth } = require('./jumbo-auth-browser');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// In-memory storage for user credentials (in production, use a database)
let userCredentials = {
    username: '',
    password: '',
    customerId: '' // Jumbo customer ID from profile
};

// Jumbo client instance
let jumboClient = null;

// Load saved credentials from file if exists
const CREDENTIALS_FILE = path.join(__dirname, 'credentials.json');
if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
        const savedCreds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
        userCredentials = savedCreds;
        console.log('Loaded saved credentials');
    } catch (error) {
        console.error('Error loading credentials:', error);
    }
}

// Helper function to save credentials
function saveCredentials() {
    try {
        fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(userCredentials, null, 2));
        console.log('Credentials saved');
    } catch (error) {
        console.error('Error saving credentials:', error);
    }
}

// Initialize Jumbo client
function initializeJumboClient(username, password) {
    jumboClient = new JumboGraphQL({
        verbose: true,
        cookies: '' // Will be set after actual login
    });
}

// Initialize with saved credentials if available
if (userCredentials.username && userCredentials.password) {
    if (userCredentials.cookies) {
        // Use saved cookies for authentication
        jumboClient = new JumboGraphQL({
            verbose: true,
            cookies: userCredentials.cookies
        });
        console.log('✅ Initialized with saved cookies');
    } else {
        initializeJumboClient(userCredentials.username, userCredentials.password);
    }
}

// Routes

// Get current login status
app.get('/api/auth/status', (req, res) => {
    res.json({
        isLoggedIn: !!(userCredentials.username && userCredentials.password),
        username: userCredentials.username || null
    });
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password, remember } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required'
        });
    }

    try {
        // Store credentials
        userCredentials.username = username;
        userCredentials.password = password;

        // Try automatic browser-based login to get cookies
        console.log('🌐 Attempting browser-based login (this may take a moment)...');
        const auth = new JumboBrowserAuth({ verbose: true, headless: true });
        const authResult = await auth.login(username, password);

        if (authResult.success && authResult.cookies) {
            // Initialize Jumbo client with obtained cookies
            jumboClient = new JumboGraphQL({
                verbose: true,
                cookies: authResult.cookies
            });

            userCredentials.customerId = authResult.customerId;
            userCredentials.cookies = authResult.cookies;
            console.log('✅ OAuth login successful! Customer ID:', userCredentials.customerId);
        } else {
            // OAuth failed, initialize without cookies (limited functionality)
            console.warn('⚠️  OAuth login failed:', authResult.error);
            initializeJumboClient(username, password);
        }

        // Save to file if remember is true
        if (remember) {
            saveCredentials();
        }

        res.json({
            success: true,
            message: 'Login successful',
            username: username,
            hasCustomerId: !!userCredentials.customerId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Login failed: ' + error.message
        });
    }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    userCredentials = { username: '', password: '' };

    // Delete saved credentials file
    if (fs.existsSync(CREDENTIALS_FILE)) {
        fs.unlinkSync(CREDENTIALS_FILE);
    }

    // Reinitialize client without credentials
    initializeJumboClient('', '');

    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// Search products endpoint
app.get('/api/products/search', async (req, res) => {
    const { q, limit = 10 } = req.query;

    if (!q) {
        return res.status(400).json({
            success: false,
            message: 'Search query is required'
        });
    }

    try {
        if (!jumboClient) {
            initializeJumboClient('', '');
        }

        const result = await jumboClient.searchProducts(q);
        const products = result.searchProducts.products || [];

        // Format products for easier frontend consumption
        const formattedProducts = products.map(p => ({
            id: p.id,
            sku: p.id,
            title: p.title,
            subtitle: p.subtitle,
            price: p.prices?.price || 0,
            currency: 'EUR',
            image: p.image || null,
            brand: p.brand || '',
            available: p.availability?.isAvailable || false,
            link: p.link || ''
        }));

        res.json({
            success: true,
            products: formattedProducts,
            count: result.searchProducts.count,
            total: formattedProducts.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Search failed: ' + error.message
        });
    }
});

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
    const { id } = req.params;

    try {
        if (!jumboClient) {
            initializeJumboClient('', '');
        }

        const product = await jumboClient.product().getProductFromId(id);

        res.json({
            success: true,
            product: product.product.data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get product: ' + error.message
        });
    }
});

// Get current basket
app.get('/api/basket', async (req, res) => {
    try {
        if (!jumboClient) {
            initializeJumboClient('', '');
        }

        if (!userCredentials.customerId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to view basket - customer ID required'
            });
        }

        const result = await jumboClient.getBasket(userCredentials.customerId);
        const basket = result.activeBasket?.basket;

        if (!basket) {
            return res.json({
                success: true,
                basket: null,
                itemCount: 0,
                items: [],
                message: 'Basket is empty or not found'
            });
        }

        res.json({
            success: true,
            basket: basket,
            itemCount: basket.totalProductCount || 0,
            items: basket.lines || []
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get basket: ' + error.message
        });
    }
});

// Add item to basket
app.post('/api/basket/add', async (req, res) => {
    const { sku, quantity = 1 } = req.body;

    if (!sku) {
        return res.status(400).json({
            success: false,
            message: 'Product SKU is required'
        });
    }

    try {
        if (!jumboClient) {
            initializeJumboClient('', '');
        }

        if (!userCredentials.customerId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to add items to basket - customer ID required'
            });
        }

        const result = await jumboClient.addToBasket(
            userCredentials.customerId,
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
        res.status(500).json({
            success: false,
            message: 'Failed to add item to basket: ' + error.message
        });
    }
});

// Update basket item quantity
app.put('/api/basket/update', async (req, res) => {
    const { sku, quantity } = req.body;

    if (!sku || quantity === undefined) {
        return res.status(400).json({
            success: false,
            message: 'SKU and quantity are required'
        });
    }

    try {
        if (!jumboClient) {
            return res.status(401).json({
                success: false,
                message: 'Please login first'
            });
        }

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
        res.status(500).json({
            success: false,
            message: 'Failed to update basket: ' + error.message
        });
    }
});

// Remove item from basket
app.delete('/api/basket/remove', async (req, res) => {
    const { lineId } = req.body;

    if (!lineId) {
        return res.status(400).json({
            success: false,
            message: 'Line ID is required'
        });
    }

    try {
        if (!jumboClient) {
            return res.status(401).json({
                success: false,
                message: 'Please login first'
            });
        }

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
        res.status(500).json({
            success: false,
            message: 'Failed to remove item: ' + error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'API is running',
        timestamp: new Date().toISOString()
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Store Management API Server running on http://localhost:${PORT}`);
    console.log(`📱 Open http://localhost:${PORT} in your browser to use the app\n`);
    if (userCredentials.username) {
        console.log(`✅ Logged in as: ${userCredentials.username}\n`);
    }
});
