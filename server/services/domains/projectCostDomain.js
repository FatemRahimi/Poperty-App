/**
 * Project cost foundation adapter.
 * Reports supplied cost evidence only. Does not estimate, escalate, or price viability.
 * Not wired into live analysis.
 */

const {
  createDomainEnvelope,
  createDecisionContribution,
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  PROJECT_COST_DOMAIN_VERSION,
  ASSET_CLASS,
  COST_KIND,
  COST_COMPLETENESS,
  TAX_TREATMENT,
  COST_UNIT,
  createCostItem,
  aggregateCompatibleCostItems,
  classifyLegacyRenovationCost,
} = require('../../architecture');

const FORBIDDEN_CONCLUSION = /expensive|competitive|budget is enough|financially viable|price is fair|user should proceed|affordable|good value|cheap project|will cost £/i;

const ENVELOPE_LIMITATIONS = Object.freeze([
  'A user budget is not assessed project cost.',
  'A quote is not an actual cost.',
  'A benchmark is not property-specific truth.',
  'A unit rate is not a total.',
  'Missing cost is not £0.',
  'No quote is not no cost.',
  'Contingency and professional fees are not auto-added.',
  'VAT treatment is not assumed.',
  'Escalation is NOT_ASSESSED.',
  'Work scope does not invent cost.',
  'This is not a construction estimate, affordability, or viability conclusion.',
]);

const TOTAL_UNITS = new Set([COST_UNIT.GBP_TOTAL, COST_UNIT.GBP]);

function adaptProjectCostFoundation({
  project = null,
  scenarios = [],
  scopes = [],
  costItems = [],
  completeness = COST_COMPLETENESS.NOT_ASSESSED,
  identity = {},
  assetClassification = null,
  analysisAt = null,
  conditionEvidenceRefs = [],
  planningEvidenceRefs = [],
  legalEvidenceRefs = [],
  environmentEvidenceRefs = [],
} = {}) {
  const assetClass = assetClassification?.assetClass || ASSET_CLASS.UNKNOWN;
  const items = Array.isArray(costItems) ? costItems : [];
  const scopeList = Array.isArray(scopes) ? scopes : [];
  const projectId = project?.projectId || null;

  if (!projectId && items.length === 0) {
    const envelope = createDomainEnvelope({
      domain: DOMAIN_ID.PROJECT_COST,
      version: PROJECT_COST_DOMAIN_VERSION,
      subject: { ref: identity || null, assetClass, projectDefined: false },
      status: DOMAIN_STATUS.NOT_ASSESSED,
      evidenceAsOf: analysisAt || null,
      analysisAt: analysisAt || null,
      assessment: {
        state: KERNEL_ASSESSMENT.NOT_ASSESSED,
        liveProjectCostAssessmentAvailable: false,
        assessedProjectCost: null,
        isTotalProjectCost: false,
        buildingConditionRequired: false,
        residentialMethodologyActivated: false,
        renovationCostClassification: classifyLegacyRenovationCost(),
        escalation: KERNEL_ASSESSMENT.NOT_ASSESSED,
      },
      findings: [{
        id: 'no_project_specific_cost_evidence',
        text: 'No project-specific cost evidence is attached.',
      }],
      evidence: [],
      limitations: ENVELOPE_LIMITATIONS,
      unresolvedDependencies: [],
      investigationPriorities: [],
      provenance: {
        source: 'project-cost-domain-foundation',
        adapter: PROJECT_COST_DOMAIN_VERSION,
        wiredIntoLiveAnalysis: false,
        noAdditionalProviderCall: true,
      },
    });
    return { envelope, contribution: null, aggregation: null, assetClassUnchanged: assetClass };
  }

  if (project && (project.projectId == null || project.projectId === '')) {
    throw new Error('Project cost requires projectId');
  }

  const findings = [];
  const unresolvedDependencies = [];
  const investigationPriorities = [];

  if (scopeList.length && items.length === 0) {
    findings.push({
      id: 'scope_defined_without_cost',
      text: 'Work scope is defined but no cost evidence is attached. Project cost is not assessed.',
    });
    unresolvedDependencies.push({
      id: 'scope-without-cost',
      text: 'Defined work scope has no linked cost evidence.',
    });
  }

  const quotes = items.filter((row) => row.isQuote);
  const budgets = items.filter((row) => row.isUserBudget);
  const actuals = items.filter((row) => row.isActualCost);
  quotes.forEach((row) => {
    findings.push({
      id: `quote_recorded_${row.costItemId}`,
      text: `${row.costKind.replace(/_/g, ' ').toLowerCase()} recorded. This is not an actual cost.`,
    });
    if (row.exclusions?.length) {
      findings.push({
        id: `quote_exclusions_${row.costItemId}`,
        text: 'Quote exclusions are retained and were not treated as included.',
      });
    }
    if (row.expired || row.isCurrent === false) {
      findings.push({
        id: `price_base_old_${row.costItemId}`,
        text: 'Price-base or quote date is not current. An old quote is not silently a current cost.',
      });
      unresolvedDependencies.push({
        id: `expired-quote-${row.costItemId}`,
        text: 'Quote is expired or not current for the analysis date.',
      });
      investigationPriorities.push({
        id: `current-quote-${row.costItemId}`,
        text: 'Obtain current evidence for the expired or non-current quote.',
      });
    }
    if (row.taxTreatment === TAX_TREATMENT.UNKNOWN && row.amount != null) {
      findings.push({
        id: `vat_unknown_${row.costItemId}`,
        text: 'VAT treatment is unknown. Missing VAT is not treated as 0.',
      });
      unresolvedDependencies.push({
        id: `vat-${row.costItemId}`,
        text: 'VAT treatment is unknown where a quoted amount exists.',
      });
      investigationPriorities.push({
        id: `vat-clarify-${row.costItemId}`,
        text: 'Clarify whether the quote includes VAT.',
      });
    }
    if (!row.scopeId) {
      findings.push({
        id: `scope_linkage_missing_${row.costItemId}`,
        text: 'Cost item is not linked to a work scope.',
      });
      unresolvedDependencies.push({
        id: `unlink-${row.costItemId}`,
        text: 'Cost item cannot be linked to a project work scope.',
      });
      investigationPriorities.push({
        id: `link-scope-${row.costItemId}`,
        text: 'Link the quote to the correct work scope.',
      });
    }
    if (row.unitRate != null && row.quantity == null && row.amount == null) {
      findings.push({
        id: `rate_without_quantity_${row.costItemId}`,
        text: 'Unit rate exists but quantity is missing. No total was derived.',
      });
      unresolvedDependencies.push({
        id: `qty-${row.costItemId}`,
        text: 'Unit rate exists but quantity is absent.',
      });
    }
  });
  budgets.forEach((row) => {
    findings.push({
      id: `user_budget_recorded_${row.costItemId}`,
      text: 'User budget recorded. This is not assessed project cost.',
    });
  });
  if (items.length && items.every((row) => !row.isAssessedProjectCost)) {
    findings.push({
      id: 'no_assessed_project_cost',
      text: 'No assessed project cost is available from the attached evidence.',
    });
  }
  if (items.length && completeness !== COST_COMPLETENESS.COMPLETE_FOR_DECLARED_SCOPE) {
    findings.push({
      id: 'cost_evidence_partial',
      text: 'Cost evidence is partial. A known subtotal is not total project cost.',
    });
  }

  let aggregation = null;
  if (projectId && items.length) {
    aggregation = aggregateCompatibleCostItems({
      items,
      projectId,
      scenarioId: scenarios.length === 1 ? scenarios[0].scenarioId : null,
      completeness: completeness === COST_COMPLETENESS.COMPLETE_FOR_DECLARED_SCOPE
        ? COST_COMPLETENESS.COMPLETE_FOR_DECLARED_SCOPE
        : COST_COMPLETENESS.PARTIAL,
      analysisAt,
    });
    if (aggregation.actualSubtotal.amount != null || aggregation.quoteSubtotal.amount != null) {
      findings.push({
        id: 'known_subtotal_explicit_items',
        text: 'A known subtotal is available for explicit compatible items. This is not total project cost unless the declared scope is complete.',
      });
    }
  }

  if (!findings.length) {
    findings.push({
      id: 'no_project_specific_cost_evidence',
      text: 'No project-specific cost evidence is attached.',
    });
  }

  findings.forEach((row) => {
    if (FORBIDDEN_CONCLUSION.test(row.text)) {
      throw new Error('PROJECT_COST_FORBIDDEN_CONCLUSION');
    }
  });

  const unusedCondition = Array.isArray(conditionEvidenceRefs) ? conditionEvidenceRefs : [];
  const unusedPlanning = Array.isArray(planningEvidenceRefs) ? planningEvidenceRefs : [];
  const unusedLegal = Array.isArray(legalEvidenceRefs) ? legalEvidenceRefs : [];
  const unusedEnvironment = Array.isArray(environmentEvidenceRefs) ? environmentEvidenceRefs : [];

  const envelope = createDomainEnvelope({
    domain: DOMAIN_ID.PROJECT_COST,
    version: PROJECT_COST_DOMAIN_VERSION,
    subject: {
      ref: projectId ? { kind: 'DEVELOPMENT_PROJECT', id: projectId } : (identity || null),
      assetClass,
      projectDefined: Boolean(projectId),
      propertyIsNotProject: true,
    },
    status: items.length ? DOMAIN_STATUS.PARTIAL : DOMAIN_STATUS.NOT_ASSESSED,
    evidenceAsOf: items[0]?.evidenceAsOf || analysisAt || null,
    analysisAt: analysisAt || null,
    assessment: {
      state: items.some((row) => row.assessment?.state === KERNEL_ASSESSMENT.ASSESSED)
        ? KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE
        : KERNEL_ASSESSMENT.NOT_ASSESSED,
      liveProjectCostAssessmentAvailable: false,
      assessedProjectCost: null,
      isTotalProjectCost: Boolean(aggregation?.isTotalProjectCost),
      completeness: aggregation?.completeness || COST_COMPLETENESS.NOT_ASSESSED,
      quoteCount: quotes.length,
      actualCount: actuals.length,
      budgetCount: budgets.length,
      impliesValuationAdjustment: false,
      impliesRentAdjustment: false,
      impliesFinanceChange: false,
      impliesFeasibility: false,
      impliesSchedule: false,
      buildingConditionRequired: false,
      residentialMethodologyActivated: false,
      conditionInventedCost: unusedCondition.length > 0 ? false : false,
      planningInventedCost: unusedPlanning.length > 0 ? false : false,
      legalInventedCost: unusedLegal.length > 0 ? false : false,
      environmentInventedCost: unusedEnvironment.length > 0 ? false : false,
      escalation: KERNEL_ASSESSMENT.NOT_ASSESSED,
      renovationCostClassification: classifyLegacyRenovationCost(),
    },
    findings,
    evidence: items.filter((row) => TOTAL_UNITS.has(row.unit) || row.unitRate != null),
    limitations: ENVELOPE_LIMITATIONS,
    unresolvedDependencies,
    investigationPriorities,
    provenance: {
      source: 'project-cost-domain-foundation',
      adapter: PROJECT_COST_DOMAIN_VERSION,
      projectId,
      wiredIntoLiveAnalysis: false,
      noAdditionalProviderCall: true,
    },
  });

  return {
    envelope,
    contribution: items.length ? createDecisionContribution({
      domain: DOMAIN_ID.PROJECT_COST,
      domainVersion: PROJECT_COST_DOMAIN_VERSION,
      materialFindings: findings.map((row) => row.text),
      unresolvedDependencies: unresolvedDependencies.map((row) => row.text),
      investigationPriorities: investigationPriorities.map((row) => row.text),
      limitations: ENVELOPE_LIMITATIONS,
    }) : null,
    aggregation,
    assetClassUnchanged: assetClass,
  };
}

function attachProjectCostFoundation(args) {
  try {
    const adapted = adaptProjectCostFoundation(args || {});
    return {
      projectCostDomain: adapted.envelope,
      projectCostContribution: adapted.contribution,
    };
  } catch {
    return {
      projectCostDomain: createDomainEnvelope({
        domain: DOMAIN_ID.PROJECT_COST,
        version: PROJECT_COST_DOMAIN_VERSION,
        status: DOMAIN_STATUS.NOT_ASSESSED,
        assessment: {
          state: KERNEL_ASSESSMENT.NOT_ASSESSED,
          liveProjectCostAssessmentAvailable: false,
        },
        limitations: ENVELOPE_LIMITATIONS,
        findings: [{
          id: 'adapter_degraded',
          text: 'Project cost foundation could not be assembled from the attached evidence.',
        }],
      }),
      projectCostContribution: null,
    };
  }
}

module.exports = {
  PROJECT_COST_DOMAIN_VERSION,
  adaptProjectCostFoundation,
  attachProjectCostFoundation,
  ENVELOPE_LIMITATIONS,
  createCostItem,
};
