# Listing Internal Area Capture (V1.2)

**Implemented:** 2026-09-02

## Scope

First-party **internal floor area + unit** capture on property create/edit (AddList, AddRent). Uses existing `canonicalInternalArea` and `resolveCanonicalInternalArea()` — no duplicate resolver.

## Input contract

| Field | Required | Notes |
| --- | --- | --- |
| `floor_area` / `floorArea` | When supplying area | Positive finite number |
| `floor_area_unit` / `floorAreaUnit` | When supplying area | `sq_ft` or `sq_m` only |
| `clearInternalArea` | Edit only | Clears all area fields |

Client must **not** send provenance, readiness, or authority fields.

## Persistence

| Column | Role |
| --- | --- |
| `floor_area` | Raw user observation |
| `floor_area_unit` | Raw unit (`sq_ft` / `sq_m`) |
| `square_feet` | Normalised sqft (deterministic conversion) |

Provenance: **InternalListing** / first-party via `listing_capture` method.

## Distinction from USER_DECLARED

Analyse-time `declaredInternalArea` remains request-scoped with **USER_DECLARED** provenance. Listing capture is persistent **InternalListing** evidence.

## Source precedence (unchanged)

MHCLG_EPBD → InternalListing → PropertyData_uprn → USER_DECLARED

## AVM readiness

Listing capture can move a property from `MISSING_INTERNAL_AREA` to `PROVIDER_ELIGIBLE` when type/postcode also satisfy existing gates. Sub-300 sqft values are **preserved** but remain provider-ineligible. `PROVIDER_ELIGIBLE` ≠ valuation ASSESSED.

## Tests

`server/tests/listingInternalAreaCapture.test.js`

Bounded validation: `server/scripts/listing-internal-area-capture-validation.js`
