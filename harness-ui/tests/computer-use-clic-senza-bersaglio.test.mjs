/**
 * 0.2.1-CU (owner 09/11/2026 19:07; judge v1278, owner 19:18 «take it from Claude and Codex»): on the installed 0.2.0 «explore the
 * desktop» stopped after 1 step, a click with no element under the point (`non-valutabile` / `bersaglio-mancante`, background mode,
 * 1 capture, 0 actions). Like Hermes (cua_backend_input.py:105-108) and the Anthropic demo (computer.py:220-226), a coordinate click
 * goes even when the tree shows nothing under the point; an element found under the point only arms the destructive protections
 * (Hermes tool.py:336-341); hard blocks (captcha) stay first (Hermes tool.py:41-71).
 * Helper shapes copied from `attrezzo.mjs` (`guarda`, `elementoDelCiclo`) and cua-driver `get_window_state` (frame = screen coords).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { EVENTI, SUGGERIMENTI } from '../src/computer-use/ciclo.mjs';
import { fraseFinale, SUGGERIMENTO_NON_RIUSCITO } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
// the Windows desktop as cua-driver lists it: Explorer's «Program Manager», full screen
const DESKTOP = { window_id: 65562, pid: 4321, app_name: 'explorer.exe', title: 'Program Manager', bounds: { x: 0, y: 0, width: 1600, height: 900 },
  z_index: 1, is_on_screen: true, minimized: false };
const voce = (i, role, label, frame) => ({ element_index: i, element_token: `s1:${i}`, role, label, depth: 3, actions: ['invoke'], frame, enabled: true });
const PUNTO = { type: 'click', x: 60, y: 50 }; // screenshot pixels = screen pixels here (1600 wide capture of a 1600 wide window)

/** `elementi`: the elements of the capture (null = «albero null», what the owner saw). Every helper call is recorded. */
function aiutanteDelDesktop(elementi) {
  const chiamate = [];
  return { chiamate, async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome, argomenti) {
      chiamate.push({ nome, argomenti });
      if (nome === 'list_windows') return { ok: true, dati: { windows: [DESKTOP] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, dati: { window_id: DESKTOP.window_id, pid: DESKTOP.pid, window_title: DESKTOP.title, app_name: DESKTOP.app_name,
          window_bounds: DESKTOP.bounds, screenshot_width: 1600, screenshot_height: 900, elements: elementi,
          tree_markdown: elementi ? `${elementi.map((e) => `${'  '.repeat(e.depth ?? 1)}- [${e.element_index}] ${e.role} "${e.label}"`).join('\n')}\n` : null },
        immagine: { base64: png(1600, 900).toString('base64'), mime: 'image/png' }, errore: null };
      }
      return { ok: true, dati: {}, immagine: null, errore: null };
    } };
}

async function giro({ elementi = null, livello = 'accesso-pieno', azione = PUNTO, azioni = null, risposta = null, rifiutaIlClic = false }) {
  const aiutante = aiutanteDelDesktop(elementi);
  if (rifiutaIlClic) {
    const chiama = aiutante.chiama;
    aiutante.chiama = async (nome, a) => (nome === 'click' ? { ok: false, dati: null, immagine: null, errore: { code: 'refused', message: 'no' } } : chiama(nome, a));
  }
  const carte = []; const eventi = []; const prompt = []; let n = 0;
  const risposte = [{ actions: azioni ?? [azione] }, { done: { success: true, note: 'desktop explored' } }];
  const sessione = { testoDellaPersona: 'esplora il desktop',
    chiediModello: async ({ contenuto }) => { prompt.push(contenuto?.[0]?.text ?? ''); const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => {
      validaDomandeUtente(q);
      const etichette = q[0].options.map((o) => o.label);
      carte.push({ testo: q[0].question, etichette });
      // the task and place cards (permission per app): Allow; a protection card: what the test asks, else the first option
      const perApp = /wants to use this computer|outside the places/u.test(q[0].question);
      const scelta = risposta && !perApp ? (etichette.find((e) => e === risposta) ?? etichette[0]) : etichette[0];
      return { status: 'answered', answers: { [q[0].id]: scelta } };
    },
    emetti: (nome, dati) => { eventi.push({ nome, dati }); } };
  const esito = await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'explore the desktop' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione });
  const clic = aiutante.chiamate.filter((c) => c.nome === 'click');
  const fermato = eventi.find((e) => e.nome === EVENTI.fermato)?.dati ?? null;
  const protezioni = eventi.filter((e) => e.nome === EVENTI.protezione && e.dati?.tipo === 'clic').map((e) => e.dati);
  const esitiPasso = eventi.filter((e) => e.nome === EVENTI.passo && e.dati?.fase === 'esito').map((e) => e.dati);
  return { esito, carte, clic, fermato, protezioni, esitiPasso, prompt, chiamate: aiutante.chiamate };
}

// ---------- the owner's case ----------
test('CSB-1 RED of the owner: desktop, 1 capture, tree null, click on a point → the click is EXECUTED, in background, no extra card', async () => {
  const g = await giro({ elementi: null });
  assert.equal(g.fermato, null, `stopped: ${JSON.stringify(g.fermato)}`);
  assert.equal(g.clic.length, 1, JSON.stringify(g.chiamate.map((c) => c.nome)));
  assert.deepEqual(g.clic[0].argomenti, { pid: DESKTOP.pid, window_id: DESKTOP.window_id, x: 60, y: 50 });
  assert.deepEqual(g.chiamate.filter((c) => /bring_to_front|move_cursor|focus|launch/u.test(c.nome)), []);
  assert.equal(g.esitiPasso.find((e) => e.tipo === 'clic')?.modo, 'sottofondo');
  assert.equal(g.carte.length, 0, JSON.stringify(g.carte)); // Full access: no task card, and no card for «nothing under the point»
  assert.equal(g.esito.ok, true);
});

test('CSB-2 the same click with Normal permissions: only the per-app cards (task, Explorer), never «a step TALOS cannot check», then the click goes', async () => {
  const g = await giro({ elementi: null, livello: 'scrittura-progetto' });
  assert.equal(g.carte.filter((c) => !/wants to use this computer|outside the places/u.test(c.testo)).length, 0, JSON.stringify(g.carte));
  assert.equal(g.clic.length, 1, JSON.stringify(g.fermato));
});

// ---------- an element under the point only arms the destructive protections ----------
const sotto = (role, label) => [voce(7, role, label, { x: 40, y: 30, w: 120, h: 40 })];
test('CSB-3 a harmless element under the point: the click goes, no protection', async () => {
  const g = await giro({ elementi: sotto('ListItem', 'Recycle Bin') });
  assert.equal(g.clic.length, 1);
  assert.equal(g.protezioni.filter((p) => p.decisione !== 'procedi').length, 0, JSON.stringify(g.protezioni));
});

test('CSB-4 a payment button under the point: the payment protection fires, the click does not go by itself', async () => {
  const g = await giro({ elementi: sotto('Button', 'Pay now'), risposta: 'Stop' });
  assert.ok(g.protezioni.some((p) => p.protezione === 'pagamento'), JSON.stringify(g.protezioni));
  assert.equal(g.clic.length, 0);
});

test('CSB-5 a delete or a send button under the point (Normal): those protections fire and the card asks', async () => {
  for (const [label, protezione, cosa] of [['Delete permanently', 'cancellazione', /a deletion/u], ['Send', 'invio', /a send or submit/u]]) {
    const g = await giro({ elementi: sotto('Button', label), livello: 'scrittura-progetto' });
    assert.ok(g.protezioni.some((p) => p.protezione === protezione && p.decisione !== 'procedi'), `${label}: ${JSON.stringify(g.protezioni)}`);
    assert.ok(g.carte.some((c) => cosa.test(c.testo)), `${label}: ${JSON.stringify(g.carte)}`);
  }
});

// ---------- hard blocks stay first ----------
test('CSB-6 a captcha on the screen still stops a coordinate click, even on an empty spot', async () => {
  const g = await giro({ elementi: [voce(1, 'CheckBox', "I'm not a robot", { x: 400, y: 400, w: 30, h: 30 })], risposta: 'Stop' });
  assert.ok(g.protezioni.some((p) => p.protezione === 'anti-robot'), JSON.stringify(g.protezioni));
  assert.equal(g.clic.length, 0);
});

// ---------- S6-S7: a step that does not go comes back to the model with the reason and a hint, never a silent stop ----------
test('CSB-7 «press» or «select» on a ref that is not on the screen (tree null): the task does NOT close, the model reads reason + hint', async () => {
  for (const azione of [{ type: 'press', ref: 'e9' }, { type: 'select', ref: 'e9', value: 'x' }]) {
    const g = await giro({ elementi: null, azione });
    assert.equal(g.fermato, null, `${azione.type}: ${JSON.stringify(g.fermato)}`);
    assert.equal(g.clic.length, 0);
    assert.ok(g.prompt.length >= 2, `${azione.type}: the model was not asked again`);
    assert.ok(g.prompt[1].includes(SUGGERIMENTI.elementoNonTrovato), g.prompt[1]);
    assert.ok(g.prompt[1].includes('→ non-eseguita (elemento-non-trovato)'), g.prompt[1]);
    assert.equal(g.esito.ok, true);
  }
});

test('CSB-8 after a coordinate click with nothing readable under the point, the model is told to check the new capture', async () => {
  const g = await giro({ elementi: null });
  assert.equal(g.clic.length, 1);
  assert.ok(g.prompt[1]?.includes(SUGGERIMENTI.clicAlBuio), g.prompt[1]);
  // with an element under the point no such line: it is not noise on every click
  const h = await giro({ elementi: sotto('ListItem', 'Recycle Bin') });
  assert.ok(!h.prompt[1]?.includes(SUGGERIMENTI.clicAlBuio), h.prompt[1]);
});

test('CSB-9 a click the helper refuses: the model reads the failure and the hint', async () => {
  const aiutante = aiutanteDelDesktop(null);
  const chiama = aiutante.chiama;
  aiutante.chiama = async (nome, a) => (nome === 'click' ? { ok: false, dati: null, immagine: null, errore: { code: 'refused', message: 'no' } } : chiama(nome, a));
  const prompt = []; let n = 0;
  const risposte = [{ actions: [PUNTO] }, { done: { success: true, note: 'x' } }];
  await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'explore the desktop' }, { fase: 'esegui', toolCallId: 'c2',
    segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno', sessione: { testoDellaPersona: 'esplora il desktop',
      chiediModello: async ({ contenuto }) => { prompt.push(contenuto?.[0]?.text ?? ''); const x = risposte[Math.min(n, 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
      chiediDomanda: async (q) => ({ status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }), emetti: () => {} } });
  assert.ok(prompt[1]?.includes(SUGGERIMENTI.passoFallito), prompt[1]);
});

test('CSB-10 the assistant model: a task not completed comes back with the reason AND a hint, no internal code', () => {
  const t = fraseFinale({ esito: 'non-riuscito', motivo: 'errori-di-fila', passi: 3 });
  assert.match(t, /too many failed steps in a row/u);
  assert.ok(t.includes(SUGGERIMENTO_NON_RIUSCITO), t);
  assert.doesNotMatch(t, /bersaglio|valutabile|errori-di-fila/u);
});

// ---------- second round (three reviews, 09/11/2026) ----------
const ATTESA = { type: 'wait', seconds: 1 };
/** The «Last steps» block of a prompt, one entry per line (what the model really reads of the history). */
const ultimiPassi = (prompt) => { const m = /Last steps:\n([\s\S]*?)\n\n/u.exec(prompt ?? ''); return m ? m[1].split('\n') : []; };
test('CSB-11 (Phone D1, Performance R3): in the longest batch the model still reads the reason and the hint of the step that failed: one line for the step, one for the rest', async () => {
  // [press on a missing element, wait ×9]: before, the 8 lines the model reads were all «not done»
  const g = await giro({ elementi: null, azioni: [{ type: 'press', ref: 'e9' }, ...Array(9).fill(ATTESA)] });
  const righe = ultimiPassi(g.prompt[1]);
  assert.equal(righe.length, 2, g.prompt[1]);
  assert.ok(righe[0].includes('→ non-eseguita (elemento-non-trovato)') && righe[0].includes(SUGGERIMENTI.elementoNonTrovato), righe[0]);
  assert.equal(righe[1], 'passo 1: azioni 2-10 del lotto (aspetta ×9) → non-eseguita');
  // a click the helper refuses, then 9 waits: the failure and its hint on one line
  const h = await giro({ elementi: null, azioni: [PUNTO, ...Array(9).fill(ATTESA)], rifiutaIlClic: true });
  const r2 = ultimiPassi(h.prompt[1]);
  assert.equal(r2.length, 2, h.prompt[1]);
  assert.ok(r2[0].includes('→ rifiutata') && r2[0].includes(SUGGERIMENTI.passoFallito), r2[0]);
  // a blind click that went, then 9 waits (the batch closes after the click): outcome and hint on one line
  const k = await giro({ elementi: null, azioni: [PUNTO, ...Array(9).fill(ATTESA)] });
  const r3 = ultimiPassi(k.prompt[1]);
  assert.equal(r3.length, 2, k.prompt[1]);
  assert.ok(r3[0].includes('→ non-verificabile') && r3[0].includes(SUGGERIMENTI.clicAlBuio), r3[0]);
  // mixed rest: the kinds are listed in order, equal neighbours counted; a rest of ONE keeps today's line
  const m = await giro({ elementi: null, azioni: [{ type: 'press', ref: 'e9' }, PUNTO, ATTESA, ATTESA, PUNTO] });
  assert.equal(ultimiPassi(m.prompt[1])[1], 'passo 1: azioni 2-5 del lotto (clic, aspetta ×2, clic) → non-eseguita');
  const u = await giro({ elementi: null, azioni: [{ type: 'press', ref: 'e9' }, ATTESA] });
  assert.equal(ultimiPassi(u.prompt[1])[1], 'passo 1: aspetta → non-eseguita');
});

test('CSB-12 (Phone D1): four failed steps in a row of long batches still fit in what the model reads, each with its hint', async () => {
  // limit raised so the task does not close: the point is the memory, 2 lines per failed step ⇒ the last 4 steps stay readable
  const aiutante = aiutanteDelDesktop(null);
  const prompt = []; let n = 0;
  const lotto = { actions: [{ type: 'press', ref: 'e9' }, ...Array(9).fill(ATTESA)] };
  await creaOspiteComputerUse({ aiutante, limiti: { passi: 6, millisecondi: 120_000, fallimentiDiFila: 9, elementiNonTrovati: 9, msPerPasso: 25_000, azioniPerLotto: 10, msAnnullamento: 2_000, msAttesaPermesso: 600_000 } })(
    NOME_COMPUTER_USE, { task: 'explore the desktop' }, { fase: 'esegui', toolCallId: 'c3', segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno',
      sessione: { testoDellaPersona: 'esplora il desktop',
        chiediModello: async ({ contenuto }) => { prompt.push(contenuto?.[0]?.text ?? ''); n += 1; return { testo: JSON.stringify(n <= 4 ? lotto : { done: { success: false, note: 'x' } }), usage: null }; },
        chiediDomanda: async (q) => ({ status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }), emetti: () => {} } });
  const righe = ultimiPassi(prompt[4]);
  assert.equal(righe.length, 8, prompt[4]);
  assert.equal(righe.filter((r) => r.includes(SUGGERIMENTI.elementoNonTrovato)).length, 4, prompt[4]);
  assert.deepEqual(righe.filter((r) => r.includes('elemento-non-trovato')).map((r) => r.slice(0, 8)), ['passo 1:', 'passo 2:', 'passo 3:', 'passo 4:']);
});

test('CSB-13 (CLI 4, Phone): «if you try again…» is not added when the task is impossible or the cycle broke; every other reason keeps it; no internal code', () => {
  for (const motivo of ['impossibile', 'errore-interno']) {
    const t = fraseFinale({ esito: 'non-riuscito', motivo, passi: 3 });
    assert.ok(!t.includes(SUGGERIMENTO_NON_RIUSCITO) && !/try again|another way/u.test(t), t);
    assert.equal(t, `Computer use finished: not completed, ${motivo === 'impossibile' ? 'the task cannot be done on this screen' : 'internal error'} (after 3 steps).`);
    // the screen note still follows
    assert.match(fraseFinale({ esito: 'non-riuscito', motivo, passi: 1 }, 'saw a login page'), /\(after 1 step\)\.\nScreen agent note/u);
  }
  for (const motivo of ['errori-di-fila', 'elemento-non-trovato', 'senza-esito']) {
    const t = fraseFinale({ esito: 'non-riuscito', motivo, passi: 3 });
    assert.ok(t.endsWith(`(after 3 steps). ${SUGGERIMENTO_NON_RIUSCITO}`), t);
    assert.doesNotMatch(t, /bersaglio|valutabile|errori-di-fila|elemento-non-trovato|senza-esito|an unexpected stop/u);
  }
  assert.match(fraseFinale({ esito: 'non-riuscito', motivo: 'elemento-non-trovato', passi: 6 }), /it looked several times for an element that is not on the screen/u);
});

test('CSB-15 (Performance R1): through the real host, a blind click that leaves the capture identical does not clear the failures in a row; one that changes the capture does', async () => {
  // the model alternates «click a point» and «press an element that is not there»; the tree stays null, so only the capture can say the screen changed
  const corsa = async (cambiaLaCattura) => {
    const aiutante = aiutanteDelDesktop(null);
    const chiama = aiutante.chiama; let clic = 0;
    aiutante.chiama = async (nome, a) => {
      const r = await chiama(nome, a);
      if (nome === 'click') clic += 1;
      // same picture size, different bytes after each click (what a window that reacted looks like to the host)
      if (nome === 'get_window_state' && cambiaLaCattura) r.immagine = { base64: Buffer.concat([png(1600, 900), Buffer.from([clic])]).toString('base64'), mime: 'image/png' };
      return r;
    };
    let n = 0;
    const esito = await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'explore the desktop' }, { fase: 'esegui', toolCallId: 'c5',
      segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno', sessione: { testoDellaPersona: 'esplora il desktop',
        chiediModello: async () => { n += 1; return { testo: JSON.stringify({ actions: [n % 2 === 1 ? PUNTO : { type: 'press', ref: 'e9' }] }), usage: null }; },
        chiediDomanda: async (q) => ({ status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }), emetti: () => {} } });
    return { testo: esito.testo, richieste: n, clic };
  };
  const ferma = await corsa(false);
  assert.match(ferma.testo, /too many failed steps in a row \(after 4 steps\)/u, ferma.testo);
  assert.deepEqual([ferma.richieste, ferma.clic], [4, 2]);
  const mossa = await corsa(true);
  assert.match(mossa.testo, /it looked several times for an element that is not on the screen \(after 6 steps\)/u, mossa.testo);
  assert.deepEqual([mossa.richieste, mossa.clic], [6, 3]);
});

test('CSB-14: the new closing reason has its own sentence on the screen, English and Italian, not the generic one', async () => {
  const { readFileSync } = await import('node:fs');
  const parole = readFileSync(new URL('../frontend/src/components/computer-use/parole.js', import.meta.url), 'utf8');
  assert.match(parole, /'elemento-non-trovato': 'computer\.end\.notFound'/u);
  const { default: testi } = await import('../frontend/src/i18n/testi/computer.js');
  assert.equal(testi.en['end.notFound'], "I looked several times for something that wasn't on the screen, so I stopped.");
  assert.equal(testi.it['end.notFound'], "Ho cercato più volte una cosa che a schermo non c'era, quindi mi sono fermato.");
});

// ---------- judge v1577: «Paga» counts only when the reader says it can be pressed ----------
/* A div or a span with a click handler is listed by cua-driver with the action «invoke» (uia/mod.rs:987-989), and an element with an
   indexed ancestor carries `parent_index` (platform-windows/src/tools/get_window_state.rs:100-102). The tool brings both to the loop:
   a click 5 px beside a pressable «Paga», on the Document, asks the payment card; the same words as plain text do not. */
test('CSB-v1577 along the wire: a click 5 px beside «Paga» on the Document asks only when «Paga», or its tight ancestor, can be pressed', async () => {
  const doc = { element_index: 1, element_token: 's1:1', role: 'Document', label: 'Conti', depth: 2, frame: { x: 0, y: 0, w: 1600, h: 900 }, enabled: true };
  const paga = (extra) => ({ element_index: 3, element_token: 's1:3', role: 'Text', label: 'Paga', depth: 4, frame: { x: 700, y: 500, w: 80, h: 30 }, enabled: true, ...extra });
  const div = { element_index: 2, element_token: 's1:2', role: 'Group', label: '', depth: 3, actions: ['invoke'], frame: { x: 698, y: 498, w: 84, h: 34 }, enabled: true };
  const casi = { testo: [doc, paga({ actions: ['text'] })], premibile: [doc, paga({ actions: ['invoke'] })], antenato: [doc, div, paga({ parent_index: 2 })] };
  const esiti = {};
  for (const [nome, elementi] of Object.entries(casi)) {
    const g = await giro({ elementi, azione: { type: 'click', x: 785, y: 515 }, risposta: 'Stop' });
    esiti[nome] = `${g.protezioni.filter((p) => p.protezione === 'pagamento').length > 0 ? 1 : 0}/${g.clic.length}`;
  }
  assert.deepEqual(esiti, { testo: '0/1', premibile: '1/0', antenato: '1/0' });
});
