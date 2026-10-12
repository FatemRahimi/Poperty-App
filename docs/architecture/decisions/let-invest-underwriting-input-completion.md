# Decision: LET_INVEST underwriting input completion

**Status:** IMPLEMENTED  
**Date:** 2026-09-01  
**Contract:** `let-invest-underwriting-input-1.0.0`

## Scope

Progressive completion of **legitimate user finance / operating inputs** for the residential `LET_INVEST` Decision Workspace. Uses frozen `financeInputContract`, `financialEngine`, landlord Personal Decision, and DI V1.

Does **not** change valuation methodology, assessment-safety, or treat asking price as valuation.

## Dependency map (canonical)

| Input | Section | Unlocks (when requirements met) |
| --- | --- | --- |
| `purchasePrice` | Property & rent | Gross yield |
| `expectedRent` | Property & rent | Gross yield, NOI, net yield, cash flow, DSCR |
| `vacancyAssumption` + operating costs | Operating assumptions | NOI, net yield, cash flow, DSCR, PD dimensions |
| `deposit`, `interestRate`, `mortgageTermYears` | Financing | Cash flow, DSCR |

Operating cost keys: `maintenance`, `insurance`, `managementFee`, `serviceCharge`, `groundRent`, `taxes`, `vacancyAssumption`.

## Semantics

- `MISSING` ≠ `EXPLICIT_ZERO` (finance-semantic-1.0.0)
- User inputs are `USER_INPUT` — not property facts or official evidence
- Rent basis (`LISTING` / `MARKET` / `SCENARIO`) disclosed on workspace; area rent is not achieved rent

## Workspace behaviour

- `missingUnderwritingInputs` lists actionable user-input gaps with unlock targets
- Platform valuation gaps are labelled `MISSING_PLATFORM_EVIDENCE` — not finance form actions
- Unresolved items link to finance form fields via `onFocusUnderwritingInput`
- Recalculate analysis after input changes (existing analyse flow)

## What-if

Canonical inputs and What-if scenarios remain separate. What-if does not overwrite saved analysis.

## Remaining blocker

Property-specific **valuation** remains a platform-evidence gap independent of finance input completion.
