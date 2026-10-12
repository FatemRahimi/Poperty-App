/**
 * Building & Condition adapter.
 * Official EPC may activate ENERGY_EVIDENCE / PHYSICAL_CHARACTERISTICS only.
 * Does not inspect, diagnose, cost, or score condition.
 */

const {
  createDomainEnvelope,
  createDecisionContribution,
  createEvidence,
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  BUILDING_CONDITION_DOMAIN_VERSION,
  ASSET_CLASS,
  SOURCE_TYPE,
  EVIDENCE_CLASS,
  createComponentRef,
  INSPECTION_COMPLETENESS,
  BUILDING_EVIDENCE_CLASS,
  ADJACENT_NOT_CONDITION,
  CONDITION_VOCABULARY,
  EPB_ATTACHMENT,
  EPB_SOURCE,
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
  'ENERGY / PHYSICAL EVIDENCE ASSESSED does not mean professional building condition was assessed.',
]);

function factAvailable(fact) {
  return Boolean(fact && fact.available === true && fact.value != null && fact.value !== '');
}

function landWithoutBuilding(assetClass, hasBuildingEvidence) {
  return assetClass === ASSET_CLASS.LAND && !hasBuildingEvidence;
}

function readEpb(epbEvidence) {
  if (!epbEvidence) return null;
  return epbEvidence.client || epbEvidence;
}

function epbEnergyEvidence(epb, subjectRef) {
  const current = epb?.current || {};
  const evidence = [];
  const push = (factType, value, buildingClass, extras = {}) => {
    if (value == null || value === '') return;
    evidence.push(createEvidence({
      domain: DOMAIN_ID.BUILDING_CONDITION,
      subjectRef,
      factType,
      classification: extras.classification || EVIDENCE_CLASS.FACT,
      sourceType: SOURCE_TYPE.OFFICIAL,
      provenance: {
        source: EPB_SOURCE,
        certificateNumber: epb.certificateNumber || null,
        licence: 'OGL-v3.0',
      },
      value,
      unit: extras.unit || null,
      retrievedAt: epb.retrievedAt || null,
      evidenceAsOf: epb.inspectionDate || epb.lodgementDate || epb.retrievedAt || null,
      sourceRecordId: epb.certificateNumber || null,
      assessmentState: 'assessed',
      sharedPropertyEvidence: true,
      authoritative: false,
      limitations: extras.limitations || ['Official EPC field. Not a condition survey.'],
    }));
    evidence[evidence.length - 1].buildingEvidenceClass = buildingClass;
    evidence[evidence.length - 1].epcIsNotSurvey = true;
  };
  push('currentEnergyRating', current.energyRating, BUILDING_EVIDENCE_CLASS.ENERGY_EVIDENCE);
  push(
    'potentialEnergyRating',
    current.potentialEnergyRating,
    BUILDING_EVIDENCE_CLASS.ENERGY_EVIDENCE,
    {
      classification: EVIDENCE_CLASS.INFERENCE,
      limitations: ['Modelled improvement potential. Not a current fabric fact and not a guaranteed improvement.'],
    }
  );
  push(
    'totalFloorArea',
    current.floorAreaSqm,
    BUILDING_EVIDENCE_CLASS.PHYSICAL_FACT,
    { unit: 'SQM' }
  );
  push('builtForm', current.builtForm, BUILDING_EVIDENCE_CLASS.PROPERTY_CHARACTERISTIC);
  push('constructionAgeBand', current.constructionAgeBand, BUILDING_EVIDENCE_CLASS.PROPERTY_CHARACTERISTIC);
  push('epcPropertyType', current.propertyType, BUILDING_EVIDENCE_CLASS.PROPERTY_CHARACTERISTIC, {
    limitations: ['EPC property type is source evidence, not platform asset classification.'],
  });
  return evidence;
}

function mapEpbStatus(epb) {
  const status = epb?.attachmentStatus || epb?.status;
  if (status === EPB_ATTACHMENT.UNIQUE_ATTACH || status === EPB_ATTACHMENT.REUSED) {
    return {
      domainStatus: DOMAIN_STATUS.PARTIAL,
      assessment: KERNEL_ASSESSMENT.ASSESSED,
      energyPhysicalEvidenceAssessed: true,
    };
  }
  if (status === EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY) {
    return {
      domainStatus: DOMAIN_STATUS.NOT_ASSESSED,
      assessment: KERNEL_ASSESSMENT.NOT_APPLICABLE,
      energyPhysicalEvidenceAssessed: false,
      sourceOutsideGeography: true,
    };
  }
  if (status === EPB_ATTACHMENT.SOURCE_ERROR || status === EPB_ATTACHMENT.UNAVAILABLE_MISSING_CREDENTIAL) {
    return {
      domainStatus: DOMAIN_STATUS.UNAVAILABLE,
      assessment: KERNEL_ASSESSMENT.UNAVAILABLE,
      energyPhysicalEvidenceAssessed: false,
    };
  }
  if (status === EPB_ATTACHMENT.UNRESOLVED_IDENTITY || status === EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY) {
    return {
      domainStatus: DOMAIN_STATUS.NOT_ASSESSED,
      assessment: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE,
      energyPhysicalEvidenceAssessed: false,
      unresolvedIdentity: true,
      unresolvedUnitIdentity: status === EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY,
    };
  }
  if (status === EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED) {
    return {
      domainStatus: DOMAIN_STATUS.NOT_ASSESSED,
      assessment: KERNEL_ASSESSMENT.NOT_ASSESSED,
      energyPhysicalEvidenceAssessed: false,
      geographyNotEstablished: true,
    };
  }
  if (status === EPB_ATTACHMENT.NO_MATCH_FOUND) {
    return {
      domainStatus: DOMAIN_STATUS.NOT_ASSESSED,
      assessment: KERNEL_ASSESSMENT.NOT_ASSESSED,
      energyPhysicalEvidenceAssessed: false,
      noMatchFound: true,
    };
  }
  return {
    domainStatus: DOMAIN_STATUS.NOT_ASSESSED,
    assessment: KERNEL_ASSESSMENT.NOT_ASSESSED,
    energyPhysicalEvidenceAssessed: false,
  };
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
  epbEvidence = null,
} = {}) {
  const subjectRef = subjectRefFromIdentity(identity);
  const assetClass = assetClassification?.assetClass || ASSET_CLASS.UNKNOWN;
  const facts = propertyFacts?.facts || {};
  const docs = Array.isArray(documents) ? documents : [];
  const observed = Array.isArray(inspections) ? inspections : [];
  const defectRecords = Array.isArray(defects) ? defects : [];
  const epb = readEpb(epbEvidence);
  const epbMapped = mapEpbStatus(epb);

  const professionalSurvey = docs.some((doc) => doc.professionalDocument === true);
  const epcPresent = factAvailable(facts.epcRating) || epbMapped.energyPhysicalEvidenceAssessed;
  const floorPlanPresent = docs.some((doc) => doc.documentType === 'FLOOR_PLAN')
    || Boolean(propertyFacts?.documents?.floorPlan);
  const hasBuildingEvidence = hasBuildingOnSite === true
    || professionalSurvey
    || observed.length > 0
    || epbMapped.energyPhysicalEvidenceAssessed
    || assetClass !== ASSET_CLASS.LAND;

  if (landWithoutBuilding(assetClass, hasBuildingOnSite === true || professionalSurvey || observed.length > 0 || epbMapped.energyPhysicalEvidenceAssessed)) {
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
        professionalBuildingConditionAssessed: false,
        energyPhysicalEvidenceAssessed: false,
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
        wiredIntoLiveAnalysis: true,
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
      text: 'PROFESSIONAL BUILDING CONDITION NOT ASSESSED. No professional condition evidence is available. Building condition has not been inspected.',
    });
  }
  if (epbMapped.energyPhysicalEvidenceAssessed) {
    findings.push({
      id: 'energy_physical_evidence_assessed',
      text: 'ENERGY / PHYSICAL EVIDENCE ASSESSED from official MHCLG EPB. EPC is not a survey.',
    });
  } else if (factAvailable(facts.epcRating)) {
    findings.push({
      id: 'epc_is_not_condition',
      text: `EPC ${facts.epcRating.value} is available but does not constitute a condition assessment.`,
    });
  }
  if (epbMapped.sourceOutsideGeography) {
    findings.push({
      id: 'epb_source_outside_geography',
      text: 'Official EPC source covers England and Wales only. Missing evidence here is source geography, not a property conclusion.',
    });
  }
  if (epbMapped.unresolvedUnitIdentity) {
    findings.push({
      id: 'epb_unresolved_unit_identity',
      text: 'Official EPC evidence was not attached — unit identity unresolved. A building-level certificate was not used as flat evidence.',
    });
  } else if (epbMapped.unresolvedIdentity) {
    findings.push({
      id: 'epb_unresolved_identity',
      text: 'Official EPC evidence was not attached — subject identity unresolved.',
    });
  }
  if (epbMapped.geographyNotEstablished) {
    findings.push({
      id: 'epb_geography_not_established',
      text: 'Official EPC was not assessed because geography could not be established. That is not evidence the property has no EPC.',
    });
  }
  if (epbMapped.noMatchFound) {
    findings.push({
      id: 'epb_no_match_found',
      text: 'No exact official EPC match was found. That is not evidence the property has no EPC or is exempt.',
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

  const energyEvidence = epbMapped.energyPhysicalEvidenceAssessed
    ? epbEnergyEvidence(epb, subjectRef)
    : [];
  const roofRef = createComponentRef({ category: 'ROOF' });
  const status = professionalSurvey || observed.length || defectRecords.length || epbMapped.energyPhysicalEvidenceAssessed
    ? (epbMapped.energyPhysicalEvidenceAssessed && !professionalSurvey ? DOMAIN_STATUS.PARTIAL : DOMAIN_STATUS.PARTIAL)
    : epbMapped.domainStatus || DOMAIN_STATUS.NOT_ASSESSED;
  const assessmentState = professionalSurvey || observed.length
    ? KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE
    : (epbMapped.energyPhysicalEvidenceAssessed
      ? KERNEL_ASSESSMENT.ASSESSED
      : epbMapped.assessment || KERNEL_ASSESSMENT.NOT_ASSESSED);

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
    status,
    evidenceAsOf: epb?.inspectionDate || analysisAt || null,
    analysisAt: analysisAt || null,
    assessment: {
      state: assessmentState,
      scope: epbMapped.energyPhysicalEvidenceAssessed
        ? 'energy_physical_evidence'
        : 'building_condition_foundation',
      liveConditionAssessmentAvailable: false,
      inspectionCompleteness: completeness,
      roofCompleteness: INSPECTION_COMPLETENESS.NOT_INSPECTED,
      conditionVocabulary: CONDITION_VOCABULARY.UNKNOWN,
      professionalSurveyAvailable: professionalSurvey,
      professionalBuildingConditionAssessed: false,
      energyPhysicalEvidenceAssessed: epbMapped.energyPhysicalEvidenceAssessed,
      epcIsNotConditionSurvey: true,
      floorPlanIsNotConditionEvidence: true,
      photoIsNotProfessionalInspection: true,
      listingDescriptionIsNotProfessionalEvidence: true,
      buildRisksIsNotConditionEvidence: true,
      adjacentClassification: ADJACENT_NOT_CONDITION,
      remainingTermOrCostPublished: false,
      residentialComponentModelForced: false,
      sourceOutsideGeography: Boolean(epbMapped.sourceOutsideGeography),
      unresolvedIdentity: Boolean(epbMapped.unresolvedIdentity),
      noMatchFound: Boolean(epbMapped.noMatchFound),
      attachmentStatus: epb?.attachmentStatus || epb?.status || null,
    },
    findings,
    evidence: [...observed, ...energyEvidence],
    limitations: ENVELOPE_LIMITATIONS,
    unresolvedDependencies,
    investigationPriorities,
    provenance: {
      source: epbMapped.energyPhysicalEvidenceAssessed ? EPB_SOURCE : 'building-condition-foundation',
      adapter: BUILDING_CONDITION_DOMAIN_VERSION,
      wrapsExistingEvidence: true,
      noAdditionalProviderCall: !epb,
      wiredIntoLiveAnalysis: true,
      buildRisksPromoted: false,
      epcIsNotSurvey: true,
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
    const adapted = adaptBuildingConditionFoundation(args || {});
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
          professionalBuildingConditionAssessed: false,
          epcIsNotConditionSurvey: true,
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
