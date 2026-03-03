const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../data/uploads/recipes');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed'));
        }
    }
});

// Routes setup function
function setupRecipeRoutes(recipeService, llmService) {

    // IMPORTANT: Specific routes MUST come before /:id to avoid matching

    // GET /api/recipes/meta/cuisines - Get distinct cuisines
    router.get('/meta/cuisines', (req, res) => {
        try {
            const cuisines = recipeService.getCuisines();
            res.json({ success: true, cuisines });
        } catch (error) {
            console.error('Error fetching cuisines:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/recipes/meta/countries - Get distinct countries
    router.get('/meta/countries', (req, res) => {
        try {
            const countries = recipeService.getCountries();
            res.json({ success: true, countries });
        } catch (error) {
            console.error('Error fetching countries:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/recipes/meta/ingredients - Get distinct ingredient names
    router.get('/meta/ingredients', (req, res) => {
        try {
            const ingredients = recipeService.getDistinctIngredients();
            res.json({ success: true, ingredients });
        } catch (error) {
            console.error('Error fetching ingredients:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/recipes/meta/generation-countries - Get countries for generation
    router.get('/meta/generation-countries', (req, res) => {
        try {
            const LLMService = require('../lib/llm-service');
            const countries = LLMService.getCountryList();
            res.json({ success: true, countries });
        } catch (error) {
            console.error('Error fetching generation countries:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/recipes/generate - Generate recipe via LLM
    router.post('/generate', async (req, res) => {
        try {
            const { country, instructions } = req.body;

            if (!country) {
                return res.status(400).json({
                    success: false,
                    error: 'Country is required'
                });
            }

            if (!llmService) {
                return res.status(503).json({
                    success: false,
                    error: 'LLM service is not configured. Please set ANTHROPIC_API_KEY in .env'
                });
            }

            const existingIngredients = recipeService.getDistinctIngredients();
            const result = await llmService.generateRecipe(country, instructions, existingIngredients);
            res.json(result);
        } catch (error) {
            console.error('Error generating recipe:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/recipes - List all recipes
    router.get('/', (req, res) => {
        try {
            const filters = {
                cuisine: req.query.cuisine,
                country: req.query.country,
                search: req.query.search,
                tags: req.query.tags,
                limit: req.query.limit ? parseInt(req.query.limit) : undefined,
                offset: req.query.offset ? parseInt(req.query.offset) : undefined
            };

            const recipes = recipeService.getAllRecipes(filters);
            const total = recipeService.getRecipeCount(filters);

            res.json({ success: true, recipes, total, filters });
        } catch (error) {
            console.error('Error fetching recipes:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/recipes/:id - Get single recipe
    router.get('/:id', (req, res) => {
        try {
            const recipe = recipeService.getRecipeById(req.params.id);

            if (!recipe) {
                return res.status(404).json({ success: false, error: 'Recipe not found' });
            }

            res.json({ success: true, recipe });
        } catch (error) {
            console.error('Error fetching recipe:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/recipes - Create new recipe
    router.post('/', (req, res) => {
        try {
            const recipeData = req.body;

            if (!recipeData.name || !recipeData.ingredients || !recipeData.instructions) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: name, ingredients, instructions'
                });
            }

            const recipe = recipeService.createRecipe(recipeData);
            res.status(201).json({ success: true, recipe });
        } catch (error) {
            console.error('Error creating recipe:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PUT /api/recipes/:id - Update recipe
    router.put('/:id', (req, res) => {
        try {
            const recipe = recipeService.updateRecipe(req.params.id, req.body);

            if (!recipe) {
                return res.status(404).json({ success: false, error: 'Recipe not found' });
            }

            res.json({ success: true, recipe });
        } catch (error) {
            console.error('Error updating recipe:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DELETE /api/recipes/:id - Delete recipe
    router.delete('/:id', (req, res) => {
        try {
            const success = recipeService.deleteRecipe(req.params.id);

            if (!success) {
                return res.status(404).json({ success: false, error: 'Recipe not found' });
            }

            res.json({ success: true, message: 'Recipe deleted successfully' });
        } catch (error) {
            console.error('Error deleting recipe:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/recipes/:id/image - Upload recipe image
    router.post('/:id/image', upload.single('image'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No image file provided' });
            }

            const imagePath = `/uploads/recipes/${req.file.filename}`;
            const recipe = recipeService.updateRecipe(req.params.id, { image_path: imagePath });

            if (!recipe) {
                fs.unlinkSync(req.file.path);
                return res.status(404).json({ success: false, error: 'Recipe not found' });
            }

            res.json({ success: true, imagePath, recipe });
        } catch (error) {
            console.error('Error uploading image:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

module.exports = setupRecipeRoutes;
