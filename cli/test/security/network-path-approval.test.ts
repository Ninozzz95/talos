/*
 * Desktop network-path series (53e123cf9 → 8da51c958) in the CLI; owner decision 02/10 «Solo tu, sempre». The kernel asks
 * before it opens a network path (`azione.percorsoDiRete = {ospite, frase, via, ambito?}`): opening it sends the person's
 * Windows credentials to that computer. Only a person may say yes: no allow rule, no «always», no session grant and no mode
 * answers it; with nobody to ask (-p, dontAsk) it is refused, with the reason. Decision 157 (owner 04/11/2026): Full access
 * (bypassPermissions) is the exception, as in Claude Code (full-access-155-04-11.test.ts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const UNC='\\\\files.example\\share\\notes.txt';
const ask=(extra:Record<string,unknown>={})=>({azione:{tipo:'leggi',toolCallId:'c1',percorso:UNC,percorsoDiRete:{ospite:'files.example',frase:'Vuole leggere un file su un computer di rete (files.example)…',via:'stringa',...extra}}});

test('a kernel question about a network path becomes a network action, with its host and whether it is for the session',()=>{
  const once=permissionActionFromApproval(ask());
  assert.equal(once.sensitive,'network');
  assert.deepEqual(once.network,{host:'files.example',via:'stringa'});
  const folder=permissionActionFromApproval(ask({via:'cartella',ambito:'sessione'}));
  assert.deepEqual(folder.network,{host:'files.example',via:'cartella',scope:'session'});
});

for(const mode of ['default','acceptEdits','auto'] as const){
  test(`${mode}: an allow rule does not open a network path; the person is asked`,async()=>{
    const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:['Read(**)','Read(//**)'],ask:[],deny:[]},mode,classifier:async()=>'allow'});
    const decision=await engine.decide(permissionActionFromApproval(ask()),{interactive:true,mode});
    assert.equal(decision.kind,'ask',JSON.stringify(decision));
  });
}

test('with nobody to ask (-p, dontAsk) a network path is refused, saying why',async()=>{
  for(const [interactive,mode] of [[false,'default'],[true,'dontAsk'],[false,'acceptEdits']] as const){
    const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:['Read(**)'],ask:[],deny:[]},mode});
    const decision:any=await engine.decide(permissionActionFromApproval(ask()),{interactive,mode});
    assert.equal(decision.kind,'deny');
    assert.equal(decision.code,'NETWORK_PATH_NEEDS_PERSON');
    assert.match(decision.message,/Windows credentials/u);
  }
});

test('a deny rule still refuses a network path without asking',async()=>{
  const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:['Read(//files.example/**)','Read(**)']},mode:'default'});
  const decision=await engine.decide(permissionActionFromApproval(ask()),{interactive:true,mode:'default'});
  assert.equal(decision.kind,'deny');
});

test('«for the session» and «always» on a network path are never kept: the next one asks again, no rule is written',async()=>{
  const persisted:unknown[]=[];
  const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:[]},mode:'default',persistRule:async(...args:unknown[])=>{persisted.push(args);}});
  for(const choice of ['allow-session','allow-always'] as const){
    const first:any=await engine.decide(permissionActionFromApproval(ask()),{interactive:true,mode:'default'});
    assert.equal(first.kind,'ask');
    await engine.resolve(first.requestId,choice);
    const again=await engine.decide(permissionActionFromApproval(ask()),{interactive:true,mode:'default'});
    assert.equal(again.kind,'ask',`${choice} must not be remembered for a network path`);
  }
  assert.deepEqual(persisted,[]);
});

test('the refusal of a network path with nobody to ask is the mode, in English, naming the credentials',async()=>{
  const {denialFromEngine}=await import('../../src/tui/event-adapter.ts');
  const denial=denialFromEngine({code:'NETWORK_PATH_NEEDS_PERSON',message:'Opening a network path sends your Windows credentials to that computer; only a person can allow it, and nobody is asked in this mode'});
  assert.equal(denial.by,'mode');
  assert.match(String(denial.reason),/network path/u);
  const {t}=await import('../../src/i18n/index.ts');
  assert.match(t('error.code.NETWORK_PATH_NEEDS_PERSON.what' as any),/network/u);
});

test('«always» on a link inside the project that leads to the network writes no rule either',async()=>{
  const persisted:unknown[]=[];
  const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:[]},mode:'default',persistRule:async(...args:unknown[])=>{persisted.push(args);}});
  const link={azione:{tipo:'leggi',toolCallId:'c2',percorso:'shared/notes.txt',percorsoDiRete:{ospite:'files.example',frase:'…',via:'collegamento'}}};
  const first:any=await engine.decide(permissionActionFromApproval(link),{interactive:true,mode:'default'});
  assert.equal(first.kind,'ask');
  await engine.resolve(first.requestId,'allow-always');
  assert.deepEqual(persisted,[],'no rule written for a network path');
});
