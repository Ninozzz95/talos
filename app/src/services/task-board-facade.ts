import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';

export type TaskStatus='todo'|'doing'|'done';
export type TaskPriority='low'|'normal'|'high';
export type TaskBoardEdgeKind='depends-on'|'evidence'|'agent'|'schedule';
export type TaskBoardEdge={schema:'talos.cli.task-board-edge.v1';taskId:string;kind:TaskBoardEdgeKind;targetId:string;createdAt:string};
export type DependencyView={taskId:string;targetTaskId:string;state:'available'|'dangling';label:string|null;createdAt:string};
export type EvidenceMeasurement={scritture:number;artefatti:number;toolCalls:number;toolCallsOk:number;toolCallsFalliti:number;verificabile:boolean}|null;
export type EvidenceView={taskId:string;sessionId:string;state:'available'|'dangling';measurement:EvidenceMeasurement;createdAt:string};
export type AgentView={taskId:string;sessionId:string;state:'available'|'dangling';parentSessionId:string|null;depth:number|null;task:string|null;outcome:'running'|'completed'|'failed'|'unknown';createdAt:string};
export type ScheduleView={taskId:string;automationId:string;state:'available'|'dangling';executionTaskId:string|null;name:string|null;intervalMinutes:number|null;dailyLimit:number|null;active:boolean|null;lastExecution:string|null;nextExecution:string|null;createdAt:string};
export type TaskBoardRow={id:string;title:string;description:string|null;status:TaskStatus;priority:TaskPriority;writer:'persona'|'modello';writerEvidence:'persisted'|'derived-legacy-default';createdAt:string|null;updatedAt:string|null;dependencies:DependencyView[];evidence:EvidenceView[];agents:AgentView[];schedules:ScheduleView[]};
export type TaskBoardSnapshot={state:'ready'|'invalid';rows:TaskBoardRow[];error:{code:'TASK_BOARD_INVALID';message:string}|null;legacyRows:any[]};

type TaskStore={formaPubblicaAttivita?:(row:any)=>any;elencaAttivita:(input:{cartella:string})=>Promise<any[]>;leggiAttivita:(input:{cartella:string;id:string})=>Promise<any|null>;creaAttivita:(input:{cartella:string;title:string;description?:string|null;priority?:TaskPriority;origine:'persona'|'modello'})=>Promise<any>;aggiornaAttivita:(input:{cartella:string;id:string;title?:string;description?:string|null;priority?:TaskPriority})=>Promise<any>;completaAttivita:(input:{cartella:string;id:string;status?:TaskStatus})=>Promise<any>;eliminaAttivita:(input:{cartella:string;id:string})=>Promise<void>};
type SessionStore={leggiRegistro:(input:{cartellaStore:string;sessionId:string})=>Promise<any[]|null>};
type AutomationStore={leggi:(id:string)=>Promise<any|null>};
type Input={repoRoot?:string;projectRoot?:string;paths:{dataRoot:string;sessionsRoot:string}};
type Deps={loadTaskStore?:()=>Promise<TaskStore>;loadSessionStore?:()=>Promise<SessionStore>;loadAutomationStore?:()=>Promise<AutomationStore>;analyzeEvidence?:(records:any[])=>EvidenceMeasurement;listEdges?:()=>Promise<unknown[]>;writeEdge?:(record:TaskBoardEdge)=>Promise<void>;deleteEdge?:(record:TaskBoardEdge)=>Promise<void>;now?:()=>Date};

const SCHEMA='talos.cli.task-board-edge.v1' as const;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$/u;
const KINDS=new Set<TaskBoardEdgeKind>(['depends-on','evidence','agent','schedule']);
const STATUSES=new Set<TaskStatus>(['todo','doing','done']);
const PRIORITIES=new Set<TaskPriority>(['low','normal','high']);
function fail(code:string,message=code):never{throw Object.assign(new Error(message),{code});}
function validId(value:string,code='TASK_BOARD_ID_INVALID'){if(!ID.test(value)||value.includes('..'))fail(code);return value;}
function edgeKind(value:string):TaskBoardEdgeKind{if(!KINDS.has(value as TaskBoardEdgeKind))fail('TASK_BOARD_EDGE_KIND_INVALID');return value as TaskBoardEdgeKind;}
function stringOrNull(value:unknown){return typeof value==='string'?value:null;}
function numberOrNull(value:unknown){return Number.isFinite(value)?Number(value):null;}
function requiredString(value:unknown,field:string){if(typeof value!=='string'||value.length===0)throw new TypeError('malformed task board row: '+field);return value;}
function edgeKey(record:Pick<TaskBoardEdge,'taskId'|'kind'|'targetId'>){return createHash('sha256').update(record.taskId+'\0'+record.kind+'\0'+record.targetId).digest('hex');}
function parseEdge(value:any):TaskBoardEdge{
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==SCHEMA)throw new TypeError('malformed task board edge');
  return{schema:SCHEMA,taskId:validId(String(value.taskId??''),'TASK_BOARD_EDGE_INVALID'),kind:edgeKind(String(value.kind??'')),targetId:validId(String(value.targetId??''),'TASK_BOARD_EDGE_INVALID'),createdAt:requiredString(value.createdAt,'createdAt')};
}
function edgeSort(a:TaskBoardEdge,b:TaskBoardEdge){return a.kind.localeCompare(b.kind)||a.targetId.localeCompare(b.targetId)||a.createdAt.localeCompare(b.createdAt);}
function headerOf(records:any[]|null){return Array.isArray(records)?records.find(row=>row?.tipo==='intestazione')??null:null;}
function agentOutcome(records:any[]|null):AgentView['outcome']{
  if(!Array.isArray(records))return'unknown';
  const terminal=[...records].reverse().find(row=>row?.type==='RunFinished'||row?.type==='RunError');
  if(!terminal)return'running';
  return terminal.type==='RunFinished'?'completed':terminal.type==='RunError'?'failed':'unknown';
}
function createsCycle(edges:readonly TaskBoardEdge[],source:string,target:string){
  const adjacency=new Map<string,string[]>();
  for(const edge of edges){if(edge.kind!=='depends-on')continue;const rows=adjacency.get(edge.taskId);if(rows)rows.push(edge.targetId);else adjacency.set(edge.taskId,[edge.targetId]);}
  const seen=new Set<string>(),stack=[target];
  while(stack.length){const current=stack.pop()!;if(current===source)return true;if(seen.has(current))continue;seen.add(current);for(const next of adjacency.get(current)??[])stack.push(next);}
  return false;
}

export function createTaskBoardFacade(input:Input,deps:Deps={}){
  const tasksRoot=join(input.paths.dataRoot,'tasks');
  const automationRoot=join(input.paths.dataRoot,'automations');
  const edgeRoot=join(input.paths.dataRoot,'task-board-edges');
  const repoRoot=()=>input.repoRoot??(input.projectRoot?findTalosRepoRoot(input.projectRoot):fail('TASK_BOARD_REPO_ROOT_REQUIRED'));
  let taskPromise:Promise<TaskStore>|null=null,sessionPromise:Promise<SessionStore>|null=null,automationPromise:Promise<AutomationStore>|null=null,evidenceModulePromise:Promise<any>|null=null;
  const taskStore=()=>taskPromise??=(deps.loadTaskStore?deps.loadTaskStore():importTalosModule(repoRoot(),'tasks-store.mjs') as Promise<TaskStore>);
  const sessionStore=()=>sessionPromise??=(deps.loadSessionStore?deps.loadSessionStore():importTalosModule(repoRoot(),'session-store.mjs') as Promise<SessionStore>);
  const automationStore=()=>automationPromise??=(deps.loadAutomationStore?deps.loadAutomationStore():(async()=>{const mod:any=await importTalosModule(repoRoot(),'automation-store.mjs');return mod.createAutomationStore({cartella:automationRoot}) as AutomationStore;})());
  const measureEvidence=async(records:any[])=>{
    if(deps.analyzeEvidence)return deps.analyzeEvidence(records);
    evidenceModulePromise??=importTalosModule(repoRoot(),'subagent-orchestrator.mjs');
    const mod:any=await evidenceModulePromise;
    return mod.analizzaEvidenzaDelega(records) as EvidenceMeasurement;
  };

  const defaultListEdges=async()=>{
    let names:string[];try{names=await readdir(edgeRoot);}catch(error:any){if(error?.code==='ENOENT')return[];throw error;}
    const edges:TaskBoardEdge[]=[];
    for(const name of names.sort()){if(!name.endsWith('.json'))continue;edges.push(parseEdge(JSON.parse(await readFile(join(edgeRoot,name),'utf8'))));}
    return edges.sort(edgeSort);
  };
  const defaultWriteEdge=async(record:TaskBoardEdge)=>{
    await mkdir(edgeRoot,{recursive:true,mode:0o700});
    const key=edgeKey(record),final=join(edgeRoot,key+'.json'),tmp=join(edgeRoot,'.'+key+'.'+randomUUID()+'.tmp');
    await writeFile(tmp,JSON.stringify(record,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
    try{await rename(tmp,final);}catch(error){await rm(tmp,{force:true});throw error;}
  };
  const defaultDeleteEdge=async(record:TaskBoardEdge)=>{await rm(join(edgeRoot,edgeKey(record)+'.json'),{force:true});};
  const listEdges=async()=>{const raw=await (deps.listEdges?deps.listEdges():defaultListEdges());if(!Array.isArray(raw))throw new TypeError('malformed task board edge store');return raw.map(parseEdge).sort(edgeSort);};
  const writeEdge=deps.writeEdge??defaultWriteEdge;
  const deleteEdge=deps.deleteEdge??defaultDeleteEdge;
  const now=deps.now??(()=>new Date());

  function publicTask(raw:any,store:TaskStore){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('malformed persisted task row: object');
    const shaped=typeof store.formaPubblicaAttivita==='function'?store.formaPubblicaAttivita(raw):raw;
    const id=validId(requiredString(shaped?.id,'id'),'TASK_ID_INVALID'),title=requiredString(shaped?.titolo,'titolo');
    if(!STATUSES.has(shaped?.stato as TaskStatus))throw new TypeError('malformed persisted task row: stato');
    if(!PRIORITIES.has(shaped?.priorita as TaskPriority))throw new TypeError('malformed persisted task row: priorita');
    const writer:'persona'|'modello'=shaped?.origine==='persona'?'persona':'modello';
    const writerEvidence:'persisted'|'derived-legacy-default'=(raw.origine==='persona'||raw.origine==='modello')?'persisted':'derived-legacy-default';
    return{id,title,description:stringOrNull(shaped?.descrizione),status:shaped.stato as TaskStatus,priority:shaped.priorita as TaskPriority,writer,writerEvidence,createdAt:stringOrNull(shaped?.creataAlle),updatedAt:stringOrNull(shaped?.aggiornataAlle)};
  }
  async function exactTask(taskId:string){const wanted=validId(taskId,'TASK_ID_INVALID'),store=await taskStore(),raw=await store.leggiAttivita({cartella:tasksRoot,id:wanted});if(!raw||raw.id!==wanted)fail('TASK_NOT_FOUND');return{wanted,store,raw};}
  async function sessionRecords(sessionId:string,required=false){const records=await (await sessionStore()).leggiRegistro({cartellaStore:input.paths.sessionsRoot,sessionId}),header=headerOf(records);const exact=Array.isArray(records)&&header?.sessionId===sessionId?records:null;if(!exact&&required)fail('TASK_BOARD_TARGET_NOT_FOUND');return exact;}

  async function dependencyView(edge:TaskBoardEdge):Promise<DependencyView>{
    const row=await (await taskStore()).leggiAttivita({cartella:tasksRoot,id:edge.targetId});
    const exact=row?.id===edge.targetId?row:null;
    return{taskId:edge.taskId,targetTaskId:edge.targetId,state:exact?'available':'dangling',label:exact?stringOrNull(exact.titolo):null,createdAt:edge.createdAt};
  }
  async function evidenceView(edge:TaskBoardEdge):Promise<EvidenceView>{
    const records=await sessionRecords(edge.targetId,false);
    return{taskId:edge.taskId,sessionId:edge.targetId,state:records?'available':'dangling',measurement:records?await measureEvidence(records):null,createdAt:edge.createdAt};
  }
  async function agentView(edge:TaskBoardEdge):Promise<AgentView>{
    const records=await sessionRecords(edge.targetId,false),header=headerOf(records);
    const delegated=header&&typeof header.padreId==='string'&&header.padreId.length>0&&Number.isSafeInteger(header.profonditaDelega)&&header.profonditaDelega>0&&typeof header.taskId==='string'&&header.taskId.startsWith('delega:');
    return{taskId:edge.taskId,sessionId:edge.targetId,state:delegated?'available':'dangling',parentSessionId:delegated?header.padreId:null,depth:delegated?Number(header.profonditaDelega):null,task:delegated?stringOrNull(header.task?.consegnaCorta??header.task?.consegna):null,outcome:delegated?agentOutcome(records):'unknown',createdAt:edge.createdAt};
  }
  async function scheduleView(edge:TaskBoardEdge):Promise<ScheduleView>{
    const row=await (await automationStore()).leggi(edge.targetId),exact=row?.id===edge.targetId?row:null;
    return{taskId:edge.taskId,automationId:edge.targetId,state:exact?'available':'dangling',executionTaskId:exact?stringOrNull(exact.taskId):null,name:exact?stringOrNull(exact.nome):null,intervalMinutes:exact?numberOrNull(exact.intervalloMinuti):null,dailyLimit:exact?numberOrNull(exact.limiteAlGiorno):null,active:exact?Boolean(exact.attiva):null,lastExecution:exact?stringOrNull(exact.ultimaEsecuzione):null,nextExecution:exact?stringOrNull(exact.prossimaEsecuzione):null,createdAt:edge.createdAt};
  }
  async function projectTask(raw:any,store:TaskStore,edges:TaskBoardEdge[]):Promise<TaskBoardRow>{
    const base=publicTask(raw,store),mine=edges.filter(edge=>edge.taskId===base.id);
    const dependencies:DependencyView[]=[],evidence:EvidenceView[]=[],agents:AgentView[]=[],schedules:ScheduleView[]=[];
    for(const edge of mine){
      if(edge.kind==='depends-on')dependencies.push(await dependencyView(edge));
      else if(edge.kind==='evidence')evidence.push(await evidenceView(edge));
      else if(edge.kind==='agent')agents.push(await agentView(edge));
      else schedules.push(await scheduleView(edge));
    }
    return{...base,dependencies,evidence,agents,schedules};
  }
  function invalid(error:unknown):TaskBoardSnapshot{return{state:'invalid',rows:[],error:{code:'TASK_BOARD_INVALID',message:error instanceof Error?error.message:String(error)},legacyRows:[]};}

  const list=async():Promise<TaskBoardSnapshot>=>{
    try{const store=await taskStore(),raw=await store.elencaAttivita({cartella:tasksRoot});if(!Array.isArray(raw))throw new TypeError('malformed persisted task list');const edges=await listEdges(),rows:TaskBoardRow[]=[];for(const item of raw)rows.push(await projectTask(item,store,edges));return{state:'ready',rows,error:null,legacyRows:raw};}catch(error){return invalid(error);}
  };
  const add=async(value:{title:string;description?:string|null;priority?:TaskPriority})=>{const store=await taskStore(),legacy=await store.creaAttivita({cartella:tasksRoot,title:value.title,description:value.description??null,priority:value.priority??'normal',origine:'persona'});return{legacy};};
  const update=async(taskId:string,value:{title?:string;description?:string|null;priority?:TaskPriority})=>{const store=await taskStore(),wanted=validId(taskId,'TASK_ID_INVALID'),legacy=await store.aggiornaAttivita({cartella:tasksRoot,id:wanted,...(value.title!==undefined?{title:value.title}:{}),...(value.description!==undefined?{description:value.description}:{}),...(value.priority!==undefined?{priority:value.priority}:{})});return{legacy};};
  const complete=async(taskId:string,status:TaskStatus='done')=>{const store=await taskStore(),wanted=validId(taskId,'TASK_ID_INVALID'),legacy=await store.completaAttivita({cartella:tasksRoot,id:wanted,status});return{legacy};};
  const deleteTask=async(taskId:string)=>{const store=await taskStore(),wanted=validId(taskId,'TASK_ID_INVALID');await store.eliminaAttivita({cartella:tasksRoot,id:wanted});return{legacy:{ok:true as const,id:wanted}};};

  async function validateTarget(kind:TaskBoardEdgeKind,targetId:string){
    if(kind==='depends-on'){const row=await (await taskStore()).leggiAttivita({cartella:tasksRoot,id:targetId});if(!row||row.id!==targetId)fail('TASK_BOARD_TARGET_NOT_FOUND');return;}
    if(kind==='schedule'){const row=await (await automationStore()).leggi(targetId);if(!row||row.id!==targetId)fail('TASK_BOARD_TARGET_NOT_FOUND');return;}
    const records=await sessionRecords(targetId,true);
    if(kind==='evidence'){await measureEvidence(records!);return;}
    if(kind==='agent'){const header=headerOf(records);if(!header||typeof header.padreId!=='string'||!header.padreId||!Number.isSafeInteger(header.profonditaDelega)||header.profonditaDelega<=0||typeof header.taskId!=='string'||!header.taskId.startsWith('delega:'))fail('TASK_AGENT_NOT_DELEGATED');}
  }
  async function addEdge(taskId:string,kind:TaskBoardEdgeKind,targetId:string){
    const source=await exactTask(taskId),target=validId(targetId,'TASK_BOARD_TARGET_INVALID'),typed=edgeKind(kind);
    if(typed==='depends-on'&&source.wanted===target)fail('TASK_DEPENDENCY_SELF');
    await validateTarget(typed,target);
    const edges=await listEdges(),existing=edges.find(edge=>edge.taskId===source.wanted&&edge.kind===typed&&edge.targetId===target);
    if(existing)return{changed:false,edge:existing};
    if(typed==='depends-on'&&createsCycle(edges,source.wanted,target))fail('TASK_DEPENDENCY_CYCLE');
    const record:TaskBoardEdge={schema:SCHEMA,taskId:source.wanted,kind:typed,targetId:target,createdAt:now().toISOString()};
    await writeEdge(record);return{changed:true,edge:record};
  }
  async function removeEdge(taskId:string,kind:TaskBoardEdgeKind,targetId:string){
    const source=validId(taskId,'TASK_ID_INVALID'),target=validId(targetId,'TASK_BOARD_TARGET_INVALID'),typed=edgeKind(kind),existing=(await listEdges()).find(edge=>edge.taskId===source&&edge.kind===typed&&edge.targetId===target);
    if(!existing)return{changed:false,taskId:source,kind:typed,targetId:target};
    await deleteEdge(existing);return{changed:true,taskId:source,kind:typed,targetId:target};
  }

  return{
    list,add,update,complete,delete:deleteTask,
    depend:(taskId:string,targetTaskId:string)=>addEdge(taskId,'depends-on',targetTaskId),
    undepend:(taskId:string,targetTaskId:string)=>removeEdge(taskId,'depends-on',targetTaskId),
    addEvidence:(taskId:string,sessionId:string)=>addEdge(taskId,'evidence',sessionId),
    removeEvidence:(taskId:string,sessionId:string)=>removeEdge(taskId,'evidence',sessionId),
    assignAgent:(taskId:string,sessionId:string)=>addEdge(taskId,'agent',sessionId),
    unassignAgent:(taskId:string,sessionId:string)=>removeEdge(taskId,'agent',sessionId),
    attachSchedule:(taskId:string,automationId:string)=>addEdge(taskId,'schedule',automationId),
    detachSchedule:(taskId:string,automationId:string)=>removeEdge(taskId,'schedule',automationId),
  };
}
