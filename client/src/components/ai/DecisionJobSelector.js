import React, { useRef } from 'react';
import './DecisionJobSelector.css';

export const RESIDENTIAL_DECISION_JOBS = [
  {
    id: 'BUY',
    label: 'Buy',
    hint: 'Purchase decision',
  },
  {
    id: 'LET_INVEST',
    label: 'Let / Invest',
    hint: 'Rental investment / landlord assessment',
  },
  {
    id: 'SELL',
    label: 'Sell',
    hint: 'Sale / pricing context',
  },
];

/**
 * Exact-property job selector — subject-native, not listing-native.
 * Three distinct compact controls; one selected at a time.
 */
export default function DecisionJobSelector({ value, onChange, disabled = false }) {
  const buttonRefs = useRef([]);

  const selectJob = (jobId) => {
    if (!disabled && typeof onChange === 'function') onChange(jobId);
  };

  const moveSelection = (fromIndex, nextIndex) => {
    const job = RESIDENTIAL_DECISION_JOBS[nextIndex];
    if (!job) return;
    selectJob(job.id);
    const node = buttonRefs.current[nextIndex];
    if (node && typeof node.focus === 'function') node.focus();
  };

  const onKeyDown = (event, index) => {
    const last = RESIDENTIAL_DECISION_JOBS.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(index, index === last ? 0 : index + 1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(index, index === 0 ? last : index - 1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      moveSelection(index, 0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      moveSelection(index, last);
    }
  };

  return (
    <section
      className="pi-job-selector"
      data-testid="decision-job-selector"
      aria-labelledby="pi-job-selector-heading"
    >
      <h2 id="pi-job-selector-heading" className="pi-job-selector-heading">
        What are you assessing?
      </h2>
      <p className="pi-job-selector-lead" id="pi-job-selector-lead">
        Choose one decision for this exact property — not a property fact.
      </p>
      <div
        className="pi-job-selector-grid"
        role="radiogroup"
        aria-labelledby="pi-job-selector-heading"
        aria-describedby="pi-job-selector-lead"
        data-testid="decision-job-radiogroup"
      >
        {RESIDENTIAL_DECISION_JOBS.map((job, index) => {
          const selected = value === job.id;
          const tabIndex = selected || (!value && index === 0) ? 0 : -1;
          return (
            <button
              key={job.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${job.label}. ${job.hint}`}
              tabIndex={disabled ? -1 : tabIndex}
              className={`pi-job-option${selected ? ' pi-job-option--selected' : ''}`}
              data-testid={`decision-job-${job.id}`}
              disabled={disabled}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => selectJob(job.id)}
            >
              <span className="pi-job-option-check" aria-hidden="true">
                {selected ? '✓' : ''}
              </span>
              <span className="pi-job-option-copy">
                <span className="pi-job-option-label">{job.label}</span>
                <span className="pi-job-option-hint">{job.hint}</span>
                {selected ? (
                  <span className="pi-job-option-selected-text">Selected</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
