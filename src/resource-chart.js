import { day, addDays, scheduleFor, escapeHtml as esc, resourceProjectLane } from './planning.js';

export function resourceChart(workspace, people, projects, scope, search, start, end, inPeriod=true) {
  const groups=[],items=[]; let order=0;
  const query=search.trim().toLowerCase();
  const matches=value=>String(value||'').toLowerCase().includes(query);
  const projectById=new Map(projects.map(p=>[p.id,p]));
  const entries=workspace.stories.filter(s=>scope.types.includes(s.type||'story')).map(story=>({story,schedule:scheduleFor(story,workspace.sprints,workspace.epics),project:story.project||workspace.epics.find(e=>e.id===story.epic)?.project}));
  const overlaps=({story,schedule})=>Boolean(schedule&&schedule.start<end&&schedule.end>=start||story.actualStart&&story.actualStart<end&&(story.actualEnd||story.actualStart)>=start);
  const addRollup=(id,group,children,level,color='')=>{
    const scheduled=children.filter(entry=>entry.schedule);
    if(!scheduled.length)return;
    const first=scheduled.reduce((date,entry)=>entry.schedule.start<date?entry.schedule.start:date,scheduled[0].schedule.start);
    const last=scheduled.reduce((date,entry)=>entry.schedule.end>date?entry.schedule.end:date,scheduled[0].schedule.end);
    const points=scheduled.reduce((sum,entry)=>sum+(Number.isFinite(entry.story.points)?entry.story.points:0),0);
    const unknown=scheduled.filter(entry=>!Number.isFinite(entry.story.points)).length;
    const label=scheduled.length+' '+(scheduled.length===1?'ticket':'tickets')+' · '+Number(points.toFixed(2))+' SP'+(unknown?' · '+unknown+' unestimated':'');
    items.push({id,group,start:day(first),end:day(addDays(last,1)),type:'range',editable:false,selectable:false,className:'resource-rollup '+level+' '+color,content:'<span>'+esc(label)+'</span>',title:'Planned span: '+first+' – '+last+'. Summarizes visible scheduled tickets; gaps can include unallocated days. Edit individual tickets to change this span.'});
  };
  const sortedPeople=[...people].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true}));
  for(const person of sortedPeople){
    const personMatches=matches(person.name)||matches(person.role);
    const tickets=entries.filter(entry=>entry.story.person===person.id&&projectById.has(entry.project)&&(!inPeriod||overlaps(entry))&&(!query||personMatches||matches(projectById.get(entry.project).name)||matches(entry.story.id)||matches(entry.story.title)));
    if(query&&!personMatches&&!tickets.length)continue;
    const lanes=projects.filter(p=>tickets.some(entry=>entry.project===p.id));
    groups.push({id:person.id,order:order++,treeLevel:0,nestedGroups:lanes.map(p=>resourceProjectLane(person.id,p.id)),showNested:true,content:`<div class="person-label"><span class="avatar ${person.color}">${esc(person.initials)}</span><div><strong>${esc(person.name)}</strong><small>${tickets.length} tickets · ${lanes.length} projects</small></div><span class="load-tag ${person.peak>1?'danger':''}">${Math.round(person.peak*100)}%</span></div>`});
    addRollup('rollup-person|'+person.id,person.id,tickets,'person-rollup');
    for(const project of lanes){
      const children=tickets.filter(entry=>entry.project===project.id).sort((a,b)=>Number(overlaps(b))-Number(overlaps(a)));
      const lane=resourceProjectLane(person.id,project.id);
      const estimated=children.reduce((sum,entry)=>sum+(Number.isFinite(entry.story.points)?entry.story.points:0),0);
      const unknown=children.filter(entry=>!Number.isFinite(entry.story.points)).length;
      groups.push({id:lane,order:order++,treeLevel:1,nestedGroups:children.map(entry=>entry.story.id),showNested:Boolean(query)||person.id===sortedPeople[0]?.id,content:`<div class="resource-project-label"><span class="project-dot ${project.color}"></span><div><strong>${esc(project.name)}</strong><small>${children.length} tickets · ${estimated} SP${unknown?` · ${unknown} unestimated`:''}</small></div></div>`});
      addRollup('rollup-project|'+lane,lane,children,'project-rollup',project.color);
      for(const {story,schedule} of children){
        groups.push({id:story.id,order:order++,treeLevel:2,content:`<button type="button" class="story-label story-row-link" data-work-item="${esc(story.id)}"><small>${esc(story.id)} · ${esc(story.type||'story')}${!schedule?' · Unscheduled':!overlaps({story,schedule})?' · Outside date range':''}</small><strong>${esc(story.title)}</strong></button>`});
        if(schedule)items.push({id:`story|${story.id}`,group:story.id,start:day(schedule.start),end:day(addDays(schedule.end,1)),className:`resource-ticket story-bar ${project.color}`,content:`<span class="bar-title">${esc(story.id)} · ${esc(story.title)}</span><span class="bar-sub">${Number.isFinite(story.points)?story.points+' SP':'Estimate unknown'} · ${esc(story.status)}</span>`});
      }
    }
    for(const date of person.overloaded||[])items.push({id:`risk-${person.id}-${date.date}`,group:person.id,start:day(date.date),end:day(addDays(date.date,1)),type:'background',className:'overload-bg',selectable:false});
  }
  return {groups,items};
}
