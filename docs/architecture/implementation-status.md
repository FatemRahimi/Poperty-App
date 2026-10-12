# Implementation status

**Role:** what the repository actually supports today.  
**Not** vision. **Not** roadmap.

Evidence strength: runtime path → tests → persistence → API/client → config. Old phase reports are supporting only.

Status labels used here:

`IMPLEMENTED_AND_EVIDENCED`  
`IMPLEMENTED_BUT_LIMITED`  
`FOUNDATION_ONLY`  
`BLOCKED_BY_EVIDENCE`  
`BLOCKED_BY_INFRASTRUCTURE`  
`NOT_IMPLEMENTED`  
`NOT_APPLICABLE`  
`UNKNOWN`

---

## Identity

**Status:** `IMPLEMENTED_AND_EVIDENCED` for canonical subject identity contract `canonical-subject-identity-1.0.0`, listing-field PAON/SAON/postcode persistence, unique-UPRN resolution gate, analyse wiring, and **user-declared subject identity capture/edit** (`USER_DECLARED`, not `VERIFIED_EXACT`).  
`IMPLEMENTED_BUT_LIMITED` for live inventory coverage (existing 86 listings were not auto-filled).

Kinds remain in `identityModel.js`. Canonical identity extends them; it does not equate LISTING / SUBJECT / PROPERTY / BUILDING / UNIT / TITLE.  
Source listing address on `properties.*` is not canonical identity. User declaration is not verification. UPRN is not a title number. Building identity is not unit identity. Identity changes affect **future** analyses only; historical `ai_requests` snapshots are not rewritten.

Persistence: additive `property_identities` columns (migrations `025` and `027` `building_name` / `component_states`) plus `property_identity_events` (actor on `027`). Source listing fields on `properties` are not rewritten.  
Resolution: deterministic listing canonicalisation (trim, postcode, explicit PAON/SAON). Owner/admin may declare PAON, SAON/unit, building name, and optional UPRN. Client cannot inject `VERIFIED_EXACT`, `OFFICIAL`, or provider provenance. A user-declared UPRN that conflicts with an official/licensed UPRN is recorded as a conflict and is not silently overwritten. PropertyData `/address-match-uprn` may persist a UPRN only when exactly one distinct candidate exists. Multiple candidates stay `UNRESOLVED`. Analyse does not pay for identity. Create/edit does not call PropertyData. Controlled CLI: `npm run enrich:listing-identity` (optional `--paid-uprn`).

Live inventory after listing-field backfill (86 properties): UPRN 0; PAON 79; SAON 0; `VERIFIED_EXACT` 0; `SOURCE_ASSERTED` 77; `UNRESOLVED` 9.  
HMLR exact linkage after identity: `EXACT_UPRN` 0; `EXACT_CANONICAL_ADDRESS` 1; `AREA_POSTCODE` 48; `NO_TRANSACTIONS_FOUND` 37.

Official MHCLG EPB (England & Wales) unique-certificate attachment can persist a `SOURCE_ASSERTED` / `OFFICIAL_OPEN` UPRN into the same identity tables. It is never `VERIFIED_EXACT`. Controlled live backfill measured 2026-09-01 against 86 listings: BEFORE UPRN 0/86; AFTER UPRN **2/86** (both `SOURCE_ASSERTED` / `OFFICIAL_OPEN` / `MHCLG_EPBD`). Unique attach 2; unresolved unit identity 24; no exact PAON match 51; insufficient identity 7; geography not established 2; source errors 0. HMLR `EXACT_UPRN` remains 0; `EXACT_CANONICAL_ADDRESS` remains 1. Missing token still returns `UNAVAILABLE_MISSING_CREDENTIAL` and must not be treated as assessed. Future analyses may reuse user-declared SAON through the **existing** exact EPB matcher (unit-like + SAON may unique-attach; unit-like + no SAON stays `UNRESOLVED_UNIT_IDENTITY`). Form submit does not mass-re-enrich EPB. Tests: `server/tests/mhclgEpb.test.js`, `server/tests/canonicalIdentity.test.js`, `server/tests/userDeclaredIdentity.test.js`.

## Asset classification

**Status:** `IMPLEMENTED_AND_EVIDENCED`

Canonical classes and persistence: `assetClassification.js`, `asset_classifications` (`020_asset_classifications.sql`).  
Exact-safe listing words may classify. Dwelling types stay `UNKNOWN`.  
UNKNOWN does not become RESIDENTIAL.  
Tests: `server/tests/assetClassification.test.js`.

## Methodology routing

**Status:** `IMPLEMENTED_AND_EVIDENCED`

`residentialMethodologyGate` in `assetClassificationRuntime.js` is enforced in `propertyIntelligenceEngine.js` before sale AVM and residential rent.  
`resolveMarketAcquisitionPolicy` applies the same gate **before** paid PropertyData AVM/rent/demand-rent acquisition.  
Applicability view: `domainApplicability.js` + `services/identity/domainApplicability.js`.  
UNKNOWN may use versioned `legacy-residential-compatibility-1.0.0` without becoming RESIDENTIAL.

## Market

**Status:** `IMPLEMENTED_AND_EVIDENCED` for cross-asset **evidence representation** (what sources actually returned).  
`IMPLEMENTED_BUT_LIMITED` for residential area/context, sold-price observations, and PropertyData overlays.  
Specialised commercial / industrial / agricultural / land / development market or comparable methodology is `NOT_IMPLEMENTED` / `BLOCKED_BY_EVIDENCE`.

Live `MARKET` envelope (`marketDomain.js`) records subject identity/use, listing asking price, user-reported last sale, **official HMLR Price Paid subject/area transactions when imported**, PropertyData area transaction observations, area sales/rental market activity (when fetched), coverage counts, provenance, and explicit gaps.  
**Bounded residential comparable assessment** (`official-hmlr-residential-comparable-assessment` **1.1.0**): HIGH = same postcode + type + ≤3y; ASSESSED only with ≥3 HIGH; otherwise MARKET_CONTEXT when relevant txs exist. Genuine cohort: **2/6 ASSESSED**, **4/6 MARKET_CONTEXT**, **0** false ASSESSED. Comparable stats from HIGH only when ASSESSED; local sold stats separately labelled. Not a valuation. BUY/SELL workspace tiles distinguish “Comparable sold evidence” vs “Local sold transaction context”.  
Transactions are not comparables. Area context is not a subject fact. Missing evidence is not zero. Market context is not a defensible comparable assessment.  
Acquisition uses `resolveMarketAcquisitionPolicy` before PropertyData AVM/rent/demand-rent.  
Official HMLR Price Paid Data has a durable offline ingest path (`official_sale_transactions`, `official_sale_lookup_links`, `npm run import:hmlr-ppd`). Analyse queries the local table only; it does not download the national dataset. **Official yearly PPD files 1995–2026 have been imported** (31,525,946 live transactions; `IMPLEMENTED_AND_EVIDENCED` for the historical ledger). July 2026 UPRN/INSPIRE lookups remain **current-month only** (94,112 UPRN links; 77,051 INSPIRE-linked txs). Missing historical UPRN/INSPIRE is NOT AVAILABLE FROM THIS SOURCE, not “unregistered”. Matching is exact UPRN, then exact postcode+PAON(+SAON); postcode-only remains AREA_CONTEXT. One transaction may have multiple official INSPIRE IDs; all are persisted. After subject-identity completeness, existing listings: **0 EXACT_UPRN**, **1 EXACT_CANONICAL_ADDRESS** (was 0), **48 AREA_POSTCODE** (was 49), **37 NO_TRANSACTIONS_FOUND**. Matcher semantics were not relaxed. Remaining gap is listing UPRN/SAON/user-declared identity, not missing PPD.  
Tests: `server/tests/crossAssetMarketEvidence.test.js`, `server/tests/officialSaleTransaction.test.js`.

## Valuation

**Status:** `IMPLEMENTED_AND_EVIDENCED` for `RESIDENTIAL` only.  
Proven `COMMERCIAL` / `INDUSTRIAL` / `AGRICULTURAL` / `LAND` / `DEVELOPMENT_SITE` / `MIXED_USE` do not receive residential AVM.  
No substitute multi-asset valuation exists.  
Code: `valuationEngine.js`, `valuationAssessmentSafety.js`.

## Rental / income

**Status:** `IMPLEMENTED_AND_EVIDENCED` for residential rent only.  
Residential rent is not commercial passing rent, ERV, industrial rent, agricultural income, or development income. Those engines are `NOT_IMPLEMENTED`.  
Land / development-site rental capability is `NOT_APPLICABLE`.

## Finance

**Status:** `IMPLEMENTED_AND_EVIDENCED` with residential BTL presentation.  
Missing inputs stay not-assessed; they are not coerced to zero.  
`financeInputContract.js`, `financialEngine.js`. Math may run when valid user inputs exist on other classes (`CONDITIONAL`).

## Planning

**Status:** `IMPLEMENTED_AND_EVIDENCED`  
Wired live. MHCLG Planning Data. Nearby applications are not permission.  
`planningDomain.js`, `planningDomain.test.js`.

## Environment

**Status:** `IMPLEMENTED_AND_EVIDENCED`  
Wired live. Environment Agency flood evidence within actual source coverage.  
`environmentDomain.js`, `environmentDomain.test.js`, `floodEvidence.test.js`.

## Legal title

**Status:** `IMPLEMENTED_BUT_LIMITED` + `BLOCKED_BY_EVIDENCE`

Wired live as evidence completeness only. Document ≠ fact. Upload ≠ verification.  
Current DB: 0 private legal documents (last operational audit).  
Production private storage/scanner/backup remain unverified.  
`legalTitleDomain.js`, `privateLegalEvidence.test.js`.

## Building condition

**Status:** `IMPLEMENTED_BUT_LIMITED` for official energy / physical certificate evidence.  
Professional building condition remains `FOUNDATION_ONLY` / `NOT_ASSESSED`.

`BUILDING_CONDITION` is wired live as energy and physical characteristics only (`ENERGY_EVIDENCE`, `PHYSICAL_FACT`, `PROPERTY_CHARACTERISTIC`). Official MHCLG EPB unique-subject attachment supplies those facts. EPC is not a survey. Potential ratings are modelled, not current fabric facts. Floor area, age band, and energy rating do not enter valuation, comparables, finance, PD, or DI.

Live inventory EPB coverage measured 2026-09-01 (86 listings, live MHCLG API): unique attach **2/86**; certificates persisted 3 (one subject has two historical certificates); current energy rating 2; floor area 1; physical characteristics 1; canonical UPRN 2/86; `UNRESOLVED_UNIT_IDENTITY` 24; `NO_MATCH_FOUND` 51; `INSUFFICIENT_IDENTITY` 7; `GEOGRAPHY_NOT_ESTABLISHED` 2; source errors 0. Acquisition path is `IMPLEMENTED_AND_EVIDENCED`. Whole-stock / UK-wide coverage is `IMPLEMENTED_BUT_LIMITED`. Professional condition remains `NOT_ASSESSED`.

Tests: `server/tests/mhclgEpb.test.js`, `server/tests/buildingConditionFoundation.test.js`.

## Maintenance / CapEx

**Status:** `NOT_IMPLEMENTED`

## Development

**Status:** `FOUNDATION_ONLY`  
Identity/scope only. Not wired. Site ≠ project. No GDV, residual, or feasibility.

## Project cost

**Status:** `FOUNDATION_ONLY`  
Not wired. User budget ≠ assessed cost.

## Development feasibility / project management / asset management

**Status:** `NOT_IMPLEMENTED`

## Portfolio

**Status:** `IMPLEMENTED_BUT_LIMITED`  
Existing Portfolio Optimiser V1 is a parallel residential-oriented surface, not kernel V2.

## Risk / due diligence

**Status:** `IMPLEMENTED_BUT_LIMITED`  
Decision Intelligence V1 material findings from assessed evidence only. Not a full DD product.

## Decision

**Status:** `IMPLEMENTED_AND_EVIDENCED` for residential Personal Decision + DI V1, and for **residential decision workspace V1** (`BUY` / `LET_INVEST` / `SELL` presentation of existing outputs).  
Non-residential specialised decision methodology is `NOT_IMPLEMENTED`.  
HOLD / REFINANCE / RENOVATE / DEVELOP / commercial occupation / portfolio jobs are `NOT_IMPLEMENTED` in this workspace.  
PD/DI may still assemble from available finance/facts; they must not treat missing domains as adverse scores. DI V1 is landlord/BTL and is not presented as a universal Buy or Sell score.

Contract: `architecture/decisionContextContract.js`, adapter `services/ai/residentialDecisionWorkspace.js`, HTTP job required in `intelligenceController.js`. Tests: `server/tests/residentialDecisionWorkspace.test.js`.

## Private evidence

**Status:** `BLOCKED_BY_INFRASTRUCTURE` (production) / development `DEGRADED`

No implemented production object backend. No real scanner. Encryption `NOT_VERIFIED`. Coordinated backup `NOT_VERIFIED`.  
Parked. Do not invent a cloud vendor. Do not start Phase 9.3 from application code.

## Outcomes / learning

**Status:** `BLOCKED_BY_EVIDENCE`

Last read-only audit: REAL N = 0, uniqueSaleOutcomes = 0, sufficiency = `NO_DATA`.  
No calibration. No ML.

## Historical immutability

**Status:** `IMPLEMENTED_AND_EVIDENCED`  
`persistCompletedCanonicalAnalysis` insert-only. History detail does not re-assemble.

## What-if

**Status:** `IMPLEMENTED_AND_EVIDENCED`  
Saved-snapshot baseline. Scenario ≠ fact.

## Provider cost

**Status:** `IMPLEMENTED_AND_EVIDENCED`  
Existing PropertyData / quota controls.  
Classification and `resolveMarketAcquisitionPolicy` now run before listing/subject enrichment. Proven non-residential classes skip paid `valuation_sale`, `rents`, and `demand_rent`. Sold-price and sale-demand area endpoints may still run as labelled AREA_CONTEXT. UNKNOWN keeps legacy residential eligibility.

---

## Capability matrix

Cells use the labels above. Rows are capabilities. Columns are asset classes.

| Capability | RESIDENTIAL | COMMERCIAL | INDUSTRIAL | AGRICULTURAL | LAND | DEVELOPMENT_SITE | MIXED_USE | UNKNOWN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IDENTITY | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED |
| MARKET | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED |
| VALUATION | IMPLEMENTED_AND_EVIDENCED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | IMPLEMENTED_BUT_LIMITED |
| RENTAL_OR_INCOME | IMPLEMENTED_AND_EVIDENCED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_APPLICABLE | NOT_APPLICABLE | NOT_IMPLEMENTED | IMPLEMENTED_BUT_LIMITED |
| FINANCE | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED |
| LEGAL_TITLE | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED |
| PLANNING | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED |
| ENVIRONMENT | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED |
| BUILDING_CONDITION | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | NOT_APPLICABLE | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED |
| MAINTENANCE_CAPEX | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_APPLICABLE | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| DEVELOPMENT | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY |
| PROJECT_COST | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY |
| DEVELOPMENT_FEASIBILITY | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| PROJECT_MANAGEMENT | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| ASSET_MANAGEMENT | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| PORTFOLIO | IMPLEMENTED_BUT_LIMITED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| RISK_DUE_DILIGENCE | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED |
| DECISION | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED |

UNKNOWN valuation/rent cells are `IMPLEMENTED_BUT_LIMITED` because of explicit legacy residential compatibility, not because UNKNOWN equals RESIDENTIAL.

Legal title is evidence-starved (`BLOCKED_BY_EVIDENCE`) on all classes until real documents exist. Production ingest is separately `BLOCKED_BY_INFRASTRUCTURE`.

---

## Evidence-gap map

| Missing / limited capability | Gap type |
| --- | --- |
| Production private evidence | `NO_PRODUCTION_INFRASTRUCTURE` |
| Legal interpretation / HMLR title | `REGULATORY_OR_LICENSING` + `NO_DATA_SOURCE` |
| Commercial / industrial / agricultural / land valuation | `NO_METHODOLOGY` |
| Commercial income / ERV / lease income | `NO_METHODOLOGY` |
| Building diagnosis / CapEx | `NO_DATA_SOURCE` + `NO_METHODOLOGY` (official EPC is energy/physical only) |
| Outcome calibration / ML | `INSUFFICIENT_REAL_OUTCOMES` |
| Development / project-cost live engines | `NO_RUNTIME_WIRING` (foundations exist) |
| Cross-asset market **evidence** (non-residential) | Envelope live; class-specific transactions/comparables `NO_DATA_SOURCE` |
| Specialised non-residential market/comparable methodology | `NO_METHODOLOGY` + current PropertyData is residential-oriented |

### Market evidence by asset class

Cells are evidence availability from **current sources**, not methodology status.

| Evidence | RESIDENTIAL | COMMERCIAL | INDUSTRIAL | AGRICULTURAL | LAND | DEVELOPMENT_SITE | MIXED_USE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Identity | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED |
| Classification | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED |
| Transactions (class-specific) | IMPLEMENTED_BUT_LIMITED (July 2026 official HMLR PPD monthly slice + PropertyData area overlay; complete history not ingested) | BLOCKED_BY_EVIDENCE (`NO_SOURCE` for specialised CRE). PPD may still attach as official residential-register facts, not commercial comps. | BLOCKED_BY_EVIDENCE (`NO_SOURCE` for specialised industrial). Same PPD fact rule. | BLOCKED_BY_EVIDENCE (`NO_SOURCE`). PPD type Other is not farmland coverage. | BLOCKED_BY_EVIDENCE (`NO_SOURCE`) | BLOCKED_BY_EVIDENCE (`NO_SOURCE`) | BLOCKED_BY_EVIDENCE (`NO_SOURCE`; no component split) |
| Comparable candidates | IMPLEMENTED_AND_EVIDENCED (residential methodology only) | BLOCKED_BY_EVIDENCE (`NO_METHODOLOGY`) | BLOCKED_BY_EVIDENCE (`NO_METHODOLOGY`) | BLOCKED_BY_EVIDENCE (`NO_METHODOLOGY`) | BLOCKED_BY_EVIDENCE (`NO_METHODOLOGY`) | BLOCKED_BY_EVIDENCE (`NO_METHODOLOGY`) | BLOCKED_BY_EVIDENCE (`NO_METHODOLOGY`) |
| Sale market context | IMPLEMENTED_BUT_LIMITED | IMPLEMENTED_BUT_LIMITED (residential-oriented area context only) | IMPLEMENTED_BUT_LIMITED (residential-oriented area context only) | IMPLEMENTED_BUT_LIMITED (residential-oriented area context only) | IMPLEMENTED_BUT_LIMITED (residential-oriented area context only) | IMPLEMENTED_BUT_LIMITED (residential-oriented area context only) | IMPLEMENTED_BUT_LIMITED (residential-oriented area context only) |
| Rental market context | IMPLEMENTED_AND_EVIDENCED | BLOCKED_BY_EVIDENCE (`SOURCE_NOT_APPLICABLE`) | BLOCKED_BY_EVIDENCE (`SOURCE_NOT_APPLICABLE`) | BLOCKED_BY_EVIDENCE (`SOURCE_NOT_APPLICABLE`) | NOT_APPLICABLE | NOT_APPLICABLE | BLOCKED_BY_EVIDENCE (`NO_METHODOLOGY`) |
| Lease evidence | NOT_IMPLEMENTED | BLOCKED_BY_EVIDENCE (`NO_SOURCE`) | BLOCKED_BY_EVIDENCE (`NO_SOURCE`) | BLOCKED_BY_EVIDENCE (`NO_SOURCE`) | NOT_APPLICABLE | NOT_APPLICABLE | BLOCKED_BY_EVIDENCE (`NO_SOURCE`) |
| Use evidence | IMPLEMENTED_BUT_LIMITED (listing text) | IMPLEMENTED_BUT_LIMITED (listing text) | IMPLEMENTED_BUT_LIMITED (listing text) | IMPLEMENTED_BUT_LIMITED (listing text) | IMPLEMENTED_BUT_LIMITED (listing text) | IMPLEMENTED_BUT_LIMITED (listing text) | IMPLEMENTED_BUT_LIMITED (listing text) |
| Planning | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED |
| Environment | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED | IMPLEMENTED_AND_EVIDENCED |
| Legal | IMPLEMENTED_BUT_LIMITED + `PRIVATE_INFRA_BLOCKED` | same | same | same | same | same | same |
| Building | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | NOT_APPLICABLE | FOUNDATION_ONLY | FOUNDATION_ONLY |
| Cost | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | FOUNDATION_ONLY (not wired) | NOT_IMPLEMENTED |
| Development | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY | FOUNDATION_ONLY |
| Real outcomes | BLOCKED_BY_EVIDENCE (`NO_REAL_OUTCOMES`) | BLOCKED_BY_EVIDENCE (`NO_REAL_OUTCOMES`) | BLOCKED_BY_EVIDENCE (`NO_REAL_OUTCOMES`) | BLOCKED_BY_EVIDENCE (`NO_REAL_OUTCOMES`) | BLOCKED_BY_EVIDENCE (`NO_REAL_OUTCOMES`) | BLOCKED_BY_EVIDENCE (`NO_REAL_OUTCOMES`) | BLOCKED_BY_EVIDENCE (`NO_REAL_OUTCOMES`) |

---

## Must remain NOT_ASSESSED

- Commercial / industrial / agricultural / land / development / mixed-use sale value by the residential AVM
- Those classes’ residential rent recommendations
- GDV, residual land value, completed development value
- Title quality, “no restriction”, covenants, easements, charges
- Planning permission inferred from nearby applications
- Flood safety / “not in flood zone” from empty results
- Building condition from EPC, photos, or listing text
- Project cost from a user budget
- Outcome-calibrated accuracy while N = 0
