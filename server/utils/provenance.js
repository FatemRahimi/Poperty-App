/**
 * Provenance metadata for evidence-backed property intelligence.
 * Every important calculated or retrieved value should carry source attribution.
 */

function createProvenance({
  source,
  method,
  observedAt = null,
  retrievedAt = new Date(),
  confidence = null,
  providerEndpoint = null,
  notes = null,
}) {
  return {
    source,
    method,
    observedAt: observedAt ? new Date(observedAt).toISOString() : null,
    retrievedAt: retrievedAt instanceof Date ? retrievedAt.toISOString() : retrievedAt,
    confidence,
    providerEndpoint,
    notes,
  };
}

function wrapValue(value, provenance) {
  return {
    value,
    provenance: createProvenance(provenance),
  };
}

function mergeSources(...sources) {
  return [...new Set(sources.filter(Boolean))];
}

function formatSourceLabel(source) {
  const labels = {
    PropertyData: 'PropertyData',
    HM_Land_Registry: 'HM Land Registry',
    InternalListing: 'Internal listing data',
    ApplicationDatabase: 'Application database',
    Sprift: 'Sprift',
    Hometrack: 'Hometrack',
    MHCLG_EPC: 'EPC (MHCLG)',
    EnvironmentAgency: 'Environment Agency',
    EnvironmentAgency_FloodMapForPlanning: 'Environment Agency Flood Map for Planning',
    MHCLG_PlanningData: 'MHCLG Planning Data',
    MHCLG_PlanningData_EducationalEstablishment: 'DfE GIAS via MHCLG Planning Data',
    MHCLG_PlanningData_ListedBuilding: 'Historic England NHLE via MHCLG Planning Data',
    MHCLG_PlanningData_ConservationArea: 'Conservation areas via MHCLG Planning Data',
    MHCLG_PlanningData_Article4DirectionArea: 'Article 4 direction areas via MHCLG Planning Data',
  };
  return labels[source] || source;
}

module.exports = {
  createProvenance,
  wrapValue,
  mergeSources,
  formatSourceLabel,
};
