class RecipeService {
    constructor(db) {
        this.db = db;
    }

    // Get all recipes with optional filters
    getAllRecipes(filters = {}) {
        let query = 'SELECT * FROM recipes WHERE 1=1';
        const params = {};

        if (filters.cuisine) {
            query += ' AND cuisine = @cuisine';
            params.cuisine = filters.cuisine;
        }

        if (filters.country) {
            query += ' AND country_of_origin = @country';
            params.country = filters.country;
        }

        if (filters.search) {
            query += ' AND (name LIKE @search OR cuisine LIKE @search OR country_of_origin LIKE @search)';
            params.search = `%${filters.search}%`;
        }

        if (filters.tags) {
            query += ' AND tags LIKE @tags';
            params.tags = `%${filters.tags}%`;
        }

        query += ' ORDER BY created_at DESC';

        if (filters.limit) {
            query += ' LIMIT @limit';
            params.limit = filters.limit;
        }

        if (filters.offset) {
            query += ' OFFSET @offset';
            params.offset = filters.offset;
        }

        const stmt = this.db.prepare(query);
        const recipes = stmt.all(params);

        // Parse JSON fields
        return recipes.map(recipe => ({
            ...recipe,
            ingredients: JSON.parse(recipe.ingredients),
            tags: recipe.tags ? JSON.parse(recipe.tags) : []
        }));
    }

    // Get recipe by ID
    getRecipeById(id) {
        const stmt = this.db.prepare('SELECT * FROM recipes WHERE id = ?');
        const recipe = stmt.get(id);

        if (!recipe) {
            return null;
        }

        return {
            ...recipe,
            ingredients: JSON.parse(recipe.ingredients),
            tags: recipe.tags ? JSON.parse(recipe.tags) : []
        };
    }

    // Create new recipe
    createRecipe(recipeData) {
        const {
            name,
            cuisine,
            country_of_origin,
            image_path,
            prep_time,
            cook_time,
            servings,
            ingredients,
            instructions,
            frequency_weight,
            tags
        } = recipeData;

        const stmt = this.db.prepare(`
            INSERT INTO recipes (
                name, cuisine, country_of_origin, image_path, prep_time, cook_time,
                servings, ingredients, instructions, frequency_weight, tags
            )
            VALUES (
                @name, @cuisine, @country_of_origin, @image_path, @prep_time, @cook_time,
                @servings, @ingredients, @instructions, @frequency_weight, @tags
            )
        `);

        const result = stmt.run({
            name,
            cuisine: cuisine || null,
            country_of_origin: country_of_origin || null,
            image_path: image_path || null,
            prep_time: prep_time || null,
            cook_time: cook_time || null,
            servings: servings || 4,
            ingredients: JSON.stringify(ingredients),
            instructions,
            frequency_weight: frequency_weight || 1.0,
            tags: tags ? JSON.stringify(tags) : null
        });

        return this.getRecipeById(result.lastInsertRowid);
    }

    // Update recipe
    updateRecipe(id, recipeData) {
        const existing = this.getRecipeById(id);
        if (!existing) {
            return null;
        }

        const {
            name,
            cuisine,
            country_of_origin,
            image_path,
            prep_time,
            cook_time,
            servings,
            ingredients,
            instructions,
            frequency_weight,
            tags
        } = recipeData;

        const stmt = this.db.prepare(`
            UPDATE recipes
            SET name = @name,
                cuisine = @cuisine,
                country_of_origin = @country_of_origin,
                image_path = @image_path,
                prep_time = @prep_time,
                cook_time = @cook_time,
                servings = @servings,
                ingredients = @ingredients,
                instructions = @instructions,
                frequency_weight = @frequency_weight,
                tags = @tags,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = @id
        `);

        stmt.run({
            id,
            name: name !== undefined ? name : existing.name,
            cuisine: cuisine !== undefined ? cuisine : existing.cuisine,
            country_of_origin: country_of_origin !== undefined ? country_of_origin : existing.country_of_origin,
            image_path: image_path !== undefined ? image_path : existing.image_path,
            prep_time: prep_time !== undefined ? prep_time : existing.prep_time,
            cook_time: cook_time !== undefined ? cook_time : existing.cook_time,
            servings: servings !== undefined ? servings : existing.servings,
            ingredients: ingredients !== undefined ? JSON.stringify(ingredients) : JSON.stringify(existing.ingredients),
            instructions: instructions !== undefined ? instructions : existing.instructions,
            frequency_weight: frequency_weight !== undefined ? frequency_weight : existing.frequency_weight,
            tags: tags !== undefined ? JSON.stringify(tags) : (existing.tags ? JSON.stringify(existing.tags) : null)
        });

        return this.getRecipeById(id);
    }

    // Delete recipe
    deleteRecipe(id) {
        const stmt = this.db.prepare('DELETE FROM recipes WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Get distinct cuisines
    getCuisines() {
        const stmt = this.db.prepare('SELECT DISTINCT cuisine FROM recipes WHERE cuisine IS NOT NULL ORDER BY cuisine');
        return stmt.all().map(row => row.cuisine);
    }

    // Get distinct countries
    getCountries() {
        const stmt = this.db.prepare('SELECT DISTINCT country_of_origin FROM recipes WHERE country_of_origin IS NOT NULL ORDER BY country_of_origin');
        return stmt.all().map(row => row.country_of_origin);
    }

    // Get recipe count
    getRecipeCount(filters = {}) {
        let query = 'SELECT COUNT(*) as count FROM recipes WHERE 1=1';
        const params = {};

        if (filters.cuisine) {
            query += ' AND cuisine = @cuisine';
            params.cuisine = filters.cuisine;
        }

        if (filters.country) {
            query += ' AND country_of_origin = @country';
            params.country = filters.country;
        }

        if (filters.search) {
            query += ' AND (name LIKE @search OR cuisine LIKE @search OR country_of_origin LIKE @search)';
            params.search = `%${filters.search}%`;
        }

        const stmt = this.db.prepare(query);
        const result = stmt.get(params);
        return result.count;
    }
}

module.exports = RecipeService;
