import test from 'node:test';
import assert from 'node:assert/strict';
import {creaProntoFn} from '../src/sessione-pronta.mjs';
import {toPublicProblem} from '../src/public-problem.mjs';
const now=1789000000000;
test('K4B-READY-01 — modello mancante: diagnostica inglese, codice pubblico invariato',()=>{
 const result=creaProntoFn({providerStore:{getKey:()=>null}})(null);
 assert.equal(result.messaggio,'Choose a model before starting the session.');assert.equal(result.codice,'CONFIG_INVALID');assert.equal(result.messaggioChiave,undefined);
 assert.notEqual(toPublicProblem({code:result.codice,message:result.messaggio}).explanation,result.messaggio);
});
test('K4B-READY-02 — due chiavi ferme: prima ripresa e causa conservate in inglese',()=>{
 const result=creaProntoFn({providerStore:{getKey:()=>null,elencaPool:()=>[{causa:'traffico',inPanchinaFino:now+300000},{causa:'credenziale',inPanchinaFino:now+600000}]},adessoFn:()=>now})('deepseek:deepseek-chat');
 assert.equal(result.messaggio,'The 2 DeepSeek keys are paused: the provider asked to wait because of heavy traffic. It will retry automatically in about 5 min; to avoid waiting, connect another key from Providers and access.');assert.equal(result.pronto,false);assert.equal(result.codice,'CONFIG_INVALID');
});
test('K4B-READY-03 — pausa in ore e pausa scaduta restano fatti distinti',()=>{
 let until=now+150*60000;
 const ready=creaProntoFn({providerStore:{getKey:()=>null,elencaPool:()=>[{causa:'credito',inPanchinaFino:until}]},adessoFn:()=>now});
 assert.match(ready('deepseek:deepseek-chat').messaggio,/credit has run out.*in about 3 hours/u);
 until=now-1;assert.equal(ready('deepseek:deepseek-chat').messaggio,'The DeepSeek key is missing: connect it from Providers and access.');
});
