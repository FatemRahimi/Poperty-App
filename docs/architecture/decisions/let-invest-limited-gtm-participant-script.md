# LET_INVEST Limited GTM — Facilitator Participant Script

Use with `let-invest-limited-gtm-validation.md`.  
Do **not** coach toward a positive product outcome. Do **not** complete underwriting for the participant.

Session budget: ~45–60 minutes.

---

## 0. Consent & framing (2 min)

- This is a **product validation**, not a sales demo.
- We want honest friction and confusion.
- Property need not be owned; must be a real residential investment they are considering or willing to underwrite honestly.
- No scraping portal pages into the product during the session.
- Outputs are decision support — not a valuation, mortgage offer, or guaranteed rent.

Record: `participant_id`, date, facilitator, `participant_type` (landlord / BTL investor / other), years investing (optional band).

---

## 1. Pre-session profile (3 min)

Ask:

1. How do you normally underwrite a BTL deal today?
2. What would make you walk away from a deal quickly?
3. Are you evaluating a property you already have facts for (asking price, expected rent, address)?

Exclude if no rental-investment intent.

---

## 2. Operating model — bring a property (5–10 min)

Guide to a **legitimate** path only:

| Prefer | Action |
| --- | --- |
| Own listing on platform | Open Property Intelligence → select property |
| Real subject they are considering | Create/edit listing with facts they already possess; mark assumptions clearly when unknown |
| Practice inventory (last resort) | Use provisioned subject; participant still supplies **their** underwriting assumptions |

Record: `property_path` = A_OWN_LISTING | B_SELF_ENTERED | C_PRACTICE_INVENTORY  
Record: listing type (sale / rent), whether price and rent were listing vs user input.

If they cannot proceed without scrape/fabrication → stop; mark **OPERATING_MODEL_BLOCKER**.

---

## 3. Task statement (read aloud)

> Evaluate this residential property as a potential rental investment using the product.  
> Choose **Let / Invest**. Use your own assumptions where the product asks for them.  
> Think aloud when something is unclear. I will not fill the form for you.

Start timer. Mark `STARTED_ANALYSIS` when they begin the LET_INVEST job (or first analyse attempt).

---

## 4. Observe (silent / clarifying only)

Watch for:

- Decision job selection
- Rent basis appearance (LISTING / MARKET / SCENARIO)
- Purchase / asking price source
- First analyse → gross yield
- Finance form engagement
- Re-analyse after inputs
- NOI / cash flow / DSCR unlock
- Landlord PD / DI attention
- What-if use
- Next-action / unresolved gap attention

Clarifying questions allowed: “What are you looking for?” “What does that number mean to you?”  
Forbidden: “You should fill vacancy next” / explaining MARKET rent **before** the comprehension probe.

After each analyse run, note analysis id if visible; later run classifier:

`node server/scripts/classify-let-invest-gtm-funnel.js --analysis-id <id>`

---

## 5. Comprehension probes (after they have seen a report; before teaching)

Ask in your own words; score PASS / FAIL / PARTIAL:

1. **MARKET rent:** “If the product shows a market/area rent figure, what does that mean for *this* property?”
2. **Price:** “Is the purchase/asking figure the product’s assessed fair value?”
3. **Costs / mortgage:** “Are those numbers facts about the property or your assumptions?”
4. **What-if:** “If you change a What-if slider, does that rewrite the saved property intelligence?”
5. **Gross yield:** “Does a gross yield alone mean the deal is fully underwritten?”
6. **NOT_ASSESSED / unavailable:** “If something is not assessed, does that mean it is zero or safe?”

If MARKET path: probe #1 is mandatory **before** any correction.

Then briefly correct misunderstandings (product truth), without redesigning the UI mid-session.

---

## 6. Input-burden pass (if they engaged the form)

For each relevant field they touched or skipped, mark one code:

`DONT_KNOW_YET` | `DONT_UNDERSTAND` | `TOO_MUCH_EFFORT` | `PLATFORM_SHOULD_KNOW` | `OK`

List: expected rent, vacancy, maintenance, insurance, management, service charge, ground rent, taxes, deposit, mortgage amount, interest rate, mortgage term.

---

## 7. Output value pass

For each output they saw, mark:

`HIGH_VALUE` | `UNDERSTOOD_LOW_VALUE` | `IGNORED` | `CONFUSING` | `MISLEADING`

List: gross yield, NOI, net yield, cash flow, DSCR, Landlord PD, DI findings, unresolved dependencies, investigation priorities, sensitivity, What-if.

---

## 8. Decision-value debrief

For each, YES / NO / UNSURE + one concrete sentence:

- Save time?
- Avoid an expensive mistake?
- Identify a question to investigate?
- Understand financial sensitivity?
- Compare assumptions?
- Change or confirm a next action? (what action?)

---

## 9. Return-use

1. Interest? (Y/N)
2. Would you use this workflow on another property in the next month? (INTENT Y/N)
3. Why / why not?
4. Biggest single blocker today?

---

## 10. Funnel checkpoint (facilitator)

Tick farthest stage reached and first abandonment stage if any:

- STARTED_ANALYSIS
- RENT_BASIS_AVAILABLE
- PURCHASE_PRICE_AVAILABLE
- GROSS_YIELD_REACHED
- UNDERWRITING_STARTED
- OPERATING_INPUTS_COMPLETE
- FINANCE_INPUTS_COMPLETE
- NOI_ASSESSED
- CASHFLOW_ASSESSED
- DSCR_ASSESSED
- LANDLORD_PD_ASSESSED
- WHAT_IF_USED
- ANALYSIS_COMPLETED (debrief finished)

Abandonment reason (free text + one of): rent_confidence | cost_burden | financing_burden | fact_vs_assumption_unclear | weak_value_before_complete | too_much_not_assessed | unclear_next_action | operating_model | other

---

## 11. Close

Thank them. Do not promise features. Transfer notes into `let-invest-limited-gtm-results-template.json` (one object per participant).
