# V1.2 — AVM Completion UX & Provider-Fit Proof
## Architecture Decision Record

**Phase:** V1.2 (product validation)  
**Status:** COMPLETE  
**Live `/valuation-sale` calls:** **0** (no legitimate fully-complete live subject without invented facts)  
**Cohort:** same 6 genuine HMLR subjects — facts not invented  

---

## Finish-quality user semantics (provider-request only)

| Provider enum | User-facing label | Notes |
|---|---|---|
| `very_high` | Very high finish | Impression only — not a survey |
| `high` | High finish | 1:1 mapping |
| `average` | Average finish | No preselection |
| `below_average` | Below-average finish | 1:1 mapping |
| `unmodernised` | Unmodernised | 1:1 mapping |

Presented as: **USER-REPORTED property finish / modernisation level**  
Not: official evidence, Building Condition, survey, or platform-derived fact.  
No default. No EPC/photo/text/price/LLM/ML inference.

---

## Completion UX

Minimal panel in Residential Decision Workspace (`SubjectAttributeCompletionPanel`):

- Shows only fields in structured `missingFields`
- Preloads existing subject attributes
- Blank = UNKNOWN (not zero/none)
- Explicit 0 / `none` supported
- Saves via `PUT .../subjects/:id/attributes` with USER_REPORTED provenance
- Optional dry-run readiness via `propertyContext` (never calls provider)

---

## Provider-fit measurement (subject lacking listing-bound facts)

| Question | Count / class |
|---|---|
| User questions required | **5** |
| Objective (user-knowable property facts) | **4** — bedrooms, bathrooms, outdoor, parking |
| Subjective / provider-specific | **1** — finish_quality enum |
| Platform value independent of PropertyData | beds, baths, outdoor, parking |
| Exists solely to unlock PropertyData | finish_quality |

**Fit rating: CONDITIONAL_FIT**

Objective facts are acceptable product burden and improve the platform.  
`finish_quality` is honest-as-explicit-user-input but is pure provider friction — acceptable if clearly labelled; not strong enough alone to declare unsuitable, not weak enough to force a new provider in this phase.

---

## Classification

**F — LEGITIMATE_COMPLETE_SUBJECT_NOT_AVAILABLE_FOR_LIVE_PROOF**

UX completion path and finish-as-explicit-input are proven in controlled fixtures.  
Genuine 6-subject cohort remains incomplete by design (no invented facts) → **0 live `/valuation-sale`**.

Provider-fit (supporting): **CONDITIONAL_FIT** — four objective facts are platform-valuable; `finish_quality` is acceptable only as clearly labelled USER-REPORTED provider-request input (not canonical).

---

## Verdict

**AVM COMPLETION UX PASSED — LIVE PROOF STILL DATA-BLOCKED**
