/**
 * MHCLG EPB geography gate. England and Wales only.
 * Scotland / Northern Ireland is SOURCE_OUTSIDE_GEOGRAPHY, not “no EPC”.
 * Missing postcode is GEOGRAPHY_NOT_ESTABLISHED, not inside coverage.
 */

const { compactPostcode } = require('../../identity/canonicalAddress');
const { EPB_ATTACHMENT, EPB_SOURCE_GEOGRAPHY } = require('../../../architecture/epbEvidenceContract');

const SCOTLAND = /^(AB|DD|DG|EH|FK|G|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE)\d/i;
const NI = /^BT\d/i;

function epbGeographyStatus(postcode) {
  const compact = compactPostcode(postcode);
  if (!compact) {
    return {
      inside: false,
      status: EPB_ATTACHMENT.GEOGRAPHY_NOT_ESTABLISHED,
      sourceGeography: null,
      note: 'Geography could not be established from postcode. That is not evidence the property has no EPC.',
    };
  }
  if (NI.test(compact)) {
    return {
      inside: false,
      status: EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY,
      sourceGeography: EPB_SOURCE_GEOGRAPHY,
      note: 'MHCLG EPB covers England and Wales only. Northern Ireland is source geography, not a property conclusion.',
    };
  }
  // Official statistics notes: TD15 includes properties in England.
  if (/^TD15/i.test(compact)) {
    return {
      inside: true,
      status: null,
      sourceGeography: EPB_SOURCE_GEOGRAPHY,
      note: null,
    };
  }
  if (SCOTLAND.test(compact)) {
    return {
      inside: false,
      status: EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY,
      sourceGeography: EPB_SOURCE_GEOGRAPHY,
      note: 'MHCLG EPB covers England and Wales only. This is not evidence that the property has no EPC.',
    };
  }
  return {
    inside: true,
    status: null,
    sourceGeography: EPB_SOURCE_GEOGRAPHY,
    note: null,
  };
}

function isOutsideEpbGeography(postcode) {
  return epbGeographyStatus(postcode).status === EPB_ATTACHMENT.SOURCE_OUTSIDE_GEOGRAPHY;
}

module.exports = {
  SCOTLAND,
  NI,
  isOutsideEpbGeography,
  epbGeographyStatus,
};
