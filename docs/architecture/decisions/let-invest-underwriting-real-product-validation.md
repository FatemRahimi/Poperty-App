# Decision: LET_INVEST Minimal / Partial / Complete Underwriting Real-Product Validation

**Status:** VALIDATION COMPLETE  
**Date:** 2026-09-09  
**Phase:** V1.2 product validation (no new intelligence capability)

Validates whether the **current** LET_INVEST product becomes useful, understandable, and safe as an investor supplies legitimate BTL underwriting inputs.

Artifact: `server/scripts/validate-let-invest-underwriting-packs-output.json`  
Harness: `server/scripts/validate-let-invest-underwriting-packs.js`  
Paid provider calls: **0** (PropertyData/analyseRent stubbed as labelled area-asking only; valuation not invoked).

Does **not** implement rental depth, DI V2, valuation, or BUY/SELL work.

---

## Pre-flight (accepted)

BUY/SELL PARTIAL/PARKED · LET strongest wedge · comps v1.1 frozen · AVM parked · finance/PD/What-if frozen · prior coverage review selected **K REAL_PRODUCT_VALIDATION_FIRST**.

---

## Cohort legitimacy

Inventory truth (86 properties):

| Measure | Count |
| --- | --- |
| With sale asking price | 24 |
| With listing monthly rent | 62 |
| **With both price and rent** | **0** |

Therefore legitimate LET paths are **split**:

| Path | Subjects | Why legitimate |
| --- | --- | --- |
| Sale asking + MARKET rent | 128, 129 | Real sale listings; rent only via area-asking stub (labelled `MARKET` / `marketSubstitutedForMissingListing`) |
| Listing rent + USER_INPUT purchase | 4, 10 | Real rent listings; purchase price only as **USER_INPUT scenario** (16× annual listing rent) |

No fabricated achieved rent. No scraped portals. Scenario finance fields remain USER_INPUT.

Subject **129** failed rent mapping (no usable rent basis) — retained as honest negative case.

---

## Minimal → Partial → Complete (observed)

### Aggregate (n=4)

| Measure | Count |
| --- | --- |
| LISTING rent basis | 2 |
| MARKET rent basis | 1 |
| Minimal gross yield ASSESSED | 3 |
| Partial NOI ASSESSED | **0** |
| Complete NOI+CF+DSCR ASSESSED | **3** |
| Complete landlord PD ASSESSED | **3** |
| Semantic leakage (deal/achievable-from-area) | **0** |

### Progression matrix (typical successful subject)

| Row | MINIMAL | PARTIAL | COMPLETE |
| --- | --- | --- | --- |
| Rent basis | ASSESSED (LISTING or MARKET) | same | same |
| Gross yield | ASSESSED | ASSESSED | ASSESSED |
| NOI | NOT_ASSESSED | NOT_ASSESSED (incomplete opex) | ASSESSED |
| Net yield | NOT_ASSESSED | NOT_ASSESSED | ASSESSED (when NOI+price) |
| Cash flow | NOT_ASSESSED | NOT_ASSESSED | ASSESSED |
| DSCR | NOT_ASSESSED | NOT_ASSESSED | ASSESSED |
| Landlord PD | NOT_ASSESSED / weak | NOT_ASSESSED / weak | ASSESSED (demand dim still unavailable) |
| DI findings | low | low | ASSESSED (e.g. 6 findings) |
| Sensitivity | PARTIAL map | PARTIAL | PARTIAL map |
| Investigation priorities | ASSESSED (gaps) | ASSESSED | ASSESSED (fewer finance gaps) |
| What-if | applicable | applicable | applicable; scenario moves score (e.g. 71→63) |

**Progressive disclosure proven:** partial opex does **not** unlock NOI (missing ≠ zero).

---

## Rent truth

| Subject | Basis | Substitution flag |
| --- | --- | --- |
| 4, 10 | `LISTING` / `LISTING_RENT` | false |
| 128 | `MARKET` / `MARKET_RENT` | **true** |
| 129 | none | — |

No harness output claimed “property will achieve £X” from area rent. `expectedRentIsNotMarketRent` correct on LISTING path. Residual risk: **MARKET yield prominence** on sale listings without listing rent (e.g. subject 128 extreme asking + area stub).

---

## Finance truth

- NOI blocked until full opex + vacancy.  
- CF/DSCR blocked until deposit + rate + term.  
- Explicit zeros used for managementFee/serviceCharge/groundRent/taxes on complete pack (USER_INPUT).  
- Missing mortgage fields did not invent cash purchase.  
- Valuation / price position remained NOT_ASSESSED (parked).

---

## Landlord PD / DI / What-if

Complete packs: PD scores assessed (e.g. 71, 51) with demand permanently `no_demand_data_source`. DI emits material findings + priorities without opportunity/deal scores. What-if scenarios change landlord score under rent/vacancy/rate patches and remain scenarios, not canonical facts.

---

## Input burden

**HIGH** for complete pack (~10 investor assumptions), but **legitimate** for BTL underwriting. Useful minimal pack often needs 0–1 user fields (scenario purchase on rent listings).

Likely abandonment point: after seeing **gross yield** on minimal pack, before finishing opex/finance.

---

## Product-value rubric

| | MINIMAL | PARTIAL | COMPLETE |
| --- | --- | --- | --- |
| SAVE_TIME | MEDIUM | MEDIUM | HIGH |
| AVOID_MISTAKES | MEDIUM | HIGH | HIGH |
| OPPORTUNITIES | LOW | LOW | MEDIUM |
| CLARITY | MEDIUM | HIGH | HIGH |
| ACTIONABILITY | MEDIUM | MEDIUM | HIGH |
| MISREAD RISK | HIGH if MARKET | MEDIUM | MEDIUM |
| INPUT BURDEN | LOW | MEDIUM | HIGH |

---

## GTM readiness

**Yes — limited real-user GTM validation** of the **current complete LET pack**, with explicit caveats:

1. Inventory has **no** dual price+rent listings — users must supply scenario purchase or accept MARKET rent.  
2. Monitor MARKET-rent comprehension and completion abandonment.  
3. Do **not** claim PMF, purchase fairness, or property-specific achievable rent.  
4. Demand/risk professionalism remain limited.

---

## Dominant next-gap classification (exact one)

**J CURRENT_COMPLETE_PACK_READY_FOR_LIMITED_GTM_TEST**

Monitored residuals (not selected): **A RENTAL_EVIDENCE_DEPTH** (MARKET path), **B UNDERWRITING_INPUT_EXPERIENCE** (abandonment before complete).

---

## Recommended roadmap action

Run **limited real-user GTM validation** on current LET_INVEST (minimal→complete underwriting). Do not build rental engines / DI V2 / valuation first.

If GTM shows MARKET-rent confusion or completion drop-off, reopen **A** or **B**.

**Exact next phase name (if taken):**  
**V1.2 — LET_INVEST Limited Real-User GTM Validation**

---

## Production changes

**None** (validation script + this ADR + roadmap pointer).

## Git

Dirty worktree preserved. No commit / push / tag / clean / reset / stash.

---

## Verdict

**Classification:** J CURRENT_COMPLETE_PACK_READY_FOR_LIMITED_GTM_TEST  

**Final verdict:** LET_INVEST REAL-PRODUCT VALIDATION PASSED — READY_FOR_LIMITED_GTM_TEST
