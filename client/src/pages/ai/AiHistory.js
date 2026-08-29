import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaHistory } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { fetchHistory } from '../../services/aiService';
import { useAuth } from '../../context/AuthContext';
import '../../components/ai/AiWorkspaceLayout.css';

const typeLabels = {
  listing_writer: 'Listing Writer',
  valuation: 'Valuation',
  buyer_match: 'Buyer Match',
  investment_analyst: 'Investment Analyst',
  rent_intelligence: 'Rent Intelligence',
  property_intelligence: 'Property Analysis',
  portfolio_optimiser: 'Portfolio Optimiser',
};

const AiHistory = () => {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    fetchHistory({ limit: 50 })
      .then((d) => setItems(d.items || []))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <AiWorkspaceLayout title="Analysis history" subtitle="Every analysis saved with input snapshot, results and timestamp.">
      {!isAuthenticated && (
        <div className="ai-empty-state">
          <FaHistory className="ai-empty-state-icon" />
          <p>Sign in to view your saved analyses.</p>
          <Link to="/login" state={{ from: '/ai-services/history' }} className="ai-btn ai-btn-primary">Sign in</Link>
        </div>
      )}
      {loading && <div className="ai-loading"><span className="ai-spinner" /> Loading…</div>}
      {isAuthenticated && !loading && items.length === 0 && (
        <div className="ai-empty-state">
          <FaHistory className="ai-empty-state-icon" />
          <p>No analyses yet. Run Property Analysis or another tool to build your history.</p>
          <Link to="/ai-services/property-intelligence" className="ai-btn ai-btn-primary">Start analysis</Link>
        </div>
      )}
      {isAuthenticated && items.length > 0 && (
        <div className="ai-panel">
          <table className="ai-data-table">
            <thead><tr><th>Analysis</th><th>Type</th><th>Confidence</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title || typeLabels[item.request_type]}</td>
                  <td>{typeLabels[item.request_type] || item.request_type}</td>
                  <td>
                    {item.confidenceLevel
                      ? `${item.confidenceLevel}${item.confidenceLevelIsLegacyEstimate ? ' · earlier model' : ''}`
                      : '—'}
                  </td>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td><Link to={`/ai-services/history/${item.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AiWorkspaceLayout>
  );
};

export default AiHistory;
