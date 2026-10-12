# V1.2 — Subject-Native Valuation Execution

**Status:** PARTIAL — live provider proof incomplete  
**Measured:** 2026-09-03  
**Classification:** `C — PROVIDER_RESPONSE_IS_BLOCKER`

## Coupling (pre-change)

Listing category `sale` and `properties.id` gated AVM fetch, valuation engine, and listing FK persistence. Subject persistence (`intelligence_subjects` + `property_enrichments.subject_id`) already existed.

## Minimal change

- `subjectNativeSaleValuation.js` — subject-native contract, leakage firewall, execute + persist on `subject_id`
- Strip fabricated `category: 'sale'` and `last_sold_price → price` in `externalPropertyLookupService`
- Valuation engine allows subject-native without asking price
- Listing AVM path unchanged (`category === 'sale'` AND `property.id`)

## Live funnel (max 3)

6 eligible HMLR subjects re-verified → 3 live `/valuation-sale` calls → 0 provider responses (`PROVIDER_TEMPORARILY_UNAVAILABLE`) → 0 ASSESSED.

Params leakage-safe: `postcode`, `internal_area`, `output`, `property_type` only. No listing rows created.

## Tests

Focused subject-native tests passed. Affected suites passed. Full client 20/20 162/162. Production build passed. Full server 87/88; `mhclgEpb.test.js` assertions passed then known Windows `UV_HANDLE_CLOSING` flake.
