/**
 * Link resolved UPRN / external subjects to matching approved marketplace listings.
 *
 * Authoritative automatic linkage requires a matching real UPRN on the listing
 * (`property_identities.uprn` via `uprn_identity`, or a `subject_link` that
 * independently carries that same listing UPRN).
 *
 * `postcode_address` is discovery/presentation context only. It must not persist
 * intelligence_subjects.property_id and must not overlay listing facts onto an
 * external UPRN subject. Street / PAON / missing-SAON / fuzzy matches never
 * become subject evidence.
 *
 * Historical intelligence_subjects.property_id is not proof of identity. A
 * stale FK without a matching listing UPRN must fail safe (no overlay).
 */

const pool = require('../../models/db');
const { normalisePostcode } = require('../../utils/ukAddress');
const { upsertIdentity } = require('../enrichment/propertyIdentityRepository');

const LISTING_SELECT = `
  SELECT p.id, p.title, p.slug, p.price, p.city, p.zip_code, p.house_number, p.street_name, p.address_line1,
         p.bedrooms, p.monthly_rent, p.weekly_rent,
    (SELECT image_url FROM property_images WHERE property_id = p.id ORDER BY image_order ASC, id ASC LIMIT 1) AS main_image
  FROM properties p
`;

const AUTHORITATIVE_LISTING_LINK_METHODS = Object.freeze(['uprn_identity', 'subject_link']);

function isAuthoritativeListingLinkMethod(matchMethod) {
  return AUTHORITATIVE_LISTING_LINK_METHODS.includes(String(matchMethod || ''));
}

function normalizeUprn(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  return text || null;
}

async function getListingUprn(propertyId) {
  if (!propertyId) return null;
  const result = await pool.query(
    `SELECT uprn FROM property_identities
     WHERE property_id = $1 AND uprn IS NOT NULL AND BTRIM(uprn) <> ''
     LIMIT 1`,
    [propertyId]
  );
  return normalizeUprn(result.rows[0]?.uprn);
}

function summarizeListing(listing) {
  if (!listing) return null;
  return {
    id: listing.id,
    title: listing.title,
    slug: listing.slug,
    price: listing.price,
    city: listing.city,
    zip_code: listing.zip_code,
    bedrooms: listing.bedrooms,
    monthly_rent: listing.monthly_rent,
    weekly_rent: listing.weekly_rent,
    main_image: listing.main_image,
  };
}

/**
 * Authoritative overlay requires matching real UPRNs. Same postcode, loose
 * street, PAON-only, missing SAON, or postcode_address never overlay.
 */
function canOverlayMarketplaceListingOnExternalSubject({
  matchMethod = null,
  subjectUprn = null,
  listingUprn = null,
} = {}) {
  if (!isAuthoritativeListingLinkMethod(matchMethod)) return false;
  const subject = normalizeUprn(subjectUprn);
  const listing = normalizeUprn(listingUprn);
  if (!subject || !listing) return false;
  return subject === listing;
}

function overlayListingOntoExternalSubjectProperty(subjectProperty, listing, decision) {
  if (!decision?.overlay || !listing) return subjectProperty;
  return {
    ...listing,
    subjectId: subjectProperty?.subjectId ?? decision.subjectId ?? null,
    uprn: subjectProperty?.uprn ?? decision.subjectUprn ?? null,
    source: 'linked_marketplace_listing',
  };
}

function authorizeMarketplaceListingLink(match) {
  if (!match?.listing) {
    return { linked: false, listing: null, matchMethod: match?.matchMethod || null, listingUprn: null };
  }
  if (!isAuthoritativeListingLinkMethod(match.matchMethod)) {
    return {
      linked: false,
      listing: null,
      matchMethod: match.matchMethod,
      listingUprn: null,
      discoveryListing: match.matchMethod === 'postcode_address' ? summarizeListing(match.listing) : null,
    };
  }
  const listingUprn = normalizeUprn(match.listingUprn);
  if (!listingUprn) {
    return {
      linked: false,
      listing: null,
      matchMethod: match.matchMethod,
      listingUprn: null,
    };
  }
  return {
    linked: true,
    matchMethod: match.matchMethod,
    confidence: match.confidence,
    listing: summarizeListing(match.listing),
    listingUprn,
  };
}

function selectAuthoritativeLinkForSubject(subject, match) {
  const subjectUprn = normalizeUprn(subject?.uprn);
  if (!subjectUprn) {
    return { linked: false, listing: null, matchMethod: match?.matchMethod || null, listingUprn: null };
  }
  const authorized = authorizeMarketplaceListingLink(match);
  if (!authorized.linked) return authorized;
  if (authorized.listingUprn !== subjectUprn) {
    return {
      linked: false,
      listing: null,
      matchMethod: match?.matchMethod || null,
      listingUprn: authorized.listingUprn,
    };
  }
  return authorized;
}

async function findMatchingMarketplaceListing({ uprn, postcode, normalizedAddress } = {}) {
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
      return {
        matchMethod: 'uprn_identity',
        confidence: 'high',
        listing: byIdentity.rows[0],
        listingUprn: uprnStr,
      };
    }

    const bySubject = await pool.query(
      `${LISTING_SELECT}
       JOIN intelligence_subjects s ON s.property_id = p.id
       WHERE s.uprn = $1 AND p.status = 'approved'
       LIMIT 1`,
      [uprnStr]
    );
    if (bySubject.rows[0]) {
      const listingUprn = await getListingUprn(bySubject.rows[0].id);
      return {
        matchMethod: 'subject_link',
        confidence: listingUprn && listingUprn === uprnStr ? 'high' : 'low',
        listing: bySubject.rows[0],
        listingUprn,
      };
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
 * postcode_address never returns linked:true.
 */
async function linkSubjectToMarketplaceListing({ uprn, postcode, normalizedAddress, latitude, longitude }) {
  const match = await findMatchingMarketplaceListing({ uprn, postcode, normalizedAddress });
  const authorized = selectAuthoritativeLinkForSubject({ uprn }, match);
  if (!authorized.linked) {
    return authorized;
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
      uprnMode: 'set',
      identityState: 'SOURCE_ASSERTED',
      verificationState: 'SOURCE_ASSERTED',
      identitySource: 'PropertyData',
    });
  }

  return authorized;
}

async function resolveAuthoritativeLinkedListing(subject) {
  if (!subject?.uprn) {
    return { linked: false, listing: null, matchMethod: null, listingUprn: null };
  }
  const match = await findMatchingMarketplaceListing({ uprn: subject.uprn });
  return selectAuthoritativeLinkForSubject(subject, match);
}

async function getListingSummaryById(propertyId) {
  if (!propertyId) return null;
  const result = await pool.query(`${LISTING_SELECT} WHERE p.id = $1 AND p.status = 'approved'`, [
    propertyId,
  ]);
  const row = result.rows[0];
  if (!row) return null;
  return summarizeListing(row);
}

module.exports = {
  AUTHORITATIVE_LISTING_LINK_METHODS,
  isAuthoritativeListingLinkMethod,
  normalizeUprn,
  getListingUprn,
  canOverlayMarketplaceListingOnExternalSubject,
  overlayListingOntoExternalSubjectProperty,
  authorizeMarketplaceListingLink,
  selectAuthoritativeLinkForSubject,
  findMatchingMarketplaceListing,
  linkSubjectToMarketplaceListing,
  resolveAuthoritativeLinkedListing,
  getListingSummaryById,
};
