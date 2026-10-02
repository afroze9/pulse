param([string]$Version, [string]$DotNetPath = 'dotnet')
$ErrorActionPreference = 'Stop'
$pulseRoot = Split-Path $PSScriptRoot -Parent
if (!$Version) { $Version = (Get-Content (Join-Path $pulseRoot 'version.json') -Raw | ConvertFrom-Json).version }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must have three numeric components.' }
$publish = [IO.Path]::GetFullPath((Join-Path $pulseRoot 'artifacts\installer-payload'))
$expected = [IO.Path]::GetFullPath((Join-Path $pulseRoot 'artifacts')) + [IO.Path]::DirectorySeparatorChar
if (!$publish.StartsWith($expected, [StringComparison]::OrdinalIgnoreCase)) { throw 'Publish path is outside artifacts.' }
if (Test-Path -LiteralPath $publish) { Remove-Item -LiteralPath $publish -Recurse -Force }
$tools = & (Join-Path $PSScriptRoot 'Get-InstallerTools.ps1')
Push-Location $pulseRoot
try {
    & npm.cmd run build:desktop
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    & $DotNetPath publish desktop/Pulse.Desktop.csproj -c Release -o $publish "-p:ApplicationDisplayVersion=$Version" "-p:Version=$Version"
    if ($LASTEXITCODE -ne 0) { throw 'Desktop publish failed.' }
    foreach ($file in @('Pulse.Desktop.exe','coreclr.dll','Microsoft.UI.Xaml.dll','wwwroot\index.html','wwwroot\pulse-native.js')) {
        if (!(Test-Path -LiteralPath (Join-Path $publish $file))) { throw "Required self-contained payload missing: $file" }
    }
    if (Get-ChildItem -LiteralPath $publish -Recurse -File | Where-Object { $_.Name -in @('workspace.json','securestorage.dat','.env','secrets.json') }) { throw 'User data must never be packaged.' }
    $output = Join-Path $pulseRoot 'artifacts\installer'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    & $tools.Compiler "/DAppVersion=$Version" "/DPublishDir=$publish" "/DOutputDir=$output" "/DWebViewBootstrapper=$($tools.WebViewBootstrapper)" installer/Pulse.iss
    if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
    $installer = Join-Path $output "Pulse-$Version-win-x64-setup.exe"
    $hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'), "$hash  $([IO.Path]::GetFileName($installer))" + [Environment]::NewLine)
    Write-Output $installer
} finally { Pop-Location }
