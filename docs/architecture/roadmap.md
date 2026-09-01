# Roadmap

**Role:** ordered future work. Revisable when evidence changes.  
Cursor recommendations and old phase labels are historical input only.

## NOW

Canonical subject identity is **implemented**: contract `canonical-subject-identity-1.0.0`, listing-field PAON/postcode persistence, unique-UPRN gate, analyse uses persisted identity without paying PropertyData on every run. Official HMLR historical ledger remains **implemented and operationally validated** (31,525,946 live transactions, 1995–2026). Exact subject matching is still exact-only. After identity backfill, existing listings: **1 EXACT_CANONICAL_ADDRESS**, **0 EXACT_UPRN**, **48 AREA_POSTCODE**, **37 NO_TRANSACTIONS_FOUND**. UPRN coverage on listings is still 0. SAON coverage is 0. Residential PI, Planning, Environment, Legal-foundation, and PropertyData overlays remain. No specialised non-residential valuation.

## NEXT

**Official MHCLG Energy Performance of Buildings (England and Wales) acquisition — identity + physical/energy evidence. NOT IMPLEMENTED.**

Decision: `docs/architecture/decisions/physical-property-identity-source.md`. Unique exact certificate match only. Persist OGL UPRN as `SOURCE_ASSERTED` / `OFFICIAL`, not `VERIFIED_EXACT`. Persist floor area, ratings, built form, construction age, and envelope/heating descriptions as energy/physical facts. EPC is not a survey and must not enter valuation.

Do not add fuzzy matching. Do not start commercial valuation, CRE procurement, ERV, GDV, or Phase 9.3. User-declared UPRN/PAON/SAON remains a later fallback. Controlled unique PropertyData UPRN (`enrich:listing-identity --paid-uprn`) remains an existing licensed fallback, not the next implementation.

This is the single recommended next implementation. Do not start specialised valuation engines.

## LATER

- Specialist commercial/industrial transaction and lease procurement (Kato Atlas and/or CoStar) after the official PPD layer exists
- Specialised valuation family (commercial / industrial / agricultural / land) — only after a real methodology and evidence model exist
- Income / occupancy / lease intelligence (not residential rent reused)
- Finance presentation generalisation beyond BTL
- Building condition intelligence after real inspection evidence
- Development value identity after explicit value-state contracts
- Decision Intelligence V2 consuming domain envelopes
- Portfolio V2

## PARKED

- Production private-evidence deployment (Phase 9.3 and vendor selection)
- HMLR paid title integration
- Legal interpretation / OCR / LLM extraction
- ML / calibration
- Survey ingestion and CapEx estimating
- Project management / asset management products

## BLOCKED

| Item | Dependency |
| --- | --- |
| Production private evidence ingest | Real private object store + scanner + encryption/backup proof in the actual host |
| Outcome calibration | REAL N > 0 genuine sale pairs (`INSUFFICIENT_REAL_OUTCOMES`) |
| Authoritative title register facts | Licensed official source; user upload is not that source |

## Dependencies

```
Identity + classification + methodology gate + Market evidence envelope
    → official HMLR Price Paid monthly ingest (validated)
        → historical PPD backfill (validated, yearly 1995–2026)
            → listing identity completeness (canonical PAON/SAON contract; UPRN unique-only)
                → official MHCLG EPB (E&W) physical + unique UPRN evidence (DECIDED, not implemented)
                → later user-declared UPRN/PAON/SAON fallback
                → later specialist CRE source, then specialised valuation / income engines
Legal live wiring
    → private evidence production (PARKED / blocked by infrastructure)
Planning + Environment (live)
    → later development feasibility (not now)
Outcomes pipeline (ready)
    → calibration only after real N
```
