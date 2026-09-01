# Data source map

Only sources that are actually integrated. No claimed providers.

| Source | Type | Paid / free / user | Authority | Subject vs area | Retrieval | Persistence | Provenance | As-of | Limits | Consumers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| First-party listing (`properties`) | Database | User / first-party | User-reported | Subject (listing) | `propertyDataAggregator` / property controllers | `properties` | InternalListing | Listing row time; not sold_at | Asking ≠ achieved. Type string ≠ class. Source address is not rewritten by identity enrichment. | Identity, finance inputs, PD, facts |
| Canonical subject identity | Database | First-party listing fields; licensed unique UPRN optional | Listing-asserted / licensed matcher | Subject identity evidence | Create/update persist; `enrich:listing-identity`; analyse reuse | `property_identities` + `property_identity_events` | InternalListing or PropertyData unique match | retrieved/as-of on identity row | Trim/postcode/PAON/SAON only. No fuzzy identity. Multiple UPRNs → UNRESOLVED. UPRN ≠ title. Inferred ≠ verified. Analyse does not pay. | Official sale query, Market identity status |
| Intelligence subject | Database | First-party | Contextual | Subject | `externalPropertyLookupService` | `intelligence_subjects` | Subject record | Snapshot at analyse | UPRN is not title / class / parcel | Identity, reuse |
| PropertyData sale AVM / sold / rents / demand | Licensed API | Paid (when enabled) | Contextual / licensed | Mix of subject AVM and area | `PropertyDataAdapter`, enrichment, postcode market; gated by `marketAcquisitionPolicy` | Enrichment cache / subject profile | `PropertyData` (+ HMLR sold-price label where adapter says so) | Provider retrievedAt | Residential-oriented. Not commercial ERV. Not title. Config may disable. Proven non-residential classes skip AVM / rents / demand-rent. Sold-price stats remain area context, not class-specific transactions. | Residential valuation/rent when permitted; MARKET envelope area observations |
| MHCLG Planning Data | Open data | Free | Official planning geography | Subject point / area context | Planning evidence services | Analyse-time; snapshot | planning.data.gov.uk | Retrieved / evidenceAsOf | Nearby apps ≠ permission. Empty ≠ none. | PLANNING domain, propertyFacts |
| Environment Agency flood | Open data | Free | Official flood-map product | Subject point within coverage | Flood evidence services | Analyse-time; snapshot | Environment Agency | Retrieved / evidenceAsOf | England product coverage. Empty ≠ Flood Zone 1. | ENVIRONMENT domain, propertyFacts |
| Historic England / NHLE listed buildings | Open data | Free | Official listing record | Subject / nearby | Listed-building evidence | Analyse-time; snapshot | Historic England | Retrieved | Nearby ≠ this property. Not title. | propertyFacts, Planning-adjacent facts |
| Conservation area / Article 4 open data | Open data | Free | Official geography | Subject point | Conservation / Article 4 services | Analyse-time; snapshot | Source organisation on the record | Retrieved | Membership ≠ title. Restrictions not assessed from name alone. | propertyFacts |
| Schools open data | Open data | Free | Official / contextual | Area context | School evidence | Analyse-time; snapshot | Source on fact | Retrieved | Catchment is not invented. Nearby ≠ assigned. | propertyFacts |
| User private legal documents | User upload | User | Not authoritative | Subject (claimed) | Legal evidence ingest | `evidence_documents` + private store | User-declared | documentDate / uploadedAt | Production store/scanner blocked. Document ≠ fact. | LEGAL_TITLE |
| Listing outcomes / events | First-party | User / first-party | First-party when complete | Listing | Outcome services | `properties` + listing events | First-party | sold_at / let_at | REAL N currently 0 | Backtest / outcome audit only |
| User finance / What-if scenario | User input | User | Scenario | Analysis | `financeInputContract` | Snapshot only | User | Analysis time | Scenario ≠ listing fact | Finance, What-if, PD |
| HM Land Registry Price Paid Data | Official bulk CSV | Free (OGL for HMLR fields) | Official completed sale | Subject when exact UPRN/address match; otherwise area/postcode context | Offline `import:hmlr-ppd` then local query at analyse | `official_sale_transactions` + `official_sale_lookup_links` + `official_sale_import_runs` | `HMLR_PRICE_PAID_DATA` | Event date = transfer date; retrieved/imported at; dataset/release label | **Yearly official files 1995–2026 ingested:** 31,525,946 live txs (1995-01-01 to 2026-07-31). UPRN/INSPIRE lookups are the July 2026 current-month tables only. Address/PAF `LICENSING_REVIEW_REQUIRED` beyond residential property price information display. After listing identity backfill: 0 EXACT_UPRN, 1 EXACT_CANONICAL_ADDRESS, 48 AREA_POSTCODE, 37 NO_TRANSACTIONS_FOUND. Matcher unchanged. | MARKET envelope official sale evidence |
| Deterministic derived metrics | Derived | Derived | Derived | Analysis | finance / valuation / rent engines | Snapshot | Engine version | analysisAt | Only when inputs valid | Report, DI |

PropertyData HMLR sold-price stats are **sold-price market context**, not a title register and not the canonical official subject transaction ledger.

Official HMLR Price Paid ingest is the canonical official completed-sale ledger when a release has been imported. PropertyData remains a licensed overlay (AVM / rents / demand / area sold-price stats). The official layer does not depend on PropertyData.

No AWS/S3/Azure/GCP/R2 object store is integrated. No ClamAV/scanner SaaS is integrated. No paid HMLR title API is integrated.

## Future source requirements (not selected)

These gaps cannot be closed with current sources. Do not treat this list as a vendor decision.

### Commercial completed transactions

- Evidence required: completed commercial sales (consideration, date, location, use/type, floor area where available)
- Asset classes: COMMERCIAL, MIXED_USE (commercial component)
- Purpose: future market / comparable methodology
- Current coverage: NONE / INSUFFICIENT for specialised CRE. Official HMLR PPD is the England/Wales residential sale register (types D/S/T/F plus type Other). It is not a commercial comparable feed.
- Minimum fields: transaction date, achieved consideration, location, property/use type, floor area, provenance, update frequency, SaaS-compatible licence, API or bulk access

### Industrial completed transactions

- Evidence required: completed industrial / warehouse / logistics transactions
- Asset classes: INDUSTRIAL
- Purpose: future market / comparable methodology
- Current coverage: NONE
- Minimum fields: transaction date, achieved consideration, location, use type, floor/site area, provenance, update frequency, SaaS-compatible licence, API or bulk access

### Agricultural / land transactions

- Evidence required: completed agricultural and bare-land transactions
- Asset classes: AGRICULTURAL, LAND
- Purpose: future market / comparable methodology (not productivity or GDV)
- Current coverage: NONE
- Minimum fields: transaction date, achieved consideration, location, land use, site area, provenance, update frequency, SaaS-compatible licence, API or bulk access

### Development-site transactions

- Evidence required: completed development-site / land-with-consent transactions
- Asset classes: DEVELOPMENT_SITE
- Purpose: future as-is market context (not GDV or residual)
- Current coverage: NONE
- Minimum fields: transaction date, achieved consideration, location, planning status if official, site area, provenance, update frequency, SaaS-compatible licence, API or bulk access

### Lease / ERV evidence

- Evidence required: passing rent, ERV, lease terms, occupancy
- Asset classes: COMMERCIAL, INDUSTRIAL, MIXED_USE
- Purpose: future income methodology
- Current coverage: NONE (residential PropertyData rents are not ERV)
- Minimum fields: rent, rent basis, lease start/expiry if available, use, floor area, location, provenance, SaaS-compatible licence

No vendor is chosen for commercial/industrial/agricultural/land/development transactions in this research phase.

Research decision and ingest implementation: `docs/architecture/decisions/cross-asset-market-data-acquisition.md`.

Official physical-property / identity source decision (2026-09-01): MHCLG Energy Performance of Buildings open data (England and Wales) is the next source. It is **not integrated**. See `docs/architecture/decisions/physical-property-identity-source.md`.

## Candidates, recommended, rejected

| Source | Status | Role |
| --- | --- | --- |
| HMLR Price Paid Data + UPRN/INSPIRE lookups (from 28 Aug 2026) | IMPLEMENTED_AND_EVIDENCED for official yearly PPD 1995–2026 (31,525,946 live txs). UPRN/INSPIRE lookups remain July 2026 monthly only. | Official England/Wales completed sales. Residential + category B / type Other. OGL for HMLR fields; address/PAF third-party rights. UPRN lookup also requires OS OGL attribution. INSPIRE: one transaction may have many polygons. Historical UPRN/INSPIRE not in monthly lookup files. Not commercial comps. Display + MARKET only. |
| MHCLG Energy Performance of Buildings open data (England and Wales) | RECOMMENDED_NEXT_SOURCE — **NOT_IMPLEMENTED** (decision 2026-09-01) | Official domestic + non-domestic EPCs and DECs. Free API (One Login bearer) + monthly CSV. Non-address fields and UPRN are OGL v3.0. Address/postcode are OS/Royal Mail restricted and must not become a gazetteer. Dual value: official physical/energy facts plus UPRN when a unique exact match exists. Not a survey. Not UK-wide. Not every building. See `decisions/physical-property-identity-source.md`. |
| OS Open UPRN | CANDIDATE later linker, not next source | UPRN + coordinates only. Great Britain. OGL. **Not an address gazetteer.** Cannot resolve listing addresses. Useful after a UPRN exists. |
| HMLR INSPIRE Index Polygons | CANDIDATE follow-on | Indicative freehold extent. OGL. Polygon ≠ title plan. INSPIRE ID ≠ title number. Leasehold absent. |
| HMLR Registered Leases (commercial licence) | CANDIDATE later | Lease start and term. Not passing rent / ERV. Chargeable commercial licence. |
| HMLR National Polygon Service | CANDIDATE later | Title polygons + UPRN. Chargeable (~£20,000 + VAT / year on ULPD, verify at contract). |
| Kato Atlas | CANDIDATE later specialist | Intended Radius successor for UK CRE investment/letting deals. SaaS licence and production readiness `UNKNOWN`. |
| CoStar UK | CANDIDATE later specialist | Decision-grade CRE (VO renewed CoStar to 2029). Enterprise licence. Public pricing unpublished. Redisplay/API typically restricted. |
| PropertyData `/rents-commercial`, `/valuation-commercial-*` | NOT recommended as methodology | Already licensed vendor. Commercial data described by vendor as simplistic. Sale value = quoting rent capitalised. Asking ≠ ERV ≠ transaction. |
| VO non-domestic rating list | REJECTED for general SaaS | Free download but restricted to NDR purposes. Not OGL. Onward disclosure prohibited except those purposes. RV ≠ market value or passing rent. |
| EG Radius | REJECTED for new integration | Contributor CRE exchange with API, but owner wind-down; Kato announced as successor (Nov 2025). |
| CAAV / RICS–RAU farmland reports | REJECTED as platform source | Survey/directory reports, not a subject-level transaction API. |
| DEFRA agricultural price indices / tenure stats | REJECTED as market transactions | Farm-gate prices and holding tenure, not land sales. |

Scotland: RoS house-price **statistics** are OGL aggregates; subject-level prices via ScotLIS are a different, often chargeable channel. Northern Ireland is a separate registry. Current PPD recommendation is England and Wales only.
