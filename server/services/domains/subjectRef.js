/**
 * Shared subject reference from analyse identity.
 * Does not interpret planning applications or flood zones.
 */

const { createSubjectRef, IDENTITY_KIND } = require('../../architecture');

function subjectRefFromIdentity(identity = {}) {
  const listingId = identity.listingId ?? identity.propertyId ?? null;
  const subjectId = identity.subjectId ?? null;
  const uprn = identity.uprn ?? null;
  if (listingId != null && listingId !== '') {
    return createSubjectRef({
      kind: IDENTITY_KIND.LISTING,
      id: listingId,
      listingId,
      subjectId,
      uprn,
    });
  }
  if (subjectId != null && subjectId !== '') {
    return createSubjectRef({
      kind: IDENTITY_KIND.SUBJECT,
      id: subjectId,
      listingId,
      subjectId,
      uprn,
    });
  }
  return createSubjectRef({
    kind: IDENTITY_KIND.PROPERTY,
    id: uprn || 'unidentified',
    listingId,
    subjectId,
    uprn,
  });
}

module.exports = { subjectRefFromIdentity };
