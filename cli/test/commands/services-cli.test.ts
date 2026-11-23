import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runNotesCommand,runTasksCommand,runMemoryCommand,runLibraryCommand,runForgeCommand} from '../../src/commands/services-cli.ts';

async function fakeRepo(){
  const root=await mkdtemp(join(tmpdir(),'talos-cli-services-'));
  const src=join(root,'harness-ui','src');
  await mkdir(src,{recursive:true});
  await writeFile(join(src,'notes-store.mjs'),`
    export async function elencaNote(){return [{id:'n1'}]}
    export async function creaNota(x){return {id:'n2',...x}}
    export async function aggiornaNota(x){return {updated:true,...x}}
    export async function eliminaNota(x){globalThis.__notesDeleted=x}
  `);
  await writeFile(join(src,'tasks-store.mjs'),`
    export async function elencaAttivita(){return [{id:'t1'}]}
    export async function creaAttivita(x){return {id:'t2',...x}}
    export async function aggiornaAttivita(x){return {updated:true,...x}}
    export async function completaAttivita(x){return {completed:true,...x}}
    export async function eliminaAttivita(x){globalThis.__tasksDeleted=x}
  `);
  await writeFile(join(src,'memory-store.mjs'),`
    export async function elencaMemorie(){return [{id:'m1',titolo:'Alpha',contenuto:'beta'},{id:'m2',titolo:'Gamma',contenuto:'delta alpha'}]}
    export function cercaMemorie(memorie,{query,limit=5}={}){const q=String(query).toLowerCase();const all=memorie.filter(m=>m.titolo.toLowerCase().includes(q)||m.contenuto.toLowerCase().includes(q));return {memorie:all.slice(0,limit),totale:all.length}}
    export async function creaMemoria(x){return {voce:{id:'m3',...x},duplicato:false}}
    export async function aggiornaMemoria(x){return {updated:true,...x}}
    export async function eliminaMemoria(x){globalThis.__memoryDeleted=x}
  `);
  await writeFile(join(src,'library-store.mjs'),`
    export const CARTELLA_LIBRERIA='.harness-ui-library';
    export async function elencaVoci(){if(globalThis.__listFails)throw new Error('lib-x: meta.json unreadable');return [{id:'l1',nome:'invoice.md',mediaType:'text/markdown'},{id:'img1',nome:'photo.png',mediaType:'image/png'}]}
    export async function elencaVociConTesto(){return [{id:'l1',nome:'invoice.md',testoEstratto:'fattura alpha'},{id:'l2',nome:'notes.md',testoEstratto:'alpha'}]}
    export function cercaVoci(voci,{query,limit=5,offset=0}={}){const q=String(query).toLowerCase();const all=voci.filter(v=>v.nome.toLowerCase().includes(q)||v.testoEstratto.toLowerCase().includes(q));return {pagina:all.slice(offset,offset+limit),totale:all.length}}
    export async function leggiVoce({id}){return {id,nome:'invoice.md'}}
    export async function salvaVoce(){return 'l3'}
    export async function leggiBytesVoce({id}){return {bytes:Buffer.from('bytes'),nome:id+'.md',mediaType:'text/markdown'}}
    export async function rinominaVoce({id,nome}){return {id,nomeDopo:nome}}
    export async function eliminaVoce({id}){return {ok:true,id}}
    export async function elencaVersioni({id}){return id==='l1'?[{n:1,creataIl:'2026-10-24T10:00:00.000Z'},{n:2,creataIl:'2026-10-24T11:00:00.000Z',modello:'m'}]:null}
    export async function ripristinaVersione({id,n}){globalThis.__restored={id,n};return id==='l1'&&n<=2?{id,versione:3,totale:3,nome:'invoice.md'}:null}
  `);
  await writeFile(join(src,'tool-forge-store.mjs'),`
    export async function elencaToolForgiati(){return [{id:'f1',abilitato:false}]}
    export async function abilitaToolForgiato(x){return {...x}}
  `);
  return root;
}

function ctx(repoRoot:string,projectRoot:string){
  const out:string[]=[];
  return {out,ctx:{
    invocation:{outputFormat:'json'} as any,
    io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot,
    paths:{dataRoot:join(projectRoot,'.data')} as any,
    repoRoot,
    createRuntimeContext:async()=>({})
  } as any};
}

function lastJson(out:string[]){return JSON.parse(out.at(-1)??'null');}

test('notes and tasks CLI map arguments to the real TALOS store shape',async()=>{
  const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);
  await runNotesCommand(x.ctx,['add','Title','Body']);
  assert.equal(lastJson(x.out).title,'Title');assert.equal(lastJson(x.out).content,'Body');assert.equal(lastJson(x.out).origine,'persona');
  await runTasksCommand(x.ctx,['add','Task','Details','--priority','high']);
  assert.equal(lastJson(x.out).title,'Task');assert.equal(lastJson(x.out).description,'Details');assert.equal(lastJson(x.out).priority,'high');
  await runTasksCommand(x.ctx,['complete','t1','doing']);
  assert.equal(lastJson(x.out).status,'doing');
});

test('memory search first loads memories then calls TALOS pure search helper',async()=>{
  const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);
  assert.equal(await runMemoryCommand(x.ctx,['search','alpha']),0);
  assert.deepEqual(lastJson(x.out),{memorie:[{id:'m1',titolo:'Alpha',contenuto:'beta'},{id:'m2',titolo:'Gamma',contenuto:'delta alpha'}],totale:2});
});

test('library search uses TALOS extracted-text index and ranked search helper',async()=>{
  const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);
  assert.equal(await runLibraryCommand(x.ctx,['search','fattura']),0);
  assert.deepEqual(lastJson(x.out),{pagina:[{id:'l1',nome:'invoice.md',testoEstratto:'fattura alpha'}],totale:1});
});

/* 0.6.14 (owner 24/10/2026): `talos library` shows the versions of an entry and restores one as a NEW version (the history stays) */
test('library versions and restore use the store\'s own version functions; a restore is a new version',async()=>{
  const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);
  assert.equal(await runLibraryCommand(x.ctx,['versions','l1']),0);
  assert.deepEqual(lastJson(x.out).map((v:any)=>v.n),[1,2]);
  assert.equal(await runLibraryCommand(x.ctx,['restore','l1','1']),0);
  assert.deepEqual((globalThis as any).__restored,{id:'l1',n:1});
  assert.deepEqual(lastJson(x.out),{id:'l1',versione:3,totale:3,nome:'invoice.md'});
  await assert.rejects(runLibraryCommand(x.ctx,['versions','nope']),{code:'LIBRARY_NOT_FOUND'});
  await assert.rejects(runLibraryCommand(x.ctx,['restore','l1','9']),{code:'LIBRARY_NOT_FOUND'});
  for(const bad of ['0','-1','1.5','two'])await assert.rejects(runLibraryCommand(x.ctx,['restore','l1',bad]),{code:'LIBRARY_VERSION_INVALID'},bad);
  await assert.rejects(runLibraryCommand(x.ctx,['restore','l1']),{code:'VERSION_REQUIRED'});
  /* review 1 of 0.6.14 (A-4): an extra word changes nothing; an image has no versions, said first */
  (globalThis as any).__restored=null;
  await assert.rejects(runLibraryCommand(x.ctx,['restore','l1','1','extra']),{code:'LIBRARY_EXTRA_ARGUMENT'});
  assert.equal((globalThis as any).__restored,null,'nothing was restored');
  await assert.rejects(runLibraryCommand(x.ctx,['versions','l1','more']),{code:'LIBRARY_EXTRA_ARGUMENT'});
  await assert.rejects(runLibraryCommand(x.ctx,['versions','img1']),{code:'LIBRARY_IMAGE_NO_VERSIONS'});
  await assert.rejects(runLibraryCommand(x.ctx,['restore','img1','1']),{code:'LIBRARY_IMAGE_NO_VERSIONS'});
  /* review 2 of 0.6.14 (A2-2): the store's ids are case-insensitive, so an uppercase id is still the image */
  await assert.rejects(runLibraryCommand(x.ctx,['versions','IMG1']),{code:'LIBRARY_IMAGE_NO_VERSIONS'});
  /* A2-1: a listing that fails (another entry's broken meta.json) does not block this entry's versions */
  (globalThis as any).__listFails=true;
  try{assert.equal(await runLibraryCommand(x.ctx,['versions','l1']),0);}finally{(globalThis as any).__listFails=false;}
});

test('forge list/enable/disable/inspect map to TALOS forge store',async()=>{
  const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);
  await runForgeCommand(x.ctx,['list']);assert.equal(lastJson(x.out)[0].id,'f1');
  await runForgeCommand(x.ctx,['enable','f1']);assert.equal(lastJson(x.out).abilitato,true);
  await runForgeCommand(x.ctx,['inspect','f1']);assert.equal(lastJson(x.out).id,'f1');
});


test('M10-C RED — Forge CLI exposes validate scan simulate install versions rollback and keeps activation owner/session scoped',async()=>{
  const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../../src/commands/services-cli.ts',import.meta.url),'utf8');
  const start=source.indexOf('export async function runForgeCommand');assert.ok(start>=0);const block=source.slice(start);
  assert.match(block,/createForgeFacade/u);
  for(const token of ['validate','scan','simulate','install','versions','rollback','enable','disable'])assert.match(block,new RegExp("\\b"+token+"\\b",'u'));
  assert.match(block,/--session/u);assert.doesNotMatch(block,/installaToolForgiato\s*\(/u,'CLI must not reuse the model create-only installer as an update channel');
});


test('M10-C hardening RED — Forge install accepts --session before the package path like other order-independent CLI options',async()=>{
  const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../../src/commands/services-cli.ts',import.meta.url),'utf8');
  const start=source.indexOf("else if(op==='install')");assert.ok(start>=0);const block=source.slice(start,source.indexOf("else if(op==='versions')",start));
  assert.ok(block.indexOf("takeOption(a,'--session')")<block.indexOf('packageFrom()'),'--session must be removed before consuming the positional package file');
});
