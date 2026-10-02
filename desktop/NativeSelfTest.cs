using System.Text.Json;
using Pulse;
namespace Pulse.Desktop;
// Opt-in Windows integration check; uses an isolated key and never touches the user's connection.
internal static class NativeSelfTest
{
    private static bool started;
    private static readonly TaskCompletionSource frontendReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private static readonly TaskCompletionSource workspaceReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
    internal static void Observe(string type, JsonElement payload)
    {
        if (type == "ready") frontendReady.TrySetResult();
        if (type == "state" && payload.TryGetProperty("phase", out var phase) && phase.GetString() == "ready") workspaceReady.TrySetResult();
    }
    internal static async Task Run()
    {
        if (started) return;
        started = true;
        var key = "pulse.selftest." + Guid.NewGuid();
        var store = new MauiCredentialStore(key);
        var token = "pulse-test-" + Guid.NewGuid();
        var checks = new Dictionary<string, bool>();
        try
        {
            if (SmokeOptions.Enabled)
            {
                await Task.WhenAll(frontendReady.Task, workspaceReady.Task).WaitAsync(TimeSpan.FromSeconds(60));
                checks["bundledFrontendLoaded"] = true;
                checks["nativeWorkspaceBridgeReady"] = true;
                checks["isolatedWorkspace"] = Directory.Exists(SmokeOptions.DataDirectory);
            }
            await store.Save(new JiraCredentials("https://fixture.atlassian.net", "fixture@example.invalid", token));
            var reloaded = await new MauiCredentialStore(key).Load();
            checks["secureStorageRoundTrip"] = reloaded?.Token == token && reloaded.Username == "fixture@example.invalid";
            var encryptedFile = Path.Combine(Directory.GetParent(FileSystem.AppDataDirectory)!.FullName, "Settings", "securestorage.dat");
            checks["encryptedFilePresent"] = File.Exists(encryptedFile);
            if (File.Exists(encryptedFile))
            {
                var content = await File.ReadAllTextAsync(encryptedFile);
                checks["noPlaintextToken"] = !content.Contains(token);
                checks["noPlaintextAccount"] = !content.Contains("fixture@example.invalid");
            }
            await store.Remove();
            checks["forgetRemovesTestEntry"] = await store.Load() is null;
        }
        catch { checks["nativeStorageError"] = false; }
        finally
        {
            try { await store.Remove(); } catch { }
            var report = SmokeOptions.Enabled ? SmokeOptions.Report : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pulse", "desktop-self-test.json");
            await File.WriteAllTextAsync(report, JsonSerializer.Serialize(checks, new JsonSerializerOptions { WriteIndented = true }));
            if (SmokeOptions.Enabled) Environment.Exit(checks.Count >= 8 && checks.Values.All(value => value) ? 0 : 1);
        }
    }
}
