/*
 * ⛔ REVISIONE AVVERSARIA (bugfixer, 15/10/2026) — `feat/goal-g6` ebd260850, la seconda porta del /goal.
 *  - G6-RIV-01 (controllo, verde): in Piano un `goal_update`/`goal_create` chiamato lo stesso non arriva all'ospite: lo ferma la
 *    guardia generale del modo Piano («REFUSED. Plan mode is active…»), prima del ramo dell'ospite.
 *  - G6-REV-02: «il giro della persona» si calcola all'avvio del giro. Un messaggio che la persona scrive a giro in corso (la coda,
 *    `dallaPersona`) non lo apre — eppure durante un /goal OGNI giro è un avviso del ciclo, e la coda è l'unico modo di parlare
 *    senza fermarlo. La persona scrive «metti in pausa l'obiettivo» e il modello riceve un rifiuto.
 *  - G6-REV-03: «bloccato» conta i giri TOTALI dell'obiettivo. Codex (`codex-rs/ext/goal/src/spec.rs:66` e `:78`, la fonte citata
 *    dall'ospite): «After a previously blocked goal is resumed, the resumed run starts a fresh blocked audit». Qui, ripreso dopo
 *    «bloccato», il modello può bloccarlo di nuovo al primo giro.
 *  - G6-REV-04: creato dal modello a metà del giro della persona («Keep working on it»), i file scritti DOPO in quello stesso giro
 *    li vede il giudice di QUEL giro (guarda l'ultimo giro intero), ma non entrano in `fileScritti`: il giro è nato prima
 *    dell'obiettivo (`fileDelGiroPerLObiettivo` guarda l'ora d'avvio del giro). Al giro dopo, se non li riscrive, il giudice non li vede.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-G6-PORTA-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { impronta } from '../src/obiettivo/giudice.mjs';
import { conStore, conversazioneFerma, passo, registroAGiri, riavvia, righeObiettivo } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
async function aspetta(condizione, cosa) {
  /* G5D-REV-01 (20/10/2026): 5 s fissi sono caduti sul runner della release 0.1.31, sotto carico. Il tetto pesa solo quando la prova fallisce: la condizione si guarda ogni 5 ms e si esce appena è vera. */
  const fino = Date.now() + 60_000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
const riposa = async () => { for (let i = 0; i < 20; i += 1) { await passo(); await new Promise((r) => setTimeout(r, 10)); } };
function scrive(giro, cartella, nome, testo) {
  writeFileSync(join(cartella, nome), testo);
  const { onEvento } = giro.input;
  const id = `w-${Math.random().toString(16).slice(2)}`;
  onEvento({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ percorso: nome, contenuto: testo }) });
  onEvento({ type: 'ToolCallResult', toolCallId: id, content: 'ok' });
}

test('G6-RIV-01 CONTROLLO — in Piano: goal_update e goal_create non offerti, e chiamati lo stesso non arrivano all\'ospite', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-rev1-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiamate = [
    { id: 'u', type: 'function', function: { name: 'goal_update', arguments: JSON.stringify({ status: 'paused' }) } },
    { id: 'c', type: 'function', function: { name: 'goal_create', arguments: JSON.stringify({ objective: 'x' }) } },
  ];
  const fasi = [];
  const offerti = [];
  let n = 0;
  await talosLavora({
    cartella, task: { consegna: 'ciao' }, modello: 'x', chiave: 'y', strumentiEstesi: ['goal_status', 'goal_create', 'goal_update'],
    modalitaOperativa: 'piano',
    onObiettivoFn: async (nome, _argomenti, { fase }) => { fasi.push(`${nome}:${fase}`); return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: 'done' }; },
    chiediApprovazioneFn: async () => true,
    fetchDiRete: async (_url, opzioni) => {
      offerti.push((JSON.parse(opzioni.body).tools ?? []).map((a) => a.function?.name));
      return { ok: true, status: 200, text: async () => '', json: async () => ({
        choices: [{ message: n < chiamate.length ? { role: 'assistant', content: null, tool_calls: [chiamate[n++]] } : { role: 'assistant', content: 'fatto' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
    },
  });
  assert.ok(!offerti[0].includes('goal_update') && !offerti[0].includes('goal_create'), 'premessa: in Piano non si offrono');
  assert.deepEqual(fasi.filter((f) => f.endsWith(':esegui')), [], `in Plan mode a goal tool that was never offered still ran: ${fasi.join(', ')}`);
});

test('G6-REV-02 (S3) — durante un giro non aperto dalla persona, la persona scrive «pause the goal» (coda, dallaPersona): il modello la riceve, ma la pausa è rifiutata', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'make the tests pass');
  b.registro.resume(sessionId, null, []); // un giro che riparte senza un messaggio della persona (come un avviso del ciclo)
  await passo();
  const input = b.giri.at(-1).input;
  assert.equal(typeof input.onObiettivoFn, 'function', 'premessa: la conversazione principale ha la porta');
  const accodata = b.registro.accodaMessaggio(sessionId, 'please pause the goal, I need to check something');
  assert.equal(accodata.ok, true, `premessa: la persona scrive a giro in corso (${JSON.stringify(accodata)})`);
  const voce = input.codaMessaggiFn(); // il kernel consegna la voce nel giro, col segno della persona
  assert.equal(voce?.dallaPersona, true, 'premessa: la voce porta il segno della persona');
  const esito = await input.onObiettivoFn('goal_update', { status: 'paused' }, { fase: 'anteprima' });
  b.giri.at(-1).concludi(fine);
  await riposa();
  b.registro.pausaObiettivo(sessionId);
  assert.equal(esito.ok, true, `the person asked for the pause in their own message in this turn, and the model was refused: ${esito.messaggio}`);
}));

test('G6-REV-03 (S4) — ripreso dopo «bloccato», il modello lo blocca di nuovo al PRIMO giro (Codex: «the resumed run starts a fresh blocked audit»)', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-rev3-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    chiediAlModelloUnaVoltaFn: async () => JSON.stringify({ verdicts: [{ id: 'obiettivo', verdict: 'no', reason: 'not yet' }] }),
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
    tettiCicloObiettivo: { giri: 50 },
  });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install'); // il pavimento: il giudice dice «no», il ciclo continua
  const stato = () => b.registro.statoObiettivo(sessionId).obiettivo;
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  for (let giro = 1; giro <= 2; giro += 1) {
    await aspetta(() => b.giri.length === prima + giro, `il giro ${giro}`);
    scrive(b.giri.at(-1), cartella, 'README.md', `# Install ${giro}\n`);
    b.giri.at(-1).concludi(fine);
  }
  await aspetta(() => b.giri.length === prima + 3, 'il giro 3');
  const bloccato = await b.giri.at(-1).input.onObiettivoFn('goal_update', { status: 'blocked', reason: 'the API key is missing' }, { fase: 'esegui' });
  assert.equal(bloccato.ok, true, `premessa: al terzo giro «bloccato» si accetta (${bloccato.messaggio})`);
  assert.equal(stato().motivo?.tipo, 'bloccato', 'premessa: pausa col motivo');
  b.giri.at(-1).concludi(fine);
  await riposa();
  assert.equal((await b.registro.riprendiObiettivo(sessionId)).ok, true, 'premessa: la persona riprende');
  await aspetta(() => b.giri.length === prima + 4, 'premessa: il primo giro dopo la ripresa');
  const di_nuovo = await b.giri.at(-1).input.onObiettivoFn('goal_update', { status: 'blocked', reason: 'the API key is missing' }, { fase: 'anteprima' });
  b.giri.at(-1).concludi(fine);
  await riposa();
  b.registro.pausaObiettivo(sessionId);
  assert.equal(di_nuovo.ok, false, 'the first turn after the person resumed a blocked goal can block it again (no fresh audit)');
}));

test('G6-REV-04 (S4) — creato dal modello nel giro della persona, i file scritti DOPO la creazione in quello stesso giro non si ricordano: il giudice del giro dopo non li vede', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-rev4-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const README = '# Install\nRun npm ci.\n';
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: async ({ prompt }) => { domande.push(prompt); return JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'no', reason: 'x' }] }); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
    tettiCicloObiettivo: { giri: 50 },
  });
  const sessionId = await conversazioneFerma(b);
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'set a goal: document the install, and keep going until it is done');
  await aspetta(() => b.giri.length === prima + 1, 'il giro della persona');
  await new Promise((r) => setTimeout(r, 5)); // l'obiettivo nasce DOPO l'avvio del giro, come quando il modello lo crea a metà
  scrive(b.giri.at(-1), cartella, 'NOTES.md', 'scratch, before the goal\n'); // scritto PRIMA della creazione: non è lavoro per l'obiettivo
  const creato = await b.giri.at(-1).input.onObiettivoFn('goal_create', { objective: 'document the install', criteria: [
    { text: 'The tests pass', type: 'command', command: 'npm test' },
    { text: 'The README explains how to install', type: 'judgement' },
  ] }, { fase: 'esegui' });
  assert.equal(creato.ok, true, JSON.stringify(creato));
  assert.match(creato.testo, /Keep working on it/u, 'premessa: il modello è invitato a lavorarci nello stesso giro');
  scrive(b.giri.at(-1), cartella, 'README.md', README); // il lavoro per l'obiettivo, dopo averlo creato
  b.giri.at(-1).concludi(fine);
  await aspetta(() => domande.length >= 1, 'il giudice della fine di quel giro');
  assert.match(domande[0], new RegExp(impronta(README), 'u'), 'premessa: il giudice di QUEL giro vede il README (ultimo giro intero)');
  await aspetta(() => b.giri.length === prima + 2, 'premessa: il ciclo riparte (il giudice ha detto no)');
  b.giri.at(-1).concludi(fine); // un giro dell'obiettivo che non riscrive il README
  await aspetta(() => domande.length >= 2, 'il giudice del giro dopo');
  await riposa();
  const ricordati = b.registro.statoObiettivo(sessionId).obiettivo.fileScritti ?? [];
  b.registro.pausaObiettivo(sessionId);
  assert.match(domande[1], new RegExp(impronta(README), 'u'), `the judge of the next turn no longer sees the README written after goal_create (fileScritti: ${JSON.stringify(ricordati)})`);
  assert.ok(!ricordati.includes('NOTES.md'), `a file written BEFORE goal_create was counted as work for the goal (fileScritti: ${JSON.stringify(ricordati)})`);
}));

/* ── controlli: verdi su ebd260850, uccidono mutanti che le prove consegnate lasciavano vivi ── */
const LEGAME = { runId: '11111111-1111-4111-8111-111111111111', nodeId: 'passo-1', activityExecutionId: '22222222-2222-4222-8222-222222222222', attempt: 1, leaseId: '33333333-3333-4333-8333-333333333333', leaseEpoch: 0 };

test('G6-RIV-06 CONTROLLO — la porta è solo della conversazione principale: né una figlia né un passo di Workflow ricevono `onObiettivoFn`', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash', preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }) });
  const { sessionId } = b.registro.avvia('task-vero', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const madre = b.giri.at(-1).input;
  assert.equal(typeof madre.onObiettivoFn, 'function', 'premessa: la madre ha la porta');
  const figlia = await madre.onDelega('Read the files and summarise them.', undefined, { modalita: 'lettura' });
  assert.equal(figlia?.esito, 'avviato', `premessa: la figlia parte (${JSON.stringify(figlia)?.slice(0, 160)})`);
  const inputFiglia = b.giri.find((g) => g.input !== madre && g.input.task?.consegna?.includes?.('summarise'))?.input ?? b.giri.at(-1).input;
  assert.notEqual(inputFiglia, madre, 'premessa: la figlia ha un suo giro');
  assert.equal(inputFiglia.onObiettivoFn, undefined, 'a child got the goal port');
  const passo = b.registro.avviaSessioneDiPasso({ legame: LEGAME, rootSessionId: sessionId, consegna: 'Read the files and summarise them.' });
  assert.ok(passo?.sessionId, `premessa: il passo parte (${JSON.stringify(passo)?.slice(0, 160)})`);
  passo.fine?.catch(() => {});
  await new Promise((r) => setTimeout(r, 20));
  const inputPasso = b.giri.at(-1).input;
  assert.ok(inputPasso.legameWorkflow || inputPasso !== inputFiglia, 'premessa: è il giro del passo');
  assert.equal(inputPasso.onObiettivoFn, undefined, 'a Workflow step got the goal port');
  for (const g of b.giri) { try { g.concludi(fine); } catch { /* già chiuso */ } }
  await riposa();
}));

test('G6-RIV-07 CONTROLLO — un giro aperto da un avviso del /goal (testo presente, ma non della persona) non può mettere in pausa', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'make the tests pass');
  const ob = b.registro.statoObiettivo(sessionId).obiettivo;
  b.registro.resume(sessionId, 'c1 FAILED: keep working on the goal.', [], { notificaObiettivo: { obiettivoId: ob.id, riepilogo: null } });
  await passo();
  const esito = await b.giri.at(-1).input.onObiettivoFn('goal_update', { status: 'paused' }, { fase: 'anteprima' });
  b.giri.at(-1).concludi(fine);
  await riposa();
  b.registro.pausaObiettivo(sessionId);
  assert.equal(esito.ok, false, 'a goal notice opened the turn and the model could pause the goal as if the person asked');
}));

test('G6-RIV-08 CONTROLLO — la carta dei controlli dipende dal permesso della conversazione: On request ⇒ carta; Full access ⇒ niente carta', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  for (const [permessi, carta] of [['On request', true], ['Full access', false]]) {
    const { sessionId } = b.registro.avvia('task-vero', { permessiScelto: permessi, modalitaOperativaScelta: 'normale' });
    b.giri.at(-1).concludi(fine);
    await passo();
    b.registro.resume(sessionId, 'set a goal: make the tests pass');
    await passo();
    const anteprima = await b.giri.at(-1).input.onObiettivoFn('goal_create', { objective: 'make the tests pass' }, { fase: 'anteprima' });
    assert.equal(anteprima.ok, true, JSON.stringify(anteprima));
    assert.equal(anteprima.carta, carta, `${permessi}: carta ${anteprima.carta}`);
    b.giri.at(-1).concludi(fine);
    await riposa();
  }
}));

test('G6-RIV-09 CONTROLLO — «complete» detto per l\'obiettivo A, A tolto e sostituito da B: il giro dopo di B non comincia con «You said…»', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-riv9-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 1, enforcement: 'none' }),
    tettiCicloObiettivo: { giri: 50 },
  });
  const contratto = { criteri: [{ testo: 'runs npm test', verifica: { tipo: 'comando', comando: 'npm test' } }] };
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'fix the tests', contratto);
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === prima + 1, 'il giro della persona');
  assert.equal((await b.giri.at(-1).input.onObiettivoFn('goal_update', { status: 'complete' }, { fase: 'esegui' })).ok, true, 'premessa: «complete» per A');
  await b.registro.togliObiettivo(sessionId);
  assert.equal((await b.registro.impostaObiettivo(sessionId, 'fix the lint', contratto)).ok, true, 'premessa: nasce B');
  b.giri.at(-1).concludi(fine);
  await aspetta(() => b.giri.length === prima + 2, 'il ciclo di B riparte coi rossi');
  const primo = b.giri.at(-1).input.messaggiIniziali.at(-1);
  b.giri.at(-1).concludi(fine);
  await riposa();
  b.registro.pausaObiettivo(sessionId);
  assert.match(primo.content, /c1 FAILED/u, 'premessa: è la ripresa coi rossi di B');
  assert.doesNotMatch(primo.content, /You said the goal was complete/u, 'the claim made for goal A was read as a claim on goal B');
}));

test('G6-RIV-05 CONTROLLO — il motivo di «bloccato»: tagliato a 500, spazi e a capo compressi; i caratteri di controllo restano ma il giornale regge e si rilegge', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-riv5-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const opzioni = {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    chiediAlModelloUnaVoltaFn: async () => JSON.stringify({ verdicts: [{ id: 'obiettivo', verdict: 'no', reason: 'not yet' }] }),
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
    tettiCicloObiettivo: { giri: 50 },
  };
  const b = registroAGiri(cartellaStore, opzioni);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install');
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  for (let giro = 1; giro <= 2; giro += 1) {
    await aspetta(() => b.giri.length === prima + giro, `il giro ${giro}`);
    scrive(b.giri.at(-1), cartella, 'README.md', `# Install ${giro}\n`);
    b.giri.at(-1).concludi(fine);
  }
  await aspetta(() => b.giri.length === prima + 3, 'il giro 3');
  const strano = `key\u0000missing \u001b[2J‮ cleared\n\n${'é'.repeat(700)}😀`;
  const esito = await b.giri.at(-1).input.onObiettivoFn('goal_update', { status: 'blocked', reason: strano }, { fase: 'esegui' });
  assert.equal(esito.ok, true, JSON.stringify(esito));
  b.giri.at(-1).concludi(fine);
  await riposa();
  const dettaglio = b.registro.statoObiettivo(sessionId).obiettivo.motivo.dettaglio;
  assert.equal([...dettaglio].length, 500, 'tagliato a 500 caratteri');
  assert.ok(!/\n/u.test(dettaglio), 'niente a capo');
  const righe = righeObiettivo(cartellaStore, sessionId);
  assert.equal(righe.at(-1).obiettivo?.motivo?.dettaglio ?? righe.at(-1).valore?.motivo?.dettaglio ?? dettaglio, dettaglio, 'il giornale si rilegge come JSON');
  const dopo = await riavvia(cartellaStore, opzioni);
  assert.equal(dopo.registro.statoObiettivo(sessionId).obiettivo?.motivo?.dettaglio, dettaglio, 'dopo un riavvio il motivo è lo stesso');
  /* nota per la G6 UI: restano NUL, ESC e l'override bidi U+202E — chi lo mostra deve neutralizzarli */
  assert.ok(/[\u0000\u001b‮]/u.test(dettaglio), 'premessa della nota: i caratteri di controllo arrivano fino allo stato');
}));

test('G6-REV-05 (S5) — «complete» detto, poi l\'obiettivo va in pausa: alla ripresa il primo giro non comincia con «You said…» di un giro di prima', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-rev5-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 1, enforcement: 'none' }),
    tettiCicloObiettivo: { giri: 50 },
  });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'fix the tests', { criteri: [{ testo: 'runs npm test', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === prima + 1, 'il giro della persona');
  assert.equal((await b.giri.at(-1).input.onObiettivoFn('goal_update', { status: 'complete' }, { fase: 'esegui' })).ok, true, 'premessa: «complete»');
  await b.registro.pausaObiettivo(sessionId); // la persona mette in pausa prima che il ciclo decida
  b.giri.at(-1).concludi(fine);
  await riposa();
  assert.equal(b.registro.statoObiettivo(sessionId).obiettivo.stato, 'in-pausa', 'premessa: in pausa');
  assert.equal((await b.registro.riprendiObiettivo(sessionId)).ok, true, 'premessa: la persona riprende');
  await aspetta(() => b.giri.length === prima + 2, 'il ciclo della ripresa riparte coi rossi');
  const primo = b.giri.at(-1).input.messaggiIniziali.at(-1);
  b.giri.at(-1).concludi(fine);
  await riposa();
  b.registro.pausaObiettivo(sessionId);
  assert.match(primo.content, /c1 FAILED/u, 'premessa: è la ripresa coi rossi');
  assert.doesNotMatch(primo.content, /You said the goal was complete/u, 'the «complete» claim survived a pause and was read after the person resumed');
}));

test('G6-RIV-10 CONTROLLO — una voce di coda NON della persona (il risultato di una figlia) consegnata a metà giro non apre il giro della persona', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash', preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }) });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'make the tests pass');
  b.registro.resume(sessionId, null, []); // un giro non aperto dalla persona
  await passo();
  const madre = b.giri.at(-1);
  const figlia = await madre.input.onDelega('Read the files and summarise them.', undefined, { modalita: 'lettura' });
  assert.equal(figlia?.esito, 'avviato', `premessa: la figlia parte (${JSON.stringify(figlia)?.slice(0, 160)})`);
  const giroFiglia = b.giri.at(-1);
  assert.notEqual(giroFiglia, madre, 'premessa: la figlia ha un suo giro');
  giroFiglia.concludi([{ role: 'user', content: 'c' }, { role: 'assistant', content: 'summary: two files' }]);
  let voce = null;
  await aspetta(() => { voce = madre.input.codaMessaggiFn(); return voce !== null; }, 'premessa: il risultato della figlia arriva nella coda della madre');
  assert.notEqual(voce?.dallaPersona, true, 'premessa: la voce non porta il segno della persona');
  const esito = await madre.input.onObiettivoFn('goal_update', { status: 'paused' }, { fase: 'anteprima' });
  madre.concludi(fine);
  await riposa();
  b.registro.pausaObiettivo(sessionId);
  assert.equal(esito.ok, false, 'a child result delivered mid-turn opened the person\'s turn for the goal tools');
}));
