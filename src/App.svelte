<script>
  import { onMount } from 'svelte';
  import { searchWorkspace } from './global-search.js';
  const nativeHost=Boolean(globalThis.window?.HybridWebView?.SendEvent);
  const sendNative=(type,payload=null)=>globalThis.window?.HybridWebView?.SendEvent?.(type,payload);
  import { Activity, Users, Layers3, Route, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, ArrowUpRight, CircleHelp, X, SlidersHorizontal, AlertTriangle, CalendarDays, ArrowRight, Check, GitBranch, PanelRightClose, Info, Settings2, Undo2 } from 'lucide-svelte';
  import Timeline from './Timeline.svelte';
  import DeliveryPreview from './DeliveryPreview.svelte';
  let showDeliveryPreview=false;
  import ProjectFilter from './ProjectFilter.svelte';
  import ScheduleEditor from './ScheduleEditor.svelte';
  import ScheduleDates from './ScheduleDates.svelte';
  import Configuration from './Configuration.svelte';
  import { resourceChart } from './resource-chart.js';
  import { projectChart } from './project-chart.js';
  import { workspaceApi } from './api.js';
  import { WorkspaceSession } from './workspace-session.js';
  import JiraConnection from './JiraConnection.svelte';
  import AssignmentEditor from './AssignmentEditor.svelte';
  import DataQuality from './DataQuality.svelte';
  import { allocations, day, iso, addDays, workingDays, dailyLoad, personLoad, escapeHtml as esc, scheduleFor, movePlannedItem, sprintForDate, normalizeWorkspace, initialTimelineStart, resourceLane } from './planning.js';
  let data=normalizeWorkspace({projects:[],people:[],sprints:[],epics:[],stories:[],dependencies:[]}); let sessionState={phase:'loading',version:null,canUndo:false,error:'',pending:null,remote:null,jira:null}; let showActuals=true; let configuration={projects:[],people:[],types:['epic','story','bug','task']}; let view='resources'; let selectedProjects=[]; let query=''; let onlyRisk=false; let resourceInPeriod=true;
  let periodStart=iso(new Date()); let periodDays=21; let selected=null; let modal=false; let showPolicy=false; let source='Loading workspace'; let changed=false;
  let draft={title:'',person:'',sprint:'',points:3}; let formError=''; let toast=''; let timer;
  const nav=[{id:'resources',label:'Resources',icon:Users},{id:'projects',label:'Projects',icon:Layers3},{id:'roadmap',label:'Roadmap',icon:Route}];
  const headings={resources:['Resource Allocation','The right people. The right work. A little more breathing room.'],projects:['Project Allocation','From the big picture to the stories moving it forward.'],roadmap:['Product Roadmap','One shared direction. Every project in view.']};
  const shortDate=d=>day(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const number=n=>Number(n.toFixed(2)).toString();
  const pct=n=>Math.round(n*100);
  const projectOf=id=>data.projects.find(p=>p.id===id);
  const personOf=id=>data.people.find(p=>p.id===id);
  const sprintOf=id=>data.sprints.find(s=>s.id===id);
  let loadedWorkspace=false; let loadedSource=null;
  const session=new WorkspaceSession(workspaceApi,state=>{
    if(state.data&&state.source==='jira'&&(!loadedWorkspace||loadedSource!=='jira')){
      periodStart=initialTimelineStart(state.data,iso(new Date()));
    }
    if(state.source)loadedSource=state.source;
    sessionState=state;
    if(state.data)data=state.data;
    if(state.configuration){configuration=state.configuration;selectedProjects=loadedWorkspace?selectedProjects.filter(id=>configuration.projects.includes(id)):configuration.projects.slice();loadedWorkspace=true;}
    source=state.version===null?(state.phase==='loading'?'Loading workspace':'Workspace unavailable'):state.source==='jira'?'Jira workspace':'Local workspace';
  });
  onMount(()=>{
    session.load();
    const command=event=>{
      const {type,payload}=event.detail;
      if(type==='search')sendNative('searchResults',{query:payload.query,items:searchWorkspace(data,configuration,payload.query)});
      else if(type==='open')openNativeResult(payload);
      else if(type==='configure')changeView('configuration');
      else if(type==='refresh'&&editable&&sessionState.jira?.configured&&configuration.projects.length)importJira({expectedVersion:sessionState.version,commandId:crypto.randomUUID(),projectKeys:configuration.projects}).catch(error=>notify(error.message));
    };
    const shortcut=event=>{if(nativeHost&&event.ctrlKey&&event.key.toLowerCase()==='k'){event.preventDefault();sendNative('focusSearch');}};
    window.addEventListener('pulse-native',command);window.addEventListener('keydown',shortcut);
    sendNative('ready');
    return()=>{clearTimeout(timer);window.removeEventListener('pulse-native',command);window.removeEventListener('keydown',shortcut);};
  });
  $: if(nativeHost)sendNative('state',{phase:sessionState.phase,configured:Boolean(sessionState.jira?.configured),connected:Boolean(sessionState.jira?.connected),busy:sessionState.phase==='saving',canSync:sessionState.phase==='ready'&&Boolean(sessionState.jira?.configured)&&configuration.projects.length>0,lastSync:sessionState.jira?.lastSync||null});
  function updateJiraStatus(status){if(sessionState.jira!==status)session.emit({jira:status});}
  function openNativeResult(result){
    if(result.kind==='person'){changeView('resources');selectedProjects=configuration.projects.slice();resourceInPeriod=false;query=personOf(result.id)?.name||'';return;}
    if(result.kind==='project'){changeView('projects');selectedProjects=[result.id];return;}
    const item=(result.kind==='epic'?data.epics:data.stories).find(item=>item.id===result.id);
    if(!item)return;
    changeView('projects');selectedProjects=[item.project];query=item.id;
    const dates=result.kind==='epic'?{start:item.plannedStart}:scheduleFor(item,data.sprints,data.epics);
    if(dates?.start)periodStart=dates.start;
    selected={kind:result.kind,id:item.id};
  }
  $: editable=sessionState.phase==='ready';
  function canEdit(){if(!editable){notify('Wait for saving or resolve the workspace notice before editing');return false;}return true;}
  function exportDraft(){const blob=new Blob([JSON.stringify({data,configuration},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='pulse-preserved-draft.json';link.click();URL.revokeObjectURL(url);}
  async function importJira(body){if(!canEdit())return;session.emit({phase:'saving',error:''});try{session.accept(await workspaceApi.jiraSync(body));selectedProjects=configuration.projects.slice();notify('Jira import saved');}catch(error){session.emit({phase:'ready',error:error.message});throw error;}}
  $: bookings=allocations(data.stories,data.sprints,data.epics);
  $: periodEnd=addDays(periodStart,periodDays-1);
  $: quarterMonth=Math.floor(day(periodStart).getMonth()/3)*3;
  $: quarterStart=`${day(periodStart).getFullYear()}-${String(quarterMonth+1).padStart(2,'0')}-01`;
  $: quarterFinish=iso(new Date(day(periodStart).getFullYear(),quarterMonth+3,1));
  $: timelineStart=view==='roadmap'?quarterStart:periodStart;
  $: timelineEnd=view==='roadmap'?quarterFinish:addDays(periodEnd,1);
  $: loads=data.people.map(p=>({...p,...personLoad(p.id,bookings,periodStart,periodEnd)}));
  $: scopedLoads=loads.filter(p=>configuration.people.includes(p.id));
  $: risks=scopedLoads.filter(p=>p.overloaded.length);
  $: utilization=scopedLoads.reduce((s,p)=>s+p.average,0)/Math.max(1,scopedLoads.length);
  $: shared=data.people.filter(p=>configuration.people.includes(p.id)&&new Set(bookings.filter(b=>b.person===p.id&&b.start<=periodEnd&&b.end>=periodStart).map(b=>b.project)).size>1);
  $: activeProjects=data.projects.filter(p=>configuration.projects.includes(p.id));
  $: activePeople=data.people.filter(p=>configuration.people.includes(p.id));
  $: displayBookings=allocations(data.stories.filter(s=>configuration.types.includes(s.type||'story')),data.sprints,data.epics);
  $: visiblePeople=loads.filter(p=>configuration.people.includes(p.id)&&(!onlyRisk||p.overloaded.length));
  $: visibleProjects=activeProjects.filter(p=>selectedProjects.includes(p.id));
  $: chart=makeChart(view,visiblePeople,visibleProjects,displayBookings,data,query,timelineStart,timelineEnd,configuration,showActuals,resourceInPeriod);
  $: selectedBooking=selected?.kind==='booking'?displayBookings.find(b=>b.id===selected.id):null;
  $: selectedStory=selected?.kind==='story'?data.stories.find(s=>s.id===selected.id):null;
  $: selectedEpic=selected?.kind==='epic'?data.epics.find(e=>e.id===selected.id):null;
  $: selectedSchedule=selectedStory?scheduleFor(selectedStory,data.sprints,data.epics):selectedEpic?.plannedStart&&selectedEpic?.plannedEnd?{start:selectedEpic.plannedStart,end:selectedEpic.plannedEnd,project:selectedEpic.project}:null;
  function showSelectedOnTimeline(){
    const item=selectedStory||selectedEpic,dates=selectedSchedule;
    if(!item||!dates)return;
    const mode=selectedStory?'projects':'roadmap';
    selectedProjects=[dates.project];periodStart=dates.start;
    changeView(mode);query=item.id;
  }
  $: selectedPerson=selected?.kind==='person'?personOf(selected.id):selectedBooking?personOf(selectedBooking.person):selectedStory?personOf(selectedStory.person):null;
  $: detailLoad=selectedPerson?personLoad(selectedPerson.id,bookings,periodStart,periodEnd):null;
  $: backlog=data.stories.filter(s=>!scheduleFor(s,data.sprints,data.epics)&&configuration.types.includes(s.type||'story')&&(!s.person||configuration.people.includes(s.person))&&selectedProjects.includes(s.project||data.epics.find(e=>e.id===s.epic)?.project));
  $: scopedStories=data.stories.filter(s=>selectedProjects.includes(s.project)&&configuration.types.includes(s.type||'story')&&(!s.person||configuration.people.includes(s.person)));
  $: scheduledStories=scopedStories.map(s=>scheduleFor(s,data.sprints,data.epics)).filter(Boolean);
  $: schedulesInWindow=scheduledStories.filter(s=>s.start<timelineEnd&&s.end>=timelineStart);
  function showScheduledWork(){const dates=scheduledStories.map(s=>s.start).sort();periodStart=dates.find(d=>d>=iso(new Date()))||dates.at(-1)||periodStart;}
  function notify(message){toast=message;clearTimeout(timer);timer=setTimeout(()=>toast='',3500);}
  function changeView(id){view=id;selected=null;query='';onlyRisk=false;}
  function makeChart(mode,people,projects,bs,workspace,search,start,end,scope,actuals,inPeriod){
    let groups=[],items=[];
    if(mode==='resources'){
      ({groups,items}=resourceChart(workspace,people,projects,scope,search,start,end,inPeriod));
    } else if(mode==='projects'){
      ({groups,items}=projectChart(workspace,projects,scope,search,start,end));
    } else {
      if(!scope.types.includes('epic'))return{groups:[],items:[]};
      groups=projects.map((p,i)=>({id:p.id,order:i,content:`<div class="roadmap-label"><span class="project-square ${p.color}">${esc(p.key[0])}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.owner)}</small></div></div>`}));
      items=workspace.epics.filter(e=>e.plannedStart&&e.plannedEnd&&projects.some(p=>p.id===e.project)&&(e.id+' '+e.title+' '+(e.goal||'')).toLowerCase().includes(search.toLowerCase())).map(e=>({id:`epic|${e.id}`,group:e.project,start:day(e.plannedStart),end:day(addDays(e.plannedEnd,1)),className:`roadmap-bar ${projectOf(e.project).color}`,content:`<span class="bar-title">${esc(e.title)}</span><span class="bar-sub">${esc(e.status)} · ${e.progress}% complete</span><div class="epic-progress"><i style="width:${e.progress}%"></i></div>`}));
      for(const e of workspace.epics.filter(e=>e.plannedStart&&e.plannedEnd&&projects.some(p=>p.id===e.project)&&(e.id+' '+e.title+' '+(e.goal||'')).toLowerCase().includes(search.toLowerCase())))items.push({id:`milestone|${e.id}`,group:e.project,start:day(e.target),type:'point',editable:{updateTime:true,updateGroup:false,remove:false},className:'milestone',content:`◆ ${esc(e.milestone)}`});
    }
    if(actuals){
      const addActual=(entity,kind,group)=>{
        if(!entity.actualStart||!groups.some(g=>g.id===group))return;
        const complete=Boolean(entity.actualEnd);
        items.push({id:`actual|${kind}|${entity.id}`,group,subgroup:'actual',start:day(entity.actualStart),...(complete?{end:day(addDays(entity.actualEnd,1)),type:'range'}:{type:'point'}),editable:false,className:'actual-bar',content:`${complete?'Actual':'Started'} · ${esc(entity.title)}`});
      };
      if(mode==='roadmap')workspace.epics.filter(e=>e.plannedStart&&e.plannedEnd&&projects.some(p=>p.id===e.project)&&(e.id+' '+e.title+' '+(e.goal||'')).toLowerCase().includes(search.toLowerCase())).forEach(e=>addActual(e,'epic',e.project));
      else if(mode==='projects'){workspace.epics.forEach(e=>addActual(e,'epic',e.id));workspace.stories.forEach(s=>addActual(s,'story',s.id));}
      else workspace.stories.forEach(s=>addActual(s,'story',s.id));
    }
    for(let d=start;d<end;d=addDays(d,1)) if(day(d).getDay()===6)items.push({id:`weekend-${d}`,start:day(d),end:day(addDays(d,2)),type:'background',className:'weekend-bg',selectable:false});
    return{groups,items};
  }
  function selectItem(id){const parts=String(id).split('|');const kind=parts[0]==='actual'?parts[1]:parts[0],key=parts[0]==='actual'?parts[2]:parts[1];if(['booking','story','epic','milestone'].includes(kind))selected={kind:kind==='milestone'?'epic':kind,id:key};}
  function commit(next,message){if(!canEdit())return false;changed=true;session.save(next,configuration).then(ok=>{if(ok){changed=false;notify(message);}});return true;}
  async function undo(){if(await session.undo()){selected=null;notify('Last saved change undone');}}
  function applyConfiguration(next){if(!canEdit())return;selectedProjects=next.projects.slice();session.save(data,next).then(ok=>{if(ok)notify('Workspace configuration saved');});}
  function openPlanner(range={}){
    if(!canEdit())return;
    if(!activeProjects.length){notify('Enable a project in Configuration first');return;}
    const kind=view==='roadmap'?'epic':'story';
    if(kind==='epic'&&!configuration.types.includes('epic')||kind==='story'&&!configuration.types.some(t=>t!=='epic')){notify('Enable a matching work item type in Configuration first');return;}
    if(kind==='story'&&!activePeople.length){notify('Enable a resource in Configuration first');return;}
    const resourceTarget=view==='resources'?resourceLane(data,range.group):null;
    const epic=resourceTarget?.epic?data.epics.find(e=>e.id===resourceTarget.epic):view==='projects'?(data.epics.find(e=>e.id===range.group)||data.epics.find(e=>e.id===data.stories.find(s=>s.id===range.group)?.epic)):null;
    const project=kind==='epic'&&range.group?range.group:resourceTarget?.project||epic?.project||visibleProjects[0]?.id||activeProjects[0].id;
    const sprint=range.start?sprintForDate(data,project,range.start):data.sprints.find(s=>s.project===project)?.id||'';
    const sp=sprintOf(sprint);
    draft={kind,type:configuration.types.find(t=>t!=='epic')||'story',title:'',goal:'',project,epic:epic?.id||data.epics.find(e=>e.project===project)?.id||'',person:resourceTarget?.person||activePeople[0]?.id||'',sprint:sprint||'',points:range.start?Math.max(1,workingDays(range.start,range.end).length):3,explicit:Boolean(range.start)||!sprint,start:range.start||sp?.start||periodStart,end:range.end||sp?.end||addDays(periodStart,4)};
    formError='';modal=true;
  }
  function addAllocation(event){
    event.preventDefault();if(!canEdit())return;formError='';const sp=sprintOf(draft.sprint);
    const start=draft.explicit||draft.kind==='epic'?draft.start:sp?.start,end=draft.explicit||draft.kind==='epic'?draft.end:sp?.end;
    if(!draft.title.trim()||!start||!end||start>end||!workingDays(start,end).length){formError='Enter a title and a date range with at least one working day.';return;}
    const id='DRAFT-'+Date.now();
    if(draft.kind==='epic'){
      commit({...data,epics:[...data.epics,{id,project:draft.project,title:draft.title.trim(),goal:draft.goal||'Outcome to be defined',plannedStart:start,plannedEnd:end,actualStart:null,actualEnd:null,target:end,milestone:draft.title.trim()+' ready',status:'Planned',progress:0}]},'Epic added to the roadmap');selected={kind:'epic',id};
    }else{
      if(!Number.isFinite(+draft.points)||+draft.points<=0||!draft.epic||!configuration.types.includes(draft.type)||!activePeople.some(p=>p.id===draft.person)){formError='Choose an epic and story points greater than zero.';return;}
      commit({...data,stories:[...data.stories,{id,project:draft.project,title:draft.title.trim(),type:draft.type,person:draft.person,sprint:draft.sprint||null,points:+draft.points,epic:draft.epic,status:'Draft',plannedStart:draft.explicit?start:null,plannedEnd:draft.explicit?end:null,actualStart:null,actualEnd:null}]},'Work item added · capacity updated');selected={kind:'story',id};
    }
    modal=false;
  }
  function moveItem(change){if(!canEdit())return;try{if(change.kind==='booking'){const booking=displayBookings.find(b=>b.id===change.id);const scoped={...data,stories:data.stories.filter(s=>booking?.stories.some(item=>item.id===s.id))};const result=movePlannedItem(scoped,change,view);const updates=new Map(result.data.stories.map(s=>[s.id,s]));commit({...data,stories:data.stories.map(s=>updates.get(s.id)||s)},result.message);}else{const result=movePlannedItem(data,change,view);commit(result.data,result.message);}}catch(error){notify(error.message);}}
  function reassign(storyId,person){if(!canEdit())return;const original=data.stories.find(s=>s.id===storyId).person;commit({...data,stories:data.stories.map(s=>s.id===storyId?{...s,person}:s)},'Scenario updated · capacity recalculated');selected={kind:'person',id:original};}
  function saveDates(dates){
    if(!canEdit())return;
    if(!workingDays(dates.plannedStart,dates.plannedEnd).length){notify('Planned dates need at least one working day');return;}
    const key=selected.kind==='epic'?'epics':'stories';commit({...data,[key]:data[key].map(item=>item.id===selected.id?{...item,...dates}:item)},'Planned and actual dates saved');
  }
  function focusPanel(node){const prior=document.activeElement;queueMicrotask(()=>{(node.querySelector('input')||node.querySelector('button'))?.focus({preventScroll:true});});const trap=e=>{if(e.key!=='Tab')return;const nodes=[...node.querySelectorAll('button,input,select,a[href]')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};node.addEventListener('keydown',trap);return{destroy(){node.removeEventListener('keydown',trap);prior?.focus();}};}
  function saveAssignment(values){
    if(!canEdit())return;
    if(selectedEpic){
      const start=selectedEpic.plannedStart,end=selectedEpic.plannedEnd;
      let next=data;
      if(start&&end)next=movePlannedItem(data,{kind:'epic',id:selectedEpic.id,group:values.project,start,end},'roadmap').data;
      else next={...data,epics:data.epics.map(e=>e.id===selectedEpic.id?{...e,project:values.project}:e)};
      commit({...next,epics:next.epics.map(e=>e.id===selectedEpic.id?{...e,target:values.target}:e)},'Epic assignment saved');
    }else if(selectedStory){
      const before=scheduleFor(selectedStory,data.sprints,data.epics);
      const dates=before&&selectedStory.sprint!==values.sprint&&!values.sprint?{plannedStart:before.start,plannedEnd:before.end}:{};
      commit({...data,stories:data.stories.map(s=>s.id===selectedStory.id?{...s,...dates,...values,project:data.epics.find(e=>e.id===values.epic)?.project||values.project}:s)},'Work item assignment saved');
    }
  }

</script>

<svelte:window onkeydown={e=>{if(e.key==='Escape'){selected=null;modal=false;showPolicy=false;}}}/>

<div class="app-shell" inert={!!selected || modal || showPolicy}>
  <aside class="sidebar">
    <a class="brand" href="/" onclick={e=>{e.preventDefault();changeView('resources');}}><span class="brand-icon"><Activity size={23}/></span>pulse</a>
    <div class="workspace-switch"><span class="workspace-avatar">S</span><div>Studio Workspace<small>Portfolio Planning</small></div></div>
    <div class="nav-caption">WORKSPACE</div>
    <nav aria-label="Main navigation">{#each nav as n}<button class:active={view===n.id} onclick={()=>changeView(n.id)}><n.icon size={18}/>{n.label}{#if view===n.id}<span class="nav-active-dot"></span>{/if}</button>{/each}<button class:active={view==='configuration'} onclick={()=>changeView('configuration')}><Settings2 size={18}/>Configuration</button></nav>
    <div class="sidebar-divider"></div><div class="nav-caption">YOUR PROJECTS <span>{activeProjects.length}</span></div>
    <div class="project-nav">{#each activeProjects as p}<button class:chosen={selectedProjects.length<activeProjects.length&&selectedProjects.includes(p.id)} onclick={()=>{selectedProjects=selectedProjects.length===1&&selectedProjects[0]===p.id?activeProjects.map(p=>p.id):[p.id];}}><span class="project-dot {p.color}"></span><span class="project-nav-name">{p.name}</span><span class="project-nav-key">{p.key}</span></button>{/each}</div>
    <div class="sidebar-bottom"><button class="help-link" onclick={()=>showPolicy=true}><CircleHelp size={17}/> How Capacity Works</button><div class="profile"><span class="user-avatar">AF</span><div>Afroz<small>Workspace Owner</small></div><span class="online-dot"></span></div></div>
  </aside>
  <main>
    {#if !nativeHost}<header class="topbar"><div>Workspace <span>/</span> <strong>{view==='configuration'?'Configuration':nav.find(n=>n.id===view).label}</strong></div><div class="topbar-right"><span class="source-dot"></span><span>{source}</span><span class="divider"></span><span class="outline-chip">Preview</span><span class="user-avatar small">AF</span></div></header>{/if}
    <section class="page">
      {#if sessionState.phase!=='ready'||sessionState.error}<div class="workspace-notice" role="status"><strong>{sessionState.phase==='loading'?'Loading saved workspace…':sessionState.phase==='saving'?'Saving workspace…':sessionState.phase==='conflict'?'Draft needs review':sessionState.phase==='failed'?'Draft not saved':sessionState.phase==='offline'?'Server unavailable':'Workspace notice'}</strong><p>{sessionState.error}</p>{#if sessionState.pending}<p>Your draft remains visible and is kept on this device. Further edits are paused until this is resolved.</p><button class="plain-button" onclick={exportDraft}>Download draft</button>{/if}{#if sessionState.phase==='failed'}<button class="primary-button" onclick={()=>session.persist()}>Retry save</button>{/if}{#if sessionState.phase==='conflict'&&sessionState.remote}<button class="primary-button" onclick={()=>session.persist(true)}>Replace latest saved workspace with this draft</button>{/if}{#if sessionState.pending&&sessionState.phase!=='saving'}<button class="plain-button" onclick={()=>session.discard()}>Discard draft and load saved workspace</button>{/if}{#if sessionState.phase==='offline'||sessionState.phase==='ready'&&sessionState.error||sessionState.phase==='conflict'&&!sessionState.remote}<button class="plain-button" onclick={()=>session.load()}>Reload from server</button>{/if}</div>{/if}
      {#if loadedWorkspace}
      {#if view==='configuration'}<Configuration {data} value={configuration} disabled={!editable} onsave={applyConfiguration}><JiraConnection status={sessionState.jira} version={sessionState.version} disabled={!editable} onimport={importJira} onstatus={updateJiraStatus}/></Configuration>{:else if !data.projects.length}<section class="planning-panel empty-state"><GitBranch size={28}/><h1>Connect Your Jira Workspace</h1><p>Choose your projects in Configuration to import work items, people, and sprint calendars.</p><button class="primary-button" onclick={()=>changeView('configuration')}>Open Configuration <ArrowRight size={16}/></button></section>{:else}
      <div class="page-heading"><div><div class="eyebrow">A LITTLE CLARITY GOES A LONG WAY</div><h1>{headings[view][0]}</h1><p>{headings[view][1]}</p></div><button class="primary-button" disabled={!editable} onclick={()=>openPlanner()}><Plus size={17}/> Plan Allocation</button></div>

      {#if view==='resources'}
      <div class="metrics"><div><span class="metric-icon"><Users size={19}/></span><section><span>People in Your Portfolio</span><strong>{activePeople.length}<small>{shared.length} shared across projects</small></strong></section></div><div><span class="metric-icon"><Activity size={19}/></span><section><span>Planned Capacity</span><strong>{pct(utilization)}%<small>across this date range</small></strong></section></div><div><span class="metric-icon warning"><AlertTriangle size={19}/></span><section><span>People Over Capacity</span><strong>{risks.length}<small>{risks.length?'Some days need a second look':'Everyone has breathing room'}</small></strong></section><button class="text-button" onclick={()=>onlyRisk=!onlyRisk}>{onlyRisk?'Show all':'Review'}<ArrowRight size={14}/></button></div></div>
      {:else if view==='projects'}
      <div class="sprint-strip"><span class="strip-label"><GitBranch size={17}/>PROJECT SPRINTS</span>{#each visibleProjects as p}{@const s=data.sprints.find(s=>s.project===p.id&&s.end>=periodStart)}{#if s}<div><span class="project-dot {p.color}"></span><strong>{p.name}</strong><span>{s.name}</span><small>{shortDate(s.start)} – {shortDate(s.end)}</small></div>{/if}{/each}</div>
      {:else}
      <div class="roadmap-intro"><span class="quarter-badge">Q{quarterMonth/3+1} <strong>{day(periodStart).getFullYear()}</strong></span><div><strong>Build the foundations. Make every experience better.</strong><p>{data.epics.length} epics across {data.projects.length} projects · milestones and dependencies in one place</p></div><span class="outline-chip">Quarterly outlook</span></div>
      {/if}

      {#if view!=='roadmap'&&scopedStories.length&&!schedulesInWindow.length}
      <div class="workspace-notice" role="status"><strong>{scheduledStories.length?'Scheduled tickets are outside this date range':'These tickets have no schedule yet'}</strong>
        <p>{scheduledStories.length?scheduledStories.length+' tickets have planned or sprint dates. Change the date range to see their bars.':scopedStories.length+' imported tickets are available, but have no complete planned dates or dated sprint. Open a ticket under Projects to set dates, or refresh Jira to import its dates and sprints.'}</p>
        {#if scheduledStories.length}<button class="plain-button" onclick={showScheduledWork}>Show Scheduled Work</button>{:else}<button class="plain-button" onclick={()=>changeView('configuration')}>Jira Import Settings</button>{#if view==='resources'}<button class="plain-button" onclick={()=>changeView('projects')}>View Tickets</button>{/if}{/if}
      </div>
      {/if}
      <section class="planning-panel" aria-label="Planning timeline">
        <div class="planning-toolbar"><div class="date-controls"><button class="icon-button" aria-label="Previous period" onclick={()=>periodStart=addDays(view==='roadmap'?quarterStart:periodStart,view==='roadmap'?-1:-periodDays)}><ChevronLeft size={17}/></button><strong>{view==='roadmap'?`${shortDate(quarterStart)} – ${shortDate(addDays(quarterFinish,-1))}, ${day(periodStart).getFullYear()}`:`${shortDate(periodStart)} – ${shortDate(periodEnd)}, ${day(periodEnd).getFullYear()}`}</strong><button class="icon-button" aria-label="Next period" onclick={()=>periodStart=view==='roadmap'?quarterFinish:addDays(periodStart,periodDays)}><ChevronRight size={17}/></button><button class="plain-button" onclick={()=>periodStart=iso(new Date())}>Today</button></div><div class="toolbar-right"><button class="plain-button" disabled={sessionState.phase!=='ready'} onclick={()=>showDeliveryPreview=true}>Preview &amp; Export</button><button class="plain-button" onclick={undo} disabled={!editable||!sessionState.canUndo} title="Undo last edit"><Undo2 size={13}/>Undo</button><label class="actual-toggle"><input type="checkbox" bind:checked={showActuals}/>Actuals</label>{#if view==='resources'}<label class="actual-toggle" title="Uncheck to include older, future, and unscheduled tickets"><input type="checkbox" bind:checked={resourceInPeriod}/>In This Period</label>{/if}<ProjectFilter projects={activeProjects} bind:value={selectedProjects}/>{#if view!=='roadmap'}<select class="zoom-select" aria-label="Timeline range" bind:value={periodDays}><option value={14}>2 Weeks</option><option value={21}>3 Weeks</option><option value={28}>4 Weeks</option></select>{:else}<span class="plain-button">Quarter View</span>{/if}</div></div>
        <div class="timeline-instructions"><span>Drag empty space to create · drag bars to move · drag edges to resize</span><span>{view==='resources'?'Expand projects for tickets · drag between people to reassign':view==='projects'?'Current work first · move stories across epic lanes':'Move epics across project lanes'} · double-click for details</span></div><div class="timeline-subhead"><label class="search-box"><Search size={15}/><input aria-label="Search timeline" placeholder={view==='resources'?'Find a person, project, or ticket…':view==='projects'?'Find an epic or story…':'Find an epic…'} bind:value={query}/></label><div class="legend">{#each visibleProjects as p}<span><i class="project-dot {p.color}"></i>{p.name}</span>{/each}{#if view==='resources'}<span><i class="risk-swatch"></i>Over Capacity</span>{/if}</div></div>
        {#if chart.groups.length}<Timeline groups={chart.groups} items={chart.items} start={timelineStart} end={timelineEnd} mode={view} onselect={selectItem} oncreate={openPlanner} onmove={moveItem}/>{:else}<div class="empty-state"><Search size={28}/><h3>No Matches in This View</h3><p>Try a different name or clear the filters.</p><button class="plain-button" onclick={()=>{query='';selectedProjects=activeProjects.map(p=>p.id);onlyRisk=false;}}>Clear Filters</button></div>{/if}
        <div class="timeline-footer"><span><Info size={14}/>{view==='resources'?'Planned dates drive capacity · actuals are recorded separately':view==='projects'?'Drag edits planned dates · untouched stories inherit sprint dates':'Colored bars: planned · charcoal bars: actual · epics do not shift child dates'}</span><span>{view==='resources'?'Person labels show peak daily load across all projects':view==='projects'?'Independent sprint calendars':'◆ Release milestone'}</span></div>
      </section>

      {#if view==='resources'}
        <div class="below-grid"><section class="attention-panel"><div class="section-title"><span class="attention-dot"></span><h2>A Little Attention Here</h2><span>{risks.length} people</span></div>{#if risks.length}{#each risks.slice(0,3) as p}<button class="risk-row" onclick={()=>selected={kind:'person',id:p.id}}><span class="avatar {p.color}">{p.initials}</span><span><strong>{p.name}</strong><small>{p.overloaded.length} workdays over capacity · first on {shortDate(p.overloaded[0].date)}</small></span><span class="risk-badge">{pct(p.peak)}% peak</span><ArrowUpRight size={17}/></button>{/each}{:else}<p class="clear-message"><Check size={18}/> No capacity conflicts in this period.</p>{/if}</section><section class="note-panel"><span class="note-icon"><GitBranch size={20}/></span><h2>Different sprints. One clear picture.</h2><p>Each project keeps its rhythm. Pulse brings the dates together and checks each person’s total daily commitment.</p><button class="text-button" onclick={()=>showPolicy=true}>See the Capacity Model <ArrowRight size={15}/></button></section></div>
      {:else if view==='projects'}
        <section class="backlog-panel"><div class="section-title"><h2>Not Yet Scheduled</h2><span>{backlog.length} stories</span></div>{#each backlog as s}<div class="backlog-row"><span>{s.id}</span><strong>{s.title}</strong><span>{s.points} SP</span><button class="plain-button" onclick={()=>{openPlanner();draft={...draft,title:s.title,points:s.points};notify('Planning a separate draft; the backlog item stays unchanged');}}>Plan a Draft <Plus size={14}/></button></div>{/each}{#if !backlog.length}<p class="clear-message">All stories in this selection have a sprint.</p>{/if}</section>
      {:else}
        <section class="dependencies-panel"><div class="section-title"><GitBranch size={17}/><h2>Connections to Keep in View</h2><span>2 dependencies</span></div>{#each data.epics.filter(e=>e.dependsOn) as e}<button class="dependency-row" onclick={()=>selected={kind:'epic',id:e.id}}><span class="project-dot lavender"></span><strong>{data.epics.find(x=>x.id===e.dependsOn)?.title||'Unknown dependency'}</strong><ArrowRight size={16}/><span class="project-dot {projectOf(e.project).color}"></span><strong>{e.title}</strong><span>Needs Identity API by {data.epics.find(x=>x.id===e.dependsOn)?.target?shortDate(data.epics.find(x=>x.id===e.dependsOn).target):'unknown date'}</span><ArrowUpRight size={16}/></button>{/each}</section>
      {/if}
      {/if}
      {#if view!=='configuration'&&data.projects.length}<DataQuality {data} people={configuration.people} projects={selectedProjects} types={configuration.types} onselect={item=>selected=item}/>{/if}
      <footer class="page-footer"><span><span class="green-dot"></span>{sessionState.source==='jira'?'Imported Jira portfolio':'Local workspace'} · {sessionState.phase==='saving'?'Saving…':sessionState.pending?'Draft not saved':`Saved · revision ${sessionState.version}`} </span></footer>
      {/if}
    </section>
  </main>
</div>

{#if selected}
<button type="button" class="drawer-shade" aria-label="Close details by clicking outside" tabindex="-1" onclick={()=>selected=null}></button><aside use:focusPanel class="detail-drawer" aria-label="Allocation details"><div class="drawer-top"><span>Plan Details</span><button class="icon-button" aria-label="Close details" onclick={()=>selected=null}><PanelRightClose size={20}/></button></div>
  {#if selectedPerson}
    <div class="drawer-person"><span class="avatar large {selectedPerson.color}">{selectedPerson.initials}</span><div><h2>{selectedPerson.name}</h2><p>{selectedPerson.role}</p></div></div>
    {#if selectedBooking}{@const p=projectOf(selectedBooking.project)}{@const s=sprintOf(selectedBooking.sprint)}<div class="booking-highlight {p.color}"><span>{p.name} · {s?.name||'No sprint'}</span><strong>{selectedBooking.points} SP <small>→ {number(selectedBooking.dailyRate)} SP / workday</small></strong><p>{shortDate(selectedBooking.start)} – {shortDate(selectedBooking.end)} · {workingDays(selectedBooking.start,selectedBooking.end).length} workdays · {selectedBooking.explicit?'Planned dates':'From sprint'}</p></div>{/if}
    {#if selectedStory}<h3>{selectedStory.id} · {selectedStory.title}</h3><p class="muted">{selectedStory.points??'Unknown'} SP · {selectedStory.status}</p>{/if}
    <div class="detail-heading"><h3>Combined Daily Load</h3><span class:danger={detailLoad.peak>1}>{pct(detailLoad.peak)}% peak</span></div><p class="detail-caption">All projects · {shortDate(periodStart)} – {shortDate(periodEnd)} · capacity 1 SP/day</p>
    <div class="daily-grid">{#each detailLoad.days as d}<div class:hot={d.load>1.000001} class:free={d.load===0} title={`${shortDate(d.date)}: ${number(d.load)} SP`}><small>{day(d.date).getDate()}</small><strong>{number(d.load)}</strong></div>{/each}</div>
    {#if detailLoad.overloaded.length}<div class="detail-warning"><AlertTriangle size={17}/><span><strong>{detailLoad.overloaded.length} days over capacity</strong>Move work to another sprint or reassign a story to free up space.</span></div>{/if}
    <h3 class="spaced-heading">{selectedBooking?'Stories in This Allocation':'Assigned Stories'}</h3><p class="detail-caption">Try reassigning a story. All three views update.</p>
    {#each (selectedBooking?selectedBooking.stories:data.stories.filter(s=>s.person===selectedPerson.id&&scheduleFor(s,data.sprints,data.epics))) as s}<div class="detail-story"><span class="issue-key">{s.id}</span><strong>{s.title}</strong><div><span>{s.points} SP · {s.status}</span><select aria-label={`Reassign ${s.id}`} value={s.person} disabled={!editable} onchange={e=>reassign(s.id,e.currentTarget.value)}>{#each activePeople as p}<option value={p.id}>{p.name}</option>{/each}</select></div><button class="story-dates-button" onclick={()=>selected={kind:'story',id:s.id}}>Edit Planned & Actual Dates <ArrowRight size={12}/></button></div>{/each}
  {:else if selectedStory}<h2 class="epic-detail-title">{selectedStory.id} · {selectedStory.title}</h2><p class="muted">{selectedStory.points??'Unknown'} SP · {selectedStory.status} · Unassigned</p>
  {:else if selectedEpic}
    {@const p=projectOf(selectedEpic.project)}<span class="project-pill {p.color}">{p.name} · {selectedEpic.id}</span><h2 class="epic-detail-title">{selectedEpic.title}</h2><p class="epic-goal">{selectedEpic.goal}</p><div class="detail-status"><span>{selectedEpic.status}</span><strong>{selectedEpic.progress}% complete</strong></div><div class="progress-track"><i style={`width:${selectedEpic.progress}%`}></i></div><dl><div><dt>Planned Window</dt><dd>{selectedEpic.plannedStart?shortDate(selectedEpic.plannedStart):'Not set'} – {selectedEpic.plannedEnd?shortDate(selectedEpic.plannedEnd):'Not set'}</dd></div><div><dt>Project Lead</dt><dd>{p.owner}</dd></div><div><dt>Milestone</dt><dd>◆ {selectedEpic.milestone}</dd></div><div><dt>Target Date</dt><dd>{selectedEpic.target?shortDate(selectedEpic.target):'Not set'}</dd></div></dl>
    {#if selectedEpic.dependsOn}{@const dep=data.epics.find(e=>e.id===selectedEpic.dependsOn)}<div class="dependency-callout"><GitBranch size={18}/><h3>Depends on {dep?.title||'Unknown dependency'}</h3><p>{dep?.milestone||'Milestone'} is planned for {dep?.target?shortDate(dep.target):'unknown date'}. Dependent work can begin earlier, but release needs this milestone.</p><button class="text-button" disabled={!dep} onclick={()=>selected={kind:'epic',id:dep.id}}>Inspect Dependency <ArrowRight size={15}/></button></div>{/if}
    <button class="primary-button full" onclick={()=>{selectedProjects=[selectedEpic.project];changeView('projects');}}>Explore epics & stories <ArrowRight size={16}/></button><p class="detail-caption">Progress and health are illustrative planning fields.</p>
  {/if}
  {#if selectedStory||selectedEpic}
    {#if selectedSchedule}<button class="plain-button full" onclick={showSelectedOnTimeline}><CalendarDays size={16}/> Show on Timeline</button><p class="detail-caption">Jump to {shortDate(selectedSchedule.start)} – {shortDate(selectedSchedule.end)}, {day(selectedSchedule.start).getFullYear()} and focus this item.</p>{:else}<p class="detail-caption">Set planned dates below to place this item on the timeline.</p>{/if}
    <AssignmentEditor entity={selectedStory||selectedEpic} kind={selectedStory?'story':'epic'} data={{...data,projects:activeProjects,people:activePeople}} disabled={!editable} onsave={saveAssignment}/><ScheduleDates disabled={!editable} entity={selectedStory||selectedEpic} fallback={selectedStory?scheduleFor(selectedStory,data.sprints,data.epics):null} onsave={saveDates}/>{/if}
  <div class="drawer-bottom"><Info size={14}/>{sessionState.source==='jira'?'Pulse plan · Jira write-back is disabled':'Pulse plan · Jira is not connected'}</div>
</aside>
{/if}

{#if modal}<ScheduleEditor types={configuration.types.filter(t=>t!=='epic')} data={{...data,projects:activeProjects,people:activePeople}} bind:draft error={formError} {focusPanel} onsave={addAllocation} onclose={()=>modal=false}/>{/if}
{#if showDeliveryPreview}<DeliveryPreview {data} projects={visibleProjects} {configuration} start={timelineStart} end={addDays(timelineEnd,-1)} initialDetail={view==='roadmap'?'epics':'tasks'} onclose={()=>showDeliveryPreview=false}/>{/if}
{#if showPolicy}
<div class="modal-shade"><div use:focusPanel tabindex="-1" class="modal policy-modal" role="dialog" aria-modal="true" aria-labelledby="policy-title"><div class="modal-heading"><span class="modal-symbol"><Activity size={23}/></span><button class="icon-button" aria-label="Close capacity explanation" onclick={()=>showPolicy=false}><X size={20}/></button></div><h2 id="policy-title">One person. One daily budget.</h2><p>Different sprint dates don’t have to mean double-booked people.</p><div class="policy-equation"><strong>1 SP</strong><span>per person, per working day<br/>shared across every project</span></div><ol><li><strong>Keep each project’s sprint dates.</strong> A two-week, Monday–Friday sprint offers 10 working days.</li><li><strong>Spread the estimate.</strong> An 8 SP assignment over 10 working days contributes 0.8 SP/day.</li><li><strong>Add overlapping work.</strong> Another 5 SP over 10 days adds 0.5 SP/day. The overlap is 1.3 SP/day, or 130%.</li></ol><div class="policy-note">Untouched items inherit sprint dates. Dragging or editing dates creates an explicit plan; actual dates stay separate. Weekends are excluded. Holidays, leave, and part-time schedules belong in the next iteration.</div><p class="detail-caption">Your planning convention assumes comparable points across projects. This is a capacity estimate, not a productivity score. Completed stories remain in the sprint’s committed plan.</p><button class="primary-button full" onclick={()=>showPolicy=false}>Got It <Check size={16}/></button></div></div>
{/if}
{#if toast}<div class="toast" role="status"><Check size={16}/>{toast}</div>{/if}





<style>
.workspace-notice{padding:18px 22px;margin-bottom:22px;background:var(--amber-surface,#fff8eb);border:1px solid var(--line,#eadbc0);border-radius:8px;font-size:12px}.workspace-notice p{margin:9px 0;line-height:1.7;color:var(--amber-text,#887453)}.workspace-notice button{margin:6px 10px 3px 0}button:disabled{opacity:.5;cursor:wait}
</style>
