import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const links = [
  { to: '/ai-services', label: 'Overview', exact: true },
  { to: '/ai-services/listing-writer', label: 'Listing Writer' },
  { to: '/ai-services/valuation', label: 'Valuation' },
  { to: '/ai-services/buyer-match', label: 'Buyer Match' },
  { to: '/ai-services/dashboard', label: 'Dashboard' },
  { to: '/ai-services/pricing', label: 'Pricing' },
];

const AiToolNav = () => {
  const { pathname } = useLocation();

  return (
    <nav className="ai-tool-nav" aria-label="AI Property Services">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.to
          : pathname === link.to || pathname.startsWith(`${link.to}/`);
        return (
          <Link key={link.to} to={link.to} className={active ? 'active' : ''}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default AiToolNav;
