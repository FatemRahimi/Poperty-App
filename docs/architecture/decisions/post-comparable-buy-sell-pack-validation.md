# Decision: Post-Comparable BUY/SELL Decision Pack Real-Product Validation

**Status:** VALIDATION COMPLETE  
**Date:** 2026-09-08  
**Phase:** V1.2 product validation (no new intelligence capability)

This validates whether current BUY/SELL decision packs deliver genuine product value after Official HMLR Comparable Assessment **v1.1**. It does **not** redesign comparable methodology, implement valuation, or build Decision Intelligence V2.

Evidence artifact: `server/scripts/validate-post-comparable-buy-sell-packs-output.json`  
Harness: `server/scripts/validate-post-comparable-buy-sell-packs.js` (local HMLR store + workspace adapter; **0 paid provider calls**).

---

## Pre-flight (accepted, not re-litigated)

- Workspace jobs: BUY / LET_INVEST / SELL  
- Comparable v1.1 closed: **2/6 ASSESSED**, **4/6 MARKET_CONTEXT**, **0** false ASSESSED  
- Comparable ≠ valuation; AVM parked / CONDITIONAL_FIT  
- Valuation / PD / finance / What-if frozen  

---

## Cohort definition (operating-model legitimacy)

| Class | Subjects | Suitable for |
| --- | --- | --- |
| **A SOLD-CONTEXT-ONLY** | Same 6 genuine HMLR PPD txs | Comparable state + BUY/SELL tile wording / hierarchy. **No** live asking price — not fabricated. |
| **B ACTUAL BUY/SELL PACK** | 6 persisted listings with `price > 0` + postcode (from 24/86 inventory with sale asking) | Asking present as listing fact + local HMLR sold assessment + workspace pack. No portal scrape; no invented beds/baths/prefs. |

These are **not** the same. Class A proves sold-context intelligence. Class B tests the listing product path with legitimate asks.

Paid PropertyData assemble was **not** used (violates no-paid-API validation boundary). Valuation intentionally **not invoked** → truthful NOT_ASSESSED for value/price-position when AVM is parked.

---

## ASSESSED examples (Class A)

| Postcode | Tile label | State | Value (HIGH-only) | Valuation | Price position |
| --- | --- | --- | --- | --- | --- |
| DL17 0HX | Comparable sold evidence | ASSESSED | £50k–£125k (median £65.5k) | NOT_ASSESSED | NOT_ASSESSED |
| TN4 9QY | Comparable sold evidence | ASSESSED | £510k–£740k (median £570k) | NOT_ASSESSED | NOT_ASSESSED |

**Does the pack communicate what is known?** Yes — defensible same-postcode HIGH set, explicitly not valuation.  
**Does it close a BUY/SELL decision?** No — asking reasonableness and subject worth remain NOT_ASSESSED; next actions restate valuation/fit gaps.

---

## MARKET_CONTEXT examples (Class A)

| Postcode | Tile label | State | Available | Local range | Comp range |
| --- | --- | --- | --- | --- | --- |
| LU3 1SW | Local sold transaction context | INSUFFICIENT_EVIDENCE | **true** | £310k–£1.0m (n=120) | null |
| PE1 2LY | Local sold transaction context | INSUFFICIENT_EVIDENCE | **true** | £81.5k–£540k | null |
| LE5 4LW | Local sold transaction context | INSUFFICIENT_EVIDENCE | **true** | £66k–£425k | null |
| BD15 7RZ | Local sold transaction context | INSUFFICIENT_EVIDENCE | **true** | £69.5k–£335k | null |

Wording is honest (“market context — not defensible comparable”).  
**Prominence problem:** `available=true` → UI `pi-metric-tile--assessed` + large £ figure in **Key intelligence**, while badge is insufficient-for-comparable. High misread risk as comps/value.

### MARKET_CONTEXT value classification (exact one)

**D) POTENTIALLY_MISLEADING**

Useful as supporting orientation; **too strong in key-intelligence prime space** given district-wide ranges and dual available/insufficient signals.

---

## Class B listing packs (asking present)

Inventory: **86** properties; **24** with sale asking; sample **6** listing IDs `123,127,128,129,130,131`.

Observed comparable states on sample: mostly **INSUFFICIENT_EVIDENCE** / **NOT_APPLICABLE** — **0 ASSESSED**, **0 MARKET_CONTEXT** in this listing sample.

| Finding | Detail |
| --- | --- |
| Asking present | Yes (persisted); includes anomalous tiny asks (£232/£234/£243) and extreme (£24m) — treated as listing facts, not cleaned |
| Valuation / price position | NOT_ASSESSED (correct without methodology) |
| Sold tile | Often unavailable — listing path does not reliably reproduce Class A sold-context richness |
| Forbidden under/overpriced conclusions | **Not emitted** as product judgements. Harness regex false-positived on limitation text (“not a … fair value, recommended offer”) |

---

## BUY pack findings

| Question | Answer |
| --- | --- |
| A. Useful decision supported? | Orientation on **sold market / comps when ASSESSED**; investigation list for valuation/fit. Not a buy decision. |
| B. Incorrect inferences? | Treat MARKET_CONTEXT range as comps or “fair value”; treat ASSESSED median as subject worth; mentally subtract ask−median. |
| C. MARKET_CONTEXT useful or noise? | Supporting context; **misleading as key intelligence**. |
| D. Distinguishes context / comps / value / ask reasonableness? | **Partial** — labels try; hierarchy + available styling undercut the distinction. |
| E. NOT_ASSESSED quality? | WHY / howToResolve present for valuation & price position; MARKET_CONTEXT also carries unresolved HIGH-floor guidance. |

**Rubric (BUY):** SAVE_TIME MEDIUM · AVOID_MISTAKES MEDIUM · OPPORTUNITIES LOW · CLARITY MEDIUM · MISREAD **HIGH** · ACTIONABILITY **LOW**

---

## SELL pack findings

Same sold tiles as BUY; no seller PD/DI. With valuation + asking position NOT_ASSESSED, sold context alone is **market orientation**, not enough to justify SELL as a strong decision product (no asking strategy).

**Rubric (SELL):** SAVE_TIME MEDIUM · AVOID_MISTAKES MEDIUM · OPPORTUNITIES LOW · CLARITY MEDIUM · MISREAD **HIGH** · ACTIONABILITY **LOW**

---

## Asking-price boundary

- Legitimate asking evidence **exists** on inventory (24/86).  
- Pack correctly keeps price position NOT_ASSESSED without valuation.  
- **No** authorised underpriced / overpriced / recommended ask/offer conclusion observed on tiles.  
- Arithmetic ask−localMedian can be computed offline; product must not (and currently does not) promote it to intelligence.

---

## Information hierarchy

Target: PROPERTY → JOB → KEY INTELLIGENCE → UNRESOLVED → NEXT ACTION → SUPPORTING EVIDENCE

| Issue | Observation |
| --- | --- |
| Evidence as intelligence | MARKET_CONTEXT £ ranges occupy key tiles |
| Weak intelligence in prime space | Valuation/price position empty tiles dominate next to sold context |
| Uncertainty | Comparable insufficiency badge competes with “assessed” tile styling when `available=true` |
| Next actions | Mostly restatements of NOT_ASSESSED valuation/fit — little BUY/SELL-specific synthesis |
| Duplication | Unresolved ≈ next actions for key gaps |

**Mechanical presentation defect (documented, not fixed here):** MARKET_CONTEXT `available: true` + `state: INSUFFICIENT_EVIDENCE` → assessed CSS class + insufficient badge + large value. Does not block validation; increases misinterpretation risk.

---

## ASSESSED incremental value vs MARKET_CONTEXT

ASSESSED is **materially better sold-comp context** (narrower HIGH-only range, correct label).  
It is **not** materially better at closing BUY/SELL decisions — still no value / ask reasonableness / job synthesis.

Causes: absence of valuation methodology; absence of asking judgement; lack of decision synthesis; UX hierarchy elevating any sold £ figure.

---

## LET_INVEST control

Comparable sold tile **absent** from LET key spine (by design).  
LET remains more actionable because of **rent evidence + finance methodology + user-input unlock + PD + DI V1** — not because of comps. Confirms BUY/SELL gap is missing assessed economic conclusions + synthesis, not missing another evidence chip.

---

## Dominant decision-gap classification (exact one)

**I BUY_SELL_NOT_STRONG_ENOUGH_CURRENT_WEDGE**

Supporting (not selected): valuation gap (A) still blocks ask reasonableness; MARKET_CONTEXT hierarchy (F); listing sold-context coverage often weaker than HMLR sold cohort (D/G).

---

## Recommended roadmap action (do not implement here)

1. Keep **LET_INVEST** as the current product wedge.  
2. Do **not** treat BUY/SELL packs as “value proven” after comps alone.  
3. Before any BUY/SELL capability build: either  
   - **narrow MARKET_CONTEXT prominence** (supporting evidence, not key “assessed” styling) as a presentation-truth fix, and/or  
   - run **valuation strategy research only** (still no implementation / no provider chase).  
4. Do not start DI V2, mass enrichment, scraping, or Comparable threshold loosening from this validation.

**Exact next phase name (if taken):**  
**V1.2 — BUY/SELL Sold-Context Presentation Truth & Wedge Discipline**  
(presentation/hierarchy honesty + roadmap discipline — not a new intelligence engine)

---

## Production changes

**None.** Validation script + this ADR + roadmap pointer only.

## Git

Dirty worktree preserved. No commit / push / tag / clean / reset / stash.

---

## Verdict

**Classification:** I BUY_SELL_NOT_STRONG_ENOUGH_CURRENT_WEDGE  

**Final verdict:** POST-COMPARABLE BUY/SELL REAL-PRODUCT VALIDATION PASSED — BUY/SELL NOT YET STRONG WEDGE
