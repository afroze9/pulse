# Implementation status

Updated October 2, 2026. Two GPT-6.1 Sol agents implemented the frontend and backend in parallel; the coordinating agent reviewed the contract, fixed integration findings with them, and verified the combined application.

## MAUI desktop conversion

- Added a .NET MAUI 10 Windows desktop host with the existing Svelte UI bundled as local assets. HybridWebView messages call the shared C# core in-process; the desktop app does not launch an HTTP API or bind a localhost port.
- Extracted planning persistence and Jira integration into `core/Pulse.Core.csproj`; the optional browser API references the same core.
- Configuration now includes Jira URL, email and token, save/test/forget controls, with MAUI SecureStorage. Saved tokens are never returned to the frontend. Desktop credentials are entered once; development user secrets are not automatically migrated.
- Published a self-contained unpackaged Windows release to `artifacts/desktop`. Keep the folder together. Signed installers and automatic updates remain future work.
- Copied the existing portfolio into `%LOCALAPPDATA%\Pulse\workspace.json` without modifying the source workspace. Verified plans and scope match after native save/Undo testing.
- Verification: 32 frontend tests, 34 backend fixture checks, clean Svelte diagnostics and native build. Published executable launched successfully; portfolio loading, configuration, save, Undo and restart were checked in the native window.
- Windows encryption self-test passed: new store instance reload, encrypted file present, no plaintext token/account in stored data, and removal of the isolated test credential. The user's connection was not read or changed.
- Run/build and storage details: [desktop README](../desktop/README.md). Only Windows has been configured and verified; Mac/mobile targets are not included.

## Working locally

- Svelte UI with resource, project and roadmap views; sidebar navigation; project multiselect; configurable project/type/resource scope.
- Draw, move and resize plans; separate planned/actual dates; form alternatives for assignment, ownership, dates and milestones.
- ASP.NET Core 10 API with durable atomic JSON persistence, optimistic version checks, most-recent command retry handling, date/reference validation, and saved Undo snapshots.
- Saving/error/offline feedback. Failed drafts can be recovered or downloaded; concurrent edits produce a conflict with explicit discard or replace controls.
- Jira Cloud server-side API-token adapter with safe status, project and field discovery, enhanced JQL pagination, board/sprint calendars and rate-limit retries. Import is read-only and on demand. Local changes are preserved against the previous source baseline; conflicting source changes are flagged. Imports that would lose local proposals are rejected.
- Unknown estimates, unassigned/unscheduled stories, missing epic links and undated epics are surfaced rather than silently counted as complete plans. Roadmap quarters can be navigated.

Run and credential setup are in [the root README](../README.md) and [backend README](../server/README.md). A real Jira tenant has been connected: the saved import contains 2,379 tickets across four projects, with 51 dated sprints. No credentials are stored in frontend code.

## Verified

- Svelte diagnostics: zero errors and warnings; frontend production build passed.
- 32 frontend domain/session/transport tests passed, covering capacity, scheduling and failed/conflicting saves.
- 34 backend fixture checks passed, including persistence across store restart, concurrency, idempotency, mapping, paginated Jira responses, rate limiting and source/local conflict preservation.
- .NET build: zero warnings and errors.
- Isolated HTTP smoke passed save/reload reads, configuration, duplicate command replay, stale revision rejection, date validation, Undo and credential-free Jira status.
- Browser verification passed actual-date save/reload overlays, configuration persistence, server Undo, timeline resize persistence, and conflict handling across two browser sessions. The production preview data was not used for destructive smoke tests.

## Jira timeline follow-up

- Startup waits for the saved workspace; no sample data is displayed or seeded.
- Import discovers standard Sprint, Story Points, Start date and Due date fields. Ticket sprint memberships recover calendars when board discovery returns none. Actual dates remain explicit.
- All eligible tickets have project rows, including unscheduled tickets. Current-period work is listed first; older work is labeled outside the date range.
- Resources expand from people to projects to individual ticket lanes; ticket bars edit one item at a time. Read-only person/project bars span their visible scheduled child tickets and remain visible when collapsed. Person capacity still includes all project commitments. The In this period toggle includes older and unscheduled work when unchecked.
- Ticket and epic details include Show on timeline to jump to their schedule. Project and roadmap search accept issue keys.
- Live browser verification confirmed project ticket bars and resource allocation bars after import. Saved data survives API restart.

## Remaining production work

The current persistence adapter is for one local API process and one workspace. PostgreSQL/EF Core, organizational sign-in, workspace isolation and permission-aware shared Jira data access remain required before a shared deployment. Bind the current app to loopback.

The Jira adapter assumes Cloud. OAuth 3LO, per-project/type field mappings, transition-history actual dates, scheduled incremental sync, reconciliation and webhook lifecycle management remain planned. Current API-token credentials and mapping overrides come from .NET User Secrets in Development or server environment variables. Standard date, estimate and sprint fields are discovered automatically. All imports fetch the selected scope on demand; no Jira writes occur.

The frontend remains partly in one App component, with API/session modules, shared types and editing components extracted. TypeScript migration is incremental. Sprint records are projected into project lanes while retaining Jira IDs; a fully normalized board/sprint relationship model remains part of the database phase. Advanced calendars, split daily effort, dependency-driven rescheduling and product/initiative grouping are not implemented.

The frontend build warns about the timeline bundle size (roughly 711 KB minified). It is a performance advisory, not a failed build. Code splitting and representative large-portfolio profiling belong to the next hardening pass.

Continue using [the implementation plan](IMPLEMENTATION_PLAN.md) for the production phases; this status does not mark all phases complete.
