class MappingService {
    constructor(db) {
        this.db = db;
    }

    // Format a raw DB mapping row
    _formatMapping(mapping) {
        return {
            ...mapping,
            product_details: mapping.product_details ? JSON.parse(mapping.product_details) : null,
            preferred: Boolean(mapping.preferred),
            skip_in_list: Boolean(mapping.skip_in_list),
            package_amount: mapping.package_amount || null,
            package_unit: mapping.package_unit || null,
            shelf_life_days: mapping.shelf_life_days || null
        };
    }

    // Get all mappings
    getAllMappings(filters = {}) {
        let query = 'SELECT * FROM ingredient_mappings WHERE 1=1';
        const params = {};

        if (filters.ingredient_name) {
            query += ' AND ingredient_name LIKE @ingredient_name';
            params.ingredient_name = `%${filters.ingredient_name}%`;
        }

        if (filters.preferred !== undefined) {
            query += ' AND preferred = @preferred';
            params.preferred = filters.preferred ? 1 : 0;
        }

        query += ' ORDER BY ingredient_name ASC, preferred DESC';

        const stmt = this.db.prepare(query);
        return stmt.all(params).map(m => this._formatMapping(m));
    }

    // Get mapping by ID
    getMappingById(id) {
        const stmt = this.db.prepare('SELECT * FROM ingredient_mappings WHERE id = ?');
        const mapping = stmt.get(id);
        if (!mapping) return null;
        return this._formatMapping(mapping);
    }

    // Get mappings for specific ingredient
    getMappingsForIngredient(ingredientName) {
        // Exact match first
        const exactStmt = this.db.prepare(`
            SELECT * FROM ingredient_mappings
            WHERE LOWER(ingredient_name) = LOWER(?)
            ORDER BY preferred DESC
        `);
        const exactMatches = exactStmt.all(ingredientName);

        if (exactMatches.length > 0) {
            return exactMatches.map(m => this._formatMapping(m));
        }

        // Fuzzy match (plurals, partial matches)
        const fuzzyStmt = this.db.prepare(`
            SELECT * FROM ingredient_mappings
            WHERE LOWER(ingredient_name) LIKE LOWER(?)
            ORDER BY preferred DESC
        `);
        return fuzzyStmt.all(`%${ingredientName}%`).map(m => this._formatMapping(m));
    }

    // Get preferred mapping for ingredient
    getPreferredMapping(ingredientName) {
        const mappings = this.getMappingsForIngredient(ingredientName);
        return mappings.find(m => m.preferred) || mappings[0] || null;
    }

    // Create mapping
    createMapping(mappingData) {
        const {
            ingredient_name,
            jumbo_product_id,
            jumbo_sku,
            product_details,
            preferred,
            skip_in_list,
            package_amount,
            package_unit,
            shelf_life_days
        } = mappingData;

        const normalizedName = ingredient_name.toLowerCase().trim();

        if (preferred) {
            const unsetStmt = this.db.prepare(`
                UPDATE ingredient_mappings SET preferred = 0
                WHERE LOWER(ingredient_name) = LOWER(?)
            `);
            unsetStmt.run(normalizedName);
        }

        const stmt = this.db.prepare(`
            INSERT INTO ingredient_mappings (
                ingredient_name, jumbo_product_id, jumbo_sku,
                product_details, preferred, skip_in_list,
                package_amount, package_unit, shelf_life_days
            )
            VALUES (@ingredient_name, @jumbo_product_id, @jumbo_sku,
                    @product_details, @preferred, @skip_in_list,
                    @package_amount, @package_unit, @shelf_life_days)
        `);

        try {
            const result = stmt.run({
                ingredient_name: normalizedName,
                jumbo_product_id,
                jumbo_sku,
                product_details: product_details ? JSON.stringify(product_details) : null,
                preferred: preferred ? 1 : 0,
                skip_in_list: skip_in_list ? 1 : 0,
                package_amount: package_amount || null,
                package_unit: package_unit || null,
                shelf_life_days: shelf_life_days || null
            });

            return this.getMappingById(result.lastInsertRowid);
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                throw new Error('This ingredient-to-product mapping already exists');
            }
            throw error;
        }
    }

    // Update mapping
    updateMapping(id, mappingData) {
        const existing = this.getMappingById(id);
        if (!existing) return null;

        const {
            ingredient_name,
            jumbo_product_id,
            jumbo_sku,
            product_details,
            preferred,
            skip_in_list,
            package_amount,
            package_unit,
            shelf_life_days
        } = mappingData;

        if (preferred) {
            const unsetStmt = this.db.prepare(`
                UPDATE ingredient_mappings SET preferred = 0
                WHERE LOWER(ingredient_name) = LOWER(?) AND id != ?
            `);
            unsetStmt.run(ingredient_name || existing.ingredient_name, id);
        }

        const stmt = this.db.prepare(`
            UPDATE ingredient_mappings
            SET ingredient_name = @ingredient_name,
                jumbo_product_id = @jumbo_product_id,
                jumbo_sku = @jumbo_sku,
                product_details = @product_details,
                preferred = @preferred,
                skip_in_list = @skip_in_list,
                package_amount = @package_amount,
                package_unit = @package_unit,
                shelf_life_days = @shelf_life_days,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = @id
        `);

        stmt.run({
            id,
            ingredient_name: ingredient_name !== undefined ? ingredient_name.toLowerCase().trim() : existing.ingredient_name,
            jumbo_product_id: jumbo_product_id !== undefined ? jumbo_product_id : existing.jumbo_product_id,
            jumbo_sku: jumbo_sku !== undefined ? jumbo_sku : existing.jumbo_sku,
            product_details: product_details !== undefined ? JSON.stringify(product_details) : (existing.product_details ? JSON.stringify(existing.product_details) : null),
            preferred: preferred !== undefined ? (preferred ? 1 : 0) : (existing.preferred ? 1 : 0),
            skip_in_list: skip_in_list !== undefined ? (skip_in_list ? 1 : 0) : (existing.skip_in_list ? 1 : 0),
            package_amount: package_amount !== undefined ? (package_amount || null) : (existing.package_amount || null),
            package_unit: package_unit !== undefined ? (package_unit || null) : (existing.package_unit || null),
            shelf_life_days: shelf_life_days !== undefined ? (shelf_life_days || null) : (existing.shelf_life_days || null)
        });

        return this.getMappingById(id);
    }

    // Delete mapping
    deleteMapping(id) {
        const stmt = this.db.prepare('DELETE FROM ingredient_mappings WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Get all unique ingredient names from mappings
    getIngredientNames() {
        const stmt = this.db.prepare(`
            SELECT DISTINCT ingredient_name
            FROM ingredient_mappings
            ORDER BY ingredient_name ASC
        `);
        return stmt.all().map(row => row.ingredient_name);
    }

    // Check which ingredients in a list are unmapped
    getUnmappedIngredients(ingredientNames) {
        const unmapped = [];
        for (const ingredientName of ingredientNames) {
            const mapping = this.getPreferredMapping(ingredientName);
            if (!mapping) {
                unmapped.push(ingredientName);
            }
        }
        return unmapped;
    }

    // Normalize ingredient name for matching
    normalizeIngredientName(name) {
        return name.toLowerCase()
            .trim()
            .replace(/s$/, '')
            .replace(/[^a-z0-9\s]/g, '');
    }

    // Find similar mapped ingredients (for suggestions when mapping)
    findSimilarMappings(ingredientName) {
        const normalized = this.normalizeIngredientName(ingredientName);
        const words = normalized.split(/\s+/).filter(w => w.length > 2);

        // Search by each significant word
        const results = new Map();
        for (const word of words) {
            const stmt = this.db.prepare(`
                SELECT * FROM ingredient_mappings
                WHERE LOWER(ingredient_name) LIKE ? AND preferred = 1
                LIMIT 10
            `);
            const matches = stmt.all(`%${word}%`);
            for (const m of matches) {
                if (!results.has(m.id)) {
                    results.set(m.id, this._formatMapping(m));
                }
            }
        }

        // Also do a direct substring match
        const directStmt = this.db.prepare(`
            SELECT * FROM ingredient_mappings
            WHERE LOWER(ingredient_name) LIKE ? AND preferred = 1
            LIMIT 10
        `);
        const directMatches = directStmt.all(`%${normalized}%`);
        for (const m of directMatches) {
            if (!results.has(m.id)) {
                results.set(m.id, this._formatMapping(m));
            }
        }

        return Array.from(results.values()).slice(0, 8);
    }
}

module.exports = MappingService;
