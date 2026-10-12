# Decision: BUY/SELL MARKET_CONTEXT presentation integrity closure

**Status:** IMPLEMENTED  
**Date:** 2026-09-08  
**Phase:** V1.2 small product-truth / safety fix (no new capability)

Closes the **POTENTIALLY_MISLEADING** MARKET_CONTEXT presentation finding from `post-comparable-buy-sell-pack-validation.md`.

Comparable Assessment **v1.1 methodology is unchanged**.

---

## Root issue

MARKET_CONTEXT local sold £ ranges occupied **Key Intelligence** with `available: true` → `pi-metric-tile--assessed` styling, visually too similar to assessed comparable / assessed intelligence despite comparable sufficiency not being met.

## Correction (smallest truthful UX)

| State | Key Intelligence | Supporting evidence |
| --- | --- | --- |
| ASSESSED | **Comparable sold evidence** (unchanged; assessed styling + HIGH-only £) | No local-context demotion |
| MARKET_CONTEXT | **Comparable sold evidence** unavailable / `INSUFFICIENT_EVIDENCE` (no £ in key) | **Local sold transaction context** with dashed context styling + explicit disclaimer |

Disclaimer: orientation only — not comparable sold evidence, not subject value, not asking-price judgement.

BUY and SELL both use this split. LET_INVEST key spine unchanged (no comparable sold tile).

## Non-goals

No valuation, DI, asking analysis, scoring, comparable methodology, or wedge expansion. BUY/SELL remain PARTIAL. LET remains primary wedge.

## Verdict

**MARKET_CONTEXT PRESENTATION INTEGRITY PASSED — BUY/SELL SAFELY PARKED**
