# Decision: Product intelligence and decision architecture

**Status:** REVIEWED  
**Date:** 2026-09-01  
**Phase:** V1.2 product-intelligence checkpoint (no implementation)

This records the review finding. It is not a new engine, provider, or domain foundation.

## Finding

The platform has substantial **evidence and residential analysis** infrastructure. It does not yet produce **decision intelligence as a product**.

Canonical analyse (`propertyIntelligenceEngine`) always scores **landlord** Personal Decision. The report UX is a domain-evidence dump with landlord-fit on top. User job (buy / sell / hold / let / develop) is not captured.

Evidence aggregation (EPC + flood + planning + transactions) is not sufficient by itself.

## What is defensible today

Residential only: sale AVM blend with assessment-safety gates, rent recommendation, asking-vs-value price position, BTL finance math when inputs are complete, landlord Personal Decision, Decision Intelligence V1 findings over assessed BTL metrics, What-if on frozen snapshots, planning/flood/EPB as provenance-labelled evidence.

Non-residential valuation, lease/ERV, development feasibility, professional building condition, and title quality remain correctly `NOT_ASSESSED` or unwired.

## Next capability (do not auto-start)

**Residential decision workspace:** capture user job and present existing assessed intelligence as a decision pack (key outputs, unresolved dependencies, next actions). Evidence remains secondary. No new API, no new methodology family, no empty domain, no bounded EPB re-acquisition in this step.

Bounded EPB re-acquisition remains a later coverage job after users actually declare SAON. It is not the product bottleneck (inventory still 0 canonical SAON).

## Freeze observed

No valuation, finance, PD, DI, HMLR, EPB matcher, commercial, development, project-cost, ML, or Phase 9.3 implementation in this review.
