/**
 * Thin UI translation for PropertyData finish_quality (provider-request only).
 * Mapping is one-to-one with the provider enum. No default. No inference.
 */

export const PROVIDER_FINISH_ENUMS = Object.freeze([
  'very_high',
  'high',
  'average',
  'below_average',
  'unmodernised',
]);

export const FINISH_QUALITY_UI_OPTIONS = Object.freeze([
  {
    providerValue: 'very_high',
    userLabel: 'Very high finish',
    help: 'Extensively modernised or premium specification — your impression only.',
  },
  {
    providerValue: 'high',
    userLabel: 'High finish',
    help: 'Clearly updated / well modernised — your impression only.',
  },
  {
    providerValue: 'average',
    userLabel: 'Average finish',
    help: 'Typical modernisation for similar homes — your impression only.',
  },
  {
    providerValue: 'below_average',
    userLabel: 'Below-average finish',
    help: 'Dated or worn relative to similar homes — your impression only.',
  },
  {
    providerValue: 'unmodernised',
    userLabel: 'Unmodernised',
    help: 'Little or no updating — your impression only.',
  },
]);

export const FINISH_QUALITY_DISCLAIMER = Object.freeze({
  headline: 'User-reported property finish / modernisation level',
  body:
    'This is not an official survey, building-condition assessment, or platform-derived fact. '
    + 'It is a subjective rating you supply so an external sale valuation request can be completed. '
    + 'It is never inferred from the EPC, photos, listing text, price, or construction age.',
  provenance: 'USER_REPORTED',
  canonical: false,
  providerRequestOnly: true,
});

export function mapUiSelectionToProviderEnum(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, reason: 'absent' };
  }
  const text = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!PROVIDER_FINISH_ENUMS.includes(text)) {
    return { ok: false, reason: 'unrecognised_finish_quality' };
  }
  return { ok: true, value: text };
}
