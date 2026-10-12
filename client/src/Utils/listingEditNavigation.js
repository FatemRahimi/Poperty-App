/**
 * Navigate to listing edit flows from Property Intelligence.
 */

export function listingEditRoute(property = {}, returnPath = '/ai-services/property-intelligence') {
  const id = property?.id ?? property?.listingId ?? null;
  if (!id) return null;
  const category = String(property?.category || 'sale').toLowerCase();
  const path = category === 'rent' ? '/addrent' : category === 'lease' ? '/addlease' : '/addlist';
  return {
    path,
    state: {
      editMode: true,
      propertyId: id,
      propertyData: { ...property, id },
      returnPath,
    },
  };
}

export function canEditListingFromReport(report = {}) {
  const id = report?.property?.id ?? report?.inputSnapshot?.listingId ?? null;
  return Boolean(id);
}
