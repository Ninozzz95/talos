/*
 * 06/11 realignment (decision 155, kernel bb3c61b4d): the card of a critical deletion (`azione.cancellazioneCritica`, talosHarness.mjs
 * `cancellazioneCriticaDaDire`) reached `--protocol v2` with its Italian keys and values, and its receipt's via
 * («cancellazione-critica», `viaRichiesta`) had no English. v2 now says `criticalDelete {path, why, sentence…}`, the names
 * security/from-approval.ts reads, and the reason's English is the kernel's own key tail (CHIAVE_CRITICA), read here from its source.
 */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {RECEIPT_VIA,REFUSAL_VIA} from '../../src/i18n/kernel-map.ts';

let repo=join(process.cwd(),'..');while(!existsSync(join(repo,'harness-ui','src'))&&dirname(repo)!==repo)repo=dirname(repo);
const kernelPath=join(repo,'harness-ui','src','kernel','talosHarness.mjs');
const KERNEL=readFileSync(kernelPath,'utf8');
const kernel:any=await import(pathToFileURL(kernelPath).href);
const translate=(azione:Record<string,unknown>)=>(createV2EventBridge('s-1',()=>'2026-11-06T08:00:00.000Z')
  .translate({type:'ApprovalRequested',_sequenza:1,requestId:'q1',azione:structuredClone(azione)})?.data as any).action;
/* the kernel's map of reasons, read from its source: a new reason turns this test red instead of reaching v2 in Italian */
const CHIAVE_CRITICA:Record<string,string>=Function(`return ${/const CHIAVE_CRITICA = Object\.freeze\((\{[^\n]+\})\)/u.exec(KERNEL)?.[1]??'{}'}`)();
/* the card as the kernel builds it (the same expression as `cancellazioneCriticaDaDire`) */
const card=(percorso:string|null,perche:string)=>({percorso,perche,...kernel.fraseDiPermesso(`server.approval.criticalDelete.${CHIAVE_CRITICA[perche]??'substitution'}`,{percorso})});
const ITALIAN_KEYS=/"(?:cancellazioneCritica|percorso|perche|frase|fraseChiave|fraseParams)"/u;

test('the kernel still builds the card this way (pinned)',()=>{
  assert.ok(Object.keys(CHIAVE_CRITICA).length>=11,JSON.stringify(CHIAVE_CRITICA));
  assert.match(KERNEL,/\{ percorso: critica\.percorso, perche: critica\.perche, \.\.\.fraseDiPermesso\(`server\.approval\.criticalDelete\.\$\{CHIAVE_CRITICA\[critica\.perche\] \?\? 'substitution'\}`, \{ percorso: critica\.percorso \}\) \}/u);
  assert.match(KERNEL,/cancellazioneCritica: cancellazioneCriticaDaDire/u);
  assert.match(KERNEL,/const viaRichiesta = criticaForzaConferma \? 'cancellazione-critica'/u);
});

test('v2 says every reason of the kernel in English, with no Italian key',()=>{
  for(const [perche,tail] of Object.entries(CHIAVE_CRITICA)){
    const action=translate({tipo:'shell',toolCallId:'c1',comando:'rm -rf /',cancellazioneCritica:card(perche==='troppo-annidato'?null:'C:\\Users\\me',perche)});
    const said=JSON.stringify(action);
    assert.doesNotMatch(said,ITALIAN_KEYS,said);
    assert.equal(action.criticalDelete.why,tail,`${perche} → ${tail}`);
    assert.equal(action.criticalDelete.sentenceKey,`server.approval.criticalDelete.${tail}`);
    assert.ok(typeof action.criticalDelete.sentence==='string'&&action.criticalDelete.sentence.length>0);
    /* the CLI's own reader takes v2's English spelling as well as the kernel's */
    const fromV2=permissionActionFromApproval({azione:{tipo:'shell',comando:'rm -rf /',criticalDelete:action.criticalDelete}});
    const fromKernel=permissionActionFromApproval({azione:{tipo:'shell',comando:'rm -rf /',cancellazioneCritica:card(perche==='troppo-annidato'?null:'C:\\Users\\me',perche)}});
    assert.equal(fromV2.criticalDelete?.sentence,fromKernel.criticalDelete?.sentence);
    assert.equal(fromV2.criticalDelete?.path,fromKernel.criticalDelete?.path);
  }
});

test('the other way: a card with no critical deletion gains no criticalDelete',()=>{
  assert.equal(translate({tipo:'shell',toolCallId:'c1',comando:'ls'}).criticalDelete,undefined);
});

test('the receipt\'s via has its English, and refused it is the person\'s no',()=>{
  assert.equal(RECEIPT_VIA['cancellazione-critica'],'critical-delete');
  assert.equal(REFUSAL_VIA['cancellazione-critica'],'notApproved');
  assert.equal(REFUSAL_VIA['critical-delete'],'notApproved');
});
