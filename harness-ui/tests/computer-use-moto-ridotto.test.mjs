/*
 * Reperto 17 della revisione COMPUTER USE (giudice v1470; Desktop 13/11 su 4550cc8bb): l'attrezzo legge `sessione.motoRidotto` (`attrezzo.mjs:1000`), ma la
 * porta della sessione del registro non l'aveva (grep 0): il cursore volava sempre, anche a chi ha scelto «Riduci movimento» (decisione 252: «col movimento
 * ridotto nessuna attesa»). Il filo: la pagina del PC lo dice al server con le impostazioni della sessione (`POST …/settings`, `motoRidotto`, come la lingua
 * delle risposte: dello schermo di chi guarda, in memoria, mai su disco) e la porta della sessione lo rilegge a ogni passo.
 * Come Claude Code, che rispetta il movimento ridotto del sistema, dell'editor o della sua impostazione (`CHANGELOG.md:1081`).
 * ⛔ Nessuna prova tocca lo schermo: l'ospite del computer use è finto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { NOME_COMPUTER_USE } from '../src/kernel/talosHarness.mjs';
import { creaOspiteComputerUse } from '../src/computer-use/attrezzo.mjs';
import { EVENTI } from '../src/computer-use/ciclo.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function registroCon(t) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-cu-moto-'));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  const giri = [];
  const sessioni = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return new Promise(() => {}); },
    modello: 'openai/gpt-x', chiave: 'k', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'apri il blocco note' } }),
    attrezziKernelFn: async () => ({ base: [], estesi: [NOME_COMPUTER_USE].map((nome) => ({ nome, descrizione: nome, tokenSchemaStimati: 1 })) }),
    ricercaWebFn: () => ({ ricercaWeb: null }),
    ospiteLuoghiFn: async () => ({ ok: true, testo: 'luoghi' }),
    ospiteComputerUseFn: async (_nome, _argomenti, opzioni) => { sessioni.push(opzioni.sessione); return { ok: true, testo: 'fatto' }; },
  });
  const { sessionId } = registro.avvia('task-vero', {});
  t.after(async () => { await registro.chiudi?.({ attesaMassimaMs: 300 }); await rimuoviCartellaDiProvaAttesa(radice); });
  const porta = async () => {
    await giri[0].onComputerUseFn(NOME_COMPUTER_USE, { task: 'x' }, { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal });
    return sessioni.at(-1);
  };
  return { registro, sessionId, porta };
}
const ridotto = (s) => (typeof s.motoRidotto === 'function' ? s.motoRidotto() : s.motoRidotto);

test('MR-01 la porta della sessione dice il movimento ridotto, riletto a ogni passo; di serie no', async (t) => {
  const { registro, sessionId, porta } = await registroCon(t);
  const s = await porta();
  assert.equal(typeof s.motoRidotto, 'function', 'la porta della sessione porta il movimento ridotto (attrezzo.mjs lo legge)');
  assert.equal(ridotto(s), false, 'di serie il cursore vola (decisione 252)');
  assert.deepEqual(registro.impostaMotoRidotto(sessionId, true), { aggiornata: true });
  assert.equal(ridotto(s), true, 'la stessa porta lo rilegge: vale anche a compito già partito');
  assert.deepEqual(registro.impostaMotoRidotto(sessionId, false), { aggiornata: true });
  assert.equal(ridotto(s), false);
  for (const storto of ['si', 1, null, undefined, {}]) assert.equal(registro.impostaMotoRidotto(sessionId, storto).code, 'QUERY_INVALID', JSON.stringify(storto));
  assert.equal(registro.impostaMotoRidotto('assente', true).code, 'NOT_FOUND');
});

test('MR-02 dalla pagina al server: `POST …/settings` con `motoRidotto`, da solo o con la lingua; un valore storto si ferma al parser', async (t) => {
  const b = await registroCon(t);
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: b.registro });
  const server = createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => server.close(ok)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const manda = (corpo) => fetch(`${base}/api/v1/sessions/${b.sessionId}/settings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  const s = await b.porta();
  assert.equal((await manda({ motoRidotto: true })).status, 200);
  assert.equal(ridotto(s), true);
  assert.equal((await manda({ motoRidotto: false, linguaInterfaccia: 'en' })).status, 200);
  assert.equal(ridotto(s), false);
  for (const storto of ['si', 1, null]) assert.equal((await manda({ motoRidotto: storto })).status, 400, JSON.stringify(storto));
  assert.equal(ridotto(s), false);
});

/* Giro 4 della bolla (controllore CU, 13/11, mutante M2 vivo): nessuna prova seguiva il filo registro → attrezzo → ciclo con la porta nella forma che dà
   davvero il registro, una FUNZIONE. CUR-11 passa `motoRidotto: true`, MR-01 legge la porta senza attrezzo. Qui la porta vera del registro entra nell'attrezzo
   vero, che la passa al ciclo vero: la durata del volo nell'annuncio è quella che vede il segno. L'aiutante è finto (nessuno schermo). */
const FIN = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Senza titolo - Blocco note', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
const STATO = { window_title: FIN.title, app_name: FIN.app_name, window_bounds: FIN.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Document', label: 'Editor di testo', frame: { x: 10, y: 60, w: 1200, h: 600 } }] };
const aiutanteFinto = () => ({
  async apri() { return { ok: true }; },
  compito() { return () => {}; },
  async chiama(nome) {
    if (nome === 'list_windows') return { ok: true, dati: { windows: [FIN] }, immagine: null, errore: null };
    if (nome === 'get_window_state') return { ok: true, dati: STATO, immagine: null, errore: null };
    return { ok: true, dati: {}, immagine: null, errore: null };
  },
});
const SCRIVI = { actions: [{ type: 'type', ref: 'e1', text: 'ciao' }] };
/** Un compito intero con la porta del registro: le durate degli annunci, in ordine. `traIPassi(n)` gira prima della risposta n del modello. */
async function durateDelCompito(porta, risposte, traIPassi = () => {}) {
  const eventi = []; let n = 0;
  const sessione = {
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
    chiediModello: async () => { traIPassi(n); const r = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(r), usage: { prompt_tokens: 10, completion_tokens: 5 } }; },
    chiediDomanda: async (qs) => ({ status: 'answered', answers: Object.fromEntries(qs.map((q) => [q.id, 'Allow'])) }),
    emetti: (nome, dati) => eventi.push({ nome, dati }),
    motoRidotto: porta.motoRidotto, // la porta VERA del registro, una funzione
  };
  const r = await creaOspiteComputerUse({ aiutante: aiutanteFinto() })(NOME_COMPUTER_USE, { task: 'type hello in Notepad' },
    { fase: 'esegui', toolCallId: 'call-moto', segnale: new AbortController().signal, livelloAccesso: 'scrittura-progetto', sessione });
  assert.equal(r.ok, true, r.testo);
  return eventi.filter((e) => e.nome === EVENTI.annuncio).map((e) => e.dati.durata);
}

test('MR-03 filo intero registro → attrezzo → ciclo con la porta in forma di funzione: «Riduci movimento» toglie il volo, un valore storto non lo cambia', async (t) => {
  const { registro, sessionId, porta } = await registroCon(t);
  const s = await porta();
  assert.equal(typeof s.motoRidotto, 'function', 'la forma che dà il registro');
  const fatto = [SCRIVI, { done: { success: true, note: 'typed' } }];
  assert.deepEqual(await durateDelCompito(s, fatto), [850], 'di serie il cursore vola');
  assert.deepEqual(registro.impostaMotoRidotto(sessionId, true), { aggiornata: true });
  assert.deepEqual(await durateDelCompito(s, fatto), [0], 'col movimento ridotto della persona il cursore non vola');
  /* un valore storto si ferma al registro e non cambia la scelta di prima */
  assert.equal(registro.impostaMotoRidotto(sessionId, 'si').code, 'QUERY_INVALID');
  assert.deepEqual(await durateDelCompito(s, fatto), [0], 'resta ridotto');
  assert.deepEqual(registro.impostaMotoRidotto(sessionId, false), { aggiornata: true });
  assert.deepEqual(await durateDelCompito(s, fatto), [850]);
});

test('MR-04 la porta della funzione si rilegge a ogni passo: «Riduci movimento» acceso a metà compito vale dal passo dopo', async (t) => {
  const { registro, sessionId, porta } = await registroCon(t);
  const s = await porta();
  const due = [SCRIVI, SCRIVI, { done: { success: true, note: 'typed' } }];
  const durate = await durateDelCompito(s, due, (n) => { if (n === 1) registro.impostaMotoRidotto(sessionId, true); });
  assert.equal(durate.length, 2, JSON.stringify(durate));
  assert.equal(durate[0] > 0, true, 'il primo passo vola');
  assert.equal(durate[1], 0, 'il secondo, dopo la scelta della persona, no');
  /* AL CONTRARIO: spento a metà compito, il passo dopo torna a volare */
  const inverso = await durateDelCompito(s, due, (n) => { if (n === 1) registro.impostaMotoRidotto(sessionId, false); });
  assert.equal(inverso[0], 0);
  assert.equal(inverso[1] > 0, true);
});
