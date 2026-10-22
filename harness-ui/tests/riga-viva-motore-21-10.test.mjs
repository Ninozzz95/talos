/*
 * B1 sulla strada del MOTORE DEL CONTESTO (21/10/2026, revisione del Mobile): per le conversazioni nuove il motore è quello di serie,
 * e quando il giro aspettava un riassunto scritto dal motore non arrivava niente — né la riga viva con «Skip», né `riassuntoAtteso`
 * nel registro (lo Skip rispondeva `saltato:false`). Ora il motore dice quando il giro aspetta (`onInTurnWait`), l'adattatore lo
 * traduce nello stesso `compattazione-inizio` della compattazione semplice (`origine:'motore'`) e lo chiude muto (`motivo:'motore'`).
 * Registro VERO, `avviaSessione` VERO, adattatore VERO; finti solo il motore del contesto e la rete.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'Rispondi.' } };
}
const attendi = async (cond, ms = 10_000) => { const fine = Date.now() + ms; while (!cond() && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); }); return cond(); };
const rete = async () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 2 } });

/** Il motore finto: alla prima richiesta, se `aspetta`, annuncia l'attesa e resta fermo finché il segnale della richiesta non scatta. */
function motoreFinto({ aspetta }) {
  const stato = { segnale: null, chiamate: 0, inAttesa: false };
  const hooks = {
    captureProviderResponse: async () => undefined,
    prepare: async ({ messages, signal, onInTurnWait }) => {
      stato.chiamate += 1;
      if (!aspetta || stato.chiamate > 1) return { messages };
      stato.segnale = signal ?? null;
      onInTurnWait?.({ state: 'waiting', jobId: 'job-1', ceilingMs: 600_000 });
      stato.inAttesa = true;
      try {
        await new Promise((_, rifiuta) => {
          const via = () => rifiuta(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          if (signal?.aborted) via(); else signal?.addEventListener('abort', via, { once: true });
        });
      } finally {
        stato.inAttesa = false;
        onInTurnWait?.({ state: 'done', jobId: 'job-1', outcome: 'cancelled' });
      }
      return { messages };
    },
  };
  return { hooks, stato };
}

function registroColMotore(motore) {
  return createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => talosLavora({ ...ri, fetchDiRete: rete }) }),
    contextHooksFn: async () => motore.hooks,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
  });
}
const compattazioni = (registro, sessionId) => (registro.esporta(sessionId)?.eventi ?? []).filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione').map((e) => e.value);
const finito = (registro, sessionId) => (registro.esporta(sessionId)?.eventi ?? []).some((e) => e.type === 'RunFinished' || e.type === 'RunError');

test('MOT-01 il motore aspetta un riassunto: inizio nel giornale, il registro lo sa, Skip arriva al motore, chiusura muta', async () => {
  const motore = motoreFinto({ aspetta: true });
  const registro = registroColMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa), 'il motore è in attesa del riassunto');
  assert.ok(await attendi(() => compattazioni(registro, sessionId).some((v) => v.fase === 'inizio')), JSON.stringify(compattazioni(registro, sessionId)));
  const inizio = compattazioni(registro, sessionId).find((v) => v.fase === 'inizio');
  assert.equal(inizio.motivo, 'soglia', 'apre la riga viva come un riassunto atteso, non come lo sfondo');
  assert.ok(Number.isSafeInteger(inizio.giro), 'col suo giro');
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true }, 'ora lo Skip c\'è');
  assert.ok(await attendi(() => motore.stato.segnale?.aborted === true), 'lo Skip arriva al motore dentro il segnale della richiesta');
  assert.ok(await attendi(() => finito(registro, sessionId)), 'il giro va avanti e finisce');
  const fine = compattazioni(registro, sessionId).find((v) => v.fase === 'fine' && v.motivo === 'motore');
  assert.ok(fine, `la chiusura muta della riga: ${JSON.stringify(compattazioni(registro, sessionId))}`);
  assert.equal(fine.compattato, false);
  assert.equal(fine.giro, inizio.giro);
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: false });
});

test('MOT-02 verso contrario: il motore che non aspetta non apre niente, e lo Skip non si arma', async () => {
  const motore = motoreFinto({ aspetta: false });
  const registro = registroColMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.chiamate >= 1));
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: false });
  assert.ok(await attendi(() => finito(registro, sessionId)));
  assert.deepEqual(compattazioni(registro, sessionId), []);
});

test('MOT-03 (richiesta della CLI) uno Stop durante l\'attesa: la chiusura muta parte lo stesso, e mai una fine senza il suo inizio', async () => {
  const motore = motoreFinto({ aspetta: true });
  const registro = registroColMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa));
  registro.ferma(sessionId);
  assert.ok(await attendi(() => motore.stato.segnale?.aborted === true), 'lo Stop arriva al motore');
  assert.ok(await attendi(() => finito(registro, sessionId)));
  const v = compattazioni(registro, sessionId);
  const inizi = v.filter((x) => x.fase === 'inizio');
  const fini = v.filter((x) => x.fase === 'fine' && x.motivo === 'motore');
  assert.equal(inizi.length, 1, JSON.stringify(v));
  assert.equal(fini.length, 1, JSON.stringify(v));
  assert.equal(fini[0].giro, inizi[0].giro);
  assert.ok(v.indexOf(inizi[0]) < v.indexOf(fini[0]), 'prima l\'inizio, poi la fine');
});

/* 22/10/2026 (Mobile, owner «cura nella 0.1.36»): dopo «Salta il riassunto» il giro ripiega SENZA modello per scelta della persona; la
   riga di «ripiego» (che dice «il motore del contesto non ha funzionato») era di troppo e contraddiceva la riga d'esito. */
test('MOT-04 dopo lo Skip niente riga di «ripiego»: è stata la persona, non un guasto del motore', async () => {
  const motore = motoreFinto({ aspetta: true });
  const registro = registroColMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa));
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true });
  assert.ok(await attendi(() => finito(registro, sessionId)));
  const ripieghi = compattazioni(registro, sessionId).filter((v) => v.fase === 'fine' && v.motivo === 'ripiego');
  assert.deepEqual(ripieghi, [], JSON.stringify(compattazioni(registro, sessionId)));
});

test('MOT-05 verso contrario: un motore che FALLISCE da solo dice ancora «ripiego», una volta', async () => {
  const hooks = {
    captureProviderResponse: async () => undefined,
    prepare: async () => { throw Object.assign(new Error('archivio illeggibile'), { code: 'CTX_INTERNAL' }); },
  };
  const registro = registroColMotore({ hooks });
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => finito(registro, sessionId)));
  const ripieghi = compattazioni(registro, sessionId).filter((v) => v.fase === 'fine' && v.motivo === 'ripiego');
  assert.equal(ripieghi.length, 1, JSON.stringify(compattazioni(registro, sessionId)));
  assert.equal(ripieghi[0].codice, 'CTX_INTERNAL');
});

/*
 * 22/10/2026 — seconda revisione avversaria, difetto C: lo Skip era UN segnale per tutto il giro. Dopo il primo, ogni richiesta
 * successiva dello stesso giro riceveva un segnale già interrotto: il motore annullava subito il riassunto dopo (nessuno l'aveva
 * chiesto), un guasto vero del motore più avanti non si diceva più («ripiego» taciuto), e un secondo Skip non era possibile.
 * Ora il registro riarma il segnale a ogni compattazione che si apre, e il giro lo legge al momento (`saltaRiassuntoFn`).
 * Il modello chiama prima un attrezzo che non esiste: così il giro fa una SECONDA richiesta, e il motore la vede.
 */
function reteConDueRichieste() {
  let chiamate = 0;
  return async () => {
    chiamate += 1;
    if (chiamate === 1) {
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'attrezzo_che_non_esiste', arguments: '{}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 100, completion_tokens: 2 } });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 2 } });
  };
}
/** Il motore finto per giro: `piano[n]` dice cosa fa la richiesta n (0-based): 'aspetta' · 'guasto' · 'passa'. */
function motoreAPiano(piano) {
  const stato = { segnali: [], chiamate: 0, inAttesa: false, abortitoAllArrivo: [] };
  const hooks = {
    captureProviderResponse: async () => undefined,
    prepare: async ({ messages, signal, onInTurnWait }) => {
      const n = stato.chiamate;
      stato.chiamate += 1;
      stato.segnali[n] = signal ?? null;
      stato.abortitoAllArrivo[n] = signal?.aborted === true;
      const cosa = piano[n] ?? 'passa';
      if (cosa === 'guasto') throw Object.assign(new Error('archivio illeggibile'), { code: 'CTX_INTERNAL' });
      if (cosa !== 'aspetta') return { messages };
      const job = `job-${n + 1}`;
      onInTurnWait?.({ state: 'waiting', jobId: job, ceilingMs: 600_000 });
      stato.inAttesa = true;
      try {
        await new Promise((_, rifiuta) => {
          const via = () => rifiuta(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          if (signal?.aborted) via(); else signal?.addEventListener('abort', via, { once: true });
        });
      } finally {
        stato.inAttesa = false;
        onInTurnWait?.({ state: 'done', jobId: job, outcome: 'cancelled' });
      }
      return { messages };
    },
  };
  return { hooks, stato };
}
function registroConRete(motore, fetchDiRete) {
  return createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => talosLavora({ ...ri, fetchDiRete }) }),
    contextHooksFn: async () => motore.hooks,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
  });
}

test('MOT-06 dopo uno Skip, un guasto VERO del motore più avanti nello stesso giro dice ancora «ripiego»', async () => {
  const motore = motoreAPiano(['aspetta', 'guasto']);
  const registro = registroConRete(motore, reteConDueRichieste());
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa));
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true });
  assert.ok(await attendi(() => finito(registro, sessionId)));
  assert.equal(motore.stato.chiamate, 2, 'premessa: il giro ha fatto due richieste');
  const ripieghi = compattazioni(registro, sessionId).filter((v) => v.fase === 'fine' && v.motivo === 'ripiego');
  assert.equal(ripieghi.length, 1, JSON.stringify(compattazioni(registro, sessionId)));
  assert.equal(ripieghi[0].codice, 'CTX_INTERNAL');
});

test('MOT-07 lo Skip vale per la compattazione che salta: la seconda arriva al motore col segnale intatto, e si può saltare di nuovo', async () => {
  const motore = motoreAPiano(['aspetta', 'aspetta']);
  const registro = registroConRete(motore, reteConDueRichieste());
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa && motore.stato.chiamate === 1));
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true }, 'primo Skip');
  assert.ok(await attendi(() => motore.stato.inAttesa && motore.stato.chiamate === 2), `la seconda attesa: ${JSON.stringify(motore.stato)}`);
  assert.equal(motore.stato.abortitoAllArrivo[1], false, 'la seconda richiesta NON riceve lo Skip della prima');
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true }, 'secondo Skip, sulla seconda compattazione');
  assert.ok(await attendi(() => finito(registro, sessionId)));
  const v = compattazioni(registro, sessionId);
  assert.equal(v.filter((x) => x.fase === 'inizio').length, 2, JSON.stringify(v));
  assert.equal(v.filter((x) => x.fase === 'fine' && x.motivo === 'motore').length, 2, `ogni attesa del motore si chiude muta: ${JSON.stringify(v)}`);
  assert.deepEqual(v.filter((x) => x.fase === 'fine' && x.motivo === 'ripiego'), [], 'due Skip, nessun guasto da raccontare');
});

test('MOT-08 (terza revisione) una «fine» che arriva DOPO l\'«inizio» della compattazione seguente non spegne lo Skip di quella', async () => {
  /* l'ordine si costruisce dal registro VERO: l'avvio finto emette i due eventi del giro nell'ordine scomodo e poi aspetta */
  let finisci;
  const registro = createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' });
      const evento = (value) => input.onEvento({ type: 'CUSTOM', name: 'talos.compattazione', value });
      evento({ fase: 'inizio', giro: 1, motivo: 'soglia' }); // X
      evento({ fase: 'inizio', giro: 2, motivo: 'soglia' }); // Y, aperta prima che X si chiuda
      evento({ fase: 'fine', giro: 1, compattato: false, motivo: 'motore' }); // X, in ritardo
      return new Promise((ok) => { finisci = () => { input.onEvento({ type: 'RunFinished' }); ok({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [], recordDiCompattazione: [] } }); }; });
    },
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => typeof finisci === 'function'));
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true }, 'Y è ancora aperta: il suo Skip vale');
  finisci();
  assert.ok(await attendi(() => finito(registro, sessionId)));
});

test('MOT-09 (quinta passata) il ripiego sul cloud riparte da zero: la compattazione rimasta aperta nel giro locale morto non arma lo Skip', async () => {
  let finisci;
  const modelli = [];
  const registro = createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {},
    localRuntimes: { ollama: {} },
    avviaSessioneFn: (input) => {
      modelli.push(input.modello);
      if (String(input.modello).startsWith('ollama:')) {
        /* il giro locale apre una compattazione e muore per errore, senza chiuderla */
        input.onEvento({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', giro: 1, motivo: 'soglia' } });
        input.onEvento({ type: 'RunError', message: 'motore locale irraggiungibile', code: 'RUNTIME_UNREACHABLE' });
        return Promise.resolve({ ok: false, esito: null, erroreInterno: 'motore locale irraggiungibile', codiceErrore: 'RUNTIME_UNREACHABLE' });
      }
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r2' });
      return new Promise((ok) => { finisci = () => { input.onEvento({ type: 'RunFinished' }); ok({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [], recordDiCompattazione: [] } }); }; });
    },
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'vendor/di-serie', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero', { provider: 'local', runtimeId: 'ollama', modelId: 'm', fallbackConsent: true });
  assert.ok(await attendi(() => typeof finisci === 'function'), `premessa: il giro sul cloud è partito (${JSON.stringify(modelli)})`);
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: false }, 'nel giro sul cloud non c\'è niente da saltare');
  finisci();
  assert.ok(await attendi(() => finito(registro, sessionId)));
});
