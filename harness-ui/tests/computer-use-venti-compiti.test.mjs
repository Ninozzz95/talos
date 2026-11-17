/**
 * 0.2.1-CU round 2 (decision 375, owner 07/11/2026: the experience counts as much as the safety): twenty typical computer-use tasks,
 * each run with Normal and with Full access through the REAL host (`creaOspiteComputerUse`) and a fake helper shaped like cua-driver.
 * The first ten are the ten typical tasks of the computer-use bench (`ciclo-banco-3.mjs`, 06/11/2026); the other ten are the cases of
 * the «click with no element under the point» cure: blind clicks, confirmation windows, a recovery after an element that is not there.
 * What is pinned, per task and per level: how many protection cards the person sees (the per-app cards are counted apart), whether
 * the task ends well, and how many times the loop answered «element not found». A security cure that adds a card where no
 * irreversible confirmation window is open turns this file red. Hermes asks only for destructive actions
 * (tools/computer_use/tool.py:336-341) and refuses hard blocks first (tool.py:41-71).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { EVENTI } from '../src/computer-use/ciclo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const GRANDE = { x: 100, y: 100, width: 1200, height: 800 };
const PICCOLA = { x: 500, y: 300, width: 420, height: 200 }; // a confirmation window (attrezzo.mjs, DIALOGO_PICCOLO)
/** an element of the helper with its tree line; `web` = under the page's Document, `valore` = its value, `frame` in screen pixels */
const el = (i, role, label, depth, { web = false, valore = null, frame = null } = {}) => ({
  el: { element_index: i, element_token: `s0:${i}`, role, label, depth, actions: ['invoke'], frame: frame ?? { x: 600, y: 320 + i * 40, w: 200, h: 30 },
    enabled: true, ...(web ? { in_web_content: true } : {}), ...(valore !== null ? { value: valore } : {}) },
  md: `${'  '.repeat(depth)}- [${i}] ${role} "${label}"${valore !== null ? ` [value="${valore}"]` : ''}` });
const riga = (depth, role, label) => ({ md: `${'  '.repeat(depth)}- ${role} "${label}"` });

function aiutanteFinto({ app, titolo = 'Finestra', bordi = GRANDE, righe }) {
  const azioni = [];
  const f = { window_id: 500, pid: 77, app_name: `${app}.exe`, title: titolo, bounds: bordi, z_index: 9, is_on_screen: true, minimized: false };
  return { azioni, async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [f] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, dati: { window_id: f.window_id, pid: f.pid, window_title: f.title, app_name: f.app_name, window_bounds: f.bounds,
          screenshot_width: bordi.width, screenshot_height: bordi.height, elements: righe ? righe.filter((x) => x.el).map((x) => x.el) : null,
          tree_markdown: righe ? `${righe.map((x) => x.md).join('\n')}\n` : null },
        immagine: { base64: png(bordi.width, bordi.height).toString('base64'), mime: 'image/png' }, errore: null };
      }
      azioni.push({ nome, argomenti }); return { ok: true, dati: {}, immagine: null, errore: null };
    } };
}

const PER_APP = /wants to use this computer|outside the places/u;
export async function corsa(compito, livello) {
  const aiutante = aiutanteFinto(compito.schermo);
  const carte = []; const eventi = []; let n = 0;
  const risposte = [...compito.passi.map((azioni) => ({ actions: azioni })), { done: { success: true, note: 'done' } }];
  const sessione = { testoDellaPersona: compito.frase,
    chiediModello: async () => { const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => { validaDomandeUtente(q); carte.push(q[0].question); return { status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }; },
    emetti: (nome, dati) => { eventi.push({ nome, dati }); } };
  const esito = await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'work on the screen' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione });
  const fine = eventi.find((e) => e.nome === EVENTI.fermato || e.nome === EVENTI.esito)?.dati ?? {};
  return { carte: carte.filter((c) => !PER_APP.test(c)).length, perApp: carte.filter((c) => PER_APP.test(c)).length, ok: esito.ok, motivo: fine.motivo ?? null,
    passi: fine.passi ?? null, nonTrovati: eventi.filter((e) => e.nome === EVENTI.passo && e.dati?.fase === 'esito' && e.dati?.motivo === 'elemento-non-trovato').length,
    azioni: aiutante.azioni.map((a) => a.nome), testi: carte.filter((c) => !PER_APP.test(c)) };
}

const finestra = (app, righe, extra = {}) => ({ app, righe: [riga(0, 'Window', extra.titolo ?? 'Finestra'), ...righe], ...extra });
const BARRA = (indirizzo) => el(0, 'Edit', 'Barra degli indirizzi e di ricerca', 1, { valore: indirizzo });
// a confirmation window that cannot be undone, and one that can: text lines live only in the tree (cua-driver gives no action for them)
const IRREVERSIBILE = { app: 'explorer', titolo: 'Elimina file', bordi: PICCOLA, righe: [riga(0, 'Window', 'Elimina file'),
  riga(1, 'Text', 'Eliminare definitivamente questo file? L\'azione non può essere annullata.'),
  el(1, 'Button', 'Elimina', 1, { frame: { x: 620, y: 440, w: 100, h: 30 } }), el(2, 'Button', 'Annulla', 1, { frame: { x: 740, y: 440, w: 100, h: 30 } })] };
const REVERSIBILE = { app: 'notepad', titolo: 'Blocco note', bordi: PICCOLA, righe: [riga(0, 'Window', 'Blocco note'),
  riga(1, 'Text', 'Salvare le modifiche a Senza titolo?'),
  el(1, 'Button', 'Salva', 1, { frame: { x: 560, y: 440, w: 100, h: 30 } }), el(2, 'Button', 'Non salvare', 1, { frame: { x: 680, y: 440, w: 100, h: 30 } }),
  el(3, 'Button', 'Annulla', 1, { frame: { x: 800, y: 440, w: 100, h: 30 } })] };
const DESKTOP = { app: 'explorer', titolo: 'Program Manager', bordi: { x: 0, y: 0, width: 1600, height: 900 }, righe: null }; // tree null: the owner's case
const AL_BUIO = { type: 'click', x: 10, y: 10 }; // inside the window, under no element

export const COMPITI = [
  // ---- the ten typical tasks of the bench (ciclo-banco-3.mjs:125-136) ----
  { nome: '01 notepad: write the list', frase: 'apri il blocco note e scrivi la lista della spesa', schermo: finestra('notepad', [el(1, 'Document', 'Editor', 1, { valore: '' })]),
    passi: [[{ type: 'type', ref: 'e1', text: 'latte' }]] },
  { nome: '02 calculator: 12 times 7', frase: 'apri la calcolatrice e fai 12 per 7', schermo: finestra('calculatorapp', [el(1, 'Button', 'Uno', 1), el(2, 'Button', 'Per', 1)]),
    passi: [[{ type: 'press', ref: 'e1' }], [{ type: 'press', ref: 'e2' }]] },
  { nome: '03 Edge: read the weather', frase: 'apri Microsoft Edge su meteo.example.it e dimmi che tempo fa',
    schermo: finestra('msedge', [BARRA('https://meteo.example.it'), riga(1, 'Document', 'Meteo'), el(1, 'Hyperlink', 'Sole 21 gradi', 2, { web: true })]),
    passi: [[{ type: 'scroll', direction: 'down', ref: 'e1' }]] },
  { nome: '04 Outlook: send the mail', frase: 'apri outlook e invia a Marco la mail con scritto ciao',
    schermo: finestra('outlook', [el(1, 'Edit', 'A', 1, { valore: 'marco@example.com' }), el(2, 'Button', 'Invia', 1)]), passi: [[{ type: 'press', ref: 'e2' }]] },
  { nome: '05 Outlook: pick the spam mail', frase: 'apri outlook ed elimina la mail di spam',
    schermo: finestra('outlook', [el(1, 'ListItem', 'Spam', 1), el(2, 'Button', 'Elimina', 1)]), passi: [[{ type: 'press', ref: 'e1' }]] },
  { nome: '06 Word: write a letter', frase: 'apri Word e scrivi una lettera', schermo: finestra('winword', [el(1, 'Document', 'Pagina', 1, { valore: '' })]),
    passi: [[{ type: 'type', ref: 'e1', text: 'Caro' }]] },
  { nome: '07 Explorer: open Documents', frase: 'apri l\'esplora risorse e apri la cartella Documenti', schermo: finestra('explorer', [el(1, 'TreeItem', 'Documenti', 1)]),
    passi: [[{ type: 'press', ref: 'e1' }]] },
  { nome: '08 Edge: buy the book under 30 €', frase: 'apri Microsoft Edge su shop.example.it e compra il libro, massimo 30 €',
    schermo: finestra('msedge', [BARRA('https://shop.example.it/cassa'), riga(1, 'Document', 'Cassa'), riga(2, 'Text', 'Totale: 20,00 €'),
      el(2, 'Button', 'Acquista ora 20,00 €', 2, { web: true })]), passi: [[{ type: 'press', ref: 'e2' }]] },
  { nome: '09 Paint: draw a circle', frase: 'apri Paint e disegna un cerchio', schermo: finestra('mspaint', [el(1, 'Button', 'Ellisse', 1)]), passi: [[{ type: 'press', ref: 'e1' }]] },
  { nome: '10 Edge: fill the form', frase: 'apri Microsoft Edge su moduli.example.it e compila il modulo con il mio nome Mario',
    schermo: finestra('msedge', [BARRA('https://moduli.example.it'), riga(1, 'Document', 'Modulo'), el(1, 'Edit', 'Nome', 2, { web: true, valore: '' }),
      el(2, 'Button', 'Invia', 2, { web: true })]), passi: [[{ type: 'type', ref: 'e1', text: 'Mario' }], [{ type: 'press', ref: 'e2' }]] },
  // ---- the ten cases of the «click with no element under the point» cure ----
  { nome: '11 desktop, tree null: one blind click', frase: 'esplora il desktop', schermo: DESKTOP, passi: [[{ type: 'click', x: 60, y: 50 }]] },
  { nome: '12 a click by coordinates on a harmless element', frase: 'apri l\'esplora risorse e apri la cartella Documenti',
    schermo: finestra('explorer', [el(1, 'ListItem', 'Documenti', 1, { frame: { x: 140, y: 130, w: 120, h: 40 } })]), passi: [[{ type: 'click', x: 60, y: 50 }]] },
  { nome: '13 irreversible window + one blind click', frase: 'apri l\'esplora risorse e riordina la cartella Download', schermo: IRREVERSIBILE, passi: [[AL_BUIO]] },
  { nome: '14 irreversible window + Enter on its button', frase: 'apri l\'esplora risorse e riordina la cartella Download', schermo: IRREVERSIBILE,
    passi: [[{ type: 'keys', ref: 'e1', keys: 'enter' }]] },
  { nome: '15 irreversible window + a click on «Annulla»', frase: 'apri l\'esplora risorse e riordina la cartella Download', schermo: IRREVERSIBILE,
    passi: [[{ type: 'click', x: 250, y: 150 }]] },
  { nome: '16 irreversible window + press «Elimina»', frase: 'apri l\'esplora risorse e riordina la cartella Download', schermo: IRREVERSIBILE,
    passi: [[{ type: 'press', ref: 'e1' }]] },
  { nome: '17 a window that can be undone + one blind click', frase: 'apri il blocco note e scrivi la lista della spesa', schermo: REVERSIBILE, passi: [[AL_BUIO]] },
  { nome: '18 recovery: an element that is not there, then a blind click', frase: 'esplora il desktop', schermo: DESKTOP,
    passi: [[{ type: 'press', ref: 'e9' }], [{ type: 'click', x: 60, y: 50 }]] },
  { nome: '19 desktop: a batch [blind click, wait]', frase: 'esplora il desktop', schermo: DESKTOP, passi: [[{ type: 'click', x: 60, y: 50 }, { type: 'wait', seconds: 0 }]] },
  { nome: '20 irreversible window + a batch of two blind clicks', frase: 'apri l\'esplora risorse e riordina la cartella Download', schermo: IRREVERSIBILE,
    passi: [[AL_BUIO, { type: 'click', x: 20, y: 20 }]] },
];

/* Cards per task: [Normal, Full access]. Measured on 09/11/2026 before and after the cure of point 1. */
const CARTE_ATTESE = { '01': [0, 0], '02': [0, 0], '03': [0, 0], '04': [1, 0], '05': [0, 0], '06': [0, 0], '07': [0, 0], '08': [1, 1], '09': [0, 0], 10: [1, 0],
  11: [0, 0], 12: [0, 0], 13: [1, 0], 14: [1, 0], 15: [0, 0], 16: [1, 0], 17: [0, 0], 18: [0, 0], 19: [0, 0], 20: [1, 0] };

/* Round 3 (CLI R1, Phone R1): what REACHES the helper per task. The person answers «Allow» to every card, so Normal must send what Full
   access sends. Before round 3 tasks 13 and 20 showed their card in Normal and then sent NOTHING (the yes was dropped as «element gone»):
   counting cards alone could not see it. Measured on 10/11/2026. */
const AZIONI_ATTESE = { '01': ['type_text'], '02': ['click', 'click'], '03': ['scroll'], '04': ['click'], '05': ['click'], '06': ['type_text'], '07': ['click'], '08': ['click'],
  '09': ['click'], 10: ['type_text', 'click'], 11: ['click'], 12: ['click'], 13: ['click'], 14: ['click'], 15: ['click'], 16: ['click'], 17: ['click'], 18: ['click'], 19: ['click'], 20: ['click'] };

const LIVELLI = ['scrittura-progetto', 'accesso-pieno'];
const misure = {};
test('VENTI-1 the twenty tasks: protection cards per task, Normal and Full access, are the pinned ones', async () => {
  const diversi = [];
  for (const c of COMPITI) {
    const k = c.nome.slice(0, 2);
    misure[k] = [];
    for (const livello of LIVELLI) misure[k].push(await corsa(c, livello));
    const viste = misure[k].map((m) => m.carte);
    if (JSON.stringify(viste) !== JSON.stringify(CARTE_ATTESE[k])) diversi.push(`${c.nome}: ${JSON.stringify(viste)} instead of ${JSON.stringify(CARTE_ATTESE[k])} ${JSON.stringify(misure[k].map((m) => m.testi))}`);
    // round 3: after the yes the action must START: the same actions reach the helper in Normal and in Full access
    for (const [i, m] of misure[k].entries()) {
      if (JSON.stringify(m.azioni) !== JSON.stringify(AZIONI_ATTESE[k])) diversi.push(`${c.nome} (${LIVELLI[i]}): sent ${JSON.stringify(m.azioni)} instead of ${JSON.stringify(AZIONI_ATTESE[k])}`);
    }
  }
  const somma = (i) => Object.values(misure).reduce((s, m) => s + m[i].carte, 0);
  const perCompito = (f) => Object.fromEntries(Object.keys(misure).sort().map((k) => [k, misure[k].map(f)]));
  console.log(`CARTE-20 ${JSON.stringify({ normale: somma(0), pieno: somma(1), perCompito: perCompito((x) => x.carte) })}`);
  console.log(`SANI-20 ${JSON.stringify(perCompito((x) => `${x.ok ? 'ok' : x.motivo}/${x.passi}p/${x.nonTrovati}nt`))}`);
  assert.deepEqual(diversi, []);
});

test('VENTI-2 never two cards for one step, and no card at all where no irreversible window is open and the bench had none', () => {
  for (const c of COMPITI) {
    for (const m of misure[c.nome.slice(0, 2)] ?? []) assert.ok(m.carte <= 1, `${c.nome}: ${m.carte} cards ${JSON.stringify(m.testi)}`);
  }
  for (const k of ['11', '12', '15', '17', '18', '19']) assert.deepEqual(misure[k]?.map((m) => m.carte), [0, 0], k);
  // round 3, point 8: the card names the KIND of step («a deletion»), never the text of the window. What a screen says is not trusted on
  // a permission card (a page could write its own reassuring question there); the text of the window stays in the trace as evidence
  for (const k of ['13', '14', '16', '20']) {
    assert.deepEqual(misure[k]?.[0].testi, ['TALOS is about to do a deletion. Allow it?'], k);
  }
});

test('VENTI-3 every task ends well AND does what it was asked (after «Allow» the click really starts), and no healthy task meets «element not found» three times', () => {
  for (const c of COMPITI) {
    for (const m of misure[c.nome.slice(0, 2)] ?? []) {
      assert.equal(m.ok, true, `${c.nome}: ${m.motivo}`);
      assert.ok(m.nonTrovati < 3, `${c.nome}: ${m.nonTrovati}`);
      // «ends well» is not enough: the fake model says «done» whatever happened. The step the task is about must have reached the helper
      assert.ok(m.azioni.length >= 1, `${c.nome}: no action reached the helper`);
      assert.deepEqual(m.azioni, AZIONI_ATTESE[c.nome.slice(0, 2)], c.nome);
    }
  }
});
