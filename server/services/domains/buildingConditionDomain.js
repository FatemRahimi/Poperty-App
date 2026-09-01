/**
 * Building & Condition foundation adapter.
 * Reports evidence completeness and adjacent energy/layout facts only.
 * Does not inspect, diagnose, cost, or score condition.
 * Not wired into live analysis.
 */

const {
  createDomainEnvelope,
  createDecisionContribution,
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  BUILDING_CONDITION_DOMAIN_VERSION,
  ASSET_CLASS,
  SOURCE_TYPE,
  createComponentRef,
  INSPECTION_COMPLETENESS,
  BUILDING_EVIDENCE_CLASS,
  ADJACENT_NOT_CONDITION,
  CONDITION_VOCABULARY,
} = require('../../architecture');
const { subjectRefFromIdentity } = require('./subjectRef');

const FORBIDDEN_CONCLUSION = /structurally sound|excellent condition|safe to occupy|no defect exists|10 years remaining|refurbishment will cost|good condition/i;

const ENVELOPE_LIMITATIONS = Object.freeze([
  'No professional building-condition survey is available in this product.',
  'An EPC is energy evidence, not a structural or condition survey.',
  'A floor plan is not condition evidence.',
  'A listing photograph is not a professional inspection.',
  'Listing descriptions such as “recently renovated” are not survey evidence.',
  'Missing survey is not good condition.',
  'No recorded defect is not proof that no defect exists.',
  'buildRisks is a legacy heuristic register, not canonical condition evidence.',
  'Condition is time-sensitive. Old evidence is not current condition.',
  'This is not a building survey, structural advice, insurance assessment, or cost estimate.',
]);

function factAvailable(fact) {
  return Boolean(fact && fact.available === true && fact.value != null && fact.value !== '');
}

function landWithoutBuilding(assetClass, hasBuildingEvidence) {
  return assetClass === ASSET_CLASS.LAND && !hasBuildingEvidence;
}

function adaptBuildingConditionFoundation({
  propertyFacts = null,
  documents = [],
  inspections = [],
  defects = [],
  identity = {},
  assetClassification = null,
  analysisAt = null,
  hasBuildingOnSite = null,
} = {}) {
  const subjectRef = subjectRefFromIdentity(identity);
  const assetClass = assetClassification?.assetClass || ASSET_CLASS.UNKNOWN;
  const facts = propertyFacts?.facts || {};
  const docs = Array.isArray(documents) ? documents : [];
  const observed = Array.isArray(inspections) ? inspections : [];
  const defectRecords = Array.isArray(defects) ? defects : [];

  const professionalSurvey = docs.some((doc) => doc.professionalDocument === true);
  const epcPresent = factAvailable(facts.epcRating);
  const floorPlanPresent = docs.some((doc) => doc.documentType === 'FLOOR_PLAN')
    || Boolean(propertyFacts?.documents?.floorPlan);
  const hasBuildingEvidence = hasBuildingOnSite === true
    || professionalSurvey
    || observed.length > 0
    || assetClass !== ASSET_CLASS.LAND;

  if (landWithoutBuilding(assetClass, hasBuildingOnSite === true || professionalSurvey || observed.length > 0)) {
    const envelope = createDomainEnvelope({
      domain: DOMAIN_ID.BUILDING_CONDITION,
      version: BUILDING_CONDITION_DOMAIN_VERSION,
      subject: {
        ref: subjectRef,
        assetClass,
        propertyIsNotBuilding: true,
      },
      status: DOMAIN_STATUS.NOT_ASSESSED,
      evidenceAsOf: analysisAt || null,
      analysisAt: analysisAt || null,
      assessment: {
        state: KERNEL_ASSESSMENT.NOT_APPLICABLE,
        scope: 'building_condition_foundation',
        liveConditionAssessmentAvailable: false,
        inspectionCompleteness: INSPECTION_COMPLETENESS.NOT_INSPECTED,
        conditionVocabulary: CONDITION_VOCABULARY.UNKNOWN,
        professionalSurveyAvailable: false,
        epcIsNotConditionSurvey: true,
        buildRisksIsNotConditionEvidence: true,
        remainingTermOrCostPublished: false,
      },
      findings: [{
        id: 'land_without_building',
        text: 'No building is evidenced on this land asset. Building condition is not applicable.',
      }],
      evidence: [],
      limitations: ENVELOPE_LIMITATIONS,
      unresolvedDependencies: [],
      investigationPriorities: [],
      provenance: {
        source: 'building-condition-foundation',
        adapter: BUILDING_CONDITION_DOMAIN_VERSION,
        wrapsExistingEvidence: true,
        noAdditionalProviderCall: true,
        wiredIntoLiveAnalysis: false,
      },
    });
    return {
      envelope,
      contribution: createDecisionContribution({
        domain: DOMAIN_ID.BUILDING_CONDITION,
        domainVersion: BUILDING_CONDITION_DOMAIN_VERSION,
        materialFindings: envelope.findings.map((row) => row.text),
        limitations: ENVELOPE_LIMITATIONS,
      }),
      assetClassUnchanged: assetClass,
    };
  }

  const findings = [];
  if (professionalSurvey) {
    findings.push({
      id: 'professional_survey_available',
      text: 'Professional survey evidence is available as a document record. The platform has not validated credentials or interpreted the survey.',
    });
  } else {
    findings.push({
      id: 'no_professional_condition_evidence',
      text: 'No professional condition evidence is available. Building condition has not been inspected.',
    });
  }
  if (epcPresent) {
    findings.push({
      id: 'epc_is_not_condition',
      text: `EPC ${facts.epcRating.value} is available but does not constitute a condition assessment.`,
    });
  }
  if (floorPlanPresent) {
    findings.push({
      id: 'floor_plan_is_not_condition',
      text: 'A floor plan may evidence layout. It is not condition, structural, or dimensional survey evidence unless a future source methodology says otherwise.',
    });
  }
  if (defectRecords.length > 0) {
    findings.push({
      id: 'defect_records_present',
      text: `${defectRecords.length} sourced defect record(s) are attached. Missing other defects is not “no defect exists”.`,
    });
  }
  const conflict = observed.length > 1 && observed.some((row, i) =>
    i > 0 && String(row.value) !== String(observed[0].value) && row.componentRef?.category === observed[0].componentRef?.category);
  if (conflict) {
    findings.push({
      id: 'conflicting_condition_evidence',
      text: 'Conflicting condition evidence exists. Neither observation was selected.',
    });
  }
  findings.forEach((row) => {
    if (FORBIDDEN_CONCLUSION.test(row.text) && row.id !== 'defect_records_present') {
      throw new Error('BUILDING_CONDITION_FORBIDDEN_CONCLUSION');
    }
  });

  const unresolvedDependencies = [];
  if (!professionalSurvey) {
    unresolvedDependencies.push({
      id: 'condition_survey_not_available',
      text: 'A professional condition survey is not available.',
    });
  }
  if (conflict) {
    unresolvedDependencies.push({
      id: 'conflicting_condition_evidence',
      text: 'Resolve conflicting condition observations.',
    });
  }

  const investigationPriorities = [];
  if (conflict) {
    investigationPriorities.push({
      id: 'resolve_conflicting_condition',
      text: 'Review the referenced observations and resolve the conflict with sourced evidence.',
    });
  }
  if (professionalSurvey) {
    investigationPriorities.push({
      id: 'review_referenced_survey',
      text: 'Review the referenced survey document. The platform has not interpreted it.',
    });
  }

  const completeness = professionalSurvey
    ? INSPECTION_COMPLETENESS.PARTIALLY_INSPECTED
    : INSPECTION_COMPLETENESS.NOT_INSPECTED;

  const roofRef = createComponentRef({ category: 'ROOF' });
  const envelope = createDomainEnvelope({
    domain: DOMAIN_ID.BUILDING_CONDITION,
    version: BUILDING_CONDITION_DOMAIN_VERSION,
    subject: {
      ref: subjectRef,
      assetClass,
      propertyIsNotBuilding: true,
      unitIsNotBuilding: true,
      components: [roofRef],
    },
    status: professionalSurvey || observed.length || defectRecords.length
      ? DOMAIN_STATUS.PARTIAL
      : DOMAIN_STATUS.NOT_ASSESSED,
    evidenceAsOf: analysisAt || null,
    analysisAt: analysisAt || null,
    assessment: {
      state: professionalSurvey || observed.length
        ? KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE
        : KERNEL_ASSESSMENT.NOT_ASSESSED,
      scope: 'building_condition_foundation',
      liveConditionAssessmentAvailable: false,
      inspectionCompleteness: completeness,
      roofCompleteness: INSPECTION_COMPLETENESS.NOT_INSPECTED,
      conditionVocabulary: CONDITION_VOCABULARY.UNKNOWN,
      professionalSurveyAvailable: professionalSurvey,
      epcIsNotConditionSurvey: true,
      floorPlanIsNotConditionEvidence: true,
      photoIsNotProfessionalInspection: true,
      listingDescriptionIsNotProfessionalEvidence: true,
      buildRisksIsNotConditionEvidence: true,
      adjacentClassification: ADJACENT_NOT_CONDITION,
      remainingTermOrCostPublished: false,
      residentialComponentModelForced: false,
    },
    findings,
    evidence: observed,
    limitations: ENVELOPE_LIMITATIONS,
    unresolvedDependencies,
    investigationPriorities,
    provenance: {
      source: 'building-condition-foundation',
      adapter: BUILDING_CONDITION_DOMAIN_VERSION,
      wrapsExistingEvidence: true,
      noAdditionalProviderCall: true,
      wiredIntoLiveAnalysis: false,
      buildRisksPromoted: false,
    },
  });

  return {
    envelope,
    contribution: createDecisionContribution({
      domain: DOMAIN_ID.BUILDING_CONDITION,
      domainVersion: BUILDING_CONDITION_DOMAIN_VERSION,
      materialFindings: findings.map((row) => row.text),
      unresolvedDependencies: unresolvedDependencies.map((row) => row.text),
      investigationPriorities: investigationPriorities.map((row) => row.text),
      limitations: ENVELOPE_LIMITATIONS,
    }),
    assetClassUnchanged: assetClass,
    adjacentEnergyClass: BUILDING_EVIDENCE_CLASS.ENERGY_EVIDENCE,
    sourceTypeListing: SOURCE_TYPE.USER_REPORTED,
  };
}

function attachBuildingConditionFoundation(args) {
  try {
    const adapted = adaptBuildingConditionFoundation(args);
    return {
      buildingConditionDomain: adapted.envelope,
      buildingConditionContribution: adapted.contribution,
    };
  } catch {
    return {
      buildingConditionDomain: createDomainEnvelope({
        domain: DOMAIN_ID.BUILDING_CONDITION,
        version: BUILDING_CONDITION_DOMAIN_VERSION,
        status: DOMAIN_STATUS.NOT_ASSESSED,
        assessment: {
          state: KERNEL_ASSESSMENT.NOT_ASSESSED,
          liveConditionAssessmentAvailable: false,
        },
        limitations: ENVELOPE_LIMITATIONS,
        findings: [{
          id: 'adapter_degraded',
          text: 'Building-condition foundation could not be assembled from the attached evidence.',
        }],
      }),
      buildingConditionContribution: null,
    };
  }
}

module.exports = {
  BUILDING_CONDITION_DOMAIN_VERSION,
  adaptBuildingConditionFoundation,
  attachBuildingConditionFoundation,
  ENVELOPE_LIMITATIONS,
};
