# Roadmap

**Role:** ordered future work. Revisable when evidence changes.  
Cursor recommendations and old phase labels are historical input only.

## NOW

Residential decision workspace V1 (2026-09-01): Property Intelligence requires an explicit residential job (`BUY` / `LET_INVEST` / `SELL`) and presents existing assessed outputs as a decision pack. HTTP analyse no longer silently treats every analysis as a landlord decision. Landlord formulas stay frozen for `LET_INVEST`. See `decisions/residential-decision-workspace.md`.

LET_INVEST underwriting input completion (2026-09-01): Workspace unresolved finance gaps link to progressive finance-form sections; complete user inputs unlock NOI / cash flow / DSCR where frozen methodology allows. Valuation safety unchanged. See `decisions/let-invest-underwriting-input-completion.md`.

Valuation evidence pipeline correctness (2026-09-02): Fixed `property_enrichments` upsert ON CONFLICT vs partial unique index; shared property_type tokenisation; structured AVM readiness (`MISSING_INTERNAL_AREA`, etc.). After fix: enrichments persist and `sold_prices_statistics` components reach valuation engine on sale sample; **0/6** ASSESSED (methodology-correct). See `decisions/valuation-evidence-pipeline-correctness.md`.

Property attribute evidence readiness — provenanced internal area (2026-09-02): Canonical internal-area contract; resolution from persisted EPB, listing fields, UPRN profile, optional user declaration; wired to `/valuation-sale` readiness without fabrication or methodology change. See `decisions/property-attribute-internal-area-readiness.md`.

Listing internal-area capture (2026-09-02): Optional internal floor area + unit on AddList/AddRent create/edit; server-validated LISTING_SUPPLIED persistence feeding existing canonical resolver. See `decisions/listing-internal-area-capture.md`.

## NEXT

LET_INVEST pre-GTM usability closure (2026-09-09): Presentation-only fixes for rent-basis safety, LET unlock guidance, underwriting field focus, user-facing external-lookup errors, and early gross-yield orientation. Facilitated GTM may begin. See `decisions/let-invest-pre-gtm-usability-closure.md`.

**Execute next:** **V1.2 — LET_INVEST Limited Real-User GTM Validation** (`decisions/let-invest-limited-gtm-validation.md`). Real-user results still PENDING. Do not start rental engine V2, DI V2, or valuation.

Prior audit: `decisions/let-invest-pre-gtm-ui-ux-readiness-audit.md`. Prior underwriting validation: `decisions/let-invest-underwriting-real-product-validation.md`. BUY/SELL remain parked. MARKET_CONTEXT presentation integrity remains closed.

Do not reopen BUY/SELL as the wedge. Do not add fuzzy matching. Do not loosen comparable v1.1 sufficiency. Controlled unique PropertyData UPRN (`enrich:listing-identity --paid-uprn`) remains an existing licensed fallback, not the next official source.

## LATER

- Bounded EPB re-acquisition for listings that actually have declared SAON (existing exact matcher only)
- Specialist commercial/industrial transaction and lease procurement (Kato Atlas and/or CoStar) only after a real CRE methodology and evidence model exist
- Specialised valuation family (commercial / industrial / agricultural / land) — only after authoritative methodology research
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
                → official MHCLG EPB (E&W) physical + unique UPRN evidence (live path evidenced 2026-09-01; unique attach 2/86; coverage limited by identity)
                → user-declared UPRN/PAON/SAON/building capture (first-party; not verification)
                → later specialist CRE source, then specialised valuation / income engines
Legal live wiring
    → private evidence production (PARKED / blocked by infrastructure)
Planning + Environment (live)
    → later development feasibility (not now)
Outcomes pipeline (ready)
    → calibration only after real N
```
