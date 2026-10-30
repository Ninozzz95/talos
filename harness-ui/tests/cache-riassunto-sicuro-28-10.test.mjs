/*
 * Owner 28/10/2026 — cache dei prompt, PUNTO 4 (contratto con la CLI, `CONTRATTO-CACHE-DEI-PROMPT-2026-10-28.md` §4 e le sue correzioni):
 *   il riassunto col modello della conversazione riparte con gli STESSI attrezzi e la stessa storia, e la domanda in coda, così il
 *   fornitore RILEGGE il prefisso invece di riscriverlo (Claude Code, «Lessons from building Claude Code: prompt caching is everything»;
 *   Codex `compact.rs:277-322`). Spento di serie (correzione 4: prima il banco). Ogni caso ha il suo verso contrario.
 * Ermetico come `compattazione-istantanea.test.mjs`: modello finto, nessuna rete, TEMP privata.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { VARIABILE_TETTO_TOKEN, richiestaDiRiassuntoSicuraPerCache, costruisciRichiestaDiRiassunto } from '../src/kernel/compattazione-desktop.mjs';
import { senzaMarcatoriDiCache } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONSEGNA = 'CONSEGNA-ORIGINALE-MARKER: leggi grande.txt più volte e riferisci.';
const PREAMBOLO = 'PREAMBOLO-PROGETTO ' + 'x'.repeat(12_000);

function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-riassunto-sicuro-'));
  writeFileSync(join(dir, 'grande.txt'), `${'g'.repeat(79)}\n`.repeat(50)); // ≈1.000 token per lettura
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}
function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}
const testoDi = (m) => (typeof m?.content === 'string' ? m.content
  : Array.isArray(m?.content) ? m.content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '');
const eRiassunto = (body) => testoDi(body.messages.at(-1)).includes('CONTEXT COMPACTION');
const haMarcatori = (body) => JSON.stringify(body.messages).includes('cache_control');

/** Un fornitore finto: legge `grande.txt` `chiamateTool` volte, poi conclude; ai riassunti risponde col riassunto (o con un attrezzo). */
function fornitore({ chiamateTool = 14, primoRiassuntoChiamaUnAttrezzo = false } = {}) {
  const corpi = [];
  let lavoro = 0;
  let riassunti = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRiassunto(body)) {
      riassunti += 1;
      if (primoRiassuntoChiamaUnAttrezzo && riassunti === 1) {
        return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'r1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
      }
      return Response.json({ choices: [{ message: { role: 'assistant', content: `## Goal\nRIASSUNTO ${riassunti}: ho letto grande.txt.` }, finish_reason: 'stop' }], usage });
    }
    lavoro += 1;
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, corpi, riassunti: () => corpi.filter(eRiassunto), lavori: () => corpi.filter((b) => !eRiassunto(b)) };
}
async function giro(t, f, resto = {}) {
  conTetto(t, 12_000);
  const eventi = [];
  const esito = await talosLavora({
    cartella: cartellaDiProva(t), task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: f.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0', onGiro: (e) => eventi.push(e), ...resto,
  });
  return { esito, eventi };
}
/** L'ultima richiesta di LAVORO partita prima del primo riassunto: quella di cui il riassunto deve rileggere il prefisso. */
function lavoroPrimaDelRiassunto(corpi) {
  const i = corpi.findIndex(eRiassunto);
  return corpi.slice(0, i).filter((b) => !eRiassunto(b)).at(-1);
}

test('CACHE-RIASSUNTO-01 — acceso, col modello della conversazione: stessi attrezzi, stesso prefisso, marcatori per rileggere, la domanda in coda di sempre', async (t) => {
  const f = fornitore();
  const { esito, eventi } = await giro(t, f, { riassuntoSicuroPerCache: true });
  assert.equal(esito.comeFinita, 'concluso');
  const riassunto = f.riassunti()[0];
  assert.ok(riassunto, 'premessa: un riassunto chiesto');
  const prima = lavoroPrimaDelRiassunto(f.corpi);
  assert.deepEqual(riassunto.tools, prima.tools, 'gli stessi attrezzi, nello stesso ordine');
  assert.equal(riassunto.model, prima.model);
  const corpo = riassunto.messages.slice(0, -1).map(senzaMarcatoriDiCache);
  const davanti = prima.messages.slice(0, corpo.length).map(senzaMarcatoriDiCache);
  assert.deepEqual(corpo, davanti, 'testa e tratto sono un PREFISSO della conversazione, oggetto per oggetto');
  assert.ok(haMarcatori(riassunto), 'il riassunto sicuro porta i marcatori: senza, il fornitore non rilegge');
  assert.match(testoDi(riassunto.messages.at(-1)), /^CONTEXT COMPACTION/u, 'la domanda comincia come sempre (vincolo della CLI)');
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-fine' && e.compattato), 'il riassunto è stato usato');
});

test('CACHE-RIASSUNTO-02 — AL CONTRARIO, spento (di serie): la forma di sempre, senza attrezzi e senza marcatori (nessuno rileggerebbe)', async (t) => {
  const f = fornitore();
  /* revisione blocco 14 bis (S4): coi soli 13.150 caratteri di sistema nessun marcatore si mette comunque (soglia 16.000) e la prova non
     distingueva «nessun marcatore» da «marcatori di serie»: il contesto del progetto è più grande, sopra la soglia */
  const { esito } = await giro(t, f, { contestoDelProgetto: 'PREAMBOLO-PROGETTO ' + 'x'.repeat(20_000) });
  assert.equal(esito.comeFinita, 'concluso');
  const riassunto = f.riassunti()[0];
  assert.ok(riassunto, 'premessa');
  assert.deepEqual(riassunto.tools ?? [], []);
  assert.equal(haMarcatori(riassunto), false, 'una scrittura in cache che nessuno rileggerà costa 2× col tetto di un\'ora');
});

test('CACHE-RIASSUNTO-03 — acceso ma col modello dei riassunti DIVERSO (correzione 1 della CLI): la forma di sempre', async (t) => {
  const f = fornitore();
  await giro(t, f, { riassuntoSicuroPerCache: true, modelloRiassunto: 'altro/modello-leggero', finestraRiassuntoToken: 128_000 });
  const riassunto = f.riassunti()[0];
  assert.ok(riassunto, 'premessa');
  assert.equal(riassunto.model, 'altro/modello-leggero');
  assert.deepEqual(riassunto.tools ?? [], [], 'la cache è di un altro modello: gli attrezzi costerebbero solo token');
  assert.equal(haMarcatori(riassunto), false);
});

test('CACHE-RIASSUNTO-04 — acceso, il modello chiama un attrezzo invece di riassumere: niente eseguito, il secondo tentativo è quello di sempre', async (t) => {
  const f = fornitore({ primoRiassuntoChiamaUnAttrezzo: true });
  const { esito, eventi } = await giro(t, f, { riassuntoSicuroPerCache: true });
  assert.equal(esito.comeFinita, 'concluso');
  const [primo, secondo] = f.riassunti();
  assert.ok(primo?.tools?.length > 0, 'il primo era sicuro');
  assert.ok(secondo, 'si ritenta');
  assert.deepEqual(secondo.tools ?? [], [], 'il ritentativo è la forma di sempre');
  assert.equal(haMarcatori(secondo), false);
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-fine' && e.compattato), 'e il riassunto arriva lo stesso');
  const letture = f.lavori().flatMap((b) => b.messages.filter((m) => m.role === 'tool' && m.tool_call_id === 'r1'));
  assert.equal(letture.length, 0, 'l\'attrezzo chiesto dal riassuntore non si esegue mai');
});

test('CACHE-RIASSUNTO-05 — la funzione pura: gli stessi oggetti (immagini comprese), null senza attrezzi o quando non entra; la forma di sempre resta com\'è', () => {
  const immagine = { role: 'user', content: [{ type: 'text', text: 'guarda' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] };
  const testa = [{ role: 'system', content: 'S' }];
  const mezzo = [{ role: 'user', content: 'ciao' }, immagine, { role: 'assistant', content: 'visto' }];
  const attrezzi = [{ type: 'function', function: { name: 'leggi', parameters: { type: 'object' } } }];
  const sicura = richiestaDiRiassuntoSicuraPerCache({ testa, mezzo, attrezzi, finestraToken: 128_000, maxOutputTokens: 2_000 });
  assert.equal(sicura.length, 5);
  for (let i = 0; i < 4; i += 1) assert.equal(sicura[i], [...testa, ...mezzo][i], `oggetto ${i} identico, non una copia`);
  assert.equal(sicura.at(-1).content, costruisciRichiestaDiRiassunto({ testa, mezzo }).at(-1).content, 'la stessa domanda della forma di sempre');
  assert.equal(richiestaDiRiassuntoSicuraPerCache({ testa, mezzo, attrezzi: [], finestraToken: 128_000 }), null, 'senza attrezzi non c\'è niente da rileggere');
  const enormi = [{ type: 'function', function: { name: 'x', description: 'd'.repeat(200_000), parameters: { type: 'object' } } }];
  assert.equal(richiestaDiRiassuntoSicuraPerCache({ testa, mezzo, attrezzi: enormi, finestraToken: 128_000 }), null, 'gli attrezzi contano nel tetto: oltre, la forma di sempre');
  assert.equal(costruisciRichiestaDiRiassunto({ testa, mezzo })[2].content[1].type, 'text', 'la forma di sempre mette ancora il segnaposto');
});

/* ── Il filo, dall'ambiente al motore (lezione del 17/10: un'opzione nuova si perde negli elenchi espliciti; si prova tutto il filo) ── */
import { loadConfig } from '../src/config.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { MARCATORE_CACHE_UN_ORA, MARCATORE_CACHE_CINQUE_MINUTI } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva as cartellaStoreDiProva } from './aiuto/cartelle-di-prova.mjs';

test('CACHE-RIASSUNTO-06 — l\'ambiente: spento di serie; «1», «true», «on» lo accendono; altro no', () => {
  const con = (valore) => loadConfig(valore === undefined ? {} : { TALOS_HARNESS_UI_CACHE_SAFE_SUMMARY: valore }).riassuntoSicuroPerCache;
  assert.equal(con(undefined), false);
  for (const v of ['1', 'true', 'on', 'YES']) assert.equal(con(v), true, v);
  for (const v of ['0', 'false', 'off', '', 'forse']) assert.equal(con(v), false, v);
});

test('CACHE-RIASSUNTO-07 — il servizio inoltra l\'interruttore al motore solo se acceso (l\'elenco esplicito di `avviaSessione`)', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  for (const acceso of [true, false]) {
    let visto = 'mai chiamato';
    await avviaSessione({
      cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, riassuntoSicuroPerCache: acceso,
      talosLavoraFn: async (input) => { visto = input.riassuntoSicuroPerCache; return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] }; },
    });
    assert.equal(visto, acceso ? true : undefined, `acceso=${acceso}`);
  }
});

const CLOUD = 'z-ai/glm-5.3-flash';
const ATTREZZI = [{ type: 'function', function: { name: 'leggi', parameters: { type: 'object' } } }];
function registroDiProva(t, opzioni = {}) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = cartellaStoreDiProva('talos-riassunto-sicuro-reg-');
  const chiamate = [];
  const riassumi = async (input) => { chiamate.push(input); return { scelta: { role: 'assistant', content: '## Riassunto\nRIASSUNTO-AUTO' }, finishReason: 'stop', usage: null }; };
  const giri = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ input, concludi(storia, extra = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], scartoMisurato: 0, ...extra } }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const preparaEsecuzioneFn = (taskId) => { if (taskId !== 'task-vero') throw new TaskCatalogError(taskId); return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }; };
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn, modello: CLOUD, chiave: 'k',
    riassumiPerCompattazioneFn: riassumi, ...opzioni });
  t.after(async () => {
    if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima;
    await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CLOUD });
  return { registro, giri, chiamate, sessionId };
}
const storiaGrande = () => {
  const s = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    s.push({ role: 'assistant', content: '', tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${i}.txt` }) } }] });
    s.push({ role: 'tool', tool_call_id: `call_${i}`, content: 'x'.repeat(3_000) });
  }
  s.push({ role: 'user', content: 'Seconda richiesta' }, { role: 'assistant', content: 'Fatto.' });
  return s;
};
async function attendi(condizione, messaggio) {
  for (let i = 0; i < 400; i += 1) { if (await condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error(messaggio);
}
const statoCacheDi = (modello, durataMs = 3_600_000) => ({ modello, attrezzi: 'h', nomiAttrezzi: ['leggi'], sistema: 'h', messaggi: [], attrezziInviati: ATTREZZI, tokenDaCache: 0, at: 0, durataMs });

test('CACHE-RIASSUNTO-08 — il riassunto di FINE GIRO del registro, acceso: gli attrezzi dell\'ultima richiesta e il marcatore con la durata del giro; la storia come parte', async (t) => {
  const { registro, giri, chiamate, sessionId } = registroDiProva(t, { riassuntoSicuroPerCache: true });
  assert.equal(giri[0].input.riassuntoSicuroPerCache, true, 'il registro lo passa al giro');
  const storia = storiaGrande();
  giri[0].concludi(storia, { statoCache: statoCacheDi(CLOUD) });
  await attendi(() => chiamate.length > 0, 'nessun riassunto di fine giro');
  assert.deepEqual(chiamate[0].attrezzi, ATTREZZI);
  assert.equal(chiamate[0].marcatoreDiCache, MARCATORE_CACHE_UN_ORA);
  assert.equal(chiamate[0].messaggi[0], storia[0], 'il sistema parte com\'è: lo stesso oggetto');
  assert.match(testoDi(chiamate[0].messaggi.at(-1)), /^CONTEXT COMPACTION/u);
  await attendi(() => registro.statoCompattazione(sessionId)?.record, 'il record');
});

test('CACHE-RIASSUNTO-09 — AL CONTRARIO: spento (di serie) ⇒ la forma di sempre senza marcatori; acceso ma col modello CAMBIATO dall\'ultima richiesta ⇒ lo stesso; un giro a 5 minuti dà 5 minuti', async (t) => {
  {
    const { giri, chiamate } = registroDiProva(t);
    assert.equal(giri[0].input.riassuntoSicuroPerCache, undefined);
    giri[0].concludi(storiaGrande(), { statoCache: statoCacheDi(CLOUD) });
    await attendi(() => chiamate.length > 0, 'nessun riassunto');
    assert.deepEqual(chiamate[0].attrezzi ?? [], []);
    assert.equal(chiamate[0].marcatoreDiCache, null, 'nessun marcatore: nessuno rileggerà');
  }
  {
    const { giri, chiamate } = registroDiProva(t, { riassuntoSicuroPerCache: true });
    giri[0].concludi(storiaGrande(), { statoCache: statoCacheDi('altro/modello') });
    await attendi(() => chiamate.length > 0, 'nessun riassunto');
    assert.deepEqual(chiamate[0].attrezzi ?? [], [], 'la cache è dell\'altro modello');
    assert.equal(chiamate[0].marcatoreDiCache, null);
  }
  {
    const { giri, chiamate } = registroDiProva(t, { riassuntoSicuroPerCache: true });
    giri[0].concludi(storiaGrande(), { statoCache: statoCacheDi(CLOUD, 300_000) });
    await attendi(() => chiamate.length > 0, 'nessun riassunto');
    assert.equal(chiamate[0].marcatoreDiCache, MARCATORE_CACHE_CINQUE_MINUTI, 'la durata di chi ha scritto la cache');
  }
});

test('CACHE-RIASSUNTO-10 — il nucleo restituisce gli attrezzi COME PARTITI nell\'ultima richiesta (lo stato della cache, che il registro tiene solo in memoria)', async (t) => {
  const f = fornitore({ chiamateTool: 2 });
  const { esito } = await giro(t, f);
  assert.deepEqual(esito.statoCache?.attrezziInviati, f.lavori().at(-1).tools);
  assert.ok(esito.statoCache.attrezziInviati.length > 0);
});

test('CACHE-RIASSUNTO-11 — la funzione VERA del servizio (`riassumiPerCompattazione`): gli attrezzi arrivano al fornitore; `null` ⇒ nessun marcatore; assente ⇒ come prima', async () => {
  const { riassumiPerCompattazione } = await import('../src/agent-service.mjs');
  const corpi = [];
  const fetchDiRete = async (_url, init) => { corpi.push(JSON.parse(init.body)); return Response.json({ choices: [{ message: { role: 'assistant', content: '## R\nok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }); };
  const messaggi = [{ role: 'system', content: 'S'.repeat(20_000) }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'CONTEXT COMPACTION — riassumi' }];
  await riassumiPerCompattazione({ modello: CLOUD, chiave: 'k', messaggi, fetchDiRete, attrezzi: ATTREZZI, marcatoreDiCache: MARCATORE_CACHE_CINQUE_MINUTI });
  await riassumiPerCompattazione({ modello: CLOUD, chiave: 'k', messaggi, fetchDiRete, marcatoreDiCache: null });
  await riassumiPerCompattazione({ modello: CLOUD, chiave: 'k', messaggi, fetchDiRete });
  assert.deepEqual(corpi[0].tools, ATTREZZI);
  assert.ok(JSON.stringify(corpi[0].messages).includes('"cache_control":{"type":"ephemeral"}'), 'il marcatore scelto, da cinque minuti');
  assert.deepEqual(corpi[1].tools ?? [], []);
  assert.equal(JSON.stringify(corpi[1].messages).includes('cache_control'), false);
  assert.ok(JSON.stringify(corpi[2].messages).includes('"ttl":"1h"'), 'assente: il marcatore di serie del nucleo, come prima');
});

test('CACHE-RIASSUNTO-12 — (riverifica blocco 14, S4) il server passa l\'interruttore dalla configurazione al registro: guardia sul sorgente di server.mjs', async () => {
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /\n\s+riassuntoSicuroPerCache: config\.riassuntoSicuroPerCache === true,/u);
});
