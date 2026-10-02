using System.Text.Json;
using Pulse;
namespace Pulse.Desktop;
public sealed class MauiCredentialStore(string key = "pulse.jira.connection.v1") : ICredentialStore
{
    private readonly string Key = key;
    public async Task<JiraCredentials?> Load()
    {
        var value = await SecureStorage.Default.GetAsync(Key);
        if (string.IsNullOrEmpty(value)) return null;
        using var document = JsonDocument.Parse(value);
        var item = document.RootElement;
        return new JiraCredentials(item.GetProperty("url").GetString()!, item.GetProperty("username").GetString()!, item.GetProperty("token").GetString()!);
    }
    public Task Save(JiraCredentials credentials) => SecureStorage.Default.SetAsync(Key, JsonSerializer.Serialize(new
    {
        url = credentials.Url, username = credentials.Username, token = credentials.Token
    }));
    public Task Remove() { SecureStorage.Default.Remove(Key); return Task.CompletedTask; }
}
