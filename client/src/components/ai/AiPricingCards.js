import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AI_PLANS, upgradePlan } from '../../services/aiService';
import { useAuth } from '../../context/AuthContext';
import './AiPricingCards.css';

const AiPricingCards = ({
  plans = AI_PLANS,
  currentPlan = null,
  onUpgraded = null,
  showCta = true,
}) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(null);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');

  const handleSelect = async (planId) => {
    setError('');
    setMessage('');

    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/ai-services/pricing' } });
      return;
    }

    if (planId === 'free' || planId === currentPlan) {
      navigate('/ai-services/dashboard');
      return;
    }

    try {
      setBusy(planId);
      const data = await upgradePlan(planId);
      setMessage(data.message || 'Plan updated');
      if (onUpgraded) onUpgraded(data);
      else navigate('/ai-services/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update plan');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ai-pricing-wrap">
      {error && <div className="ai-alert ai-alert-error">{error}</div>}
      {message && <div className="ai-alert ai-alert-info">{message}</div>}
      <div className="ai-pricing-grid">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isHighlighted = plan.highlighted;
          return (
            <article
              key={plan.id}
              className={`ai-price-card ${isHighlighted ? 'is-featured' : ''} ${isCurrent ? 'is-current' : ''}`}
            >
              {isHighlighted && <span className="ai-price-badge">Most popular</span>}
              {isCurrent && <span className="ai-price-current">Current plan</span>}
              <h3>{plan.name}</h3>
              <p className="ai-price-blurb">{plan.blurb}</p>
              <div className="ai-price-amount">
                {plan.price === 0 ? (
                  <span className="ai-price-zero">Free</span>
                ) : (
                  <>
                    <span className="ai-price-currency">£</span>
                    <span className="ai-price-number">{plan.price}</span>
                    <span className="ai-price-period">/{plan.period}</span>
                  </>
                )}
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {showCta && (
                <button
                  type="button"
                  className={`ai-btn ${isHighlighted ? 'ai-btn-primary' : 'ai-btn-secondary'} ai-price-cta`}
                  disabled={busy === plan.id || isCurrent}
                  onClick={() => handleSelect(plan.id)}
                >
                  {busy === plan.id ? 'Updating…' : isCurrent ? 'Active' : plan.cta}
                </button>
              )}
              {!showCta && (
                <Link to="/ai-services/pricing" className="ai-btn ai-btn-secondary ai-price-cta">
                  View pricing
                </Link>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default AiPricingCards;
