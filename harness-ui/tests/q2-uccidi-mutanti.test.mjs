/*
 * Agente Q2 (04/11/2026): revisione avversaria del terzo giro delle cure del passo 5 (testa a59424268). Aiutante finto, modello finto,
 * nessuno schermo vero. Q2-R* = rosse sulla testa (difetti), Q2-V* = controlli che devono restare verdi. Da copiare in harness-ui/tests/.
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
const statoModulo = () => ({ window_title: 'Profilo', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'Nome', frame: { x: 10, y: 60, w: 400, h: 30 } },
    { element_index: 2, element_token: 't2', role: 'Edit', label: 'Cognome', frame: { x: 10, y: 100, w: 400, h: 30 } },
    { element_index: 3, element_token: 't3', role: 'Button', label: 'Elimina account', frame: { x: 10, y: 600, w: 160, h: 40 } }] });
const statoChat = () => ({ window_title: 'Chat', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'Messaggio', frame: { x: 10, y: 60, w: 400, h: 30 } },
    { element_index: 2, element_token: 't2', role: 'Button', label: 'Invia', frame: { x: 10, y: 600, w: 160, h: 40 } }] });
// Un contenitore (finestra, riquadro…) che copre tutta la finestra, e «Elimina account» proprio al suo centro (640, 360)
const statoContenitore = (role, label) => () => ({ window_title: 'Profilo', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 0, element_token: 't0', role, label, frame: { x: 0, y: 0, w: 1280, h: 720 } },
    { element_index: 1, element_token: 't1', role: 'Edit', label: 'Nome', frame: { x: 10, y: 60, w: 400, h: 30 } },
    { element_index: 3, element_token: 't3', role: 'Button', label: 'Elimina account', frame: { x: 560, y: 340, w: 160, h: 40 } }] });
function aiutanteFinto({ stato = statoModulo } = {}) {
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
function sessione({ testoDellaPersona, risposte, rispostaCarta = 'Allow' }) {
  const domande = []; const contenuti = []; let n = 0;
  return {
    domande, contenuti,
    valore: {
      testoDellaPersona,
      chiediModello: async ({ contenuto }) => { contenuti.push(contenuto); const r = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(r), usage: null }; },
      chiediDomanda: async (q) => { validaDomandeUtente(q); domande.push(q); return { status: 'answered', answers: Object.fromEntries(q.map((x) => [x.id, rispostaCarta])) }; },
      emetti: () => {},
    },
  };
}
const esegui = (ospite, s, { livello = 'scrittura-progetto', task = 'fill the form' } = {}) =>
  ospite(NOME_COMPUTER_USE, { task }, { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione: s.valore });


// Prove che uccidono i mutanti sopravvissuti di Q2 (verdi sulla testa a59424268)
test('Q2-K1 (Q2-M1): un Invio scritto a larghezza piena («ｅｎｔｅｒ») con ref su un pulsante è lo stesso Invio: un solo click, nessun tasto', async () => {
  const aiutante = aiutanteFinto({ stato: statoChat });
  const s = sessione({ testoDellaPersona: 'Scrivi ciao a Luca nel campo Messaggio e invialo',
    risposte: [{ actions: [{ type: 'keys', ref: 'e2', keys: 'ｅｎｔｅｒ' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.deepEqual(aiutante.azioni.map((a) => [a.nome, a.argomenti.element_token ?? null]), [['click', 't2']], JSON.stringify(aiutante.azioni));
});

test('Q2-K5 (Q2-M5): clic sul campo e Invio senza ref nello stesso gruppo ⇒ nessun avviso «keys without ref» al passo dopo', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome',
    risposte: [{ actions: [{ type: 'click', x: 100, y: 70 }, { type: 'keys', keys: 'enter' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.doesNotMatch(JSON.stringify(s.contenuti.at(-1)), /\\"keys\\" without/u);
});

test('Q2-K7 (Q2-M7): una combinazione coi modificatori (Ctrl+S apre un dialogo) chiude il gruppo: lo «scrivi» dopo non parte sui ref vecchi', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Salva il profilo',
    risposte: [{ actions: [{ type: 'keys', keys: 'ctrl+s' }, { type: 'type', ref: 'e1', text: 'profilo.txt' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.deepEqual(aiutante.azioni.map((a) => a.nome), ['hotkey'], JSON.stringify(aiutante.azioni));
});
