import React, { Children } from 'react';

export function DeepShell({ enabled, children }) {
  if (!enabled) return children;
  return (
    <div className="pi-deep-investigation" data-testid="deep-investigation">
      {children}
    </div>
  );
}

export function DeepGate({ enabled, testId, label, children }) {
  const content = Children.toArray(children).filter((child) => child != null && child !== false);
  if (!content.length) return null;
  if (!enabled) return content;
  return (
    <details className="pi-deep-group" data-testid={testId}>
      <summary>{label}</summary>
      {content}
    </details>
  );
}
