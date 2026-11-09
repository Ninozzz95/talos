/*
 * Agente Q4 (04/11/2026): revisione avversaria del quinto giro delle cure del passo 5 (testa ccd9ae5c5). Aiutante finto, modello finto,
 * nessuno schermo vero. Q4-R* = rosse sulla testa (difetti), Q4-V* = controlli che devono restare verdi. Da copiare in harness-ui/tests/.
 *
 * Cosa arriva davvero (cua-driver Windows, scorta 0cdcec94, `platform-windows/src/input/keyboard.rs`):
 * - `post_key` (:330-389) risolve il tasto con `resolve_press` (:965-990): un carattere solo SENZA modificatori va per il layout; ogni
 *   altro nome passa da `key_name_to_vk` (:992-1048), che conosce solo enter/return, tab, escape/esc, space, backspace, delete/del,
 *   insert/ins, home, end, pageup/pgup, pagedown/pgdn, up, down, left, right, f1-f12, i modificatori, capslock, numlock; per ogni altro
 *   nome prende il PRIMO carattere (`key.chars().next()`, :1031-1043, «Single printable character») e ne fa il tasto.
 *   Quindi «alt+send» parte come WM_SYSKEYDOWN(VK_MENU) + WM_SYSKEYDOWN(VK_S): arriva Alt+S, la scorciatoia di «&Send»/«&Salva».
 * - `post_type_text` (:288-327) manda OGNI «\n» o «\r» (tranne il «\n» dopo un «\r») come un Invio vero.
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
const FINESTRA = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Chat', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
const statoChat = () => ({ window_title: 'Chat', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'Messaggio', frame: { x: 10, y: 60, w: 400, h: 30 } },
    { element_index: 2, element_token: 't2', role: 'Button', label: 'Invia', frame: { x: 10, y: 600, w: 160, h: 40 } }] });
function aiutanteFinto({ stato = statoChat } = {}) {
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
const esegui = (ospite, s, livello) =>
  ospite(NOME_COMPUTER_USE, { task: 'write the draft' }, { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione: s.valore });

// il vocabolario dei nomi di `key_name_to_vk` (keyboard.rs:1003-1033): ogni altro nome di più caratteri diventa il suo PRIMO carattere
const NOMI_CUA = new Set(['enter', 'return', 'tab', 'escape', 'esc', 'space', 'backspace', 'delete', 'del', 'insert', 'ins', 'home', 'end', 'pageup',
  'pgup', 'pagedown', 'pgdn', 'up', 'down', 'left', 'right', ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`), 'ctrl', 'control', 'shift', 'alt',
  'win', 'windows', 'meta', 'command', 'cmd', 'capslock', 'numlock']);
const tastoVeroCua = (k) => (k.length > 1 && !NOMI_CUA.has(k.toLowerCase()) ? k[0].toLowerCase() : k.toLowerCase());
// ciò che arriva all'app: con Alt, Alt+tasto; senza Alt, il tasto nudo (Q3); e il tasto è quello che cua-driver ricava dal nome
const cheArriva = (a) => {
  if (a.nome !== 'hotkey' && a.nome !== 'press_key') return null;
  const mods = a.nome === 'hotkey' ? a.argomenti.keys.slice(0, -1) : (a.argomenti.modifiers ?? []);
  const tasto = tastoVeroCua(a.nome === 'hotkey' ? a.argomenti.keys.at(-1) : a.argomenti.key);
  return mods.includes('alt') ? `alt+${tasto}` : tasto;
};
const carteDi = (s) => s.domande.map((q) => q[0].question).filter((c) => /about to do|cannot check|sensitive/u.test(c));
const BOZZA = 'Scrivi una bozza di saluto nel campo Messaggio, non inviarla';

test('Q4-R1 (ALTA in Accesso pieno, classe di Q3-A): «alt+send», «alt+salva», «shift+alt+submit» senza ref arrivano come Alt+S (cua prende il primo carattere del nome che non conosce): non devono partire senza valutazione', async () => {
  const rossi = [];
  for (const keys of ['alt+send', 'alt+salva', 'shift+alt+submit']) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: BOZZA, risposte: [{ actions: [{ type: 'keys', keys }] }, { done: { success: true } }] });
    const r = await esegui(creaOspiteComputerUse({ aiutante }), s, 'accesso-pieno');
    const arrivati = aiutante.azioni.filter((a) => cheArriva(a) === 'alt+s');
    if (arrivati.length) rossi.push(`${keys} → ${JSON.stringify(arrivati.map((a) => [a.nome, a.argomenti.keys ?? a.argomenti.key]))} (${r.testo.slice(0, 60)})`);
  }
  assert.deepEqual(rossi, [], rossi.join(' | '));
});

test('Q4-R1b (MEDIA in Normale): «alt+send» con ref sul campo della chat, frase «non inviarla», arriva come Alt+S ⇒ almeno una carta, come «alt+s»', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: BOZZA,
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'ciao' }, { type: 'keys', ref: 'e1', keys: 'alt+send' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s, 'scrittura-progetto');
  const arrivati = aiutante.azioni.filter((a) => cheArriva(a) === 'alt+s');
  assert.ok(arrivati.length === 0 || carteDi(s).length >= 1, `Alt+S arrivato dal campo chat senza carta: ${JSON.stringify(arrivati)}`);
});

test('Q4-R2 (BASSA, stessa radice): un nome che cua-driver non conosce non parte mai come un altro tasto («arrowright» arriva come «a», «yes» come «y»)', async () => {
  const rossi = [];
  for (const keys of ['arrowright', 'ctrl+arrowdown', 'yes', 'si']) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: 'Sposta il cursore nel campo Messaggio', risposte: [{ actions: [{ type: 'keys', keys }] }, { done: { success: true } }] });
    await esegui(creaOspiteComputerUse({ aiutante }), s, 'accesso-pieno');
    for (const a of aiutante.azioni) {
      const k = a.nome === 'hotkey' ? a.argomenti.keys.at(-1) : a.nome === 'press_key' ? a.argomenti.key : null;
      if (k && k.length > 1 && !NOMI_CUA.has(k)) rossi.push(`${keys} → ${a.nome} «${k}» arriva come «${tastoVeroCua(k)}»`);
    }
  }
  assert.deepEqual(rossi, [], rossi.join(' | '));
});

test('Q4-R3 (BASSA, Q3-B in fondo): più a capo in fondo («Ciao\\n\\n», «Ciao\\n \\n») sono più Invii veri e la politica ne valuta uno', async () => {
  const rossi = [];
  // mutante A06 della revisione delle cure R: anche i «\r» da soli in fondo sono Invii veri (keyboard.rs:296-327)
  for (const text of ['Ciao\n\n', 'Ciao\n \n', 'Ciao\r\n\r\n', 'Ciao\r\r', 'Ciao\r\n\r']) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: BOZZA, risposte: [{ actions: [{ type: 'type', ref: 'e1', text }] }, { done: { success: true } }] });
    await esegui(creaOspiteComputerUse({ aiutante }), s, 'accesso-pieno');
    // gli Invii che post_type_text produce: ogni \r o \n, tranne il \n subito dopo un \r
    for (const a of aiutante.azioni.filter((x) => x.nome === 'type_text')) {
      const invii = (a.argomenti.text.match(/\r\n|\r|\n/gu) ?? []).length;
      if (invii > 1) rossi.push(`${JSON.stringify(text)} → ${invii} Invii`);
    }
  }
  assert.deepEqual(rossi, [], rossi.join(' | '));
  // N7 (revisione delle cure R): la prova non passa a vuoto. Un solo a capo in fondo parte (un Invio, valutato dalla politica), così se un
  // giorno il Pieno torna a fermare l'invio non chiesto questa prova se ne accorge
  for (const text of ['Ciao\n', 'Ciao\r\n', 'Ciao\r']) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: BOZZA, risposte: [{ actions: [{ type: 'type', ref: 'e1', text }] }, { done: { success: true } }] });
    await esegui(creaOspiteComputerUse({ aiutante }), s, 'accesso-pieno');
    const partiti = aiutante.azioni.filter((x) => x.nome === 'type_text').map((x) => x.argomenti.text);
    assert.equal(partiti.length, 1, `${JSON.stringify(text)}: ${JSON.stringify(aiutante.azioni)}`);
    assert.equal((partiti[0].match(/\r\n|\r|\n/gu) ?? []).length, 1, JSON.stringify(partiti));
  }
});

test('Q4-V1 (controllo, il verso contrario): i nomi che cua conosce e le combinazioni normali partono come prima', async () => {
  for (const [keys, attese] of [['ctrl+s', ['ctrl', 's']], ['alt+f4', ['alt', 'f4']], ['alt+tab', ['alt', 'tab']], ['ctrl+alt+t', ['ctrl', 'alt', 't']],
    ['ctrl+pagedown', ['ctrl', 'pagedown']], ['alt+left', ['alt', 'left']], ['ctrl+shift+s', ['ctrl', 'shift', 's']]]) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: 'Salva il file con nome', risposte: [{ actions: [{ type: 'keys', keys }] }, { done: { success: true } }] });
    await esegui(creaOspiteComputerUse({ aiutante }), s, 'accesso-pieno');
    assert.deepEqual(aiutante.azioni.map((a) => [a.nome, a.argomenti.keys]), [['hotkey', attese]], keys);
  }
  for (const keys of ['f5', 'pagedown', 'escape', 'tab']) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: 'Aggiorna la pagina', risposte: [{ actions: [{ type: 'keys', keys }] }, { done: { success: true } }] });
    await esegui(creaOspiteComputerUse({ aiutante }), s, 'accesso-pieno');
    assert.deepEqual(aiutante.azioni.map((a) => [a.nome, a.argomenti.key]), [['press_key', keys]], keys);
  }
});

test('Q4-V2 (controllo): il prompt dice ancora di scrivere «type» su una riga e non consiglia «\\n»', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: BOZZA, risposte: [{ done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s, 'scrittura-progetto');
  const primo = JSON.stringify(s.contenuti[0] ?? '');
  assert.match(primo, /on one line/u);
  assert.doesNotMatch(primo, /new line use type/u);
});
