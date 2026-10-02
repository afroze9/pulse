# Pulse local backend

The .NET 10 API provides durable planning without a database service. Run from `server` with `dotnet run --urls http://127.0.0.1:5080`. `PULSE_DATA_DIR` selects storage; the default is `server/App_Data`. The `workspace.json` file contains the current revision, source baseline, undo snapshots and command IDs. Each mutation validates before writing a flushed temporary file and atomically replacing the committed file. Keep one API process per data directory. Back up this directory while the API is stopped. New workspaces start empty with source `local`; sample records are never seeded. No startup reset occurs; malformed existing data prevents startup rather than discarding work.

This is a deliberate local adapter for the implementation plan's PostgreSQL repository. It does not provide multi-process locking, authentication, workspace isolation or production deployment. Default binding is loopback; keep it on loopback until organizational sign-in and per-user Jira access checks are implemented. Do not override URLs to expose a shared Jira owner's cached data publicly. Undo includes configuration and source snapshots and increments revision; there is no destructive reset endpoint.

`GET /api/workspace` returns `{version,data,configuration,canUndo,source,jira}`. `PUT /api/workspace` requires `{expectedVersion,data,configuration,commandId}`. `POST /api/workspace/undo` requires `{expectedVersion,commandId}`. IDs for commands are UUIDs. A duplicate most recent command is idempotent; replay of an older command returns 409 and requires reload. Stale revisions return 409. Domain validation errors return 400 ProblemDetails. Arrays are never filtered by configuration, so hidden commitments remain available for capacity calculations. Plans use inclusive ISO date-only strings and retain separate actual dates.

## Store Jira settings once with .NET User Secrets

Run from the repository root:

```powershell
.\scripts\Configure-Jira.ps1
```

The helper reuses PULSE_JIRA_URL, PULSE_JIRA_EMAIL, PULSE_JIRA_TOKEN and optional field mappings from the current terminal when present. Otherwise it prompts for the URL/email and masks token input. It sends settings to Secret Manager via stdin; it does not put tokens in command arguments or project files. Run it in the terminal where you previously configured Jira to migrate those settings. No credential values have been prefilled by the coding agent.

Stop the existing server and restart after configuration. Subsequent starts need only:

```powershell
dotnet run --project server/Pulse.Api.csproj
```

The Pulse launch profile selects Development and port 5080. ASP.NET Core automatically loads this project's User Secrets in Development; environment variables still override saved values. Direct DLL execution or --no-launch-profile does not select Development automatically. Published production hosting should use its deployment secret provider.

Field mappings use the same names in User Secrets, for example:

```powershell
dotnet user-secrets set PULSE_JIRA_FIELD_POINTS customfield_REPLACE_ME --project server/Pulse.Api.csproj
dotnet user-secrets set PULSE_JIRA_FIELD_SPRINT customfield_REPLACE_ME --project server/Pulse.Api.csproj
```

Use your tenant's real IDs from /api/jira/fields. User Secrets are outside the repository in your Windows profile but are not encrypted; they are intended for local development. See [Microsoft's User Secrets documentation](https://learn.microsoft.com/aspnet/core/security/app-secrets?view=aspnetcore-10.0).

## Jira Cloud setup

Use the User Secrets helper above or configure these server environment variables; never put credentials in frontend code:

- `PULSE_JIRA_URL`: HTTPS Jira Cloud site, e.g. `https://your-team.atlassian.net`
- `PULSE_JIRA_EMAIL`: Jira account email
- `PULSE_JIRA_TOKEN`: account API token
- `PULSE_JIRA_FIELD_POINTS`, `PULSE_JIRA_FIELD_SPRINT`: tenant field IDs obtained from field discovery
- `PULSE_JIRA_FIELD_PLANNED_START`, `PULSE_JIRA_FIELD_PLANNED_END`, `PULSE_JIRA_FIELD_ACTUAL_START`, `PULSE_JIRA_FIELD_ACTUAL_END`: optional mapped field IDs

Basic email/API-token auth is a local development adapter. The planned OAuth 3LO flow, encrypted credential store, status history inference and per-project/type field contexts remain future work. Missing mappings leave dates/estimates unknown; creation and due dates are never interpreted as actuals.

`GET /api/jira/status` exposes safe configuration/access status. `GET /api/jira/projects` discovers accessible projects as `{id,key,name}[]`. `GET /api/jira/fields` returns accessible field metadata. `POST /api/jira/sync` requires `{expectedVersion,commandId,projectKeys}`; omitted projectKeys use configured project IDs (Jira project keys after first import). Initial import populates the empty workspace. Subsequent imports refresh source values and preserve locally changed plan, assignment, parent and title fields by comparison with the previous source baseline; `localPlan` and `syncConflict` flag local differences. Local actual edits are also preserved; conflicting source changes are flagged. A whole import is fetched before a single atomic commit; failure leaves the prior workspace/checkpoint intact. Independent project/board sprint dates are retained. Kanban and incomplete future sprint dates remain supported as unscheduled records. This adapter fetches the selected scope on demand; scheduled incremental polling and reconciliation are not yet implemented. Switching import scope excludes inaccessible/omitted unmodified imported issues. A sync that would discard a locally edited source item or local proposal outside the selected scope returns409 instead. Local creations are retained within imported projects.

The adapter uses enhanced `/rest/api/3/search/jql` token pagination, project/board/sprint offset pagination, deduplication, and bounded retries honoring Retry-After. No Jira writes occur. Configured status does not claim verified connectivity.

References: [enhanced issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/), [board/sprint API](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/), [rate limits](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/).

Run synthetic backend tests with dotnet run --project tests/Pulse.Backend.Tests. These use an in-memory HTTP handler and disposable local storage; they cover pagination, rate-limit retry, deduplication, field mapping, local/source conflict preservation, persistence, stale concurrency, idempotency and date validation. Run scripts/api-smoke.mjs against an isolated API for HTTP contract checks.


Standard Sprint and Story Points fields are discovered from Jira field metadata when no explicit mapping is supplied. A unique Start date field and the standard Due date supply planned dates. Explicit mappings always win; actual dates are never inferred. Sprint memberships also supply sprint calendars when project board discovery does not return them. Reimport the selected projects after upgrading to populate previously missing schedules and estimates.
