/**
 * Runtime query for official sale transactions.
 * Analyse path is bounded: local DB only, never downloads HMLR.
 */

const { tableExists } = require('../../db/ensureIntelligenceSchema');
const {
  MATCH_METHOD,
  IMPORT_STATUS,
  SOURCE_GEOGRAPHY,
  toSubjectEvidence,
  toAreaEvidence,
} = require('../../architecture/officialSaleTransaction');
const { compactPostcode } = require('./hmlrPricePaidParser');
const { createPostgresOfficialSaleStore } = require('./officialSaleTransactionRepository');
const { subjectRefFromIdentity } = require('../domains/subjectRef');

const SCOTLAND_OR_NI = /^(AB|DD|DG|EH|FK|G|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE|BT)\d/i;

function emptyResult(status, extras = {}) {
  return {
    status,
    sourceGeography: SOURCE_GEOGRAPHY,
    subjectTransactions: [],
    areaTransactions: [],
    matchMethod: MATCH_METHOD.UNMATCHED,
    importRun: null,
    subjectOfficialTransactionCount: status === IMPORT_STATUS.NO_TRANSACTIONS_FOUND ? 0 : null,
    areaOfficialTransactionCount: status === IMPORT_STATUS.NO_TRANSACTIONS_FOUND ? 0 : null,
    uprnMatchedTransactionCount: null,
    latestOfficialTransactionDate: null,
    ...extras,
  };
}

function isOutsideSourceGeography(postcode) {
  const compact = compactPostcode(postcode);
  return Boolean(compact && SCOTLAND_OR_NI.test(compact));
}

function listingPaon(property = {}, identity = {}) {
  return identity.paon || property.paon || property.house_number || null;
}

function listingSaon(property = {}, identity = {}) {
  return identity.saon || property.saon || property.flat_number || null;
}

async function queryOfficialSaleTransactions({
  identity = {},
  property = {},
  store = null,
  limit = 25,
} = {}) {
  const postcode = property.zip_code || property.postcode || identity.postcode || null;
  if (isOutsideSourceGeography(postcode)) {
    return emptyResult(IMPORT_STATUS.SOURCE_OUTSIDE_GEOGRAPHY, {
      officialTransactionSourceAvailable: false,
    });
  }

  let dbStore = store;
  if (!dbStore) {
    try {
      if (!(await tableExists('official_sale_transactions'))) {
        return emptyResult(IMPORT_STATUS.IMPORT_NOT_RUN, {
          officialTransactionSourceAvailable: false,
        });
      }
      dbStore = createPostgresOfficialSaleStore();
    } catch {
      return emptyResult(IMPORT_STATUS.SOURCE_NOT_AVAILABLE, {
        officialTransactionSourceAvailable: false,
      });
    }
  }

  let importRun = null;
  let latestRun = null;
  try {
    importRun = await dbStore.latestSuccessfulRun();
    latestRun = typeof dbStore.latestRun === 'function' ? await dbStore.latestRun() : importRun;
  } catch {
    return emptyResult(IMPORT_STATUS.SOURCE_NOT_AVAILABLE, {
      officialTransactionSourceAvailable: false,
    });
  }
  if (!importRun) {
    if (latestRun && latestRun.status === 'FAILED') {
      return emptyResult(IMPORT_STATUS.IMPORT_FAILED, {
        officialTransactionSourceAvailable: false,
        importRun: latestRun,
      });
    }
    if (dbStore.kind !== 'memory') {
      return emptyResult(IMPORT_STATUS.IMPORT_NOT_RUN, {
        officialTransactionSourceAvailable: false,
        importRun: latestRun,
      });
    }
  }

  const uprn = identity.uprn || property.uprn || null;
  let subjectRows = [];
  let matchMethod = MATCH_METHOD.UNMATCHED;
  if (uprn) {
    subjectRows = await dbStore.findLiveByUprn(uprn);
    if (subjectRows.length) matchMethod = MATCH_METHOD.EXACT_UPRN;
  }
  if (!subjectRows.length) {
    const paon = listingPaon(property, identity);
    const compact = compactPostcode(postcode);
    if (paon && compact) {
      subjectRows = await dbStore.findLiveByExactAddress(compact, paon, listingSaon(property, identity));
      if (subjectRows.length) matchMethod = MATCH_METHOD.EXACT_CANONICAL_ADDRESS;
    }
  }

  const compact = compactPostcode(postcode);
  const subjectIds = new Set(subjectRows.map((row) => row.source_transaction_id));
  const areaRows = compact
    ? (await dbStore.findLiveByPostcode(compact, { limit }))
      .filter((row) => !subjectIds.has(row.source_transaction_id))
    : [];

  const status = subjectRows.length
    ? IMPORT_STATUS.TRANSACTION_FOUND
    : (areaRows.length ? IMPORT_STATUS.NO_MATCH : IMPORT_STATUS.NO_TRANSACTIONS_FOUND);

  const latest = [...subjectRows, ...areaRows]
    .map((row) => row.transfer_date)
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  return {
    status,
    sourceGeography: SOURCE_GEOGRAPHY,
    officialTransactionSourceAvailable: true,
    subjectTransactions: subjectRows,
    areaTransactions: areaRows,
    matchMethod,
    importRun,
    subjectOfficialTransactionCount: subjectRows.length,
    areaOfficialTransactionCount: areaRows.length,
    uprnMatchedTransactionCount: subjectRows.filter((row) => row.uprn).length,
    latestOfficialTransactionDate: latest,
    uprnAvailable: Boolean(uprn),
    inspireLinkedCount: [...subjectRows, ...areaRows].filter((row) => row.inspire_id).length,
    lookupStatus: uprn ? null : IMPORT_STATUS.UPRN_NOT_AVAILABLE,
    unmatchedTransactionCount: subjectRows.length ? 0 : (areaRows.length || 0),
  };
}

function officialSalesForMarket(queryResult, identity) {
  const subjectRef = subjectRefFromIdentity(identity);
  const evidence = [];
  (queryResult.subjectTransactions || []).forEach((row) => {
    evidence.push(toSubjectEvidence(row, subjectRef, queryResult.matchMethod));
  });
  if ((queryResult.areaTransactions || []).length) {
    const postcode = queryResult.areaTransactions[0].postcode || null;
    evidence.push(toAreaEvidence(queryResult.areaTransactions, subjectRef, postcode));
  }
  return evidence;
}

module.exports = {
  SCOTLAND_OR_NI,
  isOutsideSourceGeography,
  queryOfficialSaleTransactions,
  officialSalesForMarket,
  emptyResult,
};
