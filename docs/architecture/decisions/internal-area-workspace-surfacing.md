# Internal area blocked-reason surfacing (V1.2)

**Implemented:** 2026-09-02

When canonical internal-area readiness is `MISSING_INTERNAL_AREA` or `INVALID_INTERNAL_AREA` for a listing-backed analysis, the Decision Workspace now:

- Explains the gap on **valuation range** / **price position** tiles
- Adds an **Internal floor area** unresolved item with `MISSING_LISTING_ATTRIBUTE` cause
- Offers **Edit listing to add internal floor area** (routes to AddList / AddRent edit)

Does not change valuation methodology, scores, or assessment safety.

Server: `internalAreaEvidenceGap.js` + `residentialDecisionWorkspace.js`  
Client: `listingEditNavigation.js` + `IntelligenceReport` / `PropertyIntelligence`

**Runtime wiring fix (persisted-loop validation, 2026-09-02):**  
`assemblePropertyIntelligenceReport` previously built the Decision Workspace with a partial report stub that omitted `property` / `internalArea`. Gap surfacing therefore never fired in live analyse. The stub now includes listing id + canonical `internalArea` (+ `inputSnapshot.listingId`) so `MISSING_INTERNAL_AREA` / `INVALID_INTERNAL_AREA` resolve to the edit-listing CTA.
