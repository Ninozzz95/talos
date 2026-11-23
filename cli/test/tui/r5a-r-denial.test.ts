/*
 * R5a lane R, S10 — gate finding 15 (the RED): a command denied by the POLICY was shown as the person's refusal, and the person
 * was never asked. Measured in the R5 research run (m3a frames 03-05): the model's `cmd /c for /L %i in (1,1,400) do @echo
 * output line %i` drew no dialog; the row read `Not run: you did not approve it.` and Ctrl+O added the kernel's Italian
 * `l'owner non ha approvato questa azione`. The policy's own answer was `deny · Decisive: unsupported shell composition`.
 *
 * The facts are built here from the real permission engine (security/permission-engine.ts) and the real adapter, with the
 * kernel's own receipt for that refusal (via `livello-su-richiesta`, talosHarness.mjs `verificaPermessoScrittura`). Lane S's
 * session controller calls `noteDenial` with `denialFromEngine(decision)` when the engine answers alone and `{by:'person'}`
 * when the person says no; this file proves what the adapter and the words then give.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as adapterModule from '../../src/tui/event-adapter.ts';
import * as errorView from '../../src/i18n/error-view.ts';
import * as kernelMap from '../../src/i18n/kernel-map.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {simulatePermission} from '../../src/security/permission-explanation.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

const KERNEL=readFileSync(path.join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs'),'utf8');
const FINDING_15='cmd /c for /L %i in (1,1,400) do @echo output line %i';
let seq=0;const durable=(row:Record<string,unknown>)=>({...row,_sequenza:++seq});
const denied=(toolCallId:string,via:string,motivo:string)=>durable({type:'ToolCallResult',toolCallId,content:'refused',receipt:{status:'denied',consentito:false,via,motivo}});
const denialFromEngine=(adapterModule as any).denialFromEngine as undefined|((decision:any,explain?:any)=>any);

async function engineDecision(command:string,rules={allow:[] as string[],ask:[] as string[],deny:[] as string[]}){
  const engine=createPermissionEngine({projectRoot:REPO_ROOT,rules,mode:'default'});
  return engine.decide({tool:'Bash',command} as any,{interactive:true,mode:'default'});
}
function refusedRow(adapter:any,toolCallId:string,via:string,motivo:string){
  const out=[durable({type:'ToolCallStart',toolCallId,toolCallName:'shell'}),denied(toolCallId,via,motivo)].flatMap(row=>adapter.translateAll(row));
  const completed=out.find((e:any)=>e.type==='tool.completed');const facts=out.find((e:any)=>e.type==='tool.facts')?.facts??null;
  return{completed,facts,words:errorView.describeRefusal({via:completed.result.receipt.via,allowed:false},facts?.denial??null)};
}

test('finding 15: a command the policy cannot split is refused by the POLICY, in English, and never as the person\'s "no"',async()=>{
  const decision:any=await engineDecision(FINDING_15);
  assert.deepEqual([decision.kind,decision.code,decision.message],['deny','PERMISSION_DENIED','unsupported shell composition'],'the engine answers alone: no dialog');
  const adapter:any=adapterModule.createTuiEventAdapter();adapter.bindSession('s1');
  adapter.noteDenial?.('call_for',denialFromEngine?.(decision)??null);
  const row=refusedRow(adapter,'call_for','livello-su-richiesta',"l'owner non ha approvato questa azione.");
  assert.deepEqual(row.facts?.denial,{by:'policy',reason:'TALOS cannot check this command part by part (unsupported shell composition), so it never runs it.'});
  assert.equal(row.words,'Not run: TALOS cannot check this command part by part (unsupported shell composition), so it never runs it.');
  assert.doesNotMatch(row.words,/you did not approve/u);
  assert.equal(row.completed.result.receipt.reason,'the approval request was answered no.','the kernel\'s Italian reason is English on the screen\'s copy');
  assert.equal(row.completed.outcome.permissionReason,'the approval request was answered no.');
});

test('a matched deny rule is named by its text; the person is named only for the person\'s own answer',async()=>{
  const rules={allow:[],ask:[],deny:['Bash(git push)']};
  const decision:any=await engineDecision('git push',rules);
  assert.equal(decision.message,'matched deny rule');
  const rule=()=>simulatePermission({rules,action:{tool:'Bash',command:'git push'} as any,projectRoot:REPO_ROOT}).explanation.rule??null;
  const adapter:any=adapterModule.createTuiEventAdapter();adapter.bindSession('s1');
  adapter.noteDenial?.('call_rule',denialFromEngine?.(decision,{rule,scope:()=>'project-user'})??null);
  adapter.noteDenial?.('call_person',{by:'person'});
  const byRule=refusedRow(adapter,'call_rule','livello-su-richiesta',"l'owner non ha approvato questa azione.");
  const byPerson=refusedRow(adapter,'call_person','livello-su-richiesta',"l'owner non ha approvato questa azione.");
  assert.deepEqual(byRule.facts?.denial,{by:'rule',rule:'Bash(git push)',scope:'project-user'});
  assert.equal(byRule.words,'Not run: denied by the rule Bash(git push) (project-user settings).');
  assert.deepEqual(byPerson.facts?.denial,{by:'person'});
  assert.equal(byPerson.words,'Not run: you did not approve it.');
});

test('plan mode, a mode that never asks and a path outside the project are the mode or the policy, in English',()=>{
  assert.ok(denialFromEngine,'denialFromEngine is exported by the event adapter');
  assert.deepEqual(denialFromEngine!({code:'PLAN_MODE_READ_ONLY',message:'Plan mode permits only read-only operations'}),{by:'mode',reason:'plan mode allows only read-only actions.'});
  assert.deepEqual(denialFromEngine!({code:'PERMISSION_REQUIRED',message:'Operation requires approval in non-interactive mode'}),{by:'mode',reason:'this mode never asks, and the action needs approval.'});
  assert.deepEqual(denialFromEngine!({code:'PATH_NOT_ALLOWED',message:'Operation targets a path outside the project'}),{by:'policy',reason:'the file is outside the project.'});
  assert.deepEqual(denialFromEngine!({code:'PERMISSION_DENIED',message:'segment 2: unsupported shell composition'}),{by:'policy',reason:'TALOS cannot check this command part by part (unsupported shell composition), so it never runs it.'});
});

test('a refusal the kernel decides from the session level is the mode, and says so in English, with no note',()=>{
  const adapter:any=adapterModule.createTuiEventAdapter();adapter.bindSession('s1');
  const readOnly=refusedRow(adapter,'call_ro','livello-lettura','la sessione è in sola lettura: nessuna scrittura, comando o documento è permesso in questo momento.');
  assert.deepEqual(readOnly.facts?.denial,{by:'mode',reason:'the session is read-only: no write, command or document is allowed right now.'});
  const toolOff=refusedRow(adapter,'call_off','permesso-per-attrezzo-nega','l\'attrezzo "scrivi" è disattivato per questa sessione (permesso per-attrezzo: nega).');
  assert.equal(toolOff.facts?.denial?.by,'mode');
  assert.doesNotMatch(toolOff.facts?.denial?.reason??'',/scrivi|attrezzo|sessione/u,'the kernel tool id is named in the screen\'s words');
  const asked=refusedRow(adapter,'call_asked','livello-su-richiesta',"l'owner non ha approvato questa azione.");
  assert.equal(asked.facts?.denial,undefined,'an "asked" via without a note is not decided here: only the controller knows who answered');
});

test('the kernel refusal sentences are pinned against the kernel source',()=>{
  /* K3 is merged (desktop, 03/10): the kernel writes the English sentences; the Italian rows stay `legacy` for saved sessions and carry no pin */
  const rows=(kernelMap as any).KERNEL_REFUSAL_REASONS_EN as Array<{fragment:string;id:string}>|undefined;
  assert.ok(rows&&rows.length>=9);
  for(const row of rows!)assert.ok(KERNEL.includes(row.fragment),`${row.id}: the kernel no longer writes ${JSON.stringify(row.fragment)}`);
  const italian=(kernelMap as any).KERNEL_REFUSAL_REASONS as Array<{fragment?:string;legacy?:boolean;id:string}>;
  assert.equal(italian.length,rows!.length,'every English reason keeps its Italian twin');
  for(const row of italian){assert.equal(row.legacy,true,row.id);assert.equal(row.fragment,undefined,`${row.id}: a legacy row is not pinned`);}
});

/* Desktop F4-03 (75108d7ee, merged over C-005 on 01/10): a write outside the session folder ASKS, via `fuori-dal-progetto`;
   a no without the answerer's reason carries a new Italian sentence, with the folder when the kernel measured one. */
const OUTSIDE_NOT_CONFIRMED="la scrittura fuori dalla cartella della sessione non è stata confermata (\"D:/work/shared\"). Non riprovare fuori: scrivi dentro il progetto, o chiedi alla persona cosa preferisce.";
test('F4-03: a write outside the project that was not confirmed is an asked refusal, worded in English',()=>{
  assert.equal((kernelMap as any).REFUSAL_VIA['fuori-dal-progetto'],'notApproved','the new asked via words like the other asked vias');
  assert.equal(errorView.describeRefusal({via:'fuori-dal-progetto',allowed:false}),errorView.describeRefusal({via:'livello-su-richiesta',allowed:false}));
  assert.equal(errorView.describeKernelRefusalReason(OUTSIDE_NOT_CONFIRMED),'writing outside the session folder (D:/work/shared) was not confirmed; write inside the project, or ask what to do.');
  const bare=OUTSIDE_NOT_CONFIRMED.replace(' ("D:/work/shared")','');
  assert.equal(errorView.describeKernelRefusalReason(bare),'writing outside the session folder was not confirmed; write inside the project, or ask what to do.');
});

test('K1 (Desktop 6d9cf7be1): the kernel\'s early refusals read short and in the CLI\'s words, never the model\'s long sentence',()=>{
  const adapter:any=adapterModule.createTuiEventAdapter();adapter.bindSession('s1');
  const long='REFUSED. Nothing was written: "C:/p/sub/x.txt" is inside a folder the person blocked for the device that sent this turn (C:/p/sub).';
  const cases:Array<[string,string]>=[
    ['cartella-bloccata','Not run: the folder is blocked for the device that sent this turn.'],
    ['percorso-nt','Not run: opening that path could send your Windows credentials to another computer.'],
    ['rete-senza-conferma','Not run: a network path needs your yes, and no one could give it.'],
    ['credenziale-della-casa','Not run: that file holds a credential of this computer.'],
    ['rete-negata','Not run: you did not approve it.'],
    /* Desktop fix/bloccate-casa-linux (27/10): three more early refusals of `scrivi` */
    ['modalita-sconosciuta','Not run: the write asked for a mode TALOS does not know.'],
    ['testo-su-binario','Not run: that file is binary, and TALOS does not write text over it.'],
    ['sovrascrittura-non-letta','Not run: the file was never read in this session, so TALOS does not overwrite it.'],
  ];
  for(const [via,words] of cases){
    const row=refusedRow(adapter,`call_${via}`,via,long);
    assert.equal(row.words,words,via);
    assert.doesNotMatch(row.words,/REFUSED|Nothing was written/u,via);
  }
});
