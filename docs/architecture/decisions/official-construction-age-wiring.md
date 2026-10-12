# V1.2 — Official Construction Age Wiring
## Architecture Decision Record

**Phase:** V1.2  
**Status:** COMPLETE — age path proven; live AVM still blocked by other required provider inputs  
**Measured:** 2026-09-04  
**Cohort:** same 6 genuine HMLR subjects  
**Freeze:** valuation methodology/safety unchanged; no commit/push

---

## Authoritative RdSAP mapping

**Source:** MHCLG `communitiesuk/epb-view-models` gem  
`Helper::XmlEnumsToOutput::CONSTRUCTION_AGE_BAND` + `construction_age_band_lookup`  
File: `lib/helper/xml_enums_to_output.rb`  
https://github.com/communitiesuk/epb-view-models

**Applicability:**
- E&W table for non-NI `schema_type` (this cohort)
- NI table when schema contains `-NI-` (not used for these 6)
- Letter K/L overrides depend on `schema_type` (and RdSAP report type)
- Cohort certificates expose `schema_type` (RdSAP 17/20/21) — sufficient for deterministic decode

## Multiple building parts

Certificates may contain multiple `sap_building_parts` with different age codes  
(observed: Main Dwelling + Extensions).

**Rule:** preserve every part/code. Canonical dwelling age = **Main Dwelling** only  
(certificate identifier semantics). Never newest/oldest/average/midpoint.

## PropertyData mapping

Wholly-inside enum rule only:

| Source period | PD enum |
|---|---|
| entirely < 1914 | `pre_1914` |
| entirely within [1914, 2000) | `1914_2000` |
| entirely ≥ 2000 | `2000_onwards` |
| crosses 1914 or 2000 | **not mappable** |

Examples: A safe; B not (1900–1929); C–H safe; I not (1996–2002); J+ safe.

Midpoint mapping removed from `mapConstructionDateFromAgeBand`.

## Exact year path

`year_built` → `mapConstructionDate(year)` preserved. Provenance stays  
`USER_DECLARED` / `InternalListing` — never upgraded to `OFFICIAL_EPB`.

## Measured funnel (6 subjects)

6 → raw 6 → parsed 6 → decoded 6 → canonical 6 → PD-mappable 5 → PROVIDER_ELIGIBLE 5

TN4 (letter B) correctly not PD-mappable (period crosses 1914).

## Live gate (max 3)

3 live `/valuation-sale` calls with `construction_date` present from official EPB.  
All returned `PROVIDER_REQUEST_REJECTED` (request contract). Docs list further required  
fields (`bedrooms`, `bathrooms`, `finish_quality`, `outdoor_space`, `off_street_parking`)  
absent from legitimate subject evidence — inventing them is forbidden.

## Classification

**A — OFFICIAL_AGE_WIRING_PROVEN**

## Verdict

**OFFICIAL CONSTRUCTION AGE WIRING PASSED — AGE PATH PROVEN, NEXT BLOCKER IDENTIFIED**

## Implementation surfaces

- `rdSapConstructionAgeBand.js` — authoritative decode + wholly-inside PD map
- `officialConstructionAgeEvidence.js` — canonical contract
- `mhclgEpbParser.js` — retain `sap_building_parts[].construction_age_band`
- `mhclgEpbAcquisition.js` — client snapshot age evidence
- `propertyTypeMapping.js` — safe PD mapping (no midpoint)
- `subjectNativeSaleValuation.js` — consume official evidence

## Hard boundaries

No new provider, no invented year, no methodology/safety change, no 24-listing cohort.
