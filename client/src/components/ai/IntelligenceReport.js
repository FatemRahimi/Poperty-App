import React, { useState } from 'react';
import { FaPrint, FaFileDownload } from 'react-icons/fa';
import './IntelligenceReport.css';
import PostcodeIntelligencePanel from './PostcodeIntelligencePanel';

const fmt = (n) => (n != null && !Number.isNaN(Number(n)) ? `£${Number(n).toLocaleString()}` : '—');
const fmtPct = (n) => (n != null ? `${n}%` : '—');

function completenessCopy(value) {
  if (value === 'COMPLETE_EVIDENCE') return 'Complete';
  if (value === 'PARTIAL_EVIDENCE') return 'Partial';
  if (value === 'NOT_ASSESSED') return 'Not assessed';
  return 'Not assessed';
}

function completenessClass(value) {
  if (value === 'COMPLETE_EVIDENCE') return 'assessed';
  if (value === 'PARTIAL_EVIDENCE') return 'partial';
  return 'missing';
}

const MISSING_LABELS = {
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  managementFee: 'Management fee',
  taxes: 'Other landlord taxes/costs',
  vacancyAssumption: 'Vacancy assumption',
  serviceCharge: 'Service charge',
  groundRent: 'Ground rent',
  deposit: 'Deposit',
  interestRate: 'Interest rate',
  mortgageTermYears: 'Mortgage term',
};

function PresentedMetric({ label, field, format = fmt, testId }) {
  const assessed = Boolean(field?.available);
  return (
    <div className={`pi-metric-tile ${assessed ? 'pi-metric-tile--assessed' : 'pi-metric-tile--missing'}`} data-testid={testId}>
      <small>{label}</small>
      <strong>{assessed ? format(field.value) : 'Not assessed'}</strong>
      {assessed ? <em>Calculated result</em> : (field?.reason && <em>{field.reason}</em>)}
    </div>
  );
}

// "Not assessed" must not be styled as low confidence — nothing was measured.
const confidenceClass = (level) => {
  const v = (level || '').toLowerCase();
  if (v === 'high') return 'high';
  if (v === 'medium') return 'medium';
  if (v === 'low') return 'low';
  return 'none';
};

const confidenceBadge = (level) => {
  if (!level) return null;
  const v = String(level).toLowerCase();
  return v === 'not assessed' || v === 'insufficient'
    ? 'Confidence not assessed'
    : `${level} confidence`;
};

function hasCanonicalDecisionIntelligence(report) {
  return Boolean(report?.decisionIntelligence);
}

function hasLegacyHeuristicFields(report) {
  return Boolean(
    (Array.isArray(report?.strengths) && report.strengths.length) ||
    (Array.isArray(report?.weaknesses) && report.weaknesses.length) ||
    (Array.isArray(report?.opportunities) && report.opportunities.length) ||
    (Array.isArray(report?.risks) && report.risks.length) ||
    report?.recommendation
  );
}

function showEarlierModelHeuristic(report) {
  return !hasCanonicalDecisionIntelligence(report) && hasLegacyHeuristicFields(report);
}

function SourceBadge({ source }) {
  if (!source) return null;
  return <span className="pi-source-badge">{source}</span>;
}

function ReportSection({ id, title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${id || `pi-fold-${String(title).replace(/\s+/g, '-').toLowerCase()}`}-body`;
  return (
    <section className={`pi-fold ${open ? 'open' : ''}`} id={id}>
      <h2 className="pi-fold-heading">
        <button
          type="button"
          className="pi-fold-header"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className="pi-fold-title">{title}</span>
          {badge && <span className="pi-fold-badge">{badge}</span>}
          <span className="pi-fold-chevron" aria-hidden>{open ? '−' : '+'}</span>
        </button>
      </h2>
      {open && <div className="pi-fold-body" id={panelId}>{children}</div>}
    </section>
  );
}

const SCORE_COMPONENT_LABELS = {
  market: 'Market',
  rent: 'Rent',
  investment: 'Investment',
  demand: 'Demand',
  risk: 'Risk',
  dataQuality: 'Data quality',
};

function factKind(fact, { implication = false } = {}) {
  if (!fact || !fact.available) return 'NOT ASSESSED';
  if (implication || fact.layer === 'implication' || fact.trust === 'calculated') return 'CALCULATED RESULT';
  if (fact.trust === 'userSupplied' || fact.source === 'InternalListing') return 'FACT';
  if (fact.scope === 'area' || fact.trust === 'areaContext') return 'AREA CONTEXT';
  return 'FACT';
}

function factSourceLabel(fact) {
  if (!fact?.available) return null;
  if (fact.source === 'InternalListing') return 'Listing';
  if (fact.source === 'EnvironmentAgency_FloodMapForPlanning' || fact.provider === 'EnvironmentAgency') {
    return 'Environment Agency Flood Map for Planning';
  }
  if (fact.source === 'MHCLG_PlanningData_EducationalEstablishment') {
    return 'DfE GIAS via MHCLG Planning Data';
  }
  if (fact.source === 'MHCLG_PlanningData_ListedBuilding') {
    return 'Historic England NHLE via MHCLG Planning Data';
  }
  if (fact.source === 'MHCLG_PlanningData_ConservationArea') {
    return 'Conservation areas via MHCLG Planning Data';
  }
  if (fact.source === 'MHCLG_PlanningData_Article4DirectionArea') {
    return 'Article 4 direction areas via MHCLG Planning Data';
  }
  if (fact.source === 'MHCLG_PlanningData' || fact.provider === 'MHCLG_PlanningData') {
    return 'MHCLG Planning Data';
  }
  if (fact.source === 'PropertyData_registeredLeases' || fact.provider === 'PropertyData') {
    return fact.method && String(fact.method).includes('lease')
      ? 'HM Land Registry via PropertyData'
      : 'PropertyData';
  }
  return fact.source || fact.provider || null;
}

function formatFactValue(fact, { unit, yesLabel } = {}) {
  if (!fact?.available) return 'Not assessed';
  if (fact.value === true) return yesLabel || 'Yes';
  if (fact.value === false) return 'No';
  if (unit) return `${fact.value} ${unit}`;
  return String(fact.value);
}

const FLOOD_REASON_LABELS = {
  provider_disabled: 'Flood lookup is disabled',
  property_location_unavailable: 'Property location unavailable',
  unsupported_geography: 'Unsupported geography',
  provider_unavailable: 'Provider unavailable',
  no_applicable_evidence_returned: 'No applicable evidence returned',
  malformed_provider_response: 'Malformed provider response',
  not_attached: 'Flood evidence was not attached',
};

function floodTypeLabel(fact) {
  if (Array.isArray(fact?.floodTypes) && fact.floodTypes.includes('rivers_and_sea')) {
    return 'Rivers and sea';
  }
  return null;
}

function formatRetrievedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function FloodFactRow({ fact, testId = 'fact-flood' }) {
  const kind = factKind(fact);
  const assessed = Boolean(fact?.available);
  const reasonLabel = FLOOD_REASON_LABELS[fact?.unavailableReason] || fact?.unavailableReason || null;
  const typeLabel = floodTypeLabel(fact);
  const retrieved = formatRetrievedAt(fact?.retrievedAt || fact?.evidenceAsOf);
  const showScope = Boolean(fact?.geographicResolution) && (
    assessed
    || fact?.unavailableReason === 'no_applicable_evidence_returned'
    || fact?.unavailableReason === 'unsupported_geography'
  );
  return (
    <div
      className={`pi-fact-row pi-fact-row--wide ${assessed ? '' : 'pi-fact-row--missing'}`}
      data-testid={testId}
    >
      <span className={`pi-fact-kind pi-fact-kind--${kind.toLowerCase().replace(/\s+/g, '-')}`}>
        {kind}
      </span>
      <div className="pi-fact-body">
        <span className="pi-fact-label">Flood</span>
        <strong data-testid={`${testId}-value`}>
          {assessed ? String(fact.value) : 'NOT ASSESSED'}
        </strong>
        {assessed && typeLabel && (
          <em className="pi-fact-meta" data-testid={`${testId}-type`}>Type: {typeLabel}</em>
        )}
        {assessed && factSourceLabel(fact) && (
          <em className="pi-fact-meta" data-testid={`${testId}-source`}>Source: {factSourceLabel(fact)}</em>
        )}
        {showScope && (
          <em className="pi-fact-meta" data-testid={`${testId}-scope`}>Scope: {fact.geographicResolution}</em>
        )}
        {retrieved && (
          <em className="pi-fact-meta" data-testid={`${testId}-retrieved`}>Retrieved: {retrieved}</em>
        )}
        {!assessed && reasonLabel && (
          <em className="pi-fact-meta" data-testid={`${testId}-reason`}>Reason: {reasonLabel}</em>
        )}
        {!assessed && fact?.note && (
          <em className="pi-fact-source">{fact.note}</em>
        )}
        {assessed && Array.isArray(fact?.limitations) && fact.limitations.length > 0 && (
          <em className="pi-fact-source" data-testid={`${testId}-limitations`}>
            {fact.limitations.join(' ')}
          </em>
        )}
      </div>
    </div>
  );
}

const PLANNING_REASON_LABELS = {
  provider_disabled: 'Planning lookup is disabled',
  property_location_unavailable: 'Property location unavailable',
  unsupported_geography: 'Unsupported geography',
  provider_unavailable: 'Provider unavailable',
  malformed_provider_response: 'Malformed provider response',
  no_applications_returned: 'No applications returned',
  not_attached: 'Planning evidence was not attached',
};

function formatMetres(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return `${Math.round(Number(value))}m`;
}

function PlanningApplicationItem({ row, testId }) {
  const distance = formatMetres(row?.distanceMetres);
  return (
    <article className="pi-planning-item" data-testid={testId}>
      <strong>{row?.reference || 'Application'}</strong>
      {row?.nativeStatus && <span className="pi-planning-status">{row.nativeStatus}</span>}
      {row?.nativeType && <em className="pi-fact-meta">Type: {row.nativeType}</em>}
      {row?.nativeDecisionType && <em className="pi-fact-meta">Decision: {row.nativeDecisionType}</em>}
      {distance && <em className="pi-fact-meta">Distance: {distance}</em>}
      {(row?.submittedDate || row?.decisionDate) && (
        <em className="pi-fact-meta">
          {row.submittedDate ? `Submitted: ${row.submittedDate}` : null}
          {row.submittedDate && row.decisionDate ? ' · ' : ''}
          {row.decisionDate ? `Decided: ${row.decisionDate}` : null}
        </em>
      )}
      {row?.address && <em className="pi-fact-meta">{row.address}</em>}
      {row?.description && <em className="pi-fact-source">{row.description}</em>}
    </article>
  );
}

function PlanningFactRow({ fact, testId = 'fact-planning' }) {
  const kind = factKind(fact);
  const assessed = Boolean(fact?.available);
  const reasonLabel = PLANNING_REASON_LABELS[fact?.unavailableReason] || fact?.unavailableReason || null;
  const retrieved = formatRetrievedAt(fact?.retrievedAt || fact?.evidenceAsOf);
  return (
    <div
      className={`pi-fact-row pi-fact-row--wide ${assessed ? '' : 'pi-fact-row--missing'}`}
      data-testid={testId}
    >
      <span className={`pi-fact-kind pi-fact-kind--${kind.toLowerCase().replace(/\s+/g, '-')}`}>
        {kind}
      </span>
      <div className="pi-fact-body">
        <span className="pi-fact-label">Planning</span>
        <strong data-testid={`${testId}-value`}>
          {assessed ? String(fact.value) : 'NOT ASSESSED'}
        </strong>
        {assessed && factSourceLabel(fact) && (
          <em className="pi-fact-meta" data-testid={`${testId}-source`}>Source: {factSourceLabel(fact)}</em>
        )}
        {assessed && fact?.searchRadiusMetres != null && (
          <em className="pi-fact-meta" data-testid={`${testId}-radius`}>
            Search radius: {fact.searchRadiusMetres}m
          </em>
        )}
        {retrieved && (
          <em className="pi-fact-meta" data-testid={`${testId}-retrieved`}>Retrieved: {retrieved}</em>
        )}
        {!assessed && reasonLabel && (
          <em className="pi-fact-meta" data-testid={`${testId}-reason`}>Reason: {reasonLabel}</em>
        )}
        {fact?.note && <em className="pi-fact-source">{fact.note}</em>}
      </div>
    </div>
  );
}

const SCHOOL_REASON_LABELS = {
  provider_disabled: 'School lookup is disabled',
  property_location_unavailable: 'Property location unavailable',
  unsupported_geography: 'Unsupported geography',
  provider_unavailable: 'Provider unavailable',
  malformed_provider_response: 'Malformed provider response',
  no_applicable_evidence_returned: 'No establishments returned',
  not_attached: 'School evidence was not attached',
  no_authoritative_catchment_source_integrated: 'No authoritative catchment source',
};

function SchoolItem({ row, testId }) {
  const distance = formatMetres(row?.distanceMetres);
  return (
    <article className="pi-planning-item" data-testid={testId}>
      <strong>{row?.name || 'Establishment'}</strong>
      {row?.nativeStatus && <span className="pi-planning-status">{row.nativeStatus}</span>}
      {row?.urn && <em className="pi-fact-meta">URN: {row.urn}</em>}
      {row?.nativeType && <em className="pi-fact-meta">Type: {row.nativeType}</em>}
      {distance && <em className="pi-fact-meta">Distance: {distance}</em>}
      {row?.inspection?.judgement && (
        <em className="pi-fact-meta">
          Inspection: {row.inspection.judgement}
          {row.inspection.inspectionDate ? ` (${row.inspection.inspectionDate})` : ''}
        </em>
      )}
    </article>
  );
}

function SchoolsFactRow({ fact, testId = 'fact-schools' }) {
  const kind = factKind(fact);
  const assessed = Boolean(fact?.available);
  const reasonLabel = SCHOOL_REASON_LABELS[fact?.unavailableReason] || fact?.unavailableReason || null;
  const retrieved = formatRetrievedAt(fact?.retrievedAt || fact?.evidenceAsOf);
  return (
    <div
      className={`pi-fact-row pi-fact-row--wide ${assessed ? '' : 'pi-fact-row--missing'}`}
      data-testid={testId}
    >
      <span className={`pi-fact-kind pi-fact-kind--${kind.toLowerCase().replace(/\s+/g, '-')}`}>
        {kind}
      </span>
      <div className="pi-fact-body">
        <span className="pi-fact-label">Schools</span>
        <strong data-testid={`${testId}-value`}>
          {assessed ? String(fact.value) : 'NOT ASSESSED'}
        </strong>
        {assessed && factSourceLabel(fact) && (
          <em className="pi-fact-meta" data-testid={`${testId}-source`}>Source: {factSourceLabel(fact)}</em>
        )}
        {assessed && fact?.searchRadiusMetres != null && (
          <em className="pi-fact-meta" data-testid={`${testId}-radius`}>
            Search radius: {fact.searchRadiusMetres}m
          </em>
        )}
        {retrieved && (
          <em className="pi-fact-meta" data-testid={`${testId}-retrieved`}>Retrieved: {retrieved}</em>
        )}
        {!assessed && reasonLabel && (
          <em className="pi-fact-meta" data-testid={`${testId}-reason`}>Reason: {reasonLabel}</em>
        )}
        {fact?.note && <em className="pi-fact-source">{fact.note}</em>}
      </div>
    </div>
  );
}

function SchoolsEducationSection({ report }) {
  const fact = report?.propertyFacts?.facts?.schools;
  if (!fact) return null;
  const nearby = Array.isArray(fact.nearbySchools) ? fact.nearbySchools : [];
  const assessed = Boolean(fact.available);
  const reasonLabel = SCHOOL_REASON_LABELS[fact.unavailableReason] || fact.unavailableReason || null;
  const catchmentReason =
    SCHOOL_REASON_LABELS[fact.catchment?.reason] || fact.catchment?.reason || 'No authoritative catchment source';
  return (
    <ReportSection
      title="Schools & education"
      badge={assessed ? 'Canonical evidence' : 'Not assessed'}
      defaultOpen={false}
    >
      <p className="pi-muted">
        Nearby official establishments are area context. They are not catchment schools, admission
        evidence, or a quality score. Distance is a straight-line measurement only.
      </p>
      {!assessed && (
        <p data-testid="schools-section-missing">
          NOT ASSESSED{reasonLabel ? ` — Reason: ${reasonLabel}` : ''}
        </p>
      )}
      {assessed && (
        <div className="pi-snapshot-grid" data-testid="schools-summary">
          <div><span>Nearby within {fact.searchRadiusMetres || 800}m</span>{fact.summary?.nearbyCount ?? nearby.length}</div>
          <div><span>Source</span>{factSourceLabel(fact) || 'DfE GIAS via MHCLG Planning Data'}</div>
        </div>
      )}
      {assessed && nearby.length > 0 && (
        <div data-testid="schools-nearby-list">
          <h4 className="pi-subheading">Nearby establishments</h4>
          {nearby.map((row, index) => (
            <SchoolItem
              key={row.urn || row.entityId || index}
              row={row}
              testId={`schools-nearby-${index}`}
            />
          ))}
        </div>
      )}
      <div className="pi-planning-item" data-testid="schools-catchment">
        <span className="pi-fact-kind pi-fact-kind--not-assessed">NOT ASSESSED</span>
        <div className="pi-fact-body">
          <span className="pi-fact-label">Catchment / admissions</span>
          <strong data-testid="schools-catchment-value">NOT ASSESSED</strong>
          <em className="pi-fact-meta" data-testid="schools-catchment-reason">Reason: {catchmentReason}</em>
          <em className="pi-fact-source">Nearby is not catchment. Catchment is not guaranteed admission.</em>
        </div>
      </div>
      {Array.isArray(fact.limitations) && fact.limitations.length > 0 && (
        <p className="pi-muted" data-testid="schools-limitations">{fact.limitations.join(' ')}</p>
      )}
    </ReportSection>
  );
}

const LISTED_BUILDING_REASON_LABELS = {
  provider_disabled: 'Listed-building lookup is disabled',
  property_location_unavailable: 'Property location unavailable',
  unsupported_geography: 'Unsupported geography',
  provider_unavailable: 'Provider unavailable',
  malformed_provider_response: 'Malformed provider response',
  no_applicable_evidence_returned: 'No listed building returned at these coordinates',
  not_attached: 'Listed-building evidence was not attached',
};

function ListedBuildingItem({ row, testId }) {
  const distance = formatMetres(row?.distanceMetres);
  const gradeLabel = row?.nativeGrade ? `Grade ${row.nativeGrade}` : null;
  return (
    <article className="pi-planning-item" data-testid={testId}>
      <strong>{row?.name || row?.listEntryNumber || 'Listed building'}</strong>
      {gradeLabel && <span className="pi-planning-status">{gradeLabel}</span>}
      {row?.listEntryNumber && <em className="pi-fact-meta">List entry: {row.listEntryNumber}</em>}
      {row?.listedDate && <em className="pi-fact-meta">Listed: {row.listedDate}</em>}
      {distance && <em className="pi-fact-meta">Distance: {distance}</em>}
    </article>
  );
}

function ListedBuildingFactRow({ fact, testId = 'fact-listedBuilding' }) {
  const kind = factKind(fact);
  const assessed = Boolean(fact?.available);
  const reasonLabel = LISTED_BUILDING_REASON_LABELS[fact?.unavailableReason] || fact?.unavailableReason || null;
  const retrieved = formatRetrievedAt(fact?.retrievedAt || fact?.evidenceAsOf);
  const showScope = Boolean(fact?.geographicResolution) && (
    assessed
    || fact?.unavailableReason === 'no_applicable_evidence_returned'
    || fact?.unavailableReason === 'unsupported_geography'
  );
  return (
    <div
      className={`pi-fact-row pi-fact-row--wide ${assessed ? '' : 'pi-fact-row--missing'}`}
      data-testid={testId}
    >
      <span className={`pi-fact-kind pi-fact-kind--${kind.toLowerCase().replace(/\s+/g, '-')}`}>
        {kind}
      </span>
      <div className="pi-fact-body">
        <span className="pi-fact-label">Listed building</span>
        <strong data-testid={`${testId}-value`}>
          {assessed ? String(fact.value) : 'NOT ASSESSED'}
        </strong>
        {assessed && fact?.nativeGrade && (
          <em className="pi-fact-meta" data-testid={`${testId}-grade`}>Grade: {fact.nativeGrade}</em>
        )}
        {assessed && factSourceLabel(fact) && (
          <em className="pi-fact-meta" data-testid={`${testId}-source`}>Source: {factSourceLabel(fact)}</em>
        )}
        {showScope && (
          <em className="pi-fact-meta" data-testid={`${testId}-scope`}>Scope: {fact.geographicResolution}</em>
        )}
        {retrieved && (
          <em className="pi-fact-meta" data-testid={`${testId}-retrieved`}>Retrieved: {retrieved}</em>
        )}
        {!assessed && reasonLabel && (
          <em className="pi-fact-meta" data-testid={`${testId}-reason`}>Reason: {reasonLabel}</em>
        )}
        {!assessed && fact?.note && (
          <em className="pi-fact-source">{fact.note}</em>
        )}
        {assessed && Array.isArray(fact?.limitations) && fact.limitations.length > 0 && (
          <em className="pi-fact-source" data-testid={`${testId}-limitations`}>
            {fact.limitations.join(' ')}
          </em>
        )}
      </div>
    </div>
  );
}

function ListedBuildingSection({ report }) {
  const fact = report?.propertyFacts?.facts?.listedBuilding;
  if (!fact) return null;
  const listings = Array.isArray(fact.listings) ? fact.listings : [];
  const assessed = Boolean(fact.available);
  const reasonLabel = LISTED_BUILDING_REASON_LABELS[fact.unavailableReason] || fact.unavailableReason || null;
  return (
    <ReportSection
      title="Listed building"
      badge={assessed ? 'Canonical evidence' : 'Not assessed'}
      defaultOpen={false}
    >
      <p className="pi-muted">
        Native Historic England grades are shown as recorded. Grade is not a heritage score.
        No listing at these coordinates is not proof that the property is not listed.
      </p>
      {!assessed && (
        <p data-testid="listed-building-section-missing">
          NOT ASSESSED{reasonLabel ? ` — Reason: ${reasonLabel}` : ''}
        </p>
      )}
      {assessed && (
        <div className="pi-snapshot-grid" data-testid="listed-building-summary">
          <div><span>At this location</span>{fact.summary?.subjectCount ?? listings.length}</div>
          <div><span>Native grade</span>{fact.nativeGrade ? `Grade ${fact.nativeGrade}` : '—'}</div>
          <div><span>Source</span>{factSourceLabel(fact) || 'Historic England NHLE via MHCLG Planning Data'}</div>
        </div>
      )}
      {assessed && listings.length > 0 && (
        <div data-testid="listed-building-list">
          <h4 className="pi-subheading">List entries at this property</h4>
          {listings.map((row, index) => (
            <ListedBuildingItem
              key={row.listEntryNumber || row.entityId || index}
              row={row}
              testId={`listed-building-${index}`}
            />
          ))}
        </div>
      )}
      {Array.isArray(fact.limitations) && fact.limitations.length > 0 && (
        <p className="pi-muted" data-testid="listed-building-limitations">{fact.limitations.join(' ')}</p>
      )}
    </ReportSection>
  );
}

const CONSERVATION_AREA_REASON_LABELS = {
  provider_disabled: 'Conservation-area lookup is disabled',
  property_location_unavailable: 'Property location unavailable',
  unsupported_geography: 'Unsupported geography',
  provider_unavailable: 'Provider unavailable',
  malformed_provider_response: 'Malformed provider response',
  no_applicable_evidence_returned: 'No conservation area returned at these coordinates',
  not_attached: 'Conservation-area evidence was not attached',
};

function ConservationAreaItem({ row, testId }) {
  return (
    <article className="pi-planning-item" data-testid={testId}>
      <strong>{row?.name || row?.reference || 'Conservation area'}</strong>
      {row?.reference && <em className="pi-fact-meta">Reference: {row.reference}</em>}
      {row?.designationDate && <em className="pi-fact-meta">Designated: {row.designationDate}</em>}
      {row?.entityId != null && <em className="pi-fact-meta">Entity: {row.entityId}</em>}
    </article>
  );
}

function ConservationAreaFactRow({ fact, testId = 'fact-conservationArea' }) {
  const kind = factKind(fact);
  const assessed = Boolean(fact?.available);
  const reasonLabel = CONSERVATION_AREA_REASON_LABELS[fact?.unavailableReason] || fact?.unavailableReason || null;
  const retrieved = formatRetrievedAt(fact?.retrievedAt || fact?.evidenceAsOf);
  const showScope = Boolean(fact?.geographicResolution) && (
    assessed
    || fact?.unavailableReason === 'no_applicable_evidence_returned'
    || fact?.unavailableReason === 'unsupported_geography'
  );
  return (
    <div
      className={`pi-fact-row pi-fact-row--wide ${assessed ? '' : 'pi-fact-row--missing'}`}
      data-testid={testId}
    >
      <span className={`pi-fact-kind pi-fact-kind--${kind.toLowerCase().replace(/\s+/g, '-')}`}>
        {kind}
      </span>
      <div className="pi-fact-body">
        <span className="pi-fact-label">Conservation area</span>
        <strong data-testid={`${testId}-value`}>
          {assessed ? String(fact.value) : 'NOT ASSESSED'}
        </strong>
        {assessed && factSourceLabel(fact) && (
          <em className="pi-fact-meta" data-testid={`${testId}-source`}>Source: {factSourceLabel(fact)}</em>
        )}
        {showScope && (
          <em className="pi-fact-meta" data-testid={`${testId}-scope`}>Scope: {fact.geographicResolution}</em>
        )}
        {retrieved && (
          <em className="pi-fact-meta" data-testid={`${testId}-retrieved`}>Retrieved: {retrieved}</em>
        )}
        {!assessed && reasonLabel && (
          <em className="pi-fact-meta" data-testid={`${testId}-reason`}>Reason: {reasonLabel}</em>
        )}
        {!assessed && fact?.note && (
          <em className="pi-fact-source">{fact.note}</em>
        )}
        {assessed && Array.isArray(fact?.limitations) && fact.limitations.length > 0 && (
          <em className="pi-fact-source" data-testid={`${testId}-limitations`}>
            {fact.limitations.join(' ')}
          </em>
        )}
      </div>
    </div>
  );
}

function ConservationAreaSection({ report }) {
  const fact = report?.propertyFacts?.facts?.conservationArea;
  if (!fact) return null;
  const areas = Array.isArray(fact.areas) ? fact.areas : [];
  const assessed = Boolean(fact.available);
  const reasonLabel = CONSERVATION_AREA_REASON_LABELS[fact.unavailableReason] || fact.unavailableReason || null;
  return (
    <ReportSection
      title="Conservation area"
      badge={assessed ? 'Canonical evidence' : 'Not assessed'}
      defaultOpen={false}
    >
      <p className="pi-muted">
        Membership is the property coordinate intersecting a conservation-area polygon. It is not a
        listed-building designation, a prohibition on alterations, or a valuation effect.
      </p>
      {!assessed && (
        <p data-testid="conservation-area-section-missing">
          NOT ASSESSED{reasonLabel ? ` — Reason: ${reasonLabel}` : ''}
        </p>
      )}
      {assessed && (
        <div className="pi-snapshot-grid" data-testid="conservation-area-summary">
          <div><span>Areas at this point</span>{fact.summary?.subjectCount ?? areas.length}</div>
          <div><span>Source</span>{factSourceLabel(fact) || 'Conservation areas via MHCLG Planning Data'}</div>
        </div>
      )}
      {assessed && areas.length > 0 && (
        <div data-testid="conservation-area-list">
          {areas.map((row, index) => (
            <ConservationAreaItem
              key={row.entityId || row.reference || index}
              row={row}
              testId={`conservation-area-${index}`}
            />
          ))}
        </div>
      )}
      {Array.isArray(fact.limitations) && fact.limitations.length > 0 && (
        <p className="pi-muted" data-testid="conservation-area-limitations">{fact.limitations.join(' ')}</p>
      )}
    </ReportSection>
  );
}

const ARTICLE_4_REASON_LABELS = {
  provider_disabled: 'Article 4 lookup is disabled',
  property_location_unavailable: 'Property location unavailable',
  unsupported_geography: 'Unsupported geography',
  provider_unavailable: 'Provider unavailable',
  malformed_provider_response: 'Malformed provider response',
  no_applicable_evidence_returned: 'No Article 4 direction area returned at these coordinates',
  not_attached: 'Article 4 evidence was not attached',
};

function Article4Item({ row, testId }) {
  return (
    <article className="pi-planning-item" data-testid={testId}>
      <strong>{row?.name || row?.reference || 'Article 4 Direction Area'}</strong>
      {row?.reference && <em className="pi-fact-meta">Reference: {row.reference}</em>}
      {row?.startDate && <em className="pi-fact-meta">Start: {row.startDate}</em>}
      {row?.endDate && <em className="pi-fact-meta">End: {row.endDate}</em>}
      {row?.entityId != null && <em className="pi-fact-meta">Entity: {row.entityId}</em>}
    </article>
  );
}

function Article4FactRow({ fact, testId = 'fact-article4' }) {
  const kind = factKind(fact);
  const assessed = Boolean(fact?.available);
  const reasonLabel = ARTICLE_4_REASON_LABELS[fact?.unavailableReason] || fact?.unavailableReason || null;
  const retrieved = formatRetrievedAt(fact?.retrievedAt || fact?.evidenceAsOf);
  const showScope = Boolean(fact?.geographicResolution) && (
    assessed
    || fact?.unavailableReason === 'no_applicable_evidence_returned'
    || fact?.unavailableReason === 'unsupported_geography'
  );
  return (
    <div
      className={`pi-fact-row pi-fact-row--wide ${assessed ? '' : 'pi-fact-row--missing'}`}
      data-testid={testId}
    >
      <span className={`pi-fact-kind pi-fact-kind--${kind.toLowerCase().replace(/\s+/g, '-')}`}>
        {kind}
      </span>
      <div className="pi-fact-body">
        <span className="pi-fact-label">Article 4 Direction Area</span>
        <strong data-testid={`${testId}-value`}>
          {assessed ? String(fact.value) : 'NOT ASSESSED'}
        </strong>
        {assessed && factSourceLabel(fact) && (
          <em className="pi-fact-meta" data-testid={`${testId}-source`}>Source: {factSourceLabel(fact)}</em>
        )}
        {showScope && (
          <em className="pi-fact-meta" data-testid={`${testId}-scope`}>Scope: {fact.geographicResolution}</em>
        )}
        {retrieved && (
          <em className="pi-fact-meta" data-testid={`${testId}-retrieved`}>Retrieved: {retrieved}</em>
        )}
        {assessed && (
          <em className="pi-fact-source" data-testid={`${testId}-membership`}>
            The property coordinates intersect a published Article 4 Direction Area. The specific
            permitted-development rights affected have not been assessed.
          </em>
        )}
        {assessed && (
          <>
            <span className="pi-fact-label">Permitted-development restrictions</span>
            <strong data-testid={`${testId}-restrictions`}>NOT ASSESSED</strong>
          </>
        )}
        {!assessed && reasonLabel && (
          <em className="pi-fact-meta" data-testid={`${testId}-reason`}>Reason: {reasonLabel}</em>
        )}
        {!assessed && fact?.note && (
          <em className="pi-fact-source">{fact.note}</em>
        )}
        {assessed && Array.isArray(fact?.limitations) && fact.limitations.length > 0 && (
          <em className="pi-fact-source" data-testid={`${testId}-limitations`}>
            {fact.limitations.join(' ')}
          </em>
        )}
      </div>
    </div>
  );
}

function Article4Section({ report }) {
  const fact = report?.propertyFacts?.facts?.article4;
  if (!fact) return null;
  const areas = Array.isArray(fact.areas) ? fact.areas : [];
  const assessed = Boolean(fact.available);
  const reasonLabel = ARTICLE_4_REASON_LABELS[fact.unavailableReason] || fact.unavailableReason || null;
  return (
    <ReportSection
      title="Article 4 Direction Area"
      badge={assessed ? 'Canonical evidence' : 'Not assessed'}
      defaultOpen={false}
    >
      <p className="pi-muted">
        Membership is the property coordinate intersecting a published Article 4 Direction Area
        polygon. It is geographic membership only. Restricted permitted-development rights are not
        assessed.
      </p>
      {!assessed && (
        <p data-testid="article4-section-missing">
          NOT ASSESSED{reasonLabel ? ` — Reason: ${reasonLabel}` : ''}
        </p>
      )}
      {assessed && (
        <div className="pi-snapshot-grid" data-testid="article4-summary">
          <div><span>Areas at this point</span>{fact.summary?.subjectCount ?? areas.length}</div>
          <div><span>Source</span>{factSourceLabel(fact) || 'Article 4 direction areas via MHCLG Planning Data'}</div>
        </div>
      )}
      {assessed && areas.length > 0 && (
        <div data-testid="article4-list">
          {areas.map((row, index) => (
            <Article4Item
              key={row.entityId || row.reference || index}
              row={row}
              testId={`article4-${index}`}
            />
          ))}
        </div>
      )}
      {assessed && (
        <p data-testid="article4-restrictions-section">
          Permitted-development restrictions: NOT ASSESSED
        </p>
      )}
      {Array.isArray(fact.limitations) && fact.limitations.length > 0 && (
        <p className="pi-muted" data-testid="article4-limitations">{fact.limitations.join(' ')}</p>
      )}
    </ReportSection>
  );
}

function PlanningDevelopmentSection({ report }) {
  const fact = report?.propertyFacts?.facts?.planning;
  if (!fact) return null;
  const subject = Array.isArray(fact.subjectApplications) ? fact.subjectApplications : [];
  const nearby = Array.isArray(fact.nearbyApplications) ? fact.nearbyApplications : [];
  const assessed = Boolean(fact.available);
  const reasonLabel = PLANNING_REASON_LABELS[fact.unavailableReason] || fact.unavailableReason || null;
  return (
    <ReportSection
      title="Planning & development"
      badge={assessed ? 'Canonical evidence' : 'Not assessed'}
      defaultOpen={false}
    >
      <p className="pi-muted">
        Applications at this location are shown separately from nearby applications. Nearby records are
        area context, not applications for this property. Status is the source wording, not an investment rating.
      </p>
      {!assessed && (
        <p data-testid="planning-section-missing">
          NOT ASSESSED{reasonLabel ? ` — Reason: ${reasonLabel}` : ''}
        </p>
      )}
      {assessed && (
        <div className="pi-snapshot-grid" data-testid="planning-summary">
          <div><span>At this location</span>{fact.summary?.subjectCount ?? subject.length}</div>
          <div><span>Nearby within {fact.searchRadiusMetres || 400}m</span>{fact.summary?.nearbyCount ?? nearby.length}</div>
          <div><span>Source</span>{factSourceLabel(fact) || 'MHCLG Planning Data'}</div>
        </div>
      )}
      {assessed && subject.length > 0 && (
        <div data-testid="planning-subject-list">
          <h4 className="pi-subheading">Applications at this property</h4>
          {subject.map((row, index) => (
            <PlanningApplicationItem
              key={row.reference || row.entityId || index}
              row={row}
              testId={`planning-subject-${index}`}
            />
          ))}
        </div>
      )}
      {assessed && nearby.length > 0 && (
        <div data-testid="planning-nearby-list">
          <h4 className="pi-subheading">Nearby applications</h4>
          {nearby.map((row, index) => (
            <PlanningApplicationItem
              key={row.reference || row.entityId || index}
              row={row}
              testId={`planning-nearby-${index}`}
            />
          ))}
        </div>
      )}
      {Array.isArray(fact.limitations) && fact.limitations.length > 0 && (
        <p className="pi-muted" data-testid="planning-limitations">{fact.limitations.join(' ')}</p>
      )}
    </ReportSection>
  );
}

function FactRow({ label, fact, implication = false, unit, yesLabel, testId }) {
  const kind = factKind(fact, { implication });
  const assessed = Boolean(fact?.available);
  return (
    <div
      className={`pi-fact-row ${assessed ? '' : 'pi-fact-row--missing'}`}
      data-testid={testId}
    >
      <span className={`pi-fact-kind pi-fact-kind--${kind.toLowerCase().replace(/\s+/g, '-')}`}>
        {kind}
      </span>
      <div className="pi-fact-body">
        <span className="pi-fact-label">{label}</span>
        <strong data-testid={testId ? `${testId}-value` : undefined}>
          {formatFactValue(fact, { unit, yesLabel })}
        </strong>
        {assessed && factSourceLabel(fact) && (
          <em className="pi-fact-source">{factSourceLabel(fact)}</em>
        )}
        {!assessed && fact?.note && <em className="pi-fact-source">{fact.note}</em>}
      </div>
    </div>
  );
}

function PropertyFactsSection({ report }) {
  const facts = report?.propertyFacts?.facts;
  const lease = report?.propertyFacts?.implications?.leaseRemaining;
  if (!facts) {
    return (
      <ReportSection title="Property facts">
        <div className="pi-snapshot-grid">
          <div><span>Type</span>{report.snapshot?.propertyType ?? '—'}</div>
          <div><span>Bedrooms</span>{report.snapshot?.bedrooms ?? '—'}</div>
          <div><span>Bathrooms</span>{report.snapshot?.bathrooms ?? '—'}</div>
          <div><span>Size</span>{report.snapshot?.size ? `${Number(report.snapshot.size).toLocaleString()} sq ft` : '—'}</div>
          <div><span>EPC</span>{report.snapshot?.epc ?? '—'}</div>
        </div>
        <p className="pi-muted">Saved under an earlier model that did not record canonical property facts.</p>
      </ReportSection>
    );
  }
  return (
    <ReportSection title="Property facts" badge="Canonical evidence" defaultOpen>
      <p className="pi-muted">
        Facts are what was observed on this property. Not assessed means the source did not supply
        the field — it is not zero, false, or a score.
      </p>
      <div className="pi-fact-grid" data-testid="property-facts-grid">
        <FactRow label="Property type" fact={facts.propertyType} testId="fact-propertyType" />
        <FactRow label="Bedrooms" fact={facts.bedrooms} testId="fact-bedrooms" />
        <FactRow label="Bathrooms" fact={facts.bathrooms} testId="fact-bathrooms" />
        <FactRow
          label="Floor area"
          fact={facts.floorArea}
          unit={facts.floorArea?.available ? (facts.floorArea.unit || 'sq ft') : undefined}
          testId="fact-floorArea"
        />
        <FactRow label="Year built" fact={facts.yearBuilt} testId="fact-yearBuilt" />
        <FactRow label="Construction period" fact={facts.constructionAgeBand} testId="fact-constructionAgeBand" />
        <FactRow label="EPC rating" fact={facts.epcRating} testId="fact-epcRating" />
        <FactRow label="Heating" fact={facts.heating} testId="fact-heating" />
        <FactRow label="Outdoor space" fact={facts.outdoorSpace} yesLabel="Garden on listing" testId="fact-outdoorSpace" />
        <FactRow label="Garage" fact={facts.garage} yesLabel="Garage on listing" testId="fact-garage" />
        <FactRow label="Parking spaces" fact={facts.parkingSpaces} testId="fact-parkingSpaces" />
        <FactRow label="Broadband" fact={facts.broadband} testId="fact-broadband" />
        <FactRow label="Tenure" fact={facts.tenure} testId="fact-tenure" />
        <FactRow
          label="Lease remaining"
          fact={lease}
          implication
          unit={lease?.available ? 'years' : undefined}
          testId="fact-leaseRemaining"
        />
        <FactRow label="Lease start" fact={facts.leaseStart} testId="fact-leaseStart" />
        <FactRow label="Lease end" fact={facts.leaseEnd} testId="fact-leaseEnd" />
        <FactRow label="Council tax band" fact={facts.councilTaxBand} testId="fact-councilTaxBand" />
        <FactRow label="Council tax amount" fact={facts.councilTaxAmount} testId="fact-councilTaxAmount" />
        <FactRow label="Service charge" fact={facts.serviceCharge} testId="fact-serviceCharge" />
        <FactRow label="Ground rent" fact={facts.groundRent} testId="fact-groundRent" />
        <FloodFactRow fact={facts.flood} testId="fact-flood" />
        <PlanningFactRow fact={facts.planning} testId="fact-planning" />
        <SchoolsFactRow fact={facts.schools} testId="fact-schools" />
        <ListedBuildingFactRow fact={facts.listedBuilding} testId="fact-listedBuilding" />
        <ConservationAreaFactRow fact={facts.conservationArea} testId="fact-conservationArea" />
        <Article4FactRow fact={facts.article4} testId="fact-article4" />
      </div>
    </ReportSection>
  );
}

/**
 * Per-dimension components. A component score may legitimately be null, so it is
 * rendered as an explicit "Not assessed" state with its reason rather than as an
 * empty pill or a zero.
 */
function ScoreBreakdown({ scores }) {
  const detail = scores?.componentDetail;

  // Reports saved before componentDetail existed only have a flat numeric map.
  // Render them so history stays readable, labelled as a legacy analysis.
  if (!detail) {
    const legacy = scores?.components;
    if (!legacy || typeof legacy !== 'object') return null;
    return (
      <>
        <div className="pi-score-breakdown">
          {Object.entries(legacy).map(([key, value]) => (
            <div key={key} className="pi-score-pill">
              <small>{SCORE_COMPONENT_LABELS[key] || key}</small>
              <strong>{Number.isFinite(value) ? value : 'Not assessed'}</strong>
            </div>
          ))}
        </div>
        <p className="pi-muted">
          Saved under an earlier scoring model. Component availability and reasons were
          not recorded at the time.
        </p>
      </>
    );
  }

  const notAssessed = scores.notAssessed || [];

  return (
    <>
      <div className="pi-score-breakdown">
        {Object.entries(detail).map(([key, c]) => (
          <div
            key={key}
            className={`pi-score-pill ${c?.available ? '' : 'pi-score-pill--unavailable'}`}
            title={c?.available ? c.detail : c?.reason}
          >
            <small>{SCORE_COMPONENT_LABELS[key] || key}</small>
            <strong>{c?.available ? c.score : 'Not assessed'}</strong>
          </div>
        ))}
      </div>

      {notAssessed.length > 0 && (
        <ul className="pi-not-assessed">
          {notAssessed.map((n) => (
            <li key={n.component}>
              <strong>{SCORE_COMPONENT_LABELS[n.component] || n.component}:</strong> {n.reason}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function MetricTile({ label, value, hint }) {
  return (
    <div className="pi-metric-tile">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint && <em>{hint}</em>}
    </div>
  );
}

const CONFIDENCE_FACTOR_LABELS = {
  sampleSize: 'Comparable count',
  similarity: 'Comparable similarity',
  attributeMatch: 'Type / bedroom / floor-area match',
  methodAgreement: 'Agreement between methods',
  recency: 'Evidence recency',
  geographicProximity: 'Geographic closeness',
  dataCompleteness: 'Property data completeness',
  providerCoverage: 'External provider coverage',
};

/**
 * Explains a confidence level from its evidence. Deliberately shows no percentage:
 * the engine's numeric score is an internal ordering index, not an accuracy figure.
 */
function ConfidenceExplainer({ assessment, title = 'Why this confidence level' }) {
  if (!assessment?.level) return null;

  return (
    <details className="pi-confidence-explainer">
      <summary>
        {title}
        <span className={`pi-confidence pi-confidence-${confidenceClass(assessment.level)}`}>
          {assessment.level}
        </span>
      </summary>

      {assessment.caps?.length > 0 && (
        <ul className="pi-confidence-caps">
          {assessment.caps.map((cap) => (
            <li key={cap.rule}>
              <strong>Capped at {cap.capLevel}:</strong> {cap.reason}
            </li>
          ))}
        </ul>
      )}

      <ul className="pi-confidence-factors">
        {(assessment.reasons || []).map((reason) => (
          <li key={reason.key} className={`pi-confidence-factor--${reason.direction}`}>
            <span>{CONFIDENCE_FACTOR_LABELS[reason.key] || reason.key}</span>
            <em>{reason.detail}</em>
          </li>
        ))}
      </ul>

      {assessment.limitations?.length > 0 && (
        <p className="pi-muted">
          Not assessed: {assessment.limitations.map((l) => CONFIDENCE_FACTOR_LABELS[l.key] || l.key).join(', ')}.
        </p>
      )}

      {assessment.dataQuality?.level && (
        <p className="pi-muted">
          Data quality is {assessment.dataQuality.level} — {assessment.dataQuality.note}
        </p>
      )}
    </details>
  );
}

function EvidenceCard({ title, meta, reasons, score, source }) {
  return (
    <article className="pi-evidence-card">
      <header>
        <div>
          <strong>{title}</strong>
          {meta && <p className="pi-evidence-meta">{meta}</p>}
        </div>
        {score != null && <span className="pi-similarity">{score}% match</span>}
      </header>
      {reasons?.length > 0 && (
        <p className="pi-evidence-reasons">
          <strong>Why:</strong> {reasons.join(' · ')}
        </p>
      )}
      {source && <SourceBadge source={source} />}
    </article>
  );
}

function FinanceTransparency({ financeRequest, presented }) {
  if (!financeRequest) return null;
  const operating = financeRequest.operatingCostCompleteness || presented?.costEvidence?.completeness;
  const finance = financeRequest.financeCompleteness || presented?.financeEvidence?.completeness;
  const missingCosts = financeRequest.missingRequired?.operatingCosts || [];
  const missingFinance = financeRequest.missingRequired?.finance || [];
  const sc = financeRequest.serviceCharge;
  const gr = financeRequest.groundRent;
  const expected = financeRequest.expectedRent;
  const purchase = financeRequest.purchasePrice;

  return (
    <div className="pi-fin-transparency" data-testid="finance-transparency">
      <p className="pi-muted">
        Completeness below is data completeness for this scenario — not an investment score.
      </p>
      <div className="pi-metric-grid">
        <div className={`pi-metric-tile pi-metric-tile--${completenessClass(operating)}`} data-testid="completeness-operating">
          <small>Operating-cost evidence</small>
          <strong>{completenessCopy(operating)}</strong>
        </div>
        <div className={`pi-metric-tile pi-metric-tile--${completenessClass(finance)}`} data-testid="completeness-finance">
          <small>Finance evidence</small>
          <strong>{completenessCopy(finance)}</strong>
        </div>
      </div>
      {purchase && (
        <ul className="pi-trust-list">
          <li>
            <span className="pi-trust-tag pi-trust-tag--property">Property evidence</span>
            Listing asking price {fmt(purchase.listingAskingPrice)}
          </li>
          {purchase.scenarioPurchasePrice != null && (
            <li>
              <span className="pi-trust-tag pi-trust-tag--user">Entered by you</span>
              Purchase scenario {fmt(purchase.scenarioPurchasePrice)}
            </li>
          )}
        </ul>
      )}
      {expected && (
        <ul className="pi-trust-list">
          {expected.listingMonthlyRent != null && expected.listingMonthlyRent !== '' ? (
            <li>
              <span className="pi-trust-tag pi-trust-tag--property">Property evidence</span>
              Listing rent {fmt(expected.listingMonthlyRent)} pcm
            </li>
          ) : (
            <li>
              <span className="pi-trust-tag pi-trust-tag--property">Property evidence</span>
              Listing rent not on file
            </li>
          )}
          {expected.marketRentEvidence != null && (
            <li>
              <span className="pi-trust-tag pi-trust-tag--market">Market evidence</span>
              Market rent {fmt(expected.marketRentEvidence)} pcm
            </li>
          )}
          {expected.scenarioInput != null && (
            <li>
              <span className="pi-trust-tag pi-trust-tag--user">Entered by you</span>
              Your expected rent {fmt(expected.scenarioInput)} pcm
            </li>
          )}
        </ul>
      )}
      {(sc || gr) && (
        <ul className="pi-trust-list" data-testid="charge-override-summary">
          {sc && (
            <li>
              <span className="pi-trust-tag pi-trust-tag--property">Property evidence</span>
              Service charge{' '}
              {sc.propertyFact?.value != null ? fmt(sc.propertyFact.value) : 'not on file'}
              {sc.scenarioInput && (
                <>
                  {' '}
                  · <span className="pi-trust-tag pi-trust-tag--user">Entered by you</span>
                  override {fmt(sc.scenarioInput.value)}
                </>
              )}
              {sc.calculationSelectedValue != null && (
                <> · analysis uses {fmt(sc.calculationSelectedValue)}</>
              )}
            </li>
          )}
          {gr && (
            <li>
              <span className="pi-trust-tag pi-trust-tag--property">Property evidence</span>
              Ground rent {gr.propertyFact?.value != null ? fmt(gr.propertyFact.value) : 'not on file'}
              {gr.scenarioInput && (
                <>
                  {' '}
                  · <span className="pi-trust-tag pi-trust-tag--user">Entered by you</span>
                  override {fmt(gr.scenarioInput.value)}
                </>
              )}
              {gr.calculationSelectedValue != null && (
                <> · analysis uses {fmt(gr.calculationSelectedValue)}</>
              )}
            </li>
          )}
        </ul>
      )}
      {(!presented?.noi?.available || !presented?.annualCashFlow?.available) && (
        <div className="pi-not-assessed-box" data-testid="not-assessed-reasons">
          {!presented?.noi?.available && (
            <p>
              <strong>NOI not assessed.</strong>{' '}
              {presented?.noi?.reason || 'Operating-cost evidence is incomplete.'}
            </p>
          )}
          {missingCosts.length > 0 && (
            <p>
              Still required: {missingCosts.map((key) => MISSING_LABELS[key] || key).join(', ')}.
            </p>
          )}
          {!presented?.annualCashFlow?.available && (
            <p>
              <strong>Cash flow / DSCR not assessed.</strong>{' '}
              {presented?.annualCashFlow?.reason || presented?.dscr?.reason || ''}
            </p>
          )}
          {missingFinance.length > 0 && (
            <p>
              Still required: {missingFinance.map((key) => MISSING_LABELS[key] || key).join(', ')}.
            </p>
          )}
        </div>
      )}
      {financeRequest.applicationDefaultsAreNotUserInputs &&
        financeRequest.applicationDefaults?.length > 0 && (
          <p className="pi-muted" data-testid="application-defaults-note">
            Application defaults were not treated as values you entered.
          </p>
        )}
    </div>
  );
}

function DecisionIntelligenceSection({ intelligence }) {
  if (!intelligence) return null;
  const findings = Array.isArray(intelligence.materialFindings)
    ? intelligence.materialFindings
    : [];
  const priorities = Array.isArray(intelligence.investigationPriorities)
    ? intelligence.investigationPriorities
    : [];
  const unresolved = Array.isArray(intelligence.unresolvedDependencies)
    ? intelligence.unresolvedDependencies
    : [];
  const drivers = Array.isArray(intelligence.sensitivityDrivers)
    ? intelligence.sensitivityDrivers
    : [];
  const hasFindings = findings.length > 0;
  const hasPriorities = priorities.length > 0;
  const hasDrivers = drivers.length > 0;
  const priorityIds = new Set(priorities.map((row) => row.id).filter(Boolean));
  const extraUnresolved = unresolved.filter((row) => row.id && !priorityIds.has(row.id));
  const effectLabel = (effect) => {
    if (effect === 'supporting') return 'Currently supporting this landlord scenario';
    if (effect === 'limiting') return 'Currently limiting this landlord scenario';
    if (effect === 'neutral') return 'Assessed for this landlord scenario';
    return null;
  };
  const importanceLabel = (importance) => {
    if (importance === 'decision_relevant') return 'Needed to complete this landlord analysis';
    if (importance === 'worth_reviewing') return 'Worth reviewing, not currently blocking fit';
    if (importance === 'informational') return 'Informational — not an urgent task';
    if (importance === 'context_only') return 'Context only — not a verification task';
    return null;
  };
  const affectLabel = (path) => {
    const labels = {
      'investment.presented.grossYield': 'gross yield',
      'investment.presented.noi': 'NOI',
      'investment.presented.netYield': 'net yield',
      'investment.presented.annualCashFlow': 'cash flow',
      'investment.presented.monthlyCashFlow': 'monthly cash flow',
      'investment.presented.dscr': 'DSCR',
      'personalDecision.dimensions.grossYield': 'landlord gross yield',
      'personalDecision.dimensions.netOperating': 'landlord net operating',
      'personalDecision.dimensions.cashFlow': 'landlord cash flow',
      'personalDecision.dimensions.dscr': 'landlord DSCR',
      'personalDecision.dimensions.rentPosition': 'rent position',
      'personalDecision.dimensions.vacancy': 'vacancy assumption',
    };
    return labels[path] || null;
  };
  const uniqueAffectLabels = (item) => {
    const labels = (item.affects || []).map(affectLabel).filter(Boolean);
    return [...new Set(labels)];
  };
  const driverGroups = [
    { id: 'price_rent', title: 'Price and rent' },
    { id: 'operating_costs', title: 'Operating costs' },
    { id: 'finance', title: 'Finance' },
  ];
  const directionPhrase = (item) => {
    const relations = item.directionality?.whenInputIncreases || [];
    const phrases = relations
      .map((row) => {
        const label = affectLabel(row.output);
        if (!label || !row.whenInputIncreases) return null;
        return `${label} ${row.whenInputIncreases}`;
      })
      .filter(Boolean);
    const unique = [...new Set(phrases)];
    if (!unique.length) return null;
    return `If this input increases: ${unique.join(', ')}.`;
  };
  return (
    <div className="pi-decision-stack" data-testid="decision-intelligence">
      {intelligence.explanation?.overview && (
        <div className="pi-di-overview" data-testid="decision-intelligence-overview">
          <em className="pi-fact-meta" data-testid="decision-intelligence-overview-source">
            {intelligence.explanation.source === 'openai'
              ? 'AI paraphrase of the structured Decision Intelligence below'
              : 'Structured synthesis of the Decision Intelligence below'}
          </em>
          <p data-testid="decision-intelligence-overview-text">{intelligence.explanation.overview}</p>
        </div>
      )}
      <section className="pi-decision-block" data-testid="decision-matters" aria-labelledby="pi-matters-heading">
        <h2 id="pi-matters-heading" className="pi-block-heading">What currently matters</h2>
        <p className="pi-muted">Assessed evidence only. These cards are the auditable findings, not an AI ranking.</p>
        {hasFindings ? (
          <div data-testid="decision-intelligence-findings">
            {findings.map((item, index) => (
              <article
                key={item.id || index}
                className={`pi-planning-item pi-finding pi-finding--${item.effect || 'neutral'}`}
                data-testid={`decision-finding-${item.id || index}`}
              >
                <strong data-testid={`decision-finding-${item.id || index}-title`}>{item.title}</strong>
                {item.explanation && <em className="pi-fact-source">{item.explanation}</em>}
                {effectLabel(item.effect) && (
                  <em className="pi-fact-meta" data-testid={`decision-finding-${item.id || index}-effect`}>
                    {effectLabel(item.effect)}
                  </em>
                )}
                {item.importance === 'context_only' && (
                  <em className="pi-fact-meta">Context only — not a landlord-fit score.</em>
                )}
                {item.scope === 'scenario' && (
                  <em className="pi-fact-meta">Applies to this scenario, not as a property fact.</em>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p data-testid="decision-intelligence-findings-empty">
            No assessed evidence currently produces a material finding for this landlord scenario.
          </p>
        )}
      </section>

      <section className="pi-decision-block" data-testid="decision-verify" aria-labelledby="pi-verify-heading">
        <h2 id="pi-verify-heading" className="pi-block-heading">What to verify next</h2>
        <p className="pi-muted">To strengthen this analysis, the next useful information would be the items below. These are not purchase instructions.</p>
        {!hasPriorities && (
          <p data-testid="decision-intelligence-empty">
            No decision-relevant unknowns or canonical conflicts currently require investigation.
          </p>
        )}
        {hasPriorities && (
          <div data-testid="decision-intelligence-priorities">
            {priorities.map((item, index) => {
              const blocked = uniqueAffectLabels(item);
              return (
                <article
                  key={item.id || index}
                  className="pi-planning-item"
                  data-testid={`decision-priority-${item.id || index}`}
                >
                  <strong data-testid={`decision-priority-${item.id || index}-title`}>{item.title}</strong>
                  {item.explanation && <em className="pi-fact-source">{item.explanation}</em>}
                  {item.state && (
                    <em className="pi-fact-meta" data-testid={`decision-priority-${item.id || index}-state`}>
                      State: {item.state === 'notAssessed' ? 'NOT ASSESSED' : item.state}
                    </em>
                  )}
                  {importanceLabel(item.importance) && (
                    <em className="pi-fact-meta">{importanceLabel(item.importance)}</em>
                  )}
                  {blocked.length > 0 && (
                    <em className="pi-fact-meta">Cannot currently be fully assessed: {blocked.join(', ')}.</em>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {extraUnresolved.length > 0 && (
          <details className="pi-analysis-gaps" data-testid="decision-analysis-gaps">
            <summary>Analysis gaps</summary>
            <p className="pi-muted">
              Fuller transparency of unresolved items that are not verification tasks. Informational
              and context-only unknowns are not urgent.
            </p>
            {extraUnresolved.map((item, index) => (
              <article
                key={item.id || index}
                className="pi-planning-item"
                data-testid={`decision-gap-${item.id || index}`}
              >
                <strong>{item.title}</strong>
                {item.explanation && <em className="pi-fact-source">{item.explanation}</em>}
                {importanceLabel(item.importance) && (
                  <em className="pi-fact-meta">{importanceLabel(item.importance)}</em>
                )}
              </article>
            ))}
          </details>
        )}
      </section>

      <section className="pi-decision-block" data-testid="decision-sensitivity" aria-labelledby="pi-sensitivity-heading">
        <h2 id="pi-sensitivity-heading" className="pi-block-heading">What can change this result</h2>
        <p className="pi-muted">
          Scenario inputs that may affect calculated results. This is not a ranking, not a score, and
          not an optimisation. Use What-if to test an explicit scenario.
        </p>
        {hasDrivers ? (
          <div data-testid="decision-intelligence-drivers">
            {driverGroups.map((group) => {
              const items = drivers.filter((row) => row.group === group.id);
              if (!items.length) return null;
              return (
                <div key={group.id} data-testid={`decision-driver-group-${group.id}`}>
                  <h3 className="pi-di-subheading">{group.title}</h3>
                  {items.map((item, index) => {
                    const labels = uniqueAffectLabels(item);
                    const direction = directionPhrase(item);
                    return (
                      <article
                        key={item.id || index}
                        className="pi-planning-item"
                        data-testid={`decision-driver-${item.inputKey || item.id || index}`}
                      >
                        <strong data-testid={`decision-driver-${item.inputKey}-title`}>{item.title}</strong>
                        {item.explanation && <em className="pi-fact-source">{item.explanation}</em>}
                        {labels.length > 0 && (
                          <em className="pi-fact-meta">May affect: {labels.join(', ')}.</em>
                        )}
                        {direction && <em className="pi-fact-meta">{direction}</em>}
                        {item.state === 'conditional' && (
                          <em className="pi-fact-meta">Not fully assessed until the related scenario inputs are complete.</em>
                        )}
                        {item.scope === 'scenario' && (
                          <em className="pi-fact-meta">Scenario input — not a property fact.</em>
                        )}
                      </article>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          <p data-testid="decision-intelligence-drivers-empty">
            No scenario inputs are currently mapped as decision-change drivers.
          </p>
        )}
        <p className="pi-whatif-jump">
          <a href="#pi-what-if">Test purchase price, expected rent, interest rate or vacancy in What-if</a>
          {' '}
          — What-if is a separate scenario comparison, not a replacement for this analysis.
        </p>
      </section>
    </div>
  );
}

function LandlordDecisionSection({ decision }) {
  if (!decision) return null;
  const dims = decision.dimensions || {};
  const dimKeys = Object.keys(dims);
  const scoreAssessed = decision.available && decision.score != null;
  const outcomeLabel = {
    strong_fit: 'Strong fit',
    good_fit: 'Good fit',
    mixed_fit: 'Mixed fit',
    weak_fit: 'Weak fit',
    unsuitable: 'Unsuitable against stated rental requirements',
  }[decision.outcome] || null;
  const strengthLabel = {
    none: 'None — overall fit not assessed',
    weak: 'Weak',
    moderate: 'Moderate',
    strong: 'Strong',
  }[decision.decisionStrength] || decision.decisionStrength;
  const explanation = decision.explanation;
  const demandDim = dims.demand;

  return (
    <div className="pi-landlord" data-testid="landlord-personal-decision">
      <p className="pi-muted">
        {decision.scoreLabel || 'Landlord fit score'} — how well this property fits the landlord
        scenario used for this analysis. It is not confidence, not a purchase recommendation, and
        not financial advice.
      </p>
      <div className="pi-metric-grid">
        <div
          className={`pi-metric-tile ${scoreAssessed ? 'pi-metric-tile--assessed' : 'pi-metric-tile--missing'}`}
          data-testid="landlord-fit-score"
        >
          <small>{decision.scoreLabel || 'Landlord fit score'}</small>
          <strong>{scoreAssessed ? `${decision.score}/100` : 'Not assessed'}</strong>
          {!scoreAssessed && decision.unavailableReason && <em>{decision.unavailableReason}</em>}
        </div>
        <div className="pi-metric-tile" data-testid="landlord-decision-strength">
          <small>Decision strength</small>
          <strong>{strengthLabel || 'Not assessed'}</strong>
          <em>From estimate confidence — not the fit score</em>
        </div>
        {outcomeLabel && (
          <div className="pi-metric-tile" data-testid="landlord-outcome">
            <small>Fit outcome</small>
            <strong>{outcomeLabel}</strong>
          </div>
        )}
      </div>

      {demandDim && (
        <p className="pi-muted" data-testid="property-tenant-demand">
          Property-specific tenant demand:{' '}
          {demandDim.available ? 'Assessed' : 'Not assessed'}
          {demandDim.unavailableReason ? ` — ${demandDim.unavailableReason}` : ''}
        </p>
      )}

      {explanation?.overall && (
        <div className="pi-landlord-why" data-testid="landlord-explanation">
          <h3 className="pi-subheading">Why this score</h3>
          <p>{explanation.overall}</p>
          {(explanation.strongestFactors || []).map((row) => (
            <p key={`pos-${row.dimension || row.text}`}>{row.text}</p>
          ))}
          {(explanation.weakestOrUnavailable || []).map((row) => (
            <p key={`weak-${row.dimension || row.text}`}>{row.text}</p>
          ))}
          {(explanation.constraintFailures || []).map((row) => (
            <p key={`c-${row.constraint || row.text}`}>{row.text || row.detail}</p>
          ))}
          {explanation.confidenceLimitations?.text && (
            <p className="pi-muted">{explanation.confidenceLimitations.text}</p>
          )}
        </div>
      )}

      {dimKeys.length > 0 && (
        <details className="pi-landlord-dims" data-testid="landlord-dimensions">
          <summary>Assessed coverage and missing dimensions</summary>
          <ul className="pi-landlord-dim-list">
            {dimKeys.map((key) => {
              const dim = dims[key];
              const assessed = Boolean(dim.available);
              return (
                <li
                  key={key}
                  className={assessed ? 'pi-landlord-dim' : 'pi-landlord-dim pi-landlord-dim--missing'}
                  data-testid={`landlord-dim-${key}`}
                >
                  <div>
                    <strong>{DIMENSION_TITLES[key] || key}</strong>
                    <span>{assessed ? 'Assessed' : 'Not assessed'}</span>
                  </div>
                  <div>
                    {assessed ? <em>{dim.score}/100</em> : <em>Not assessed</em>}
                    {dim.weight != null && (
                      <span className="pi-muted">Weight {dim.weight}</span>
                    )}
                  </div>
                  {!assessed && dim.unavailableReason && <p>{dim.unavailableReason}</p>}
                  {assessed && dim.evidence?.length > 0 && <p>{dim.evidence.join(' ')}</p>}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {decision.model?.version && (
        <p className="pi-muted pi-model-meta" data-testid="landlord-model">
          Model {decision.model.version}
          {decision.model.profile ? ` · ${decision.model.profile}` : ''}
        </p>
      )}
    </div>
  );
}

const DIMENSION_TITLES = {
  rentPosition: 'Rent position',
  grossYield: 'Gross yield',
  netOperating: 'Net operating position',
  cashFlow: 'Cash flow',
  vacancy: 'Vacancy',
  dscr: 'DSCR',
  risk: 'Rental risk',
  demand: 'Property-specific tenant demand',
};

function formatAnalysisDate(value) {
  if (!value) return 'Date not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date not recorded' : parsed.toLocaleString();
}

export default function IntelligenceReport({ report }) {
  if (!report || typeof report !== 'object') {
    return (
      <div className="pi-report" data-testid="intelligence-report-empty">
        <p className="pi-muted">This analysis could not be displayed.</p>
      </div>
    );
  }

  const rent = report.marketIntelligence?.rent;
  const sale = report.marketIntelligence?.sale;
  const pricePosition = report.marketIntelligence?.pricePosition;
  const inv = report.investment;
  const marketContext = report.marketIntelligence?.marketContext;
  const areaDemand = report.marketIntelligence?.areaRentalDemand;
  const personalDecision = report.personalDecision;
  const fitAssessed = Boolean(personalDecision?.available && personalDecision?.score != null);

  const positionClass = pricePosition?.position
    ? pricePosition.position.replace(/_/g, '-')
    : '';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="pi-report pi-report-flagship" id="pi-intelligence-report">
      <div className="pi-report-toolbar no-print">
        <button type="button" className="ai-btn ai-btn-ghost" onClick={handlePrint}>
          <FaPrint /> Export PDF / Print
        </button>
        <span className="pi-export-hint"><FaFileDownload /> Use &quot;Save as PDF&quot; in the print dialog</span>
      </div>
      <header className="pi-report-hero">
        <div className="pi-report-hero-copy">
          <p className="pi-report-kicker">Current analysis</p>
          <h2>{report.property?.title}</h2>
          <p className="pi-report-address">{report.property?.address}</p>
          <p className="pi-report-date">
            {formatAnalysisDate(report.analysisDate)} · {report.modelVersion || 'v2'}
            {report.accessContext?.accessLevel === 'public_intelligence' && ' · Market view'}
            {report.accessContext?.accessLevel === 'professional_intelligence' && ' · Professional view'}
          </p>
          <div className="pi-report-labels">
            {Object.entries(report.labels || {})
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => (
                <span key={k} className="pi-chip">{v}</span>
              ))}
          </div>
        </div>
        <div className="pi-report-hero-status">
          <div className="pi-report-hero-fit" data-testid="hero-landlord-fit">
            <small>Landlord fit</small>
            <strong>{fitAssessed ? `${personalDecision.score}/100` : 'Not assessed'}</strong>
            <span>Decision state — not purchase advice</span>
          </div>
          <div className="pi-report-hero-score" data-testid="hero-evidence-strength">
            <small>Evidence strength</small>
            <strong>{report.confidence?.level || 'Not assessed'}</strong>
            <span>Not the fit score</span>
            {report.scores?.coverage && (
              <span>
                {report.scores.coverage.componentsScored} of {report.scores.coverage.componentsTotal} dimensions assessed
              </span>
            )}
            {report.dataQuality?.level && (
              <em className={`pi-confidence pi-confidence-${confidenceClass(report.dataQuality.level)}`}>
                {report.dataQuality.level} data quality
              </em>
            )}
            {report.confidenceProvenance?.legacy && (
              <em className="pi-confidence pi-confidence-none">
                Earlier confidence model
                {report.confidenceProvenance.modelVersion
                  ? ` · ${report.confidenceProvenance.modelVersion}`
                  : ''}
              </em>
            )}
          </div>
        </div>
      </header>

      <section
        className="pi-decision-overview"
        data-testid="decision-overview"
        aria-labelledby="pi-decision-overview-heading"
      >
        <h2 id="pi-decision-overview-heading" className="pi-block-heading">Current analysis</h2>
        <p className="pi-muted">
          Landlord fit is the current decision state. Evidence strength is how complete the estimate is.
          They are not combined into a recommendation. This is not purchase advice.
        </p>
        {personalDecision ? (
          <LandlordDecisionSection decision={personalDecision} />
        ) : (
          <p className="pi-muted" data-testid="decision-overview-no-fit">
            Landlord fit is not available on this analysis.
          </p>
        )}
        <div className="pi-demand-split">
          <p data-testid="area-rental-demand">
            <span className="pi-fact-kind pi-fact-kind--area-context">AREA CONTEXT</span>
            {' '}Area rental market:{' '}
            <strong data-testid="area-rental-demand-value">
              {areaDemand?.available && areaDemand?.band ? areaDemand.band : 'Not assessed'}
            </strong>
            {areaDemand?.available && areaDemand?.band ? ' — area market label, not this property.' : ''}
          </p>
          <p data-testid="area-property-demand">
            <span className="pi-fact-kind pi-fact-kind--not-assessed">NOT ASSESSED</span>
            {' '}Property-specific tenant demand: Not assessed
          </p>
        </div>
      </section>

      <DecisionIntelligenceSection intelligence={report.decisionIntelligence} />

      <ReportSection title="Financial and market evidence" badge="Calculated from this scenario" defaultOpen>
        <p className="pi-muted">
          Gross yield can be assessed while NOI stays not assessed. Unavailable metrics are not £0 or 0%.
        </p>
        <div className="pi-hero-metrics">
          <MetricTile label="Listing asking price" value={fmt(report.snapshot?.price ?? report.property?.price)} hint="FACT" />
          {sale?.success && (
            <MetricTile
              label="Valuation"
              value={fmt(sale.centralEstimate?.value ?? sale.centralEstimate)}
              hint={`MODEL ESTIMATE · ${sale.evidenceCount} evidence source${sale.evidenceCount === 1 ? '' : 's'}`}
            />
          )}
          {report.financeRequest?.purchasePrice?.scenarioPurchasePrice != null && (
            <MetricTile
              label="Your purchase scenario"
              value={fmt(report.financeRequest.purchasePrice.scenarioPurchasePrice)}
              hint="USER SCENARIO"
            />
          )}
          <MetricTile
            label="Listing rent"
            value={
              report.property?.monthly_rent != null && report.property.monthly_rent !== ''
                ? `${fmt(report.property.monthly_rent)}/mo`
                : 'Not on file'
            }
            hint="FACT"
          />
        </div>
        {(sale?.success || pricePosition?.success) && (
          <div className={`pi-price-banner pi-price-banner--${positionClass || 'neutral'}`}>
            {pricePosition?.success ? (
              <>
                <strong>{pricePosition.label}</strong>
                <p>{pricePosition.summary}</p>
                {pricePosition.differenceFromCentral && (
                  <span>
                    {pricePosition.differenceFromCentral.percent > 0 ? '+' : ''}
                    {pricePosition.differenceFromCentral.percent}% vs central estimate
                  </span>
                )}
              </>
            ) : (
              <>
                <strong>Estimated market value</strong>
                <p>
                  {fmt(sale.lowerEstimate?.value ?? sale.lowerEstimate)} –{' '}
                  {fmt(sale.upperEstimate?.value ?? sale.upperEstimate)}
                </p>
              </>
            )}
          </div>
        )}
        {(inv?.presented || inv?.metrics || inv?.partial) && (
          <div data-testid="investment-evidence">
            {inv.financeRequest || report.financeRequest ? (
              <FinanceTransparency
                financeRequest={inv.financeRequest || report.financeRequest}
                presented={inv.presented}
              />
            ) : null}
            {inv.presented ? (
              <>
                <div className="pi-metric-grid">
                  <PresentedMetric label="Gross yield" field={inv.presented.grossYield} format={fmtPct} testId="metric-grossYield" />
                  <PresentedMetric label="NOI" field={inv.presented.noi} testId="metric-noi" />
                  <PresentedMetric label="Net yield" field={inv.presented.netYield} format={fmtPct} testId="metric-netYield" />
                  <PresentedMetric label="Monthly cash flow" field={inv.presented.monthlyCashFlow} testId="metric-cashFlow" />
                  <PresentedMetric label="DSCR" field={inv.presented.dscr} format={(n) => n} testId="metric-dscr" />
                </div>
                {inv.mortgageNote && <p className="pi-muted">{inv.mortgageNote}</p>}
              </>
            ) : inv.partial ? (
              <p className="pi-muted">{inv.message}</p>
            ) : (
              <>
                <p className="pi-muted">
                  Saved under an earlier model that did not record finance-evidence completeness.
                </p>
                <div className="pi-metric-grid">
                  <MetricTile label="Gross yield" value={fmtPct(inv.metrics?.grossYield)} />
                </div>
              </>
            )}
          </div>
        )}
      </ReportSection>

      {(sale?.success || pricePosition?.success) && (
      <ReportSection
        title="Price intelligence"
        badge={confidenceBadge(sale?.confidenceAssessment?.level || sale?.confidence)}
        defaultOpen={false}
      >
        {sale?.success && (
          <div className="pi-metric-grid">
            <MetricTile
              label="Value range"
              value={`${fmt(sale.lowerEstimate?.value ?? sale.lowerEstimate)} – ${fmt(sale.upperEstimate?.value ?? sale.upperEstimate)}`}
              hint="MODEL ESTIMATE"
            />
            <MetricTile
              label="Central estimate"
              value={fmt(sale.centralEstimate?.value ?? sale.centralEstimate)}
              hint="MODEL ESTIMATE"
            />
            <MetricTile label="Evidence sources" value={sale.evidenceCount} />
            {sale.pricePerSqft && (
              <MetricTile
                label="Est. £/sq ft"
                value={`£${Number(sale.pricePerSqft?.value ?? sale.pricePerSqft).toLocaleString()}`}
              />
            )}
          </div>
        )}
        {pricePosition?.whyFactors?.length > 0 && (
          <ul className="pi-why-list">
            {pricePosition.whyFactors.map((f, i) => (
              <li key={i} className={`pi-why-${f.type || 'neutral'}`}>{f.text}</li>
            ))}
          </ul>
        )}
        {sale?.internalComparables?.length > 0 && (
          <>
            <h3 className="pi-subheading">Comparable sales</h3>
            {sale.internalComparables.map((c) => (
              <EvidenceCard
                key={c.id}
                title={c.title}
                meta={`${c.city} · ${fmt(c.price)} · ${c.bedrooms} bed${c.price_per_sqft ? ` · £${c.price_per_sqft}/sqft` : ''}`}
                score={c.similarity}
                source="Internal listings"
              />
            ))}
          </>
        )}
        {sale?.insufficientEvidence && <p className="pi-muted">{sale.message}</p>}
        <ConfidenceExplainer
          assessment={sale?.confidenceAssessment}
          title="Why this valuation confidence"
        />
        <SourceBadge source="Deterministic blend · PropertyData + internal" />
      </ReportSection>
      )}

      <ReportSection
        title="Rent intelligence"
        badge={rent?.success ? `${rent.confidenceLevel || rent.confidenceAssessment?.level || '—'} confidence` : 'Limited data'}
        defaultOpen={Boolean(rent?.success)}
      >
        {rent?.success ? (
          <>
            <div className="pi-metric-grid">
              <MetricTile
                label="Listing rent"
                value={
                  rent.currentRent != null && rent.currentRent !== ''
                    ? fmt(rent.currentRent)
                    : report.property?.monthly_rent != null && report.property.monthly_rent !== ''
                      ? fmt(report.property.monthly_rent)
                      : 'Not on file'
                }
                hint="FACT"
              />
              <MetricTile
                label="Market rent evidence"
                value={`${fmt(rent.marketRange?.low)}–${fmt(rent.marketRange?.high)}`}
                hint="AREA CONTEXT"
              />
              <MetricTile
                label="Recommended rent"
                value={fmt(rent.recommendedRent)}
                hint="MODEL ESTIMATE — not your scenario"
              />
              {report.financeRequest?.expectedRent?.scenarioInput != null && (
                <MetricTile
                  label="Your expected rent"
                  value={`${fmt(report.financeRequest.expectedRent.scenarioInput)}/mo`}
                  hint="USER SCENARIO"
                />
              )}
            </div>
            {(rent.comparables || []).map((c) => (
              <EvidenceCard
                key={c.id}
                title={c.title}
                meta={`${c.city} · ${fmt(c.monthly_rent)}/mo · ${c.bedrooms} bed`}
                reasons={c.selectionReasons || c.reasons}
                score={c.similarity}
                source="Internal comparables"
              />
            ))}
            <ConfidenceExplainer
              assessment={rent.confidenceAssessment}
              title="Why this rent confidence"
            />
          </>
        ) : (
          <p className="pi-muted">{rent?.message || 'Insufficient comparable data for a reliable rental estimate.'}</p>
        )}
      </ReportSection>

      <section className="pi-evidence-group" data-testid="property-context-evidence">
        <h2 className="pi-block-heading">Property and context evidence</h2>
        <p className="pi-muted">
          Canonical listing facts and open-data membership records. They are supporting evidence, not
          landlord-fit scores, legal restrictions, or valuation penalties.
        </p>
        <PropertyFactsSection report={report} />
        <PlanningDevelopmentSection report={report} />
        <SchoolsEducationSection report={report} />
        <ListedBuildingSection report={report} />
        <ConservationAreaSection report={report} />
        <Article4Section report={report} />
      </section>

      {(marketContext || areaDemand) && (
        <ReportSection
          title="Area market context"
          badge={marketContext?.postcode ? `${marketContext.postcode} · AREA CONTEXT` : 'AREA CONTEXT'}
          defaultOpen={false}
        >
          <p className="pi-muted">
            Area rental-market labels are not property-specific tenant demand. Landlord demand remains
            not assessed unless a property-specific source exists. The distinction is shown in Current analysis.
          </p>
          {marketContext && (
            <>
              <div className="pi-metric-grid">
                {marketContext.typicalPostcodeValue?.available && (
                  <MetricTile
                    label="Typical postcode value"
                    value={fmt(marketContext.typicalPostcodeValue.value)}
                    hint={marketContext.typicalPostcodeValue.label}
                  />
                )}
                {marketContext.matchedSegment?.typicalValue?.available && (
                  <MetricTile
                    label={`Similar ${marketContext.matchedSegment.label}`}
                    value={fmt(marketContext.matchedSegment.typicalValue.value)}
                    hint="Matched segment (marketplace)"
                  />
                )}
                {marketContext.matchedSegment?.indicativeGrossYield?.available && (
                  <MetricTile
                    label="Segment gross yield"
                    value={`${marketContext.matchedSegment.indicativeGrossYield.grossYieldPercent}%`}
                    hint="Matched type & bedrooms — not this property's yield"
                  />
                )}
              </div>
              {marketContext.vsMatchedEvidence?.summary && (
                <p className="pi-summary-text">{marketContext.vsMatchedEvidence.summary}</p>
              )}
              {marketContext.typicalPostcodeValue?.observationPeriod && (
                <p className="pi-muted">
                  Observation period: {marketContext.typicalPostcodeValue.observationPeriod}
                  {marketContext.typicalPostcodeValue.sampleSize != null &&
                    ` · ${marketContext.typicalPostcodeValue.sampleSize} record${marketContext.typicalPostcodeValue.sampleSize === 1 ? '' : 's'}`}
                </p>
              )}
              {marketContext.matchedSegment?.indicativeGrossYield?.caution && (
                <p className="pi-muted">{marketContext.matchedSegment.indicativeGrossYield.caution}</p>
              )}
              {marketContext.broadAreaYield?.available && (
                <p className="pi-muted">
                  {marketContext.broadAreaYield.label}: {marketContext.broadAreaYield.grossYieldPercent}% —{' '}
                  {marketContext.broadAreaYield.disclaimer}
                </p>
              )}
              {report.marketIntelligence?.postcodeIntelligence?.success && (
                <PostcodeIntelligencePanel
                  intelligence={report.marketIntelligence.postcodeIntelligence}
                  compact
                />
              )}
            </>
          )}
        </ReportSection>
      )}

      <ReportSection title="Property overview" badge="Secondary narrative" defaultOpen={false}>
        <p className="pi-muted">
          Executive summary from the property-explanation layer. Decision Intelligence above is the
          canonical decision explanation.
        </p>
        {report.executiveSummary && (
          <p className="pi-summary-text" data-testid="property-overview-summary">{report.executiveSummary}</p>
        )}
        {report.confidence?.note && <p className="pi-muted">{report.confidence.note}</p>}
        {report.confidenceProvenance?.legacy && (
          <p className="pi-muted">
            This analysis was saved under an earlier confidence model
            {report.confidenceProvenance.modelVersion
              ? ` (${report.confidenceProvenance.modelVersion})`
              : ''}
            . The original confidence level is shown as recorded and has not been
            recalculated under the current model.
          </p>
        )}
        <ScoreBreakdown scores={report.scores} />
        <ConfidenceExplainer assessment={report.confidence?.assessment} />
      </ReportSection>

      {showEarlierModelHeuristic(report) && (
        <div data-testid="earlier-model-analysis">
          <ReportSection
            title="Historical earlier-model analysis"
            badge="Legacy heuristic"
            defaultOpen={false}
          >
            <p className="pi-muted" data-testid="earlier-model-disclaimer">
              Legacy heuristic content — not part of current Decision Intelligence.
            </p>
            {report.strengths?.length > 0 && report.strengths.map((s, i) => (
              <article key={s.title || `strength-${i}`} className="pi-opp-card">
                <header><strong>{s.title}</strong></header>
                {s.evidence && <p className="pi-muted"><strong>Evidence:</strong> {s.evidence}</p>}
              </article>
            ))}
            {report.weaknesses?.length > 0 && report.weaknesses.map((w, i) => (
              <article key={w.title || `weakness-${i}`} className="pi-opp-card">
                <header><strong>{w.title}</strong></header>
                {w.evidence && <p className="pi-muted"><strong>Evidence:</strong> {w.evidence}</p>}
              </article>
            ))}
            {report.opportunities?.length > 0 && report.opportunities.map((o) => (
              <article key={o.id} className="pi-opp-card">
                <header>
                  <strong>{o.title}</strong>
                  {o.confidenceLabel && (
                    <span className={`pi-confidence pi-confidence-${confidenceClass(o.confidenceLabel)}`}>{o.confidenceLabel}</span>
                  )}
                </header>
                {o.description && <p>{o.description}</p>}
                {o.evidence && <p className="pi-muted"><strong>Evidence:</strong> {o.evidence}</p>}
              </article>
            ))}
            {report.risks?.length > 0 && report.risks.map((r) => (
              <article key={r.id} className="pi-risk-card">
                <header>
                  <strong>{r.title}</strong>
                  {r.category && <span className="pi-risk-tag">{r.category}</span>}
                </header>
                {(r.probability != null || r.impact) && (
                  <p className="pi-muted">Probability: {r.probability} · Impact: {r.impact}</p>
                )}
                {r.evidence && <p>{r.evidence}</p>}
                {r.recommendedAction && <p className="pi-muted"><strong>Action:</strong> {r.recommendedAction}</p>}
              </article>
            ))}
            {report.recommendation && (
              <>
                <h3 className="pi-action-title">{report.recommendation.action}</h3>
                {report.recommendation.why && <p><strong>Why:</strong> {report.recommendation.why}</p>}
                {report.recommendation.expectedImpact && (
                  <p className="pi-muted"><strong>Expected impact:</strong> {report.recommendation.expectedImpact}</p>
                )}
              </>
            )}
          </ReportSection>
        </div>
      )}

      {report.professionalInsights?.marketingGaps?.length > 0 && (
        <ReportSection title="Listing & marketing insights" badge="Owner / agent" defaultOpen={false}>
          <p className="pi-muted">{report.professionalInsights.listingQualityNote}</p>
          <ul className="pi-why-list">
            {report.professionalInsights.marketingGaps.map((g) => (
              <li key={g.field}>{g.message}</li>
            ))}
          </ul>
        </ReportSection>
      )}

      <ReportSection title="Data sources & assumptions" defaultOpen={false}>
        <p className="pi-muted">Sources: {(report.assumptions?.dataSources || []).join(', ') || 'Application database'}</p>
        <p className="pi-muted">Comparables: {report.assumptions?.comparablesSource}</p>
        {report.dataQuality?.missing?.length > 0 && (
          <p className="pi-muted">Missing fields: {report.dataQuality.missing.join(', ')}</p>
        )}
      </ReportSection>

      <footer className="pi-disclaimer">{report.disclaimer}</footer>
    </div>
  );
}

export { fmt, fmtPct };
