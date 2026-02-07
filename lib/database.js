const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class MealPlannerDatabase {
    constructor(dbPath = './data/meal-planner.db') {
        // Ensure data directory exists
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Initialize database connection
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL'); // Better concurrency

        // Initialize schema
        this.initializeSchema();

        console.log(`✓ Database initialized at ${dbPath}`);
    }

    initializeSchema() {
        // Create recipes table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                cuisine TEXT,
                country_of_origin TEXT,
                image_path TEXT,
                prep_time INTEGER,
                cook_time INTEGER,
                servings INTEGER DEFAULT 4,
                ingredients TEXT NOT NULL,
                instructions TEXT NOT NULL,
                frequency_weight REAL DEFAULT 1.0,
                tags TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create meal_queue table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS meal_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_id INTEGER NOT NULL,
                list_index INTEGER NOT NULL,
                date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
            )
        `);

        // Create consumption_history table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS consumption_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_id INTEGER NOT NULL,
                consumed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                rating INTEGER,
                notes TEXT,
                FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
            )
        `);

        // Create ingredient_mappings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ingredient_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ingredient_name TEXT NOT NULL,
                jumbo_product_id TEXT NOT NULL,
                jumbo_sku TEXT NOT NULL,
                product_details TEXT,
                preferred BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ingredient_name, jumbo_sku)
            )
        `);

        // Create recurring_items table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS recurring_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_name TEXT NOT NULL UNIQUE,
                category TEXT,
                occurrence_rate TEXT,
                last_added_date DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migrations: add columns if missing
        try {
            this.db.exec(`ALTER TABLE ingredient_mappings ADD COLUMN skip_in_list BOOLEAN DEFAULT 0`);
        } catch (e) {
            // Column already exists
        }

        // Create indexes for performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_queue_order ON meal_queue(list_index);
            CREATE INDEX IF NOT EXISTS idx_history_recipe ON consumption_history(recipe_id, consumed_date);
            CREATE INDEX IF NOT EXISTS idx_history_date ON consumption_history(consumed_date);
            CREATE INDEX IF NOT EXISTS idx_mappings_ingredient ON ingredient_mappings(ingredient_name);
        `);

        console.log('✓ Database schema initialized');
    }

    // Seed sample data
    seedSampleData() {
        const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM recipes');
        const { count } = countStmt.get();

        if (count === 0) {
            console.log('Seeding sample recipes...');

            const sampleRecipes = [
                {
                    name: 'Pasta Carbonara',
                    cuisine: 'Italian',
                    country_of_origin: 'Italy',
                    prep_time: 10,
                    cook_time: 20,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'spaghetti', amount: '400', unit: 'g' },
                        { name: 'eggs', amount: '4', unit: 'whole' },
                        { name: 'pancetta', amount: '200', unit: 'g' },
                        { name: 'parmesan cheese', amount: '100', unit: 'g' },
                        { name: 'black pepper', amount: '1', unit: 'tsp' }
                    ]),
                    instructions: '1. Cook spaghetti according to package instructions.\n2. Fry pancetta until crispy.\n3. Beat eggs with grated parmesan.\n4. Drain pasta, mix with pancetta.\n5. Remove from heat, add egg mixture, stir quickly.\n6. Season with black pepper and serve.',
                    frequency_weight: 1.2,
                    tags: JSON.stringify(['quick', 'italian', 'comfort-food'])
                },
                {
                    name: 'Chicken Stir-Fry',
                    cuisine: 'Asian',
                    country_of_origin: 'China',
                    prep_time: 15,
                    cook_time: 15,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'chicken breast', amount: '500', unit: 'g' },
                        { name: 'bell peppers', amount: '2', unit: 'whole' },
                        { name: 'broccoli', amount: '200', unit: 'g' },
                        { name: 'soy sauce', amount: '3', unit: 'tbsp' },
                        { name: 'ginger', amount: '1', unit: 'tbsp' },
                        { name: 'garlic', amount: '3', unit: 'cloves' },
                        { name: 'rice', amount: '300', unit: 'g' }
                    ]),
                    instructions: '1. Cook rice according to package.\n2. Cut chicken into bite-sized pieces.\n3. Chop vegetables.\n4. Heat wok, cook chicken until golden.\n5. Add vegetables, stir-fry for 5 minutes.\n6. Add soy sauce, ginger, and garlic.\n7. Serve over rice.',
                    frequency_weight: 1.0,
                    tags: JSON.stringify(['healthy', 'quick', 'asian'])
                },
                {
                    name: 'Greek Salad',
                    cuisine: 'Mediterranean',
                    country_of_origin: 'Greece',
                    prep_time: 15,
                    cook_time: 0,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'tomatoes', amount: '4', unit: 'whole' },
                        { name: 'cucumber', amount: '1', unit: 'whole' },
                        { name: 'red onion', amount: '1', unit: 'whole' },
                        { name: 'feta cheese', amount: '200', unit: 'g' },
                        { name: 'olives', amount: '100', unit: 'g' },
                        { name: 'olive oil', amount: '4', unit: 'tbsp' },
                        { name: 'oregano', amount: '1', unit: 'tsp' }
                    ]),
                    instructions: '1. Chop tomatoes, cucumber, and onion.\n2. Combine in a large bowl.\n3. Add olives.\n4. Cube feta cheese and add to salad.\n5. Drizzle with olive oil.\n6. Sprinkle with oregano.\n7. Toss gently and serve.',
                    frequency_weight: 0.8,
                    tags: JSON.stringify(['healthy', 'vegetarian', 'no-cook', 'mediterranean'])
                },
                {
                    name: 'Beef Tacos',
                    cuisine: 'Mexican',
                    country_of_origin: 'Mexico',
                    prep_time: 10,
                    cook_time: 20,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'ground beef', amount: '500', unit: 'g' },
                        { name: 'taco shells', amount: '12', unit: 'whole' },
                        { name: 'lettuce', amount: '1', unit: 'head' },
                        { name: 'tomatoes', amount: '2', unit: 'whole' },
                        { name: 'cheddar cheese', amount: '200', unit: 'g' },
                        { name: 'sour cream', amount: '150', unit: 'g' },
                        { name: 'taco seasoning', amount: '2', unit: 'tbsp' }
                    ]),
                    instructions: '1. Brown ground beef in a pan.\n2. Add taco seasoning and water, simmer 10 minutes.\n3. Warm taco shells.\n4. Chop lettuce and tomatoes.\n5. Grate cheese.\n6. Assemble tacos with beef, lettuce, tomatoes, cheese.\n7. Top with sour cream.',
                    frequency_weight: 1.3,
                    tags: JSON.stringify(['quick', 'mexican', 'kids-friendly'])
                },
                {
                    name: 'Vegetable Curry',
                    cuisine: 'Indian',
                    country_of_origin: 'India',
                    prep_time: 15,
                    cook_time: 30,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'potatoes', amount: '2', unit: 'whole' },
                        { name: 'cauliflower', amount: '1', unit: 'head' },
                        { name: 'chickpeas', amount: '400', unit: 'g' },
                        { name: 'coconut milk', amount: '400', unit: 'ml' },
                        { name: 'curry powder', amount: '2', unit: 'tbsp' },
                        { name: 'onion', amount: '1', unit: 'whole' },
                        { name: 'garlic', amount: '3', unit: 'cloves' },
                        { name: 'rice', amount: '300', unit: 'g' }
                    ]),
                    instructions: '1. Cook rice.\n2. Dice potatoes and cauliflower.\n3. Sauté onion and garlic.\n4. Add curry powder, cook 1 minute.\n5. Add vegetables and coconut milk.\n6. Simmer 25 minutes until vegetables tender.\n7. Add chickpeas, heat through.\n8. Serve over rice.',
                    frequency_weight: 0.9,
                    tags: JSON.stringify(['vegetarian', 'vegan', 'indian', 'healthy'])
                },
                {
                    name: 'Salmon with Roasted Vegetables',
                    cuisine: 'Scandinavian',
                    country_of_origin: 'Norway',
                    prep_time: 15,
                    cook_time: 25,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'salmon fillets', amount: '4', unit: 'pieces' },
                        { name: 'broccoli', amount: '300', unit: 'g' },
                        { name: 'carrots', amount: '3', unit: 'whole' },
                        { name: 'potatoes', amount: '500', unit: 'g' },
                        { name: 'olive oil', amount: '3', unit: 'tbsp' },
                        { name: 'lemon', amount: '1', unit: 'whole' },
                        { name: 'dill', amount: '2', unit: 'tbsp' }
                    ]),
                    instructions: '1. Preheat oven to 200°C.\n2. Cut vegetables into chunks.\n3. Toss vegetables with olive oil, salt, pepper.\n4. Roast vegetables 15 minutes.\n5. Add salmon fillets to baking sheet.\n6. Season with dill, lemon juice.\n7. Roast 10 more minutes.\n8. Serve with lemon wedges.',
                    frequency_weight: 1.1,
                    tags: JSON.stringify(['healthy', 'fish', 'roasted'])
                },
                {
                    name: 'Spaghetti Bolognese',
                    cuisine: 'Italian',
                    country_of_origin: 'Italy',
                    prep_time: 15,
                    cook_time: 45,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'ground beef', amount: '500', unit: 'g' },
                        { name: 'spaghetti', amount: '400', unit: 'g' },
                        { name: 'tomato sauce', amount: '400', unit: 'g' },
                        { name: 'onion', amount: '1', unit: 'whole' },
                        { name: 'garlic', amount: '3', unit: 'cloves' },
                        { name: 'carrots', amount: '2', unit: 'whole' },
                        { name: 'red wine', amount: '100', unit: 'ml' },
                        { name: 'parmesan cheese', amount: '100', unit: 'g' }
                    ]),
                    instructions: '1. Dice onion, garlic, and carrots.\n2. Brown ground beef in large pot.\n3. Add vegetables, cook until soft.\n4. Add tomato sauce and red wine.\n5. Simmer 30 minutes, stirring occasionally.\n6. Cook spaghetti according to package.\n7. Drain pasta, serve with sauce.\n8. Top with grated parmesan.',
                    frequency_weight: 1.5,
                    tags: JSON.stringify(['italian', 'comfort-food', 'family-favorite'])
                }
            ];

            const insertStmt = this.db.prepare(`
                INSERT INTO recipes (name, cuisine, country_of_origin, prep_time, cook_time, servings, ingredients, instructions, frequency_weight, tags)
                VALUES (@name, @cuisine, @country_of_origin, @prep_time, @cook_time, @servings, @ingredients, @instructions, @frequency_weight, @tags)
            `);

            const insertMany = this.db.transaction((recipes) => {
                for (const recipe of recipes) {
                    insertStmt.run(recipe);
                }
            });

            insertMany(sampleRecipes);
            console.log(`✓ Seeded ${sampleRecipes.length} sample recipes`);
        } else {
            console.log(`✓ Database already contains ${count} recipes`);
        }
    }

    // Get database instance
    getDb() {
        return this.db;
    }

    // Close database connection
    close() {
        this.db.close();
        console.log('✓ Database connection closed');
    }
}

module.exports = MealPlannerDatabase;
