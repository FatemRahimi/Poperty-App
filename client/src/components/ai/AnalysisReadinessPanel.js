import React from 'react';
import './AnalysisReadinessPanel.css';

export default function AnalysisReadinessPanel({ items = [] }) {
  if (!items.length) return null;
  return (
    <section
      className="pi-readiness"
      data-testid="analysis-readiness"
      aria-labelledby="pi-readiness-heading"
    >
      <h3 id="pi-readiness-heading" className="pi-readiness-heading">
        Analysis readiness
      </h3>
      <ul className="pi-readiness-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`pi-readiness-row pi-readiness-row--${item.status}`}
            data-testid={`readiness-${item.id}`}
          >
            <span className="pi-readiness-label">{item.label}</span>
            <span className="pi-readiness-status">
              {item.statusLabel || (item.status === 'ready' ? 'Inputs ready' : 'Needs input')}
            </span>
            <span className="pi-readiness-detail">{item.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
