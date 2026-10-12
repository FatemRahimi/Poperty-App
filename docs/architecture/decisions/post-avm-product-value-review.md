# Decision: Post-AVM product value & capability review

**Status:** REVIEWED  
**Date:** 2026-09-07  
**Phase:** V1.2 roadmap decision checkpoint (no implementation)

This records the post-AVM product review. It is not a new engine, provider, domain foundation, or valuation methodology change.

---

## Authoritative AVM parking

PropertyData subject-native sale AVM is:

**CONDITIONALLY_AVAILABLE_WHEN_COMPLETE_INPUT_EXISTS**

Live real-subject proof:

**LIVE_REAL_SUBJECT_PROOF_PENDING_DATA**

Architecture is not broken. Controlled fixtures reach `PROVIDER_ELIGIBLE`. Genuine HMLR cohort remains **0/6** complete without inventing facts. Provider fit remains **CONDITIONAL_FIT**. Finish quality stays provider-request USER_REPORTED only.

**Do not** continue field-by-field AVM acquisition, fake validation cohorts, new provider comparison, paid source chase, or valuation methodology/safety changes as the next phase.

---

## Strongest current user job (re-evaluated)

**LET_INVEST** remains the strongest wedge after AVM/attribute/completion phases.

| Job | Evidence | Methodology | Actionable outputs | User burden | Ext-data dep | Unresolved burden | Decision value |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BUY | Partial (planning/flood/EPB when attached) | Valuation often blocked; buyer PD prefs thin | Valuation/price position usually NOT_ASSESSED | Prefs + attribute completion | High (AVM) | High | Low–medium until price context exists |
| LET_INVEST | Area rent + listing price often usable | Rent + BTL finance + landlord PD + DI V1 | Gross yield often; NOI/CF/DSCR unlock via USER_REPORTED finance UX | Finance/opex (real operating model) | Medium (rent provider) | Medium, actionable | Highest today |
| SELL | Same valuation bottleneck as BUY | No PD/DI spine | Price position usually NOT_ASSESSED | Attribute completion | High (AVM) | High | Lowest decision pack today |

Prior workspace validation (2026-09-01) remains directionally true: Key Intelligence often empty for BUY/SELL because defensible valuation does not assess. Post-AVM work made readiness truthful and completion UX real; it did **not** remove the live data block.

---

## Domain capability (audit labels)

| Domain | Class | Why |
| --- | --- | --- |
| MARKET | B PARTIAL_ACTIONABLE | Envelope + HMLR/area evidence live; transactions ≠ assessed comps; area ≠ subject |
| VALUATION | A REAL_ACTIONABLE (residential methodology); live often NOT_ASSESSED | Blend + assessment-safety evidenced; PropertyData path conditional; cohorts frequently input-blocked |
| RENTAL | A REAL_ACTIONABLE | Residential rent recommendation path evidenced |
| FINANCE | A REAL_ACTIONABLE | BTL math when USER_REPORTED inputs complete; missing stays NOT_ASSESSED |
| LEGAL_TITLE | C EVIDENCE_ONLY | Wired live as completeness only (`composeLiveDomains`); typical DB 0 private docs; no title quality. Note: `v1.2-legal-title-foundation.md` is stale vs registry/engine |
| PLANNING | C EVIDENCE_ONLY | Nearby apps labelled; not permission conclusions |
| ENVIRONMENT | C EVIDENCE_ONLY | Flood evidence within coverage; empty ≠ safe |
| BUILDING_CONDITION | B PARTIAL_ACTIONABLE (EPB energy/physical); professional D | EPB attach path live; professional condition FOUNDATION_ONLY / NOT_ASSESSED |
| MAINTENANCE_CAPEX | E NOT_IMPLEMENTED | — |
| DEVELOPMENT | D FOUNDATION_ONLY | Identity/scope; `wiredIntoLiveAnalysis: false` |
| PROJECT_COST | D FOUNDATION_ONLY | Not wired |
| DEVELOPMENT_FEASIBILITY | E NOT_IMPLEMENTED | — |
| PROJECT_MANAGEMENT | E NOT_IMPLEMENTED | — |
| ASSET_MANAGEMENT | E NOT_IMPLEMENTED | — |
| PORTFOLIO | B PARTIAL_ACTIONABLE | Parallel optimiser V1; not kernel V2 |
| DECISION | A REAL_ACTIONABLE (LET_INVEST) / B (BUY/SELL) | Workspace + PD + DI V1 for LET_INVEST; BUY/SELL thinner |

Empty envelopes (development/project-cost live engines, CapEx, CRE valuation) remain rejected as next builds.

Supporting read-only audit: [Map domain & job capabilities](affeaf3f-c9cd-48e4-b103-91ff9ec323b6).

---

## Candidate matrix (serious only)

| Candidate | User value | Evidence ready | Method ready | Cost | Actionable gain | Empty-foundation risk | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Transaction/comparable intelligence | HIGH | HIGH (PPD in DB) | MEDIUM | MEDIUM | HIGH (BUY/SELL) | MEDIUM if display-only | **SELECT** |
| Market intelligence (generic) | MEDIUM | HIGH | LOW–MED | MEDIUM | LOW–MED | HIGH (UI polish) | Reject as vague |
| Rental income deepen | MEDIUM | HIGH | HIGH | LOW | LOW | LOW | Defer |
| Finance underwriting deepen | MEDIUM | HIGH | HIGH | LOW | LOW–MED | LOW | Defer (UX already shipped) |
| Legal title | HIGH ideally | LOW | LOW | HIGH | LOW now | HIGH | Park (infra + licensing) |
| Planning/dev intelligence | MEDIUM | MEDIUM | LOW | HIGH | LOW | HIGH | Park |
| Environment risk scores | MEDIUM | MEDIUM | LOW | MEDIUM | LOW | HIGH | Park |
| Building/CapEx | HIGH ideally | LOW | LOW | HIGH | LOW | HIGH | Park |
| Decision Intelligence V2 | HIGH | MEDIUM | MEDIUM | MEDIUM | MEDIUM | MEDIUM | After price context |
| Property comparison/screening | HIGH | LOW–MED | LOW | MEDIUM | HIGH later | HIGH now | After comps |
| Portfolio | MEDIUM | LOW | LOW | HIGH | LOW | HIGH | Park |
| Valuation continuation | HIGH if live | LOW live | HIGH | MEDIUM | LOW until data | LOW arch / HIGH product if forced | **PARK** |
| Evidence-gap-first (identity/EPB) | MEDIUM | — | — | MEDIUM | Indirect | LOW | Supporting, not primary |

---

## Selected next direction

**B — TRANSACTION_COMPARABLE_INTELLIGENCE**

Exact next phase name:

**V1.2 — Official HMLR Transaction → Bounded Residential Comparable Assessment**

### Why it wins

1. Largest actionable gap for BUY/SELL is price context, not more AVM fields.  
2. Official PPD is already ingested under a real operating model (OGL offline import; analyse reads local DB).  
3. Unlocks assessments independent of PropertyData `finish_quality` friction.  
4. Respects AVM parking: architecture conditional; live proof data-blocked.  
5. Avoids empty foundations (legal/CapEx/dev/CRE).  
6. Sets up later PROPERTY_COMPARISON_SCREENING and stronger Decision Intelligence.

### Real evidence paths

- Official/open: HMLR Price Paid (+ existing UPRN/INSPIRE links where present)  
- First-party: subject beds/baths/area/type already captured or listing-bound  
- USER_REPORTED: attribute completion UX (already exists)  
- Not required: fabricated cohort, new paid provider, portal scrape  

### Must remain NOT_ASSESSED until methodology proves otherwise

- Transaction row ≠ comparable set ≠ current value ≠ AVM substitute  
- Area postcode aggregates ≠ subject-specific concluded value  
- Asking price ≠ achieved price  

---

## What stays parked

- PropertyData AVM field chase / new provider / paid source  
- Condition Engine / CapEx / survey inference  
- Legal Phase 9.3 / HMLR title register  
- Development feasibility / project cost live engines  
- CRE specialist procurement  
- Portfolio V2 / ML / calibration (N=0)  
- Broad UI redesign  

---

## Classification / verdict

**Classification:** B TRANSACTION_COMPARABLE_INTELLIGENCE  

**Verdict:** POST-AVM PRODUCT VALUE REVIEW PASSED — NEXT_CAPABILITY_IDENTIFIED
