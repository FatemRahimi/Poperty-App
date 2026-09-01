/**
 * Development scope foundation adapter.
 * Reports project identity and completeness only when a project is supplied.
 * Does not invent projects, costs, feasibility, or planning outcomes.
 * Not wired into live analysis.
 */

const {
  createDomainEnvelope,
  createDecisionContribution,
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  DEVELOPMENT_DOMAIN_VERSION,
  ASSET_CLASS,
  PROJECT_TYPE,
  PROJECT_DEPENDENCY_STATE,
  WORK_SCOPE_TYPE,
  createProjectDependency,
} = require('../../architecture');

const FORBIDDEN_CONCLUSION = /viable|should be approved|conversion is feasible|profitable|low risk|works should proceed|planning will be granted/i;

const ENVELOPE_LIMITATIONS = Object.freeze([
  'A development project is proposed intent, not planning permission, ownership, or feasibility.',
  'Finance What-if is not a development scenario.',
  'Work scope does not imply a defect or a planning requirement.',
  'ACTIVE does not mean construction has started.',
  'No cost, schedule, GDV, residual, or valuation uplift is assessed.',
  'This is not project-management or development-viability advice.',
]);

const PHYSICAL_WORK = new Set([
  WORK_SCOPE_TYPE.DEMOLITION,
  WORK_SCOPE_TYPE.NEW_CONSTRUCTION,
  WORK_SCOPE_TYPE.STRUCTURAL_WORK,
  WORK_SCOPE_TYPE.ENVELOPE_WORK,
  WORK_SCOPE_TYPE.INTERNAL_WORK,
  WORK_SCOPE_TYPE.MEP_WORK,
  WORK_SCOPE_TYPE.REPAIR,
  WORK_SCOPE_TYPE.REFURBISHMENT,
  WORK_SCOPE_TYPE.EXTENSION,
  WORK_SCOPE_TYPE.CONVERSION,
]);

const USE_CHANGE = new Set([
  WORK_SCOPE_TYPE.CONVERSION,
  WORK_SCOPE_TYPE.CHANGE_OF_USE,
  PROJECT_TYPE.CONVERSION,
  PROJECT_TYPE.CHANGE_OF_USE,
]);

function adaptDevelopmentFoundation({
  project = null,
  scenarios = [],
  scopes = [],
  existingProposed = [],
  planningEvidenceRefs = [],
  identity = {},
  assetClassification = null,
  analysisAt = null,
} = {}) {
  const assetClass = assetClassification?.assetClass || ASSET_CLASS.UNKNOWN;
  if (project && (project.projectId == null || project.projectId === '')) {
    throw new Error('Development project requires projectId');
  }
  if (!project) {
    const envelope = createDomainEnvelope({
      domain: DOMAIN_ID.DEVELOPMENT,
      version: DEVELOPMENT_DOMAIN_VERSION,
      subject: { ref: identity || null, assetClass, projectDefined: false },
      status: DOMAIN_STATUS.NOT_ASSESSED,
      evidenceAsOf: analysisAt || null,
      analysisAt: analysisAt || null,
      assessment: {
        state: KERNEL_ASSESSMENT.NOT_ASSESSED,
        liveDevelopmentAssessmentAvailable: false,
        projectDefined: false,
        selectedScenarioId: null,
      },
      findings: [{
        id: 'no_project_defined',
        text: 'No development project is defined. Absence of a project is not a development conclusion.',
      }],
      evidence: [],
      limitations: ENVELOPE_LIMITATIONS,
      unresolvedDependencies: [],
      investigationPriorities: [],
      provenance: {
        source: 'development-domain-foundation',
        adapter: DEVELOPMENT_DOMAIN_VERSION,
        wiredIntoLiveAnalysis: false,
        noAdditionalProviderCall: true,
      },
    });
    return { envelope, contribution: null, assetClassUnchanged: assetClass };
  }

  const scenarioList = Array.isArray(scenarios) ? scenarios : [];
  const scopeList = Array.isArray(scopes) ? scopes : [];
  const pairs = Array.isArray(existingProposed) ? existingProposed : [];
  const selected = scenarioList.length === 1 ? scenarioList[0] : null;
  const multiSubject = (project.subjects || []).length > 1;
  const useChange = USE_CHANGE.has(project.projectType)
    || scopeList.some((row) => USE_CHANGE.has(row.scopeType));
  const physicalWork = scopeList.some((row) => PHYSICAL_WORK.has(row.scopeType));
  const planningRefs = Array.isArray(planningEvidenceRefs) ? planningEvidenceRefs : [];

  const dependencies = [];
  if (useChange && planningRefs.length === 0) {
    dependencies.push(createProjectDependency({
      dependencyId: `${project.projectId}-planning`,
      projectId: project.projectId,
      domain: DOMAIN_ID.PLANNING,
      dependencyType: 'planning_evidence',
      state: PROJECT_DEPENDENCY_STATE.UNRESOLVED,
      description: 'Proposed conversion or change of use has no attached planning evidence.',
      limitations: ['Unresolved is not a permission conclusion.'],
    }));
  }
  if (physicalWork && assetClass === ASSET_CLASS.LAND && !project.subjects?.some((row) =>
    row.subjectRef?.kind === 'BUILDING' || row.subjectRef?.kind === 'UNIT')) {
    /* land without building: do not demand building condition */
  } else if (physicalWork === false) {
    /* no physical work: do not demand a building survey */
  }

  const findings = [{
    id: 'project_defined',
    text: `Development project ${project.projectId} is defined. This is not a viability or permission conclusion.`,
  }];
  if (scopeList.length === 0) {
    findings.push({
      id: 'project_scope_incomplete',
      text: 'Project scope is incomplete.',
    });
  }
  if (multiSubject) {
    findings.push({
      id: 'project_affects_multiple_subjects',
      text: 'Project is associated with multiple subjects. This is not a cadastral or title match.',
    });
  }
  pairs.forEach((pair) => {
    if (pair.existing?.value != null && pair.proposed?.value != null
      && String(pair.existing.value) !== String(pair.proposed.value)) {
      findings.push({
        id: 'proposed_differs_from_existing',
        text: `Proposed ${pair.factType} differs from existing ${pair.factType}. Existing property facts were not overwritten.`,
      });
    }
  });
  if (useChange && planningRefs.length === 0) {
    findings.push({
      id: 'planning_dependency_unresolved',
      text: 'Planning dependency is unresolved because no planning evidence is attached to this proposal.',
    });
  }
  if (!selected && scenarioList.length === 0) {
    findings.push({
      id: 'no_project_scenario_selected',
      text: 'No project scenario is selected.',
    });
  }
  findings.forEach((row) => {
    if (FORBIDDEN_CONCLUSION.test(row.text)) {
      throw new Error('DEVELOPMENT_FORBIDDEN_CONCLUSION');
    }
  });

  const unresolvedDependencies = dependencies
    .filter((row) => row.state === PROJECT_DEPENDENCY_STATE.UNRESOLVED)
    .map((row) => ({ id: row.dependencyId, text: row.description }));
  const investigationPriorities = unresolvedDependencies.map((row) => ({
    id: row.id,
    text: 'Review the unresolved project dependency against sourced evidence.',
  }));

  const envelope = createDomainEnvelope({
    domain: DOMAIN_ID.DEVELOPMENT,
    version: DEVELOPMENT_DOMAIN_VERSION,
    subject: {
      ref: { kind: 'DEVELOPMENT_PROJECT', id: project.projectId },
      assetClass,
      projectDefined: true,
      propertyIsNotProject: true,
    },
    status: DOMAIN_STATUS.PARTIAL,
    evidenceAsOf: project.evidenceAsOf || analysisAt || null,
    analysisAt: analysisAt || project.analysisAt || null,
    assessment: {
      state: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE,
      scope: 'development_project_identity_and_completeness',
      liveDevelopmentAssessmentAvailable: false,
      projectDefined: true,
      selectedScenarioId: selected?.scenarioId || null,
      scenarioCount: scenarioList.length,
      scopeCount: scopeList.length,
      impliesCost: false,
      impliesFeasibility: false,
      impliesSchedule: false,
      impliesValuationUplift: false,
      impliesPlanningPermission: false,
      buildingConditionRequired: false,
      residentialMethodologyActivated: false,
    },
    findings,
    evidence: [],
    limitations: ENVELOPE_LIMITATIONS,
    unresolvedDependencies,
    investigationPriorities,
    provenance: {
      source: 'development-domain-foundation',
      adapter: DEVELOPMENT_DOMAIN_VERSION,
      projectId: project.projectId,
      projectContractVersion: project.contractVersion,
      wiredIntoLiveAnalysis: false,
      noAdditionalProviderCall: true,
    },
  });

  return {
    envelope,
    contribution: createDecisionContribution({
      domain: DOMAIN_ID.DEVELOPMENT,
      domainVersion: DEVELOPMENT_DOMAIN_VERSION,
      materialFindings: findings.map((row) => row.text),
      unresolvedDependencies: unresolvedDependencies.map((row) => row.text),
      investigationPriorities: investigationPriorities.map((row) => row.text),
      limitations: ENVELOPE_LIMITATIONS,
    }),
    assetClassUnchanged: assetClass,
    dependencies,
  };
}

function attachDevelopmentFoundation(args) {
  try {
    const adapted = adaptDevelopmentFoundation(args || {});
    return {
      developmentDomain: adapted.envelope,
      developmentContribution: adapted.contribution,
    };
  } catch {
    return {
      developmentDomain: createDomainEnvelope({
        domain: DOMAIN_ID.DEVELOPMENT,
        version: DEVELOPMENT_DOMAIN_VERSION,
        status: DOMAIN_STATUS.NOT_ASSESSED,
        assessment: {
          state: KERNEL_ASSESSMENT.NOT_ASSESSED,
          liveDevelopmentAssessmentAvailable: false,
        },
        limitations: ENVELOPE_LIMITATIONS,
        findings: [{
          id: 'adapter_degraded',
          text: 'Development foundation could not be assembled from the attached project.',
        }],
      }),
      developmentContribution: null,
    };
  }
}

module.exports = {
  DEVELOPMENT_DOMAIN_VERSION,
  adaptDevelopmentFoundation,
  attachDevelopmentFoundation,
  ENVELOPE_LIMITATIONS,
};
