import React, { useMemo, useState } from 'react';
import TextInput from './inputs/TextInput';
import './CanonicalIdentityFields.css';

const UNIT_TYPE = /\b(flat|maisonette|apartment|apt|studio|penthouse|beds?it|hmo|suite)\b/i;
const UNIT_IN_TEXT = /\b(flat|apartment|maisonette|suite|unit|studio|penthouse)\s+\S/i;
const UNIT_PREFIX = /^(flat|apartment|apt|unit|studio|penthouse|room|suite|maisonette)\s+/i;

export function listingAppearsUnitLike({
  propertyType = '',
  houseNumber = '',
  title = '',
  addressLine1 = '',
} = {}) {
  if (UNIT_TYPE.test(String(propertyType))) return true;
  const blob = [houseNumber, title, addressLine1].filter(Boolean).join(' ');
  if (UNIT_IN_TEXT.test(blob)) return true;
  return UNIT_PREFIX.test(String(houseNumber).trim());
}

export function emptyCanonicalIdentityForm() {
  return {
    identityPaon: '',
    identitySaon: '',
    identityBuildingName: '',
    identityUprn: '',
    identityConflict: false,
  };
}

export function appendCanonicalIdentityFields(target, identity = {}) {
  const assign = (key, value) => {
    if (value == null || String(value).trim() === '') return;
    if (target instanceof FormData) target.append(key, String(value).trim());
    else target[key] = String(value).trim();
  };
  assign('identity_paon', identity.identityPaon);
  assign('identity_saon', identity.identitySaon);
  assign('identity_building_name', identity.identityBuildingName);
  assign('identity_uprn', identity.identityUprn);
}

export async function fetchCanonicalIdentity(propertyId, token) {
  if (!propertyId || !token) return emptyCanonicalIdentityForm();
  const base = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050';
  const response = await fetch(`${base}/api/properties/${propertyId}/identity`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return emptyCanonicalIdentityForm();
  const data = await response.json();
  const identity = data.identity || {};
  return {
    identityPaon: identity.paon || '',
    identitySaon: identity.saon || '',
    identityBuildingName: identity.buildingName || '',
    identityUprn: identity.uprn || '',
    identityConflict: identity.conflict === true,
  };
}

export default function CanonicalIdentityFields({
  value,
  onChange,
  propertyType = '',
  houseNumber = '',
  title = '',
  defaultOpen = false,
  landOrDevelopment = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const unitLike = useMemo(
    () => listingAppearsUnitLike({ propertyType, houseNumber, title }),
    [propertyType, houseNumber, title]
  );
  const landLike = landOrDevelopment
    || /\b(land|development[_-\s]?site|plot)\b/i.test(String(propertyType));
  const handleField = (event) => {
    const { name, value: next } = event.target;
    onChange({ ...value, [name]: next });
  };

  return (
    <div className="canonical-identity-fields" data-testid="canonical-identity-fields">
      <button
        type="button"
        className="canonical-identity-toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {open ? 'Hide' : 'Add'} property identity details
      </button>
      <p className="canonical-identity-hint">
        Optional. These fields improve matching to official property records.
        They do not verify ownership and a UPRN is not a title number.
      </p>
      {value?.identityConflict ? (
        <p className="canonical-identity-unit-warning" data-testid="identity-conflict-hint">
          An unresolved identity conflict exists. Your declaration was recorded
          and did not overwrite official UPRN evidence. This is not verification.
        </p>
      ) : null}
      {unitLike ? (
        <p className="canonical-identity-unit-warning" data-testid="unit-identity-hint">
          This listing looks like a flat, unit, or suite. Add the unit identifier
          (for example Flat 5) so it is not confused with the building.
        </p>
      ) : null}
      {open ? (
        <div className="canonical-identity-panel">
          <div className="form-row">
            <TextInput
              label="PAON (house number or primary addressable name)"
              name="identityPaon"
              value={value.identityPaon}
              onChange={handleField}
              placeholder="12, 12A, Farmhouse"
            />
            <TextInput
              label="SAON / unit identifier"
              name="identitySaon"
              value={value.identitySaon}
              onChange={handleField}
              placeholder="Flat 5, Unit A, Suite 3"
            />
          </div>
          <div className="form-row">
            <TextInput
              label="Building name"
              name="identityBuildingName"
              value={value.identityBuildingName}
              onChange={handleField}
              placeholder="Optional named building"
            />
            <TextInput
              label="UPRN (optional)"
              name="identityUprn"
              value={value.identityUprn}
              onChange={handleField}
              placeholder="Digits only — not required"
            />
          </div>
          {landLike ? (
            <p className="canonical-identity-hint">
              Land and development sites often have no PAON, SAON, or UPRN.
              Leave blank rather than inventing a parcel or title identity.
            </p>
          ) : null}
          <p className="canonical-identity-hint">
            Building identity is not unit identity. 12 is not 12A. Flat 5 is not Flat 6.
            Entered values are your declaration, not official verification.
          </p>
        </div>
      ) : null}
    </div>
  );
}
