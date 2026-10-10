/*
 * C13 (coda Codex, owner 10/10/2026: «C13: Stop, fork e figlie») — criterio «fork senza ereditare coda». Un messaggio che la
 *   persona ha messo in coda nell'ORIGINALE è suo e del giro di quella sessione: il fork non lo deve consegnare una seconda
 *   volta, né in memoria né dopo un riavvio (la coda è durevole: righe `coda` nel giornale della sessione,
 *   `session-registry.mjs` `annunciaCoda` / ripristino). Il fork scrive solo la sua storia; queste prove lo inchiodano.
 * Come gli altri (ricerca del 10/10/2026): Codex `thread/fork` crea un thread nuovo con la sola storia copiata (app-server
 *   README, upd.dev/layers/codex/src/branch/main/codex-rs/app-server); Hermes tiene la coda per chiave di sessione
 *   (`apps/desktop/src/store/composer-queue.ts:148`, `QueueState = Record<string, QueuedPromptEntry[]>`, clone 2026-10-07).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SYS = { role: 'system', content: 's' };
const u = (t) => ({ role: 'user', content: t });
const a = (t) => ({ role: 'assistant', content: t });
const fine = (runId) => ({ type: 'RunFinished', threadId: 't', runId });
const passo = () => new Promise((r) => setImmediate(r));

/* Il registro vero, con la storia su disco; il kernel è finto e ogni giro si conclude quando la prova lo dice. */
function registroAGiri(cartellaStore) {
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      const n = giri.length + 1;
      giri.push({ input, concludi: (messaggiFinali) => { input.onEvento(fine(`r${n}`)); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${n}`, input: input.task });
      return attesa;
    },
  });
  return { registro, giri };
}
async function conStore(t, corpo) {
  const cartellaStore = cartellaDiProva('talos-c13-fork-');
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); rimuoviCartellaDiProva(cartellaStore); });
  return corpo(cartellaStore);
}
/* Un'origine col primo giro concluso, un messaggio messo in coda durante il secondo, e poi lo Stop della persona: il giro finisce
   e la coda resta (in pausa) nella sessione ferma — l'unico stato in cui un'origine forkabile ha ancora una coda. */
async function origineConCoda(registro, giri) {
  const { sessionId } = registro.avvia('task-vero');
  giri[0].concludi([SYS, u('c'), a('r1')]); await passo();
  registro.resume(sessionId, 'domanda 2');
  const accodato = registro.accodaMessaggio(sessionId, 'messaggio in coda');
  assert.equal(accodato.ok, true, JSON.stringify(accodato));
  registro.ferma(sessionId);
  giri[1].concludi([SYS, u('c'), a('r1'), u('domanda 2'), a('r2')]); await passo();
  assert.deepEqual(registro.statoCoda(sessionId).voci.map((v) => v.testo), ['messaggio in coda'], 'premise: the stopped original holds it');
  return sessionId;
}

for (const [nome, opzioni] of [['the usual fork', undefined], ['the fork «before the turn»', { primaDelGiro: 'r1' }]]) {
  test(`C13-FORK-CODA: ${nome} does not inherit the original's queue, in memory or after a restart`, async (t) => conStore(t, async (cartellaStore) => {
    const primo = registroAGiri(cartellaStore);
    const origine = await origineConCoda(primo.registro, primo.giri);
    const fork = primo.registro.forka(origine, opzioni);
    assert.equal(fork.code, undefined, fork.erroreAvvio);
    assert.deepEqual(primo.registro.statoCoda(fork.sessionId).voci, [], 'the fork starts with an empty queue');
    assert.deepEqual(primo.registro.statoCoda(origine).voci.map((v) => v.testo), ['messaggio in coda'], 'the original keeps its message');
    await attendiScritture({ cartellaStore });
    const riavvio = registroAGiri(cartellaStore);
    await riavvio.registro.ripristina();
    assert.deepEqual(riavvio.registro.statoCoda(fork.sessionId).voci, [], 'after a restart the fork still has no queue');
    assert.deepEqual(riavvio.registro.statoCoda(origine).voci.map((v) => v.testo), ['messaggio in coda'],
      'AL CONTRARIO: the original\'s queue is on the disk and comes back');
  }));
}
