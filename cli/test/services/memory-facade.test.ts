import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createMemoryFacade} from '../../src/services/memory-facade.ts';

const persisted={
  id:'m-1',
  titolo:'Alpha',
  contenuto:'Remember the stable fact',
  genere:'preference',
  origine:'persona',
  creataAlle:'2026-09-21T10:00:00.000Z',
  aggiornataAlle:'2026-09-21T10:00:00.000Z'
};

function publicShape(row:any){
  return{
    id:row.id,
    titolo:row.titolo,
    contenuto:row.contenuto,
    genere:row.genere,
    creataAlle:row.creataAlle??null,
    aggiornataAlle:row.aggiornataAlle??null,
    origine:row.origine==='persona'||row.origine==='modello'?row.origine:'modello'
  };
}

function store(extra:any={}){
  const calls:string[]=[];
  const api:any={
    formaPubblicaMemoria:publicShape,
    elencaMemorie:async()=>[persisted],
    cercaMemorie:(rows:any[],{query,limit=5}:any)=>{
      const q=String(query).toLowerCase();
      const found=rows.filter(row=>row.titolo.toLowerCase().includes(q)||row.contenuto.toLowerCase().includes(q));
      return{memorie:found.slice(0,limit),totale:found.length};
    },
    creaMemoria:async(input:any)=>{calls.push('create');return{voce:{...persisted,...input,id:'m-created'},duplicato:false};},
    aggiornaMemoria:async(input:any)=>{calls.push('update');return{...persisted,...input};},
    eliminaMemoria:async()=>{calls.push('delete');}
  };
  Object.assign(api,extra);
  return{calls,api};
}

function facade(s:any){
  return createMemoryFacade(
    {repoRoot:'/repo',memoryRoot:'/data/memory'},
    {loadStore:async()=>s.api} as any
  );
}

test('M9-A RED — passive Memory facade list is non-mutating and exposes persisted provenance plus honest unavailable metrics',async()=>{
  const s=store();
  const snapshot=await facade(s).list();
  assert.equal(snapshot.state,'ready');
  assert.deepEqual(s.calls,[]);
  assert.equal(snapshot.scope.kind,'global');
  assert.equal(snapshot.scope.evidence,'derived-store-contract');
  assert.equal(snapshot.scope.projectId,null);
  assert.equal(snapshot.scope.sessionId,null);
  assert.equal(snapshot.rows[0]?.id,'m-1');
  assert.equal(snapshot.rows[0]?.provenance.writer,'persona');
  assert.equal(snapshot.rows[0]?.provenance.writerEvidence,'persisted');
  assert.equal(snapshot.rows[0]?.provenance.source,null);
  assert.equal(snapshot.rows[0]?.usage.status,'unavailable');
  assert.equal(snapshot.rows[0]?.cost.status,'unavailable');
});

test('M9-A RED — legacy missing writer is explicit derived store-default, never fabricated persisted provenance',async()=>{
  const s=store({elencaMemorie:async()=>[{...persisted,origine:undefined}]});
  const row=(await facade(s).list()).rows[0]!;
  assert.equal(row.provenance.writer,'modello');
  assert.equal(row.provenance.writerEvidence,'derived-legacy-default');
});

test('M9-A RED — stable ids and global cross-project semantics are preserved without path-derived ownership',async()=>{
  const s=store();
  const row=(await facade(s).list()).rows[0]!;
  assert.equal(row.id,'m-1');
  assert.equal(row.provenance.scope,'global');
  assert.equal(row.provenance.projectId,null);
  assert.equal(row.provenance.sessionId,null);
  assert.equal(row.provenance.source,null);
  assert.equal(JSON.stringify(row).includes('/data/memory'),false);
});

test('M9-A RED — duplicate policy states exact create-only title normalization and no semantic merge claim',async()=>{
  const s=store();
  const row=(await facade(s).list()).rows[0]!;
  assert.equal(row.duplicateControl.mode,'create-title-normalized');
  assert.equal(row.duplicateControl.normalization,'trim-lowercase');
  assert.equal(row.duplicateControl.onCreateDuplicate,'return-existing-no-write');
  assert.equal(row.duplicateControl.onUpdate,'not-checked');
  assert.equal(row.duplicateControl.semanticDetection,false);
  assert.equal(row.duplicateControl.merge,false);
});

test('M9-A RED — add projects the authoritative create duplicate decision without silently updating or merging',async()=>{
  const existing={...persisted,contenuto:'old'};
  const s=store();
  s.api.creaMemoria=async()=>{s.calls.push('create');return{voce:existing,duplicato:true};};
  s.api.aggiornaMemoria=async()=>{s.calls.push('update');return existing;};
  const result=await facade(s).add({title:' alpha ',content:'new',kind:'project_fact'});
  assert.equal(result.duplicateDecision,'existing-title-no-write');
  assert.equal(result.memory.id,'m-1');
  assert.equal(result.memory.content,'old');
  assert.deepEqual(s.calls,['create']);
});

test('M9-A RED — nonduplicate add and update report their real bounded duplicate semantics',async()=>{
  const s=store();
  const created=await facade(s).add({title:'Different title',content:'Body',kind:'preference'});
  assert.equal(created.duplicateDecision,'created');
  const updated=await facade(s).update('m-1',{title:'Another title'});
  assert.equal(updated.duplicateDecision,'not-checked-on-update');
  assert.deepEqual(s.calls,['create','update']);
});

test('M9-A RED — search uses authoritative store search but returns the same owner-facing Memory DTO',async()=>{
  const s=store();
  const result=await facade(s).search('alpha',5);
  assert.equal(result.state,'ready');
  assert.equal(result.total,1);
  assert.equal(result.rows[0]?.id,'m-1');
  assert.equal(result.rows[0]?.provenance.writer,'persona');
  assert.equal(result.rows[0]?.usage.status,'unavailable');
  assert.equal(result.rows[0]?.cost.status,'unavailable');
});

test('M9-A RED — malformed/list failure is visible and fail-closed rather than guessed into rows',async()=>{
  const s=store({elencaMemorie:async()=>{throw new TypeError('malformed persisted memory row');}});
  const snapshot=await facade(s).list();
  assert.equal(snapshot.state,'invalid');
  assert.deepEqual(snapshot.rows,[]);
  assert.equal(snapshot.error?.code,'MEMORY_STORE_INVALID');
  assert.match(snapshot.error?.message??'',/malformed persisted memory row/u);
});

test('M9-A RED — CLI memory operations are routed through the typed facade rather than direct store imports',async()=>{
  const source=await readFile(new URL('../../src/commands/services-cli.ts',import.meta.url),'utf8');
  assert.match(source,/createMemoryFacade/u);
  const start=source.indexOf('export async function runMemoryCommand');
  assert.ok(start>=0);
  const end=source.indexOf('export async function runLibraryCommand',start);
  const body=source.slice(start,end>=0?end:undefined);
  assert.doesNotMatch(body,/importTalosModule\([^)]*memory-store\.mjs/u);
  for(const method of ['list','search','add','update','delete'])assert.match(body,new RegExp('memory\\.'+method+'\\(','u'));
});
