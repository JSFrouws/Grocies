class StockService {
    constructor(db) {
        this.db = db;
    }

    // Get all stock items
    getAllStock(includeDiscarded = false) {
        let query = 'SELECT * FROM stock';
        if (!includeDiscarded) {
            query += ' WHERE is_discarded = 0';
        }
        query += ' ORDER BY expiry_date ASC NULLS LAST, ingredient_name ASC';
        return this.db.prepare(query).all().map(s => this._format(s));
    }

    // Get active stock for an ingredient (FIFO by expiry)
    getStockForIngredient(ingredientName) {
        const normalized = ingredientName.toLowerCase().trim();
        const stmt = this.db.prepare(`
            SELECT * FROM stock
            WHERE LOWER(ingredient_name) = ? AND is_discarded = 0 AND quantity_remaining > 0
            ORDER BY expiry_date ASC NULLS LAST
        `);
        return stmt.all(normalized).map(s => this._format(s));
    }

    // Add stock item
    addStock({ ingredient_name, jumbo_sku, quantity_remaining, unit, shelf_life_days, purchased_date }) {
        const normalizedName = ingredient_name.toLowerCase().trim();
        const purchDate = purchased_date || new Date().toISOString();

        let expiryDate = null;
        if (shelf_life_days) {
            const d = new Date(purchDate);
            d.setDate(d.getDate() + shelf_life_days);
            expiryDate = d.toISOString();
        }

        const stmt = this.db.prepare(`
            INSERT INTO stock (ingredient_name, jumbo_sku, quantity_remaining, unit, purchased_date, expiry_date)
            VALUES (@ingredient_name, @jumbo_sku, @quantity_remaining, @unit, @purchased_date, @expiry_date)
        `);

        const result = stmt.run({
            ingredient_name: normalizedName,
            jumbo_sku: jumbo_sku || null,
            quantity_remaining,
            unit: unit || '',
            purchased_date: purchDate,
            expiry_date: expiryDate
        });

        return this.getStockById(result.lastInsertRowid);
    }

    // Get stock item by ID
    getStockById(id) {
        const stmt = this.db.prepare('SELECT * FROM stock WHERE id = ?');
        const item = stmt.get(id);
        return item ? this._format(item) : null;
    }

    // Update remaining quantity
    updateStockQuantity(id, newQuantity) {
        const stmt = this.db.prepare('UPDATE stock SET quantity_remaining = ? WHERE id = ?');
        stmt.run(newQuantity, id);
        return this.getStockById(id);
    }

    // Consume from stock (FIFO by expiry date)
    // Returns array of { stockId, ingredientName, consumed, remaining, percentUsed }
    consumeFromStock(ingredientName, amountNeeded, unit) {
        const stockItems = this.getStockForIngredient(ingredientName);
        const results = [];
        let remaining = amountNeeded;

        for (const item of stockItems) {
            if (remaining <= 0) break;
            // Only consume from matching unit (or if units are empty)
            if (item.unit && unit && item.unit.toLowerCase() !== unit.toLowerCase()) continue;

            const available = item.quantity_remaining;
            const consumed = Math.min(available, remaining);
            const newQuantity = available - consumed;
            const percentUsed = Math.round((consumed / available) * 100);

            this.db.prepare('UPDATE stock SET quantity_remaining = ? WHERE id = ?')
                .run(newQuantity, item.id);

            results.push({
                stockId: item.id,
                ingredientName: item.ingredient_name,
                consumed,
                remaining: newQuantity,
                percentUsed
            });

            remaining -= consumed;
        }

        return { results, fullyConsumed: remaining <= 0, shortfall: Math.max(0, remaining) };
    }

    // Discard stock item (GFT!)
    discardItem(id) {
        const stmt = this.db.prepare('UPDATE stock SET is_discarded = 1 WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Get expired (non-discarded) items
    getExpiredItems() {
        const stmt = this.db.prepare(`
            SELECT * FROM stock
            WHERE is_discarded = 0 AND expiry_date IS NOT NULL
              AND expiry_date < datetime('now')
              AND quantity_remaining > 0
            ORDER BY expiry_date ASC
        `);
        return stmt.all().map(s => this._format(s));
    }

    // Bulk add stock from shopping list purchase
    addStockFromShoppingList(mappedItems, mappingService) {
        const results = [];
        for (const item of mappedItems) {
            const mapping = mappingService ? mappingService.getPreferredMapping(item.ingredientName) : null;
            const shelfLife = mapping ? mapping.shelf_life_days : null;
            const packageUnit = mapping ? (mapping.package_unit || '') : '';
            const packageAmount = mapping ? mapping.package_amount : null;

            // Calculate total quantity being added
            let totalQty = 0;
            if (item.packagesNeeded && packageAmount) {
                totalQty = item.packagesNeeded * packageAmount;
            } else if (item.aggregatedQuantity && item.aggregatedQuantity.length > 0) {
                totalQty = item.aggregatedQuantity[0].amount;
            }

            if (totalQty > 0) {
                const stockItem = this.addStock({
                    ingredient_name: item.ingredientName,
                    jumbo_sku: item.jumboSku || null,
                    quantity_remaining: totalQty,
                    unit: packageUnit || (item.aggregatedQuantity?.[0]?.unit || ''),
                    shelf_life_days: shelfLife
                });
                results.push(stockItem);
            }
        }
        return results;
    }

    // Get available ingredients summary (non-expired, non-discarded)
    getAvailableIngredients() {
        const stmt = this.db.prepare(`
            SELECT ingredient_name, unit, SUM(quantity_remaining) as total
            FROM stock
            WHERE is_discarded = 0 AND quantity_remaining > 0
              AND (expiry_date IS NULL OR expiry_date >= datetime('now'))
            GROUP BY ingredient_name, unit
        `);
        const rows = stmt.all();
        const result = {};
        for (const row of rows) {
            if (!result[row.ingredient_name]) {
                result[row.ingredient_name] = [];
            }
            result[row.ingredient_name].push({ total: row.total, unit: row.unit });
        }
        return result;
    }

    // Check which recipes can be made from current stock
    checkRecipesFromStock(recipes) {
        const available = this.getAvailableIngredients();
        const results = [];

        for (const recipe of recipes) {
            let ingredients;
            try {
                ingredients = typeof recipe.ingredients === 'string'
                    ? JSON.parse(recipe.ingredients)
                    : recipe.ingredients;
            } catch (e) { continue; }

            let totalIngredients = ingredients.length;
            let availableCount = 0;
            let soonestExpiry = null;
            const ingredientStatus = [];

            for (const ing of ingredients) {
                const key = ing.name.toLowerCase().trim();
                const stockEntries = available[key];
                let hasStock = false;

                if (stockEntries) {
                    for (const entry of stockEntries) {
                        if (!ing.unit || !entry.unit || entry.unit.toLowerCase() === ing.unit.toLowerCase()) {
                            const needed = parseFloat(ing.amount) || 0;
                            if (entry.total >= needed) {
                                hasStock = true;
                                break;
                            }
                        }
                    }
                }

                if (hasStock) availableCount++;
                ingredientStatus.push({ name: ing.name, inStock: hasStock });

                // Check soonest expiry for this ingredient
                const stockItems = this.getStockForIngredient(ing.name);
                if (stockItems.length > 0 && stockItems[0].expiry_date) {
                    const expDate = new Date(stockItems[0].expiry_date);
                    if (!soonestExpiry || expDate < soonestExpiry) {
                        soonestExpiry = expDate;
                    }
                }
            }

            results.push({
                recipeId: recipe.id,
                recipeName: recipe.name,
                totalIngredients,
                availableFromStock: availableCount,
                coverage: totalIngredients > 0 ? Math.round((availableCount / totalIngredients) * 100) : 0,
                fullyAvailable: availableCount === totalIngredients,
                soonestExpiry: soonestExpiry ? soonestExpiry.toISOString() : null,
                ingredientStatus
            });
        }

        // Sort: fully available first, then by coverage desc, then by soonest expiry
        results.sort((a, b) => {
            if (a.fullyAvailable !== b.fullyAvailable) return b.fullyAvailable - a.fullyAvailable;
            if (a.coverage !== b.coverage) return b.coverage - a.coverage;
            if (a.soonestExpiry && b.soonestExpiry) return new Date(a.soonestExpiry) - new Date(b.soonestExpiry);
            if (a.soonestExpiry) return -1;
            return 1;
        });

        return results;
    }

    // Format stock item
    _format(item) {
        const now = new Date();
        const expiry = item.expiry_date ? new Date(item.expiry_date) : null;
        let daysLeft = null;
        let isExpired = false;
        let isWarning = false;

        if (expiry) {
            daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
            isExpired = daysLeft < 0;
            isWarning = daysLeft >= 0 && daysLeft <= 2;
        }

        return {
            ...item,
            is_discarded: Boolean(item.is_discarded),
            daysLeft,
            isExpired,
            isWarning
        };
    }
}

module.exports = StockService;
