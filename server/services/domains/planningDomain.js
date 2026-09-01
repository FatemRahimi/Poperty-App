/**
 * Planning domain adapter.
 * Wraps existing MHCLG planning-application evidence into the kernel envelope.
 * Does not query providers, score, predict permission, or change other domains.
 */

const {
  createDomainEnvelope,
  composeDomainOutputs,
  createEvidence,
  createDecisionContribution,
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  SPATIAL_RELATION,
  PLANNING_DOMAIN_VERSION,
  ASSET_CLASS,
} = require('../../architecture');
const { subjectRefFromIdentity } = require('./subjectRef');
const {
  sanitizePlanningFact,
  unattachedPlanningFact,
  UNAVAILABLE_REASONS,
  LIMITATIONS,
} = require('../ai/planningEvidence');
const { DEFAULT_SEARCH_RADIUS_M } = require('../providers/planningData/planningApplicationClient');

const FORBIDDEN_CONCLUSION = /development potential|likely approval|planning risk|neighbourhood will improve|extension likely|permitted development rights|lawful use|expected uplift/i;

const ENVELOPE_LIMITATIONS = Object.freeze([
  ...LIMITATIONS,
  `${DEFAULT_SEARCH_RADIUS_M}m is an existing area-context search radius, not a legal or planning boundary.`,
  'Planning status can change after this analysis.',
  'This is not planning or legal advice.',
]);

function spatialForApplication(app) {
  if (app?.scope === 'property' || app?.matchMethod === 'uprn' || app?.matchMethod === 'same_site_coordinates') {
    return app?.matchMethod === 'same_site_coordinates' ? SPATIAL_RELATION.SAME_SITE : SPATIAL_RELATION.SUBJECT;
  }
  return SPATIAL_RELATION.NEARBY;
}

function mapReasonToAssessment(reason) {
  if (reason === UNAVAILABLE_REASONS.unsupportedGeography) {
    return { status: DOMAIN_STATUS.NOT_ASSESSED, assessment: KERNEL_ASSESSMENT.NOT_APPLICABLE };
  }
  if (reason === UNAVAILABLE_REASONS.providerUnavailable || reason === UNAVAILABLE_REASONS.malformed) {
    return { status: DOMAIN_STATUS.UNAVAILABLE, assessment: KERNEL_ASSESSMENT.UNAVAILABLE };
  }
  if (reason === UNAVAILABLE_REASONS.locationUnavailable) {
    return { status: DOMAIN_STATUS.NOT_ASSESSED, assessment: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE };
  }
  if (
    reason === UNAVAILABLE_REASONS.providerDisabled
    || reason === UNAVAILABLE_REASONS.notAttached
  ) {
    return { status: DOMAIN_STATUS.NOT_ASSESSED, assessment: KERNEL_ASSESSMENT.NOT_ASSESSED };
  }
  return { status: DOMAIN_STATUS.NOT_ASSESSED, assessment: KERNEL_ASSESSMENT.NOT_ASSESSED };
}

function applicationEvidence(app, { subjectRef, fact, spatialRelation }) {
  const isSubject = spatialRelation === SPATIAL_RELATION.SUBJECT || spatialRelation === SPATIAL_RELATION.SAME_SITE;
  return createEvidence({
    domain: DOMAIN_ID.PLANNING,
    subjectRef,
    factType: 'planningApplication',
    classification: isSubject ? EVIDENCE_CLASS.FACT : EVIDENCE_CLASS.AREA_CONTEXT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    provenance: {
      source: fact.source || 'MHCLG_PlanningData',
      method: fact.method || 'planning_application_geometry_buffer',
      providerEndpoint: fact.provenance?.providerEndpoint || '/entity.json?dataset=planning-application',
    },
    value: app.reference || app.description || null,
    sourceRecordId: app.entityId != null ? String(app.entityId) : app.reference || null,
    retrievedAt: fact.retrievedAt || null,
    evidenceAsOf: fact.evidenceAsOf || fact.retrievedAt || null,
    observedAt: app.decisionDate || app.submittedDate || null,
    spatialRelation,
    trust: isSubject ? 'observed' : 'areaContext',
    assessmentState: 'assessed',
    sharedPropertyEvidence: true,
    authoritative: false,
    limitations: isSubject
      ? ['Sourced application record. Status can change and is not planning permission prediction.']
      : ['Nearby application is area context, not an application on this property.'],
  });
}

function buildFindings(fact, mapped) {
  const findings = [];
  const subjectCount = fact.summary?.subjectCount ?? (fact.subjectApplications || []).length;
  const nearbyCount = fact.summary?.nearbyCount ?? (fact.nearbyApplications || []).length;

  if (mapped.assessment === KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE
    && fact.unavailableReason === UNAVAILABLE_REASONS.locationUnavailable) {
    findings.push({
      id: 'coordinates_required',
      text: 'Planning assessment is unavailable because coordinates and UPRN were missing.',
    });
  }
  if (mapped.status === DOMAIN_STATUS.UNAVAILABLE) {
    findings.push({
      id: 'planning_source_unavailable',
      text: 'The planning-application source was unavailable or could not be parsed.',
    });
  }
  if (fact.available === true && subjectCount > 0) {
    findings.push({
      id: 'subject_application_evidence',
      text: 'Subject planning-application evidence exists in the source response.',
    });
  }
  if (fact.available === true && nearbyCount > 0) {
    findings.push({
      id: 'nearby_application_evidence',
      text: `Nearby planning-application evidence exists within the configured ${fact.searchRadiusMetres || DEFAULT_SEARCH_RADIUS_M}m context radius.`,
    });
  }
  if (fact.available === true && subjectCount === 0 && nearbyCount === 0) {
    findings.push({
      id: 'source_returned_no_applications',
      text: 'This source returned no planning applications for the search. That is not evidence that there is no planning activity.',
    });
  }
  findings.forEach((row) => {
    if (FORBIDDEN_CONCLUSION.test(row.text)) {
      throw new Error('PLANNING_DOMAIN_FORBIDDEN_CONCLUSION');
    }
  });
  return findings;
}

function buildUnresolved(fact, mapped) {
  const items = [];
  if (fact.unavailableReason === UNAVAILABLE_REASONS.locationUnavailable) {
    items.push({
      id: 'coordinates_required',
      text: 'Coordinates or UPRN are required to query planning applications.',
    });
  }
  if (mapped.status === DOMAIN_STATUS.UNAVAILABLE) {
    items.push({
      id: 'planning_source_unavailable',
      text: 'Planning-application source was unavailable.',
    });
  }
  return items;
}

function buildPriorities(fact) {
  const subject = Array.isArray(fact.subjectApplications) ? fact.subjectApplications : [];
  if (!subject.length) return [];
  const priorities = [{
    id: 'verify_subject_application',
    text: 'Verify the identified subject planning application against the source record.',
  }];
  if (subject.some((row) => row.documentationUrl)) {
    priorities.push({
      id: 'review_source_documents',
      text: 'Review source application documents where a record exists.',
    });
  }
  return priorities;
}

function adaptPlanningDomain({
  planningEvidence,
  identity = {},
  assetClassification = null,
  analysisAt = null,
} = {}) {
  const fact = sanitizePlanningFact(planningEvidence || unattachedPlanningFact());
  const subjectRef = subjectRefFromIdentity(identity);
  const emptySuccess = fact.available === true
    && !(fact.subjectApplications || []).length
    && !(fact.nearbyApplications || []).length;

  let mapped;
  if (fact.available === true) {
    mapped = {
      status: emptySuccess || (fact.summary?.nearbyCount > 0 && !(fact.summary?.subjectCount > 0))
        ? DOMAIN_STATUS.PARTIAL
        : DOMAIN_STATUS.AVAILABLE,
      assessment: KERNEL_ASSESSMENT.ASSESSED,
    };
    if (fact.summary?.resultsCapped) mapped.status = DOMAIN_STATUS.PARTIAL;
  } else {
    mapped = mapReasonToAssessment(fact.unavailableReason);
  }

  const evidence = [];
  (fact.subjectApplications || []).forEach((app) => {
    evidence.push(applicationEvidence(app, {
      subjectRef,
      fact,
      spatialRelation: spatialForApplication({ ...app, scope: 'property' }),
    }));
  });
  (fact.nearbyApplications || []).forEach((app) => {
    evidence.push(applicationEvidence(app, {
      subjectRef,
      fact,
      spatialRelation: SPATIAL_RELATION.NEARBY,
    }));
  });

  const findings = buildFindings(fact, mapped);
  const unresolvedDependencies = buildUnresolved(fact, mapped);
  const investigationPriorities = buildPriorities(fact);

  const envelope = createDomainEnvelope({
    domain: DOMAIN_ID.PLANNING,
    version: PLANNING_DOMAIN_VERSION,
    subject: {
      ref: subjectRef,
      assetClass: assetClassification?.assetClass || ASSET_CLASS.UNKNOWN,
    },
    status: mapped.status,
    evidenceAsOf: fact.evidenceAsOf || analysisAt || null,
    analysisAt: analysisAt || fact.retrievedAt || null,
    assessment: {
      state: mapped.assessment,
      emptyResultIsNotAbsence: emptySuccess || fact.unavailableReason === UNAVAILABLE_REASONS.noApplicationsReturned,
      searchRadiusMetres: fact.searchRadiusMetres || DEFAULT_SEARCH_RADIUS_M,
      searchRadiusIsNotLegalBoundary: true,
      subjectCount: fact.summary?.subjectCount ?? (fact.subjectApplications || []).length,
      nearbyCount: fact.summary?.nearbyCount ?? (fact.nearbyApplications || []).length,
    },
    findings,
    evidence,
    limitations: ENVELOPE_LIMITATIONS,
    unresolvedDependencies,
    investigationPriorities,
    provenance: {
      source: fact.source || fact.provider || null,
      sourceType: SOURCE_TYPE.OFFICIAL,
      method: fact.method || null,
      retrievedAt: fact.retrievedAt || null,
      evidenceAsOf: fact.evidenceAsOf || null,
      adapter: 'planning-domain-1.0.0',
      wrapsExistingEvidence: true,
      noAdditionalProviderCall: true,
    },
  });

  const contribution = createDecisionContribution({
    domain: DOMAIN_ID.PLANNING,
    domainVersion: PLANNING_DOMAIN_VERSION,
    materialFindings: findings.map((row) => row.text),
    unresolvedDependencies: unresolvedDependencies.map((row) => row.text),
    investigationPriorities: investigationPriorities.map((row) => row.text),
    sensitivityDrivers: [],
    limitations: ENVELOPE_LIMITATIONS,
  });

  return {
    envelope,
    contribution,
    legacyFact: fact,
    assetClassUnchanged: assetClassification?.assetClass || ASSET_CLASS.UNKNOWN,
  };
}

function attachPlanningDomain(args) {
  try {
    const adapted = adaptPlanningDomain(args);
    return {
      planningDomain: adapted.envelope,
      planningContribution: adapted.contribution,
      domains: composeDomainOutputs([adapted.envelope]),
    };
  } catch {
    return {
      planningDomain: createDomainEnvelope({
        domain: DOMAIN_ID.PLANNING,
        version: PLANNING_DOMAIN_VERSION,
        status: DOMAIN_STATUS.NOT_ASSESSED,
        assessment: { state: KERNEL_ASSESSMENT.NOT_ASSESSED },
        limitations: ENVELOPE_LIMITATIONS,
        findings: [{ id: 'adapter_degraded', text: 'Planning domain could not be assembled from the attached evidence.' }],
      }),
      planningContribution: null,
      domains: null,
    };
  }
}

module.exports = {
  PLANNING_DOMAIN_VERSION,
  adaptPlanningDomain,
  attachPlanningDomain,
  subjectRefFromIdentity,
  ENVELOPE_LIMITATIONS,
};
