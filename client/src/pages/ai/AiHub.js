import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { fetchDashboard } from '../../services/aiService';
import { subscribeAiCredits } from '../../services/aiCreditState';
import { useAuth } from '../../context/AuthContext';
import './AiHub.css';

const GOAL_LABEL = {
  BUY: 'Buy a home',
  LET_INVEST: 'Buy an investment property',
  SELL: 'Sell a property',
};

function asObject(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function knownPropertyGoal(item) {
  const input = asObject(item?.input_data || item?.inputData);
  const output = asObject(item?.output_data || item?.outputData);
  const candidates = [
    input?.decisionJob,
    output?.residentialDecisionContext?.decisionJob,
    output?.decisionJob,
    output?.decisionWorkspace?.decisionJob,
  ];
  const job = candidates.find((value) => GOAL_LABEL[value]);
  return job ? GOAL_LABEL[job] : null;
}

const AiHub = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addressQuery, setAddressQuery] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return undefined;
    }
    const unsub = subscribeAiCredits(() => {});
    fetchDashboard()
      .catch(() => null)
      .then((dash) => {
        setData(dash);
        setLoading(false);
      });
    return unsub;
  }, [isAuthenticated]);

  const openPropertySearch = (event) => {
    event.preventDefault();
    const query = addressQuery.trim();
    const params = new URLSearchParams();
    if (query) params.set('uk', query);
    const search = params.toString();
    navigate(`/ai-services/property-intelligence${search ? `?${search}` : ''}`);
  };

  const lookups = data?.recentUkLookups || [];
  const propertyCases = (data?.recent || []).filter((item) => item?.request_type === 'property_intelligence');
  const hasRecent = lookups.length > 0 || propertyCases.length > 0;

  return (
    <AiWorkspaceLayout
      title="Find a property"
      subtitle="What property would you like to investigate?"
    >
      <div className="ai-hub">
        <form className="ai-hub-search" onSubmit={openPropertySearch}>
          <input
            type="text"
            value={addressQuery}
            onChange={(event) => setAddressQuery(event.target.value)}
            placeholder="Enter address or postcode"
            aria-label="Enter address or postcode"
          />
          <button type="submit" className="ai-btn ai-btn-primary">Search</button>
        </form>

        {!isAuthenticated && (
          <p className="ai-hub-guest">
            <Link to="/login" state={{ from: '/ai-services' }}>Sign in</Link>
            {' '}to continue a saved property.
          </p>
        )}

        {isAuthenticated && !loading && hasRecent && (
          <section className="ai-hub-section" aria-labelledby="ai-recent-heading">
            <h2 id="ai-recent-heading">Recent properties</h2>
            <div className="ai-hub-recent" data-testid="recent-properties">
              {lookups.map((item) => (
                <Link
                  key={`lookup-${item.id}`}
                  to={`/ai-services/property-intelligence?subjectId=${item.id}`}
                  className="ai-hub-recent-row"
                >
                  <strong>{item.address}</strong>
                  <span>Continue</span>
                </Link>
              ))}
              {propertyCases.map((item) => {
                const goal = knownPropertyGoal(item);
                return (
                  <Link
                    key={`case-${item.id}`}
                    to={`/ai-services/history/${item.id}`}
                    className="ai-hub-recent-row"
                  >
                    <strong>{item.title || 'Saved property case'}</strong>
                    {goal ? <em>{goal}</em> : null}
                    <span>Continue</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AiWorkspaceLayout>
  );
};

export default AiHub;
