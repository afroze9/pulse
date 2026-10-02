<script>
  import { Sun, Moon, Monitor } from 'lucide-svelte';
  import { appearance } from './appearance.js';
  const options = [{id:'light',label:'Light',icon:Sun},{id:'dark',label:'Dark',icon:Moon},{id:'system',label:'System',icon:Monitor}];
</script>
<section class="appearance-card" aria-labelledby="appearance-heading">
  <div><h2 id="appearance-heading">Appearance</h2><p>Choose a theme for this device. System follows your Windows or browser appearance.</p></div>
  <div class="appearance-options" role="group" aria-label="Appearance Mode">
    {#each options as option}<button class:chosen={$appearance.mode===option.id} aria-pressed={$appearance.mode===option.id} onclick={()=>appearance.setMode(option.id)}><svelte:component this={option.icon} size={17}/>{option.label}</button>{/each}
  </div>
  <small aria-live="polite">{$appearance.mode==='system'?'Following System · '+($appearance.resolved==='dark'?'Dark':'Light'):'Saved on This Device'}</small>
</section>
<style>
  .appearance-card{display:flex;align-items:center;flex-wrap:wrap;gap:16px 24px;padding:23px;margin-bottom:24px;background:var(--surface,#fff);border:1px solid var(--line,#e5e9e3);border-radius:9px}.appearance-card>div:first-child{flex:1;min-width:240px}.appearance-card h2{font-size:14px}.appearance-card p{font-size:11px;line-height:1.8;color:var(--muted,#828c85);margin-top:8px}.appearance-options{display:flex;gap:4px;background:var(--surface-alt,#f4f7f1);border:1px solid var(--line,#e5e9e3);border-radius:8px;padding:4px}.appearance-options button{padding:10px 15px;border-radius:5px;font-size:12px;color:var(--muted,#828c85)}.appearance-options button.chosen{background:var(--surface,#fff);color:var(--text,#26372f);box-shadow:0 1px 4px #0002;outline:2px solid var(--focus,#28664e)}.appearance-card small{flex-basis:100%;font-size:10px;color:var(--muted,#828c85)}
.appearance-options button:focus-visible{outline:3px solid var(--focus,#28664e);outline-offset:3px}</style>
