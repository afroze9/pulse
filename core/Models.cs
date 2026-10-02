using System.Text.Json.Serialization;
namespace Pulse;
// Typed API domain projection; unknown visual/provenance properties remain in the persisted JSON document.
public sealed record WorkspaceData(List<Project> Projects,List<Person> People,List<Sprint> Sprints,List<Epic> Epics,List<Story> Stories);
public sealed record Project(string Id,string Name,string Key);
public sealed record Person(string Id,string Name);
public sealed record Sprint(string Id,string Project,string Name,DateOnly? Start,DateOnly? End);
public sealed record Epic(string Id,string Project,string Title,DateOnly? PlannedStart,DateOnly? PlannedEnd,DateOnly? ActualStart,DateOnly? ActualEnd);
public sealed record Story(string Id,string Project,string Title,string? Epic,string? Sprint,string? Person,decimal? Points,DateOnly? PlannedStart,DateOnly? PlannedEnd,DateOnly? ActualStart,DateOnly? ActualEnd);
