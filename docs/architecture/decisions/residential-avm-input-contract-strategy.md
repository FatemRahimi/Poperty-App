# V1.2 — Residential AVM Input Contract & Evidence Strategy
## Architecture Decision Record

**Phase:** V1.2  
**Status:** COMPLETE — strategy checkpoint (no production feature implementation)  
**Measured:** 2026-09-04  
**Cohort:** same 6 genuine HMLR subjects  
**Live `/valuation-sale` calls this phase:** **0**  
**Freeze:** no bedrooms/bathrooms/finish/outdoor/parking acquisition implemented

---

## Complete PropertyData `/valuation-sale` contract

Authoritative docs:

- https://propertydata.co.uk/api/documentation/valuation-sale
- https://propertydata.co.uk/api/documentation/valuation-options

| Field | Required | Type / enums | Notes |
|---|---|---|---|
| `key` | Y | string | Auth |
| `postcode` | Y | string | Full UK postcode |
| `property_type` | Y | `flat` \| `detached_house` \| `terraced_house` \| `semi-detached_house` | |
| `construction_date` | Y | `pre_1914` \| `1914_2000` \| `2000_onwards` | Exact year not accepted |
| `internal_area` | Y | number (sqft) | Min 300 |
| `bedrooms` | Y | integer 0–5 | UNKNOWN not allowed |
| `bathrooms` | Y | integer 0–5 | UNKNOWN not allowed |
| `finish_quality` | Y | `very_high` \| `high` \| `average` \| `below_average` \| `unmodernised` | Subjective |
| `outdoor_space` | Y | `none` \| `balcony_terrace` \| `garden` \| `garden_very_large` | |
| `off_street_parking` | Y | integer 0–3 | Zero is a valid value |
| `output` | N | `json` \| `pdf` | Default json |
| `pdf_heading` | N | string | PDF only |

Live corroboration (prior phases, not this phase): `Missing input: construction_date`; after age wiring, request-contract rejection with `construction_date` present — remaining required fields still omitted.

**Contract completeness:** this list is the full documented input surface. No undocumented extras inferred.

---

## Local adapter comparison

`buildValuationSaleRequest` readiness-gates only:

`property_type`, `postcode`, `internal_area`, `construction_date`

Then marks **PROVIDER_ELIGIBLE** while optionally attaching bedrooms/bathrooms/finish/outdoor/parking **only if present and >0 / mappable**.

Mechanical defects:

- Claims eligibility without five documented required fields
- Never sends `outdoor_space=none` or `off_street_parking=0`
- Never sends `bedrooms=0` / `bathrooms=0`

**Adapter overall:** `G — LOCAL_REQUEST_CONTRACT_STILL_INCOMPLETE_OR_WRONG`  
(Not fixed in this phase — default zero production changes; fix is a later bounded readiness correction, not attribute acquisition.)

---

## Six-subject coverage funnel (official evidence only)

```
6 genuine subjects
→ 6 identity (postcode)
→ 6 area
→ 6 type (HMLR code → PD enum)
→ 5 construction (TN4 letter B not PD-mappable)
→ 0 bedrooms
→ 0 bathrooms
→ 0 finish_quality
→ 0 outdoor_space
→ 0 off_street_parking
→ 0 COMPLETE_PROVIDER_CONTRACT
```

---

## Raw EPB findings (same 6 certificates)

Present and useful (already used or type-adjacent):

- `total_floor_area`, `built_form`, `property_type` / `dwelling_type`
- `sap_building_parts[].construction_age_band`
- `habitable_room_count`, `heated_room_count` on all 6

**Explicit non-equivalence (do not stretch):**

| Raw field | Not equal to |
|---|---|
| `habitable_room_count` | `bedrooms` |
| `heated_room_count` | `bedrooms` |
| `rooms_with_bath_and_or_shower` (WWHRS) | `bathrooms` |
| energy rating / window description | `finish_quality` |
| `built_form` | parking / outdoor |

No bedrooms, bathrooms, garden, parking, or finish_quality fields observed as PropertyData-mappable values.

---

## Canonical attribute classification

| Attribute | Classification | Platform value if PD gone? |
|---|---|---|
| postcode / identity | CORE_CANONICAL | Yes |
| internal area | CORE_CANONICAL | Yes |
| property type | CORE_CANONICAL | Yes |
| construction age | CORE_CANONICAL | Yes |
| bedrooms | CORE_CANONICAL | Yes |
| bathrooms | CORE_CANONICAL | Yes |
| garden / outdoor (boolean or coarse) | DOMAIN_CANONICAL | Yes |
| parking count / garage | DOMAIN_CANONICAL | Yes |
| `finish_quality` PD enum | PROVIDER_SPECIFIC_ONLY / SCENARIO | **No** — subjective unlock |
| `outdoor_space` PD granularity (`garden_very_large`) | PROVIDER_SPECIFIC_ONLY | Weak |
| `off_street_parking` 0–3 clamp | PROVIDER_SPECIFIC mapping | Count itself has value |

---

## User-declared / first-party capability (audit only)

| Field | Listing capturable today? | Subject-native? | Notes |
|---|---|---|---|
| bedrooms | Yes (`properties.bedrooms`; 71/86) | No dedicated subject attribute capture | Listing-only |
| bathrooms | Yes (73/86) | No | Listing-only |
| garden | Yes (`has_garden`) | No | Boolean ≠ full PD enum |
| parking | Yes (`parking_spaces` / garage) | No | Zero/default semantics muddy |
| finish_quality | **No** — no `condition` column | No | Not capturable without new field |
| construction / area | Yes / EPB | Wired | Done |

USER_DECLARED must remain USER_DECLARED. User-declared identity path exists for PAON/SAON/UPRN only — not beds/baths/finish.

PropertyData UPRN profile can supply bedrooms/bathrooms when paid/licensed match exists — not free official evidence; not used to invent values for this cohort.

---

## Provider-fit assessment

**Rating: CONDITIONAL_FIT**

- Strong for marketplace listings that already carry beds/baths/garden/parking
- Weak for official-evidence-first subject-native HMLR cohort (0/6 complete)
- Requires subjective `finish_quality` with no official source
- High friction before first subject valuation if every attribute must be declared
- Platform-value attributes (beds/baths/garden/parking) are still worth capturing **even if PropertyData disappeared**
- `finish_quality` is primarily a **provider-unlock** attribute

---

## Classification

**C — HYBRID_OFFICIAL_PLUS_USER_INPUT_IS_BEST_PATH**

Official/open: identity, area, type, construction age.  
First-party / user-declared: bedrooms, bathrooms, outdoor, parking.  
Provider-specific subjective: finish_quality only if product chooses to keep PropertyData AVM — not a core official attribute programme.

Secondary finding (not the roadmap class): local readiness still incorrectly claims PROVIDER_ELIGIBLE (`G`).

---

## Verdict

**RESIDENTIAL AVM INPUT STRATEGY PASSED — HYBRID PATH IDENTIFIED**

## Artefact

`server/scripts/residential-avm-input-contract-strategy-output.json`

## Hard stop

Do not implement Bedroom/Bathroom/Finish/Parking/Outdoor engines in this phase.
