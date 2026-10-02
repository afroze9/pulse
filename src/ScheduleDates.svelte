<script>
  import { CalendarDays, Check } from 'lucide-svelte';
  export let entity; export let disabled=false;
  export let fallback=null;
  export let onsave;
  let plannedStart='',plannedEnd='',actualStart='',actualEnd='',error='';
  $: if(entity){plannedStart=entity.plannedStart||fallback?.start||'';plannedEnd=entity.plannedEnd||fallback?.end||'';actualStart=entity.actualStart||'';actualEnd=entity.actualEnd||'';error='';}
  function submit(event){
    event.preventDefault();error='';
    if(!plannedStart||!plannedEnd||plannedEnd<plannedStart){error='Planned end must be on or after planned start.';return;}
    if(actualEnd&&(!actualStart||actualEnd<actualStart)){error='Set actual start before actual end.';return;}
    onsave({plannedStart,plannedEnd,actualStart:actualStart||null,actualEnd:actualEnd||null});
  }
</script>
<section class="schedule-dates">
  <h3><CalendarDays size={16}/> Planned & Actual Dates</h3>
  <p>Moving a timeline bar updates planned dates only. Actual dates are recorded separately.</p>
  <form onsubmit={submit}>
    <div class="dates-pair"><label>Planned Start<input type="date" required bind:value={plannedStart}/></label><label>Planned End<input type="date" required min={plannedStart} bind:value={plannedEnd}/></label></div>
    <div class="dates-pair actual"><label>Actual Start<input type="date" bind:value={actualStart}/></label><label>Actual End<input type="date" min={actualStart||undefined} bind:value={actualEnd}/></label></div>
    <small>Leave actual dates empty until known. An actual start without an end shows a “Started” marker.</small>
    {#if error}<p class="danger" role="alert">{error}</p>{/if}
    <button type="submit" {disabled} class="primary-button full"><Check size={15}/> Save Dates</button>
  </form>
</section>
<style>
  .schedule-dates{margin-top:26px;padding-top:22px;border-top:1px solid var(--line,#e4eadf)}
  h3{display:flex;gap:7px;align-items:center}p{font-size:10px;color:var(--muted,#839178);line-height:1.7;margin:10px 0 14px}
  .dates-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
  label{display:flex;flex-direction:column;gap:7px;font-size:10px;color:var(--muted,#758b65)}
  input{width:100%;min-width:0;border:1px solid var(--line,#dfe6d7);border-radius:5px;background:var(--surface,#fbfdf8);color:var(--text,#49633c);padding:9px 7px;font-size:11px}
  .actual input{background:var(--surface-alt,#f7f8f9);border-color:var(--line,#dce1e3);color:var(--blue-text,#4f6268)}
  small{font-size:9px;color:var(--muted,#95a089);line-height:1.7;display:block;margin:12px 0 17px}
</style>
