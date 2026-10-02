[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$pulseProject = Join-Path $PSScriptRoot '..\server\Pulse.Api.csproj'
$pulseSettings = @{}
$pulseSecureToken = $null

try {
    foreach ($pulseEntry in @(
        @{ Key = 'PULSE_JIRA_URL'; Prompt = 'Jira Cloud URL (https://your-company.atlassian.net)' },
        @{ Key = 'PULSE_JIRA_EMAIL'; Prompt = 'Jira account email' }
    )) {
        $pulseValue = [Environment]::GetEnvironmentVariable($pulseEntry.Key, 'Process')
        if ([string]::IsNullOrWhiteSpace($pulseValue)) {
            $pulseValue = Read-Host $pulseEntry.Prompt
        }
        if ([string]::IsNullOrWhiteSpace($pulseValue)) { throw "$($pulseEntry.Key) is required." }
        $pulseSettings[$pulseEntry.Key] = $pulseValue.Trim()
    }

    $pulseUri = $null
    if (-not [Uri]::TryCreate($pulseSettings['PULSE_JIRA_URL'], [UriKind]::Absolute, [ref]$pulseUri) -or $pulseUri.Scheme -ne 'https') {
        throw 'The Jira URL must be an absolute HTTPS URL.'
    }

    $pulseToken = [Environment]::GetEnvironmentVariable('PULSE_JIRA_TOKEN', 'Process')
    if ([string]::IsNullOrWhiteSpace($pulseToken)) {
        $pulseSecureToken = Read-Host 'Jira API token' -AsSecureString
        $pulseToken = [System.Net.NetworkCredential]::new('', $pulseSecureToken).Password
    }
    if ([string]::IsNullOrWhiteSpace($pulseToken)) { throw 'A Jira API token is required.' }
    $pulseSettings['PULSE_JIRA_TOKEN'] = $pulseToken

    # Keep any field mappings already configured in this terminal. Omitted keys
    # remain unchanged in User Secrets because `set` merges the supplied keys.
    foreach ($pulseField in @('POINTS', 'SPRINT', 'PLANNED_START', 'PLANNED_END', 'ACTUAL_START', 'ACTUAL_END')) {
        $pulseKey = 'PULSE_JIRA_FIELD_' + $pulseField
        $pulseValue = [Environment]::GetEnvironmentVariable($pulseKey, 'Process')
        if (-not [string]::IsNullOrWhiteSpace($pulseValue)) { $pulseSettings[$pulseKey] = $pulseValue }
    }

    # Send credentials over stdin, never as literal command arguments or files in the repo.
    $pulseSettings | ConvertTo-Json -Compress | & dotnet user-secrets set --project $pulseProject
    if ($LASTEXITCODE -ne 0) { throw 'Unable to save Jira configuration to .NET User Secrets.' }
    Write-Host 'Jira settings saved to .NET User Secrets. Restart Pulse to apply them.'
    Write-Host 'Future starts: dotnet run --project server/Pulse.Api.csproj'
}
finally {
    if ($pulseSecureToken) { $pulseSecureToken.Dispose() }
    if ($pulseSettings) { $pulseSettings.Clear() }
    $pulseToken = $null
    $pulseValue = $null
}
