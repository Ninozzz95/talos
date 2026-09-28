/*
 * ⛔⛔ 24/09/2026 sera — ASK NELLE SESSIONI NATE PRIMA DI ASK (bug dell'owner, decisione «nota in coda, come il Piano»).
 * La sessione `f2424a97…` è nata il 23/09; ripresa il 24/09 ha risposto a «puoi farmi 4 domande di prova?» con quattro
 * domande in TESTO, perché le istruzioni di Ask entrano nel prompt di sistema solo in una sessione nuova. Qui si prova che
 * una ripresa senza quelle istruzioni le riceve IN CODA alla richiesta, senza salvarle nella storia, e — al contrario —
 * che una sessione che le ha già non le riceve due volte.
 * Ricerca: `.claude/RICERCA-ASK-SESSIONI-RIPRESE-2026-09-24.md` (Hermes `agent/conversation_loop.py:707-711`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const FRASE_ASK = 'call ask_user_question instead of asking in plain text';

function rete() {
  const corpi = [];
  return {
    corpi,
    fetch: async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'fatto', tool_calls: [] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
  };
}
const RIPRESA_VECCHIA = [
  { role: 'system', content: 'Istruzioni del 23/09, senza Ask.' },
  { role: 'user', content: 'ciao analizza la directory' },
  { role: 'assistant', content: 'Fatto.' },
  { role: 'user', content: 'puoi farmi 4 domande di prova?' },
];
const opzioni = (extra) => ({
  cartella: cartellaDiProva('talos-ask-ripresa-'), task: { consegna: 'puoi farmi 4 domande di prova?' }, modello: 'x', chiave: 'y',
  strumentiEstesi: ['ask_user_question'], chiediDomandaFn: async () => ({ risposte: [] }), ...extra,
});
const sistemaConAsk = (messaggi) => messaggi.filter((m) => m.role === 'system' && String(m.content).includes(FRASE_ASK));

test('ASK-RESUMED-TAIL-NOTE: una ripresa senza le istruzioni di Ask le riceve in coda, e la storia salvata non le contiene', async () => {
  const r = rete();
  const esito = await talosLavora(opzioni({ fetchDiRete: r.fetch, messaggiIniziali: RIPRESA_VECCHIA }));
  const inviati = r.corpi[0].messages;
  assert.equal(inviati.at(-1).role, 'system');
  assert.match(inviati.at(-1).content, new RegExp(FRASE_ASK, 'u'), 'l\'ultima riga della richiesta è la nota di Ask');
  assert.equal(inviati[0].content, 'Istruzioni del 23/09, senza Ask.', 'il prompt salvato resta byte per byte: la cache del prefisso non si rompe');
  assert.equal(sistemaConAsk(esito.messaggiFinali).length, 0, 'la nota non entra nella storia salvata');
});

test('ASK-FRESH-NO-DUPLICATE: al contrario, una sessione nuova ha le istruzioni nel prompt e non le riceve una seconda volta', async () => {
  const r = rete();
  await talosLavora(opzioni({ fetchDiRete: r.fetch }));
  assert.equal(sistemaConAsk(r.corpi[0].messages).length, 1);
  assert.match(r.corpi[0].messages[0].content, new RegExp(FRASE_ASK, 'u'));
});

test('ASK-RESUMED-ALREADY-HAS-IT: una ripresa che ha già le istruzioni nel prompt non riceve la nota', async () => {
  /* Il prompt vero di una sessione nuova, non un pezzo scritto a mano: è quello che una ripresa di oggi riporta indietro. */
  const nuova = rete();
  await talosLavora(opzioni({ fetchDiRete: nuova.fetch }));
  const r = rete();
  const conAsk = [nuova.corpi[0].messages[0], ...RIPRESA_VECCHIA.slice(1)];
  await talosLavora(opzioni({ fetchDiRete: r.fetch, messaggiIniziali: conAsk }));
  assert.equal(sistemaConAsk(r.corpi[0].messages).length, 1);
  assert.equal(r.corpi[0].messages.at(-1).role, 'user');
});

test('ASK-TAIL-ONLY-IF-OFFERED: senza l\'attrezzo (un figlio, o una lista che non lo offre) la nota non c\'è', async () => {
  const figlio = rete();
  await talosLavora(opzioni({ fetchDiRete: figlio.fetch, messaggiIniziali: RIPRESA_VECCHIA, agentRole: 'child' }));
  assert.equal(sistemaConAsk(figlio.corpi[0].messages).length, 0);
  const senza = rete();
  await talosLavora(opzioni({ fetchDiRete: senza.fetch, messaggiIniziali: RIPRESA_VECCHIA, strumentiEstesi: [] }));
  assert.equal(sistemaConAsk(senza.corpi[0].messages).length, 0);
});

test('ASK-TAIL-WITH-PLAN: in Piano le due note arrivano insieme, Ask prima e Piano per ultima', async () => {
  const r = rete();
  await talosLavora(opzioni({ fetchDiRete: r.fetch, messaggiIniziali: RIPRESA_VECCHIA, modalitaOperativa: 'piano' }));
  const coda = r.corpi[0].messages.slice(-2);
  assert.match(coda[0].content, new RegExp(FRASE_ASK, 'u'));
  assert.match(coda[1].content, /^Modalità Piano attiva/u);
});
