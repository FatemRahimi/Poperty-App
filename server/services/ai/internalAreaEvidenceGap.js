/**
 * Maps canonical internal-area readiness to decision-workspace listing evidence gaps.
 * Presentation only — does not change valuation methodology.
 */

const { KERNEL_ASSESSMENT } = require('../../architecture/assessmentStates');

const GAP_CAUSE = Object.freeze({
  MISSING_LISTING_ATTRIBUTE: 'MISSING_LISTING_ATTRIBUTE',
});

function listingIdFromReport(report = {}) {
  return report?.property?.id ?? report?.inputSnapshot?.listingId ?? null;
}

function internalAreaBlock(report = {}) {
  return report?.property?.internalArea || null;
}

function reasonCodeFromReport(report = {}) {
  const internal = internalAreaBlock(report);
  if (internal?.available === true) return null;
  if (internal?.readiness?.state === 'PROVIDER_ELIGIBLE') return null;
  if (internal?.readiness?.reasonCode) return internal.readiness.reasonCode;
  const sqft = report?.property?.square_feet;
  if (sqft == null || sqft === '' || Number(sqft) <= 0) {
    return 'MISSING_INTERNAL_AREA';
  }
  return null;
}

function buildInternalAreaEvidenceGap(report = {}) {
  const listingId = listingIdFromReport(report);
  if (!listingId) return null;

  const reasonCode = reasonCodeFromReport(report);
  if (!reasonCode) return null;
  if (reasonCode !== 'MISSING_INTERNAL_AREA' && reasonCode !== 'INVALID_INTERNAL_AREA') {
    return null;
  }

  const internal = internalAreaBlock(report);
  const note = internal?.readiness?.note || null;

  if (reasonCode === 'INVALID_INTERNAL_AREA') {
    return {
      id: 'internal_floor_area',
      cause: GAP_CAUSE.MISSING_LISTING_ATTRIBUTE,
      resolutionAction: 'edit_listing',
      listingAttributeKey: 'internal_area',
      reasonCode,
      whyItMatters:
        'Property-specific valuation uses a defensible internal floor area for this listing subject.',
      detail:
        'The recorded internal floor area appears invalid. Review and correct it when editing the listing. This is first-party listing evidence — not official verification.',
    };
  }

  return {
    id: 'internal_floor_area',
    cause: GAP_CAUSE.MISSING_LISTING_ATTRIBUTE,
    resolutionAction: 'edit_listing',
    listingAttributeKey: 'internal_area',
    reasonCode,
    whyItMatters:
      'Property-specific valuation requires a recorded internal floor area for this listing when other provider preconditions are met.',
    detail: note
      ? `${note} You can review or update the value when editing the listing.`
      : 'Internal floor area is not recorded for this listing. You can add it when editing the property. This is optional first-party evidence and is not official verification.',
  };
}

function internalAreaUnresolvedItem(report = {}) {
  const gap = buildInternalAreaEvidenceGap(report);
  if (!gap) return null;
  return {
    id: gap.id,
    label: 'Internal floor area',
    state: KERNEL_ASSESSMENT.NOT_ASSESSED,
    whatIsMissing: 'Internal floor area',
    whyItMatters: gap.whyItMatters,
    howToResolve: gap.detail,
    resolutionAction: gap.resolutionAction,
    listingAttributeKey: gap.listingAttributeKey,
    cause: gap.cause,
    reasonCode: gap.reasonCode,
    isListingAttribute: true,
  };
}

function mergeInternalAreaGap(items = [], report = {}) {
  const gap = internalAreaUnresolvedItem(report);
  if (!gap) return items;
  if (items.some((row) => row?.id === gap.id)) return items;
  return [gap, ...items];
}

function applyListingAttributeHints(item, report = {}) {
  if (!item || item.available) return item;
  if (item.id !== 'valuation_range' && item.id !== 'price_position') return item;
  const gap = buildInternalAreaEvidenceGap(report);
  if (!gap) return item;
  return {
    ...item,
    howToResolve: gap.detail,
    resolutionAction: gap.resolutionAction,
    listingAttributeKey: gap.listingAttributeKey,
    cause: gap.cause,
    isListingAttribute: true,
    reasonCode: gap.reasonCode,
  };
}

module.exports = {
  GAP_CAUSE,
  buildInternalAreaEvidenceGap,
  internalAreaUnresolvedItem,
  mergeInternalAreaGap,
  applyListingAttributeHints,
};
