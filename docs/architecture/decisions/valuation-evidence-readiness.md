# Valuation Evidence Readiness Study (V1.2)

**Measured:** 2026-09-01  
**Inventory:** 86 persisted properties (real DB, no fabrication)  
**Verdict:** `VALUATION EVIDENCE READINESS PARTIAL — MORE_EVIDENCE_REQUIRED`

## Primary finding

Defensible property-specific residential sale valuation fails to **ASSESS** on current inventory because of a **stacked failure chain**, not a single missing provider:

1. **Pipeline defect:** PropertyData responses often succeed at the provider layer but are **discarded** before reaching `calculatePropertyValuation` because `property_enrichments` upsert fails (`ON CONFLICT` does not match partial unique index `idx_property_enrichments_listing`). Zero rows persisted; runtime enrichments object empty after failed persist.
2. **Input / identity gaps:** Sale AVM (`/valuation-sale`) is **skipped** when `property_type` cannot be mapped (PostgreSQL array strings like `{"semi-detached","semi-detached"}` are not tokenised) or when `internal_area` &lt; 300 sqft is missing from listing facts.
3. **Methodology (correct):** Postcode **area** sold-price statistics and `sqft_implied` are parsed when injected in-memory but **cannot assess alone** (`canAssessAlone: false`; single `TRANSACTION_STATISTICS` family). Assessment safety correctly requires a **property-specific independent** method (`valuation_sale_avm` or `uprn_profile`) or corroboration across independent families.
4. **HMLR:** ~31.5m ledger loaded; **0/24** sale listings with price achieve exact subject transaction match; **14/24** have area-only context. Official transactions are **not** promoted to valuation components (by design).
5. **Internal comparables:** Asking listings only; correctly **cannot solely assess** (`ASKING_NOT_TRANSACTION`).

## Measured funnel (sale listings with price, n=24)

| Stage | Count | % of sale+price |
| --- | ---: | ---: |
| Sale-compatible with asking price | 24 | 100 |
| Postcode present (all inventory) | 84/86 | 97.7 |
| PAON present | 79/86 | 91.9 |
| SAON on unit-like (n=21) | 0 | 0 |
| UPRN | 2/86 | 2.3 |
| HMLR exact subject match | 0/24 | 0 |
| HMLR area context only | 14/24 | 58.3 |
| `property_enrichments` cache row | 0 | 0 |
| Valuation ASSESSED (cache-only replay) | 0 | 0 |
| Valuation ASSESSED (live analyse, bounded sample) | 0/5 | 0 |

## PropertyData runtime audit (bounded live trace)

| Endpoint | Provider call | Reaches valuation component | Typical blocker |
| --- | --- | --- | --- |
| `valuation-sale` | Attempted on sale listings | **No** | Unmapped `property_type`; missing `internal_area` |
| `sold-prices` | **Returned** (cache hit) | **No** (persist failure) | Upsert `ON CONFLICT` mismatch; even if present, area-only |
| `sold-prices-per-sqf` | **Returned** (cache hit) | **No** (persist failure + often no floor area) | Same persist bug; `sqft_implied` needs provenanced area |
| `uprn` | Attempted when UPRN present | **No** (persist failure) | Same persist bug |

**Hypothesis test (in-memory, property 149):** With `sold_prices` + `sold_prices_per_sqf` + `square_feet=650`, components parse (`sold_prices_statistics`, `sqft_implied`) but assessment remains `insufficient_eligible_evidence` — **methodology-correct**.

## Historical £232 regression (property 155)

Saved `ai_requests` 24, 25, 30 show `centralEstimate: 232` via `weighted_evidence_blend` / low confidence — driven by internal asking comparable on property 123 (£232). Current engine: **NOT_ASSESSED**; `insufficient_eligible_evidence` / `insufficient_valid_components`. Safety regression **passing**.

## Data source decision gate

**E. MIXED**

- **~40% fixable pipeline:** enrichment persistence + attach returned provider payload even when DB write fails.
- **~35% identity/attribute:** canonical `property_type`, floor area, SAON for units.
- **~25% methodology/source limitation:** area statistics and HMLR area context cannot become property-specific assessed valuation under current safety rules (intentional).

## Recommended next capability (do not implement in this phase)

**Valuation evidence pipeline correctness** — fix `property_enrichments` upsert conflict target; ensure successful provider responses reach the valuation engine; canonicalise listing `property_type` before PropertyData AVM calls; surface missing `internal_area` as structured readiness gap (not EPB re-acquisition in this track).

## Pipeline correctness follow-up (2026-09-02)

Implemented in V1.2 valuation evidence pipeline correctness phase:

- **Persistence fix:** `upsertEnrichment` now uses `ON CONFLICT … WHERE (property_id IS NOT NULL)` matching partial unique index `idx_property_enrichments_listing`.
- **Property type:** shared `canonicalPropertyTypeToken` in `server/utils/canonicalPropertyType.js`; PG array strings like `{"semi-detached","semi-detached"}` map correctly for AVM readiness.
- **AVM readiness:** `buildValuationSaleRequest` exposes `readiness.state` / `reasonCode` (`MISSING_INTERNAL_AREA`, `UNMAPPED_PROPERTY_TYPE`, etc.).

**After fix (bounded sample n=6):** 30 `property_enrichments` rows persisted; 5/5 sale samples create `sold_prices_statistics` components; **0/6** valuation ASSESSED (methodology-correct — area stats alone insufficient).

**Remaining blockers:** missing `internal_area` on listings (5/5 sale samples); unmapped types (e.g. park-home); no property-specific AVM/UPRN estimate reaching eligible independent method on sample.

## Scripts

- `server/scripts/valuation-evidence-readiness-study.js` — inventory funnel + bounded sample trace (cache-only)
- `server/scripts/valuation-evidence-live-trace.js` — bounded live analyse (5 properties max)

## Tests

Focused valuation suites passed (2026-09-01): `valuationAssessmentSafety`, `valuationEligibility`, `valuationIntegrity` — 52 assertions, 0 failures. No code changes in this phase.
