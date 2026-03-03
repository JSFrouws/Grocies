class QueueService {
    constructor(db) {
        this.db = db;
    }

    // Get current queue ordered by list_index
    getQueue() {
        const stmt = this.db.prepare(`
            SELECT
                mq.id,
                mq.recipe_id,
                mq.list_index,
                mq.date_added,
                mq.ingredients_bought,
                r.name,
                r.cuisine,
                r.country_of_origin,
                r.image_path,
                r.prep_time,
                r.cook_time,
                r.servings,
                r.ingredients,
                r.tags
            FROM meal_queue mq
            JOIN recipes r ON mq.recipe_id = r.id
            ORDER BY mq.list_index ASC
        `);

        const queueItems = stmt.all();

        return queueItems.map(item => ({
            ...item,
            ingredients: JSON.parse(item.ingredients),
            tags: item.tags ? JSON.parse(item.tags) : [],
            ingredients_bought: Boolean(item.ingredients_bought)
        }));
    }

    // Get queue item by ID
    getQueueItemById(id) {
        const stmt = this.db.prepare(`
            SELECT
                mq.id,
                mq.recipe_id,
                mq.list_index,
                mq.date_added,
                mq.ingredients_bought,
                r.name,
                r.cuisine,
                r.country_of_origin,
                r.image_path,
                r.prep_time,
                r.cook_time,
                r.servings,
                r.ingredients,
                r.tags
            FROM meal_queue mq
            JOIN recipes r ON mq.recipe_id = r.id
            WHERE mq.id = ?
        `);

        const item = stmt.get(id);
        if (!item) return null;

        return {
            ...item,
            ingredients: JSON.parse(item.ingredients),
            tags: item.tags ? JSON.parse(item.tags) : [],
            ingredients_bought: Boolean(item.ingredients_bought)
        };
    }

    // Add recipe to queue
    addToQueue(recipeId) {
        // Get max list_index
        const maxIndexStmt = this.db.prepare('SELECT MAX(list_index) as max_index FROM meal_queue');
        const { max_index } = maxIndexStmt.get();
        const newIndex = (max_index || 0) + 1;

        // Insert into queue
        const insertStmt = this.db.prepare(`
            INSERT INTO meal_queue (recipe_id, list_index)
            VALUES (?, ?)
        `);

        const result = insertStmt.run(recipeId, newIndex);
        return this.getQueueItemById(result.lastInsertRowid);
    }

    // Add random recipe with weighted selection.
    // Recipes that use stock ingredients expiring within EXPIRY_DAYS get a weight boost.
    addRandomRecipe(avoidDays = 14, stockService = null) {
        const EXPIRY_BOOST = 3.0;
        const EXPIRY_DAYS = 7;

        // Get recently consumed recipe IDs
        const recentStmt = this.db.prepare(`
            SELECT DISTINCT recipe_id
            FROM consumption_history
            WHERE consumed_date >= datetime('now', '-' || ? || ' days')
        `);
        const recentRecipes = recentStmt.all(avoidDays).map(row => row.recipe_id);

        // Get available recipes (not recently consumed, not currently in queue)
        const queuedStmt = this.db.prepare('SELECT recipe_id FROM meal_queue');
        const queuedRecipes = queuedStmt.all().map(row => row.recipe_id);

        const excludedIds = [...new Set([...recentRecipes, ...queuedRecipes])];

        let query = 'SELECT id, name, frequency_weight, ingredients FROM recipes';

        if (excludedIds.length > 0) {
            const placeholders = excludedIds.map(() => '?').join(',');
            query += ` WHERE id NOT IN (${placeholders})`;
        }

        const availableStmt = this.db.prepare(query);
        const availableRecipes = availableStmt.all(...excludedIds);

        if (availableRecipes.length === 0) {
            throw new Error('No available recipes to add. All recipes are either in queue or recently consumed.');
        }

        // Build set of expiring ingredient names (non-expired, within EXPIRY_DAYS)
        const expiringNames = new Set();
        if (stockService) {
            const allStock = stockService.getAllStock(false);
            for (const item of allStock) {
                if (item.quantity_remaining > 0 && item.daysLeft !== null
                    && item.daysLeft >= 0 && item.daysLeft <= EXPIRY_DAYS) {
                    expiringNames.add(item.ingredient_name.toLowerCase().trim());
                }
            }
            if (expiringNames.size > 0) {
                console.log(`⏰ Expiry boost active for: ${[...expiringNames].join(', ')}`);
            }
        }

        // Apply expiry boost to recipes that use at least one expiring ingredient
        const weightedRecipes = availableRecipes.map(recipe => {
            let weight = recipe.frequency_weight;
            if (expiringNames.size > 0) {
                try {
                    const ingredients = JSON.parse(recipe.ingredients);
                    const usesExpiring = ingredients.some(ing =>
                        expiringNames.has(ing.name.toLowerCase().trim())
                    );
                    if (usesExpiring) weight *= EXPIRY_BOOST;
                } catch (e) { /* skip malformed */ }
            }
            return { ...recipe, frequency_weight: weight };
        });

        const selectedRecipe = this.weightedRandomSelection(weightedRecipes);
        return this.addToQueue(selectedRecipe.id);
    }

    // Weighted random selection algorithm
    weightedRandomSelection(recipes) {
        const totalWeight = recipes.reduce((sum, recipe) => sum + recipe.frequency_weight, 0);
        let random = Math.random() * totalWeight;

        for (const recipe of recipes) {
            random -= recipe.frequency_weight;
            if (random <= 0) {
                return recipe;
            }
        }

        // Fallback to last recipe if something goes wrong
        return recipes[recipes.length - 1];
    }

    // Remove from queue
    removeFromQueue(id) {
        const item = this.getQueueItemById(id);
        if (!item) {
            return false;
        }

        const deleteStmt = this.db.prepare('DELETE FROM meal_queue WHERE id = ?');
        deleteStmt.run(id);

        // Reorder remaining items
        this.reorderAfterRemoval(item.list_index);

        return true;
    }

    // Consume recipe (log to history and remove from queue)
    consumeRecipe(id, rating = null, notes = null, stockService = null) {
        const item = this.getQueueItemById(id);
        if (!item) {
            return null;
        }

        // Insert into consumption history
        const historyStmt = this.db.prepare(`
            INSERT INTO consumption_history (recipe_id, rating, notes)
            VALUES (?, ?, ?)
        `);
        historyStmt.run(item.recipe_id, rating, notes);

        // Consume ingredients from stock
        const stockConsumption = [];
        if (stockService && item.ingredients) {
            for (const ing of item.ingredients) {
                const amount = parseFloat(ing.amount) || 0;
                if (amount > 0) {
                    const result = stockService.consumeFromStock(ing.name, amount, ing.unit || '');
                    if (result.results.length > 0) {
                        stockConsumption.push({
                            ingredient: ing.name,
                            ...result
                        });
                    }
                }
            }
        }

        // Remove from queue
        const deleteStmt = this.db.prepare('DELETE FROM meal_queue WHERE id = ?');
        deleteStmt.run(id);

        // Reorder remaining items
        this.reorderAfterRemoval(item.list_index);

        return {
            recipe_id: item.recipe_id,
            name: item.name,
            consumed: true,
            stockConsumption
        };
    }

    // Reorder queue items
    reorderQueue(itemOrders) {
        // itemOrders: [{ id, list_index }, ...]
        const updateStmt = this.db.prepare('UPDATE meal_queue SET list_index = ? WHERE id = ?');

        const updateMany = this.db.transaction((orders) => {
            for (const order of orders) {
                updateStmt.run(order.list_index, order.id);
            }
        });

        updateMany(itemOrders);
        return this.getQueue();
    }

    // Reorder after removal (fill gap in list_index)
    reorderAfterRemoval(removedIndex) {
        const updateStmt = this.db.prepare(`
            UPDATE meal_queue
            SET list_index = list_index - 1
            WHERE list_index > ?
        `);
        updateStmt.run(removedIndex);
    }

    // Mark recipes as ingredients bought
    markIngredientsBought(queueIds) {
        const stmt = this.db.prepare('UPDATE meal_queue SET ingredients_bought = 1 WHERE id = ?');
        const markMany = this.db.transaction((ids) => {
            for (const id of ids) {
                stmt.run(id);
            }
        });
        markMany(queueIds);
    }

    // Get queue count
    getQueueCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM meal_queue');
        const result = stmt.get();
        return result.count;
    }

    // Get consumption history
    getConsumptionHistory(limit = 50, offset = 0) {
        const stmt = this.db.prepare(`
            SELECT
                ch.id,
                ch.recipe_id,
                ch.consumed_date,
                ch.rating,
                ch.notes,
                r.name,
                r.cuisine,
                r.country_of_origin,
                r.image_path
            FROM consumption_history ch
            JOIN recipes r ON ch.recipe_id = r.id
            ORDER BY ch.consumed_date DESC
            LIMIT ? OFFSET ?
        `);

        return stmt.all(limit, offset);
    }

    // Get consumption statistics
    getConsumptionStats() {
        // Most consumed recipes
        const mostConsumedStmt = this.db.prepare(`
            SELECT
                r.id,
                r.name,
                r.cuisine,
                r.image_path,
                COUNT(ch.id) as consumption_count,
                AVG(ch.rating) as avg_rating
            FROM consumption_history ch
            JOIN recipes r ON ch.recipe_id = r.id
            WHERE ch.rating IS NOT NULL
            GROUP BY r.id
            ORDER BY consumption_count DESC
            LIMIT 10
        `);

        const mostConsumed = mostConsumedStmt.all();

        // Total consumption count
        const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM consumption_history');
        const { count: totalConsumed } = totalStmt.get();

        // Consumption by cuisine
        const byCuisineStmt = this.db.prepare(`
            SELECT
                r.cuisine,
                COUNT(ch.id) as count
            FROM consumption_history ch
            JOIN recipes r ON ch.recipe_id = r.id
            WHERE r.cuisine IS NOT NULL
            GROUP BY r.cuisine
            ORDER BY count DESC
        `);

        const byCuisine = byCuisineStmt.all();

        return {
            mostConsumed,
            totalConsumed,
            byCuisine
        };
    }
}

module.exports = QueueService;
