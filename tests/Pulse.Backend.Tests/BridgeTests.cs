using Pulse;
using System.Text.Json.Nodes;
static class BridgeTests {
 public static async Task Run() {
  void Check(bool condition,string label){if(!condition)throw new Exception(label);Console.WriteLine("PASS "+label);}
  var directory=Path.Combine(Path.GetTempPath(),"pulse-bridge-"+Guid.NewGuid());Directory.CreateDirectory(directory);
  try {
   var store=new WorkspaceStore(Path.Combine(directory,"workspace.json"));var secrets=new MemoryCredentials();var config=new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build();
   PulseBridge Make()=>new(store,secrets,config,()=>new HttpClient(new FailingTransport()));
   var bridge=Make();
   async Task<JsonNode> Call(string method,string path,object? body=null)=>JsonNode.Parse(await bridge.Dispatch(System.Text.Json.JsonSerializer.Serialize(new{method,path,body})))!;
   Check((await Call("GET","/api/unknown"))["status"]!.GetValue<int>()==404&&secrets.Loads==0,"unknown bridge route has no side effects");
   var response=await Call("PUT","/api/jira/connection",new{url="https://fixture.atlassian.net",username="fixture@example.test",token="fixture-secret"});
   Check(response["status"]!.GetValue<int>()==200&&!response.ToJsonString().Contains("fixture-secret"),"connection metadata omits token");
   bridge=Make();Check((await Call("GET","/api/jira/connection"))["body"]!["hasToken"]!.GetValue<bool>(),"credentials survive bridge recreation");
   Check((await Call("PUT","/api/jira/connection",new{url="https://fixture.atlassian.net/",username="fixture@example.test",token=""}))["status"]!.GetValue<int>()==200&&secrets.Value!.Token=="fixture-secret","blank token retains same identity");
   Check((await Call("PUT","/api/jira/connection",new{url="https://other.atlassian.net",username="fixture@example.test",token=""}))["status"]!.GetValue<int>()==400,"blank token cannot follow changed identity");
   foreach(var url in new[]{"http://fixture.test","https://user:pass@fixture.test","https://fixture.test?secret=yes","https://fixture.test#fragment"})Check((await Call("PUT","/api/jira/connection",new{url,username="fixture",token="fixture-secret"}))["status"]!.GetValue<int>()==400,"unsafe connection URL rejected");
   response=await Call("POST","/api/jira/connection/test");Check(response["status"]!.GetValue<int>()==502&&!response.ToJsonString().Contains("fixture-secret"),"transport exception is redacted");
   secrets.Fail=true;response=await Call("PUT","/api/jira/connection",new{url="https://fixture.atlassian.net",username="fixture@example.test",token="replacement-secret"});Check(response["status"]!.GetValue<int>()==503&&secrets.Value!.Token=="fixture-secret"&&!response.ToJsonString().Contains("fixture-secret"),"failed secure save preserves active credentials and redacts error");secrets.Fail=false;
   await Call("DELETE","/api/jira/connection");Check(secrets.Value==null,"disconnect removes persisted credentials");
   secrets.Fail=true;bridge=Make();response=await Call("GET","/api/jira/connection");Check(!response["body"]!["storageAvailable"]!.GetValue<bool>(),"storage failure exposed without details");
   response=await Call("GET","/api/workspace");Check(response["status"]!.GetValue<int>()==200&&response["body"]!["version"]!.GetValue<int>()==1,"local workspace works when secure storage is unavailable");
  }finally{Directory.Delete(directory,true);}
 }
 sealed class MemoryCredentials:ICredentialStore {
  public JiraCredentials? Value;public int Loads;public bool Fail;
  public Task<JiraCredentials?> Load(){Loads++;if(Fail)throw new Exception("fixture-secret");return Task.FromResult(Value);}
  public Task Save(JiraCredentials credentials){if(Fail)throw new Exception("fixture-secret");Value=credentials;return Task.CompletedTask;}
  public Task Remove(){if(Fail)throw new Exception("fixture-secret");Value=null;return Task.CompletedTask;}
 }
 sealed class FailingTransport:HttpMessageHandler {protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken)=>throw new HttpRequestException("fixture-secret");}
}


