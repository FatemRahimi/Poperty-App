import React from 'react';
import { Link } from 'react-router-dom';
import {
  FaBolt,
  FaPenFancy,
  FaChartLine,
  FaComments,
  FaTachometerAlt,
  FaArrowRight,
  FaBuilding,
  FaHome,
  FaUserTie,
  FaCheckCircle,
  FaMagic,
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

const outcomes = [
  'Capture leads with sharper listings',
  'Nurture buyers with matched recommendations',
  'Close faster with valuation confidence',
];

const AiServicesLanding = () => {
  return (
    <div className="ai-page ai-landing">
      <section className="ai-hero">
        <div className="ai-hero-bg" aria-hidden="true" />
        <div className="ai-container ai-hero-inner">
          <AiToolNav />

          <div className="ai-hero-split">
            <div className="ai-hero-copy">
              <p className="ai-eyebrow"><FaBolt /> Power up your property business with AI</p>
              <h1 className="ai-display ai-hero-title">
                The AI-powered property operating system
              </h1>
              <p className="ai-hero-sub">
                All the tools you need to write listings, value homes and match buyers —
                in one platform built for agents, sellers and serious buyers.
              </p>
              <div className="ai-hero-cta">
                <Link to="/signup" className="ai-btn ai-btn-primary">
                  Start free <FaArrowRight />
                </Link>
                <Link to="/ai-services/pricing" className="ai-btn ai-btn-ghost ai-btn-ghost-light">
                  See pricing
                </Link>
              </div>
              <ul className="ai-hero-proof">
                {outcomes.map((item) => (
                  <li key={item}><FaCheckCircle /> {item}</li>
                ))}
              </ul>
            </div>

            <div className="ai-hero-preview" aria-hidden="true">
              <div className="ai-preview-window">
                <div className="ai-preview-sidebar">
                  <span className="active">Launch Pad</span>
                  <span>Listing Writer</span>
                  <span>Valuations</span>
                  <span>Buyer Match</span>
                  <span>Credits</span>
                  <span>Billing</span>
                </div>
                <div className="ai-preview-main">
                  <div className="ai-preview-top">
                    <strong>AI Recap</strong>
                    <span className="ai-pill"><FaMagic /> Live</span>
                  </div>
                  <div className="ai-preview-stats">
                    <div>
                      <small>Listings generated</small>
                      <strong>128</strong>
                    </div>
                    <div>
                      <small>Valuations</small>
                      <strong>46</strong>
                    </div>
                    <div>
                      <small>Buyer matches</small>
                      <strong>91%</strong>
                    </div>
                  </div>
                  <div className="ai-preview-panel">
                    <p>SEO title ready</p>
                    <div className="ai-preview-bar" />
                    <div className="ai-preview-bar short" />
                    <div className="ai-preview-bar mid" />
                  </div>
                  <div className="ai-preview-cta-row">
                    <span>Credits remaining</span>
                    <em>Unlimited</em>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ai-section ai-trust-strip">
        <div className="ai-container">
          <p>We’re in the business of helping you grow your property pipeline</p>
          <h2>One AI workspace for capture, nurture and close</h2>
        </div>
      </section>

      <section className="ai-section">
        <div className="ai-container">
          <h2 className="ai-section-title">Built for every side of the market</h2>
          <p className="ai-section-sub">
            An all-in-one solution that helps buyers decide faster, sellers price smarter, and agents market at scale.
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
          <h2 className="ai-section-title">Your all-in-one AI toolkit</h2>
          <p className="ai-section-sub">
            Everything you need in one AI-powered property platform — with history, credits and upgrades.
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
          <div className="ai-mid-cta">
            <Link to="/ai-services/dashboard" className="ai-btn ai-btn-secondary">
              <FaTachometerAlt /> Open agent dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="ai-section" id="pricing">
        <div className="ai-container">
          <p className="ai-section-kicker">See our pricing</p>
          <h2 className="ai-section-title">Simple plans that scale with your agency</h2>
          <p className="ai-section-sub">
            Start free. Upgrade when unlimited descriptions and advanced reports become essential.
          </p>
          <PricingCards plans={AI_PLANS} />
        </div>
      </section>

      <section className="ai-cta-band">
        <div className="ai-container ai-cta-band-inner">
          <div>
            <h2 className="ai-display">Take your property marketing to the next level</h2>
            <p>Less friction. Faster listings. More matched buyers. Cancel anytime on paid plans.</p>
          </div>
          <Link to="/signup" className="ai-btn ai-btn-primary">
            Start free today <FaArrowRight />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default AiServicesLanding;
