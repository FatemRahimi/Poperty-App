import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaTachometerAlt,
  FaPenFancy,
  FaFileAlt,
  FaArrowUp,
  FaCoins,
  FaHistory,
} from 'react-icons/fa';
import AiToolNav from '../../components/ai/AiToolNav';
import { fetchDashboard } from '../../services/aiService';
import '../../styles/ai-services.css';
import './AiDashboard.css';

const typeLabel = {
  listing_writer: 'Listing Writer',
  valuation: 'Valuation Report',
  buyer_match: 'Buyer Match',
};

const AiDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchDashboard()
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.message || 'Failed to load dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const plan = data?.plan;
  const sub = data?.subscription;
  const unlimited = plan?.unlimited || sub?.credits_remaining < 0;

  return (
    <div className="ai-page">
      <div className="ai-container ai-dash" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <AiToolNav />
        <p className="ai-eyebrow"><FaTachometerAlt /> Estate Agent AI Dashboard</p>
        <h1 className="ai-section-title">Your AI workspace</h1>
        <p className="ai-section-sub">
          Track generations, credits and your subscription — upgrade when you need unlimited output.
        </p>

        {loading && (
          <div className="ai-loading"><span className="ai-spinner" /> Loading dashboard…</div>
        )}
        {error && <div className="ai-alert ai-alert-error">{error}</div>}

        {data && (
          <>
            <div className="ai-dash-stats">
              <div className="ai-card ai-stat-card">
                <div className="ai-stat-label"><FaCoins /> Usage credits</div>
                <div className="ai-stat-value">
                  {unlimited ? 'Unlimited' : sub?.credits_remaining ?? 0}
                </div>
                <div className="ai-stat-meta">
                  {unlimited ? 'Professional / Agency plan' : `${sub?.credits_monthly || 3} included on Free`}
                </div>
              </div>
              <div className="ai-card ai-stat-card">
                <div className="ai-stat-label"><FaArrowUp /> Subscription</div>
                <div className="ai-stat-value">{plan?.name || 'Free'}</div>
                <div className="ai-stat-meta">
                  {plan?.price ? `£${plan.price}/month` : '£0 — limited generations'}
                </div>
                <Link to="/ai-services/pricing" className="ai-btn ai-btn-primary" style={{ marginTop: '0.85rem' }}>
                  Upgrade plan
                </Link>
              </div>
              <div className="ai-card ai-stat-card">
                <div className="ai-stat-label"><FaHistory /> Total generations</div>
                <div className="ai-stat-value">{data.totals?.total_requests || 0}</div>
                <div className="ai-stat-meta">
                  {(data.usageByType || []).map((u) => `${typeLabel[u.request_type] || u.request_type}: ${u.count}`).join(' · ') || 'No usage yet'}
                </div>
              </div>
            </div>

            <div className="ai-dash-actions">
              <Link to="/ai-services/listing-writer" className="ai-btn ai-btn-secondary"><FaPenFancy /> New listing</Link>
              <Link to="/ai-services/valuation" className="ai-btn ai-btn-ghost"><FaFileAlt /> New valuation</Link>
              <Link to="/ai-services/buyer-match" className="ai-btn ai-btn-ghost">Buyer match</Link>
            </div>

            <div className="ai-grid-2" style={{ marginTop: '1.5rem' }}>
              <section className="ai-card">
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

              <section className="ai-card">
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

            <section className="ai-card" style={{ marginTop: '1.25rem' }}>
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
      </div>
    </div>
  );
};

export default AiDashboard;
