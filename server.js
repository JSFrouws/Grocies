require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Import services
const MealPlannerDatabase = require('./lib/database');
const AuthService = require('./lib/auth-service');
const RecipeService = require('./lib/recipe-service');
const QueueService = require('./lib/queue-service');
const MappingService = require('./lib/mapping-service');
const ShoppingListService = require('./lib/shopping-list-service');
const LLMService = require('./lib/llm-service');
const { JumboGraphQL } = require('./jumbo/jumbo-graphql');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files (recipe images)
app.use('/uploads', express.static(path.join(__dirname, 'data/uploads')));

// Initialize database
console.log('\n🚀 Initializing Grocies Application...\n');
const database = new MealPlannerDatabase(process.env.DB_PATH || './data/meal-planner.db');
const db = database.getDb();

// Seed sample data
database.seedSampleData();

// Initialize services
const authService = new AuthService('./data/credentials.json');
const recipeService = new RecipeService(db);
const queueService = new QueueService(db);
const mappingService = new MappingService(db);
const shoppingListService = new ShoppingListService(db, mappingService);

// Initialize LLM service (optional, only if API key is provided)
let llmService = null;
if (process.env.ANTHROPIC_API_KEY) {
    try {
        llmService = new LLMService(process.env.ANTHROPIC_API_KEY, process.env.LLM_PROVIDER || 'anthropic');
        console.log('✓ LLM service initialized');
    } catch (error) {
        console.warn('⚠️  LLM service not initialized:', error.message);
    }
} else {
    console.warn('⚠️  LLM service not available (no ANTHROPIC_API_KEY in .env)');
}

// Helper function to get Jumbo client
function getJumboClient() {
    const cookies = authService.getAuthCookies();
    return new JumboGraphQL({ verbose: true, cookies });
}

// Mount API routes
app.use('/api/auth', require('./api/auth')(authService));
app.use('/api/store', require('./api/store')(authService, getJumboClient));
app.use('/api/recipes', require('./api/recipes')(recipeService, llmService));
app.use('/api/queue', require('./api/queue')(queueService));
app.use('/api/mappings', require('./api/mappings')(mappingService));
app.use('/api/shopping-list', require('./api/shopping-list')(shoppingListService, authService, getJumboClient));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'running',
        timestamp: new Date().toISOString(),
        services: {
            database: true,
            auth: authService.isAuthenticated(),
            llm: llmService !== null
        }
    });
});

// Default route redirects to store
app.get('/', (req, res) => {
    res.redirect('/store/');
});

// 404 handler
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'Route not found'
        });
    }
    // For non-API routes, redirect to home
    res.redirect('/');
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n✅ Grocies server running on http://localhost:${PORT}`);
    console.log(`   Store: http://localhost:${PORT}/store/`);
    console.log(`   Recipes: http://localhost:${PORT}/recipes/`);
    console.log(`   Queue: http://localhost:${PORT}/queue/`);
    console.log(`   Mappings: http://localhost:${PORT}/mappings/`);
    console.log(`   Shopping List: http://localhost:${PORT}/shopping-list/`);
    console.log('\n📊 Press Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    database.close();
    process.exit(0);
});
