import React from 'react';
import { buyDossierView } from '../../Utils/decisionDossierDisplay';

function EvidenceList({ rows, testId }) {
  if (!rows.length) return null;
  return (
    <ul data-testid={testId}>
      {rows.map((row) => (
        <li key={row.id} data-testid={`dossier-evidence-${row.id}`}>
          <strong>{row.label}:</strong> {row.value}
        </li>
      ))}
    </ul>
  );
}

export default function OnePropertyDossier({ buyDecision }) {
  const view = buyDossierView(buyDecision);
  return (
    <section className="pi-workspace-block pi-dossier" data-testid="purchase-dossier" aria-labelledby="purchase-dossier-heading">
      <p className="pi-report-kicker">Purchase decision</p>
      <h3 id="purchase-dossier-heading" data-testid="purchase-conclusion">{view.conclusion}</h3>
      <p className="pi-muted">
        What is known, unknown, and only context for this home. Preference fit is separate and is not this conclusion.
      </p>
      {view.known.length > 0 && (
        <div data-testid="dossier-known">
          <h4 className="pi-subheading">Known</h4>
          <EvidenceList rows={view.known} testId="dossier-known-list" />
        </div>
      )}
      {view.unknown.length > 0 && (
        <div data-testid="dossier-unknown">
          <h4 className="pi-subheading">Not known</h4>
          <EvidenceList rows={view.unknown} testId="dossier-unknown-list" />
        </div>
      )}
      {view.notApplicable.length > 0 && (
        <div data-testid="dossier-not-applicable">
          <h4 className="pi-subheading">Does not apply</h4>
          <EvidenceList rows={view.notApplicable} testId="dossier-not-applicable-list" />
        </div>
      )}
      <div data-testid="dossier-investigation">
        <h4 className="pi-subheading">Investigate next</h4>
        {view.investigation.length ? (
          <ol>
            {view.investigation.map((item) => (
              <li key={item.id} data-testid={`dossier-priority-${item.id}`}>
                <strong>{item.title}</strong>
                {item.priorityLabel ? <p>{item.priorityLabel}</p> : null}
                {item.stateLabel ? <p>{`Current state: ${item.stateLabel}`}</p> : null}
                {item.explanation ? <p>{item.explanation}</p> : null}
                {item.whatNext ? <p>{item.whatNext}</p> : null}
                {item.resolutionLabel ? <p>{`Resolution: ${item.resolutionLabel}`}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="pi-muted">No investigation priorities were returned for this analysis.</p>
        )}
      </div>
      {view.relationships.length > 0 && (
        <div data-testid="dossier-relationships">
          <h4 className="pi-subheading">How the evidence connects</h4>
          <ul>
            {view.relationships.map((row) => (
              <li key={row.id} data-testid={`dossier-relationship-${row.id}`}>
                <strong>{row.title}</strong>
                {row.implication ? <p>{row.implication}</p> : null}
                {row.limitation ? <p>{row.limitation}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.context.length > 0 && (
        <div data-testid="dossier-context">
          <h4 className="pi-subheading">Context only</h4>
          <ul>
            {view.context.map((line) => (
              <li key={line.id} data-testid={`dossier-context-${line.id}`}>{line.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
