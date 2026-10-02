using Microsoft.Extensions.FileProviders;
using Pulse;
var builder=WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();builder.Logging.AddConsole();
if(string.IsNullOrEmpty(builder.Configuration["urls"]))builder.WebHost.UseUrls("http://127.0.0.1:5080");
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(new WorkspaceStore(Path.Combine(Environment.GetEnvironmentVariable("PULSE_DATA_DIR")??Path.Combine(builder.Environment.ContentRootPath,"App_Data"),"workspace.json")));
builder.Services.AddHttpClient<JiraAdapter>(c=>c.Timeout=TimeSpan.FromMinutes(3));builder.Services.AddSingleton(sp=>new JiraAdapter(sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(JiraAdapter)),builder.Configuration));
var app=builder.Build();
app.UseExceptionHandler();
app.Use(async(context,next)=>{try{await next();}catch(DomainException e){await Results.Problem(statusCode:e.Status,title:e.Status==409?"Workspace conflict":"Request rejected",detail:e.Message).ExecuteAsync(context);}catch(Exception e)when(e is HttpRequestException or TaskCanceledException){await Results.Problem(statusCode:502,title:"Jira unavailable",detail:"Unable to reach Jira; retry later.").ExecuteAsync(context);}});

object Envelope(State s,JiraAdapter jira)=>new{version=s.Version,data=s.Data,configuration=s.Configuration,canUndo=s.History.Count>0,source=s.Source,jira=jira.Status(s.LastSync)};
app.MapGet("/api/health",()=>Results.Ok(new{status="ok",mode="local",persistence="atomic-json"}));
app.MapGet("/api/workspace",async(WorkspaceStore store,JiraAdapter jira)=>Envelope(await store.Read(),jira));
app.MapPut("/api/workspace",async(SaveRequest request,WorkspaceStore store,JiraAdapter jira)=>Envelope(await store.Change(request.ExpectedVersion,request.CommandId,s=>{WorkspaceStore.Validate(request.Data,request.Configuration);WorkspaceStore.Push(s);s.Data=request.Data;s.Configuration=request.Configuration;return Task.CompletedTask;}),jira));
app.MapPost("/api/workspace/undo",async(UndoRequest request,WorkspaceStore store,JiraAdapter jira)=>Envelope(await store.Change(request.ExpectedVersion,request.CommandId,s=>{if(s.History.Count==0)throw new DomainException(409,"No command to undo.");var previous=s.History[^1];s.History.RemoveAt(s.History.Count-1);s.Data=previous.Data;s.Configuration=previous.Configuration;s.Source=previous.Source;s.SourceData=previous.SourceData;s.LastSync=previous.LastSync;return Task.CompletedTask;}),jira));
app.MapGet("/api/jira/status",async(WorkspaceStore store,JiraAdapter jira)=>jira.Status((await store.Read()).LastSync));
app.MapGet("/api/jira/fields",async(JiraAdapter jira,CancellationToken ct)=>await jira.Fields(ct));
app.MapGet("/api/jira/projects",async(JiraAdapter jira,CancellationToken ct)=>await jira.Projects(ct));
app.MapPost("/api/jira/sync",async(SyncRequest request,WorkspaceStore store,JiraAdapter jira,CancellationToken ct)=>{
 var before=await store.Read();if(before.Version!=request.ExpectedVersion)throw new DomainException(409,"Workspace changed; reload before syncing.");
 var imported=await jira.Import(request.ProjectKeys??before.Configuration.Projects,ct);var baseline=(System.Text.Json.Nodes.JsonObject)imported.DeepClone();
 return Envelope(await store.Change(request.ExpectedVersion,request.CommandId,s=>{WorkspaceStore.Push(s);JiraAdapter.MergePlans(s,imported);s.Data=imported;s.SourceData=baseline;s.Source="jira";s.LastSync=DateTimeOffset.UtcNow;s.Configuration=new(WorkspaceStore.Ids(imported,"projects"),WorkspaceStore.Ids(imported,"people"),s.Configuration.Types);return Task.CompletedTask;}),jira);
});
var frontend=Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath,"../dist"));
if(Directory.Exists(frontend)){var files=new PhysicalFileProvider(frontend);app.UseDefaultFiles(new DefaultFilesOptions{FileProvider=files});app.UseStaticFiles(new StaticFileOptions{FileProvider=files});app.MapFallbackToFile("index.html",new StaticFileOptions{FileProvider=files});}
app.Run();




