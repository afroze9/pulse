<script>
  import {onMount} from 'svelte';
  import {X, ChevronLeft, ChevronRight, Download} from 'lucide-svelte';
  import {deliveryRows,renderDeliveryPage,rasterize,deliveryPdf,PAGE_ROWS} from './delivery-export.js';
  import {saveExport} from './save-export.js';
  export let data,projects,configuration,start,end;
  export let initialDetail='epics',onclose=()=>{};
  let dialog,title='Delivery Timeline',detail=initialDetail,actuals=true,milestones=true,unscheduled=true,page=0,busy=false,message='',error='';
  $: options={title,start,end,detail,actuals,milestones,unscheduled};
  $: model=deliveryRows(data,projects.map(p=>p.id),configuration,options);
  $: pages=Math.max(1,Math.ceil(model.rows.length/PAGE_ROWS));
  $: if(page>=pages)page=pages-1;
  $: svg=model.error?'':renderDeliveryPage(model,options,page);
  onMount(()=>{dialog.showModal();});
  async function download(format){
    busy=true;error='';message='Preparing Export…';
    try{
      let blob;
      if(format==='pdf')blob=await deliveryPdf(model,options);
      else if(format==='svg')blob=new Blob([svg],{type:'image/svg+xml'});
      else {const canvas=await rasterize(svg);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Unable to render image.');}
      const result=await saveExport(blob,'Pulse-Delivery-'+start+(format==='pdf'?'':'-Page-'+(page+1))+'.'+format);
      message=result.saved?'Export Saved':'Export Cancelled';
    }catch(e){error=e.message;message='';}finally{busy=false;}
  }
</script>
<dialog bind:this={dialog} class="delivery-dialog" aria-labelledby="delivery-heading" oncancel={event=>{event.preventDefault();if(!busy)onclose();}}>
  <header><div><h2 id="delivery-heading">Delivery Timeline Preview</h2><p>{projects.length} Selected Projects · Project, Resource, and Work Item Type Configuration Applied</p></div><button class="icon-button" aria-label="Close Export Preview" disabled={busy} onclick={onclose}><X size={20}/></button></header>
  <fieldset disabled={busy} class="options">
    <label>Report Title<input maxlength="90" bind:value={title}/></label>
    <label>From<input type="date" bind:value={start}/></label>
    <label>Through<input type="date" bind:value={end}/></label>
    <label>Detail<select bind:value={detail}><option value="epics">Epic Roadmap</option><option value="tasks">Epics & Work Items</option></select></label>
    <label class="toggle"><input type="checkbox" bind:checked={actuals}/>Actual Dates</label>
    <label class="toggle"><input type="checkbox" bind:checked={milestones}/>Milestones</label>
    <label class="toggle"><input type="checkbox" bind:checked={unscheduled}/>Undated Items</label>
  </fieldset>
  <div class="scope-note">Uses the selected projects and the date range above. Timeline search and collapsed rows do not limit this report. Paper exports use a light background.</div>
  {#if model.error}<p role="alert" class="error">{model.error}</p>{/if}
  <div class="paper-area">{#if svg}<img class="paper" src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)} alt={'Gantt delivery timeline preview, page '+(page+1)+' of '+pages}/>{/if}</div>
  <footer>
    <div class="paging"><button class="plain-button" aria-label="Previous Preview Page" disabled={busy||page===0} onclick={()=>page--}><ChevronLeft size={16}/></button><span>Page {page+1} of {pages} · {model.rows.length} Rows</span><button class="plain-button" aria-label="Next Preview Page" disabled={busy||page===pages-1} onclick={()=>page++}><ChevronRight size={16}/></button></div>
    <div class="exports"><button class="plain-button" disabled={busy||!!model.error||!model.rows.length} onclick={()=>download('svg')}>SVG · This Page</button><button class="plain-button" disabled={busy||!!model.error||!model.rows.length} onclick={()=>download('png')}>PNG · This Page</button><button class="primary-button" disabled={busy||!!model.error||!model.rows.length} onclick={()=>download('pdf')}><Download size={15}/>PDF · All Pages</button></div>
  </footer>
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  {#if message}<p role="status" class="message">{message}</p>{/if}
</dialog>
<style>
  .delivery-dialog{width:min(1440px,96vw);max-width:96vw;height:94vh;max-height:94vh;margin:auto;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--surface,#fff);color:var(--text);box-shadow:0 20px 80px #0005}
  .delivery-dialog[open]{display:flex;flex-direction:column}
  .delivery-dialog::backdrop{background:#10271dcc}
  header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;gap:15px}h2{margin:0;font-size:21px}header p{margin:6px 0 0;font-size:11px;color:var(--muted)}
  .options{border:0;border-top:1px solid var(--line);margin:0;padding:14px 22px;display:flex;gap:14px;align-items:end;flex-wrap:wrap}
  label{display:flex;flex-direction:column;gap:6px;font-size:11px}input,select{background:var(--surface-alt,#f7f8f4);color:var(--text);border:1px solid var(--control-border,#718076);border-radius:5px;padding:8px}
  .toggle{flex-direction:row;align-items:center;align-self:center}.toggle input{accent-color:var(--green,#28664e)}
  .scope-note{padding:0 22px 12px;font-size:11px;color:var(--muted)}
  .paper-area{flex:1;min-height:100px;overflow:auto;background:var(--surface-alt,#edf1ed);padding:20px;display:flex;align-items:flex-start;justify-content:center}
  .paper{width:100%;max-width:1260px;height:auto;box-shadow:0 2px 14px #0002;border:1px solid #b4bdb5}
  footer{padding:14px 22px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;border-top:1px solid var(--line)}
  .paging,.exports{display:flex;gap:10px;align-items:center;font-size:12px}.message,.error{padding:0 22px 14px;margin:0;font-size:12px}.error{color:var(--danger-text,#884a34)}button:disabled{opacity:.5}
</style>
