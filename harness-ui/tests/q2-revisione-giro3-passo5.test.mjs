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

/* cua-driver Windows in sottofondo (scorta 0cdcec94): `press_key` e `hotkey` finiscono in `input/keyboard.rs:336` `post_key`, che manda i
   modificatori con PostMessage. PostMessage non aggiorna lo stato dei modificatori (`GetKeyState`): lo dice cua-driver stesso in
   `tools/hotkey.rs:357-359` («PostMessage does not update global modifier state, so Chromium never observes Ctrl+Shift+H as a chord»).
   Quindi il tasto che arriva è quello normale: Maiusc+Invio arriva come Invio. */
const tastoCheArriva = (a) => (a.nome === 'press_key' ? a.argomenti.key
  : (a.nome === 'hotkey' ? a.argomenti.keys.filter((k) => !['ctrl', 'shift', 'alt', 'win'].includes(k)).at(-1) : null));

test('Q2-R1 (sicurezza, Accesso pieno): «shift+enter», «shift+space», «ctrl+space» senza ref ⇒ arrivano come Invio/spazio al fuoco: non devono partire senza valutazione', async () => {
  const rossi = [];
  for (const keys of ['shift+enter', 'shift+space', 'ctrl+space', 'alt+enter']) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome del profilo',
      risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'keys', keys }] }, { done: { success: true } }] });
    const r = await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
    const conferme = aiutante.azioni.filter((a) => ['enter', 'space'].includes(tastoCheArriva(a)));
    if (conferme.length) rossi.push(`${keys} → ${JSON.stringify(conferme)} (${r.testo})`);
  }
  assert.deepEqual(rossi, [], rossi.join(' | '));
});

test('Q2-R1b (Normale): «shift+enter» con ref nel campo della chat (un a capo per il modello) arriva come Invio ⇒ almeno una carta d\'invio prima', async () => {
  const aiutante = aiutanteFinto({ stato: statoChat });
  const s = sessione({ testoDellaPersona: 'Scrivi una bozza di saluto nel campo Messaggio, non inviarla',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'ciao' }, { type: 'keys', ref: 'e1', keys: 'shift+enter' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  const invii = aiutante.azioni.filter((a) => tastoCheArriva(a) === 'enter');
  const carte = s.domande.map((q) => q[0].question).filter((c) => /about to do|cannot check|sensitive/u.test(c));
  assert.ok(invii.length === 0 || carte.length >= 1, `Maiusc+Invio nel campo chat partito senza carta: ${JSON.stringify(invii)} | ${s.domande.map((q) => q[0].question).join(' | ')}`);
});

test('Q2-R2 (sicurezza, Accesso pieno): Invio con ref su un CONTENITORE (finestra, riquadro, barra) non diventa un clic al suo centro, mai valutato su ciò che c\'è lì', async () => {
  // cua-driver `click.rs:836-981`: un element_token senza Invoke/Toggle/Selection/ExpandCollapse ⇒ clic PostMessage al centro dell'elemento;
  // nelle finestre Chromium/WebView2 sempre un clic alle coordinate del centro (`click.rs:789-834`, `:854-862`)
  const rossi = [];
  for (const [role, label] of [['Window', 'Profilo'], ['Pane', 'Contenuto'], ['ScrollBar', 'Verticale'], ['Image', 'Logo'], ['Text', 'Premi Invio per continuare']]) {
    const aiutante = aiutanteFinto({ stato: statoContenitore(role, label) });
    const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome del profilo',
      risposte: [{ actions: [{ type: 'keys', ref: 'e0', keys: 'enter' }] }, { done: { success: true } }] });
    const r = await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
    const clic = aiutante.azioni.filter((a) => a.nome === 'click' && a.argomenti.element_token === 't0');
    if (clic.length) rossi.push(`${role} → ${JSON.stringify(aiutante.azioni)} (${r.testo})`);
  }
  assert.deepEqual(rossi, [], rossi.join(' | '));
});

test('Q2-R2b (Accesso pieno): spazio con ref su una VOCE di elenco (selezionare un file) non diventa `premi` (Invoke = aprire, eseguire)', async () => {
  // cua-driver `click.rs:883-905`: con element_token si prova PRIMA InvokePattern; su una voce di Esplora file Invoke è «apri» (doppio clic)
  const stato = () => ({ window_title: 'Download', app_name: 'explorer.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
    elements: [{ element_index: 1, element_token: 't1', role: 'ListItem', label: 'setup.exe', frame: { x: 10, y: 60, w: 400, h: 30 } },
      { element_index: 2, element_token: 't2', role: 'ListItem', label: 'foto.jpg', frame: { x: 10, y: 100, w: 400, h: 30 } }] });
  const aiutante = aiutanteFinto({ stato });
  const s = sessione({ testoDellaPersona: 'Seleziona il file setup.exe nella cartella Download',
    risposte: [{ actions: [{ type: 'keys', ref: 'e1', keys: 'space' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
  const invocati = aiutante.azioni.filter((a) => a.nome === 'click' && a.argomenti.element_token === 't1');
  assert.deepEqual(invocati, [], `lo spazio per selezionare è diventato un Invoke su «setup.exe»: ${JSON.stringify(aiutante.azioni)}`);
});

test('Q2-F1 (decisione 181, curato nel giro G5bis; tabella della decisione 159): «Sì» in una finestra «eliminare definitivamente?» del PC, cancellazione non chiesta ⇒ carta in Normale; in Accesso pieno passa ed è segnata', async () => {
  // `protezioni.mjs` eModale vuole `modale` sull'elemento finestra e leggiFinestre vuole `finestra` sugli elementi: ora li mette
  // `segnaDialoghi` dell'ospite (forma di un dialogo piccolo con 1-5 pulsanti; qui senza `tree_markdown`, solo dagli elementi)
  const stato = () => ({ window_title: 'Elimina file', app_name: 'explorer.exe', window_bounds: { x: 400, y: 250, width: 480, height: 200 }, screenshot_width: 480, screenshot_height: 200,
    elements: [{ element_index: 0, element_token: 't0', role: 'Window', label: 'Elimina file', frame: { x: 400, y: 250, w: 480, h: 200 } },
      { element_index: 1, element_token: 't1', role: 'Text', label: 'Eliminare definitivamente questo file? L\'azione non può essere annullata.', frame: { x: 420, y: 280, w: 440, h: 40 } },
      { element_index: 2, element_token: 't2', role: 'Button', label: 'Sì', frame: { x: 620, y: 400, w: 100, h: 30 } },
      { element_index: 3, element_token: 't3', role: 'Button', label: 'No', frame: { x: 740, y: 400, w: 100, h: 30 } }] });
  const normale = aiutanteFinto({ stato });
  const sn = sessione({ testoDellaPersona: 'Apri la cartella Download', risposte: [{ actions: [{ type: 'press', ref: 'e2' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante: normale }), sn);
  assert.deepEqual(sn.domande.map((q) => q[0].question).filter((c) => /a deletion/u.test(c)).length, 1, JSON.stringify(sn.domande.map((q) => q[0].question)));
  const pieno = aiutanteFinto({ stato });
  const segnate = [];
  const sp = sessione({ testoDellaPersona: 'Apri la cartella Download', risposte: [{ actions: [{ type: 'press', ref: 'e2' }] }, { done: { success: true } }] });
  sp.valore.emetti = (nome, dati) => { if (dati?.protezione) segnate.push(`${dati.protezione}→${dati.decisione}`); };
  await esegui(creaOspiteComputerUse({ aiutante: pieno }), sp, { livello: 'accesso-pieno' });
  assert.deepEqual(pieno.azioni.filter((a) => a.nome === 'click').map((a) => a.argomenti.element_token), ['t2']);
  assert.deepEqual(segnate, ['cancellazione→procedi-e-segna']);
});

test('Q2-R3 (la regola dichiarata del giro 3): un\'azione scartata dal vocabolario («tab+enter», «press» senza ref) cancella il ricordo come le altre scartate', async () => {
  const rossi = [];
  for (const scartata of [{ type: 'keys', keys: 'tab+enter' }, { type: 'press' }, { type: 'keys', keys: 'shift' }]) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome del profilo',
      risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }, scartata, { type: 'keys', keys: 'enter' }] }, { done: { success: true } }] });
    await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
    const invii = aiutante.azioni.filter((a) => a.nome === 'press_key' && a.argomenti.key === 'enter');
    if (invii.length) rossi.push(`${JSON.stringify(scartata)} → ${JSON.stringify(invii)}`);
  }
  assert.deepEqual(rossi, [], rossi.join(' | '));
});

test('Q2-V1 (B regge): Invio con ref su un pulsante ⇒ un solo `click` con il suo element_token, nessun tasto', async () => {
  const aiutante = aiutanteFinto({ stato: statoChat });
  const s = sessione({ testoDellaPersona: 'Scrivi ciao a Luca nel campo Messaggio e invialo',
    risposte: [{ actions: [{ type: 'keys', ref: 'e2', keys: 'enter' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.deepEqual(aiutante.azioni.map((a) => [a.nome, a.argomenti.element_token ?? null]), [['click', 't2']], JSON.stringify(aiutante.azioni));
});

test('Q2-V2 (A regge): «ctrl+shift+s» resta una combinazione valida, alla finestra con hotkey', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Salva il profilo con nome',
    risposte: [{ actions: [{ type: 'keys', keys: 'ctrl+shift+s' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.deepEqual(aiutante.azioni, [{ nome: 'hotkey', argomenti: { keys: ['ctrl', 'shift', 's'], pid: 4242, window_id: 101 } }], JSON.stringify(aiutante.azioni));
});

test('Q2-V3 (A regge): «ctrl+enter» senza ref e senza ricordo si scarta con «give ref»', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome',
    risposte: [{ actions: [{ type: 'keys', keys: 'ctrl+enter' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
  assert.deepEqual(aiutante.azioni, [], JSON.stringify(aiutante.azioni));
  assert.match(JSON.stringify(s.contenuti.at(-1)), /without \\"ref\\"/u);
});
