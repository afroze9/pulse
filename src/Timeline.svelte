<script>
  import { onMount } from 'svelte';
  import { UnfoldVertical, FoldVertical } from 'lucide-svelte';
  import { Timeline, DataSet } from 'vis-timeline/standalone';
  import 'vis-timeline/styles/vis-timeline-graph2d.css';
  import { day, iso, addDays } from './planning.js';
  import { timelineHierarchy } from './timeline-hierarchy.js';
  export let groups=[]; export let items=[]; export let start='2026-10-05'; export let end='2026-10-27'; export let mode='resources';
  export let onselect=()=>{}; export let oncreate=()=>{}; export let onmove=()=>{};
  export let revealGroups=false;
  let container; let timeline; let ready=false; let preview=null; let lastDrag=0; let headerHeight=56;
  let groupData; let groupListener;
  function setTimelineGroups(nextGroups,nextMode,reveal,expanded){
    groupData?.off('update',groupListener);
    groupData=new DataSet(timelineHierarchy.apply(nextMode,nextGroups,expanded??(reveal?true:undefined)));
    timeline.setGroups(groupData);
    groupListener=(_event,changes)=>{if(!reveal)timelineHierarchy.remember(nextMode,changes.data);};
    groupData.on('update',groupListener);
  }
  function expandAll(expanded){
    if(!timeline)return;
    if(!revealGroups)timelineHierarchy.remember(mode,groups.map(group=>({...group,showNested:expanded})));
    setTimelineGroups(groups,mode,revealGroups,expanded);
  }
  const snap = date => {const d=new Date(date);d.setHours(0,0,0,0);return d;};
  onMount(()=>{
    timeline=new Timeline(container,items,new DataSet(timelineHierarchy.apply(mode,groups,revealGroups?true:undefined)),{
      start:day(start),end:day(end),rtl:false,onInitialDrawComplete:()=>ready=true,
      timeAxis:mode==='roadmap'?{scale:'week',step:1}:{scale:'day',step:1},orientation:'top',stack:true,showCurrentTime:false,
      groupOrder:'order',margin:{item:{horizontal:0,vertical:7},axis:16},
      minHeight:440,maxHeight:640,zoomable:false,moveable:false,selectable:true,
      snap,itemsAlwaysDraggable:{item:true,range:true},
      editable:{add:true,updateTime:true,updateGroup:true,remove:false},
      onAdd:(item,callback)=>{callback(null);oncreate({group:item.group,start:iso(snap(item.start)),end:item.end?addDays(iso(snap(item.end)),-1):iso(snap(item.start))});},
      onMoving:(item,callback)=>{lastDrag=Date.now();callback(item);},
      onMove:(item,callback)=>{
        lastDrag=Date.now(); callback(null);
        const [kind,id]=String(item.id).split('|');
        onmove({kind,id,group:item.group,start:iso(snap(item.start)),end:item.end?addDays(iso(snap(item.end)),-1):iso(snap(item.start))});
      },
      onUpdate:(item,callback)=>{callback(null);onselect(item.id);},
      xss:{filterOptions:{whiteList:{button:['type','class','data-work-item'],div:['class'],span:['class'],strong:[],small:[],i:['style']}}},tooltip:{followMouse:true},
      format:{minorLabels:{day:'D',weekday:'ddd D',week:'D MMM',month:'MMM'},majorLabels:{day:'MMMM YYYY',weekday:'MMMM YYYY',week:'MMMM YYYY',month:'YYYY'}},
      groupHeightMode:'auto',verticalScroll:true
    });
    // Reserve the same total label width whether its native scrollbar is present or absent.
    const leftPanel=container.querySelector('.vis-panel.vis-left');
    const topPanel=container.querySelector('.vis-panel.vis-top');
    let resizeFrame=0;
    const updateGutter=()=>{
      cancelAnimationFrame(resizeFrame);
      resizeFrame=requestAnimationFrame(()=>{
        headerHeight=topPanel.offsetHeight;
        const gutter=Math.max(0,leftPanel.offsetWidth-leftPanel.clientWidth);
        const value=gutter+'px';
        if(container.style.getPropertyValue('--timeline-scrollbar-width')!==value){
          container.style.setProperty('--timeline-scrollbar-width',value);timeline.redraw();
        }
      });
    };
    const labelObserver=new ResizeObserver(updateGutter);labelObserver.observe(leftPanel);labelObserver.observe(topPanel);
    const labelClasses=new MutationObserver(updateGutter);labelClasses.observe(leftPanel,{attributes:true,attributeFilter:['class']});
    updateGutter();
    ready=true;
    timeline.on('click',event=>{if(event.item&&Date.now()-lastDrag>300)onselect(event.item);});
    const selectRow=event=>{const button=event.target.closest('button[data-work-item]');if(button){event.stopPropagation();onselect(`story|${button.dataset.workItem}`);}};
    container.addEventListener('click',selectRow,true);
    let drawing=null;
    const dateAt=event=>iso(snap(timeline.getEventProperties(event).time));
    const pointerDown=event=>{
      if(event.button!==0||event.ctrlKey||event.metaKey||!event.target.closest('.vis-panel.vis-center'))return;
      if(event.target.closest('.vis-item:not(.vis-background),.vis-drag-left,.vis-drag-right'))return;
      const hit=timeline.getEventProperties(event);if(hit.group===undefined||hit.group===null)return;
      const center=container.querySelector('.vis-panel.vis-center').getBoundingClientRect();
      const root=container.getBoundingClientRect();
      drawing={pointer:event.pointerId,group:hit.group,start:dateAt(event),current:dateAt(event),x:event.clientX,y:event.clientY,left:center.left-root.left,width:center.width,top:event.clientY-root.top-18,moved:false};
      event.preventDefault();event.stopPropagation();
    };
    const pointerMove=event=>{
      if(!drawing||event.pointerId!==drawing.pointer)return;
      const center=container.querySelector('.vis-panel.vis-center').getBoundingClientRect();
      // Clamp to the visible date range; keep the lane where the gesture began.
      const x=Math.max(center.left,Math.min(center.right-1,event.clientX));
      const window=timeline.getWindow();
      const time=window.start.valueOf()+(x-center.left)/center.width*(window.end-window.start);
      drawing.current=iso(snap(time));
      if(Math.abs(event.clientX-drawing.x)>6)drawing.moved=true;
      if(drawing.moved){
        const from=drawing.start<drawing.current?drawing.start:drawing.current;
        const to=drawing.start>drawing.current?drawing.start:drawing.current;
        const duration=window.end-window.start;
        preview={left:drawing.left+(day(from)-window.start)/duration*drawing.width,width:Math.max(12,(day(addDays(to,1))-day(from))/duration*drawing.width),top:drawing.top,label:`${day(from).getDate()}–${day(to).getDate()} · New ${mode==='roadmap'?'epic':'story'}`};
      }
      event.preventDefault();
    };
    const pointerUp=event=>{
      if(!drawing||event.pointerId!==drawing.pointer)return;
      const finished=drawing;drawing=null;preview=null;
      if(finished.moved){lastDrag=Date.now();oncreate({group:finished.group,start:finished.start<finished.current?finished.start:finished.current,end:finished.start>finished.current?finished.start:finished.current});}
    };
    const cancel=()=>{drawing=null;preview=null;};
    const keyDown=event=>{if(event.key==='Escape')cancel();};
    container.addEventListener('pointerdown',pointerDown,true);
    document.addEventListener('pointermove',pointerMove,{passive:false});
    document.addEventListener('pointerup',pointerUp);
    document.addEventListener('pointercancel',cancel);
    document.addEventListener('keydown',keyDown);
    return()=>{groupData?.off('update',groupListener);labelObserver.disconnect();labelClasses.disconnect();cancelAnimationFrame(resizeFrame);container.removeEventListener('click',selectRow,true);container.removeEventListener('pointerdown',pointerDown,true);document.removeEventListener('pointermove',pointerMove);document.removeEventListener('pointerup',pointerUp);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',keyDown);timeline.destroy();};
  });
  $: if(timeline&&ready){setTimelineGroups(groups,mode,revealGroups);timeline.setItems(items);timeline.setOptions({timeAxis:mode==='roadmap'?{scale:'week',step:1}:{scale:'day',step:1}});timeline.setWindow(day(start),day(end),{animation:false});}
</script>
<div class="timeline-scroll"><div class="timeline-host" class:resources={mode==='resources'} class:projects={mode==='projects'} class:roadmap={mode==='roadmap'} bind:this={container}>
  {#if ready&&mode!=='roadmap'}
    <div class="hierarchy-header" style:height={headerHeight+'px'}>
      <button type="button" class="plain-button" aria-label="Expand all rows" title="Expand all rows" disabled={!groups.some(g=>g.nestedGroups?.length)} onclick={()=>expandAll(true)}><UnfoldVertical size={15}/></button>
      <button type="button" class="plain-button" aria-label="Collapse all rows" title="Collapse all rows" disabled={!groups.some(g=>g.nestedGroups?.length)} onclick={()=>expandAll(false)}><FoldVertical size={15}/></button>
    </div>
  {/if}
  {#if preview}<div class="draw-preview" style={`left:${preview.left}px;top:${preview.top}px;width:${preview.width}px`}>{preview.label}</div>{/if}
</div></div>

<style>
  .timeline-host{position:relative}
  .hierarchy-header{position:absolute;top:0;left:0;width:var(--timeline-label-width,320px);z-index:5;display:flex;align-items:center;gap:5px;padding:0 14px;background:var(--surface,#fff);border-bottom:1px solid var(--line,#e5e9e3);border-right:1px solid var(--line,#e5e9e3);box-sizing:border-box}
  .hierarchy-header .plain-button{padding:6px 8px}

  /* Data is supplied synchronously; the library loading overlay can outlive its first draw. */
  .timeline-host :global(.vis-loading-screen){display:none!important}
  .draw-preview{position:absolute;height:38px;z-index:10;pointer-events:none;border:1px dashed var(--mint-text,#438768);border-radius:5px;background:#dceee2cc;color:var(--text,#356f50);padding:11px 8px;font-size:10px;white-space:nowrap;overflow:hidden}
</style>
