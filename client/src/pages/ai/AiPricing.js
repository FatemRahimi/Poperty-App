import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaCrown } from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import PricingCards from '../../components/ai/PricingCards';
import { AI_PLANS, fetchSubscription, upgradePlan } from '../../services/aiService';
import { useAuth } from '../../context/AuthContext';
import '../../components/ai/AiWorkspaceLayout.css';

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
    <AiWorkspaceLayout title="Credits & Pricing" subtitle="Free tier for basic analysis. Professional and Agency unlock full intelligence tools.">
        {message && <div className="ai-alert ai-alert-info">{message}</div>}
        {error && <div className="ai-alert ai-alert-error">{error}</div>}

        <PricingCards
          plans={AI_PLANS}
          currentPlanId={currentPlanId}
          onSelect={handleSelect}
          selectingPlan={selectingPlan}
        />

        <div className="ai-panel" style={{ marginTop: '2rem' }}>
          <h2 style={{ marginTop: 0 }}>Plan capabilities</h2>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#94a3b8', lineHeight: 1.7 }}>
            <li><strong>Free</strong> — 3 AI analyses/month, basic property intelligence, rent intelligence (limited)</li>
            <li><strong>Professional (£49/mo)</strong> — Investment Analyst, Rent Intelligence, Risk Radar, unlimited generations</li>
            <li><strong>Agency (£149/mo)</strong> — Team workspace, agency intelligence, branded reports (Phase 4)</li>
          </ul>
        </div>
    </AiWorkspaceLayout>
  );
};

export default AiPricing;
