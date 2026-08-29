import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaPenFancy,
  FaArrowUp,
  FaCoins,
  FaHistory,
  FaGlobeEurope,
} from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { fetchDashboard, fetchIntelligenceOverview } from '../../services/aiService';
import { displayAiCredits, subscribeAiCredits } from '../../services/aiCreditState';
import '../../components/ai/AiWorkspaceLayout.css';

const typeLabel = {
  listing_writer: 'Listing Writer',
  valuation: 'Valuation Report',
  buyer_match: 'Buyer Match',
  investment_analyst: 'Investment Analyst',
  rent_intelligence: 'Rent Intelligence',
};

const AiDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [intel, setIntel] = useState(null);
  const [credits, setCredits] = useState(null);
  const [planName, setPlanName] = useState(null);

  useEffect(() => {
    let mounted = true;
    const unsub = subscribeAiCredits((snap) => {
      if (!mounted) return;
      setCredits(displayAiCredits(snap));
      setPlanName(snap?.plan?.name || null);
    });
    Promise.all([fetchDashboard(), fetchIntelligenceOverview().catch(() => null)])
      .then(([res, intelRes]) => {
        if (mounted) {
          setData(res);
          setIntel(intelRes);
        }
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.message || 'Failed to load dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return (
    <AiWorkspaceLayout
      title="Activity overview"
      subtitle="Credits, usage history and portfolio signals at a glance."
    >
        {loading && (
          <div className="ai-loading"><span className="ai-spinner" /> Loading dashboard…</div>
        )}
        {error && <div className="ai-alert ai-alert-error">{error}</div>}

        {data && (
          <>
            <div className="ai-metrics-grid">
              <div className="ai-metric">
                <div className="ai-stat-label"><FaCoins /> Credits</div>
                <strong>{credits == null ? '—' : credits}</strong>
              </div>
              <div className="ai-metric">
                <div className="ai-stat-label"><FaArrowUp /> Plan</div>
                <strong>{planName || data?.plan?.name || 'Free'}</strong>
              </div>
              <div className="ai-metric">
                <div className="ai-stat-label"><FaHistory /> Generations</div>
                <strong>{data.totals?.total_requests || 0}</strong>
              </div>
              <div className="ai-metric">
                <div className="ai-stat-label">Opportunities</div>
                <strong>{intel?.opportunities?.length ?? '—'}</strong>
              </div>
            </div>

            <div className="ai-dash-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '1.25rem' }}>
              <Link to="/ai-services/property-intelligence" className="ai-btn ai-btn-primary">Property Analysis</Link>
              <Link to="/ai-services/investment-analyst" className="ai-btn ai-btn-ghost">Investment Analyst</Link>
              <Link to="/ai-services/rent-intelligence" className="ai-btn ai-btn-ghost">Rent Intelligence</Link>
              <Link to="/ai-services/listing-writer" className="ai-btn ai-btn-ghost"><FaPenFancy /> Listing Writer</Link>
              <Link to="/ai-services/pricing" className="ai-btn ai-btn-ghost">Upgrade</Link>
            </div>

            <div className="ai-grid-2" style={{ marginTop: '1.5rem' }}>
              <section className="ai-panel">
                <h2>Generated listings</h2>
                {(data.listings || []).length === 0 && <p className="ai-muted">No listings generated yet.</p>}
                <ul className="ai-history-list">
                  {(data.listings || []).map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title || 'Listing'}</strong>
                        <span>{new Date(item.created_at).toLocaleString()}</span>
                      </div>
                      <Link to={`/ai-services/history/${item.id}`}>View</Link>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="ai-panel">
                <h2>AI reports</h2>
                {(data.reports || []).length === 0 && <p className="ai-muted">No valuation reports yet.</p>}
                <ul className="ai-history-list">
                  {(data.reports || []).map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title || 'Report'}</strong>
                        <span>{new Date(item.created_at).toLocaleString()}</span>
                      </div>
                      <Link to={`/ai-services/history/${item.id}`}>View</Link>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="ai-panel" style={{ marginTop: '1.25rem' }}>
              <h2><FaGlobeEurope style={{ marginRight: '0.4rem' }} />Recent UK property lookups</h2>
              {(data.recentUkLookups || []).length === 0 && (
                <p className="ai-muted">Search any UK address in Property Intelligence to build this list.</p>
              )}
              <ul className="ai-history-list">
                {(data.recentUkLookups || []).map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.address}</strong>
                      <span>
                        UPRN {item.uprn}
                        {item.linkedPropertyId ? ` · Listing #${item.linkedPropertyId}` : ''}
                        {' · '}
                        {item.lastAccessedAt
                          ? new Date(item.lastAccessedAt).toLocaleString()
                          : 'Recent'}
                      </span>
                    </div>
                    <Link to={`/ai-services/property-intelligence?subjectId=${item.id}`}>Analyse</Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="ai-panel" style={{ marginTop: '1.25rem' }}>
              <h2>Recent activity</h2>
              {(data.recent || []).length === 0 && <p className="ai-muted">Generate your first asset to populate history.</p>}
              <ul className="ai-history-list">
                {(data.recent || []).map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title || typeLabel[item.request_type]}</strong>
                      <span>{typeLabel[item.request_type] || item.request_type} · {new Date(item.created_at).toLocaleString()}</span>
                    </div>
                    <Link to={`/ai-services/history/${item.id}`}>Open</Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
    </AiWorkspaceLayout>
  );
};

export default AiDashboard;
