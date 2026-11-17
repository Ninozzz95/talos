/*
 * Giro 5 della bolla (nota del controllore dopo il giro 4, 14/11/2026): le finestre del segno e della bolla sono del processo del guscio. Nell'app installata
 *   il processo si chiama TALOS (`productName`, `desktop/package.json`) e l'elenco MAI dell'attrezzo lo esclude; nell'Electron di sviluppo si chiama
 *   «electron», e il segno è trasparente, a tutto schermo e SEMPRE SOPRA (`setAlwaysOnTop(true, 'screen-saver')`): è la finestra più in alto, e il ciclo la
 *   sceglieva come finestra del compito (lettura, foto, clic sulla nostra finestra invece che sull'app della persona).
 *   Ora l'attrezzo esclude anche le finestre del guscio per numero di processo: il server lanciato dal guscio ha il canale privato (`process.send`) e il guscio
 *   è suo padre (`process.ppid`). Senza canale (la CLI, un server a mano) nessuna esclusione in più. Come Hermes, che nelle catture implicite salta le
 *   finestre del proprio processo per non fermarsi su una finestra sua in primo piano (`tools/computer_use/cua_backend_capture.py:75-80`, «skip the
 *   authorization daemon's own windows»), e cua, che ignora le finestre del pid escluso (`cua-teleport/src/ux/window.rs:230-231`, `exclude_pid`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as attrezzo from '../src/computer-use/attrezzo.mjs';
import { NOME_COMPUTER_USE } from '../src/kernel/talosHarness.mjs';

const { creaOspiteComputerUse } = attrezzo;
const GUSCIO = 9001;
const SEGNO = { window_id: 7, pid: GUSCIO, app_name: 'electron.exe', title: 'TALOS', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, z_index: 99, is_on_screen: true, minimized: false };
const FIN = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Senza titolo - Blocco note', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
const STATO = { window_title: FIN.title, app_name: FIN.app_name, window_bounds: FIN.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Document', label: 'Editor di testo', frame: { x: 10, y: 60, w: 1200, h: 600 } }] };

/** Un compito che legge lo schermo una volta e finisce: i `pid` delle finestre lette. */
async function finestreLette({ pidSegno = GUSCIO, ...opzioni } = {}) {
  const lette = [];
  const aiutante = {
    async apri() { return { ok: true }; },
    compito() { return () => {}; },
    async chiama(nome, args) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [{ ...SEGNO, pid: pidSegno }, FIN] }, immagine: null, errore: null };
      if (nome === 'get_window_state') { lette.push(args.pid); return { ok: true, dati: STATO, immagine: null, errore: null }; }
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
  const sessione = {
    testoDellaPersona: 'Leggi cosa c è sullo schermo', // nessuna app nominata: si sceglie la finestra più in alto (`pianoApp` vuoto)
    chiediModello: async () => ({ testo: JSON.stringify({ done: { success: true, note: 'letto' } }), usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    chiediDomanda: async (qs) => ({ status: 'answered', answers: Object.fromEntries(qs.map((q) => [q.id, 'Allow'])) }),
    emetti: () => {},
  };
  const r = await creaOspiteComputerUse({ aiutante, ...opzioni })(NOME_COMPUTER_USE, { task: 'read what is on the screen' },
    { fase: 'esegui', toolCallId: 'call-guscio', segnale: new AbortController().signal, livelloAccesso: 'scrittura-progetto', sessione });
  return { lette, r };
}

test('GUSCIO-01 sotto il guscio di sviluppo la finestra «electron» del segno, sempre sopra, non diventa la finestra del compito', async () => {
  const { lette } = await finestreLette({ pidDelGuscio: GUSCIO });
  assert.ok(lette.length >= 1, 'lo schermo si legge');
  assert.ok(lette.every((pid) => pid === FIN.pid), `lette: ${lette.join(', ')}: mai la finestra del guscio`);
});

test('GUSCIO-02 il guscio si riconosce dal canale privato: col canale è il padre del server, senza (CLI, server a mano) nessuno', () => {
  assert.equal(typeof attrezzo.pidDelGuscioDi, 'function');
  assert.equal(attrezzo.pidDelGuscioDi({ send: () => {}, ppid: 321 }), 321);
  assert.equal(attrezzo.pidDelGuscioDi({ ppid: 321 }), null, 'senza canale');
  assert.equal(attrezzo.pidDelGuscioDi({ send: () => {}, ppid: 0 }), null, 'un padre che non si legge non esclude niente');
  assert.equal(attrezzo.pidDelGuscioDi(null), null);
});

test('GUSCIO-03 AL CONTRARIO: senza guscio una finestra «electron» di un altro programma resta sceglibile, e TALOS installato resta escluso per nome', async () => {
  const { lette } = await finestreLette({ pidDelGuscio: null });
  assert.deepEqual([...new Set(lette)], [GUSCIO], 'senza guscio la finestra più in alto è quella scelta, come prima');
});

/* giro 5 (mutanti a 2 uccisori): il valore di serie, letto dal processo vero del server. Il canale privato si simula mettendo `process.send` per la durata
   della prova (dentro `node --test` il file non ne ha uno); `process.ppid` è il padre vero, qui il lanciatore delle prove. */
test('GUSCIO-04 di serie, col canale privato: la finestra del padre del server (il guscio) resta fuori, senza che nessuno passi il numero', async (t) => {
  const prima = Object.getOwnPropertyDescriptor(process, 'send');
  process.send = () => true;
  t.after(() => { if (prima) Object.defineProperty(process, 'send', prima); else delete process.send; });
  const { lette } = await finestreLette({ pidSegno: process.ppid });
  assert.ok(lette.length >= 1);
  assert.ok(lette.every((pid) => pid === FIN.pid), `lette: ${lette.join(', ')}`);
});

test('GUSCIO-05 AL CONTRARIO di serie, senza canale (la CLI, un server lanciato a mano): la finestra del padre resta sceglibile come prima', async () => {
  assert.equal(typeof process.send, 'undefined', 'questa prova gira senza canale privato');
  const { lette } = await finestreLette({ pidSegno: process.ppid });
  assert.deepEqual([...new Set(lette)], [process.ppid]);
});
