# Decision: Official physical property and identity evidence source

**Status:** DECIDED — source selected, **NOT_IMPLEMENTED**.  
**Date / retrieval:** 2026-09-01  
**Phase:** V1.2 official physical-property and identity evidence source decision  
**Contract impact:** none in this phase (research / design only)

This extends the shared Property Intelligence Kernel. It does not create a parallel identity system, does not implement an adapter, and does not change valuation, HMLR matching, outcomes, or private-evidence production.

## Decision

**A. Integrate an official/open source.**

The next real evidence source is **MHCLG Energy Performance of Buildings open data (England and Wales)** — domestic EPCs, non-domestic EPCs, and DECs — via the official “Get energy performance of buildings data” service.

Do **not** implement that adapter in this phase.

Do **not** treat this as a UK-wide register. Scotland and Northern Ireland are separate sources.

Do **not** treat an EPC as a building survey, title identity, or valuation input.

## Why this source

The historical HMLR Price Paid ledger is not the bottleneck (31,525,946 live transactions). Exact subject attachment fails because listings have **0 UPRNs**, **0 SAONs**, and weak unit identity. The platform also lacks official physical-property facts (floor area, built form, construction age, envelope/heating descriptions).

MHCLG EPB is the only investigated official/open source that can, in one acquisition:

1. supply an **OGL UPRN** when present on a uniquely matched certificate, and
2. supply **official physical / energy facts** that already fit `ENERGY_EVIDENCE` / `PROPERTY_CHARACTERISTIC` without pretending a survey occurred.

OS Open UPRN cannot map listing addresses to UPRNs. PropertyData `/address-match-uprn` already exists as a unique-only licensed matcher but is paid, 60-day current-cache constrained, and does not replace official physical evidence. User-declared identity remains a later fallback, not the next automation.

## Official primary sources (retrieved 2026-09-01)

| Source | URL |
|---|---|
| Get energy performance of buildings data | https://get-energy-performance-data.communities.gov.uk/ |
| Licensing restrictions | https://get-energy-performance-data.communities.gov.uk/guidance/licensing-restrictions |
| Data dictionary | https://get-energy-performance-data.communities.gov.uk/guidance/data-dictionary |
| Data limitations | https://get-energy-performance-data.communities.gov.uk/guidance/data-limitations |
| How the data is produced | https://get-energy-performance-data.communities.gov.uk/guidance/how-the-data-is-produced |
| Format / methodology changes | https://get-energy-performance-data.communities.gov.uk/guidance/changes-to-the-format-and-methodology |
| Data protection | https://get-energy-performance-data.communities.gov.uk/guidance/data-protection-requirements |
| API overview | https://get-energy-performance-data.communities.gov.uk/guidance/energy-certificate-data-apis |
| API technical documentation | https://get-energy-performance-data.communities.gov.uk/api-technical-documentation |
| Making a request | https://get-energy-performance-data.communities.gov.uk/api-technical-documentation/making-a-request |
| Domestic search | https://get-energy-performance-data.communities.gov.uk/api-technical-documentation/search-certificates/domestic |
| Fetch certificate | https://get-energy-performance-data.communities.gov.uk/api-technical-documentation/fetch-certificate-data |
| OGL v3.0 | https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ |
| EPB certificates technical notes | https://www.gov.uk/government/publications/energy-performance-of-buildings-certificates-in-england-and-wales-technical-notes/energy-performance-of-buildings-certificates-in-england-and-wales-technical-notes |
| OS Open UPRN | https://www.ordnancesurvey.co.uk/products/os-open-uprn |
| OS Open UPRN overview | https://docs.os.uk/os-downloads/products/addresses-and-names-portfolio/os-open-uprn/os-open-uprn-overview.md |
| HMLR Price Paid | https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads |
| HMLR INSPIRE index polygons | https://www.gov.uk/guidance/inspire-index-polygons-spatial-data |
| PropertyData `/address-match-uprn` | https://propertydata.co.uk/api/documentation/address-match-uprn |
| PropertyData licensing / cache | https://propertydata.co.uk/api/markdown |
| Scottish domestic EPC extract | https://statistics.gov.scot/data/domestic-energy-performance-certificates |

## Selected source profile

| Attribute | Finding |
|---|---|
| Official name | Energy Performance of Buildings open data / Get energy performance of buildings data |
| Owner | Ministry of Housing, Communities and Local Government (MHCLG) |
| Access | GOV.UK One Login; API bearer token; monthly CSV bulk |
| API | `https://api.get-energy-performance-data.communities.gov.uk` — search + fetch by certificate number |
| Auth | Bearer token from signed-in account. Required. |
| Cost | Free |
| Licence (non-address, including UPRN) | Open Government Licence v3.0 |
| Licence (address / postcode) | Restricted OS AddressBase / Royal Mail PAF purposes listed on the official licensing page. Not a general gazetteer. |
| Commercial SaaS | OGL fields (including UPRN) may be used in a product with attribution. Address fields only for the listed energy-performance purposes. |
| Attribution | OGL attribution; UPRN also OS identifier. |
| Persistence | OGL non-address fields and UPRN may be stored. Do **not** persist EPC address/postcode as a reusable address product. Match in memory against first-party listing address. |
| Update | API daily; CSV bulk first day of each month. |
| Geography | England and Wales only |
| Coverage | Buildings with a lodged certificate since 2012 that are not opted out / cancelled / national-security excluded. Not the whole building stock. |
| Historical | From 2012; includes expired and superseded certificates. UPRNs appended from November 2021. Certificate numbers replaced LMK_KEY in March 2026. |
| Identifiers | `CERTIFICATE_NUMBER`, `UPRN`, `UPRN_SOURCE`. Certificate ≠ title ≠ building ≠ unit. |
| Coordinates | Not in the official dictionaries. |
| Rate limit | 6,000 requests / 5 minutes / originating IP. |

## Field availability (official dictionaries, 2026-09-01)

Availability is **schema presence**, not universal population. Official sentinel values include `NO DATA!`, `N/A`, `Not recorded`, `INVALID`, blank.

### Domestic EPC

| Field | Availability | Notes |
|---|---|---|
| UPRN | PARTIALLY_AVAILABLE | Schema field; may be blank; `UPRN_SOURCE` = Energy Assessor or Address Matched |
| Address / postcode | AVAILABLE | Restricted licence; do not persist as gazetteer |
| Property type | AVAILABLE | House / flat / maisonette etc. |
| Built form | AVAILABLE | Detached / terrace / etc. |
| Total floor area | PARTIALLY_AVAILABLE | m² TFA; may be missing/sentinel |
| Current energy rating | AVAILABLE | A–G at inspection |
| Potential energy rating | AVAILABLE | Modelled improvement, not a fact of current fabric |
| Construction age band | PARTIALLY_AVAILABLE | May be not recorded; extensions can differ |
| Walls / roof / windows / floor descriptions | PARTIALLY_AVAILABLE | Energy-assessor descriptions; first of multiple fabric entries only in CSV |
| Heating / hot water / lighting | PARTIALLY_AVAILABLE | Energy descriptions and efficiency bands |
| Tenure | PARTIALLY_AVAILABLE | Occupancy tenure (owner-occupied / rented), **not** legal title |
| Inspection / lodgement dates | AVAILABLE | Use inspection date as `evidenceAsOf` |
| Coordinates | NOT_AVAILABLE | Join OS Open UPRN later if a UPRN exists |
| Dedicated SAON | NOT_AVAILABLE | Unit text may appear in ADDRESS1 |

### Non-domestic EPC

| Field | Availability | Notes |
|---|---|---|
| UPRN | PARTIALLY_AVAILABLE | Same caveats |
| Floor area | PARTIALLY_AVAILABLE | Total useful floor area (GIA-style definition in dictionary) |
| Asset rating / band | AVAILABLE | A+–G modelled asset rating, not RdSAP A–G |
| Property type | AVAILABLE | Planning use class language |
| Built form / construction age / walls-roof-windows | NOT_AVAILABLE | Not in non-domestic dictionary |
| Heating fuel / building environment / aircon | PARTIALLY_AVAILABLE | Building-level energy model fields |

### Display Energy Certificates

Operational energy use for public buildings over 250 m². Weak as general subject identity. Floor area and UPRN PARTIALLY_AVAILABLE. Not a private commercial/industrial stock register.

### Geography / asset coverage

| Geography | Domestic | Non-domestic | DEC |
|---|---|---|---|
| England | STRONG (where a certificate exists) | PARTIAL | WEAK (public buildings) |
| Wales | STRONG (where a certificate exists) | PARTIAL | WEAK |
| Scotland | NONE in this source | NONE | NONE |
| Northern Ireland | NONE in this source | NONE | NONE |

| Asset class | Coverage |
|---|---|
| RESIDENTIAL | STRONG where a domestic certificate exists |
| COMMERCIAL | PARTIAL via non-domestic EPC; not ERV/lease |
| INDUSTRIAL | PARTIAL / WEAK; some industrial buildings have non-domestic EPCs |
| AGRICULTURAL | WEAK / NONE unless a non-domestic certificate exists |
| LAND | NONE (no building → no EPC) |
| DEVELOPMENT_SITE | NONE / WEAK |
| MIXED_USE | PARTIAL (unit vs building vs non-domestic split) |
| UNKNOWN | UNKNOWN until a unique certificate match |

Residential-heavy limitation is explicit. The source still wins because it is official, free, persistable, dual-purpose (identity + physical), and the current 86-listing inventory is England/Wales (84/86 postcodes).

## Identity value

Safe uses:

- Persist UPRN from a **unique** exact postcode+PAON(+SAON) certificate match as `SOURCE_ASSERTED` / `OFFICIAL`, with `uprn_source` provenance.
- Never `VERIFIED_EXACT`. ONS still re-matches EPC addresses with AIMS because published UPRNs are incomplete.
- Never treat certificate number as title identity.
- Multiple certificates for one property: keep history; physical “current” certificate = latest lodgement among unique-matched rows; UPRN only if candidate UPRNs are unique (else `UNRESOLVED`).
- Flats/units: without SAON, multiple ADDRESS1 values in one postcode+PAON remain `UNRESOLVED`.
- Missing UPRN: persist physical facts without inventing identity.
- Demolished/redeveloped: old certificates remain in the register; inspection date is not current condition.
- Mixed-use: PROPERTY ≠ BUILDING ≠ UNIT. A building-level non-domestic EPC is not a flat’s identity.

## Physical evidence value

Safe BUILDING_CONDITION / property-fact classes:

| Fact | Evidence class | Source type | Must not become |
|---|---|---|---|
| Current energy rating / score | FACT / ENERGY_EVIDENCE | OFFICIAL | Valuation adjustment |
| Potential rating | INFERENCE (modelled improvement) | OFFICIAL | Condition score |
| Total floor area | FACT (source-native TFA/GIA, as-of inspection) | OFFICIAL | Automatic £/sqm methodology |
| Property type / built form | FACT / PROPERTY_CHARACTERISTIC | OFFICIAL | Asset class silently |
| Construction age band | FACT (assessor; may be assumed) | OFFICIAL | Remaining life |
| Walls/roof/windows/heating descriptions | FACT / ENERGY_EVIDENCE | OFFICIAL | Defect, repair, CapEx |
| Occupancy tenure | FACT (not legal title) | OFFICIAL | Title tenure |

`OLD EPC ≠ CURRENT BUILDING CONDITION`. RdSAP/SBEM may assume unseen fabric.

## Rejected / deferred for NOW

| Option | Verdict | Why not now |
|---|---|---|
| OS Open UPRN | Rejected as next source | Identifier + coordinates only. Not an address gazetteer. Cannot resolve the 86 listing addresses. |
| AddressBase / OS Places / OS GB Address | Rejected | New paid address provider. Forbidden this phase. |
| PropertyData `/address-match-uprn` as next implementation | Rejected as next source | Already licensed and unique-only gated. Paid (10 credits). 60-day current cache. Identity-only, not official physical facts. Remain controlled CLI fallback. |
| HMLR PPD / UPRN-INSPIRE lookups / INSPIRE polygons | Rejected as next source | Ledger already ingested. Lookups are current-month. Polygons are indicative freehold extent, not address-to-UPRN and not construction facts. |
| User-declared UPRN/PAON/SAON UI | Deferred | Useful fallback/manual correction. Do not automate identity by asking the user first while an official source can. |
| Scottish EPC extracts | Deferred | Separate register, quarterly bulk, address licence split. Current inventory postcodes are England/Wales. |
| Northern Ireland EPC | Deferred | No equivalent official open API evidenced in this audit. |
| VO NDR | Already rejected | Restricted purpose; RV ≠ value. |
| CoStar / Kato / new AVM / new address vendor | Forbidden | No new paid provider. |

## Build vs buy

**A — integrate official/open source.** Not B (PropertyData-first), not C (simultaneous official+paid), not D (user-declared UI first).

Existing PropertyData unique-UPRN CLI stays available. It is not the next implementation phase.

## Proposed acquisition architecture (design only)

```
Analyse or controlled enrich trigger
  → Geography gate (England/Wales only)
  → EPB adapter (bearer token; domestic + non-domestic search)
  → Exact postcode + PAON (+ SAON) match; unique UPRN gate
  → Fetch latest unique certificate by CERTIFICATE_NUMBER
  → Normalise OGL fields + provenance (retrievedAt, inspectionDate, lodgementDate, uprn_source)
  → Identity persist (UPRN only if unique; SOURCE_ASSERTED / OFFICIAL)
  → Evidence persist (energy/physical facts; not address gazetteer)
  → Domain adapters: BUILDING_CONDITION energy evidence; propertyFacts; MARKET characteristics only
  → Snapshot into AiRequest
  → UI display of assessed facts
```

| Concern | Policy |
|---|---|
| Trigger | Listing create/update optional; controlled backfill; analyse may call **free** official API, never paid identity |
| Cache | Per listing + certificate number; honour 6,000/5 min; do not bulk-download the national CSV in analyse |
| Refresh | Physical facts keyed by certificate number + inspection date. Re-search when no row, or monthly/on-demand for a newer lodgement. Do not rewrite historical snapshots. |
| Idempotency | Upsert by listing + certificate_number. Append identity events. |
| Failure | UNAVAILABLE / NOT_ASSESSED / SOURCE_OUTSIDE_GEOGRAPHY. Missing ≠ no EPC legally required. |
| Cost | Free. Rate-limit protection only. Analyse must still not call PropertyData identity. |
| Privacy | Address-level EPB data is personal data (official MHCLG notice). Existing listing ACL. Do not publish bulk address extracts. |
| History | Snapshot at analyse. Old analyses unchanged. |
| Valuation / HMLR / outcomes | Frozen. Floor area does not create £/sqm. EPC rating does not move value. |

## Freeze boundaries

- No `valuationEngine` / comparable / weights / assessment-safety / rent / finance / Personal Decision / Decision Intelligence changes.
- No HMLR importer or exact matcher changes. No fuzzy identity.
- Official records are not outcomes. No ML.
- Phase 9.3 private evidence remains PARKED.
- No new paid provider.
- `property-intelligence-v1.1` is not moved or retagged.

## Live inventory (read-only, 2026-09-01)

86 properties; 84 postcode (all England/Wales by postcode-area heuristic; 0 Scotland; 0 NI); 79 PAON; 0 SAON; 0 UPRN; 77 SOURCE_ASSERTED; 9 UNRESOLVED; 54 listing-asserted EPC ratings; 12 listing floor-area values; 21 listings look like flats/units; `asset_classifications` has 0 rows.

Live EPB API match rate: **NOT_TESTED** — no GOV.UK One Login bearer token in this environment.  
Live PropertyData UPRN: **NOT_TESTED** — key present; not executed (no uncontrolled spend). Expected upper bound if later used: 86 × 10 = 860 credits, unique-only, persisted so not re-paid.

## Implementation status of this source

`NOT_IMPLEMENTED`. Do not mark IMPLEMENTED.
