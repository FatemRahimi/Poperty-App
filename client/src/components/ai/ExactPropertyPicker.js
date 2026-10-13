import React from 'react';
import { sanitizePropertyTypeDisplay } from '../../Utils/propertyFactsDisplay';
import {
  platformMatchEvidenceLabel,
  externalMatchEvidenceLabel,
  discoveryPrimaryLine,
  discoveryBuildingLine,
  isShellDiscoveryRow,
} from '../../Utils/exactPropertyPickerDisplay';
import './ExactPropertyPicker.css';

/** Address-first label for platform listings — never UPRN-first. */
export function platformAddressLabel(property) {
  if (!property) return 'Property';
  return (
    property.address_display
    || property.title
    || [property.address_line1, property.city, property.postcode].filter(Boolean).join(', ')
    || `Property #${property.id}`
  );
}

/** Unit / flat hint when present as distinct text from the main address. */
export function unitHintFromAddress(address, title) {
  const text = String(address || title || '');
  const m = text.match(/\b((?:flat|apartment|apt|unit|studio|maisonette|penthouse)\s+[^\s,]+)/i);
  return m ? m[1] : null;
}

export function knownPropertyType(value) {
  return sanitizePropertyTypeDisplay(value);
}

function renderUkRow({
  match,
  selectedUprn,
  resolvingExternal,
  onSelectExternal,
}) {
  const address = discoveryPrimaryLine(match) || match.address || `Address ${match.uprn}`;
  const buildingLine = discoveryBuildingLine(match);
  const type = knownPropertyType(
    match.kind === 'shell' ? null : (match.classificationCodeDesc || match.propertyType || match.property_type)
  );
  const origin = externalMatchEvidenceLabel(match);
  const selected = Boolean(selectedUprn && String(selectedUprn) === String(match.uprn));
  const shell = isShellDiscoveryRow(match);
  return (
    <li key={`epp-ext-${match.uprn}`} role="none">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={`epp-row epp-row--external ${shell ? 'epp-row--shell' : ''} ${selected ? 'epp-row--selected' : ''}`}
        onClick={() => onSelectExternal(match)}
        disabled={resolvingExternal}
        data-testid={`epp-uk-${match.uprn}`}
        data-uprn={match.uprn}
        data-kind={match.kind || 'address'}
      >
        <div className="epp-row-body">
          <span className="epp-address">{address}</span>
          {buildingLine && buildingLine !== address ? (
            <span className="epp-secondary">{buildingLine}</span>
          ) : null}
          <span className="epp-origin">
            {shell ? <span className="epp-shell-badge">Building / shell</span> : origin}
            {type && !shell ? ` · ${type}` : ''}
          </span>
          {match.uprn != null && match.uprn !== '' && (
            <details className="epp-identity-fold">
              <summary>Identity details</summary>
              <span className="epp-uprn-secondary" data-testid="epp-uprn-secondary">
                Ref {match.uprn}
              </span>
            </details>
          )}
          {selected ? <span className="epp-status">Selected</span> : null}
        </div>
      </button>
    </li>
  );
}

/**
 * Exact property selection list — search → results → select.
 * No autocomplete; no invented flats or speculative attributes.
 */
export default function ExactPropertyPicker({
  postcodeLabel,
  internal = [],
  externalMatches = [],
  selectedId,
  selectedUprn,
  loadingPreviewId,
  resolvingExternal,
  namedUnitUnconfirmed = false,
  potentiallyTruncated = false,
  onSelectInternal,
  onSelectExternal,
}) {
  const hasInternal = internal.length > 0;
  const hasExternal = externalMatches.length > 0;
  if (!hasInternal && !hasExternal) return null;

  const unitRows = externalMatches.filter((m) => m.kind !== 'shell');
  const shellRows = externalMatches.filter((m) => m.kind === 'shell');
  const ambiguous = internal.length + externalMatches.length > 1;

  return (
    <section
      className="epp-root"
      data-testid="exact-property-picker"
      aria-labelledby="epp-heading"
    >
      <header className="epp-header">
        <h2 id="epp-heading" className="epp-heading">
          Select the exact property
          {postcodeLabel ? (
            <span className="epp-heading-postcode"> in {postcodeLabel}</span>
          ) : null}
        </h2>
        <p className="epp-support">
          Choose the exact address you want to analyse.
          {ambiguous
            ? ' Several matches were found — pick one to continue.'
            : ' Confirm this is the exact property — it is not selected automatically.'}
        </p>
        {namedUnitUnconfirmed ? (
          <p className="epp-named-unit-warning" data-testid="epp-named-unit-warning">
            We couldn't confirm that exact flat. A building is not that flat —
            select a returned address below, or search again.
          </p>
        ) : null}
        {potentiallyTruncated ? (
          <p className="epp-truncation-note" data-testid="epp-truncation-note">
            Address list may be incomplete. The provider returned its maximum number of
            results — this postcode is not claimed complete.
          </p>
        ) : null}
      </header>

      {hasInternal && (
        <div className="epp-group" data-testid="epp-platform-group">
          <h3 className="epp-group-title">Property matches</h3>
          <ul className="epp-list" role="listbox" aria-label="Property matches">
            {internal.map((p) => {
              const address = platformAddressLabel(p);
              const unit = unitHintFromAddress(p.address_display, p.title);
              const type = knownPropertyType(p.property_type);
              const origin = platformMatchEvidenceLabel(p);
              const selected = selectedId === p.id;
              const loading = loadingPreviewId === p.id;
              return (
                <li key={`epp-int-${p.id}`} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`epp-row ${selected ? 'epp-row--selected' : ''}`}
                    onClick={() => onSelectInternal(p.id)}
                    disabled={loading || resolvingExternal}
                    data-testid={`epp-platform-${p.id}`}
                  >
                    {p.main_image ? (
                      <img src={p.main_image} alt="" className="epp-thumb" />
                    ) : null}
                    <div className="epp-row-body">
                      <span className="epp-address">{address}</span>
                      {(unit || type) && (
                        <span className="epp-secondary">
                          {[unit && unit !== address ? unit : null, type]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                      <span className="epp-origin">{origin}</span>
                      {loading ? (
                        <span className="epp-status">Loading…</span>
                      ) : selected ? (
                        <span className="epp-status">Selected</span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {unitRows.length > 0 && (
        <div className="epp-group" data-testid="epp-uk-address-group">
          <h3 className="epp-group-title">UK address / unit matches</h3>
          <ul className="epp-list" role="listbox" aria-label="UK address / unit matches">
            {unitRows.map((m) =>
              renderUkRow({
                match: m,
                selectedUprn,
                resolvingExternal,
                onSelectExternal,
              })
            )}
          </ul>
        </div>
      )}

      {shellRows.length > 0 && (
        <div className="epp-group" data-testid="epp-building-shell-group">
          <h3 className="epp-group-title">Building / shell</h3>
          <ul className="epp-list" role="listbox" aria-label="Building / shell">
            {shellRows.map((m) =>
              renderUkRow({
                match: m,
                selectedUprn,
                resolvingExternal,
                onSelectExternal,
              })
            )}
          </ul>
        </div>
      )}

      <p className="epp-flat-hint" data-testid="epp-flat-hint">
        Can&apos;t see the exact property? Search using the full address.
      </p>
    </section>
  );
}
