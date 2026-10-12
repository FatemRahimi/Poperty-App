/**
 * LET / INVEST progressive workspace display helpers.
 * Presentation only — does not change finance contracts or invent evidence.
 */

export const LET_UNDERWRITING_STAGES = Object.freeze([
  {
    id: 'property_rent',
    label: 'Deal & rent',
    guidance:
      'Gross yield orientation needs a positive purchase-price basis and a positive rent basis. An asking price is not fair value.',
  },
  {
    id: 'operating',
    label: 'Operating costs',
    guidance:
      'NOI needs the complete operating-cost set. Blank is unknown, not £0. Enter 0 only when the cost is explicitly none.',
  },
  {
    id: 'financing',
    label: 'Financing',
    guidance:
      'Cash flow / DSCR need deposit, interest rate and term after NOI inputs. Mortgage amount is optional when it can be derived from price and deposit. Missing is not a cash purchase or a zero-cost loan.',
  },
]);

export function defaultLetStage(expandedSection) {
  if (expandedSection === 'operating' || expandedSection === 'financing' || expandedSection === 'all') {
    return expandedSection;
  }
  return 'property_rent';
}

/**
 * True when existing frontend state can safely show listing financial evidence.
 * Non-listing exact subjects must not be framed as a missing listing error.
 */
export function subjectHasListingEvidence(preview, { accessContext = null, linkedListing = null } = {}) {
  if (linkedListing) return true;
  const relationship = accessContext?.relationship;
  if (relationship === 'owner' || relationship === 'external_linked_listing') return true;
  const source = preview?.source;
  if (source === 'my_listing' || source === 'marketplace') return true;
  if (relationship === 'external_lookup' || source === 'external_lookup') return false;
  if (preview?.price != null && preview.price !== '') return true;
  if (preview?.monthly_rent != null && preview.monthly_rent !== '') return true;
  if (preview?.weekly_rent != null && preview.weekly_rent !== '') return true;
  return false;
}

export function askingPriceEvidenceCopy(preview, hasListing) {
  const price = preview?.price;
  const hasPrice = price != null && price !== '';
  if (!hasListing) {
    return hasPrice
      ? {
          show: true,
          label: 'Known asking price',
          value: `£${Number(price).toLocaleString()}`,
          note: 'An asking price is not a valuation or fair value assessment.',
        }
      : { show: false, label: null, value: null, note: null };
  }
  return {
    show: true,
    label: 'Listing asking price',
    value: hasPrice ? `£${Number(price).toLocaleString()}` : null,
    missing: !hasPrice,
    note: 'An asking price is not a valuation or fair value assessment.',
  };
}

export function listingRentEvidenceCopy(preview, hasListing) {
  const rent = preview?.monthly_rent;
  const hasRent = rent != null && rent !== '';
  if (!hasListing) {
    return hasRent
      ? {
          show: true,
          label: 'Known listing rent',
          value: `£${Number(rent).toLocaleString()} pcm`,
        }
      : { show: false };
  }
  return {
    show: true,
    label: 'Listing rent',
    value: hasRent ? `£${Number(rent).toLocaleString()} pcm` : null,
    missing: !hasRent,
  };
}
