/**
 * User-facing copy for Property Intelligence lookup / resolve errors.
 * Strips provider, env, and stack jargon.
 */
export function sanitizeIntelligenceError(raw, { kind = 'lookup' } = {}) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();

  if (!text) {
    return kind === 'resolve'
      ? 'We could not confirm that UK address. Try another match or a fuller address.'
      : 'UK property search failed. Try again in a moment.';
  }

  if (/insufficient.?credit|no credits|credit.?balance/i.test(text)) {
    return text;
  }

  if (/session expired|please log in|unauthori[sz]ed|authentication/i.test(text)) {
    return text.includes('log') ? text : 'Session expired. Please log in again.';
  }

  if (
    /\.env\b|api[_ ]?key|propertydata|stack trace|resolver|endpoint|econnrefused|etimedout/i.test(
      lower
    )
  ) {
    return kind === 'resolve'
      ? 'UK address confirmation is temporarily unavailable. Try again shortly.'
      : 'UK address lookup is temporarily unavailable. Try again shortly.';
  }

  return text;
}

export function selectedPropertyOriginLabel({ isExternal, relationship, source } = {}) {
  if (isExternal || relationship === 'external_lookup' || relationship === 'external_linked_listing') {
    return 'UK address match';
  }
  if (relationship === 'owner' || source === 'my_listing') {
    return 'Listing evidence available';
  }
  return 'Listing evidence available';
}

/** Secondary relationship hint — never the primary property identity. */
export function selectedPropertyRelationshipHint({ relationship, source } = {}) {
  if (relationship === 'owner' || source === 'my_listing') {
    return 'You manage a listing for this property';
  }
  if (relationship === 'external_linked_listing') {
    return 'Also linked to a platform listing';
  }
  return null;
}

export function displaySelectedAddress(preview) {
  if (!preview) return '';
  return (
    preview.address_display
    || preview.title
    || [preview.address_line1, preview.city, preview.postcode].filter(Boolean).join(', ')
    || 'Selected property'
  );
}

/** Picker-row evidence chip: property match first, listing only as evidence. */
export function platformMatchEvidenceLabel(property) {
  if (!property) return 'Property match';
  if (
    property.matchMethod === 'postcode'
    || property.matchMethod === 'postcode_area'
    || property.matchMethod === 'postcode_address'
  ) {
    return 'Same postcode listing · not an exact address match';
  }
  return 'Property match · listing evidence';
}

export function externalMatchEvidenceLabel(match) {
  if (match?.kind === 'shell') return 'Building / shell';
  if (match?.kind === 'unit') return 'UK address / unit match';
  return 'UK address match';
}

export function discoveryPrimaryLine(match) {
  const secondary = String(match?.addressParts?.secondary || match?.secondary || '').trim();
  if (secondary) return secondary;
  return match?.address || '';
}

export function discoveryBuildingLine(match) {
  const parts = match?.addressParts || {};
  const primary = String(parts.primary || match?.primary || '').trim();
  const street = String(parts.street || match?.street || '').trim();
  const building = [primary, street].filter(Boolean).join(' ');
  const postcode = String(parts.postcode || match?.postcode || '').trim();
  if (match?.kind === 'shell') {
    return [building || match.address, postcode].filter(Boolean).join(', ');
  }
  if (String(match?.addressParts?.secondary || match?.secondary || '').trim() && building) {
    return [building, postcode].filter(Boolean).join(', ');
  }
  return postcode;
}

export function isShellDiscoveryRow(match) {
  return match?.kind === 'shell';
}
