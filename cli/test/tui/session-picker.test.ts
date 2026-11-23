import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionPickerModel,filterSessions,normalizeSessions} from '../../src/tui/overlays/session-picker.ts';

test('session picker searches id title project and path',()=>{
  const rows=[{id:'s1',title:'Refactor TUI',project:'talos',path:'/repo/talos',updatedAt:'2026-09-14',model:'openai:gpt-5-mini'}];
  for(const q of ['s1','refactor','talos','/repo'])assert.equal(filterSessions(rows,q).length,1);
});

test('session normalization sorts timestamped sessions newest first and accepts runtime field names',()=>{
  const rows=normalizeSessions([{sessionId:'old',titolo:'Old',avviataAlle:'2026-01-01',modello:'m1'},{sessionId:'new',nome:'New',aggiornataAlle:'2026-02-01',model:'m2'}]);
  assert.deepEqual(rows.map(x=>x.id),['new','old']);assert.equal(rows[0]?.title,'New');assert.equal(rows[1]?.model,'m1');
});

test('picker does not mutate active session until Enter confirms selected action',async()=>{
  const resumeCalls:string[]=[];
  const controller:any={listSessions:async()=>[{id:'s1',title:'One',project:'p',path:'/p',updatedAt:null,model:null}],resumeSession:async(id:string)=>{resumeCalls.push(id);return id;},forkSession:async()=>''};
  const model=createSessionPickerModel(controller,'resume');
  await model.open();model.move('down');assert.equal(resumeCalls.length,0);await model.confirm();assert.equal(resumeCalls.length,1);
});

test('cancel leaves the active session untouched',async()=>{
  let forks=0;const controller:any={listSessions:async()=>[{id:'s1',title:'One',project:'p',path:'/p',updatedAt:null,model:null}],resumeSession:async()=>'',forkSession:async()=>{forks++;return'';}};
  const model=createSessionPickerModel(controller,'fork');await model.open();model.cancel();assert.equal(forks,0);
});


test('picker can select an absolute filtered row before confirm',async()=>{
  const resumeCalls:string[]=[];
  const controller:any={listSessions:async()=>[
    {id:'s1',title:'One',project:'p',path:'/p/1',updatedAt:'2026-09-14T10:00:00Z',model:null},
    {id:'s2',title:'Two',project:'p',path:'/p/2',updatedAt:'2026-09-14T11:00:00Z',model:null},
    {id:'s3',title:'Three',project:'p',path:'/p/3',updatedAt:'2026-09-14T12:00:00Z',model:null},
  ],resumeSession:async(id:string)=>{resumeCalls.push(id);return id;},forkSession:async()=>''};
  const model=createSessionPickerModel(controller,'resume');
  await model.open();model.select(2);await model.confirm();
  assert.deepEqual(resumeCalls,['s3']);
});
