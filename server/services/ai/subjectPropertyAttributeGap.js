/**
 * Workspace gaps for subject property attributes + provider finish input.
 * Presentation only — does not change valuation methodology.
 */

const { KERNEL_ASSESSMENT } = require('../../architecture/assessmentStates');

const GAP_CAUSE = Object.freeze({
  MISSING_USER_REPORTED_ATTRIBUTE: 'MISSING_USER_REPORTED_ATTRIBUTE',
  MISSING_PROVIDER_REQUEST_INPUT: 'MISSING_PROVIDER_REQUEST_INPUT',
});

function missingFieldsFromReport(report = {}) {
  const fields = report?.marketIntelligence?.sale?.readiness?.missingFields
    || report?.valuationSaleReadiness?.missingFields
    || report?.property?.valuationSaleReadiness?.missingFields
    || [];
  return Array.isArray(fields) ? fields : [];
}

function buildSubjectAttributeGaps(report = {}) {
  const missing = new Set(missingFieldsFromReport(report));
  const subjectId = report?.subject?.id
    || report?.property?.subjectId
    || report?.inputSnapshot?.subjectId
    || null;
  const listingId = report?.property?.id ?? report?.inputSnapshot?.listingId ?? null;
  const gaps = [];

  const userCompletable = [
    {
      id: 'subject_bedrooms',
      field: 'bedrooms',
      label: 'Bedrooms',
      whyItMatters: 'Bedroom count is a core property fact used for comparable market context.',
      detail: 'Add the number of bedrooms for this property. This is user-reported evidence, not official verification.',
    },
    {
      id: 'subject_bathrooms',
      field: 'bathrooms',
      label: 'Bathrooms',
      whyItMatters: 'Bathroom count is a core property fact.',
      detail: 'Add the number of bathrooms. User-reported — not inferred from energy certificate data.',
    },
    {
      id: 'subject_outdoor',
      field: 'outdoor_space',
      label: 'Outdoor space',
      whyItMatters: 'Garden or outdoor space is a property attribute buyers and landlords care about.',
      detail: 'Confirm garden, balcony/terrace, or none. Unknown is not the same as no outdoor space.',
    },
    {
      id: 'subject_parking',
      field: 'off_street_parking',
      label: 'Off-street parking',
      whyItMatters: 'Parking availability is a property attribute.',
      detail: 'Confirm off-street parking spaces, including zero if there are none. Unknown is not zero.',
    },
  ];

  for (const row of userCompletable) {
    if (!missing.has(row.field)) continue;
    gaps.push({
      ...row,
      cause: GAP_CAUSE.MISSING_USER_REPORTED_ATTRIBUTE,
      resolutionAction: subjectId ? 'complete_subject_attributes' : (listingId ? 'edit_listing' : 'complete_subject_attributes'),
      subjectAttributeKey: row.field,
      subjectId,
      listingId,
    });
  }

  if (missing.has('finish_quality')) {
    gaps.push({
      id: 'provider_finish_quality',
      field: 'finish_quality',
      label: 'Interior finish',
      cause: GAP_CAUSE.MISSING_PROVIDER_REQUEST_INPUT,
      resolutionAction: 'complete_provider_finish_input',
      subjectAttributeKey: 'finish_quality',
      subjectId,
      listingId,
      whyItMatters:
        'A subjective interior-finish rating is required for the external sale valuation request.',
      detail:
        'This is not an official condition survey. It is a user-reported finish rating used only for the valuation provider request. It is not inferred from the EPC.',
      providerRequestOnly: true,
    });
  }

  return gaps;
}

function subjectAttributeUnresolvedItems(report = {}) {
  return buildSubjectAttributeGaps(report).map((gap) => ({
    id: gap.id,
    label: gap.label,
    state: KERNEL_ASSESSMENT.NOT_ASSESSED,
    whatIsMissing: gap.label,
    whyItMatters: gap.whyItMatters,
    howToResolve: gap.detail,
    resolutionAction: gap.resolutionAction,
    subjectAttributeKey: gap.subjectAttributeKey,
    cause: gap.cause,
    subjectId: gap.subjectId,
    listingId: gap.listingId,
    providerRequestOnly: gap.providerRequestOnly === true,
    isSubjectAttribute: true,
  }));
}

function mergeSubjectAttributeGaps(items = [], report = {}) {
  const gaps = subjectAttributeUnresolvedItems(report);
  const next = [...items];
  for (const gap of gaps) {
    if (!next.some((row) => row?.id === gap.id)) next.push(gap);
  }
  return next;
}

module.exports = {
  GAP_CAUSE,
  buildSubjectAttributeGaps,
  subjectAttributeUnresolvedItems,
  mergeSubjectAttributeGaps,
};
