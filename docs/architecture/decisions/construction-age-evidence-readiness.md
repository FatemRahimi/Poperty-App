# V1.2 — Construction Age Evidence Readiness
## Architecture Decision Record

**Phase:** V1.2  
**Status:** COMPLETE — readiness checkpoint (no production code changes)  
**Measured:** 2026-09-04  
**Cohort:** same 6 genuine HMLR subjects (EPB-unique + official floor area)  
**Freeze:** no live `/valuation-sale`, no sale-inventory activation, no commit/push

---

## Finding

Raw domestic EPB certificates for **all 6** subjects contain construction age as
RdSAP **letter codes** under:

`sap_building_parts[identifier=Main Dwelling].construction_age_band`

Examples observed: `A`, `B`, `C`, `E`, `G`, `J`.

The current parser only reads top-level `construction_age_band` /
`constructionAgeBand`, which is **absent** on these Register certificate
payloads. Parsed/client snapshot age is therefore always null — a **mechanical
drop**, not source absence.

Letter → PropertyData enum still requires an **official RdSAP age-band table**
and wholly-inside enum mapping (no midpoint invention). That decode is **not**
implemented; readiness identifies the path, does not unlock AVM in this phase.

---

## Choice

**B MECHANICAL_AGE_EVIDENCE_WIRING_DEFECT**

## Verdict

**CONSTRUCTION AGE EVIDENCE READINESS PASSED — EXISTING PATH IDENTIFIED**

Artefact: `server/scripts/construction-age-evidence-readiness-output.json`
