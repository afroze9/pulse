Pulse 0.1.3 improves timeline readability and preserves screen state.

- Detail sidebars and modal panels own scrolling while open, eliminating the second page scrollbar. Closing a panel restores page scrolling and preserves its position and width.
- Ticket statuses appear as bold, bordered badges with contrasting text in Resource and Project timelines, in both light and dark themes.
- Resources and Projects independently remember individual row expansion and collapse choices, including expand/collapse-all, across screen switches and reloads.
- Search temporarily reveals matching rows without replacing saved expansion choices. Filtering rows out and back in preserves their state.

Download Pulse-0.1.3-win-x64-setup.exe. SHA256SUMS.txt contains its checksum.

Installation is per-user on Windows 10 1809+ or Windows 11 x64 (ARM64 via x64 compatibility). .NET and Windows App SDK are included; WebView2 is installed from Microsoft if missing and requires Internet access in that case.

Upgrade and uninstall retain saved plans and encrypted credentials. Jira write-back remains disabled. The installer is unsigned, so Windows SmartScreen may show an unknown-publisher warning.

CI runs frontend/backend tests and installation, native/WebView startup, upgrade from the previous release, startup after upgrade, and uninstall checks before publishing.
