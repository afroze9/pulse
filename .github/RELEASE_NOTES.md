Pulse Windows desktop preview. Download the win-x64-setup.exe installer; SHA256SUMS.txt contains its checksum.

- Per-user installation for Windows 10 1809+ and Windows 11 on x64 (ARM64 via x64 compatibility).
- .NET and Windows App SDK included; WebView2 is detected and installed from Microsoft if missing (Internet required in that case).
- Svelte timeline views, Jira import, encrypted local credential storage, native search, Light/Dark/System appearance.
- Updates and uninstall preserve plans and encrypted credentials on the device.
- Installer is currently unsigned; Windows SmartScreen may show an unknown-publisher warning.
- This preview reads Jira and keeps planning edits locally; Jira write-back is disabled.

CI runs frontend/backend tests plus an install → native/WebView startup → reinstall/upgrade → startup → uninstall lifecycle test before publishing this asset.
