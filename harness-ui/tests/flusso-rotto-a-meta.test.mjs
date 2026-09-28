/*
 * ⛔⛔ 24/09/2026 sera — IL FLUSSO ROTTO A METÀ (bug dell'owner con la foto, decisione «continuare, come Hermes»).
 * Sessione `65bf2ef2…`, gemini-3.8-flash: il riepilogo è arrivato a metà e il giro è finito con «Troppo traffico presso il
 * fornitore.». Da oggi: testo già arrivato ⇒ resta, e il modello continua da lì; niente di visibile ⇒ stessa richiesta;
 * al massimo quattro riprese di fila; un guasto non transitorio resta un errore; lo stop durante l'attesa ferma davvero.
 * Hermes: `agent/chat_completion_helpers.py:3431-3468`, `agent/turn_truncation.py:241-280`,
 * `agent/conversation_loop.py:833-836`. Ricerca: `.claude/RICERCA-ERRORE-A-META-RISPOSTA-2026-09-24.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
const NOTA = 'Continue exactly where you left off';
const traffico = () => Object.assign(new Error('Troppo traffico presso il fornitore.'), { code: 'PROVIDER_REQUEST_ERROR', classe: 'traffico', transitorio: true });

/** Un flusso che manda i suoi fotogrammi e poi si rompe (l'errore arriva DOPO i pezzi, come nella sessione vera). */
function flussoRotto(fotogrammi, errore) {
  let passo = 0;
  return new Response(new ReadableStream({
    pull(c) {
      if (passo < fotogrammi.length) { c.enqueue(enc.encode(`data: ${JSON.stringify(fotogrammi[passo])}\n\n`)); passo += 1; return; }
      c.error(errore);
    },
  }));
}
function flussoIntero(fotogrammi) {
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  }));
}
const testo = (t) => ({ choices: [{ delta: { content: t } }] });
const ragionamento = (t) => ({ choices: [{ delta: { reasoning: t } }] });
const fine = { choices: [{ delta: {}, finish_reason: 'stop' }] };

function rete(...risposte) {
  const corpi = [];
  return {
    corpi,
    fetch: async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      const r = risposte[corpi.length - 1];
      return typeof r === 'function' ? r() : r;
    },
  };
}
const base = (extra) => ({
  cartella: cartellaDiProva('talos-flusso-rotto-'), task: { consegna: 'riepiloga le mie risposte' }, modello: 'x', chiave: 'y',
  onDelta: () => {}, ...extra,
});

test('STREAM-BREAK-CONTINUES: il testo arrivato resta, e il modello continua da lì invece di chiudere il giro in errore', async () => {
  const r = rete(
    () => flussoRotto([testo('Ecco il riepilogo: 1. Livello di dettaglio')], traffico()),
    () => flussoIntero([testo(' 2. Linguaggio principale'), fine]),
  );
  const risposte = [];
  const t0 = Date.now();
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, onGiro: (e) => { if (e.tipo === 'risposta') risposte.push(e.risposta.content); } }));
  assert.ok(Date.now() - t0 >= 500, 'la ripresa aspetta prima di richiamare il fornitore che ha appena detto «troppo traffico»');
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 2);
  const seconda = r.corpi[1].messages;
  assert.deepEqual(seconda.at(-2), { role: 'assistant', content: 'Ecco il riepilogo: 1. Livello di dettaglio' }, 'il frammento entra nella conversazione');
  assert.equal(seconda.at(-1).role, 'user');
  assert.match(seconda.at(-1).content, new RegExp(NOTA, 'u'), 'e il modello è chiesto di continuare senza ripetere');
  assert.deepEqual(risposte, ['Ecco il riepilogo: 1. Livello di dettaglio', ' 2. Linguaggio principale'], 'a schermo il frammento si chiude com\'è, poi arriva il seguito');
});

test('STREAM-BREAK-NOT-TRANSIENT: al contrario, un guasto che il fornitore dichiara non transitorio resta un errore', async () => {
  const credenziale = Object.assign(new Error('Credenziale rifiutata dal fornitore.'), { code: 'PROVIDER_REQUEST_ERROR', classe: 'credenziale', transitorio: false });
  const r = rete(() => flussoRotto([testo('Ecco')], credenziale), () => flussoIntero([testo('mai'), fine]));
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch })), /Credenziale rifiutata dal fornitore/u);
  assert.equal(r.corpi.length, 1, 'nessuna seconda chiamata');
});

test('STREAM-BREAK-NOTHING-VISIBLE: rotto prima di qualunque testo visibile, si ripete la stessa richiesta senza frammenti', async () => {
  const r = rete(
    () => flussoRotto([ragionamento('Sto pensando')], traffico()),
    () => flussoIntero([testo('Risposta intera.'), fine]),
  );
  const esito = await talosLavora(base({ fetchDiRete: r.fetch }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.deepEqual(r.corpi[1].messages, r.corpi[0].messages, 'nessun messaggio del modello vuoto, nessuna nota: la stessa richiesta');
});

test('STREAM-BREAK-TOOL-CALL-HALF: una chiamata a metà non si esegue, si chiude con l\'esito vero e il giro continua', async () => {
  const eventi = [];
  const r = rete(
    () => flussoRotto([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"a.t' } }] } }] }], traffico()),
    () => flussoIntero([testo('Fatto senza scrivere.'), fine]),
  );
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, onDelta: (e) => eventi.push(e) }));
  assert.equal(esito.comeFinita, 'concluso');
  const annullata = eventi.find((e) => e.tipo === 'tool-annullato');
  assert.equal(annullata?.toolCallId, 'call_1');
  assert.match(annullata.motivo, /non è stata eseguita/u);
  assert.equal(r.corpi[1].messages.some((m) => m.tool_calls?.length), false, 'la chiamata a metà non entra nella conversazione');
});

test('STREAM-BREAK-CEILING: dopo quattro riprese di fila il giro finisce con l\'errore vero', async () => {
  const rotta = () => flussoRotto([testo('pezzo')], traffico());
  const r = rete(rotta, rotta, rotta, rotta, rotta, () => flussoIntero([testo('mai'), fine]));
  const t0 = Date.now();
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch })), /Troppo traffico presso il fornitore/u);
  assert.equal(r.corpi.length, 5, 'la prima richiesta più quattro riprese');
  /* ⛔ La durata è parte della prova: la prima stesura passava in 2 ms perché le attese non avvenivano affatto. */
  assert.ok(Date.now() - t0 >= 7_500, `le quattro attese crescenti (0,5 + 1 + 2 + 4 s) ci sono: ${Date.now() - t0} ms`);
});

test('STREAM-BREAK-STOP-DURING-WAIT: lo stop durante l\'attesa ferma il giro, senza una seconda chiamata', async () => {
  const stop = new AbortController();
  const r = rete(() => { setTimeout(() => stop.abort(), 50); return flussoRotto([testo('Ecco')], traffico()); }, () => flussoIntero([testo('mai'), fine]));
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, segnaleStop: stop.signal }));
  assert.equal(esito.comeFinita, 'fermato');
  assert.equal(r.corpi.length, 1);
});
