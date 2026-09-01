/**
 * Legal & Title foundation adapter.
 * Reports evidence completeness, private document presence, and adjacent
 * tenure/lease facts only. Does not query providers, score title, or
 * interpret covenants.
 */

const {
  createDomainEnvelope,
  createDecisionContribution,
  DOMAIN_ID,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  VISIBILITY,
  LEGAL_TITLE_DOMAIN_VERSION,
  ASSET_CLASS,
  createTitleRef,
  createLegalTitleFact,
  missingDocumentAssessment,
  describeTenureConflict,
  normalizeTenureValue,
  MISSING_DOCUMENT,
  LEGAL_CONFLICT,
  LEGAL_FACT_TYPE,
  LEGAL_ROLE,
  LEGAL_EVIDENCE_CLASS,
  DESIGNATION_OWNERSHIP,
} = require('../../architecture');
const { subjectRefFromIdentity } = require('./subjectRef');

const FORBIDDEN_CONCLUSION = /clean title|good title|title is good|no restriction|no covenant|no easement|no charge|no lease issue|legally safe|purchase is safe|covenant is harmless|lease is good|lease is bad|development permitted|access guaranteed|mortgageable|saleable|safe to purchase|legal advice|instruct a solicitor|legal-risk|legal risk score/i;

const ENVELOPE_LIMITATIONS = Object.freeze([
  'TITLE REGISTER = NOT AVAILABLE.',
  'TITLE PLAN = NOT AVAILABLE.',
  'HM Land Registry Price Paid / sold-price data is not title-register evidence.',
  'UPRN is not a title number.',
  'A property is not a title. One property may involve multiple titles.',
  'Listing-declared tenure is not authoritative title evidence.',
  'Registered-lease metadata is adjacent evidence, not a title register or lease document.',
  'EPC occupancy tenure is not legal tenure.',
  'Missing legal evidence is not “no restriction”, “clean title”, or freehold.',
  'Listed building, conservation area, and Article 4 are not title evidence.',
  'This is not legal advice.',
]);

function factAvailable(fact) {
  return Boolean(fact && fact.available === true && fact.value != null && fact.value !== '');
}

function listingTenureSource(fact) {
  const source = fact?.source || '';
  if (/InternalListing/i.test(source)) return SOURCE_TYPE.USER_REPORTED;
  if (/registeredLeases/i.test(source)) return SOURCE_TYPE.LICENSED_PROVIDER;
  return SOURCE_TYPE.USER_REPORTED;
}

function collectTitleRefs(input = {}) {
  const refs = [];
  const seen = new Set();
  (input.titleRefs || []).forEach((row) => {
    const ref = row && row.entityKind ? row : createTitleRef(row || {});
    if (!ref.present) return;
    const key = `${ref.identifierType}:${ref.identifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  });
  return refs;
}

function detectTenureConflict(propertyFacts = {}, listingTenure = null) {
  const fact = propertyFacts?.facts?.tenure;
  const listing = normalizeTenureValue(listingTenure || (fact?.source === 'InternalListing' ? fact?.value : null));
  const leases = propertyFacts?.registeredLeases || [];
  const leaseholdFromRegister = Array.isArray(leases) && leases.length > 0 ? 'LEASEHOLD' : null;
  const overlay = normalizeTenureValue(fact?.source === 'PropertyData_registeredLeases' ? fact?.value : null);
  const registered = overlay || leaseholdFromRegister;
  if (listing && registered && listing !== registered) {
    return describeTenureConflict(
      { value: listing, source: 'InternalListing', sourceType: SOURCE_TYPE.USER_REPORTED },
      { value: registered, source: 'PropertyData_registeredLeases', sourceType: SOURCE_TYPE.LICENSED_PROVIDER }
    );
  }
  return null;
}

function documentsOfType(docs, type) {
  return docs.filter((doc) => doc.documentType === type);
}

function collectDocumentTitleRefs(docs, supplied) {
  const refs = collectTitleRefs({ titleRefs: supplied });
  const seen = new Set(refs.map((ref) => `${ref.identifierType}:${ref.identifier}`));
  docs.forEach((doc) => {
    (doc.titleRefs || []).forEach((row) => {
      const ref = row && row.entityKind ? row : createTitleRef(row || {});
      if (!ref.present) return;
      const key = `${ref.identifierType}:${ref.identifier}`;
      if (seen.has(key)) return;
      seen.add(key);
      refs.push(ref);
    });
    if (doc.declaredTitleNumber) {
      const ref = createTitleRef({
        identifier: doc.declaredTitleNumber,
        source: doc.source || doc.sourceType,
      });
      const key = `${ref.identifierType}:${ref.identifier}`;
      if (ref.present && !seen.has(key)) {
        seen.add(key);
        refs.push(ref);
      }
    }
  });
  return refs;
}

function detectTitleNumberConflict(titleRefs) {
  const unique = [...new Set(titleRefs.filter((ref) => ref.present).map((ref) => ref.identifier))];
  if (unique.length < 2) return null;
  return describeTenureConflict(
    { value: unique[0], source: 'DeclaredTitleNumber' },
    { value: unique[1], source: 'DeclaredTitleNumber' }
  );
}

function documentAgeDays(doc, analysisAt) {
  const documentDate = doc.documentDate;
  if (!documentDate || !analysisAt) return null;
  const then = new Date(documentDate);
  const now = new Date(analysisAt);
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return null;
  return Math.floor((now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
}

function bytesAvailable(doc) {
  return doc.fileAvailability !== 'UNAVAILABLE' && doc.fileAvailability !== 'QUARANTINED';
}

function buildFindings({
  titleRefs,
  tenureFact,
  conflict,
  titleConflict,
  leaseDocumentProvided,
  leaseholdDeclared,
  registerDocuments,
  planDocuments,
  documents,
}) {
  const findings = [];
  if (registerDocuments.length > 0) {
    findings.push({
      id: 'title_register_supplied',
      text: 'Title register document supplied.',
    });
  } else if (titleRefs.length === 0) {
    findings.push({
      id: 'title_register_not_available',
      text: 'Title register is not available.',
    });
  }
  if (planDocuments.length > 0) {
    findings.push({
      id: 'title_plan_supplied',
      text: 'Title plan document supplied.',
    });
  } else if (titleRefs.length === 0 || registerDocuments.length > 0) {
    findings.push({
      id: 'title_plan_not_available',
      text: 'Title plan is not available.',
    });
  }
  if (leaseDocumentProvided) {
    findings.push({
      id: 'lease_document_supplied',
      text: 'Lease document supplied.',
    });
  }
  if (titleRefs.length > 0) {
    findings.push({
      id: 'title_reference_exists',
      text: 'Title number recorded from stated source. This is not a title-register assessment.',
    });
  }
  if (documents.length > 0) {
    findings.push({
      id: 'document_not_substantively_assessed',
      text: 'Uploaded document has not been substantively assessed.',
    });
    findings.push({
      id: 'legal_evidence_incomplete',
      text: 'Legal evidence is incomplete.',
    });
    if (documents.some((doc) => doc.documentDate)) {
      findings.push({
        id: 'document_date_recorded',
        text: 'A document date is recorded. Current register status is not assessed.',
      });
    }
    if (documents.some((doc) => !bytesAvailable(doc))) {
      findings.push({
        id: 'stored_bytes_unavailable',
        text: 'Stored document bytes are unavailable. Metadata is not validated availability.',
      });
    }
    findings.push({
      id: 'high_risk_content_not_assessed',
      text: 'Covenants, easements, charges, and restrictions were not assessed. Missing extraction is not an absence of those rights.',
    });
  }
  if (factAvailable(tenureFact)) {
    findings.push({
      id: 'tenure_evidence_present',
      text: `Tenure evidence is present from ${tenureFact.source || 'an adjacent source'}. Declared tenure is not authoritative title evidence.`,
    });
  }
  if (conflict) {
    findings.push({
      id: 'conflicting_tenure_evidence',
      text: 'Conflicting tenure evidence exists. Neither value was selected.',
    });
  }
  if (titleConflict) {
    findings.push({
      id: 'conflicting_title_references',
      text: 'Conflicting declared title evidence exists. Neither value was selected.',
    });
  }
  if (leaseholdDeclared && !leaseDocumentProvided) {
    findings.push({
      id: 'lease_document_not_provided',
      text: 'Lease document has not been provided. Missing lease is not freehold.',
    });
  }
  findings.push({
    id: 'legal_assessment_not_available',
    text: 'Legal/title evidence cannot be assessed as title quality, restriction, or ownership.',
  });
  findings.forEach((row) => {
    if (FORBIDDEN_CONCLUSION.test(row.text) && row.id !== 'lease_document_not_provided'
      && row.id !== 'high_risk_content_not_assessed') {
      throw new Error('LEGAL_TITLE_FORBIDDEN_CONCLUSION');
    }
  });
  return findings;
}

function buildUnresolved({
  titleRefs,
  conflict,
  titleConflict,
  leaseholdDeclared,
  leaseDocumentProvided,
  registerDocuments,
  planDocuments,
  documents,
  analysisAt,
}) {
  const items = [];
  if (registerDocuments.length === 0 && titleRefs.length === 0) {
    items.push({
      id: MISSING_DOCUMENT.TITLE_REGISTER_NOT_PROVIDED,
      text: 'Obtain an official title register.',
    });
  }
  if (planDocuments.length === 0 && (titleRefs.length === 0 || registerDocuments.length > 0)) {
    items.push({
      id: MISSING_DOCUMENT.TITLE_PLAN_NOT_PROVIDED,
      text: 'Obtain an official title plan.',
    });
  }
  if (leaseholdDeclared && !leaseDocumentProvided) {
    items.push({
      id: MISSING_DOCUMENT.LEASE_NOT_PROVIDED,
      text: 'Provide the lease document.',
    });
  }
  if (documents.length > 0) {
    items.push({
      id: 'SUBSTANTIVE_PROVISIONS_NOT_ASSESSED',
      text: 'Substantive provisions in the supplied document have not been assessed.',
    });
  }
  void analysisAt;
  if (conflict || titleConflict) {
    items.push({
      id: LEGAL_CONFLICT.CONFLICTING_EVIDENCE,
      text: titleConflict && !conflict
        ? 'Resolve conflicting title references.'
        : 'Resolve conflicting tenure evidence.',
    });
  }
  return items;
}

function adaptLegalTitleFoundation({
  propertyFacts = null,
  listingTenure = null,
  documents = [],
  titleRefs: suppliedTitleRefs = [],
  identity = {},
  assetClassification = null,
  analysisAt = null,
} = {}) {
  const subjectRef = subjectRefFromIdentity(identity);
  const docs = Array.isArray(documents) ? documents : [];
  const titleRefs = collectDocumentTitleRefs(docs, suppliedTitleRefs);
  titleRefs.forEach((ref) => {
    if (identity?.uprn && ref.identifier && String(ref.identifier) === String(identity.uprn)) {
      throw new Error('UPRN_IS_NOT_A_TITLE_NUMBER');
    }
  });

  const tenureFact = propertyFacts?.facts?.tenure || null;
  const leaseStart = propertyFacts?.facts?.leaseStart || null;
  const leaseEnd = propertyFacts?.facts?.leaseEnd || null;
  const occupancy = propertyFacts?.facts?.occupancyTenure || null;
  const conflict = detectTenureConflict(propertyFacts, listingTenure);
  const titleConflict = detectTitleNumberConflict(titleRefs);
  const registerDocuments = documentsOfType(docs, 'TITLE_REGISTER').filter(bytesAvailable);
  const planDocuments = documentsOfType(docs, 'TITLE_PLAN').filter(bytesAvailable);
  const leaseDocumentProvided = docs.some((doc) => doc.documentType === 'LEASE' && bytesAvailable(doc));
  const declared = normalizeTenureValue(listingTenure || tenureFact?.value);
  const leaseholdDeclared = declared === 'LEASEHOLD';

  const missingRegister = registerDocuments.length > 0
    ? {
      reason: null,
      state: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE,
      value: null,
      present: true,
      contentsAssessed: false,
      notFalse: true,
      notClearTitle: true,
    }
    : missingDocumentAssessment(MISSING_DOCUMENT.TITLE_REGISTER_NOT_PROVIDED);
  const missingPlan = planDocuments.length > 0
    ? {
      reason: null,
      state: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE,
      value: null,
      present: true,
      contentsAssessed: false,
      notFalse: true,
      notClearTitle: true,
    }
    : missingDocumentAssessment(MISSING_DOCUMENT.TITLE_PLAN_NOT_PROVIDED);

  const evidence = [];
  if (factAvailable(tenureFact) && !conflict) {
    evidence.push(createLegalTitleFact({
      factType: LEGAL_FACT_TYPE.TENURE,
      value: normalizeTenureValue(tenureFact.value) || tenureFact.value,
      subjectRef,
      classification: listingTenureSource(tenureFact) === SOURCE_TYPE.LICENSED_PROVIDER
        ? EVIDENCE_CLASS.FACT
        : EVIDENCE_CLASS.USER_INPUT,
      sourceType: listingTenureSource(tenureFact),
      provenance: {
        source: tenureFact.source || 'InternalListing',
        method: tenureFact.method || 'listing_or_registered_lease_metadata',
      },
      retrievedAt: tenureFact.retrievedAt || null,
      evidenceAsOf: tenureFact.evidenceAsOf || analysisAt || null,
      assessmentState: KERNEL_ASSESSMENT.ASSESSED,
      limitations: ['Adjacent tenure evidence. Not a title-register conclusion.'],
      legalRole: LEGAL_ROLE.DOCUMENT_FACT,
      legalClass: LEGAL_EVIDENCE_CLASS.LEGAL_TITLE_ADJACENT,
    }));
  }
  if (factAvailable(leaseStart)) {
    evidence.push(createLegalTitleFact({
      factType: LEGAL_FACT_TYPE.LEASE_START_DATE,
      value: leaseStart.value,
      subjectRef,
      documentRef: leaseStart.leaseId || null,
      classification: EVIDENCE_CLASS.FACT,
      sourceType: SOURCE_TYPE.LICENSED_PROVIDER,
      provenance: {
        source: leaseStart.source || 'PropertyData_registeredLeases',
        method: leaseStart.method || 'registered_lease_term_start',
      },
      effectiveFrom: leaseStart.value,
      retrievedAt: leaseStart.retrievedAt || null,
      evidenceAsOf: leaseStart.evidenceAsOf || analysisAt || null,
      assessmentState: KERNEL_ASSESSMENT.ASSESSED,
      limitations: ['Registered-lease metadata date. Not a lease document extraction.'],
      legalRole: LEGAL_ROLE.EXTRACTED_FACT,
      legalClass: LEGAL_EVIDENCE_CLASS.LEGAL_TITLE_ADJACENT,
    }));
  }
  if (factAvailable(leaseEnd)) {
    evidence.push(createLegalTitleFact({
      factType: LEGAL_FACT_TYPE.LEASE_END_DATE,
      value: leaseEnd.value,
      subjectRef,
      documentRef: leaseEnd.leaseId || null,
      classification: EVIDENCE_CLASS.FACT,
      sourceType: SOURCE_TYPE.LICENSED_PROVIDER,
      provenance: {
        source: leaseEnd.source || 'PropertyData_registeredLeases',
        method: leaseEnd.method || 'registered_lease_term_end',
      },
      effectiveTo: leaseEnd.value,
      retrievedAt: leaseEnd.retrievedAt || null,
      evidenceAsOf: leaseEnd.evidenceAsOf || analysisAt || null,
      assessmentState: KERNEL_ASSESSMENT.ASSESSED,
      limitations: ['Registered-lease metadata date. Not a lease document extraction.'],
      legalRole: LEGAL_ROLE.EXTRACTED_FACT,
      legalClass: LEGAL_EVIDENCE_CLASS.LEGAL_TITLE_ADJACENT,
    }));
  }

  titleRefs.forEach((ref) => {
    const sourceDoc = docs.find((doc) => doc.declaredTitleNumber === ref.identifier
      || (doc.titleRefs || []).some((row) => row.identifier === ref.identifier));
    evidence.push(createLegalTitleFact({
      factType: LEGAL_FACT_TYPE.TITLE_NUMBER,
      value: ref.identifier,
      subjectRef,
      titleRef: ref,
      documentRef: sourceDoc?.documentId || null,
      classification: EVIDENCE_CLASS.USER_INPUT,
      sourceType: SOURCE_TYPE.USER_REPORTED,
      provenance: {
        source: ref.source || sourceDoc?.source || 'UserReportedTitleReference',
        documentId: sourceDoc?.documentId || null,
        verificationState: sourceDoc?.verificationState || 'USER_DECLARED',
      },
      documentDate: sourceDoc?.documentDate || null,
      evidenceAsOf: sourceDoc?.evidenceAsOf || analysisAt || null,
      assessmentState: KERNEL_ASSESSMENT.ASSESSED,
      limitations: ['Identifier only. Not a title-register extract.', 'UPRN is not a title number.'],
      legalRole: LEGAL_ROLE.DOCUMENT_FACT,
      legalClass: LEGAL_EVIDENCE_CLASS.LEGAL_TITLE_CORE,
      visibility: sourceDoc ? VISIBILITY.PRIVATE : undefined,
    }));
  });
  docs.forEach((doc) => {
    if (!doc.documentDate) return;
    evidence.push(createLegalTitleFact({
      factType: LEGAL_FACT_TYPE.DOCUMENT_DATE,
      value: doc.documentDate,
      subjectRef,
      documentRef: doc.documentId,
      classification: EVIDENCE_CLASS.USER_INPUT,
      sourceType: SOURCE_TYPE.USER_REPORTED,
      provenance: { source: doc.source || 'UserUploadedDocument', documentId: doc.documentId },
      documentDate: doc.documentDate,
      evidenceAsOf: doc.evidenceAsOf || analysisAt || null,
      assessmentState: KERNEL_ASSESSMENT.ASSESSED,
      limitations: ['Document date is metadata. Current register status is not assessed.'],
      legalRole: LEGAL_ROLE.DOCUMENT_FACT,
      legalClass: LEGAL_EVIDENCE_CLASS.LEGAL_TITLE_CORE,
      visibility: VISIBILITY.PRIVATE,
    }));
  });

  const findings = buildFindings({
    titleRefs,
    tenureFact,
    conflict,
    titleConflict,
    leaseDocumentProvided,
    leaseholdDeclared,
    registerDocuments,
    planDocuments,
    documents: docs.map((doc) => ({ ...doc, analysisAt })),
  });
  const unresolvedDependencies = buildUnresolved({
    titleRefs,
    conflict,
    titleConflict,
    leaseholdDeclared,
    leaseDocumentProvided,
    registerDocuments,
    planDocuments,
    documents: docs,
    analysisAt,
  });
  const investigationPriorities = unresolvedDependencies.map((row) => ({
    id: row.id,
    text: row.text,
  }));

  const envelope = createDomainEnvelope({
    domain: DOMAIN_ID.LEGAL_TITLE,
    version: LEGAL_TITLE_DOMAIN_VERSION,
    subject: {
      ref: subjectRef,
      assetClass: assetClassification?.assetClass || ASSET_CLASS.UNKNOWN,
      titles: titleRefs,
      propertyIsNotTitle: true,
    },
    status: evidence.length > 0 || conflict || titleConflict || docs.length > 0
      ? DOMAIN_STATUS.PARTIAL
      : DOMAIN_STATUS.NOT_ASSESSED,
    evidenceAsOf: analysisAt || tenureFact?.evidenceAsOf || null,
    analysisAt: analysisAt || null,
    assessment: {
      state: KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE,
      scope: 'legal_title_foundation_completeness',
      liveLegalAssessmentAvailable: false,
      substantiveContentsAssessed: false,
      currentRegisterStatus: KERNEL_ASSESSMENT.NOT_ASSESSED,
      documentAges: docs.map((doc) => ({
        documentId: doc.documentId,
        documentDate: doc.documentDate || null,
        analysisAt: analysisAt || null,
        ageDays: documentAgeDays(doc, analysisAt),
      })),
      titleRegisterAvailable: registerDocuments.length > 0,
      titlePlanAvailable: planDocuments.length > 0,
      titleRegister: missingRegister,
      titlePlan: missingPlan,
      documentsPresent: docs.length > 0,
      highRiskContent: {
        covenants: 'CONTENT_NOT_ASSESSED',
        easements: 'CONTENT_NOT_ASSESSED',
        charges: 'CONTENT_NOT_ASSESSED',
        restrictions: 'CONTENT_NOT_ASSESSED',
      },
      absenceSemantics: {
        noExtractedCovenant: 'NOT_NO_COVENANT',
        noExtractedEasement: 'NOT_NO_EASEMENT',
        noExtractedCharge: 'NOT_NO_CHARGE',
        noExtractedRestriction: 'NOT_NO_RESTRICTION',
        noTitlePlan: 'NOT_NO_BOUNDARY_ISSUE',
        noLegalDocument: 'NOT_GOOD_TITLE',
      },
      conflict: conflict || titleConflict || null,
      occupancyTenureIsNotLegalTenure: occupancy?.notLegalTenure === true,
      designationOwnership: DESIGNATION_OWNERSHIP,
      remainingTermPublishedByAdapter: false,
      legalRiskScore: null,
      solicitorRecommendation: null,
    },
    findings,
    evidence,
    limitations: [
      ...ENVELOPE_LIMITATIONS,
      'DOCUMENT != FACT.',
      'UPLOAD != AUTHENTICITY VERIFICATION.',
      'NO EXTRACTED COVENANT != NO COVENANT EXISTS.',
      'NO EXTRACTED EASEMENT != NO EASEMENT EXISTS.',
      'NO EXTRACTED CHARGE != NO CHARGE EXISTS.',
      'NO EXTRACTED RESTRICTION != NO RESTRICTION EXISTS.',
      'OLD REGISTER != CURRENT TITLE STATUS.',
      'This is not legal advice.',
    ],
    unresolvedDependencies,
    investigationPriorities,
    provenance: {
      source: 'legal-title-foundation',
      adapter: LEGAL_TITLE_DOMAIN_VERSION,
      wrapsExistingEvidence: true,
      noAdditionalProviderCall: true,
      wiredIntoLiveAnalysis: true,
      documentsSnapshotted: docs.length,
      extractionAttempted: false,
    },
  });

  const contribution = createDecisionContribution({
    domain: DOMAIN_ID.LEGAL_TITLE,
    domainVersion: LEGAL_TITLE_DOMAIN_VERSION,
    materialFindings: findings.map((row) => row.text),
    unresolvedDependencies: unresolvedDependencies.map((row) => row.text),
    investigationPriorities: investigationPriorities.map((row) => row.text),
    sensitivityDrivers: [],
    limitations: ENVELOPE_LIMITATIONS,
  });

  return {
    envelope,
    contribution,
    assetClassUnchanged: assetClassification?.assetClass || ASSET_CLASS.UNKNOWN,
  };
}

function attachLegalTitleFoundation(args) {
  try {
    const adapted = adaptLegalTitleFoundation(args);
    return {
      legalTitleDomain: adapted.envelope,
      legalTitleContribution: adapted.contribution,
    };
  } catch {
    return {
      legalTitleDomain: createDomainEnvelope({
        domain: DOMAIN_ID.LEGAL_TITLE,
        version: LEGAL_TITLE_DOMAIN_VERSION,
        status: DOMAIN_STATUS.NOT_ASSESSED,
        assessment: {
          state: KERNEL_ASSESSMENT.NOT_ASSESSED,
          liveLegalAssessmentAvailable: false,
          titleRegisterAvailable: false,
          titlePlanAvailable: false,
        },
        limitations: ENVELOPE_LIMITATIONS,
        findings: [{
          id: 'adapter_degraded',
          text: 'Legal/title foundation could not be assembled from the attached evidence.',
        }],
      }),
      legalTitleContribution: null,
    };
  }
}

module.exports = {
  LEGAL_TITLE_DOMAIN_VERSION,
  adaptLegalTitleFoundation,
  attachLegalTitleFoundation,
  ENVELOPE_LIMITATIONS,
};
