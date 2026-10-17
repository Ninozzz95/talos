/*
 * ⛔ REVISIONE AVVERSARIA del /goal G1-G2 (bugfixer, 14/10/2026) — il CABLAGGIO nel registro vero e alla porta HTTP.
 *
 * Prove ROSSE apposta sul codice di `feat/goal` (testa `c671bf3b1`): ognuna mostra un difetto; la cura non è qui.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-2026-10-14.md`.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture, disattivaAffittiArchivio, registraRiga } from '../src/session-store.mjs';
import { nuovoObiettivo, rigaObiettivo } from '../src/obiettivo/stato.mjs';
import { TRE_CRITERI, ascolta, conStore, conversazioneFerma, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('REV-GOAL-04 (S3) — a criterion REMOVED leaves its id free, and the next new criterion takes it: the change is told as «changed», and the new one inherits the old one’s identity', async (t) => conStore(t, async (cartellaStore) => {
  /* `nuovoContratto` dà al criterio senza `id` «il primo libero» NELLA LISTA NUOVA, che non sa quali id il contratto di prima ha
     usato. «Togli c2, aggiungi X» diventa «c2 è cambiato»: la persona conferma un cambio diverso da quello che ha fatto, e X porta
     l'id che lega un criterio alla sua storia («è ciò che lega un criterio alla sua storia quando il contratto cambia»,
     `contratto.mjs`) — in G3 erediterebbe gli esiti di c2. Codex/opencode usano id mai riusati. */
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const { obiettivo } = await banco.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [...TRE_CRITERI] });
  const [c1, , c3] = obiettivo.contratto.criteri;
  const nuovo = { testo: 'The lint is clean', verifica: { tipo: 'comando', comando: 'npm run lint' } };

  const esito = await banco.registro.contrattoObiettivo(sessionId, [c1, c3, nuovo], { conferma: obiettivo.contratto.impronta }) // adattata 14/10: il sì porta l'impronta (REV-GOAL-05);
  assert.equal(esito.ok, true, JSON.stringify(esito));
  const idDelNuovo = esito.obiettivo.contratto.criteri.find((criterio) => criterio.testo === nuovo.testo).id;
  assert.deepEqual(esito.cambio.tolti, ['c2'], `what the person did is «c2 removed, one added»; told: ${JSON.stringify(esito.cambio)}`);
  assert.notEqual(idDelNuovo, 'c2', 'a new criterion never takes the id of a removed one');
}));

test('REV-GOAL-05 (S3) — «conferma: true» is a blank cheque: a criterion ADDED by another window in the meantime is removed without anyone having seen its removal', async (t) => conStore(t, async (cartellaStore) => {
  /* La finestra A legge il contratto [c1 c2 c3], mostra «togli c3» e la persona conferma. Nel frattempo la finestra B aggiunge c4
     (libero, senza conferma). A manda la sua lista intera con `conferma: true`: il registro calcola il confronto sul contratto di
     ADESSO, trova `tolti: c3 c4`, e la conferma — data per c3 — vale anche per c4. Nessun `impronta`/`revisione` attesa viaggia
     con la conferma (è il «If-Match» che manca), quindi il registro non può sapere che cosa la persona aveva davanti. */
  const banco = registroAGiri(cartellaStore);
  const sessionId = await conversazioneFerma(banco);
  const { obiettivo } = await banco.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [...TRE_CRITERI] });
  const [c1, c2] = obiettivo.contratto.criteri; // la finestra A ha davanti questo, e la persona toglie c3

  const daB = await banco.registro.aggiungiCriteriObiettivo(sessionId, [{ testo: 'The build passes', verifica: { tipo: 'comando', comando: 'npm run build' } }]);
  assert.equal(daB.ok, true, JSON.stringify(daB));
  assert.deepEqual(daB.cambio.aggiunti, ['c4'], 'premise: window B added c4');

  const daA = await banco.registro.contrattoObiettivo(sessionId, [c1, c2], { conferma: true });
  const dopo = banco.registro.statoObiettivo(sessionId).obiettivo.contratto.criteri.map((criterio) => criterio.id);
  assert.ok(dopo.includes('c4') || daA.ok !== true, `c4 was removed by a confirmation given for c3 only (now: ${dopo.join(' ')}; told: ${JSON.stringify(daA.cambio)})`);
}));


/* ───────────── due processi sullo stesso archivio (l'affitto): la ricarica ───────────── */

const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-processo-figlio.mjs', import.meta.url));
function avviaFiglio(args) {
  const figlio = spawn(process.execPath, [FIGLIO, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let uscita = '';
  figlio.stdout.setEncoding('utf8');
  figlio.stdout.on('data', (d) => { uscita += d; });
  const fine = new Promise((ok) => figlio.on('exit', (code) => ok(code)));
  return { fine, uscita: () => uscita };
}
const SESSIONE = '0f0f0f0f-0000-4000-8000-00000000600d';
const ADESSO = '2026-10-14T09:00:00.000Z';
let sequenza = 0;
const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
const giro = (n) => [
  evento('RunStarted', { threadId: SESSIONE, runId: `r${n}` }),
  evento('TextMessageContent', { messageId: `m${n}`, delta: `risposta ${n}` }),
  evento('RunFinished', { threadId: SESSIONE, runId: `r${n}`, result: { detto: `risposta ${n}` } }),
];
/** Un archivio con l'affitto, una conversazione conclusa e un obiettivo ATTIVO scritto PRIMA che questo processo partisse. */
async function archivioConObiettivo(t) {
  const store = mkdtempSync(join(tmpdir(), 'talos-goal-affitto-'));
  t.after(() => { disattivaAffittiArchivio(store); rimuoviCartellaDiProva(store); });
  sequenza = 0;
  const intestazione = { tipo: 'intestazione', schema: 1, sessionId: SESSIONE, taskId: 'libero:goal', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    comandoProva: null, forkDa: null, avviataAlle: ADESSO, modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium',
    mobile: false, permessi: 'Read only', permessiPerAttrezzo: null, padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null,
    modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true };
  const { obiettivo } = nuovoObiettivo({ testo: 'make it green', id: 'ob-00000000-0000-4000-8000-000000000001', adesso: ADESSO });
  writeFileSync(join(store, `${SESSIONE}.jsonl`), [intestazione, ...giro(1), rigaObiettivo(obiettivo)].map((r) => `${JSON.stringify(r)}\n`).join(''));
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' },
    avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  await registro.ripristina();
  return { store, registro, obiettivo };
}

test('REV-GOAL-07 (S2) — a goal paused by THIS process’s restart comes back ACTIVE as soon as another process writes anything in the conversation', async (t) => {
  /* Al riavvio l'obiettivo attivo torna in pausa SOLO in memoria (`alRipristino`), il giornale dice ancora «attivo». La ricarica per
     l'affitto (`perRicarica`) prende il giornale com'è, sul presupposto «l'ha scritto adesso un altro processo vivo». Ma la ricarica
     scatta per QUALUNQUE riga scritta altrove (qui: un giro di chat dall'app installata), non per una riga dell'obiettivo: la riga
     dell'obiettivo è quella vecchia, di prima del riavvio. Nessuno ha premuto Riprendi, e l'obiettivo è attivo. */
  const { store, registro } = await archivioConObiettivo(t);
  assert.deepEqual(registro.statoObiettivo(SESSIONE).obiettivo.motivo, { tipo: 'riavvio' }, 'premise: paused by the restart');

  const altro = avviaFiglio([store, SESSIONE, 'scrivi-ed-esci', JSON.stringify(giro(2))]); // l'app scrive un giro di chat, nessun obiettivo
  assert.equal(await altro.fine, 0, altro.uscita());
  assert.deepEqual(await registro.allineaSessione(SESSIONE, { scrivere: false }), { stato: 'libera', ricaricata: true }, 'premise: reloaded');
  const dopo = registro.statoObiettivo(SESSIONE).obiettivo;
  assert.equal(dopo.stato, 'in-pausa', `nobody resumed it, and it is «${dopo.stato}» (reason ${JSON.stringify(dopo.motivo)})`);
});

test('REV-GOAL-08 (S3) — a goal CHANGED by another process reaches this process on reload, but the window already listening is never told', async (t) => {
  /* La ricarica rigioca a chi ascolta gli eventi con `_sequenza` nuova (REG-AFF-01); la riga `obiettivo` non è un evento, e
     l'annuncio `talos.obiettivo` lo fa solo `salvaObiettivo` di QUESTO processo. Dopo la ricarica la memoria ha l'obiettivo nuovo,
     la finestra aperta mostra ancora quello vecchio finché non la si riapre. */
  const { store, registro } = await archivioConObiettivo(t);
  const annunci = ascolta(registro, SESSIONE);
  const { obiettivo: nuovo } = nuovoObiettivo({ testo: 'a different goal, set in the installed app', id: 'ob-00000000-0000-4000-8000-000000000002', adesso: '2026-10-14T10:00:00.000Z' });
  const altro = avviaFiglio([store, SESSIONE, 'scrivi-ed-esci', JSON.stringify([rigaObiettivo(nuovo)])]);
  assert.equal(await altro.fine, 0, altro.uscita());
  assert.equal((await registro.allineaSessione(SESSIONE, { scrivere: false })).ricaricata, true, 'premise: reloaded');
  assert.equal(registro.statoObiettivo(SESSIONE).obiettivo.id, nuovo.id, 'premise: memory has the new goal');
  assert.deepEqual(annunci.map((valore) => valore.obiettivo?.id ?? null), [nuovo.id], 'the listening window is told the goal it shows is not the one there is');
  await attendiScritture({ cartellaStore: store }).catch(() => {});
});
