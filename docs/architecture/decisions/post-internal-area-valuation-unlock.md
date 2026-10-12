# Post-internal-area valuation unlock validation (V1.2)

**Measured:** 2026-09-03  
**Verdict:** `POST-INTERNAL-AREA VALUATION VALIDATION PASSED — NEXT_CAPABILITY_IDENTIFIED`

## Finding

Internal-area *capability* (resolver, listing capture, workspace CTA) is complete, but **0/24** sale listings with price are `PROVIDER_ELIGIBLE` on current persisted inventory.

Dominant blocker: **MISSING_INTERNAL_AREA** (17/24). Secondary: **UNMAPPED_PROPERTY_TYPE** (6/24). One **INVALID_INTERNAL_AREA** (133).

Only canonical unlock to `PROVIDER_ELIGIBLE` in inventory is rent property **63** (EPB area) — sale AVM is not requested for non-sale categories.

Prior persisted loop on sale **155** (temporary test area, restored): `PROVIDER_ELIGIBLE` → `/valuation-sale` failed/absent → `sold_prices_statistics` + `sqft_implied` only → correct **NOT_ASSESSED** (`insufficient_eligible_evidence`).

## Source decision

**D — INSUFFICIENT SAMPLE** for proving live `/valuation-sale` usefulness on sale subjects (zero sale-eligible now). Bounded temporary evidence on 155 suggests provider path remains weak even when eligible.

## Recommended next capability (not implemented)

**Inventory quality improvement** — get legitimate first-party (or EPB) internal area onto sale listings using existing capture/workspace flows; optionally correct unmapped types / invalid areas.

Script: `server/scripts/post-internal-area-valuation-unlock-validation.js`
