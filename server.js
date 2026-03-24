require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Import services
const MealPlannerDatabase = require('./lib/database');
const SettingsService = require('./lib/settings-service');
const AuthService = require('./lib/auth-service');
const RecipeService = require('./lib/recipe-service');
const QueueService = require('./lib/queue-service');
const MappingService = require('./lib/mapping-service');
const ShoppingListService = require('./lib/shopping-list-service');
const StockService = require('./lib/stock-service');
const RecurringService = require('./lib/recurring-service');
const LLMService = require('./lib/llm-service');
const VoiceService = require('./lib/voice-service');
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

// Settings page
app.use('/settings', express.static(path.join(__dirname, 'public/settings')));

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
const stockService = new StockService(db);
const recurringService = new RecurringService(db);
const shoppingListService = new ShoppingListService(db, mappingService, stockService, recurringService);

// Initialize settings
const settingsService = new SettingsService('./data/settings.json');
console.log('✓ Settings service initialized');

// Initialize LLM service — settings key takes priority over .env
let llmService = null;
function initLLMService() {
    const apiKey = settingsService.get('anthropic_api_key') || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.warn('⚠️  LLM service not available (no Anthropic API key in settings or .env)');
        return;
    }
    try {
        llmService = new LLMService(apiKey, 'anthropic', settingsService.get('recipe_language') || 'Dutch');
        console.log('✓ LLM service initialized');
    } catch (error) {
        console.warn('⚠️  LLM service not initialized:', error.message);
    }
}
initLLMService();

// Helper function to get Jumbo client
function getJumboClient() {
    const cookies = authService.getAuthCookies();
    return new JumboGraphQL({ verbose: true, cookies });
}

// Initialize voice service (requires LLM client)
let voiceService = null;
function initVoiceService() {
    if (llmService && llmService.client) {
        voiceService = new VoiceService({
            settingsService,
            recipeService,
            queueService,
            stockService,
            recurringService,
            mappingService,
            shoppingListService,
            authService,
            llmClient: llmService.client,
            getJumboClient
        });
        console.log('✓ Voice service initialized');
    }
}
initVoiceService();

// Reinitialize LLM + voice when settings change (e.g. new API key)
function reinitLLM() {
    initLLMService();
    initVoiceService();
}

// Mount API routes
app.use('/api/auth', require('./api/auth')(authService, getJumboClient));
app.use('/api/store', require('./api/store')(authService, getJumboClient));
const getLLMService = () => llmService;
app.use('/api/recipes', require('./api/recipes')(recipeService, getLLMService, mappingService));
app.use('/api/queue', require('./api/queue')(queueService, stockService));
app.use('/api/mappings', require('./api/mappings')(mappingService, getLLMService, getJumboClient));
app.use('/api/shopping-list', require('./api/shopping-list')(shoppingListService, authService, getJumboClient));
app.use('/api/stock', require('./api/stock')(stockService, mappingService, recipeService));
app.use('/api/recurring', require('./api/recurring')(recurringService, mappingService));
app.use('/api/settings', require('./api/settings')(settingsService, { onSave: reinitLLM }));
app.use('/api/voice', require('./api/voice')({ get: () => voiceService }));

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
    console.log(`   Recurring: http://localhost:${PORT}/recurring/`);
    console.log(`   Shopping List: http://localhost:${PORT}/shopping-list/`);
    console.log('\n📊 Press Ctrl+C to stop\n');

    // Auto-login on startup: always re-authenticate to ensure fresh cookies.
    // Runs in background so it doesn't delay server readiness.
    setTimeout(async () => {
        if (authService.hasSavedCredentials()) {
            console.log('🔄 Background auto-login on startup...');
            const result = await authService.autoLogin();
            if (result.success) {
                console.log('✓ Startup auto-login successful');
            } else {
                console.warn('⚠️  Startup auto-login failed:', result.error);
            }
        } else {
            console.log('ℹ️  No saved credentials — open the app and log in via the connection sidebar');
        }
    }, 500);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    database.close();
    process.exit(0);
});
