/**
 * 0.2.2-CU, small round before the reviewers (judge v1525, 11/11/2026 19:18).
 * - P (owner decision 18:50, «chiede sempre»): a button or a link that says only «Paga» or «Pay» asks the payment card ALWAYS, in Full
 *   access too and on pages that do not pay: pressed by its reference, clicked by coordinates, or blind next to it.
 * - Q (owner decision 17:12 on today's phone): the server refuses «Allow» for a choice with `requiresDetails` when the client that
 *   answers does not declare it can show the details (`showsDetails: true`, the PC question dock does). The question stays open and the
 *   message says to open the list on the PC. «Don't allow» and «Stop» never wait.
 * Fake ports and fake sessions only. Like Hermes, where every click is a destructive action to approve (tools/computer_use/tool.py:460-463),
 * and Codex, whose clipped approval opens the whole command before the yes (approval_overlay/clipping_tests.rs:56).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POLITICHE, valutaAzione } from '../src/computer-use/protezioni.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO } = POLITICHE;
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });

// ------------------------------------------------ P «Paga» / «Pay» alone always asks ------------------------------------------------
const NON_PAGA = [['Conti - Banca', 'Saldo 1.240,00 €'], ['Home - Sito', 'Benvenuto'], ['Notizie - Giornale', 'Le notizie di oggi']];
test('P owner 18:50: «Paga» or «Pay» alone, as a button or a link, on pages that do not pay, asks the payment card in Normal AND Full access', () => {
  const mancati = [];
  for (const [politica, nomePol] of [[NORMALE, 'Normale'], [PIENO, 'Pieno']]) {
    for (const [titolo, testo] of NON_PAGA) {
      for (const ruolo of ['pulsante', 'collegamento']) {
        for (const nome of ['Paga', 'Pay']) {
          const x = el('x', ruolo, nome, { rettangolo: { x: 700, y: 500, w: 80, h: 30 } });
          const s = { frenoArmato: true, app: 'chrome', dominio: 'sito.example', titolo, elementi: [el('t', 'testo', testo), x, el('k', 'collegamento', 'Contatti')] };
          const modi = { riferimento: { tipo: 'premi', ref: 'x' }, coordinate: { tipo: 'clic', x: 720, y: 510 }, buio: { tipo: 'clic', x: 724, y: 560 } };
          for (const [modo, azione] of Object.entries(modi)) {
            const bersaglio = modo === 'buio' ? null : x;
            const v = valutaAzione({ azione, bersaglio, schermata: s, politica, contesto: {} });
            if (v.protezione !== 'pagamento' || v.decisione !== 'chiedi') mancati.push(`${nomePol} ${titolo} ${ruolo} «${nome}» ${modo}: ${v.protezione}/${v.decisione}`);
          }
        }
      }
    }
  }
  assert.deepEqual(mancati, []);
});

/* Cure round (open point after the reviewers): in a real browser the page itself (the Document) is under every point, and a click 5 px
   beside «Paga» lands on it (cua uia/mod.rs:1012-1017). Outside a checkout the Document was read as a plain field, and the click went
   without a card, while the same click with a null target asked: against the 18:50 decision («blind next to it» asks always). Now a
   Document or a container under the point, with a bare «Paga»/«Pay» button or link on the screen, is a blind click on every page.
   «Acquista ora» outside a checkout keeps decision 375 (P-1 in computer-use-secondo-giro-destinatari.test.mjs). */
test('P owner 18:50: a click beside a bare «Paga»/«Pay» that lands on the Document or a container asks the payment card on pages that do not pay', () => {
  const mancati = [];
  for (const [politica, nomePol] of [[NORMALE, 'Normale'], [PIENO, 'Pieno']]) {
    for (const [titolo, testo] of NON_PAGA) {
      for (const ruolo of ['pulsante', 'collegamento']) {
        for (const nome of ['Paga', 'Pay', 'Paga →']) {
          for (const sotto of ['document', 'contenitore']) {
            const doc = el('d', 'campo', titolo, { rettangolo: { x: 0, y: 100, w: 1920, h: 980 } });
            const box = el('c', 'altro', '', { rettangolo: { x: 600, y: 450, w: 400, h: 150 } });
            const x = el('x', ruolo, nome, { rettangolo: { x: 700, y: 500, w: 80, h: 30 } });
            const s = { frenoArmato: true, app: 'chrome', dominio: 'sito.example', titolo, elementi: [doc, ...(sotto === 'contenitore' ? [box] : []), el('t', 'testo', testo), x] };
            const v = valutaAzione({ azione: { tipo: 'clic', x: 785, y: 515 }, bersaglio: sotto === 'contenitore' ? box : doc, schermata: s, politica, contesto: {} });
            if (v.protezione !== 'pagamento' || v.decisione !== 'chiedi') mancati.push(`${nomePol} ${titolo} ${ruolo} «${nome}» ${sotto}: ${v.protezione}/${v.decisione}`);
          }
        }
      }
    }
  }
  assert.deepEqual(mancati, []);
  // the same Document under the point with «Contatti» or «PayPal» only: nothing more is asked (decision 375)
  for (const nome of ['Contatti', 'PayPal', 'Pagamenti']) {
    const doc = el('d', 'campo', 'Home - Sito', { rettangolo: { x: 0, y: 100, w: 1920, h: 980 } });
    const s = { frenoArmato: true, app: 'chrome', dominio: 'sito.example', titolo: 'Home - Sito', elementi: [doc, el('x', 'collegamento', nome, { rettangolo: { x: 700, y: 500, w: 80, h: 30 } })] };
    const v = valutaAzione({ azione: { tipo: 'clic', x: 785, y: 515 }, bersaglio: doc, schermata: s, politica: NORMALE, contesto: {} });
    assert.notEqual(v.decisione, 'chiedi', nome);
  }
  // mutants P2b and P2e: «PayPal» or «Pagamenti» next to «Acquista ora» outside a checkout is not a bare «Paga», and the Document
  // pressed by its reference is not a click beside anything: both stay as they were (decision 375)
  const doc = el('d', 'campo', 'Cuffie - Negozio', { rettangolo: { x: 0, y: 100, w: 1920, h: 980 } });
  for (const nome of ['PayPal', 'Pagamenti', 'Pay later']) {
    const s = { frenoArmato: true, app: 'chrome', dominio: 'negozio.example', titolo: 'Cuffie - Negozio', elementi: [doc,
      el('x', 'collegamento', nome, { rettangolo: { x: 100, y: 150, w: 80, h: 30 } }), el('b', 'pulsante', 'Acquista ora', { rettangolo: { x: 800, y: 600, w: 200, h: 50 } })] };
    for (const politica of [NORMALE, PIENO]) {
      const v = valutaAzione({ azione: { tipo: 'clic', x: 795, y: 620 }, bersaglio: doc, schermata: s, politica, contesto: {} });
      assert.notEqual(v.decisione, 'chiedi', `${nome} ${politica.nome}`);
    }
  }
  const conPaga = { frenoArmato: true, app: 'chrome', dominio: 'sito.example', titolo: 'Home - Sito', elementi: [{ ...doc, nome: 'Home - Sito' },
    el('x', 'pulsante', 'Paga', { rettangolo: { x: 700, y: 500, w: 80, h: 30 } })] };
  const perRiferimento = valutaAzione({ azione: { tipo: 'clic', ref: 'd' }, bersaglio: conPaga.elementi[0], schermata: conPaga, politica: NORMALE, contesto: {} });
  assert.notEqual(perRiferimento.decisione, 'chiedi', 'the Document pressed by its reference');
});


/* Judge v1570 (reviewers A and B, second pass): a bare «Paga»/«Pay» on the screen made EVERY click on the Document or a container ask the
   payment card, also far from it (5 far clicks gave 5 cards; 0 before). The rule: a click on it, or on the page within 5 px of its box
   (`VICINO_A_PAGA_PX`, the same 5 px of the case already cured), asks the card; farther away the click goes as before. A hidden one
   does not count. Judge v1577: only what can be pressed counts — a button, a link, or an element (or a tight ancestor) that the
   screen reader says can be pressed (`premibile`: Chromium exposes a div or a span with a click handler as invokable); plain text
   «Paga» gives 0 cards, beside it and blind. Like Hermes, every click is an action to approve (tools/computer_use/tool.py:460-463);
   here only where it can pay, decision 375. */
const DOC_BANCA = el('d', 'campo', 'Conti - Banca', { rettangolo: { x: 0, y: 100, w: 1920, h: 980 } });
const banca = (...altri) => ({ frenoArmato: true, app: 'chrome', dominio: 'banca.example', titolo: 'Conti - Banca', elementi: [DOC_BANCA, el('t', 'testo', 'Saldo 1.240,00 €', { rettangolo: { x: 100, y: 300, w: 200, h: 30 } }), ...altri] });
const RIQ = { x: 1400, y: 110, w: 60, h: 30 }; // the menu entry: x 1400-1460, y 110-140
const decidi = (s, azione, bersaglio, politica) => { const v = valutaAzione({ azione, bersaglio, schermata: s, politica, contesto: {} }); return v.protezione === 'pagamento' && v.decisione === 'chiedi' ? 1 : 0; };
test('v1570: a bare «Paga»/«Pay» asks only for a click on it or within 5 px of it; five far clicks ask nothing; a hidden one never counts', () => {
  const esiti = [];
  for (const [politica, nomePol] of [[NORMALE, 'Normale'], [PIENO, 'Pieno']]) {
    for (const [ruolo, nome] of [['collegamento', 'Paga'], ['pulsante', 'Pay']]) {
      const x = el('x', ruolo, nome, { rettangolo: RIQ });
      const s = banca(x);
      const lontani = [[100, 900], [800, 600], [1400, 300], [1466, 125], [1430, 146]].map(([px, py]) => decidi(s, { tipo: 'clic', x: px, y: py }, DOC_BANCA, politica));
      const vicini = [[1465, 125], [1430, 145], [1395, 105]].map(([px, py]) => decidi(s, { tipo: 'clic', x: px, y: py }, DOC_BANCA, politica));
      const sopra = decidi(s, { tipo: 'clic', x: 1430, y: 125 }, x, politica);
      const nascosto = banca(el('x', ruolo, nome, { rettangolo: RIQ, visibile: false }));
      const nascosti = [decidi(nascosto, { tipo: 'clic', x: 1465, y: 125 }, DOC_BANCA, politica), decidi(nascosto, { tipo: 'clic', x: 1465, y: 125 }, null, politica)];
      esiti.push(`${nomePol} ${ruolo}: lontani ${lontani.join('')} vicini ${vicini.join('')} sopra ${sopra} nascosto ${nascosti.join('')}`);
    }
  }
  assert.deepEqual(esiti, ['Normale collegamento: lontani 00000 vicini 111 sopra 1 nascosto 00', 'Normale pulsante: lontani 00000 vicini 111 sopra 1 nascosto 00',
    'Pieno collegamento: lontani 00000 vicini 111 sopra 1 nascosto 00', 'Pieno pulsante: lontani 00000 vicini 111 sopra 1 nascosto 00']);
});

test('v1577: only what can be pressed counts: plain text «Paga» gives 0 beside it and blind; a clickable div «Paga» and a span «Pay» that can be pressed give 1', () => {
  const esiti = [];
  for (const [politica, nomePol] of [[NORMALE, 'Normale'], [PIENO, 'Pieno']]) {
    const casi = {
      testo: el('x', 'testo', 'Paga', { rettangolo: RIQ }),
      div: el('x', 'altro', 'Paga', { rettangolo: RIQ, premibile: true }),
      span: el('x', 'testo', 'Pay', { rettangolo: RIQ, premibile: true }),
      nascosto: el('x', 'altro', 'Paga', { rettangolo: RIQ, premibile: true, visibile: false }),
    };
    for (const [nome, x] of Object.entries(casi)) {
      const s = banca(x);
      esiti.push(`${nomePol} ${nome}: accanto ${decidi(s, { tipo: 'clic', x: 1465, y: 125 }, DOC_BANCA, politica)} buio ${decidi(s, { tipo: 'clic', x: 1465, y: 125 }, null, politica)}`);
    }
    // plain text inside a tight ancestor that can be pressed (a div with the click handler around the words): it counts
    const padre = el('p', 'altro', '', { rettangolo: { x: 1398, y: 108, w: 64, h: 34 }, premibile: true });
    const s = banca(padre, el('x', 'testo', 'Paga', { rettangolo: RIQ, genitore: 'p' }));
    esiti.push(`${nomePol} antenato: accanto ${decidi(s, { tipo: 'clic', x: 1466, y: 125 }, DOC_BANCA, politica)} buio ${decidi(s, { tipo: 'clic', x: 1466, y: 125 }, null, politica)}`);
  }
  assert.deepEqual(esiti, ['Normale testo: accanto 0 buio 0', 'Normale div: accanto 1 buio 1', 'Normale span: accanto 1 buio 1', 'Normale nascosto: accanto 0 buio 0', 'Normale antenato: accanto 1 buio 1',
    'Pieno testo: accanto 0 buio 0', 'Pieno div: accanto 1 buio 1', 'Pieno span: accanto 1 buio 1', 'Pieno nascosto: accanto 0 buio 0', 'Pieno antenato: accanto 1 buio 1']);
});

/* Reviewer A, short re-review (judge v1590), mutants A2-7 and A3-3: the nearby rule checks itself that «Paga» is visible and can be
   pressed. Without those checks a click on the Document near a hidden «Paga», or near plain text «Paga», became a blind click, and a
   visible «Acquista ora» FAR from the point made it ask the payment card (1 card where the rule gives 0). */
test('v1590: near a hidden «Paga» or plain text «Paga», with «Acquista ora» visible far away, a click on the Document asks nothing', () => {
  const lontano = el('buy', 'pulsante', 'Acquista ora', { rettangolo: { x: 200, y: 700, w: 150, h: 40 } });
  const esiti = [];
  for (const [politica, nomePol] of [[NORMALE, 'Normale'], [PIENO, 'Pieno']]) {
    const casi = {
      nascosto: el('x', 'collegamento', 'Paga', { rettangolo: RIQ, visibile: false }),
      testo: el('x', 'testo', 'Paga', { rettangolo: RIQ }),
      visibile: el('x', 'collegamento', 'Paga', { rettangolo: RIQ }), // the control: a visible link «Paga» at 5 px asks
    };
    for (const [nome, x] of Object.entries(casi)) esiti.push(`${nomePol} ${nome}: ${decidi(banca(x, lontano), { tipo: 'clic', x: 1465, y: 125 }, DOC_BANCA, politica)}`);
  }
  assert.deepEqual(esiti, ['Normale nascosto: 0', 'Normale testo: 0', 'Normale visibile: 1', 'Pieno nascosto: 0', 'Pieno testo: 0', 'Pieno visibile: 1']);
});

test('v1577: the ancestor of plain text «Paga» counts only when it is tight (within 5 px), can be pressed and is visible', () => {
  const esiti = [];
  for (const [politica, nomePol] of [[NORMALE, 'Normale'], [PIENO, 'Pieno']]) {
    const casi = {
      stretto: { rettangolo: { x: 1398, y: 108, w: 64, h: 34 }, premibile: true },
      largo: { rettangolo: { x: 1200, y: 100, w: 400, h: 200 }, premibile: true }, // the whole card is clickable: not the words «Paga»
      largoADestra: { rettangolo: { x: 1398, y: 108, w: 70, h: 34 }, premibile: true },
      largoInBasso: { rettangolo: { x: 1398, y: 108, w: 64, h: 40 }, premibile: true },
      largoInAltoASinistra: { rettangolo: { x: 1380, y: 90, w: 82, h: 52 }, premibile: true },
      nonPremibile: { rettangolo: { x: 1398, y: 108, w: 64, h: 34 } },
      nascosto: { rettangolo: { x: 1398, y: 108, w: 64, h: 34 }, premibile: true, visibile: false },
    };
    for (const [nome, padre] of Object.entries(casi)) {
      const s = banca(el('p', 'altro', '', padre), el('x', 'testo', 'Paga', { rettangolo: RIQ, genitore: 'p' }));
      esiti.push(`${nomePol} ${nome}: ${decidi(s, { tipo: 'clic', x: 1466, y: 125 }, DOC_BANCA, politica)}${decidi(s, { tipo: 'clic', x: 1466, y: 125 }, null, politica)}`);
    }
  }
  assert.deepEqual(esiti, ['Normale stretto: 11', 'Normale largo: 00', 'Normale largoADestra: 00', 'Normale largoInBasso: 00', 'Normale largoInAltoASinistra: 00', 'Normale nonPremibile: 00', 'Normale nascosto: 00',
    'Pieno stretto: 11', 'Pieno largo: 00', 'Pieno largoADestra: 00', 'Pieno largoInBasso: 00', 'Pieno largoInAltoASinistra: 00', 'Pieno nonPremibile: 00', 'Pieno nascosto: 00']);
});

// ------------------------------------------------ Q the client must say it can show the whole list ------------------------------------------------
function runtimeControllabile() {
  const runs = [];
  return { runs, avviaSessioneFn(input) { let resolve; const promise = new Promise((r) => { resolve = r; }); runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted', threadId: 't0', runId: 'r0' }); return promise; } };
}
async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-dettagli-'));
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'manda la mail' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  t.after(async () => { await registry.chiudi?.(); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ } rimuoviCartellaDiProva(cartellaStore); });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  return { registry, sessionId, input: runtime.runs[0].input };
}
const CARTA = [{ id: 'computer_use', header: 'Computer', question: 'TALOS is about to do a send or submit. 301 recipients: this card does not show them all.',
  details: { label: 'Show all 301 recipients', text: 'To: persona1@esempio.it; persona2@esempio.it' },
  options: [{ label: 'Allow', description: 'TALOS does this now.', requiresDetails: true }, { label: "Don't allow", description: 'TALOS skips this action.' }, { label: 'Stop', description: 'TALOS stops.' }] }];
const RISPOSTA = (requestId, scelta = 'Allow') => ({ requestId, status: 'answered', answers: { computer_use: scelta } });
const pausa = () => new Promise((r) => setTimeout(r, 10));

test('Q owner 17:12: a client that does not say it can show the whole list cannot allow; the question stays open; the PC dock (showsDetails) can', async (t) => {
  const { registry, sessionId, input } = await scena(t);
  const risposta = input.chiediDomandaFn(CARTA, { toolCallId: 'c1', messaggi: [] });
  await pausa();
  const { requestId } = registry.domandaInAttesa(sessionId);
  const rifiutata = await registry.rispondiDomanda(sessionId, requestId, RISPOSTA(requestId));
  assert.equal(rifiutata?.code, 'QUESTION_ANSWER_NEEDS_DETAILS', JSON.stringify(rifiutata));
  assert.equal(rifiutata?.reason, 'question-answer-needs-details');
  assert.match(String(rifiutata?.erroreAvvio), /open the whole list on the PC/iu);
  assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId, 'the question stays open');
  assert.deepEqual(await registry.rispondiDomanda(sessionId, requestId, RISPOSTA(requestId), { mostraDettagli: true }), { ok: true });
  assert.deepEqual(await risposta, { status: 'answered', answers: { computer_use: 'Allow' } });
});

test('Q owner 17:12: «Don\'t allow», «Stop» and a skip never wait for the list, from any client', async (t) => {
  for (const scelta of ["Don't allow", 'Stop']) {
    const { registry, sessionId, input } = await scena(t);
    const risposta = input.chiediDomandaFn(CARTA, { toolCallId: 'c1', messaggi: [] });
    await pausa();
    const { requestId } = registry.domandaInAttesa(sessionId);
    assert.deepEqual(await registry.rispondiDomanda(sessionId, requestId, RISPOSTA(requestId, scelta)), { ok: true }, scelta);
    assert.deepEqual(await risposta, { status: 'answered', answers: { computer_use: scelta } });
  }
});

test('Q HTTP: without «showsDetails» «Allow» gets 422 with its own code and message; «showsDetails» must be true or false; with true it passes', async (t) => {
  const { createServer } = await import('node:http');
  const { createHttpApp } = await import('../src/http-app.mjs');
  const { registry, sessionId, input } = await scena(t);
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registry }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  let chiuso = null;
  const chiudiServer = () => (chiuso ??= new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()); }));
  t.after(chiudiServer);
  const risposta = input.chiediDomandaFn(CARTA, { toolCallId: 'c1', messaggi: [] });
  await pausa();
  const { requestId } = registry.domandaInAttesa(sessionId);
  const rispondi = (corpo) => fetch(`http://127.0.0.1:${server.address().port}/api/v1/sessions/${encodeURIComponent(sessionId)}/question`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  /* Cure round (reviewer B, phone red; judge v1553, points 2 and 4): the refusal goes out on the wire as 422 with its own code and its
     own message, without a final period. The phone 0.1.48 unlocks its card only on a 400 or a 422 (domandeR4.ts:182-185) and writes
     «Invio non riuscito: <message>.»; a 403 left it stuck on «Esito non verificato». */
  const telefono = await rispondi(RISPOSTA(requestId));
  assert.equal(telefono.status, 422);
  const errore = (await telefono.json()).error;
  assert.equal(errore.code, 'QUESTION_ANSWER_NEEDS_DETAILS');
  assert.equal(errore.message, 'Open the whole list on the PC to allow this: this device cannot show it');
  assert.equal(errore.reason, 'question-answer-needs-details');
  assert.doesNotMatch(errore.message, /\.$/u, 'no final period: the phone and the PC put the message inside their own sentence');
  assert.match(String(errore.explanation), /PC/u);
  assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId);
  for (const rotto of ['yes', 1, null]) assert.equal((await rispondi({ ...RISPOSTA(requestId), showsDetails: rotto })).status, 400, `showsDetails ${JSON.stringify(rotto)}`);
  assert.equal((await rispondi({ ...RISPOSTA(requestId), showsDetails: false })).status, 422, 'false says it cannot show them');
  // a question of another chain is still a 403 with its own code: the new code is only for the list
  const estraneo = await rispondi({ ...RISPOSTA(requestId), rispostoDa: 'sessione-estranea' });
  assert.equal(estraneo.status, 403);
  assert.equal((await estraneo.json()).error.code, 'QUESTION_ANSWER_FORBIDDEN');
  const pc = await rispondi({ ...RISPOSTA(requestId), showsDetails: true });
  assert.equal(pc.status, 200);
  assert.deepEqual(await risposta, { status: 'answered', answers: { computer_use: 'Allow' } });
  await chiudiServer();
  void errore;
});
