/**
 * Environment domain adapter — flood evidence only (v1).
 * Wraps existing Environment Agency Flood Map for Planning evidence.
 * Does not query EA, score risk, adjust valuation, or infer insurance.
 */

const {
  createDomainEnvelope,
  createEvidence,
  createDecisionContribution,
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  SPATIAL_RELATION,
  ENVIRONMENT_DOMAIN_VERSION,
  ASSET_CLASS,
} = require('../../architecture');
const {
  sanitizeFloodFact,
  unattachedFloodFact,
  UNAVAILABLE_REASONS,
  LIMITATIONS,
} = require('../ai/floodEvidence');
const { subjectRefFromIdentity } = require('./subjectRef');

const FORBIDDEN_CONCLUSION = /no flood risk|will flood|will not flood|insurance|premium|mortgageable|climate risk|valuation impact|legal liability|do not buy|safe rating|flood zone 1/i;

const ENVELOPE_LIMITATIONS = Object.freeze([
  ...LIMITATIONS,
  'Flood mapping can change after this analysis.',
  'A mapped zone is not a guarantee of a future flood event.',
  'No insurance availability or premium is assessed.',
  'No structural or building-condition assessment is made.',
  'This is not legal advice.',
]);

function mapFloodReason(reason) {
  if (reason === UNAVAILABLE_REASONS.noApplicableEvidence) {
    return {
      status: DOMAIN_STATUS.PARTIAL,
      assessment: KERNEL_ASSESSMENT.ASSESSED,
      configuredCheckCompleted: true,
      noIntersectionIsNotNoFloodRisk: true,
    };
  }
  if (reason === UNAVAILABLE_REASONS.unsupportedGeography) {
    return { status: DOMAIN_STATUS.NOT_ASSESSED, assessment: KERNEL_ASSESSMENT.NOT_APPLICABLE };
  }
  if (reason === UNAVAILABLE_REASONS.providerUnavailable || reason === UNAVAILABLE_REASONS.malformed) {
    return { status: DOMAIN_STATUS.UNAVAILABLE, assessment: KERNEL_ASSESSMENT.UNAVAILABLE };
  }
  if (reason === UNAVAILABLE_REASONS.locationUnavailable) {
    return { status: DOMAIN_STATUS.NOT_ASSESSED, assessment: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE };
  }
  return { status: DOMAIN_STATUS.NOT_ASSESSED, assessment: KERNEL_ASSESSMENT.NOT_ASSESSED };
}

function buildFindings(fact, mapped) {
  const findings = [];
  if (fact.available === true && fact.value) {
    findings.push({
      id: 'configured_flood_assessment_completed',
      text: 'Configured flood evidence assessment completed against Flood Map for Planning (rivers and sea).',
    });
    findings.push({
      id: 'subject_intersects_sourced_flood_zone',
      text: `Subject coordinates intersect sourced ${fact.value} geometry.`,
    });
  } else if (fact.unavailableReason === UNAVAILABLE_REASONS.noApplicableEvidence) {
    findings.push({
      id: 'configured_flood_assessment_completed',
      text: 'Configured flood evidence assessment completed against Flood Map for Planning (rivers and sea).',
    });
    findings.push({
      id: 'no_intersection_in_configured_dataset',
      text: 'No Zone 2 or Zone 3 intersection was identified in the configured dataset. That is not “no flood risk”.',
    });
  } else if (mapped.assessment === KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE) {
    findings.push({
      id: 'coordinates_required',
      text: 'Flood assessment is unavailable because property coordinates were missing.',
    });
  } else if (mapped.status === DOMAIN_STATUS.UNAVAILABLE) {
    findings.push({
      id: 'flood_source_unavailable',
      text: 'The Flood Map for Planning source was unavailable or could not be parsed.',
    });
  }
  findings.forEach((row) => {
    if (FORBIDDEN_CONCLUSION.test(row.text) && row.id !== 'no_intersection_in_configured_dataset') {
      throw new Error('ENVIRONMENT_DOMAIN_FORBIDDEN_CONCLUSION');
    }
  });
  return findings;
}

function buildUnresolved(fact, mapped) {
  const items = [];
  if (fact.unavailableReason === UNAVAILABLE_REASONS.locationUnavailable) {
    items.push({
      id: 'coordinates_required',
      text: 'Coordinates are required to query Flood Map for Planning.',
    });
  }
  if (mapped.status === DOMAIN_STATUS.UNAVAILABLE) {
    items.push({
      id: 'flood_source_unavailable',
      text: 'Flood Map for Planning source was unavailable.',
    });
  }
  return items;
}

function buildPriorities(fact) {
  if (fact.available === true && fact.value) {
    return [{
      id: 'review_sourced_flood_zone',
      text: 'Review the sourced flood-zone record against the official Flood Map for Planning.',
    }];
  }
  return [];
}

function floodZoneEvidence(fact, subjectRef) {
  return createEvidence({
    domain: DOMAIN_ID.ENVIRONMENT,
    subjectRef,
    factType: 'floodZone',
    classification: EVIDENCE_CLASS.FACT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    provenance: {
      source: fact.source || 'EnvironmentAgency_FloodMapForPlanning',
      method: fact.method || 'flood_map_for_planning_point_query',
      providerEndpoint: fact.provenance?.providerEndpoint || '/Flood_Map_for_Planning/FeatureServer',
    },
    value: fact.value,
    sourceRecordId: fact.layersMatched && fact.layersMatched[0] ? String(fact.layersMatched[0]) : fact.value,
    retrievedAt: fact.retrievedAt || null,
    evidenceAsOf: fact.evidenceAsOf || fact.retrievedAt || null,
    spatialRelation: SPATIAL_RELATION.INTERSECTS,
    trust: 'observed',
    assessmentState: 'assessed',
    sharedPropertyEvidence: true,
    authoritative: false,
    limitations: [
      'Point-in-polygon against Flood Map for Planning rivers-and-sea layers at the subject coordinates.',
      'Not a prediction that the property will flood.',
    ],
  });
}

function adaptEnvironmentDomain({
  floodEvidence,
  identity = {},
  assetClassification = null,
  analysisAt = null,
} = {}) {
  const fact = sanitizeFloodFact(floodEvidence || unattachedFloodFact());
  const subjectRef = subjectRefFromIdentity(identity);
  const mapped = fact.available === true
    ? { status: DOMAIN_STATUS.AVAILABLE, assessment: KERNEL_ASSESSMENT.ASSESSED }
    : mapFloodReason(fact.unavailableReason);

  const evidence = [];
  if (fact.available === true && fact.value) {
    evidence.push(floodZoneEvidence(fact, subjectRef));
  }

  const findings = buildFindings(fact, mapped);
  const unresolvedDependencies = buildUnresolved(fact, mapped);
  const investigationPriorities = buildPriorities(fact);

  const envelope = createDomainEnvelope({
    domain: DOMAIN_ID.ENVIRONMENT,
    version: ENVIRONMENT_DOMAIN_VERSION,
    subject: {
      ref: subjectRef,
      assetClass: assetClassification?.assetClass || ASSET_CLASS.UNKNOWN,
    },
    status: mapped.status,
    evidenceAsOf: fact.evidenceAsOf || analysisAt || null,
    analysisAt: analysisAt || fact.retrievedAt || null,
    assessment: {
      state: mapped.assessment,
      scope: 'flood_map_for_planning_rivers_and_sea',
      noIntersectionIsNotNoFloodRisk: Boolean(mapped.noIntersectionIsNotNoFloodRisk)
        || fact.unavailableReason === UNAVAILABLE_REASONS.noApplicableEvidence,
      configuredCheckOnly: true,
      surfaceWaterAssessed: false,
      reservoirFloodingAssessed: false,
      climateProjectionAssessed: false,
      insuranceAssessed: false,
      sourcedZone: fact.available ? fact.value : null,
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
      adapter: 'environment-domain-1.0.0',
      wrapsExistingEvidence: true,
      noAdditionalProviderCall: true,
      subdomain: 'flood',
    },
  });

  const contribution = createDecisionContribution({
    domain: DOMAIN_ID.ENVIRONMENT,
    domainVersion: ENVIRONMENT_DOMAIN_VERSION,
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

function attachEnvironmentDomain(args) {
  try {
    const adapted = adaptEnvironmentDomain(args);
    return {
      environmentDomain: adapted.envelope,
      environmentContribution: adapted.contribution,
    };
  } catch {
    return {
      environmentDomain: createDomainEnvelope({
        domain: DOMAIN_ID.ENVIRONMENT,
        version: ENVIRONMENT_DOMAIN_VERSION,
        status: DOMAIN_STATUS.NOT_ASSESSED,
        assessment: { state: KERNEL_ASSESSMENT.NOT_ASSESSED },
        limitations: ENVELOPE_LIMITATIONS,
        findings: [{
          id: 'adapter_degraded',
          text: 'Environment domain could not be assembled from the attached flood evidence.',
        }],
      }),
      environmentContribution: null,
    };
  }
}

module.exports = {
  ENVIRONMENT_DOMAIN_VERSION,
  adaptEnvironmentDomain,
  attachEnvironmentDomain,
  ENVELOPE_LIMITATIONS,
};
