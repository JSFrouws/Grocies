// Canonical unit system for Grocies
// The mapping (koppeling) is the authority on which unit a product uses.

const VALID_UNITS = ['L', 'mL', 'g', 'kg', 'stuks'];

const UNIT_FAMILIES = {
    weight: ['g', 'kg'],
    volume: ['mL', 'L'],
    count: ['stuks']
};

// Base unit per family (smallest)
const BASE_UNITS = { weight: 'g', volume: 'mL', count: 'stuks' };

// Conversion factors TO base unit
const TO_BASE = {
    g: 1, kg: 1000,
    mL: 1, L: 1000,
    stuks: 1
};

function normalizeUnit(unit) {
    if (!unit) return '';
    const lower = unit.toLowerCase().trim();
    const map = { l: 'L', ml: 'mL', g: 'g', kg: 'kg', stuks: 'stuks', stuk: 'stuks' };
    return map[lower] || unit;
}

function getFamily(unit) {
    const norm = normalizeUnit(unit);
    for (const [family, units] of Object.entries(UNIT_FAMILIES)) {
        if (units.includes(norm)) return family;
    }
    return null;
}

function areCompatible(unit1, unit2) {
    if (!unit1 || !unit2) return true; // empty units are compatible with anything
    const f1 = getFamily(unit1);
    const f2 = getFamily(unit2);
    if (!f1 || !f2) return false;
    return f1 === f2;
}

function toBase(amount, unit) {
    const norm = normalizeUnit(unit);
    const factor = TO_BASE[norm];
    if (factor === undefined) return amount;
    return amount * factor;
}

function fromBase(amount, targetUnit) {
    const norm = normalizeUnit(targetUnit);
    const factor = TO_BASE[norm];
    if (factor === undefined) return amount;
    return amount / factor;
}

function convert(amount, fromUnit, toUnit) {
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    if (from === to) return amount;
    if (!areCompatible(from, to)) return null;
    return fromBase(toBase(amount, from), to);
}

// Format a quantity for display, respecting the preferred unit from mappings.
// Automatically picks the most readable unit in the same family.
function formatQuantity(amount, unit, preferredUnit) {
    const norm = normalizeUnit(unit);
    const pref = preferredUnit ? normalizeUnit(preferredUnit) : norm;

    if (!areCompatible(norm, pref)) return { amount, unit: norm };

    const converted = convert(amount, norm, pref);
    if (converted === null) return { amount, unit: norm };

    // Auto-scale for readability
    const family = getFamily(pref);
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

module.exports = {
    VALID_UNITS,
    UNIT_FAMILIES,
    BASE_UNITS,
    normalizeUnit,
    getFamily,
    areCompatible,
    toBase,
    fromBase,
    convert,
    formatQuantity
};
