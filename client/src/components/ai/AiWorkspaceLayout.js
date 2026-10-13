import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FaRobot, FaBars, FaTimes } from 'react-icons/fa';
import { AI_NAV, AI_PLATFORM_TAGLINE } from '../../config/aiNavigation';
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
        <Link to="/ai-services" className="ai-workspace-brand" aria-label="Home">
          <FaRobot />
          <span>Home</span>
        </Link>
        <Link to="/" className="ai-workspace-home-link">
          ← Back
        </Link>
        <div className="ai-workspace-topbar-meta">
          {!isAuthenticated && (
            <Link to="/login" state={{ from: `${location.pathname}${location.search || ''}` }} className="ai-btn ai-btn-primary ai-btn-sm">
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
          {AI_PLATFORM_TAGLINE ? <p className="ai-sidebar-tagline">{AI_PLATFORM_TAGLINE}</p> : null}
          {AI_NAV.map((section) => {
            const links = (
              <ul>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.exact}
                        className={({ isActive }) => `ai-nav-link ${isActive ? 'active' : ''}`}
                        title={item.hint || item.label}
                      >
                        <Icon />
                        <span className="ai-nav-link-text">
                          <span className="ai-nav-link-label">{item.label}</span>
                          {item.hint ? <em className="ai-nav-link-hint">{item.hint}</em> : null}
                        </span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            );
            if (section.disclosure) {
              return (
                <details key={section.group} className="ai-nav-more" data-testid="more-tools">
                  <summary>{section.group}</summary>
                  {links}
                </details>
              );
            }
            return (
              <div key={section.group} className="ai-nav-group">
                <p className="ai-nav-group-label">{section.group}</p>
                {links}
                {section.group === 'Account' && isAuthenticated && credits !== null && (
                  <p className="ai-nav-credits" data-testid="sidebar-credits">Credits: {credits}</p>
                )}
              </div>
            );
          })}
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
