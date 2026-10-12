# V1.2 — Official Real Property Validation Cohort

**Status:** COMPLETE  
**Measured:** 2026-09-03  
**Verdict classification:** `B — SUBJECT_MODEL_TOO_LISTING_COUPLED`

## Pre-flight

- Residential Sale Evidence Activation: already completed — not repeated.
- Synthetic/demo sale listings: not reused as validation cohort.
- Architecture: `LISTING` ≠ `SUBJECT` (`IDENTITY_NON_EQUIVALENCE.listingIsNotSubject`).
- No owner listing intake required for this cohort.

## Method

Selected 8 HMLR Price Paid subjects with strongest identity (UPRN + postcode + PAON; 6 houses without SAON; 2 flats with SAON).  
EPB + canonical area + AVM readiness run on **ephemeral subject identity** (no `properties.id`, no listing fabricated).  
Historical sold price held as outcome/benchmark only (`price: null` on ephemeral object).  
Live `/valuation-sale` **not** called — production path requires listing.

## Funnel

```
8 HMLR candidates
→ 8 sufficient identity
→ 8 EPB attempted
→ 6 unique EPB
→ 6 official floor area
→ 6 canonical area
→ 6 PROVIDER_ELIGIBLE
→ 8 leakage-safe (AVM params exclude historical price)
→ 0 valuation-sale called (listing-coupled)
→ 0 ASSESSED / historical comparison
```

## Exact coupling

- `propertyEnrichmentService.js`: `fetchSaleValuation` / late fetch require `property.category === 'sale'`
- Enrichments persist by `property.id` (listing FK)
- `intelligenceController` analyse loads a `properties` row
- EPB persists only when `property.id` present

## Artefact

`server/scripts/official-real-property-validation-cohort.js`  
`server/scripts/official-real-property-validation-cohort-output.json`
