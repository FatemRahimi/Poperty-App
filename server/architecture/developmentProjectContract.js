/**
 * Development project / scenario / work-scope / dependency contracts.
 * Foundation only. Does not cost, schedule, grant permission, or assess viability.
 */

const {
  IDENTITY_KIND,
  createSubjectRef,
  createIdentityRelation,
} = require('./identityModel');
const { EVIDENCE_CLASS, SOURCE_TYPE, VISIBILITY } = require('./evidenceContract');
const { KERNEL_ASSESSMENT } = require('./assessmentStates');
const { assertEvidenceVisibility, markPrivate } = require('./privacyBoundary');
const { DEVELOPMENT_PROJECT_CONTRACT_VERSION } = require('./versions');

const PROJECT_TYPE = Object.freeze({
  REFURBISHMENT: 'REFURBISHMENT',
  RENOVATION: 'RENOVATION',
  EXTENSION: 'EXTENSION',
  CONVERSION: 'CONVERSION',
  NEW_BUILD: 'NEW_BUILD',
  REDEVELOPMENT: 'REDEVELOPMENT',
  CHANGE_OF_USE: 'CHANGE_OF_USE',
  REPAIR: 'REPAIR',
  IMPROVEMENT: 'IMPROVEMENT',
  DEMOLITION: 'DEMOLITION',
  MIXED_WORKS: 'MIXED_WORKS',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
});

const PROJECT_SUBJECT_ROLE = Object.freeze({
  PRIMARY_SUBJECT: 'PRIMARY_SUBJECT',
  AFFECTED_SUBJECT: 'AFFECTED_SUBJECT',
  EXISTING_ASSET: 'EXISTING_ASSET',
  PROPOSED_ASSET: 'PROPOSED_ASSET',
  CONTEXT_ONLY: 'CONTEXT_ONLY',
});

const PROJECT_STATE_LAYER = Object.freeze({
  EXISTING: 'EXISTING',
  PROPOSED: 'PROPOSED',
  ASSUMED: 'ASSUMED',
  UNKNOWN: 'UNKNOWN',
});

const WORK_SCOPE_TYPE = Object.freeze({
  DEMOLITION: 'DEMOLITION',
  NEW_CONSTRUCTION: 'NEW_CONSTRUCTION',
  STRUCTURAL_WORK: 'STRUCTURAL_WORK',
  ENVELOPE_WORK: 'ENVELOPE_WORK',
  INTERNAL_WORK: 'INTERNAL_WORK',
  MEP_WORK: 'MEP_WORK',
  REPAIR: 'REPAIR',
  REFURBISHMENT: 'REFURBISHMENT',
  EXTENSION: 'EXTENSION',
  CONVERSION: 'CONVERSION',
  CHANGE_OF_USE: 'CHANGE_OF_USE',
  EXTERNAL_WORK: 'EXTERNAL_WORK',
  SITE_WORK: 'SITE_WORK',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
});

const PROJECT_LIFECYCLE = Object.freeze({
  DRAFT: 'DRAFT',
  DEFINED: 'DEFINED',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
});

const PROJECT_STATEMENT_KIND = Object.freeze({
  FACT: 'FACT',
  USER_INTENT: 'USER_INTENT',
  USER_INPUT: 'USER_INPUT',
  ASSUMPTION: 'ASSUMPTION',
  SCENARIO: 'SCENARIO',
  INFERENCE: 'INFERENCE',
  DERIVED: 'DERIVED',
});

const PROJECT_DEPENDENCY_STATE = Object.freeze({
  KNOWN: 'KNOWN',
  UNRESOLVED: 'UNRESOLVED',
  NOT_ASSESSED: 'NOT_ASSESSED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNAVAILABLE: 'UNAVAILABLE',
});

const ALLOWED_PROJECT_SUBJECT_KINDS = Object.freeze([
  IDENTITY_KIND.PROPERTY,
  IDENTITY_KIND.SITE,
  IDENTITY_KIND.LAND_PARCEL,
  IDENTITY_KIND.BUILDING,
  IDENTITY_KIND.UNIT,
  IDENTITY_KIND.DEVELOPMENT_SITE,
  IDENTITY_KIND.LISTING,
  IDENTITY_KIND.SUBJECT,
]);

function assertDistinctIdentities(projectId, extra = {}) {
  if (extra.asPropertyId) throw new Error('PROJECT_IS_NOT_PROPERTY');
  if (extra.asSiteId) throw new Error('PROJECT_IS_NOT_SITE');
  if (extra.asScenarioId) throw new Error('PROJECT_IS_NOT_SCENARIO');
  if (extra.asWorkScopeId) throw new Error('PROJECT_IS_NOT_WORK_SCOPE');
  if (extra.whatIfId && String(extra.whatIfId) === String(projectId)) {
    throw new Error('WHAT_IF_IS_NOT_DEVELOPMENT_PROJECT');
  }
}

function createProjectSubjectLink({
  subjectRef,
  role = PROJECT_SUBJECT_ROLE.PRIMARY_SUBJECT,
} = {}) {
  if (!subjectRef || !subjectRef.kind || !subjectRef.id) {
    throw new Error('Project subject requires subjectRef');
  }
  if (!ALLOWED_PROJECT_SUBJECT_KINDS.includes(subjectRef.kind)) {
    throw new Error('UNSUPPORTED_PROJECT_SUBJECT_KIND');
  }
  if (subjectRef.kind === IDENTITY_KIND.DEVELOPMENT_PROJECT
    || subjectRef.kind === IDENTITY_KIND.DEVELOPMENT_SCENARIO) {
    throw new Error('PROJECT_CANNOT_BE_ITS_OWN_SUBJECT');
  }
  return {
    subjectRef,
    role: PROJECT_SUBJECT_ROLE[role] || PROJECT_SUBJECT_ROLE.CONTEXT_ONLY,
    cadastralMatchClaimed: false,
    legalRelationshipClaimed: false,
    ownershipImplied: false,
    planningPermissionImplied: false,
  };
}

function createExistingProposedPair({
  factType,
  existingValue = null,
  proposedValue = null,
  existingKind = PROJECT_STATEMENT_KIND.FACT,
  proposedKind = PROJECT_STATEMENT_KIND.USER_INTENT,
} = {}) {
  if (!factType) throw new Error('Existing/proposed pair requires factType');
  return {
    factType,
    existing: {
      state: PROJECT_STATE_LAYER.EXISTING,
      value: existingValue,
      kind: PROJECT_STATEMENT_KIND[existingKind] || PROJECT_STATEMENT_KIND.FACT,
    },
    proposed: {
      state: PROJECT_STATE_LAYER.PROPOSED,
      value: proposedValue,
      kind: PROJECT_STATEMENT_KIND[proposedKind] || PROJECT_STATEMENT_KIND.USER_INTENT,
    },
    overwritesCanonicalPropertyFact: false,
  };
}

function createDevelopmentProject({
  projectId,
  projectType = PROJECT_TYPE.UNKNOWN,
  name = null,
  subjects = [],
  lifecycle = PROJECT_LIFECYCLE.DRAFT,
  createdAt = null,
  createdBy = null,
  evidenceAsOf = null,
  analysisAt = null,
  provenance = null,
  visibility = VISIBILITY.PRIVATE,
  asPropertyId = false,
  asSiteId = false,
  asScenarioId = false,
  asWorkScopeId = false,
  whatIfId = null,
} = {}) {
  if (projectId == null || projectId === '') {
    throw new Error('Development project requires projectId');
  }
  assertDistinctIdentities(projectId, {
    asPropertyId, asSiteId, asScenarioId, asWorkScopeId, whatIfId,
  });
  const type = PROJECT_TYPE[projectType] || PROJECT_TYPE.UNKNOWN;
  const links = (Array.isArray(subjects) ? subjects : []).map((row) => (
    row.subjectRef ? createProjectSubjectLink(row) : createProjectSubjectLink({ subjectRef: row })
  ));
  const project = {
    contractVersion: DEVELOPMENT_PROJECT_CONTRACT_VERSION,
    entityKind: IDENTITY_KIND.DEVELOPMENT_PROJECT,
    projectId: String(projectId),
    projectType: type,
    name: name || null,
    subjects: links,
    lifecycle: PROJECT_LIFECYCLE[lifecycle] || PROJECT_LIFECYCLE.UNKNOWN,
    activeDoesNotMeanConstructionStarted: true,
    createdAt: createdAt || null,
    createdBy: visibility === VISIBILITY.PRIVATE ? createdBy : null,
    evidenceAsOf: evidenceAsOf || null,
    analysisAt: analysisAt || null,
    scopeDefinedAt: null,
    updatedAt: null,
    provenance: provenance || { source: 'UserIntent' },
    visibility: visibility === VISIBILITY.SHARED ? VISIBILITY.SHARED : VISIBILITY.PRIVATE,
    sharedPropertyEvidence: false,
    factType: 'proposedDevelopment',
    impliesPlanningPermission: false,
    impliesOwnership: false,
    impliesFunding: false,
    impliesFeasibility: false,
    impliesCostCertainty: false,
    impliesSchedule: false,
    impliesValuationUplift: false,
    inferredFromListingDescription: false,
  };
  return visibility === VISIBILITY.PRIVATE
    ? markPrivate(project)
    : assertEvidenceVisibility({ ...project, sharedPropertyEvidence: false });
}

function createDevelopmentScenario({
  scenarioId,
  projectId,
  name = null,
  description = null,
  whatIfId = null,
  visibility = VISIBILITY.PRIVATE,
  createdAt = null,
  evidenceAsOf = null,
} = {}) {
  if (scenarioId == null || scenarioId === '') {
    throw new Error('Development scenario requires scenarioId');
  }
  if (projectId == null || projectId === '') {
    throw new Error('Development scenario requires projectId');
  }
  if (String(scenarioId) === String(projectId)) {
    throw new Error('SCENARIO_IS_NOT_PROJECT');
  }
  if (whatIfId && String(whatIfId) === String(scenarioId)) {
    throw new Error('WHAT_IF_IS_NOT_DEVELOPMENT_SCENARIO');
  }
  const scenario = {
    contractVersion: DEVELOPMENT_PROJECT_CONTRACT_VERSION,
    entityKind: IDENTITY_KIND.DEVELOPMENT_SCENARIO,
    scenarioId: String(scenarioId),
    projectId: String(projectId),
    name: name || null,
    description: description || null,
    createdAt: createdAt || null,
    evidenceAsOf: evidenceAsOf || null,
    visibility: visibility === VISIBILITY.SHARED ? VISIBILITY.SHARED : VISIBILITY.PRIVATE,
    sharedPropertyEvidence: false,
    factType: 'developmentScenario',
    isFinanceWhatIf: false,
    isCanonicalCurrentState: false,
    impliesFeasibility: false,
    impliesCost: false,
  };
  return visibility === VISIBILITY.PRIVATE
    ? markPrivate(scenario)
    : assertEvidenceVisibility({ ...scenario, sharedPropertyEvidence: false });
}

function createWorkScope({
  scopeId,
  projectId,
  scenarioId = null,
  subjectRefs = [],
  scopeType = WORK_SCOPE_TYPE.UNKNOWN,
  description = null,
  state = PROJECT_STATE_LAYER.PROPOSED,
  sourceType = SOURCE_TYPE.USER_REPORTED,
  statementKind = PROJECT_STATEMENT_KIND.USER_INTENT,
  provenance = null,
  createdAt = null,
  evidenceAsOf = null,
  visibility = VISIBILITY.PRIVATE,
} = {}) {
  if (scopeId == null || scopeId === '') throw new Error('Work scope requires scopeId');
  if (projectId == null || projectId === '') throw new Error('Work scope requires projectId');
  if (String(scopeId) === String(projectId)) throw new Error('WORK_SCOPE_IS_NOT_PROJECT');
  const scope = {
    contractVersion: DEVELOPMENT_PROJECT_CONTRACT_VERSION,
    scopeId: String(scopeId),
    projectId: String(projectId),
    scenarioId: scenarioId == null ? null : String(scenarioId),
    subjectRefs: Array.isArray(subjectRefs) ? subjectRefs : [],
    scopeType: WORK_SCOPE_TYPE[scopeType] || WORK_SCOPE_TYPE.UNKNOWN,
    description: description || null,
    state: PROJECT_STATE_LAYER[state] || PROJECT_STATE_LAYER.PROPOSED,
    sourceType: SOURCE_TYPE[sourceType] || SOURCE_TYPE.USER_REPORTED,
    statementKind: PROJECT_STATEMENT_KIND[statementKind] || PROJECT_STATEMENT_KIND.USER_INTENT,
    createdAt: createdAt || null,
    evidenceAsOf: evidenceAsOf || null,
    provenance: provenance || { source: 'UserIntent' },
    visibility: visibility === VISIBILITY.PRIVATE ? VISIBILITY.PRIVATE : visibility,
    sharedPropertyEvidence: false,
    factType: 'projectScope',
    impliesDefect: false,
    impliesPlanningRequirement: false,
    impliesCost: false,
    impliesSchedule: false,
    quantitiesAreAuthoritative: false,
    freeTextIsNotAuthoritativeScope: true,
  };
  if (sourceType === SOURCE_TYPE.MODEL_ASSISTED) {
    scope.statementKind = PROJECT_STATEMENT_KIND.INFERENCE;
    scope.authoritative = false;
  }
  return visibility === VISIBILITY.PRIVATE
    ? markPrivate(scope)
    : assertEvidenceVisibility({ ...scope, sharedPropertyEvidence: false });
}

function createProjectDependency({
  dependencyId,
  projectId,
  scenarioId = null,
  domain,
  dependencyType = 'unspecified',
  subjectRefs = [],
  state = PROJECT_DEPENDENCY_STATE.NOT_ASSESSED,
  source = null,
  evidenceRefs = [],
  description = null,
  limitations = [],
} = {}) {
  if (dependencyId == null || dependencyId === '') throw new Error('Dependency requires dependencyId');
  if (projectId == null || projectId === '') throw new Error('Dependency requires projectId');
  if (!domain) throw new Error('Dependency requires domain');
  return {
    contractVersion: DEVELOPMENT_PROJECT_CONTRACT_VERSION,
    dependencyId: String(dependencyId),
    projectId: String(projectId),
    scenarioId: scenarioId == null ? null : String(scenarioId),
    domain: String(domain),
    dependencyType,
    subjectRefs: Array.isArray(subjectRefs) ? subjectRefs : [],
    state: PROJECT_DEPENDENCY_STATE[state] || PROJECT_DEPENDENCY_STATE.NOT_ASSESSED,
    kernelState: state === PROJECT_DEPENDENCY_STATE.KNOWN
      ? KERNEL_ASSESSMENT.ASSESSED
      : state === PROJECT_DEPENDENCY_STATE.UNAVAILABLE
        ? KERNEL_ASSESSMENT.UNAVAILABLE
        : state === PROJECT_DEPENDENCY_STATE.NOT_APPLICABLE
          ? KERNEL_ASSESSMENT.NOT_APPLICABLE
          : KERNEL_ASSESSMENT.NOT_ASSESSED,
    source: source || null,
    evidenceRefs: Array.isArray(evidenceRefs) ? evidenceRefs : [],
    description: description || null,
    limitations: Array.isArray(limitations) ? limitations : [],
    severityScore: null,
    inventedConclusion: false,
  };
}

function projectRef(projectId) {
  return createSubjectRef({
    kind: IDENTITY_KIND.DEVELOPMENT_PROJECT,
    id: projectId,
  });
}

function scenarioRef(scenarioId) {
  return createSubjectRef({
    kind: IDENTITY_KIND.DEVELOPMENT_SCENARIO,
    id: scenarioId,
  });
}

module.exports = {
  DEVELOPMENT_PROJECT_CONTRACT_VERSION,
  PROJECT_TYPE,
  PROJECT_SUBJECT_ROLE,
  PROJECT_STATE_LAYER,
  WORK_SCOPE_TYPE,
  PROJECT_LIFECYCLE,
  PROJECT_STATEMENT_KIND,
  PROJECT_DEPENDENCY_STATE,
  ALLOWED_PROJECT_SUBJECT_KINDS,
  createProjectSubjectLink,
  createExistingProposedPair,
  createDevelopmentProject,
  createDevelopmentScenario,
  createWorkScope,
  createProjectDependency,
  projectRef,
  scenarioRef,
  createIdentityRelation,
  EVIDENCE_CLASS,
};
