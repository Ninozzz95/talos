import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionMetadataStore,sessionMetadataRoot} from '../../src/sessions/metadata-store.ts';
import {createSessionPickerModel,filterSessions} from '../../src/tui/overlays/session-picker.ts';

test('M6-B picker merges the shared metadata store, searches tags and orders pinned sessions first',async(t)=>{
  const base=await mkdtemp(join(tmpdir(),'talos-session-picker-meta-'));t.after(()=>rm(base,{recursive:true,force:true}));
  const metadataRoot=sessionMetadataRoot(base);const store=createSessionMetadataStore({rootDir:metadataRoot});
  await store.addTag('older','urgent');await store.setPinned('older',true);await store.addTag('newer','later');
  const controller:any={listSessions:async()=>[
    {id:'older',sessionId:'older',name:'Older',project:'talos',path:null,model:null,parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:'2026-09-20T09:00:00Z',updatedAt:'2026-09-20T09:00:00Z',endedAt:null,outcome:'completed',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null},
    {id:'newer',sessionId:'newer',name:'Newer',project:'talos',path:null,model:null,parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:'2026-09-20T10:00:00Z',updatedAt:'2026-09-20T10:00:00Z',endedAt:null,outcome:'completed',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null},
  ],resumeSession:async(id:string)=>id,forkSession:async(id:string)=>id};
  const picker=createSessionPickerModel(controller,'resume',{metadataRoot});await picker.open();
  assert.deepEqual(picker.rows().map(row=>row.id),['older','newer']);
  assert.equal(picker.rows()[0]?.pinned,true);assert.deepEqual(picker.rows()[0]?.tags,['urgent']);
  picker.setQuery('urgent');assert.deepEqual(picker.rows().map(row=>row.id),['older']);
  assert.equal(filterSessions([{...picker.rows()[0]!,tags:['alpha'],pinned:true}] as any,'alpha').length,1);
});

test('M6-B visible app uses picker metadata for filtering/rendering and passes the shared metadata location',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/sessionMetadataRoot\(paths\.dataRoot\)/u);
  assert.match(source,/filterSessions\(sessionRows,pickerQuery\)/u);
  /* R1 (Q-R1-3): the picker rows (pin star, tags) are drawn by lane O's fitted builder in session-picker.ts; app.ts calls it. */
  assert.match(source,/sessionPickerOverlay\(/u);
  const picker=await readFile(new URL('../../src/tui/overlays/session-picker.ts',import.meta.url),'utf8');
  assert.match(picker,/row\.pinned/u);
  assert.match(picker,/row\.tags/u);
});

test('M6-B shared registry exposes only the existing project label on elenca rows, never the workspace path',async()=>{
  const source=await readFile(new URL('../../../harness-ui/src/session-registry.mjs',import.meta.url),'utf8');
  const start=source.indexOf('    elenca() {');const end=source.indexOf('    cartellePiuUsate()',start);
  assert.ok(start>=0&&end>start);const block=source.slice(start,end);
  assert.match(block,/progetto\s*:/u);assert.match(block,/voce\.task(?:\?\.)?\.progetto|voce\.task\?\.progetto/u);
  /* block 21 (list contract 31/10, agreed by the sessions): the row says where it works through cartellaDellaRiga, a description
     of the folder and never its path; the raw folder fields stay out */
  assert.doesNotMatch(block,/^\s*cartella\s*:\s*voce\./mu);assert.doesNotMatch(block,/^\s*cartellaBase\s*:/mu);
  const row=source.slice(source.indexOf('  function cartellaDellaRiga('),source.indexOf('  function statisticheFiglio('));
  assert.match(row,/nota\?\.presente \? nota\.valore : null/u);assert.doesNotMatch(row,/percorsoDellaVoce\(voce\)\s*;?\s*\}/u,'the row never returns the path itself');
});
