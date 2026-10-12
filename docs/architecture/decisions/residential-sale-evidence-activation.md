# V1.2 — Residential Sale Evidence Activation
## Architecture Decision Record

**Phase:** V1.2  
**Status:** COMPLETE — Evidence vacuum reconfirmed (no production code changes)  
**Measured:** 2026-09-04 (re-audit of listing sale+price inventory under current readiness, including required `construction_date`)  
**Prior measure:** 2026-09-03 (same 0/24 result; EPB unlock data-op 0 unique matches)  
**Freeze:** Valuation methodology, identity programme, new providers — all frozen.

---

## 1. Objective

Activate *existing* authorised evidence on the real listing sale inventory to
maximise defensible `PROVIDER_ELIGIBLE` subjects without fabrication.

Success is attribute readiness, not ASSESSED valuation.

---

## 2. Pre-flight / duplication audit

Confirmed already complete — **not rebuilt**:

| Capability | Status |
|---|---|
| Valuation Evidence Readiness | COMPLETE |
| Valuation Evidence Pipeline Correctness | COMPLETE |
| Canonical Internal Area | COMPLETE |
| Listing Internal Area Capture | COMPLETE |
| Internal Area Evidence Gap / Workspace CTA | COMPLETE |
| EPB evidence integration | COMPLETE |
| Property type canonicalisation | COMPLETE |
| Residential Decision Workspace | COMPLETE |
| LET_INVEST underwriting completion | COMPLETE |
| Subject-native valuation execution (separate path) | COMPLETE / live closure blocked on construction age for HMLR cohort |

No duplicate resolvers, fields, or UI flows introduced.

---

## 3. Cohort

**24** properties with `category = 'sale' AND price > 0`.

---

## 4. Before / after coverage

| Metric | Before | After |
|---|---|---|
| sale+price subjects | 24 | 24 |
| canonical area coverage | 0 usable | 0 usable |
| canonical residential type mapped | 18 | 18 |
| `PROVIDER_ELIGIBLE` | 0 | 0 |
| `MISSING_INTERNAL_AREA` | 17 | 17 |
| `INVALID_INTERNAL_AREA` | 1 | 1 |
| `UNMAPPED_PROPERTY_TYPE` | 6 | 6 |
| AVM requested | 0 | 0 |
| AVM returned | 0 | 0 |
| valuation ASSESSED | 0 | 0 |

**Zero safe activations.** Latent structured evidence flowing but unused: **0**.

Artefact: `server/scripts/sale-evidence-activation-audit-output.json`

---

## 5. Property-type classification (6 unmapped)

| Id | Raw | Class | Action |
|---|---|---|---|
| 129 | commercial | C non-residential | Do not map |
| 132 | warehouse | C non-residential | Do not map |
| 135 | office | C non-residential | Do not map |
| 137 | retail | C non-residential | Do not map |
| 146 | retail | C non-residential | Do not map |
| 147 | park-home | D unsupported residential subtype | Do not map (PropertyData has no enum) |

---

## 6. Invalid area (id 133)

`square_feet = 311098324` → `INVALID_INTERNAL_AREA` (implausible).  
Has `year_built = 2010` (construction would map) but area cannot be safely normalised.  
Owner correction via existing edit flow only.

---

## 7. Construction date note (post live-closure gate)

15/24 sale subjects already have `year_built` and would map `construction_date`.  
Current dominant blocker remains **area**, not construction date.  
Of 17 `MISSING_INTERNAL_AREA` residential-mapped subjects, **12** already have year_built; **5** would still need construction evidence after area is supplied.

---

## 8. EPB reuse

0 sale subjects have persisted `UNIQUE_ATTACH` EPB floor area.  
Prior EPB unlock on the 17 missing-area cohort: **0 unique matches** (`sale-area-unlock-epb-output.json`).  
No EPB reacquisition in this phase.

---

## 9. User-completion path

Unchanged and verified by existing contracts:

- Workspace gap → `edit_listing` (`internalAreaEvidenceGap.js`)
- Listing edit route (`listingEditNavigation.js` → `/addlist`)
- `parseListingInternalAreaInput` → LISTING_SUPPLIED / USER_DECLARED path into canonical resolver

Do not auto-populate.

---

## 10. Live AVM

Not run — **0 PROVIDER_ELIGIBLE**.

Gate distinction:

| Gate | Status |
|---|---|
| ATTRIBUTE_BLOCKED | **Dominant** (17 missing area + 1 invalid) |
| PROVIDER_BLOCKED | Not reached |
| METHODOLOGY_BLOCKED | 5 commercial types + 1 park-home correctly out of residential AVM |

---

## 11. Single next capability

**E INVENTORY_SOURCE_QUALITY**

This listing sale inventory does not contain activatable property-specific area
evidence, and official EPB exact-match already returned zero attaches on the
same addresses. Further identity or provider spend on this stock is not the
highest-leverage path; genuine subject intake (or owner-declared area on real
listings) is.

Official HMLR subject-native cohort remains a separate validated path (blocked
on construction age for live AVM closure — not this listing inventory).

---

## 12. Freeze compliance

| Freeze | Respected |
|---|---|
| Valuation methodology / safety | Yes |
| Identity programme | Yes — not started |
| New provider | Yes |
| Fabrication | Yes |
| Production code changes | **Zero** this phase |
