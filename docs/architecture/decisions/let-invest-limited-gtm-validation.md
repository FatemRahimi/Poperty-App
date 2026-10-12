# Decision: LET_INVEST Limited Real-User GTM Validation

**Status:** PROTOCOL READY — REAL-USER RESULTS PENDING  
**Date:** 2026-09-09  
**Phase:** V1.2 real-user product validation (no new intelligence capability)

Prepares the smallest defensible real-user validation of the **current** LET_INVEST complete pack.

Does **not** claim PMF. Does **not** launch marketing. Does **not** start rental/valuation/DI engines.

Companion artifacts:

| Artifact | Path |
| --- | --- |
| Facilitator script | `docs/architecture/decisions/let-invest-limited-gtm-participant-script.md` |
| Results template | `docs/architecture/decisions/let-invest-limited-gtm-results-template.json` |
| Funnel classifier (read-only) | `server/scripts/classify-let-invest-gtm-funnel.js` |

---

## Pre-flight (accepted)

BUY/SELL PARTIAL/PARKED · LET primary wedge · underwriting progressive unlock proven · complete pack can assess NOI/CF/DSCR/Landlord PD · MARKET rent ≠ achievable rent · valuation/price fairness NOT_ASSESSED · inventory 0/86 dual price+rent · classification **J** from prior phase.

Do not re-run underwriting validation. Do not build new capability from hypothetical users.

---

## 1. Objective (evidence questions)

Only real participants can answer:

1. Understand what the product does?
2. Analyse a property they genuinely care about?
3. Complete required underwriting inputs?
4. Distinguish FACT vs MARKET EVIDENCE vs USER ASSUMPTION?
5. Understand MARKET rent ≠ guaranteed achievable rent?
6. Reach complete underwriting pack?
7. Do outputs affect investigation/decision process?
8. Which missing capability actually blocks value?
9. Would they use the workflow again? (intent ≠ PMF)

---

## 2. Cohort design (LIMITED)

### Target profile

- UK residential landlord / BTL investor
- Currently evaluates or compares potential residential investments
- Prefer prior underwriting experience (spreadsheet, broker pack, or lender checklist)

### Exclusion

- Pure owner-occupier buy-to-live with no rental intent
- Commercial-only investors for this residential LET test
- Participants who cannot supply legitimate property facts or assumptions for a real subject they are considering
- Anyone requiring scraped portal content without rights
- Staff/developer “demo repair” sessions counted as product evidence

### Size

| Parameter | Value |
| --- | --- |
| Minimum useful cohort | **5** completed sessions with at least one analyse run |
| Target | **8** sessions |
| Hard cap | **12** (stop recruiting; interpret) |

### Stopping criteria

Stop early if **≥5** sessions show the **same** dominant blocker class (B–F below) with high confidence.  
Stop and escalate if operating-model blocker (E) prevents ≥50% of recruited participants from starting a legitimate analysis.

---

## 3. Test job

> Evaluate a residential property as a potential rental investment.

Participants use the **current** product. Facilitator does **not** coach toward positive outcomes or complete inputs for them.

Observed path:

PROPERTY → RENT BASIS → PURCHASE PRICE → UNDERWRITING → YIELD → NOI → CF → DSCR → Landlord PD / DI → What-if → Next action

---

## 4. Real property operating model (no new inventory system)

### Legitimate paths (current product)

| Path | How | Notes |
| --- | --- | --- |
| A | Participant creates/uses their **own listing** (sale or rent) already on the platform | Preferred when they have rights to the data |
| B | Participant analyses a **subject they are legitimately considering**, entered with facts they already possess (asking price, expected rent, address) via supported create/edit flows | Assumptions labelled USER_INPUT / SCENARIO |
| C | Facilitator-provisioned **existing inventory** subject the participant is willing to treat as a practice deal **only if** they still complete underwriting as their own assumptions | Secondary; mark `practice_inventory_subject: true` |

### Not allowed

- Fake listings / fabricated achieved rent / invented asking as “facts”
- Scraped Rightmove/Zoopla/OTM content without authorised rights
- Developer silently repairing every analysis mid-session
- Ownership of the subject property (not required)

### Operating-model blocker rule

If participants cannot get a real property into analysis without illegal scraping or staff fabrication → classify **E REAL PROPERTY ACQUISITION / OPERATING MODEL** and end with **BLOCKED**.

---

## 5. Funnel measurement

### Stages (ordered)

```
STARTED_ANALYSIS
→ RENT_BASIS_AVAILABLE
→ PURCHASE_PRICE_AVAILABLE
→ GROSS_YIELD_REACHED
→ UNDERWRITING_STARTED
→ OPERATING_INPUTS_COMPLETE
→ FINANCE_INPUTS_COMPLETE
→ NOI_ASSESSED
→ CASHFLOW_ASSESSED
→ DSCR_ASSESSED
→ LANDLORD_PD_ASSESSED
→ WHAT_IF_USED
→ ANALYSIS_COMPLETED
```

### Measurement sources (no broad analytics build)

| Stage | Source |
| --- | --- |
| STARTED_ANALYSIS … LANDLORD_PD_ASSESSED | Derived from persisted `ai_requests` (`property_intelligence`) via classifier script + facilitator checkpoint |
| WHAT_IF_USED | Facilitator observation (What-if does not persist via `saveAnalysis`) |
| ANALYSIS_COMPLETED | Facilitator: participant finished structured debrief |
| Abandonment reason | Facilitator script only |

**Instrumentation audit:** No product analytics SDK, no funnel event table, no client trackers found. Persisted analyses already store decision job, finance inputs, and assessed outputs. For a cohort ≤12, facilitator + classifier is sufficient.

**Production instrumentation this phase:** **ZERO**.

Optional later (out of scope unless measurement fails in practice): privacy-minimised `what_if_compared` boolean event without financial payloads.

---

## 6. Comprehension test (must ask, not assume labels)

Facilitator asks (paraphrase OK; record PASS/FAIL/PARTIAL):

| Probe | Correct gist |
| --- | --- |
| MARKET rent | Area asking-rent context — not guaranteed achievable for this property |
| Asking / purchase price | Input or listing figure — not assessed fair value |
| User inputs (costs, vacancy, mortgage) | Assumptions for this scenario — not observed property facts |
| What-if | Scenario overlay — not new canonical property intelligence |
| Gross yield alone | Not complete investment underwriting |
| NOT_ASSESSED | Missing / blocked — not zero, false, or “safe” |

---

## 7. Decision-value (concrete impact)

After the pack, score each YES / NO / UNSURE with a one-line example:

- SAVE TIME
- AVOID AN EXPENSIVE MISTAKE
- IDENTIFY A QUESTION TO INVESTIGATE
- UNDERSTAND FINANCIAL SENSITIVITY
- COMPARE ASSUMPTIONS
- CHANGE / CONFIRM A NEXT ACTION

Do **not** ask only “Did you like it?”

---

## 8. Return-use signal

Record separately:

| Signal | Definition |
| --- | --- |
| INTEREST | Positive reaction / curiosity |
| INTENT_TO_REUSE | Explicit “I would use this on another property” |
| ACTUAL_REUSE | Observed second property within observation window (if any) |

None of these equals PMF.

---

## 9. Input-burden diagnostic

For each underwriting field group, classify struggle as one of:

| Code | Meaning |
| --- | --- |
| DONT_KNOW_YET | Legitimate unknown at this stage |
| DONT_UNDERSTAND | Unclear meaning |
| TOO_MUCH_EFFORT | Understood but burdened |
| PLATFORM_SHOULD_KNOW | Expects automation/evidence |

Fields: vacancy, maintenance, insurance, management, service charge, ground rent, taxes, deposit, mortgage amount, interest rate, mortgage term, expected rent.

---

## 10. Rent-basis risk

When rent basis is MARKET (or market-substituted):

- Ask the MARKET≠achievable probe **before** facilitator explains
- Record overread if participant treats area rent as property rent certainty

Do **not** build Rental Engine V2 in this phase.

---

## 11. Output value codes

For each output: `HIGH_VALUE` | `UNDERSTOOD_LOW_VALUE` | `IGNORED` | `CONFUSING` | `MISLEADING`

Outputs: gross yield, NOI, net yield, cash flow, DSCR, Landlord PD, DI findings, unresolved dependencies, investigation priorities, sensitivity drivers, What-if.

---

## 12. Pre-declared success / failure criteria

Interpret **after** ≥5 sessions (or early-stop). Do **not** move thresholds post-hoc to claim success.

| Code | Evidence required |
| --- | --- |
| **A** CURRENT WEDGE VALIDATED ENOUGH TO CONTINUE GTM TESTING | ≥60% of completers reach NOI_ASSESSED **or** explicitly abandon with clear next action; ≥60% PASS MARKET≠achievable; ≥50% at least one concrete decision-value YES; no systemic operating-model failure |
| **B** INPUT EXPERIENCE IS DOMINANT BLOCKER | Majority abandon at UNDERWRITING_* with TOO_MUCH_EFFORT or DONT_UNDERSTAND; decision-value weak **because** incomplete pack |
| **C** RENTAL EVIDENCE IS DOMINANT BLOCKER | Majority fail MARKET comprehension **or** refuse to proceed without property-specific rent; cite rent as primary blocker |
| **D** DECISION SYNTHESIS IS DOMINANT BLOCKER | Complete pack reached but outputs mostly IGNORED/CONFUSING/MISLEADING; little decision-value despite ASSESSED metrics |
| **E** REAL PROPERTY / OPERATING MODEL DOMINANT BLOCKER | Cannot start legitimate analyses without scrapes/fabrication; ≥50% blocked before STARTED_ANALYSIS |
| **F** CURRENT LET WEDGE NOT STRONG ENOUGH | Completers reach pack but little INTENT_TO_REUSE and weak decision-value across A–F probes |

Small cohort ≠ PMF under any code.

---

## 13–15. Implementation boundaries

- No CRM, campaigns, onboarding engine, growth dashboard, billing, broad analytics
- No rental V2, valuation, AVM, BUY/SELL reopen, DI V2, deal score, formula changes, CapEx, Portfolio V2, ML, new provider, paid API, scraping, fake inventory, DIE, broad UI redesign

---

## 16. Privacy / data minimisation

Facilitator notes and result JSON may store:

- anonymised `participant_id` (P1…Pn)
- property id / analysis id (internal)
- funnel stage enums, comprehension PASS/FAIL, burden codes, output value codes
- free-text blockers **without** copying full finance payloads or provider dumps

Must **not** store unnecessary PII, raw provider payloads, or full mortgage/cost dumps in shared results files.

Classifier script reads existing `ai_requests` under normal DB access controls; does not emit financial amounts by default (stage booleans + rent basis enum only).

---

## 17. Results status

**REAL-USER RESULTS PENDING**

No participant sessions have been recorded in this phase preparation. Automated underwriting harness results are **not** a substitute.

---

## 18. Production changes

**ZERO** production application code.

Allowed artifacts only: this ADR, participant script, results template, read-only classifier.

---

## Recommended next action after real users

Fill `let-invest-limited-gtm-results-template.json` per session → aggregate → choose A–F → only then pick product gap letter if needed.

Until then: execute recruitment + facilitated sessions per protocol.
