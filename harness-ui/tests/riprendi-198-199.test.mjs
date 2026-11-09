/*
 * Decisions 198 and 199 (owner 04/11/2026 20:22; form `FORMA-RIPRENDI-198-199-2026-11-04.md`, OK from Mobile, CLI and Performance,
 * owner decision 213: D1 a, D2 a, D4 a).
 *   198 — the ▶ «Resume» is on only when there is something to resume (after a Stop, a provider error, the turn limit or a restart),
 *         like Claude Code; after an answer that finished well it is off (it used to ask the same question again: a paid turn for a
 *         duplicate, measured). «Retry» on an answer: a branch cut before that turn, with the same message sent again, in ONE call.
 *   199 — while the model is answering the ▶ is off (the server keeps refusing with its 409).
 * The server says it with one derived field, `daRiprendere` ('fermata' | 'errore' | 'giri-finiti' | 'interrotta' | null), read by the
 * gate of `resume()` and by the rows: the button and the server can never say two different things.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { daRiprendereDaEventi } from '../src/da-riprendere.mjs';
import { NOTA_RIPRENDI_DOPO_ERRORE, NOTA_RIPRENDI_DOPO_INTERRUZIONE } from '../src/kernel/talosHarness.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CASI = JSON.parse(readFileSync(new URL('../contracts/da-riprendere.casi.json', import.meta.url), 'utf8'));
const SYS = { role: 'system', content: 's' };
const u = (t) => ({ role: 'user', content: t });
const a = (t) => ({ role: 'assistant', content: t });
const passo = () => new Promise((r) => setImmediate(r));

/** A registry with a fake model: every turn is held until the test closes it, the way the real kernel closes it. */
function banco(cartellaStore = null) {
  const giri = [];
  const eventi = [];
  const fornitore = { pronto: true };
  const registro = createSessionRegistry({
    prontoFn: () => (fornitore.pronto ? { pronto: true } : { pronto: false, codice: 'CONFIG_INVALID' }),
    guardaWorkspaceFn: () => () => {}, ...(cartellaStore ? { cartellaStore } : {}), modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    onEventoFn: (e) => eventi.push(e),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      const n = giri.length + 1;
      const runId = `r${n}`;
      const storia = (coda) => [...(input.messaggiIniziali ?? [SYS, u('c')]), ...coda];
      giri.push({
        input,
        concludi: (coda = [a(`risposta ${n}`)]) => { input.onEvento({ type: 'RunFinished', threadId: 't', runId }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia(coda) } }); },
        chiudiCon: (codice, coda = [], extra = {}) => {
          input.onEvento({ type: 'RunError', threadId: 't', runId, code: codice, message: `closed: ${codice}`, ...extra });
          risolvi({ ok: false, esito: { comeFinita: codice === 'fermato' ? 'fermato' : 'errore', messaggiFinali: storia(coda) }, erroreInterno: codice, codiceErrore: codice });
        },
      });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId, input: input.task });
      return attesa;
    },
  });
  return { registro, giri, eventi, fornitore };
}
const riga = (registro, id) => registro.elenca().find((r) => r.sessionId === id);

test('R198-CASI the shared cases file: every sequence of events gives the expected value (server, PC and phone read the same file)', () => {
  assert.equal(CASI.schema, 'talos.da-riprendere.casi.v1');
  assert.ok(CASI.casi.length >= 15);
  for (const caso of CASI.casi) assert.equal(daRiprendereDaEventi(caso.eventi), caso.atteso, caso.nome);
  /* the other way round: a value the server never gives does not come out of any sequence */
  const valori = new Set(CASI.casi.map((c) => c.atteso));
  assert.deepEqual([...valori].sort(), ['errore', 'fermata', 'giri-finiti', null].sort());
});

test('R198-1 after an answer that finished well there is nothing to resume: the row says null and /resume is refused with no turn and nothing written', async () => {
  const { registro, giri, eventi } = banco();
  const { sessionId } = registro.avvia('task-vero');
  assert.equal(riga(registro, sessionId).daRiprendere, null, 'R198-4 (199): a running turn has nothing to resume');
  assert.equal(registro.resume(sessionId).reason, 'running-wait-resume', 'while running the refusal is the old one');
  giri[0].concludi(); await passo();
  assert.equal(riga(registro, sessionId).daRiprendere, null);
  const eventiPrima = eventi.length;
  const rifiutata = registro.resume(sessionId);
  assert.deepEqual([rifiutata.code, rifiutata.reason], ['SESSION_NOT_READY', 'nothing-to-resume']);
  assert.match(rifiutata.erroreAvvio, /nothing to resume/u);
  assert.equal(giri.length, 1, '⛔ no paid turn for a duplicate');
  assert.equal(eventi.length, eventiPrima, 'no event, nothing written');
  /* the other way round: a message after a finished turn is a new turn, as always */
  assert.equal(registro.resume(sessionId, 'domanda 2').erroreAvvio, undefined);
  assert.equal(giri.length, 2);
  /* and a delivery from the queue is not a duplicate either, even with no text: it is work the person sent */
  giri[1].concludi(); await passo();
  assert.notEqual(registro.resume(sessionId, null, [], { consegnaCoda: { codaIds: ['q1'], origine: 'prova' } }).reason, 'nothing-to-resume');
});

test('R198-2 after a Stop, an error and the turn limit the ▶ is on and /resume starts the turn', async () => {
  for (const [codice, atteso] of [['fermato', 'fermata'], ['PROVIDER_HTTP_ERROR', 'errore'], ['giri-esauriti', 'giri-finiti']]) {
    const { registro, giri } = banco();
    const { sessionId } = registro.avvia('task-vero');
    giri[0].chiudiCon(codice, [u('tool result')]); await passo();
    assert.equal(riga(registro, sessionId).daRiprendere, atteso, codice);
    const ripresa = registro.resume(sessionId);
    assert.equal(ripresa.erroreAvvio, undefined, `${codice}: ${ripresa.erroreAvvio}`);
    assert.equal(giri.length, 2, codice);
    assert.equal(riga(registro, sessionId).daRiprendere, null, `${codice}: the resumed turn is running`);
  }
});

test('R198-3 a refusal of the model, a paused child and a request that went back to the composer give nothing to resume', async () => {
  for (const [codice, extra] of [['rifiuto-del-modello', {}], ['PROVIDER_EMPTY_RESPONSE', { classe: 'rifiuto-del-modello' }], ['in-pausa', {}]]) {
    const { registro, giri } = banco();
    const { sessionId } = registro.avvia('task-vero');
    giri[0].chiudiCon(codice, [], extra); await passo();
    assert.equal(riga(registro, sessionId).daRiprendere, null, codice);
    assert.equal(registro.resume(sessionId).reason, 'nothing-to-resume', codice);
  }
  const { registro, giri } = banco();
  const { sessionId } = registro.avvia('task-vero');
  giri[0].input.onEvento({ type: 'CUSTOM', name: 'talos.richiesta-non-inviata', value: { at: 'x', indice: 1 } });
  giri[0].chiudiCon('REQUEST_TOO_LARGE'); await passo();
  assert.equal(riga(registro, sessionId).daRiprendere, null, 'resuming would answer the question BEFORE again');
});

test('R198-5 an error with the answer cut in the tail: the model gets ONE resume note at the end, saved, never shown as the person', async () => {
  const { registro, giri, eventi } = banco();
  const { sessionId } = registro.avvia('task-vero');
  giri[0].chiudiCon('PROVIDER_HTTP_ERROR', [a('half an ans')]); await passo();
  assert.equal(registro.resume(sessionId).erroreAvvio, undefined);
  const inviati = giri[1].input.messaggiIniziali;
  assert.deepEqual(inviati.slice(0, -1), [SYS, u('c'), a('half an ans')], 'the prefix is the whole turn before, byte for byte: 0 lost for the cache');
  assert.deepEqual(inviati.at(-1), { role: 'user', content: NOTA_RIPRENDI_DOPO_ERRORE, talosOrigin: 'resume-notice' });
  assert.equal(inviati.filter((m) => m.content === NOTA_RIPRENDI_DOPO_ERRORE).length, 1);
  /* Mobile condition 3: the note is never an event of the person (POP-02 of the 166-bis, the other way round on the stream) */
  assert.equal(JSON.stringify(eventi).includes('[TALOS: the previous turn'), false, 'no event carries the note');
  assert.equal(giri[1].input.giroNonDellaPersona ?? true, true);
  /* the other way round: after a Stop (tail = user/tool) and after an error with a tool result in the tail, no note */
  const altro = banco();
  const s2 = altro.registro.avvia('task-vero').sessionId;
  altro.giri[0].chiudiCon('PROVIDER_HTTP_ERROR', [u('tool result')]); await passo();
  altro.registro.resume(s2);
  assert.equal(altro.giri[1].input.messaggiIniziali.some((m) => m.talosOrigin === 'resume-notice'), false);
});

test('R198-6 a session cut off by a restart, with history: «interrotta», the ▶ is on, and the resume carries the interruption note', async (t) => {
  const cartellaStore = cartellaDiProva('talos-r198-');
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); rimuoviCartellaDiProva(cartellaStore); });
  const primo = banco(cartellaStore);
  const { sessionId } = primo.registro.avvia('task-vero');
  primo.giri[0].concludi(); await passo();
  primo.registro.resume(sessionId, 'domanda 2'); // the server dies during this turn
  await attendiScritture({ cartellaStore });
  const secondo = banco(cartellaStore);
  await secondo.registro.ripristina();
  assert.equal(riga(secondo.registro, sessionId).interrotta, true);
  assert.equal(riga(secondo.registro, sessionId).daRiprendere, 'interrotta');
  const ripresa = secondo.registro.resume(sessionId);
  assert.equal(ripresa.erroreAvvio, undefined, ripresa.erroreAvvio);
  const inviati = secondo.giri[0].input.messaggiIniziali;
  assert.deepEqual(inviati.at(-2), u('domanda 2'), 'the question of the cut turn is still there');
  assert.deepEqual(inviati.at(-1), { role: 'user', content: NOTA_RIPRENDI_DOPO_INTERRUZIONE, talosOrigin: 'resume-notice' });
});

/* ------------------------------------------------------------------------------------------------------------------------ */
test('R198-7 Retry in one call: the branch cut before the turn, the same message sent again, the answer like resume', async () => {
  const { registro, giri, fornitore } = banco();
  const { sessionId } = registro.avvia('task-vero');
  giri[0].concludi([a('r1')]); await passo();
  registro.resume(sessionId, 'domanda 2'); giri[1].concludi([a('r2')]); await passo();
  const esito = registro.riprova(sessionId, { primaDelGiro: 'r2' });
  assert.equal(esito.erroreAvvio, undefined, esito.erroreAvvio);
  assert.deepEqual([esito.forkDa, esito.forkPrimaDelGiro], [sessionId, 'r2']);
  assert.notEqual(esito.sessionId, sessionId);
  assert.equal(giri.length, 3, 'the turn started with no second call (CLI condition 2)');
  assert.deepEqual(giri[2].input.messaggiIniziali, [SYS, u('c'), a('r1'), u('domanda 2')], 'the prefix of the branch, then the same message: the old answer is not seen');
  assert.equal(riga(registro, esito.sessionId).forkPrimaDelGiro, 'r2');
  /* without a point: the last turn of the person */
  giri[2].concludi([a('r2 bis')]); await passo();
  const ultimo = registro.riprova(esito.sessionId);
  assert.equal(ultimo.erroreAvvio, undefined, ultimo.erroreAvvio);
  assert.deepEqual(giri[3].input.messaggiIniziali, [SYS, u('c'), a('r1'), u('domanda 2')]);
  assert.equal(ultimo.forkDa, sessionId, 'the first own turn of a branch is retried from the point of the branch (REV4-R1 of the PC)');
  /* refusals: a running source; and when the resume refuses, NO empty branch is left behind */
  const prima = registro.elenca().length;
  assert.equal(registro.riprova(ultimo.sessionId).reason, 'source-running');
  assert.equal(registro.elenca().length, prima);
  giri[3].concludi([a('r2 ter')]); await passo();
  fornitore.pronto = false;
  const senzaChiave = registro.riprova(sessionId, { primaDelGiro: 'r2' });
  assert.equal(senzaChiave.code, 'CONFIG_INVALID');
  assert.equal(registro.elenca().length, prima, 'a refused Retry leaves no branch');
  assert.equal(giri.length, 4);
  assert.equal(registro.riprova('mai-esistita').code, 'NOT_FOUND');
});

function rottaFinta(riprova) {
  const chiamate = [];
  const sessionRegistry = { riprova: (...args) => { chiamate.push(args); return riprova(...args); }, esiste: () => true };
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  return { chiamate, pc: (corpo) => chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/retry', corpo, origine: 'pc' }) };
}

test('R198-H the route POST /sessions/:id/retry: optional point, a wrong body never reaches the registry, the refusal keeps its reason', async () => {
  const r = rottaFinta((id, opzioni) => ({ sessionId: 'ramo-1', forkDa: id, forkPrimaDelGiro: opzioni?.primaDelGiro ?? 'r9' }));
  assert.deepEqual((await r.pc({ primaDelGiro: 'r2' })).dati, { sessionId: 'ramo-1', forkDa: 's-1', forkPrimaDelGiro: 'r2' });
  assert.deepEqual(r.chiamate.at(-1), ['s-1', { primaDelGiro: 'r2' }]);
  assert.deepEqual((await r.pc({})).dati, { sessionId: 'ramo-1', forkDa: 's-1', forkPrimaDelGiro: 'r9' });
  assert.deepEqual(r.chiamate.at(-1), ['s-1', {}]);
  const quante = r.chiamate.length;
  for (const corpo of [{ primaDelGiro: '../x' }, { primaDelGiro: 7 }, { altro: 1 }, [1]]) {
    await assert.rejects(r.pc(corpo), (e) => e.code === 'QUERY_INVALID' && e.stato === 400, JSON.stringify(corpo));
  }
  assert.equal(r.chiamate.length, quante);
  const k = rottaFinta(() => ({ erroreAvvio: 'no', code: 'SESSION_NOT_READY', reason: 'source-running' }));
  await assert.rejects(k.pc({}), (e) => e.code === 'SESSION_NOT_READY' && e.stato === 409);
});

test('R198-R1 the phone: one operation `session.retry`, a write of the session (consent like session.fork)', async () => {
  const op = OPERAZIONI_HTTP['session.retry'];
  assert.ok(op, 'session.retry exists');
  assert.equal(op.metodo, 'POST');
  assert.equal(op.percorso({ sessionId: 's1' }), '/api/v1/sessions/s1/retry');
  assert.deepEqual(op.corpo({ sessionId: 's1', primaDelGiro: 'r2' }), { primaDelGiro: 'r2' });
  assert.deepEqual(op.corpo({ sessionId: 's1' }), {});
  assert.throws(() => op.percorso({ sessionId: 's1', primaDelGiro: '../x' }), { code: 'BAD_MESSAGE', message: 'A valid turn id is needed.' });
  const sorgente = readFileSync(new URL('../src/remoto/operazioni.mjs', import.meta.url), 'utf8');
  const scritture = sorgente.slice(sorgente.indexOf('const SCRITTURE_DI_SESSIONE'), sorgente.indexOf('export const OPERAZIONI_CONSENSO'));
  assert.match(scritture, /'session\.retry'/u, 'it asks the consent of the folder like session.fork');
});

/* ------------------------------------------------------------------------------------------------------------------------ */
/** The C3 bench (`c3-pausa-figlia-registro.test.mjs`): a parent that delegates, and children the test closes the way the kernel does. */
function bancoFiglie() {
  const avvii = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    avviaSessioneFn: async (input) => {
      let chiudi;
      const attesa = new Promise((r) => { chiudi = r; });
      const avvio = { input, consegna: input.task?.consegna ?? '' };
      avvio.ferma = () => { input.onEvento({ type: 'RunError', code: 'fermato', message: 'stopped' }); chiudi({ ok: false, esito: { detto: 'stopped', comeFinita: 'fermato' } }); };
      avvio.fallisci = () => { input.onEvento({ type: 'RunError', code: 'PROVIDER_REQUEST_ERROR', message: 'refused' }); chiudi({ ok: false, esito: { detto: 'refused', comeFinita: 'errore' }, erroreInterno: 'refused', codiceErrore: 'PROVIDER_REQUEST_ERROR' }); };
      avvio.concludi = () => { input.onEvento({ type: 'RunFinished', outcome: { type: 'success' }, result: { detto: 'fatto' } }); chiudi({ ok: true, esito: { detto: 'fatto', comeFinita: 'concluso' } }); };
      avvii.push(avvio);
      input.onEvento({ type: 'RunStarted', threadId: `t${avvii.length}`, runId: `r${avvii.length}` });
      return attesa;
    },
  });
  const cartella = cartellaDiProva('talos-r198-figlie-');
  const avvio = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'delega', permessi: 'Full access' });
  return { registro, avvii, cartella, madre: () => avvii[0] };
}

test('R198-8 child_control: resume continues a STOPPED child too, retry restarts a FAILED one, the other way round nothing happens', async (t) => {
  const b = bancoFiglie();
  t.after(() => rimuoviCartellaDiProva(b.cartella));
  const madre = b.madre().input;
  assert.equal(typeof madre.retryChildFn, 'function', 'the registry gives the kernel the retry door');
  const fermata = (await madre.onDelega('leggi i file', undefined, { modalita: 'lettura' })).childId;
  assert.equal(madre.stopChildFn({ childId: fermata }).stopped, true);
  b.avvii[1].ferma(); await passo(); await passo();
  const ripresa = madre.resumeChildFn({ childId: fermata });
  assert.deepEqual([ripresa.previous, ripresa.resumed], ['not finished', true], 'a stopped child is resumed like the ▶ of the person');
  assert.match(b.avvii[2].consegna, /You were stopped before you finished/u);
  b.avvii[2].concludi(); await passo(); await passo();
  assert.equal(madre.resumeChildFn({ childId: fermata }).resumed, false, 'a finished child has nothing to resume');
  assert.equal(madre.retryChildFn({ childId: fermata }).retried, false, 'a finished child did not fail: retry does nothing');
  assert.equal(b.avvii.length, 3, 'the refusals started nothing');
  const inErrore = (await madre.onDelega('scrivi il file', undefined, { modalita: 'lettura' })).childId;
  b.avvii[3].fallisci(); await passo(); await passo();
  const continua = madre.resumeChildFn({ childId: inErrore });
  assert.deepEqual([continua.previous, continua.resumed], ['not finished', true], 'a child that ended in an error is resumed too');
  assert.match(b.avvii[4].consegna, /Your previous turn ended before you finished/u);
  b.avvii[4].fallisci(); await passo(); await passo();
  const riprovata = madre.retryChildFn({ childId: inErrore });
  assert.deepEqual([riprovata.previous, riprovata.retried], ['not finished', true]);
  assert.match(b.avvii[5].consegna, /Your previous attempt at this task did not finish/u);
  b.avvii[5].concludi(); await passo(); await passo();
  assert.equal(madre.retryChildFn({ childId: inErrore }).retried, false);
  // AL CONTRARIO (owner 29/10, SAF-PAUSA-01): una figlia fermata dalla PERSONA non la fa ripartire il modello, né col resume né col retry
  const dallaPersona = (await madre.onDelega('cerca nel web', undefined, { modalita: 'lettura' })).childId;
  assert.equal(b.registro.ferma(dallaPersona), true);
  b.avvii[6].ferma(); await passo(); await passo();
  const negata = madre.resumeChildFn({ childId: dallaPersona });
  assert.deepEqual([negata.resumed, negata.reason], [false, 'the person stopped this sub-agent: only the person can resume or retry it']);
  assert.equal(madre.retryChildFn({ childId: dallaPersona }).retried, false);
  assert.equal(b.avvii.length, 7, 'nothing started for a child the person stopped');
  assert.equal(madre.resumeChildFn({ childId: 'non-mia' }).code, 'AGENT_CONTROL_FORBIDDEN');
  assert.equal(madre.retryChildFn({ childId: 'non-mia' }).code, 'AGENT_CONTROL_FORBIDDEN');
});
