/**
 * PropertyData finish_quality — provider-request input only.
 * NOT a canonical platform condition fact.
 * NOT Building Condition intelligence.
 *
 * UI labels are thin honest translations; mapping to provider enum is 1:1.
 */

const PROVIDER_FINISH_ENUMS = Object.freeze([
  'very_high',
  'high',
  'average',
  'below_average',
  'unmodernised',
]);

/** One-to-one UI option → provider enum. No defaults. No inference. */
const FINISH_QUALITY_UI_OPTIONS = Object.freeze([
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

const FINISH_QUALITY_DISCLAIMER = Object.freeze({
  headline: 'User-reported property finish / modernisation level',
  body:
    'This is not an official survey, building-condition assessment, or platform-derived fact. '
    + 'It is a subjective rating you supply so an external sale valuation request can be completed. '
    + 'It is never inferred from the EPC, photos, listing text, price, or construction age.',
  provenance: 'USER_REPORTED',
  canonical: false,
  providerRequestOnly: true,
});

function mapUiSelectionToProviderEnum(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, reason: 'absent' };
  }
  const text = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!PROVIDER_FINISH_ENUMS.includes(text)) {
    return { ok: false, reason: 'unrecognised_finish_quality' };
  }
  return { ok: true, value: text };
}

module.exports = {
  PROVIDER_FINISH_ENUMS,
  FINISH_QUALITY_UI_OPTIONS,
  FINISH_QUALITY_DISCLAIMER,
  mapUiSelectionToProviderEnum,
};
