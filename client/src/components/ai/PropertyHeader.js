import React from 'react';
import './PropertyHeader.css';

/**
 * Compact confirmed-subject anchor for Property Intelligence.
 * Address is primary identity. Origin/listing relationship is secondary evidence.
 */
export default function PropertyHeader({
  address,
  propertyType = null,
  originLabel = null,
  relationshipHint = null,
  uprn = null,
  onChangeProperty,
  compact = false,
  sticky = false,
}) {
  return (
    <header
      className={`pi-property-header${compact ? ' pi-property-header--compact' : ''}${sticky ? ' pi-property-header--sticky' : ''}`}
      data-testid="property-header"
    >
      <div className="pi-property-header-main">
        <p className="pi-property-header-kicker" data-testid="property-header-kicker">
          Selected property
        </p>
        <h2 className="pi-property-header-address" data-testid="property-header-address">
          {address || 'Selected property'}
        </h2>
        <p className="pi-property-header-meta" data-testid="property-header-meta">
          {[propertyType, uprn != null && uprn !== '' ? `Ref ${uprn}` : null]
            .filter(Boolean)
            .join(' · ') || 'Exact property selected'}
        </p>
        {(originLabel || relationshipHint) && (
          <p className="pi-property-header-evidence" data-testid="property-header-origin">
            {[originLabel, relationshipHint].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {typeof onChangeProperty === 'function' && (
        <button
          type="button"
          className="ai-btn ai-btn-ghost pi-change-property-btn"
          onClick={onChangeProperty}
          data-testid="change-property"
        >
          Change property
        </button>
      )}
    </header>
  );
}
