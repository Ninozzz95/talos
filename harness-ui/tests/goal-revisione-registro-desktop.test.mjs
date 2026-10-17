/*
 * Le prove di `goal-revisione-registro.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
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
import { testoErroreServer } from '../frontend/src/components/errori.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';
import { TRE_CRITERI, ascolta, conStore, conversazioneFerma, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';



test('REV-GOAL-06 (S2) — when the goal row cannot be SAVED the person reads a sentence about a SUMMARY and compaction, in both languages', async (t) => conStore(t, async (cartellaStore) => {
  /* `salvaObiettivo` rifiuta con `SESSION_STORE_WRITE_FAILED` + `goal-not-saved`, e il dizionario ha la frase giusta. Ma quel
     codice non è in `MESSAGGIO_GIA_PER_LA_PERSONA` (public-problem.mjs): la spiegazione che viaggia è quella di serie del codice,
     scritta per la compattazione («The summary was not confirmed… The original messages remain available»). Il risolutore
     dell'interfaccia confronta la spiegazione del server con la frase del motivo, non la trova, e ripiega su quella del codice. */
  const banco = registroAGiri(cartellaStore, {
    registraRigaFn: async (argomenti, ...resto) => {
      if (argomenti.record?.tipo === 'obiettivo') throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return registraRiga(argomenti, ...resto);
    },
  });
  const sessionId = await conversazioneFerma(banco);
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: banco.registro }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const originale = console.error;
  console.error = () => {};
  t.after(() => { console.error = originale; });

  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}/goal`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testo: 'make it green' }),
  });
  const { error } = await r.json();
  assert.deepEqual([r.status, error.code, error.reason], [503, 'SESSION_STORE_WRITE_FAILED', 'goal-not-saved'], 'premise: the refusal is the goal one');
  impostaLingua('it');
  t.after(() => impostaLingua('it'));
  const detto = { it: testoErroreServer(error) };
  impostaLingua('en');
  detto.en = testoErroreServer(error);
  for (const lingua of ['it', 'en']) {
    const tutto = `${detto[lingua].title} · ${detto[lingua].explanation} · ${detto[lingua].action}`;
    assert.doesNotMatch(tutto, /summary|riassunto|compact|compatt/iu, `${lingua}: «${tutto}»`);
  }
  assert.equal(detto.en.explanation, 'The goal was not saved: nothing changed. Try again after checking the disk.');
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


