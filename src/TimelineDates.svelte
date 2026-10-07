<script>
  export let start;
  export let end;
  export let onchange = () => {};
  function change(event, field, previous) {
    const input = event.currentTarget;
    if (input.value && input.checkValidity()) onchange({ [field]: input.value });
    else input.value = previous;
  }
</script>

<div class="timeline-dates">
  <label>From<input type="date" aria-label="Timeline start date" value={start} onchange={event => change(event, 'start', start)}/></label>
  <label>To<input type="date" aria-label="Timeline end date" value={end} min={start} onchange={event => change(event, 'end', end)}/></label>
</div>

<style>
  .timeline-dates{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
  label{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted)}
  input{min-width:0;border:1px solid var(--line);border-radius:5px;padding:6px;font-size:11px;color:var(--text);background:var(--surface)}
  input:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
  @media(max-width:600px){label{flex-direction:column;align-items:flex-start;gap:3px}input{width:118px;font-size:10px}}
</style>
