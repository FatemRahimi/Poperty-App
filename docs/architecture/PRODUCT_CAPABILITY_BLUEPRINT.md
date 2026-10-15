# Product Capability Blueprint

**Date:** 15 October 2026  
**Phase:** product definition only. No production change, no UI redesign, no provider, no migration, no Relationship Engine.  
**Code inspected:** `E:\laptop mac\New folder\property-main (1)`, branch `temp-branch`.  
**Status vocabulary:** IMPLEMENTED, PARTIAL, STUB, MISSING, NOT VERIFIED, DEFERRED.

This document defines what the product must eventually do, what the repository does today, and what the next phase is allowed to build. It does not authorise that build.

Inventory counts in `docs/architecture/implementation-status.md` (86 listings, HMLR row counts, EPB attach counts) were **not re-queried** in this pass. They are cited as that document’s recorded measurements, not as a fresh database audit.

---

## 1. Product mission

Help a person who may know almost nothing about property reach a **personal residential decision** that stays inside the evidence.

The user may say “I have £70,000 and want to buy a property”, “Should I buy this flat?”, or “Where in the UK should I consider buying?”. The product decides which factors can change that decision and investigates them. The user should not need a checklist.

The product is evidence-backed decision intelligence. It is not a portal, a search site, a chatbot, a calculator collection, a score site, or a dashboard of disconnected statistics.

A conclusion is allowed only when the material inputs are known, labelled, and still true for **this** user. Anything else stays UNKNOWN. UNKNOWN is never stored or shown as zero, normal, safe, average, or “clear”.

---

## 2. Core user problems

| Problem | Why a portal or a general chatbot fails |
| --- | --- |
| The user does not know which questions matter. | A portal shows what was typed into a listing. A chatbot answers the question that was asked and skips the one that was not. |
| A single number hides its basis. | Asking rent, achieved rent, and an area asking-rent estimate answer different questions. Mixing them produces a yield that looks exact. |
| Area evidence is treated as a fact about the flat. | A postcode flood zone, a nearby school, or a city growth rate is not a statement about this unit. |
| The user’s money is ignored or invented. | “Affordable” without income, deposit, and commitments is a preference match against a budget field, not a buy decision. |
| Missing evidence is filled in. | A blank service charge shown as £0, or a failed map lookup drawn in central London, changes the decision without evidence. |
| The same capital is not compared honestly across places. | Three cities compared on different rent bases, different lease assumptions, and different horizons is not a comparison. |

---

## 3. User decision universe

The chain the product is designed around:

**User goal → user context → subject identification → automatic decision investigation → evidence → analytics → relationships → scenarios → alternatives → personalised decision support.**

Residential jobs in scope of this blueprint:

| Job | User goal | Subject |
| --- | --- | --- |
| BUY | Live in a home, within this person’s money and constraints. | One identified dwelling, or later a short set of identified candidates. |
| LET_INVEST | Hold a dwelling as a let, under this person’s capital, costs, and horizon. | One identified dwelling, or later a short set of identified candidates. |
| WHERE | Choose among places under the same capital, financing assumptions, horizon, objective, and risk frame. | Places first, then candidate dwellings. Not a UK inventory search. |

SELL, refinance, renovate, develop, commercial occupation, and portfolio construction are outside this blueprint’s MVP. The workspace already marks several of those jobs not implemented (`residentialDecisionWorkspace.js`).

**What the code does today**

- `buyer_general` is an owner-occupier **preference fit** (budget versus asking price, location, space, price fairness, lifestyle, transport). `personalDecisionCanonical.js` and `residentialDecisionWorkspace.js` say it is not income affordability and not a recommendation to buy.
- `buy-decision-1.0.0` (`buyDecision.js`) is a separate evidence object. `buyRecommendation` is null. Affordability, cash-to-complete, and ongoing housing cost are UNKNOWN in this phase.
- Decision Intelligence v1 (`decisionIntelligence.js`) runs for LET_INVEST. BUY and SELL are not applicable for that engine.
- The client has **no** reference to `buyDecision`. The landlord panel still leads with fit labels (“Strong fit”, “Good fit”). A muted line says the fit is not a purchase recommendation. The user still sees a score first.

---

## 4. Automatic Decision Investigation model

Investigation is a product capability, not a prompt.

For a goal and a subject, the system opens the material questions, fetches or records evidence, and leaves gaps as gaps. It ranks gaps by whether they can change **this** decision, not by how easy they are to display.

Example the product must be able to run for “Should I buy this flat?”:

Property identity → exact unit / UPRN → asking price → sold comparables → valuation evidence → tenure → lease remaining → service charge → ground rent → major works → building → EPC → council tax → flood → planning → neighbourhood → transport → schools → amenities → historical market → mortgage → affordability → total ownership cost → scenarios → alternatives.

Rules:

1. Do not ask the user to know this list.
2. Do not score a missing item.
3. Do not narrate a missing item as favourable.
4. Separate FACT, ESTIMATE, CONTEXT, INFERENCE, ASSUMPTION, and UNKNOWN.
5. Proximity is not impact. A school within 800 metres is a location fact. It is not admission, quality, or a price effect.
6. Historical growth is not a forecast.
7. Regeneration evidence is context. It is not future appreciation.
8. New supply can be competitive pressure. It is not an automatic price fall.
9. Generic model knowledge is not live mortgage, tax, or market evidence.

**Current code:** investigation priorities exist on the server for LET_INVEST (`decisionIntelligence.js`, including achieved rent and leasehold gaps) and on the BUY evidence object (`buyDecision.js`: affordability incomplete, deposit, ongoing cost, valuation support, leasehold gaps, unresolved environment). They are not the screen the user sees.

---

## 5. Capability map

| Domain | Product need | Code status | Priority |
| --- | --- | --- | --- |
| Property identity | Exact unit, not a postcode blob | PARTIAL | P0 |
| Valuation evidence | Asking price versus sold evidence, labelled | PARTIAL | P0 |
| Rent and investment maths | Separate rent bases; withhold NOI when costs are missing | PARTIAL | P0 |
| User financial context | Capital, deposit, objective; income still missing | PARTIAL | P0 |
| Mortgage | LTV and payment only from explicit inputs; no product shelf | PARTIAL | P0 for the gate, P1 for products |
| Tax and transaction costs | SDLT and costs as dated rules, never guessed | MISSING | P1 |
| Leasehold and legal | Known / unknown / not applicable; professional verification flagged | PARTIAL | P0 |
| Building and development | Identity and cost burden; no reputation score | STUB / PARTIAL | P1 |
| Market history | Sold prices and rent evidence with geography labelled | PARTIAL | P0 for one subject, P1 for cities |
| Location hierarchy | UK → city → borough → neighbourhood → street → building → unit | MISSING as a model | P1 |
| Map and zoom | Evidence layers, not a decorative pin | PARTIAL and unsafe | P2 |
| Neighbourhood | Transport, schools, amenities, flood, planning as classed evidence | PARTIAL | P1 |
| Schools | Location and official fields only | PARTIAL | P1 |
| Planning and regeneration | Applications and designations; not guaranteed growth | PARTIAL | P1 |
| Cross-market comparison | Same capital, same assumptions, same unknowns | MISSING | P1 |
| Missing-evidence intelligence | Ranked by decision impact, visible | PARTIAL | P0 |
| Scenarios | User or stated assumptions, never presented as history | PARTIAL | P0 |
| Relationships | Defined, not built | DEFERRED as an engine | Define now, build later |
| AI explanation | Intent, trade-offs, uncertainty; no manufactured facts | PARTIAL | P0 |

---

## 6. Property intelligence

| Capability | Status | Evidence |
| --- | --- | --- |
| Address and listing identity | PARTIAL | `canonicalIdentityService.js`. Unique UPRN only. Listing wins conflicts. No LLM resolver. User-declared identity is not `VERIFIED_EXACT`. |
| Exact unit (SAON / flat) | PARTIAL | Identity model distinguishes unit from building. `implementation-status.md` recorded SAON coverage as thin and many EPB matches unresolved on unit. Not re-counted here. |
| UPRN | PARTIAL | PropertyData `/address-match-uprn` only when one candidate. UPRN is not an HM Land Registry title. Official EPB can attach a UPRN as source-asserted, not verified-exact. |
| Type, bedrooms | PARTIAL | Listing and observed fields. LLM copy cannot invent bed/bath counts (`llmOutputGuard.js`). |
| Bathrooms, floor area | PARTIAL | Only where a sanctioned field or EPB certificate supplies them. EPC is not a survey (`implementation-status.md`, building-condition domain). |
| Tenure | PARTIAL | `leaseholdTruth.js`. Freehold makes lease years, service charge, and ground rent NOT_APPLICABLE. |
| Asking price | PARTIAL | Listing field. It is not a valuation. |
| Sold comparables | PARTIAL | Official Price Paid local table plus bounded comparable assessment in the market domain. HIGH cohort rules are strict. Area transactions are MARKET_CONTEXT, not a subject valuation. Analyse does not download the national file. |
| Valuation evidence | PARTIAL | `valuationEngine.js` for residential when the methodology gate and PropertyData `/valuation-sale` are allowed. Provider default is off (`PROPERTYDATA_ENABLED`). AVM is not treated as fact of sale. |
| Price per square foot | PARTIAL | PropertyData `/sold-prices-per-sqf` is an area overlay when acquisition policy allows it. It is not this flat’s measured rate unless floor area and a subject sale exist. |
| Asking versus evidence | PARTIAL | Price-position / comparable tiles exist in the decision workspace. They are not a buy recommendation. |
| Bathrooms “where evidenced” | PARTIAL | Missing bathrooms stay missing. They are not averaged. |

---

## 7. Financial intelligence

| Capability | Status | Evidence |
| --- | --- | --- |
| Asking rent | PARTIAL | Listing monthly rent. Canonical basis `LISTING_ASKING_RENT` in `financeInputContract.js`. |
| Achieved rent | PARTIAL | A fact can exist from a user-supplied listing outcome. It is **not** substituted into yield. Yield stays on asking or area asking until achieved rent is the selected basis. |
| Area rent estimate | PARTIAL | PropertyData `/rents` is area long-let **asking** rent. Weekly figures convert with 52/12. Labelled area estimate, not achieved. |
| Gross yield | PARTIAL | `financialEngine.js` formula unchanged. Presented path attaches rent basis, evidence class, and limitation (`evidencedInvestment.js`). |
| Operating costs, NOI, net yield | PARTIAL | If a required cost is missing, NOI, net yield, cash flow, and DSCR are withheld. Missing is not zero (`financialEngine.js` message and presentation gate). |
| Vacancy | PARTIAL | User scenario or application default. Default vacancy 0 is an application default and must not be shown as observed occupancy. |
| Mortgage cash flow and DSCR | PARTIAL | Only when mortgage inputs exist. No debt service means DSCR is null, not infinite. |
| Investment scenarios | PARTIAL | What-if on a saved snapshot. Rent price-sensitivity rows are ±3% and +7% multipliers, class SCENARIO (`rentIntelligenceService.js`). |
| User capital | PARTIAL | Budget and explicit deposit can be supplied. Budget is not a deposit (`safeLtv.js`). |
| Income, employment, commitments | MISSING | `buyDecision.js` leaves affordability UNKNOWN. No income model. |
| Risk tolerance, horizon, objective | PARTIAL | Holding period and expected appreciation exist as inputs. Application defaults are 5 years and 0% appreciation. `withholdDefaultedGrowth` nulls future value unless both were actually supplied, and even then labels growth ASSUMPTION. |
| First-time buyer | MISSING | No FTB status drives tax or affordability. |
| Mortgage versus cash | PARTIAL | Explicit deposit including zero (cash purchase, LTV 100) is valid. Missing deposit is UNKNOWN, not zero. |

Do not mix asking rent, achieved rent, and area estimates in one unlabeled yield.

---

## 8. Mortgage intelligence

| Capability | Status | Evidence |
| --- | --- | --- |
| LTV | PARTIAL | `safeLtv.js`. LTV = (price − deposit) / price × 100 only when price and deposit are explicitly supplied. Deposit above price or non-positive price stays UNKNOWN. |
| Borrowing requirement | PARTIAL | Mortgage amount is price minus explicit deposit. It is not a lender offer. |
| Monthly payment, rate, term, fees | PARTIAL | Calculated only from supplied rate, term, and fees inside the existing finance engine. `APPLICATION_DEFAULTS` include term 25, interest 0. A 0% rate default is not a live product. |
| Affordability | MISSING | No income, expenditure, or stress test. |
| Rate sensitivity | PARTIAL | Only as a user scenario, if the UI or what-if supplies a rate. Not a market curve. |
| Lender and product compatibility | MISSING | No lender file. Sprift and Hometrack adapters are not connected. |
| Lease and mortgageability | PARTIAL | Unknown lease is an investigation item. `mortgageabilityAssessed` is false. No “unmortgageable” threshold. |
| BTL constraints | MISSING | No ICR/stress product rules beyond DSCR when the user supplied the inputs the engine already accepts. |

Generic model knowledge of “typical UK rates” is not evidence. A rate is evidence only when the user, a dated lender source, or a licensed feed supplies it and the provenance is stored.

---

## 9. Leasehold and legal intelligence

| Capability | Status | Professional verification |
| --- | --- | --- |
| Tenure | PARTIAL (`leaseholdTruth.js`, listing tenure) | User or listing assertion is not a title document. |
| Remaining lease | PARTIAL; often UNKNOWN | Official lease length needs the lease or an official extract. The product must not invent years. |
| Service charge | PARTIAL; one observation when present | A single figure is not a history and not a cap. |
| Ground rent | PARTIAL | Escalation clauses are not parsed. |
| Restrictions, subletting | MISSING | Requires the lease. Flag as legal verification. |
| Title evidence | PARTIAL | `legalTitleDomain.js` is completeness of private documents. Upload is not verification. `implementation-status.md` recorded zero private legal documents in the last operational audit. Not re-counted here. |
| Major works / Section 20 | MISSING | Not inferred from service charge. |
| Building safety | MISSING as a subject fact | Do not infer from postcode or building name. |
| Mortgageability and resale implications | PARTIAL as investigation prompts only | No lender or sale-outcome claim. |

Items that **require** a solicitor, conveyancer, or official title/lease document before they can become FACT: title class, remaining term, ground-rent review, subletting, alterations, Section 20 notices, building-safety status, and any statement that a lender will or will not lend.

---

## 10. Building and development intelligence

| Capability | Status | Rule |
| --- | --- | --- |
| Developer, freeholder, managing agent | MISSING on the live decision path | Do not scrape a reputation score. |
| Development / building identity | STUB | `developmentDomain.js` exists. `composeLiveDomains.js` live order is market, planning, environment, legal title, building condition. Development is not in that list. |
| Service-charge history, reserve fund | MISSING | One charge is not a history. |
| Major works | MISSING | |
| Building safety | MISSING | |
| Facilities | PARTIAL | Outdoor space, garage, and parking can be investigation items when absent (`decisionIntelligence.js`). Absence is unknown, not a penalty score by itself. |
| Cost burden | PARTIAL | Only the evidenced service charge / ground rent already in finance. |
| Resale evidence for the building | MISSING | A postcode sold series is not this building’s resale record. |
| Management quality | DEFERRED | Any score would be invented. |

EPC / energy evidence is PARTIAL via MHCLG EPB when a unique certificate attaches. It is building-condition evidence of energy and some physical fields. It is not a survey and it does not enter valuation or finance.

---

## 11. Market intelligence

| Capability | Status | Geography it actually describes |
| --- | --- | --- |
| Historical sold prices | PARTIAL | Local official Price Paid when imported. Subject match is exact UPRN, else exact address; postcode-only is area context. |
| Historical rent | MISSING as a time series | Current area asking estimate is not a rent history. |
| Price growth | MISSING as a decision series | Default appreciation is 0 and is withheld from presented future value unless the user supplied it. That supplied rate is still an assumption. |
| Rent growth | MISSING | |
| Transaction activity, liquidity, supply | PARTIAL | PropertyData `/demand` and `/demand-rent` are **area context**. They are not property demand, tenant demand, sale probability, or let probability (`areaMarketContext.js`). Landlord demand score does not use them. |
| Market depth and comparables | PARTIAL | Comparable assessment is a small HIGH cohort rule, not a city index. |
| “Compare house-price growth across 8 UK cities” | MISSING | No city-level growth object exists. |

Support for that city question is a real later capability. It needs a dated, sourced series per city, a stated start and end, and a label that history is not a forecast. It is not P0.

---

## 12. Location intelligence hierarchy

The hierarchy the product should use, and what may be said at each level:

| Level | Belongs here | Must not be said here |
| --- | --- | --- |
| UK | Tax regime identity, national datasets’ coverage limits | A national average as this flat’s value |
| City | City sold or rent series, once sourced | That the user’s flat will follow the city |
| Borough / district | Local-authority data (council tax area, some planning context) | Borough growth as the unit’s growth |
| Neighbourhood | Amenities, stations, school locations, flood zone of the mapped point | “Desirable”, catchment, price impact |
| Street / micro-location | Sold prices on the same street when the match rule says so | Every street sale is a comparable |
| Development / building | Service charge, cladding/safety, managing agent, building sales | A reputation score |
| Exact property | UPRN, unit, tenure, lease, asking price, EPC certificate, subject valuation evidence | Anything copied down from the city |

**Code today:** postcode and listing address exist. Canonical identity can hold PAON/SAON/UPRN. There is no neighbourhood or city entity that decision logic reads. Area market calls are postcode-area context.

---

## 13. Map and zoom intelligence

**Target, not this phase:** UK → city → neighbourhood → micro-location → property, with layers for historical price, growth, rent, transactions, supply, and demand indicators that stay inside their evidence class.

**Code today:** PARTIAL and unsafe. `client/src/pages/PropertyView.js` loads Leaflet and geocodes the postcode with Nominatim. The marker is the postcode centroid, not the unit. If geocoding fails, the map falls back to latitude 51.505, longitude -0.09 (central London). A failed lookup becomes a different city. That is the UNKNOWN-becomes-a-place failure mode. No evidence layers exist.

Map work is P2. The London fallback is a defect to fix only when a later phase explicitly allows a small corrective change. This blueprint does not authorise that change.

---

## 14. Neighbourhood intelligence

| Topic | Status | Class the product may use |
| --- | --- | --- |
| Transport and stations | PARTIAL | Buyer match can score a **stated commute preference** against `intelligence.transport` or a station distance if those fields exist (`buyerMatchEngine.js`). Missing transport is unscored. Parking is not transport. |
| Schools | PARTIAL | Planning Data educational establishments within about 800 metres. Context only. See section 14a. |
| Amenities, shops, supermarkets, restaurants, high streets, employment centres | MISSING | Do not infer from a map pin. |
| Planning | PARTIAL | Planning applications near the point (~400m). Nearby application ≠ permission granted for this flat. |
| Conservation, listed, Article 4 | PARTIAL | Point-in-polygon or nearby listed building. Nearby listed ≠ this property listed. Article 4 membership ≠ a full list of withdrawn rights. |
| Flood | PARTIAL | Environment Agency rivers and sea, zones 2 and 3. Empty is not Zone 1. |
| Regeneration | MISSING | No sourced regeneration object. |
| Demographics | MISSING | |
| Local development pipeline | MISSING | Planning applications are not a pipeline forecast. |

FACT, ESTIMATE, CONTEXT, INFERENCE, and UNKNOWN stay distinct. A station 0.4 miles away is CONTEXT (distance). “This supports the price” is an INFERENCE and needs a separate evidence rule the product does not have. Until that rule exists, the inference is not shown as a conclusion.

### 14a. Schools

Allowed: school name, location, distance, and official fields that the source actually returned.

Not allowed unless a cited source supports that exact claim: guaranteed admission, catchment eligibility, school quality, Ofsted as a price driver, or “this school adds £X”. `scoreSchools` does not score. State is `schools_context_only` when evidence is present, with a null score. BUY decision marks catchment, admission, and quality NOT_ASSESSED.

### 14b. Planning and regeneration

Allowed: application reference, status, distance, conservation/listed/Article 4 membership as the geometry test returned.

Not allowed: “this will be regenerated”, “values will rise”, or treating a consultation as consent.

---

## 15. Cross-market comparison

Strategically important. Not implementable honestly on current evidence. Status: MISSING. Priority: P1, after one-subject investigation is visible.

Future question: “I have £70,000. Should I consider a London leasehold flat, a Birmingham property, or a Manchester investment?”

A comparison is valid only when every candidate is run through the **same**:

- capital and deposit
- financing assumptions (rate, term, fees, product type) marked assumption or sourced
- horizon
- objective (live-in versus let)
- risk frame (what the user treats as unacceptable: lease under N years, negative cash flow, unresolved safety)
- evidence clock (same as-of dates, or the gap is shown)

The comparison must show, per candidate: purchase economics, mortgage, tax, ownership costs, yield **with rent basis**, cash flow, lease and building gaps, historical market **at the correct geography**, liquidity evidence, location context, scenarios, and missing evidence.

If achieved rent is unknown in Manchester and known in Birmingham, the yields are not comparable. The product says so. It does not fill Manchester with the area average and then rank the cities.

This is not a UK search. Candidates are either identified dwellings or explicitly labelled **area illustrations** that cannot outrank an identified dwelling.

---

## 16. Missing-evidence intelligence

First-class capability. Status: PARTIAL. The server can list gaps. The client does not lead with them.

The product should be able to say: “A reliable conclusion is not available because these items can change the decision.”

Example shape:

- VERIFIED: asking price, UPRN, EPC, sold comparables
- UNKNOWN: remaining lease, major works, achieved rent
- SCENARIO: 5% vacancy, rate +2%

Priority is decision impact:

1. Items that can reverse a buy or a let (lease length for a mortgage, service charge large enough to break cash flow, achieved rent far from asking rent, unresolved building safety).
2. Items that change the number but not the direction (exact council tax band once the order of magnitude is known).
3. Context that should stay visible and unscored (nearby schools, area demand).

`buyDecision.js` currently marks affordability and ongoing housing cost unknown on every BUY in this phase. That is correct. It also means a BUY conclusion cannot be “reliable” yet. The UI must not imply otherwise with “Strong fit”.

---

## 17. Scenario intelligence

Status: PARTIAL.

Scenarios are assumptions the user, or an explicit product assumption, varies: price, rent, vacancy, rate, holding period, appreciation. They are labelled SCENARIO or ASSUMPTION.

Rules already in code and still binding:

- Rent price-sensitivity is not observed rent and not demand.
- Future value at the application default of 0% over 5 years is withheld.
- A what-if uses the saved snapshot. It does not rewrite history.
- A scenario does not create achieved rent, a lender decision, or a growth fact.

P0 scenario set for one subject, once the user has supplied the inputs: deposit or cash, rate, vacancy, and one cost shock (service charge or rate +2%). Anything else waits.

---

## 18. Responsibility boundaries

| Layer | May | Must not |
| --- | --- | --- |
| Data | Collect, store, and describe evidence with source, geography, and time. | Fill a gap with a typical value. Interpret a document as verified because it was uploaded. |
| Analytics | Deterministic arithmetic on supplied inputs (yield, LTV, payment, NOI). | Run the arithmetic by substituting zero for a missing cost, or treat the result as a market fact. |
| Relationship intelligence | Connect a change to downstream effects (service charge up → operating cost up → NOI down). | Assign a coefficient, a probability, or a price impact without an evidence rule. **Not built. Not in this phase.** |
| Investigation intelligence | Choose the next material gap and say why it can change the decision. | Turn the gap list into a score. |
| AI | Read the user’s goal, ask only for inputs the user actually has, explain trade-offs, compare labelled scenarios, state uncertainty. | Invent price, rent, yield, rate, demand, beds, baths, lease years, school quality, or future growth. |

LLM paths that are guarded today: property explanation, listing copy, and buyer-match polish (`llmOutputGuard.js`). Rejected text falls back to a template or deterministic copy. `generateValuationReport` stays blocked. Guards reduce fabrication. They are not a source of facts.

---

## 19. Current capability matrix

Status is from modules opened in this pass and the Phase 2 tests’ subjects, not from filenames.

| Capability | Status | Module evidence |
| --- | --- | --- |
| Canonical subject identity | PARTIAL | `server/services/identity/canonicalIdentityService.js` (unique UPRN; no silent overwrite) |
| Asset class gate before residential AVM and rent | IMPLEMENTED | `assetClassificationRuntime.js`, `marketAcquisitionPolicy.js`, engine gate |
| Residential valuation evidence | PARTIAL | `valuationEngine.js`; paid provider off unless enabled |
| Bounded sold comparables | PARTIAL | Market domain comparable assessment; official sale local table |
| Rent basis labels | IMPLEMENTED on the server object | `financeInputContract.js` `CANONICAL_RENT_BASIS`; `evidencedInvestment.js` |
| Yield, NOI, cash flow, DSCR with missing-cost withhold | IMPLEMENTED when presentation path is used | `financialEngine.js`, `evidencedInvestment.js` |
| Safe LTV | IMPLEMENTED | `safeLtv.js` |
| BUY evidence object separate from preference fit | IMPLEMENTED on the server | `buyDecision.js`, assembled in `propertyIntelligenceEngine.js` |
| BUY evidence on the client | MISSING | No `buyDecision` usage under `client/src` |
| Preference fit | IMPLEMENTED | `buyerMatchEngine.js`, `personalDecision.config.js` |
| LET_INVEST decision intelligence | PARTIAL | `decisionIntelligence.js` versioned engine; fit score still leads the landlord panel |
| Area demand as context only | IMPLEMENTED | `areaMarketContext.js`; `scoreDemand` refuses area evidence; scoring demand component unavailable |
| Schools as context, not a score | IMPLEMENTED | `buyerMatchEngine.js` `scoreSchools`; BUY decision NOT_ASSESSED |
| Leasehold known / unknown / not applicable | IMPLEMENTED | `leaseholdTruth.js` |
| Growth defaults withheld | IMPLEMENTED on presented metrics | `presentationSafety.js` |
| LLM number and claim guard | PARTIAL | `llmOutputGuard.js` on explanation, listing copy, match polish |
| Flood, planning, listed, conservation, Article 4 | PARTIAL | Live domain envelopes; not scored |
| Legal title completeness | PARTIAL | `legalTitleDomain.js` |
| Energy certificate attachment | PARTIAL | MHCLG EPB path; coverage limited in the recorded audit |
| What-if | PARTIAL | Saved snapshot; scenario ≠ fact |
| Historical analysis snapshots | IMPLEMENTED as insert-only | Cited in `implementation-status.md`; not re-audited line by line here |
| Postcode map pin | PARTIAL | `PropertyView.js` Leaflet + Nominatim |
| User income affordability | MISSING | `buyDecision.js` |
| Achieved-rent yield | PARTIAL | Selection does not promote achieved rent unless it is the chosen input |
| SDLT / FTB tax | MISSING | No rules engine |
| Lender products | MISSING | Sprift and Hometrack stubs |
| City growth comparison | MISSING | |
| Relationship engine | DEFERRED | Not present as a runtime engine |
| Development feasibility | STUB | `developmentDomain.js` not in `LIVE_DOMAIN_ORDER` |

---

## 20. Missing capability matrix

| Gap | Decision it would change | Why it is not filled by a prompt |
| --- | --- | --- |
| Income, commitments, employment | Whether this person can complete and hold the purchase | Must be the user’s data, stored and replayable |
| Achieved rent | Net yield and cash flow versus asking-rent yield | Needs a sourced letting, not a paragraph |
| Lease length and major works | Mortgageability and resale, without a fake lender rule | Needs the lease or an official extract |
| Service-charge history | Ongoing cost, not one brochure figure | Needs a series |
| Building safety | Whether the flat is lendable or saleable | Needs a subject document |
| SDLT and transaction costs | Cash to complete | Needs dated rules and a user FTB/additional-dwelling status |
| Same-capital cross-market run | London versus Birmingham versus Manchester | Needs the investigation run three times under one assumption set |
| Visible investigation on the client | Whether the user sees the truth object at all | The object already exists and is not rendered |
| Location hierarchy | So area evidence cannot be stored as a unit fact | Needs types, not a better prompt |
| Map evidence layers | Spatial questions | A pin is not a layer; the London fallback is a false location |

---

## 21. Provider and data dependency matrix

| Source | What it can support | Limit | If missing |
| --- | --- | --- | --- |
| Listing / user | Asking price, asking rent, beds, stated tenure, deposit, budget, rate | Assertion, not verification | Stay UNKNOWN |
| PropertyData (paid, default off) | UPRN match, area sold prices, £/sqft, area asking rents, area demand, sale AVM | Licensed area or AVM evidence. Not achieved rent. Not title. | Those overlays are not assessed. Do not backfill from a model. |
| Official Price Paid (local import) | Historical sales, England & Wales | Analyse does not download the file. Exact unit match needs UPRN or exact address. Postcode match is area context. | No subject history. Do not use a national average. |
| MHCLG EPB | EPC and some physical fields when a unique certificate matches | Not a survey. Token required. | Energy UNKNOWN |
| Environment Agency flood | Zones 2 and 3 for rivers and sea where coverage exists | Empty ≠ Zone 1. Not surface water completeness. | Not assessed |
| planning.data.gov.uk | Nearby applications, school locations, listed, conservation, Article 4 geometry | Proximity and membership tests only | Not assessed |
| Nominatim + OSM | Postcode centroid map | Not the unit. Failure currently draws London. | Show no map |
| Sprift, Hometrack | Nothing today | Adapters are not connected | Do not pretend |
| OpenAI | Wording, after the guard | Not a fact source | Template text |
| Private uploads | Legal-title completeness only | Upload ≠ verified. Production storage was unverified in the status doc. | Not a fact |

Realistic obtainability: official flood, planning, EPC-on-match, and Price Paid (if the import is maintained) are obtainable. Exact lease terms, Section 20, building safety, achieved rent, and lender criteria are not obtainable for most flats without the user or a paid specialist feed. The product must work with those gaps visible. It must not wait for a complete UK graph before it can refuse a false conclusion.

---

## 22. P0 / P1 / P2 roadmap

P0 means “required before this product is different from a portal plus a chatbot **for one dwelling the user already has**”. It does not mean “required before any code is written”. Most P0 items below are already PARTIAL on the server.

### P0 — one-subject decision dossier

1. Show the existing BUY evidence object and LET_INVEST investigation ahead of any fit label. The fit label stays, named as preference fit.
2. Show rent basis and the limitation string on every yield the user sees.
3. Keep UNKNOWN on lease, service charge, ground rent, achieved rent, income, and ongoing cost. Do not add estimates.
4. Capture, as user inputs only: objective (live-in or let), capital or deposit, and price. Do not infer income.
5. Identity state on the dossier: exact unit, area only, or unresolved. UPRN is not title.

### P1 — after one subject is honest on screen

1. Cash-to-complete once SDLT rules are implemented as dated, tested rules with FTB and additional-dwelling as **user-declared** status. Not in the blueprint implementation.
2. Cross-market comparison for a handful of **identified** candidates under one assumption set.
3. Location hierarchy so area series cannot be written onto the unit.
4. Mortgage **constraints** that are evidenced (lease length unknown → cannot claim lendable). Still no product shelf until a licensed source exists.
5. Service-charge and major-works capture from a document the user supplies, still unverified until a professional checks it.

### P2 — expansion

1. Map zoom with evidence layers, after the London fallback is removed.
2. City growth charts for questions like eight-city history, labelled history.
3. Neighbourhood amenity coverage.
4. Portfolio.

### DEFERRED

- Relationship engine implementation.
- Developer reputation.
- School quality and catchment eligibility.
- Guaranteed growth, regeneration uplift, demand scores from area indices.
- Commercial, land, agricultural, development feasibility.
- Live lender products from generic model knowledge.
- Rewriting financial formulas.
- A UK property search index.

---

## 23. Generic-LLM replacement test

| Capability | Could ChatGPT or Claude give essentially the same value today? | What would make it harder to replace |
| --- | --- | --- |
| Explaining what a leasehold is | Yes | Nothing. Do not build a glossary product. |
| A checklist for “should I buy this flat?” | Yes, as generic advice | A checklist that is **filled** from retrieved evidence for this UPRN, with gaps left open, and replayable next month |
| Yield from numbers the user pasted | Yes | Stored basis (asking versus achieved versus area), withheld NOI, and an audit of inputs |
| Area flood, schools, planning | Partly. The model may browse or may confabulate. | A retrieved geometry result with source, distance, and “not this building” |
| “Strong fit” 0–100 | Yes. A model will happily score. | The score is not the product. The refusal to score is. |
| City growth comparison | Yes, at essay quality, often with invented precision | A sourced series, same dates, history ≠ forecast |
| £70k London vs Birmingham vs Manchester | Yes, as an essay | Three investigation runs, same capital, rent bases not mixed, missing lease shown on the London flat only |
| Personal affordability | Only if the user pastes income into the chat | A private, replayable financial context the model does not get to invent |
| Map pin | Yes | Evidence layers. A pin is not a moat. |

No capability in the current client is, by itself, something a general LLM cannot approximate in prose. The server’s refusal rules are harder to approximate **if the user can see them tied to retrieved rows**. They are invisible today.

---

## 24. Differentiation and defensibility

**Intended difference:** the product knows what is known, where it came from, how fresh it is, what is unknown, why it matters, how factors connect, which gap could change the decision, and how the conclusion moves for this user.

**What is actually hard to copy**

- A ledger of evidence with source, geography, time, and class, reused across jobs.
- Deterministic maths that will not run when inputs are missing.
- An investigation order based on decision impact for this user’s objective.
- The same assumption set applied to more than one subject without laundering area averages into subject facts.
- History of analyses that are not rewritten when the model prompt changes.

**What is easy to copy**

- Listing pages, postcode maps, EPC lookups, flood maps, “5 things to check on a leasehold”, and a written yield.
- Rightmove and Zoopla already have the inventory, the map, and the sold-nearby module.
- A general LLM already has the prose.

**Evidence, not optimism.** The repository’s defensible pieces are the gates in `evidencedInvestment.js`, `safeLtv.js`, `leaseholdTruth.js`, `areaMarketContext.js`, `llmOutputGuard.js`, and `buyDecision.js`. They do not yet form a moat, because the client does not present `buyDecision`, area demand is a paid overlay that is off by default, and the data underneath is mostly public or licensable. A competitor can license the same overlays. They cannot instantly copy a body of user-specific decision history that does not exist yet (`implementation-status.md` recorded outcome learning as no data). That history is a future moat only if investigations are stored and users return. It is not a moat now.

---

## 25. Explicit MVP non-goals

- Another UK listing search.
- A neighbourhood score or “best place to buy”.
- A mortgage supermarket.
- SDLT implementation inside this blueprint phase.
- School league tables, catchment, or price impact.
- Building or developer ratings.
- Relationship engine.
- Map redesign.
- Cross-city recommendation as a default answer.
- Income affordability invented from the asking price.
- Treating preference fit as a buy recommendation.
- Commercial, land, development appraisal.
- New providers, new tables, new financial formulas.

---

## 26. Acceptance criteria for the next phase

The next phase, if approved, is **presentation of the existing one-subject investigation**. It is not the Relationship Engine, not a new data model, and not a UK map.

Accepted only if all of the following are true:

1. A BUY report shows `buyRecommendation` as not available, lists the UNKNOWN affordability and housing-cost items, and does not lead with “Strong fit” as the decision.
2. A LET_INVEST report shows the canonical rent basis and the limitation in the same view as the yield percentage.
3. Unknown service charge, ground rent, and lease years are not displayed as zero, “normal”, or “mortgageable”.
4. Area demand is not displayed as tenant demand or a let probability.
5. Schools, where shown, have no admission, quality, or price-impact claim.
6. No new provider, migration, formula, or relationship engine is added.
7. A failed postcode map is not required to be fixed in that phase. If anyone touches the map, the London coordinate fallback must not remain. Leaving the map untouched is acceptable.
8. Tests cover the client (or the API contract the client renders) so a fit label cannot be the only decision string on BUY.

Rejected if the phase adds city comparison, SDLT, lender products, or a new score.

---

## Red team

**Are we building too much?**  
Yes, if the roadmap is read as one build. The capability universe is a map of questions, not a sprint. The user who says “I have £70,000” is describing the destination. The repository cannot answer that question honestly. Building the destination first would force area averages into a recommendation.

**Are we becoming another property portal?**  
The listing page, gallery, and postcode map already are portal surfaces. Decision intelligence is a second product living beside them. If the next phase adds search, maps, and city ranks, the portal wins and the decision layer stays a caption.

**Are we just adding AI to existing property data?**  
That is the accurate description of the client today. The server has started to do the opposite: block the model from inventing the data. Those blocks are the product. Narration is not.

**Are we depending on data we cannot get?**  
Lease terms, Section 20, building safety, achieved rent, and live lender criteria will be missing for most flats. Flood, planning geometry, EPC-on-match, and Price Paid are realistic. The design matches that split only if missing legal and rent facts stay on the critical path as UNKNOWN. It does not match if the UI shows a yield and a fit score anyway.

**Are we confusing property evidence with area evidence?**  
The server now labels area demand and area asking rent. The risk remains anywhere a postcode series is stored on the property object and a later screen drops the label. Cross-market comparison will revive this confusion unless area illustrations are a different type from dwellings.

**Historical growth versus future growth?**  
Presented future value is withheld when appreciation is the application default. There is still no sourced growth series. Any city chart that does not say “history” will reintroduce the confusion.

**Asking rent versus achieved rent?**  
The basis enum exists. Achieved rent is not silently inserted. The client’s economic label still special-cases an older market-rent basis. Until the limitation is on screen, users will read one yield.

**Schools versus admission?**  
The score is null. The temptation is to show nearby schools because the points exist. Distance is allowed. Eligibility is not.

**False precision?**  
Fit thresholds (80 / 65 / 50), a yield to one decimal from area asking rent, and a map pin at a postcode centroid are all more precise than the evidence. The London fallback is false precision of place.

**Which capabilities change a decision?**  
For one flat: identity of the unit, price versus sold evidence, tenure and lease, service charge, whether the user can fund completion, and (for a let) achieved or honestly labelled rent versus costs and debt. Schools, restaurants, and city narratives rarely change a yes/no once those are known. They change browsing.

**Which would a user pay for?**  
A paid user is paying to avoid a bad purchase: the dossier that says “do not decide yet” and names the three missing facts, or the comparison of two specific flats under one deposit. They will not pay for a checklist they can get from a chatbot, or for a map Rightmove already has.

**What can Rightmove, Zoopla, or a general LLM replicate easily?**  
Listings, photo galleries, postcode maps, nearby sold prices, EPC links, flood links, and a fluent “risks to consider” essay.

**What is genuinely difficult?**  
A system that refuses to conclude, keeps the refusal stable when the model changes, and repeats it for this user’s capital across more than one subject. Difficult is not the same as done.

**Strongest argument that there is no moat**  
The evidence is public or licensable. The maths is standard. The prose is what every LLM sells. The only proprietary objects (`buyDecision`, investigation order, rent-basis limits) are not what the user sees. Nothing stops a portal from adding a “check these gaps” panel, or a user from pasting a listing into a chatbot. There is no outcome history to learn from. Therefore there is no defensibility today.

**Response, from the code rather than from hope**  
The argument is right about the present product. It is wrong only if “moat” is allowed to mean “rules we have already written but not shown”. Those rules are real: missing costs do not become zero, area demand does not become tenant demand, LTV does not run without a deposit, the model is not allowed to invent a valuation report. A portal panel that does not enforce them will drift back into false precision, because false precision converts better. That is a wedge, not a moat. The wedge becomes a moat only after three conditions exist: the rules are what the user sees, the same rules are applied to every later subject, and the stored investigations are specific to users over time. None of the three is a reason to build eight-city analytics first. The first condition is the entire next phase.

---

## Final report

### Verified facts

- BUY evidence is assembled in `propertyIntelligenceEngine.js` via `assembleBuyDecision`. Recommendation is null. Client code does not reference `buyDecision`.
- Preference fit is a separate score. Landlord DI is not a buy decision.
- Rent bases are distinguished in `financeInputContract.js`. Achieved rent is not forced into the yield.
- LTV requires an explicit price and deposit (`safeLtv.js`).
- Missing operating costs withhold NOI, net yield, cash flow, and DSCR on the presented path.
- Area `/demand` is context and is not the landlord demand score.
- Schools are not scored. Catchment and quality are not assessed.
- Leasehold gaps are investigation items. No lender threshold is applied.
- `composeLiveDomains.js` does not include the development domain.
- `PropertyView.js` geocodes a postcode and, on failure, centres the map on 51.505, -0.09.
- Sprift and Hometrack are not live evidence sources.
- PropertyData acquisition is policy-gated and off unless enabled.

### Assumptions

- The next reviewer wants a residential consumer decision, not a portal roadmap.
- Users will tolerate “not enough evidence” if the missing items are specific.
- Official Price Paid remains available as a local import. This pass did not re-count rows.
- A one-subject dossier is a product someone can understand without a UK search.

### Unknowns

- Whether current users treat “Strong fit” as a buy recommendation. No session evidence in this pass.
- Live coverage of UPRN, SAON, EPB, and private legal documents. Figures in `implementation-status.md` were not re-measured.
- Whether a licensed achieved-rent or lease feed exists at a price the product can pay. Not investigated.
- Whether the London map fallback has shipped to real users. The code path exists.

### Current capabilities

Server-side evidence labelling for yield, LTV, leasehold, area demand, schools, BUY unknowns, and LLM output guards. Preference fit. Residential valuation and rent only when gates and keys allow. Official and open environmental and planning context. A postcode map.

### Missing capabilities

Income affordability, SDLT, lender products, achieved-rent series, lease and major-works facts for most homes, location hierarchy, cross-market comparison, relationship engine, client rendering of the BUY dossier, safe map behaviour.

### P0 capabilities

Visible one-subject investigation for BUY and LET_INVEST, using objects the server already builds. User objective and explicit capital. Identity honesty. No new facts.

### Deferred capabilities

Relationship engine, reputation scores, school quality, growth forecasts, commercial and development appraisal, UK search, map intelligence, lender shelf.

### Strongest counterargument

There is no moat. Public data, standard maths, and LLM prose already cover the user-visible product. The safety objects are invisible.

### Recommended MVP boundary

**One identified residential dwelling, one job (live-in or let), one evidence dossier that leads with unknowns and labelled numbers.**

Not “where in the UK should I buy with £70,000”. That question stays a P1 comparison of identified candidates after the dossier is visible. Answering it now would require the product to invent rent, tax, and lease facts the blueprint forbids.

### Differentiation

Refusal, provenance, and replay — once they are on screen and tied to retrieved evidence. Not the map, not the score, not the essay.

### Confidence

Medium. The code evidence for “server is ahead of the screen” is direct. The judgement that one-subject honesty beats city comparison is a product judgement. It would be wrong if users only arrive with “where should I buy” and leave when the product asks them to pick a flat.

### What evidence would change the recommendation

- Session evidence that users already understand the fit label and ignore it. Then the P0 UI change is less urgent than a new input (income or lease upload).
- Evidence that `buyDecision` is already rendered on a branch this pass did not open. Then P0 shifts to the next real gap (cash to complete or achieved rent), still not the relationship engine.
- A sourced, affordable achieved-rent and lease feed. Then LET_INVEST can move from “labelled asking yield” to a real investment conclusion, and cross-market comparison moves up.
- Evidence that the business will only distribute through a UK search box. Then this MVP boundary is the wrong company, and the honest conclusion is that the portal incumbents win.

### Acceptance criteria

Section 26. Next phase shows the existing investigation, adds no engine, and stops for review.

---

**Stop.** Do not start the Relationship Engine. Do not implement features. Do not redesign the UI. This blueprint waits for independent review.
