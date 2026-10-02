param([switch]$Publish, [switch]$ImportExistingWorkspace, [string]$DotNetPath)
$ErrorActionPreference = 'Stop'
$pulseRoot = Split-Path $PSScriptRoot -Parent
if (!$DotNetPath) {
    $privateSdk = Join-Path $env:LOCALAPPDATA 'PulseBuild\portable\dotnet.exe'
    $DotNetPath = if (Test-Path -LiteralPath $privateSdk) { $privateSdk } else { 'dotnet' }
}
Push-Location $pulseRoot
try {
    & npm.cmd run build:desktop
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    if ($Publish) {
        & $DotNetPath publish desktop/Pulse.Desktop.csproj -c Release -o artifacts/desktop
    } else {
        & $DotNetPath build desktop/Pulse.Desktop.csproj -c Debug
    }
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
    if ($ImportExistingWorkspace) {
        $pulseData = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Pulse'
        $source = Join-Path $pulseRoot 'server/App_Data/workspace.json'
        $target = Join-Path $pulseData 'workspace.json'
        if ((Test-Path -LiteralPath $source) -and !(Test-Path -LiteralPath $target)) {
            New-Item -ItemType Directory -Path $pulseData -Force | Out-Null
            Copy-Item -LiteralPath $source -Destination $target
            Write-Host 'Copied existing workspace into desktop app data. Original retained.'
        }
    }
} finally { Pop-Location }
