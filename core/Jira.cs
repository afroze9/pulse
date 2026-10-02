using Microsoft.Extensions.Configuration;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
namespace Pulse;
public sealed class JiraAdapter {
 readonly HttpClient client; readonly IConfiguration config;
 public bool Configured {get;}
 public bool Connected {get;private set;}
 public string? Error {get;private set;}
 public JiraAdapter(HttpClient client,IConfiguration config) {
  this.client=client;this.config=config;var site=config["PULSE_JIRA_URL"];var email=config["PULSE_JIRA_EMAIL"];var token=config["PULSE_JIRA_TOKEN"];
  Configured=Uri.TryCreate(site,UriKind.Absolute,out var uri)&&uri.Scheme=="https"&&!string.IsNullOrWhiteSpace(email)&&!string.IsNullOrWhiteSpace(token);
  if(Configured){client.BaseAddress=new Uri(site!.TrimEnd('/')+"/");client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Basic",Convert.ToBase64String(Encoding.UTF8.GetBytes(email+":"+token)));client.DefaultRequestHeaders.Accept.Add(new("application/json"));}
 }
 public object Status(DateTimeOffset? last)=>new {configured=Configured,connected=Connected,message=Error??(Configured?"Configured; use discovery or sync to verify access.":"Jira is not configured. Connect Jira to import your projects."),lastSync=last};
 async Task<JsonObject> Fetch(string path,JsonObject? body,CancellationToken ct) {
  if(!Configured)throw new DomainException(503,"Set PULSE_JIRA_URL, PULSE_JIRA_EMAIL and PULSE_JIRA_TOKEN on the server to connect Jira Cloud.");
  for(var retry=0;retry<4;retry++) {
   using var request=new HttpRequestMessage(body==null?HttpMethod.Get:HttpMethod.Post,path);
   if(body!=null)request.Content=new StringContent(body.ToJsonString(),Encoding.UTF8,"application/json");
   using var response=await client.SendAsync(request,ct);
   if((int)response.StatusCode==429||((int)response.StatusCode>=500&&retry<3)) {
    if(retry==3)break;
    var delay=response.Headers.RetryAfter?.Delta??(response.Headers.RetryAfter?.Date-DateTimeOffset.UtcNow)??TimeSpan.FromSeconds(Math.Pow(2,retry)+Random.Shared.NextDouble());
    if(delay>TimeSpan.FromMinutes(2))throw new DomainException(503,"Jira requested a long rate-limit delay; retry later.");
    await Task.Delay(delay>TimeSpan.Zero?delay:TimeSpan.FromSeconds(1),ct);continue;
   }
   if(!response.IsSuccessStatusCode){Connected=false;Error=$"Jira returned HTTP {(int)response.StatusCode}. Verify credentials and project permissions.";throw new DomainException(502,Error);}
   Connected=true;Error=null;return JsonNode.Parse(await response.Content.ReadAsStringAsync(ct))!.AsObject();
  }
  Error="Jira rate limit or service failure; retry later.";throw new DomainException(503,Error);
 }
 public async Task<JsonArray> Page(string path,CancellationToken ct) {
  var all=new JsonArray();var start=0;
  for(var page=0;page<1000;page++) {
   var result=await Fetch(path+(path.Contains('?')?"&":"?")+"startAt="+start+"&maxResults=100",null,ct);var values=result["values"]!.AsArray();foreach(var value in values)all.Add(value!.DeepClone());
   start+=values.Count;if(values.Count==0||result["isLast"]?.GetValue<bool>()==true||result["total"]!=null&&start>=result["total"]!.GetValue<int>())return all;
  }throw new DomainException(502,"Jira pagination exceeded safety limit.");
 }
 public async Task<JsonNode> Fields(CancellationToken ct) {if(!Configured)throw new DomainException(503,"Jira is not configured.");using var response=await client.GetAsync("rest/api/3/field",ct);if(!response.IsSuccessStatusCode)throw new DomainException(502,"Jira field discovery failed.");return JsonNode.Parse(await response.Content.ReadAsStringAsync(ct))!;}
 public async Task<object[]> Projects(CancellationToken ct)=>(await Page("rest/api/3/project/search",ct)).Select(p=>(object)new{id=p!["id"]!.ToString(),key=p["key"]!.ToString(),name=p["name"]!.ToString()}).ToArray();
 public async Task<JsonObject> Import(string[] keys,CancellationToken ct) {
  if(keys.Length==0||keys.Any(k=>!Regex.IsMatch(k,"^[A-Za-z][A-Za-z0-9_]*$")))throw new DomainException(400,"Select valid Jira project keys for import.");
  var data=new JsonObject();foreach(var k in new[]{"projects","people","epics","stories","sprints","dependencies"})data[k]=new JsonArray();
  var permitted=await Page("rest/api/3/project/search",ct);
  foreach(var key in keys.Distinct()) {
   var p=permitted.FirstOrDefault(p=>p!["key"]!.ToString()==key)??throw new DomainException(400,"Selected project is not accessible.");
   data["projects"]!.AsArray().Add(new JsonObject{["id"]=key,["key"]=key,["jiraId"]=p["id"]!.ToString(),["name"]=p["name"]!.ToString(),["color"]="blue"});
   var boards=await Page("rest/agile/1.0/board?projectKeyOrId="+Uri.EscapeDataString(key),ct);
   foreach(var board in boards.Where(b=>b!["type"]?.ToString()=="scrum"))foreach(var sprint in await Page("rest/agile/1.0/board/"+board!["id"]+"/sprint",ct)) {
    var id=key+":"+sprint!["id"];if(data["sprints"]!.AsArray().Any(x=>WorkspaceStore.Text(x,"id")==id))continue;
    data["sprints"]!.AsArray().Add(new JsonObject{["id"]=id,["jiraId"]=sprint["id"]!.ToString(),["project"]=key,["name"]=sprint["name"]!.ToString(),["start"]=Date(sprint["startDate"]),["end"]=Date(sprint["endDate"]),["boardId"]=board["id"]!.ToString()});
   }
  }
  var fields=new List<string>{"summary","status","assignee","project","issuetype","parent","updated"};
  var mapped=new Dictionary<string,string>();foreach(var pair in new[]{("points","POINTS"),("plannedStart","PLANNED_START"),("plannedEnd","PLANNED_END"),("actualStart","ACTUAL_START"),("actualEnd","ACTUAL_END"),("sprint","SPRINT")})if(config["PULSE_JIRA_FIELD_"+pair.Item2] is string f){mapped[pair.Item1]=f;fields.Add(f);}
  // Explicit mappings win; discover standard Jira fields for otherwise unmapped values.
  var available=(await Fields(ct)).AsArray();
  string? UniqueField(Func<JsonNode?,bool> predicate){var matches=available.Where(predicate).Select(f=>f!["id"]!.ToString()).Distinct().ToArray();return matches.Length==1?matches[0]:null;}
  void Discover(string key,string? field){if(!mapped.ContainsKey(key)&&field!=null){mapped[key]=field;fields.Add(field);}}
  Discover("sprint",UniqueField(f=>f?["schema"]?["custom"]?.ToString()=="com.pyxis.greenhopper.jira:gh-sprint"));
  Discover("plannedStart",UniqueField(f=>string.Equals(f?["name"]?.ToString(),"Start date",StringComparison.OrdinalIgnoreCase)&&f?["schema"]?["type"]?.ToString()=="date"));
  Discover("plannedEnd",UniqueField(f=>f?["id"]?.ToString()=="duedate"));
  var pointFields=mapped.TryGetValue("points",out var explicitPoints)?new[]{explicitPoints}:available.Where(f=>f?["schema"]?["custom"]?.ToString() is "com.atlassian.jira.plugin.system.customfieldtypes:float" or "com.pyxis.greenhopper.jira:jsw-story-points")
   .Where(f=>f?["schema"]?["custom"]?.ToString()=="com.pyxis.greenhopper.jira:jsw-story-points"||string.Equals(f?["name"]?.ToString(),"Story Points",StringComparison.OrdinalIgnoreCase)).Select(f=>f!["id"]!.ToString()).Distinct().ToArray();
  fields.AddRange(pointFields);
  string? token=null;var tokens=new HashSet<string>();var issues=new Dictionary<string,JsonObject>();
  for(var page=0;page<1000;page++) {
   var body=new JsonObject{["jql"]="project in ("+string.Join(',',keys)+") ORDER BY id",["maxResults"]=100,["fields"]=new JsonArray(fields.Distinct().Select(f=>(JsonNode?)JsonValue.Create(f)).ToArray())};if(token!=null)body["nextPageToken"]=token;
   var response=await Fetch("rest/api/3/search/jql",body,ct);foreach(var issue in response["issues"]!.AsArray())issues[issue!["id"]!.ToString()]=issue.AsObject();
   token=response["nextPageToken"]?.ToString();if(string.IsNullOrEmpty(token))break;if(!tokens.Add(token)||page==999)throw new DomainException(502,"Jira returned an invalid pagination sequence.");
  }
  foreach(var issue in issues.Values) {
   var f=issue["fields"]!;var project=f["project"]!["key"]!.ToString();var type=f["issuetype"]!["name"]!.ToString();var epic=string.Equals(type,"Epic",StringComparison.OrdinalIgnoreCase);
   var item=new JsonObject{["id"]=issue["key"]!.ToString(),["jiraId"]=issue["id"]!.ToString(),["project"]=project,["type"]=type.ToLowerInvariant(),["title"]=f["summary"]!.ToString(),["status"]=f["status"]!["name"]!.ToString(),["sourceUpdated"]=f["updated"]?.ToString()};
   foreach(var pair in mapped.Where(p=>p.Key!="sprint"))item[pair.Key]=pair.Key=="points"?f[pair.Value]?.DeepClone():Date(f[pair.Value]);
   foreach(var pointField in pointFields)if(f[pointField] is JsonValue pointValue&&pointValue.TryGetValue<decimal>(out var estimate)){item["points"]=estimate;break;}
   item["plannedStart"]??=null;item["plannedEnd"]??=null;
   if(!epic){var account=f["assignee"]?["accountId"]?.ToString();item["person"]=account;
    if(account!=null&&!data["people"]!.AsArray().Any(x=>WorkspaceStore.Text(x,"id")==account))data["people"]!.AsArray().Add(new JsonObject{["id"]=account,["name"]=f["assignee"]!["displayName"]!.ToString(),["initials"]="JR",["color"]="blue",["role"]="Jira resource"});
    item["epic"]=f["parent"]?["key"]?.ToString();
    if(mapped.TryGetValue("sprint",out var sf)&&f[sf] is JsonArray memberships){var selected=memberships.LastOrDefault(x=>x?["state"]?.ToString()=="active")??memberships.LastOrDefault();foreach(var membership in memberships.OfType<JsonObject>()) {
      if(membership["id"]==null)continue;
      var sprintId=project+":"+membership["id"];
      var existing=data["sprints"]!.AsArray().FirstOrDefault(x=>WorkspaceStore.Text(x,"id")==sprintId);
      if(existing==null){existing=new JsonObject{["id"]=sprintId,["jiraId"]=membership["id"]!.ToString(),["project"]=project,["name"]=membership["name"]?.ToString()??("Sprint "+membership["id"])};data["sprints"]!.AsArray().Add(existing);}
      existing["start"]??=Date(membership["startDate"]);existing["end"]??=Date(membership["endDate"]);existing["state"]??=membership["state"]?.DeepClone();
     }
     if(selected?["id"]!=null)item["sprint"]=project+":"+selected["id"];}
   }else{item["progress"]=0;item["start"]=item["plannedStart"]?.DeepClone();item["end"]=item["plannedEnd"]?.DeepClone();}
   data[epic?"epics":"stories"]!.AsArray().Add(item);
  }
  // Parents can be non-epics or outside import scope; keep their source ID, but do not invent a parent.
  foreach(var s in data["stories"]!.AsArray()){if(!data["epics"]!.AsArray().Any(e=>WorkspaceStore.Text(e,"id")==WorkspaceStore.Text(s,"epic"))){s!["sourceParent"]=s["epic"]?.DeepClone();s["epic"]=null;}if(!data["sprints"]!.AsArray().Any(e=>WorkspaceStore.Text(e,"id")==WorkspaceStore.Text(s,"sprint")))s!["sprint"]=null;}
  return data;
 }
 static string? Date(JsonNode? n)=>n==null?null:n.ToString().Length>=10?n.ToString()[..10]:null;
 public static void MergePlans(State state,JsonObject imported) {
  if(state.Source=="jira") {
  foreach(var collection in new[]{"epics","stories"})foreach(var local in state.Data[collection]!.AsArray()) {
   if(imported[collection]!.AsArray().Any(x=>WorkspaceStore.Text(x,"jiraId")!=null&&WorkspaceStore.Text(x,"jiraId")==WorkspaceStore.Text(local,"jiraId")))continue;
   var baseline=state.SourceData?[collection]?.AsArray().FirstOrDefault(x=>WorkspaceStore.Text(x,"id")==WorkspaceStore.Text(local,"id"));
   if(baseline==null) {if(WorkspaceStore.Ids(imported,"projects").Contains(WorkspaceStore.Text(local,"project")))imported[collection]!.AsArray().Add(local!.DeepClone());else throw new DomainException(409,"Sync would remove a local proposal outside the selected scope.");}
   else if(!JsonNode.DeepEquals(local,baseline))throw new DomainException(409,"Sync would remove a locally edited issue missing from the source; review scope and permissions.");
  }
  foreach(var collection in new[]{"epics","stories"})foreach(var incoming in imported[collection]!.AsArray()) {
   var current=state.Data[collection]!.AsArray().FirstOrDefault(x=>WorkspaceStore.Text(x,"jiraId")==WorkspaceStore.Text(incoming,"jiraId"));
   var baseline=state.SourceData?[collection]?.AsArray().FirstOrDefault(x=>WorkspaceStore.Text(x,"jiraId")==WorkspaceStore.Text(incoming,"jiraId"));
   if(current==null||baseline==null)continue;
   foreach(var field in new[]{"plannedStart","plannedEnd","person","epic","sprint","project","title","actualStart","actualEnd"})if(!JsonNode.DeepEquals(current[field],baseline[field])){var sourceChanged=!JsonNode.DeepEquals(baseline[field],incoming![field])&&!JsonNode.DeepEquals(current[field],incoming[field]);incoming[field]=current[field]?.DeepClone();incoming["localPlan"]=true;if(sourceChanged)incoming["syncConflict"]=true;}
  }
  }
 }
}



