import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomationFacade,nameFromInstructions} from '../../src/services/automation-facade.ts';

/* 0.6.6: the facade over the kernel's v2 store — rows with the schedule phrase and the mode, the history of runs, an old-format
   entry flagged and refused for anything but delete. */
function fakeStore(){
  const rows:any[]=[
    {versione:2,id:'v2',nome:'Morning',istruzioni:'say hello',cartella:'C:/p',modello:null,permessi:'Read only',coordinazione:false,pianificazione:{tipo:'giornaliera',ora:'09:00'},fusoOrario:'Europe/Rome',ripeti:5,eseguite:2,attiva:true,prossimaEsecuzione:'2026-10-16T07:00:00.000Z',ultimaEsecuzione:'2026-10-15T07:00:00.000Z',giroInCorso:null},
    {id:'v1',taskId:'catalog-task',nome:'Old',intervalloMinuti:5,attiva:false,prossimaEsecuzione:null},
  ];
  const created:any[]=[];
  return{created,store:{elenca:async()=>rows,leggi:async(id:string)=>rows.find(r=>r.id===id)??null,crea:async(x:any)=>{created.push(x);const v={versione:2,id:'n1',eseguite:0,attiva:true,prossimaEsecuzione:null,ripeti:x.ripeti??null,...x};rows.push(v);return v;},
    modifica:async(id:string,f:any)=>{const v=rows.find(r=>r.id===id);Object.assign(v,f);return v;},imposta:async(id:string,a:boolean)=>{const v=rows.find(r=>r.id===id);if(!v)return null;v.attiva=a;return v;},
    elimina:async(id:string)=>{rows.splice(rows.findIndex(r=>r.id===id),1);},giri:async()=>[{runId:'r1',evento:'fine',esito:'finita'}]}};
}

test('rows carry the schedule phrase, mode, runs left; the old format is flagged, not hidden',async()=>{
  const f=fakeStore();const facade=createAutomationFacade({projectRoot:'/p',dataRoot:'/d',repoRoot:'/r'},{loadAutomationStore:async()=>f.store as any,probeHealth:async()=>({state:'healthy'}) as any});
  const snapshot=await facade.list();
  assert.equal(snapshot.state,'ready');
  assert.deepEqual(snapshot.rows.map((r:any)=>[r.id,r.schedule,r.mode,r.runsLeft,r.legacy]),[['v2','daily 09:00','plan',3,false],['v1','old format (task catalog-task, every 5m)',null,null,true]]);
  const detail=await facade.read('v2');assert.equal(detail.runs[0].esito,'finita');assert.equal(detail.adapterHealth.state,'healthy');
});

test('add makes a v2 entry: instructions, the kernel\'s schedule, the mode as the store\'s word, a name from the instructions',async()=>{
  const f=fakeStore();const facade=createAutomationFacade({projectRoot:'/p',dataRoot:'/d',repoRoot:'/r'},{loadAutomationStore:async()=>f.store as any});
  const row=await facade.add({instructions:'  check the build  ',when:'every 30m',folder:'C:/p'});
  assert.deepEqual(f.created[0],{nome:'check the build',istruzioni:'check the build',cartella:'C:/p',permessi:'Workspace write',coordinazione:false,pianificazione:{tipo:'ogni-n-minuti',minuti:30},origine:{tipo:'interfaccia'}});
  assert.equal(row.schedule,'every 30m');
  await facade.add({instructions:'x',when:'daily 08:00',folder:'C:/p',mode:'bypassPermissions',model:'zai:glm-5.3-flash',repeat:3,coordination:true,timezone:'UTC',name:'Named'});
  assert.deepEqual(f.created[1],{nome:'Named',istruzioni:'x',cartella:'C:/p',modello:'zai:glm-5.3-flash',permessi:'Full access',coordinazione:true,pianificazione:{tipo:'giornaliera',ora:'08:00'},fusoOrario:'UTC',ripeti:3,origine:{tipo:'interfaccia'}});
  await assert.rejects(facade.add({instructions:'   ',when:'every 30m',folder:'C:/p'}),{code:'AUTOMATION_INSTRUCTIONS_REQUIRED'});
  assert.equal(nameFromInstructions('a'.repeat(80)).length,60);
});

test('edit changes only what it is told; the old format refuses edit, history and run, and can be deleted',async()=>{
  const f=fakeStore();const facade=createAutomationFacade({projectRoot:'/p',dataRoot:'/d',repoRoot:'/r'},{loadAutomationStore:async()=>f.store as any});
  const edited=await facade.edit('v2',{when:'weekly fri 17:00',mode:'acceptEdits'});
  assert.equal(edited.schedule,'weekly fri 17:00');assert.equal(edited.mode,'acceptEdits');assert.equal(edited.instructions,'say hello');
  await assert.rejects(facade.edit('v2',{}),{code:'AUTOMATION_NOTHING_TO_CHANGE'});
  await assert.rejects(facade.edit('v1',{when:'every 30m'}),{code:'AUTOMATION_LEGACY'});
  await assert.rejects(facade.history('v1'),{code:'AUTOMATION_LEGACY'});
  await assert.rejects(facade.requireRunnable('v1'),{code:'AUTOMATION_LEGACY'});
  assert.deepEqual(await facade.remove('v1'),{ok:true,id:'v1'});
  await assert.rejects(facade.remove('v1'),{code:'AUTOMATION_NOT_FOUND'});
});

/* the 0.6.6 review's F4: an entry of the old format cannot be switched on (the CLI's scheduler would hand it to the kernel's v1
   path, which starts a catalog task the CLI does not have); switching it off stays possible */
test('the old format cannot be switched on; it can be switched off',async()=>{
  const f=fakeStore();const facade=createAutomationFacade({projectRoot:'/p',dataRoot:'/d',repoRoot:'/r'},{loadAutomationStore:async()=>f.store as any});
  await assert.rejects(facade.setEnabled('v1',true),{code:'AUTOMATION_LEGACY'});
  assert.equal((await f.store.leggi('v1')).attiva,false,'unchanged');
  assert.equal((await facade.setEnabled('v1',false)).active,false);
  assert.equal((await facade.setEnabled('v2',false)).active,false);assert.equal((await facade.setEnabled('v2',true)).active,true);
  await assert.rejects(facade.setEnabled('nope',true),{code:'AUTOMATION_NOT_FOUND'});
});
