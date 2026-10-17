/*
 * ⛔ RIVERIFICA AVVERSARIA (bugfixer, 15/10/2026) — `feat/goal-g5d-cure` (a0df14f4e).
 *  - G5D-REV-02: `fileInAttesa` raccoglie i file di un giro SOLO quando il ciclo arriva al giudice. Un giro dell'obiettivo che
 *    finisce in errore (o fermato dalla persona) mette l'obiettivo in pausa PRIMA di raccoglierli: il README che quel giro ha
 *    scritto non entra né in `fileInAttesa` né in `fileScritti`. Se la persona poi parla (un giro suo, a obiettivo in pausa) e
 *    riprende, il ciclo della ripresa guarda solo l'ULTIMO giro: il README del giro dell'obiettivo sparisce, mentre i file del giro
 *    fatto in pausa contano. È la stessa forma di G5D-REV-01, su un'altra uscita del ciclo.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-RIVERIFICA-G5D-CODA-S4-2026-10-15.md`.
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
const CONTRATTO = { criteri: [
  { testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } },
  { testo: 'the README explains how to install', verifica: { tipo: 'giudizio' } },
] };
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 5000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
const riposa = async () => { for (let i = 0; i < 30; i += 1) { await passo(); await new Promise((r) => setTimeout(r, 10)); } };

function banco(cartellaStore, cartella, domande) {
  return registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: async ({ prompt }) => { domande.push(prompt); return JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'no', reason: 'x' }] }); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
  });
}
function scriveIlReadme(giro, cartella) {
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = giro.input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
}

test('G5D-REV-02 (S4) — a goal turn that fails after writing the README: after a person turn and «Resume», the judge no longer sees it', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5d-rev2-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const b = banco(cartellaStore, cartella, domande);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro dell\'obiettivo che scrive il README');
  scriveIlReadme(b.giri.at(-1), cartella);
  b.giri.at(-1).fallisci('provider-error', fine);
  await aspetta(() => b.registro.statoObiettivo(sessionId).obiettivo?.stato === 'in-pausa', 'premessa: il giro fallito mette l\'obiettivo in pausa');
  assert.equal(domande.length, 0, 'premessa: nessun giudice per il giro fallito');
  b.registro.resume(sessionId, 'what is the weather like?'); // la persona parla, a obiettivo in pausa: il suo giro non scrive niente
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: il giro della persona parte');
  b.giri.at(-1).concludi(fine);
  await riposa();
  const ripresa = await b.registro.riprendiObiettivo(sessionId);
  assert.equal(ripresa.ok, true, 'premessa: la persona riprende l\'obiettivo');
  await aspetta(() => domande.length === 1, 'premessa: il ciclo della ripresa chiede al giudice');
  await riposa();
  assert.match(domande[0], new RegExp(impronta(README), 'u'), 'the judge after «Resume» does not see the README written by the goal turn that failed (never put in fileInAttesa)');
}));

test('G5D-REV-02 CONTROLLO — senza il giro della persona in mezzo, la ripresa guarda il giro fallito e il README c\'è', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5d-rev2c-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const b = banco(cartellaStore, cartella, domande);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro dell\'obiettivo che scrive il README');
  scriveIlReadme(b.giri.at(-1), cartella);
  b.giri.at(-1).fallisci('provider-error', fine);
  await aspetta(() => b.registro.statoObiettivo(sessionId).obiettivo?.stato === 'in-pausa', 'il giro fallito mette l\'obiettivo in pausa');
  await riposa();
  assert.equal((await b.registro.riprendiObiettivo(sessionId)).ok, true);
  await aspetta(() => domande.length === 1, 'il ciclo della ripresa chiede al giudice');
  await riposa();
  assert.match(domande[0], new RegExp(impronta(README), 'u'));
}));

/*
 * ⭐ CONTROLLI DELLE CURE (verdi su a0df14f4e): uccidono i mutanti che la consegna lasciava vivi — M2 (un obiettivo NUOVO eredita
 *   i file in attesa del vecchio), M6 (il pavimento non passa i file in attesa al giudice), M5 (il confutatore non li riceve).
 */
const no = (id) => JSON.stringify({ verdicts: [{ id, verdict: 'no', reason: 'x' }] });
const si = JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'yes', reason: 'install section', evidence: [{ path: 'README.md', sha256: impronta(README) }] }] });
function bancoSospeso(cartellaStore, cartella, domande, sospese, altre = {}) {
  return registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: ({ prompt }) => { domande.push(prompt); return new Promise((r) => { sospese.push(r); }); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
    ...altre,
  });
}

test('G5D-RIV-03 (controllo M2) — un obiettivo NUOVO non eredita i file in attesa di quello sostituito mentre il suo giudice pensava', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5d-riv3-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const sospese = [];
  const b = bancoSospeso(cartellaStore, cartella, domande, sospese);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro dell’obiettivo A che scrive il README');
  scriveIlReadme(b.giri.at(-1), cartella);
  b.giri.at(-1).concludi(fine);
  await aspetta(() => domande.length === 1, 'premessa: il giudice di A pensa');
  assert.match(domande[0], new RegExp(impronta(README), 'u'), 'premessa: il giudice di A vede il README');
  const nuovo = await b.registro.impostaObiettivo(sessionId, 'write the changelog', CONTRATTO); // la persona cambia obiettivo
  assert.equal(nuovo.ok, true, 'premessa: l’obiettivo B nasce');
  sospese[0](no('c2'));
  await riposa();
  b.registro.resume(sessionId, 'go on'); // il giro di B, che non scrive niente
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: il giro di B parte');
  b.giri.at(-1).concludi(fine);
  await aspetta(() => domande.length === 2, 'premessa: il giudice di B');
  sospese[1](no('c2'));
  await riposa();
  assert.doesNotMatch(domande[1], new RegExp(impronta(README), 'u'), 'the judge of goal B sees the README written for goal A (pending files inherited)');
  assert.deepEqual(b.registro.statoObiettivo(sessionId).obiettivo.fileScritti ?? [], [], 'goal B saved the files of goal A as its own');
}));

test('G5D-RIV-04 (controllo M6) — il PAVIMENTO (senza contratto): un giro della persona finito mentre il giudice pensa non fa sparire il README', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5d-riv4-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const sospese = [];
  const b = bancoSospeso(cartellaStore, cartella, domande, sospese);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install'); // senza criteri: il pavimento
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro che scrive il README');
  scriveIlReadme(b.giri.at(-1), cartella);
  b.giri.at(-1).concludi(fine);
  await aspetta(() => domande.length === 1, 'premessa: il giudice del giro 1 pensa');
  assert.match(domande[0], new RegExp(impronta(README), 'u'), 'premessa: il giudice del giro 1 vede il README');
  b.registro.resume(sessionId, 'also check the badge');
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: il giro della persona parte');
  b.giri.at(-1).concludi(fine);
  await riposa();
  sospese[0](no('obiettivo'));
  await aspetta(() => domande.length === 2, 'premessa: il ciclo rifatto chiede al giudice');
  const secondo = domande[1];
  sospese[1](no('obiettivo'));
  await riposa();
  assert.match(secondo, new RegExp(impronta(README), 'u'), 'the floor judge of the redone cycle no longer sees the README');
}));

test('G5D-RIV-05 (controllo M5) — il CONFUTATORE di serie riceve i file in attesa: il README del giro giudicato prima del ciclo rifatto è nella sua consegna', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5d-riv5-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const sospese = [];
  const confutatori = [];
  const giri = [];
  const b = bancoSospeso(cartellaStore, cartella, domande, sospese, {
    confutaObiettivoFn: undefined, // il confutatore VERO del registro
    avviaSessioneFn: (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length + confutatori.length}` });
      if (String(input.task?.consegna ?? '').includes('You are the TALOS goal refuter')) {
        confutatori.push(input);
        const detto = '{"refuted": false, "reason": "ok"}';
        input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'rc', result: { detto } });
        return Promise.resolve({ ok: true, esito: { comeFinita: 'concluso', detto, messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: detto }] } });
      }
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ input, concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: fine } }); } });
      return attesa;
    },
  });
  const { sessionId } = b.registro.avvia('task-vero');
  giri.at(-1).concludi();
  await passo();
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => giri.length === 2, 'il giro che scrive il README');
  scriveIlReadme(giri.at(-1), cartella);
  giri.at(-1).concludi();
  await aspetta(() => domande.length === 1, 'premessa: il giudice del giro 1 pensa');
  b.registro.resume(sessionId, 'also check the badge');
  await aspetta(() => giri.length === 3, 'premessa: il giro della persona parte');
  /* il giudice del giro 1 risponde mentre il giro della persona è ANCORA in corso: il ciclo 1 rinuncia senza riprogrammarsi
     (`if (giroInCorso()) return`), e la fine del giro 2 fa un ciclo solo — la strada che non incappa in G5D-RIV-06 */
  sospese[0](no('c2'));
  await riposa();
  giri.at(-1).concludi();
  await aspetta(() => domande.length === 2, 'premessa: il ciclo del giro 2 chiede al giudice');
  sospese[1](si);
  await aspetta(() => confutatori.length === 1, 'premessa: il «sì» porta al confutatore');
  await riposa();
  assert.match(confutatori[0].task.consegna, /"files_written_by_the_agent": \[\s*"README\.md"/u,'the refuter is not told about the README written in the turn judged before the redone cycle');
}));

/*
 * ⛔ G5D-RIV-06 (S3): un ciclo che rinuncia perché un giro della persona è finito mentre il giudice pensava riparte DUE volte —
 *   `ripartiDopoUnCambio` programma una ripresa e il `finally` di `cicloObiettivo` programma `cicloObiettivoDaRifare`. Il primo
 *   dei due trova l'altro in `cicloObiettivoDaRifare` e butta il proprio giudizio; e così di seguito, finché al quarto giro
 *   l'obiettivo va in pausa con «goal-kept-changing». Ogni «sì» del giudice (pagato) è scartato, e l'obiettivo non arriva mai.
 */
test('G5D-RIV-06 (S3) — a person turn that ends while the judge thinks: the redone cycle never converges, every «yes» is thrown away, the goal pauses as «goal-kept-changing»', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5d-riv6-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const sospese = [];
  const b = bancoSospeso(cartellaStore, cartella, domande, sospese);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro che scrive il README');
  scriveIlReadme(b.giri.at(-1), cartella);
  b.giri.at(-1).concludi(fine);
  await aspetta(() => domande.length === 1, 'premessa: il giudice del giro 1 pensa');
  b.registro.resume(sessionId, 'also check the badge');
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: il giro della persona parte');
  b.giri.at(-1).concludi(fine); // finisce mentre il giudice pensa
  await riposa();
  sospese[0](no('c2'));
  const fino = Date.now() + 3000;
  for (let risposte = 1; Date.now() < fino; await new Promise((r) => setTimeout(r, 5))) {
    while (risposte < sospese.length) { sospese[risposte](si); risposte += 1; }
    if (b.registro.statoObiettivo(sessionId).obiettivo.stato !== 'attivo') break;
  }
  await riposa();
  const ob = b.registro.statoObiettivo(sessionId).obiettivo;
  assert.equal(ob.stato, 'fatto', `the goal ended «${ob.stato}» (${JSON.stringify(ob.motivo)}) after ${domande.length} judge calls, every «yes» thrown away`);
  assert.equal(domande.length, 2, `${domande.length} paid judge calls for two turns`);
}));

/* G5D-RIV-07 — CONTROLLO, verde anche prima della cura: nel pavimento la doppia ripartenza non nasce in questo scenario, perché il
   controllo CONFUTA-REV-04 (`voce.cicloObiettivoDaRifare` prima della coda) esce prima del salvataggio. La guardia aggiunta nel ramo
   `!salvato` del pavimento copre solo la finestra in cui il giro finisce mentre il ciclo aspetta in `inFilaPerLObiettivo`: non l'ho
   resa deterministica, e il suo mutante sopravvive (dichiarato nel rapporto). */
test('G5D-RIV-07 (controllo, il PAVIMENTO) — lo stesso caso di G5D-RIV-06 senza contratto: una sola ripartenza, il «sì» vale', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5d-riv7-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const sospese = [];
  const b = bancoSospeso(cartellaStore, cartella, domande, sospese);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install'); // senza criteri: il pavimento
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro che scrive il README');
  scriveIlReadme(b.giri.at(-1), cartella);
  b.giri.at(-1).concludi(fine);
  await aspetta(() => domande.length === 1, 'premessa: il giudice del giro 1 pensa');
  b.registro.resume(sessionId, 'also check the badge');
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: il giro della persona parte');
  b.giri.at(-1).concludi(fine); // finisce mentre il giudice pensa
  await riposa();
  sospese[0](no('obiettivo'));
  const siDelTesto = JSON.stringify({ verdicts: [{ id: 'obiettivo', verdict: 'yes', reason: 'install documented', evidence: [{ path: 'README.md', sha256: impronta(README) }] }] });
  const fino = Date.now() + 3000;
  for (let risposte = 1; Date.now() < fino; await new Promise((r) => setTimeout(r, 5))) {
    while (risposte < sospese.length) { sospese[risposte](siDelTesto); risposte += 1; }
    if (b.registro.statoObiettivo(sessionId).obiettivo.stato !== 'attivo') break;
  }
  await riposa();
  const ob = b.registro.statoObiettivo(sessionId).obiettivo;
  assert.equal(ob.stato, 'fatto', `the floor goal ended «${ob.stato}» (${JSON.stringify(ob.motivo)}) after ${domande.length} judge calls`);
  assert.equal(domande.length, 2, `${domande.length} paid judge calls for two turns`);
}));
