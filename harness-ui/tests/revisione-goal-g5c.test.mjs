/*
 * ⛔ REVISIONE AVVERSARIA della G5c del /goal (bugfixer, 15/10/2026) — `feat/goal-g5` @ `9383ffd3c` (`5ce2253f5`): il PAVIMENTO,
 *   l'obiettivo senza contratto giudicato sul testo intero. Prove ROSSE apposta, sul registro vero (kernel e giudice finti).
 *  - PAV-REV-01: dopo il primo giudizio del testo l'obiettivo porta `giudizioDelTesto`, che `obiettivoValido` ammette SOLO senza
 *    contratto; `conContratto` toglie `verifica` ma non `giudizioDelTesto` ⇒ aggiungere criteri a un pavimento già giudicato produce
 *    un obiettivo non valido, `rigaObiettivo` lancia dentro il `try` di `salvaObiettivo`, e la persona legge «The goal was not saved…
 *    check the disk». Il passaggio pavimento → contratto è chiuso.
 *  - PAV-REV-02: dopo UNA smentita del confutatore, `confutazione` resta sull'obiettivo; nei giri dopo `ripartiPerLObiettivo` sceglie
 *    `testoDellaSmentita` PRIMA di `testoDelGiudizioDelTesto` ⇒ l'agente riceve ancora la smentita vecchia, mai il motivo del giudice.
 *  - PAV-REV-03: un contratto aggiunto MENTRE il giudice del pavimento pensa: il giudizio si scarta (giusto), e il ciclo esce muto
 *    (`ora.contratto` ⇒ `return`): obiettivo attivo, col contratto, nessuna verifica, nessun giro, nessuna pausa.
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
const CRITERI = [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }];

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g5c-rev-'));
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

/* 18/10/2026: i controlli «fermo in silenzio» aspettano che il giro si MUOVA (o 15 s), invece di 20-30 pause da 10 ms: sul runner lento
   il giro si muoveva dopo, e la prova lo chiamava fermo. Se il giro resta fermo davvero, l'asserzione dopo cade lo stesso. */
const riposaFinche = async (mosso) => { const fino = Date.now() + 15_000; while (Date.now() < fino && !mosso()) { await passo(); await new Promise((r) => setTimeout(r, 10)); } };
function banco(cartellaStore, cartella, { giudice, ...extra }) {
  const domande = [];
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: async ({ prompt }) => { domande.push(prompt); return giudice(prompt, domande.length); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
    ...extra,
  });
  return { ...b, domande };
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
async function giroCheScriveIlReadme(b, sessionId, cartella, testo = 'lavora') {
  const prima = b.giri.length;
  b.registro.resume(sessionId, testo);
  await aspetta(() => b.giri.length === prima + 1, 'il giro parte');
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = b.giri.at(-1).input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
  b.giri.at(-1).concludi(fine);
}
const verdetto = (v) => JSON.stringify({ verdicts: [{ id: 'obiettivo', ...v }] });

test('PAV-REV-01 (S3) — a floor goal already judged once cannot get a contract: the save fails with a disk error', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, { giudice: () => verdetto({ verdict: 'no', reason: 'the README has no uninstall section' }) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document install and uninstall');
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => stato(b, sessionId).giudizioDelTesto?.esito === 'rosso', 'premessa: il giudizio del testo è salvato');
  await riposa();
  if (b.giri.at(-1).input) b.giri.at(-1).concludi(fine); // il giro ripartito col motivo del giudice
  await riposa();
  const esito = await b.registro.aggiungiCriteriObiettivo(sessionId, CRITERI);
  assert.equal(esito?.ok, true, `adding criteria to a judged floor goal: ${JSON.stringify(esito)?.slice(0, 220)}`);
}));

test('PAV-REV-02 (S4) — after one refutation, every later restart repeats the OLD refutation instead of the judge\'s current reason', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  let confutazioni = 0;
  const b = banco(cartellaStore, cartella, {
    giudice: (_p, n) => (n === 1
      ? verdetto({ verdict: 'yes', reason: 'install documented', evidence: [{ path: 'README.md', sha256: impronta(README) }] })
      : verdetto({ verdict: 'no', reason: 'JUDGE-NOW: the uninstall section is still missing' })),
    confutaObiettivoFn: async () => { confutazioni += 1; return { esito: 'smentito', motivo: 'OLD-REFUTATION: the install steps are wrong', prove: [{ percorso: 'README.md' }] }; },
  });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document install and uninstall');
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: smentito, il ciclo riparte con la smentita');
  assert.match(b.giri.at(-1).input.messaggiIniziali.at(-1).content, /OLD-REFUTATION/u, 'premessa: il primo avviso porta la smentita');
  writeFileSync(join(cartella, 'README.md'), README); // il giro dell'avviso
  b.giri.at(-1).concludi(fine);
  await aspetta(() => b.giri.length === giriPrima + 3, 'premessa: il giudice dice no, il ciclo riparte');
  const avviso = b.giri.at(-1).input.messaggiIniziali.at(-1).content;
  b.giri.at(-1).concludi(fine);
  await riposa();
  assert.equal(confutazioni, 1, 'premessa: una confutazione sola');
  assert.match(avviso, /JUDGE-NOW/u, `the restart after the judge's no does not carry the judge's reason:\n${avviso.slice(0, 400)}`);
}));

test('PAV-REV-03 (S3) — a contract added WHILE the floor judge thinks: the loop exits in silence, goal active with a contract and never checked', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  let rispondi;
  let segnala;
  const dentro = new Promise((r) => { segnala = r; });
  const b = banco(cartellaStore, cartella, { giudice: () => { segnala(); return new Promise((r) => { rispondi = r; }); } });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document how to install the project');
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await dentro;
  const contratto = await b.registro.aggiungiCriteriObiettivo(sessionId, CRITERI);
  assert.equal(contratto?.ok, true, `premessa: il contratto si aggiunge mentre il giudice pensa (${JSON.stringify(contratto)?.slice(0, 160)})`);
  rispondi(verdetto({ verdict: 'yes', reason: 'install documented', evidence: [{ path: 'README.md', sha256: impronta(README) }] }));
  await riposaFinche(() => { const x = stato(b, sessionId); return x.stato !== 'attivo' || Boolean(x.verifica?.verdetti) || b.giri.length > giriPrima + 1; });
  const o = stato(b, sessionId);
  const fermoInSilenzio = o.stato === 'attivo' && Boolean(o.contratto) && !o.verifica?.verdetti && b.giri.length === giriPrima + 1;
  assert.equal(fermoInSilenzio, false, `goal ${o.stato}, contract ${Boolean(o.contratto)}, checked ${Boolean(o.verifica?.verdetti)}: nobody will move it`);
}));
