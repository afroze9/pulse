Pulse 0.1.1 adds Gantt-style delivery timeline preview and export.

- Preview an epic roadmap or detailed project/epic/work-item timeline.
- Choose the title and date range; include planned and actual dates, milestones, and undated items.
- Export all pages as an A4 landscape PDF, or the selected page as a high-resolution PNG or vector SVG.
- Save exports locally through the native Windows Save As dialog.
- Reports respect selected projects and configured people/work item types. Search and collapsed rows do not restrict exports.
- PDF pages are rendered images; SVG preserves vector text and shapes.

Download Pulse-0.1.1-win-x64-setup.exe. SHA256SUMS.txt contains its checksum.

Installation is per-user on Windows 10 1809+ or Windows 11 x64 (ARM64 via x64 compatibility). .NET and Windows App SDK are included; WebView2 is installed from Microsoft if missing and requires Internet access in that case.

Upgrade and uninstall retain saved plans and encrypted credentials. Jira write-back remains disabled. The installer is unsigned, so Windows SmartScreen may show an unknown-publisher warning.

CI runs frontend/backend tests and installation, native/WebView startup, upgrade from the previous release, startup after upgrade, and uninstall checks before publishing.
