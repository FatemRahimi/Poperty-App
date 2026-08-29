import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { analyseInvestment } from '../../services/aiService';
import { useAuth } from '../../context/AuthContext';
import '../../components/ai/AiWorkspaceLayout.css';

const defaultForm = {
  purchasePrice: '',
  deposit: '',
  expectedRent: '',
  vacancyAssumption: 5,
  maintenance: '',
  insurance: 600,
  managementFee: '',
  serviceCharge: '',
  groundRent: '',
  taxes: '',
  interestRate: 5.5,
  mortgageTermYears: 25,
  expectedAppreciation: 3,
  holdingPeriod: 5,
};

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

/**
 * Renders the investment score, or an explicit insufficient-evidence state naming
 * the inputs that would unlock it. The score can legitimately be null, so it is
 * never interpolated into a "x/100" string without checking availability first.
 */
function InvestmentScorePanel({ score }) {
  if (!score) return null;

  const scored = Object.entries(score.componentDetail || {}).filter(([, c]) => c?.available);
  const excluded = score.excluded || [];

  // Results saved before componentDetail/available existed carry only a number and a
  // flat component map. Treat a numeric score with no availability flag as legacy
  // rather than as unavailable, so old analyses still display.
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

const InvestmentAnalyst = () => {
  const { isAuthenticated } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? undefined : Number(v) || v])
      );
      const data = await analyseInvestment(payload);
      setResult(data.output);
    } catch (err) {
      setError(err.response?.data?.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <AiWorkspaceLayout title="AI Investment Analyst" subtitle="Transparent quantitative investment analysis with scenarios and sensitivity.">
        <div className="ai-empty-state">
          <p>Sign in to run investment analysis.</p>
          <Link to="/login" state={{ from: '/ai-services/investment-analyst' }} className="ai-btn ai-btn-primary">Sign in</Link>
        </div>
      </AiWorkspaceLayout>
    );
  }

  return (
    <AiWorkspaceLayout
      title="AI Investment Analyst"
      subtitle="Evaluate opportunities with documented formulas, three scenarios, sensitivity analysis and a transparent investment score."
    >
      {error && <div className="ai-alert ai-alert-error">{error}</div>}

      <div className="ai-grid-2">
        <form className="ai-panel ai-form-dark" onSubmit={onSubmit}>
          <h2>Investment inputs</h2>
          <div className="ai-form-grid">
            <div className="ai-field"><label>Purchase price (£)</label><input name="purchasePrice" type="number" value={form.purchasePrice} onChange={onChange} required /></div>
            <div className="ai-field"><label>Deposit (£)</label><input name="deposit" type="number" value={form.deposit} onChange={onChange} /></div>
            <div className="ai-field"><label>Expected rent (£/month)</label><input name="expectedRent" type="number" value={form.expectedRent} onChange={onChange} required /></div>
            <div className="ai-field"><label>Vacancy assumption (%)</label><input name="vacancyAssumption" type="number" value={form.vacancyAssumption} onChange={onChange} /></div>
            <div className="ai-field"><label>Interest rate (%)</label><input name="interestRate" type="number" step="0.1" value={form.interestRate} onChange={onChange} /></div>
            <div className="ai-field"><label>Mortgage term (years)</label><input name="mortgageTermYears" type="number" value={form.mortgageTermYears} onChange={onChange} /></div>
            <div className="ai-field"><label>Maintenance (£/yr)</label><input name="maintenance" type="number" value={form.maintenance} onChange={onChange} /></div>
            <div className="ai-field"><label>Insurance (£/yr)</label><input name="insurance" type="number" value={form.insurance} onChange={onChange} /></div>
            <div className="ai-field"><label>Management fee (£/yr)</label><input name="managementFee" type="number" value={form.managementFee} onChange={onChange} /></div>
            <div className="ai-field"><label>Service charge (£/yr)</label><input name="serviceCharge" type="number" value={form.serviceCharge} onChange={onChange} /></div>
            <div className="ai-field"><label>Expected appreciation (%/yr)</label><input name="expectedAppreciation" type="number" step="0.1" value={form.expectedAppreciation} onChange={onChange} /></div>
            <div className="ai-field"><label>Holding period (years)</label><input name="holdingPeriod" type="number" value={form.holdingPeriod} onChange={onChange} /></div>
          </div>
          <button type="submit" className="ai-btn ai-btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Analysing…' : 'Run investment analysis'}
          </button>
        </form>

        <div>
          {!result && !loading && (
            <div className="ai-empty-state">
              <p>Enter property and financing assumptions to generate metrics, scenarios and an AI-supported investment score.</p>
            </div>
          )}

          {result && (
            <>
              <div className="ai-metrics-grid">
                <div className="ai-metric"><small>Gross yield</small><strong>{result.metrics.grossYield}%</strong></div>
                <div className="ai-metric"><small>Net yield</small><strong>{result.metrics.netYield}%</strong></div>
                <div className="ai-metric"><small>Monthly cash flow</small><strong>£{result.metrics.monthlyCashFlow?.toLocaleString()}</strong></div>
                <div className="ai-metric"><small>DSCR</small><strong>{result.metrics.dscr ?? '—'}</strong></div>
              </div>

              <InvestmentScorePanel score={result.score} />

              <div className="ai-panel">
                <h2>Scenario analysis</h2>
                <table className="ai-data-table">
                  <thead>
                    <tr><th>Metric</th><th>Conservative</th><th>Base</th><th>Optimistic</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Annual cash flow</td><td>£{result.scenarios.conservative.annualCashFlow?.toLocaleString()}</td><td>£{result.scenarios.base.annualCashFlow?.toLocaleString()}</td><td>£{result.scenarios.optimistic.annualCashFlow?.toLocaleString()}</td></tr>
                    <tr><td>Net yield</td><td>{result.scenarios.conservative.netYield}%</td><td>{result.scenarios.base.netYield}%</td><td>{result.scenarios.optimistic.netYield}%</td></tr>
                    <tr><td>Cash-on-cash</td><td>{result.scenarios.conservative.cashOnCashReturn}%</td><td>{result.scenarios.base.cashOnCashReturn}%</td><td>{result.scenarios.optimistic.cashOnCashReturn}%</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="ai-panel">
                <h2>Sensitivity analysis</h2>
                <table className="ai-data-table">
                  <thead><tr><th>Change</th><th>Cash flow</th><th>Delta</th><th>Net yield</th></tr></thead>
                  <tbody>
                    {result.sensitivity.map((s) => (
                      <tr key={s.label}><td>{s.label}</td><td>£{s.annualCashFlow?.toLocaleString()}</td><td>£{s.deltaCashFlow?.toLocaleString()}</td><td>{s.netYield}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="ai-disclaimer">{result.metrics.disclaimer}</p>
            </>
          )}
        </div>
      </div>
    </AiWorkspaceLayout>
  );
};

export default InvestmentAnalyst;
