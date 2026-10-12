# Decision: Official HMLR → Bounded Residential Comparable Assessment

**Status:** IMPLEMENTED (methodology + runtime) — **v1.1.0 sufficiency closure**  
**Date:** 2026-09-08  
**Phase:** V1.2 — Official HMLR Transaction → Bounded Residential Comparable Assessment  

**methodology_id:** `official-hmlr-residential-comparable-assessment`  
**methodology_version:** `1.1.0`

This is **selection + evidence assessment**, not adjusted valuation. It does not create ComparableEngineV2 or mutate `comparableEngine.js`.

---

## Purpose

Convert existing official HMLR Price Paid completed-sale rows into a bounded, explainable **comparable sold-evidence** assessment for residential BUY/SELL price context.

Answers: Are there sufficient comparable completed sales? Which? Why? Recency? Geography? Type? Observed sold-price range/median of the selected set? Limitations?

Does **not** answer: “This property is worth £X.”

---

## Existing `comparableEngine.js` audit (duplication check)

| Question | Finding |
|---|---|
| Live? | Yes — rent/sale listing similarity for `rentIntelligenceService` / `saleIntelligenceService` |
| Inputs | Application `properties` rows (beds, baths, sqft, features, asking/sold on listings) |
| HMLR? | **No** — tests assert no `officialSale` / `hmlrPricePaid` coupling |
| Unsafe valuation? | Produces similarity + weighted medians of listing rents/prices; not HMLR official comps |
| Reuse? | Reuse only tiny pure helpers if needed (`canonicalPropertyTypeToken`). **Do not** overload this engine for PPD |

New module: `officialTransactionComparableAssessment` under market intelligence.

---

## Applicable asset classes

**RESIDENTIAL only**, with mappable HMLR PPD types:

| PPD code | Label |
|---|---|
| D | detached |
| S | semi_detached |
| T | terraced |
| F | flat_maisonette |

`O` (other), UNKNOWN, commercial/industrial/agricultural/land/development/mixed-use → `NOT_APPLICABLE` or `INSUFFICIENT_EVIDENCE` (type unmappable).

---

## Evidence requirements (subject)

Minimum to attempt assessment:

- Postcode in England & Wales (PPD geography)
- Mappable residential property type
- Analysis `asOf` (defaults to now for live analyse)

Optional subject attributes (beds/baths/area/age/tenure) may **enrich reasons** when present on the subject **and** a comparable-side source exists. PPD itself does **not** supply beds/baths/area/age — V1 must not require them.

---

## Candidate generation (bounded, index-aware)

Hierarchy:

1. **Exact postcode** (`postcode_compact`) — uses `idx_official_sale_tx_postcode`, `LIMIT` (default 80), `transfer_date <= asOf`, optional type prefilter  
2. If postcode pool < sufficiency target → **postcode district** (true outward code via `LEFT(postcode_compact, length-3)`, with `LIKE` prefix for index use) — same date/type bounds, `LIMIT` (default 120)

Never: full-table scan, new geocoder, scrape, paid enrichment.

---

## Hard eligibility (before similarity)

Exclude unless all pass:

- `live` and `price_present` with `price_gbp > 0`
- Valid `transfer_date`
- `transfer_date <= analysisAsOf` (no future leakage)
- PPD type code compatible with subject (exact code match V1)
- Not subject self-match (transaction id / UPRN / exact postcode+PAON+SAON)
- Geography: same compact postcode **or** same district (outward) when district expansion used
- Category standard price paid (reject empty integrity)

Missing criterion → fail closed (do not silently pass).

---

## Similarity (explainable V1.1)

Dimensions used when evidence exists on **both** sides:

- property type (required for eligibility → always matched in set)
- geography (same postcode vs same district)
- recency vs `asOf`
- tenure (if both known)

**Not used in V1 scoring unless comparable-side evidence exists** (normally absent on PPD): internal area, bedrooms, bathrooms, construction age.

Categories:

| Category | Rule (deterministic) | Role |
|---|---|---|
| HIGH_SIMILARITY | Same postcode + type + transfer within 3 years of asOf | **Only** tier that can form a defensible comparable set |
| MEDIUM_SIMILARITY | Same postcode + type + within 5 years (but older than 3) | Relevant market transaction — **not** defensible by volume |
| LOW_SIMILARITY | Same district + type + within 5 years | Market context only — never a defensible comparable |
| INSUFFICIENT_COMPARABILITY_EVIDENCE | Else | Excluded |

**v1.1 change:** District + ≤3y is **LOW**, not MEDIUM. v1.0 incorrectly allowed district volume to inflate a “comparable” set.

No opaque ML score. Rank order: HIGH > MEDIUM > LOW, then newer first.

---

## Sufficiency / assessment states (v1.1)

Two distinct concepts:

| Concept | Definition |
|---|---|
| **Relevant market transactions** | Hard-eligible sales with HIGH, MEDIUM, or LOW similarity |
| **Defensible comparables** | HIGH only (same postcode + type + ≤3y) |

| State | When |
|---|---|
| `NOT_APPLICABLE` | Non-residential / unmappable type / outside E&W |
| `INVALID_INPUT` | Missing postcode or asOf unusable |
| `UNAVAILABLE` | Official sale table/import unavailable |
| `INSUFFICIENT_EVIDENCE` | Below both floors |
| `MARKET_CONTEXT` | ≥ **3** relevant market transactions **but** &lt; **3** HIGH defensible comparables |
| `ASSESSED` | ≥ **3** **HIGH** defensible comparables |

**Many MEDIUM/LOW transactions alone never produce `ASSESSED`.**  
`evidenceStrength = LIMITED` with district-heavy sets is market context, not comparable assessment.

### Observed statistics

| Field | Source set | When exposed |
|---|---|---|
| `observedLocalTransactionRange` / `observedLocalMedian` | Relevant market (H+M+L) | Whenever that set is non-empty |
| `observedComparableRange` / `observedComparableMedian` | Defensible HIGH only | Only when `ASSESSED` |

Labels must say “local transaction” vs “defensible comparable” and **not a valuation**.

No UNDERPRICED / OVERPRICED / FAIR_VALUE conclusions.

---

## Market / valuation boundary

Output attaches as `comparableSoldEvidence` (market / transaction intelligence).

Must **not** mutate: valuationEngine blend, PropertyData AVM, finance, Personal Decision, Decision Intelligence, What-if — unless a future explicit dependency is approved.

---

## Workspace

- **BUY / SELL:**  
  - `ASSESSED` → key tile **“Comparable sold evidence”** (defensible HIGH set stats; kernel `ASSESSED`)  
  - `MARKET_CONTEXT` → key tile **“Comparable sold evidence”** stays **unavailable** / `INSUFFICIENT_EVIDENCE` (no local £ range in Key Intelligence). Local sold £ figures appear only under **Supporting evidence** as **“Local sold transaction context”** with non-assessed context styling — not subject value, not asking-price judgement.  
  - `INSUFFICIENT_EVIDENCE` → unavailable comparable tile with WHY / WHAT MISSING / WHAT NEXT  
- **LET_INVEST:** not primary (omit from key tiles; may remain on report for secondary use)  
- Bounded supporting list (max 8 in UX), not raw dumps  

---

## Limitations (always surface)

- Transaction ≠ current value  
- Same postcode ≠ identical homes  
- PPD lacks beds/baths/floor area/condition  
- No time-inflation / size / condition adjustments  
- Address display limited to existing product/licensing policy  

---

## LLM boundary

LLM may paraphrase structured output only. Must not select comps, invent attributes, or produce valuations.

---

## Prohibited

AVM; £/bed/bath/sqft adjustments; hedonic/ML; asking-price as sale evidence; HMLR price as subject value; new providers; mass EPB enrichment; score mutations.
