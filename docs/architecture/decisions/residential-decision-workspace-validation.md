# Decision: Residential decision workspace — real product validation

**Status:** VALIDATION COMPLETE  
**Date:** 2026-09-01  
**Measured against:** 86-property local inventory, live `assemblePropertyIntelligenceReport` runtime

## Primary finding

The Decision Workspace **routes and presents correctly**, but on real inventory **Key Intelligence is usually empty** because **defensible residential valuation does not assess** (assessment-safety: no eligible property-specific method). That blocks price position and collapses BUY/SELL usefulness.

LET_INVEST delivers **partial** value: area rent → gross yield, DI V1 unresolved priorities — not a full underwriting pack without user finance inputs.

## Inventory truth (persisted)

| Measure | Count |
| --- | --- |
| Properties | 86 |
| UPRN | 2 |
| SAON | 0 |
| EPB (current cert) | 2 properties |
| Saved PI analyses | 19 (pre-workspace; no `decisionJob` stored) |

## Runtime sample

Bounded roles: strongest house (63, UPRN+EPB, rent-only), weaker (41), unit-like sale (149), supplement sale+EPB (147), terraced sales (148, 150, 153).

## Actionable assessment coverage (typical real property)

| Job | Usually ASSESSED | Usually NOT_ASSESSED |
| --- | --- | --- |
| BUY | Planning (when geocoded) | Valuation, price position, buyer_general |
| LET_INVEST | Gross yield (price + area rent), DI priorities | Valuation, NOI, cash flow, DSCR, landlord PD |
| SELL | Planning (sometimes) | Valuation, price position (entire spine) |

## Single bottleneck

**Property-specific valuation evidence not meeting assessment-safety eligibility** on inventory → empty Key Intelligence spine.

## Recommended next capability (not implemented here)

**LET_INVEST underwriting input completion** — progressive finance/opex/vacancy capture wired from workspace unresolved items to unlock NOI, cash flow, DSCR and landlord PD dimensions **without** changing frozen formulas.

Why not bounded EPB re-acquisition now: EPB already attaches on 2 properties at runtime but does not surface in `propertyFacts`/workspace context; identity coverage 2/86; EPB does not unlock valuation.

## Scripts

- `server/scripts/validate-decision-workspace-runtime.js`
- `server/scripts/validate-decision-workspace-supplement.js`
