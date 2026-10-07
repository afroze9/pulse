using System.Text.Json;
using AutoSuggestBox = Microsoft.UI.Xaml.Controls.AutoSuggestBox;
using KeyboardAccelerator = Microsoft.UI.Xaml.Input.KeyboardAccelerator;
using Windows.System;
namespace Pulse.Desktop;
public sealed class PulseTitleBar
{
    private readonly MainPage page;
    private readonly SearchBar search;
    private readonly Button connection;
    private readonly Button refresh;
    private AutoSuggestBox? nativeSearch;
    private List<SearchHit> results = [];
    private bool selecting;
    private Window? window;
    private string appearanceMode = Preferences.Default.Get("pulse.appearance", "system");
    public TitleBar View { get; }
    public PulseTitleBar(MainPage page)
    {
        this.page = page;
        search = new SearchBar { Placeholder = "Search Pulse · Ctrl+K", FontSize = 13, TextColor = Color.FromArgb("#183e36"), PlaceholderColor = Color.FromArgb("#456353"), BackgroundColor = Colors.Transparent, MaximumWidthRequest = 500, HorizontalOptions = LayoutOptions.Fill, VerticalOptions = LayoutOptions.Center, IsEnabled = false };
        SemanticProperties.SetDescription(search, "Search Tickets, Epics, Projects, and People");
        search.TextChanged += (_, args) => { if (!selecting) page.SendTitleBarEvent("search", new { query = args.NewTextValue ?? "" }); };
        search.HandlerChanged += (_, _) =>
        {
            if (search.Handler?.PlatformView is not AutoSuggestBox box) return;
            nativeSearch = box;
            box.RequestedTheme = NativeTheme;
            box.UpdateTextOnSelect = false;
            box.QuerySubmitted += (_, args) => Open(args.ChosenSuggestion as SearchHit ?? results.FirstOrDefault());
            box.KeyDown += (_, args) => { if (args.Key == VirtualKey.Escape) { ClearSearch(); args.Handled = true; } };
        };
        connection = new Button { Text = "Connect Jira", FontSize = 12, Padding = new Thickness(12, 5), BackgroundColor = Colors.Transparent, TextColor = Color.FromArgb("#456353"), VerticalOptions = LayoutOptions.Center };
        connection.Clicked += (_, _) => page.SendTitleBarEvent("configure", null);
        refresh = new Button { Text = "\uE72C", FontFamily = "Segoe MDL2 Assets", FontSize = 15, WidthRequest = 36, HeightRequest = 34, Padding = 0, BackgroundColor = Colors.Transparent, TextColor = Color.FromArgb("#456353"), IsEnabled = false, VerticalOptions = LayoutOptions.Center };
        SemanticProperties.SetDescription(refresh, "Refresh Jira");
        ToolTipProperties.SetText(refresh, "Refresh Jira");
        refresh.Clicked += (_, _) => page.SendTitleBarEvent("refresh", null);
        View = new TitleBar { Title = "Pulse", Subtitle = "Portfolio Planning", HeightRequest = 56, BackgroundColor = Color.FromArgb("#f7f8f4"), ForegroundColor = Color.FromArgb("#183e36"), Content = search, TrailingContent = new HorizontalStackLayout { Spacing = 4, Padding = new Thickness(8, 0, 12, 0), Children = { connection, refresh } } };
        page.TitleBarMessage += Receive;
        if (Application.Current is { } app) { app.UserAppTheme = SelectedTheme; app.RequestedThemeChanged += OnThemeChanged; }
        ApplyAppearance();
    }
    public void Attach(Window window)
    {
        this.window = window;
        window.Destroying += (_, _) => { if (Application.Current is { } app) app.RequestedThemeChanged -= OnThemeChanged; page.TitleBarMessage -= Receive; };
        window.Created += (_, _) =>
        {
            if (window.Handler?.PlatformView is not Microsoft.UI.Xaml.Window native || native.Content is not Microsoft.UI.Xaml.UIElement content) return;
            ApplyAppearance();
            var shortcut = new KeyboardAccelerator { Key = VirtualKey.K, Modifiers = VirtualKeyModifiers.Control };
            shortcut.Invoked += (_, args) => { FocusSearch(); args.Handled = true; };
            // The shortcut is window-wide; its automatic tooltip would also cover the whole window.
            // Keep the shortcut discoverable in the search placeholder instead.
            content.KeyboardAcceleratorPlacementMode = Microsoft.UI.Xaml.Input.KeyboardAcceleratorPlacementMode.Hidden;
            content.KeyboardAccelerators.Add(shortcut);
        };
    }
    private AppTheme SelectedTheme => appearanceMode switch { "light" => AppTheme.Light, "dark" => AppTheme.Dark, _ => AppTheme.Unspecified };
    private Microsoft.UI.Xaml.ElementTheme NativeTheme => appearanceMode switch { "light" => Microsoft.UI.Xaml.ElementTheme.Light, "dark" => Microsoft.UI.Xaml.ElementTheme.Dark, _ => Microsoft.UI.Xaml.ElementTheme.Default };
    private bool IsDark => Application.Current?.RequestedTheme == AppTheme.Dark;
    private void OnThemeChanged(object? sender, AppThemeChangedEventArgs args) => MainThread.BeginInvokeOnMainThread(ApplyAppearance);
    private void ApplyAppearance()
    {
        var dark = IsDark;
        var background = Color.FromArgb(dark ? "#14211b" : "#f7f8f4");
        var foreground = Color.FromArgb(dark ? "#e1ebe5" : "#183e36");
        var muted = Color.FromArgb(dark ? "#c0d2c7" : "#456353");
        View.BackgroundColor = background; View.ForegroundColor = foreground;
        page.BackgroundColor = background;
        search.TextColor = foreground; search.PlaceholderColor = muted;
        connection.TextColor = muted; refresh.TextColor = muted;
        if (nativeSearch is { } box) box.RequestedTheme = NativeTheme;
        if (window?.Handler?.PlatformView is Microsoft.UI.Xaml.Window native)
        {
            if (native.Content is Microsoft.UI.Xaml.FrameworkElement content) content.RequestedTheme = NativeTheme;
            var chrome = native.AppWindow.TitleBar;
            static Windows.UI.Color Win(Color c) => Windows.UI.Color.FromArgb(255, (byte)(c.Red * 255), (byte)(c.Green * 255), (byte)(c.Blue * 255));
            chrome.ButtonForegroundColor = Win(foreground); chrome.ButtonInactiveForegroundColor = Win(muted);
            chrome.ButtonBackgroundColor = Win(background); chrome.ButtonInactiveBackgroundColor = Win(background);
            chrome.ButtonHoverForegroundColor = Win(foreground); chrome.ButtonHoverBackgroundColor = Win(Color.FromArgb(dark ? "#34483c" : "#e5ebe4"));
            chrome.ButtonPressedForegroundColor = Win(foreground); chrome.ButtonPressedBackgroundColor = Win(Color.FromArgb(dark ? "#40584a" : "#d7e1d8"));
        }
        page.SendTitleBarEvent("appearance", new { mode = appearanceMode, resolved = dark ? "dark" : "light" });
    }
    private void FocusSearch() { search.Focus(); }
    private void ClearSearch() { selecting = true; search.Text = ""; selecting = false; results = []; if (nativeSearch is { } box) { box.ItemsSource = null; box.IsSuggestionListOpen = false; } }
    private void Open(SearchHit? hit)
    {
        if (hit is null || hit.Kind == "none") return;
        page.SendTitleBarEvent("open", new { kind = hit.Kind, id = hit.Id });
        ClearSearch();
        page.FocusContent();
    }
    private void Receive(string type, JsonElement payload)
    {
        if (type == "focusSearch") { FocusSearch(); return; }
        if (type == "ready") { search.IsEnabled = true; ApplyAppearance(); return; }
        if (type == "appearance")
        {
            var mode = payload.GetProperty("mode").GetString();
            if (mode is not ("light" or "dark" or "system")) return;
            appearanceMode = mode; Preferences.Default.Set("pulse.appearance", mode);
            if (Application.Current is { } app) app.UserAppTheme = SelectedTheme;
            ApplyAppearance(); return;
        }
        if (type == "state")
        {
            var configured = payload.GetProperty("configured").GetBoolean();
            var connected = payload.GetProperty("connected").GetBoolean();
            var busy = payload.GetProperty("busy").GetBoolean();
            refresh.IsEnabled = payload.GetProperty("canSync").GetBoolean();
            connection.Text = busy ? "Saving…" : !configured ? "Connect Jira" : connected ? "Jira Connected" : "Jira Ready";
            var last = payload.GetProperty("lastSync").GetString();
            ToolTipProperties.SetText(connection, last is not null && DateTimeOffset.TryParse(last, out var date) ? "Last Import: " + date.ToLocalTime().ToString("g") + " · Open Configuration" : "Open Jira Configuration");
            return;
        }
        if (type != "searchResults" || payload.GetProperty("query").GetString() != (search.Text ?? "") || nativeSearch is null) return;
        results = payload.GetProperty("items").EnumerateArray().Select(item => new SearchHit(item.GetProperty("id").GetString()!, item.GetProperty("kind").GetString()!, item.GetProperty("label").GetString()!)).ToList();
        if (string.IsNullOrWhiteSpace(search.Text)) { nativeSearch.ItemsSource = null; nativeSearch.IsSuggestionListOpen = false; return; }
        nativeSearch.ItemsSource = results.Count > 0 ? results : new List<SearchHit> { new("", "none", "No Matches in This Workspace") };
        nativeSearch.IsSuggestionListOpen = true;
    }
    private sealed record SearchHit(string Id, string Kind, string Label) { public override string ToString() => Label; }
}
