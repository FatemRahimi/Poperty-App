# Property App — Project Master State

Last updated: 2026-10-23
Canonical working branch: `temp-branch`
Repository: `FatemRahimi/Poperty-App`

## Purpose

This document is the durable project-state handoff for the UK Property Decision Intelligence Platform. It records the accepted product direction, roadmap, verified milestones, important constraints, known limitations, and the next intended phase. Code and independently verified commits remain the implementation source of truth; this document must not override contradictory code evidence.

## Product Vision

Build a UK Property Decision Intelligence Platform, not merely a listing search product, dashboard, or property chatbot.

Core journey:

`UK Market → City → Area → Development → Exact Property → Financial / Investment Decision`

Core intelligence chain:

`Real Data → Statistical/Data Analysis → Evidence Engine → Investigation → Relationships → AI Reasoning → Decision Support`

The platform should help users discover and investigate property opportunities, understand supporting and counter-evidence, identify unknowns, see relationships between evidence, understand financial consequences, and decide what to investigate next.

## Product Truth Rules

The platform must distinguish:

- FACT — observed/source-backed data.
- DERIVED ANALYSIS — deterministic calculations or comparisons from evidence.
- INFERENCE / FORECAST — uncertain interpretation, explicitly labelled.
- UNKNOWN — evidence is absent, insufficient, unresolved, or unavailable.
- COUNTER-EVIDENCE — evidence that weakens a thesis.
- INVESTIGATE NEXT — evidence or action needed before a stronger conclusion can be made.

AI must not invent facts, prices, growth, valuations, evidence, or missing data. Missing evidence must not silently become zero. Historical evidence must not silently become a forecast.

## Differentiation Thesis

Do not compete primarily on “smarter AI.”

The intended differentiation is an evidence-driven property decision system that combines:

- data provenance;
- historical state;
- deterministic analytics;
- evidence quality and sufficiency;
- explicit uncertainty;
- counter-evidence;
- investigation;
- evidence relationships;
- comparison;
- deep exact-property intelligence;
- financial consequences;
- persistent decision state.

Potential core differentiator: Opportunity Discovery Engine. A user provides strategy, budget, risk and horizon; the system searches supported UK evidence, identifies areas/opportunities worth investigating, shows why, shows counter-evidence and unknowns, recommends what to investigate next, and allows drill-down to development and exact property intelligence.

Feature gate: ask why a user would use Property App instead of a general AI assistant or established property-data/search tools. Do not build commodity features unless they materially strengthen evidence-backed property decision capability.

## Frontend / UX Direction

The product must not be Chat-first.

Target interaction model:

`Guided Tools + Automatic Intelligence + Embedded AI Copilot`

The main frontend should be an interactive Property Decision Workspace / Evidence Explorer. Users without property expertise should not need to know which searches or questions to perform. Guided journeys should collect simple goals and constraints, then invoke the appropriate tools automatically.

AI chat should be embedded in tools and able to explain or orchestrate evidence-backed tools. It must not replace the tools or bypass the evidence engine.

Top-level journeys:

1. Buy a Home
2. Invest in Property
3. Property Professional

Examples of eventual tool families include affordability, location/area discovery, market evidence, tax and buying costs, mortgage/cash needed, property intelligence, leasehold, EPC/energy, risk, planning/development, BTL/rental analysis, comparison, evidence/unknowns/investigation, and decision dossiers.

## Buyer Evidence Coverage Target

The mature Buy-a-Home journey should cover, where real evidence and lawful data access support it:

- property identity and legal evidence;
- tenure, lease length, service charge and ground rent;
- price, sold comparables and market evidence;
- affordability, deposit, LTV and mortgage context;
- tax / SDLT and purchase costs;
- EPC and energy evidence;
- property condition / survey evidence boundaries;
- flood and environmental risk;
- planning and development context;
- area, neighbourhood, transport, schools and amenities with appropriate evidence boundaries;
- demographic and economic context;
- buyer preferences, kept separate from purchase truth;
- resale/marketability evidence where supportable;
- evidence quality, unknowns, counter-evidence and investigate-next actions;
- financial consequences and decision dossier.

A Buyer Evidence Coverage Audit must be performed before the First-Time Buyer phase is considered complete so categories are not silently omitted.

## Canonical Repository Context

Local canonical checkout previously verified:

`E:\laptop mac\New folder\property-main (1)`

GitHub repository:

`FatemRahimi/Poperty-App`

Remote:

`https://github.com/FatemRahimi/Poperty-App.git`

Active branch:

`temp-branch`

Do not copy or cherry-pick from previously identified wrong/old checkouts without explicit independent verification.

## Accepted Milestones

### Phase 0 — Product / Code / Data Audit
Status: DONE.

Established that the strongest existing layer is the exact-property evidence/decision chain rather than commodity listing/search functionality. Opportunity discovery was not yet honestly supported.

### Phase 0.5 — Data & Licensing Foundation
Status: DONE sufficiently for current roadmap progression.

Licensing/usage restrictions remain evidence-source specific and must continue to be checked before production use.

### Phase 2 Decision Truth Hardening
Accepted commit: `a3fb337cef48bf5bb25be206537f5b0e6983fbc1`
Status: PASS.

### Product Capability Blueprint
Accepted commit: `1b763bf5fd4dce6a76299cdd07e4f2c6bd350a7e`
Status: PASS.

### P0 One-Property Decision Dossier Presentation
Accepted commit: `550199531e4ac8d4e421382cd00155d1228bdda7`
Status: PASS.

Key accepted behavior includes separation of purchase conclusion from preference fit; Known/Unknown/N/A/Investigate Next/Context Only; missing values not converted to £0; careful rent and school evidence boundaries; unresolved identity remains Unknown.

### Sold Comparable Binding / Deeper Property Evidence
Accepted commit: `4a70134d4b80e856fd25cafecc407a6f239f946a1`
Status: PASS.

Sold-price evidence is market context, not an automatic valuation or purchase recommendation. Explicit £0 values and unknown values remain semantically distinct.

### Automatic Decision Investigation v1
Accepted commit: `8e72775d22463c86fd94636833f2cf041e11510e`
Status: PASS.

Introduced deterministic investigation items with importance and resolution classes. No lender invention, budget=deposit assumption, or unknown=zero behavior.

### Relationship Intelligence v1
Accepted commit: `dc2be7d4b63d24389dacfaac443f6a8e5538ec76`
Status: PASS.

Relationships are separate from investigation and do not create purchase recommendations.

### Property Comparison Intelligence v1
Accepted commit: `3918f995ccecd7b1e77628c9761d4bc7885adf9f`
Status: PASS.

Two stored BUY decisions can be compared without selecting a purchase winner. Asking-price differences are factual, not automatic value judgments. Uncertainty does not equal property quality. Known limitation: user-facing saved-home selection flow remains incomplete.

### Phase 1A — Official Market Data Foundation
Accepted commit: `0b621fbd108b0676688cc5e7d6a50ab8a222ae9d`
Status: PASS.

Established UKHPI as a separate official observation model from canonical HMLR Price Paid transactions, with provenance, coverage states, explicit parser behavior and import-run tracking.

### Phase 1B — Production UKHPI PostgreSQL Persistence
Accepted commit: `ded4c243338b8b819204de484d9d4c6b54c4f3d4`
Status: PASS.

Added PostgreSQL persistence interface while retaining memory store. No interpolation/extrapolation or growth calculation at the persistence layer.

Known limitation: LIVE POSTGRESQL INTEGRATION NOT VERIFIED.

### Phase 1B.5 — Canonical Geography + Official Observation Integrity
Implementation commit: `7033b45e307f0ef1674c2cda7cc688d2367d6bf5`
Initial audit found unsafe release ordering and required a fix.

### Phase 1B.5 Fix — Release Selection Truth Hardening
Accepted commit: `3321d398027391565f8134b82f51e56bd36d1a5c`
Status: PASS.

Multiple releases are only chronologically resolved when successful candidate release labels are safely date-comparable. Arbitrary text labels are not lexically treated as publication chronology. Ambiguity propagates instead of fabricating an effective release.

Non-blocking known issue: release-date validation should eventually reject impossible calendar dates more strictly.

### Phase 1C — Official Market Analytics Engine v1
Initial implementation commit: `f9a5ee9c24a8c8eb23b0a546295b7d8b6ca8ad2f`
Independent audit required transaction truth hardening.

### Phase 1C Fix — Official Transaction Analytics Truth Hardening
Accepted commit: `e14cb5df7688b48a2a66aa50615fb3683076823c`
Commit message: `fix: harden official transaction analytics`
Status: PASS.

Accepted semantics:

- usable official transactions are separated from usable price observations;
- `transactionCount` counts usable transactions;
- `priceSampleCount` counts usable price evidence;
- median sufficiency depends on `priceSampleCount`, minimum sample 5;
- missing/invalid prices do not become £0;
- unavailable/error/not-imported coverage does not become zero transactions;
- transaction activity is FACT; median sold price is DERIVED;
- provenance distinguishes transaction count from price sample count;
- no ranking, forecast, recommendation, AI or Phase 2 behavior was introduced.

Phase 1C is CLOSED.

## Current Roadmap

- Phase 0 — Product / Code / Data Audit — DONE
- Phase 0.5 — Data & Licensing Verification/Foundation — DONE sufficiently
- Phase 1A — Official Market Data Foundation — DONE
- Phase 1B — Production UKHPI PostgreSQL Persistence — DONE
- Phase 1B.5 — Canonical Geography & Official Observation Integrity — DONE
- Phase 1B.5 Fix — Release Selection Truth Hardening — DONE
- Phase 1C — Official Market Analytics Engine v1 — DONE
- Phase 2 — Area & Economic Intelligence — NEXT
- Phase 3 — Planning & Development Intelligence
- Phase 4 — Broader Evidence Relationships / Market Intelligence
- Phase 5 — Opportunity Discovery Engine
- Phase 6 — BTL Intelligence
- Phase 7 — Deep Property Intelligence — substantial exact-property layer already exists; do not rebuild it
- Phase 8 — First-Time Buyer Decision Intelligence
- Phase 9 — Professional / Consultant Workspace

Do not casually change this roadmap. If evidence requires a change, label it `PROPOSED ROADMAP CHANGE`, document evidence, effects, counterarguments and tradeoffs, and do not silently implement the change.

## Next Intended Step

Phase 2 — Area & Economic Intelligence.

Before implementation, verify source feasibility, licensing, geography compatibility and current code support. Prefer the smallest evidence-backed vertical slice. Candidate official evidence families include population/demographic context, employment/economic activity or income where geography-compatible, deprivation, and housing/household context.

Phase 2 must preserve structured evidence objects with provenance, coverage, sufficiency, limitations and FACT/DERIVED/INFERENCE/UNKNOWN boundaries. It must not yet rank investment opportunities or forecast future growth.

## Later Commercial Direction

Primary early monetisation hypothesis:

- Investor SaaS subscription;
- Professional SaaS / decision workspace;
- paid decision dossiers/reports where useful;
- later API / white-label infrastructure.

Pricing and willingness-to-pay are NOT yet validated. A commercial validation gate with real target users should occur before extensive late-stage build-out; this is a validation discipline, not permission to replace the technical roadmap without evidence.

## Brownfield land evidence — Phase 3E

Phase 3A–3D remain in force: official site observations, revision-safe storage, provider/LPA coverage as a separate family, and atomic PostgreSQL import.

Phase 3E adds a reproducible national artifact path. The official dataset page `https://www.planning.data.gov.uk/dataset/brownfield-land` links a bulk CSV at `https://files.planning.data.gov.uk/dataset/brownfield-land.csv` (CloudFront in front of Amazon S3). JSON, GeoJSON, and Parquet are also linked there. The importer uses the CSV and adapts each record into the existing entity parser, then the Phase 3D atomic batch.

Artifact bytes are stored by SHA-256 and are not overwritten. `Last-Modified` and `ETag` are HTTP retrieval metadata, not a publication date or version. `retrievedAt` is not `entry-date`. An artifact row count is not a census of current Brownfield sites in England. The same artifact replays as `SKIPPED_AS_ALREADY_IMPORTED`. A changed artifact keeps the previous observation and still selects by source entry-date.

Checked again on 23 October 2026. `HEAD` of the CSV returned HTTP 200 with no redirect: `Content-Type: text/csv`, `Content-Length: 21805739`, `Last-Modified: Thu, 22 Oct 2026 01:04:45 GMT`, S3 multipart `ETag: "07f8ad71406f17e330081ebaf3badecc-3"`, via CloudFront and Amazon S3. A 2048-byte range was a CSV header containing `dataset`, `entity`, and `entry-date`. The page warns that the data may be incomplete, says the collector last ran on 2026-10-23 and new data was last found on 2026-10-23, and links an entity total of 40,183. No `datePublished` was present. `Last-Modified`, `ETag`, and the S3 version id are storage metadata, not a site entry-date and not an official release number. The page total was not imported and is not the CSV row count.

National live artifact retrieval: NOT EXECUTED. National live database import: NOT EXECUTED. The local PostgreSQL role cannot `CREATE DATABASE`, and `propertydb` is refused. Fixture tests cover the importer.

## Persistent Known Limitations / Follow-ups

- LIVE POSTGRESQL INTEGRATION NOT VERIFIED.
- National Brownfield artifact retrieval and database import were NOT EXECUTED. Per-LPA completeness is not established.
- National production geography/crosswalk ingestion remains to be fully productionised/verified.
- Release date validation should eventually reject impossible calendar dates.
- Some third-party/commercial data licensing and retention conditions remain source-specific and require verification before production use.
- Rental/achieved-rent evidence remains a later data problem; do not fabricate it.
- Opportunity Discovery is not yet implemented.
- Development/professional intelligence remains incomplete.
- Existing exact-property intelligence must be preserved rather than rebuilt.

## New-Chat Recovery Protocol

When continuing in a new ChatGPT conversation:

1. Read this file from `temp-branch`.
2. Read `docs/PRODUCT_DECISIONS.md`.
3. Verify the current `temp-branch` head and relevant recent commits/code instead of trusting documentation alone.
4. Reconcile any conflict in favor of verified implementation evidence, and update documentation only after approval/appropriate implementation workflow.
5. Identify the current roadmap phase.
6. Choose ONE best next step; do not ask a non-technical user to choose between architecture options unless genuinely necessary.
7. Do not rely on conversational memory as the sole source of project truth.
