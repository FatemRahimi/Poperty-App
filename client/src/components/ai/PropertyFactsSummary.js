import React, { useCallback, useEffect, useState } from 'react';
import {
  getSubjectPropertyAttributes,
  putSubjectPropertyAttributes,
} from '../../services/aiService';
import {
  FINISH_QUALITY_DISCLAIMER,
  FINISH_QUALITY_UI_OPTIONS,
} from '../../Utils/finishQualityProviderInput';
import './PropertyFactsSummary.css';

const OUTDOOR_OPTIONS = [
  { value: '', label: 'Leave unknown' },
  { value: 'garden', label: 'Garden' },
  { value: 'balcony_terrace', label: 'Balcony / terrace' },
  { value: 'none', label: 'None (confirmed no outdoor space)' },
];

function preloadForm(attributes = {}) {
  return {
    bedrooms: attributes.bedrooms?.available ? String(attributes.bedrooms.value) : '',
    bathrooms: attributes.bathrooms?.available ? String(attributes.bathrooms.value) : '',
    outdoor: attributes.outdoor?.available ? String(attributes.outdoor.value) : '',
    offStreetParking: attributes.offStreetParking?.available
      ? String(attributes.offStreetParking.value)
      : '',
    finishQuality: attributes.finishQualityProviderRequest?.available
      ? String(attributes.finishQualityProviderRequest.value)
      : '',
  };
}

/**
 * Compact Property Facts surface — known / unknown / provenance.
 * Optional Add/Edit uses existing subject attribute APIs when subjectId is present.
 */
export default function PropertyFactsSummary({
  facts = [],
  subjectId = null,
  preview = null,
  onAttributesChange = null,
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    bedrooms: '',
    bathrooms: '',
    outdoor: '',
    offStreetParking: '',
    finishQuality: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedOk, setSavedOk] = useState(false);

  const canEdit = Boolean(subjectId);

  const load = useCallback(async () => {
    if (!subjectId) {
      setLoaded(false);
      return;
    }
    try {
      const data = await getSubjectPropertyAttributes(subjectId);
      if (data?.attributes) {
        setForm(preloadForm(data.attributes));
        if (typeof onAttributesChange === 'function') {
          onAttributesChange(data.attributes);
        }
      }
      setLoaded(true);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load attributes');
      setLoaded(true);
    }
  }, [subjectId, onAttributesChange]);

  useEffect(() => {
    setEditOpen(false);
    setSavedOk(false);
    setError(null);
    if (subjectId) load();
    else setLoaded(false);
  }, [subjectId, load]);

  if (!facts.length) return null;

  const onChange = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setSavedOk(false);
  };

  const onSave = async (event) => {
    event.preventDefault();
    if (!subjectId) return;
    setError(null);
    setSaving(true);
    setSavedOk(false);
    try {
      const payload = {};
      if (form.bedrooms !== '') payload.bedrooms = Number(form.bedrooms);
      if (form.bathrooms !== '') payload.bathrooms = Number(form.bathrooms);
      if (form.outdoor !== '') payload.outdoor = form.outdoor;
      if (form.offStreetParking !== '') payload.offStreetParking = Number(form.offStreetParking);
      if (form.finishQuality !== '') payload.finishQuality = form.finishQuality;
      payload.propertyContext = {
        postcode: preview?.zip_code || preview?.postcode || null,
        zip_code: preview?.zip_code || preview?.postcode || null,
        property_type: preview?.property_type || preview?.propertyType || null,
        square_feet: preview?.square_feet ?? null,
        floor_area: preview?.floor_area ?? null,
        floor_area_unit: preview?.floor_area_unit || null,
        year_built: preview?.year_built ?? null,
        construction_age_band: preview?.construction_age_band || null,
      };
      const keys = Object.keys(payload).filter((k) => k !== 'propertyContext');
      if (keys.length === 0) {
        setError('Enter at least one confirmed value. Leave blank to keep unknown.');
        setSaving(false);
        return;
      }
      const result = await putSubjectPropertyAttributes(subjectId, payload);
      if (!result?.success) {
        setError(result?.message || 'Save failed');
        setSaving(false);
        return;
      }
      if (result.attributes) {
        setForm(preloadForm(result.attributes));
        if (typeof onAttributesChange === 'function') {
          onAttributesChange(result.attributes);
        }
      }
      setSavedOk(true);
    } catch (err) {
      setError(
        err?.response?.data?.message
        || err?.response?.data?.errors?.[0]?.reason
        || err.message
        || 'Save failed'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="pi-facts-summary"
      data-testid="property-facts-summary"
      aria-labelledby="pi-facts-heading"
    >
      <div className="pi-facts-header-row">
        <h2 id="pi-facts-heading" className="pi-facts-heading">
          What we know about this property
        </h2>
        {canEdit && (
          <button
            type="button"
            className="ai-btn ai-btn-ghost pi-facts-edit-toggle"
            onClick={() => {
              setEditOpen((v) => !v);
              setSavedOk(false);
              setError(null);
            }}
            data-testid="property-facts-edit-toggle"
          >
            {editOpen ? 'Close' : 'Add / Edit'}
          </button>
        )}
      </div>

      <ul className="pi-facts-list" data-testid="property-facts-list">
        {facts.map((fact) => (
          <li
            key={fact.id}
            className={`pi-fact-row${fact.known ? '' : ' pi-fact-row--unknown'}`}
            data-testid={`property-fact-${fact.id}`}
          >
            <span className="pi-fact-label">{fact.label}</span>
            <span className="pi-fact-main">
              <span className="pi-fact-value" data-testid={`property-fact-value-${fact.id}`}>
                {fact.known ? fact.value : 'Unknown'}
              </span>
              {fact.provenanceLabel && (
                <span
                  className="pi-fact-provenance"
                  data-testid={`property-fact-provenance-${fact.id}`}
                >
                  {fact.provenanceLabel}
                  {fact.sourceDetail ? ` · ${fact.sourceDetail}` : ''}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {!canEdit && (
        <p className="pi-facts-footnote" data-testid="property-facts-listing-note">
          Values above come from this property’s evidence. Unknown means no confirmed evidence yet.
        </p>
      )}

      {canEdit && editOpen && (
        <form
          className="pi-facts-edit"
          onSubmit={onSave}
          data-testid="property-facts-edit-form"
        >
          <p className="pi-facts-edit-lead">
            Optional corrections are saved as <strong>User provided</strong> on this subject.
            Leave blank to keep unknown — blank is not zero.
          </p>
          {!loaded ? (
            <p className="pi-facts-footnote">Loading…</p>
          ) : (
            <div className="pi-facts-edit-grid">
              <label className="pi-facts-edit-field">
                <span>Bedrooms</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  value={form.bedrooms}
                  onChange={onChange('bedrooms')}
                  placeholder="Unknown"
                  data-testid="facts-input-bedrooms"
                />
              </label>
              <label className="pi-facts-edit-field">
                <span>Bathrooms</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  value={form.bathrooms}
                  onChange={onChange('bathrooms')}
                  placeholder="Unknown"
                  data-testid="facts-input-bathrooms"
                />
              </label>
              <label className="pi-facts-edit-field">
                <span>Outdoor space</span>
                <select
                  value={form.outdoor}
                  onChange={onChange('outdoor')}
                  data-testid="facts-input-outdoor"
                >
                  {OUTDOOR_OPTIONS.map((opt) => (
                    <option key={opt.value || 'unknown'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pi-facts-edit-field">
                <span>Parking spaces</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  value={form.offStreetParking}
                  onChange={onChange('offStreetParking')}
                  placeholder="Unknown"
                  data-testid="facts-input-parking"
                />
              </label>
              <label className="pi-facts-edit-field pi-facts-edit-field--wide">
                <span>Finish / condition</span>
                <select
                  value={form.finishQuality}
                  onChange={onChange('finishQuality')}
                  data-testid="facts-input-finish"
                >
                  <option value="">Leave unknown</option>
                  {FINISH_QUALITY_UI_OPTIONS.map((opt) => (
                    <option key={opt.providerValue} value={opt.providerValue}>
                      {opt.userLabel}
                    </option>
                  ))}
                </select>
                <small className="pi-facts-footnote">{FINISH_QUALITY_DISCLAIMER.body}</small>
              </label>
            </div>
          )}
          {error && (
            <p className="pi-facts-edit-error" role="alert" data-testid="property-facts-edit-error">
              {error}
            </p>
          )}
          {savedOk && (
            <p className="pi-facts-edit-ok" data-testid="property-facts-edit-saved">
              Saved as user-provided evidence on this subject.
            </p>
          )}
          <button
            type="submit"
            className="ai-btn ai-btn-primary"
            disabled={saving || !loaded}
            data-testid="property-facts-edit-save"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </section>
  );
}
