# Property Attribute Evidence Readiness — Provenanced Internal Area (V1.2)

**Implemented:** 2026-09-02  
**Verdict:** See phase final report.

## Problem

PropertyData `/valuation-sale` requires property-specific `internal_area` ≥ 300 sqft. After pipeline correctness, enrichments persisted but **5/5** bounded sale samples remained blocked by `MISSING_INTERNAL_AREA`. Area sold-price statistics alone cannot ASSESS under frozen methodology.

## Canonical contract

`server/architecture/canonicalInternalArea.js` — version `canonical-internal-area-1.0.0`.

One shared Property Intelligence Kernel attribute with:

- raw value / raw unit
- normalised sqft
- source + provenance
- readiness states (`MISSING_INTERNAL_AREA`, `INVALID_INTERNAL_AREA`, `AMBIGUOUS_INTERNAL_AREA`, `IDENTITY_MISMATCH`, `PROVIDER_ELIGIBLE`)

## Source hierarchy (deterministic)

Matches `propertyFacts` `SOURCE_PRECEDENCE.floorArea`:

1. **MHCLG_EPBD** — persisted `UNIQUE_ATTACH` domestic `totalFloorAreaSqm` only; no re-acquisition
2. **InternalListing** — `square_feet` / `floor_area` + unit
3. **PropertyData_uprn** — UPRN profile `internalArea` (sqft)
4. **USER_DECLARED** — optional analyse request observation only; server validates value + unit

**Not canonical:** derived/LLM guesses, postcode averages, plot area, building area for units without SAON.

Conflicts ≥15% preserved; higher-precedence source selected; never averaged.

## Resolution wiring

- `server/services/identity/internalAreaResolution.js` — collect, select, apply
- `propertyEnrichmentService` — resolve persisted EPB before bounded `/valuation-sale`
- `propertyIntelligenceEngine` — resolve after live EPB; late fetch when newly AVM-eligible
- `buildValuationSaleRequest` — surfaces resolution reason codes when area ineligible

## User-declared area

Optional `declaredInternalArea: { value, unit }` on analyse request. Client cannot inject readiness, provenance authority, or assessment state.

## Frozen boundaries

- No EPB re-acquisition / fuzzy flat matching
- No 300 sqft fabrication or coercion
- No valuation methodology / safety changes
- No HMLR area wiring
- Historical snapshots immutable

## Tests

`server/tests/canonicalInternalArea.test.js` — contract, conversion, conflicts, EPB unit withholding, user declaration, AVM readiness.

Bounded validation: `server/scripts/internal-area-readiness-validation.js`.
