# Structured Fields Backlog

Fields considered on 2026-10-02 and deliberately NOT included in the initial set (see `MASTER_PLAN.md`, step 1.4). Revisit using real query logs (`search_logs`) as evidence of demand.

Selection criteria for promoting a field: how often users ask for it, how reliably it can be derived, and whether a wrong value would mislead.

## Needs external data
| Field | Notes |
|---|---|
| Company funding stage | Crunchbase/PitchBook-style source, or LLM with web lookup |
| Total funding raised | External |
| Notable investors (e.g. YC-backed) | External |
| Public vs private | External; could be approximated by LLM for well-known companies |
| Company founded year | External. Unlocks "company age when the person joined", which fixes the size-at-join limitation |
| Company age at join | Depends on founded year |
| Company outcome (active, acquired, shut down) | External |

## Too dependent on job descriptions (only 53% of roles have one)
| Field | Notes |
|---|---|
| Investor stage focus | LLM over descriptions / firm website |
| Investor sector focus | Same |
| Business model (B2B SaaS, marketplace, consumer, hardware, deep tech) | LLM guess is unreliable for unknown companies |
| Technologies worked with | Descriptions + skills |
| Customer segment | Descriptions |

## Lower value or redundant for now
| Field | Notes |
|---|---|
| Time to first executive role | Derivable from seniority + dates once those exist |
| Concurrent side roles | Derivable from overlapping dates |
| Founding-team titles | Largely covered by is_founder + early_employee |
| Relocated after HBS | Needs reliable pre-HBS location |
| LTV semester (fall/spring) | Not consistently in the data |
| Profile completeness (as a filter) | A richness score exists for ordering only |
| Data freshness date | Uniform today (single scrape) |
| Teaching / lecturer | LLM over roles |
| Nonprofit board service | LLM over roles |

## Dropped (not possible or out of scope)
| Field | Reason |
|---|---|
| LTV venture worked on in the course | No course records beyond the CSVs |
| Name lookup | Out of scope by decision |

## First to revisit
Company founded year (fixes size-at-join), investor focus, business model.
