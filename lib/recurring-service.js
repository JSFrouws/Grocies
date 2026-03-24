class RecurringService {
    constructor(db) {
        this.db = db;
    }

    _format(row) {
        return {
            id: row.id,
            item_name: row.item_name,
            category: row.category,
            occurrence_rate: row.occurrence_rate,
            quantity: row.quantity,
            enabled: Boolean(row.enabled),
            mapping_id: row.mapping_id,
            last_added_date: row.last_added_date,
            // Joined mapping fields
            jumbo_sku: row.jumbo_sku || null,
            ingredient_name: row.ingredient_name || null,
            package_amount: row.package_amount || null,
            package_unit: row.package_unit || null,
            product_details: row.m_product_details ? JSON.parse(row.m_product_details) : null
        };
    }

    _selectQuery(where = '') {
        return `
            SELECT ri.*,
                   im.jumbo_sku, im.ingredient_name, im.package_amount, im.package_unit,
                   im.product_details as m_product_details
            FROM recurring_items ri
            LEFT JOIN ingredient_mappings im ON ri.mapping_id = im.id
            ${where}
            ORDER BY ri.category, ri.item_name
        `;
    }

    getAll(includeDisabled = false) {
        const where = includeDisabled ? '' : 'WHERE ri.enabled = 1';
        return this.db.prepare(this._selectQuery(where)).all().map(r => this._format(r));
    }

    getById(id) {
        const row = this.db.prepare(this._selectQuery('WHERE ri.id = ?')).get(id);
        return row ? this._format(row) : null;
    }

    create({ item_name, category, occurrence_rate, quantity, mapping_id }) {
        const stmt = this.db.prepare(`
            INSERT INTO recurring_items (item_name, category, occurrence_rate, quantity, mapping_id, enabled)
            VALUES (?, ?, ?, ?, ?, 1)
        `);
        const result = stmt.run(
            item_name,
            category || null,
            occurrence_rate || 'weekly',
            quantity || 1,
            mapping_id || null
        );
        return this.getById(result.lastInsertRowid);
    }

    update(id, fields) {
        const item = this.getById(id);
        if (!item) return null;

        const allowed = ['item_name', 'category', 'occurrence_rate', 'quantity', 'mapping_id', 'enabled'];
        const updates = [];
        const values = [];

        for (const key of allowed) {
            if (fields[key] !== undefined) {
                updates.push(`${key} = ?`);
                values.push(fields[key]);
            }
        }

        if (updates.length === 0) return item;

        values.push(id);
        this.db.prepare(`UPDATE recurring_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }

    delete(id) {
        return this.db.prepare('DELETE FROM recurring_items WHERE id = ?').run(id).changes > 0;
    }

    toggle(id) {
        const item = this.getById(id);
        if (!item) return null;
        this.db.prepare('UPDATE recurring_items SET enabled = ? WHERE id = ?').run(item.enabled ? 0 : 1, id);
        return this.getById(id);
    }

    getActiveItems() {
        return this.getAll(false).filter(item => item.mapping_id);
    }
}

module.exports = RecurringService;
