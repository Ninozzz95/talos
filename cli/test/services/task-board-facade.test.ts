import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createTaskBoardFacade} from '../../src/services/task-board-facade.ts';

const tasks=[
  {id:'t1',titolo:'Ship board',descrizione:'Main work',stato:'doing',priorita:'high',origine:'persona',creataAlle:'2026-09-21T10:00:00.000Z',aggiornataAlle:'2026-09-21T11:00:00.000Z'},
  {id:'t2',titolo:'Verify graph',descrizione:null,stato:'todo',priorita:'normal',origine:'modello',creataAlle:'2026-09-21T09:00:00.000Z',aggiornataAlle:'2026-09-21T09:00:00.000Z'},
  {id:'t3',titolo:'Publish',descrizione:null,stato:'todo',priorita:'low',origine:'modello',creataAlle:'2026-09-21T08:00:00.000Z',aggiornataAlle:'2026-09-21T08:00:00.000Z'},
];

function publicTask(row:any){return{id:row.id,titolo:row.titolo,descrizione:row.descrizione??null,stato:row.stato,fatta:row.stato==='done',priorita:row.priorita,creataAlle:row.creataAlle??null,aggiornataAlle:row.aggiornataAlle??null,origine:row.origine==='persona'||row.origine==='modello'?row.origine:'modello'};}

function fixture(){
  const rows=tasks.map(row=>({...row}));
  const edges:any[]=[];
  const writes:any[]=[];
  const deletes:any[]=[];
  const sessions=new Map<string,any[]>([
    ['s-main',[{tipo:'intestazione',sessionId:'s-main',taskId:'libero:full-access',padreId:null,profonditaDelega:0,task:{consegnaCorta:'Main'}}]],
    ['a-1',[
      {tipo:'intestazione',sessionId:'a-1',taskId:'delega:s-main',padreId:'s-main',profonditaDelega:1,task:{consegnaCorta:'Implement task board'}},
      {type:'StateDelta',delta:[{path:'/file/src/a.ts'}]},
      {type:'ToolCallResult',content:'ok'}
    ]],
    ['r-1',[{tipo:'intestazione',sessionId:'r-1',taskId:'ricerca',padreId:'s-main',profonditaDelega:0,task:{ricercaId:'r-1'}}]],
    ['e-1',[
      {tipo:'intestazione',sessionId:'e-1',taskId:'libero:evidence',padreId:null,profonditaDelega:0,task:{consegnaCorta:'Evidence session'}},
      {type:'ArtifactCreated'},
      {type:'ToolCallResult',content:'ok'}
    ]]
  ]);
  const automations=new Map<string,any>([
    ['auto-1',{id:'auto-1',taskId:'catalog:nightly-check',nome:'Nightly verification',intervalloMinuti:60,limiteAlGiorno:3,attiva:true,creataAlle:'2026-09-21T10:00:00.000Z',ultimaEsecuzione:'2026-09-21T11:00:00.000Z',prossimaEsecuzione:'2026-09-21T12:00:00.000Z'}]
  ]);
  const analyzed:any[]=[];
  const deps:any={
    loadTaskStore:async()=>({
      formaPubblicaAttivita:publicTask,
      elencaAttivita:async()=>rows,
      leggiAttivita:async({id}:any)=>rows.find(row=>row.id===id)??null,
      creaAttivita:async(input:any)=>{const row={...tasks[0],id:'t-new',titolo:input.title,descrizione:input.description,priorita:input.priority,stato:'todo',origine:input.origine};rows.push(row);return row;},
      aggiornaAttivita:async({id,...patch}:any)=>{const row=rows.find(value=>value.id===id);if(!row)throw Object.assign(new Error('missing'),{code:'TASK_NOT_FOUND'});if(patch.title!==undefined)row.titolo=patch.title;if(patch.description!==undefined)row.descrizione=patch.description;if(patch.priority!==undefined)row.priorita=patch.priority;return row;},
      completaAttivita:async({id,status}:any)=>{const row=rows.find(value=>value.id===id);if(!row)throw Object.assign(new Error('missing'),{code:'TASK_NOT_FOUND'});row.stato=status;return row;},
      eliminaAttivita:async({id}:any)=>{const index=rows.findIndex(value=>value.id===id);if(index>=0)rows.splice(index,1);}
    }),
    loadSessionStore:async()=>({leggiRegistro:async({sessionId}:any)=>sessions.get(sessionId)??null}),
    loadAutomationStore:async()=>({leggi:async(id:string)=>automations.get(id)??null}),
    analyzeEvidence:(records:any[])=>{analyzed.push(records);return{scritture:records.filter(row=>row.type==='StateDelta').length,artefatti:records.filter(row=>row.type==='ArtifactCreated').length,toolCalls:records.filter(row=>row.type==='ToolCallResult').length,toolCallsOk:records.filter(row=>row.type==='ToolCallResult').length,toolCallsFalliti:0,verificabile:true};},
    listEdges:async()=>edges.map(row=>structuredClone(row)),
    writeEdge:async(record:any)=>{writes.push(structuredClone(record));edges.push(structuredClone(record));},
    deleteEdge:async(record:any)=>{deletes.push(structuredClone(record));const i=edges.findIndex(row=>row.taskId===record.taskId&&row.kind===record.kind&&row.targetId===record.targetId);if(i>=0)edges.splice(i,1);},
    now:()=>new Date('2026-09-21T12:00:00.000Z')
  };
  return{rows,edges,writes,deletes,sessions,automations,analyzed,deps};
}
function api(f:any){return createTaskBoardFacade({repoRoot:'/repo',projectRoot:'/project',paths:{dataRoot:'/data',sessionsRoot:'/sessions'} as any},f.deps);}

test('M9-C RED — passive board list preserves authoritative task fields and performs no relation mutation',async()=>{
  const f=fixture();const snap=await api(f).list();
  assert.equal(snap.state,'ready');
  assert.equal(snap.rows[0]?.id,'t1');
  assert.equal(snap.rows[0]?.status,'doing');
  assert.equal(snap.rows[0]?.priority,'high');
  assert.equal(snap.rows[0]?.writer,'persona');
  assert.equal(snap.rows[0]?.writerEvidence,'persisted');
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.deletes,[]);
});

test('M9-C RED — legacy writer provenance is labelled derived rather than falsely persisted',async()=>{
  const f=fixture();delete f.rows[0].origine;
  const row=(await api(f).list()).rows.find((value:any)=>value.id==='t1')!;
  assert.equal(row.writer,'modello');
  assert.equal(row.writerEvidence,'derived-legacy-default');
});

test('M9-C RED — dependencies validate exact task ids and reject self dependency before write',async()=>{
  const f=fixture();const board=api(f);
  assert.equal((await board.depend('t1','t2')).changed,true);
  await assert.rejects(()=>board.depend('t1','t1'),(error:any)=>error?.code==='TASK_DEPENDENCY_SELF');
  await assert.rejects(()=>board.depend('t1','missing'),(error:any)=>error?.code==='TASK_BOARD_TARGET_NOT_FOUND');
  assert.equal(f.writes.length,1);
});

test('M9-C RED — dependency graph rejects directed cycles before relation write',async()=>{
  const f=fixture();const board=api(f);
  await board.depend('t1','t2');await board.depend('t2','t3');
  await assert.rejects(()=>board.depend('t3','t1'),(error:any)=>error?.code==='TASK_DEPENDENCY_CYCLE');
  assert.equal(f.writes.length,2);
});

test('M9-C RED — exact duplicate dependency is idempotent and undepend removes only that edge',async()=>{
  const f=fixture();const board=api(f);
  assert.equal((await board.depend('t1','t2')).changed,true);
  assert.equal((await board.depend('t1','t2')).changed,false);
  await board.depend('t1','t3');
  assert.equal((await board.undepend('t1','t2')).changed,true);
  const row=(await board.list()).rows.find((value:any)=>value.id==='t1')!;
  assert.deepEqual(row.dependencies.map((x:any)=>x.targetTaskId),['t3']);
});

test('M9-C RED — deleted dependency target stays visible as dangling and passive list does not repair it',async()=>{
  const f=fixture();const board=api(f);await board.depend('t1','t2');
  f.rows.splice(f.rows.findIndex((row:any)=>row.id==='t2'),1);f.writes.length=0;f.deletes.length=0;
  const dep=(await board.list()).rows.find((value:any)=>value.id==='t1')!.dependencies[0];
  assert.equal(dep.state,'dangling');assert.equal(dep.targetTaskId,'t2');
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.deletes,[]);
});

test('M9-C RED — evidence link requires an exact persisted session and uses the injected real evidence analyzer',async()=>{
  const f=fixture();const board=api(f);
  const result=await board.addEvidence('t1','e-1');
  assert.equal(result.changed,true);
  assert.equal(f.analyzed.length,1);
  const evidence=(await board.list()).rows.find((value:any)=>value.id==='t1')!.evidence[0];
  assert.equal(evidence.sessionId,'e-1');
  assert.equal(evidence.state,'available');
  assert.equal(evidence.measurement.artefatti,1);
  await assert.rejects(()=>board.addEvidence('t1','missing'),(error:any)=>error?.code==='TASK_BOARD_TARGET_NOT_FOUND');
});

test('M9-C RED — agent assignment accepts only persisted delegated-child sessions',async()=>{
  const f=fixture();const board=api(f);
  const result=await board.assignAgent('t1','a-1');assert.equal(result.changed,true);
  const agent=(await board.list()).rows.find((value:any)=>value.id==='t1')!.agents[0];
  assert.equal(agent.sessionId,'a-1');assert.equal(agent.parentSessionId,'s-main');assert.equal(agent.depth,1);assert.equal(agent.task,'Implement task board');
  await assert.rejects(()=>board.assignAgent('t1','s-main'),(error:any)=>error?.code==='TASK_AGENT_NOT_DELEGATED');
  await assert.rejects(()=>board.assignAgent('t1','r-1'),(error:any)=>error?.code==='TASK_AGENT_NOT_DELEGATED');
});

test('M9-C RED — real agent relation never invokes session execution methods',async()=>{
  const f=fixture();const board=api(f);await board.assignAgent('t1','a-1');await board.unassignAgent('t1','a-1');
  assert.equal(f.writes.length,1);assert.equal(f.deletes.length,1);
});

test('M9-C RED — schedule link validates a real automation and exposes its actual executable task id',async()=>{
  const f=fixture();const board=api(f);await board.attachSchedule('t1','auto-1');
  const schedule=(await board.list()).rows.find((value:any)=>value.id==='t1')!.schedules[0];
  assert.equal(schedule.automationId,'auto-1');
  assert.equal(schedule.executionTaskId,'catalog:nightly-check');
  assert.equal(schedule.intervalMinutes,60);assert.equal(schedule.active,true);
  assert.equal(schedule.nextExecution,'2026-09-21T12:00:00.000Z');
  await assert.rejects(()=>board.attachSchedule('t1','missing'),(error:any)=>error?.code==='TASK_BOARD_TARGET_NOT_FOUND');
});

test('M9-C RED — schedule association does not create enable disable or run automations',async()=>{
  const f=fixture();const board=api(f);await board.attachSchedule('t1','auto-1');await board.detachSchedule('t1','auto-1');
  assert.equal(f.writes.length,1);assert.equal(f.deletes.length,1);
});

test('M9-C RED — edge metadata cannot resurrect a task deleted from authoritative task storage',async()=>{
  const f=fixture();const board=api(f);await board.addEvidence('t1','e-1');f.rows.splice(f.rows.findIndex((row:any)=>row.id==='t1'),1);
  const snap=await board.list();assert.equal(snap.rows.some((row:any)=>row.id==='t1'),false);
});

test('M9-C RED — CLI tasks CRUD and all board edge mutations route through one typed facade',async()=>{
  const source=await readFile(new URL('../../src/commands/services-cli.ts',import.meta.url),'utf8');
  assert.match(source,/createTaskBoardFacade/u);
  const start=source.indexOf('export async function runTasksCommand');
  const end=source.indexOf('export async function runMemoryCommand',start);
  assert.ok(start>=0&&end>start);const body=source.slice(start,end);
  assert.doesNotMatch(body,/importTalosModule\([^)]*tasks-store\.mjs/u);
  for(const method of ['list','add','update','complete','delete','depend','undepend','addEvidence','removeEvidence','assignAgent','unassignAgent','attachSchedule','detachSchedule'])assert.match(body,new RegExp('tasks\\.'+method+'\\(','u'));
});

/* the fifth review of 0.6.6: the kernel's store (r4 fc5e25d62) throws AUTOMATION_STORE_READ_FAILED for an entry it cannot read;
   one linked automation that cannot be read is that edge dangling, never the whole board invalid */
test('a linked automation that cannot be read leaves the board ready, that edge dangling',async()=>{
  const f=fixture();
  f.edges.push({schema:'talos.cli.task-board-edge.v1',taskId:'t1',kind:'schedule',targetId:'auto-1',createdAt:'2026-09-21T10:00:00.000Z'},{schema:'talos.cli.task-board-edge.v1',taskId:'t2',kind:'schedule',targetId:'broken',createdAt:'2026-09-21T10:00:00.000Z'});
  f.deps.loadAutomationStore=async()=>({leggi:async(id:string)=>{if(id==='broken')throw Object.assign(new Error('automation "broken" could not be read (EISDIR)'),{code:'AUTOMATION_STORE_READ_FAILED'});return f.automations.get(id)??null;}});
  const snapshot=await api(f).list();
  assert.equal(snapshot.state,'ready',JSON.stringify(snapshot.error));
  const byTask=Object.fromEntries(snapshot.rows.map((row:any)=>[row.id,row.schedules]));
  assert.equal(byTask.t1[0].state,'available');assert.equal(byTask.t2[0].state,'dangling');
});

/* 0.6.7 (sixth review of 0.6.6, N2): only an entry that cannot be read is dangling; a store that cannot be loaded, or another
   failure, is the board's own error — before, every linked automation silently read «dangling» */
test('a store that cannot be loaded, or another failure, is the board\'s error, not every edge dangling',async()=>{
  for(const deps of [
    {loadAutomationStore:async()=>{throw Object.assign(new Error('the automation store module did not load'),{code:'MODULE_NOT_FOUND'});}},
    {loadAutomationStore:async()=>({leggi:async()=>{throw new TypeError('store contract broken');}})},
  ]){
    const f=fixture();
    f.edges.push({schema:'talos.cli.task-board-edge.v1',taskId:'t1',kind:'schedule',targetId:'auto-1',createdAt:'2026-09-21T10:00:00.000Z'});
    Object.assign(f.deps,deps);
    const snapshot=await api(f).list();
    assert.equal(snapshot.state,'invalid');
    assert.equal(snapshot.error?.code,'TASK_BOARD_INVALID');
  }
});
