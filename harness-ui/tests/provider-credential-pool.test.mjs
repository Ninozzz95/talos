import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHttpApp } from '../src/http-app.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

function banco(env = {}) {
  let adesso = Date.parse('2026-09-12T10:00:00Z');
  const valori = new Map(), log = [];
  const keyring = {
    get: (s, p) => valori.get(`${s}:${p}`) ?? null,
    set: (s, p, v) => valori.set(`${s}:${p}`, v),
    remove: (s, p) => valori.delete(`${s}:${p}`),
  };
  const opzioni = { env, keyring, ora: () => adesso, logger: m => log.push(m) };
  return { store: createProviderCredentialStore(opzioni), opzioni, log, valori, avanza: ms => { adesso += ms; }, ora: () => adesso };
}

test('PH-POOL-01 due chiavi: priorità, 429, seconda scelta e scadenza', () => {
  const b = banco(), s = b.store;
  const prima = s.aggiungiChiave('deepseek', 'finta-prima', { priorita: 0 });
  s.aggiungiChiave('deepseek', 'finta-seconda', { priorita: 1 });
  assert.equal(s.getKey('deepseek'), 'finta-prima');
  s.mettiInPanchina('deepseek', prima.impronta, { classe: 'traffico' });
  assert.equal(s.getKey('deepseek'), 'finta-seconda');
  assert.equal(s.elencaPool('deepseek')[0].inPanchinaFino, b.ora() + 3_600_000);
  b.avanza(3_600_000);
  assert.equal(s.getKey('deepseek'), 'finta-prima');
  assert.equal(s.elencaPool('deepseek')[0].stato, 'disponibile');
});

test('PH-POOL-02 unica chiave: raffreddamento corto e presenza distinta dalla disponibilità', () => {
  const b = banco({ OPENAI_API_KEY: 'finta-unica' }), s = b.store;
  s.mettiInPanchina('openai', s.elencaPool('openai')[0].impronta, { classe: 'traffico' });
  assert.equal(s.hasKey('openai'), true);
  assert.equal(s.getKey('openai'), null);
  b.avanza(59_999); assert.equal(s.getKey('openai'), null);
  b.avanza(1); assert.equal(s.getKey('openai'), 'finta-unica');
});

test('PH-POOL-03 Retry-After vince anche su chiave unica e sopravvive al riavvio', () => {
  const b = banco(), s = b.store;
  const k = s.aggiungiChiave('openai', 'finta-custodia');
  s.mettiInPanchina('openai', k.impronta, { classe: 'traffico', headers: new Headers({ 'Retry-After': '7200' }) });
  const altro = createProviderCredentialStore(b.opzioni); altro.loadFromKeyring();
  assert.equal(altro.elencaPool('openai')[0].inPanchinaFino, b.ora() + 7_200_000);
  assert.equal(altro.getKey('openai'), null);
});

test('PH-POOL-04 reset OpenAI durata, Anthropic data e Retry-After HTTP-date', () => {
  for (const [provider, headers, atteso] of [
    ['openai', { 'x-ratelimit-reset-requests': '6m0s', 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-tokens': '1h', 'x-ratelimit-remaining-tokens': '12' }, 360_000],
    ['anthropic', { 'anthropic-ratelimit-tokens-reset': '2026-09-12T10:07:00Z' }, 420_000],
    ['deepseek', { 'Retry-After': 'Sat, 12 Sep 2026 10:03:00 GMT' }, 180_000],
  ]) {
    const b = banco(), k = b.store.aggiungiChiave(provider, 'finta-reset');
    b.store.mettiInPanchina(provider, k.impronta, { classe: 'traffico', headers: new Headers(headers) });
    assert.equal(b.store.elencaPool(provider)[0].inPanchinaFino, b.ora() + atteso);
  }
});

test('PH-POOL-05 credenziale breve e segnalata; nessun segreto pubblico, nei log o negli errori', () => {
  const b = banco(), segreto = 'chiave-finta-da-non-esporre', k = b.store.aggiungiChiave('openai', segreto);
  const risultato = b.store.mettiInPanchina('openai', k.impronta, { classe: 'credenziale', messaggio: segreto });
  assert.equal(risultato.inPanchinaFino, b.ora() + 300_000);
  assert.equal(risultato.causa, 'credenziale');
  const uscite = JSON.stringify([k, risultato, b.store.listPublic(), b.log]);
  assert.equal(uscite.includes(segreto), false);
  assert.equal(JSON.stringify(b.store.scegliChiave('openai')).includes(segreto), false);
  assert.throws(() => b.store.aggiungiChiave('openai', segreto, { priorita: segreto }), e => !e.message.includes(segreto));
});

test('PH-POOL-06 ambiente additivo, deduplica, custodia vince e rimozione non risuscita chiavi', () => {
  const b = banco({ OPENAI_API_KEY: 'finta-ambiente', OPENAI_API_KEY_POOL: JSON.stringify(['finta-ambiente', 'finta-extra']) });
  assert.equal(b.store.elencaPool('openai').length, 2);
  const k = b.store.aggiungiChiave('openai', 'finta-custodia', { priorita: -1 });
  assert.equal(b.store.getKey('openai'), 'finta-custodia');
  b.store.rimuoviChiave('openai', k.impronta);
  b.store.clearKey('openai');
  const altro = createProviderCredentialStore(b.opzioni); altro.loadFromKeyring();
  assert.equal(altro.hasKey('openai'), false);
});

test('PH-POOL-07 chiave singola esistente non richiede migrazione e pool corrotto non espone segreti', () => {
  const b = banco();
  b.valori.set('talos-harness-provider:openai', 'finta-legacy');
  b.store.loadFromKeyring();
  assert.equal(b.store.getKey('openai'), 'finta-legacy');
  assert.equal(b.valori.size, 1);
  b.store.aggiungiChiave('openai', 'finta-aggiunta');
  const altro = createProviderCredentialStore(b.opzioni); altro.loadFromKeyring();
  assert.equal(altro.elencaPool('openai').length, 2);
  assert.equal(altro.getKey('openai'), 'finta-legacy');
});

test('PH-REG-HF-INDICE credenziali legacy e indice usano account distinti', () => {
  const s = createProviderCredentialStore({ env:{}, keyring:{ get:(_servizio,account)=>account==='huggingface'?'finta-hf':null } });
  s.loadFromKeyring(); assert.equal(s.getKey('huggingface'),'finta-hf');
});
test('PH-POOL-08 indice corrotto disabilita il pool senza ripiego sulla credenziale vecchia', () => {
  const b=banco({OPENAI_API_KEY:'finta-env'});
  b.valori.set('talos-harness-provider-pool-index:openai:indice','non-json-con-finta-segreta');
  b.valori.set('talos-harness-provider:openai','finta-legacy');
  b.store.loadFromKeyring(); assert.equal(b.store.hasKey('openai'),false);
  assert.equal(JSON.stringify(b.log).includes('finta-'),false);
});
test('PH-POOL-09 indice non pubblicabile: vecchie chiavi intatte, nuova chiave rimossa', () => {
  const b=banco(), s=b.store; s.setKey('openai','finta-vecchia');
  const set=b.opzioni.keyring.set;
  b.opzioni.keyring.set=(service,p,value)=>{if(service.includes('pool-index'))throw new Error(value);return set(service,p,value);};
  assert.throws(()=>s.aggiungiChiave('openai','finta-nuova'),{code:'PROVIDER_STORE_UNAVAILABLE'});
  assert.equal(s.getKey('openai'),'finta-vecchia');
  assert.equal([...b.valori.values()].includes('finta-nuova'),false);
});
test('PH-POOL-10 la deduplica preserva la prima priorità ambiente', () => {
  const b=banco({OPENAI_API_KEY:'finta-prima',OPENAI_API_KEY_POOL:JSON.stringify(['finta-prima','finta-seconda'])});
  assert.equal(b.store.elencaPool('openai')[0].priorita,0);
});
test('PH-POOL-11 aggiunta e panchina conservano il lettore legacy; rimozione cancella anche quella copia',()=>{
  const b=banco();b.store.setKey('openai','finta-legacy');
  const prima=b.store.elencaPool('openai')[0];b.store.aggiungiChiave('openai','finta-seconda');
  b.store.mettiInPanchina('openai',prima.impronta,{classe:'traffico'});
  assert.equal(b.valori.get('talos-harness-provider:openai'),'finta-legacy');
  b.store.rimuoviChiave('openai',prima.impronta);
  assert.equal(b.valori.has('talos-harness-provider:openai'),false);
});
test('PH-HTTP-POOL GET reale espone stato e modelli di riserva, mai segreti',async t=>{
  const b=banco();const k=b.store.aggiungiChiave('openai','finta-http-privata');
  b.store.mettiInPanchina('openai',k.impronta,{classe:'traffico'});
  const server=createServer(createHttpApp({staticHandler:async()=>null,providerStore:b.store}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  assert.notEqual(server.address().port,4174);
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/providers`);
  const testo=await response.text();assert.equal(response.status,200);assert.equal(testo.includes('finta-http-privata'),false);
  const row=JSON.parse(testo).data.items.find(r=>r.id==='openai');assert.equal(row.pool[0].stato,'in-panchina');assert.ok(row.modelliDiRiserva.length);
});
