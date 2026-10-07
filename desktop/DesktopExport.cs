using System.Text.Json;
using Windows.Storage;
using Windows.Storage.Pickers;

namespace Pulse.Desktop;

internal static class DesktopExport
{
    private static bool saving;
    public static async Task<string> Save(JsonElement body, Microsoft.Maui.Controls.Window window)
    {
        string Reply(int status, object result) => JsonSerializer.Serialize(new { status, body = result });
        if (saving) return Reply(409, new { message = "Finish the open Save As dialog first." });
        saving = true;
        try
        {
            var name = Path.GetFileName(body.GetProperty("filename").GetString() ?? "");
            var extension = Path.GetExtension(name).ToLowerInvariant();
            if (extension is not (".pdf" or ".png" or ".svg"))
                return Reply(400, new { message = "Unsupported export format." });
            var encoded = body.GetProperty("base64").GetString() ?? "";
            if (encoded.Length > 70_000_000)
                return Reply(413, new { message = "Export is too large. Choose fewer projects or a shorter date range." });
            var bytes = Convert.FromBase64String(encoded);
            if (bytes.Length == 0) return Reply(400, new { message = "Export is empty." });
            return await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                var picker = new FileSavePicker { SuggestedStartLocation = PickerLocationId.DocumentsLibrary, SuggestedFileName = Path.GetFileNameWithoutExtension(name) };
                picker.FileTypeChoices.Add(extension.TrimStart('.').ToUpperInvariant(), new List<string> { extension });
                var native = (Microsoft.UI.Xaml.Window)window.Handler!.PlatformView!;
                WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(native));
                var file = await picker.PickSaveFileAsync();
                if (file is null) return Reply(200, new { saved = false });
                await FileIO.WriteBytesAsync(file, bytes);
                return Reply(200, new { saved = true });
            });
        }
        catch { return Reply(500, new { message = "Could not save the export. Check the destination and try again." }); }
        finally { saving = false; }
    }
}
