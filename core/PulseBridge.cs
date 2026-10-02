using Microsoft.Extensions.Configuration;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
namespace Pulse;
public sealed class JiraCredentials(string url,string username,string token) {
 public string Url {get;}=url;
 public string Username {get;}=username;
 [JsonIgnore] public string Token {get;}=token;
 public override string ToString()=>"JiraCredentials (redacted)";
}
public interface ICredentialStore {
 Task<JiraCredentials?> Load();
 Task Save(JiraCredentials credentials);
 Task Remove();
}
/// <summary>In-process, allowlisted desktop transport. Never returns credential secrets.</summary>
public sealed class PulseBridge(WorkspaceStore store,ICredentialStore credentials,IConfiguration configuration,Func<HttpClient>? httpClientFactory=null) {
 readonly SemaphoreSlim gate=new(1);
 JiraCredentials? saved;
 JiraAdapter? adapter;
 bool loaded,storageAvailable=true;
 static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
 sealed record Request(string Path,string Method,JsonNode? Body);
 sealed class CredentialRequest {public string? Url {get;set;} public string? Username {get;set;} public string? Token {get;set;}}
 object Connection()=>new{url=saved?.Url??"",username=saved?.Username??"",hasToken=saved!=null,storageAvailable,source=saved==null?"none":"local"};
 async Task Load() {
  if(loaded)return;
  try{saved=await credentials.Load();loaded=true;storageAvailable=true;}
  catch{storageAvailable=false;throw new DomainException(503,"Encrypted credential storage is unavailable. Unlock your device and try again.");}
 }
 JiraAdapter Adapter()=>adapter??=new JiraAdapter(httpClientFactory?.Invoke()??new HttpClient{Timeout=TimeSpan.FromMinutes(3)},new CredentialConfiguration(configuration,saved));
 object Envelope(State s,JiraAdapter jira)=>new{version=s.Version,data=s.Data,configuration=s.Configuration,canUndo=s.History.Count>0,source=s.Source,jira=jira.Status(s.LastSync)};
 static T Body<T>(Request request) where T:class =>request.Body?.Deserialize<T>(Json)??throw new DomainException(400,"A request body is required.");
 public async Task<string> Dispatch(string json) {
  await gate.WaitAsync();
  try {
   var request=JsonSerializer.Deserialize<Request>(json,Json)??throw new DomainException(400,"Invalid request.");
   // Validate the complete route before loading storage or making network requests.
   var route=(request.Method??"").ToUpperInvariant()+" "+request.Path;
   if(!new[]{"GET /api/workspace","PUT /api/workspace","POST /api/workspace/undo","GET /api/jira/status","GET /api/jira/fields","GET /api/jira/projects","POST /api/jira/sync","GET /api/jira/connection","PUT /api/jira/connection","DELETE /api/jira/connection","POST /api/jira/connection/test"}.Contains(route))throw new DomainException(404,"Unknown desktop operation.");
   if(route=="GET /api/jira/connection") {try{await Load();}catch(DomainException){} return Reply(200,Connection());}
   if(route is "GET /api/workspace" or "PUT /api/workspace" or "POST /api/workspace/undo" or "GET /api/jira/status") {try{await Load();}catch(DomainException){}} else await Load();
   if(route=="PUT /api/jira/connection") {
    var input=Body<CredentialRequest>(request);var username=input.Username?.Trim()??"";var url=input.Url?.Trim()??"";
    if(!Uri.TryCreate(url,UriKind.Absolute,out var uri)||uri.Scheme!="https"||string.IsNullOrEmpty(uri.Host)||uri.UserInfo.Length>0||uri.Query.Length>0||uri.Fragment.Length>0)throw new DomainException(400,"Enter a valid HTTPS Jira URL without credentials, query, or fragment.");
    url=uri.AbsoluteUri.TrimEnd('/');
    if(username.Length==0)throw new DomainException(400,"Enter your Jira username or email.");
    var token=input.Token;
    if(string.IsNullOrWhiteSpace(token)) {
     if(saved==null||saved.Url!=url||saved.Username!=username)throw new DomainException(400,"Enter a token when connecting or changing the Jira account.");
     token=saved.Token;
    }
    var next=new JiraCredentials(url,username,token);
    try{await credentials.Save(next);storageAvailable=true;}catch{storageAvailable=false;throw new DomainException(503,"Unable to save encrypted Jira credentials. Try again.");}
    saved=next;adapter=null;return Reply(200,Connection());
   }
   if(route=="DELETE /api/jira/connection") {
    try{await credentials.Remove();storageAvailable=true;}catch{storageAvailable=false;throw new DomainException(503,"Unable to remove encrypted Jira credentials. Try again.");}
    saved=null;adapter=null;return Reply(200,Connection());
   }
   var jira=Adapter();object result;
   switch(route) {
    case "GET /api/workspace":result=Envelope(await store.Read(),jira);break;
    case "PUT /api/workspace":var save=Body<SaveRequest>(request);result=Envelope(await store.Change(save.ExpectedVersion,save.CommandId,s=>{WorkspaceStore.Validate(save.Data,save.Configuration);WorkspaceStore.Push(s);s.Data=save.Data;s.Configuration=save.Configuration;return Task.CompletedTask;}),jira);break;
    case "POST /api/workspace/undo":var undo=Body<UndoRequest>(request);result=Envelope(await store.Change(undo.ExpectedVersion,undo.CommandId,s=>{if(s.History.Count==0)throw new DomainException(409,"No command to undo.");var previous=s.History[^1];s.History.RemoveAt(s.History.Count-1);s.Data=previous.Data;s.Configuration=previous.Configuration;s.Source=previous.Source;s.SourceData=previous.SourceData;s.LastSync=previous.LastSync;return Task.CompletedTask;}),jira);break;
    case "GET /api/jira/status":result=jira.Status((await store.Read()).LastSync);break;
    case "GET /api/jira/fields":result=await jira.Fields(default);break;
    case "GET /api/jira/projects":result=await jira.Projects(default);break;
    case "POST /api/jira/connection/test":await jira.Projects(default);result=jira.Status((await store.Read()).LastSync);break;
    case "POST /api/jira/sync":var sync=Body<SyncRequest>(request);var before=await store.Read();if(before.Version!=sync.ExpectedVersion)throw new DomainException(409,"Workspace changed; reload before syncing.");var imported=await jira.Import(sync.ProjectKeys??before.Configuration.Projects,default);var baseline=(JsonObject)imported.DeepClone();result=Envelope(await store.Change(sync.ExpectedVersion,sync.CommandId,s=>{WorkspaceStore.Push(s);JiraAdapter.MergePlans(s,imported);s.Data=imported;s.SourceData=baseline;s.Source="jira";s.LastSync=DateTimeOffset.UtcNow;s.Configuration=new(WorkspaceStore.Ids(imported,"projects"),WorkspaceStore.Ids(imported,"people"),s.Configuration.Types);return Task.CompletedTask;}),jira);break;
    default:throw new DomainException(404,"Unknown desktop operation.");
   }
   return Reply(200,result);
  }catch(DomainException e){return Reply(e.Status,new{title="Request rejected",detail=e.Message});}
   catch(JsonException){return Reply(400,new{title="Request rejected",detail="Invalid request JSON."});}
   catch(Exception){return Reply(502,new{title="Operation unavailable",detail="Unable to complete the operation. Check your connection and try again."});}
  finally{gate.Release();}
 }
 static string Reply(int status,object body)=>JsonSerializer.Serialize(new{status,body},Json);
 sealed class CredentialConfiguration(IConfiguration original,JiraCredentials? connection):IConfiguration {
  public string? this[string key] {get=>key switch{"PULSE_JIRA_URL"=>connection?.Url,"PULSE_JIRA_EMAIL"=>connection?.Username,"PULSE_JIRA_TOKEN"=>connection?.Token,_=>original[key]};set=>throw new NotSupportedException();}
  public IEnumerable<IConfigurationSection> GetChildren()=>original.GetChildren();
  public Microsoft.Extensions.Primitives.IChangeToken GetReloadToken()=>original.GetReloadToken();
  public IConfigurationSection GetSection(string key)=>original.GetSection(key);
 }
}


