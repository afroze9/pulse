import { scheduleFor, escapeHtml as esc } from './planning.js';
export const PAGE_ROWS=12, WIDTH=1260, HEIGHT=891;
const stamp=d=>Date.parse(d+'T00:00:00Z');
const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(stamp(d))&&new Date(stamp(d)).toISOString().slice(0,10)===d;
const range=(a,b)=>valid(a)&&valid(b)&&a<=b?{start:a,end:b}:null;
const extent=rows=>{const rs=rows.map(r=>r.plan).filter(Boolean);return rs.length?{start:rs.map(r=>r.start).sort()[0],end:rs.map(r=>r.end).sort().at(-1)}:null;};
const text=(x,y,value,size=12,fill='#26372f',extra='')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" fill="'+fill+'" '+extra+'>'+esc(value??'')+'</text>';
const rect=(x,y,w,h,fill,extra='')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+'" '+extra+'/>';
const short=d=>new Date(stamp(d)).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
function wrap(value,width=49,max=2) {
  const chars=Array.from(String(value??'')),lines=[];
  while(chars.length&&lines.length<max){let n=Math.min(width,chars.length);if(chars.length>width){const space=chars.slice(0,n).lastIndexOf(' ');if(space>width/2)n=space;}lines.push(chars.splice(0,n).join('').trim());while(chars[0]===' ')chars.shift();}
  if(chars.length)lines[lines.length-1]=lines.at(-1).slice(0,-1)+'…';
  return lines;
}
export function deliveryRows(data,projectIds,scope,options) {
  const {start,end,detail='epics',actuals=true,milestones=true,unscheduled=true}=options;
  if(!range(start,end))return {rows:[],outside:0,undated:0,error:'Choose a valid start and end date.'};
  if((stamp(end)-stamp(start))/86400000>730)return {rows:[],outside:0,undated:0,error:'Choose a range of two years or less for a readable export.'};
  let outside=0,undated=0;const rows=[];
  const row=(item,kind,depth)=>{const schedule=kind==='story'?scheduleFor(item,data.sprints,data.epics):null;return{
    id:item.id,title:item.title,context:[data.projects.find(p=>p.id===item.project)?.name,kind==='story'?data.epics.find(e=>e.id===item.epic)?.title:null].filter(Boolean).join(' / '),kind,depth,status:item.status||'',plan:range(item.plannedStart,item.plannedEnd)||range(schedule?.start,schedule?.end),
    actual:valid(item.actualStart)?{start:item.actualStart,end:valid(item.actualEnd)&&item.actualEnd>=item.actualStart?item.actualEnd:null}:null,
    inherited:kind==='story'&&!!schedule&&!schedule.explicit,target:kind==='epic'&&valid(item.target)?item.target:null
  };};
  const visible=r=>{
    const ranges=[r.plan,actuals&&r.actual].filter(Boolean);
    if(ranges.some(d=>d.start<=end&&(d.end||d.start)>=start)||milestones&&r.target>=start&&r.target<=end)return true;
    if(!ranges.length&&!(milestones&&r.target)){undated++;return unscheduled;}
    outside++;return false;
  };
  for(const project of data.projects.filter(p=>projectIds.includes(p.id)).sort((a,b)=>a.name.localeCompare(b.name))){
    const children=[];
    const stories=data.stories.filter(s=>(s.project||data.epics.find(e=>e.id===s.epic)?.project)===project.id&&scope.types.includes(s.type||'story')&&(!s.person||scope.people.includes(s.person)));
    for(const epic of data.epics.filter(e=>e.project===project.id).sort((a,b)=>a.title.localeCompare(b.title))){
      const all=stories.filter(s=>s.epic===epic.id).map(s=>row(s,'story',2));
      const e=row(epic,'epic',1);if(!e.plan){e.plan=extent(all);e.rolledUp=!!e.plan;}
      const storyRows=detail==='tasks'?all.filter(visible):[];
      if(scope.types.includes('epic')&&(visible(e)||storyRows.length))children.push(e);
      children.push(...storyRows);
    }
    if(detail==='tasks')children.push(...stories.filter(s=>!data.epics.some(e=>e.id===s.epic)).map(s=>row(s,'story',1)).filter(visible));
    if(children.length)rows.push({id:project.id,title:project.name,kind:'project',depth:0,plan:extent(children),status:'Project Summary'},...children);
  }
  return {rows,outside,undated,error:''};
}
export function renderDeliveryPage(model,options,page=0) {
  const pages=Math.max(1,Math.ceil(model.rows.length/PAGE_ROWS));
  const rows=model.rows.slice(page*PAGE_ROWS,(page+1)*PAGE_ROWS);
  const left=430,right=1236,top=150,rowHeight=52;
  const total=(stamp(options.end)-stamp(options.start))/86400000+1;
  const x=d=>left+((stamp(d)-stamp(options.start))/86400000)/total*(right-left);
  let out='<svg xmlns="http://www.w3.org/2000/svg" width="'+WIDTH+'" height="'+HEIGHT+'" viewBox="0 0 '+WIDTH+' '+HEIGHT+'" role="img" aria-label="Delivery Timeline" font-family="Arial, sans-serif">';
  out+='<defs><clipPath id="plot"><rect x="'+left+'" y="'+top+'" width="'+(right-left)+'" height="'+(PAGE_ROWS*rowHeight)+'"/></clipPath><clipPath id="labels"><rect x="24" y="'+top+'" width="392" height="'+(PAGE_ROWS*rowHeight)+'"/></clipPath></defs>';
  out+=rect(0,0,WIDTH,HEIGHT,'#fff')+rect(24,25,5,33,'#28664e');
  out+=text(42,43,wrap(options.title||'Delivery Timeline',72,1)[0],23,'#183e36','font-weight="bold"');
  out+=text(42,66,short(options.start)+' – '+short(options.end)+' · '+options.start.slice(0,4)+(options.end.slice(0,4)!==options.start.slice(0,4)?' / '+options.end.slice(0,4):'')+' · '+(options.detail==='tasks'?'Epics & Work Items':'Epic Roadmap'),12);
  out+=text(1150,43,'pulse',24,'#183e36','font-weight="bold"');
  out+=rect(24,94,14,8,'#50799f')+text(44,103,'Planned',11);
  if(options.actuals)out+=rect(115,94,14,8,'#29634b')+text(135,103,'Actual / Started',11);
  if(options.milestones)out+=text(265,103,'◆ Target Milestone',11,'#765626');
  out+=text(445,103,'Faint Bars = Rollup · Arrow = Continues Beyond Range',11,'#526158');
  out+=rect(24,114,right-24,36,'#edf2ed')+text(38,137,'Project / Epic / Work Item',12,'#26372f','font-weight="bold"');
  const step=total<=21?1:total<=120?7:total<=365?30:60;
  for(let i=0;i<total;i+=step){
    const date=new Date(stamp(options.start)+i*86400000).toISOString().slice(0,10),px=x(date);
    out+='<path d="M '+px+' 150 V '+(top+rows.length*rowHeight)+'" stroke="#e1e6e1"/>';
    if(px<right-(total<=21?18:42))out+=text(px+4,137,total<=21?date.slice(8):short(date),10,'#526158');
  }
  rows.forEach((r,i)=>{
    const y=top+i*rowHeight;
    out+=rect(24,y,left-24,rowHeight,r.kind==='project'?'#eaf0eb':r.kind==='epic'?'#f5f7f4':'#fff');
    out+='<path d="M 24 '+(y+rowHeight)+' H '+right+'" stroke="#e1e6e1"/>';
    out+='<g clip-path="url(#labels)">';
    const lines=wrap(r.title,r.kind==='story'?47:50);
    lines.forEach((line,j)=>out+=text(38+r.depth*12,y+17+j*13,line,11,'#26372f',r.kind==='story'?'':'font-weight="bold"'));
    out+=text(38+r.depth*12,y+45,[r.kind==='project'?'':r.id,r.inherited?'Sprint Dates':r.rolledUp?'Child Rollup':r.status].filter(Boolean).join(' · '),9,'#526158');
    out+='</g><g clip-path="url(#plot)">';
    const bar=(dates,by,h,color)=>{
      if(!dates||dates.start>options.end||(dates.end||dates.start)<options.start)return;
      if(!dates.end){out+='<circle cx="'+(x(dates.start)+3)+'" cy="'+(by+h/2)+'" r="4" fill="'+color+'"/>';return;}
      const a=Math.max(left,x(dates.start)),b=Math.min(right,x(dates.end)+(right-left)/total);
      out+=rect(a,by,Math.max(2,b-a),h,color,'rx="3"');
      if(dates.start<options.start)out+=text(left+2,by+h-2,'‹',14,'#183e36');
      if(dates.end>options.end)out+=text(right-9,by+h-2,'›',14,'#183e36');
    };
    bar(r.plan,y+9,options.actuals?17:26,r.kind==='project'?'#c6d9cd':r.rolledUp?'#b7cddd':'#50799f');
    if(options.actuals)bar(r.actual,y+32,9,'#29634b');
    if(options.milestones&&r.target>=options.start&&r.target<=options.end){
      const px=Math.min(right-7,x(r.target)+(right-left)/total/2);
      out+='<path d="M '+px+' '+(y+12)+' l 6 7 -6 7 -6 -7 Z" fill="#996d23"/>';
    }
    if(!r.plan&&!r.actual&&!r.target)out+=text(left+10,y+28,'Unscheduled',11,'#526158');
    out+='</g>';
  });
  if(!rows.length)out+=text(42,192,'No Work Items Match This Range and Selection',16);
  if(page>0&&rows[0]?.context)out+=text(24,800,'Continued: '+wrap(rows[0].context,140,1)[0],11,'#526158');
  out+=text(24,825,'Pulse · Delivery Plan · '+model.outside+' Items Outside Range · '+model.undated+' Undated Items in Selection',11,'#526158');
  out+=text(24,847,'Jira Dates and Local Planning Overrides · Missing Actual End Dates Are Shown as Start Markers',10,'#526158');
  out+=text(1140,847,'Page '+(page+1)+' / '+pages,11,'#526158');
  return out+'</svg>';
}
export async function rasterize(svg) {
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
  try{
    const image=new Image();image.src=url;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=WIDTH*2;canvas.height=HEIGHT*2;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image export is unavailable.');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
  }finally{URL.revokeObjectURL(url);}
}
export async function deliveryPdf(model,options) {
  const {jsPDF}=await import('jspdf');
  const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  const pages=Math.max(1,Math.ceil(model.rows.length/PAGE_ROWS));
  for(let page=0;page<pages;page++){
    if(page)pdf.addPage();
    const canvas=await rasterize(renderDeliveryPage(model,options,page));
    pdf.addImage(canvas,'PNG',0,0,297,210,undefined,'FAST');
    canvas.width=canvas.height=0;
  }
  return pdf.output('blob');
}


