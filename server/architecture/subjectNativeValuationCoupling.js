/**
 * Coupling map — V1.2 SUBJECT-NATIVE VALUATION EXECUTION (pre-implementation).
 *
 * LISTING ≠ SUBJECT (frozen). Official HMLR cohort proved 6/8 PROVIDER_ELIGIBLE
 * without listings; production execution still listing-coupled.
 */

/**
 * Dependency classifications:
 * A genuinely listing-specific
 * B subject/property-specific but carried through listing
 * C persistence-only coupling
 * D UX/controller coupling
 * E historical compatibility
 */

const COUPLING_MAP = Object.freeze([
  {
    locus: 'propertyEnrichmentService.fetchSaleValuation',
    gate: "property.category === 'sale'",
    class: 'B',
    note: 'Market valuation eligibility masquerades as listing category.',
  },
  {
    locus: 'propertyEnrichmentService.fetchSaleValuationIfEligible',
    gate: "property.category !== 'sale' → skip",
    class: 'B',
    note: 'Same listing-category gate on late AVM fetch.',
  },
  {
    locus: 'propertyEnrichmentService.fetchAndPersistEnrichment',
    gate: 'property.id required for cache/persist',
    class: 'C',
    note: 'Listing FK. Subject path already has subject_id via intelligenceSubjectRepository.',
  },
  {
    locus: 'valuationEngine.calculatePropertyValuation',
    gate: "category !== 'sale' && no askingPrice → refuse",
    class: 'B',
    note: 'Blocks subject-native valuation even when AVM evidence exists.',
  },
  {
    locus: 'propertyIntelligenceEngine assemble',
    gate: "late fetch + saleValuation require category === 'sale' || price > 0",
    class: 'B',
    note: 'Engine will not run sale valuation for pure subjects.',
  },
  {
    locus: 'intelligenceController analyse',
    gate: 'loads properties row by propertyId',
    class: 'D',
    note: 'Subject analyse already exists via subjectId routes — keep; do not invent public endpoint.',
  },
  {
    locus: 'mhclgEpbAcquisition persist',
    gate: 'property.id required to persist certificates/UPRN',
    class: 'C',
    note: 'EPB search works without id; persist is listing/subject-bound separately.',
  },
  {
    locus: 'externalPropertyLookupService.subjectToSyntheticProperty',
    gate: "sets category:'sale'; seeds price from last_sold_price",
    class: 'B',
    note: 'Fabricates listing category; TEMPORAL LEAKAGE of outcome into asking price.',
  },
  {
    locus: 'intelligence_subjects + property_enrichments.subject_id',
    gate: 'existing subject persistence',
    class: 'E',
    note: 'REUSE — no schema redesign required.',
  },
]);

module.exports = { COUPLING_MAP };
