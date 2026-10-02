using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
namespace Pulse;
public record Scope(string[] Projects, string[] People, string[] Types);
public record SaveRequest(long ExpectedVersion, JsonObject Data, Scope Configuration, string CommandId);
public record UndoRequest(long ExpectedVersion, string CommandId);
public record SyncRequest(long ExpectedVersion, string CommandId, string[]? ProjectKeys);
public sealed class State {
 public long Version {get;set;}=1;
 public JsonObject Data {get;set;}=new();
 public Scope Configuration {get;set;}=new([],[],["epic","story","bug","task"]);
 public List<Snapshot> History {get;set;}=[];
 public Dictionary<string,long> Commands {get;set;}=new();
 public string Source {get;set;}="local";
 public JsonObject? SourceData {get;set;}
 public DateTimeOffset? LastSync {get;set;}
}
public record Snapshot(JsonObject Data, Scope Configuration, string Source, JsonObject? SourceData, DateTimeOffset? LastSync);
public sealed class DomainException(int status, string message):Exception(message) { public int Status=>status; }
public sealed class WorkspaceStore {
 readonly string path; readonly SemaphoreSlim gate=new(1); State state;
 public static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web){WriteIndented=true};
 public WorkspaceStore(string path,JsonObject? initialData=null) {
  this.path=path;
  state=File.Exists(path)?JsonSerializer.Deserialize<State>(File.ReadAllText(path),Json)??throw new Exception("Invalid workspace file"):new State{Data=Normalize((JsonObject?)initialData?.DeepClone()??new JsonObject())};
  if(!File.Exists(path)) state.Configuration=new(Ids(state.Data,"projects"),Ids(state.Data,"people"),["epic","story","bug","task"]);
 }
 public static string[] Ids(JsonObject d,string key)=>d[key]!.AsArray().Select(x=>x?["id"]?.ToString()??"").ToArray();
 public static JsonObject Normalize(JsonObject d) {
  foreach(var key in new[]{"projects","people","sprints","epics","stories","dependencies"}) d[key]??=new JsonArray();
  foreach(var e in d["epics"]!.AsArray()) {e!["type"]??="epic";e["plannedStart"]??=e["start"]?.DeepClone();e["plannedEnd"]??=e["end"]?.DeepClone();}
  foreach(var s in d["stories"]!.AsArray()) {
   s!["type"]??="story";
   s["project"]??=d["epics"]!.AsArray().FirstOrDefault(e=>Text(e,"id")==Text(s,"epic"))?["project"]?.DeepClone();
   var sprint=d["sprints"]!.AsArray().FirstOrDefault(e=>Text(e,"id")==Text(s,"sprint"));
   if(!s.AsObject().ContainsKey("plannedStart")) s["plannedStart"]=null;
   if(!s.AsObject().ContainsKey("plannedEnd")) s["plannedEnd"]=null;
  }
  return d;
 }
 public static string? Text(JsonNode? n,string k)=>n?[k]?.ToString();
 public static void Validate(JsonObject d,Scope scope) {
  if(d==null||scope==null||scope.Projects==null||scope.People==null||scope.Types==null)throw new DomainException(400,"Data and configuration arrays are required.");
  foreach(var key in new[]{"projects","people","sprints","epics","stories","dependencies"}) if(d[key] is not JsonArray) throw new DomainException(400,$"{key} must be an array.");
  foreach(var key in new[]{"projects","people","sprints","epics","stories"}) {if(d[key]!.AsArray().Any(x=>x is not JsonObject))throw new DomainException(400,"Each record must be an object.");var ids=Ids(d,key);if(ids.Any(string.IsNullOrWhiteSpace)||ids.Distinct().Count()!=ids.Length) throw new DomainException(400,$"{key} IDs must be unique and nonempty.");}
  try { _=d.Deserialize<WorkspaceData>(Json); }catch(JsonException){throw new DomainException(400,"Workspace properties have invalid types.");}
  var projects=Ids(d,"projects");var people=Ids(d,"people");
  if(scope.Projects.Except(projects).Any()||scope.People.Except(people).Any()) throw new DomainException(400,"Configuration contains unknown IDs.");
  foreach(var key in new[]{"sprints","epics","stories"}) foreach(var item in d[key]!.AsArray()) {
   if(!projects.Contains(Text(item,"project"))) throw new DomainException(400,$"Unknown project on {Text(item,"id")}.");
   foreach(var pair in key=="sprints"?new[]{("start","end")}:new[]{("plannedStart","plannedEnd"),("actualStart","actualEnd")}) {
    var a=Text(item,pair.Item1);var b=Text(item,pair.Item2);
    if(a!=null&&!DateOnly.TryParseExact(a,"yyyy-MM-dd",out _)||b!=null&&!DateOnly.TryParseExact(b,"yyyy-MM-dd",out _)) throw new DomainException(400,"Dates must be YYYY-MM-DD.");
    if(pair.Item1=="actualStart"&&a==null&&b!=null)throw new DomainException(400,"Actual end requires an actual start.");
    if(a!=null&&b!=null&&string.CompareOrdinal(a,b)>0)throw new DomainException(400,"Start must be before end.");
   }
   if(key=="stories") {
    if(Text(item,"person") is string p&&!people.Contains(p))throw new DomainException(400,"Unknown assignee.");
    foreach(var link in new[]{("epic","epics"),("sprint","sprints")}) if(Text(item,link.Item1) is string id) {
     var target=d[link.Item2]!.AsArray().FirstOrDefault(x=>Text(x,"id")==id);
     if(target==null||Text(target,"project")!=Text(item,"project"))throw new DomainException(400,"Parent and sprint must belong to the story project.");
    }
    var plannedStart=Text(item,"plannedStart");var plannedEnd=Text(item,"plannedEnd");
    if(plannedStart!=null&&plannedEnd!=null&&decimal.TryParse(item!["points"]?.ToString(),out var allocation)&&allocation>0) {var start=DateOnly.ParseExact(plannedStart,"yyyy-MM-dd");var end=DateOnly.ParseExact(plannedEnd,"yyyy-MM-dd");if(end.DayNumber-start.DayNumber<7&&!Enumerable.Range(start.DayNumber,end.DayNumber-start.DayNumber+1).Any(day=>DateOnly.FromDayNumber(day).DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday))throw new DomainException(400,"Allocated plans require at least one workday.");}
    if(item!["points"]!=null&&(!decimal.TryParse(item["points"]!.ToString(),out var points)||points<0))throw new DomainException(400,"Points must be nonnegative.");
   }
  }
 }
 public async Task<State> Read() {await gate.WaitAsync();try{return Clone(state);}finally{gate.Release();}}
 static State Clone(State s)=>JsonSerializer.Deserialize<State>(JsonSerializer.Serialize(s,Json),Json)!;
 public async Task<State> Change(long expected,string id,Func<State,Task> action) {
  if(!Guid.TryParse(id,out _))throw new DomainException(400,"commandId must be a UUID.");
  await gate.WaitAsync();try {
   if(state.Commands.TryGetValue(id,out var applied)) {if(applied!=state.Version)throw new DomainException(409,"Command already applied; reload latest workspace.");return Clone(state);}
   if(expected!=state.Version)throw new DomainException(409,"Workspace changed; reload before saving.");
   var next=Clone(state);await action(next);Validate(next.Data,next.Configuration);next.Version++;next.Commands[id]=next.Version;
   Directory.CreateDirectory(Path.GetDirectoryName(path)!);var temp=path+"."+Guid.NewGuid()+".tmp";
   try {await using(var stream=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough)){await JsonSerializer.SerializeAsync(stream,next,Json);await stream.FlushAsync();stream.Flush(true);}File.Move(temp,path,true);}finally{if(File.Exists(temp))File.Delete(temp);}
   state=next;return Clone(state);
  }finally{gate.Release();}
 }
 public static void Push(State s)=>s.History.Add(new((JsonObject)s.Data.DeepClone(),s.Configuration,s.Source,(JsonObject?)s.SourceData?.DeepClone(),s.LastSync));
}





