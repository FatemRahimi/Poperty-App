const pool = require('../../models/db');
const {
  PUBLIC_LISTING_SELECT,
  sanitizePropertyForPublicIntelligence,
  resolvePropertyAccess,
} = require('./propertyIntelligenceAccess');
const { normalisePostcode, extractPostcodeFromAddress } = require('../../utils/ukAddress');
const { searchPublicPropertiesForIntelligence } = require('./propertyIntelligenceSearch');

function buildAddress(p) {
  const parts = [
    p.house_number,
    p.street_name,
    p.address_line1,
    p.address_line2,
    p.city,
    p.state,
    p.zip_code,
    p.country,
  ].filter(Boolean);
  return parts.join(', ').replace(/,\s*,/g, ',') || 'Address not recorded';
}

async function fetchPropertyRaw(propertyId) {
  const result = await pool.query(`SELECT p.* FROM properties p WHERE p.id = $1`, [propertyId]);
  const property = result.rows[0];
  if (!property) return null;

  const [images, amenities] = await Promise.all([
    pool.query(
      `SELECT id, image_url, image_type, image_order, alt_text FROM property_images
       WHERE property_id = $1 ORDER BY image_order ASC, id ASC`,
      [propertyId]
    ),
    pool.query(
      `SELECT amenity_name, amenity_category FROM property_amenities WHERE property_id = $1`,
      [propertyId]
    ),
  ]);

  return {
    ...property,
    address_display: buildAddress(property),
    images: images.rows,
    amenities: amenities.rows,
    main_image: images.rows[0]?.image_url || null,
  };
}

/** Owner-only fetch (portfolio, legacy). */
async function fetchPropertyFull(propertyId, userId) {
  const result = await pool.query(
    `SELECT p.* FROM properties p WHERE p.id = $1 AND p.user_id = $2`,
    [propertyId, userId]
  );
  const property = result.rows[0];
  if (!property) return null;

  const [images, amenities] = await Promise.all([
    pool.query(
      `SELECT id, image_url, image_type, image_order, alt_text FROM property_images
       WHERE property_id = $1 ORDER BY image_order ASC, id ASC`,
      [propertyId]
    ),
    pool.query(
      `SELECT amenity_name, amenity_category FROM property_amenities WHERE property_id = $1`,
      [propertyId]
    ),
  ]);

  return {
    ...property,
    address_display: buildAddress(property),
    images: images.rows,
    amenities: amenities.rows,
    main_image: images.rows[0]?.image_url || null,
  };
}

/**
 * Load property for intelligence with access check and field sanitization.
 */
async function fetchPropertyForIntelligence(propertyId, userId) {
  const access = await resolvePropertyAccess(propertyId, userId);
  if (!access.allowed) {
    return { access, property: null };
  }

  const raw = await fetchPropertyRaw(propertyId);
  if (!raw) {
    return {
      access: { ...access, allowed: false, reason: 'not_found' },
      property: null,
    };
  }

  const property =
    access.accessLevel === 'professional_intelligence'
      ? raw
      : sanitizePropertyForPublicIntelligence(raw);

  return { access, property };
}

function mapListRow(p) {
  return {
    ...p,
    address_display: buildAddress(p),
    monthly_rent: Number(p.monthly_rent) || (p.weekly_rent ? Number(p.weekly_rent) * 4.33 : null),
  };
}

function appendSearchFilter(q, params, filter) {
  if (!q) return filter;

  if (/^\d+$/.test(q)) {
    params.push(Number(q));
    const idIdx = params.length;
    params.push(`%${q}%`);
    const i = params.length;
    return `${filter} AND (p.id = $${idIdx} OR p.title ILIKE $${i} OR p.city ILIKE $${i} OR p.address_line1 ILIKE $${i} OR p.street_name ILIKE $${i} OR p.house_number ILIKE $${i} OR REPLACE(UPPER(COALESCE(p.zip_code, '')), ' ', '') ILIKE REPLACE($${i}, ' ', ''))`;
  }

  const postcode =
    extractPostcodeFromAddress(q) ||
    (q.replace(/\s+/g, '').match(/^[A-Z]{1,2}\d[A-Z0-9]?\d[A-Z]{2}$/i) ? normalisePostcode(q) : null);

  if (postcode) {
    const pcCompact = normalisePostcode(postcode).replace(/\s+/g, '');
    const isPostcodeOnly = q.replace(/\s+/g, '').toUpperCase() === pcCompact;
    params.push(pcCompact);
    const pcIdx = params.length;
    if (isPostcodeOnly) {
      return `${filter} AND REPLACE(UPPER(COALESCE(p.zip_code, '')), ' ', '') = $${pcIdx}`;
    }
    params.push(`%${q}%`);
    const i = params.length;
    return `${filter} AND (REPLACE(UPPER(COALESCE(p.zip_code, '')), ' ', '') = $${pcIdx} OR p.title ILIKE $${i} OR p.city ILIKE $${i} OR p.address_line1 ILIKE $${i} OR p.street_name ILIKE $${i} OR p.house_number ILIKE $${i})`;
  }

  params.push(`%${q}%`);
  const i = params.length;
  return `${filter} AND (p.title ILIKE $${i} OR p.city ILIKE $${i} OR p.zip_code ILIKE $${i} OR p.address_line1 ILIKE $${i} OR p.street_name ILIKE $${i} OR p.house_number ILIKE $${i} OR CAST(p.id AS TEXT) ILIKE $${i})`;
}

async function searchUserProperties(userId, query = '') {
  const q = (query || '').trim();
  const params = [userId];
  let filter = appendSearchFilter(q, params, 'p.user_id = $1');

  const result = await pool.query(
    `SELECT p.id, p.title, p.city, p.zip_code, p.address_line1, p.property_type, p.category,
            p.property_category, p.price, p.monthly_rent, p.weekly_rent, p.bedrooms, p.bathrooms,
            p.square_feet, p.status,
            (SELECT pi.image_url FROM property_images pi WHERE pi.property_id = p.id ORDER BY pi.id LIMIT 1) AS main_image
     FROM properties p
     WHERE ${filter}
     ORDER BY p.updated_at DESC NULLS LAST
     LIMIT 30`,
    params
  );
  return result.rows.map(mapListRow);
}

/** Approved public listings for buyers/investors browsing — no ownership filter. */
async function searchApprovedListings(query = '', { limit = 30 } = {}) {
  return searchPublicPropertiesForIntelligence(query, { limit });
}

/** Resolve saved property IDs to approved listings (client-side favourites). */
async function fetchApprovedListingsByIds(ids = []) {
  const validIds = [...new Set(ids.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!validIds.length) return [];

  const result = await pool.query(
    `SELECT ${PUBLIC_LISTING_SELECT},
            (SELECT pi.image_url FROM property_images pi WHERE pi.property_id = p.id ORDER BY pi.id LIMIT 1) AS main_image
     FROM properties p
     WHERE p.status = 'approved' AND p.id = ANY($1::int[])
     ORDER BY p.updated_at DESC NULLS LAST`,
    [validIds]
  );
  return result.rows.map(mapListRow);
}

function toListingNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getMonthlyRent(property) {
  if (!property) return null;
  const monthly = toListingNumber(property.monthly_rent);
  if (monthly != null) return monthly;
  const weekly = toListingNumber(property.weekly_rent);
  if (weekly != null) return weekly * 4.33;
  return null;
}

module.exports = {
  fetchPropertyFull,
  fetchPropertyRaw,
  fetchPropertyForIntelligence,
  searchUserProperties,
  searchApprovedListings,
  fetchApprovedListingsByIds,
  buildAddress,
  toListingNumber,
  getMonthlyRent,
};
