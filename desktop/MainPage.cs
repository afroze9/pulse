using System.Text.Json;
using Pulse;
using Microsoft.Maui.Platform;
namespace Pulse.Desktop;
public sealed class MainPage : ContentPage
{
    private readonly HybridWebView web;
    public event Action<string, JsonElement>? TitleBarMessage;
    public void SendTitleBarEvent(string type, object? payload) => web.SendRawMessage(JsonSerializer.Serialize(new { channel = "pulse-ui", type, payload }));
    public void FocusContent() => web.Focus();
    public MainPage(PulseBridge bridge)
    {
        BackgroundColor = Color.FromArgb("#f7f8f4");
        web = new HybridWebView { HybridRoot = "wwwroot", DefaultFile = "index.html" };
        web.RawMessageReceived += async (_, args) =>
        {
            string? id = null;
            try
            {
                using var message = JsonDocument.Parse(args.Message ?? "");
                var root = message.RootElement;
                if (root.GetProperty("channel").GetString() == "pulse-ui") { NativeSelfTest.Observe(root.GetProperty("type").GetString()!, root.GetProperty("payload")); TitleBarMessage?.Invoke(root.GetProperty("type").GetString()!, root.GetProperty("payload")); return; }
                if (root.GetProperty("channel").GetString() != "pulse") return;
                id = root.GetProperty("id").GetString();
                if (!Guid.TryParse(id, out var requestId)) return;
                var request = root.GetProperty("request").GetString();
                if (request is null) return;
                var response = await bridge.Dispatch(request);
                web.SendRawMessage(JsonSerializer.Serialize(new { channel = "pulse", id, result = response }));
            }
            catch
            {
                // Never reflect requests or credential values into diagnostics.
                if (id is not null) web.SendRawMessage(JsonSerializer.Serialize(new { channel = "pulse", id, error = true }));
            }
        };
        web.HandlerChanged += (_, _) =>
        {
            if (web.Handler?.PlatformView is MauiHybridWebView native)
                native.RunAfterInitialize(() =>
                {
                    native.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
                    native.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
                    native.CoreWebView2.NavigationStarting += (_, args) =>
                    {
                        if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Host != "0.0.0.1") args.Cancel = true;
                    };
                    native.CoreWebView2.NewWindowRequested += (_, args) => { args.Handled = true; };
                });
        };
        Content = web;
        if (SmokeOptions.Enabled || Environment.GetCommandLineArgs().Contains("--self-test"))
            Loaded += async (_, _) => await NativeSelfTest.Run();
    }
}
