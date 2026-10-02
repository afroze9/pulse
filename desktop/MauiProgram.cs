using Microsoft.Extensions.DependencyInjection;
using Pulse;
namespace Pulse.Desktop;
public static class MauiProgram
{
    private static Mutex? instance;
    public static MauiApp CreateMauiApp()
    {
        instance = new Mutex(true, SmokeOptions.Enabled ? "Local\\Pulse.Desktop.Smoke." + SmokeOptions.InstanceId : "Local\\Pulse.Desktop", out var firstInstance);
        if (!firstInstance) Environment.Exit(0);
        var builder = MauiApp.CreateBuilder().UseMauiApp<App>();
        // Field mappings remain optional; account credentials live only in SecureStorage.
        foreach (var field in new[] { "POINTS", "SPRINT", "PLANNED_START", "PLANNED_END", "ACTUAL_START", "ACTUAL_END" })
        {
            var key = "PULSE_JIRA_FIELD_" + field;
            if (Environment.GetEnvironmentVariable(key) is { } value) builder.Configuration[key] = value;
        }
        var dataDirectory = SmokeOptions.Enabled ? SmokeOptions.DataDirectory : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pulse");
        Directory.CreateDirectory(dataDirectory);
        builder.Services.AddSingleton(new WorkspaceStore(Path.Combine(dataDirectory, "workspace.json")));
        builder.Services.AddSingleton<ICredentialStore>(new MauiCredentialStore(SmokeOptions.Enabled ? "pulse.smoke." + SmokeOptions.InstanceId : "pulse.jira.connection.v1"));
        builder.Services.AddSingleton(sp => new PulseBridge(sp.GetRequiredService<WorkspaceStore>(), sp.GetRequiredService<ICredentialStore>(), builder.Configuration));
        builder.Services.AddSingleton<MainPage>();
        return builder.Build();
    }
}
