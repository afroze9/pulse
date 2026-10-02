<script>
  import { onMount } from 'svelte';
  import { workspaceApi } from './api.js';
  export let status=null;export let version;export let disabled=false;export let onimport;export let onerror;export let onstatus;
  $: if(status)onstatus?.(status);
  let projects=[],keys=[],busy=false,loading=true,nativeHost=false,error='',notice='',url='',username='',token='',connection=null;
  function applyConnection(value){connection=value;url=value?.url||'';username=value?.username||'';token='';}
  onMount(async()=>{nativeHost=!!window.HybridWebView;if(!nativeHost){loading=false;return;}try{applyConnection(await workspaceApi.jiraConnection());}catch(e){error=e.message;}finally{loading=false;}});
  async function save(){busy=true;error='';notice='';try{applyConnection(await workspaceApi.saveJiraConnection({url:url.trim(),username:username.trim(),token}));projects=[];keys=[];status=await workspaceApi.jiraStatus();notice='Connection saved on this device.';}catch(e){error=e.message;}finally{token='';busy=false;}}
  async function test(){busy=true;error='';notice='';try{status=await workspaceApi.testJiraConnection();notice=status.message;}catch(e){error=e.message;}finally{busy=false;}}
  async function forget(){busy=true;error='';notice='';try{applyConnection(await workspaceApi.forgetJiraConnection());projects=[];keys=[];status=await workspaceApi.jiraStatus();notice='Saved Jira connection removed.';}catch(e){error=e.message;}finally{token='';busy=false;}}
  async function discover(){busy=true;error='';notice='';try{projects=await workspaceApi.jiraProjects();keys=projects.map(p=>p.key);status=await workspaceApi.jiraStatus();}catch(e){error=e.message;}finally{busy=false;}}
  async function sync(){busy=true;error='';try{await onimport({expectedVersion:version,commandId:crypto.randomUUID(),projectKeys:keys});}catch(e){error=e.message;onerror?.(e);}finally{busy=false;}}
</script>
<section class="connection-card" aria-label="Jira Connection">
  <h2>Jira Connection</h2>
  <p>{nativeHost?'Save your Jira URL, email, and API token in encrypted storage on this device.':'Manage saved Jira credentials in the Pulse desktop app.'}</p>
  <form onsubmit={event=>{event.preventDefault();save();}}>
    <div class="connection-fields">
      <label>Jira URL<input type="url" bind:value={url} placeholder="https://your-team.atlassian.net" autocomplete="url" required disabled={!nativeHost||loading||busy}/></label>
      <label>Email<input type="email" bind:value={username} autocomplete="username" required disabled={!nativeHost||loading||busy}/></label>
      <label>API Token<input type="password" bind:value={token} autocomplete="new-password" placeholder={connection?.hasToken?'Saved token · leave blank to keep':'Enter API token'} disabled={!nativeHost||loading||busy}/></label>
    </div>
    {#if nativeHost}<p>{connection?.hasToken?'A token is saved. Leave the token blank to keep it when the URL and email are unchanged. Enter a new token when changing either field.':'No API token is saved.'}</p>{/if}
    {#if connection?.storageAvailable===false}<p class="danger">Encrypted storage is unavailable on this device.</p>{/if}
    <div class="connection-actions">
      <button class="primary-button" type="submit" disabled={!nativeHost||loading||busy||connection?.storageAvailable===false}>{busy?'Working…':'Save Connection'}</button>
      <button class="plain-button" type="button" disabled={!nativeHost||loading||busy||!connection?.hasToken} onclick={test}>Test Saved Connection</button>
      <button class="plain-button" type="button" disabled={!nativeHost||loading||busy||connection?.source!=='local'} onclick={forget}>Forget Connection</button>
    </div>
  </form>
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if error}<p role="alert" class="danger">{error}</p>{/if}
  <h2 class="import-heading">Jira Import</h2><p>{status?.message||'Save and test your Jira connection to begin.'}</p>
  <p>{status?.connected?'Connected':'Not connected'} · {status?.lastSync?`Last imported ${new Date(status.lastSync).toLocaleString()}`:'No successful import recorded'}</p>
  <p>Pulse discovers Sprint, Story Points, Start date, and Due date fields automatically. Imports read Jira and preserve local plans.</p>
  <button class="plain-button" disabled={loading||busy||disabled||!status?.configured} onclick={discover}>{busy?'Working…':'Discover Available Projects'}</button>
  {#if projects.length}<div class="import-projects">{#each projects as p}<label><input type="checkbox" value={p.key} bind:group={keys}/>{p.key} · {p.name}</label>{/each}</div><button class="primary-button" disabled={busy||disabled||!keys.length} onclick={sync}>Import Selected Projects</button><small>Import refreshes source data and preserves local planning edits.</small>{/if}
</section>
<style>
  .connection-card{margin:0 0 24px;background:var(--surface,#fff);border:1px solid var(--line,#e0e7da);border-radius:9px;padding:23px}.connection-card h2{font-size:14px}.connection-card p{font-size:11px;line-height:1.8;color:var(--muted,#789065);margin:12px 0}.connection-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.connection-fields label{display:flex;flex-direction:column;gap:8px;font-size:11px}.connection-fields input{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--line,#dce5d5);border-radius:5px;font:inherit;color:var(--text,#33492b)}.connection-actions{display:flex;flex-wrap:wrap;gap:10px}.import-heading{margin-top:26px;padding-top:20px;border-top:1px solid var(--line,#e0e7da)}.import-projects{display:flex;flex-wrap:wrap;gap:18px;margin:16px 0}.import-projects label{font-size:11px;display:flex;gap:7px;align-items:center}small{display:block;font-size:10px;color:var(--muted,#789065);margin-top:12px}.connection-card .danger{color:var(--danger-text,#a43737)}@media(max-width:850px){.connection-fields{grid-template-columns:1fr}}
</style>
