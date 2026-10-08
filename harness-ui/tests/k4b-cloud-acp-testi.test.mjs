import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AcpAgentError, rispostaAgenteAcp } from '../src/acp-agent.mjs';
import { normalizzaRuntimeCloud, intestazioniCloud, destinazioneCloud } from '../src/provider-auth-cloud.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import server from '../frontend/src/i18n/testi/server.js';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';
const italiano = JSON.parse(readFileSync(new URL('./fixtures/k4b-cloud-acp-it.json', import.meta.url), 'utf8'));
const riempi = (s, p = {}) => s.replace(/\{(\w+)\}/gu, (m, n) => n in p ? String(p[n]) : m);
function contratto(o, campo) {
 const k = o[`${campo}Chiave`]?.replace(/^server\./u, '');
 assert.ok(k, `manca ${campo}Chiave`);
 assert.equal(o[campo], riempi(server.en[k], o[`${campo}Params`]));
 assert.equal(server.it[k], italiano[k], `italiano originale ${k}`);
}
const erroriCloud = [
 ['cloud.runtimeInvalid', () => normalizzaRuntimeCloud('azure', {endpoint:'non-url'})],
 ['cloud.credentialInvalid', () => intestazioniCloud('azure','{"versione":0}')],
 ['cloud.keyMissing', () => intestazioniCloud('azure','')],
 ['cloud.tokenExpired', () => intestazioniCloud('azure',JSON.stringify({versione:1,tipo:'bearer',valore:'finta',scadeAlle:'2020-01-01T00:00:00Z'}))],
];
test('K4B-CLOUD-01 — quattro errori cloud pubblici: inglese, chiave, valori, italiano estratto', () => {
 for (const [key, azione] of erroriCloud) assert.throws(azione, e => {
  assert.equal(e.chiave, `server.${key}`);
  contratto({motivo:e.message,motivoChiave:e.chiave,motivoParams:e.params},'motivo');
  return true;
 });
 assert.throws(()=>destinazioneCloud('azure',{endpoint:'https://risorsa.openai.azure.com'},'finta','../vietata'),{code:'MODEL_DESTINATION_INVALID',message:'Check the Azure AI Foundry deployment name.'});
});
test('K4B-CLOUD-PROBE-02 — il motivo della prova conserva la chiave cloud fino alla risposta pubblica, senza rete', async () => {
 const probe = createProviderProbe({leggiChiave:()=>'{"versione":0}',leggiRuntime:()=>({endpoint:'https://risorsa.openai.azure.com'}),fetchImpl:()=>{throw Error('rete vietata');}});
 const esito = await probe.prova('azure');
 assert.equal(esito.motivoChiave,'server.cloud.credentialInvalid');
 contratto(esito,'motivo');
});
test('K4B-ACP-ERROR-01 — dodici codici e fallback: inglese e chiavi senza alterare i segni BC44', () => {
 const codici = ['ACP_RUNTIME_INVALID','ACP_NOT_CONFIGURED','ACP_VERSION_UNSUPPORTED','ACP_PROTOCOL_INVALID','ACP_PROCESS_EXITED','ACP_START_FAILED','ACP_TIMEOUT','ACP_REQUEST_FAILED','ACP_REQUEST_UNSUPPORTED','ACP_CANCELLED','ACP_BUSY','ACP_CLOSE_FAILED'];
 for (const code of [...codici,'SCONOSCIUTO']) {
  const e = new AcpAgentError(code);
  contratto({motivo:e.message,motivoChiave:e.chiave,motivoParams:e.params},'motivo');
  assert.equal(e.code,code);
 }
 assert.equal(new AcpAgentError('ACP_CANCELLED').classe,'fermato');
 assert.equal(new AcpAgentError('ACP_PROCESS_EXITED').classe,'flusso-interrotto');
});
async function runtime(t, modo='normale') {
 const cwd = await mkdtemp(join(tmpdir(),'talos-k4b-acp-'));
 t.after(()=>rimuoviCartellaDiProvaAttesa(cwd));
 return {comando:process.execPath,argomenti:[fileURLToPath(new URL('./fixtures/acp-agent-finto.mjs',import.meta.url)),modo,join(cwd,'diario.jsonl')],cwd,variabiliAmbiente:[],timeoutMs:3000};
}
const body = {model:'esterno:predefinito',stream:false,messages:[{role:'user',content:'Ciao, continua.'}]};
test('K4B-ACP-NOTICE-02 — attività reali del processo ACP vanno al callback con chiave, mai nel testo del modello', async t => {
 const avvisi=[];
 const response = await rispostaAgenteAcp({runtime:await runtime(t),body,env:{},onAvviso:e=>avvisi.push(e)});
 const data=await response.json();
 assert.equal(avvisi.length,2);
 for(const avviso of avvisi) contratto(avviso,'testo');
 assert.deepEqual(avvisi.map(x=>x.testoChiave),['server.acp.activity.inProgress','server.acp.activity.completed']);
 assert.equal(data.choices[0].message.content,'Prima dopo.');
});
for (const [modo,chiave] of [['permesso','permissionDenied'],['rpc-fs','operationUnavailable']]) test(`K4B-ACP-NOTICE-03 — ${modo}: rifiuto ACP reale con italiano originale e chiave`, async t=>{
 const avvisi=[];
 await (await rispostaAgenteAcp({runtime:await runtime(t,modo),body,env:{},onAvviso:e=>avvisi.push(e)})).json();
 assert.equal(avvisi[0]?.testoChiave,`server.acp.notice.${chiave}`);
 contratto(avvisi[0],'testo');
});
test('K4B-ACP-TRANSPORT-04 — adattatore e agent-service persistono la chiave nel delta per chat e replay', async t=>{
 const config=await runtime(t), eventi=[];
 const esito=await avviaSessione({cartella:config.cwd,task:{consegna:'Ciao'},modello:body.model,chiave:'finta',onEvento:e=>eventi.push(e),talosLavoraFn:async input=>{
  const f=creaFetchMultiProvider(()=>{throw Error('rete vietata');},{dipendenze:{},risolvi:()=>({esterno:true,runtime:config}),onAvviso:input.onAvviso});
  const risposta=await f('https://esempio.test/chat/completions',{method:'POST',body:JSON.stringify(body)});
  return {comeFinita:'concluso',detto:(await risposta.json()).choices[0].message.content};
 }});
 assert.equal(esito.ok,true);
 const notices=eventi.filter(e=>e.deltaChiave);
 assert.equal(notices.length,2);
 for(const e of JSON.parse(JSON.stringify(notices))) contratto(e,'delta');
});
test('K4B-ACP-LEGACY-05 — un avviso stringa continua a passare parola per parola',async()=>{
 const eventi=[];
 await avviaSessione({cartella:tmpdir(),task:{consegna:'Ciao'},modello:'m',chiave:'k',onEvento:e=>eventi.push(e),talosLavoraFn:async input=>{await input.onAvviso('Avviso precedente $&');return {comeFinita:'concluso',detto:'fatto'};}});
 const e=eventi.find(e=>e.delta==='Avviso precedente $&');
 assert.ok(e);
 assert.equal(e.deltaChiave,undefined);
});
test('K4B-ACP-RUNERROR-06 — il guasto ACP conserva chiave e classe nel RunError e nel replay',async()=>{
 const eventi=[];
 const esito=await avviaSessione({cartella:tmpdir(),task:{consegna:'Ciao'},modello:'m',chiave:'k',onEvento:e=>eventi.push(e),talosLavoraFn:async()=>{throw new AcpAgentError('ACP_PROCESS_EXITED');}});
 assert.equal(esito.ok,false);
 const e=JSON.parse(JSON.stringify(eventi.find(e=>e.type==='RunError')));
 contratto(e,'message');
 assert.equal(e.code,'ACP_PROCESS_EXITED');
 assert.equal(e.classe,'flusso-interrotto');
});
