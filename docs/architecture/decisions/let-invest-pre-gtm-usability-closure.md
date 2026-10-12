# Decision: LET_INVEST Pre-GTM Usability Closure (presentation only)

**Status:** PASSED — FACILITATED_VALIDATION_CAN_BEGIN  
**Date:** 2026-09-09  
**Phase:** V1.2 small bounded UI closure (no methodology / no new intelligence)

Closes audit gate **B** (`let-invest-pre-gtm-ui-ux-readiness-audit.md`) so facilitated GTM measures product value rather than obvious UI confusion.

---

## Scope completed

| ID | Fix |
| --- | --- |
| A | Rent presentation safety — MARKET/LISTING/SCENARIO wording; removed “Recommended rent” label on IntelligenceReport; What-if “Scenario rent input” |
| B | LET underwriting unlock guide + progressive blank≠zero copy on `FinanceScenarioForm` when `decisionJob=LET_INVEST` |
| C | `fieldWrap` on all underwriting keys referenced by missing-input CTAs |
| D | Replaced Property Intelligence `.env` / API-key setup with user-facing external-lookup unavailable copy |
| E | Gross yield “early orientation” label/note/tile when deeper LET metrics remain NOT_ASSESSED |

Parked (unchanged): job-specific loading stages, AVM panel, DI dedupe, broad responsive redesign, RentResultView (separate Rent Intelligence surface).

---

## Production files changed

- `client/src/components/ai/FinanceScenarioForm.js` / `.css` / `.test.js`
- `client/src/components/ai/IntelligenceReport.js` / `.css` / `.test.js`
- `client/src/components/ai/WhatIfPanel.js` / `.test.js`
- `client/src/pages/ai/PropertyIntelligence.js`
- `client/src/pages/ai/PropertyIntelligence.preGtmUsability.test.js` (new)

No server production changes.

---

## Verification

- Focused presentation/usability tests: pass
- Full client: **22/22** suites, **180/180** tests
- Production build: successful (run in same phase)
- Server suite: not required (no server production edits)

---

## Remaining residual risk (observe in GTM)

- Early yield abandonment behaviour (mitigated, not eliminated)
- Cognitive burden of full cost form
- AVM attribute panel mid-LET (P2 parked)
- Separate `RentResultView` still says “Recommended rent” outside Property Intelligence LET report

No open P0/P1 from the audit MUST-FIX list on the LET Property Intelligence path.

---

## Next

Resume **V1.2 — LET_INVEST Limited Real-User GTM Validation** (`let-invest-limited-gtm-validation.md`). Do not start engines.
