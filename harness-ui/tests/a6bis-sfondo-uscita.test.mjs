import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { eseguiComando } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

/*
 * ⛔ A6-bis (bugfixer, 08/10/2026) — UN COMANDO SFONDATO DICE QUANDO FINISCE.
 *   Prima la riga «in sfondo» dei Processi restava viva per sempre: sfondato il processo, nessuno ascoltava più la sua uscita,
 *   e il numero sulla scheda la contava. Hermes segna ogni processo in sfondo con codice e motivo (`tools/process_registry.py:599`).
 */
async function preparaEsecuzioneFinta() { return { ok: true, cartella: '/tmp/x', task: { consegna: 'x' } }; }

test('A6B-01: il kernel — un comando partito in sfondo porta la promessa della sua uscita VERA (codice 3)', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'a6b-'));
  const sfondo = new AbortController();
  const esito = await eseguiComando(process.execPath, ['-e', 'setTimeout(() => process.exit(3), 300)'], {
    cwd: cartella, timeoutMs: 10_000, segnaleSfondo: sfondo.signal, fileSfondo: join(cartella, 'uscita.log'), inSfondoSubito: true,
  });
  assert.equal(esito.messoInSfondo, true, 'premessa: la chiamata si chiude subito, in sfondo');
  assert.equal(esito.codice, null, 'sfondato: nessun codice al momento della risposta');
  assert.ok(esito.uscita && typeof esito.uscita.then === 'function');
  const uscita = await esito.uscita;
  assert.equal(uscita.codice, 3);
});

test('A6B-02: AL CONTRARIO — un comando che finisce in primo piano non porta nessuna promessa di sfondo', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'a6b-'));
  const esito = await eseguiComando(process.execPath, ['-e', 'process.exit(0)'], { cwd: cartella, timeoutMs: 10_000 });
  assert.equal(esito.messoInSfondo, undefined);
  assert.equal(esito.uscita, undefined);
});

test('A6B-03: il registro — l\'uscita di uno sfondo diventa un evento DUREVOLE della sessione, con l\'esito come valore', async () => {
  let input = null;
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
  });
  const { sessionId } = registro.avvia('task-vero');
  assert.equal(typeof input.segnalaUscitaSfondo, 'function', 'premessa: il registro la passa al servizio');
  const visti = [];
  registro.iscriviti(sessionId, (e) => { if (e?.name === 'talos.processo-sfondo') visti.push(e.value); });
  input.segnalaUscitaSfondo({ toolCallId: 'c1', codice: 0, segnale: null });
  input.segnalaUscitaSfondo({ toolCallId: 'c2', codice: 2, segnale: null });
  input.segnalaUscitaSfondo({ toolCallId: 'c3', codice: null, segnale: 'SIGTERM' });
  input.segnalaUscitaSfondo({ toolCallId: '', codice: 0 }); // senza id: niente
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(visti.map((v) => [v.toolCallId, v.esito, v.codice, v.segnale]), [
    ['c1', 'riuscito', 0, null], ['c2', 'fallito', 2, null], ['c3', 'terminato', null, 'SIGTERM'],
  ]);
  assert.ok(visti.every((v) => typeof v.finitoAlle === 'string'));
  const riga = registro.elenca().find((s) => s.sessionId === sessionId);
  assert.equal(riga.sequenzaAlRipristino, null, 'una sessione nata da questo server non ha sfondi di prima del riavvio');
});

test('A6B-05: l\'uscita resta nel GIORNALE della sessione — chi riapre la sessione dopo la vede ancora chiusa', async () => {
  const { readFileSync } = await import('node:fs');
  const store = mkdtempSync(join(tmpdir(), 'a6b-giornale-'));
  let input = null;
  const registro = createSessionRegistry({
    cartellaStore: store,
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
  });
  const { sessionId } = registro.avvia('task-vero');
  input.segnalaUscitaSfondo({ toolCallId: 'g1', codice: 0, segnale: null });
  let righe = [];
  for (let i = 0; i < 50 && !righe.length; i += 1) {
    await new Promise((r) => setTimeout(r, 40));
    try { righe = readFileSync(join(store, `${sessionId}.jsonl`), 'utf8').split('\n').filter((r) => r.includes('talos.processo-sfondo')); } catch { righe = []; }
  }
  assert.equal(righe.length, 1, 'l\'evento d\'uscita è scritto nel giornale');
  assert.equal(JSON.parse(righe[0]).value?.esito ?? JSON.parse(righe[0]).evento?.value?.esito, 'riuscito');
});

test('A6B-04: dopo un riavvio l\'elenco dice fin dove gli eventi li ha scritti il server di PRIMA', async () => {
  const store = mkdtempSync(join(tmpdir(), 'a6b-store-'));
  const cartella = mkdtempSync(join(tmpdir(), 'a6b-lavoro-'));
  const sessionId = 'abababab-1111-4111-8111-abababababab';
  let sequenza = 0;
  const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId, taskId: 'libero:a6b', cartella, task: { consegna: 'sfondo', consegnaCorta: 'sfondo' },
      comandoProva: null, forkDa: null, avviataAlle: '2026-10-08T10:00:00.000Z', modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium',
      mobile: false, permessi: 'Full access', permessiPerAttrezzo: null, padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null,
      modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true },
    evento('RunStarted', { threadId: sessionId, runId: 'r1' }),
    evento('ToolCallStart', { toolCallId: 'bg1', toolCallName: 'shell' }),
    evento('ToolCallResult', { toolCallId: 'bg1', content: 'IN BACKGROUND: started in the background on request.', inSfondo: true }),
    evento('RunFinished', { threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } }),
  ];
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(store, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
  const registro = createSessionRegistry({ cartellaStore: store, avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  await registro.ripristina();
  const riga = registro.elenca().find((s) => s.sessionId === sessionId);
  assert.ok(riga, 'premessa: la sessione è stata ripristinata');
  assert.equal(riga.sequenzaAlRipristino, sequenza, 'l\'ultima sequenza scritta prima del riavvio');
});

/*
 * ⛔ A6-bis R2 (08/10/2026) — UNO SFONDATO RESTA FERMABILE FINCHÉ VIVE (richiesta della CLI: `talos -p` a fine giro ferma gli
 *   sfondi che ha avviato). Prima `sgancia` scattava nel `finally` appena la chiamata tornava «in sfondo»: il registro perdeva
 *   la riga e lo Stop rispondeva «non in corso» per un processo vivo. Ora si sgancia all'uscita vera.
 *   E (G2, review di talos desktop) un'eccezione dentro il segnalatore non diventa un rifiuto senza gestore.
 */
test('A6B-06: il kernel — lo sfondato resta registrato fermabile fino alla sua uscita vera; un segnalatore che lancia non fa danni', async (t) => {
  const { talosLavora } = await import('../src/kernel/talosHarness.mjs');
  const cartella = mkdtempSync(join(tmpdir(), 'a6b-fermabile-'));
  let esci = null;
  const uscita = new Promise((r) => { esci = r; });
  const registrati = new Set();
  const segnalati = [];
  const rifiuti = [];
  const suRifiuto = (motivo) => rifiuti.push(motivo);
  process.on('unhandledRejection', suRifiuto);
  t.after(() => process.off('unhandledRejection', suRifiuto));
  let n = 0;
  const fetchDiRete = async () => {
    n += 1;
    const message = n === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'bg1', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando: 'npm run dev', background: true }) } }] }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  await talosLavora({
    cartella, task: { consegna: 'lancia' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'accesso-pieno', fetchDiRete,
    chiediApprovazioneFn: async () => true,
    eseguiComandoSandboxatoFn: async () => ({ codice: null, messoInSfondo: true, daSfondo: 'richiesta', testo: 'IN BACKGROUND', parziale: '', uscita, fileSfondo: '/tmp/bg1.log' }),
    registraComandoFermabile: ({ toolCallId }) => { registrati.add(toolCallId); return () => registrati.delete(toolCallId); },
    segnalaUscitaSfondo: (u) => { segnalati.push(u); throw new Error('il segnalatore lancia'); },
  });
  assert.equal(registrati.has('bg1'), true, 'finito il giro, lo sfondato vivo è ancora fermabile dalla sua riga');
  esci({ codice: 0, segnale: null });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(registrati.has('bg1'), false, 'uscito davvero, la riga non è più fermabile');
  assert.deepEqual(segnalati.map((u) => [u.toolCallId, u.codice]), [['bg1', 0]]);
  /* C06 (10/10/2026): il kernel passa anche il comando e il file dell'uscita, per la nota al modello */
  assert.deepEqual(segnalati.map((u) => [u.comando, u.file]), [['npm run dev', '/tmp/bg1.log']]);
  assert.deepEqual(rifiuti, [], 'l\'eccezione del segnalatore non è un rifiuto senza gestore');
});

/*
 * ⛔ A6-bis R2 (review di talos desktop, M6/M7) — LA STESSA REGOLA SUL `!` DELLA PERSONA (`eseguiComandoDiretto`), che la CLI usa
 *   anche lei: lo sfondato resta fermabile finché vive, e un segnalatore che lancia non diventa un rifiuto senza gestore.
 */
test('A6B-07: il `!` della persona — sfondato resta fermabile fino all\'uscita vera; un segnalatore che lancia non fa danni', async (t) => {
  const { eseguiComandoDiretto } = await import('../src/agent-service.mjs');
  let esci = null;
  const uscita = new Promise((r) => { esci = r; });
  const registrati = new Set();
  const segnalati = [];
  const rifiuti = [];
  const suRifiuto = (motivo) => rifiuti.push(motivo);
  process.on('unhandledRejection', suRifiuto);
  t.after(() => process.off('unhandledRejection', suRifiuto));
  const eventi = [];
  await eseguiComandoDiretto({
    cartella: mkdtempSync(join(tmpdir(), 'a6b-persona-')), comando: 'npm run dev', onEvento: (e) => eventi.push(e),
    eseguiComandoSandboxatoFn: async () => ({ codice: null, messoInSfondo: true, daSfondo: 'persona', testo: 'IN BACKGROUND', parziale: '', uscita, fileSfondo: '/tmp/persona.log' }),
    registraComandoFermabile: ({ toolCallId }) => { registrati.add(toolCallId); return () => registrati.delete(toolCallId); },
    segnalaUscitaSfondo: (u) => { segnalati.push(u); throw new Error('il segnalatore lancia'); },
  });
  const toolCallId = eventi.find((e) => e.type === 'ToolCallStart')?.toolCallId;
  assert.ok(toolCallId, 'premessa: il comando ha la sua riga');
  assert.equal(registrati.has(toolCallId), true, 'tornata la chiamata, lo sfondato vivo è ancora fermabile dalla sua riga');
  esci({ codice: 0, segnale: null });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(registrati.has(toolCallId), false, 'uscito davvero, la riga non è più fermabile');
  assert.deepEqual(segnalati.map((u) => [u.toolCallId, u.codice]), [[toolCallId, 0]]);
  /* C06 (owner 10/10/2026, «Sì, anche i miei»): anche il «!» passa comando e file, per la nota al modello */
  assert.deepEqual(segnalati.map((u) => [u.comando, u.file, u.dellaPersona]), [['npm run dev', '/tmp/persona.log', true]]);
  assert.deepEqual(rifiuti, [], 'l\'eccezione del segnalatore non è un rifiuto senza gestore');
});
