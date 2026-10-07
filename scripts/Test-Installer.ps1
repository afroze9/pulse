param([Parameter(Mandatory)][string]$Installer, [string]$PreviousInstaller, [string]$Version = '0.1.2')
$ErrorActionPreference = 'Stop'
$pulseRoot = Split-Path $PSScriptRoot -Parent
$testRoot = Join-Path $pulseRoot ('artifacts\installer-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$installDir = Join-Path $testRoot 'Installed Pulse'
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{9A9A16D4-A51F-4DC9-AB84-6C44E4472638}_is1'
if (Test-Path -LiteralPath $registry) { throw 'An installed Pulse already exists. Run this lifecycle test in a clean Windows user profile; it will not overwrite that install.' }
$workspace = Join-Path $env:LOCALAPPDATA 'Pulse\workspace.json'
$beforeWorkspace = if (Test-Path -LiteralPath $workspace) { (Get-FileHash -LiteralPath $workspace).Hash } else { $null }
$checks = [ordered]@{}
function Run-Setup([string]$File, [string]$Log) {
    $proc = Start-Process -FilePath ([IO.Path]::GetFullPath($File)) -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/DIR="' + $installDir + '"'),('/LOG="' + (Join-Path $testRoot $Log) + '"')) -PassThru -WindowStyle Hidden
    if (!$proc.WaitForExit(180000)) { $proc.Kill(); throw 'Installer timed out.' }
    if ($proc.ExitCode -ne 0) { throw "Installer failed: $($proc.ExitCode). See $testRoot" }
}
function Run-Smoke([string]$Name) {
    $report = Join-Path $testRoot "$Name.json"
    $oldReport = $env:PULSE_SMOKE_REPORT
    try {
        $env:PULSE_SMOKE_REPORT = $report
        $proc = Start-Process -FilePath (Join-Path $installDir 'Pulse.Desktop.exe') -ArgumentList '--smoke-test' -PassThru -WindowStyle Hidden
        if (!$proc.WaitForExit(90000)) { $proc.Kill(); throw 'Installed app smoke test timed out.' }
        if ($proc.ExitCode -ne 0 -or !(Test-Path -LiteralPath $report)) { throw "Installed app did not pass startup: $($proc.ExitCode)" }
        $result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
        if (@($result.PSObject.Properties).Count -lt 8 -or @($result.PSObject.Properties | Where-Object Value -ne $true).Count) { throw 'Native smoke test failed.' }
        $checks[$Name] = $true
    } finally { $env:PULSE_SMOKE_REPORT = $oldReport }
}
Run-Setup $(if ($PreviousInstaller) { $PreviousInstaller } else { $Installer }) 'install.log'
$checks['executableInstalled'] = Test-Path -LiteralPath (Join-Path $installDir 'Pulse.Desktop.exe')
$checks['startMenuShortcut'] = Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) 'Pulse.lnk')
$checks['uninstallRegistered'] = Test-Path -LiteralPath $registry
Run-Smoke 'first-launch'
$profile = Join-Path $testRoot 'profile'
$marker = Join-Path $profile 'preserve-across-upgrade.txt'
[IO.File]::WriteAllText($marker, 'installer must preserve app data')
Run-Setup $Installer 'upgrade.log'
$checks['upgradePreservesData'] = (Get-Content -LiteralPath $marker -Raw) -eq 'installer must preserve app data'
$checks['versionRegistered'] = (Get-ItemProperty -LiteralPath $registry).DisplayVersion -eq $Version
Run-Smoke 'upgraded-launch'
$uninstaller = Join-Path $installDir 'unins000.exe'
$proc = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="' + (Join-Path $testRoot 'uninstall.log') + '"')) -PassThru -WindowStyle Hidden
if (!$proc.WaitForExit(60000) -or $proc.ExitCode -ne 0) { throw 'Uninstall failed.' }
$deadline = (Get-Date).AddSeconds(15)
while ((Test-Path -LiteralPath (Join-Path $installDir 'Pulse.Desktop.exe')) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
$checks['executableRemoved'] = !(Test-Path -LiteralPath (Join-Path $installDir 'Pulse.Desktop.exe'))
$checks['shortcutRemoved'] = !(Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) 'Pulse.lnk'))
$checks['uninstallRegistrationRemoved'] = !(Test-Path -LiteralPath $registry)
$checks['uninstallPreservesData'] = Test-Path -LiteralPath $marker
$afterWorkspace = if (Test-Path -LiteralPath $workspace) { (Get-FileHash -LiteralPath $workspace).Hash } else { $null }
$checks['realWorkspaceUntouched'] = $beforeWorkspace -eq $afterWorkspace
$checks | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $testRoot 'lifecycle.json')
if (@($checks.Values | Where-Object { !$_ }).Count) { throw "Installer lifecycle checks failed. See $testRoot" }
Write-Host "PASS: installation, startup, upgrade, startup after upgrade, uninstall, and data preservation. Logs: $testRoot"
