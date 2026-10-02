# Pulse implementation plan

Updated October 1, 2026. See [current implementation status](IMPLEMENTATION_STATUS.md) for work completed since this plan was written. The architecture below remains the production target. Target repository: `D:\source\dotnet\pulse`.

## Product decisions

Pulse brings independent Jira project calendars into three connected views: resources, project execution, and a cross-project roadmap. Keep the vertical navigation only. Use a project multiselect consistently across views, with separate workspace Configuration for enabled projects, issue types, resources, calendars, and Jira field mappings.

Use **1 SP per available workday per person, shared across projects**. This replaces the earlier independent 10-SP budget per project sprint. A dedicated person in a ten-workday sprint has 10 SP of capacity; two overlapping sprints do not double that person's availability. This is an agreed planning convention, not a universal conversion of story points to elapsed time or a measure of individual productivity.

Every story and epic has separate nullable planned start/end and actual start/end fields. Dragging or resizing changes the plan. Actuals are recorded separately and never silently shifted with a plan. Each project retains its own sprint dates; the portfolio does not invent a common sprint.

The current mockup uses Svelte 5, vis-timeline, and an ASP.NET Core 10 sample-data API. It includes multiselect, draw-to-create, moves across dates and lanes, resizing, Undo, actual overlays, and configuration filters. The initial mockup used session-only changes. The first implementation now adds local API persistence, saved Undo, conflict handling, and a configurable read-only Jira Cloud adapter; see the status document for the exact boundary. Production database persistence, authentication, leave calendars and background synchronization remain to implement.

## Architecture

Use a modular monolith initially:

| Component | Choice and responsibility |
| --- | --- |
| Frontend | Svelte 5 + TypeScript + Vite. Shared query/filter state, typed API client, forms, timeline adapter, accessible editing alternatives. |
| Timeline | Retain vis-timeline behind one adapter. Domain models must not depend on its item/group types. Translate inclusive dates to exclusive display ends here. |
| API | ASP.NET Core 10. Authentication, workspace authorization, read models, validation, scenario commands, audit records, and concurrency checks. |
| Persistence | PostgreSQL with EF Core/Npgsql. Use migrations, indexes on workspace/date/assignee and immutable Jira IDs, and transactional commands. |
| Jira ingestion | Typed HttpClient adapters plus a durable background job queue in PostgreSQL. Start with a hosted worker; split to a separate worker process when operational needs justify it. |
| Hosting | Serve built frontend and API from one origin. Deploy API/worker and database independently; Docker Compose for local development. |

Proposed structure as the prototype matures:

```text
Pulse.sln
src/Pulse.Api
src/Pulse.Application
src/Pulse.Domain
src/Pulse.Infrastructure
src/Pulse.Worker                 # optional separate executable
web/src/lib/{api,domain,timeline,components}
web/src/features/{resources,projects,roadmap,configuration}
tests/{Pulse.Domain.Tests,Pulse.Integration.Tests,e2e}
docs/
```

Move the current frontend `src` to `web` in a dedicated restructuring change. Keep the existing run instructions working until then. Split the large prototype App component by feature; do not rewrite functioning timeline gestures solely for the folder change.

## Data model

| Record | Essential fields and invariants |
| --- | --- |
| Workspace / JiraConnection | Workspace timezone, capacity policy, Jira deployment kind/site/cloud ID, connection owner, sync status; encrypted server-side credentials. |
| Project / Board | Jira IDs, display key/name, configuration state; many-to-many board/project relationship. A board is not necessarily one project. |
| Sprint | Jira ID, origin board ID, name, state, start/end/completion instants; original timezone and normalized planning dates. Do not key by sprint name. |
| Person / WorkCalendar | Jira account ID, display name, active status, timezone, weekday availability/FTE, holiday and leave exceptions. |
| WorkItem | Jira issue ID and current key, project/type, parent, assignee, status, estimate, source update time, planned/actual fields, provenance. Epics and stories use the same core model. |
| SprintMembership | Issue/sprint links and history. Preserve old memberships; select the relevant current planning sprint explicitly. |
| AssignmentSegment | Work item, person, date window, allocated points; enables split work and multiple people without duplicating the item's estimate. |
| Product / Initiative | Cross-project grouping of outcomes. Initially roadmap lanes are projects; later allow initiative/product grouping independently of Jira project ownership. |
| Milestone / Dependency | Target date, dependency endpoints/type, source. Dates are targets unless explicitly committed. No automatic cascading in the first release. |
| Scenario / PlanOverride | Base source revision, local planned dates/assignments, author, version, committed draft state. Keep imported truth separate from local proposals. |
| FieldMapping / StatusMapping | Per-project/type estimate, planned and actual date fields, parent strategy, active/done statuses, and inference policy. |
| SyncRun / Checkpoint / Audit | Import window, pagination progress, last successful checkpoint, errors, completeness, command history and mutation IDs. |

Store date-only planning values as .NET `DateOnly` and ISO `YYYY-MM-DD` in APIs. Store Jira timestamp events as UTC instants with the configured timezone used to derive dates. Do not add fixed 24-hour millisecond durations across daylight-saving changes. UI dates are inclusive; internal interval math may use half-open windows consistently.

### Date precedence and actuals

For capacity, use scenario assignment segments first, then explicit effective story planned dates, then the chosen sprint dates. Effective story dates use a local plan override before mapped Jira planned fields. Label the fallback as inferred from the sprint. Missing dates and no sprint mean unscheduled work, not zero-duration scheduled work.

Actual dates come from explicitly mapped Jira fields, or from configured workflow transition history when those fields do not exist. Record source and confidence. Never equate issue creation with actual start or due date with actual completion. For a workflow-derived default: first entry into a configured active status establishes actual start; the latest completion establishes actual end only while currently in a terminal status. Reopening clears the effective end but preserves all transition events. Make this policy configurable before import.

An actual start without an end means ongoing work and appears as a Started marker or an open-ended actual band; it must not masquerade as a finished interval. Epic actuals can use mapped fields or an explicitly labeled child roll-up, not a mixture with no explanation. Local actual-date edits require separate permission and audit provenance.

### Capacity rules

For the initial Monday–Friday calendar, distribute assigned points evenly across working days in the effective planned window. Sum all a person's active assignment effort for each date, then compare with 1 SP. Keep decimal precision internally and round only for display.

For variable calendars, daily capacity is `1 SP × available FTE fraction`. Distribute an evenly scheduled segment proportional to available day weights; zero available days is a validation error. Explicit per-day effort can override the distribution later. Date-range reports must allocate a segment over its entire effective window before clipping to the visible range.

Count estimates once: epic roll-ups are not additional effort, and parents/subtasks require an explicit leaf-estimation policy. Split assignment points must sum to the item's allocated estimate. Missing estimates remain unknown and visible in a data-quality indicator. Unassigned and unscheduled work appear in queues.

Project/view filters never remove known hidden commitments from overload checks. Import scope is different: work that was never imported cannot be counted. Show coverage and freshness, and do not label a person's capacity complete when relevant project coverage is unknown. Hiding an already imported project must not silently erase its commitments.

## Jira integration

Assume Jira Cloud for the first adapter, subject to discovery. If the organization uses Data Center, build a separate deployment-specific adapter and validate its API/authentication capabilities; do not assume Cloud endpoints apply.

### Connection and discovery

Use OAuth 2.0 authorization-code/3LO for Cloud, with server-side callback/state validation, encrypted tokens, rotation handling, and minimum required scopes. Keep all Jira calls and credentials on the backend. Application sign-in should use the organization's OIDC provider; Jira consent is a separate connection. Follow the current [Atlassian OAuth documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) when registering and implementing the app.

Discover permitted projects, boards, issue types, fields, and assignees. Map story-point and date fields by ID and context; never hardcode a tenant-specific `customfield_...` identifier. Persist a sample mapping preview for each selected project/type before enabling import. Jira exposes field metadata through its [issue fields API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/).

Fetch board metadata and sprint calendars through Jira Software's Agile APIs, including `/rest/agile/1.0/board/{boardId}/sprint`. Deduplicate sprints and issues shared by multiple boards. Handle Kanban projects without sprints and unstarted sprints without complete dates. See the [board API reference](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/).

### Import and refresh

1. Build server-side JQL from validated scope and requested history/window; request only needed fields.
2. Use enhanced `POST /rest/api/3/search/jql` and follow `nextPageToken` until complete. Do not build against removed legacy search endpoints or assume total counts. Jira search results respect project and issue permissions. See [enhanced issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).
3. Upsert by connection + immutable Jira ID. Store source payload revision and mapped normalized values. Separately page any required changelog history; do not assume the issue response contains the complete history.
4. Commit each import batch transactionally. Advance the successful checkpoint only after all pages for the bounded update window have been processed. Use overlapping update windows and deduplication to recover from delays and retries; pagination tokens are run progress, not permanent synchronization checkpoints.
5. Poll incrementally on a configurable interval, initially five minutes, and run periodic wider reconciliation for missed changes, deleted/archived issues, and permission changes. Restrict or remove inaccessible cached records from user results without assuming every missing search result means deletion.
6. Add webhooks later for faster refresh. Treat events as hints, deduplicate them, and refetch authoritative records. Follow the selected integration's documented verification and registration/renewal requirements; retain polling as recovery. Consult [Jira webhooks](https://developer.atlassian.com/cloud/jira/platform/webhooks/).

Honor 429 responses and `Retry-After`, use bounded concurrency and exponential backoff with jitter, and expose stale-data/error states. Do not hardcode a requests-per-minute allowance: Jira has evolving rate-limit policies. See [Atlassian rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/).

### Permissions and local edits

The first connected release reads Jira and persists Pulse scenarios locally. A drag is a Pulse planning command, with explicit visual indication of local changes. Incoming sync updates the source layer and flags conflicts with overrides rather than discarding either version.

Enforce workspace viewer/planner/admin roles and source-data access on every API query. A shared connection must not expose its owner's private issues to every workspace member. Choose either per-user source authorization or a deliberately restricted shared portfolio with verified membership and issue-access rules during the discovery phase. Test revocation and cache isolation before rollout.

Optional Jira write-back is a separate later feature. Provide a reviewed change set showing fields and destination issues, validate edit metadata and permissions, check the source revision for conflicts, and use durable outbox jobs with idempotent command handling. Cross-project issue moves are a dedicated operation with type/status/field mapping constraints; they are not a generic update of the project field. Do not promise atomicity across multiple Jira issues. Report partial failures and reconcile each result.

## UI and API work

| Area | Implementation and acceptance |
| --- | --- |
| Navigation and filters | Sidebar only. Multiselect with All, clear, counts, keyboard/focus support. Date/search filters shared where meaningful; preserve independent sprint headers. |
| Resource timeline | People lanes with project colors and overload days. Draw adds a segment/item; moving to another person reassigns; resizing preserves points and recalculates effort. An aggregate bar states how many underlying items will move. |
| Project timeline | Expandable epics/stories with subtle row dividers. Moving a story to another epic changes its parent; cross-project proposals validate destination context. Moving an epic does not silently move every child date. |
| Roadmap | Epics, targets, dependencies across project lanes. Later support product/initiative grouping. Moving an epic between project lanes proposes project ownership change, with explicit effects. |
| Dates | Planned colored range and optional actual band. Detail form exposes all four dates, provenance, validation, and variance. Actuals do not add planned capacity. |
| Configuration | Projects/boards, issue types/hierarchy, resources, calendars, field/status mapping, connection status and sync coverage. Distinguish import scope from display preferences. |
| Editing | Optimistic UI with rollback on failure, server validation, command ID, row version/ETag, audit trail and persisted undo/compensating command. A form provides every drag action for keyboard users. |

Suggested endpoints:

```text
GET   /api/workspaces/{id}/configuration
PUT   /api/workspaces/{id}/configuration
GET   /api/workspaces/{id}/jira/discovery/{projects|boards|fields|types|people}
POST  /api/workspaces/{id}/jira/sync
GET   /api/workspaces/{id}/jira/sync-status
GET   /api/workspaces/{id}/timeline?view=&from=&to=&projectIds=&personIds=
GET   /api/workspaces/{id}/work-items/{itemId}
POST  /api/workspaces/{id}/scenarios
POST  /api/workspaces/{id}/scenarios/{scenarioId}/commands
POST  /api/workspaces/{id}/scenarios/{scenarioId}/undo
```

Commands include CreateItem, MoveAssignment, ResizePlan, ChangeParent, SetActualDates, and MoveEpic. Validate workspace ownership and allowed transitions server-side. Return updated entities, capacity deltas, command version, and warnings in one response. Use RFC-style Problem Details for validation/conflict errors. Windowed timeline DTOs should contain only relevant lanes/items plus aggregate hidden-work capacity and completeness indicators.

## Delivery sequence

| Phase | Deliverables | Exit criteria |
| --- | --- | --- |
| 0. Jira discovery spike | Confirm Cloud/Data Center, auth model, sample field mappings, board/sprint relationships, actual-date semantics. | One real project can be read; one shared person and overlapping project calendars normalize correctly. |
| 1. Foundation | TypeScript frontend modules, .NET domain/application boundaries, PostgreSQL migrations, sign-in, workspace roles, date/capacity model. | Domain tests pass; workspace isolation and persistent configuration verified. |
| 2. Read-only Jira import | Connection/discovery, import worker, field mapping, paging, incremental checkpoint and sync UI. | Restart/retry imports safely; two projects with offset sprints and shared people load without duplication. |
| 3. Real-data views | Three API-backed timelines, multiselect, hierarchy, backlog, actual overlays, data-quality and freshness indicators. | Same work produces consistent values across all views; filters preserve hidden load. |
| 4. Persistent planning | Draw/move/resize, assignments, dates, scenario versions, audit and Undo, keyboard forms. | Reload retains changes; concurrent edits produce a conflict; plan edits preserve actuals and imported source fields. |
| 5. Operational release | Reconciliation, rate-limit recovery, permission revocation, diagnostics, backups, CI deployment, load and accessibility checks. | Restore drill and failure scenarios pass; pilot users complete planning tasks against their Jira data. |
| 6. Optional extensions | Reviewed Jira write-back, webhooks, product/initiative grouping, split daily allocations, advanced dependency scheduling. | Each extension has separate acceptance tests and operational recovery behavior. |

Do not couple the first usable release to Jira write-back or automatic dependency scheduling. The useful initial outcome is trustworthy imported data and persistent local planning.

## Verification and operations

Domain tests: offset sprint overlap; weekends/holidays/FTE; fractional estimates; unknown/unassigned work; splitting without double counting; range clipping; timezone/DST boundaries; zero-workday rejection; actual dates unchanged on moves; reopen behavior; cross-project parent/sprint consistency.

Integration tests: Jira pagination and duplicate boards; interrupted checkpoint recovery; 429/Retry-After and expired tokens; permission loss; field-context variation; stale concurrent commands; transactional bulk moves; repeated command IDs; sync versus local override conflicts. Use recorded/synthetic fixtures with no secrets or private issue payloads in source control.

Browser tests: all three views, multiselect, settings persistence, forward/backward drawing, Escape cancellation, edge resize, cross-lane moves, actual-date form, undo, keyboard-only editing, empty states and narrow layouts. Retain focused screenshots for hierarchy and actual overlays. Current prototype has nine passing domain tests; production API/E2E suites are still to be built.

Performance: establish representative portfolio fixtures before choosing targets. Start with 100 people and 5,000 issues as a test case, window API requests, collapse unneeded children, and measure response time, rendering and drag latency. These are proposed test inputs, not measured capacity claims. Lazy-load timeline code if bundle/startup measurements justify it.

CI should run frontend diagnostics, domain/API tests, production builds and migration validation. Deploy with managed secrets, database backups, readiness checks and structured logs containing correlation IDs but no tokens. Monitor last successful sync, checkpoint age, pending jobs, rate-limit retries, permission failures and command errors. Ship database changes compatibly and test restoration before the pilot.

Open decisions for the implementation kickoff: Jira deployment and sites; organizational sign-in; shared versus per-user data-access model; actual fields versus transition-derived dates; personal calendars/leave source; subtask estimation policy; and whether local plans eventually need Jira write-back. None prevents reviewing the current mockup.
