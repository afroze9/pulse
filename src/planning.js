export const dailyCapacity = 1;
export function normalizeWorkspace(input) {
  const normalize=entry=>{const {start,end,...rest}=entry;return {...rest,plannedStart:entry.plannedStart??start??null,plannedEnd:entry.plannedEnd??end??null,actualStart:entry.actualStart??null,actualEnd:entry.actualEnd??null};};
  return {...structuredClone(input),epics:input.epics.map(e=>({...normalize(e),goal:e.goal||'',milestone:e.milestone||'Milestone',progress:e.progress||0})),stories:input.stories.map(s=>({...normalize(s),project:s.project||input.epics.find(e=>e.id===s.epic)?.project||input.sprints.find(sp=>sp.id===s.sprint)?.project||null,type:(s.type||'story').toLowerCase()}))};
}
export const day = value => new Date(`${value}T00:00:00`);
export const iso = value => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
export function addDays(value, count) { const date = day(value); date.setDate(date.getDate()+count); return iso(date); }
export function workingDays(start, end) { const result=[]; for(let date=start; date<=end; date=addDays(date,1)) if(![0,6].includes(day(date).getDay())) result.push(date); return result; }
export function scheduleFor(story, sprints, epics=[]) {
  const sprint=sprints.find(s=>s.id===story.sprint);
  const explicit=Boolean(story.plannedStart&&story.plannedEnd);
  const project=epics.find(e=>e.id===story.epic)?.project || story.project || sprint?.project;
  const start=explicit?story.plannedStart:sprint?.start, end=explicit?story.plannedEnd:sprint?.end;
  if(!project||!start||!end||!workingDays(start,end).length)return null;
  return {project,start,end,explicit,sprint:sprint?.id||null};
}
export function allocations(stories, sprints, epics=[]) {
  const map = new Map();
  for(const story of stories) {
    if(!story.person||!Number.isFinite(story.points)||story.points<0)continue;
    const schedule=scheduleFor(story,sprints,epics); if(!schedule)continue;
    const id=`${story.person}:${schedule.sprint||'planned'}:${schedule.project}:${schedule.start}:${schedule.end}`;
    if(!map.has(id))map.set(id,{id,person:story.person,...schedule,points:0,stories:[]});
    const group=map.get(id);group.points+=story.points;group.stories.push(story);group.explicit ||= schedule.explicit;
  }
  return [...map.values()].map(b=>({...b,dailyRate:b.points/workingDays(b.start,b.end).length}));
}
export function overlappingProjects(person,date,bookings){if([0,6].includes(day(date).getDay()))return [];return [...new Set(bookings.filter(b=>b.person===person&&b.start<=date&&b.end>=date).map(b=>b.project))];}
export function overlapDays(person,bookings,start,end){return workingDays(start,end).filter(date=>overlappingProjects(person,date,bookings).length>1);}
export function dailyLoad(person,date,bookings){if([0,6].includes(day(date).getDay()))return 0;return bookings.filter(b=>b.person===person&&b.start<=date&&b.end>=date).reduce((sum,b)=>sum+b.dailyRate,0);}
export function personLoad(person,bookings,start,end){const days=workingDays(start,end).map(date=>({date,load:dailyLoad(person,date,bookings)}));return{days,peak:Math.max(0,...days.map(d=>d.load)),overloaded:days.filter(d=>d.load>dailyCapacity+1e-8),average:days.length?days.reduce((s,d)=>s+d.load,0)/days.length:0};}
export function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export function sprintForDate(data, project, start) {
  return data.sprints.find(s=>s.project===project&&s.start<=start&&s.end>=start)?.id||null;
}
export function movePlannedItem(data, {kind,id,group,start,end}, view) {
  if(!start||!end||start>end||!workingDays(start,end).length)throw Error('Choose a range with at least one working day.');
  if(kind==='booking') {
    const booking=allocations(data.stories,data.sprints,data.epics).find(b=>b.id===id);
    if(!booking||!data.people.some(p=>p.id===group))throw Error('Drop the allocation into a person’s lane.');
    const ids=new Set(booking.stories.map(s=>s.id));
    return{data:{...data,stories:data.stories.map(s=>ids.has(s.id)?{...s,person:group,plannedStart:start,plannedEnd:end}:s)},message:`${ids.size} ${ids.size===1?'story':'stories'} rescheduled · capacity updated`};
  }
  if(kind==='story'&&view==='resources') {
    const story=data.stories.find(s=>s.id===id),lane=resourceLane(data,group);
    if(!story||!lane)throw Error('Drop the ticket into a person or project lane.');
    const project=story.project||data.epics.find(e=>e.id===story.epic)?.project;
    if(lane.project&&lane.project!==project)throw Error('Choose the same project under the destination person. Change project in ticket details.');
    return {data:{...data,stories:data.stories.map(s=>s.id===id?{...s,person:lane.person,plannedStart:start,plannedEnd:end}:s)},message:'Ticket dates and assignee updated · capacity recalculated'};
  }
  if(kind==='story') {
    const story=data.stories.find(s=>s.id===id);
    const epic=data.epics.find(e=>e.id===group)||data.epics.find(e=>e.id===data.stories.find(s=>s.id===group)?.epic);
    if(!story||!epic)throw Error('Drop the story into an epic or one of its story lanes.');
    const oldProject=data.epics.find(e=>e.id===story.epic)?.project;
    return{data:{...data,stories:data.stories.map(s=>s.id===id?{...s,project:epic.project,epic:epic.id,sprint:oldProject===epic.project?s.sprint:sprintForDate(data,epic.project,start),plannedStart:start,plannedEnd:end}:s)},message:'Story dates and epic updated · capacity recalculated'};
  }
  if(kind==='epic') {
    const epic=data.epics.find(e=>e.id===id);
    const project=view==='roadmap'?group:epic?.project;
    if(!epic||!data.projects.some(p=>p.id===project))throw Error('Drop the epic into a project lane.');
    const stories=project===epic.project?data.stories:data.stories.map(s=>{
      if(s.epic!==id)return s;
      const schedule=scheduleFor(s,data.sprints,data.epics);
      return schedule?{...s,project,plannedStart:schedule.start,plannedEnd:schedule.end,sprint:sprintForDate(data,project,schedule.start)}:{...s,project,sprint:null};
    });
    return{data:{...data,stories,epics:data.epics.map(e=>e.id===id?{...e,project,plannedStart:start,plannedEnd:end,target:e.target===e.plannedEnd?end:e.target}:e)},message:'Epic plan updated · story dates kept unchanged'};
  }
  if(kind==='milestone')return{data:{...data,epics:data.epics.map(e=>e.id===id?{...e,target:start}:e)},message:'Milestone target updated'};
  throw Error('This item cannot be moved.');
}


export function initialTimelineStart(workspace,today){
  const windows=[...workspace.sprints,...[...workspace.stories,...workspace.epics].map(item=>({start:item.plannedStart,end:item.plannedEnd}))].filter(window=>window.start&&window.end);
  if(windows.some(window=>window.start<=today&&window.end>=today))return today;
  const starts=windows.map(window=>window.start).sort();
  return starts.find(start=>start>=today)||starts.at(-1)||today;
}

export const resourceProjectLane=(person,project)=>'resource-project|'+encodeURIComponent(person)+'|'+encodeURIComponent(project);
export function resourceLane(data,group){
  if(data.people.some(person=>person.id===group))return {person:group,project:null,epic:null};
  if(String(group).startsWith('resource-project|')){
    const [,personId,projectId]=String(group).split('|');
    const person=decodeURIComponent(personId||''),project=decodeURIComponent(projectId||'');
    return data.people.some(p=>p.id===person)&&data.projects.some(p=>p.id===project)?{person,project,epic:null}:null;
  }
  const story=data.stories.find(s=>s.id===group);
  return story&&data.people.some(p=>p.id===story.person)?{person:story.person,project:story.project||data.epics.find(e=>e.id===story.epic)?.project,epic:story.epic}:null;
}
