# Pulse desktop

Windows desktop application using .NET MAUI 10 HybridWebView and the existing Svelte 5 / vis-timeline UI. There is no HTTP server, background API executable, localhost port, or Node runtime required by the desktop app.

## Build and run

Prerequisites: .NET 10 SDK with the maui-windows workload, Node.js for building the UI, and WebView2 Runtime. Install the workload using dotnet workload install maui-windows.

From the repository root:

~~~powershell
npm.cmd ci
.\scripts\Build-Desktop.ps1 -Publish -ImportExistingWorkspace
.\artifacts\desktop\Pulse.Desktop.exe
~~~

For folder-based development builds, keep the entire published folder together. Distribute the per-user Windows installer from scripts/Build-Installer.ps1; it includes .NET and Windows App SDK and handles WebView2 detection/bootstrap. GitHub Actions tests installation and startup before releasing it. Mac/mobile builds, code signing, and automatic updates are not included.

The import switch copies server/App_Data/workspace.json to the desktop data directory only when no desktop workspace exists. It never overwrites either existing workspace or copies Jira secrets. Once imported, desktop and browser workspaces are independent.

## Architecture

- desktop/: MAUI window, bundled Svelte assets, HybridWebView messaging, OS SecureStorage.
- core/: reusable workspace persistence, Jira import, validation, and allowlisted PulseBridge operations.
- src/: shared Svelte frontend. Desktop builds use a native transport; browser builds retain the HTTP adapter for development.
- server/: optional browser host only. The desktop project does not reference it.

The native RPC transports JSON through HybridWebView raw messages, including large workspace saves. It does not place credentials or workspace payloads in URLs. Only the Dispatch operation is exposed; it routes a fixed list of application operations. Remote page navigation and popups are blocked in the desktop webview.

## Data and Jira credentials

Plans, Undo history, and scope are stored in %LOCALAPPDATA%\Pulse\workspace.json. These planning records are not encrypted; they contain imported Jira data but no Jira connection token.

Open Configuration, enter Jira Cloud URL, email, and API token, then choose Save connection and Test saved connection. Discover projects and import them as before. Credentials are encrypted through MAUI SecureStorage using the Windows account's data protection. The entire connection record is saved together. The UI can read URL/email and token-present status, never the saved token. A blank token preserves it only for the same URL and email. Forget connection removes only Pulse's credential entry and leaves plans intact.

Existing .NET development user secrets are not automatically copied into the desktop app. Enter the token once in Configuration. SecureStorage's encrypted values are tied to the OS user; copying application files or the workspace does not transfer credentials.

Single-instance protection prevents two desktop processes from writing the same workspace. Keep the existing browser API on its own data directory.

## Verification

~~~powershell
npm.cmd run check
npm.cmd test
dotnet run --project tests/Pulse.Backend.Tests
~~~

Tests cover existing planning behavior, transport error handling, native RPC with a 3 MB payload, credential validation, token redaction, persistence through a storage abstraction, and workspace conflict/Undo behavior. Actual Windows encryption and the native window require runtime verification on Windows.

Verified on Windows: published executable startup, existing portfolio, save/Undo/restart, and actual encrypted SecureStorage round-trip. The optional --self-test argument exercises an isolated test key and writes only boolean results to %LOCALAPPDATA%\Pulse\desktop-self-test.json. The build script automatically uses the local SDK at %LOCALAPPDATA%\PulseBuild\portable when present, or accepts -DotNetPath for another SDK.

## Native Title Bar

The desktop window uses MAUI TitleBar with a native search box, Jira status/Configuration shortcut, refresh action, and Windows caption buttons. Ctrl+K focuses global search. Search covers configured projects, people and work item types; exact issue keys rank first. Choose a result with the mouse or press Enter. Ticket/epic results open their details and date range; people/projects open their planning views. The browser-only header is hidden in the desktop app. Static UI headings, labels, and buttons use Title Case; imported Jira text and descriptive sentences retain their original casing.

## Appearance

Configuration → Appearance offers Light, Dark, and System. Changes apply immediately to the Svelte UI, timeline, native search, and window caption controls. System is the default and follows MAUI RequestedThemeChanged while open. The desktop stores the selection in MAUI Preferences (pulse.appearance); the WebView keeps a localStorage mirror for its initial render. Browser previews use localStorage and prefers-color-scheme. This preference is device-local and does not modify the Jira workspace.

## Installer Verification

The --smoke-test option requires PULSE_SMOKE_REPORT, loads an isolated workspace beside that report, uses a fresh credential namespace, waits for the actual bundled frontend and native workspace bridge, verifies Windows SecureStorage encryption, writes only boolean checks, and exits. scripts/Test-Installer.ps1 runs this from the installed directory before and after repair/upgrade, then uninstalls and checks shortcuts, registration, and data preservation. Use -PreviousInstaller to test an older release upgrading to the new installer; the first release tests same-version repair. This option never loads the real Jira connection or modifies the real workspace.
