/*
 * Agente G4 (04/11/2026): quarto giro delle cure del passo 5 (revisione Q2). Fissano le forme scelte per Q2-A1, Q2-B1, Q2-B2 e Q2-D1
 * oltre alle prove di Q2: la tabella ruolo → tasti che si premono, gli avvisi che arrivano al modello, il percorso del ricordo.
 * Aiutante finto, modello finto, nessuno schermo vero.
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

test('G4-01 (B1, tabella): i ruoli che si premono davvero diventano un solo `click` col loro token', async () => {
  for (const [ref, keys, token] of [['e2', 'enter', 't2'], ['e2', 'space', 't2'], ['e3', 'enter', 't3'], ['e4', 'space', 't4'], ['e5', 'enter', 't5']]) {
    const { mandate } = await passo([{ type: 'keys', ref, keys }]);
    assert.deepEqual(mandate, [['click', token, null]], `${ref} ${keys}`);
  }
});

test('G4-02 (B1, tabella): Invio o spazio su ciò che non si preme con quel tasto si scarta, niente parte, il modello legge l\'avviso', async () => {
  for (const [ref, keys] of [['e3', 'space'], ['e4', 'enter'], ['e5', 'space'], ['e6', 'enter'], ['e7', 'enter'], ['e8', 'space']]) {
    const { mandate, secondo } = await passo([{ type: 'keys', ref, keys }]);
    assert.deepEqual(mandate, [], `${ref} ${keys}: ${JSON.stringify(mandate)}`);
    assert.match(secondo, /go only to a field, button, checkbox, link or menu item/u, `${ref} ${keys}`);
  }
});

test('G4-03 (Q2-B2): Ctrl+Invio, Alt+S, Win+Invio con ref su un pulsante non partono al fuoco della finestra: si scartano', async () => {
  for (const keys of ['ctrl+enter', 'alt+s', 'win+enter']) {
    const { mandate, secondo } = await passo([{ type: 'keys', ref: 'e2', keys }]);
    assert.deepEqual(mandate, [], `${keys}: ${JSON.stringify(mandate)}`);
    assert.match(secondo, /go only to a field/u, keys);
  }
});

test('G4-04 (B1, ricordo): clic alle coordinate su un testo, poi Invio senza ref ⇒ niente clic al centro del testo, niente tasto', async () => {
  const { mandate, secondo } = await passo([{ type: 'click', x: 700, y: 310 }, { type: 'keys', keys: 'enter' }]);
  assert.deepEqual(mandate, [['click', null, null]], JSON.stringify(mandate));
  assert.match(secondo, /go only to a field/u);
});

test('G4-05 (A1): ogni modificatore che non fa una conferma su Invio o spazio si scarta con l\'avviso; Ctrl+Invio sul campo resta', async () => {
  for (const keys of ['shift+enter', 'alt+enter', 'shift+space', 'ctrl+space', 'win+space', 'alt+space', 'shift+alt+enter', 'maiusc+invio']) {
    const { mandate, secondo } = await passo([{ type: 'type', ref: 'e1', text: 'ciao' }, { type: 'keys', ref: 'e1', keys }], { livello: 'scrittura-progetto' });
    assert.deepEqual(mandate, [['type_text', 't1', null]], `${keys}: ${JSON.stringify(mandate)}`);
    assert.match(secondo, /every other modifier is lost on the way/u, keys); // testo dell'avviso aggiornato al quinto giro (Q3)
  }
  const { mandate } = await passo([{ type: 'keys', ref: 'e1', keys: 'ctrl+enter' }]);
  assert.deepEqual(mandate, [['press_key', 't1', 'enter']], JSON.stringify(mandate));
});

test('G4-06 (A1, nessun effetto collaterale): Maiusc+Tab e Ctrl+Maiusc+S restano combinazioni valide alla finestra', async () => {
  for (const [keys, attese] of [['shift+tab', ['shift', 'tab']], ['ctrl+shift+s', ['ctrl', 'shift', 's']]]) {
    const { mandate } = await passo([{ type: 'keys', keys }], { testo: 'Salva il profilo con nome' });
    assert.deepEqual(mandate, [['hotkey', null, attese]], keys);
  }
});

test('G4-07 (Q2-D1): un\'azione di tipo sconosciuto o un clic senza coordinate in mezzo cancellano il ricordo come le altre scartate', async () => {
  for (const scartata of [{ type: 'drag' }, { type: 'click' }, 'enter', null]) {
    const { mandate } = await passo([{ type: 'type', ref: 'e1', text: 'ciao' }, scartata, { type: 'keys', keys: 'enter' }]);
    assert.deepEqual(mandate, [['type_text', 't1', null]], `${JSON.stringify(scartata)}: ${JSON.stringify(mandate)}`);
  }
});

test('G4-08 (prompt): la regola dei tasti è scritta nel passo, così il modello non paga un passo per scoprirla', async () => {
  const { primo } = await passo([{ type: 'wait', seconds: 0 }]);
  assert.match(primo, /enter, space and alt\+s take no other modifier/u); // quinto giro (Q3): e niente «\n» consigliato
  assert.match(primo, /Write \\"type\\" text on one line/u);
  assert.doesNotMatch(primo, /new line use type/u);
});

test('G4-09 (B1, G4-M14): un interruttore (ToggleButton) si preme con Invio e con spazio', async () => {
  const stato = () => ({ ...statoMisto(), elements: [{ element_index: 9, element_token: 't9', role: 'ToggleButton', label: 'Wi-Fi', frame: { x: 10, y: 400, w: 80, h: 24 } }] });
  for (const keys of ['enter', 'space']) {
    const aiutante = aiutanteFinto({ stato });
    const s = sessione({ testoDellaPersona: 'Accendi il Wi-Fi', risposte: [{ actions: [{ type: 'keys', ref: 'e9', keys }] }, { done: { success: true } }] });
    await esegui(creaOspiteComputerUse({ aiutante }), s);
    assert.deepEqual(aiutante.azioni.map((a) => [a.nome, a.argomenti.element_token ?? null]), [['click', 't9']], keys);
  }
});

test('G4-10 (B1, G4-M9): un tasto scartato su un non-campo cancella il ricordo: l\'Invio dopo, senza ref, non va al campo scritto prima', async () => {
  const { mandate, secondo } = await passo([{ type: 'type', ref: 'e1', text: 'ciao' }, { type: 'keys', ref: 'e6', keys: 'enter' }, { type: 'keys', keys: 'enter' }]);
  assert.deepEqual(mandate, [['type_text', 't1', null]], JSON.stringify(mandate));
  assert.match(secondo, /\\"keys\\" without \\"ref\\"/u);
});
