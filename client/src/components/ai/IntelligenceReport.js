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
    <div className={`pi-metric-tile ${assessed ? '' : 'pi-metric-tile--missing'}`} data-testid={testId}>
      <small>{label}</small>
      <strong>{assessed ? format(field.value) : 'Not assessed'}</strong>
      {!assessed && field?.reason && <em>{field.reason}</em>}
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

function SourceBadge({ source }) {
  if (!source) return null;
  return <span className="pi-source-badge">{source}</span>;
}

function ReportSection({ id, title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`pi-fold ${open ? 'open' : ''}`} id={id}>
      <button type="button" className="pi-fold-header" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pi-fold-title">{title}</span>
        {badge && <span className="pi-fold-badge">{badge}</span>}
        <span className="pi-fold-chevron" aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="pi-fold-body">{children}</div>}
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
      defaultOpen={assessed}
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
        <FactRow label="Schools" fact={facts.schools} testId="fact-schools" />
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
        <div className="pi-metric-tile" data-testid="completeness-operating">
          <small>Operating-cost evidence</small>
          <strong>{completenessCopy(operating)}</strong>
        </div>
        <div className="pi-metric-tile" data-testid="completeness-finance">
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
          {expected.listingMonthlyRent != null && (
            <li>
              <span className="pi-trust-tag pi-trust-tag--property">Property evidence</span>
              Listing rent {fmt(expected.listingMonthlyRent)} pcm
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

  return (
    <ReportSection
      title="Landlord decision"
      badge={scoreAssessed ? `Fit ${decision.score}/100` : 'Not assessed'}
    >
      <div className="pi-landlord" data-testid="landlord-personal-decision">
        <p className="pi-muted">
          {decision.scoreLabel || 'Landlord fit score'} — how well this property fits the landlord
          scenario used for this analysis. It is not confidence, not a purchase recommendation, and
          not financial advice.
        </p>
        <div className="pi-metric-grid">
          <div
            className={`pi-metric-tile ${scoreAssessed ? '' : 'pi-metric-tile--missing'}`}
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

        {explanation?.overall && (
          <div className="pi-landlord-why" data-testid="landlord-explanation">
            <h4 className="pi-subheading">Why this score</h4>
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
          <div className="pi-landlord-dims" data-testid="landlord-dimensions">
            <h4 className="pi-subheading">Dimension breakdown</h4>
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
          </div>
        )}

        {decision.model?.version && (
          <p className="pi-muted" data-testid="landlord-model">
            Model {decision.model.version}
            {decision.model.profile ? ` · ${decision.model.profile}` : ''}
          </p>
        )}
      </div>
    </ReportSection>
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
  demand: 'Demand',
};

export default function IntelligenceReport({ report }) {
  const rent = report.marketIntelligence?.rent;
  const sale = report.marketIntelligence?.sale;
  const pricePosition = report.marketIntelligence?.pricePosition;
  const inv = report.investment;
  const marketContext = report.marketIntelligence?.marketContext;

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
          <p className="pi-report-kicker">Property Intelligence Report</p>
          <h2>{report.property?.title}</h2>
          <p className="pi-report-address">{report.property?.address}</p>
          <p className="pi-report-date">
            {new Date(report.analysisDate).toLocaleString()} · {report.modelVersion || 'v2'}
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
        {/* The blended overall score was deprecated: it mixed property quality,
            investment return, rent position, risk and data completeness into one
            uninterpretable number. Evidence strength is shown instead until the
            explicit Property Assessment and Personal Fit results replace it. */}
        <div className="pi-report-hero-score">
          <small>Evidence strength</small>
          <strong>{report.confidence?.level || 'Not assessed'}</strong>
          <span>
            {report.scores?.coverage
              ? `${report.scores.coverage.componentsScored} of ${report.scores.coverage.componentsTotal} dimensions assessed`
              : 'Dimension coverage unavailable'}
          </span>
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
      </header>

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

      <div className="pi-hero-metrics">
        <MetricTile label="Listing asking price" value={fmt(report.snapshot?.price ?? report.property?.price)} />
        {sale?.success && (
          <MetricTile
            label="Valuation"
            value={fmt(sale.centralEstimate?.value ?? sale.centralEstimate)}
            hint={`${sale.evidenceCount} evidence source${sale.evidenceCount === 1 ? '' : 's'}`}
          />
        )}
        {report.financeRequest?.purchasePrice?.scenarioPurchasePrice != null && (
          <MetricTile
            label="Your purchase scenario"
            value={fmt(report.financeRequest.purchasePrice.scenarioPurchasePrice)}
            hint="Entered by you"
          />
        )}
        <MetricTile
          label="Listing rent"
          value={
            report.property?.monthly_rent != null && report.property.monthly_rent !== ''
              ? `${fmt(report.property.monthly_rent)}/mo`
              : '—'
          }
        />
      </div>

      <ReportSection title="Executive summary" badge="AI narrative">
        <p className="pi-summary-text">{report.executiveSummary}</p>
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

      {(sale?.success || pricePosition?.success) && (
        <ReportSection
          title="Price intelligence"
          badge={confidenceBadge(sale?.confidenceAssessment?.level || sale?.confidence)}
        >
          {sale?.success && (
            <div className="pi-metric-grid">
              <MetricTile
                label="Value range"
                value={`${fmt(sale.lowerEstimate?.value ?? sale.lowerEstimate)} – ${fmt(sale.upperEstimate?.value ?? sale.upperEstimate)}`}
              />
              <MetricTile
                label="Central estimate"
                value={fmt(sale.centralEstimate?.value ?? sale.centralEstimate)}
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
              <h4 className="pi-subheading">Comparable sales</h4>
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

      <PropertyFactsSection report={report} />
      <PlanningDevelopmentSection report={report} />

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
                value={fmt(rent.currentRent ?? report.property?.monthly_rent)}
                hint="Listing / current rent"
              />
              <MetricTile
                label="Market rent evidence"
                value={`${fmt(rent.marketRange?.low)}–${fmt(rent.marketRange?.high)}`}
                hint="Market evidence"
              />
              <MetricTile
                label="Recommended rent"
                value={fmt(rent.recommendedRent)}
                hint="Market evidence — not your scenario"
              />
              {report.financeRequest?.expectedRent?.scenarioInput != null && (
                <MetricTile
                  label="Your expected rent"
                  value={`${fmt(report.financeRequest.expectedRent.scenarioInput)}/mo`}
                  hint="Entered by you"
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

      {(inv?.presented || inv?.metrics || inv?.partial) && (
        <ReportSection title="Investment intelligence" badge={inv?.presented ? 'Evidence gated' : undefined}>
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
        </ReportSection>
      )}

      <LandlordDecisionSection decision={report.personalDecision} />

      {marketContext && (
        <ReportSection
          title="Area intelligence"
          badge={`${marketContext.postcode} · context`}
          defaultOpen={false}
        >
          <p className="pi-muted">
            Supporting area evidence. Property-specific results above take precedence over these area figures.
          </p>
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
        </ReportSection>
      )}

      {report.opportunities?.length > 0 && (
        <ReportSection title="Opportunities" badge={`${report.opportunities.length} identified`} defaultOpen={false}>
          {report.opportunities.map((o) => (
            <article key={o.id} className="pi-opp-card">
              <header>
                <strong>{o.title}</strong>
                <span className={`pi-confidence pi-confidence-${confidenceClass(o.confidenceLabel)}`}>{o.confidenceLabel}</span>
              </header>
              {o.description && <p>{o.description}</p>}
              <p className="pi-muted"><strong>Evidence:</strong> {o.evidence}</p>
            </article>
          ))}
        </ReportSection>
      )}

      {report.risks?.length > 0 && (
        <ReportSection title="Risk radar" badge={`${report.risks.length} flags`} defaultOpen={false}>
          {report.risks.map((r) => (
            <article key={r.id} className="pi-risk-card">
              <header>
                <strong>{r.title}</strong>
                <span className="pi-risk-tag">{r.category}</span>
              </header>
              <p className="pi-muted">Probability: {r.probability} · Impact: {r.impact}</p>
              <p>{r.evidence}</p>
              <p className="pi-muted"><strong>Action:</strong> {r.recommendedAction}</p>
            </article>
          ))}
        </ReportSection>
      )}

      {report.recommendation && (
        <ReportSection title="Recommended action" defaultOpen>
          <h4 className="pi-action-title">{report.recommendation.action}</h4>
          <p><strong>Why:</strong> {report.recommendation.why}</p>
          <p className="pi-muted"><strong>Expected impact:</strong> {report.recommendation.expectedImpact}</p>
        </ReportSection>
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
