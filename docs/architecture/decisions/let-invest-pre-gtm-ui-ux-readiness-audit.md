# Decision: LET_INVEST Pre-GTM UI/UX Usability Readiness Audit

**Status:** AUDIT COMPLETE — SMALL PRE-GTM CLOSURE REQUIRED  
**Date:** 2026-09-09  
**Phase:** V1.2 PRE-GTM usability readiness gate (audit only; **zero** production changes)

Question: Can a normal UK landlord / BTL investor use the **current** interface to complete the LET_INVEST job without developer knowledge, such that facilitated GTM measures product value rather than obvious UI breakage?

Does **not** reopen methodology, finance formulas, PD, DI, What-if dimensions, rental engine, or valuation.

---

## Pre-flight

| Item | State |
| --- | --- |
| LET wedge | Strongest; BUY/SELL parked |
| Underwriting methodology | Minimal→partial→complete technically validated |
| Limited GTM protocol | READY; real-user results PENDING |
| UI/UX for facilitated sessions | **Not previously gated** — this audit |
| Dirty worktree | Preserved; no commit/push/tag/clean/reset/stash |
| Production changes this phase | **ZERO** |

Sources inspected (implementation, not intent):

- `client/src/pages/ai/PropertyIntelligence.js` (+ CSS)
- `client/src/components/ai/DecisionJobSelector.js`
- `client/src/components/ai/FinanceScenarioForm.js` (+ CSS)
- `client/src/components/ai/IntelligenceReport.js` (+ CSS) — especially `DecisionWorkspacePanel`
- `client/src/components/ai/WhatIfPanel.js`
- `client/src/components/ai/SubjectAttributeCompletionPanel.js`
- `client/src/Utils/underwritingInputDisplay.js`, `financeScenario.js`, `decisionWorkspaceDisplay.js`
- GTM protocol ADR + participant script

---

## Executive verdict

The LET decision workspace and underwriting-gap → focus path are **real and usable with friction**. Progressive unlock is communicated **after** analysis better than before. Rent-basis disclosure exists but is easy to miss beside assessed **gross yield** and a **Recommended rent** tile. The pre-analyse finance UI still reads as a **long optional technical form**, not a guided incomplete→complete underwriting workflow. Facilitated sessions would currently require **frequent facilitator rescue** (form navigation, rent semantics, valuation/AVM side panels, occasional provider-setup copy).

**Gate: B — SMALL_PRE_GTM_USABILITY_CLOSURE_REQUIRED**

Not a full redesign. Not “workflow unusable.” Not “ready as-is.”

---

## Actual LET user journey (as implemented)

1. Sign in → Property Intelligence (`PropertyIntelligence.js`)
2. Search UK postcode/address **or** mine/saved/browse tabs → select property → preview
3. Choose intent (`DecisionJobSelector`: Buy / Let·Invest / Sell)
4. Fill **full** `FinanceScenarioForm` (shown as optional scenario) → **Analyse Property**
5. Loading stages (includes sale valuation / comparables language)
6. `IntelligenceReport` hero (Landlord fit + Evidence strength) → `DecisionWorkspacePanel` (key tiles, rent-basis line, missing inputs, unresolved, findings, next investigate)
7. `DecisionIntelligenceSection` (often overlapping workspace DI surfaces)
8. Collapsed/open `ReportSection`s: financial/market, price, rent intelligence, planning/environment/etc.
9. `WhatIfPanel` (duplicate finance form + compare)
10. Optional `SubjectAttributeCompletionPanel` when valuation subject gaps present

---

## Scorecard

| Dimension | Rating | Evidence |
| --- | --- | --- |
| ENTRY / ORIENTATION | USABLE_WITH_FRICTION | How-it-works + job selector clear; empty hero still sells valuation/comps before intent |
| PROPERTY CONTEXT | READY | Preview shows address, price, rent, beds; report hero repeats identity |
| INPUT COMPLETION | NOT_READY | Long “optional” form; weak unlock guidance pre-analyse; incomplete field focus refs |
| PROGRESSIVE DISCLOSURE | USABLE_WITH_FRICTION | Post-analyse gaps + “Add your input” / unlock labels good; pre-analyse does not teach MIN→PARTIAL→COMPLETE |
| RENT-BASIS CLARITY | NOT_READY | Disclosure present but muted; “Recommended rent” + What-if “Expected / market rent” overread risk |
| FINANCE COMPREHENSION | USABLE_WITH_FRICTION | Blank≠0 and hints exist; NOI dependency explained in workspace/howToResolve more than on each cost field |
| RESULT HIERARCHY | USABLE_WITH_FRICTION | Workspace first; assessed gross yield numbers dominate eye vs NOT_ASSESSED tiles; long report below |
| NOT_ASSESSED CLARITY | READY | Badges + howToResolve + supporting copy (“not £0”) |
| WHAT-IF CLARITY | USABLE_WITH_FRICTION | Strong “does not change saved analysis” copy; engine jargon; rent row label conflates bases |
| NEXT ACTION | USABLE_WITH_FRICTION | Strong after analyse for finance gaps; weak before analyse; investigation list competes with form |
| SUPPORTING EVIDENCE | USABLE_WITH_FRICTION | Folded sections help; rent/price/AVM panels can still overwhelm LET job |
| ERROR STATES | USABLE_WITH_FRICTION | Finance invalid + credit notices OK; PropertyData `.env` setup shown to end users |
| RESPONSIVE USABILITY | USABLE_WITH_FRICTION | Mobile single-column metric grids; dense form + long scroll remain |
| FACILITATED-SESSION READINESS | NOT_READY | Expect facilitator rescue on rent semantics, form burden, and valuation-side chrome |

---

## P0 / P1 / P2 / P3 issues

| ID | Severity | Issue | Where |
| --- | --- | --- | --- |
| R1 | **P0** | User can overread area/model rent as property-achievable rent. “Recommended rent” tile + What-if label “Expected / market rent” + muted rent-basis line under assessed yield. | `IntelligenceReport` Rent intelligence; `WhatIfPanel` comparison row; workspace rent-basis `<p className="pi-muted">` |
| R2 | **P1** | Pre-analyse finance UI = long technical form titled optional; does not communicate which inputs unlock yield vs NOI vs CF/DSCR before first run. Facilitator must teach the progressive pack. | `FinanceScenarioForm` intro; `PropertyIntelligence` order |
| R3 | **P1** | “Enter {field}” / “Add your input” only `fieldWrap`s `purchasePrice`, `expectedRent`, `vacancyAssumption`. Other underwriting keys scroll to form top without focusing the field. | `FinanceScenarioForm.js` |
| R4 | **P1** | End-user copy can show `server/.env` / API-key setup when external lookup inactive — forces developer rescue in GTM. | `PropertyIntelligence.js` external unavailable branch |
| R5 | **P1** | Early assessed **gross yield** (numeric tile) can dominate before NOI/CF/DSCR exist; risk of “done” abandonment before complete underwriting — known product risk, UI amplifies it. | `DecisionWorkspacePanel` key grid |
| I1 | **P2** | Loading STAGES always mention sale valuation / comparables during LET runs. | `PropertyIntelligence.js` `STAGES` |
| I2 | **P2** | Empty-state marketing promises valuation + comps before job selection. | `pi-empty-hero` |
| I3 | **P2** | AVM `SubjectAttributeCompletionPanel` can appear mid LET workspace — valuation architecture leak into rental underwriting. | after missing underwriting block |
| I4 | **P2** | DI duplicated: workspace findings/next actions + full `DecisionIntelligenceSection`. | `IntelligenceReport` |
| I5 | **P2** | What-if lead mentions “engines”; PD profile radios may confuse when job is LET. | `WhatIfPanel.js` |
| I6 | **P2** | Operating costs split: “Property costs” (SC/GR) vs “Operating assumptions” without unlock map on maintenance/insurance. | `FinanceScenarioForm` |
| I7 | **P2** | Long scroll: workspace → DI → many ReportSections → What-if; supporting evidence can feel like a database dump after the decision pack. | report composition |
| P1 | **P3** | Polish: chip density, print toolbar, history confidence “earlier model”, etc. | various |

---

## Screen / component map (excerpt)

| User step | Screen / component | Expected action | Current UX | Problem | Sev |
| --- | --- | --- | --- | --- | --- |
| Find property | `PropertyIntelligence` UK lookup / tabs | Select real subject | Search + lists work | Multi-path (mine/browse/UK/external); `.env` on failure | P1/P2 |
| Choose LET | `DecisionJobSelector` | Select Let / Invest | Clear legend + hints | Purpose OK; “existing landlord methodology” jargon mild | P3 |
| Underwrite | `FinanceScenarioForm` | Enter assumptions | All sections visible; blank≠0 explained | Not guided workflow; unlocks unclear pre-run | P1 |
| Run | Analyse button + STAGES | Wait | Works | Valuation-centric stage labels | P2 |
| Read pack | `DecisionWorkspacePanel` | Understand metrics + gaps | Tiles + badges + focus CTAs | Yield prominence; rent line muted | P0/P1 |
| Complete inputs | focus buttons → form | Land on field | Section dim works for LET | Most fields lack focus refs | P1 |
| Rent truth | Rent section + basis line | Understand MARKET≠achievable | AREA CONTEXT on some tiles | Recommended rent + What-if conflation | P0 |
| What-if | `WhatIfPanel` | Scenario vs canonical | Explicit non-persist copy | Heavy duplicate form; rent label | P2/P0 |
| Next action | missing inputs / investigate | Know next step | Strong post-analyse for finance | Weak pre-analyse; competing panels | P2 |

---

## Facilitated-session feasibility

| Need | Status |
| --- | --- |
| Facilitator introduction (intent, blank≠0, analyse then fill gaps) | Acceptable |
| Facilitator rescue (which fields, what MARKET means, ignore AVM panel, ignore .env) | **Likely frequent** |
| Protocol comprehension probes without UI trapping | At risk if Recommended rent / yield dominate |

Conclusion: **not** ready for unrescued facilitated validation; **small** presentation/guidance closure can make validation measure product value.

---

## MUST FIX BEFORE REAL USERS (minimum pre-GTM closure)

Scoped presentation/guidance only — **no methodology**:

1. **Rent safety presentation:** Make LISTING / MARKET(area asking) / SCENARIO / model-estimate visually unmistakable wherever rent figures appear (workspace, rent section, What-if). Soften or contextualise “Recommended rent” for LET. Fix What-if “Expected / market rent” label.
2. **LET underwriting guidance:** Before/around the form, communicate progressive unlock (yield vs NOI vs CF/DSCR) without changing the contract; make “optional” not mean “unimportant for complete pack.”
3. **Focus targets:** Wrap/focus all underwriting fields used by missing-input CTAs.
4. **Facilitated path hygiene:** Ensure GTM sessions are not forced through PropertyData `.env` developer instructions (inventory / already-resolvable subjects, or hide setup from non-admin UX).

## CAN OBSERVE DURING VALIDATION

- Whether gross-yield early exit happens despite clearer rent labels
- Cognitive burden of cost frequencies
- Whether Landlord PD / DI are used once complete
- What-if adoption with existing dimensions

## POST-VALIDATION POLISH

- Job-specific loading stages
- Collapse/de-emphasise valuation attribute panel on LET unless needed
- Deduplicate DI surfaces
- Broader IA / mobile density polish

---

## GTM gate

**B — SMALL_PRE_GTM_USABILITY_CLOSURE_REQUIRED**

Recommended next phase name:

**V1.2 — LET_INVEST Pre-GTM Usability Closure (presentation only)**

Then resume facilitated GTM (protocol already written).

---

## Production changes / git

- Production code: **unchanged** this phase  
- This ADR + roadmap pointer only  
- Dirty worktree preserved; no commit / push / tag / clean / reset / stash
