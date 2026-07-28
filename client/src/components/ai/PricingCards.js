import React from 'react';
import { Link } from 'react-router-dom';
import { FaCheck } from 'react-icons/fa';

const PricingCards = ({
  plans,
  currentPlanId = null,
  onSelect,
  selectingPlan = null,
  showCta = true,
}) => {
  return (
    <div className="ai-grid-3 ai-pricing-grid">
      {plans.map((plan) => {
        const isCurrent = currentPlanId === plan.id;
        const isBusy = selectingPlan === plan.id;
        return (
          <div
            key={plan.id}
            className={`ai-pricing-card ${plan.highlighted ? 'highlighted' : ''} ${isCurrent ? 'current' : ''}`}
          >
            {plan.highlighted && <div className="ai-pricing-badge">Most popular</div>}
            <h3>{plan.name}</h3>
            <div className="ai-price">
              {plan.price === 0 ? (
                <span className="ai-price-amount">Free</span>
              ) : (
                <>
                  <span className="ai-price-currency">£</span>
                  <span className="ai-price-amount">{plan.price}</span>
                  <span className="ai-price-period">/{plan.period || 'month'}</span>
                </>
              )}
            </div>
            <p className="ai-pricing-blurb">{plan.blurb}</p>
            <ul>
              {(plan.features || []).map((feature) => (
                <li key={feature}>
                  <FaCheck className="ai-check" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {showCta && (
              isCurrent ? (
                <button className="ai-btn ai-btn-ghost" disabled>
                  Current plan
                </button>
              ) : onSelect ? (
                <button
                  className={`ai-btn ${plan.highlighted ? 'ai-btn-primary' : 'ai-btn-secondary'}`}
                  onClick={() => onSelect(plan.id)}
                  disabled={!!selectingPlan}
                >
                  {isBusy ? 'Updating…' : plan.cta || `Choose ${plan.name}`}
                </button>
              ) : (
                <Link
                  to="/ai-services/pricing"
                  className={`ai-btn ${plan.highlighted ? 'ai-btn-primary' : 'ai-btn-secondary'}`}
                >
                  {plan.cta || `Choose ${plan.name}`}
                </Link>
              )
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PricingCards;
