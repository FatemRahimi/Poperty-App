# Decision: Residential decision workspace V1

**Status:** IMPLEMENTED  
**Date:** 2026-09-01  
**Contract:** `residential-decision-context-1.0.0`  
**Phase:** V1.2 presentation / routing of existing assessed intelligence

This is not a new intelligence engine, score, provider, or methodology family.

## Contract

User intent is stored separately from property identity.

```
residentialDecisionContext
  contractVersion: residential-decision-context-1.0.0
  decisionJob: BUY | LET_INVEST | SELL
  assetClass
  subjectRef
  selectedAt
  provenance.source: USER_SELECTED | UNSPECIFIED_ASSEMBLE_COMPATIBILITY | LEGACY_LANDLORD_SNAPSHOT
```

HTTP analyse requires an explicit job. The client may send `decisionJob` and legitimate finance inputs. The client cannot inject `personalDecision`, `decisionIntelligence`, `decisionWorkspace`, valuations, scores, or assessment states.

Direct `assemblePropertyIntelligenceReport` without a job keeps **Let / Invest compatibility** so existing engine callers remain numerically stable. That path is not a product default and is not Buy or Sell.

## Supported jobs

| Job | Meaning |
| --- | --- |
| `BUY` | Assess the dwelling as a purchase |
| `LET_INVEST` | Assess the dwelling as a rental holding |
| `SELL` | Assess asking-price / valuation context for a sale |

Unsupported in this UX: `HOLD`, `REFINANCE`, `RENOVATE`, `DEVELOP`, `COMMERCIAL_OCCUPATION`, `PORTFOLIO`.

## Job → existing intelligence

| Output | BUY | LET_INVEST | SELL |
| --- | --- | --- | --- |
| Residential valuation range | if assessed | if assessed | if assessed |
| Asking-price position | if assessed | if assessed | if assessed |
| `buyer_general` Personal Decision | yes; missing prefs stay NOT_ASSESSED | not primary | no |
| Landlord Personal Decision | not a Buy conclusion | unchanged | no |
| Decision Intelligence V1 | not used as Buy conclusions | unchanged | no |
| Gross yield / NOI / cash flow / DSCR | optional labelled investment view only if already assessed | only when canonical inputs exist | no |
| What-if | `buyer_general` only | existing landlord / buyer_general | not applicable |
| Planning / flood / heritage / EPB | supporting evidence | supporting evidence | supporting evidence |

No BUY SCORE, SELL SCORE, investment score, or opportunity score is created.

## Personal Decision routing

- `LET_INVEST` → `scorePublicLandlordPersonalDecision` (frozen landlord weights).
- `BUY` → `scorePublicBuyerGeneralPersonalDecision`. Affordability / location / transport stay NOT_ASSESSED without stated preferences. Not a buy score.
- `SELL` → no Personal Decision methodology. No seller score.

## Decision Intelligence routing

DI V1 remains landlord / BTL. `LET_INVEST` may use it. `BUY` and `SELL` attach `decisionIntelligence.applicable = false` and do not present landlord findings as job conclusions.

## What-if

Deterministic scenario engine. Does not overwrite the canonical snapshot or `ai_requests` rows. `SELL` is not applicable. `BUY` does not run landlord What-if as a Buy conclusion.

## Legacy snapshots

Historical analyses without `residentialDecisionContext` are **not rewritten**. They remain readable on the original landlord-framed report. They are not reinterpreted as Buy or Sell. If a compatibility context is derived at read time, it is Let / Invest only.

## UX hierarchy

Property header → decision context → key intelligence → unresolved → why it matters / next actions → scenarios → supporting evidence (market, planning, environment, EPB, facts). Evidence is not the spine.

Assessment badges use kernel states: ASSESSED, NOT_ASSESSED, INSUFFICIENT_EVIDENCE, NOT_APPLICABLE, INVALID_INPUT, UNAVAILABLE. Missing evidence is not false, zero, or a failed product.

## Methodology boundaries

No change to valuation weights, HMLR matching, EPB exact matcher, finance formulas, landlord PD weights, or DI V1. Asset-class gates are unchanged. UNKNOWN is not classified as RESIDENTIAL.

## Not implemented here

DI V2, new scores, commercial/industrial valuation, lease/ERV, bounded EPB re-acquisition, OS Open UPRN, Scotland/NI EPC, Legal Phase 9.3, professional building condition, CapEx, development feasibility, Project Cost live wiring, Portfolio V2, ML/calibration, paid identity lookup.
