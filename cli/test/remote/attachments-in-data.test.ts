/* The owner's decisions 43 and 47 (03/11): a device's attachments live in TALOS's data, beside the sessions, never in the project. With the old
   upload route gone, the CLI's handler and remote host must carry the kernel's archive, or a device on this window can attach nothing. */
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createRemoteHost} from '../../src/remote/host.ts';
import {cliHttpDeps} from '../../src/remote/http-deps.ts';
import {createMemoryKeyring} from '../../src/provider/store.ts';

const REPO=fileURLToPath(new URL('../../../',import.meta.url));
const dir=(t:any)=>{const d=mkdtempSync(join(tmpdir(),'talos-cli-attach-'));t.after(()=>rmSync(d,{recursive:true,force:true,maxRetries:5}));return d;};
async function*bytes(text:string){yield new TextEncoder().encode(text);}

test('with the sessions folder the handler gets the kernel\'s archive, and a file goes to <sessions>/allegati, not the project',async t=>{
  const sessionsRoot=join(dir(t),'sessions');
  const deps:any=await cliHttpDeps({repoRoot:REPO,context:{registry:{}},sessionsRoot});
  assert.equal(deps.archivioAllegati?.disponibile,true);
  const receipt=await deps.archivioAllegati.salva({nome:'note.txt',source:bytes('hello'),previsti:5});
  assert.match(receipt.percorso,/^attachments\/[0-9a-f]{24}\/note\.txt$/u,'the model gets the short name, never the PC\'s path');
  const where=deps.archivioAllegati.percorsoDi(receipt.allegatoId);
  assert.ok(String(where).startsWith(join(sessionsRoot,'allegati')),String(where));
  assert.equal(readFileSync(where,'utf8'),'hello');
  assert.equal((await cliHttpDeps({repoRoot:REPO,context:{registry:{}},sessionsRoot})).archivioAllegati,deps.archivioAllegati,'one archive per folder in this process');
});

test('on the contrary: without the sessions folder no archive, as before',async()=>{
  assert.equal('archivioAllegati' in await cliHttpDeps({repoRoot:REPO,context:{registry:{}}}),false);
});

test('the remote host gives the kernel\'s remote module the same archive and says the device may send files to TALOS\'s data',async t=>{
  const dataRoot=dir(t);let given:any={};
  const archive={disponibile:true};
  const fake:Record<string,any>={
    'http-app.mjs':{createHttpApp:(deps:any)=>{given.http=deps;return()=>{};}},
    'remoto/index.mjs':{creaRemoto:(options:any)=>{given.remote=options;return{ferma:async()=>{}};}},
    'remoto/chiamata-interna.mjs':{creaChiamataInterna:()=>async()=>({stato:200,dati:{}})},
    'iscrizione-sessione.mjs':{iscriviConRigiocata:()=>{}},
  };
  const host=await createRemoteHost({repoRoot:'R',dataRoot,registry:{},keyring:createMemoryKeyring(`attach-${process.pid}`),pcName:'DESK',httpDeps:{archivioAllegati:archive},importModule:async(file:string)=>fake[file],loadBinding:async()=>({binding:true})} as any);
  assert.equal(given.http.archivioAllegati,archive);
  assert.equal(given.remote.archivioAllegati,archive);
  assert.deepEqual(given.remote.capacita,['allegati-nei-dati']);
  assert.equal(existsSync(join(dataRoot,'sessions','allegati')),false,'building the host writes nothing');
  await host.stop();
});
