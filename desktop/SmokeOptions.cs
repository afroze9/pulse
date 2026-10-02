namespace Pulse.Desktop;
internal static class SmokeOptions
{
    public static bool Enabled => Environment.GetCommandLineArgs().Contains("--smoke-test");
    public static string Report => Path.GetFullPath(Environment.GetEnvironmentVariable("PULSE_SMOKE_REPORT") ?? throw new InvalidOperationException("PULSE_SMOKE_REPORT is required."));
    public static string DataDirectory => Path.Combine(Path.GetDirectoryName(Report)!, "profile");
    public static readonly string InstanceId = Guid.NewGuid().ToString("N");
}
