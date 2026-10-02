# Validation of LLM-classified fields (step 1.4)

Method: a random sample is labelled independently by a stronger model using the same instructions; agreement between
the two is used as a proxy for accuracy. Scripts: `scripts/enrichment/05_audit_labels.py`, `06_audit_people.py`.
The plan's bar was about 90%.

## Per-role labels (300 distinct title x industry pairs, auditor: Claude Sonnet)

| Field | First attempt | After relabelling |
|---|---|---|
| is_founder | 100% | 99% |
| is_founding_team | 100% | 99% |
| is_investing_role | 94% | 99% |
| role_type (internship, full-time, board, ...) | 87% | 94% |
| seniority | 70% | 87% |
| function | 76% | 77% |

The first attempt returned positional arrays in batches of 40 and produced misplaced values (for example 582
intern-titled roles labelled full-time). The relabel uses named fields, makes the model echo each title, rejects rows
with a wrong title or an invalid value, and applies a deterministic internship rule.

Investor type (VC vs PE vs growth, ...) is decided per firm, not per title, because LinkedIn uses one industry label
for both VC and PE. 1,333 firms were classified; current investors now split 157 VC / 46 PE / 25 growth equity /
21 hedge fund / 10 angel / 50 other (the title-only version said 150 PE / 61 VC, which was clearly wrong).

## Per-person labels (80 people, auditor: gpt-4.1)

| Field | Agreement |
|---|---|
| military_veteran | 100% |
| technical_background | 94% |
| pre_hbs_archetype | 79% |
| post_hbs_path | 76% |
| sector_tags | 77% of our tags confirmed; 75% of the auditor's tags present |

## What this means

- **At or above the bar:** founder flags, investing-role flag, role type, technical background, military veteran.
- **Below the bar:** function (77%), seniority (87%), the two career archetypes (76-79%) and sector tags (~76%).
  Much of the disagreement is between adjacent categories on genuinely ambiguous titles (strategy vs general management,
  mid vs senior), so true error is lower than the disagreement rate, but these fields should be treated as approximate.
- **How search uses them, given that:**
  - Sector tags are never a hard filter. They only add words to the profile document used for keyword and semantic
    matching, and feed aggregate views in the Explore agent.
  - The query translator is told to prefer job-title keywords over `function` whenever the query names a role.
  - Archetypes and seniority are only used as filters when a query asks for them explicitly.
- **Possible follow-up:** relabel function, seniority, archetypes and sector tags with a stronger model. Estimated at a
  few dollars of API spend; not done because of the budget ceiling.

Known data limitation carried from the plan: company size is today's size, not the size when the person joined.
