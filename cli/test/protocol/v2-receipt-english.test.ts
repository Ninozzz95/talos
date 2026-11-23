/*
 * 0.6.15 — 0614b stress F-L-001 (S3, contract R12): three fresh `scrivi` calls in `--protocol v2` returned
 * `receipt.via="livello-su-richiesta"` and `receipt.details.postcondizione="retta"`. The receipt's machine values and keys are
 * English at the v2 boundary; the kernel's receipt, the model and v1 keep the kernel's words. The values are pinned against the
 * kernel source, so a value the kernel adds turns this test red instead of reaching v2 in Italian.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {RECEIPT_ALLOWED_BY_KIND,RECEIPT_POSTCONDITION,RECEIPT_VIA,REFUSAL_VIA} from '../../src/i18n/kernel-map.ts';
import {describeRefusal} from '../../src/i18n/error-view.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

const KERNEL=readFileSync(path.join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs'),'utf8');
const clock=()=>'2026-10-26T16:00:00.000Z';

/** The kernel's receipt for a written file, as the 0614b run saw it (talosHarness.mjs `creaRicevutaOperazione`). */
function writeResult(receipt:Record<string,unknown>){
  return{type:'ToolCallResult',_sequenza:1,messageId:'m-1',toolCallId:'call-1',content:'written',role:'tool',receipt:{
    schema_version:1,azione:'scrivi',percorso:'note.txt',comando:null,toolCallId:'call-1',consentito:true,via:'livello-su-richiesta',motivo:null,
    status:'succeeded',risk:'R1',trifecta:false,action:'write',requiredActions:['write'],hashContenuto:'ab12',postcondizione:'retta',verified:true,error:null,
    ...receipt,
  }};
}

test('F-L-001: a v2 tool receipt carries English values and keys, as the 0614b run asked',()=>{
  const event=createV2EventBridge('s-1',clock).translate(writeResult({}));
  const receipt=event?.data.receipt as any;
  assert.equal(receipt.via,'level-ask');
  assert.equal(receipt.details.postcondition,'held');
  assert.equal('postcondizione' in receipt.details,false);
  assert.deepEqual(receipt.details,{schema_version:1,tool:'scrivi',path:'note.txt',command:null,toolCallId:'call-1',trifecta:false,action:'write',
    requiredActions:['write'],contentHash:'ab12',postcondition:'held',verified:true,error:null});
});

test('F-L-001: every postcondition and every «allowed by» kind in English',()=>{
  for(const [kernel,english] of [['retta','held'],['smentita','contradicted'],['ignota','unknown'],['nessuna','none']]){
    const receipt=createV2EventBridge('s-1',clock).translate(writeResult({postcondizione:kernel}))?.data.receipt as any;
    assert.equal(receipt.details.postcondition,english,kernel);
  }
  for(const [kernel,english] of [['cartella','folder'],['percorso','path'],['rete','network'],['attrezzo','tool']]){
    const receipt=createV2EventBridge('s-1',clock).translate(writeResult({via:'nessun-vincolo',consentitoDa:{sessionId:'parent-1',tipo:kernel}}))?.data.receipt as any;
    assert.equal(receipt.via,'unrestricted');
    assert.deepEqual(receipt.details.allowedBy,{sessionId:'parent-1',kind:english},kernel);
  }
});

test('F-L-001: a value the map does not know passes as it is (never dropped, never invented)',()=>{
  const receipt=createV2EventBridge('s-1',clock).translate(writeResult({via:'via-futura',postcondizione:'futura'}))?.data.receipt as any;
  assert.equal(receipt.via,'via-futura');
  assert.equal(receipt.details.postcondition,'futura');
});

/** Every `via` the kernel writes on a permission outcome: the literal ones next to `consentito`, and the asked ones of `viaRichiesta`. */
function kernelVias(){
  const vias=new Set<string>();
  for(const match of KERNEL.matchAll(/consentito:\s*(?:true|false)[^}]*?via:\s*'([a-z-]+)'/gu))vias.add(match[1]!);
  /* K1 (Desktop 6d9cf7be1): the early refusals carry their own via (`{ via: '…', motivo }`, or passed on as `via: rifiuto.via`).
     Desktop review block 11 E-R2: the scanner read only one of the six, so it reads EVERY literal `via: '…'` of the kernel now,
     except the kinds of a network path, not permission vias: 'stringa', and 'cartella' since desktop 0.2.4 (4cc08aa10: talosHarness.mjs
     names it in the comment of posizioneNelProgetto; file-namespace-contract.mjs returns via 'stringa'|'cartella'|'collegamento';
     no receipt carries it, measured 20/11/2026) */
  const NETWORK_PATH_KINDS=new Set(['stringa','cartella']);
  for(const match of KERNEL.matchAll(/\bvia:\s*'([a-z][a-z-]*)'/gu))if(!NETWORK_PATH_KINDS.has(match[1]!))vias.add(match[1]!);
  const asked=/const viaRichiesta = ([^\n]+)/u.exec(KERNEL)?.[1]??'';
  for(const match of asked.matchAll(/'([a-z-]+)'/gu))vias.add(match[1]!);
  return vias;
}

test('F-L-001: every via the kernel writes has its English (pinned to talosHarness.mjs)',()=>{
  const vias=kernelVias();
  /* the measure can be wrong in the quiet way: these must be found, or the pattern no longer reads the kernel */
  for(const known of ['nessun-vincolo','livello-su-richiesta','modalita-piano','livello-ricerca','permesso-per-attrezzo-chiedi','fuori-dal-progetto','wsl-root'])
    assert.ok(vias.has(known),`the kernel scan missed ${known}`);
  const missing=[...vias].filter(via=>!Object.hasOwn(RECEIPT_VIA,via));
  assert.deepEqual(missing,[],'kernel vias with no English in kernel-map.ts RECEIPT_VIA');
  for(const english of Object.values(RECEIPT_VIA))assert.match(english,/^[a-z][a-z-]*$/u);
  assert.equal(new Set(Object.values(RECEIPT_VIA)).size,Object.keys(RECEIPT_VIA).length,'two kernel vias share one English value');
});

test('F-L-001: postcondition and «allowed by» kinds are the kernel\'s own',()=>{
  for(const value of ['retta','smentita','ignota'])assert.match(KERNEL,new RegExp(`esito: '${value}'`,'u'));
  assert.match(KERNEL,/postcondizione = 'nessuna'/u);
  assert.deepEqual(Object.keys(RECEIPT_POSTCONDITION).sort(),['ignota','nessuna','retta','smentita']);
  for(const kind of ['cartella','percorso','rete'])assert.match(KERNEL,new RegExp(`origineDelConsenso\\([^)]*'${kind}'\\)`,'u'));
  assert.match(KERNEL,/tipo: 'attrezzo'/u);
  assert.deepEqual(Object.keys(RECEIPT_ALLOWED_BY_KIND).sort(),['attrezzo','cartella','percorso','rete']);
});

test('F-L-001: a refusal reads the same by the kernel\'s via and by v2\'s English one (screen words unchanged)',()=>{
  for(const [kernel,kind] of Object.entries(REFUSAL_VIA).filter(([via])=>Object.hasOwn(RECEIPT_VIA,via))){
    const english=RECEIPT_VIA[kernel]!;
    assert.equal(REFUSAL_VIA[english],kind,kernel);
    assert.equal(describeRefusal({via:english,allowed:false}),describeRefusal({via:kernel,allowed:false}),kernel);
  }
});

test('0614b triage: run.started names the operating mode in English (no `modalitaOperativa: normale` in v2)',()=>{
  for(const [kernel,english] of [['normale','normal'],['piano','plan']]){
    const event=createV2EventBridge('s-1',clock).translate({type:'RunStarted',_sequenza:1,threadId:'s-1',runId:'r-1',input:{consegna:'hi'},contesto:{progetto:'p',permessi:'On request',modalitaOperativa:kernel}});
    const context=(event?.data as any).context;
    assert.equal(context.mode,english,kernel);
    assert.equal('modalitaOperativa' in context,false);
  }
});
