import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FaRobot, FaBars, FaTimes } from 'react-icons/fa';
import { AI_NAV, AI_PLATFORM_TAGLINE, AI_PRODUCT_NAME } from '../../config/aiNavigation';
import { displayAiCredits, refreshAiCredits, subscribeAiCredits } from '../../services/aiCreditState';
import { useAuth } from '../../context/AuthContext';
import './AiWorkspaceLayout.css';

const AiWorkspaceLayout = ({ children, title, subtitle }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const unsub = subscribeAiCredits((snap) => {
      setCredits(displayAiCredits(snap));
    });
    Promise.resolve(refreshAiCredits()).catch(() => {});
    return unsub;
  }, [isAuthenticated, location.pathname]);

  return (
    <div className="ai-workspace">
      <header className="ai-workspace-topbar">
        <button type="button" className="ai-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
          {sidebarOpen ? <FaTimes /> : <FaBars />}
        </button>
        <Link to="/ai-services" className="ai-workspace-brand">
          <FaRobot />
          <span>{AI_PRODUCT_NAME}</span>
        </Link>
        <Link to="/" className="ai-workspace-home-link">
          ← Back to site
        </Link>
        <div className="ai-workspace-topbar-meta">
          {isAuthenticated && credits !== null && (
            <span className="ai-credits-pill">Credits: {credits}</span>
          )}
          {!isAuthenticated && (
            <Link to="/login" state={{ from: location.pathname }} className="ai-btn ai-btn-primary ai-btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="ai-workspace-body">
        {sidebarOpen && (
          <button
            type="button"
            className="ai-sidebar-backdrop"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className={`ai-workspace-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <p className="ai-sidebar-tagline">{AI_PLATFORM_TAGLINE}</p>
          {AI_NAV.map((section) => (
            <div key={section.group} className="ai-nav-group">
              <p className="ai-nav-group-label">{section.group}</p>
              <ul>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.exact}
                        className={({ isActive }) => `ai-nav-link ${isActive ? 'active' : ''}`}
                      >
                        <Icon /> {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <main className="ai-workspace-main">
          {(title || subtitle) && (
            <header className="ai-page-header">
              {title && <h1>{title}</h1>}
              {subtitle && <p>{subtitle}</p>}
            </header>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default AiWorkspaceLayout;
