/*
 * 0.2.4 «keys in search and Chrome», cure round 1 (reviewer REVC-11, judge v2262). In computer use the screen text was CUT first (element
 * name at 200, dialog name at 200, dialog text line at 300, value at 500 and then 200 for the model) and the keys were hidden AFTER: a key
 * across the cut reached the model with its first characters and the screenshot of that step left. Now every text is hidden raw, before
 * any cut; a cut that would split the sign keeps the sign whole; a key anywhere in the step drops the screenshot.
 * ⛔ No real value: fake keys made at random each run; asserts say yes/no only. ⛔ Zero dollars: fake helper, fake model, no network.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { SEGNO_CHIAVE_NASCOSTA } from '../src/kernel/talosHarness.mjs';

const chiaveFinta = () => `q${randomBytes(16).toString('hex')}`; // 33 characters
const SEGNO = SEGNO_CHIAVE_NASCOSTA;

function png(l, a) { const b = Buffer.alloc(24); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(l, 16); b.writeUInt32BE(a, 20); return b; }
const IMMAGINE = png(1280, 720).toString('base64');

function aiutante({ elementi, titolo, markdown, bounds }) {
  const W = { window_id: 201, pid: 5151, app_name: 'chrome.exe', title: titolo, bounds, z_index: 5, is_on_screen: true, minimized: false };
  return { async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [{ ...W }] }, immagine: null, errore: null };
      if (nome === 'get_window_state') return { ok: true, immagine: { base64: IMMAGINE, mime: 'image/png' }, errore: null,
        dati: { window_title: titolo, app_name: 'chrome.exe', window_bounds: bounds, screenshot_width: 1280, screenshot_height: 720, elements: elementi, ...(markdown ? { tree_markdown: markdown } : {}) } };
      return { ok: true, dati: {}, immagine: null, errore: null };
    } };
}
async function unPasso({ elementi, titolo = 'Docs - Google Chrome', markdown = null, bounds = { x: 0, y: 0, width: 1280, height: 720 }, chiavi = null }) {
  const passi = []; const eventi = [];
  const ospite = creaOspiteComputerUse({ aiutante: aiutante({ elementi, titolo, markdown, bounds }), pidDiTalos: 1 });
  const esito = await ospite(NOME_COMPUTER_USE, { task: 'read the page' }, {
    fase: 'esegui', toolCallId: 'cu-1', segnale: new AbortController().signal, livelloAccesso: 'accesso-pieno',
    ...(chiavi ? { valoriDelleChiaviFn: async () => new Set(chiavi) } : {}),
    sessione: { testoDellaPersona: 'Read the page', lingua: 'en',
      chiediModello: async ({ contenuto }) => { passi.push({ testo: contenuto.find((p) => p.type === 'text')?.text ?? '', foto: contenuto.some((p) => p.type === 'image_url') }); return { testo: JSON.stringify({ done: { success: true, note: 'ok' } }), usage: { prompt_tokens: 1, completion_tokens: 1 } }; },
      chiediDomanda: async (q) => ({ status: 'answered', answers: Object.fromEntries(q.map((x) => [x.id, 'Allow'])) }),
      emetti: (nome, dati) => { eventi.push(JSON.stringify(dati)); } },
  });
  return { passo: passi[0], eventi, esito };
}
/* yes/no only: does the text carry ANY piece of the key (its first character right after the filler, or any 8 characters of it in a row)? */
const unPezzo = (testo, v, prima) => testo.includes(`${prima.slice(-3)}${v[0]}`) || Array.from({ length: v.length - 7 }, (_, i) => v.slice(i, i + 8)).some((p) => testo.includes(p));
const rigaCon = (testo, inizio) => testo.split('\n').find((l) => l.startsWith(inizio)) ?? '';
const BARRA = { element_index: 1, element_token: 't1', role: 'Edit', label: 'Address and search bar', value: 'https://docs.example/start', in_web_content: false, frame: { x: 10, y: 10, w: 800, h: 30 } };

function controlla(r, v, prima, dove) {
  assert.equal(unPezzo(r.passo.testo, v, prima), false, `${dove}: no character of the key reaches the model`);
  assert.equal(r.passo.testo.includes(`${prima.slice(-3)}${SEGNO}`), true, `${dove}: the model reads the whole sign right where the key was`);
  assert.equal(r.passo.foto, false, `${dove}: no screenshot of that step in the model call`);
  assert.equal(r.eventi.some((e) => e.includes(IMMAGINE.slice(0, 24))), false, `${dove}: no event carries the screenshot`);
  assert.equal(r.eventi.some((e) => unPezzo(e, v, prima)), false, `${dove}: no event carries a piece of the key`);
}

test('CRC-T1 element NAME: a key across the 200-character cut is hidden whole, no photo', async () => {
  for (const inizio of [170, 185, 199]) {
    const v = chiaveFinta(); const prima = 'x'.repeat(inizio);
    const r = await unPasso({ elementi: [BARRA, { element_index: 4, element_token: 'l1', role: 'Hyperlink', label: `${prima}${v} and more text after it`, in_web_content: true, frame: { x: 20, y: 80, w: 300, h: 30 } }], chiavi: [v] });
    controlla(r, v, prima, `name, key at ${inizio}`);
  }
  /* two keys: the first sign ends before the cut, the second sits across it (after hiding: 20 + sign + 130 = 176) */
  const v1 = chiaveFinta(); const v2 = chiaveFinta(); const prima = 'x'.repeat(20); const mezzo = 'm'.repeat(130);
  const r = await unPasso({ elementi: [BARRA, { element_index: 4, element_token: 'l1', role: 'Hyperlink', label: `${prima}${v1}${mezzo}${v2} tail`, in_web_content: true, frame: { x: 20, y: 80, w: 300, h: 30 } }], chiavi: [v1, v2] });
  controlla(r, v1, prima, 'name, first of two keys');
  controlla(r, v2, mezzo, 'name, second of two keys across the cut');
});

test('CRC-T2 element VALUE: a key across the 200-character cut for the model and across the 500-character cut is hidden, no photo', async () => {
  for (const inizio of [185, 199]) {
    const v = chiaveFinta(); const prima = 'y'.repeat(inizio);
    const r = await unPasso({ elementi: [BARRA, { element_index: 5, element_token: 'f1', role: 'Edit', label: 'Notes', value: `${prima}${v} rest`, frame: { x: 20, y: 120, w: 300, h: 30 } }], chiavi: [v] });
    controlla(r, v, prima, `value, key at ${inizio}`);
  }
  /* across 500: the model only reads the first 200 characters of a value, so the check is the photo and the events */
  const v = chiaveFinta(); const prima = 'y'.repeat(485);
  const r = await unPasso({ elementi: [BARRA, { element_index: 5, element_token: 'f1', role: 'Edit', label: 'Notes', value: `${prima}${v} rest`, frame: { x: 20, y: 120, w: 300, h: 30 } }], chiavi: [v] });
  assert.equal(unPezzo(r.passo.testo, v, prima), false, 'value at 485: no character of the key reaches the model');
  assert.equal(r.passo.foto, false, 'value at 485: no screenshot');
  assert.equal(r.eventi.some((e) => unPezzo(e, v, prima)), false, 'value at 485: no event carries a piece of the key');
});

test('CRC-T3 window TITLE: a key across the 200-character cut of the dialog made from the title is hidden whole, no photo', async () => {
  const v = chiaveFinta(); const prima = 'z'.repeat(185);
  const titolo = `${prima}${v} - Confirm`;
  /* a small window shaped like a confirmation, no tree: the dialog element w0 takes its name from the window title (cut at 200) */
  const elementi = [
    { element_index: 1, element_token: 'tx', role: 'Text', label: 'Delete permanently?', frame: { x: 10, y: 40, w: 300, h: 30 } },
    { element_index: 2, element_token: 'b1', role: 'Button', label: 'Delete', frame: { x: 10, y: 200, w: 80, h: 30 } },
    { element_index: 3, element_token: 'b2', role: 'Button', label: 'Cancel', frame: { x: 100, y: 200, w: 80, h: 30 } },
  ];
  const r = await unPasso({ elementi, titolo, bounds: { x: 0, y: 0, width: 500, height: 300 }, chiavi: [v] });
  assert.equal(rigaCon(r.passo.testo, 'w0 window ').includes(`${prima.slice(-3)}${SEGNO}`), true, 'the dialog made from the title carries the whole sign');
  controlla(r, v, prima, 'title');
});

test('CRC-T4 MARKDOWN: a key across the 300-character cut of a dialog text line, and across the 200-character cut of a dialog window line, is hidden whole, no photo', async () => {
  const elementi = [
    { element_index: 1, element_token: 'w1', role: 'Window', label: 'Settings', frame: { x: 0, y: 0, w: 500, h: 300 } },
    { element_index: 2, element_token: 'b1', role: 'Button', label: 'Delete', frame: { x: 10, y: 200, w: 80, h: 30 } },
    { element_index: 3, element_token: 'b2', role: 'Button', label: 'Cancel', frame: { x: 100, y: 200, w: 80, h: 30 } },
  ];
  for (const inizio of [285, 299]) {
    const v = chiaveFinta(); const prima = 'w'.repeat(inizio);
    const markdown = ['- [1] Window "Delete this key?"', `  - Text "${prima}${v} will be deleted permanently"`, '  - [2] Button "Delete"', '  - [3] Button "Cancel"'].join('\n');
    const r = await unPasso({ elementi: elementi.map((e) => (e.element_index === 1 ? { ...e, label: 'Delete this key?' } : e)), markdown, titolo: 'Delete this key?', bounds: { x: 0, y: 0, width: 500, height: 300 }, chiavi: [v] });
    assert.equal(rigaCon(r.passo.testo, '  text ').includes(`${prima.slice(-3)}${SEGNO}`), true, 'the dialog text line carries the whole sign');
    controlla(r, v, prima, `text line, key at ${inizio}`);
  }
  /* a dialog inside a big window, without an index of its own: its element takes the name of the Window line (cut at 200) */
  const v = chiaveFinta(); const prima = 'w'.repeat(185);
  const markdown = ['- [1] Window "Settings"', `  - Window "${prima}${v} confirm"`, '    - Text "Delete permanently?"', '    - [2] Button "Delete"', '    - [3] Button "Cancel"'].join('\n');
  const r = await unPasso({ elementi, markdown, titolo: 'Settings', bounds: { x: 0, y: 0, width: 1280, height: 720 }, chiavi: [v] });
  assert.equal(rigaCon(r.passo.testo, 'w0 window ').includes(`${prima.slice(-3)}${SEGNO}`), true, 'the inner dialog carries the whole sign');
  controlla(r, v, prima, 'dialog window line');
});

test('CRC-T5 a key only in the tree text (a Text line outside any dialog, never sent to the model) still drops the photo of that step', async () => {
  const v = chiaveFinta();
  const elementi = [{ ...BARRA }, { element_index: 2, element_token: 'b1', role: 'Button', label: 'Save', frame: { x: 10, y: 200, w: 80, h: 30 } }];
  const markdown = ['- [1] Edit "Address and search bar" = "https://docs.example/start"', `- Text "Your key is ${v}"`, '- [2] Button "Save"'].join('\n');
  const r = await unPasso({ elementi, markdown, chiavi: [v] });
  assert.equal(r.passo.testo.includes(v), false, 'the value is not in the text');
  assert.equal(r.passo.foto, false, 'no screenshot of a screen that shows the key');
  /* the other way round: the same screen without the key keeps its photo */
  const pulita = await unPasso({ elementi, markdown: markdown.replace(v, 'nothing here'), chiavi: [v] });
  assert.equal(pulita.passo.foto, true, 'clean screen: the photo leaves as before');
});

test('CRC-T6 noise: long names, values, titles and dialog lines WITHOUT a key = same text and same photo with 30 known keys as with none', async () => {
  const note = Array.from({ length: 30 }, chiaveFinta);
  let diversi = 0;
  for (let i = 0; i < 20; i += 1) {
    const lungo = (n) => `${randomBytes(n).toString('hex')}`.slice(0, n * 2);
    const elementi = [BARRA,
      { element_index: 4, element_token: 'l1', role: 'Hyperlink', label: `commit ${lungo(150)}`, frame: { x: 20, y: 80, w: 300, h: 30 } },
      { element_index: 5, element_token: 'f1', role: 'Edit', label: 'Notes', value: lungo(300), frame: { x: 20, y: 120, w: 300, h: 30 } }];
    const titolo = `Review ${lungo(120)} - Google Chrome`;
    const senza = await unPasso({ elementi, titolo });
    const con = await unPasso({ elementi, titolo, chiavi: note });
    const norm = (s) => s.replace(/id=[0-9a-f]+/gu, ''); // the data fence has a random id at every call
    if (norm(senza.passo.testo) !== norm(con.passo.testo) || senza.passo.foto !== con.passo.foto) diversi += 1;
  }
  assert.equal(diversi, 0, 'no step changes');
});
