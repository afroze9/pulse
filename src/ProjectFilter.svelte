<script>
  import { SlidersHorizontal, ChevronDown } from 'lucide-svelte';

  export let projects = [];
  export let value = [];
  let open = false;
  let trigger;
  let panel;
  $: allSelected = projects.length > 0 && projects.every(project => value.includes(project.id));
  $: selectedProjects = projects.filter(project => value.includes(project.id));
  $: label = allSelected ? 'All Projects' : selectedProjects.length === 1 ? selectedProjects[0].name : selectedProjects.length ? `${selectedProjects.length} Projects` : 'Select Projects';

  function toggle(id) {
    value = value.includes(id) ? value.filter(selected => selected !== id) : [...value, id];
  }
  function close() { open = false; trigger?.focus(); }
  function dismissOutside(node) {
    const dismiss = event => { if (!node.contains(event.target)) open = false; };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return { destroy() {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
    } };
  }
  function handleKey(event) {
    if (open && event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.target === trigger && event.key === 'ArrowDown') {
      event.preventDefault(); open = true;
      queueMicrotask(() => panel?.querySelector('input')?.focus());
    }
  }
</script>

<svelte:window onkeydown={handleKey}/>
<div class="project-filter" use:dismissOutside>
  <button bind:this={trigger} type="button" class="filter-trigger" class:filtered={!allSelected}
    aria-label={`Filter projects: ${label}`} aria-expanded={open} aria-controls="project-filter-options"
    onclick={() => open = !open}>
    <SlidersHorizontal size={14}/><span>{label}</span><ChevronDown size={13}/>
  </button>
  {#if open}
    <div bind:this={panel} id="project-filter-options" class="filter-popover" role="group" aria-label="Project filters">
      <div class="filter-heading">Show Projects <span>{selectedProjects.length} of {projects.length}</span></div>
      <label class="filter-option all-option">
        <input type="checkbox" checked={allSelected} indeterminate={selectedProjects.length > 0 && !allSelected}
          onchange={event => value = event.currentTarget.checked ? projects.map(project => project.id) : []}/>
        <span>All Projects</span>
      </label>
      <div class="project-options">
        {#each projects as project}
          <label class="filter-option">
            <input type="checkbox" checked={value.includes(project.id)} onchange={() => toggle(project.id)}/>
            <span class="project-dot {project.color}"></span><span>{project.name}</span><small>{project.key}</small>
          </label>
        {/each}
      </div>
      <div class="filter-footer"><span>Updates instantly</span><button type="button" onclick={close}>Done</button></div>
    </div>
  {/if}
</div>

<style>
  .project-filter{position:relative}
  .filter-trigger{min-width:142px;justify-content:space-between;gap:8px;border:1px solid var(--line,#e1e7dd);background:var(--surface,#fff);padding:7px 9px;border-radius:5px;color:var(--muted,#5f715d);font-size:10px}
  .filter-trigger>span{flex:1;text-align:left}
  .filter-trigger.filtered{border-color:var(--line,#a8c5b3);background:var(--surface-alt,#f4f8f1);color:var(--text,#38664a)}
  .filter-popover{position:absolute;top:calc(100% + 8px);right:0;z-index:30;width:238px;padding:7px;background:var(--surface,#fff);border:1px solid var(--line,#dfe7da);border-radius:8px;box-shadow:0 9px 28px #203b2820}
  .filter-heading{display:flex;justify-content:space-between;padding:9px 9px 12px;font-size:9px;letter-spacing:1px;color:var(--muted,#7e8c74)}
  .filter-heading>span{letter-spacing:0;color:var(--muted,#8d9885)}
  .filter-option{display:flex;align-items:center;gap:9px;padding:10px 9px;border-radius:5px;font-size:11px;color:var(--muted,#50674c);cursor:pointer}
  .filter-option:hover{background:var(--surface-alt,#f3f7ee)}
  .filter-option:has(input:focus-visible){outline:2px solid var(--focus,#28664e);outline-offset:-2px}
  .filter-option input{width:14px;height:14px;margin:0;accent-color:#28664e;cursor:pointer}
  .filter-option small{margin-left:auto;font-size:9px;color:var(--muted,#94a18a)}
  .all-option{font-weight:550;margin-bottom:5px}
  .project-options{border-block:1px solid var(--line,#edf0e7);padding:5px 0}
  .filter-footer{display:flex;justify-content:space-between;align-items:center;padding:9px 9px 2px;font-size:9px;color:var(--muted,#94a18a)}
  .filter-footer button{padding:5px 10px;border-radius:4px;background:var(--surface-alt,#edf4e7);color:var(--muted,#42734b);font-size:10px}
  @media(max-width:600px){.filter-popover{left:0;right:auto}}
</style>
