/**
 * Identity entities are not interchangeable.
 * A listing ID is not a UPRN. A building is not a unit. A title is not a parcel.
 * This module defines references only — no cadastral or title matching.
 */

const IDENTITY_KIND = Object.freeze({
  LISTING: 'LISTING',
  SUBJECT: 'SUBJECT',
  PROPERTY: 'PROPERTY',
  BUILDING: 'BUILDING',
  UNIT: 'UNIT',
  LAND_PARCEL: 'LAND_PARCEL',
  TITLE: 'TITLE',
  SITE: 'SITE',
  DEVELOPMENT_SITE: 'DEVELOPMENT_SITE',
  DEVELOPMENT_PROJECT: 'DEVELOPMENT_PROJECT',
  DEVELOPMENT_SCENARIO: 'DEVELOPMENT_SCENARIO',
  USER: 'USER',
  PERSON: 'PERSON',
  ORGANISATION: 'ORGANISATION',
});

/** Relationships do not prove equivalence. */
const IDENTITY_NON_EQUIVALENCE = Object.freeze({
  listingIsNotSubject: true,
  propertyIsNotTitle: true,
  uprnIsNotTitleNumber: true,
  propertyIsNotBuilding: true,
  buildingIsNotUnit: true,
  landIsNotBuilding: true,
  developmentSiteIsNotDevelopmentProject: true,
  developmentSiteIsNotGdv: true,
});

const IDENTITY_RELATION = Object.freeze({
  CONTAINS: 'CONTAINS',
  WITHIN: 'WITHIN',
  PART_OF: 'PART_OF',
  SAME_AS: 'SAME_AS',
  ADJACENT: 'ADJACENT',
  UNKNOWN: 'UNKNOWN',
});

/** How strongly a persisted identity component is known. Inferred is never verified. */
const IDENTITY_VERIFICATION_STATE = Object.freeze({
  VERIFIED_EXACT: 'VERIFIED_EXACT',
  SOURCE_ASSERTED: 'SOURCE_ASSERTED',
  USER_DECLARED: 'USER_DECLARED',
  INFERRED: 'INFERRED',
  UNRESOLVED: 'UNRESOLVED',
});

const IDENTITY_EVIDENCE_SOURCE_TYPE = Object.freeze({
  FIRST_PARTY_LISTING: 'FIRST_PARTY_LISTING',
  LICENSED_PROVIDER: 'LICENSED_PROVIDER',
  OFFICIAL_OPEN: 'OFFICIAL_OPEN',
  USER_DECLARED: 'USER_DECLARED',
  UNKNOWN: 'UNKNOWN',
});

function createSubjectRef({ kind, id, uprn = null, listingId = null, subjectId = null } = {}) {
  if (!kind || !IDENTITY_KIND[kind]) {
    throw new Error('subjectRef.kind is required and must be a known IDENTITY_KIND');
  }
  if (id == null || id === '') {
    throw new Error('subjectRef.id is required');
  }
  return {
    kind,
    id: String(id),
    uprn: uprn == null || uprn === '' ? null : String(uprn),
    listingId: listingId == null || listingId === '' ? null : String(listingId),
    subjectId: subjectId == null || subjectId === '' ? null : String(subjectId),
  };
}

function createIdentityRelation(from, to, relation) {
  if (!IDENTITY_RELATION[relation]) {
    throw new Error('Unknown identity relation');
  }
  return {
    from,
    to,
    relation,
    legalRelationshipClaimed: false,
    note: relation === IDENTITY_RELATION.UNKNOWN
      ? 'Proximity or shared address is not a legal or cadastral relationship.'
      : 'Declared structural relation only. Not a title or cadastral match.',
  };
}

module.exports = {
  IDENTITY_KIND,
  IDENTITY_RELATION,
  IDENTITY_NON_EQUIVALENCE,
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
  createSubjectRef,
  createIdentityRelation,
};
