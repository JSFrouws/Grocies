// Canonical unit system for Grocies (frontend)
const VALID_UNITS = ['L', 'mL', 'g', 'kg', 'stuks'];

const UNIT_FAMILIES = {
    weight: ['g', 'kg'],
    volume: ['mL', 'L'],
    count: ['stuks']
};

const TO_BASE = { g: 1, kg: 1000, mL: 1, L: 1000, stuks: 1 };

function normalizeUnit(unit) {
    if (!unit) return '';
    const lower = unit.toLowerCase().trim();
    const map = { l: 'L', ml: 'mL', g: 'g', kg: 'kg', stuks: 'stuks', stuk: 'stuks' };
    return map[lower] || unit;
}

function getUnitFamily(unit) {
    const norm = normalizeUnit(unit);
    for (const [family, units] of Object.entries(UNIT_FAMILIES)) {
        if (units.includes(norm)) return family;
    }
    return null;
}

function areUnitsCompatible(unit1, unit2) {
    if (!unit1 || !unit2) return true;
    const f1 = getUnitFamily(unit1);
    const f2 = getUnitFamily(unit2);
    if (!f1 || !f2) return false;
    return f1 === f2;
}

function convertUnit(amount, fromUnit, toUnit) {
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    if (from === to) return amount;
    if (!areUnitsCompatible(from, to)) return null;
    const base = amount * (TO_BASE[from] || 1);
    return base / (TO_BASE[to] || 1);
}

function formatQty(amount, unit, preferredUnit) {
    const norm = normalizeUnit(unit);
    const pref = preferredUnit ? normalizeUnit(preferredUnit) : norm;
    if (!areUnitsCompatible(norm, pref)) return { amount, unit: norm };
    const converted = convertUnit(amount, norm, pref);
    if (converted === null) return { amount, unit: norm };

    const family = getUnitFamily(pref);
    if (family === 'weight') {
        if (pref === 'g' && converted >= 1000) return { amount: +(converted / 1000).toFixed(1), unit: 'kg' };
        if (pref === 'kg' && converted < 0.01) return { amount: +(converted * 1000).toFixed(0), unit: 'g' };
    }
    if (family === 'volume') {
        if (pref === 'mL' && converted >= 1000) return { amount: +(converted / 1000).toFixed(1), unit: 'L' };
        if (pref === 'L' && converted < 0.01) return { amount: +(converted * 1000).toFixed(0), unit: 'mL' };
    }

    return { amount: +converted.toFixed(converted < 10 ? 1 : 0), unit: pref };
}

// Render a <select> dropdown for units, optionally pre-selecting a value
function renderUnitSelect(name, selectedValue, extraClass) {
    const norm = normalizeUnit(selectedValue);
    const cls = extraClass ? ` class="${extraClass}"` : '';
    return `<select name="${name}"${cls}>
        <option value="">Eenheid</option>
        ${VALID_UNITS.map(u => `<option value="${u}"${norm === u ? ' selected' : ''}>${u}</option>`).join('')}
    </select>`;
}
