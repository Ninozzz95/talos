/*
 * Agente G4, quinto giro delle cure del passo 5 (revisione Q3, 04/11/2026). Fissano le forme scelte per Q3-A (si valuta il tasto che
 * ARRIVA: con l Alt arriva Alt+tasto, senza arriva il tasto nudo) e Q3-B (un a capo in mezzo a «type» si scarta: senza ValuePattern
 * arriva come un Invio vero). Aiutante finto, modello finto, nessuno schermo vero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const FINESTRA = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Profilo', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
// un elemento per ruolo; e1 è un campo, gli altri no
const statoMisto = () => ({ window_title: 'Profilo', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'Messaggio', frame: { x: 10, y: 60, w: 400, h: 30 } },
    { element_index: 2, element_token: 't2', role: 'Button', label: 'Invia', frame: { x: 10, y: 600, w: 160, h: 40 } },
    { element_index: 3, element_token: 't3', role: 'Hyperlink', label: 'Guida', frame: { x: 500, y: 600, w: 80, h: 20 } },
    { element_index: 4, element_token: 't4', role: 'CheckBox', label: 'Ricordami', frame: { x: 10, y: 200, w: 120, h: 20 } },
    { element_index: 5, element_token: 't5', role: 'MenuItem', label: 'Apri', frame: { x: 10, y: 10, w: 60, h: 20 } },
    { element_index: 6, element_token: 't6', role: 'Text', label: 'Premi Invio per continuare', frame: { x: 600, y: 300, w: 300, h: 30 } },
    { element_index: 7, element_token: 't7', role: 'ComboBox', label: 'Paese', frame: { x: 10, y: 260, w: 200, h: 24 } },
    { element_index: 8, element_token: 't8', role: 'TabItem', label: 'Impostazioni', frame: { x: 100, y: 10, w: 100, h: 24 } }] });
function aiutanteFinto({ stato = statoMisto } = {}) {
  const azioni = [];
  return {
    azioni,
    async apri() { return { ok: true }; },
    compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [FINESTRA] }, immagine: null, errore: null };
      if (nome === 'get_window_state') return { ok: true, dati: stato(), immagine: { base64: png(1280, 720).toString('base64'), mime: 'image/png' }, errore: null };
      azioni.push({ nome, argomenti });
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
}
function sessione({ testoDellaPersona, risposte }) {
  const domande = []; const contenuti = []; let n = 0;
  return {
    domande, contenuti,
    valore: {
      testoDellaPersona,
      chiediModello: async ({ contenuto }) => { contenuti.push(contenuto); const r = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(r), usage: null }; },
      chiediDomanda: async (q) => { validaDomandeUtente(q); domande.push(q); return { status: 'answered', answers: Object.fromEntries(q.map((x) => [x.id, 'Allow'])) }; },
      emetti: () => {},
    },
  };
}
const esegui = (ospite, s, livello = 'accesso-pieno') =>
  ospite(NOME_COMPUTER_USE, { task: 'do it' }, { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione: s.valore });
const passo = async (azioni, { testo = 'Apri la guida e invia il messaggio a Luca', livello } = {}) => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: testo, risposte: [{ actions: azioni }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s, livello);
  return { mandate: aiutante.azioni.map((a) => [a.nome, a.argomenti.element_token ?? null, a.argomenti.key ?? a.argomenti.keys ?? null]),
    secondo: JSON.stringify(s.contenuti[1] ?? ''), primo: JSON.stringify(s.contenuti[0] ?? '') };
};

test('G5-01 (Q3-A): con l\'Alt arriva Alt+tasto: ogni combinazione che arriva come Alt+S o come Invio/spazio nudo si scarta, con l\'avviso', async () => {
  for (const keys of ['shift+alt+s', 'ctrl+alt+s', 'alt+win+s', 'ctrl+shift+alt+s', 'alt+enter', 'shift+alt+space', 'shift+enter']) {
    const { mandate, secondo } = await passo([{ type: 'keys', ref: 'e1', keys }], { livello: 'scrittura-progetto' });
    assert.deepEqual(mandate, [], `${keys}: ${JSON.stringify(mandate)}`);
    assert.match(secondo, /every other modifier is lost on the way/u, keys);
  }
});

test('G5-02 (Q3-A, nessun effetto collaterale): le combinazioni che non arrivano come conferma, e le conferme vere, restano', async () => {
  for (const [keys, attese] of [['alt+f4', ['alt', 'f4']], ['ctrl+s', ['ctrl', 's']], ['ctrl+alt+t', ['ctrl', 'alt', 't']], ['shift+alt+d', ['shift', 'alt', 'd']]]) {
    const { mandate } = await passo([{ type: 'keys', keys }], { testo: 'Salva il profilo con nome' });
    assert.deepEqual(mandate, [['hotkey', null, attese]], keys);
  }
  // Ctrl+Alt+Invio e Alt+S scritti così sono conferme per la politica: si tengono e la politica li valuta (sul campo, carta d'invio)
  for (const keys of ['ctrl+alt+enter', 'alt+s']) {
    const { mandate } = await passo([{ type: 'keys', ref: 'e1', keys }]);
    assert.equal(mandate.length, 1, `${keys}: ${JSON.stringify(mandate)}`);
    assert.equal(mandate[0][1], 't1', keys);
  }
});

test('G5-03 (Q3-B): un a capo IN MEZZO al testo (\n, \r, \r\n, anche seguito da spazi e testo) si scarta con l\'avviso, niente parte', async () => {
  for (const text of ['Ciao Luca,\ncome stai?', 'riga 1\r\nriga 2', 'a\rb', 'a\n  b', '\nciao']) {
    const { mandate, secondo } = await passo([{ type: 'type', ref: 'e1', text }], { testo: 'Scrivi una bozza a Luca nel campo Messaggio, non inviarla', livello: 'scrittura-progetto' });
    assert.deepEqual(mandate, [], `${JSON.stringify(text)}: ${JSON.stringify(mandate)}`);
    assert.match(secondo, /write the text on one line/u, JSON.stringify(text));
  }
});

test('G5-04 (Q3-B, nessun effetto collaterale): testo su una riga, o con l\'a capo solo in fondo (che la politica valuta come Invio), si scrive', async () => {
  for (const text of ['Ciao Luca, come stai?', 'Ciao\n', 'Ciao\r\n', 'Ciao\n  ', 'tab\tdentro']) {
    const { mandate } = await passo([{ type: 'type', ref: 'e1', text }]);
    assert.deepEqual(mandate, [['type_text', 't1', null]], JSON.stringify(text));
  }
});

test('G5-05 (Q3-B e Q2-D1): un «type» scartato per l\'a capo cancella il ricordo: l\'Invio dopo, senza ref, non parte', async () => {
  const { mandate, secondo } = await passo([{ type: 'type', ref: 'e1', text: 'ciao' }, { type: 'type', ref: 'e1', text: 'a\nb' }, { type: 'keys', keys: 'enter' }]);
  assert.deepEqual(mandate, [['type_text', 't1', null]], JSON.stringify(mandate));
  assert.match(secondo, /\\"keys\\" without \\"ref\\"/u);
});
