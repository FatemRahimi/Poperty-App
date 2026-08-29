import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBriefcase, FaChartPie, FaExclamationTriangle, FaLightbulb } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { analysePortfolio } from '../../services/aiService';
import '../../components/ai/AiWorkspaceLayout.css';
import './PortfolioOptimiser.css';

const fmt = (n) => (n != null && !Number.isNaN(Number(n)) ? `£${Number(n).toLocaleString()}` : '—');

const PortfolioOptimiser = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await analysePortfolio();
      setReport(data.output || data);
    } catch (e) {
      setError(e.response?.data?.message || 'Portfolio analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const s = report?.summary;

  return (
    <AiWorkspaceLayout
      title="Portfolio Optimiser"
      subtitle="Aggregate view of your listings — value, yield, diversification, risks and recommended actions."
    >
      {!report && (
        <div className="po-intro ai-panel">
          <FaBriefcase className="po-icon" />
          <p>Analyse your entire portfolio in one pass. Uses your listing data and deterministic financial metrics — no guesswork on yields or cash flow.</p>
          <button type="button" className="ai-btn ai-btn-primary" onClick={runAnalysis} disabled={loading}>
            {loading ? 'Analysing portfolio…' : 'Analyse my portfolio'}
          </button>
        </div>
      )}

      {error && <div className="ai-alert ai-alert-error">{error}</div>}

      {report?.empty && (
        <div className="ai-empty-state">
          <p>{report.message}</p>
          <Link to="/dashboard" className="ai-btn ai-btn-primary">Go to dashboard</Link>
        </div>
      )}

      {s && (
        <>
          <button type="button" className="ai-btn ai-btn-ghost" style={{ marginBottom: '1rem' }} onClick={() => setReport(null)}>
            ← Run again
          </button>

          <div className="po-summary-grid">
            <div className="po-stat"><small>Properties</small><strong>{s.propertyCount}</strong></div>
            <div className="po-stat"><small>Total value</small><strong>{fmt(s.totalValue)}</strong></div>
            <div className="po-stat"><small>Monthly rent</small><strong>{fmt(s.totalMonthlyRent)}</strong></div>
            <div className="po-stat"><small>Avg gross yield</small><strong>{s.avgGrossYield != null ? `${s.avgGrossYield}%` : '—'}</strong></div>
            <div className="po-stat"><small>Opportunities</small><strong>{s.opportunityCount}</strong></div>
            <div className="po-stat"><small>Risks</small><strong>{s.riskCount}</strong></div>
          </div>

          {report.diversification && (
            <section className="ai-panel">
              <h2><FaChartPie /> Diversification</h2>
              <p className="ai-insight-meta">{report.diversification.label} · {report.diversification.cityCount} cities · max concentration {report.diversification.concentrationPercent}%</p>
              <div className="po-tags">
                {Object.entries(report.diversification.byCity).map(([city, count]) => (
                  <span key={city} className="po-tag">{city}: {count}</span>
                ))}
              </div>
            </section>
          )}

          {report.properties?.length > 0 && (
            <section className="ai-panel">
              <h2>Properties by yield</h2>
              <div className="po-table-wrap">
                <table className="po-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>City</th>
                      <th>Value</th>
                      <th>Rent/mo</th>
                      <th>Gross yield</th>
                      <th>Cash flow/yr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.properties.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/ai-services/property-intelligence?propertyId=${p.id}`}>{p.title}</Link>
                        </td>
                        <td>{p.city || '—'}</td>
                        <td>{fmt(p.price)}</td>
                        <td>{fmt(p.monthlyRent)}</td>
                        <td>{p.grossYield != null ? `${p.grossYield}%` : '—'}</td>
                        <td>{p.annualCashFlow != null ? fmt(p.annualCashFlow) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {report.recommendations?.length > 0 && (
            <section className="ai-panel">
              <h2><FaLightbulb /> Recommended actions</h2>
              {report.recommendations.map((r) => (
                <article key={r.id} className="po-rec">
                  <header>
                    <strong>{r.title}</strong>
                    <span className={`po-priority po-priority-${r.priority.toLowerCase()}`}>{r.priority}</span>
                  </header>
                  <p>{r.detail}</p>
                  <p className="ai-insight-meta">{r.action}</p>
                </article>
              ))}
            </section>
          )}

          {report.risks?.length > 0 && (
            <section className="ai-panel">
              <h2><FaExclamationTriangle /> Portfolio risks</h2>
              {report.risks.map((r) => (
                <article key={`${r.id}-${r.propertyId}`} className="po-risk">
                  <strong>{r.title}</strong>
                  <p className="ai-insight-meta">{r.propertyTitle} · {r.category}</p>
                  <p>{r.evidence}</p>
                </article>
              ))}
            </section>
          )}

          <p className="ai-insight-meta">{report.disclaimer}</p>
        </>
      )}
    </AiWorkspaceLayout>
  );
};

export default PortfolioOptimiser;
