import React from 'react';
import { AssessedMetricTile, AssessedText } from './AssessedMetric';
import {
  assessmentForMetric,
  displayForMetric,
  fieldSemanticsDisplay,
  financingDisplay,
  grossYieldLabel,
  hasMetricAssessment,
  resolveAssessedDisplay,
  resolveRentBasisKind,
} from '../../Utils/assessedMetricDisplay';

const COMPONENT_LABELS = {
  yield: 'Gross yield',
  cashFlow: 'Cash flow',
  dscr: 'Debt service cover',
  market: 'Market strength',
  vacancy: 'Vacancy risk',
  risk: 'Financing risk',
  liquidity: 'Exit liquidity',
};

const MISSING_INPUT_HINTS = {
  no_rent_evidence: 'Enter the expected monthly rent.',
  costs_defaulted:
    'Enter the operating costs (maintenance, insurance, management fee, service charge, ground rent, taxes).',
  no_vacancy_assumption: 'Enter a vacancy assumption.',
  no_debt_service: 'Enter a deposit and interest rate so debt service can be calculated.',
  no_market_data: 'Market strength data is not available for this property yet.',
  no_liquidity_data: 'Exit liquidity data is not available for this property yet.',
};

function InvestmentScorePanel({ score }) {
  if (!score) return null;

  const scored = Object.entries(score.componentDetail || {}).filter(([, c]) => c?.available);
  const excluded = score.excluded || [];

  const isLegacy = score.available === undefined && Number.isFinite(score.score);
  if (isLegacy) {
    return (
      <div className="ai-panel">
        <h2>Investment score: {score.score}/100</h2>
        <p className="ai-insight-meta">
          {score.label} · saved under an earlier model, which did not record which
          inputs were evidenced.
        </p>
        <ul className="ai-insight-meta">
          {Object.entries(score.components || {}).map(([k, v]) => (
            <li key={k}>
              {COMPONENT_LABELS[k] || k}: {Number.isFinite(v) ? v : 'Not assessed'}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!score.available || score.score === null || score.score === undefined) {
    const hints = [
      ...new Set(
        excluded
          .map((e) => MISSING_INPUT_HINTS[e.state])
          .filter(Boolean)
      ),
    ];
    return (
      <div className="ai-panel ai-panel--unavailable">
        <h2>Investment score: insufficient evidence</h2>
        <p className="ai-insight-meta">
          {score.unavailableReason ||
            'Not enough evidenced inputs to produce an investment score.'}
        </p>

        {hints.length > 0 && (
          <>
            <h3 className="ai-subheading">To unlock this analysis</h3>
            <ul className="ai-insight-meta">
              {hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </>
        )}

        {excluded.length > 0 && (
          <>
            <h3 className="ai-subheading">Not assessed</h3>
            <ul className="ai-insight-meta">
              {excluded.map((e) => (
                <li key={e.component}>
                  <strong>{COMPONENT_LABELS[e.component] || e.component}:</strong> {e.detail}
                </li>
              ))}
            </ul>
          </>
        )}

        {scored.length > 0 && (
          <>
            <h3 className="ai-subheading">Available on current inputs</h3>
            <ul className="ai-insight-meta">
              {scored.map(([k, c]) => (
                <li key={k}>
                  {COMPONENT_LABELS[k] || k}: {c.score}/100 — {c.detail}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="ai-panel">
      <h2>Investment score: {score.score}/100</h2>
      <p className="ai-insight-meta">
        {score.label}
        {score.coverage
          ? ` · based on ${score.coverage.componentsScored} of ${score.coverage.componentsTotal} components`
          : ''}
      </p>

      <ul className="ai-insight-meta">
        {scored.map(([k, c]) => (
          <li key={k}>
            {COMPONENT_LABELS[k] || k}: {c.score}/100 — {c.detail}
          </li>
        ))}
      </ul>

      {excluded.length > 0 && (
        <>
          <h3 className="ai-subheading">Not assessed</h3>
          <ul className="ai-insight-meta">
            {excluded.map((e) => (
              <li key={e.component}>
                <strong>{COMPONENT_LABELS[e.component] || e.component}:</strong> {e.detail}
              </li>
            ))}
          </ul>
        </>
      )}

      {score.limitations?.length > 0 && (
        <>
          <h3 className="ai-subheading">Limitations</h3>
          <ul className="ai-insight-meta">
            {score.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function scenarioDisplay(metrics, scenario, key, format) {
  return resolveAssessedDisplay({
    assessment: assessmentForMetric(metrics, key),
    value: scenario?.[key],
    format,
  });
}

export default function InvestmentResultView({ result, userEnteredRent = false }) {
  if (!result?.metrics) return null;

  const metrics = result.metrics;
  const basisKind = resolveRentBasisKind(metrics, { userEnteredRent });
  const financing = financingDisplay(metrics.financingState || metrics.metricAssessment?.financing);
  const interest = fieldSemanticsDisplay(metrics.inputSemantics?.interestRate, 'percent');
  const term = fieldSemanticsDisplay(metrics.inputSemantics?.mortgageTermYears, 'number');
  const vacancy = fieldSemanticsDisplay(metrics.inputSemantics?.vacancyAssumption, 'percent');
  const canonical = hasMetricAssessment(metrics);

  return (
    <div data-testid="investment-result-view">
      {!canonical && (
        <p className="ai-insight-meta" data-testid="legacy-assessment-note">
          Saved under an earlier model that did not record assessment state. Figures
          are shown only where a numeric value was stored — they are not re-labelled
          as assessed or not assessed.
        </p>
      )}

      <div className="ai-metrics-grid ai-metrics-grid--dense">
        <AssessedMetricTile
          label={grossYieldLabel(basisKind)}
          display={displayForMetric(metrics, 'grossYield', 'percent')}
          testId="metric-grossYield"
        />
        <AssessedMetricTile
          label="Net yield"
          display={displayForMetric(metrics, 'netYield', 'percent')}
          testId="metric-netYield"
        />
        <AssessedMetricTile
          label="Annual rent"
          display={displayForMetric(metrics, 'annualRent', 'currency')}
          testId="metric-annualRent"
        />
        <AssessedMetricTile
          label="Vacancy-adjusted income"
          display={displayForMetric(metrics, 'effectiveGrossRent', 'currency')}
          testId="metric-vacancyAdjustedIncome"
        />
        <AssessedMetricTile
          label="Operating costs"
          display={displayForMetric(metrics, 'operatingExpenses', 'currency')}
          testId="metric-operatingCosts"
        />
        <AssessedMetricTile
          label="NOI"
          display={displayForMetric(metrics, 'noi', 'currency')}
          testId="metric-noi"
        />
        <AssessedMetricTile
          label="Mortgage payment"
          display={displayForMetric(metrics, 'monthlyDebtService', 'currency')}
          testId="metric-mortgagePayment"
        />
        <AssessedMetricTile
          label="Annual debt service"
          display={displayForMetric(metrics, 'annualDebtService', 'currency')}
          testId="metric-annualDebtService"
        />
        <AssessedMetricTile
          label="Annual cash flow"
          display={displayForMetric(metrics, 'annualCashFlow', 'currency')}
          testId="metric-annualCashFlow"
        />
        <AssessedMetricTile
          label="Monthly cash flow"
          display={displayForMetric(metrics, 'monthlyCashFlow', 'currency')}
          testId="metric-monthlyCashFlow"
        />
        <AssessedMetricTile
          label="DSCR"
          display={displayForMetric(metrics, 'dscr', 'number')}
          testId="metric-dscr"
        />
        <AssessedMetricTile
          label="Financing"
          display={financing}
          testId="financing-state"
        />
      </div>

      <div className="ai-metrics-grid">
        <AssessedMetricTile
          label="Interest rate"
          display={interest}
          testId="input-interestRate"
        />
        <AssessedMetricTile
          label="Mortgage term"
          display={
            term.numeric
              ? { ...term, text: `${term.text} years` }
              : term
          }
          testId="input-mortgageTermYears"
        />
        <AssessedMetricTile
          label="Vacancy assumption"
          display={vacancy}
          testId="input-vacancyAssumption"
        />
      </div>

      <InvestmentScorePanel score={result.score} />

      {result.scenarios && (
        <div className="ai-panel">
          <h2>Scenario analysis</h2>
          <table className="ai-data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Conservative</th>
                <th>Base</th>
                <th>Optimistic</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Annual cash flow</td>
                <td><AssessedText display={scenarioDisplay(metrics, result.scenarios.conservative, 'annualCashFlow', 'currency')} /></td>
                <td><AssessedText display={scenarioDisplay(metrics, result.scenarios.base, 'annualCashFlow', 'currency')} /></td>
                <td><AssessedText display={scenarioDisplay(metrics, result.scenarios.optimistic, 'annualCashFlow', 'currency')} /></td>
              </tr>
              <tr>
                <td>Net yield</td>
                <td><AssessedText display={scenarioDisplay(metrics, result.scenarios.conservative, 'netYield', 'percent')} /></td>
                <td><AssessedText display={scenarioDisplay(metrics, result.scenarios.base, 'netYield', 'percent')} /></td>
                <td><AssessedText display={scenarioDisplay(metrics, result.scenarios.optimistic, 'netYield', 'percent')} /></td>
              </tr>
              <tr>
                <td>Cash-on-cash</td>
                <td><AssessedText display={resolveAssessedDisplay({ assessment: assessmentForMetric(metrics, 'cashFlow'), value: result.scenarios.conservative?.cashOnCashReturn, format: 'percent' })} /></td>
                <td><AssessedText display={resolveAssessedDisplay({ assessment: assessmentForMetric(metrics, 'cashFlow'), value: result.scenarios.base?.cashOnCashReturn, format: 'percent' })} /></td>
                <td><AssessedText display={resolveAssessedDisplay({ assessment: assessmentForMetric(metrics, 'cashFlow'), value: result.scenarios.optimistic?.cashOnCashReturn, format: 'percent' })} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {Array.isArray(result.sensitivity) && result.sensitivity.length > 0 && (
        <div className="ai-panel">
          <h2>Sensitivity analysis</h2>
          <table className="ai-data-table">
            <thead>
              <tr>
                <th>Change</th>
                <th>Cash flow</th>
                <th>Delta</th>
                <th>Net yield</th>
              </tr>
            </thead>
            <tbody>
              {result.sensitivity.map((s) => (
                <tr key={s.label}>
                  <td>{s.label}</td>
                  <td><AssessedText display={resolveAssessedDisplay({ assessment: assessmentForMetric(metrics, 'annualCashFlow'), value: s.annualCashFlow, format: 'currency' })} /></td>
                  <td><AssessedText display={resolveAssessedDisplay({ assessment: assessmentForMetric(metrics, 'annualCashFlow'), value: s.deltaCashFlow, format: 'currency' })} /></td>
                  <td><AssessedText display={resolveAssessedDisplay({ assessment: assessmentForMetric(metrics, 'netYield'), value: s.netYield, format: 'percent' })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metrics.disclaimer && <p className="ai-disclaimer">{metrics.disclaimer}</p>}
    </div>
  );
}
