import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import InvestmentResultView from '../../components/ai/InvestmentResultView';
import { analyseInvestment } from '../../services/aiService';
import { useAuth } from '../../context/AuthContext';
import '../../components/ai/AiWorkspaceLayout.css';

const defaultForm = {
  purchasePrice: '',
  deposit: '',
  expectedRent: '',
  vacancyAssumption: '',
  maintenance: '',
  insurance: '',
  managementFee: '',
  serviceCharge: '',
  groundRent: '',
  taxes: '',
  interestRate: '',
  mortgageTermYears: '',
  expectedAppreciation: '',
  holdingPeriod: '',
};

function toOptionalNumber(value) {
  if (value === '' || value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
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
        Object.entries(form).map(([k, v]) => [k, toOptionalNumber(v)])
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
            <div className="ai-field"><label htmlFor="ia-purchasePrice">Purchase price (£)</label><input id="ia-purchasePrice" name="purchasePrice" type="number" value={form.purchasePrice} onChange={onChange} required /></div>
            <div className="ai-field"><label htmlFor="ia-deposit">Deposit (£)</label><input id="ia-deposit" name="deposit" type="number" value={form.deposit} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-expectedRent">Expected rent (£/month)</label><input id="ia-expectedRent" name="expectedRent" type="number" value={form.expectedRent} onChange={onChange} required /></div>
            <div className="ai-field"><label htmlFor="ia-vacancyAssumption">Vacancy assumption (%)</label><input id="ia-vacancyAssumption" name="vacancyAssumption" type="number" value={form.vacancyAssumption} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-interestRate">Interest rate (%)</label><input id="ia-interestRate" name="interestRate" type="number" step="0.1" value={form.interestRate} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-mortgageTermYears">Mortgage term (years)</label><input id="ia-mortgageTermYears" name="mortgageTermYears" type="number" value={form.mortgageTermYears} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-maintenance">Maintenance (£/yr)</label><input id="ia-maintenance" name="maintenance" type="number" value={form.maintenance} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-insurance">Insurance (£/yr)</label><input id="ia-insurance" name="insurance" type="number" value={form.insurance} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-managementFee">Management fee (£/yr)</label><input id="ia-managementFee" name="managementFee" type="number" value={form.managementFee} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-serviceCharge">Service charge (£/yr)</label><input id="ia-serviceCharge" name="serviceCharge" type="number" value={form.serviceCharge} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-expectedAppreciation">Expected appreciation (%/yr)</label><input id="ia-expectedAppreciation" name="expectedAppreciation" type="number" step="0.1" value={form.expectedAppreciation} onChange={onChange} placeholder="Optional" /></div>
            <div className="ai-field"><label htmlFor="ia-holdingPeriod">Holding period (years)</label><input id="ia-holdingPeriod" name="holdingPeriod" type="number" value={form.holdingPeriod} onChange={onChange} placeholder="Optional" /></div>
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
            <InvestmentResultView result={result} userEnteredRent />
          )}
        </div>
      </div>
    </AiWorkspaceLayout>
  );
};

export default InvestmentAnalyst;
