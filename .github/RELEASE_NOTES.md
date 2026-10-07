Pulse 0.1.2 fixes timeline navigation and ticket details.

- The Ctrl+K shortcut no longer displays its tooltip over unrelated parts of the window. The shortcut and search-box hint remain available.
- Timelines open at the beginning of the week. Editable From/To dates support custom ranges, and week presets show the actual dates.
- Chosen timeline ranges are remembered across reloads and Jira imports.
- Selecting a ticket opens only that ticket's details, assignee, assignment controls, and planned/actual dates. Person capacity summaries still show their assigned work.

Download Pulse-0.1.2-win-x64-setup.exe. SHA256SUMS.txt contains its checksum.

Installation is per-user on Windows 10 1809+ or Windows 11 x64 (ARM64 via x64 compatibility). .NET and Windows App SDK are included; WebView2 is installed from Microsoft if missing and requires Internet access in that case.

Upgrade and uninstall retain saved plans and encrypted credentials. Jira write-back remains disabled. The installer is unsigned, so Windows SmartScreen may show an unknown-publisher warning.

CI runs frontend/backend tests and installation, native/WebView startup, upgrade from the previous release, startup after upgrade, and uninstall checks before publishing.
