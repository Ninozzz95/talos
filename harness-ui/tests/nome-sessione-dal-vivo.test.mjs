/*
 * ⛔ Difetto (4) delle foto di Ask e del Piano (24/09): «una sessione creata senza nome si chiama "Compito libero" dal vivo
 *   e prende la consegna come nome dopo il riavvio». Misurato sul disco del 4174 il 26/09: solo la sessione nata
 *   dall'interfaccia («ciao») ha la riga `nome-sessione` (il client rinomina col primo messaggio); quelle nate dalla API no.
 *   Dal vivo il registro dava `nome: null` — e la barra scriveva «Compito libero · cartella scelta a mano» —, al ripristino
 *   ricavava il nome dalla consegna. La regola ora è UNA, `nomeDerivatoDalCompito`, dal vivo e al ripristino.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale, nomeDerivatoDalCompito } from '../src/session-registry.mjs';

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
const avviaSessioneFn = async (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); };

test('SESSION-NAME-LIVE-01 — un compito libero nasce col nome della sua consegna, come dopo un riavvio', () => {
  const preparaEsecuzioneFn = () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'libero:full-access', consegna: 'Leggi   il file\n dei test', consegnaCorta: 'Leggi   il file\n dei test' } });
  const registro = createSessionRegistry({ avviaSessioneFn, preparaEsecuzioneFn, modello: 'z-ai/glm-5.3-flash', chiave: 'k' });
  const { sessionId } = registro.avvia('libero:full-access');
  const riga = registro.elenca().find((s) => s.sessionId === sessionId || s.id === sessionId);
  assert.equal(riga?.nome, 'Leggi il file dei test');
  assert.equal(nomeDerivatoDalCompito('libero:full-access', { consegnaCorta: 'Leggi   il file\n dei test' }), 'Leggi il file dei test', 'la stessa funzione del ripristino');
});

test('SESSION-NAME-LIVE-02 — AL CONTRARIO: un task del catalogo resta senza nome derivato; la consegna lunga si ferma a 80', () => {
  assert.equal(nomeDerivatoDalCompito('task-vero', { consegnaCorta: 'c' }), null);
  assert.equal(nomeDerivatoDalCompito('libero:full-access', { consegnaCorta: '   ' }), null);
  assert.equal(nomeDerivatoDalCompito('libero:full-access', { consegnaCorta: 'x'.repeat(120) }).length, 80);
  const preparaEsecuzioneFn = () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } });
  const registro = createSessionRegistry({ avviaSessioneFn, preparaEsecuzioneFn, modello: 'z-ai/glm-5.3-flash', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');
  const riga = registro.elenca().find((s) => s.sessionId === sessionId || s.id === sessionId);
  assert.equal(riga?.nome ?? null, null);
});
