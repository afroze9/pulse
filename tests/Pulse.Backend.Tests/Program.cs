using System.Net;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Pulse;
void Assert(bool condition,string message){if(!condition)throw new Exception(message);Console.WriteLine("PASS "+message);}
var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["PULSE_JIRA_URL"]="https://test.atlassian.net",["PULSE_JIRA_EMAIL"]="test@example.com",["PULSE_JIRA_TOKEN"]="fixture",["PULSE_JIRA_FIELD_POINTS"]="customfield_points",["PULSE_JIRA_FIELD_SPRINT"]="customfield_sprint"}).Build();
var handler=new FixtureHandler();var jira=new JiraAdapter(new HttpClient(handler),config);
var projects=await jira.Projects(default);Assert(projects.Length==2,"429 retry and project offset pagination");
var data=await jira.Import(["COM"],default);
Assert(data["stories"]!.AsArray().Count==2,"enhanced search token pagination and deduplication");
Assert(data["people"]!.AsArray().Count==1,"shared account IDs deduplicated");
Assert(data["sprints"]!.AsArray().Count==1,"duplicate board sprint deduplicated");
Assert(data["stories"]![0]!["points"]!.GetValue<decimal>()==3,"mapped point field retained");
Assert(data["stories"]![0]!["actualStart"]==null,"no fabricated actual dates");
var autoConfig=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["PULSE_JIRA_URL"]="https://test.atlassian.net",["PULSE_JIRA_EMAIL"]="test@example.com",["PULSE_JIRA_TOKEN"]="fixture"}).Build();
var discovered=await new JiraAdapter(new HttpClient(new FixtureHandler(true)),autoConfig).Import(["COM"],default);
Assert(discovered["stories"]![0]!["points"]!.GetValue<decimal>()==8,"story estimates discovered without manual mappings");
Assert(discovered["stories"]![0]!["plannedStart"]!.ToString()=="2026-10-05"&&discovered["stories"]![0]!["plannedEnd"]!.ToString()=="2026-10-16","standard start and due date discovery");
Assert(discovered["sprints"]!.AsArray().Count==1&&discovered["sprints"]![0]!["start"]!.ToString()=="2026-10-05"&&discovered["stories"]![0]!["sprint"]!.ToString()=="COM:24","issue sprint membership recovers dates when boards return no sprints");
Assert(discovered["stories"]![0]!["actualStart"]==null,"automatic discovery never invents actual dates");
var state=new State{Source="jira",Data=(JsonObject)data.DeepClone(),SourceData=(JsonObject)data.DeepClone()};state.Data["stories"]![0]!["plannedStart"]="2026-10-08";
var incoming=(JsonObject)data.DeepClone();JiraAdapter.MergePlans(state,incoming);
Assert(incoming["stories"]![0]!["plannedStart"]!.ToString()=="2026-10-08"&&incoming["stories"]![0]!["syncConflict"]==null,"sync preserves local plan without false source conflict");
incoming=(JsonObject)data.DeepClone();incoming["stories"]![0]!["plannedStart"]="2026-10-09";JiraAdapter.MergePlans(state,incoming);Assert(incoming["stories"]![0]!["syncConflict"]!.GetValue<bool>(),"source and local changes flagged as conflict");
var path=Path.Combine(Path.GetTempPath(),"pulse-test-"+Guid.NewGuid());Directory.CreateDirectory(path);
try {
 var empty=await new WorkspaceStore(Path.Combine(path,"empty.json")).Read();
 Assert(empty.Source=="local"&&new[]{"projects","people","sprints","epics","stories","dependencies"}.All(key=>empty.Data[key]!.AsArray().Count==0)&&empty.Configuration.Projects.Length==0&&empty.Configuration.People.Length==0,"new workspace contains no sample records");
 WorkspaceStore.Validate(empty.Data,empty.Configuration);
 var store=new WorkspaceStore(Path.Combine(path,"workspace.json"),data);var first=await store.Read();var command=Guid.NewGuid().ToString();
 var saved=await store.Change(first.Version,command,s=>{WorkspaceStore.Push(s);s.Data["stories"]![0]!["title"]="Local plan";return Task.CompletedTask;});
 Assert(saved.Version==2,"validated command increments revision");var restart=new WorkspaceStore(Path.Combine(path,"workspace.json"));Assert((await restart.Read()).History.Count==1,"undo history survives restart");
 Assert((await restart.Read()).Data["stories"]![0]!["title"]!.ToString()=="Local plan","startup preserves saved workspace records");
 var replay=await restart.Change(1,command,s=>throw new Exception("must not rerun"));Assert(replay.Version==2,"command retry does not apply twice");
 try{await restart.Change(1,Guid.NewGuid().ToString(),s=>Task.CompletedTask);throw new Exception("No stale rejection");}catch(DomainException e){Assert(e.Status==409,"stale revision rejected");}
 try {await restart.Change(2,Guid.NewGuid().ToString(),s=>{s.Data["stories"]![0]!["plannedStart"]="invalid";return Task.CompletedTask;});throw new Exception("No transactional rejection");}catch(DomainException e){Assert(e.Status==400&&(await restart.Read()).Version==2,"failed mutation leaves committed revision unchanged");}
 var malformed=(JsonObject)data.DeepClone();malformed["stories"]![0]!["plannedStart"]="bad";try{WorkspaceStore.Validate(malformed,first.Configuration);throw new Exception("No validation rejection");}catch(DomainException e){Assert(e.Status==400,"invalid dates rejected");}
}finally{Directory.Delete(path,true);}
await BridgeTests.Run();
Console.WriteLine("All backend fixture tests passed.");
sealed class FixtureHandler(bool noBoards=false):HttpMessageHandler {
 int projects;
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct) {
  var url=request.RequestUri!.PathAndQuery;string json;
  if(url.EndsWith("/field"))json="""[{"id":"customfield_auto_points","name":"Story point estimate","schema":{"type":"number","custom":"com.pyxis.greenhopper.jira:jsw-story-points"}},{"id":"customfield_sprint","name":"Sprint","schema":{"type":"array","custom":"com.pyxis.greenhopper.jira:gh-sprint"}},{"id":"customfield_start","name":"Start date","schema":{"type":"date"}},{"id":"duedate","name":"Due date","schema":{"type":"date"}}]""";
  else if(noBoards&&url.Contains("/board?"))json="""{"values":[],"isLast":true}""";
  else if(url.Contains("project/search")) {projects++;if(projects==1){var limited=new HttpResponseMessage(HttpStatusCode.TooManyRequests);limited.Headers.RetryAfter=new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.Zero);return Task.FromResult(limited);}json=url.Contains("startAt=0")?"""{"values":[{"id":"1","key":"COM","name":"Commerce"}],"isLast":false}""":"""{"values":[{"id":"2","key":"PLT","name":"Platform"}],"isLast":true}""";}
  else if(url.Contains("/board?") )json="""{"values":[{"id":1,"type":"scrum"},{"id":2,"type":"scrum"}],"isLast":true}""";
  else if(url.Contains("/sprint"))json="""{"values":[{"id":24,"name":"Sprint 24","startDate":"2026-10-05T09:00:00+05:00","endDate":"2026-10-16T17:00:00+05:00"}],"isLast":true}""";
  else if(url.Contains("search/jql")) {
   var body=request.Content!.ReadAsStringAsync(ct).Result;var second=body.Contains("nextPageToken");var id=second?"12":"11";
   json="{\"issues\":[{\"id\":\""+id+"\",\"key\":\"COM-"+id+"\",\"fields\":{\"summary\":\"Test story\",\"project\":{\"key\":\"COM\"},\"issuetype\":{\"name\":\"Story\"},\"status\":{\"name\":\"To do\"},\"assignee\":{\"accountId\":\"person\",\"displayName\":\"Person\"},\"customfield_points\":3,\"customfield_sprint\":[{\"id\":24,\"state\":\"active\"}]}}]"+(second?"}":",\"nextPageToken\":\"page2\"}");
  }else throw new Exception("Unexpected URL "+url);
  if(url.Contains("search/jql")){
   var payload=JsonNode.Parse(json)!;
   foreach(var issue in payload["issues"]!.AsArray()){
    var f=issue!["fields"]!;f["customfield_auto_points"]=8;f["customfield_start"]="2026-10-05";f["duedate"]="2026-10-16";
    f["customfield_sprint"]![0]!["name"]="Sprint 24";f["customfield_sprint"]![0]!["startDate"]="2026-10-05T09:00:00+05:00";f["customfield_sprint"]![0]!["endDate"]="2026-10-16T17:00:00+05:00";
   }
   json=payload.ToJsonString();
  }
  return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(json)});
 }
}


