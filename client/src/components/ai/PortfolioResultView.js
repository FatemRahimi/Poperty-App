import React from 'react';
import { Link } from 'react-router-dom';
import { FaChartPie, FaExclamationTriangle, FaLightbulb } from 'react-icons/fa';
import { AssessedText } from './AssessedMetric';
import {
  formatCurrency,
  resolveAssessedDisplay,
} from '../../Utils/assessedMetricDisplay';

function listingMoney(n) {
  return formatCurrency(n);
}

function portfolioMetricDisplay(value, state, format) {
  if (state === 'notAssessed') {
    return resolveAssessedDisplay({
      assessment: { state: 'notAssessed' },
      value,
      format,
    });
  }
  return resolveAssessedDisplay({
    presented: state === 'calculated' || state === 'assessed'
      ? { available: true, value }
      : undefined,
    value,
    format,
  });
}

export default function PortfolioResultView({ report, onReset }) {
  if (!report) return null;
  const s = report.summary;

  if (report.empty) {
    return (
      <div className="ai-empty-state" data-testid="portfolio-result-view">
        <p>{report.message}</p>
        <Link to="/dashboard" className="ai-btn ai-btn-primary">Go to dashboard</Link>
      </div>
    );
  }

  if (!s) return null;

  return (
    <div data-testid="portfolio-result-view">
      {onReset && (
        <button type="button" className="ai-btn ai-btn-ghost" style={{ marginBottom: '1rem' }} onClick={onReset}>
          ← Run again
        </button>
      )}

      <div className="po-summary-grid">
        <div className="po-stat"><small>Properties</small><strong>{s.propertyCount}</strong></div>
        <div className="po-stat"><small>Total value</small><strong>{listingMoney(s.totalValue)}</strong></div>
        <div className="po-stat"><small>Monthly rent</small><strong>{listingMoney(s.totalMonthlyRent)}</strong></div>
        <div className="po-stat" data-testid="portfolio-avg-yield">
          <small>Avg gross yield</small>
          <strong>
            <AssessedText display={resolveAssessedDisplay({ value: s.avgGrossYield, format: 'percent' })} />
          </strong>
        </div>
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
                    <td>{listingMoney(p.price)}</td>
                    <td>{listingMoney(p.monthlyRent)}</td>
                    <td data-testid={`portfolio-yield-${p.id}`}>
                      <AssessedText
                        display={portfolioMetricDisplay(p.grossYield, p.grossYieldState, 'percent')}
                      />
                    </td>
                    <td data-testid={`portfolio-cashflow-${p.id}`}>
                      <AssessedText
                        display={portfolioMetricDisplay(p.annualCashFlow, p.cashFlowState, 'currency')}
                      />
                    </td>
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
    </div>
  );
}
