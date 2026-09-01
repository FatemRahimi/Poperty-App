import React from 'react';
import { NOT_ASSESSED_LABEL } from '../../Utils/assessedMetricDisplay';

export function AssessedMetricTile({ label, display, testId }) {
  const text = display?.text || NOT_ASSESSED_LABEL;
  const unavailable = !display?.numeric;
  return (
    <div
      className={`ai-metric${unavailable ? ' ai-metric--unavailable' : ''}`}
      data-testid={testId}
    >
      <small>{label}</small>
      <strong>{text}</strong>
      {display?.reason ? <em className="ai-metric-reason">{display.reason}</em> : null}
    </div>
  );
}

export function AssessedText({ display, testId }) {
  return <span data-testid={testId}>{display?.text || NOT_ASSESSED_LABEL}</span>;
}
