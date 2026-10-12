# Decision: LET_INVEST real decision coverage & next-gap review

**Status:** REVIEWED  
**Date:** 2026-09-09  
**Phase:** V1.2 roadmap / product-intelligence checkpoint (no implementation)

Determines the highest-value **remaining gap in a real LET_INVEST decision** after BUY/SELL were parked and MARKET_CONTEXT presentation integrity closed.

Does **not** reopen BUY/SELL. Does **not** implement the winning candidate. Does **not** mutate valuation, finance formulas, PD weights, DI V1, Comparable v1.1, or What-if engines.

Supporting audit: prior inventory validation (`residential-decision-workspace-validation.md`), underwriting completion ADR, live LET pack snapshot in `persisted-internal-area-loop-validation-output.json`, and code paths in `financeInputContract.js`, `rentIntelligenceService.js`, `decisionIntelligence.js`, `residentialDecisionWorkspace.js`.

---

## Pre-flight (accepted)

| Item | State |
| --- | --- |
| BUY / SELL | PARTIAL / PARKED (comps help sold context; not strong wedge) |
| MARKET_CONTEXT presentation | Integrity closed — supporting context only |
| LET_INVEST | Current strongest wedge |
| Comparable v1.1 | Frozen (2/6 ASSESSED, 4/6 MARKET_CONTEXT methodology) |
| PropertyData AVM | Parked / CONDITIONAL_FIT |
| Valuation / PD / finance / What-if | Frozen boundaries |
| Outcomes | REAL N = 0 — calibration blocked |

---

## Current LET_INVEST user job

Underwrite a residential let/investment using:

PROPERTY → EVIDENCE → RENT/INCOME → OPERATING ASSUMPTIONS → FINANCE → RISKS → DECISION → NEXT ACTION

Key spine (`buildLetInvestWorkspace`): valuation, price position, gross yield, NOI, cash flow, DSCR, landlord fit — plus DI V1 findings/priorities/sensitivities when applicable. Comparable sold tiles are **not** on the LET key spine.

---

## Real validation cases (operating model)

| Case | What exists today | Typical result |
| --- | --- | --- |
| **A Minimal-input** | Listing/asking price + area or listing rent; no opex/finance | Gross yield often ASSESSED; NOI/CF/DSCR/landlord fit NOT_ASSESSED; DI surfaces underwriting gaps |
| **B Partial underwriting** | Some opex or finance fields | Remaining `missingUnderwritingInputs`; metrics stay gated (missing ≠ zero) |
| **C Complete legitimate inputs** | User supplies vacancy, opex, deposit, rate, term (+ optional scenario rent/price) | Methodology can assess NOI/CF/DSCR + landlord PD dimensions; What-if explores sensitivities |

Observed live LET pack (persisted internal-area loop sample): valuation/price position NOT_ASSESSED; missing user inputs include vacancy, deposit, interestRate, mortgageTermYears, maintenance, insurance, managementFee, taxes; `landlord_pd_blocked`; listing gap `internal_floor_area`.

No fabricated “perfect investment” used as proof. User underwriting assumptions are legitimate when the product expects investors to supply them.

---

## Rental intelligence state

Rent for investment metrics = `rentBasis.selectedRent` (`resolveRentBasis`):

| Priority | Kind | Meaning |
| --- | --- | --- |
| 1 | `SCENARIO` | User `expectedRent` |
| 2 | `LISTING` | Listing `monthly_rent` |
| 3 | `MARKET` | `recommendedRent` when listing rent missing (`marketSubstitutedForMissingListing: true`) |

**MARKET / recommended rent = area asking evidence** (PropertyData segment / internal asking comps / area-wide) — **not** property-specific achieved rent. `achievedRent` remains null. Workspace discloses rent basis label; substitution is flagged.

**Wedge strength:** usable for orientation and gross-yield scaffolding when listing rent or scenario exists. **Not** strong enough to claim “this property’s achievable rent.” Misinterpretation risk: area rent → yield → “attractive investment.”

---

## Finance / underwriting state

| Item | Class |
| --- | --- |
| Listing asking / scenario purchase price | LISTING FACT or USER/SCENARIO INPUT (not fair-value assessment) |
| Listing / scenario / market rent | LISTING / USER / MARKET EVIDENCE via rentBasis |
| Vacancy, maintenance, insurance, management, taxes | USER_INPUT (service charge / ground rent may be property-fact preferred) |
| Deposit, interest rate, term, mortgage amount | USER_INPUT |
| Gross yield | DERIVED / ASSESSED when price + rent |
| NOI, net yield | DERIVED / ASSESSED when rent + complete opex |
| Cash flow, DSCR | DERIVED / ASSESSED when NOI + complete finance |
| Valuation / price position | NOT_ASSESSED (platform evidence; parked AVM path) |

Verified semantics: UNKNOWN ≠ ZERO; MISSING ≠ ZERO; missing mortgage ≠ cash purchase. Formulas unchanged.

---

## Decision Intelligence state (landlord DI V1)

**Does:** unresolved dependencies; investigation priorities; material findings when underlying metrics/PD assessed; sensitivity dependency map (not ranked score deltas).

**Does not:** opportunity/good-deal score; run What-if; invent demand/risk conclusions; purchase recommendation; DI V2 domain-envelope synthesis.

Helps “what’s missing / what to investigate” more than “should I buy this investment” when finance is incomplete. When finance is complete, PD + findings partially answer attractiveness **under user criteria** without deal-quality labels.

---

## What-if state

Landlord What-if already covers high-value sensitivities: rent, vacancy, opex, deposit, rate, term, mortgage amount, purchase price/scenario rent, landlord minYield/minDscr constraints. Does not overwrite saved analysis. No new dimensions required for this checkpoint.

---

## Risk coverage

| Domain | Evidence | Domain assessed? | Decision-relevant? |
| --- | --- | --- | --- |
| Planning | Live nearby apps | Evidence / envelope | Context chip — not permission |
| Flood/environment | Live EA | Evidence | Context — empty ≠ safe |
| Legal/title | Completeness only | Evidence-starved (0 docs typical) | NOT professional title quality |
| EPB / building | Limited attach | Energy/physical only | NOT survey / CapEx |
| Finance completeness | User inputs | Metrics when complete | Yes |
| Rental | Area/listing/scenario | Yield when basis exists | Yes with provenance caveats |
| Identity | Limited UPRN/SAON | Partial | Indirect |
| Tenant demand | Area band context | PD demand NOT_ASSESSED | Context only |

Evidence chips ≠ professional risk conclusions.

---

## Actionable-assessment matrix (selected)

| Question | Current answer | State | Source | User input? | Actionable? | Major limitation |
| --- | --- | --- | --- | --- | --- | --- |
| What is the property? | Partial identity/facts | PARTIAL | Listing + identity/EPB | Optional declare | Partial | UPRN/SAON/EPB sparse |
| What rent evidence exists? | Area asking / listing / scenario | ASSESSED or PARTIAL | Provider + listing + user | Scenario optional | Yes with caveat | Not achieved rent |
| Property-specific achievable rent? | Not defensibly assessed | NOT_ASSESSED | — | Scenario only | No | No achieved-lettings methodology |
| Purchase price underwritten? | Listing or scenario | FACT/INPUT | Listing / user | Often | Yes | Not “fair price” |
| Gross yield? | When price+rent | ASSESSED | Derived | Indirect | Yes | Inherits rent-basis quality |
| Operating costs known? | Usually user | USER_INPUT | Form | Yes | Yes when supplied | Platform does not invent opex |
| NOI / cash flow / DSCR? | When inputs complete | ASSESSED / NOT_ASSESSED | Derived | Required for assess | Yes when complete | Minimal-input packs stop at yield |
| Attractive under my criteria? | Landlord PD when dims assess | PARTIAL | PD | Criteria + finance | Partial | Demand/risk dims weak |
| Investigate next? | DI priorities + underwriting gaps | ASSESSED/PARTIAL | DI V1 | — | Yes | Synthesis shallow |
| Fair purchase vs value? | — | NOT_ASSESSED | Valuation parked | — | No | Explicitly parked |
| Will it let / demand? | — | NOT_ASSESSED | Demand context only | — | No | Permanent today |

**NOT_ASSESSED that most often blocks a full investment decision on inventory:** incomplete underwriting inputs (NOI/CF/DSCR/PD), then rent-basis quality, then parked valuation (purchase attractiveness vs market value).

---

## User-input burden

| Reasonable scenario input | Platform-should-know fact |
| --- | --- |
| Interest rate, deposit, term, vacancy assumption, management fee | Identity, internal area, EPB, listing rent when marketed as let |
| Expected rent override | Achieved rent (not available) |
| Insurance / maintenance assumptions | Title / survey (not available) |

**Burden: MEDIUM–HIGH** before full underwriting pack, but **legitimate** for BTL underwriting. Threatens product value mainly when users abandon before completing opex/finance — leaving only gross yield (easy to over-read).

---

## Product-value rubric (current LET)

| Dimension | Rating | Basis |
| --- | --- | --- |
| SAVE_TIME | HIGH | Yield + gap list + What-if vs spreadsheet from scratch |
| AVOID_EXPENSIVE_MISTAKES | MEDIUM | Missing≠zero, mortgage≠cash, rent-basis disclosure; area-rent misread risk |
| FIND_BETTER_OPPORTUNITIES | LOW–MEDIUM | No screening/portfolio; single-subject underwriting |
| DECISION_CLARITY | MEDIUM | Clear unlock map; incomplete packs look “thin” |
| ACTIONABILITY | HIGH when inputs complete; MEDIUM minimal | UX unlock path exists |
| USER_INPUT_BURDEN | MEDIUM–HIGH | Many opex/finance fields |
| MISINTERPRETATION_RISK | MEDIUM | MARKET_RENT → yield; gross yield as deal quality |

---

## Largest decision blockers (ordered)

1. **Incomplete underwriting on real inventory** — pack often stops at gross yield (UX exists; completion not validated as GTM path).  
2. **Rent evidence depth / provenance** — area asking can scaffold yield without property-specific achievable rent.  
3. **Parked valuation** — cannot assess purchase fairness (must not back-door via LET).  
4. **Demand / professional risk** — correctly NOT_ASSESSED; weakens “full DD” claims.  
5. **Shallow decision synthesis** — DI V1 prioritises gaps; does not produce invest/don’t-invest.

---

## Candidate next-gap matrix

| ID | Candidate | Actionable value | Evidence ready | Method ready | Empty-foundation risk | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| A | RENTAL_EVIDENCE_DEPTH | HIGH | MED | LOW–MED | MED–HIGH (new source/provider) | Strong after validation |
| B | OPERATING_COST_INTELLIGENCE | MED | LOW | LOW | HIGH (invented opex) | Reject now |
| C | FINANCE_UNDERWRITING_DEPTH | LOW | HIGH | HIGH | LOW | Defer — UX shipped |
| D | LANDLORD_DECISION_SYNTHESIS | MED–HIGH | MED | MED | MED (DI V2 without evidence) | After validation |
| E | RISK_DUE_DILIGENCE_COVERAGE | LOW now | MED chips | LOW conclusions | HIGH | Park |
| F | PROPERTY_ATTRIBUTE_COVERAGE | MED indirect | MED | MED | LOW | Supporting |
| G | INVESTMENT_COMPARISON_SCREENING | HIGH later | LOW | LOW | HIGH | Later |
| H | PORTFOLIO_WORKFLOW | LOW | LOW | LOW | HIGH | Park |
| I | OUTCOME_VALIDATION_CALIBRATION | — | N=0 | — | — | Blocked |
| J | USER_INPUT_WORKFLOW | LOW incremental | HIGH | HIGH | LOW | Done enough |
| **K** | **REAL_PRODUCT_VALIDATION_FIRST** | **HIGH discipline** | **HIGH** | **HIGH** | **LOW** | **SELECT** |
| L | CURRENT_WEDGE_SUFFICIENT_FOR_GTM | — | — | — | — | Premature without measured complete packs |
| M | OTHER | — | — | — | — | — |

---

## Opportunity / deal-quality boundary

Yield, cash flow, DSCR, medians, comps must **not** become GOOD/BAD DEAL, UNDER/OVERPRICED, or BUY. Landlord PD remains suitability under stated criteria — not purchase advice. No new opportunity score.

## Valuation boundary

Purchase price may be listing/scenario underwriting input. That is **not** assessed fair value. AVM remains parked. LET must not become a valuation back door.

## Data Intelligence reuse (no engine)

Reusable semantics already appearing: provenance (`rentBasis`), sufficiency (finance gates), relevance (area vs subject), conflict (listing vs scenario). Document only — do not build a Data Intelligence Engine.

## Operating-model feasibility

Validation must use real listings + legitimate user finance inputs. No scrape, fake ownership, or synthetic perfect deals. Paid rent providers may appear on live analyse paths already in operating model — do not require new providers for the next validation phase.

## Empty-foundation rejection

Rejected now: CapEx engine, legal quality conclusions, inventing opex, DI V2 without measured need, portfolio V2, CRE, Condition Engine, opportunity scores, outcome ML (N=0).

---

## Selected next direction

**K — REAL_PRODUCT_VALIDATION_FIRST**

Exact next phase name:

**V1.2 — LET_INVEST Minimal / Partial / Complete Underwriting Real-Product Validation**

### Why it beats alternatives

1. Underwriting unlock UX and DI V1 already shipped; **end-to-end decision value of complete packs on real inventory is not freshly measured** (unlike BUY/SELL pack validation).  
2. Choosing A (rental depth) or D (synthesis) now risks building against an unmeasured wedge — and A may need sources the operating model does not yet have.  
3. L (GTM-ready) overclaims while typical inventory still shows incomplete underwriting + NOT_ASSESSED valuation.  
4. Validation will decide among: deepen rent evidence (A), improve synthesis (D), or declare wedge ready (L).

### What stays parked

BUY/SELL expansion; AVM/valuation implementation; Comparable loosening; CapEx/Condition; Legal 9.3; Portfolio V2; ML/calibration; opportunity scores; Data Intelligence Engine.

### Production changes this phase

**None** (this ADR + roadmap pointer only).

---

## Classification / verdict

**Classification:** K REAL_PRODUCT_VALIDATION_FIRST  

**Verdict:** LET_INVEST DECISION COVERAGE REVIEW PASSED — PRODUCT_VALIDATION_FIRST
