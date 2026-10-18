/*
 * ⛔ REVISIONE AVVERSARIA della G5a del /goal (bugfixer, 15/10/2026) — `feat/goal-g5` @ `a0922cf54`: il giudice nel ciclo.
 *
 * Prove ROSSE apposta, sul registro vero (lo stesso banco di `obiettivo-giudice-registro.test.mjs`), con un controllo verde:
 *  - G5-REV-01: un «sì» che cita SOLO la risposta finale (l'AFFERMAZIONE dell'agente) diventa verde e fa «fatto». Il commit e il
 *    prompt dicono «the final reply is a CLAIM… never evidence by itself»; `giudizioDallaRisposta` accetta `{reply:true}` da sola.
 *  - G5-REV-02: le impronte si fotografano PRIMA della domanda al giudice e il sì si controlla contro quella foto: un file cambiato
 *    MENTRE il giudice pensa (un giro nuovo, la persona) fa «fatto» su un contenuto che non c'è più. dsh-goalloop `judged`: «ciò
 *    che è stato giudicato non è ciò che si consegna ⇒ annullato»; arXiv 2607.10487 (commit-time authorization: l'evidenza deve
 *    essere ancora valida al momento in cui si applica) e arXiv 2608.26306 (verdict staleness, TOCTOU), cercati il 15/10/2026.
 *  - G5-REV-03: la «Verifica» della persona MENTRE il giudice pensa cambia la revisione; il giudizio si scarta (giusto) e il ciclo
 *    esce con un `return` muto: obiettivo ATTIVO, nessun giro, nessun giudice, nessuna pausa. Il ciclo resta fermo in silenzio.
 *  - G5-REV-04: un messaggio della persona MENTRE il giudice pensa apre un giro nuovo; il giudizio del giro VECCHIO chiude
 *    l'obiettivo a «fatto» con il giro nuovo in corso (G4: «se nel frattempo parte un giro, è la fine di QUEL giro a ripassare di qui»).
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G5-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, conversazioneFerma, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { impronta } from '../src/obiettivo/giudice.mjs';

const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const README = '# Install\nRun npm ci.\n';
const RISPOSTA = 'Done: README written.';
const CONTRATTO = { criteri: [
  { testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } },
  { testo: 'the README explains how to install', verifica: { tipo: 'giudizio' } },
] };

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g5-rev-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
/* 18/10/2026: sul runner Windows della CI, sotto il carico della suite intera, 5 s non bastavano (G5-REV-01 controllo ~9 s, push in main
   dopo la #69): il tetto è 15 s, che costa tempo solo a una prova che fallisce. */
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 15_000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
const riposa = async () => { for (let i = 0; i < 20; i += 1) { await passo(); await new Promise((r) => setTimeout(r, 10)); } };
function banco(cartellaStore, cartella, { giudice }) {
  const domande = [];
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: async ({ prompt }) => { domande.push(prompt); return giudice(prompt, domande.length); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
  });
  return { ...b, domande };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
async function giroCheScriveIlReadme(b, sessionId, cartella) {
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === prima + 1, 'il giro parte');
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = b.giri.at(-1).input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
  onEvento({ type: 'TextMessageStart', messageId: 'm1' });
  onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: RISPOSTA });
  b.giri.at(-1).concludi(fine);
}
const si = (prove) => JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'yes', reason: 'install section', evidence: prove }] });
/** Un giudice che aspetta la prova: `dentro` si risolve quando la domanda è arrivata, `rispondi(testo)` la chiude. */
function giudiceInAttesa() {
  let segnala;
  let rispondi;
  const dentro = new Promise((r) => { segnala = r; });
  const risposta = new Promise((r) => { rispondi = r; });
  return { dentro, rispondi, giudice: () => { segnala(); return risposta; } };
}

test('G5-REV-01 controllo — a yes citing the README with its current sha256 makes the goal done', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => si([{ path: 'README.md', sha256: impronta(README) }]) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => stato(b, sessionId).stato === 'fatto', 'fatto');
}));

test('G5-REV-01 (S2) — a yes whose ONLY evidence is the final reply (the agent\'s claim) makes the goal done', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => si([{ reply: true, sha256: impronta(RISPOSTA) }]) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => b.domande.length === 1, 'il giudice risponde');
  await riposa();
  const c2 = stato(b, sessionId).verifica.verdetti.find((v) => v.id === 'c2');
  assert.notEqual(c2.esito, 'verde', 'the final reply is a claim, never evidence by itself: a claim-only yes must not be green');
  assert.notEqual(stato(b, sessionId).stato, 'fatto', 'a goal done on the agent\'s word alone');
}));

test('G5-REV-02 (S3) — the README changes WHILE the judge thinks: the yes on the old content still makes the goal done', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => {
    writeFileSync(join(cartella, 'README.md'), '# Install\n(removed)\n'); // un giro nuovo o la persona, mentre il giudice pensa
    return si([{ path: 'README.md', sha256: impronta(README) }]);
  } });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => b.domande.length === 1, 'il giudice risponde');
  await riposa();
  assert.notEqual(stato(b, sessionId).stato, 'fatto', 'the judged content is not the delivered content: the yes must be void (evidence-stale)');
}));

test('G5-REV-03 (S3) — the person\'s «Check» WHILE the judge thinks: the judgement is dropped and the loop stops in silence, goal still active', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const g = giudiceInAttesa();
  const b = banco(cartellaStore, cartella, { giudice: g.giudice });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await g.dentro;
  const verifica = await b.registro.verificaObiettivo(sessionId); // «Verifica» della persona
  assert.equal(verifica?.ok, true, `premessa: la verifica della persona riesce (${JSON.stringify(verifica)?.slice(0, 160)})`);
  g.rispondi(si([{ path: 'README.md', sha256: impronta(README) }]));
  await riposa();
  const o = stato(b, sessionId);
  const fermoInSilenzio = o.stato === 'attivo' && b.giri.length === giriPrima + 1 && b.domande.length === 1;
  assert.equal(fermoInSilenzio, false, `goal ${o.stato}, turns ${b.giri.length - giriPrima}, judge calls ${b.domande.length}: active, idle, nobody will move it`);
}));

test('G5-REV-04 (S3) — the person writes WHILE the judge thinks: the old turn\'s judgement closes the goal with the new turn running', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const g = giudiceInAttesa();
  const b = banco(cartellaStore, cartella, { giudice: g.giudice });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await g.dentro;
  b.registro.resume(sessionId, 'actually, also add a section on uninstalling');
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: il giro nuovo della persona parte');
  g.rispondi(si([{ path: 'README.md', sha256: impronta(README) }]));
  await riposa();
  const statoConGiroInCorso = stato(b, sessionId).stato;
  b.giri.at(-1).concludi(fine);
  await riposa();
  assert.notEqual(statoConGiroInCorso, 'fatto', 'a judgement of the previous turn closed the goal while a new turn is running');
}));

/*
 * CONFUTA-REV-01: `ultimoEsito` (confutatore.mjs) prova JSON.parse su ogni coppia «{ … }» andando a ritroso, e si ferma solo su un
 * oggetto che si legge. Su un ultimo messaggio pieno di codice SENZA il JSON finale (la figlia ha incollato quello che ha letto e
 * non ha concluso) le prove sono quadratiche in numero e lineari in costo: misurato 15/10, 4,6 KB = 275 ms, 13,8 KB = 2,8 s,
 * 27,6 KB = 10 s. È sincrono: blocca il server intero. Il confutatore non è ancora agganciato (G5b): la prova vale da subito sulla
 * parte pura.
 */
test('CONFUTA-REV-01 (S3) — a 27 KB code-heavy final message with no verdict JSON blocks the event loop for seconds', async () => {
  const { esitoDelConfutatore } = await import('../src/obiettivo/confutatore.mjs');
  const pezzo = 'function f(a) { if (a) { return { x: 1 }; } }\n';
  const controllo = 'I read the files:\n' + pezzo.repeat(600) + '\n{"refuted": false, "reason": "checked"}';
  assert.equal(esitoDelConfutatore(controllo).esito, 'regge', 'controllo: col JSON finale si legge subito');
  const testo = 'I read the files:\n' + pezzo.repeat(600) + '\nI ran out of turns.';
  const t0 = performance.now();
  const esito = esitoDelConfutatore(testo);
  const ms = performance.now() - t0;
  assert.equal(esito.esito, 'senza-esito', 'premessa: nessun esito leggibile');
  assert.ok(ms < 500, `parsing the refuter's last message took ${Math.round(ms)} ms, synchronously, on the server thread`);
});
