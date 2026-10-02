param([string]$ToolsDirectory = (Join-Path $env:LOCALAPPDATA 'PulseBuild\InnoSetup'))
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $ToolsDirectory -Force | Out-Null
$compiler = Join-Path $ToolsDirectory 'compiler\ISCC.exe'
if (!(Test-Path -LiteralPath $compiler)) {
    $setup = Join-Path $ToolsDirectory 'innosetup-6.7.3.exe'
    Invoke-WebRequest 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe' -OutFile $setup
    if ((Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash -ne '9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732') { throw 'Inno Setup checksum mismatch.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $setup
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Pyrsys') { throw 'Inno Setup signature verification failed.' }
    $process = Start-Process -FilePath $setup -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/CURRENTUSER',('/DIR="' + (Join-Path $ToolsDirectory 'compiler') + '"')) -PassThru -WindowStyle Hidden
    if (!$process.WaitForExit(120000) -or $process.ExitCode -ne 0) { throw 'Inno Setup installation failed.' }
}
if (!(Test-Path -LiteralPath $compiler)) { throw 'Inno Setup compiler is unavailable.' }
$bootstrapper = Join-Path $ToolsDirectory 'MicrosoftEdgeWebview2Setup.exe'
if (!(Test-Path -LiteralPath $bootstrapper)) { Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper }
$signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'WebView2 bootstrapper signature verification failed.' }
[pscustomobject]@{ Compiler = $compiler; WebViewBootstrapper = $bootstrapper }
