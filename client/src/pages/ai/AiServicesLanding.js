import React from 'react';
import { Link } from 'react-router-dom';
import {
  FaRobot,
  FaPenFancy,
  FaChartLine,
  FaComments,
  FaTachometerAlt,
  FaArrowRight,
  FaBuilding,
  FaHome,
  FaUserTie,
} from 'react-icons/fa';
import AiToolNav from '../../components/ai/AiToolNav';
import PricingCards from '../../components/ai/PricingCards';
import { AI_PLANS } from '../../services/aiService';
import '../../styles/ai-services.css';
import './AiServicesLanding.css';

const tools = [
  {
    icon: <FaPenFancy />,
    title: 'Listing Writer',
    desc: 'Turn property details into SEO titles, polished descriptions, social ads and email copy in seconds.',
    to: '/ai-services/listing-writer',
    audience: 'Estate agents',
  },
  {
    icon: <FaChartLine />,
    title: 'Valuation Report',
    desc: 'Generate estimated value ranges, market analysis and improvement suggestions with a print-ready report.',
    to: '/ai-services/valuation',
    audience: 'Sellers & agents',
  },
  {
    icon: <FaComments />,
    title: 'Buyer Match Assistant',
    desc: 'Conversational search that matches budget, lifestyle, schools and transport to live listings.',
    to: '/ai-services/buyer-match',
    audience: 'Buyers',
  },
];

const audiences = [
  {
    icon: <FaHome />,
    title: 'Buyers',
    text: 'Describe how you want to live — we surface properties that fit lifestyle, commute and budget.',
  },
  {
    icon: <FaBuilding />,
    title: 'Sellers',
    text: 'Understand market value, improvement ROI and how to present your home for stronger offers.',
  },
  {
    icon: <FaUserTie />,
    title: 'Estate agents',
    text: 'Produce listing copy and marketing packs faster, with usage credits and a team-ready dashboard.',
  },
];

const AiServicesLanding = () => {
  return (
    <div className="ai-page ai-landing">
      <section className="ai-hero">
        <div className="ai-hero-bg" aria-hidden="true" />
        <div className="ai-container ai-hero-inner">
          <AiToolNav />
          <p className="ai-eyebrow"><FaRobot /> AI Property Services</p>
          <h1 className="ai-display ai-hero-title">
            The AI assistant built for modern property professionals
          </h1>
          <p className="ai-hero-sub">
            Generate listing copy, valuation reports and buyer matches from one premium workspace —
            a new revenue stream designed for agents, sellers and serious buyers.
          </p>
          <div className="ai-hero-cta">
            <Link to="/ai-services/listing-writer" className="ai-btn ai-btn-primary">
              Start generating <FaArrowRight />
            </Link>
            <Link to="/ai-services/pricing" className="ai-btn ai-btn-ghost ai-btn-ghost-light">
              View pricing
            </Link>
            <Link to="/ai-services/dashboard" className="ai-btn ai-btn-ghost ai-btn-ghost-light">
              <FaTachometerAlt /> Agent dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="ai-section">
        <div className="ai-container">
          <h2 className="ai-section-title">Built for every side of the market</h2>
          <p className="ai-section-sub">
            One platform that helps buyers decide faster, sellers price smarter, and agents market at scale.
          </p>
          <div className="ai-grid-3">
            {audiences.map((item) => (
              <div key={item.title} className="ai-card ai-audience-card">
                <div className="ai-icon-wrap">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ai-section ai-section-alt">
        <div className="ai-container">
          <h2 className="ai-section-title">Premium AI tools</h2>
          <p className="ai-section-sub">
            Production-ready workflows with history, credits and subscription controls.
          </p>
          <div className="ai-grid-3">
            {tools.map((tool) => (
              <Link key={tool.title} to={tool.to} className="ai-card ai-tool-card">
                <div className="ai-icon-wrap">{tool.icon}</div>
                <span className="ai-pill">{tool.audience}</span>
                <h3>{tool.title}</h3>
                <p>{tool.desc}</p>
                <span className="ai-tool-link">Open tool <FaArrowRight /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="ai-section" id="pricing">
        <div className="ai-container">
          <h2 className="ai-section-title">Simple pricing that scales with your agency</h2>
          <p className="ai-section-sub">
            Start free. Upgrade when unlimited descriptions and advanced reports become essential.
          </p>
          <PricingCards plans={AI_PLANS} />
        </div>
      </section>

      <section className="ai-cta-band">
        <div className="ai-container ai-cta-band-inner">
          <div>
            <h2 className="ai-display">Ready to turn AI into recurring revenue?</h2>
            <p>Launch listing generation today — upgrade anytime from the agent dashboard.</p>
          </div>
          <Link to="/signup" className="ai-btn ai-btn-gold">
            Create free account
          </Link>
        </div>
      </section>
    </div>
  );
};

export default AiServicesLanding;
