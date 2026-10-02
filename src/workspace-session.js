import { normalizeWorkspace } from './planning.js';
const draftKey='pulse.pending-workspace.v1';
/** Serialized server commands. Failed drafts remain visible and recoverable. */
export class WorkspaceSession {
  constructor(api, notify, storage=globalThis.localStorage) {
    this.api=api;this.notify=notify;this.storage=storage;this.state={phase:'loading',version:null,canUndo:false,error:'',pending:null,remote:null};
  }
  emit(patch={}) { this.state={...this.state,...patch};this.notify(this.state); }
  remember(pending) { try { if(pending)this.storage?.setItem(draftKey,JSON.stringify(pending));else this.storage?.removeItem(draftKey); } catch { /* Storage can be unavailable; in-memory draft remains. */ } }
  accept(envelope) {
    if(!envelope?.data||!Number.isInteger(envelope.version))throw Error('The server returned an invalid workspace.');
    this.remember(null);
    this.emit({...envelope,data:normalizeWorkspace(envelope.data),phase:'ready',error:'',pending:null,remote:null});
  }
  async load() {
    if(this.state.phase==='saving')return;
    this.emit({phase:'loading',error:''});
    try {
      const envelope=await this.api.load(); let pending;
      try {pending=JSON.parse(this.storage?.getItem(draftKey)||'null');}catch {pending=null;}
      this.accept(envelope);
      if(pending?.data&&pending?.configuration) {
        this.remember(pending);
        this.emit({data:normalizeWorkspace(pending.data),configuration:pending.configuration,pending,remote:envelope,phase:'conflict',error:'A draft from a previous visit was recovered. Review it before replacing the saved workspace.'});
      }
    } catch(error) { this.emit({phase:'offline',error:error.message}); }
  }
  async save(data,configuration) {
    if(this.state.phase!=='ready')return false;
    const pending={data:structuredClone(data),configuration:structuredClone(configuration),expectedVersion:this.state.version,commandId:crypto.randomUUID()};
    this.remember(pending);this.emit({data:pending.data,configuration:pending.configuration,pending});
    return this.persist();
  }
  async persist(replaceLatest=false) {
    if(!this.state.pending||this.state.phase==='saving')return false;
    const pending=replaceLatest?{...this.state.pending,expectedVersion:this.state.remote.version,commandId:crypto.randomUUID()}:this.state.pending;
    this.remember(pending);this.emit({phase:'saving',error:'',pending});
    try { this.accept(await this.api.save(pending));return true; }
    catch(error) {
      if(error.status===409) {
        let remote=null;try {remote=await this.api.load();}catch { /* Retry can retrieve current revision later. */ }
        this.emit({phase:'conflict',remote,error:'The saved workspace changed in another session. Your draft has been preserved.'});
      } else this.emit({phase:'failed',error:error.message});
      return false;
    }
  }
  async discard() { if(this.state.phase==='saving')return;this.remember(null);if(this.state.remote)this.accept(this.state.remote);else await this.load(); }
  async undo() {
    if(this.state.phase!=='ready'||!this.state.canUndo)return false;
    this.emit({phase:'saving',error:''});
    try {this.accept(await this.api.undo({expectedVersion:this.state.version,commandId:crypto.randomUUID()}));return true;}
    catch(error) {this.emit({phase:'ready',error:error.status===409?'Workspace changed. Reload before undoing.':error.message});return false;}
  }
}
