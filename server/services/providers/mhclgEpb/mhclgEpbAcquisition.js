/**
 * Official MHCLG EPB acquisition: geography gate, bounded search, exact attach, persist.
 * Free source. Still coalesced, cached, and rate-limit aware. No national CSV in analyse.
 */

const { propertyIntelligenceConfig } = require('../../../config/propertyIntelligence.config');
const {
  EPB_SOURCE,
  EPB_SOURCE_TYPE,
  EPB_CAPABILITY,
  EPB_ATTACHMENT,
  EPB_ERROR,
  CERTIFICATE_TYPE,
  stripRestrictedAddress,
  compactPresentFields,
  normalizeCertificateNumber,
} = require('../../../architecture/epbEvidenceContract');
const { IDENTITY_VERIFICATION_STATE, IDENTITY_EVIDENCE_SOURCE_TYPE } = require('../../../architecture/identityModel');
const { extractCanonicalAddress } = require('../../identity/canonicalAddress');
const { persistOfficialEpbUprn } = require('../../identity/canonicalIdentityService');
const { epbGeographyStatus } = require('./mhclgEpbGeography');
const { createMhclgEpbClient, logEpb } = require('./mhclgEpbClient');
const { evaluateEpbCandidates, listingAppearsUnitSpecific } = require('./mhclgEpbMatcher');
const { parseCertificate, latestCertificate, attribution } = require('./mhclgEpbParser');
const { createMemoryEpbStore, createPostgresEpbStore } = require('./mhclgEpbRepository');

const inFlight = new Map();

function epbConfig() {
  return propertyIntelligenceConfig.providers.mhclgEpb || {};
}

function getEpbCapability(config = epbConfig()) {
  if (!config.enabled) {
    return {
      capability: EPB_CAPABILITY.UNAVAILABLE_MISSING_CREDENTIAL,
      available: false,
      reason: 'disabled',
    };
  }
  if (!config.bearerToken) {
    return {
      capability: EPB_CAPABILITY.UNAVAILABLE_MISSING_CREDENTIAL,
      available: false,
      reason: 'missing_credential',
    };
  }
  return { capability: EPB_CAPABILITY.AVAILABLE, available: true, reason: 'ok' };
}

function listingPostcode(property = {}, identity = {}) {
  return identity.postcode || identity.postcodeCompact
    || property.zip_code || property.postcode || null;
}

function refreshTtlMs(config = epbConfig()) {
  return config.refreshTtlMs || 30 * 24 * 60 * 60 * 1000;
}

function isFresh(row, nowMs, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return false;
  if (!row?.retrieved_at && !row?.retrievedAt) return false;
  const retrieved = new Date(row.retrieved_at || row.retrievedAt).getTime();
  if (!Number.isFinite(retrieved)) return false;
  return nowMs - retrieved <= ttlMs;
}

function parseFacts(row) {
  const facts = row?.facts;
  if (!facts) return {};
  if (typeof facts === 'string') {
    try {
      return JSON.parse(facts);
    } catch {
      return {};
    }
  }
  return facts;
}

function toClientSnapshot(result) {
  const current = result.currentCertificate || null;
  const facts = current?.facts ? stripRestrictedAddress(current.facts) : {};
  const {
    buildOfficialConstructionAgeEvidence,
  } = require('./officialConstructionAgeEvidence');
  const constructionAge = buildOfficialConstructionAgeEvidence({
    facts,
    certificateNumber: current?.certificateNumber || current?.certificate_number || null,
    uprn: result.uprn || facts.uprn || null,
  });
  return {
    status: result.status,
    attachmentStatus: result.attachmentStatus,
    capability: result.capability,
    source: EPB_SOURCE,
    sourceType: EPB_SOURCE_TYPE,
    sourceGeography: result.sourceGeography || 'ENGLAND_WALES',
    searchAttempted: result.searchAttempted === true,
    cacheHit: result.cacheHit === true,
    certificateType: current?.certificateType || current?.certificate_type || null,
    certificateNumber: current?.certificateNumber || current?.certificate_number || null,
    inspectionDate: facts.inspectionDate || current?.inspectionDate || current?.inspection_date || null,
    lodgementDate: facts.lodgementDate || current?.lodgementDate || current?.lodgement_date || null,
    retrievedAt: result.retrievedAt || null,
    uprn: result.uprn || facts.uprn || null,
    current: {
      energyRating: facts.currentEnergyRating || facts.energyBand || null,
      potentialEnergyRating: facts.potentialEnergyRating || null,
      floorAreaSqm: facts.totalFloorAreaSqm || null,
      builtForm: facts.builtForm || null,
      // Normalized official period when decoded; never an invented exact year.
      constructionAgeBand: constructionAge.normalizedOfficialPeriod || facts.constructionAgeBand || null,
      constructionAgeBandRawCode: constructionAge.rawOfficialAgeCode || facts.constructionAgeBandRawCode || null,
      constructionAgeEvidence: constructionAge.assessment !== 'NOT_ASSESSED' || (constructionAge.buildingParts || []).length
        ? {
          provenance: constructionAge.provenance,
          rawCode: constructionAge.rawOfficialAgeCode,
          periodLabel: constructionAge.normalizedOfficialPeriod,
          assessment: constructionAge.assessment,
          propertyDataMappable: constructionAge.propertyDataMappable,
          propertyDataConstructionDate: constructionAge.propertyDataConstructionDate,
          ambiguity: constructionAge.ambiguity,
          buildingParts: constructionAge.buildingParts,
          schemaType: constructionAge.schemaType,
          asOf: constructionAge.asOf,
          certificateNumber: constructionAge.certificateNumber,
        }
        : null,
      propertyType: facts.propertyType || null,
      assetRating: facts.assetRating || null,
      energyBand: facts.energyBand || null,
    },
    potentialIsModelled: true,
    historyCount: Array.isArray(result.certificates) ? result.certificates.length : 0,
    professionalBuildingConditionAssessed: false,
    epcIsNotSurvey: true,
    limitations: result.limitations || [],
    reason: result.reason || null,
    attribution: attribution(),
  };
}

function emptyResult(status, extras = {}) {
  return {
    status,
    attachmentStatus: extras.attachmentStatus || status,
    capability: extras.capability || EPB_CAPABILITY.AVAILABLE,
    searchAttempted: extras.searchAttempted === true,
    cacheHit: extras.cacheHit === true,
    certificates: extras.certificates || [],
    currentCertificate: extras.currentCertificate || null,
    uprn: extras.uprn || null,
    reason: extras.reason || null,
    errorCode: extras.errorCode || null,
    retrievedAt: extras.retrievedAt || new Date().toISOString(),
    sourceGeography: extras.sourceGeography || 'ENGLAND_WALES',
    limitations: extras.limitations || [],
    client: null,
  };
}

function limitationsFor(status, extra = []) {
  const base = [
    'EPC evidence is energy and physical certificate data, not a building survey.',
    'Potential ratings are modelled improvements, not current fabric facts.',
    'Missing certificate is not evidence that no EPC is legally required.',
    'MHCLG address fields are not stored as a reusable gazetteer.',
  ];
  return [...base, ...extra];
}

async function defaultStore() {
  try {
    const { tableExists } = require('../../../db/ensureIntelligenceSchema');
    if (await tableExists('official_epb_certificates')) {
      const pool = require('../../../models/db');
      return createPostgresEpbStore(pool);
    }
  } catch {
    // Persistence is optional for analysis snapshot assembly.
  }
  return createMemoryEpbStore();
}

/**
 * Official search treats `address` as a partial street/address string.
 * Sending a bare PAON/house number 404s the query (documented empty-result).
 * Provider search is postcode candidate discovery; exact PAON/SAON matching stays in memory.
 */
async function searchPaged(client, certificateType, postcode, config) {
  const pageSize = config.pageSize || 100;
  const maxCandidates = config.maxCandidates || 500;
  const maxPages = Math.min(Number(config.maxSearchPages) || 5, 5);
  const rows = [];
  let last = {
    ok: true,
    rows: [],
    pagination: { totalPages: 1, totalRecords: 0 },
    status: 200,
    errorCode: null,
  };
  for (let page = 1; page <= maxPages && rows.length < maxCandidates; page += 1) {
    last = await client.search(certificateType, {
      postcode,
      pageSize,
      page,
    });
    if (!last.ok) {
      return rows.length ? { ...last, ok: true, rows: rows.slice(0, maxCandidates) } : last;
    }
    const incoming = Array.isArray(last.rows) ? last.rows : [];
    rows.push(...incoming);
    const totalPages = Number(last.pagination?.totalPages) || 1;
    const totalRecords = Number(last.pagination?.totalRecords);
    const exhausted = incoming.length === 0
      || page >= totalPages
      || (Number.isFinite(totalRecords) && totalRecords > 0 && rows.length >= totalRecords);
    if (exhausted) break;
  }
  return {
    ...last,
    ok: true,
    rows: rows.slice(0, maxCandidates),
  };
}

async function persistMatches({
  store,
  property,
  identity,
  match,
  current,
  retrievedAt,
  persistUprnFn,
}) {
  const certificates = [];
  for (const row of match.matches) {
    const facts = compactPresentFields(stripRestrictedAddress({
      ...(row.facts || {}),
      currentEnergyRating: row.currentEnergyRating || row.facts?.currentEnergyRating || null,
      inspectionDate: row.inspectionDate || row.facts?.inspectionDate || null,
      lodgementDate: row.registrationDate || row.lodgementDate || row.facts?.lodgementDate || null,
      uprn: row.uprn || row.facts?.uprn || null,
      uprnSource: row.uprnSource || row.facts?.uprnSource || null,
      schemaType: row.schemaType || row.facts?.schemaType || null,
    }));
    const isCurrent = current
      && normalizeCertificateNumber(row.certificateNumber) === normalizeCertificateNumber(
        current.certificateNumber || current.certificate_number
      );
    const saved = await store.upsertCertificate({
      propertyId: property.id,
      certificateNumber: row.certificateNumber,
      certificateType: row.certificateType,
      uprn: facts.uprn || match.uprn || null,
      uprnSource: facts.uprnSource || null,
      inspectionDate: facts.inspectionDate,
      lodgementDate: facts.lodgementDate,
      isCurrent,
      attachmentStatus: EPB_ATTACHMENT.UNIQUE_ATTACH,
      schemaType: facts.schemaType,
      facts,
      provenance: {
        ...attribution(),
        retrievedAt,
        certificateNumber: row.certificateNumber,
        uprnSource: facts.uprnSource || null,
      },
      limitations: limitationsFor(EPB_ATTACHMENT.UNIQUE_ATTACH),
      retrievedAt,
    });
    certificates.push(saved);
  }
  if (current?.certificateNumber && property.id) {
    await store.markCurrent(property.id, current.certificateNumber);
  }
  if ((match.uprn || current?.facts?.uprn) && property.id && persistUprnFn) {
    try {
      await persistUprnFn(property, {
        uprn: match.uprn || current.facts.uprn,
        certificateNumber: current?.certificateNumber,
        retrievedAt,
        uprnSource: current?.facts?.uprnSource || null,
      }, null);
    } catch {
      // Identity persist is best-effort; certificate evidence still stands.
    }
  }
  return certificates;
}

async function acquireOfficialEpbEvidence({
  property = {},
  identity = null,
  deps = {},
  skipCache = false,
} = {}) {
  const config = deps.config || epbConfig();
  skipCache = skipCache || deps.skipCache === true;
  const capability = getEpbCapability(config);
  const listing = {
    ...(identity || extractCanonicalAddress(property)),
    propertyType: property.property_type || property.propertyType,
    propertyCategory: property.property_category || property.propertyCategory,
    addressLine1: property.address_line1,
    houseNumber: property.house_number,
    title: property.title,
  };
  const postcode = listingPostcode(property, listing);
  const geo = epbGeographyStatus(postcode);
  const retrievedAt = (deps.now || (() => new Date().toISOString()))();
  const nowMs = new Date(retrievedAt).getTime();

  if (!geo.inside) {
    const outside = geo.status === EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED
      ? EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED
      : EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY;
    logEpb(outside === EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED
      ? 'geography_not_established'
      : 'source_outside_geography', { propertyId: property.id || 'n/a' });
    const result = emptyResult(outside, {
      capability: outside === EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED
        ? EPB_CAPABILITY.GEOGRAPHY_NOT_ESTABLISHED
        : EPB_CAPABILITY.SOURCE_OUTSIDE_GEOGRAPHY,
      reason: outside,
      sourceGeography: geo.sourceGeography,
      limitations: limitationsFor(outside, [geo.note]),
      retrievedAt,
    });
    result.client = toClientSnapshot(result);
    return result;
  }

  if (!capability.available) {
    logEpb('missing_credential', { propertyId: property.id || 'n/a' });
    const result = emptyResult(EPB_ATTACHMENT.UNAVAILABLE_MISSING_CREDENTIAL, {
      capability: EPB_CAPABILITY.UNAVAILABLE_MISSING_CREDENTIAL,
      errorCode: EPB_ERROR.MISSING_CREDENTIAL,
      reason: 'UNAVAILABLE_MISSING_CREDENTIAL',
      limitations: limitationsFor(EPB_ATTACHMENT.UNAVAILABLE_MISSING_CREDENTIAL, [
        'Official EPB was not assessed because the MHCLG bearer token is not configured.',
      ]),
      retrievedAt,
    });
    result.client = toClientSnapshot(result);
    return result;
  }

  if (listingAppearsUnitSpecific(listing) && !listing.saon) {
    logEpb('unresolved_unit_identity', { propertyId: property.id || 'n/a' });
    const result = emptyResult(EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY, {
      reason: 'MISSING_SAON',
      searchAttempted: false,
      limitations: limitationsFor(EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY, [
        'The listing appears unit-specific but canonical SAON/unit identity is missing. A building-level certificate was not attached.',
      ]),
      retrievedAt,
    });
    result.client = toClientSnapshot(result);
    return result;
  }

  if (!listing.paon) {
    const result = emptyResult(EPB_ATTACHMENT.UNRESOLVED_IDENTITY, {
      reason: 'POSTCODE_ONLY',
      searchAttempted: false,
      limitations: limitationsFor(EPB_ATTACHMENT.UNRESOLVED_IDENTITY, [
        'Postcode-only matching is not sufficient to attach an EPC to a subject.',
      ]),
      retrievedAt,
    });
    result.client = toClientSnapshot(result);
    return result;
  }

  const store = deps.store || await defaultStore();
  const coalesceKey = String(property.id || `${listing.postcodeCompact}:${listing.paon}:${listing.saon || ''}`);
  if (!deps.skipCoalesce && inFlight.has(coalesceKey)) {
    return inFlight.get(coalesceKey);
  }

  const work = (async () => {
    if (!skipCache && property.id) {
      try {
        const existing = await store.listByProperty(property.id);
        const currentRow = existing.find((row) => row.is_current || row.isCurrent)
          || latestCertificate(existing.map((row) => ({
            ...row,
            certificateNumber: row.certificate_number,
            lodgementDate: row.lodgement_date,
            inspectionDate: row.inspection_date,
            facts: parseFacts(row),
            certificateType: row.certificate_type,
          })));
        if (existing.length && currentRow && isFresh(currentRow, nowMs, refreshTtlMs(config))) {
          logEpb('cache_hit', { propertyId: property.id, certificates: existing.length });
          const current = {
            certificateNumber: currentRow.certificate_number || currentRow.certificateNumber,
            certificateType: currentRow.certificate_type || currentRow.certificateType,
            facts: parseFacts(currentRow),
            inspectionDate: currentRow.inspection_date || currentRow.inspectionDate,
            lodgementDate: currentRow.lodgement_date || currentRow.lodgementDate,
          };
          const result = emptyResult(EPB_ATTACHMENT.UNIQUE_ATTACH, {
            attachmentStatus: EPB_ATTACHMENT.REUSED,
            cacheHit: true,
            certificates: existing,
            currentCertificate: current,
            uprn: current.facts.uprn || currentRow.uprn || listing.uprn || null,
            retrievedAt: currentRow.retrieved_at || currentRow.retrievedAt || retrievedAt,
            limitations: limitationsFor(EPB_ATTACHMENT.REUSED),
          });
          result.client = toClientSnapshot(result);
          await store.recordRun({
            propertyId: property.id,
            status: EPB_CAPABILITY.AVAILABLE,
            attachmentStatus: EPB_ATTACHMENT.REUSED,
            searchAttempted: false,
            cacheHit: true,
            uniqueAttach: true,
            retrievedAt,
        payload: { certificateNumber: current.certificateNumber, reason: result.reason || null },
          });
          return result;
        }
      } catch {
        // Reuse is best-effort; continue to live search.
      }
    }

    const client = deps.client || createMhclgEpbClient(config, deps);
    logEpb('search_attempted', {
      propertyId: property.id || 'n/a',
      types: 'DOMESTIC,NON_DOMESTIC',
    });

    const [domestic, nonDomestic] = await Promise.all([
      searchPaged(client, CERTIFICATE_TYPE.DOMESTIC, postcode, config),
      searchPaged(client, CERTIFICATE_TYPE.NON_DOMESTIC, postcode, config),
    ]);

    if (!domestic.ok && !nonDomestic.ok) {
      const errorCode = domestic.errorCode || nonDomestic.errorCode || EPB_ERROR.UNEXPECTED;
      logEpb('source_error', { propertyId: property.id || 'n/a', errorCode });
      const result = emptyResult(EPB_ATTACHMENT.SOURCE_ERROR, {
        capability: EPB_CAPABILITY.SOURCE_ERROR,
        searchAttempted: true,
        errorCode,
        reason: 'SOURCE_ERROR',
        limitations: limitationsFor(EPB_ATTACHMENT.SOURCE_ERROR, [
          'The official EPB source was unavailable. Provider failure is not negative energy evidence.',
        ]),
        retrievedAt,
      });
      result.client = toClientSnapshot(result);
      await store.recordRun({
        propertyId: property.id,
        status: EPB_CAPABILITY.SOURCE_ERROR,
        attachmentStatus: EPB_ATTACHMENT.SOURCE_ERROR,
        searchAttempted: true,
        errorCode,
        retrievedAt,
        payload: {},
      });
      return result;
    }

    const candidates = [
      ...(domestic.ok ? domestic.rows : []),
      ...(nonDomestic.ok ? nonDomestic.rows : []),
    ];
    const match = evaluateEpbCandidates(listing, candidates);
    if (match.status !== EPB_ATTACHMENT.UNIQUE_ATTACH) {
      logEpb(match.status === EPB_ATTACHMENT.NO_MATCH_FOUND ? 'no_match' : 'ambiguous', {
        propertyId: property.id || 'n/a',
        reason: match.reason,
        candidates: match.candidateCount,
      });
      const truncated = Number(domestic.pagination?.totalRecords) > (domestic.rows || []).length
        || Number(nonDomestic.pagination?.totalRecords) > (nonDomestic.rows || []).length;
      const result = emptyResult(match.status, {
        searchAttempted: true,
        reason: match.reason,
        limitations: limitationsFor(match.status, [
          match.status === EPB_ATTACHMENT.NO_MATCH_FOUND
            ? 'No exact subject match was found. That is not evidence the property has no EPC.'
            : 'Subject identity could not be uniquely attached. The wrong unit was not selected.',
          truncated ? 'Candidate retrieval was bounded; excess postcode results were not crawled.' : null,
        ].filter(Boolean)),
        retrievedAt,
      });
      result.client = toClientSnapshot(result);
      await store.recordRun({
        propertyId: property.id,
        status: EPB_CAPABILITY.AVAILABLE,
        attachmentStatus: match.status,
        searchAttempted: true,
        candidateCount: match.candidateCount,
        uniqueAttach: false,
        retrievedAt,
        payload: { reason: match.reason },
      });
      return result;
    }

    const currentSummary = latestCertificate(match.matches.map((row) => ({
      ...row,
      lodgementDate: row.registrationDate || row.lodgementDate,
    })));
    let current = {
      certificateNumber: currentSummary.certificateNumber,
      certificateType: currentSummary.certificateType,
      facts: {
        currentEnergyRating: currentSummary.currentEnergyRating || null,
        lodgementDate: currentSummary.registrationDate || null,
        inspectionDate: currentSummary.inspectionDate || null,
        uprn: currentSummary.uprn || match.uprn || null,
        uprnSource: currentSummary.uprnSource || null,
        schemaType: currentSummary.schemaType || null,
      },
      inspectionDate: currentSummary.inspectionDate || null,
      lodgementDate: currentSummary.registrationDate || null,
    };

    if (current.certificateNumber && deps.skipCertificateFetch !== true) {
      const fetched = await client.fetchCertificate(current.certificateNumber);
      if (fetched.ok && !fetched.empty) {
        const parsed = parseCertificate(
          fetched.data,
          current.certificateType,
          fetched.requestedCertificateNumber || current.certificateNumber
        );
        if (parsed) {
          current = {
            ...current,
            certificateNumber: parsed.certificateNumber || current.certificateNumber,
            facts: {
              ...current.facts,
              ...parsed.facts,
            },
            inspectionDate: parsed.facts.inspectionDate || current.inspectionDate,
            lodgementDate: parsed.facts.lodgementDate || current.lodgementDate,
          };
        }
      }
    }

    const hydratedMatches = match.matches.map((row) => {
      if (normalizeCertificateNumber(row.certificateNumber)
        === normalizeCertificateNumber(current.certificateNumber)) {
        return { ...row, facts: current.facts };
      }
      return row;
    });
    const persistUprnFn = deps.persistOfficialEpbUprn || persistOfficialEpbUprn;
    const certificates = property.id
      ? await persistMatches({
        store,
        property,
        identity: listing,
        match: { ...match, matches: hydratedMatches },
        current,
        retrievedAt,
        persistUprnFn,
      })
      : hydratedMatches;

    logEpb('unique_attach', {
      propertyId: property.id || 'n/a',
      certificates: hydratedMatches.length,
      uprn: current.facts.uprn ? 'yes' : 'no',
    });

    const existingNumbers = new Set();
    try {
      const before = await store.listByProperty(property.id);
      before.forEach((row) => existingNumbers.add(row.certificate_number));
    } catch {
      // ignore
    }
    const certificateRefresh = Boolean(
      current.certificateNumber && existingNumbers.size && !existingNumbers.has(current.certificateNumber)
    );
    if (certificateRefresh) logEpb('certificate_refresh', { propertyId: property.id || 'n/a' });

    const result = emptyResult(EPB_ATTACHMENT.UNIQUE_ATTACH, {
      searchAttempted: true,
      certificates,
      currentCertificate: current,
      uprn: current.facts.uprn || match.uprn || null,
      retrievedAt,
      limitations: limitationsFor(EPB_ATTACHMENT.UNIQUE_ATTACH),
    });
    result.client = toClientSnapshot(result);
    await store.recordRun({
      propertyId: property.id,
      status: EPB_CAPABILITY.AVAILABLE,
      attachmentStatus: EPB_ATTACHMENT.UNIQUE_ATTACH,
      searchAttempted: true,
      candidateCount: match.candidateCount,
      uniqueAttach: true,
      certificateRefresh,
      retrievedAt,
      payload: { certificateNumber: current.certificateNumber, uprnPersisted: Boolean(match.uprn) },
    });
    return result;
  })();

  if (!deps.skipCoalesce) inFlight.set(coalesceKey, work);
  try {
    return await work;
  } finally {
    inFlight.delete(coalesceKey);
  }
}

module.exports = {
  getEpbCapability,
  acquireOfficialEpbEvidence,
  toClientSnapshot,
  refreshTtlMs,
  emptyResult,
  searchPaged,
};
