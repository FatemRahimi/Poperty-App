# Residential Decision Universe — Phase 1

Audit date: 14 October 2026  
Re-verified against source on this date. No paid provider APIs were called.  
Scope: UK residential **BUY** and **LET_INVEST** only.  
This document maps the current implementation. It does not add providers, formulas, UI, or a relationship engine.

## Inspection boundary

The Cursor workspace `c:\Users\farah\iCloudDrive\Documents\property-main (1)` has no application source (iCloud placeholders, git `main` with no commits).

The implementation that contains Decision Intelligence is:

- Path: `E:\laptop mac\New folder\property-main (1)`
- Branch: `temp-branch`
- HEAD: `caa9edc` (`new`)
- Tracked files include `server/services/ai/decisionIntelligence.js` and `server/services/providers/propertyData/PropertyDataAdapter.js`

A second `temp-branch` checkout at `E:\New folder\property-main (1)` only has `server/services/openaiService.js`. It does not contain the decision stack. This audit follows the laptop checkout.

`C:\Users\farah\Desktop\server` is an older partial copy (PropertyData stops at `/valuation-sale`; demand endpoints are absent). It is not the audited tree.

No paid provider APIs were called.

---

## 1. Executive verdict

The product already has a residential evidence pipeline and a **LET_INVEST** Decision Intelligence layer. It does not yet have a home-purchase decision.

What is true today:

- Identity, UPRN address-match, official EPB, flood, planning, schools, listed buildings, conservation areas, and Article 4 membership can be acquired and stored as canonical facts, with unknown kept as `notAssessed`.
- PropertyData can supply postcode sold prices, long-let **asking** rents, sale AVM, and area `/demand` and `/demand-rent` when `PROPERTYDATA_ENABLED` and an API key are set. The provider defaults to **disabled**.
- Finance arithmetic lives in `financialEngine.js`. Public landlord metrics stay `notAssessed` when rent, operating costs, or mortgage inputs are missing. Missing costs are not treated as zero on the presented path.
- Decision Intelligence v1 (`decision-intelligence-1.0.0`) runs only for `LET_INVEST`. For `BUY` and `SELL` it is explicitly `notApplicable`.
- `BUY` is `buyer_general`: a preference fit (budget, location, space, price fairness, lifestyle, transport). It is not an affordability, cash-to-complete, or housing-cost decision. `buyer_ftb` is disabled.
- Area demand is fetched and shown as context. Property-specific tenant demand and buyer demand stay `notAssessed` on purpose. That is a broken chain relative to “data reaches the decision,” and it is the correct safety rule until a property-level mapping exists.
- Gross yield can be calculated from listing asking rent, a user scenario rent, or, when both are absent, a market rent estimate (`resolveRentBasis` sets `marketSubstitutedForMissingListing`). That estimate is area asking evidence. It is not achieved rent.
- `investment.metrics.futureValue` is still written when a purchase price exists, using 0% appreciation and a 5-year hold if those inputs were not supplied. The presented investment object does not publish that figure. A client that reads raw `metrics` can still show an unsupported price-growth number.
- Three LLM paths can still emit unsupported numbers or factual-sounding attributes: the analyse summary (`generatePropertyExplanation`), the listing writer (live OpenAI and `mockListingWriter`), and the buyer-match assistant message (`polishBuyerMatchMessage`). Decision Intelligence explanation and the personal-decision Why engine reject numbers that are not in the facts, aside from a small constant allowlist (0–10 and 100, plus 50, 65, and 80 on the Why engine).

The MVP can describe evidenced context and withhold incomplete investment maths. It cannot yet answer “should I consider buying this as my home?” or “should I consider this as an investment?” as a complete decision.

---

## 2. Current architecture truth

Intended chain, and what exists:

```
USER
  → decision job BUY | LET_INVEST | SELL     (architecture/decisionContextContract.js)
  → PROPERTY identity + facts                (identity/, propertyFacts.js)
  → BUILDING / LEASE                         (partial: listing + PropertyData /uprn leases)
  → NEIGHBOURHOOD / MARKET                   (PropertyData area + local HMLR if imported)
  → FINANCE                                  (financeInputContract + financialEngine)
  → EVIDENCE                                 (propertyFacts, overlays, official clients)
  → RELATIONSHIPS                            (documented dependency model only; no engine)
  → SCENARIOS                                (financialEngine scenarios + What-if; LET_INVEST sensitivity drivers)
  → DECISION SUPPORT
       BUY:        buyer_general Personal Decision + residential workspace
       LET_INVEST: landlord Personal Decision + Decision Intelligence
       SELL:       personal decision not assessed
```

### Trace pattern

```
provider/source
  → acquisition policy (identity/marketAcquisitionPolicy.js)
  → provider client + cache (services/providers, DataProviderCache)
  → parser / evidence module
  → propertyFacts canonical fact
  → calculation (financialEngine, valuation, price position, rent intelligence)
  → Personal Decision and/or Decision Intelligence
  → property intelligence report + residentialDecisionWorkspace
```

Presence of a provider file does not mean the decision uses the data.

### Decision jobs

| Job | Personal Decision | Decision Intelligence |
| --- | --- | --- |
| `BUY` | `buyer_general` fit score | `notApplicable`. Note in `propertyIntelligenceEngine.js`: DI v1 is landlord / buy-to-let and is not a Buy conclusion. |
| `LET_INVEST` | `landlord` dimensions | `assembleDecisionIntelligence` + optional explanation |
| `SELL` | `notAssessed` (“no seller methodology”) | `notApplicable` |
| `buyer_family`, `buyer_ftb`, `investor_yield` | Disabled in `personalDecision.config.js` | Not run |

Client-injected scores, valuations, and decision objects are stripped (`FORBIDDEN_INJECTION_KEYS`).

### Canonical identity

`canonicalIdentityService.js` persists listing identity and accepts a UPRN only when the match is unique. Listing-field canonicalisation does not call a paid provider.

PropertyData identity:

- `GET /address-match-uprn` — address to UPRN. Rank-based match confidence. This is an address match, not HM Land Registry title verification.
- `GET /uprn` — profile (attributes, EPC-derived fields where present, registered-lease fields where present).
- `GET /uprns` — UPRNs in a postcode (building/postcode list, not title).

Verification states distinguish source-asserted UPRN from unresolved identity. A stored UPRN is not a verified title.

### Acquisition gates

`resolveMarketAcquisitionPolicy`:

| Fetch | When |
| --- | --- |
| Identity, UPRN profile, sold prices, sold £/sqft, `/demand` | Always requested by policy |
| `/rents` | Residential methodology gate and residential rents eligibility |
| `/demand-rent`, `/valuation-sale` | Residential methodology gate |

PropertyData itself runs only when `PROPERTYDATA_ENABLED` and `PROPERTYDATA_API_KEY` are set (`enabled` defaults to `false`).

Official open data defaults to enabled: Environment Agency flood, Planning Data (applications, educational establishments, listed buildings, conservation areas, Article 4), MHCLG EPB (bearer token still required).

Sprift and Hometrack adapters are stubs. They return “not connected.”

Development domain (`developmentDomain.js`) is not wired into live analysis. Commercial, agricultural, land, industrial, mixed-use, and development-site intelligence are out of this phase.

### Finance truth

`financeInputContract.js` parses user/scenario inputs. It does not calculate yields.

`financialEngine.js` calculates gross yield, NOI, net yield, cash flow, DSCR, and cap rate only when required inputs are present on the presented path. `APPLICATION_DEFAULTS` still exist inside the arithmetic module (`mortgageTermYears: 25`, `vacancyAssumption: 0`, `interestRate: 0`, `expectedAppreciation: 0`, `holdingPeriod: 5`) and are labelled `application_default`. Landlord Personal Decision and Decision Intelligence consume **presented** availability and withhold cash flow, DSCR, NOI, and net yield when inputs are missing. The same function still writes `futureValue` from a purchase price using 0% growth and a 5-year hold when appreciation and holding period were not supplied. That number is on `investment.metrics`, not on `investment.presented`. When the material cost set is complete, a missing `otherExpenses` is added as 0, and a missing renovation cost is added as 0 inside initial cash for cash-on-cash. Listing `deposit_amount` is a tenancy deposit, not a mortgage deposit.

### Rent truth

`rentIntelligenceService.js`:

- Listing current rent is **asking** (`asking_internal_listing`).
- PropertyData `/rents` is area **long-let asking** rent (`asking_long_let`), weekly figures converted with `52/12` when the unit is `gbp_per_week`.
- The rent-intelligence object sets `achievedRent` to `null`. A separate canonical fact, `propertyFacts.facts.achievedRent`, can still be filled from a recorded listing outcome (`achieved_rent`, trust `userSupplied`). That outcome is not copied into the rent estimate and is not automatically the yield rent.
- `days_on_market` on asking listings is not time-to-let.
- `priceSensitivity` builds three rents around the recommended figure (`× 1.07`, the figure itself, `× 0.97`) and sets `demand: null` on each. Those bands are not observed rents and not demand.
- Estimate precedence: matched PropertyData segment, then internal marketplace asking comparables, then PropertyData area-wide asking context. Listing asking rent is not overwritten.

Yield rent selection is separate, in `resolveRentBasis`:

1. User scenario `expectedRent`, when supplied.
2. Else listing monthly rent, when positive.
3. Else the recommended or estimated market rent, flagged `MARKET_RENT` and `marketSubstitutedForMissingListing: true`.
4. Else no rent, and gross yield stays unassessed.

### Sale truth

- Asking / scenario purchase price is listing or user input. Scenario price does not replace `listedPrice`.
- Sold evidence: PropertyData `/sold-prices` and `/sold-prices-per-sqf` (postcode, HM Land Registry-derived via the provider) plus local `official_sale_transactions` when that table has been imported. Analyse does not download HMLR. Scotland and Northern Ireland postcodes are outside the England & Wales price-paid geography.
- Sale valuation: PropertyData `/valuation-sale` AVM when attributes are sufficient (postcode and internal area threshold in the adapter). Subject-native valuation and price position are separate engines and stay `notAssessed` without a defensible range.
- Local sold ranges that fail comparable sufficiency are `MARKET_CONTEXT`, not a valuation and not an asking-price judgement (`residentialDecisionWorkspace.js`).

### Decision Intelligence contents (LET_INVEST only)

Material findings, in order, only when the underlying presented metric is assessed:

1. Rent position
2. Gross yield
3. Net operating (NOI / net yield)
4. Cash flow
5. Vacancy
6. DSCR
7. Price position

Investigation priorities, in order:

1. Vacancy assumption missing
2. Operating costs incomplete
3. Mortgage inputs incomplete
4. Purchase price or expected rent missing
5. Rent position not assessed
6. Landlord demand not assessed

Context-only layers (do not change fit, valuation, or finance): flood, planning, schools, listed building, conservation area, Article 4. Article 4 restrictions stay `notAssessed` even when geographic membership is observed.

Sensitivity drivers are a dependency graph over price, rent, vacancy, operating costs, and mortgage inputs. The layer does not run What-if, invent score deltas, or rank drivers.

Landlord `risk` is omitted from material findings. The comment in `decisionIntelligence.js` states the Personal Decision risk dimension is still fed by the pre-v1 heuristic risk register and is not safely traceable.

---

## 3. BUY Decision Universe

Question: **Should I consider buying this residential property as my home?**

The current engine answers a narrower question: **how well does this listing match stated living preferences?** (`buyer_general` in `personalDecision.config.js`). Outcomes are `strong_fit`, `good_fit`, `mixed_fit`, `weak_fit`, or `unsuitable`. Confidence does not change the outcome. Hard constraints: budget ceiling and bedrooms. This is not purchase advice.

| Decision question | Current answer |
| --- | --- |
| Can the user reasonably afford this purchase? | Budget versus asking price only (`scoreBudget`). Income, debts, employment, and expenditure are not inputs. `buyer_ftb` is disabled. |
| What is the true initial cash requirement? | Not assessed. Deposit may be a user finance field on the investment view. SDLT, fees, and cash to complete are absent. |
| What is the likely ongoing housing cost? | Not a Buy conclusion. Mortgage payment is withheld unless the user supplies price, deposit, rate, and term. Council tax can exist as a fact and is not an occupancy-cost input (`productionScoringActivated: false`). Service charge and ground rent are not folded into a homeowner cost. |
| Is the asking price supported by evidence? | Price fairness uses an existing valuation when that valuation is assessed. Otherwise the dimension is unavailable. Price position is shown on the Buy workspace when assessed, and is not a negotiation certainty. |
| What comparable sold evidence exists? | Postcode PropertyData sold prices and, when imported, official price-paid rows. Defensible comparables are separate from a wider local sold range. |
| What are the important property risks? | No Buy risk model. Heuristic `risks` remain on the report for landlord scoring stability. They are not a home-purchase risk conclusion. |
| What are the tenure and leasehold implications? | Tenure and lease years can be facts (listing, then PropertyData registered leases). They do not change `buyer_general` weights. |
| What is known about the building or development? | UPRN and EPB certificate fields when matched. Developer, freeholder, managing agent, major works, and sinking fund are absent. EPC is not a survey. |
| What is known about the neighbourhood or micro-location? | Location fit uses area, postcode, radius, or destination text the user supplied. Commute text is not location. No micro-location model. |
| What market or liquidity evidence exists? | Area `/demand` can be on the report as surrounding-market buyer demand. Property-specific buyer demand stays `notAssessed`. |
| What planning or environmental constraints exist? | Flood, planning, listed building, conservation area, and Article 4 can appear as Buy workspace context chips. They do not change the fit score. Unknown is not “clear.” |
| What important information is still unknown? | Buy workspace lists unassessed items. Decision Intelligence priorities are not produced for BUY. |
| Which missing facts could materially change the decision? | Income and commitments, cash to complete, mortgage terms, lease length on a leasehold, flood or heritage constraints, and a defensible valuation. None of these currently block `buyer_general` except budget and bedroom hard constraints. |

BUY workspace (`buildBuyWorkspace`) shows buyer fit, valuation range, price position, optional gross yield and cash flow if those investment metrics happen to be assessed, and the same context chips as other jobs. Optional yield is labelled as not a Buy conclusion.

---

## 4. LET_INVEST Decision Universe

Question: **Should I consider buying this residential property as an investment?**

The current engine answers: **how well does evidenced rent, yield, and financing fit stated landlord requirements?** It is not purchase advice. Weights: rent position 0.20, gross yield 0.18, net operating 0.14, cash flow 0.12, vacancy 0.08, DSCR 0.10, risk 0.10, demand 0.08. Hard constraints: minimum yield and minimum DSCR when the user set them. Minimum coverage defaults to 50% of weight.

| Decision question | Current answer |
| --- | --- |
| Is the purchase price supported by evidence? | Price position finding only when a defensible valuation and an asking or scenario price exist. |
| What rent evidence exists? | Listing asking rent; internal asking comparables; PropertyData area long-let asking rents and ranges. |
| Is rent asking evidence, achieved evidence, or an estimate? | Asking, or an estimate built from asking evidence. Achieved rent is null. |
| What is gross yield? | Assessed when purchase price and a selected rent are both positive. Selected rent is scenario, else listing asking, else a market asking-rent estimate. The basis is stamped `SCENARIO_RENT`, `LISTING_RENT`, or `MARKET_RENT`. None of these is achieved rent. |
| What is NOI? | Assessed only when rent, price, and operating costs are supplied. Missing costs stay `notAssessed`, not zero. |
| What is net yield? | Same completeness gate as NOI. |
| What is cash flow? | Assessed only when price, deposit, interest rate, and term are all supplied and NOI is assessed. |
| What is DSCR? | Same finance completeness gate. No debt service means DSCR is unavailable, not infinite. |
| What operating costs are known versus unknown? | `costEvidence.missing` lists maintenance, insurance, management fee, service charge, ground rent, taxes, and vacancy. Listing service charge and ground rent can be property facts and may enter finance when observed. Major works are unknown. |
| What vacancy assumption is being used? | The user-supplied percent, or `notAssessed`. A missing vacancy is an investigation priority. The arithmetic default of 0% is not presented as a known occupancy rate. |
| What sales-market demand evidence exists? | PropertyData `/demand` area band, counts, turnover, months of inventory, days on market, radius. Property-level buyer demand is `notAssessed`. |
| What rental-market demand evidence exists? | PropertyData `/demand-rent` area band and the same style of area statistics. Stored on `marketContext.rentalDemand` with `role: context_only`. |
| What evidence exists about liquidity? | Area turnover, months of inventory, and days on market from those demand endpoints, when the provider call succeeds. Not a sale-probability or time-to-sell. |
| What leasehold or building costs or restrictions matter? | Service charge and ground rent if observed. Article 4 membership is geographic context. Permitted-development restrictions stay `notAssessed`. Lease years do not enter the landlord score. |
| What local supply or planning factors may matter? | Nearby planning applications (default 400 m) as context. They are not a supply pipeline and not an approval prediction. |
| What happens under adverse scenarios? | `financialEngine` can apply vacancy, rate, and cost deltas. Decision Intelligence lists sensitivity drivers and does not execute them or estimate score changes. Landlord vacancy dimension can mention NOI at +5% vacancy when costs are complete. |
| What missing information could reverse the investment conclusion? | Achieved rent versus the asking rent used in yield; real service charge, ground rent, and major works; vacancy; mortgage rate and term; a short lease; area demand being mistaken for property demand. Demand is already withheld. Achieved rent and lease length are not decision-blocking findings. |

---

## 5. Canonical factor taxonomy

Groups below are the target model. Status is in section 6. Items marked **placeholder** are named so later phases do not invent them silently.

### A. USER

- Objective: decision job `BUY` or `LET_INVEST` (also `SELL`, unused for this phase).
- Deposit: mortgage deposit as a finance input. Distinct from listing tenancy deposit.
- Income: not collected for either decision.
- Debts and commitments: not collected.
- Employment: not collected.
- First-time-buyer status: profile `buyer_ftb` reserved and disabled. Not a fact.
- Risk tolerance: not a user fact. Landlord “risk” is a heuristic dimension.
- Investment horizon: `holdingPeriod` default exists in the arithmetic module and is not a user decision input.
- Financing intention: implied by whether deposit, rate, and term are supplied. No product or lender.

### B. PROPERTY

- Identity: listing id, canonical address, PAON/SAON, optional UPRN.
- Property type, bedrooms, bathrooms.
- Floor area: listing, then MHCLG EPB, then PropertyData. Official floor area is not a valuation input by itself; the AVM requires an area attribute.
- Condition: not professionally assessed. EPC is not a survey. Building-condition domain is EPB context.
- Construction age: listing year built and/or EPB age band.
- EPC: official EPB preferred, then listing, then PropertyData.
- Asking or purchase price: listing asking; scenario purchase price for analysis.

### C. TENURE / LEASE

- Freehold or leasehold.
- Lease years remaining: PropertyData registered-lease calculation when present.
- Service charge and ground rent: listing observed charges. Scenario override allowed.
- Restrictions: Article 4 geographic membership only. Restriction schedule is `notAssessed`.
- Major works: absent.
- Reserve or sinking fund: absent.
- Building safety: absent.

### D. BUILDING / DEVELOPMENT

- Building or development identity: UPRN and address components only.
- Developer, freeholder, managing agent: absent as evidenced roles.
- Building-level costs and issues: service charge and ground rent at listing level only.
- Comparable units in the same development: postcode UPRN list is not a same-building comparable set.
- Development projects: domain exists and is not wired to live analysis.

### E. MARKET / NEIGHBOURHOOD

- Sold prices and £/sqft: postcode.
- Comparables: official transaction comparable assessment plus internal listing comparables. Sufficiency can fail while a wider sold range still exists.
- Price position: asking versus assessed valuation range.
- Sales demand and rental demand: area bands.
- Rent evidence: asking and estimates from asking. Achieved rent absent.
- Liquidity: area turnover and days on market from demand endpoints. Time-to-let is `notAssessed`.
- Supply: no pipeline model. Nearby planning applications are a different fact.
- Planning pipeline: not built.
- Transport and accessibility: scored only if commute minutes or station evidence is already on the record. No transport provider.
- Schools: nearby establishments. Catchment and admission are `notAssessed`. BUY school fit does not read this evidence.
- Neighbourhood evidence: postcode and radius preferences. No separate micro-location layer.

### F. ENVIRONMENT / PLANNING

- Flood: Environment Agency Flood Map for Planning, rivers and sea, zones 2 and 3. Absence is not Flood Zone 1 and not “safe.”
- Planning applications: nearby intersect, default 400 m. Absence is not “no planning.”
- Conservation area: point-in-polygon membership.
- Article 4: point-in-polygon membership. Not a restriction conclusion.
- Listed status: nearby or point evidence from Planning Data listed-building dataset. A nearby listing is not proof this property is listed. Unknown is not “not listed.”

### G. FINANCE

- Deposit, mortgage amount, interest rate, term, mortgage payment.
- LTV: not a canonical output.
- Operating costs, vacancy, NOI, gross yield, net yield, cash flow, DSCR.
- Cap rate is calculated beside net yield in the engine and is not a Decision Intelligence finding.

### H. TAX / TRANSACTION (placeholder only)

- SDLT: not implemented.
- First-time-buyer relief eligibility: not implemented.
- Other transaction costs: not implemented.

Do not implement tax rules in this phase.

---

## 6. Capability / Data Matrix

Status is exactly one of: `LIVE`, `CONDITIONAL`, `CALCULATED`, `USER_INPUT`, `ESTIMATED`, `FALLBACK`, `MOCK`, `HARDCODED`, `MISSING`.

`CONDITIONAL` means the code path exists and runs only with configuration, geography, eligibility, or a successful match. `LIVE` is reserved for paths that are on by default and do not depend on a paid key.

Kind is `FACT`, `CALCULATION`, `ESTIMATE`, `ASSUMPTION`, or `UNKNOWN`.

“Reaches DI” means LET_INVEST Decision Intelligence. BUY Decision Intelligence does not run.

### A. User

| Factor | Decision | Status | Source | Endpoint | Files | Granularity | Kind | Freshness | Provenance | Reaches DI | Limits | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Decision objective | BOTH | USER_INPUT | Client job | — | `architecture/decisionContextContract.js`, `propertyIntelligenceEngine.js` | property | FACT | Request | Job is not a property fact | LET_INVEST selects DI; BUY does not | Invalid job does not silently run landlord methodology | KEEP |
| Mortgage deposit | BOTH | USER_INPUT | Analyse/scenario body | — | `financeInputContract.js`, `personalDecisionLandlord.js` | property | FACT | Request | User-supplied | Yes, as a finance driver | Tenancy `deposit_amount` is excluded | KEEP |
| Income | BUY | MISSING | — | — | — | — | UNKNOWN | — | — | No | Budget-versus-price is not income affordability | BUILD |
| Debts / commitments | BUY | MISSING | — | — | — | — | UNKNOWN | — | — | No | — | BUILD |
| Employment | BUY | MISSING | — | — | — | — | UNKNOWN | — | — | No | — | BUILD |
| First-time buyer | BUY | MISSING | Profile reserved | — | `personalDecision.config.js` `buyer_ftb.enabled: false` | — | UNKNOWN | — | — | No | — | BUILD later with SDLT; do not enable the empty profile |
| Risk tolerance | BOTH | MISSING | — | — | Landlord `risk` is heuristic, not a user tolerance | — | UNKNOWN | — | — | DI omits risk findings | Heuristic risk can still score landlord fit | FIX |
| Investment horizon | LET_INVEST | HARDCODED | `holdingPeriod: 5` inside arithmetic defaults | — | `financialEngine.js` `APPLICATION_DEFAULTS` | — | ASSUMPTION | — | Labelled application default if used | Not a DI finding | Not a user horizon | FIX |
| Financing intention | LET_INVEST | USER_INPUT | Presence of deposit, rate, term | — | `personalDecisionLandlord.js` `financeComplete` | property | FACT | Request | Missing is `notAssessed` | Yes | No lender or product | KEEP |

### B. Property

| Factor | Decision | Status | Source | Endpoint | Files | Granularity | Kind | Freshness | Provenance | Reaches DI | Limits | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Canonical identity | BOTH | CONDITIONAL | Listing, then unique UPRN | PropertyData `GET /address-match-uprn`, `GET /uprn` | `canonicalIdentityService.js`, `PropertyDataAdapter.js` | property | FACT | `retrievedAt` on provider result; identity row timestamps | Match confidence and verification state | Indirectly, via facts | Address match is not title | KEEP |
| UPRN | BOTH | CONDITIONAL | PropertyData when enabled | `/address-match-uprn`, `/uprn` | `PropertyDataAdapter.resolveIdentity`, `getUprnProfile` | property | FACT | Cache TTL `cacheTtl.identity` / `uprnProfile` | `createProvenance`, rank confidence | Indirect | Paid provider defaults off; non-unique match stays unresolved | KEEP |
| Property type | BOTH | CONDITIONAL | Listing wins; PropertyData and EPB can conflict | `/uprn`; EPB search | `propertyFacts.js` `SOURCE_PRECEDENCE` | property | FACT | Listing vs provider timestamps | Conflicts keep listing; not averaged | Conflict can be a DI item | Conflict does not block landlord fit | KEEP |
| Bedrooms | BOTH | CONDITIONAL | Listing, then PropertyData | `/uprn` | `propertyFacts.js`, `buyerMatchEngine.scoreBedrooms` | property | FACT | Same | Listing precedence | BUY space dimension; not a DI finding | — | KEEP |
| Floor area | BOTH | CONDITIONAL | MHCLG EPB, else listing, else PropertyData | EPB API; `/uprn` | `internalAreaResolution.js`, `propertyFacts.js` | property | FACT | EPB refresh TTL default 30 days | Selected source on resolution | Not a DI finding | Official area is not itself a valuation | KEEP |
| Condition | BOTH | MISSING | — | — | Building-condition domain is EPB context, not a survey | property | UNKNOWN | — | `epcIsNotSurvey` | No | — | KEEP unknown |
| Construction age | BOTH | CONDITIONAL | Listing year, else EPB band, else PropertyData | EPB; `/uprn` | `officialConstructionAgeEvidence.js`, `propertyFacts.js` | property | FACT | Certificate date / retrievedAt | Source precedence | No | Band is not an exact year | KEEP |
| EPC | BOTH | CONDITIONAL | MHCLG EPB, else listing, else PropertyData | `https://api.get-energy-performance-data.communities.gov.uk` | `mhclgEpbClient.js`, `propertyFacts.js` | property | FACT | Refresh TTL; certificate date | Token required; match must attach | Context chip only | Not a quality score | KEEP |
| Asking price | BOTH | USER_INPUT | Listing | — | Listing `price` / `listedPrice` | property | FACT | Listing | Asking, not sold | Price position finding when valuation exists | — | KEEP |
| Scenario purchase price | LET_INVEST | USER_INPUT | Finance body | — | `personalDecisionCanonical.propertyWithFinanceScenario` | property | FACT | Request | Does not erase listed price | Gross yield and drivers | — | KEEP |

### C. Tenure / lease

| Factor | Decision | Status | Source | Endpoint | Files | Granularity | Kind | Freshness | Provenance | Reaches DI | Limits | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Freehold / leasehold | BOTH | CONDITIONAL | Listing, else PropertyData registered leases | `/uprn` | `propertyFacts.js` tenure precedence | property | FACT | Provider retrievedAt | Conflict keeps listing | Conflict item only | Not title-verified | KEEP |
| Lease years remaining | BOTH | CONDITIONAL | PropertyData registered leases, calculated | `/uprn` | `propertyFacts.js` `leaseRemaining` | property | CALCULATION | As of retrieval | `PropertyData_registeredLeases_calculated` | No. `productionScoringActivated: false` | Missing is not “long lease” | FIX |
| Service charge | LET_INVEST | CONDITIONAL | Listing observed charge; scenario may override | — | `listingObservedFields.js`, `financeInputContract.js` | property | FACT | Listing | Zero is valid only when supplied | Yes, cost driver when supplied | Unknown is not zero. No reliability or major-works link | FIX |
| Ground rent | LET_INVEST | CONDITIONAL | Listing only (`InternalListing`) | — | `propertyFacts.js`, `financeInputContract.js` | property | FACT | Listing | Same | Yes, when supplied | Provider ground rent is not the canonical source | FIX |
| Restrictions | BOTH | CONDITIONAL | Article 4 membership only | Planning Data `article-4-direction-area` | `article4Evidence.js` | property (point-in-polygon) | FACT | retrievedAt | Geographic membership | Context only; restrictions `notAssessed` | Membership is not a withdrawn-rights list | KEEP |
| Major works | LET_INVEST | MISSING | — | — | — | building | UNKNOWN | — | — | No | Can reverse NOI | BUILD |
| Sinking fund | LET_INVEST | MISSING | — | — | — | building | UNKNOWN | — | — | No | — | BUILD |
| Building safety | BOTH | MISSING | — | — | — | building | UNKNOWN | — | — | No | — | BUILD when an official source exists |

### D. Building / development

| Factor | Decision | Status | Source | Endpoint | Files | Granularity | Kind | Freshness | Provenance | Reaches DI | Limits | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Building identity | BOTH | CONDITIONAL | Address + UPRN | `/uprn`, `/uprns` | `PropertyDataAdapter.listUprnsInPostcode` | property or postcode | FACT | Cache | UPRN list is not a block identity | No | — | KEEP |
| Developer | BOTH | MISSING | — | — | — | building | UNKNOWN | — | — | No | — | BUILD only with evidence |
| Freeholder | BOTH | MISSING | — | — | — | building | UNKNOWN | — | — | No | Lease profile is not a freeholder fact | BUILD only with evidence |
| Managing agent | BOTH | MISSING | — | — | — | building | UNKNOWN | — | — | No | — | BUILD only with evidence |
| Same-development comparables | BOTH | MISSING | — | — | — | building | UNKNOWN | — | — | No | Postcode sales are not same-building sales | BUILD later |

### E. Market / neighbourhood

| Factor | Decision | Status | Source | Endpoint | Files | Granularity | Kind | Freshness | Provenance | Reaches DI | Limits | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sold prices | BOTH | CONDITIONAL | PropertyData, HMLR-derived | `GET /sold-prices` | `PropertyDataAdapter.getSoldPrices` | postcode | FACT | Cache TTL sold prices | Provenance notes Land Registry | Workspace context; not automatically a valuation | Filters optional (beds, type) | KEEP |
| Sold £/sqft | BOTH | CONDITIONAL | PropertyData | `GET /sold-prices-per-sqf` | `getSoldPricesPerSqf` | postcode | FACT | Cache | HMLR + EPC match note | Indirect via valuation inputs | Area, not subject | KEEP |
| Official price paid | BOTH | CONDITIONAL | Local `official_sale_transactions` | No live HMLR download on analyse | `officialSaleTransactionQuery.js` | property if PAON/SAON match, else postcode | FACT | Import run | `IMPORT_NOT_RUN` if table empty | Via comparable assessment | England & Wales only | KEEP |
| Comparables | BOTH | CONDITIONAL | Official assessment + internal listings | — | `officialTransactionComparableAssessment.js`, `comparableEngine.js` | property or postcode | FACT | Import / listing dates | Sufficiency can fail | Price position needs a defensible valuation, not merely a count | Wider range is orientation only | KEEP |
| Sale valuation | BOTH | CONDITIONAL | PropertyData AVM | `GET /valuation-sale` | `PropertyDataAdapter.getSaleValuation`, `valuationEngine.js` | property estimate from area £/sqft | ESTIMATE | Cache TTL valuation | Provider AVM | Price-position finding when assessed | Insufficient area returns not assessed | KEEP |
| Price position | BOTH | CALCULATED | Asking vs valuation range | — | `pricePositionEngine.js` | property | CALCULATION | As of valuation | `notAssessed` without both inputs | Yes, LET_INVEST finding | Not negotiation certainty | KEEP |
| Sales demand | BOTH | CONDITIONAL | PropertyData | `GET /demand` | `getDemand`, `postcodeMarketIntelligenceService.js` | postcode / radius (wider area) | FACT | retrievedAt, observation period | Band, sample, confidence | Area object on the report. Property-specific buyer demand stays `notAssessed`. Landlord DI demand priority does not consume the band as a score | Area is not this property | FIX (wire as context inside DI, still do not score) |
| Rental demand | LET_INVEST | CONDITIONAL | PropertyData | `GET /demand-rent` | `getDemandRent`, `propertyDataParsers.buildRentalDemandEvidence` | postcode / radius | FACT | retrievedAt | `rental_demand_rating` is a provider market-balance label | `marketContext` role `context_only`. Dimension `demand` stays `notAssessed` | Not tenant demand, not time-to-let | FIX (same as sales demand) |
| Asking rent | LET_INVEST | CONDITIONAL | Listing and/or PropertyData | `GET /rents` | `rentIntelligenceService.js`, `parseRentsResponse` | property asking; area asking | FACT | Listing; provider retrievedAt | `asking_internal_listing` or `asking_long_let` | Rent position and gross yield when used as expected rent | Weekly converted with 52/12 | KEEP |
| Achieved rent | LET_INVEST | CONDITIONAL | Listing outcome column only | — | `propertyFacts.js` `fromListingNumber('achievedRent', property.achieved_rent)`; `rentIntelligenceService.analyseRent` sets its own `achievedRent: null` | property | FACT when a user recorded an outcome; otherwise UNKNOWN | Listing outcome timestamp if present | `userSupplied`; not copied from asking | No. Yield does not read this fact unless the user also passes it as expected rent | The rent-intelligence object stays null even when the listing outcome exists | FIX |
| Rent estimate | LET_INVEST | ESTIMATED | Median / trimmed mean of asking comps, or PropertyData central asking | `/rents` | `rentIntelligenceService.js` | postcode or comparable set | ESTIMATE | As of comps | Method named on the result | Can feed rent position, and can become the yield rent when listing and scenario rent are absent | Not achieved, not an AVM | KEEP |
| Liquidity / days on market | BOTH | CONDITIONAL | PropertyData demand payloads | `/demand`, `/demand-rent` | parsers | wider area | FACT | observation period | Provider fields | Shown on area demand objects | Asking-listing days on market are not time-to-let | KEEP |
| Time-to-let | LET_INVEST | MISSING | Explicitly not assessed | — | `rentIntelligenceService.js` | — | UNKNOWN | — | — | No | — | BUILD only with achieved letting times |
| Rent price-sensitivity bands | LET_INVEST | HARDCODED | Multipliers on the recommended rent | — | `rentIntelligenceService.js` `priceSensitivity` | postcode estimate | ESTIMATE | As of the rent estimate | `demand` on each row is null | Not a DI finding | ±3% and +7% are not observed rents | FIX |
| Supply pipeline | LET_INVEST | MISSING | Nearby applications are not a pipeline | — | `planningEvidence.js` | neighbourhood | UNKNOWN | — | — | Planning is context only | — | BUILD later |
| Transport / commute | BUY | MISSING | No provider. Score runs only if minutes already exist on the record | — | `buyerMatchEngine.scoreTransport` | — | UNKNOWN | — | — | No DI for BUY | Parking is not transport | BUILD |
| Schools | BOTH | CONDITIONAL | MHCLG Planning Data educational establishments (GIAS) | `educational-establishment` on `planning.data.gov.uk`, default 800 m | `educationalEstablishmentClient.js`, `schoolEvidence.js` | neighbourhood | FACT | retrievedAt | Proximity only | LET_INVEST context chip. BUY `scoreSchools` ignores it | Not catchment or Ofsted quality | FIX |
| Location preference | BUY | USER_INPUT | User area / radius / destination | — | `buyerMatchEngine.scoreLocation` | postcode or named area | FACT | Request | Commute text is rejected as location | No | — | KEEP |

### F. Environment / planning

| Factor | Decision | Status | Source | Endpoint | Files | Granularity | Kind | Freshness | Provenance | Reaches DI | Limits | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Flood | BOTH | LIVE | Environment Agency Flood Map for Planning, rivers and sea | FeatureServer layers zone 3 and zone 2 | `floodMapForPlanning.js`, `floodEvidence.js` | property coordinate | FACT | Cache; retrievedAt | England bounds. Outside box is unsupported geography | LET_INVEST context only. `affects: []` | Empty intersection is not Zone 1 | KEEP |
| Planning applications | BOTH | LIVE | MHCLG Planning Data | dataset `planning-application`, buffered intersect, default 400 m | `planningApplicationClient.js` | neighbourhood | FACT | retrievedAt | Coverage varies by LPA | Context only | Nearby is not this site’s permission | KEEP |
| Conservation area | BOTH | LIVE | Planning Data | `conservation-area` point-in-polygon | `conservationAreaClient.js` | property | FACT | retrievedAt | Absence is not “outside” | Context only | Not a listed-building fact | KEEP |
| Article 4 | BOTH | LIVE | Planning Data | `article-4-direction-area` point-in-polygon | `article4DirectionAreaClient.js` | property | FACT | retrievedAt | Restrictions remain `notAssessed` | Context only | Incomplete coverage | KEEP |
| Listed building | BOTH | LIVE | Planning Data listed-building dataset | point / nearby, default 25 m | `listedBuildingClient.js` | property or nearby | FACT | retrievedAt | Native grade kept as text | Context only | Nearby listing is not this UPRN | KEEP |

These official clients are `LIVE` in code (enabled by default, no API key). A failed call becomes `notAssessed`, not a clear result.

### G. Finance

| Factor | Decision | Status | Source | Endpoint | Files | Granularity | Kind | Freshness | Provenance | Reaches DI | Limits | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mortgage amount | LET_INVEST | CALCULATED | Price minus deposit when amount omitted and both exist | — | `financialEngine.buildAssumptionCoverage` | property | CALCULATION | Request | Labelled derived | Driver | Not a lender offer | KEEP |
| LTV | BOTH | MISSING | — | — | No `loanToValue` output | property | UNKNOWN | — | — | No | Inputs for a calculation often exist | BUILD |
| Interest rate | LET_INVEST | USER_INPUT | Scenario | — | `financeInputContract.js` | property | FACT | Request | Missing is not 5.5% on the presented path | Yes | Arithmetic default 0 exists and is not presented | KEEP |
| Term | LET_INVEST | USER_INPUT | Scenario | — | same | property | FACT | Request | Missing term is not presented as 25 years | Yes | Default 25 remains inside the arithmetic module | KEEP |
| Mortgage payment | LET_INVEST | CALCULATED | Standard debt service from supplied loan, rate, term | — | `financialEngine.js` | property | CALCULATION | Request | Withheld if finance incomplete | Cash flow / DSCR | Not a product quote | KEEP |
| Operating costs | LET_INVEST | USER_INPUT | User, or listing service charge / ground rent when observed | — | `operatingCostEvidence.js` | property | FACT | Request or listing | `costEvidence.missing` | Yes | Unknown ≠ 0 | KEEP |
| Vacancy | LET_INVEST | USER_INPUT | User percent | — | `financeInputContract.js` | property | ASSUMPTION | Request | Missing is an investigation priority | Yes | Not a market vacancy rate | KEEP |
| Gross yield | LET_INVEST | CALCULATED | Annual rent / price | — | `financialEngine.js`, `financeInputContract.resolveRentBasis` | property | CALCULATION | Request | Basis is listing, scenario, or `MARKET_RENT` | Finding when presented | Not achieved-rent yield. Market substitution is labelled | KEEP |
| NOI | LET_INVEST | CALCULATED | Effective rent minus evidenced operating costs | — | `financialEngine.js` | property | CALCULATION | Request | Blocked if any material cost missing | Finding when presented | — | KEEP |
| Net yield | LET_INVEST | CALCULATED | NOI / price | — | `financialEngine.js` | property | CALCULATION | Request | Same gate as NOI | Finding when presented | — | KEEP |
| Cash flow | LET_INVEST | CALCULATED | NOI minus debt service | — | `financialEngine.js` | property | CALCULATION | Request | Requires complete finance | Finding when presented | — | KEEP |
| DSCR | LET_INVEST | CALCULATED | NOI / debt service | — | `financialEngine.js` | property | CALCULATION | Request | Null when no debt service | Finding when presented | — | KEEP |
| Gross yield (area) | LET_INVEST | ESTIMATED | Postcode median rent and median sale | — | `postcodeMarketIntelligenceService.buildBroadAreaYield` | postcode | ESTIMATE | Listings + external | Labelled not property-specific | Not a property finding | Marketplace segment yield is separate | KEEP |
| Future value / price growth | LET_INVEST | HARDCODED | `metrics.futureValue` | — | `financialEngine.js` lines that substitute 0% and 5 years | property | ASSUMPTION | — | Not on `investment.presented` | No | Raw `investment.metrics` is still on the analyse report | FIX |
| Cash-on-cash, equity multiple, payback | LET_INVEST | CALCULATED | Inside `calculateInvestmentMetrics` only | — | `financialEngine.js` | property | CALCULATION | Request | Missing renovation cost is treated as 0 inside initial cash | Not on `investment.presented` and not a DI finding | Do not quote these from raw metrics | FIX |

### H. Tax / transaction

| Factor | Decision | Status | Source | Endpoint | Files | Granularity | Kind | Freshness | Provenance | Reaches DI | Limits | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SDLT | BUY | MISSING | Placeholder only | — | — | property | UNKNOWN | — | — | No | Do not implement rules in this phase | BUILD later |
| FTB relief | BUY | MISSING | Placeholder only | — | `buyer_ftb` disabled | — | UNKNOWN | — | — | No | — | BUILD later |
| Other transaction costs | BOTH | MISSING | — | — | — | property | UNKNOWN | — | — | No | Cash to complete is unknown | BUILD later |

### Providers that are not data

| Provider | Status | Action |
| --- | --- | --- |
| Sprift | MISSING (stub) | KEEP stub. Do not pretend capabilities run. |
| Hometrack | MISSING (stub) | KEEP stub. |
| OpenAI listing writer mock | MOCK | REMOVE invented amenity sentences from the no-key fallback, or stop using that path for anything shown as property fact. |

---

## 7. Data provenance map

```
Listing form
  → properties row
  → listingObservedFields / canonical address
  → propertyFacts (listing wins on conflict)
  → BUY fit and/or landlord finance

PropertyData (paid, default off)
  /address-match-uprn → identity repository → UPRN
  /uprn               → attribute overlay, leases, last sold, council tax amount
  /sold-prices        → postcode sold evidence
  /sold-prices-per-sqf→ area rate evidence
  /valuation-sale     → AVM estimate → price position if asking exists
  /rents              → area asking-rent evidence → rent intelligence
  /demand             → area sales-demand context
  /demand-rent        → area rental-demand context
  cache: DataProviderCache + usage log (credits, cache hit, retrievedAt)

MHCLG EPB (token)
  → certificate match
  → EPC, floor area, age band
  → propertyFacts
  → not a survey and not a valuation input by itself

Environment Agency Flood Map for Planning
  → coordinate intersect zones 2 and 3
  → flood fact
  → DI context only

planning.data.gov.uk
  planning-application          → nearby applications
  educational-establishment     → nearby schools
  listed-building               → listed evidence
  conservation-area             → membership
  article-4-direction-area      → membership
  → propertyFacts
  → workspace chips and LET_INVEST DI context
  → scores unchanged

Local official_sale_transactions
  → query only if imported
  → subject match or area rows
  → comparable sufficiency
  → else MARKET_CONTEXT orientation

User finance body
  → financeInputContract
  → financialEngine presented metrics
  → landlord Personal Decision
  → LET_INVEST Decision Intelligence
  → sensitivity driver list (not executed there)

Personal Decision
  BUY        → buyer_general
  LET_INVEST → landlord
  → Why engine (validated paraphrase)
  → What-if (separate; frozen scoring path)

LET_INVEST only
  → assembleDecisionIntelligence
  → decisionIntelligenceExplanation (validated paraphrase, else template)
```

Cache and `retrievedAt` are written on PropertyData misses and on official-client cache hits. Identity verification state is stored on the identity row. Facts carry `trust` (`observed`, `calculated`, `estimated`, `userSupplied`, `areaContext`, `notAssessed`, `conflictingEvidence`).

Unknown versus zero:

- Missing service charge, ground rent, maintenance, insurance, management, and taxes are `unavailable` / `notAssessed`.
- A supplied zero is a real zero (`zeroValid: true`).
- Vacancy omitted is not “100% occupied” on the presented landlord path.
- No debt service makes DSCR null, not a large ratio.
- No flood hit is not Flood Zone 1.
- No Article 4 polygon is not “unrestricted.”
- No listed-building hit is not “not listed.”

---

## 8. Broken intelligence chains

Data exists. The decision does not use it as a decision input.

### BROKEN CHAIN 1 — Area demand versus landlord demand

Source → PropertyData `GET /demand` and `GET /demand-rent`  
Existing data → parsed bands, sample size, turnover, months of inventory, days on market, radius; stored on market intelligence and `personalDecision.marketContext.rentalDemand` (`role: context_only`)  
Missing connection → `personalDecisionLandlord.scoreDemand` refuses to score from area evidence. `decisionIntelligence.demandDependency` records `landlord_demand_not_assessed` and does not attach the area band as evidence that satisfies demand.  
Decision impact → a strong or weak area market cannot support or reverse the landlord demand dimension. The dimension stays `notAssessed` (weight 0.08) until a property-specific rule exists.

This is deliberate. It is still a broken chain: the endpoints are live in code and the decision treats demand as not assessed. Do not “fix” it by copying the area band into the score.

### BROKEN CHAIN 2 — Area sales demand versus BUY

Source → PropertyData `GET /demand`  
Existing data → `areaMarketDemand` on the explanation fact pack, with an explicit note that property-specific buyer demand is not assessed  
Missing connection → BUY Personal Decision has no demand dimension. Decision Intelligence does not run.  
Decision impact → liquidity context cannot change home-purchase fit.

### BROKEN CHAIN 3 — Schools evidence versus BUY school fit

Source → Planning Data `educational-establishment`  
Existing data → `propertyFacts.schools` and the workspace schools chip  
Missing connection → `buyerMatchEngine.scoreSchools` still returns `no_school_data_source` and does not read `schoolEvidence`  
Decision impact → a user school preference cannot use schools the analyse path already retrieved. Catchment would still be unknown even after a wiring fix. LET_INVEST correctly keeps schools as context only.

### BROKEN CHAIN 4 — Environmental and legal facts versus both decisions

Source → Flood Map for Planning; planning applications; listed buildings; conservation areas; Article 4  
Existing data → canonical facts and workspace chips  
Missing connection → `DEPENDENCY_MODEL.*.productionScoringActivated` is false. LET_INVEST context items set `affects: []`. BUY Decision Intelligence is `notApplicable`, so these facts never enter a Buy decision object. `buyer_general` weights ignore them.  
Decision impact → flood, listing, conservation, or Article 4 membership cannot change fit, valuation, finance, or a Buy/Let conclusion. They can only be read as context.

### BROKEN CHAIN 5 — Lease years versus mortgageability and resale

Source → PropertyData `/uprn` registered leases  
Existing data → `leaseYearsRemaining` fact when the provider returns dates  
Missing connection → `productionScoringActivated: false`. Decision Intelligence priorities do not include lease length.  
Decision impact → a short lease cannot weaken BUY fit or LET_INVEST finance, even when the number is known.

### BROKEN CHAIN 6 — Council tax versus BUY occupancy cost

Source → listing band and PropertyData `/uprn` amount  
Existing data → council tax facts  
Missing connection → `mayAffect` includes occupancy cost and affordability, with scoring inactive. `scoreBudget` is asking price versus `budgetMax`.  
Decision impact → a known council tax charge does not change whether the home looks affordable.

### BROKEN CHAIN 7 — Achieved-rent fact versus yield

Source → listing outcome `achieved_rent`, allowed source `InternalListing_outcome`  
Existing data → `propertyFacts.facts.achievedRent` when a positive outcome was stored. `analyseRent` still sets its own `achievedRent` to `null` and does not read the outcome.  
Missing connection → `resolveRentBasis` selects scenario rent, else listing asking rent, else a market asking-rent estimate. It does not select the achieved-rent fact. Decision Intelligence has no “achieved rent unknown” investigation priority.  
Decision impact → gross yield can be assessed, including from an area asking estimate when the listing has no rent, while an achieved rent on the same listing is ignored and an unknown achieved rent is not called out.

### BROKEN CHAIN 8 — Heuristic risk versus Decision Intelligence

Source → pre-v1 `report.risks`  
Existing data → still passed into landlord scoring so `dimensions.risk` can be numeric  
Missing connection → Decision Intelligence refuses those probabilities as material findings  
Decision impact → landlord fit can move on heuristic risk while the decision narrative says risk is not traceable.

### Not a broken chain

- Sprift and Hometrack: adapters return “not connected.” Capabilities lists are empty unless the provider is enabled, and the methods still do not return property data.
- Transport: no source is acquired, so there is nothing to connect.
- SDLT: no calculation exists.
- Development domain: not on the live path, by design.
- `futureValue` on raw metrics is the opposite pattern: a number is produced without a growth fact. It is an evidence leak, not unused data. See section 11.

---

## 9. Proposed relationship catalogue

No engine in this phase. Each row is a proposed relationship. Type is association unless a formula already defines the arithmetic. Do not describe these as causes.

| Id | Upstream | Downstream | Type | Direction | Evidence required | Confidence | Uncertainty | Decision | Applies to | Relevance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | purchase price, deposit | LTV | formula (not built) | higher deposit lowers LTV | both numbers user-supplied or price evidenced and deposit supplied | high if both supplied | mortgage amount may be derived | BOTH | all tenures | shows gearing; not a lender decision |
| R2 | purchase price, mortgage amount | deposit residual | formula, partial | — | supplied or derived loan | high | fees ignored | BOTH | all | cash picture is incomplete without costs |
| R3 | income, debts, expenditure, housing cost | affordability context | association (not built) | — | user-supplied income and commitments; housing cost evidenced or marked unknown | low until all parts exist | credit policy is outside the product | BUY | residential | required before any afford claim |
| R4 | purchase price, first-time-buyer status | SDLT implication | placeholder | — | price and an evidenced FTB status | none today | tax rules not implemented | BUY | residential England/NI rules differ; do not guess | cash to complete |
| R5 | price, other transaction costs | cash to complete | placeholder | costs increase cash | each cost sourced or unknown | none today | — | BOTH | all | BUY initial cash |
| R6 | expected rent, vacancy | effective rent | formula, exists | higher vacancy lowers effective rent | rent evidenced; vacancy user-supplied | medium | vacancy is an assumption, not a market rate | LET_INVEST | residential lettings | NOI input |
| R7 | effective rent, operating costs | NOI | formula, exists | higher costs lower NOI | each cost supplied or explicitly unknown | high when complete | unknown cost blocks NOI | LET_INVEST | all | net operating finding |
| R8 | NOI, price | net yield | formula, exists | — | NOI assessed | high | price may be asking | LET_INVEST | all | finding |
| R9 | NOI, debt service | cash flow and DSCR | formula, exists | higher debt service lowers both | complete finance | high | rate is user-supplied, not a quote | LET_INVEST | financed purchases | findings |
| R10 | service charge increase | operating costs → NOI → cash flow | formula chain, driver exists | increase lowers NOI and cash flow | a new supplied service charge | medium | major works can jump the charge without a history | LET_INVEST | leasehold | sensitivity driver `serviceCharge` |
| R11 | ground rent increase | same chain | formula chain | same | supplied ground rent | medium | review clauses are not read | LET_INVEST | leasehold | driver `groundRent` |
| R12 | lease years remaining down | mortgageability and resale concern | association only | shorter lease raises investigation need | calculated from evidenced lease dates | low | lender criteria are not in the product | BOTH | leasehold | must not be scored as a probability |
| R13 | area rental demand, area supply | letting-risk context | association only | — | both area facts, labelled area | low | not this property’s tenants | LET_INVEST | residential | context, not a demand score |
| R14 | planning pipeline up | future supply scenario | association only | more pipeline raises a supply question | counted permissions or starts, which we do not have | none | nearby applications are not a pipeline | LET_INVEST | — | do not infer price impact |
| R15 | flood zone, listed grade, conservation membership, Article 4 membership | investigation requirement | association only | presence raises a check | official spatial hit | medium for “check this” | legal effect is not determined | BOTH | England coverage holes | context, not a value adjustment |
| R16 | asking rent versus achieved rent | gross yield reliability | association | achieved below asking lowers yield | achieved rent evidenced | none today | asking yield can overstate | LET_INVEST | all | can reverse the yield finding |
| R17 | valuation range, asking price | price position | formula, exists | asking above range is a weaker price position | defensible valuation | medium | AVM error is the provider’s | BOTH | residential AVM eligible | finding or Buy price fairness |

Evidence requirement, confidence, and uncertainty stay on the relationship. A missing upstream stays `UNKNOWN`. It does not become zero.

---

## 10. P0 / P1 / P2 data gaps

Only gaps that the BUY and LET_INVEST MVP needs are recommended. Others stay named and unbuilt.

### P0 — a trustworthy consider-decision cannot be made without this

1. **BUY is not a purchase decision.** Income, commitments, cash to complete, and ongoing housing cost are missing, while a fit score can still be `strong_fit`. Until those are real inputs or the product refuses an affordability claim, BUY must not be described as a buy decision.
2. **Achieved rent does not drive yield.** The rent-intelligence object always sets `achievedRent` to null. A stored listing outcome can sit on `propertyFacts.facts.achievedRent` and still be ignored. Gross yield can use listing asking rent or, if that is missing, an area asking-rent estimate. LET_INVEST must treat that yield as incomplete whenever achieved rent is unknown. Collecting achieved rent is the data gap. Inventing it is not allowed.
3. **Lease length does not affect either decision** even when PropertyData has calculated years remaining, and it is often missing. For leasehold, unknown or short remaining term is decision-relevant and currently invisible to DI.
4. **Service charge and ground rent have no reliability check**, and major works are absent. NOI that uses a single listing figure can be overturned by works. Unknown charges are already withheld. A known listing figure is still a single observation.
5. **PropertyData market evidence is off unless configured.** Sold prices, AVM, rents, and demand do not run when the key is missing. The honest state is `notAssessed`. A fallback valuation would be worse. P0 is operational: do not ship market claims without the provider, and do not fill the gap with mocks.

### P1 — materially improves the same decision

1. Show area `/demand` and `/demand-rent` inside Decision Intelligence as **context**, still not as the demand score (repair the narrative gap without inventing property demand).
2. Point BUY school **context** at `schoolEvidence`. Do not revive keyword school scores. Catchment stays unknown.
3. Calculate **LTV** only when price and deposit are both supplied.
4. Add lease years to LET_INVEST investigation priorities when tenure is leasehold and years are missing or short. Do not invent a lender rule.
5. Add the number whitelist already used by Decision Intelligence explanation to `generatePropertyExplanation` (section 11).
6. Stop landlord fit from moving on heuristic `risks`, or label that dimension as heuristic and drop it from any decision claim.
7. User-supplied mortgage rate remains the MVP. A lender-product feed is not required if the rate stays user input and is labelled as such.

### P2 — useful, not required for this MVP

- Transport/commute provider.
- Time-to-let and property-level demand.
- Supply pipeline distinct from nearby applications.
- Same-building comparables, developer, freeholder, managing agent.
- Sinking fund and building safety.
- SDLT and first-time-buyer relief (placeholder until a tax phase).
- Sprift, Hometrack, micro-location, holding-period as a real user horizon.
- Income-tax on rental profit.

Not recommended now: scoring flood or Article 4 into value; mapping area demand bands onto the 0.08 demand weight; enabling `buyer_ftb` before SDLT rules exist.

---

## 11. AI / evidence safety findings

Rule: no evidence means no fact. Unreliable data stays unknown. Analytics calculate. AI paraphrases.

| Path | What it may do | Guard | Verdict |
| --- | --- | --- | --- |
| `decisionIntelligenceExplanation.js` | Paraphrase LET_INVEST DI facts | `validateExplanation` rejects unknown finding ids, reordering, purchase advice, tenant-demand claims when demand is not assessed, and numbers that are not in the facts. Constants 0–10 and 100 are allowlisted. Failure falls back to the template. | Holds for property metrics |
| `personalDecisionWhyEngine.js` | Paraphrase fit facts for buyer and landlord, including the delta explainer | Rejects purchase talk and numbers absent from the facts. Allowlist adds 0–10, 50, 65, 80, and 100 (fit thresholds). Failed validation is `source: rejected` and does not replace the deterministic explanation. | Holds for property metrics |
| `propertyExplanationService.generatePropertyExplanation` | Live analyse step (`propertyIntelligenceEngine.js` calls `explainFn`) | System prompt forbids invented rents, yields, valuation, EPC, flood, demand, NOI, DSCR, and other facts. **The returned `summary` is stored with `source: openai` without the numeric whitelist.** | **CRITICAL** |
| `openaiService.generateListingContent` | `aiController` listing-copy route | Prompt says “persuasive but accurate.” On success the parsed JSON is returned with no number or attribute check. | **CRITICAL** |
| `openaiService.mockListingWriter` | Same route when `OPENAI_API_KEY` is absent, and the catch path after an API error | Uses a supplied price if present. If features are missing it writes “modern finishes,” “excellent natural light,” “High-spec interior finishes,” “Ready to move in,” and “desirable location.” Default bedrooms 3 and bathrooms 2 when omitted. | **CRITICAL** |
| `openaiService.polishBuyerMatchMessage` | Rewrites `assistantMessage` only | Scores stay from `buyerMatchEngine`. The message itself is not checked for numbers or invented attributes. Prompt says “Do not change match scores.” | **CRITICAL** for the message text. Scores are not replaced. |
| `openaiService.generateValuationReport` | Blocked | Returns `source: 'blocked'` and `estimatedValue: null`. No `callOpenAI`. | Holds |
| Rent, yield, DSCR, valuation engines | Numbers | No LLM calls inside `financialEngine.js` | Holds for the LLM rule |
| Area yield and AVM | Estimates | Labelled provider or area estimate, not AI | Holds if callers keep the labels |

**CRITICAL 1.** `generatePropertyExplanation` can place unsupported valuation, rent, yield, rate, demand, or attribute numbers into `explanation.summary` because nothing checks the summary against the fact JSON.

**CRITICAL 2.** `generateListingContent` can return an unchecked OpenAI listing, and `mockListingWriter` can create unsupported factual property attributes (condition, finish, buyer appeal, default bed and bath counts) when evidence was not supplied.

**CRITICAL 3.** `polishBuyerMatchMessage` can put unsupported numbers or property claims into `assistantMessage`. It does not overwrite match scores.

Non-LLM evidence leak, not an LLM CRITICAL: `calculateInvestmentMetrics` sets `futureValue` from purchase price with 0% appreciation and a 5-year hold when those inputs are missing. `presentEvidencedInvestment` does not publish it. The analyse report still includes `investment.metrics`. `rentIntelligenceService` `priceSensitivity` emits ±3% and +7% rents that were not observed. `otherExpenses` and renovation cost, when omitted, are added as 0 inside calculations that are already allowed to run.

No inspected LLM path is allowed to **replace** canonical yield, DSCR, or valuation fields. The holes are narrative and marketing text, plus the raw metrics growth figure.

---

## 12. KEEP / FIX / BUILD / REMOVE

### KEEP

- Decision job split and the refusal to run landlord methodology on an invalid job.
- `notAssessed` instead of zero for missing costs, flood, planning, listing, Article 4, and demand.
- Listing precedence on conflicts, without averaging and without an LLM resolver.
- PropertyData asking-rent versus achieved-rent labelling.
- Finance presented-completeness gates.
- Official flood, planning, schools, listed, conservation, and Article 4 clients as context.
- UPRN uniqueness rule.
- DI explanation and Why-engine validators.
- Sprift and Hometrack as explicit stubs.
- Development domain unwired.

### FIX

- Connect area demand into DI as context only. Leave the demand score `notAssessed`.
- Feed `schoolEvidence` into BUY as context. Change `scoreSchools` so it does not claim that no schools source exists.
- Surface lease years on leasehold as an investigation item.
- Add numeric validation to `generatePropertyExplanation`, matching the DI explainer, and keep the template on failure.
- Apply the same check to `polishBuyerMatchMessage`, or stop calling it. Do not let the assistant message invent attributes.
- Stop returning unchecked OpenAI listing JSON. Remove invented amenity and default bed/bath text from `mockListingWriter`, or refuse to generate when those fields are absent.
- Detach heuristic `risks` from any claim that landlord risk was evidenced.
- Confirm clients render `investment.presented` availability, not `investment.metrics.futureValue`, cash-on-cash, or the rent `priceSensitivity` bands.
- When a listing outcome has `achieved_rent`, either use it as a labelled achieved-rent fact in the rent object or state that yield ignored it. Do not leave the two fields silently different.

### BUILD

- BUY cash and ongoing-cost questions as unknowns with user inputs for income, commitments, and deposit. Do not score them until the inputs exist.
- LTV from supplied price and deposit.
- Achieved rent as a real outcome field, remaining null until an outcome exists.
- Major works and a service-charge reliability flag when a source exists.
- SDLT only in a later tax phase. Leave the placeholder.

### REMOVE

- Nothing that currently returns evidence should be removed in this phase.
- Do not remove `/demand` or `/demand-rent`.
- Do not remove the heuristic risk array until What-if re-score no longer depends on it. Stop **presenting** it as decision evidence first.

---

## 13. Safe product claims today

These claims match the code when the relevant provider call succeeds and the fact is `available`:

- The product can record a residential decision job: buy, let/invest, or sell.
- For buy, it can compare the listing with stated budget, bedroom, location, and lifestyle preferences, and it can say when transport or schools were not used.
- It can show an asking price and, when a defensible valuation exists, an asking-price position.
- It can show postcode sold prices and area long-let **asking** rents from PropertyData when that provider is enabled.
- It can show official EPC, flood-map, nearby planning, nearby schools, listed-building, conservation-area, and Article 4 **membership** evidence for England where those services return a hit, and it can say when they were not assessed.
- For let/invest, it can calculate gross yield from a supplied price and a supplied rent, and it can withhold NOI, net yield, cash flow, and DSCR when costs or mortgage inputs are missing.
- It can say that property-specific tenant demand and buyer demand were not assessed.
- It can paraphrase those structured results with the validated Why and Decision Intelligence explainers.

---

## 14. Claims the product must not make yet

- “You should buy this” or “you should not buy this.”
- “You can afford this” from budget versus asking price.
- A cash-to-complete or SDLT figure, including first-time-buyer relief.
- That ongoing housing cost is known.
- That a UPRN match is a verified legal title.
- That asking rent or an area asking-rent estimate is achieved rent.
- A property-level demand, time-to-let, or time-to-sell.
- That an area demand band is this property’s tenant or buyer demand.
- That missing flood, planning, listing, conservation, or Article 4 results mean the property is clear.
- That Article 4 membership lists the permitted-development rights that were removed.
- That a nearby listed building means this property is listed.
- That EPC is a condition survey.
- That NOI or DSCR is known when any material cost or mortgage input was not supplied.
- That application defaults (0% interest, 0% vacancy, 25-year term) were the user’s finance.
- A lender decision, rate, or product.
- A school-catchment or admission claim.
- A commute time, unless a real commute figure was supplied.
- A development, commercial, or land viability conclusion.
- Any number that appears only in the unvalidated property-explanation summary, the listing-writer copy, or the polished buyer-match message.
- A future value, equity gain, or price-growth percent taken from `investment.metrics` when the user did not supply appreciation and holding period.
- That the rent price-sensitivity bands (±3%, +7%) were observed rents or demand.

---

## 15. Recommended Phase 2

Phase 2 should make the existing decision honest for BUY and LET_INVEST. It should not build the relationship engine, tax rules, new providers, or other asset classes.

1. **BUY decision object, parallel to LET_INVEST DI, still not a recommendation.** Questions: cash still unknown, housing cost still unknown, valuation support, leasehold unknown, and context constraints. Fit score remains preference fit. Do not rename it to a buy score.
2. **LET_INVEST investigation additions already supported by facts:** achieved rent unknown; leasehold years missing or short; area demand shown as context beside the still-unassessed demand dimension.
3. **Close the three CRITICAL AI paths:** numeric validation on `generatePropertyExplanation`; the same check, or no call, for `polishBuyerMatchMessage`; no fabricated attributes from `generateListingContent` or `mockListingWriter`.
4. **Schools context on BUY** from the existing educational-establishment fact. No catchment score.
5. **LTV** as a calculation when price and deposit exist. No lender feed.
6. **Leave** SDLT, major works, transport, property-level demand, and building-role intelligence as named gaps until a source is chosen.
7. **Do not** map `/demand` or `/demand-rent` onto the landlord demand weight.
8. **Do not** change `financialEngine` formulas.
9. **Stop presenting** `metrics.futureValue` and rent `priceSensitivity` as evidence. Leave the yield, NOI, cash flow, and DSCR formulas unchanged.

Stop after that. A relationship engine is premature while achieved rent, lease length, and BUY cash inputs are still unknown.
