import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaCrown } from 'react-icons/fa';
import AiToolNav from '../../components/ai/AiToolNav';
import PricingCards from '../../components/ai/PricingCards';
import { AI_PLANS, fetchSubscription, upgradePlan } from '../../services/aiService';
import { useAuth } from '../../context/AuthContext';
import '../../styles/ai-services.css';
import './AiServicesLanding.css';

const AiPricing = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const [selectingPlan, setSelectingPlan] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchSubscription()
      .then((data) => setCurrentPlanId(data.subscription?.plan || 'free'))
      .catch(() => setCurrentPlanId(null));
  }, [isAuthenticated]);

  const handleSelect = async (planId) => {
    setError('');
    setMessage('');
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/ai-services/pricing' } });
      return;
    }
    try {
      setSelectingPlan(planId);
      const data = await upgradePlan(planId);
      setCurrentPlanId(data.subscription?.plan || planId);
      setMessage(data.message || 'Plan updated');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update plan');
    } finally {
      setSelectingPlan(null);
    }
  };

  return (
    <div className="ai-page">
      <div className="ai-container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <AiToolNav />
        <p className="ai-eyebrow"><FaCrown /> Subscriptions</p>
        <h1 className="ai-section-title">Choose the plan that fits your pipeline</h1>
        <p className="ai-section-sub">
          Free for trying the toolkit. Professional for unlimited marketing output.
          Agency for multi-user teams and advanced reports.
        </p>

        {message && <div className="ai-alert ai-alert-info">{message}</div>}
        {error && <div className="ai-alert ai-alert-error">{error}</div>}

        <PricingCards
          plans={AI_PLANS}
          currentPlanId={currentPlanId}
          onSelect={handleSelect}
          selectingPlan={selectingPlan}
        />

        <div className="ai-card" style={{ marginTop: '2rem' }}>
          <h3 style={{ marginTop: 0 }}>What you unlock</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--ai-slate)', lineHeight: 1.7 }}>
            <li><strong>Free</strong> — 3 AI generations to evaluate Listing Writer, Valuation and Buyer Match.</li>
            <li><strong>Professional (£49/mo)</strong> — Unlimited descriptions plus full AI marketing tools.</li>
            <li><strong>Agency (£149/mo)</strong> — Multiple users and advanced report workflows for growing teams.</li>
          </ul>
          <div style={{ marginTop: '1.25rem' }}>
            <Link to="/ai-services/dashboard" className="ai-btn ai-btn-primary">Go to AI dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiPricing;
