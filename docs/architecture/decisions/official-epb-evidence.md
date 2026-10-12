# Implementation: Official MHCLG EPB evidence

**Status:** `IMPLEMENTED_AND_EVIDENCED` for the official acquisition path; `IMPLEMENTED_BUT_LIMITED` for inventory coverage.  
**Date:** 2026-09-01  
**Contract:** `official-epb-evidence-1.0.0`  
**Source:** MHCLG Energy Performance of Buildings open data (England and Wales)

This document records the implemented acquisition architecture. The source decision remains `physical-property-identity-source.md`.

## Architecture

```
Listing
  → England/Wales geography gate
  → canonical first-party PAON/postcode (SAON if present)
  → domestic + non-domestic search (bounded pages, **postcode candidate discovery**; bare PAON is not sent as `address` because the official search 404s)
  → exact in-memory PAON/SAON evaluation (including house number on `addressLine3`)
  → unique attach or UNRESOLVED / NO_MATCH_FOUND
  → fetch current certificate by certificateNumber
  → persist OGL facts (no address gazetteer)
  → optional SOURCE_ASSERTED UPRN into existing property_identities
  → BUILDING_CONDITION energy/physical envelope
  → propertyFacts (report/context only)
  → AiRequest snapshot
```

Analyse never pays PropertyData for identity. National CSV download is not used.

## Authentication

Bearer token from `MHCLG_EPB_BEARER_TOKEN` (alias `EPB_API_TOKEN`). Never hardcoded, never committed, never sent to the client, never logged. Missing token → `UNAVAILABLE_MISSING_CREDENTIAL`. Official EPB is then not assessed.

## API contract used

Primary documentation retrieved 2026-09-01:

- Base: `https://api.get-energy-performance-data.communities.gov.uk`
- `GET /api/domestic/search`
- `GET /api/non-domestic/search`
- `GET /api/certificate?certificate_number=`
- Identity field: `certificateNumber` / `CERTIFICATE_NUMBER`
- `LMK_KEY` is ignored and is not persisted

Rate limit: 6,000 requests / 5 minutes / IP. HTTP 429 maps to `SOURCE_ERROR` / `RATE_LIMITED`. Timeouts and 5xx are source errors, not negative evidence.

## Refresh policy

Persisted unique-attach rows are reused for 30 days (`MHCLG_EPB_REFRESH_TTL_MS`, default 2,592,000,000 ms). Re-search when no row exists, TTL expired, or an explicit skip-cache refresh. A newer certificate is inserted; historical certificate rows are retained. Saved analyses are not rewritten.

## Geography

England and Wales only. Scotland and Northern Ireland → `SOURCE_OUTSIDE_GEOGRAPHY`. Missing postcode → `GEOGRAPHY_NOT_ESTABLISHED`. Those states are not “no EPC”, “no energy data”, or “no building”. TD15 is treated as England.

## Identity matching

Provider search is candidate discovery, not identity. Exact postcode + PAON, plus SAON/unit when the listing has one. Postcode-only never attaches. 12 ≠ 12A. Flat 5 ≠ Flat 6.

If the listing appears unit-specific (flat, maisonette, suite, mixed-use, unit tokens in the address) and canonical SAON is missing: `UNRESOLVED_UNIT_IDENTITY`. A building-level certificate is never attached as flat evidence. Coverage loss is accepted.

No Levenshtein, no LLM matching, no `candidate[0]`, no substring named-building match.

JSON fields are persisted only when present on the returned certificate payload after allowlist parsing. Historic CSV dictionary columns are not assumed. Sentinels and DEC operational rating `9999` map to missing.

Restricted MHCLG address/postcode fields are used only in memory for matching. They are not stored as a gazetteer.

## UPRN enrichment

A uniquely attached certificate with one distinct UPRN is persisted as `SOURCE_ASSERTED` / `OFFICIAL_OPEN` / source `MHCLG_EPBD`. Never `VERIFIED_EXACT`. Conflicting existing UPRNs are recorded on `property_identity_events` and not overwritten.

## Evidence fields

Domestic (when present): UPRN, property type, built form, total floor area m², current/potential ratings and efficiency, construction age band, wall/roof/window/heating/hot-water descriptions and ratings, inspection and lodgement dates, certificate metadata.

Non-domestic (when present): UPRN, building/use type, floor area, asset rating, energy band, fuel/environment fields, inspection/lodgement dates, certificate metadata.

Sentinels `NO DATA!`, `N/A`, `Not recorded`, `INVALID` map to missing, never to zero or factual strings.

Potential rating is modelled `INFERENCE`, not a current fact.

## Building domain

Official EPC activates `BUILDING_CONDITION` only as energy/physical evidence. Professional condition stays not assessed. EPC ≠ survey.

## Licensing

OGL v3.0 for non-address fields including UPRN, with attribution. Address and postcode remain OS/Royal Mail restricted and are not persisted as reusable address data. Uncertain fields are omitted (`LICENSING_REVIEW_REQUIRED` rather than guessed).

## Privacy

No token logging. No unrestricted raw response logging. No bulk address exposure. Existing listing ACL. Client receives sanitised snapshots only.

## Freeze

valuationEngine, comparableEngine, assessment safety, rent, finance, Personal Decision, and Decision Intelligence are unchanged. EPC rating, floor area, and age band do not move value. Asset class is not inferred from domestic vs non-domestic.

## Live inventory and validation

Measured 2026-09-01 against the current 86-property inventory after live MHCLG diagnostic + controlled enrich:

BEFORE: UPRN 0/86; official EPB rows 0; HMLR `EXACT_UPRN` 0; HMLR `EXACT_CANONICAL_ADDRESS` 1.

AFTER: unique attach **2/86**; certificates persisted **3** (property 147 retains two historical non-domestic certificates); current energy rating 2; floor area 1; physical characteristics 1; canonical UPRN **2/86** (`SOURCE_ASSERTED` / `OFFICIAL_OPEN` / `MHCLG_EPBD`, never `VERIFIED_EXACT`); HMLR `EXACT_UPRN` still **0**; `EXACT_CANONICAL_ADDRESS` still 1.

Acquisition outcomes: `UNRESOLVED_UNIT_IDENTITY` 24; `NO_MATCH_FOUND` 51; `INSUFFICIENT_IDENTITY` 7; `GEOGRAPHY_NOT_ESTABLISHED` 2; `SOURCE_OUTSIDE_GEOGRAPHY` 0; `SOURCE_ERROR` 0; `MULTIPLE_UPRNS` 0.

Live contract corrections evidenced against the official JSON API: do not send bare PAON as `address` (provider 404); paginate postcode search; extract house number from `addressLine3`; fetch bodies omit `certificateNumber` (keep search/request identifier); nested `walls`/`roofs`/`window`/`main_heating` descriptions; numeric `property_type`/`tenure` enums are not promoted as text characteristics.

Acquisition path: `IMPLEMENTED_AND_EVIDENCED`. Whole-stock / UK-wide / professional building condition: `IMPLEMENTED_BUT_LIMITED` / `NOT_ASSESSED`.

Migration `026_official_epb_certificates.sql` is the persistence model. No follow-up migration was required.
