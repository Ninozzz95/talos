import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {talosResearchApply,talosResearchReplay} from '../src/research/run.mjs';
import {talosResearchLedger} from '../src/research/ledger.mjs';
import server from '../frontend/src/i18n/testi/server.js';
import {testoDelCampo} from '../frontend/src/components/testo-server.js';
import {impostaLingua} from '../frontend/src/components/lingua.js';
const at='2026-10-03T00:00:00.000Z',key='research.step.verificationMissing';
const started={kind:'step_started',at,stepId:'s1',stepKind:'verify',branchId:'b1'};
const failed={kind:'step_failed',at,stepId:'s1',error:'verification did not run: the report was deposited without verdicts',errorChiave:'server.'+key};
const replay=()=>talosResearchReplay([{kind:'run_started',at,id:'r1',sessionId:'c1',question:'Q',depth:'deep',engine:'device'},started,failed]);
test('K4B-STEP-01 — replay e ledger mantengono chiave e italiano estratto del motivo del passo',()=>{
 const entry=talosResearchLedger(replay().steps).entries[0];
 assert.equal(entry.errorChiave,failed.errorChiave);assert.equal(entry.error,server.en[key]);
 const it=JSON.parse(readFileSync(new URL('./fixtures/k4b-step-ricerca-it.json',import.meta.url),'utf8'))[key];
 assert.equal(server.it[key],it);
 for(const l of ['it','en']){impostaLingua(l);assert.equal(testoDelCampo(JSON.parse(JSON.stringify(entry)),'error'),l==='it'?it:failed.error);}
 impostaLingua('it');
});
test('K4B-STEP-02 — alla riprova e al completamento il motivo precedente perde anche i metadati',()=>{
 const run=replay();
 assert.equal(run.steps[0].errorChiave,failed.errorChiave);
 const retry=talosResearchApply(run,started);assert.equal(retry.steps[0].error,null);assert.equal(retry.steps[0].errorChiave,undefined);
 const done=talosResearchApply(run,{kind:'step_finished',at,stepId:'s1',spend:{tokens:0,pages:0,searches:0},resultRef:'f'});
 assert.equal(done.steps[0].error,null);assert.equal(done.steps[0].errorChiave,undefined);
 const noKey=talosResearchApply(run,{...failed,error:'Error $&',errorChiave:undefined});
 assert.equal(noKey.steps[0].error,'Error $&');assert.equal(noKey.steps[0].errorChiave,undefined);
});
test('K4B-STEP-UI-03 — il lettore reale dei passi e il produttore usano la chiave',()=>{
 const ui=readFileSync(new URL('../frontend/src/components/ricerca-dettaglio.js',import.meta.url),'utf8');
 assert.ok(ui.includes("error: testoDelCampo(passo, 'error')"));
 const producer=readFileSync(new URL('../src/research-orchestrator.mjs',import.meta.url),'utf8');
 assert.ok(producer.includes("errorChiave: 'server.research.step.verificationMissing'"));
});
