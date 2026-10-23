# Property App — Product Decisions

Last updated: 2026-10-23
Branch context: `temp-branch`

This file records durable product and architecture decisions and, importantly, why they were made. It is not a feature backlog. Code remains the implementation truth; `docs/PROJECT_MASTER_STATE.md` records current roadmap/status.

## Decision 001 — Build Decision Intelligence, Not a Property Chatbot

**Decision**

Property App is a UK Property Decision Intelligence Platform. AI chat is an interface to the intelligence system, not the product itself.

**Why**

A general chatbot can already answer broad property questions. The product must provide durable value through structured real data, calculations, evidence provenance, uncertainty, investigation, relationships, comparison and decision state.

**Consequence**

Do not redesign the product around a standalone chat box. AI output must remain grounded in supported evidence and deterministic calculations.

---

## Decision 002 — Frontend Model: Guided Tools + Automatic Intelligence + Embedded AI

**Decision**

The target UX is:

`Guided Tools + Automatic Intelligence + Embedded AI Copilot`

The frontend should be primarily an interactive tool/workspace, with AI available contextually inside the tools.

**Why**

Many users do not know which property questions to ask or which evidence to search for. Requiring property expertise before the product becomes useful defeats the purpose of decision intelligence.

**Consequence**

Users should be able to start with simple goals and constraints. The system determines which analysis tools and evidence are required. Expert users can enter tools directly. Users who do not know where to begin can use conversational input, but the conversation should orchestrate the same underlying tools rather than create a separate truth path.

---

## Decision 003 — Three Primary User Journeys

**Decision**

The top-level frontend journeys are:

1. Buy a Home
2. Invest in Property
3. Property Professional

**Why**

These journeys share the same evidence infrastructure but have materially different objectives, constraints and decision questions.

**Consequence**

Avoid a single generic property dashboard that mixes homeowner, BTL and professional conclusions without context.

---

## Decision 004 — Evidence Before AI

**Decision**

Core architecture follows:

`Source → API/download/import/user input → validation/storage → analytics → structured evidence → decision logic → AI explanation`

**Why**

An API is transport, not evidence. An LLM is not a source of property truth. Reliable decisions require traceable observations and calculations before natural-language interpretation.

**Consequence**

AI cannot fill missing evidence. Every material evidence item should eventually be capable of carrying source/provenance, geography, period/date, coverage, calculation method where derived, sufficiency and limitations as appropriate.

---

## Decision 005 — Uncertainty Is First-Class Product Data

**Decision**

Unknown, insufficient, ambiguous and unavailable evidence must remain explicit states.

**Why**

Property decisions frequently depend on evidence that is missing, stale, weak or unresolved. Hiding uncertainty produces false confidence.

**Consequence**

Do not silently convert missing values to zero. Do not convert unavailable evidence to negative evidence. The product should surface Unknowns and Investigate Next alongside positive and negative evidence.

---

## Decision 006 — Separate Evidence Types

**Decision**

The system must distinguish at least:

- FACT
- DERIVED ANALYSIS
- INFERENCE / FORECAST
- UNKNOWN
- COUNTER-EVIDENCE
- INVESTIGATE NEXT

**Why**

Observed data, calculated statistics and uncertain future theses have different epistemic strength.

**Consequence**

Historical price growth is not a promise of future growth. A median is not a raw official observation. A comparable sale is market context and not automatically a valuation. Preference fit is not a purchase recommendation.

---

## Decision 007 — Preserve the Existing Exact-Property Intelligence Layer

**Decision**

Existing exact-property decision capabilities are strategic assets and should be extended, not replaced.

**Why**

The existing chain already supports important evidence boundaries, BUY/LET decision logic, decision dossiers, investigation, relationships and comparison behavior.

**Consequence**

Later UK market, area, planning, BTL and opportunity-discovery work should drill into and enrich the existing exact-property layer rather than rebuild it.

---

## Decision 008 — Opportunity Discovery Is a Strategic Differentiator

**Decision**

The eventual product should be capable of starting from a user's strategy rather than requiring the user to arrive with a property already selected.

Conceptual flow:

`Strategy → Discover Opportunities → Evidence → Counter-evidence → Unknowns → Investigation → Relationships → Development/Property → Financial Consequences → Decision Dossier`

**Why**

Simple listings, price charts, gross yield calculators and generic AI answers are increasingly commodity capabilities.

**Consequence**

Opportunity Discovery must be built only after adequate market, geography, economic, planning, rental and evidence infrastructure exists. It must not rank areas using invented or incomplete evidence.

---

## Decision 009 — No Automatic Purchase Winner Without Sufficient Decision Evidence

**Decision**

Comparison and decision tools must not manufacture a winner merely because two properties or areas can be numerically compared.

**Why**

Cheaper asking price does not necessarily mean better value; more unknowns do not automatically mean a worse property; stronger sold context does not equal a valuation.

**Consequence**

Comparison may expose differences, evidence strength, uncertainty and tradeoffs while withholding a winner when decision evidence is insufficient.

---

## Decision 010 — Buyer Tax and EPC/Energy Are Explicit Evidence Domains

**Decision**

The mature home-buyer journey explicitly includes:

- Purchase Costs & Tax Intelligence, including SDLT and applicable buyer-status rules;
- Property Condition & Energy Intelligence, including EPC/energy evidence.

**Why**

These materially affect the real purchase decision and must not be treated as optional afterthoughts.

**Consequence**

Tax must be calculated from current applicable rules and buyer/property context rather than stored as a timeless static assumption. EPC/energy evidence must retain source/date/limitations. A Buyer Evidence Coverage Audit is required before the First-Time Buyer phase is considered complete.

---

## Decision 011 — Product Must Help Users Who Do Not Know What to Search

**Decision**

The system should convert plain user goals into an evidence-backed investigation workflow.

Example input categories include budget, salary, deposit, intended use, current living/work location, ownership preferences, bedroom needs, risk tolerance, investment horizon and growth-vs-income preference.

**Why**

A non-expert user may not know to ask about lease length, service charge, SDLT, evidence sufficiency, planning pipeline, achieved rent quality or market coverage.

**Consequence**

Guided journeys should automatically expose relevant tools, risks, unknowns and next investigations rather than relying on user search knowledge.

---

## Decision 012 — Chat Can Orchestrate Tools, But Must Use the Same Truth Path

**Decision**

A conversational request may trigger multiple tools, but the result must be rendered from the same evidence and decision system used by direct tool interaction.

**Why**

Otherwise the product would develop two conflicting truth systems: deterministic tools and free-form chat.

**Consequence**

Future AI orchestration may invoke affordability, tax, location discovery, market analysis, area comparison, property intelligence, risk and financial tools. The AI should explain their outputs, not independently recreate unsupported answers.

---

## Decision 013 — Evidence Drawer / Explainability Is a Signature UX Direction

**Decision**

Important metrics and conclusions should be inspectable in the frontend.

Where relevant, users should be able to see fields such as source, geography, period/date, coverage, calculation method, sufficiency and limitations.

**Why**

The product's value is not only the number or conclusion; it is the ability to understand why the system believes it and where its limits are.

**Consequence**

Frontend design should reserve a consistent evidence-detail interaction rather than burying provenance in developer logs or long AI prose.

---

## Decision 014 — Do Not Compete on “AI Is Smarter”

**Decision**

AI model capability alone is not the moat.

**Why**

General AI systems and property incumbents will continue improving. A defensible product needs accumulated structured evidence, data infrastructure, state, investigation and decision workflows.

**Consequence**

When evaluating a feature, prefer capabilities that strengthen the evidence/decision system over cosmetic AI functionality.

---

## Decision 015 — Roadmap Stability

**Decision**

The accepted roadmap should not be casually changed in response to each new idea.

**Why**

Frequent roadmap changes create duplicated architecture and unfinished foundations.

**Consequence**

Any material change must be explicitly labelled `PROPOSED ROADMAP CHANGE` and include evidence, impact, counterargument and tradeoff before acceptance.

---

## Decision 016 — Documentation and Code Have Different Roles

**Decision**

Use three durable sources:

- GitHub code/commits = implementation truth;
- `docs/PROJECT_MASTER_STATE.md` = roadmap/status handoff;
- `docs/PRODUCT_DECISIONS.md` = durable product/architecture reasoning.

**Why**

Long ChatGPT conversations are not a reliable project database, and raw conversation transcripts contain obsolete ideas and noise.

**Consequence**

New conversations should recover project state from these files and independently verify relevant code/commits. Chat memory may assist continuity but must not be the sole project source of truth.

---

## Decision 017 — National official bulk datasets are content-addressed artifacts

**Decision**

A national official bulk dataset is imported only as an immutable, content-addressed artifact with provenance. Evidence consumption uses that artifact and the existing parser and atomic importer. The same URL is not treated as the same content. Retrieval metadata is not site chronology.

**Why**

The Planning Data brownfield-land bulk files are regenerated objects behind CloudFront and S3. `Last-Modified` and `ETag` describe the HTTP object, not a site's entry-date and not an official release number. A later download must not erase or silently replace an earlier artifact, and a failed import must not look like an absence of Brownfield land.

**Consequence**

Do not stream live rows from HTTP straight into the database. Do not commit the national artifact to Git. Do not run a national import against `propertydb` or any other non-disposable database. Do not treat an artifact row count as a complete England site census, and do not use artifact download time to choose the effective site revision.

