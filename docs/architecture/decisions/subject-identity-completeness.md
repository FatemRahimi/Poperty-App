# Decision: Subject identity completeness

**Status:** IMPLEMENTED_AND_EVIDENCED for the canonical identity path; IMPLEMENTED_BUT_LIMITED for live coverage.  
**Date:** 2026-09-01  
**Phase:** V1.2 subject identity completeness and exact official evidence linkage  
**Contract:** `canonical-subject-identity-1.0.0`

This extends the shared Property Intelligence Kernel identity model. It does not create a parallel identity system.

## Decision

Use **first-party listing fields** as the primary canonical identity source (PAON, SAON, postcode), with deterministic normalisation only.

Use the **already licensed PropertyData `/address-match-uprn`** path for UPRN only when exactly one distinct UPRN is returned. Multiple candidates remain `UNRESOLVED`. Do not pick `list[0]`.

Do **not** purchase a new provider. OS Open UPRN remains a CANDIDATE identifier dataset, not an address gazetteer, and is not integrated in this phase.

## Why

The historical HMLR ledger is present (31,525,946 live transactions). Exact subject attachment failed because listings had 0 UPRNs, incomplete house numbers, and untrimmed/malformed PAON-equivalent values. That is an identity completeness problem.

## Verification semantics

| State | Meaning |
|---|---|
| `VERIFIED_EXACT` | Reserved for exact official unique confirmation. Unused in this inventory backfill. |
| `SOURCE_ASSERTED` | Listing fields or a unique licensed UPRN match. Not verified. |
| `USER_DECLARED` | Explicit owner/admin identity input on create/edit. First-party evidence. Never promoted to `VERIFIED_EXACT` because it was typed in a form. |
| `INFERRED` | Must not be labelled verified. Not used to invent UPRN or merge units. |
| `UNRESOLVED` | Insufficient or ambiguous identity. Valid. |

UNKNOWN / UNRESOLVED is valid. A wrong property match is worse than UNKNOWN.

## Address canonicalisation

Safe only: trim whitespace (including NBSP), UK postcode casing/spacing, explicit PAON/SAON split, preserve source values on `properties`.

Not done: Levenshtein/fuzzy identity; merging Flat 5/6, 12/12A, building/unit; inferring UPRN from postcode; choosing one of many UPRNs.

## Invocation / cost

- Analyse does **not** pay for identity (`allowPaidIdentity: false`).
- Create/update persist listing-field identity and must not block on failure.
- CLI `npm run enrich:listing-identity` is listing-fields by default.
- `--paid-uprn` is explicit, unique-only, cached, and cost-protected. Successful identity is persisted so the same listing is not paid again.
- No AI credit charging for identity enrichment.

## Licensing

- Listing source addresses remain first-party records.
- PropertyData UPRN is licensed matcher evidence, not OS/HMLR official unique confirmation, and not title identity.
- HMLR PPD address/PAF display remains `LICENSING_REVIEW_REQUIRED` beyond residential property price information services.
- OS Open UPRN attribution would be required if that CANDIDATE is later used. It is not used here.
- Bulk address datasets are not exposed. Identity rows are per listing and follow existing listing access control.

## Live inventory (listing-fields backfill)

BEFORE: 86 properties; 84 postcode; 0 UPRN; 0 canonical PAON; 0 canonical SAON; 3 identity rows unresolved.  
AFTER: 86 identity rows; 0 UPRN; 79 PAON; 0 SAON; `VERIFIED_EXACT` 0; `SOURCE_ASSERTED` 77; `UNRESOLVED` 9.

HMLR: `EXACT_UPRN` 0; `EXACT_CANONICAL_ADDRESS` 1; `AREA_POSTCODE` 48; `NO_TRANSACTIONS_FOUND` 37.

Manual audit of the one exact match (listing 63, PAON 15 / WV14 6BA vs HMLR 15 CLAREMONT STREET): adjacent 17 and 17A in the same postcode were not attached. Wrong-property count in the audited sample: 0.

## Follow-on (2026-09-01)

Official MHCLG Energy Performance of Buildings (England and Wales) acquisition path is live (`official-epb-evidence-1.0.0`). Controlled 86-listing enrich 2026-09-01: unique attach 2/86; canonical UPRN 2/86; `UNRESOLVED_UNIT_IDENTITY` 24 (0 canonical SAON).

## User-declared identity (2026-09-01)

Owner/admin capture and edit of canonical PAON, SAON/unit, building name, and optional UPRN is implemented on the existing identity tables (migration `027`). It is **not** official verification.

- Source/display address remains on `properties.*`. Canonical components live on `property_identities`.
- User-entered components are `USER_DECLARED` / `USER_DECLARED` evidence. The client cannot inject `VERIFIED_EXACT`, `OFFICIAL`, `OFFICIAL_OPEN`, or provider provenance.
- UPRN is optional, structurally validated (`1–12` digits, not all zeros), never derived, and never looked up from PropertyData on create/edit/analyse.
- A user-declared UPRN that differs from an existing EPB/licensed UPRN records a conflict event and does not overwrite the official claim.
- Building name is a separate column from SAON/unit. `12` is not `12A`. Flat 5 is not Flat 6.
- Land and development sites may omit PAON/SAON/UPRN. Those gaps stay `UNRESOLVED` / not applicable; parcel and title identity are not invented.
- Identity changes do not rewrite historical `ai_requests` snapshots.
- Existing 86 listings were **not** auto-filled. Coverage improves only when an authorized user actually declares identity.
- Future EPB/HMLR analyses may use improved canonical identity through the **existing** exact matchers. The EPB unit gate is unchanged: unit-like + no SAON remains unresolved.

APIs (JWT; owner or admin; unauthorized → 404, not a public identity feed):

- `GET /api/properties/:id/identity`
- `GET /api/properties/:id/identity/events`
- `PUT /api/properties/:id/identity`

Create/update listing also accepts `identity_paon`, `identity_saon`, `identity_building_name`, `identity_uprn` without blocking listing persistence.

See `physical-property-identity-source.md` and `official-epb-evidence.md`.
