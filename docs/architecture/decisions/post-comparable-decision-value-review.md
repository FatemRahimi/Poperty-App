# Decision: Post-Comparable Decision Value Review

**Status:** REVIEWED  
**Date:** 2026-09-08  
**Phase:** V1.2 roadmap checkpoint (no implementation)

This records the product-state review after Official HMLR Comparable Assessment **v1.1**. It is not a new engine, provider, domain foundation, valuation methodology, or comparable-rule change.

---

## Authoritative comparable result (do not re-litigate)

| Measure | Result |
| --- | --- |
| Genuine cohort | 6 HMLR subjects |
| Defensible `ASSESSED` | **2** (≥3 HIGH: same postcode + type + ≤3y) |
| `MARKET_CONTEXT` | **4** (relevant txs, insufficient HIGH) |
| False comparable assessments | **0** |
| Methodology | `official-hmlr-residential-comparable-assessment` **1.1.0** |
| Valuation claim | **None** — selection + evidence assessment only |

HIGH / MEDIUM / LOW and ASSESSED vs MARKET_CONTEXT semantics are versioned and bounded. Comparable statistics use HIGH only when ASSESSED. Local transaction statistics remain separately labelled.

---

## Pre-flight (product state)

| Area | State |
| --- | --- |
| Residential Decision Workspace | Live: BUY / LET_INVEST / SELL presentation of existing outputs |
| Decision Intelligence V1 | LET_INVEST only; BUY/SELL `applicable = false` |
| HMLR official ledger | ~31.5M live PPD rows; analyse reads local DB |
| Comparable Assessment v1.1 | Proven on genuine cohort; BUY/SELL key tiles wired |
| PropertyData AVM | **CONDITIONAL_FIT**; live genuine proof **data-blocked**; parked as next chase |
| Rental / Finance | Residential rent + BTL finance; LET underwriting UX unlocks NOI/CF/DSCR |
| Planning / Environment / Legal / EPB | Live evidence envelopes; legal docs typically 0; EPB attach limited (2/86) |
| Frozen boundaries | Valuation blend, PD weights, finance formulas, HMLR matcher, DI V1 — not mutated by comps |

Roadmap “NOW” still lists earlier V1.2 items; comparable sufficiency closure is complete in-tree. This review resets **NEXT**.

---

## BUY / SELL value delta

### BUY — before comparable assessment

Key spine usually empty: valuation NOT_ASSESSED → price position NOT_ASSESSED. Buyer_general thin without prefs. Planning/flood/EPB as supporting chips only. Decision usefulness: **low–medium**.

### BUY — after comparable assessment

| Layer | Change |
| --- | --- |
| Previous key intelligence | Valuation + price position + buyer_general (often empty) |
| New | `Comparable sold evidence` when ASSESSED; else `Local sold transaction context` when MARKET_CONTEXT |
| Remaining NOT_ASSESSED | Defensible valuation; asking reasonableness / price position; many buyer prefs |
| Valuation gap | **Unchanged** — comps ≠ value |
| Buyer preference gap | **Unchanged** |
| Risk/evidence gaps | Still chips, not BUY decision synthesis |
| Decision usefulness | **Materially improved for sold-price context**; still weak for “is asking fair?” / “should I buy?” |

### SELL — before

Entire spine usually empty (valuation + price position). Lowest decision pack.

### SELL — after

Same sold-context lift as BUY (ASSESSED or MARKET_CONTEXT tiles). Still no seller PD/DI. Asking positioning and “what might it be worth?” remain **NOT_ASSESSED**. Usefulness: **partial** — sold context yes; pricing strategy no.

---

## LET_INVEST recheck

**Still the strongest complete job.**

Rent evidence, gross yield (when price + rent), finance unlock path, landlord PD, DI V1 findings/priorities remain. Comparable tiles are **not** on the LET key spine (by design). Comparable capability does **not** displace LET as the wedge; it mainly upgrades BUY/SELL price context.

Do not alter rental/finance methodology.

---

## Actionable coverage (classes)

Separate evidence chips from completed intelligence.

| Class | Examples | Typical state |
| --- | --- | --- |
| **EVIDENCE** | Planning nearby, flood, EPB, heritage | Present when sourced; not decision conclusions |
| **MARKET CONTEXT** | Local/district sold range; HMLR area txs | Often available; labelled MARKET_CONTEXT |
| **DOMAIN INTELLIGENCE** | Rent recommendation; BTL finance metrics; comparable ASSESSED set | LET strong; BUY/SELL comps **partial** (2/6 defensible in cohort) |
| **DECISION INTELLIGENCE** | Landlord PD + DI V1 | LET only; BUY/SELL not applicable |

| Job | Usually ASSESSED | MARKET_CONTEXT / PARTIAL | Usually NOT_ASSESSED |
| --- | --- | --- | --- |
| BUY | Comps when ≥3 HIGH; some evidence chips | Local sold context; buyer_general dims | Valuation; price position; buy conclusion |
| SELL | Comps when ≥3 HIGH | Local sold context | Valuation; asking position; sell strategy |
| LET_INVEST | Gross yield (often); DI priorities | NOI/CF/DSCR until user finance complete | Valuation; professional condition; title quality |

---

## User-question coverage

### BUY

| Question | Coverage |
| --- | --- |
| What is this property? | PARTIAL (identity + facts; UPRN/EPB limited) |
| What have genuinely comparable homes sold for? | ASSESSED when ≥3 HIGH; else NOT_ASSESSED (do not use MARKET_CONTEXT as comps) |
| Broader local sold market? | MARKET_CONTEXT when relevant set meets floor |
| Is asking price reasonable? | NOT_ASSESSED |
| What risks matter? | PARTIAL (evidence chips; no BUY DI synthesis) |
| Suitable for me? | PARTIAL / NOT_ASSESSED (buyer_general prefs) |
| Investigate next? | PARTIAL (unresolved list; weak BUY prioritisation) |

### SELL

| Question | Coverage |
| --- | --- |
| Comparable homes sold for? | ASSESSED or NOT_ASSESSED (same HIGH rule) |
| Broader local market? | MARKET_CONTEXT |
| What might my property be worth? | NOT_ASSESSED |
| How to position asking price? | NOT_ASSESSED |
| Investigate before selling? | PARTIAL |

### LET_INVEST

| Question | Coverage |
| --- | --- |
| Rent evidence? | ASSESSED / PARTIAL (area rent path) |
| Yield? | ASSESSED when price + rent |
| NOI / cashflow / DSCR? | ASSESSED when USER_REPORTED inputs complete; else NOT_ASSESSED |
| Risks / priorities? | ASSESSED via DI V1 when applicable |
| Purchase price attractive? | PARTIAL (yield/context; valuation often NOT_ASSESSED) |
| Investigate next? | ASSESSED / PARTIAL (DI priorities + underwriting gaps) |

---

## Largest remaining decision gaps

1. **Asking reasonableness / subject worth** (BUY & SELL) — still the top unanswered decision question; **not** solved by comps.  
2. **BUY investigation synthesis** — evidence exists but is not job-shaped Decision Intelligence.  
3. **Defensible comparable density** — many subjects stay MARKET_CONTEXT (sparse same-postcode recent sales); methodology correctly refuses false ASSESSED.  
4. **Seller strategy pack** — no PD/DI; comps help orientation only.

---

## Valuation strategy reassessment

| Fact | Implication |
| --- | --- |
| PropertyData AVM CONDITIONAL_FIT + live proof data-blocked | Do not resume field chase or new provider |
| HMLR market context real; some defensible HIGH sets | Useful **inputs** to a future price-context strategy — still ≠ valuation |
| No adjustment / time / size / condition methodology | Cannot honestly conclude worth or “fair asking” |
| Comparable assessment ≠ valuation (frozen) | Do not promote sold range to value |

**Rational next step for valuation itself:** keep **implementation parked**. A later **methodology/research review** (asking vs HIGH comps as labelled price-context, interaction with parked AVM) is warranted **after** product validation of the current BUY/SELL packs — not as an immediate build and not as provider selection.

---

## Candidate matrix

| ID | Candidate | ACTIONABLE_VALUE | EVIDENCE_READY | METHOD_READY | CROSS_ASSET | IMPL_COST | EXT_DEP | EMPTY_FOUNDATION_RISK | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | VALUATION_STRATEGY | HIGH later | MED | LOW now | LOW | MED | MED | HIGH if built now | Research later; **not now** |
| B | MARKET_INTELLIGENCE | LOW–MED | HIGH | LOW | MED | MED | LOW | HIGH (vague UI) | Reject |
| C | PROPERTY_COMPARISON_SCREENING | HIGH later | MED | LOW | LOW | MED | LOW | HIGH now | After validated comps UX |
| D | BUY_DECISION_INTELLIGENCE | HIGH | MED | MED | LOW | MED | LOW | MED (score risk) | After validation |
| E | SELL_DECISION_INTELLIGENCE | MED | MED | LOW | LOW | MED | LOW | MED–HIGH | After validation |
| F | RENTAL_INCOME_INTELLIGENCE | LOW | HIGH | HIGH | LOW | LOW | MED | LOW | Defer (LET already strong) |
| G | FINANCE_UNDERWRITING | LOW–MED | HIGH | HIGH | LOW | LOW | LOW | LOW | Defer (UX shipped) |
| H | LEGAL_TITLE_INTELLIGENCE | LOW now | LOW | LOW | MED | HIGH | HIGH | HIGH | Park |
| I | PLANNING_INTELLIGENCE | LOW | MED | LOW | MED | HIGH | LOW | HIGH | Park |
| J | BUILDING_CAPEX_INTELLIGENCE | LOW now | LOW | LOW | MED | HIGH | HIGH | HIGH | Park |
| K | PORTFOLIO_INTELLIGENCE | LOW | LOW | LOW | MED | HIGH | LOW | HIGH | Park |
| L | EVIDENCE_COVERAGE_FIRST | MED indirect | — | — | MED | MED | LOW–MED | LOW | Supporting; identity ≠ more HIGH density |
| M | NO_NEW_CAPABILITY_PRODUCT_VALIDATION_FIRST | HIGH discipline | HIGH | HIGH | — | LOW | LOW | LOW | **SELECT** |

### Product-value test (selected vs serious runners)

| Candidate | Save time | Avoid expensive mistakes | Find better opportunities |
| --- | --- | --- | --- |
| **M validation** | Yes — stops wrong next build | Yes — catches MARKET_CONTEXT misuse | Indirect — focuses roadmap |
| A valuation build now | Claimed yes | **No** — false confidence risk | Claimed yes |
| D BUY DI now | Yes if careful | Partial | Partial |
| L evidence coverage | Partial | Partial | Low |

---

## Data Intelligence reuse (no engine)

Comparable phase demonstrated reusable **semantic patterns** (not a new engine):

- relevance (postcode vs district)  
- temporal validity (≤3y / ≤5y vs asOf)  
- evidence sufficiency / strength (HIGH floor; LIMITED vs MODERATE)  
- provenance (HMLR OGL)  
- applicability (residential PPD types; E&W)

**Recommend extraction only when ≥2 other domains need the same contracts in production.** Today: document patterns; **do not** create a Data Intelligence Engine or speculative kernel abstraction.

---

## Operating-model feasibility

Validation and comps already use real HMLR PPD offline import — matches production analyse (local DB, no national download). Reject candidates needing fake properties, owned validation stock, fabricated attributes, portal scrapes, or unavailable title/survey feeds.

---

## Empty-foundation rejection

Rejected now: live valuation from comps; CRE valuation; CapEx; legal quality; planning “permission” conclusions; DI V2 without job evidence; Portfolio V2; development/project-cost live engines; Condition Engine; ML/calibration (N=0).

---

## Selected next direction

**M — NO_NEW_CAPABILITY_PRODUCT_VALIDATION_FIRST**

Exact next phase name:

**V1.2 — Post-Comparable BUY/SELL Decision Pack Real-Product Validation**

### Why it beats alternatives

1. Comparable intelligence just changed BUY/SELL semantics; inventory-level usefulness of ASSESSED vs MARKET_CONTEXT is not yet measured (cohort ≠ listing workspace).  
2. Largest remaining product risk is **misreading market context as value / comps** — validation before DI or valuation research.  
3. Valuation implementation remains correctly parked; research without pack validation is premature.  
4. Evidence-coverage-first does not create same-postcode HIGH density.  
5. BUY/SELL DI and screening remain high value **after** proving the current pack is decision-useful, not confusing.

### What stays parked

- PropertyData AVM field chase / new provider  
- Valuation implementation / adjustment methodology  
- Legal Phase 9.3 / title register  
- CapEx / Condition Engine / survey inference  
- CRE specialist procurement  
- Portfolio V2 / ML / calibration  
- Broad UI redesign  
- Comparable methodology loosening  

### Production changes this phase

**None** (diagnostic ADR + roadmap NEXT only).

---

## Classification / verdict

**Classification:** M NO_NEW_CAPABILITY_PRODUCT_VALIDATION_FIRST  

**Verdict:** POST-COMPARABLE DECISION VALUE REVIEW PASSED — PRODUCT_VALIDATION_FIRST
