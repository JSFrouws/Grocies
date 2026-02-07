class ShoppingListService {
    constructor(db, mappingService) {
        this.db = db;
        this.mappingService = mappingService;
    }

    // Generate shopping list from current queue
    generateShoppingList() {
        // Get all recipes in queue
        const queueStmt = this.db.prepare(`
            SELECT r.id, r.name, r.ingredients
            FROM meal_queue mq
            JOIN recipes r ON mq.recipe_id = r.id
            ORDER BY mq.list_index ASC
        `);

        const queuedRecipes = queueStmt.all();

        if (queuedRecipes.length === 0) {
            return {
                recipes: [],
                aggregatedIngredients: [],
                mappedItems: [],
                unmappedItems: []
            };
        }

        // Aggregate all ingredients
        const ingredientMap = new Map();

        for (const recipe of queuedRecipes) {
            const ingredients = JSON.parse(recipe.ingredients);

            for (const ingredient of ingredients) {
                const key = this.normalizeIngredientName(ingredient.name);
                const unit = ingredient.unit || '';

                if (!ingredientMap.has(key)) {
                    ingredientMap.set(key, {
                        originalName: ingredient.name,
                        normalizedName: key,
                        quantities: []
                    });
                }

                ingredientMap.get(key).quantities.push({
                    amount: parseFloat(ingredient.amount) || 0,
                    unit: unit,
                    recipeId: recipe.id,
                    recipeName: recipe.name
                });
            }
        }

        // Aggregate quantities and map to products
        const aggregatedIngredients = [];
        const mappedItems = [];
        const unmappedItems = [];

        for (const [key, data] of ingredientMap) {
            const aggregated = this.aggregateQuantities(data.quantities);

            const ingredientInfo = {
                ingredientName: data.originalName,
                normalizedName: data.normalizedName,
                aggregatedQuantity: aggregated,
                usedInRecipes: data.quantities.map(q => ({
                    recipeId: q.recipeId,
                    recipeName: q.recipeName
                }))
            };

            aggregatedIngredients.push(ingredientInfo);

            // Try to find mapping
            const mapping = this.mappingService.getPreferredMapping(data.originalName);

            if (mapping) {
                mappedItems.push({
                    ...ingredientInfo,
                    mapping: mapping,
                    jumboProductId: mapping.jumbo_product_id,
                    jumboSku: mapping.jumbo_sku,
                    productDetails: mapping.product_details,
                    skipInList: mapping.skip_in_list || false
                });
            } else {
                unmappedItems.push(ingredientInfo);
            }
        }

        // Build per-recipe ingredient view
        const byRecipe = queuedRecipes.map(recipe => {
            const ingredients = JSON.parse(recipe.ingredients);
            return {
                recipeId: recipe.id,
                recipeName: recipe.name,
                ingredients: ingredients.map(ing => {
                    const mapping = this.mappingService.getPreferredMapping(ing.name);
                    return {
                        name: ing.name,
                        amount: ing.amount,
                        unit: ing.unit || '',
                        mapped: !!mapping,
                        skipInList: mapping ? (mapping.skip_in_list || false) : false,
                        mapping: mapping ? {
                            jumboSku: mapping.jumbo_sku,
                            productTitle: mapping.product_details?.title || mapping.jumbo_sku,
                            productImage: mapping.product_details?.image || null
                        } : null
                    };
                })
            };
        });

        return {
            recipes: queuedRecipes.map(r => ({
                id: r.id,
                name: r.name
            })),
            byRecipe,
            aggregatedIngredients,
            mappedItems,
            unmappedItems
        };
    }

    // Aggregate quantities for same unit
    aggregateQuantities(quantities) {
        // Group by unit
        const byUnit = new Map();

        for (const q of quantities) {
            if (!byUnit.has(q.unit)) {
                byUnit.set(q.unit, []);
            }
            byUnit.get(q.unit).push(q.amount);
        }

        // Sum amounts for each unit
        const aggregated = [];

        for (const [unit, amounts] of byUnit) {
            const total = amounts.reduce((sum, amount) => sum + amount, 0);
            aggregated.push({
                amount: this.roundQuantity(total),
                unit: unit
            });
        }

        return aggregated;
    }

    // Round quantity to sensible units
    roundQuantity(amount) {
        if (amount >= 1000) {
            return Math.round(amount / 100) / 10; // Convert to kg/L with 1 decimal
        }
        return Math.round(amount);
    }

    // Normalize ingredient name for aggregation
    normalizeIngredientName(name) {
        return name.toLowerCase()
            .trim()
            .replace(/s$/, '') // Remove trailing 's'
            .replace(/[^a-z0-9\s]/g, ''); // Remove special characters
    }

    // Add shopping list items to Jumbo basket
    async addToJumboBasket(jumboClient, customerId, mappedItems) {
        const results = {
            added: [],
            failed: [],
            total: mappedItems.length
        };

        for (const item of mappedItems) {
            try {
                // Determine quantity to add (use first aggregated quantity)
                const quantity = item.aggregatedQuantity.length > 0
                    ? Math.ceil(item.aggregatedQuantity[0].amount)
                    : 1;

                // Add to basket
                await jumboClient.addToBasket(
                    customerId,
                    item.jumboSku,
                    quantity
                );

                results.added.push({
                    ingredientName: item.ingredientName,
                    productName: item.productDetails?.title || item.jumboSku,
                    quantity: quantity,
                    sku: item.jumboSku
                });

                // Small delay to avoid rate limiting
                await this.delay(200);

            } catch (error) {
                results.failed.push({
                    ingredientName: item.ingredientName,
                    sku: item.jumboSku,
                    error: error.message
                });
            }
        }

        return results;
    }

    // Utility: delay
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get unmapped ingredients in current queue
    getUnmappedIngredientsInQueue() {
        const shoppingList = this.generateShoppingList();
        return shoppingList.unmappedItems;
    }

    // Export shopping list as text
    exportAsText(shoppingList) {
        let text = '🛒 Shopping List\n';
        text += '='.repeat(50) + '\n\n';

        if (shoppingList.recipes.length > 0) {
            text += '📋 Recipes:\n';
            shoppingList.recipes.forEach((recipe, index) => {
                text += `${index + 1}. ${recipe.name}\n`;
            });
            text += '\n';
        }

        if (shoppingList.mappedItems.length > 0) {
            text += '✓ Mapped Ingredients:\n';
            text += '-'.repeat(50) + '\n';
            shoppingList.mappedItems.forEach(item => {
                const quantities = item.aggregatedQuantity
                    .map(q => `${q.amount} ${q.unit}`)
                    .join(' + ');
                text += `• ${item.ingredientName} (${quantities})\n`;
                if (item.productDetails?.title) {
                    text += `  → ${item.productDetails.title}\n`;
                }
            });
            text += '\n';
        }

        if (shoppingList.unmappedItems.length > 0) {
            text += '⚠️  Unmapped Ingredients:\n';
            text += '-'.repeat(50) + '\n';
            shoppingList.unmappedItems.forEach(item => {
                const quantities = item.aggregatedQuantity
                    .map(q => `${q.amount} ${q.unit}`)
                    .join(' + ');
                text += `• ${item.ingredientName} (${quantities})\n`;
            });
        }

        return text;
    }

    // Group ingredients by category (basic categorization)
    categorizeIngredients(items) {
        const categories = {
            'Produce': [],
            'Meat & Fish': [],
            'Dairy & Eggs': [],
            'Pantry': [],
            'Other': []
        };

        const categoryKeywords = {
            'Produce': ['tomato', 'lettuce', 'onion', 'garlic', 'potato', 'carrot', 'pepper', 'cucumber', 'broccoli', 'cauliflower'],
            'Meat & Fish': ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'meat', 'bacon', 'pancetta'],
            'Dairy & Eggs': ['milk', 'cheese', 'butter', 'yogurt', 'cream', 'egg'],
            'Pantry': ['flour', 'sugar', 'salt', 'pepper', 'oil', 'rice', 'pasta', 'bread', 'sauce']
        };

        for (const item of items) {
            const normalizedName = item.ingredientName.toLowerCase();
            let categorized = false;

            for (const [category, keywords] of Object.entries(categoryKeywords)) {
                if (keywords.some(keyword => normalizedName.includes(keyword))) {
                    categories[category].push(item);
                    categorized = true;
                    break;
                }
            }

            if (!categorized) {
                categories['Other'].push(item);
            }
        }

        // Remove empty categories
        const nonEmptyCategories = {};
        for (const [category, items] of Object.entries(categories)) {
            if (items.length > 0) {
                nonEmptyCategories[category] = items;
            }
        }

        return nonEmptyCategories;
    }
}

module.exports = ShoppingListService;
