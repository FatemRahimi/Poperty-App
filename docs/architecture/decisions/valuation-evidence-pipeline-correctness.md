# Valuation Evidence Pipeline Correctness (V1.2)

**Implemented:** 2026-09-02  
**Verdict:** `VALUATION EVIDENCE PIPELINE CORRECTNESS PASSED — READY_FOR_NEXT_CAPABILITY_REVIEW`

## What was fixed

### Defect A — `property_enrichments` persistence

**Reproduced on property 149:** PropertyData `/sold-prices` returned cache hit; `upsertEnrichment` failed with PostgreSQL error `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

**Root cause:** Migration 013 replaced table `UNIQUE(property_id, enrichment_type, source)` with partial unique index `idx_property_enrichments_listing ON (property_id, enrichment_type, source) WHERE property_id IS NOT NULL`, but upsert still used bare `ON CONFLICT (property_id, enrichment_type, source)`.

**Fix:** `ON CONFLICT (property_id, enrichment_type, source) WHERE (property_id IS NOT NULL) DO UPDATE …` in `propertyIdentityRepository.upsertEnrichment`.

**Evidence returned behaviour:** Primary fix is persistence. Unpersisted in-memory continuation was **not** added — canonical store requires successful persist for reuse across analyses; failed persist remains an error in `enrichPropertyForIntelligence.errors`.

### Defect B — Property type canonicalisation

**Reproduced on property 155:** `property_type` stored as `{"semi-detached","semi-detached"}` failed `mapToPropertyDataType`.

**Fix:** Shared `canonicalPropertyTypeToken` in `server/utils/canonicalPropertyType.js`; used by `propertyTypeMapping` and `valuationEligibility`.

### Internal area readiness

`buildValuationSaleRequest` and `PropertyDataAdapter.getSaleValuation` now expose structured readiness:

| reasonCode | Meaning |
| --- | --- |
| `MISSING_INTERNAL_AREA` | AVM not called — no floor area ≥ 300 sqft |
| `UNMAPPED_PROPERTY_TYPE` | AVM not called — type not in PropertyData contract |
| `MISSING_POSTCODE` | AVM not called — no postcode |
| `PROVIDER_ELIGIBLE` | Preconditions met; provider may be called |

## What was not changed

- Valuation methodology, weights, assessment safety, eligibility, blend rules
- HMLR, internal comparables, finance, PD/DI, asset classification
- No new providers; no EPB re-acquisition

## After-fix measurement (bounded sample n=6)

| Metric | Before (readiness study) | After |
| --- | ---: | ---: |
| `property_enrichments` rows (inventory) | 0 | 30 |
| Provider RETURNED → PERSISTED (sample) | 0% | 100% |
| Valuation components created (sale sample) | 0/5 | 5/5 (`sold_prices_statistics`) |
| Valuation ASSESSED | 0 | 0 (correct) |

## Remaining gaps (post-fix)

| Class | Example |
| --- | --- |
| `MISSING_INTERNAL_AREA` | Properties 149, 155, 123, 148 — no `square_feet` |
| `UNMAPPED_PROPERTY_TYPE` | Property 147 — park-home |
| `INSUFFICIENT_PROPERTY_SPECIFIC_EVIDENCE` | Area stats only; no AVM/UPRN estimate |
| `CORRECT_SAFETY_REJECTION` | `insufficient_eligible_evidence` on all sale samples |

## Tests

- `server/tests/valuationEvidencePipeline.test.js` — persistence, type matrix, £232 regression, cross-property scope
- Full server: **84/84**; client: **161/161**; production build OK

## Scripts

- `server/scripts/valuation-pipeline-before-after.js` — bounded runtime validation

## Recommended next capability

**Listing attribute / internal area readiness** — capture or attach provenanced floor area (and complete residential property_type at listing) without EPB re-acquisition or methodology change.
