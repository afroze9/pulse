export type DateOnly = string;
export interface Dates { plannedStart: DateOnly|null; plannedEnd: DateOnly|null; actualStart: DateOnly|null; actualEnd: DateOnly|null }
export interface Project { id:string; key:string; name:string; color:string; owner?:string|null; description?:string|null; jiraId?:string|null }
export interface Person { id:string; name:string; initials:string; color:string; role?:string|null; jiraAccountId?:string|null }
export interface Sprint { id:string; project:string; name:string; start:DateOnly|null; end:DateOnly|null; jiraId?:string|null; boardId?:string|null; state?:string|null }
export interface JiraMetadata { jiraId?:string|null; jiraKey?:string|null; jiraUpdated?:string|null; sourceUpdatedAt?:string|null; imported?:boolean; localOverride?:boolean; source?:string|null }
export interface Epic extends Dates, JiraMetadata { id:string; project:string; title:string; goal?:string|null; target:DateOnly|null; milestone?:string|null; status:string; progress?:number|null; dependsOn?:string|null }
export interface Story extends Dates, JiraMetadata { id:string; project:string; title:string; type:string; person:string|null; epic:string|null; sprint:string|null; points:number|null; status:string }
export interface Workspace { projects:Project[]; people:Person[]; sprints:Sprint[]; epics:Epic[]; stories:Story[] }
export interface Configuration { projects:string[]; people:string[]; types:string[] }
export interface JiraStatus { configured:boolean; connected:boolean; message:string; lastSync:string|null }
export interface WorkspaceEnvelope { version:number; data:Workspace; configuration:Configuration; canUndo:boolean; source:'local'|'demo'|'jira'; jira:JiraStatus }
export interface SaveWorkspaceCommand { expectedVersion:number; commandId:string; data:Workspace; configuration:Configuration }
export interface UndoCommand { expectedVersion:number; commandId:string }
export interface JiraSyncCommand extends UndoCommand { projectKeys?:string[] }
export interface JiraProject { id:string; key:string; name:string }
