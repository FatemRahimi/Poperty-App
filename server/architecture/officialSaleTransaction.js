/**
 * Canonical official completed-sale transaction evidence.
 * Source-agnostic type. HMLR Price Paid Data is one emitter.
 * Transaction ≠ comparable. UPRN ≠ title. INSPIRE ID ≠ title number.
 */

const { OFFICIAL_SALE_TRANSACTION_VERSION } = require('./versions');
const {
  createEvidence,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  SPATIAL_RELATION,
} = require('./evidenceContract');
const { DOMAIN_ID } = require('./domainRegistry');
const { IDENTITY_NON_EQUIVALENCE } = require('./identityModel');

const OFFICIAL_SALE_FACT_TYPE = 'officialSaleTransaction';
const OFFICIAL_AREA_SALE_FACT_TYPE = 'officialAreaSaleTransactions';

const MATCH_METHOD = Object.freeze({
  EXACT_UPRN: 'EXACT_UPRN',
  EXACT_CANONICAL_ADDRESS: 'EXACT_CANONICAL_ADDRESS',
  UNMATCHED: 'UNMATCHED',
  AREA_POSTCODE: 'AREA_POSTCODE',
});

const IMPORT_STATUS = Object.freeze({
  IMPORT_NOT_RUN: 'IMPORT_NOT_RUN',
  IMPORT_FAILED: 'IMPORT_FAILED',
  SOURCE_NOT_AVAILABLE: 'SOURCE_NOT_AVAILABLE',
  SOURCE_OUTSIDE_GEOGRAPHY: 'SOURCE_OUTSIDE_GEOGRAPHY',
  NO_MATCH: 'NO_MATCH',
  NO_TRANSACTIONS_FOUND: 'NO_TRANSACTIONS_FOUND',
  TRANSACTION_FOUND: 'TRANSACTION_FOUND',
  LOOKUP_NOT_AVAILABLE: 'LOOKUP_NOT_AVAILABLE',
  UPRN_NOT_AVAILABLE: 'UPRN_NOT_AVAILABLE',
  INSPIRE_NOT_AVAILABLE: 'INSPIRE_NOT_AVAILABLE',
});

const PPD_PROPERTY_TYPE = Object.freeze({
  D: 'detached',
  S: 'semi_detached',
  T: 'terraced',
  F: 'flat_maisonette',
  O: 'other',
});

const SOURCE_GEOGRAPHY = 'England and Wales';

const HMLR_OGL_ATTRIBUTION =
  'Contains HM Land Registry data © Crown copyright and database right. Licensed under the Open Government Licence v3.0.';

const DEFAULT_LIMITATIONS = Object.freeze([
  'Official completed sale is not a current valuation and not a comparable by default.',
  'Asking price is not this transaction.',
  'UPRN match is not title, ownership, building, unit, or land-parcel proof.',
  'INSPIRE ID is not a title number and is not legal title extent.',
  'HM Land Registry Price Paid Data covers England and Wales residential sales for value, subject to published exclusions.',
  'Property type Other is not a commercial, agricultural, land, or development comparable feed.',
  'Address components may include third-party rights (Royal Mail / OS). LICENSING_REVIEW_REQUIRED for uses beyond residential property price information display.',
]);

function ppdTypeIsNotAssetClass(code) {
  return {
    propertyTypeCode: code || null,
    notCommercial: true,
    notAgricultural: true,
    notLand: true,
    notDevelopmentSite: true,
    notMixedUse: true,
    notAuthoritativeAssetClass: true,
  };
}

function toCanonicalTransaction(row = {}, extras = {}) {
  const price = row.price_gbp != null ? Number(row.price_gbp) : null;
  const pricePresent = row.price_present === true && Number.isFinite(price) && price > 0;
  return {
    evidenceFamily: 'OfficialSaleTransactionEvidence',
    factType: OFFICIAL_SALE_FACT_TYPE,
    source: row.source || 'HMLR_PRICE_PAID_DATA',
    sourceTransactionId: row.source_transaction_id || null,
    priceGbp: pricePresent ? price : null,
    pricePresent,
    transferDate: row.transfer_date || null,
    postcode: row.postcode || null,
    propertyTypeCode: row.property_type_code || null,
    propertyTypeLabel: PPD_PROPERTY_TYPE[row.property_type_code] || null,
    newBuild: row.new_build_indicator || null,
    tenureCode: row.tenure_code || null,
    leasehold: row.tenure_code == null ? null : row.tenure_code === 'L',
    freehold: row.tenure_code == null ? null : row.tenure_code === 'F',
    paon: extras.includeAddress === false ? null : (row.paon || null),
    saon: extras.includeAddress === false ? null : (row.saon || null),
    street: extras.includeAddress === false ? null : (row.street || null),
    locality: extras.includeAddress === false ? null : (row.locality || null),
    townCity: extras.includeAddress === false ? null : (row.town_city || null),
    district: extras.includeAddress === false ? null : (row.district || null),
    county: extras.includeAddress === false ? null : (row.county || null),
    categoryType: row.category_type || null,
    uprn: row.uprn || null,
    uprnIds: Array.isArray(row.uprn_ids) && row.uprn_ids.length
      ? row.uprn_ids
      : (row.uprn ? [row.uprn] : []),
    inspireId: (() => {
      const ids = Array.isArray(row.inspire_ids) && row.inspire_ids.length
        ? row.inspire_ids
        : (row.inspire_id ? [row.inspire_id] : []);
      return ids.length === 1 ? ids[0] : null;
    })(),
    inspireIds: Array.isArray(row.inspire_ids) && row.inspire_ids.length
      ? row.inspire_ids
      : (row.inspire_id ? [row.inspire_id] : []),
    inspireCardinality: (() => {
      const n = (Array.isArray(row.inspire_ids) && row.inspire_ids.length)
        ? row.inspire_ids.length
        : (row.inspire_id ? 1 : 0);
      if (n === 0) return 'NONE';
      if (n === 1) return 'ONE';
      return 'MANY';
    })(),
    matchMethod: extras.matchMethod || row.match_method || MATCH_METHOD.UNMATCHED,
    live: row.live !== false,
    datasetVersion: row.dataset_version || null,
    importedAt: row.imported_at || null,
    retrievedAt: row.retrieved_at || row.imported_at || null,
    evidenceAsOf: row.evidence_as_of || row.transfer_date || null,
    observedAt: row.transfer_date || null,
    sourceGeography: SOURCE_GEOGRAPHY,
    uprnIsNotTitle: true,
    inspireIsNotTitleNumber: true,
    transactionIsNotComparable: true,
    typeCodeIsNotAssetClass: ppdTypeIsNotAssetClass(row.property_type_code),
    identityNonEquivalence: IDENTITY_NON_EQUIVALENCE,
    version: OFFICIAL_SALE_TRANSACTION_VERSION,
    attribution: HMLR_OGL_ATTRIBUTION,
  };
}

function toSubjectEvidence(row, subjectRef, matchMethod) {
  const canonical = toCanonicalTransaction(row, { matchMethod });
  return createEvidence({
    domain: DOMAIN_ID.MARKET,
    subjectRef,
    factType: OFFICIAL_SALE_FACT_TYPE,
    classification: EVIDENCE_CLASS.FACT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    provenance: {
      source: canonical.source,
      method: 'hmlr_price_paid_ingest',
      dataset: 'Price Paid Data',
      sourceTransactionId: canonical.sourceTransactionId,
      datasetVersion: canonical.datasetVersion,
      attribution: HMLR_OGL_ATTRIBUTION,
    },
    sourceRecordId: canonical.sourceTransactionId,
    value: canonical,
    unit: canonical.pricePresent ? 'GBP' : null,
    retrievedAt: canonical.retrievedAt,
    evidenceAsOf: canonical.evidenceAsOf,
    observedAt: canonical.observedAt,
    spatialRelation: SPATIAL_RELATION.SUBJECT,
    assessmentState: 'assessed',
    sharedPropertyEvidence: true,
    authoritative: true,
    limitations: DEFAULT_LIMITATIONS,
  });
}

function toAreaEvidence(rows, subjectRef, postcode) {
  const transactions = (rows || []).map((row) => toCanonicalTransaction(row, {
    matchMethod: MATCH_METHOD.AREA_POSTCODE,
    includeAddress: false,
  }));
  return createEvidence({
    domain: DOMAIN_ID.MARKET,
    subjectRef,
    factType: OFFICIAL_AREA_SALE_FACT_TYPE,
    classification: EVIDENCE_CLASS.AREA_CONTEXT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    provenance: {
      source: 'HMLR_PRICE_PAID_DATA',
      method: 'hmlr_price_paid_area_query',
      dataset: 'Price Paid Data',
      attribution: HMLR_OGL_ATTRIBUTION,
    },
    value: {
      observationCount: transactions.length,
      postcode,
      matchMethod: MATCH_METHOD.AREA_POSTCODE,
      sourceGeography: SOURCE_GEOGRAPHY,
      latestTransferDate: transactions.reduce((latest, row) => {
        if (!row.transferDate) return latest;
        return !latest || row.transferDate > latest ? row.transferDate : latest;
      }, null),
      transactions,
    },
    spatialRelation: SPATIAL_RELATION.AREA_CONTEXT,
    assessmentState: 'assessed',
    sharedPropertyEvidence: true,
    authoritative: false,
    limitations: [
      ...DEFAULT_LIMITATIONS,
      'Postcode-level official sales are AREA_CONTEXT. They are not the subject\'s sale.',
    ],
  });
}

module.exports = {
  OFFICIAL_SALE_TRANSACTION_VERSION,
  OFFICIAL_SALE_FACT_TYPE,
  OFFICIAL_AREA_SALE_FACT_TYPE,
  MATCH_METHOD,
  IMPORT_STATUS,
  PPD_PROPERTY_TYPE,
  SOURCE_GEOGRAPHY,
  HMLR_OGL_ATTRIBUTION,
  DEFAULT_LIMITATIONS,
  ppdTypeIsNotAssetClass,
  toCanonicalTransaction,
  toSubjectEvidence,
  toAreaEvidence,
};
