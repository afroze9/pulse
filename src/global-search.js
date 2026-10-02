export function searchWorkspace(data, scope, text, limit = 12) {
  const query = text.trim().toLocaleLowerCase();
  if (!query) return [];
  const projects = new Set(scope.projects), people = new Set(scope.people), types = new Set(scope.types);
  const records = [
    ...data.people.filter(p => people.has(p.id)).map(p => ({id:p.id,kind:'person',name:p.name,key:'',label:'Person · '+p.name})),
    ...data.projects.filter(p => projects.has(p.id)).map(p => ({id:p.id,kind:'project',name:p.name,key:p.key,label:'Project · '+p.name+' ('+p.key+')'})),
    ...data.epics.filter(e => projects.has(e.project) && types.has('epic')).map(e => ({id:e.id,kind:'epic',name:e.title,key:e.id,label:'Epic · '+e.id+' · '+e.title})),
    ...data.stories.filter(s => projects.has(s.project) && types.has(s.type || 'story')).map(s => ({id:s.id,kind:'story',name:s.title,key:s.id,label:(s.type || 'story').replace(/^./,c=>c.toUpperCase())+' · '+s.id+' · '+s.title}))
  ];
  const rank = record => record.key.toLocaleLowerCase() === query ? 0 : record.name.toLocaleLowerCase() === query ? 1 : (record.key+' '+record.name).toLocaleLowerCase().startsWith(query) ? 2 : 3;
  return records.filter(record => (record.key+' '+record.name).toLocaleLowerCase().includes(query)).sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name)).slice(0,limit).map(({id,kind,label})=>({id,kind,label}));
}
