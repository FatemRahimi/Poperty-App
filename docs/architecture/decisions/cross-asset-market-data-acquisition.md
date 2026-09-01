# Decision: UK cross-asset market data acquisition

**Status:** IMPLEMENTED_AND_EVIDENCED for official yearly PPD 1995–2026 plus July 2026 UPRN/INSPIRE lookups. Historical UPRN/INSPIRE linkage is not available from those monthly lookup files.  
**Date:** 2026-09-01  
**Phase:** V1.2 historical HMLR Price Paid backfill and coverage validation  

This decision is now the implemented acquisition path. It is still not a valuation methodology, comparable engine, or CRE provider purchase.

Labels used below: `CURRENTLY INTEGRATED` | `CANDIDATE` | `RECOMMENDED` | `REJECTED` | `LICENSING_REVIEW_REQUIRED`.

## Decision

Acquire **official completed sale transactions** next, from HM Land Registry Price Paid Data plus the UPRN and INSPIRE ID lookup tables published from 28 August 2026.

Do **not** purchase a specialist commercial provider in the next implementation phase.

Do **not** treat PropertyData commercial valuation/rent endpoints as a substitute for official transactions or ERV.

A paid specialist source remains **required later** for commercial, industrial, agricultural, land, and development-site market evidence. That is a subsequent procurement, not this acquisition.

## Why this first

Official Price Paid Data is free, bulk-downloadable, historically deep (from 1995), and licensed under OGL for the HMLR fields. The August 2026 UPRN lookup makes subject matching newly practical.

The live MARKET envelope currently holds PropertyData **area** sold-price statistics, not an official subject-level transaction ledger. Paying CoStar or Kato before ingesting the official residential/other sale register would buy specialist data while leaving the strongest official transaction source unused.

Commercial completed sales, passing rent, and ERV are **not** in Price Paid Data. Those gaps stay honest until a later specialist layer.

## Recommended portfolio (layers)

1. **Official identity / physical (follow-on, not this phase’s single target)**  
   OS Open UPRN (OGL). MHCLG EPC open data for floor area where a certificate exists (OGL with address exceptions). INSPIRE Index Polygons for indicative freehold extent (OGL; polygon ≠ title plan; INSPIRE ID ≠ title number).

2. **Official transactions (IMPLEMENTED this phase)**  
   HMLR Price Paid Data + monthly UPRN / INSPIRE lookup tables. England and Wales. Residential (types D/S/T/F) plus category B / type Other. Not a commercial, agricultural, or development comparable set.

3. **Specialist commercial / industrial market (LATER procurement)**  
   Required for investment sales, occupational sales, and letting deals. Preferred living candidates: Kato Atlas (Radius successor) and CoStar UK. Radius is not a new-integration target (wind-down). Pricing and SaaS redistribution are `UNKNOWN` until contract.

4. **User / first-party evidence**  
   Listing asking price, user-reported last sale, finance inputs. Already integrated. Asking ≠ achieved.

5. **Internal observed outcomes**  
   Pipeline ready. REAL N = 0. No calibration.

## Canonical evidence families (minimum, future)

Adapters must emit these, not vendor method names:

- `OfficialSaleTransactionEvidence`
- `LeaseTermEvidence` (start/term only until rent exists)
- `AskingRentEvidence` / `PassingRentEvidence` / `ErvEvidence` (keep distinct)
- `PropertyUseEvidence`
- `PhysicalAreaEvidence`
- `ParcelGeometryEvidence`

Never `calculateCommercialValueFromVendorX()`.

## Licensing notes (verified vs unknown)

| Source | SaaS reuse | Notes |
| --- | --- | --- |
| HMLR Price Paid (HMLR fields) | CONDITIONAL YES | OGL v3.0 commercial reuse permitted. Attribution required. |
| PPD address/PAF fields | CONDITIONAL | OGL does **not** cover OS/Royal Mail address rights. Display for residential property price information services is permitted; other address uses need Royal Mail. |
| PPD UPRN / INSPIRE lookups | UNKNOWN / treat as HMLR identifiers | Published 28 Aug 2026 with monthly PPD. Historic months not included. |
| VO NDR rating list / summary valuations | REJECTED for general SaaS | Restricted to NDR purposes; not OGL; onward disclosure prohibited except those purposes. |
| PropertyData commercial sale AVM | REJECTED as valuation | Vendor: quoting rents capitalised at “standard” rates. Simplistic. Not transactions. |
| CoStar / Kato Atlas | LICENSING_REVIEW_REQUIRED | Paid. Redisplay/cache typically contract-bound. Cost unpublished. |

## Must remain NOT_ASSESSED until a later approved methodology and source exist

Commercial / industrial / agricultural / land / development sale value; ERV; passing rent; GDV; residual; agricultural income; mixed-use component values; title quality.

## Implementation (V1.2 official sale transaction evidence)

- **Source:** HM Land Registry Price Paid Data. Geography: England and Wales only. Scotland and Northern Ireland are `SOURCE_OUTSIDE_GEOGRAPHY`, not zero transactions.
- **Semantics:** official completed sale. Not asking price, AVM, comparable, current value, ERV, GDV, or class-specific CRE/ag/land/dev evidence. Type Other does not classify the subject.
- **Canonical family:** `OfficialSaleTransactionEvidence` / fact type `officialSaleTransaction`. `source = HMLR_PRICE_PAID_DATA`. Type is not provider-encoded.
- **Persistence:** `official_sale_transactions` (unique source + source_transaction_id), `official_sale_lookup_links` (all official UPRN/INSPIRE associations), and `official_sale_import_runs`. Idempotent upserts. Record status D marks `live = false` when that source id already exists.
- **Import:** offline CLI `npm run import:hmlr-ppd -- --ppd <file> [--uprn <file>] [--inspire <file>] [--release <label>]`. Streaming + batched. Analyse never downloads the national file. Download stays on the official GOV.UK / `price-paid-data.publicdata.landregistry.gov.uk` pages, not in the analyse path.
- **Validated release:** official yearly CSVs `pp-1995.csv` … `pp-2026.csv` from `price-paid-data.publicdata.landregistry.gov.uk` (same bytes as `pp-complete.csv`, ingested as yearly partitions). July 2026 UPRN/INSPIRE lookups remain current-month only. Hub updated 28 August 2026.
- **Matching:** exact UPRN, then exact compact postcode + PAON (+ SAON). Postcode-only is AREA_CONTEXT (`NO_MATCH`), not a subject sale. No fuzzy engine. After listing identity completeness: 0 EXACT_UPRN, 1 EXACT_CANONICAL_ADDRESS, 48 AREA_POSTCODE, 37 NO_TRANSACTIONS_FOUND (was 0/0/49/37). Matcher semantics were not relaxed.
- **UPRN / INSPIRE:** applied only from official lookup files. Those files cover the current monthly publication, not the 1995–2026 ledger. Historical rows without a lookup are UPRN/INSPIRE NOT AVAILABLE FROM THIS SOURCE. Existing monthly UPRN values are preserved on upsert (`COALESCE`). UPRN is 1:1 per linked transaction. INSPIRE is many-to-one: all official IDs are stored; a single `inspire_id` column is populated only when there is exactly one. UPRN ≠ title. INSPIRE ID ≠ title number.
- **Licensing (re-checked 2026-08-31):** PPD HMLR fields OGL v3.0 with Crown attribution. Address/PAF: personal/non-commercial or display for residential property price information services; other address uses need Royal Mail (`LICENSING_REVIEW_REQUIRED`). UPRN lookup: HMLR OGL + OS OGL attribution. INSPIRE lookup: HMLR OGL; using it with PPD addresses remains subject to PPD address conditions.
- **What it does NOT assess:** commercial/industrial/agricultural/land/development valuation; ERV; GDV; title; ownership; legal extent; Scotland/NI subject prices; sales absent from the imported slice.

Next remaining evidence gap after subject identity completeness: **user-declared UPRN/PAON/SAON/building/unit on listing create/edit**. Not CRE valuation. Not fuzzy identity.

