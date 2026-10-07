# Pulse

A Windows portfolio planner built with .NET MAUI 10, Svelte 5, and vis-timeline. Jira import, resource planning, project timelines, and product roadmaps run in one desktop application.

## Install on Windows

Download the latest **win-x64-setup.exe** from [GitHub Releases](https://github.com/afroze9/pulse/releases). Windows 10 1809+ or Windows 11 is required. The installer runs per user, includes .NET and Windows App SDK, and installs Microsoft WebView2 if missing (Internet is required for that prerequisite). Windows may warn because this preview is not yet code-signed.

Pulse appears in the Start menu and Windows Installed Apps. Updating or uninstalling keeps local plans and encrypted credentials. Open Configuration to connect Jira; there is no bundled sample workspace or server to start.

## CI and Releases

[Windows Build and Installer](https://github.com/afroze9/pulse/actions/workflows/windows.yml) runs on main, pull requests, version tags, and manual dispatch. It checks Svelte, runs frontend/backend tests, builds the self-contained application and installer, then validates install, installed-app startup, repair/upgrade, startup again, uninstall, and data preservation. Native startup checks wait for the bundled Svelte UI and successful in-process workspace load, and exercise an isolated encrypted credential key. The real user workspace and Jira credentials are not used by these tests.

Every successful build uploads an installer and SHA256SUMS.txt as workflow artifacts. A tag matching version.json (for example v0.1.1) publishes the tested files as a GitHub prerelease. The release job runs only after the Windows job passes. No deployment credentials are needed: GitHub's repository-scoped token is used only in the release job.

Local packaging:

~~~powershell
npm ci
dotnet workload install maui-windows
./scripts/Build-Installer.ps1
# Run lifecycle tests in a clean Windows user profile with no existing installed Pulse.
./scripts/Test-Installer.ps1 -Installer artifacts/installer/Pulse-0.1.1-win-x64-setup.exe
~~~

The pinned Inno Setup compiler is installed per user under LocalAppData/PulseBuild. Its checksum and publisher signature are checked; the bundled WebView2 bootstrapper's Microsoft signature is checked. Installer source is in installer/Pulse.iss. Signing and automatic update delivery are not configured yet.

## Desktop app

Pulse now includes a .NET MAUI Windows desktop host that runs Svelte and C# in one application, without a separate API server. See [desktop build, storage, and Jira setup](desktop/README.md). Browser-host instructions below remain available for development.

## Current implementation

The Svelte frontend now uses the .NET API for saved plans, configuration, version checks and durable Undo. Failed or conflicting saves preserve a recoverable draft. Jira Cloud project/field discovery and on-demand read-only import are implemented.

Storage is currently an atomic JSON file in `server/App_Data`, configurable with `PULSE_DATA_DIR`. Keep one server per data directory. This is a local implementation, with PostgreSQL, organizational authentication, OAuth and background sync still planned. See [backend setup and Jira configuration](server/README.md) and [implementation status](docs/IMPLEMENTATION_STATUS.md).

## Run

Prerequisites: Node.js 22+ and .NET 10 SDK.

```powershell
cd D:\source\dotnet\pulse
npm.cmd install
npm.cmd run build
dotnet run --project server/Pulse.Api.csproj --urls http://127.0.0.1:5080
```

Open http://127.0.0.1:5080. For frontend development, run `npm.cmd run dev` in another terminal; Vite proxies `/api` to port 5080. The frontend shows a loading state until the saved workspace arrives. If the API is unavailable, it shows a retry action without sample data. New workspaces start empty and offer Jira setup in Configuration.

## Jira credentials

Run `.\scripts\Configure-Jira.ps1` once from this directory to save Jira settings using .NET User Secrets. It reuses your current terminal settings or prompts securely. Then restart with `dotnet run --project server/Pulse.Api.csproj`; the Development launch profile loads your saved settings automatically. See [backend setup](server/README.md).

## What to try

- Resources: select a colored allocation, inspect daily load across projects, and reassign a story. Capacity warnings recalculate immediately.
- Select several projects using the checkbox filter: their bars are shown, but capacity warnings and peak labels still account for every project. Portfolio summary metrics intentionally stay portfolio-wide.
- Projects: explore expandable epics and story rows with original project sprint dates. Unscheduled work appears below the timeline.
- Roadmap: inspect epics, release milestones, and cross-project dependencies. This is a quarterly view, deliberately omitting story-level detail.
- Draw in an empty lane to create a story or roadmap epic. Drag bars across dates/lanes and drag edges to resize. Undo restores the previous plan. Resource bars move their underlying stories together.
- Edit separate planned and actual dates in item details. Toggle Actuals to compare charcoal actual bars with colored plans. An actual start without an end shows a Started marker.
- Configuration: enable projects, work item types, and resources. The project filter and sidebar reflect the configured project scope.
- Use the sidebar to switch views; there are no duplicate horizontal tabs.
- Change timeline range, search, review overloaded people..

## Capacity model

The final design uses the user's revised rule: **1 SP per working day, shared across all projects**. This supersedes the earlier independent 10-SP-per-project-sprint rule.

`Assignment daily effort = assigned SP / weekdays in its planned window (or sprint when dates are inferred)`

`Person daily load = sum of active assignment daily effort across all projects`

The daily capacity is 1 SP. A 10-weekday sprint gives 10 SP capacity for someone dedicated to that project; working in two projects does not create two independent capacity budgets. Weekends are excluded. Sprint start/end dates are inclusive; the timeline converts the end to an exclusive boundary for rendering.

Example: Commerce runs October 5–16; Platform runs October 7–20. Sara has 8 SP in Commerce and 5 SP in Platform. Her load is 0.8 SP/day before the overlap, 1.3 during the overlap, then 0.5 afterward. She has eight overloaded working days. This is inferred scheduling, not an assertion that both projects require work on every day. Every timeline makes the inference explicit.

Completed stories remain part of the sprint's committed scope. Unassigned or unscheduled work contributes no load and must be surfaced separately before production planning. Peak load and averages are computed for the selected period. Filtering bars never removes hidden work from capacity calculations.

## Research and design rationale

Reviewed October 1, 2026 using the vendors' documentation:

| Reference | Relevant approach | Decision for Pulse |
| --- | --- | --- |
| [Float: capacity planning and resource scheduling](https://support.float.com/en/articles/13847946-capacity-planning-and-resource-scheduling) | People, allocations, availability, and overlaps share a schedule; capacity is hours based. | Lead with a people-first timeline; project colors stay consistent; resolve conflicts in a details panel. Substitute the user's SP/day convention for hourly bookings. |
| [Jira Plans: planning tools](https://support.atlassian.com/jira-software-cloud/docs/planning-tools-in-advanced-roadmaps/) | Capacity and velocity support iteration planning in points or hours. | Retain source sprint calendars and epic/story hierarchy. Add an individual cross-project daily calculation rather than requiring a single portfolio sprint. |
| [Tempo: Capacity Planner with Gantt](https://help.tempo.io/gantt/latest/capacity-planner-formerly-planner-by-tempo) | Include work outside the current Gantt project in resource usage. | Project filters must not hide a person's other commitments from overload checks. |
| [Linear: Timeline](https://linear.app/docs/timeline) | High-level timelines, milestones, dependencies, and varying time resolution. | Keep roadmap separate from execution detail. Use epics as delivery outcomes within Jira project lanes. |
| [Linear: Initiatives](https://linear.app/docs/initiatives) | Group projects around objectives. | Future roadmap grouping by product or strategic initiative; a product may span several Jira projects. |

This is a synthesis of useful interaction patterns, not a claim that these tools all support this exact SP/day model.

### The three views

1. **Resource allocation — days/weeks.** People are rows; project-sprint commitments are colored bars. Hatching identifies days over 1 SP across all projects. The details panel exposes the daily calculation and underlying stories.
2. **Project allocation — weeks/sprints.** Expandable epics with story rows, assignees, points, and status. Sprint windows remain project-specific. The same data powers both resources and projects, so edits cannot quietly diverge.
3. **Product roadmap — months/quarters.** Epic outcomes grouped by project, with target milestones, health, and dependency drill-down. A future product/initiative grouping should sit above project membership; avoid forcing every initiative into one Jira project.

### Timeline library

The mockup uses [vis-timeline](https://github.com/visjs/vis-timeline), with [grouping, nested groups, ranges, and background items](https://visjs.github.io/vis-timeline/docs/timeline/). It fits the three views, integrates through a small Svelte lifecycle component, and avoids choosing a paid scheduler before the interaction model is proven. The project declares Apache-2.0 OR MIT licensing; review the installed license for distribution requirements.

[FullCalendar](https://fullcalendar.io/pricing) is a strong calendar option, but resource timeline is a Premium feature. [Bryntum Scheduler](https://bryntum.com/store/scheduler/) is a commercial alternative worth evaluating if sophisticated drag scheduling and large-scale resource management become core requirements. Neither commercial alternative was purchased or trialed here.

## Implementation plan

See [the detailed .NET/Svelte/Jira implementation plan](docs/IMPLEMENTATION_PLAN.md) for the domain model, API shape, import and incremental sync strategy, field mappings, authentication, delivery phases, and acceptance criteria.

## Suggested production architecture

- **Svelte UI:** shared project/person/date filters; resource schedule; epic/story planning; product roadmap; accessible details and scenario editor.
- **ASP.NET Core API:** Jira connection and permission enforcement; normalized read model; capacity calculation; local scenario changes and an explicit review step before Jira write-back.
- **Database:** PostgreSQL or SQL Server. Core records: Person, WorkCalendar, Project, Board, Sprint, Issue, Assignment, Product/Initiative, Milestone, Dependency, Scenario, SyncCheckpoint.
- **Jira ingestion:** read issues, people, parent relationships, estimates, statuses, sprint IDs and board-specific calendars. A sprint belongs to a board and can contain multiple projects; keep globally unique sprint IDs and do not key sprints by their display name. The demo simplifies this to one board per project.
- **Sync:** initial import plus incremental updates and periodic reconciliation; preserve field provenance and last successful sync time. Keep Jira authentication server-side. Do not imply synced data is fresh after an error.
- **Scheduling precedence:** explicit allocation segments first; explicit story dates next; sprint-based inference last. Count story/leaf estimates once; do not add epic estimates to child estimates.
- **Capacity:** personal work calendars, public holidays, leave and part-time availability. Permit split allocations so one 5-SP story can be scheduled on five selected days instead of evenly over a sprint. Do not treat story points as universally comparable without agreeing the convention with teams.
- **Roadmap confidence:** distinguish committed dates, targets and exploratory windows. Derived epic progress should use a documented measure; demo progress and health are illustrative fields.

## Current scope

The API starts with an empty workspace and persists plans, configuration, source snapshots, command IDs and Undo history. Timeline drawing, moving, resizing and form edits save through the API. Read-only Jira Cloud import is available once server credentials and field mappings are supplied. Roadmap quarters can be navigated. Holidays, leave, variable calendars, automatic dependency scheduling, organizational authentication, PostgreSQL and background Jira polling remain planned. There is no Jira write-back.

## Verification

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
dotnet build server/Pulse.Api.csproj
dotnet run --project tests/Pulse.Backend.Tests
```

The domain tests cover capacity across offset sprints, weekends, reassignment, explicit schedules, cross-project story/epic moves, resizing validation, and preservation of actual dates.

### Verified in this workspace

- Svelte diagnostics: 0 errors, 0 warnings.
- Frontend domain/session tests: 13 passed. Backend fixture checks: 14 passed.
- Frontend production build: passed (Vite notes the timeline bundle exceeds its default 500 kB chunk advisory).
- .NET build: passed with 0 warnings and 0 errors; `/api/health` reports `ok`.
- Browser: verified all three views, project filtering, allocation selection, dependency details, story reassignment, draft creation, reset, and responsive layouts at 1440px and 390px. No browser warnings or errors were logged. Narrow layouts use horizontal timeline scrolling to preserve readable dates.
- Additional browser checks: project multiselect, draw-to-create, moves across people/date lanes, edge resize, Undo, actual-date editing/overlays, configuration scope, and neutral nested story rows.
- Local design screenshots are excluded from Git because they may contain imported Jira data.

Integration checks additionally verified actual dates and configuration across reloads, saved timeline resizing, server Undo, and two-session conflict handling with the losing draft preserved. `scripts/api-smoke.mjs` tests the HTTP contract against an isolated disposable instance (never port 5080).

### Delivery Timeline Export
Use **Preview & Export** on a timeline toolbar. Choose an epic roadmap or detailed work-item report, adjust the date range and title, and include actual dates, milestones, or undated items. Reports use the selected projects and configured people/types; timeline search and collapsed rows do not restrict the report.

PDF exports include all A4 landscape pages. PNG (2× resolution) and SVG export the selected page. The Windows app uses a native Save As dialog; browser previews use downloads. PDF pages are rendered images; SVG retains vector text and shapes. Exports are generated locally and do not change Jira or the workspace.
