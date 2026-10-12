# Property Intelligence Platform

This file is the **vision and architecture** source of truth.

It is not the implementation-status ledger. See `implementation-status.md` for what the code actually supports today. See `roadmap.md` for ordered future work.

## Vision

ONE property intelligence platform.

Not a residential-only AI tool, not disconnected analyst products, not one generic valuation formula, and not a chatbot that invents missing property facts.

Intended stack:

```
PROPERTY / LAND / BUILDING / UNIT / TITLE / PROJECT
        → SUBJECT IDENTITY
        → ASSET CLASSIFICATION
        → EVIDENCE + PROVENANCE + TIME
        → DOMAIN APPLICABILITY
        → METHODOLOGY APPLICABILITY
        → SPECIALISED DOMAIN ENGINES
        → ASSESSMENT STATES
        → DECISION INTELLIGENCE
        → USER DECISION / INVESTIGATION
```

The shared kernel owns identity, classification, evidence, provenance, assessment semantics, snapshots, privacy, applicability, and orchestration.

The shared kernel does **not** own one methodology for every asset class.

## Current architecture

Runtime (canonical Property Intelligence analyse):

```
REQUEST
  → access / subject resolution
  → identity (listing / subject / canonical PAON/SAON / optional unique UPRN)
  → asset classification
  → evidence retrieval (listing, official HMLR PPD query, official MHCLG EPB, PropertyData overlay, open data, private legal docs)
  → residential methodology gate (valuation + rent)
  → finance / confidence / Personal Decision (job-routed) / Decision Intelligence (LET_INVEST) / residential decision workspace
  → live domains: MARKET, PLANNING, ENVIRONMENT, LEGAL_TITLE, BUILDING_CONDITION (energy/physical only)
  → presentation
  → immutable AiRequest snapshot
```

Parallel surfaces exist and are not the kernel: Investment Analyst, Rent Intelligence, Portfolio Optimiser, legacy `/valuation`.

What-if is scenario intelligence. Scenario ≠ canonical fact.

History renders the saved snapshot. It must not re-analyse.

## Asset classes

`RESIDENTIAL` `COMMERCIAL` `INDUSTRIAL` `AGRICULTURAL` `LAND` `DEVELOPMENT_SITE` `MIXED_USE` `UNKNOWN`

`UNKNOWN` is valid. `UNKNOWN` is not secretly `RESIDENTIAL`.

A versioned temporary compatibility path may still run the current residential product when class is `UNKNOWN`. That path does not classify the asset as residential.

## Truth principles

FACT ≠ ASSUMPTION. UNKNOWN ≠ FALSE. UNKNOWN ≠ ZERO. MISSING ≠ ZERO. EMPTY ≠ NONE. NOT_ASSESSED ≠ FAILED. NOT_APPLICABLE ≠ NOT_ASSESSED. AREA_CONTEXT ≠ SUBJECT FACT. DOCUMENT ≠ FACT. UPLOAD ≠ VERIFICATION. PROPERTY ≠ TITLE. UPRN ≠ TITLE NUMBER. INSPIRE ID ≠ TITLE NUMBER. PROPERTY ≠ BUILDING. BUILDING ≠ UNIT. LAND ≠ BUILDING. DEVELOPMENT_SITE ≠ DEVELOPMENT_PROJECT. SCENARIO ≠ CANONICAL FACT. ASKING PRICE ≠ ACHIEVED PRICE. CURRENT VALUE ≠ GDV. TRANSACTION ≠ COMPARABLE. OFFICIAL SALE ≠ CURRENT VALUE.

## LLM boundary

Deterministic systems decide eligibility and arithmetic. LLMs may explain structured assessed facts. LLMs must not invent valuations, rents, legal restrictions, planning permission, defects, costs, title facts, confidence, or outcomes.

## Related documents

| Document | Role |
| --- | --- |
| `implementation-status.md` | What is implemented today |
| `roadmap.md` | NOW / NEXT / LATER / PARKED / BLOCKED |
| `decisions/product-intelligence-review.md` | 2026-09-01 product/decision checkpoint; next capability was a residential decision workspace, not more empty domains |
| `decisions/post-avm-product-value-review.md` | Post-AVM checkpoint; selected Official HMLR comparable assessment; AVM parked |
| `decisions/post-comparable-decision-value-review.md` | Post-comparable checkpoint; next is BUY/SELL pack real-product validation (no new capability) |
| `decisions/post-comparable-buy-sell-pack-validation.md` | BUY/SELL pack validation after comps v1.1; BUY/SELL not yet strong wedge; MARKET_CONTEXT potentially misleading in key tiles |
| `decisions/market-context-presentation-integrity.md` | MARKET_CONTEXT demoted from assessed key styling to supporting context |
| `decisions/let-invest-decision-coverage-next-gap-review.md` | LET wedge coverage checkpoint; next is minimal/partial/complete underwriting real-product validation |
| `decisions/let-invest-underwriting-real-product-validation.md` | LET minimal/partial/complete validation; ready for limited GTM test |
| `decisions/let-invest-limited-gtm-validation.md` | Limited real-user GTM protocol; results pending; no PMF |
| `decisions/let-invest-pre-gtm-ui-ux-readiness-audit.md` | Pre-GTM UI audit; small presentation closure before facilitated users |
| `decisions/let-invest-pre-gtm-usability-closure.md` | Presentation-only closure; facilitated validation can begin |
| `decisions/let-invest-limited-gtm-participant-script.md` | Facilitator script for LET GTM sessions |
| `decisions/let-invest-limited-gtm-results-template.json` | Session results template (empty pending) |
| `decisions/residential-decision-workspace.md` | Implemented V1 workspace: BUY / LET_INVEST / SELL presentation of existing assessed intelligence |
| `data-sources.md` | Live data sources and limits |
| `decisions/cross-asset-market-data-acquisition.md` | Official HMLR PPD ingest decision and current implementation limits |
| `decisions/physical-property-identity-source.md` | Official MHCLG EPB source decision |
| `decisions/official-epb-evidence.md` | Implemented EPB acquisition, licensing, and identity semantics |
| `v1.2-platform-foundation.md` | Historical kernel contract notes |
| `v1.2-property-identity.md` | Classification and methodology gate; canonical subject identity notes |
| `decisions/subject-identity-completeness.md` | Listing identity contract, unique UPRN gate, live coverage |
| Domain `v1.2-*-foundation.md` files | Domain-specific contracts |
