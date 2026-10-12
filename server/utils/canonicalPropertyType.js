/**
 * Canonical listing property_type token extraction.
 * Ambiguous multi-value shapes return null — never guess.
 */

function canonicalPropertyTypeToken(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    const tokens = [
      ...new Set(value.map((v) => String(v).toLowerCase().trim()).filter(Boolean)),
    ];
    return tokens.length === 1 ? tokens[0] : null;
  }
  const text = String(value).trim();
  const pgArray = text.match(/^\{([\s\S]*)\}$/);
  if (pgArray) {
    const tokens = [
      ...new Set(
        pgArray[1]
          .split(',')
          .map((part) => part.trim().replace(/^"|"$/g, '').toLowerCase())
          .filter(Boolean)
      ),
    ];
    return tokens.length === 1 ? tokens[0] : null;
  }
  const norm = text.toLowerCase().trim();
  return norm || null;
}

module.exports = {
  canonicalPropertyTypeToken,
};
