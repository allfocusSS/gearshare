# GearShare

**Campus equipment lending, without double bookings.**

GearShare lets students reserve cameras, microphones, projectors and other shared equipment. A coordinator approves requests, checks equipment out and records its return. A calendar, booking state machine, transactional conflict protection and private audit history make this more than a CRUD catalogue.

Author: Zhaksylyk Turadil. Independent student project; no university integration is claimed.

## Current status

This is the **specification and development-process kit**, prepared before application code. The application has not been implemented, run or tested yet. MVP issues #1–20 and post-MVP #21–23 have been published; implementation/QA has not started. This kit alone is not a finished submission.

Repository: https://github.com/allfocusSS/gearshare. Access verified; specification and backlog publication are starting. StudyTrack remains the separate Part I project.

## Start here

1. Read [`_docs/brainstorming.md`](_docs/brainstorming.md) and [`_docs/plan.md`](_docs/plan.md).
2. Read [`_docs/architecture.md`](_docs/architecture.md) and [`_docs/design-system.md`](_docs/design-system.md).
3. Read the real [GitHub backlog](https://github.com/allfocusSS/gearshare/issues). `_docs/tasks.md` is now a historical mapping; GitHub Issues is the only active backlog.
4. Follow [`_docs/process.md`](_docs/process.md): PM → engineer → independent QA → correction loop → QA closes the issue.
5. Build in the assignment's exact order: mock frontend → `openapi.yml` → in-memory API → SQLite through ORM → integrated frontend.
6. Record actual commands, results, commits and bugs in [`_docs/evidence.md`](_docs/evidence.md). Do not replace planned checks with claims of passing tests.

## MVP

- Student registration and sign-in; coordinator role controlled by the server.
- Searchable equipment catalogue with date/category filters and per-item availability.
- Booking requests with transactional protection against overlapping days.
- Student reservation history and cancellation.
- Coordinator approval/rejection, checkout, return and maintenance controls.
- Condition notes, overdue indicators and a booking event history.
- SQLite persistence through SQLAlchemy, an explicit OpenAPI contract and automated/browser verification.

## Repository documents

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Entry point and agent instructions |
| `_docs/plan.md` | Product scope and business rules |
| `_docs/brainstorming.md` | Actual pre-code conversation and decision record |
| `_docs/architecture.md` | Options, decisions, entities and stages |
| `_docs/design-system.md` | Specific visual references and component rules |
| `_docs/tasks.md` | Draft backlog; superseded by GitHub issues on publication |
| `_docs/process.md` | Issue lifecycle and agent handoffs |
| `_docs/team/*.md` | PM, software engineer and independent QA roles |
| `_docs/testing-guidelines.md` | Verification strategy and regression cases |
| `_docs/submission-checklist.md` | Requirement-to-evidence mapping |

`openapi.yml`, application source, dependency locks, CI configuration, screenshots and test results are future deliverables. They are deliberately not fabricated in this planning kit.
