class ShoppingListService {
    constructor(db, mappingService, stockService) {
        this.db = db;
        this.mappingService = mappingService;
        this.stockService = stockService;
    }

    // Generate shopping list from current queue
    generateShoppingList() {
        // Get all recipes in queue
        const queueStmt = this.db.prepare(`
            SELECT mq.id as queue_id, mq.ingredients_bought, r.id, r.name, r.ingredients
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
                // Calculate stock and package info
                const totalNeeded = aggregated.length > 0 ? aggregated[0].amount : 0;
                const totalUnit = aggregated.length > 0 ? aggregated[0].unit : '';
                let inStock = 0;

                // Check available stock
                if (this.stockService) {
                    const stockEntries = this.stockService.getAvailableIngredients();
                    const stockKey = data.normalizedName;
                    if (stockEntries[stockKey]) {
                        for (const entry of stockEntries[stockKey]) {
                            if (!totalUnit || !entry.unit || entry.unit.toLowerCase() === totalUnit.toLowerCase()) {
                                inStock += entry.total;
                            }
                        }
                    }
                }

                const netNeeded = Math.max(0, totalNeeded - inStock);
                let packagesNeeded = null;
                if (mapping.package_amount && mapping.package_amount > 0 && netNeeded > 0) {
                    packagesNeeded = Math.ceil(netNeeded / mapping.package_amount);
                }

                mappedItems.push({
                    ...ingredientInfo,
                    mapping: mapping,
                    jumboProductId: mapping.jumbo_product_id,
                    jumboSku: mapping.jumbo_sku,
                    productDetails: mapping.product_details,
                    skipInList: mapping.skip_in_list || false,
                    packageAmount: mapping.package_amount,
                    packageUnit: mapping.package_unit,
                    totalNeeded,
                    inStock,
                    netNeeded,
                    packagesNeeded
                });
            } else {
                unmappedItems.push(ingredientInfo);
            }
        }

        // Build per-recipe ingredient view
        const byRecipe = queuedRecipes.map(recipe => {
            const ingredients = JSON.parse(recipe.ingredients);
            return {
                queueId: recipe.queue_id,
                recipeId: recipe.id,
                recipeName: recipe.name,
                ingredientsBought: Boolean(recipe.ingredients_bought),
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
                            productImage: mapping.product_details?.image || null,
                            productPrice: mapping.product_details?.price || null
                        } : null
                    };
                })
            };
        });

        return {
            recipes: queuedRecipes.map(r => ({
                id: r.id,
                name: r.name,
                queueId: r.queue_id,
                ingredientsBought: Boolean(r.ingredients_bought)
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
                // Use package-aware quantity if available, otherwise fallback
                const quantity = item.packagesNeeded
                    ? item.packagesNeeded
                    : (item.aggregatedQuantity.length > 0 ? Math.ceil(item.aggregatedQuantity[0].amount) : 1);

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
        let text = '\uD83D\uDED2 Boodschappenlijst\n';
        text += '='.repeat(50) + '\n\n';

        if (shoppingList.recipes.length > 0) {
            text += '\uD83D\uDCCB Recepten:\n';
            shoppingList.recipes.forEach((recipe, index) => {
                text += `${index + 1}. ${recipe.name}\n`;
            });
            text += '\n';
        }

        if (shoppingList.mappedItems.length > 0) {
            text += '\u2713 Gekoppelde ingredi\u00EBnten:\n';
            text += '-'.repeat(50) + '\n';
            shoppingList.mappedItems.forEach(item => {
                const quantities = item.aggregatedQuantity
                    .map(q => `${q.amount} ${q.unit}`)
                    .join(' + ');
                let line = `\u2022 ${item.ingredientName} (${quantities})`;
                if (item.packagesNeeded) {
                    line += ` \u2192 ${item.packagesNeeded}x pakken`;
                }
                if (item.inStock > 0) {
                    line += ` (${item.inStock} in voorraad)`;
                }
                text += line + '\n';
                if (item.productDetails?.title) {
                    text += `  \u2192 ${item.productDetails.title}\n`;
                }
            });
            text += '\n';
        }

        if (shoppingList.unmappedItems.length > 0) {
            text += '\u26A0\uFE0F  Ongekoppelde ingredi\u00EBnten:\n';
            text += '-'.repeat(50) + '\n';
            shoppingList.unmappedItems.forEach(item => {
                const quantities = item.aggregatedQuantity
                    .map(q => `${q.amount} ${q.unit}`)
                    .join(' + ');
                text += `\u2022 ${item.ingredientName} (${quantities})\n`;
            });
        }

        return text;
    }

    // Group ingredients by category (basic categorization)
    categorizeIngredients(items) {
        const categories = {
            'Groente & Fruit': [],
            'Vlees & Vis': [],
            'Zuivel & Eieren': [],
            'Voorraadkast': [],
            'Overig': []
        };

        const categoryKeywords = {
            'Groente & Fruit': ['tomaat', 'tomaten', 'sla', 'ui', 'knoflook', 'aardappel', 'wortel', 'paprika', 'komkommer', 'broccoli', 'bloemkool', 'citroen', 'olijven'],
            'Vlees & Vis': ['kip', 'rund', 'varken', 'vis', 'zalm', 'tonijn', 'garnaal', 'gehakt', 'spek', 'pancetta'],
            'Zuivel & Eieren': ['melk', 'kaas', 'boter', 'yoghurt', 'room', 'ei', 'eieren', 'feta'],
            'Voorraadkast': ['bloem', 'suiker', 'zout', 'peper', 'olie', 'rijst', 'pasta', 'spaghetti', 'brood', 'saus', 'sojasaus', 'kokosmelk']
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
                categories['Overig'].push(item);
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
