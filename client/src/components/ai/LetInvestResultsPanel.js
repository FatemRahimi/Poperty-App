import React from 'react';
import SubjectAttributeCompletionPanel from './SubjectAttributeCompletionPanel';
import { assessmentLabel } from '../../Utils/decisionWorkspaceDisplay';
import { causeLabel, UNDERWRITING_SECTIONS } from '../../Utils/underwritingInputDisplay';
import {
  deeperLetEconomicsIncomplete,
  letKeyEconomics,
  letLimitationItems,
  letSaleSupportItems,
  purchasePriceBasisRows,
  rentBasisCalloutText,
  rentEvidenceRows,
  reportHasListingProvenance,
} from '../../Utils/letResultsDisplay';

function fmt(n) {
  return n != null && !Number.isNaN(Number(n)) ? `£${Number(n).toLocaleString()}` : '—';
}
function fmtPct(n) {
  return n != null ? `${n}%` : '—';
}

function AssessmentBadge({ state }) {
  const label = assessmentLabel(state);
  const cls = String(state || 'NOT_ASSESSED').toLowerCase().replace(/_/g, '-');
  return (
    <span className={`pi-assess-badge pi-assess-badge--${cls}`} data-testid="assessment-state">
      {label}
    </span>
  );
}

function formatEconomicValue(item) {
  if (!item?.available) return 'Not assessed';
  if (item.id === 'grossYield' || item.id === 'netYield' || item.basis === 'MARKET_RENT') {
    return fmtPct(item.value);
  }
  if (item.id === 'dscr') return String(item.value);
  if (item.id === 'noi' || item.id === 'annualCashFlow' || item.id === 'monthlyCashFlow') return fmt(item.value);
  if (item.value != null && item.value !== '') return String(item.value);
  return 'Assessed';
}

function economicLabel(item, { earlyGrossYield = false } = {}) {
  if (item?.id === 'grossYield' && earlyGrossYield && item.available) {
    return 'Gross yield (early orientation)';
  }
  if (item?.basis === 'MARKET_RENT') return 'Market-rent-based gross yield';
  return item?.label;
}

function ListingAttributeAction({ row, onEditListing }) {
  if (!row?.isListingAttribute || row?.resolutionAction !== 'edit_listing' || !onEditListing) {
    return null;
  }
  return (
    <button
      type="button"
      className="pi-workspace-input-btn"
      data-testid={`listing-edit-${row.listingAttributeKey || row.id || 'internal_area'}`}
      onClick={onEditListing}
    >
      Edit listing to add internal floor area
    </button>
  );
}

function FindingCard({ item, index }) {
  const effectLabel = (effect) => {
    if (effect === 'supporting') return 'Currently supporting this landlord scenario';
    if (effect === 'limiting') return 'Currently limiting this landlord scenario';
    if (effect === 'neutral') return 'Assessed for this landlord scenario';
    return null;
  };
  return (
    <article
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
  );
}

export default function LetInvestResultsPanel({
  report,
  workspace,
  listingSubject,
  onFocusUnderwritingInput = null,
  onEditListing = null,
}) {
  const hasListing = reportHasListingProvenance(report, { listingSubject });
  const economics = letKeyEconomics(report, workspace);
  const saleSupport = letSaleSupportItems(workspace);
  const earlyGrossYield = deeperLetEconomicsIncomplete(economics);
  const rentBasis = report?.investment?.presented?.rentBasis;
  const rentCallout = rentBasisCalloutText(rentBasis);
  const priceRows = purchasePriceBasisRows(report, hasListing);
  const rentRows = rentEvidenceRows(report, hasListing);
  const intelligence = report?.decisionIntelligence;
  const limitations = letLimitationItems({
    workspace,
    intelligence,
    economics,
    legalTitleDomain: report?.legalTitleDomain,
  });
  const userInputGaps = limitations.filter((row) => row.cause === 'MISSING_USER_INPUT' && row.inputKey);
  const findings = Array.isArray(intelligence?.materialFindings)
    ? intelligence.materialFindings
    : (Array.isArray(workspace?.findings) ? workspace.findings : []);
  const drivers = Array.isArray(intelligence?.sensitivityDrivers)
    ? intelligence.sensitivityDrivers
    : [];
  const pd = report?.personalDecision?.profile === 'landlord' ? report.personalDecision : null;
  const explanation = pd?.explanation;
  const unresolved = Array.isArray(workspace?.unresolved) ? workspace.unresolved : [];
  const contextEvidence = Array.isArray(workspace?.contextEvidence) ? workspace.contextEvidence : [];

  return (
    <div
      className="pi-decision-workspace pi-let-results"
      data-testid="decision-workspace"
      data-let-hierarchy="assessment-economics-limitations-why-evidence"
    >
      <section className="pi-workspace-context pi-workspace-decision" data-testid="decision-context">
        <p className="pi-report-kicker">LET / INVEST assessment</p>
        <h2 data-testid="decision-context-headline">
          {workspace.copy?.headline || 'You are assessing this property to LET / INVEST'}
        </h2>
        {workspace.copy?.notAdvice ? (
          <p className="pi-muted pi-workspace-one-liner">{workspace.copy.notAdvice}</p>
        ) : (
          <p className="pi-muted pi-workspace-one-liner">This is not financial, investment, or legal advice.</p>
        )}
      </section>

      <section className="pi-workspace-block pi-workspace-signals" data-testid="key-intelligence">
        <h3>Key economics</h3>
        <p className="pi-muted" data-testid="let-economics-depth">
          Gross yield is orientation-level when NOI, net yield, cash flow or DSCR stay not assessed.
          Those deeper metrics use only existing assessed values.
        </p>
        {(priceRows.length > 0 || rentRows.length > 0) && (
          <div className="pi-metric-grid pi-let-basis-grid" data-testid="let-price-rent-basis">
            {priceRows.map((row) => (
              <div key={row.id} className="pi-metric-tile" data-testid={`let-basis-${row.id}`}>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
                <em>{row.hint}</em>
              </div>
            ))}
            {rentRows.map((row) => (
              <div key={row.id} className="pi-metric-tile" data-testid={`let-basis-${row.id}`}>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
                <em>{row.hint}</em>
              </div>
            ))}
          </div>
        )}
        <div className="pi-metric-grid">
          {economics.map((item) => (
            <div
              key={item.id}
              className={`pi-metric-tile ${item.available ? 'pi-metric-tile--assessed' : 'pi-metric-tile--missing'}${
                item.id === 'grossYield' && earlyGrossYield && item.available ? ' pi-metric-tile--orientation' : ''
              }`}
              data-testid={`workspace-metric-${item.id}`}
            >
              <small>{economicLabel(item, { earlyGrossYield })}</small>
              <strong>{formatEconomicValue(item)}</strong>
              <AssessmentBadge state={item.state} />
              {item.id === 'grossYield' && earlyGrossYield && item.available && (
                <em data-testid="gross-yield-orientation-note">
                  Early orientation only — not a complete investment assessment while NOI, cash flow,
                  DSCR or net yield remain not assessed.
                </em>
              )}
              {!item.available && item.isUserInput && (
                <span className="pi-workspace-cause" data-testid={`workspace-cause-${item.id}`}>
                  {causeLabel('MISSING_USER_INPUT')}
                </span>
              )}
              {!item.available && item.howToResolve && <em>{item.howToResolve}</em>}
              {!item.available && item.isUserInput && onFocusUnderwritingInput && item.resolutionInputKeys?.length > 0 && (
                <button
                  type="button"
                  className="pi-workspace-input-btn"
                  data-testid={`workspace-complete-input-${item.id}`}
                  onClick={() => onFocusUnderwritingInput(item.resolutionInputKeys[0])}
                >
                  Add your input
                </button>
              )}
            </div>
          ))}
        </div>
        {rentCallout && (
          <div className="pi-rent-basis-callout" data-testid="rent-basis-disclosure">
            <strong>Rent basis for yield metrics:</strong>{' '}
            {rentCallout.replace(/^Rent basis for yield metrics:\s*/i, '')}
          </div>
        )}
        <p className="pi-muted" data-testid="let-invest-landlord-methodology">
          Missing vacancy, opex or mortgage inputs stay not assessed.
        </p>
      </section>

      {limitations.length > 0 && (
        <section
          className="pi-workspace-block pi-workspace-improve"
          data-testid="let-limitations"
        >
          <h3>Risks, limitations and missing evidence</h3>
          <p className="pi-muted">
            Existing gaps and verification items only — not a new risk score.
          </p>
          {userInputGaps.length > 0 && (
            <div data-testid="missing-underwriting-inputs">
              <h4 className="pi-subheading">Improve this assessment</h4>
              <ul className="pi-workspace-underwriting">
                {userInputGaps.map((row) => (
                  <li key={row.id || row.inputKey} data-testid={`underwriting-input-${row.inputKey}`}>
                    <div className="pi-workspace-underwriting-head">
                      <strong>{row.title || row.label}</strong>
                      <span className="pi-workspace-cause">{causeLabel(row.cause)}</span>
                    </div>
                    {row.unlockLabels?.length > 0 && (
                      <p className="pi-muted">Unlocks: {row.unlockLabels.join(', ')}</p>
                    )}
                    {row.detail && <p>{row.detail}</p>}
                    {UNDERWRITING_SECTIONS[row.section] && (
                      <p className="pi-muted">Section: {UNDERWRITING_SECTIONS[row.section]}</p>
                    )}
                    {onFocusUnderwritingInput && row.inputKey && (
                      <button
                        type="button"
                        className="pi-workspace-input-btn"
                        data-testid={`underwriting-focus-${row.inputKey}`}
                        onClick={() => onFocusUnderwritingInput(row.inputKey)}
                      >
                        Add {row.title || row.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="pi-workspace-underwriting">
            {limitations
              .filter((row) => !(row.cause === 'MISSING_USER_INPUT' && row.inputKey))
              .map((row) => (
                <li key={row.id || row.title} data-testid={`let-limitation-${row.id}`}>
                  <div className="pi-workspace-underwriting-head">
                    <strong>{row.title || row.label}</strong>
                    {row.cause && <span className="pi-workspace-cause">{causeLabel(row.cause)}</span>}
                    {row.state && <AssessmentBadge state={String(row.state).toUpperCase().replace('NOTASSESSED', 'NOT_ASSESSED')} />}
                  </div>
                  {row.detail && <p className="pi-muted">{row.detail}</p>}
                  {row.inputKey && onFocusUnderwritingInput && (
                    <button
                      type="button"
                      className="pi-workspace-input-btn"
                      onClick={() => onFocusUnderwritingInput(row.inputKey)}
                    >
                      Add {row.title || row.label}
                    </button>
                  )}
                  <ListingAttributeAction row={row} onEditListing={onEditListing} />
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="pi-workspace-block" data-testid="let-why">
        <h3>Why this assessment</h3>
        {explanation?.overall ? (
          <div className="pi-landlord-why" data-testid="landlord-explanation">
            <p>{explanation.overall}</p>
            {(explanation.strongestFactors || []).map((row) => (
              <p key={`pos-${row.dimension || row.text}`}>{row.text}</p>
            ))}
            {(explanation.weakestOrUnavailable || []).map((row) => (
              <p key={`weak-${row.dimension || row.text}`}>{row.text}</p>
            ))}
            {explanation.confidenceLimitations?.text && (
              <p className="pi-muted">{explanation.confidenceLimitations.text}</p>
            )}
          </div>
        ) : (
          <p className="pi-muted">
            {pd?.available
              ? 'Landlord fit uses the assessed dimensions on this analysis. It is not confidence and not purchase advice.'
              : (pd?.unavailableReason || 'Landlord fit is not assessed until enough dimensions have evidence.')}
          </p>
        )}
        {findings.length > 0 ? (
          <div data-testid="decision-intelligence-findings">
            {findings.map((item, index) => (
              <FindingCard key={item.id || index} item={item} index={index} />
            ))}
          </div>
        ) : (
          <p data-testid="decision-intelligence-findings-empty">
            No assessed evidence currently produces a material finding for this landlord scenario.
          </p>
        )}
        {drivers.length > 0 && (
          <div data-testid="decision-intelligence-drivers">
            <h4 className="pi-subheading">What can change this result</h4>
            <p className="pi-muted">
              Existing scenario inputs that may affect calculated results. This is not a ranking and
              not an optimisation.
            </p>
            {drivers.map((item, index) => (
              <article
                key={item.id || item.inputKey || index}
                className="pi-planning-item"
                data-testid={`decision-driver-${item.inputKey || item.id || index}`}
              >
                <strong>{item.title}</strong>
                {item.explanation && <em className="pi-fact-source">{item.explanation}</em>}
                {item.scope === 'scenario' && (
                  <em className="pi-fact-meta">Scenario input — not a property fact.</em>
                )}
              </article>
            ))}
          </div>
        )}
        {pd && (
          <details className="pi-workspace-pd" data-testid="landlord-personal-decision-details">
            <summary>Landlord dimensions</summary>
            <p className="pi-muted">
              {pd.scoreLabel || 'Personal Decision'} — how well this property fits the selected landlord
              scenario. It is not confidence, not a purchase recommendation, and not financial advice.
            </p>
          </details>
        )}
      </section>

      <SubjectAttributeCompletionPanel report={report} unresolved={unresolved} />

      {(saleSupport.length > 0 || contextEvidence.length > 0) && (
        <details className="pi-workspace-block pi-workspace-disclosure" data-testid="workspace-context-evidence">
          <summary>Valuation and supporting evidence snapshot</summary>
          <p className="pi-muted">
            Sale valuation and asking-price position are supporting context for LET / INVEST, not the
            primary investment metrics. Area sold-price context is not subject value.
          </p>
          <div className="pi-metric-grid">
            {saleSupport.map((item) => (
              <div
                key={item.id}
                className={`pi-metric-tile ${item.available ? 'pi-metric-tile--assessed' : 'pi-metric-tile--missing'}`}
                data-testid={`workspace-metric-${item.id}`}
              >
                <small>{item.label}</small>
                <strong>{item.available ? (item.value != null ? fmt(item.value) : 'Assessed') : 'Not assessed'}</strong>
                <AssessmentBadge state={item.state} />
                {!item.available && item.howToResolve && <em>{item.howToResolve}</em>}
                <ListingAttributeAction row={item} onEditListing={onEditListing} />
              </div>
            ))}
            {contextEvidence.map((item) => (
              <div
                key={item.id}
                className="pi-metric-tile pi-metric-tile--context"
                data-testid={`workspace-evidence-${item.id}`}
              >
                <small>{item.label}</small>
                <strong>
                  {item.kind === 'marketTransactionContext' || item.presentationRole === 'supporting_context'
                    ? (item.value != null && item.value !== '' ? String(item.value) : 'Not assessed')
                    : (item.available ? 'Assessed' : 'Not assessed')}
                </strong>
                <AssessmentBadge state={item.state} />
                {(item.kind === 'marketTransactionContext' || item.presentationRole === 'supporting_context') && (
                  <em data-testid={`workspace-evidence-disclaimer-${item.id}`}>
                    Orientation only — not comparable sold evidence, not subject value, not asking-price judgement.
                  </em>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
