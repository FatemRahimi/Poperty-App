# V1.2 — Subject Property Attributes & AVM Contract Correctness
## Architecture Decision Record

**Phase:** V1.2  
**Status:** COMPLETE  
**Measured:** 2026-09-04  
**Live `/valuation-sale` calls:** **0**  
**Cohort:** same 6 genuine HMLR subjects (facts not invented)

---

## What shipped

1. **Canonical subject attributes** (`subjectPropertyAttributes.js` + service)  
   bedrooms, bathrooms, outdoor (none|garden|balcony_terrace), off-street parking  
   Provenance: OFFICIAL | LICENSED_PROVIDER | FIRST_PARTY | USER_REPORTED  
   UNKNOWN ≠ ZERO / NONE

2. **Subject-native capture**  
   `PUT/GET /api/ai/intelligence/subjects/:subjectId/attributes`  
   Auth: `authenticateAI` + subject lookup ACL  
   Persists into `intelligence_subjects.attributes` JSONB merge

3. **finish_quality**  
   Not a canonical platform fact. Stored only as `providerRequestInputs.finishQuality`  
   No EPC/habitable-room/default-average inference

4. **Complete AVM readiness**  
   `PROVIDER_ELIGIBLE` requires all documented PropertyData inputs  
   Structured `missingFields`  
   Confirmed `outdoor_space=none` and `off_street_parking=0` sendable

5. **Workspace**  
   Minimal unresolved hints for subject attribute / finish gaps

---

## Six-subject live readiness (no invented facts)

```
6 subjects → 0 PROVIDER_ELIGIBLE
missing includes bedrooms + bathrooms + finish_quality + outdoor + parking
(construction already complete for 5/6)
```

Expected: finish_quality remains dominant subjective gap; other fields need USER_REPORTED capture.

---

## Classification

**A — SUBJECT_ATTRIBUTE_CONTRACT_PROVEN**  
(with expected live incompleteness → finish_quality / user input still required)

## Verdict

**SUBJECT PROPERTY ATTRIBUTES PASSED — NEXT BLOCKER IDENTIFIED**

Dominant blocker for live cohort AVM: legitimate USER_REPORTED capture of beds/baths/outdoor/parking **and** subjective finish_quality provider-request input — not readiness lying about eligibility.
