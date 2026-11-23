/*
 * 0.6.15, review block 3 of the Desktop (26/10/2026, MEDIUM on 1629d4827): after «run.started and approvals in English» the v2 still
 * carried Italian keys — `run.started.context` (`cartellaBase`, `pianoConAttrezzo`) and the approval's action (`fuoriDalProgetto`,
 * `contenutoSospetto`, `coordinazione`, `wslRoot`, `percorsoDiRete`, `sensitive.contenuto`). The events below are the reviewer's,
 * the shapes the kernel emits (talosHarness.mjs :10622, :11041-11044, :12242, :12505; agent-service.mjs :769-781; path-policy.mjs
 * :342; confine-dati.mjs `luogoDellaFonte`). And the reader that decides the network question in the TUI reads the English names
 * (security/from-approval.ts): renamed on one side only, the network question would turn into a plain one, silently.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';

const clock=()=>'2026-10-26T18:00:00.000Z';
const RUN_STARTED={type:'RunStarted',_sequenza:1,threadId:'s-1',runId:'r-1',input:{consegna:'hi'},contesto:{progetto:'p',cartella:'C:\\p',
  modello:'m',permessi:'On request',modalitaOperativa:'piano',cartellaBase:'C:\\p\\chat',pianoConAttrezzo:true}};
const WRITE_APPROVAL={type:'ApprovalRequested',_sequenza:2,requestId:'q1',azione:{tipo:'scrivi',toolCallId:'c3',percorso:'..\\out.txt',contenutoPrima:'a\n',contenutoProposto:'b\n',
  fuoriDalProgetto:{cartella:'C:\\out'},segreto:{classe:'segreto',percorso:'~/.ssh/id_rsa',contenuto:true,credenzialeDellaCasa:true},
  contenutoSospetto:{fonte:'naviga https://example.com',motivi:['hidden_instructions'],luogo:{tipo:'pagina'}},coordinazione:{motivo:'tetto'}}};
const SHELL_APPROVAL={type:'ApprovalRequested',_sequenza:3,requestId:'q2',azione:{tipo:'shell',toolCallId:'c4',comando:'dir \\\\srv\\x',
  percorsoDiRete:{ospite:'srv',via:'stringa',ambito:'sessione',frase:'…',fraseChiave:'server.approval.network.sessionFolder',fraseParams:{ospite:'srv'}},
  wslRoot:{distro:'Ubuntu',utente:'root',frase:'…',fraseChiave:'server.approval.wslRoot.user',fraseParams:{linux:'Ubuntu',utente:'root'}}}};
const ITALIAN_KEYS=new Set(['cartellaBase','pianoConAttrezzo','fuoriDalProgetto','contenutoSospetto','coordinazione','percorsoDiRete','ospite','frase',
  'fraseChiave','fraseParams','ambito','utente','fonte','motivi','luogo','tipo','nome','motivo','contenuto','credenzialeDellaCasa','cartella','contenutoPrima',
  'contenutoProposto','modalitaOperativa','segreto','classe','percorso','comando','azione','contesto','progetto','modello','permessi']);
function keysOf(value:unknown,out:string[]=[]):string[]{
  if(Array.isArray(value)){for(const item of value)keysOf(item,out);return out;}
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){out.push(key);keysOf(item,out);}
  return out;
}
const translate=(raw:Record<string,unknown>)=>createV2EventBridge('s-1',clock).translate(structuredClone(raw))?.data as any;

test('no Italian key left in run.started and in the two approvals (the shapes the kernel emits)',()=>{
  for(const raw of [RUN_STARTED,WRITE_APPROVAL,SHELL_APPROVAL]){
    const left=keysOf(translate(raw)).filter(key=>ITALIAN_KEYS.has(key));
    assert.deepEqual(left,[],`${raw.type}#${raw._sequenza}`);
  }
});

test('the values in English too, the things a consumer branches on',()=>{
  const context=translate(RUN_STARTED).context;
  assert.equal(context.baseFolder,'C:\\p\\chat');assert.equal(context.planWithTool,true);assert.equal(context.mode,'plan');
  const write=translate(WRITE_APPROVAL).action;
  assert.deepEqual(write.outsideProject,{folder:'C:\\out'});
  assert.deepEqual(write.suspiciousContent,{source:'naviga https://example.com',reasons:['hidden_instructions'],place:{type:'page'}});
  assert.deepEqual(write.coordination,{reason:'cap'});
  assert.deepEqual(write.sensitive,{class:'secret',path:'~/.ssh/id_rsa',content:true,homeCredential:true});
  const shell=translate(SHELL_APPROVAL).action;
  assert.deepEqual(shell.networkPath,{host:'srv',via:'string',scope:'session',sentence:'…',sentenceKey:'server.approval.network.sessionFolder',sentenceParams:{host:'srv'}});
  assert.deepEqual(shell.wslRoot,{distro:'Ubuntu',user:'root',sentence:'…',sentenceKey:'server.approval.wslRoot.user',sentenceParams:{linux:'Ubuntu',user:'root'}});
});

test('the TUI decides the network question from the v2 action as from the kernel\'s (same action, same scope)',()=>{
  const fromKernel=permissionActionFromApproval(SHELL_APPROVAL as any);
  const fromV2=permissionActionFromApproval(translate(SHELL_APPROVAL));
  assert.equal(fromKernel.sensitive,'network');
  assert.deepEqual(fromV2.network,{host:'srv',via:'string',scope:'session'});
  assert.equal(fromV2.sensitive,'network');
  assert.equal(fromV2.network?.host,fromKernel.network?.host);
  assert.equal(fromV2.network?.scope,fromKernel.network?.scope);
  /* and the computer's own credential (sensitive.homeCredential) */
  assert.equal(permissionActionFromApproval(translate(WRITE_APPROVAL)).homeCredential,true);
});
