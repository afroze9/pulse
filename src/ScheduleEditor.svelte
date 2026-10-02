<script>
  import { Plus, X, CalendarDays, ArrowRight } from 'lucide-svelte';
  import { workingDays } from './planning.js';
  export let types=['story','bug','task']; export let data; export let draft; export let error=''; export let focusPanel; export let onsave; export let onclose;
  $: sprint=data.sprints.find(s=>s.id===draft.sprint);
  $: start=draft.explicit||draft.kind==='epic'?draft.start:sprint?.start;
  $: end=draft.explicit||draft.kind==='epic'?draft.end:sprint?.end;
  $: days=start&&end?workingDays(start,end).length:0;
  function changeProject(){draft={...draft,epic:data.epics.find(e=>e.project===draft.project)?.id||'',sprint:data.sprints.find(s=>s.project===draft.project)?.id||''};}
</script>
<div class="modal-shade"><div use:focusPanel tabindex="-1" class="modal" role="dialog" aria-modal="true" aria-labelledby="plan-title">
  <div class="modal-heading"><span class="modal-symbol"><Plus size={23}/></span><button class="icon-button" aria-label="Close Allocation Form" onclick={onclose}><X size={20}/></button></div>
  <h2 id="plan-title">{draft.kind==='epic'?'Plan the next big thing.':'Make room for what’s next.'}</h2>
  <p>{draft.kind==='epic'?'Add an epic to this project’s roadmap.':'Plan a story and see its impact on daily capacity.'}</p>
  <form onsubmit={onsave}>
    <label>{draft.kind==='epic'?'Epic Title':'Story Title'}<input required placeholder={draft.kind==='epic'?'e.g. Faster onboarding':'e.g. Customer onboarding flow'} bind:value={draft.title}/></label>
    <label>Project<select bind:value={draft.project} onchange={changeProject}>{#each data.projects as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
    {#if draft.kind==='story'}
      <label>Work Item Type<select bind:value={draft.type}>{#each types as type}<option value={type}>{type[0].toUpperCase()+type.slice(1)}</option>{/each}</select></label>
      <div class="form-grid"><label>Person<select bind:value={draft.person}>{#each data.people as p}<option value={p.id}>{p.name}</option>{/each}</select></label><label>Story Points<input type="number" min="0.5" max="100" step="0.5" required bind:value={draft.points}/></label></div>
      <label>Epic<select required bind:value={draft.epic}>{#each data.epics.filter(e=>e.project===draft.project) as e}<option value={e.id}>{e.title}</option>{/each}</select></label>
      <label>Sprint<select bind:value={draft.sprint} onchange={()=>{if(!draft.sprint)draft={...draft,explicit:true};}}><option value="">No Sprint · Planned Dates</option>{#each data.sprints.filter(s=>s.project===draft.project) as s}<option value={s.id}>{s.name} · {s.start} – {s.end}</option>{/each}</select></label>
      <label class="custom-dates"><input type="checkbox" bind:checked={draft.explicit} disabled={!draft.sprint}/>Set Specific Dates</label>
    {:else}
      <label>Outcome<input placeholder="What will this epic achieve?" bind:value={draft.goal}/></label>
    {/if}
    {#if draft.explicit||draft.kind==='epic'}<div class="form-grid"><label>Start Date<input type="date" required bind:value={draft.start}/></label><label>End Date<input type="date" required min={draft.start} bind:value={draft.end}/></label></div>{/if}
    <div class="form-preview"><CalendarDays size={18}/><span>{#if days}{#if draft.kind==='story'}{Number(((+draft.points||0)/days).toFixed(2))} SP/day across {/if}{days} working days{#if !draft.explicit} · sprint dates{/if}{:else}Choose a range with at least one working day{/if}</span></div>
    {#if error}<p class="danger" role="alert">{error}</p>{/if}
    <button class="primary-button full" type="submit">Add {draft.kind==='epic'?'epic':'story'} to plan <ArrowRight size={16}/></button><small class="form-note">Saves to your Pulse workspace. Undo is available after saving.</small>
  </form>
</div></div>
<style>.modal .custom-dates{flex-direction:row;align-items:center;gap:8px}.modal .custom-dates input{width:14px;height:14px;margin:0;accent-color:#28664e}</style>
