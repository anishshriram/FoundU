# FoundU — Changelog

All notable changes to the FoundU codebase are documented here.
Format: `[VERSION] — YYYY-MM-DD — Author — Description`
Status labels: `added` | `changed` | `fixed` | `removed` | `decision` | `tbd-resolved`

---

## How to Use This File

- Every coding session that produces a commit should add an entry here
- Every TBD item that gets resolved must be logged under `tbd-resolved` with the value chosen and the reason
- Every architectural decision that isn't in the spec must be logged under `decision`
- This file is the paper trail for why the codebase looks the way it does

---

## [Unreleased]

> Work completed but not yet assigned a version number. Move entries to a versioned block on each milestone.

---

## [0.2.0] — 2026-05-01 — Implementation Plan

### added
- `FOUNDU_IMPLEMENTATION_PLAN.md` — full milestone-by-milestone build sequence covering Pre-Development Blockers through Milestone 12 (Launch). Includes deliverables, exit criteria, build dependency order, and a TBD confirmation checklist keyed to launch.

### changed
- `FOUNDU_CONTEXT.md` — added "Related files" block linking to implementation plan, changelog, and spec. Bumped version to 0.2.0.

### decision
- ADR-002: Implementation follows a strict milestone dependency order (schema → auth → profile → matching → proximity → signals → safety → notifications/venues → mobile → staging → launch). No milestone begins until the previous one's exit criteria are met. See `FOUNDU_IMPLEMENTATION_PLAN.md` for full sequence.

---

## [0.1.0] — 2026-05-01 — Initial

### added
- `FOUNDU_CONTEXT.md` — agent context file created from Software Documentation V0.0
- `CHANGELOG.md` — this file

### decision
- Placeholder values assigned to all TBD items for MVP development. Every instance flagged with `// TODO: TBD — confirm value before launch`. See Open Items table in FOUNDU_CONTEXT.md for full list of placeholders.

---

## TBD Resolution Log

> When a TBD item from the spec is officially decided, log it here with the value chosen and why. Remove the TODO comment from code once resolved.

| Item | Spec Ref | Placeholder Used | Resolved Value | Date Resolved | Reason |
|---|---|---|---|---|---|
| Match card expiry window | FR-4.7 | 45 min | — | — | — |
| Density threshold for auto-refresh | FR-4.4 | 10 users / 0.25mi | — | — | — |
| Behavioral score — suspension threshold | FR-8.5 | -50 | — | — | — |
| Behavioral score — ban threshold | FR-8.5 | -100 | — | — | — |
| Score delta — report_received | FR-8.5 | -15 | — | — | — |
| Score delta — block_received | FR-8.5 | -5 | — | — | — |
| Score delta — screenshot_detected | FR-8.5 | -20 | — | — | — |
| Score delta — passive_recovery | FR-8.5 | +2 per 24hrs | — | — | — |
| Match similarity threshold | Section 11 | 0.65 | — | — | — |
| Ice Breaker prompt list | A-3.2 | 10 placeholders | — | — | — |
| Home base update frequency limit | A-3.5 | Once per 30 days | — | — | — |
| SMS verification provider | C-4.4 | Stubbed | — | — | — |

---

## Architectural Decision Log

> Decisions made during development that are not explicitly specified in the Software Documentation. Each entry should explain what was decided and why, so future engineers understand the reasoning.

| # | Decision | Date | Reason |
|---|---|---|---|
| ADR-001 | Placeholder TBD values assigned — see table above | 2026-05-01 | Allows development to proceed without blocking on unresolved product decisions |
| ADR-002 | Strict milestone dependency order adopted | 2026-05-01 | Prevents building on unstable foundations; each milestone has defined exit criteria before the next begins |

---

## Version History

| Version | Date | Summary |
|---|---|---|
| 0.2.0 | 2026-05-01 | Implementation plan created — full milestone sequence through launch |
| 0.1.0 | 2026-05-01 | Project initialization — context and changelog files created |
