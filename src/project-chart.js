import { day, addDays, scheduleFor, escapeHtml as esc } from './planning.js';

// A missing schedule affects the bar, never whether an issue has a row.
export function projectChart(workspace, projects, scope, search='', start=null, end=null) {
  const groups=[],items=[];let order=0;
  const query=search.toLowerCase();
  const exactKey=[...workspace.stories,...workspace.epics].some(item=>item.id.toLowerCase()===query);
  const expandedByDefault=workspace.stories.length<200||Boolean(query);
  const eligible=s=>scope.types.includes(s.type||'story')&&(!s.person||scope.people.includes(s.person));
  const schedules=new Map(workspace.stories.map(s=>[s.id,scheduleFor(s,workspace.sprints,workspace.epics)]));
  const inWindow=s=>{const dates=schedules.get(s.id);return Boolean(dates&&start&&end&&dates.start<end&&dates.end>=start);};
  const matching=s=>exactKey?s.id.toLowerCase()===query:(s.title+' '+s.id).toLowerCase().includes(query);
  const addStory=(s,p,nested)=>{
    const schedule=schedules.get(s.id);
    const person=workspace.people.find(p=>p.id===s.person);
    const type=s.type||'story';
    groups.push({id:s.id,treeLevel:nested?1:0,order:order++,content:`<button type="button" class="story-label story-row-link" data-work-item="${esc(s.id)}"><small>${esc(s.id)} · ${esc(type)}${schedule?(start&&!inWindow(s)?' · Outside date range':''):' · Unscheduled'}</small><strong>${esc(s.title)}</strong></button>`});
    if(schedule)items.push({id:`story|${s.id}`,group:s.id,start:day(schedule.start),end:day(addDays(schedule.end,1)),className:`story-bar ${p.color}`,content:`${esc(person?.initials||'—')} · ${Number.isFinite(s.points)?s.points+' SP':'Estimate unknown'} <span class="story-status">${esc(s.status)}</span>`});
  };
  for(const p of projects){
    const epicInWindow=e=>workspace.stories.some(s=>s.epic===e.id&&eligible(s)&&inWindow(s));
    const epics=workspace.epics.filter(e=>e.project===p.id).sort((a,b)=>Number(epicInWindow(b))-Number(epicInWindow(a)));
    for(const e of epics){
      const epicMatches=Boolean(query)&&(exactKey?e.id.toLowerCase()===query:(e.id+' '+e.title).toLowerCase().includes(query));
      const stories=workspace.stories.filter(s=>s.epic===e.id&&eligible(s)&&(epicMatches||matching(s))).sort((a,b)=>Number(inWindow(b))-Number(inWindow(a)));
      if(query&&!stories.length&&!epicMatches)continue;
      const nested=scope.types.includes('epic');
      if(nested){
        const scheduled=stories.filter(s=>scheduleFor(s,workspace.sprints,workspace.epics)).length;
        groups.push({id:e.id,treeLevel:0,order:order++,content:`<div class="epic-label"><span class="project-dot ${p.color}"></span><div><strong>${esc(e.title)}</strong><small>${esc(e.id)} · ${stories.length} items · ${scheduled} scheduled</small></div></div>`,...(stories.length?{nestedGroups:stories.map(s=>s.id),showNested:expandedByDefault||e.id===epics.find(candidate=>workspace.stories.some(s=>s.epic===candidate.id&&eligible(s)))?.id}:{})});
        if(e.plannedStart&&e.plannedEnd)items.push({id:`epic|${e.id}`,group:e.id,start:day(e.plannedStart),end:day(addDays(e.plannedEnd,1)),editable:{updateTime:true,updateGroup:false,remove:false},className:`epic-bar ${p.color}`,content:`${esc(e.title)} · ${e.progress||0}%`});
      }
      stories.forEach(s=>addStory(s,p,nested));
    }
    const withoutEpic=workspace.stories.filter(s=>s.project===p.id&&!workspace.epics.some(e=>e.id===s.epic)&&eligible(s)&&matching(s)).sort((a,b)=>Number(inWindow(b))-Number(inWindow(a)));
    if(withoutEpic.length){
      groups.push({id:`unparented|${p.id}`,treeLevel:0,order:order++,content:`<div class="epic-label"><span class="project-dot ${p.color}"></span><div><strong>No epic · ${esc(p.name)}</strong><small>${withoutEpic.length} items</small></div></div>`,nestedGroups:withoutEpic.map(s=>s.id),showNested:expandedByDefault||!epics.length});
      withoutEpic.forEach(s=>addStory(s,p,true));
    }
  }
  return {groups,items};
}
