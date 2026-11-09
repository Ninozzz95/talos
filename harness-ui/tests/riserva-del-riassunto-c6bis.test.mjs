/*
 * C6-bis passo 2 (owner 28/10/2026; OK di CLI e Mobile 30/10): la catena del riassunto DENTRO il giro vero (`talosLavora` dell'adattatore
 * desktop) e il suo filo fino al registro e all'evento durevole.
 *   - il modello scelto risponde 403 ⇒ l'evento «inutilizzabile» (una volta), la riserva scrive il riassunto;
 *   - il modello scelto è senza rete ⇒ la riserva, NESSUN evento, niente memoria (il riassunto dopo riprova lo scelto);
 *   - senza riserva ⇒ niente secondo tentativo pagato: il riassunto senza modello;
 *   - la memoria della conversazione: al giro dopo il modello inutilizzabile non si chiama nemmeno;
 *   - il modello della conversazione come riassuntore non scrive l'evento (non c'è una scelta da cambiare).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const CONV = 'z-ai/glm-5.3-flash';
const AUX = 'z-ai/glm-4.7-flash';
const RIS = 'qwen/qwen3.7-flash';

const storiaGiro = (coppie) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storiaGiro(c + 1)) < token) c += 1; return c; };
const reteGiu = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) });

/* `comeRisponde(modello)` per le richieste di riassunto (senza attrezzi): 'ok' | 'rete' | numero HTTP */
/* `riassuntiPrimaDellaChat`: la chat aspetta i riassunti in volo prima di rispondere — senza, quale arriva prima è una gara (il riassunto
   preparato in sottofondo può essere ancora «in arrivo» quando il giro ne ha bisogno, e allora va il rapido, come vuole il «mai aspettare»). */
async function giro(t, { comeRisponde, riassuntiPrimaDellaChat = false, ...extra }) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const cartella = mkdtempSync(join(tmpdir(), 'riserva-riassunto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const riassunti = [];
  const inVolo = new Set();
  let fatte = 0;
  const rispostaDelRiassunto = async (corpo) => {
    riassunti.push(corpo.model);
    const modo = comeRisponde(corpo.model);
    if (modo === 'rete') throw reteGiu();
    if (modo instanceof Error) throw modo; // l'errore come lo lancia la porta vera dei fornitori
    if (typeof modo === 'number') return new Response(JSON.stringify({ error: { message: `refused ${modo}` } }), { status: modo, headers: { 'Content-Type': 'application/json' } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
  };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      if (!riassuntiPrimaDellaChat) return rispostaDelRiassunto(corpo);
      let fatto; const p = new Promise((r) => { fatto = r; }); inVolo.add(p);
      try { return await rispostaDelRiassunto(corpo); } finally { fatto(); inVolo.delete(p); }
    }
    /* la chat risponde dopo i riassunti in volo e dopo un attimo (il preparato in sottofondo parte quando arriva la risposta: senza un
       margine, la richiesta dopo lo trova ancora in volo) */
    if (riassuntiPrimaDellaChat) { await Promise.allSettled([...inVolo]); await new Promise((r) => { setTimeout(r, 40); }); await Promise.allSettled([...inVolo]); }
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (fatte < 12) {
      fatte += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${fatte}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${fatte}.txt`, path: `f${fatte}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  const fine = [], preparate = [], inutilizzabili = [];
  const esito = await talosLavora({ cartella, modello: CONV, chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storiaGiro(coppiePer(2600)), { role: 'user', content: 'Leggi i file.' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', ...extra,
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fine.push(e); if (e?.tipo === 'compattazione-preparata') preparate.push(e); if (e?.tipo === 'riassunto-modello-inutilizzabile') inutilizzabili.push(e); } });
  return { riassunti, fine, preparate, inutilizzabili, esito };
}

test('C6BIS-GIRO-01 — lo scelto risponde 403: evento «inutilizzabile» una volta, la riserva scrive; la memoria lo ricorda', async (t) => {
  const memoria = new Map();
  const { riassunti, inutilizzabili, fine } = await giro(t, { comeRisponde: (m) => (m === AUX ? 403 : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768,
    riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: memoria });
  assert.ok(riassunti.includes(RIS), `la riserva ha scritto: ${JSON.stringify(riassunti)}`);
  assert.equal(riassunti.filter((m) => m === AUX).length, 1, 'lo scelto si chiama UNA volta: dopo il 403 non si ripaga');
  assert.equal(inutilizzabili.length, 1, JSON.stringify(inutilizzabili));
  assert.deepEqual({ modello: inutilizzabili[0].modello, motivo: inutilizzabili[0].motivo, scelto: inutilizzabili[0].scelto, ruolo: inutilizzabili[0].ruolo },
    { modello: AUX, motivo: 'accesso-negato', scelto: 'persona', ruolo: 'scelto' });
  assert.equal(memoria.get(AUX)?.stato, 'inutilizzabile');
  assert.ok(fine.some((e) => e.compattato), 'la compattazione è riuscita');
  /* il giro dopo, con la stessa memoria: lo scelto non si chiama nemmeno, e l'evento non si ripete */
  const dopo = await giro(t, { comeRisponde: (m) => (m === AUX ? 403 : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768,
    riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: memoria });
  assert.equal(dopo.riassunti.filter((m) => m === AUX).length, 0, JSON.stringify(dopo.riassunti));
  assert.ok(dopo.riassunti.includes(RIS));
  assert.equal(dopo.inutilizzabili.length, 0, 'l’avviso è già stato dato');
});

test('C6BIS-GIRO-02 (Mobile a) — lo scelto è senza rete: la riserva, NESSUN evento, nessuna memoria', async (t) => {
  const memoria = new Map();
  const { riassunti, inutilizzabili } = await giro(t, { comeRisponde: (m) => (m === AUX ? 'rete' : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768,
    riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: memoria });
  assert.ok(riassunti.includes(RIS), JSON.stringify(riassunti));
  assert.equal(inutilizzabili.length, 0, 'la rete non è mai «inutilizzabile»');
  assert.equal(memoria.has(AUX), false, 'senza un’ora detta, il riassunto dopo riprova lo scelto');
});

test('C6BIS-GIRO-03 — senza riserva: dopo un errore classificato niente secondo tentativo pagato, il riassunto senza modello', async (t) => {
  const { riassunti, inutilizzabili, fine } = await giro(t, { comeRisponde: (m) => (m === AUX ? 'rete' : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768,
    origineRiassunto: 'ospite', statoModelliRiassunto: new Map() });
  const perCompattazione = riassunti.filter((m) => m === AUX).length;
  assert.ok(perCompattazione >= 1);
  assert.equal(riassunti.includes(CONV), false, 'mai il modello della conversazione in automatico');
  assert.equal(inutilizzabili.length, 0);
  assert.ok(fine.length >= 1, 'la compattazione si chiude');
  assert.equal(perCompattazione, fine.length, `un solo tentativo pagato per compattazione: ${JSON.stringify(riassunti)} / ${fine.length}`);
});

test('C6BIS-GIRO-04 (verso contrario) — il modello della conversazione come riassuntore (nessuna scelta) non scrive l’evento', async (t) => {
  const { inutilizzabili } = await giro(t, { comeRisponde: () => 'ok', statoModelliRiassunto: new Map() });
  assert.equal(inutilizzabili.length, 0);
  const rifiuto = await giro(t, { comeRisponde: (m) => (m === CONV ? 404 : 'ok'), statoModelliRiassunto: new Map() });
  assert.equal(rifiuto.inutilizzabili.length, 0, 'senza una scelta della persona o dell’ospite non c’è «Scegli un altro»');
});

/* D8 (revisione di fine fase, 01/11/2026): sulla strada del giro il limite di account si perdeva e la riserva dello stesso conto si chiamava lo stesso */
const creditoFinito = () => Object.assign(new Error('Credit not available at the provider.'), { code: 'PROVIDER_REQUEST_ERROR', stato: 402, classe: 'credito', transitorio: false });
const limiteDelPiano = (retryAt) => Object.assign(new Error('You hit your plan limit.'), { code: 'CHATGPT_LIMITE_DEL_PIANO', stato: 429, ...(retryAt ? { retryAt } : {}) });

test('C6BIS-GIRO-08 — limite di account sullo scelto: la riserva sullo STESSO fornitore non si chiama, quella su un altro sì', async (t) => {
  for (const errore of [creditoFinito, limiteDelPiano]) {
    const stesso = await giro(t, { comeRisponde: (m) => (m === AUX ? errore() : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768, riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: new Map() });
    assert.ok(stesso.riassunti.includes(AUX));
    assert.equal(stesso.riassunti.includes(RIS), false, `chiamata sprecata sullo stesso conto: ${JSON.stringify(stesso.riassunti)}`);
  }
  const ALTRO = 'zai:glm-4.7';
  const altro = await giro(t, { comeRisponde: (m) => (m === AUX ? creditoFinito() : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768, riservaRiassunto: ALTRO, origineRiassunto: 'persona', statoModelliRiassunto: new Map() });
  assert.ok(altro.riassunti.includes(ALTRO), JSON.stringify(altro.riassunti));
});

test('C6BIS-GIRO-09 — un limite di account con l’ora di ritorno resta nella memoria col suo segno: anche al giro dopo la riserva dello stesso conto non si chiama', async (t) => {
  const memoria = new Map();
  const finoAlle = Date.now() + 600_000;
  const primo = await giro(t, { comeRisponde: (m) => (m === AUX ? limiteDelPiano(finoAlle) : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768, riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: memoria });
  assert.equal(primo.riassunti.includes(RIS), false, JSON.stringify(primo.riassunti));
  const { dal, ...ricordato } = memoria.get(AUX);
  assert.equal(Number.isFinite(dal), true, 'da quando è fermo');
  assert.deepEqual({ ...ricordato }, { stato: 'bloccato', motivo: 'limite', finoAlle, scadeAlle: finoAlle, diAccount: true });
  const dopo = await giro(t, { comeRisponde: () => 'ok', modelloRiassunto: AUX, finestraRiassuntoToken: 32_768, riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: memoria });
  assert.deepEqual(dopo.riassunti, [], 'lo scelto è fermo fino all’ora detta e la riserva è sullo stesso conto');
});

test('C6BIS-GIRO-10 (D7, 01/11/2026) — sulla strada del giro: senza chiave la riserva scrive e l’avviso c’è; motore locale non pronto, la riserva scrive senza avviso', async (t) => {
  const conErrore = (errore) => giro(t, { comeRisponde: (m) => (m === AUX ? errore() : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768, riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: new Map() });
  const senzaChiave = await conErrore(() => Object.assign(new Error('The key for DeepSeek is missing.'), { code: 'PROVIDER_KEY_MISSING' }));
  assert.ok(senzaChiave.riassunti.includes(RIS), JSON.stringify(senzaChiave.riassunti));
  assert.deepEqual(senzaChiave.inutilizzabili.map((e) => e.motivo), ['senza-chiave']);
  const motoreSpento = await conErrore(() => Object.assign(new Error('The local engine is not running.'), { code: 'LOCAL_RUNTIME_NOT_READY' }));
  assert.ok(motoreSpento.riassunti.includes(RIS), JSON.stringify(motoreSpento.riassunti));
  assert.equal(motoreSpento.inutilizzabili.length, 0, 'passeggero: nessun «Scegli un altro»');
});

test('C6BIS-GIRO-05 (verso contrario) — senza le opzioni nuove (la CLI di oggi), un riassunto che riesce è identico', async (t) => {
  const { riassunti, inutilizzabili, fine } = await giro(t, { comeRisponde: () => 'ok', modelloRiassunto: AUX, finestraRiassuntoToken: 32_768 });
  assert.ok(riassunti.length >= 1 && riassunti.every((m) => m === AUX), JSON.stringify(riassunti));
  assert.equal(inutilizzabili.length, 0);
  assert.ok(fine.some((e) => e.compattato));
});

/* ---------------------------------------------------------------------------------------------------- il filo dal registro */
const { createSessionRegistry } = await import('../src/session-registry.mjs');
const { avviaSessione } = await import('../src/agent-service.mjs');
const { TaskCatalogError } = await import('../src/task-catalog.mjs');
async function giroSpiato(opzioni) {
  let alKernel = null;
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async (ri) => { alKernel = ri; return { comeFinita: 'concluso', messaggiFinali: [] }; } }),
    preparaEsecuzioneFn: (taskId) => { if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`); return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'c' } }; },
    modello: CONV, chiave: 'k', riassuntoDiFineGiro: false, ...opzioni });
  const { sessionId } = registro.avvia('task-vero');
  const fine = Date.now() + 10_000;
  while (!alKernel && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); });
  registro.ferma?.(sessionId);
  return alKernel;
}

test('C6BIS-FILO-01 — dalle Impostazioni al giro: riserva risolta, la sua finestra, chi ha scelto, la memoria della conversazione', async () => {
  const finestraTokenFn = (m) => ({ [AUX]: 32_768, [RIS]: 16_384 }[m] ?? 1_000_000);
  const conRiserva = await giroSpiato({ sceltaDelRiassuntoFn: () => ({ modelloDelRiassunto: AUX, riservaDelRiassunto: { provider: 'openrouter', model: RIS } }), finestraTokenFn });
  assert.equal(conRiserva.modelloRiassunto, AUX);
  assert.equal(conRiserva.riservaRiassunto, RIS);
  assert.equal(conRiserva.finestraRiservaToken, 16_384);
  assert.equal(conRiserva.origineRiassunto, 'persona');
  assert.ok(conRiserva.statoModelliRiassunto instanceof Map, 'la memoria della conversazione arriva al giro');
  const diretta = await giroSpiato({ sceltaDelRiassuntoFn: () => ({ modelloDelRiassunto: AUX, riservaDelRiassunto: { provider: 'zai', model: 'glm-4.7' } }), finestraTokenFn });
  assert.equal(diretta.riservaRiassunto, 'zai:glm-4.7', 'una via diretta resta nell’id');
  const conversazione = await giroSpiato({ sceltaDelRiassuntoFn: () => ({ modelloDelRiassunto: AUX, riservaDelRiassunto: 'conversazione' }), finestraTokenFn });
  assert.equal(conversazione.riservaRiassunto, CONV, 'la conversazione fa da riserva perché la persona l’ha scelta');
  const ospite = await giroSpiato({ modelloRiassuntoFn: () => AUX, finestraTokenFn });
  assert.equal(ospite.origineRiassunto, 'ospite');
  assert.equal(Object.hasOwn(ospite, 'riservaRiassunto'), false, 'senza riserva scelta non viaggia niente');
});

test('C6BIS-FILO-02 (verso contrario) — una riserva storta, vuota o rotta non viaggia; senza modello dei riassunti nessuna origine', async () => {
  for (const riservaDelRiassunto of [null, {}, { model: '' }, { model: 42 }, 'qualcosa', 7]) {
    const r = await giroSpiato({ sceltaDelRiassuntoFn: () => ({ modelloDelRiassunto: AUX, riservaDelRiassunto }), finestraTokenFn: () => 1_000_000 });
    assert.equal(Object.hasOwn(r, 'riservaRiassunto'), false, JSON.stringify(riservaDelRiassunto));
  }
  const rotta = await giroSpiato({ sceltaDelRiassuntoFn: () => { throw new Error('rotta'); }, finestraTokenFn: () => 1_000_000 });
  assert.equal(Object.hasOwn(rotta, 'riservaRiassunto'), false);
  const nessuno = await giroSpiato({ finestraTokenFn: () => 1_000_000 });
  assert.equal(Object.hasOwn(nessuno, 'origineRiassunto'), false);
});

test('C6BIS-EVENTO-01 — agent-service: il giro dice «inutilizzabile» ⇒ CUSTOM durevole talos.riassunto-modello-inutilizzabile, coi suoi campi', async () => {
  const eventi = [];
  const memoria = new Map();
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: CONV, chiave: 'k', riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: memoria,
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async (input) => {
      assert.equal(input.riservaRiassunto, RIS);
      assert.equal(input.statoModelliRiassunto, memoria, 'la STESSA memoria, non una copia');
      input.onGiro({ giro: 2, tipo: 'riassunto-modello-inutilizzabile', at: '2026-10-30T12:00:00.000Z', modello: AUX, motivo: 'accesso-negato', scelto: 'persona', ruolo: 'scelto' });
      return { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [], recordDiCompattazione: [] };
    } });
  const evento = eventi.find((e) => e.name === 'talos.riassunto-modello-inutilizzabile');
  assert.ok(evento, JSON.stringify(eventi.map((e) => e.name ?? e.type)));
  assert.equal(evento.type, 'CUSTOM');
  const { threadId, runId, ...campi } = evento.value;
  assert.deepEqual(campi, { schema: 'talos.riassunto-modello-inutilizzabile.v1', giro: 2, at: '2026-10-30T12:00:00.000Z', modello: AUX, motivo: 'accesso-negato', scelto: 'persona', ruolo: 'scelto' });
});

test('C6BIS-AVVISO-01 — dopo i 15 minuti lo scelto si riprova; se fallisce ancora l’avviso NON si ripete; torna solo dopo che ha risposto', async (t) => {
  const memoria = new Map();
  const opzioni = (come) => ({ comeRisponde: come, modelloRiassunto: AUX, finestraRiassuntoToken: 32_768, riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: memoria });
  const primo = await giro(t, opzioni((m) => (m === AUX ? 403 : 'ok')));
  assert.equal(primo.inutilizzabili.length, 1);
  memoria.get(AUX).scadeAlle = Date.now() - 1; // sono passati i 15 minuti
  const riprova = await giro(t, opzioni((m) => (m === AUX ? 403 : 'ok')));
  assert.ok(riprova.riassunti.includes(AUX), 'scaduto il ricordo, lo scelto si riprova');
  assert.equal(riprova.inutilizzabili.length, 0, 'l’avviso durevole non si riscrive');
  memoria.get(AUX).scadeAlle = Date.now() - 1; // il ricordo rinnovato dal tentativo fallito scade di nuovo
  const tornato = await giro(t, opzioni(() => 'ok'));
  assert.ok(tornato.riassunti.includes(AUX), JSON.stringify(tornato.riassunti));
  assert.equal(memoria.has(AUX), false, 'ha risposto: il ricordo se ne va');
  const diNuovo = await giro(t, opzioni((m) => (m === AUX ? 404 : 'ok')));
  assert.equal(diNuovo.inutilizzabili.length, 1, 'dopo una risposta riuscita, un nuovo guasto si dice di nuovo');
  assert.equal(diNuovo.inutilizzabili[0].motivo, 'non-trovato');
});

test('C6BIS-FILO-03 — la memoria è della CONVERSAZIONE: due giri della stessa sessione ricevono lo stesso oggetto', async () => {
  const ingressi = [];
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: async (input) => {
      ingressi.push(input);
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${ingressi.length}` });
      input.onEvento({ type: 'RunFinished' });
      return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }], recordDiCompattazione: [] } };
    },
    preparaEsecuzioneFn: (taskId) => { if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`); return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'c' } }; },
    modello: CONV, chiave: 'k', riassuntoDiFineGiro: false, sceltaDelRiassuntoFn: () => ({ modelloDelRiassunto: AUX, riservaDelRiassunto: { model: RIS } }), finestraTokenFn: () => 1_000_000 });
  const { sessionId } = registro.avvia('task-vero');
  for (let i = 0; i < 200 && ingressi.length < 1; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  for (let i = 0; i < 100 && registro.stato?.(sessionId)?.inCorso; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  await new Promise((r) => { setTimeout(r, 50); });
  registro.resume(sessionId, 'ancora');
  for (let i = 0; i < 200 && ingressi.length < 2; i += 1) await new Promise((r) => { setTimeout(r, 10); });
  registro.ferma?.(sessionId);
  assert.equal(ingressi.length, 2, 'due giri');
  assert.ok(ingressi[0].statoModelliRiassunto instanceof Map);
  assert.equal(ingressi[1].statoModelliRiassunto, ingressi[0].statoModelliRiassunto, 'la stessa memoria, non una nuova a ogni giro');
});

test('C6BIS-RIGA-01 — la catena finita senza modelli: la ragione è «non-disponibile» col modello e il perché, MAI «esaurito» (falliti di fila)', async (t) => {
  const { fine, preparate } = await giro(t, { comeRisponde: (m) => (m === AUX ? 'rete' : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768, origineRiassunto: 'ospite', statoModelliRiassunto: new Map() });
  /* col «mai aspettare» il riassunto del modello si prepara in sottofondo: è la PREPARAZIONE che fallisce, e lo dice col suo perché */
  const fallite = [...fine, ...preparate].filter((e) => e.compattato === false && e.nonDisponibile);
  assert.ok(fallite.length >= 1, JSON.stringify([...fine, ...preparate].map((e) => ({ tipo: e.tipo, compattato: e.compattato, motivo: e.motivo, ragione: e.ragione, nonDisponibile: e.nonDisponibile }))));
  assert.deepEqual(fallite[0].nonDisponibile, { modello: AUX, stato: 'bloccato', motivo: 'rete' });
  assert.equal(fine.some((e) => e.ragione === 'esaurito'), false, 'un solo errore di rete non è «fallito più volte di fila»');
});

test('C6BIS-RIGA-02 — il riassunto scritto dalla riserva dice chi l’ha scritto (CLI 30/10)', async (t) => {
  const tutti = [];
  /* riassuntiPrimaDellaChat: senza, il riassunto della riserva preparato in sottofondo poteva essere ancora «in arrivo» quando il giro ne
     aveva bisogno ⇒ il rapido (giusto: mai aspettare), e la prova cadeva 1 volta su ~10 (30/10, causa misurata: ripiego classe «in-arrivo») */
  const { fine } = await giro(t, { comeRisponde: (m) => (m === AUX ? 403 : 'ok'), modelloRiassunto: AUX, finestraRiassuntoToken: 32_768, riservaRiassunto: RIS, origineRiassunto: 'persona', statoModelliRiassunto: new Map(), riassuntiPrimaDellaChat: true });
  tutti.push(...fine);
  const scritti = tutti.filter((e) => e.riassuntoDi);
  assert.ok(scritti.length >= 1, JSON.stringify(tutti.map((e) => ({ compattato: e.compattato, ripiego: e.ripiego, classe: e.classe, ragione: e.ragione, motivo: e.motivo, istantanea: e.istantanea, migliora: Boolean(e.migliora), riassuntoDi: e.riassuntoDi }))));
  assert.equal(scritti[0].riassuntoDi, RIS);
  assert.equal(scritti[0].dallaRiserva, true);
});

test('C6BIS-EVENTO-02 — agent-service: «chi l’ha scritto» e «non disponibile» arrivano nei CUSTOM durevoli della compattazione', async () => {
  const eventi = [];
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: CONV, chiave: 'k',
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async (input) => {
      input.onGiro({ giro: 1, tipo: 'compattazione-inizio', tokenMisurati: 9_000, soglia: 8_000, motivo: 'soglia' });
      input.onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: true, tokenPrima: 9_000, tokenDopo: 2_000, record: { at: '2026-10-30T12:00:00.000Z', coveredThrough: 4, riassunto: 'R' }, riassuntoDi: RIS, dallaRiserva: true });
      input.onGiro({ giro: 2, tipo: 'compattazione-preparata', compattato: false, motivo: 'esaurito', classe: 'errore-rete', nonDisponibile: { modello: AUX, stato: 'bloccato', motivo: 'rete' } });
      return { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [], recordDiCompattazione: [] };
    } });
  const fine = eventi.find((e) => e.name === 'talos.compattazione' && e.value?.compattato === true)?.value;
  assert.ok(fine, JSON.stringify(eventi.map((e) => e.name ?? e.type)));
  assert.equal(fine.riassuntoDi, RIS);
  assert.equal(fine.dallaRiserva, true);
  const preparata = eventi.find((e) => e.name === 'talos.compattazione-preparata')?.value;
  assert.deepEqual(preparata?.nonDisponibile, { modello: AUX, stato: 'bloccato', motivo: 'rete' });
});

