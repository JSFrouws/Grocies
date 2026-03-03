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
        } catch (e) { /* already exists */ }
        try {
            this.db.exec(`ALTER TABLE meal_queue ADD COLUMN ingredients_bought BOOLEAN DEFAULT 0`);
        } catch (e) { /* already exists */ }
        try {
            this.db.exec(`ALTER TABLE ingredient_mappings ADD COLUMN package_amount REAL`);
        } catch (e) { /* already exists */ }
        try {
            this.db.exec(`ALTER TABLE ingredient_mappings ADD COLUMN package_unit TEXT`);
        } catch (e) { /* already exists */ }
        try {
            this.db.exec(`ALTER TABLE ingredient_mappings ADD COLUMN shelf_life_days INTEGER`);
        } catch (e) { /* already exists */ }

        // Create stock table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS stock (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ingredient_name TEXT NOT NULL,
                jumbo_sku TEXT,
                quantity_remaining REAL NOT NULL,
                unit TEXT NOT NULL,
                purchased_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiry_date DATETIME,
                is_discarded BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_ingredient ON stock(ingredient_name)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_expiry ON stock(expiry_date)`);

        // Create indexes for performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_queue_order ON meal_queue(list_index);
            CREATE INDEX IF NOT EXISTS idx_history_recipe ON consumption_history(recipe_id, consumed_date);
            CREATE INDEX IF NOT EXISTS idx_history_date ON consumption_history(consumed_date);
            CREATE INDEX IF NOT EXISTS idx_mappings_ingredient ON ingredient_mappings(ingredient_name);
        `);

        // Migrate existing English seed recipes to Dutch
        this.migrateRecipesToDutch();

        console.log('✓ Database schema initialized');
    }

    // One-time migration: translate English seed recipes to Dutch
    migrateRecipesToDutch() {
        const translations = [
            {
                oldName: 'Chicken Stir-Fry',
                name: 'Kip Roerbak',
                cuisine: 'Aziatisch',
                ingredients: JSON.stringify([
                    { name: 'kipfilet', amount: '500', unit: 'g' },
                    { name: 'paprika', amount: '2', unit: 'stuks' },
                    { name: 'broccoli', amount: '200', unit: 'g' },
                    { name: 'sojasaus', amount: '3', unit: 'el' },
                    { name: 'gember', amount: '1', unit: 'el' },
                    { name: 'knoflook', amount: '3', unit: 'tenen' },
                    { name: 'rijst', amount: '300', unit: 'g' }
                ]),
                instructions: '1. Kook de rijst volgens de verpakking.\n2. Snijd de kip in hapklare stukjes.\n3. Snijd de groenten.\n4. Verhit de wok en bak de kip goudbruin.\n5. Voeg de groenten toe en roerbak 5 minuten.\n6. Voeg sojasaus, gember en knoflook toe.\n7. Serveer over de rijst.',
                tags: JSON.stringify(['gezond', 'snel', 'Aziatisch'])
            },
            {
                oldName: 'Greek Salad',
                name: 'Griekse Salade',
                cuisine: 'Mediterraans',
                ingredients: JSON.stringify([
                    { name: 'tomaten', amount: '4', unit: 'stuks' },
                    { name: 'komkommer', amount: '1', unit: 'stuks' },
                    { name: 'rode ui', amount: '1', unit: 'stuks' },
                    { name: 'feta kaas', amount: '200', unit: 'g' },
                    { name: 'olijven', amount: '100', unit: 'g' },
                    { name: 'olijfolie', amount: '4', unit: 'el' },
                    { name: 'oregano', amount: '1', unit: 'tl' }
                ]),
                instructions: '1. Snijd de tomaten, komkommer en ui.\n2. Doe alles in een grote kom.\n3. Voeg de olijven toe.\n4. Snijd de feta in blokjes en voeg toe aan de salade.\n5. Besprenkel met olijfolie.\n6. Bestrooi met oregano.\n7. Meng voorzichtig en serveer.',
                tags: JSON.stringify(['gezond', 'vegetarisch', 'zonder-koken', 'mediterraans'])
            },
            {
                oldName: 'Beef Tacos',
                name: "Taco's met Gehakt",
                cuisine: 'Mexicaans',
                ingredients: JSON.stringify([
                    { name: 'rundergehakt', amount: '500', unit: 'g' },
                    { name: 'tacoschelpen', amount: '12', unit: 'stuks' },
                    { name: 'ijsbergsla', amount: '1', unit: 'krop' },
                    { name: 'tomaten', amount: '2', unit: 'stuks' },
                    { name: 'geraspte kaas', amount: '200', unit: 'g' },
                    { name: 'zure room', amount: '150', unit: 'g' },
                    { name: 'tacokruiden', amount: '2', unit: 'el' }
                ]),
                instructions: "1. Bak het gehakt bruin in een pan.\n2. Voeg tacokruiden en water toe, laat 10 minuten sudderen.\n3. Verwarm de tacoschelpen.\n4. Snijd de sla en tomaten.\n5. Rasp de kaas.\n6. Vul de taco's met gehakt, sla, tomaten en kaas.\n7. Werk af met zure room.",
                tags: JSON.stringify(['snel', 'Mexicaans', 'kindvriendelijk'])
            },
            {
                oldName: 'Vegetable Curry',
                name: 'Groentecurry',
                cuisine: 'Indiaas',
                ingredients: JSON.stringify([
                    { name: 'aardappelen', amount: '2', unit: 'stuks' },
                    { name: 'bloemkool', amount: '1', unit: 'stuks' },
                    { name: 'kikkererwten', amount: '400', unit: 'g' },
                    { name: 'kokosmelk', amount: '400', unit: 'ml' },
                    { name: 'kerriepoeder', amount: '2', unit: 'el' },
                    { name: 'ui', amount: '1', unit: 'stuks' },
                    { name: 'knoflook', amount: '3', unit: 'tenen' },
                    { name: 'rijst', amount: '300', unit: 'g' }
                ]),
                instructions: '1. Kook de rijst.\n2. Snijd de aardappelen en bloemkool in stukjes.\n3. Fruit de ui en knoflook.\n4. Voeg kerriepoeder toe en bak 1 minuut mee.\n5. Voeg de groenten en kokosmelk toe.\n6. Laat 25 minuten sudderen tot de groenten gaar zijn.\n7. Voeg de kikkererwten toe en warm door.\n8. Serveer over de rijst.',
                tags: JSON.stringify(['vegetarisch', 'veganistisch', 'Indiaas', 'gezond'])
            },
            {
                oldName: 'Salmon with Roasted Vegetables',
                name: 'Zalm met Geroosterde Groenten',
                cuisine: 'Scandinavisch',
                ingredients: JSON.stringify([
                    { name: 'zalmfilets', amount: '4', unit: 'stuks' },
                    { name: 'broccoli', amount: '300', unit: 'g' },
                    { name: 'wortels', amount: '3', unit: 'stuks' },
                    { name: 'aardappelen', amount: '500', unit: 'g' },
                    { name: 'olijfolie', amount: '3', unit: 'el' },
                    { name: 'citroen', amount: '1', unit: 'stuks' },
                    { name: 'dille', amount: '2', unit: 'el' }
                ]),
                instructions: '1. Verwarm de oven voor op 200\u00B0C.\n2. Snijd de groenten in stukken.\n3. Meng de groenten met olijfolie, zout en peper.\n4. Rooster de groenten 15 minuten.\n5. Leg de zalmfilets op de bakplaat.\n6. Breng op smaak met dille en citroensap.\n7. Rooster nog 10 minuten.\n8. Serveer met partjes citroen.',
                tags: JSON.stringify(['gezond', 'vis', 'geroosterd'])
            },
            {
                oldName: 'Pasta Carbonara',
                name: 'Pasta Carbonara',
                cuisine: 'Italiaans',
                ingredients: JSON.stringify([
                    { name: 'spaghetti', amount: '400', unit: 'g' },
                    { name: 'eieren', amount: '4', unit: 'stuks' },
                    { name: 'spekjes', amount: '200', unit: 'g' },
                    { name: 'Parmezaanse kaas', amount: '100', unit: 'g' },
                    { name: 'zwarte peper', amount: '1', unit: 'tl' }
                ]),
                instructions: '1. Kook de spaghetti volgens de verpakking.\n2. Bak de spekjes knapperig.\n3. Klop de eieren met geraspte Parmezaanse kaas.\n4. Giet de pasta af en meng met de spekjes.\n5. Haal van het vuur, voeg het eimengsel toe en roer snel.\n6. Breng op smaak met zwarte peper en serveer.',
                tags: JSON.stringify(['snel', 'Italiaans', 'comforteten'])
            },
            {
                oldName: 'Spaghetti Bolognese',
                name: 'Spaghetti Bolognese',
                cuisine: 'Italiaans',
                ingredients: JSON.stringify([
                    { name: 'rundergehakt', amount: '500', unit: 'g' },
                    { name: 'spaghetti', amount: '400', unit: 'g' },
                    { name: 'tomatensaus', amount: '400', unit: 'g' },
                    { name: 'ui', amount: '1', unit: 'stuks' },
                    { name: 'knoflook', amount: '3', unit: 'tenen' },
                    { name: 'wortels', amount: '2', unit: 'stuks' },
                    { name: 'rode wijn', amount: '100', unit: 'ml' },
                    { name: 'Parmezaanse kaas', amount: '100', unit: 'g' }
                ]),
                instructions: '1. Snijd de ui, knoflook en wortels.\n2. Bak het gehakt bruin in een grote pan.\n3. Voeg de groenten toe en bak tot ze zacht zijn.\n4. Voeg de tomatensaus en rode wijn toe.\n5. Laat 30 minuten sudderen en roer af en toe.\n6. Kook de spaghetti volgens de verpakking.\n7. Giet de pasta af en serveer met de saus.\n8. Werk af met geraspte Parmezaanse kaas.',
                tags: JSON.stringify(['Italiaans', 'comforteten', 'familiefavoriet'])
            }
        ];

        const updateStmt = this.db.prepare(`
            UPDATE recipes SET
                name = @name,
                cuisine = @cuisine,
                ingredients = @ingredients,
                instructions = @instructions,
                tags = @tags,
                updated_at = CURRENT_TIMESTAMP
            WHERE name = @oldName
        `);

        let updated = 0;
        for (const t of translations) {
            const result = updateStmt.run(t);
            updated += result.changes;
        }

        if (updated > 0) {
            console.log(`✓ Migrated ${updated} recipes to Dutch`);
        }
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
                    cuisine: 'Italiaans',
                    country_of_origin: 'Italy',
                    prep_time: 10,
                    cook_time: 20,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'spaghetti', amount: '400', unit: 'g' },
                        { name: 'eieren', amount: '4', unit: 'stuks' },
                        { name: 'spekjes', amount: '200', unit: 'g' },
                        { name: 'Parmezaanse kaas', amount: '100', unit: 'g' },
                        { name: 'zwarte peper', amount: '1', unit: 'tl' }
                    ]),
                    instructions: '1. Kook de spaghetti volgens de verpakking.\n2. Bak de spekjes knapperig.\n3. Klop de eieren met geraspte Parmezaanse kaas.\n4. Giet de pasta af en meng met de spekjes.\n5. Haal van het vuur, voeg het eimengsel toe en roer snel.\n6. Breng op smaak met zwarte peper en serveer.',
                    frequency_weight: 1.2,
                    tags: JSON.stringify(['snel', 'Italiaans', 'comforteten'])
                },
                {
                    name: 'Kip Roerbak',
                    cuisine: 'Aziatisch',
                    country_of_origin: 'China',
                    prep_time: 15,
                    cook_time: 15,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'kipfilet', amount: '500', unit: 'g' },
                        { name: 'paprika', amount: '2', unit: 'stuks' },
                        { name: 'broccoli', amount: '200', unit: 'g' },
                        { name: 'sojasaus', amount: '3', unit: 'el' },
                        { name: 'gember', amount: '1', unit: 'el' },
                        { name: 'knoflook', amount: '3', unit: 'tenen' },
                        { name: 'rijst', amount: '300', unit: 'g' }
                    ]),
                    instructions: '1. Kook de rijst volgens de verpakking.\n2. Snijd de kip in hapklare stukjes.\n3. Snijd de groenten.\n4. Verhit de wok en bak de kip goudbruin.\n5. Voeg de groenten toe en roerbak 5 minuten.\n6. Voeg sojasaus, gember en knoflook toe.\n7. Serveer over de rijst.',
                    frequency_weight: 1.0,
                    tags: JSON.stringify(['gezond', 'snel', 'Aziatisch'])
                },
                {
                    name: 'Griekse Salade',
                    cuisine: 'Mediterraans',
                    country_of_origin: 'Greece',
                    prep_time: 15,
                    cook_time: 0,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'tomaten', amount: '4', unit: 'stuks' },
                        { name: 'komkommer', amount: '1', unit: 'stuks' },
                        { name: 'rode ui', amount: '1', unit: 'stuks' },
                        { name: 'feta kaas', amount: '200', unit: 'g' },
                        { name: 'olijven', amount: '100', unit: 'g' },
                        { name: 'olijfolie', amount: '4', unit: 'el' },
                        { name: 'oregano', amount: '1', unit: 'tl' }
                    ]),
                    instructions: '1. Snijd de tomaten, komkommer en ui.\n2. Doe alles in een grote kom.\n3. Voeg de olijven toe.\n4. Snijd de feta in blokjes en voeg toe aan de salade.\n5. Besprenkel met olijfolie.\n6. Bestrooi met oregano.\n7. Meng voorzichtig en serveer.',
                    frequency_weight: 0.8,
                    tags: JSON.stringify(['gezond', 'vegetarisch', 'zonder-koken', 'mediterraans'])
                },
                {
                    name: "Taco's met Gehakt",
                    cuisine: 'Mexicaans',
                    country_of_origin: 'Mexico',
                    prep_time: 10,
                    cook_time: 20,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'rundergehakt', amount: '500', unit: 'g' },
                        { name: 'tacoschelpen', amount: '12', unit: 'stuks' },
                        { name: 'ijsbergsla', amount: '1', unit: 'krop' },
                        { name: 'tomaten', amount: '2', unit: 'stuks' },
                        { name: 'geraspte kaas', amount: '200', unit: 'g' },
                        { name: 'zure room', amount: '150', unit: 'g' },
                        { name: 'tacokruiden', amount: '2', unit: 'el' }
                    ]),
                    instructions: "1. Bak het gehakt bruin in een pan.\n2. Voeg tacokruiden en water toe, laat 10 minuten sudderen.\n3. Verwarm de tacoschelpen.\n4. Snijd de sla en tomaten.\n5. Rasp de kaas.\n6. Vul de taco's met gehakt, sla, tomaten en kaas.\n7. Werk af met zure room.",
                    frequency_weight: 1.3,
                    tags: JSON.stringify(['snel', 'Mexicaans', 'kindvriendelijk'])
                },
                {
                    name: 'Groentecurry',
                    cuisine: 'Indiaas',
                    country_of_origin: 'India',
                    prep_time: 15,
                    cook_time: 30,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'aardappelen', amount: '2', unit: 'stuks' },
                        { name: 'bloemkool', amount: '1', unit: 'stuks' },
                        { name: 'kikkererwten', amount: '400', unit: 'g' },
                        { name: 'kokosmelk', amount: '400', unit: 'ml' },
                        { name: 'kerriepoeder', amount: '2', unit: 'el' },
                        { name: 'ui', amount: '1', unit: 'stuks' },
                        { name: 'knoflook', amount: '3', unit: 'tenen' },
                        { name: 'rijst', amount: '300', unit: 'g' }
                    ]),
                    instructions: '1. Kook de rijst.\n2. Snijd de aardappelen en bloemkool in stukjes.\n3. Fruit de ui en knoflook.\n4. Voeg kerriepoeder toe en bak 1 minuut mee.\n5. Voeg de groenten en kokosmelk toe.\n6. Laat 25 minuten sudderen tot de groenten gaar zijn.\n7. Voeg de kikkererwten toe en warm door.\n8. Serveer over de rijst.',
                    frequency_weight: 0.9,
                    tags: JSON.stringify(['vegetarisch', 'veganistisch', 'Indiaas', 'gezond'])
                },
                {
                    name: 'Zalm met Geroosterde Groenten',
                    cuisine: 'Scandinavisch',
                    country_of_origin: 'Norway',
                    prep_time: 15,
                    cook_time: 25,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'zalmfilets', amount: '4', unit: 'stuks' },
                        { name: 'broccoli', amount: '300', unit: 'g' },
                        { name: 'wortels', amount: '3', unit: 'stuks' },
                        { name: 'aardappelen', amount: '500', unit: 'g' },
                        { name: 'olijfolie', amount: '3', unit: 'el' },
                        { name: 'citroen', amount: '1', unit: 'stuks' },
                        { name: 'dille', amount: '2', unit: 'el' }
                    ]),
                    instructions: '1. Verwarm de oven voor op 200\u00B0C.\n2. Snijd de groenten in stukken.\n3. Meng de groenten met olijfolie, zout en peper.\n4. Rooster de groenten 15 minuten.\n5. Leg de zalmfilets op de bakplaat.\n6. Breng op smaak met dille en citroensap.\n7. Rooster nog 10 minuten.\n8. Serveer met partjes citroen.',
                    frequency_weight: 1.1,
                    tags: JSON.stringify(['gezond', 'vis', 'geroosterd'])
                },
                {
                    name: 'Spaghetti Bolognese',
                    cuisine: 'Italiaans',
                    country_of_origin: 'Italy',
                    prep_time: 15,
                    cook_time: 45,
                    servings: 4,
                    ingredients: JSON.stringify([
                        { name: 'rundergehakt', amount: '500', unit: 'g' },
                        { name: 'spaghetti', amount: '400', unit: 'g' },
                        { name: 'tomatensaus', amount: '400', unit: 'g' },
                        { name: 'ui', amount: '1', unit: 'stuks' },
                        { name: 'knoflook', amount: '3', unit: 'tenen' },
                        { name: 'wortels', amount: '2', unit: 'stuks' },
                        { name: 'rode wijn', amount: '100', unit: 'ml' },
                        { name: 'Parmezaanse kaas', amount: '100', unit: 'g' }
                    ]),
                    instructions: '1. Snijd de ui, knoflook en wortels.\n2. Bak het gehakt bruin in een grote pan.\n3. Voeg de groenten toe en bak tot ze zacht zijn.\n4. Voeg de tomatensaus en rode wijn toe.\n5. Laat 30 minuten sudderen en roer af en toe.\n6. Kook de spaghetti volgens de verpakking.\n7. Giet de pasta af en serveer met de saus.\n8. Werk af met geraspte Parmezaanse kaas.',
                    frequency_weight: 1.5,
                    tags: JSON.stringify(['Italiaans', 'comforteten', 'familiefavoriet'])
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
