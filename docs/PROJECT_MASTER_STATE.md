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

National live artifact retrieval: NOT EXECUTED in Phase 3E. National live database import: NOT EXECUTED in Phase 3E. The local PostgreSQL role cannot `CREATE DATABASE`, and `propertydb` is refused. Fixture tests cover the importer.

## Brownfield land evidence — Phase 3F verification

Verified on 23 October 2026 against an isolated disposable PostgreSQL 16.11 cluster on `127.0.0.1:55432`, database `property_phase3f_test`. That cluster was created with `initdb` for this check, contained no `propertydb`, and was empty before migrations 035–039. `propertydb` was not opened.

The official CSV was unchanged from the same-day source check: HTTP 200, `Content-Type: text/csv`, `Content-Length: 21805739`, `Last-Modified: Thu, 22 Oct 2026 01:04:45 GMT`, ETag `"07f8ad71406f17e330081ebaf3badecc-3"`, no redirect. The dataset page still warns that the data may be incomplete and cites the Open Government Licence v3.0. The application retrieval path downloaded the file. SHA-256 `c245556c107096bea2f96fe2fae0b324dac29eb428f47f0a4469760a27b9f7f5`. Retrieval timestamp `2026-10-23T14:27:04.574Z`. The file is gitignored under `server/data/brownfield/`.

The CSV had 40,099 data rows. All 40,099 were accepted and inserted. Rejected 0, unchanged 0, conflicts 0. SQL `COUNT(*)` was 40,099. That is the row count of this artifact, not a census of current Brownfield sites in England. Manifest id 1, import run id 1, status `SUCCEEDED`, `artifact_id` 1. Observation provenance stores that SHA-256, the source URL, and the retrieval timestamp. Replaying the same file returned `SKIPPED_AS_ALREADY_IMPORTED` and left observations, artifacts, and runs at 40,099 / 1 / 1.

A later forced batch failure rolled back on real PostgreSQL: status `FAILED`, `inserted_count` 0, zero rows from that batch remained, and the national observation for entity 1700000 stayed queryable with entry-date `2024-12-16`. A controlled pair of fixture revisions with entry-dates `2024-03-01` and `2025-06-01` resolved to `2025-06-01` even when the later entry-date was imported first. A tied entry-date stayed `AMBIGUOUS`. Coverage tables stayed empty. No completeness percentage was calculated.

Retrieval took 631 ms. Parse and import took 17.9 s. Process RSS moved from about 45 MB to about 364 MB. The single in-memory accepted-row batch completed. No COPY rewrite was added.

One reader defect was fixed after the first live read: node-pg parses a PostgreSQL `DATE` as a local calendar date, and slicing `String(date)` produced values such as `Mon Dec 16`, which made defensible entry-dates look ambiguous. Dates are now formatted from that local calendar. Artifact provenance keeps the retrieval ISO string rather than the timestamp column's driver round-trip. The manifest `retrieved_at` column remains `timestamp without time zone`, so a raw driver read of that column can shift by the machine offset; the observation provenance string is the retrieval instant.

## Brownfield land evidence — Phase 3H provider → LAD attribution

Phase 3G concluded Brownfield sites do not carry a proven site LAD. Phase 3H adds a separate Provider → LAD attribution foundation. It classifies the organisation `statistical-geography` as a supported England LAD district GSS (`E06`/`E07`/`E08`/`E09` only). Planning Data LPA references (`E60…`) and other geography families are not LAD. Attribution is derived dynamically from official organisation records; no migration and no LAD column on site observations.

Semantic limit (hard): this is the statistical geography of the **provider organisation**. It does **not** prove each site is located in that LAD. Phase 3C organisation → LPA.reference coverage mapping is unchanged and is not overloaded as site geography. `areaEvidenceProfile.v1` remains unwired. No area Brownfield metrics, PostGIS, or capacity-by-LAD were added.

National diagnostic on the Phase 3F artifact SHA-256 `c245556c107096bea2f96fe2fae0b324dac29eb428f47f0a4469760a27b9f7f5` (40,099 data rows) plus the official Planning Data `local-authority` CSV and entity JSON for twelve non-local-authority providers:

| Diagnostic | Providers | Observation rows |
|---|---:|---:|
| Distinct Brownfield organisation entities | 309 | — |
| `PROVIDER_LAD_ATTRIBUTED` | 297 | 39,801 |
| `STATISTICAL_GEOGRAPHY_NOT_LAD` | 12 | 297 |
| `STATISTICAL_GEOGRAPHY_MISSING` | 0 | 0 |
| `STATISTICAL_GEOGRAPHY_AMBIGUOUS` | 0 | 0 |
| `ORGANISATION_UNRESOLVED` | 0 | 0 |
| Rows with missing organisation-entity | — | 1 |

The twelve non-LAD providers are development corporations and national park authorities (`E51…` / `E26…` codes). These counts are provider→LAD attribution diagnostics, not England completeness, LPA completeness, or site-location accuracy.

Model B viability: **PARTIALLY_VIABLE**. Most providers and rows have a supported LAD statistical geography under an explicit non-location label, but a material minority of providers (and 297 rows) cannot be LAD-attributed without inventing geography.

## Persistent Known Limitations / Follow-ups

- Production PostgreSQL is NOT VERIFIED. Phase 3F verified migrations 035–039 and one national import only on a disposable local PostgreSQL 16.11 cluster that was destroyed after the check.
- Per-LPA Brownfield completeness is not established. The 40,099-row artifact is not a census of current Brownfield sites in England.
- Provider→LAD attribution is not site location. National park and development-corporation providers remain non-LAD under the supported district rule.
- Area Brownfield aggregation and PostGIS site geography are NOT VERIFIED / not implemented.
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
