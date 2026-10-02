#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef PublishDir
  #error PublishDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef WebViewBootstrapper
  #error WebViewBootstrapper is required
#endif
[Setup]
AppId={{9A9A16D4-A51F-4DC9-AB84-6C44E4472638}
AppName=Pulse
AppVersion={#AppVersion}
AppPublisher=afroze9
AppPublisherURL=https://github.com/afroze9/pulse
AppSupportURL=https://github.com/afroze9/pulse/issues
DefaultDirName={localappdata}\Programs\Pulse
DefaultGroupName=Pulse
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutputDir}
OutputBaseFilename=Pulse-{#AppVersion}-win-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\Pulse.Desktop.exe
AppMutex=Local\Pulse.Desktop
CloseApplications=yes
CloseApplicationsFilter=Pulse.Desktop.exe
RestartApplications=no
SetupLogging=yes

[Tasks]
Name: desktopicon; Description: "Create a Desktop Shortcut"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Excludes: "*.pdb"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#WebViewBootstrapper}"; Flags: dontcopy

[Icons]
Name: "{userprograms}\Pulse"; Filename: "{app}\Pulse.Desktop.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\Pulse"; Filename: "{app}\Pulse.Desktop.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Pulse.Desktop.exe"; Description: "Open Pulse"; Flags: nowait postinstall skipifsilent

[Code]
function WebViewInstalled: Boolean;
var Version: String;
begin
  Result := (RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var ExitCode: Integer;
begin
  Result := '';
  if not WebViewInstalled then begin
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
      Result := 'Unable to start the Microsoft WebView2 installer. Install WebView2 and run Pulse Setup again.';
      exit;
    end;
    if not WebViewInstalled then
      Result := 'Microsoft WebView2 is required. Connect to the Internet, install the WebView2 Runtime, and run Pulse Setup again. Pulse has not been installed.';
  end;
end;
