import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getSubjectPropertyAttributes,
  putSubjectPropertyAttributes,
} from '../../services/aiService';
import {
  FINISH_QUALITY_DISCLAIMER,
  FINISH_QUALITY_UI_OPTIONS,
} from '../../Utils/finishQualityProviderInput';
import { causeLabel } from '../../Utils/underwritingInputDisplay';

const OUTDOOR_OPTIONS = [
  { value: '', label: 'Not confirmed (unknown)' },
  { value: 'garden', label: 'Garden' },
  { value: 'balcony_terrace', label: 'Balcony / terrace' },
  { value: 'none', label: 'None (confirmed no outdoor space)' },
];

function missingFieldsFromReport(report = {}) {
  const fields = report?.marketIntelligence?.sale?.readiness?.missingFields
    || report?.valuationSaleReadiness?.missingFields
    || report?.property?.valuationSaleReadiness?.missingFields
    || [];
  return Array.isArray(fields) ? fields : [];
}

function propertyContextFromReport(report = {}) {
  const p = report?.property || report?.inputSnapshot || {};
  return {
    postcode: p.zip_code || p.postcode || p.zipCode || null,
    zip_code: p.zip_code || p.postcode || null,
    property_type: p.property_type || p.propertyType || null,
    square_feet: p.square_feet ?? p.squareFeet ?? null,
    floor_area: p.floor_area ?? p.floorArea ?? null,
    floor_area_unit: p.floor_area_unit || p.floorAreaUnit || null,
    year_built: p.year_built ?? p.yearBuilt ?? null,
    construction_age_band: p.construction_age_band || p.constructionAgeBand || null,
    constructionAgeBand: p.construction_age_band || p.constructionAgeBand || null,
    officialConstructionAge: p.officialConstructionAge || null,
  };
}

function subjectIdFromReport(report = {}, unresolved = []) {
  const fromGap = unresolved.find((row) => row?.isSubjectAttribute && row.subjectId)?.subjectId;
  return fromGap
    || report?.subject?.id
    || report?.property?.subjectId
    || report?.inputSnapshot?.subjectId
    || null;
}

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
 * Minimal subject-native completion for AVM-required property facts + finish input.
 * Saves against the subject — never fabricates a listing.
 */
export default function SubjectAttributeCompletionPanel({
  report,
  unresolved = [],
}) {
  const subjectId = subjectIdFromReport(report, unresolved);
  const initialMissing = useMemo(() => new Set(missingFieldsFromReport(report)), [report]);
  const subjectGaps = useMemo(
    () => unresolved.filter((row) => row?.isSubjectAttribute),
    [unresolved]
  );

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
  const [readiness, setReadiness] = useState(null);
  const [savedOk, setSavedOk] = useState(false);
  const [activeMissing, setActiveMissing] = useState(initialMissing);

  const showBedrooms = activeMissing.has('bedrooms');
  const showBathrooms = activeMissing.has('bathrooms');
  const showOutdoor = activeMissing.has('outdoor_space');
  const showParking = activeMissing.has('off_street_parking');
  const showFinish = activeMissing.has('finish_quality');
  const hasAny = showBedrooms || showBathrooms || showOutdoor || showParking || showFinish;

  const load = useCallback(async () => {
    if (!subjectId) return;
    try {
      const data = await getSubjectPropertyAttributes(subjectId);
      if (data?.attributes) {
        setForm(preloadForm(data.attributes));
      }
      setLoaded(true);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load attributes');
      setLoaded(true);
    }
  }, [subjectId]);

  useEffect(() => {
    setActiveMissing(initialMissing);
    setReadiness(null);
    setSavedOk(false);
    load();
  }, [initialMissing, load]);

  if (!subjectId || subjectGaps.length === 0) {
    return null;
  }
  if (!hasAny && !savedOk) {
    return null;
  }

  const onChange = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setSavedOk(false);
  };

  const buildPayload = () => {
    const payload = {};
    if (showBedrooms && form.bedrooms !== '') {
      payload.bedrooms = Number(form.bedrooms);
    }
    if (showBathrooms && form.bathrooms !== '') {
      payload.bathrooms = Number(form.bathrooms);
    }
    if (showOutdoor && form.outdoor !== '') {
      payload.outdoor = form.outdoor;
    }
    if (showParking && form.offStreetParking !== '') {
      payload.offStreetParking = Number(form.offStreetParking);
    }
    if (showFinish && form.finishQuality !== '') {
      payload.finishQuality = form.finishQuality;
    }
    payload.propertyContext = propertyContextFromReport(report);
    return payload;
  };

  const onSave = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    setSavedOk(false);
    try {
      const payload = buildPayload();
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
      if (result.attributes) setForm(preloadForm(result.attributes));
      if (result.readiness) {
        setReadiness(result.readiness);
        setActiveMissing(new Set(result.readiness.missingFields || []));
      } else {
        const next = new Set(activeMissing);
        if (payload.bedrooms !== undefined) next.delete('bedrooms');
        if (payload.bathrooms !== undefined) next.delete('bathrooms');
        if (payload.outdoor !== undefined) next.delete('outdoor_space');
        if (payload.offStreetParking !== undefined) next.delete('off_street_parking');
        if (payload.finishQuality !== undefined) next.delete('finish_quality');
        setActiveMissing(next);
      }
      setSavedOk(true);
    } catch (err) {
      const msg = err?.response?.data?.message
        || err?.response?.data?.errors?.[0]?.reason
        || err.message
        || 'Save failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="pi-workspace-block pi-subject-attr-completion"
      data-testid="subject-attribute-completion"
    >
      <h3>Complete property facts</h3>
      <p className="pi-muted">
        Only missing facts for this analysis subject are shown. Blank means unknown — not zero.
        Values are saved as user-reported evidence on the subject (not a fake listing).
      </p>
      <p className="pi-muted" data-testid="subject-attr-provenance-note">
        Provenance: USER_REPORTED (never upgraded to official).
      </p>

      {!loaded ? (
        <p className="pi-muted">Loading…</p>
      ) : hasAny ? (
        <form onSubmit={onSave} className="pi-subject-attr-form" data-testid="subject-attribute-form">
          {showBedrooms && (
            <label className="pi-subject-attr-field" data-testid="field-bedrooms">
              <span>Bedrooms</span>
              <span className="pi-workspace-cause">{causeLabel('MISSING_USER_REPORTED_ATTRIBUTE')}</span>
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                value={form.bedrooms}
                onChange={onChange('bedrooms')}
                placeholder="Unknown"
                data-testid="input-bedrooms"
              />
              <small className="pi-muted">0 is allowed when there are no bedrooms.</small>
            </label>
          )}

          {showBathrooms && (
            <label className="pi-subject-attr-field" data-testid="field-bathrooms">
              <span>Bathrooms</span>
              <span className="pi-workspace-cause">{causeLabel('MISSING_USER_REPORTED_ATTRIBUTE')}</span>
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                value={form.bathrooms}
                onChange={onChange('bathrooms')}
                placeholder="Unknown"
                data-testid="input-bathrooms"
              />
              <small className="pi-muted">0 is allowed when there are no bathrooms.</small>
            </label>
          )}

          {showOutdoor && (
            <label className="pi-subject-attr-field" data-testid="field-outdoor">
              <span>Outdoor space</span>
              <span className="pi-workspace-cause">{causeLabel('MISSING_USER_REPORTED_ATTRIBUTE')}</span>
              <select
                value={form.outdoor}
                onChange={onChange('outdoor')}
                data-testid="input-outdoor"
              >
                {OUTDOOR_OPTIONS.map((opt) => (
                  <option key={opt.value || 'unknown'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <small className="pi-muted">Unknown is not the same as confirmed none.</small>
            </label>
          )}

          {showParking && (
            <label className="pi-subject-attr-field" data-testid="field-parking">
              <span>Off-street parking spaces</span>
              <span className="pi-workspace-cause">{causeLabel('MISSING_USER_REPORTED_ATTRIBUTE')}</span>
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                value={form.offStreetParking}
                onChange={onChange('offStreetParking')}
                placeholder="Unknown"
                data-testid="input-parking"
              />
              <small className="pi-muted">Enter 0 only when you confirm there is no off-street parking.</small>
            </label>
          )}

          {showFinish && (
            <div className="pi-subject-attr-field pi-finish-quality" data-testid="field-finish-quality">
              <span>{FINISH_QUALITY_DISCLAIMER.headline}</span>
              <span className="pi-workspace-cause">{causeLabel('MISSING_PROVIDER_REQUEST_INPUT')}</span>
              <p className="pi-muted" data-testid="finish-quality-disclaimer">
                {FINISH_QUALITY_DISCLAIMER.body}
              </p>
              <select
                value={form.finishQuality}
                onChange={onChange('finishQuality')}
                data-testid="input-finish-quality"
              >
                <option value="">Select finish level…</option>
                {FINISH_QUALITY_UI_OPTIONS.map((opt) => (
                  <option key={opt.providerValue} value={opt.providerValue}>
                    {opt.userLabel}
                  </option>
                ))}
              </select>
              <small className="pi-muted">
                No default is selected. Required only for the external valuation provider request.
              </small>
            </div>
          )}

          {error && (
            <p className="pi-subject-attr-error" data-testid="subject-attr-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="pi-workspace-input-btn"
            disabled={saving}
            data-testid="subject-attr-save"
          >
            {saving ? 'Saving…' : 'Save property facts'}
          </button>
        </form>
      ) : null}

      {savedOk && (
        <div className="pi-subject-attr-result" data-testid="subject-attr-save-result">
          <p>Saved as USER_REPORTED on subject {subjectId}.</p>
          {readiness && (
            <p data-testid="subject-attr-readiness">
              Readiness: {readiness.state || 'unknown'}
              {readiness.canRequestAvm
                ? ' — provider contract complete (PROVIDER_ELIGIBLE). Re-analyse to request valuation.'
                : ` — still missing: ${(readiness.missingFields || []).join(', ') || 'inputs'}.`}
            </p>
          )}
          {!readiness && activeMissing.size > 0 && (
            <p data-testid="subject-attr-still-missing">
              Still incomplete: {[...activeMissing].join(', ')}
            </p>
          )}
          {!readiness && activeMissing.size === 0 && (
            <p data-testid="subject-attr-complete-local">
              Reported fields saved. Re-analyse to refresh provider readiness.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
