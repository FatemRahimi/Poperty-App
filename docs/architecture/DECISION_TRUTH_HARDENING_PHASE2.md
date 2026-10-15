# Decision Truth Hardening — Phase 2

Date: 15 October 2026  
Baseline: `docs/architecture/RESIDENTIAL_DECISION_UNIVERSE_PHASE1.md`  
Branch: `temp-branch`  
Repository: `E:\laptop mac\New folder\property-main (1)`

This phase makes the existing BUY and LET_INVEST paths evidence-safe. It does not add providers, tax rules, a relationship engine, mortgage products, or other asset classes. Gross yield, NOI, net yield, cash flow, and DSCR formulas are unchanged.

## Changes made

- LLM text from the property explanation, listing writer, and buyer-match polish is checked against the sanctioned input. Unsupported numbers and factual claims are rejected. The deterministic fallback is what gets published.
- `mockListingWriter` no longer invents bedrooms, bathrooms, finishes, or location quality. It copies only supplied fields.
- BUY now has a canonical decision object (`buy-decision-1.0.0`) beside preference fit. Preference fit is labelled as preference fit. It is not a buy recommendation.
- LTV is calculated only when purchase price and deposit are both explicitly supplied.
- Rent basis now has a canonical label: `ACHIEVED_RENT`, `LISTING_ASKING_RENT`, `AREA_ASKING_RENT_ESTIMATE`, `USER_SCENARIO_RENT`, or `UNKNOWN`. The previous `LISTING_RENT` / `MARKET_RENT` labels remain so existing finance tests keep their meaning.
- Leasehold lease years, service charge, and ground rent are each `KNOWN`, `UNKNOWN`, `CONFLICTED`, or `NOT_APPLICABLE`. Unknown charges stay null.
- Area `/demand` and `/demand-rent` are attached as area context. They do not score landlord demand.
- School proximity evidence is context. It does not score catchment, quality, or admission.
- Defaulted `futureValue` is withheld from presentation. Rent price-sensitivity rows are labelled `SCENARIO` and are not observed evidence.
- Investigation priorities now include achieved rent, and leasehold term, service charge, and ground rent when those are unknown.

## Evidence contracts

| Rule | Where it is enforced |
| --- | --- |
| No evidence, no fact | Lease, LTV, affordability, cash to complete, and housing cost return `UNKNOWN` when inputs are absent |
| Unknown is not zero | Missing service charge, ground rent, and deposit stay null |
| Area evidence is not property evidence | `areaMarketContext.notPropertySpecificDemand` |
| Asking rent is not achieved rent | `canonicalBasis` and the yield limitation string |
| Preference fit is not a buy recommendation | `buyDecision.buyRecommendation = null` and `preferenceFit.notABuyRecommendation` |
| LLM text is not evidence | `llmOutputGuard.js` rejects unsupported text before publish |
| Calculations trace to inputs | LTV provenance records price and deposit sources. Yield records rent basis |

## BUY fit versus BUY decision

`buyerMatchEngine` and `buyer_general` still score preference fit: budget versus asking price, location, space, price fairness, lifestyle, and transport.

`assembleBuyDecision` is a separate object. It records evidence state and investigation priorities. A strong preference-fit score does not fill affordability, cash to complete, or ongoing housing cost. Those stay `UNKNOWN` in this phase. Income is not turned into a positive affordability result.

## Rent basis taxonomy

Selection order is unchanged: user scenario rent, else listing asking rent, else area asking-rent estimate, else unknown. Achieved rent is not silently substituted into the yield.

When gross yield is assessed from anything other than achieved rent, and no achieved-rent fact exists, Decision Intelligence adds `achieved_rent_unknown`. The yield number remains.

Presented gross yield carries:

- `basis` — existing label (`LISTING_RENT`, `MARKET_RENT`, `SCENARIO_RENT`)
- `rentBasis` — canonical label
- `evidenceClass` — `asking`, `estimate`, `scenario`, or `unknown`
- `limitation` — for example, “Yield uses asking rent, not achieved rent.”

## Leasehold unknown handling

Freehold lease years, service charge, and ground rent are `NOT_APPLICABLE`.

Leasehold with a missing figure is `UNKNOWN`. An explicit zero on the listing is `KNOWN` and is not rewritten to unknown.

A missing lease term on a leasehold creates `lease_years_unknown`. Known years are exposed on the BUY decision and are not turned into a lender or mortgageability claim.

## LLM guardrails

`validateLlmText` rejects:

- numbers that are not in the sanctioned input, other than 0–10 and 100
- bedroom and bathroom counts that are not in the sanctioned input, including counts inside that small allowlist
- currency amounts and financial percentages that are not in the input
- ungrounded phrases for condition, finishes, location quality, schools, demand, and price growth
- purchase-recommendation language, including “you should buy”

Rejected property explanations fall back to the template. Rejected listing copy falls back to `safeListingCopy`. Rejected buyer-match polish keeps the deterministic assistant message and does not change match scores.

Decision Intelligence explanation, the Why engine, and `generateValuationReport` were not loosened. Valuation generation remains blocked.

## Investigation rules

An item is added only when it can change how the decision should be read.

LET_INVEST, in addition to the existing cost, finance, rent-position, and demand items:

- achieved rent unknown, when yield is assessed and achieved rent is not
- lease years unknown, when tenure is leasehold and the term is missing
- service charge unknown, when tenure is leasehold and no charge was evidenced or supplied
- ground rent unknown, on the same rule

BUY:

- affordability evidence incomplete
- deposit unknown, when LTV cannot be calculated
- ongoing housing cost unknown
- valuation support unavailable, when no defensible valuation or price position exists
- lease term, service charge, and ground rent unknown, when tenure is leasehold
- unresolved flood, planning, listed-building, conservation-area, or Article 4 evidence, as worth reviewing rather than a clearance

Area demand is not an investigation item that satisfies landlord demand. Landlord demand stays not assessed.

## Remaining limitations

- BUY still cannot say whether someone can afford the home. Income, commitments, expenditure, SDLT, and fees are not modelled.
- Achieved rent is still often missing. Yield from asking rent remains available and is now labelled.
- Lease length is not compared with any lender rule.
- Service charge and ground rent, when known, are still a single observation. Major works are not modelled.
- Area demand is not property-level demand, time-to-let, or time-to-sell.
- School context is proximity only. Catchment and admission stay not assessed.
- PropertyData market evidence still runs only when that provider is enabled.
- Heuristic landlord risk can still move the preference-style landlord score. Decision Intelligence still does not narrate those probabilities.
- The arithmetic module still computes a raw future value with default appreciation. Presentation now withholds that number unless appreciation and holding period were supplied, and even then labels it an assumption.

## Intentionally deferred

- Relationship engine
- Mortgage product integration
- SDLT and first-time-buyer relief
- Cross-market comparison
- Commercial, land, and agricultural decisions
- New UI redesign
- New data providers
- A universal mortgageability threshold

Phase 3 has not been started.
