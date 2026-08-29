/**
 * Public property search for Property Intelligence — NO ownership filter.
 * Approved listings only; buyers may analyse any public property.
 */

const pool = require('../../models/db');
const { PUBLIC_LISTING_SELECT } = require('./propertyIntelligenceAccess');
const { normalisePostcode, extractPostcodeFromAddress } = require('../../utils/ukAddress');

let propertyIdentitiesAvailable = null;

async function hasPropertyIdentitiesTable() {
  if (propertyIdentitiesAvailable !== null) return propertyIdentitiesAvailable;
  try {
    const result = await pool.query(`SELECT to_regclass('public.property_identities') AS reg`);
    propertyIdentitiesAvailable = Boolean(result.rows[0]?.reg);
  } catch {
    propertyIdentitiesAvailable = false;
  }
  return propertyIdentitiesAvailable;
}

function buildSearchSelect(hasIdentities) {
  const uprnCol = hasIdentities ? 'pi.uprn' : 'NULL::text AS uprn';
  return `${PUBLIC_LISTING_SELECT}, ${uprnCol},
    (SELECT img.image_url FROM property_images img
     WHERE img.property_id = p.id ORDER BY img.image_order ASC, img.id ASC LIMIT 1) AS main_image`;
}

function buildSearchFrom(hasIdentities) {
  return hasIdentities
    ? 'FROM properties p LEFT JOIN property_identities pi ON pi.property_id = p.id'
    : 'FROM properties p';
}

function compactPostcode(postcode) {
  return normalisePostcode(postcode).replace(/\s+/g, '').toUpperCase();
}

function buildAddress(row) {
  const parts = [
    row.house_number,
    row.street_name,
    row.address_line1,
    row.address_line2,
    row.city,
    row.zip_code,
  ].filter(Boolean);
  return parts.join(', ').replace(/,\s*,/g, ',') || row.title || 'Address not recorded';
}

function mapSearchRow(row, matchMethod = 'text', matchConfidence = 'medium') {
  return {
    ...row,
    address_display: buildAddress(row),
    monthly_rent:
      Number(row.monthly_rent) || (row.weekly_rent ? Number(row.weekly_rent) * 4.33 : null),
    source: 'marketplace',
    matchMethod,
    matchConfidence,
  };
}

function addressTokens(query, postcode) {
  let text = String(query || '');
  if (postcode) {
    text = text
      .replace(new RegExp(postcode.replace(' ', '\\s*'), 'gi'), '')
      .replace(new RegExp(compactPostcode(postcode), 'gi'), '');
  }
  return text
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1);
}

function scoreAddressMatch(property, tokens) {
  if (!tokens.length) return 1;
  const hay = [
    property.title,
    property.address_line1,
    property.street_name,
    property.house_number,
    property.address_display,
    property.city,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length;
}

/**
 * Search ALL approved/public properties for intelligence lookup.
 * Does not filter by user_id.
 */
async function searchPublicPropertiesForIntelligence(query = '', { limit = 40 } = {}) {
  const q = (query || '').trim();
  const cap = Math.min(Number(limit) || 40, 50);
  const hasIdentities = await hasPropertyIdentitiesTable();
  const select = buildSearchSelect(hasIdentities);
  const from = buildSearchFrom(hasIdentities);

  if (!q) {
    const result = await pool.query(
      `SELECT ${select}
       ${from}
       WHERE p.status = 'approved'
       ORDER BY p.updated_at DESC NULLS LAST
       LIMIT $1`,
      [cap]
    );
    return result.rows.map((r) => mapSearchRow(r, 'browse', 'low'));
  }

  if (/^\d+$/.test(q)) {
    const byId = await pool.query(
      `SELECT ${select}
       ${from}
       WHERE p.status = 'approved' AND p.id = $1`,
      [Number(q)]
    );
    if (byId.rows[0]) {
      return [mapSearchRow(byId.rows[0], 'property_id', 'high')];
    }
  }

  const uprnCandidate = q.replace(/\s+/g, '');
  if (hasIdentities && /^\d{10,12}$/.test(uprnCandidate)) {
    const byUprn = await pool.query(
      `SELECT ${select}
       FROM properties p
       INNER JOIN property_identities pi ON pi.property_id = p.id
       WHERE p.status = 'approved' AND pi.uprn = $1`,
      [uprnCandidate]
    );
    if (byUprn.rows[0]) {
      return [mapSearchRow(byUprn.rows[0], 'uprn', 'high')];
    }
  }

  let postcode =
    extractPostcodeFromAddress(q) ||
    (compactPostcode(q).length >= 5 && compactPostcode(q).length <= 8 ? normalisePostcode(q) : '');
  const pcCompact = postcode ? compactPostcode(postcode) : null;
  const tokens = addressTokens(q, postcode);

  const params = [];
  let sql = `
    SELECT ${select}
    ${from}
    WHERE p.status = 'approved'
  `;

  if (pcCompact) {
    params.push(pcCompact);
    sql += ` AND REPLACE(UPPER(COALESCE(p.zip_code, '')), ' ', '') = $${params.length}`;
  } else {
    params.push(`%${q}%`);
    const i = params.length;
    sql += ` AND (
      p.title ILIKE $${i}
      OR p.city ILIKE $${i}
      OR p.address_line1 ILIKE $${i}
      OR p.street_name ILIKE $${i}
      OR p.house_number ILIKE $${i}
      OR CAST(p.id AS TEXT) ILIKE $${i}
    )`;
  }

  sql += ` ORDER BY p.updated_at DESC NULLS LAST LIMIT ${cap}`;

  const result = await pool.query(sql, params);
  let rows = result.rows.map((r) => mapSearchRow(r, pcCompact ? 'postcode' : 'text', 'medium'));

  if (tokens.length) {
    rows = rows
      .map((r) => ({ ...r, _score: scoreAddressMatch(r, tokens) }))
      .filter((r) => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...r }) => ({
        ...r,
        matchConfidence: _score >= 0.66 ? 'high' : _score >= 0.33 ? 'medium' : 'low',
        matchMethod: pcCompact ? 'postcode_address' : r.matchMethod,
      }));
  }

  if (pcCompact && !rows.length) {
    params.length = 0;
    params.push(`%${compactPostcode(postcode).slice(0, -3)}%`);
    const fallback = await pool.query(
      `SELECT ${select}
       ${from}
       WHERE p.status = 'approved'
         AND REPLACE(UPPER(COALESCE(p.zip_code, '')), ' ', '') LIKE $1
       ORDER BY p.updated_at DESC NULLS LAST
       LIMIT $2`,
      [params[0], cap]
    );
    rows = fallback.rows.map((r) => mapSearchRow(r, 'postcode_area', 'low'));
  }

  return rows;
}

module.exports = {
  searchPublicPropertiesForIntelligence,
  compactPostcode,
  addressTokens,
  scoreAddressMatch,
  mapSearchRow,
};
