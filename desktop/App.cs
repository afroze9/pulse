namespace Pulse.Desktop;
public sealed class App(MainPage page) : Application
{
    protected override Window CreateWindow(IActivationState? activationState)
    {
        var titleBar = new PulseTitleBar(page);
        var window = new Window(page) { Title = "Pulse — Portfolio Planning", TitleBar = titleBar.View, Width = 1440, Height = 960, MinimumWidth = 900, MinimumHeight = 600 };
        titleBar.Attach(window);
        return window;
    }
}
