/*
 * 11/10/2026 — trovato dal vivo con l'account dell'owner collegato: nel selettore dei modelli il gruppo «ChatGPT plan» non compariva
 * (owner: «fai in modo che anche nella modale di selezione del modello appaiano i modelli dell'abbonamento»). Il selettore decideva
 * chi ha un catalogo dall'elenco delle CHIAVI (`/api/v1/providers`), e il piano non è una chiave: è un accesso
 * (`/api/v1/auth/chatgpt/stato`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fornitoriConCatalogo, fontiDelSelettore, leggiCataloghiDiretti } from '../../src/components/fonti-modelli.js';

const CHIAVI = [{ id: 'openai', keyConfigured: false }, { id: 'deepseek', keyConfigured: true }, { id: 'lmstudio', keyConfigured: false }];

/* Revisione del Blocco 22, F1: la lettura è una sola per il selettore e per la carta delle compattazioni */
test('REV22-I3 — i tre stati del selettore, e l\'errore di un catalogo col nome del fornitore', async () => {
  const leggi = async (url) => {
    if (url === '/api/v1/providers') return { items: CHIAVI };
    if (url === '/api/v1/auth/chatgpt/stato') throw new Error('stato giù');
    if (url === '/api/v1/providers/deepseek/models') throw new Error('catalogo giù');
    if (url === '/api/v1/providers/lmstudio/models') return { modelli: [] };
    throw new Error(`non doveva chiederla: ${url}`);
  };
  const { perFornitore, errori } = await leggiCataloghiDiretti(leggi);
  assert.equal(perFornitore.openai, null, 'niente chiave non è zero modelli');
  assert.deepEqual(perFornitore.lmstudio, [], 'letto, zero modelli');
  assert.deepEqual(perFornitore.deepseek, [], 'il fornitore rotto ha la sua casella');
  assert.deepEqual(errori, { deepseek: 'DeepSeek: catalogo giù' });
  assert.equal(perFornitore.chatgpt, null, 'uno stato non letto vale «non c\'è»');
});

test('REV22-I4 — se cade l\'elenco dei fornitori lo sa chi chiama; chi legge `null` ha cataloghi vuoti', async () => {
  await assert.rejects(leggiCataloghiDiretti(async () => { throw new Error('elenco giù'); }), /elenco giù/u);
  const { perFornitore, errori } = await leggiCataloghiDiretti(async () => null);
  assert.equal(perFornitore.anthropic, null);
  assert.deepEqual(errori, {});
});

test('REV22-I5 — il selettore della chat passa da qui: una lista sola', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /await leggiCataloghiDiretti\(apiGet\)/u);
  assert.doesNotMatch(app, /apiGet\(`\/api\/v1\/providers\/\$\{id\}\/models`\)/u);
});

test('CATALOGO-PIANO-01: col piano collegato e abilitato «chatgpt» ha un catalogo, anche se non è una riga delle chiavi', () => {
  const ids = fornitoriConCatalogo(CHIAVI, { pianoChatgpt: { collegato: true, pianoAbilitato: true } });
  assert.deepEqual([...ids].sort(), ['chatgpt', 'deepseek', 'lmstudio']);
  const fonti = fontiDelSelettore({ openrouter: [], locali: [], diretti: { chatgpt: [{ id: 'chatgpt:gpt-6-sol' }], deepseek: [], openai: null, anthropic: null, gemini: null, lmstudio: [] } });
  assert.ok(fonti.some((f) => f.id === 'chatgpt' && f.conto === 1), 'la scheda del piano compare col suo conteggio');
});

test('CATALOGO-PIANO-02 AL CONTRARIO: scollegato, piano non abilitato o stato non letto ⇒ niente catalogo del piano; le chiavi come prima', () => {
  for (const pianoChatgpt of [null, undefined, { collegato: false, pianoAbilitato: false }, { collegato: true, pianoAbilitato: false }, 'storto']) {
    assert.deepEqual([...fornitoriConCatalogo(CHIAVI, { pianoChatgpt })].sort(), ['deepseek', 'lmstudio'], JSON.stringify(pianoChatgpt));
  }
  assert.deepEqual([...fornitoriConCatalogo([], {})], []);
  const fonti = fontiDelSelettore({ openrouter: [], locali: [], diretti: { chatgpt: null, deepseek: null, openai: null, anthropic: null, gemini: null, lmstudio: [] } });
  assert.equal(fonti.some((f) => f.id === 'chatgpt'), false, 'senza catalogo la scheda del piano non c è');
});

/* Decisione 63 dell'owner (03/11/2026): LM Studio spento arriva come dato (`raggiungibile: false`); il selettore lo dice «non acceso», mai «zero modelli» */
test('LMSTUDIO-SPENTO il motore locale spento è detto per nome, non come errore tecnico; AL CONTRARIO acceso con zero modelli non dice niente', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  impostaLingua('it');
  const leggi = (spento) => async (url) => {
    if (url === '/api/v1/providers') return { items: [{ id: 'lmstudio', keyConfigured: false }] };
    if (url === '/api/v1/auth/chatgpt/stato') return null;
    if (url === '/api/v1/providers/lmstudio/models') return spento ? { provider: 'lmstudio', modelli: [], raggiungibile: false, motivo: 'non-acceso' } : { modelli: [] };
    throw new Error(`non doveva chiederla: ${url}`);
  };
  const spento = await leggiCataloghiDiretti(leggi(true));
  assert.deepEqual(spento.perFornitore.lmstudio, []);
  assert.equal(spento.errori.lmstudio, 'LM Studio non è acceso su questo computer');
  const acceso = await leggiCataloghiDiretti(leggi(false));
  assert.deepEqual(acceso.errori, {}, 'acceso e vuoto: nessuna nota');
});

/*
 * D18 del collaudo del 02/11: a ogni apertura della scelta del modello un 422 su `providers/esterno/models`. Causa: l'agente esterno è «senza chiave», quindi si
 * leggeva sempre, anche non configurato, e il server risponde CATALOG_CONFIGURATION_REQUIRED. L'elenco dei fornitori lo dice già (`execution`, `provider-credential-store.mjs`).
 */
test('CATALOGO-D18 — l agente esterno ha un catalogo solo se è configurato: niente 422 a ogni apertura, la sua casella dice «non collegato»', async () => {
  const comeIlServer = (execution) => [{ id: 'openai', keyConfigured: false }, { id: 'lmstudio', keyConfigured: false }, { id: 'esterno', keyConfigured: false, requiresKey: false, execution }];
  assert.deepEqual([...fornitoriConCatalogo(comeIlServer('da configurare'), {})].sort(), ['lmstudio']);
  assert.deepEqual([...fornitoriConCatalogo(comeIlServer('configurato'), {})].sort(), ['esterno', 'lmstudio']);
  assert.deepEqual([...fornitoriConCatalogo(comeIlServer(undefined), {})].sort(), ['lmstudio'], 'uno stato non detto vale «non configurato»');
  const chieste = [];
  const leggi = async (url) => {
    chieste.push(url);
    if (url === '/api/v1/providers') return { items: comeIlServer('da configurare') };
    if (url === '/api/v1/auth/chatgpt/stato') return { collegato: false };
    if (url === '/api/v1/providers/lmstudio/models') return { modelli: [] };
    throw Object.assign(new Error('422'), { status: 422 });
  };
  const { perFornitore, errori } = await leggiCataloghiDiretti(leggi);
  assert.equal(chieste.includes('/api/v1/providers/esterno/models'), false);
  assert.equal(perFornitore.esterno, null, 'non collegato, non «letto con errore»');
  assert.deepEqual(errori, {});
  /* AL CONTRARIO: configurato, si legge come prima */
  const conAgente = async (url) => (url === '/api/v1/providers' ? { items: comeIlServer('configurato') } : url.endsWith('/esterno/models') ? { modelli: [{ id: 'esterno:predefinito' }] } : { modelli: [] });
  assert.deepEqual((await leggiCataloghiDiretti(conAgente)).perFornitore.esterno, [{ id: 'esterno:predefinito' }]);
});
