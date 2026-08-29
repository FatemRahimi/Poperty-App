/**
 * Link resolved UPRN / external subjects to matching approved marketplace listings.
 */

const pool = require('../../models/db');
const { normalisePostcode } = require('../../utils/ukAddress');
const { upsertIdentity } = require('../enrichment/propertyIdentityRepository');

const LISTING_SELECT = `
  SELECT p.id, p.title, p.slug, p.price, p.city, p.zip_code, p.house_number, p.street_name, p.address_line1,
    (SELECT image_url FROM property_images WHERE property_id = p.id ORDER BY image_order ASC, id ASC LIMIT 1) AS main_image
  FROM properties p
`;

async function findMatchingMarketplaceListing({ uprn, postcode, normalizedAddress }) {
  const uprnStr = uprn ? String(uprn) : null;
  const pc = normalisePostcode(postcode);

  if (uprnStr) {
    const byIdentity = await pool.query(
      `${LISTING_SELECT}
       JOIN property_identities pi ON pi.property_id = p.id
       WHERE pi.uprn = $1 AND p.status = 'approved'
       LIMIT 1`,
      [uprnStr]
    );
    if (byIdentity.rows[0]) {
      return { matchMethod: 'uprn_identity', confidence: 'high', listing: byIdentity.rows[0] };
    }

    const bySubject = await pool.query(
      `${LISTING_SELECT}
       JOIN intelligence_subjects s ON s.property_id = p.id
       WHERE s.uprn = $1 AND p.status = 'approved'
       LIMIT 1`,
      [uprnStr]
    );
    if (bySubject.rows[0]) {
      return { matchMethod: 'subject_link', confidence: 'high', listing: bySubject.rows[0] };
    }
  }

  if (!pc || !normalizedAddress) {
    return null;
  }

  const houseMatch = String(normalizedAddress).match(/^\s*(\d+[a-zA-Z]?)/);
  const houseNum = houseMatch ? houseMatch[1].toLowerCase() : null;
  const streetHint = String(normalizedAddress)
    .split(',')[0]
    .replace(/^\s*\d+[a-zA-Z]?\s*/, '')
    .trim()
    .toLowerCase();

  const candidates = await pool.query(
    `${LISTING_SELECT}
     WHERE p.status = 'approved'
       AND REPLACE(UPPER(COALESCE(p.zip_code, '')), ' ', '') = REPLACE(UPPER($1), ' ', '')
     LIMIT 40`,
    [pc]
  );

  for (const row of candidates.rows) {
    const hn = (row.house_number || '').toString().toLowerCase();
    const street = (row.street_name || row.address_line1 || '').toLowerCase();
    const houseOk =
      !houseNum || hn === houseNum || street.startsWith(`${houseNum} `) || street.startsWith(houseNum);
    const streetOk =
      !streetHint || street.includes(streetHint) || streetHint.includes(street.split(' ')[0]);

    if (houseOk && streetOk) {
      return { matchMethod: 'postcode_address', confidence: 'medium', listing: row };
    }
  }

  return null;
}

/**
 * Persist UPRN ↔ listing link in property_identities and return listing summary for UI.
 */
async function linkSubjectToMarketplaceListing({ uprn, postcode, normalizedAddress, latitude, longitude }) {
  const match = await findMatchingMarketplaceListing({ uprn, postcode, normalizedAddress });
  if (!match?.listing) {
    return { linked: false, listing: null, matchMethod: null };
  }

  const listing = match.listing;

  if (uprn) {
    await upsertIdentity({
      propertyId: listing.id,
      uprn: String(uprn),
      normalizedAddress: normalizedAddress || listing.title,
      postcode: normalisePostcode(postcode || listing.zip_code),
      latitude,
      longitude,
      matchConfidence: match.confidence || 'medium',
      matchMethod: match.matchMethod,
      provider: 'PropertyData',
      providerPayload: { linkedFrom: 'intelligence_subject_resolve' },
    });
  }

  return {
    linked: true,
    matchMethod: match.matchMethod,
    confidence: match.confidence,
    listing: {
      id: listing.id,
      title: listing.title,
      slug: listing.slug,
      price: listing.price,
      city: listing.city,
      zip_code: listing.zip_code,
      main_image: listing.main_image,
    },
  };
}

async function getListingSummaryById(propertyId) {
  if (!propertyId) return null;
  const result = await pool.query(`${LISTING_SELECT} WHERE p.id = $1 AND p.status = 'approved'`, [
    propertyId,
  ]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    price: row.price,
    city: row.city,
    zip_code: row.zip_code,
    main_image: row.main_image,
  };
}

module.exports = {
  findMatchingMarketplaceListing,
  linkSubjectToMarketplaceListing,
  getListingSummaryById,
};
