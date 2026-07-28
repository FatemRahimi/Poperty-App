import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaBolt } from 'react-icons/fa';
import './AiToolShell.css';

const TOOL_LINKS = [
  { to: '/ai-services/listing-writer', label: 'Listing Writer' },
  { to: '/ai-services/valuation', label: 'Valuation Report' },
  { to: '/ai-services/buyer-match', label: 'Buyer Match' },
  { to: '/ai-services/dashboard', label: 'Dashboard' },
];

const AiToolShell = ({
  title,
  subtitle,
  credits = null,
  children,
  actions = null,
}) => {
  const unlimited = credits !== null && (credits < 0 || credits === 'unlimited');

  return (
    <div className="ai-tool-shell ai-fade-up">
      <div className="ai-tool-top">
        <div>
          <Link to="/ai-services" className="ai-tool-back">
            <FaArrowLeft /> AI Property Services
          </Link>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="ai-tool-meta">
          {credits !== null && (
            <div className="ai-credits-badge" title="Remaining AI credits this cycle">
              <FaBolt />
              <span>
                {unlimited ? 'Unlimited credits' : `${credits} credit${credits === 1 ? '' : 's'} left`}
              </span>
            </div>
          )}
          {actions}
        </div>
      </div>

      <nav className="ai-tool-nav" aria-label="AI tools">
        {TOOL_LINKS.map((link) => (
          <Link key={link.to} to={link.to}>
            {link.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
};

export default AiToolShell;
