/** @typedef {import('./types').WorkspaceEnvelope} WorkspaceEnvelope */
export class ApiError extends Error {
  constructor(message, status, problem) { super(message); this.status=status; this.problem=problem; }
}
export async function request(path, options={}) {
  let status,body;
  const bridge=globalThis.window?.HybridWebView;
  try {
    if(bridge) {
      const result=JSON.parse(await bridge.InvokeDotNet('Dispatch',[JSON.stringify({path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null})]));
      status=result.status;body=result.body;
    } else {
      const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
      status=response.status;body=await response.json().catch(()=>null);
    }
  }
  catch { throw new ApiError(bridge?'Cannot reach the desktop service. Your draft is kept on this device.':'Cannot reach the server. Your draft is kept on this device.',0,null); }
  if(status<200||status>=300) {
    const details=body?.errors?Object.values(body.errors).flat().join(' '):'';
    throw new ApiError(details||body?.detail||body?.message||body?.title||`Request failed (${status}).`,status,body);
  }
  return body;
}
export const workspaceApi={
  load:()=>request('/api/workspace'),
  save:body=>request('/api/workspace',{method:'PUT',body:JSON.stringify(body)}),
  undo:body=>request('/api/workspace/undo',{method:'POST',body:JSON.stringify(body)}),
  jiraStatus:()=>request('/api/jira/status'),
  jiraConnection:()=>request('/api/jira/connection'),
  saveJiraConnection:body=>request('/api/jira/connection',{method:'PUT',body:JSON.stringify(body)}),
  forgetJiraConnection:()=>request('/api/jira/connection',{method:'DELETE'}),
  testJiraConnection:()=>request('/api/jira/connection/test',{method:'POST'}),
  jiraProjects:()=>request('/api/jira/projects'),
  jiraSync:body=>request('/api/jira/sync',{method:'POST',body:JSON.stringify(body)})
};
