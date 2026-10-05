/*
 * ⛔⛔ 24/09/2026 sera — IL FLUSSO ROTTO A METÀ (bug dell'owner con la foto, decisione «continuare, come Hermes»).
 * Sessione `65bf2ef2…`, gemini-3.8-flash: il riepilogo è arrivato a metà e il giro è finito con «Troppo traffico presso il
 * fornitore.». Da oggi: testo già arrivato ⇒ resta, e il modello continua da lì; niente di visibile ⇒ stessa richiesta;
 * Contratto superato il 29/09 da RETRY-02: conservare il frammento, nessuna nuova chiamata pagata dall'esito incerto.
 * Hermes: `agent/chat_completion_helpers.py:3431-3468`, `agent/turn_truncation.py:241-280`,
 * `agent/conversation_loop.py:833-836`. Ricerca: `.claude/RICERCA-ERRORE-A-META-RISPOSTA-2026-09-24.md`.
 *
 * ⛔⭐ 05/10/2026 — BUG-16 evoluce RETRY-02 (owner: auto-retry NON negoziabile): quando il giro perso
 * NON ha prodotto NESSUN effetto — nessun testo consegnato, nessuna lettura partita nell'acceleratore
 * E nessuna chiamata ANNUNCIATA nello stream — il kernel ritenta da solo (max 10, attesa svegliabile
 * dallo stop, G02-10). NOTHING-VISIBLE passa al NUOVO contratto; TOOL-CALL-HALF RESTA sul vecchio:
 * una tool_call annunciata (anche a metà, mai partita) è già il modello in territorio d'azione, con la
 * sua card annullata a schermo ⇒ niente reinvio automatico, ripresa manuale (lo pinna anche STREAM-TOOL-ABORT
 * in tests/provider-outcome-unknown.test.mjs, che la cura BUG-16 del 05/10 aveva rotto e resta LA VERITÀ).
 * Il contratto completo del reinvio sicuro: `tests/bug16-auto-retry.test.mjs`;
 * dossier: `scratchpad/piano-bug16-auto-retry-2026-10-05.md` §9-§10.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
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

test('STREAM-BREAK-CONTINUES: testo conservato per ripresa esplicita, nessuna continuazione automatica', async () => {
  const r = rete(
    () => flussoRotto([testo('Ecco il riepilogo: 1. Livello di dettaglio')], traffico()),
    () => flussoIntero([testo(' 2. Linguaggio principale'), fine]),
  );
  const risposte = [];
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, onGiro: (e) => { if (e.tipo === 'risposta') risposte.push(e.risposta.content); } })), e => {
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.ok(e.messaggiDelGiro.some(m => m.content === 'Ecco il riepilogo: 1. Livello di dettaglio'));
    return true;
  });
  assert.equal(r.corpi.length, 1);
  assert.deepEqual(risposte, ['Ecco il riepilogo: 1. Livello di dettaglio']);
});

test('STREAM-BREAK-NOT-TRANSIENT: al contrario, un guasto che il fornitore dichiara non transitorio resta un errore', async () => {
  const credenziale = Object.assign(new Error('Credenziale rifiutata dal fornitore.'), { code: 'PROVIDER_REQUEST_ERROR', classe: 'credenziale', transitorio: false });
  const r = rete(() => flussoRotto([testo('Ecco')], credenziale), () => flussoIntero([testo('mai'), fine]));
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch })), e => e.code === 'PROVIDER_OUTCOME_UNKNOWN' && e.transitorio === false);
  assert.equal(r.corpi.length, 1, 'nessuna seconda chiamata');
});

test('STREAM-BREAK-NOTHING-VISIBLE-RESENT (BUG-16): solo ragionamento, nessun effetto ⇒ un reinvio sicuro', async () => {
  const r = rete(
    () => flussoRotto([ragionamento('Sto pensando')], traffico()),
    () => flussoIntero([testo('Risposta intera.'), fine]),
  );
  const retry = [];
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: (e) => { if (e.tipo === 'provider-retry') retry.push(e); } }));
  assert.equal(r.corpi.length, 2, 'BUG-16: a zero effetti il kernel ritenta da solo');
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(retry.length, 1);
  assert.equal(retry[0].fase, 'attesa');
});

test('STREAM-BREAK-TOOL-CALL-HALF-NOT-RESENT (BUG-16): una chiamata annunciata blocca il reinvio, la ripresa resta manuale', async () => {
  const eventi = [];
  const r = rete(
    () => flussoRotto([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"a.t' } }] } }] }], traffico()),
    () => flussoIntero([testo('mai'), fine]),
  );
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onDelta: (e) => eventi.push(e) })), { code: 'PROVIDER_OUTCOME_UNKNOWN' });
  const annullata = eventi.find((e) => e.tipo === 'tool-annullato');
  assert.equal(annullata?.toolCallId, 'call_1');
  assert.match(annullata.motivo, /it was not run/u);
  assert.equal(r.corpi.length, 1, 'BUG-16: la chiamata annunciata (anche a metà, mai partita) non è zero-effetti: NESSUN reinvio automatico');
});

test('STREAM-BREAK-CEILING: nessuna ripresa automatica anche se esistono altre risposte disponibili', async () => {
  const rotta = () => flussoRotto([testo('pezzo')], traffico());
  const r = rete(rotta, rotta, rotta, rotta, rotta, () => flussoIntero([testo('mai'), fine]));
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch })), { code: 'PROVIDER_OUTCOME_UNKNOWN' });
  assert.equal(r.corpi.length, 1);
});

test('STREAM-BREAK-STOP-DURING-WAIT: stop durante ricezione prevale sull\'errore del flusso', async () => {
  const stop = new AbortController();
  const r = rete(() => flussoRotto([testo('Ecco')], traffico()), () => flussoIntero([testo('mai'), fine]));
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, segnaleStop: stop.signal, onDelta: () => stop.abort() }));
  assert.equal(esito.comeFinita, 'fermato');
  assert.equal(r.corpi.length, 1);
});
