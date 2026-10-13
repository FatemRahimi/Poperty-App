import React from 'react';
import { sanitizePropertyTypeDisplay } from '../../Utils/propertyFactsDisplay';
import {
  findingEffectGroup,
  letCaseFindings,
  letCaseKeyNumbers,
  letCheckingCopy,
  letCheckingItems,
  letDecisionSummary,
  letNextActions,
  letWhatMatters,
  orderFindingsForCase,
} from '../../Utils/letPropertyCaseDisplay';

function FindingLine({ item, index }) {
  return (
    <article data-testid={`case-finding-${item.id || index}`}>
      <strong>{item.title}</strong>
      {item.explanation ? <p>{item.explanation}</p> : null}
      {item.importance === 'context_only' ? (
        <p className="pi-muted">Context only. This is not a letting conclusion.</p>
      ) : null}
    </article>
  );
}

export function LetInvestAnalysisHistory({ entries = [], onOpen }) {
  if (!entries.length) return null;
  return (
    <div data-testid="case-analysis-history">
      <ul className="pi-case-history">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button type="button" className="pi-history-btn" onClick={() => onOpen?.(entry.id)}>
              {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : 'Saved analysis'}
              {entry.confidenceLevel
                ? ` · ${entry.confidenceLevel} confidence${
                  entry.confidenceLevelIsLegacyEstimate ? ' · earlier model' : ''
                }`
                : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LetInvestPropertyCase({
  report,
  workspace,
  listingSubject = false,
  snapshotView = false,
  onFocusUnderwritingInput = null,
  onEditListing = null,
}) {
  const summary = letDecisionSummary(report);
  const findings = orderFindingsForCase(letCaseFindings(report, workspace));
  const matters = letWhatMatters(findings);
  const numbers = letCaseKeyNumbers(report, workspace, listingSubject);
  const checks = letCheckingItems(report, workspace);
  const actions = letNextActions({
    workspace,
    intelligence: report?.decisionIntelligence,
    limitations: checks,
  });
  const propertyType = sanitizePropertyTypeDisplay(
    report?.property?.property_type || report?.property?.propertyType
  );
  const grouped = {
    risk: findings.filter((item) => findingEffectGroup(item) === 'risk'),
    opportunity: findings.filter((item) => findingEffectGroup(item) === 'opportunity'),
    neutral: findings.filter((item) => findingEffectGroup(item) === 'neutral'),
  };

  return (
    <article className="pi-property-case" data-testid="property-case" aria-label="Property case">
      <header className="pi-case-block">
        <p className="pi-case-kicker">Property</p>
        <h2 className="pi-case-address" data-testid="case-property-address">
          {report?.property?.address || 'Exact property'}
        </h2>
        {propertyType ? <p data-testid="case-property-type">{propertyType}</p> : null}
        <p className="pi-case-kicker">Your goal</p>
        <p data-testid="case-goal"><strong>Buy to let</strong></p>
        {snapshotView ? (
          <p className="pi-snapshot-banner" data-testid="historical-snapshot-banner" role="status">
            Saved snapshot from this analysis. This is historical analysis — not a newly generated result.
          </p>
        ) : null}
      </header>

      <section className="pi-case-block" data-testid="decision-summary" aria-labelledby="case-summary-heading">
        <h3 id="case-summary-heading">Decision summary</h3>
        <p data-testid="decision-summary-text">{summary.text}</p>
        <p className="pi-muted">{summary.notAdvice}</p>
      </section>

      <section className="pi-case-block" data-testid="what-matters" aria-labelledby="case-matters-heading">
        <h3 id="case-matters-heading">What matters</h3>
        {matters.length ? (
          matters.map((item, index) => (
            <FindingLine key={item.id || index} item={item} index={index} />
          ))
        ) : (
          <p data-testid="what-matters-empty">
            No assessed evidence currently produces a material finding for this letting case.
          </p>
        )}
      </section>

      <section className="pi-case-block" data-testid="key-numbers" aria-labelledby="case-numbers-heading">
        <h3 id="case-numbers-heading">Key numbers</h3>
        {numbers.length ? (
          <div className="pi-metric-grid">
            {numbers.map((item) => (
              <div key={item.id} className="pi-metric-tile pi-metric-tile--assessed" data-testid={`case-metric-${item.id}`}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p data-testid="key-numbers-empty">
            No investment figures are assessed yet. Unassessed figures stay in Calculations and are not shown as zero.
          </p>
        )}
      </section>

      <section className="pi-case-block" data-testid="risks-opportunities" aria-labelledby="case-risks-heading">
        <h3 id="case-risks-heading">Risks / opportunities</h3>
        {!findings.length ? (
          <p>No assessed finding is available to classify as a risk or an opportunity.</p>
        ) : null}
        {grouped.risk.length ? (
          <div data-testid="case-risks">
            <h4>Risks</h4>
            {grouped.risk.map((item, index) => (
              <FindingLine key={item.id || `risk-${index}`} item={item} index={index} />
            ))}
          </div>
        ) : null}
        {grouped.opportunity.length ? (
          <div data-testid="case-opportunities">
            <h4>Opportunities</h4>
            {grouped.opportunity.map((item, index) => (
              <FindingLine key={item.id || `opp-${index}`} item={item} index={index} />
            ))}
          </div>
        ) : null}
        {grouped.neutral.length ? (
          <div data-testid="case-neutral-findings">
            <h4>Other assessed findings</h4>
            {grouped.neutral.map((item, index) => (
              <FindingLine key={item.id || `neutral-${index}`} item={item} index={index} />
            ))}
          </div>
        ) : null}
      </section>

      <section
        className="pi-case-block"
        data-testid="what-needs-checking"
        aria-labelledby="case-checking-heading"
      >
        <h3 id="case-checking-heading">What needs checking</h3>
        {checks.length ? (
          <ul data-testid="let-limitations">
            {checks.map((row) => {
              const copy = letCheckingCopy(row);
              return (
                <li key={row.id || row.inputKey || copy.title} data-testid={row.inputKey ? `underwriting-input-${row.inputKey}` : `let-limitation-${row.id}`}>
                  <strong>{copy.title}</strong>
                  {copy.detail ? <p>{copy.detail}</p> : null}
                  {row.resolutionAction === 'edit_listing' && onEditListing ? (
                    <button type="button" onClick={onEditListing}>
                      Edit listing to add internal floor area
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Nothing further is listed as missing for this case.</p>
        )}
      </section>

      <section className="pi-case-block" data-testid="next-actions" aria-labelledby="case-actions-heading">
        <h3 id="case-actions-heading">Next actions</h3>
        {actions.length ? (
          <ul data-testid="missing-underwriting-inputs">
            {actions.map((action) => (
              <li key={action.inputKey || action.id || action.title}>
                <strong>{action.title}</strong>
                {action.detail ? <p>{action.detail}</p> : null}
                {action.inputKey && onFocusUnderwritingInput ? (
                  <button
                    type="button"
                    className="pi-workspace-input-btn"
                    data-testid={`underwriting-focus-${action.inputKey}`}
                    onClick={() => onFocusUnderwritingInput(action.inputKey)}
                  >
                    Review {action.title}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No further action is listed on this analysis.</p>
        )}
      </section>

      <section className="pi-case-block" data-testid="case-secondary-actions" aria-labelledby="case-secondary-heading">
        <h3 id="case-secondary-heading">Secondary actions</h3>
        <p>
          <a href="#pi-what-if">Explore a what-if scenario</a>
        </p>
        <p className="pi-muted">
          What-if compares a change with this property case. It does not replace the saved analysis.
        </p>
      </section>
    </article>
  );
}
