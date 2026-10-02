<script>
  import { sprintForDate, scheduleFor } from './planning.js';
  export let entity;export let kind;export let data;export let onsave;export let disabled=false;
  let person='',epic='',project='',sprint='',target='';
  $: if(entity){person=entity.person||'';epic=entity.epic||'';project=kind==='epic'?entity.project:data.epics.find(e=>e.id===entity.epic)?.project||'';sprint=entity.sprint||'';target=entity.target||'';}
  function changeProject(){epic=data.epics.find(e=>e.project===project)?.id||'';sprint='';}
  function submit(event){event.preventDefault();if(kind==='epic')onsave({project,target});else onsave({project,person:person||null,epic:epic||null,sprint:sprint||null});}
</script>
<section class="assignment-editor"><h3>Assignment & Ownership</h3><p>Use these controls as an alternative to moving bars between timeline lanes.</p>
<form onsubmit={submit}><label>Project<select bind:value={project} onchange={changeProject}>{#each data.projects as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
{#if kind==='story'}<label>Epic<select bind:value={epic}><option value="">No Epic</option>{#each data.epics.filter(e=>e.project===project) as e}<option value={e.id}>{e.title}</option>{/each}</select></label><label>Person<select bind:value={person}><option value="">Unassigned</option>{#each data.people as p}<option value={p.id}>{p.name}</option>{/each}</select></label><label>Sprint<select bind:value={sprint}><option value="">No Sprint · Keep Planned Dates</option>{#each data.sprints.filter(s=>s.project===project) as s}<option value={s.id}>{s.name} · {s.start} – {s.end}</option>{/each}</select></label>{:else}<label>Milestone target<input type="date" required bind:value={target}/></label>{/if}
<button class="primary-button full" {disabled}>Save Assignment</button></form></section>
<style>.assignment-editor{margin-top:24px;border-top:1px solid var(--line,#e4eadf);padding-top:20px}p{font-size:10px;color:var(--muted,#839178);line-height:1.7;margin:10px 0}label{display:flex;flex-direction:column;gap:7px;font-size:10px;margin:12px 0;color:var(--muted,#758b65)}select,input{width:100%;padding:9px;border:1px solid var(--line,#dfe6d7);border-radius:5px;background:var(--surface,#fbfdf8);color:var(--text,#49633c);font-size:11px}</style>
