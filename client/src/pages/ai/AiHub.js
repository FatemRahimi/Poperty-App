import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaBrain,
  FaChartLine,
  FaPoundSign,
  FaPenFancy,
  FaHome,
  FaComments,
  FaArrowRight,
  FaCoins,
  FaHistory,
  FaTachometerAlt,
  FaBriefcase,
  FaGlobeEurope,
} from 'react-icons/fa';
import AiWorkspaceLayout from '../../components/ai/AiWorkspaceLayout';
import { fetchDashboard, fetchIntelligenceOverview } from '../../services/aiService';
import { displayAiCredits, subscribeAiCredits } from '../../services/aiCreditState';
import { useAuth } from '../../context/AuthContext';
import { AI_PRODUCT_NAME } from '../../config/aiNavigation';
import '../../components/ai/AiWorkspaceLayout.css';
import './AiHub.css';

const FLAGSHIP_TOOLS = [
  {
    icon: FaBrain,
    title: 'Property Intelligence',
    desc: 'Full evidence-based analysis — valuation, rent, investment, risks and recommendations.',
    to: '/ai-services/property-intelligence',
    tag: 'Flagship',
    primary: true,
  },
  {
    icon: FaChartLine,
    title: 'Investment Analyst',
    desc: 'Scenarios, sensitivity tables and transparent yield metrics.',
    to: '/ai-services/investment-analyst',
    tag: 'Quant',
  },
  {
    icon: FaBriefcase,
    title: 'Portfolio Optimiser',
    desc: 'Aggregate yield, diversification, risks and recommended actions across all your listings.',
    to: '/ai-services/portfolio-optimiser',
    tag: 'Portfolio',
  },
  {
    icon: FaPoundSign,
    title: 'Rent Intelligence',
    desc: 'Comparable rental estimates from your approved listings.',
    to: '/ai-services/rent-intelligence',
    tag: 'Rent',
  },
];

const QUICK_TOOLS = [
  { icon: FaPenFancy, title: 'Listing Writer', to: '/ai-services/listing-writer' },
  { icon: FaHome, title: 'Valuation', to: '/ai-services/valuation' },
  { icon: FaComments, title: 'Buyer Match', to: '/ai-services/buyer-match' },
  { icon: FaTachometerAlt, title: 'Activity', to: '/ai-services/dashboard' },
  { icon: FaHistory, title: 'History', to: '/ai-services/history' },
];

const typeLabel = {
  listing_writer: 'Listing',
  valuation: 'Valuation',
  buyer_match: 'Buyer match',
  property_intelligence: 'Intelligence',
  investment_analyst: 'Investment',
  rent_intelligence: 'Rent',
};

const AiHub = () => {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState(null);
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(null);
  const [planName, setPlanName] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return undefined;
    }
    const unsub = subscribeAiCredits((snap) => {
      setCredits(displayAiCredits(snap));
      setPlanName(snap?.plan?.name || snap?.subscription?.plan || null);
    });
    Promise.all([
      fetchDashboard().catch(() => null),
      fetchIntelligenceOverview().catch(() => null),
    ]).then(([dash, intelRes]) => {
      setData(dash);
      setIntel(intelRes);
      setLoading(false);
    });
    return unsub;
  }, [isAuthenticated]);

  return (
    <AiWorkspaceLayout
      title={AI_PRODUCT_NAME}
      subtitle="Evidence-first analysis for UK property — select a tool or continue a recent report."
    >
      <div className="ai-hub">
        {isAuthenticated && !loading && (
          <div className="ai-hub-stats">
            <div className="ai-hub-stat">
              <FaCoins />
              <div>
                <small>Credits</small>
                <strong>{credits == null ? '—' : credits}</strong>
              </div>
            </div>
            <div className="ai-hub-stat">
              <FaBrain />
              <div>
                <small>Analyses run</small>
                <strong>{intel?.overview?.totalAnalyses ?? intel?.totalAnalyses ?? '—'}</strong>
              </div>
            </div>
            <div className="ai-hub-stat">
              <FaHistory />
              <div>
                <small>Plan</small>
                <strong style={{ textTransform: 'capitalize' }}>{planName || data?.plan?.name || data?.subscription?.plan || 'Free'}</strong>
              </div>
            </div>
          </div>
        )}

        {!isAuthenticated && (
          <div className="ai-hub-guest">
            <p>Sign in to run analyses on your listings and track credits.</p>
            <Link to="/login" state={{ from: '/ai-services' }} className="ai-btn ai-btn-primary">
              Sign in to continue
            </Link>
          </div>
        )}

        <section className="ai-hub-section">
          <h2>Intelligence suite</h2>
          <div className="ai-hub-flagship-grid">
            {FLAGSHIP_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.to} to={tool.to} className={`ai-hub-card ${tool.primary ? 'primary' : ''}`}>
                  <span className="ai-hub-card-tag">{tool.tag}</span>
                  <Icon className="ai-hub-card-icon" />
                  <h3>{tool.title}</h3>
                  <p>{tool.desc}</p>
                  <span className="ai-hub-card-cta">Open <FaArrowRight /></span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="ai-hub-section">
          <h2>Quick tools</h2>
          <div className="ai-hub-quick-grid">
            {QUICK_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.to} to={tool.to} className="ai-hub-quick">
                  <Icon /> {tool.title}
                </Link>
              );
            })}
          </div>
        </section>

        {isAuthenticated && !loading && (data?.recentUkLookups?.length > 0) && (
          <section className="ai-hub-section">
            <h2>Recent UK property lookups</h2>
            <p className="ai-hub-section-note">Addresses you analysed outside our marketplace — reopen in Property Intelligence.</p>
            <div className="ai-hub-recent ai-hub-uk-lookups">
              {data.recentUkLookups.map((item) => (
                <Link
                  key={item.id}
                  to={`/ai-services/property-intelligence?subjectId=${item.id}`}
                  className="ai-hub-recent-row"
                >
                  <span className="ai-hub-recent-type"><FaGlobeEurope aria-hidden /></span>
                  <strong>{item.address}</strong>
                  <em>
                    {item.lastAccessedAt
                      ? new Date(item.lastAccessedAt).toLocaleDateString()
                      : 'Recent'}
                    {item.linkedPropertyId ? ' · Linked' : ''}
                  </em>
                </Link>
              ))}
            </div>
          </section>
        )}

        {isAuthenticated && data?.recent?.length > 0 && (
          <section className="ai-hub-section">
            <h2>Recent activity</h2>
            <div className="ai-hub-recent">
              {data.recent.slice(0, 6).map((item) => (
                <Link key={item.id} to={`/ai-services/history/${item.id}`} className="ai-hub-recent-row">
                  <span className="ai-hub-recent-type">{typeLabel[item.request_type] || item.request_type}</span>
                  <strong>{item.title}</strong>
                  <em>{new Date(item.created_at).toLocaleDateString()}</em>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="ai-hub-band">
          <div>
            <h3>Need more credits?</h3>
            <p>Professional unlocks unlimited generations and full intelligence tools.</p>
          </div>
          <Link to="/ai-services/pricing" className="ai-btn ai-btn-primary">View pricing</Link>
        </section>
      </div>
    </AiWorkspaceLayout>
  );
};

export default AiHub;
