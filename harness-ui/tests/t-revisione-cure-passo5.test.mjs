/*
 * Agente T (04/11/2026): seconda revisione avversaria delle cure del passo 5 (testa 51629ad07). Aiutante finto, modello finto,
 * nessuno schermo vero. T-R* = rosse sulla testa (difetti), T-V* = controlli che devono restare verdi. Da copiare in harness-ui/tests/.
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
// Una chat con il campo «Messaggio», un campo «Nome» e il pulsante «Elimina account»
const statoChat = () => ({ window_title: 'Chat', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'Messaggio', frame: { x: 10, y: 60, w: 400, h: 30 } },
    { element_index: 2, element_token: 't2', role: 'Edit', label: 'Nome', frame: { x: 10, y: 100, w: 400, h: 30 } },
    { element_index: 3, element_token: 't3', role: 'Button', label: 'Elimina account', frame: { x: 10, y: 600, w: 160, h: 40 } }] });
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

/* cua-driver Windows `hotkey` (scorta 0cdcec94, platform-windows/src/tools/hotkey.rs:150-155): `key = non_mods.last()`, i tasti che non
   sono modificatori prima dell'ultimo SI PERDONO. Quindi hotkey(["tab","enter"]) manda il solo Invio al fuoco della finestra. */
const tastoMandato = (a) => (a.nome === 'press_key' ? a.argomenti.key
  : (a.nome === 'hotkey' ? a.argomenti.keys.filter((k) => !['ctrl', 'shift', 'alt', 'win'].includes(k)).at(-1) : null));

test('T-R1 (sicurezza, Accesso pieno): «x+enter» / «tab+enter» senza ref ⇒ cua-driver manda il solo Invio al fuoco: non deve partire senza valutazione', async () => {
  for (const keys of ['tab+enter', 'x+enter', 'tab+space']) {
    const aiutante = aiutanteFinto();
    const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome del profilo',
      risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'keys', keys }] }, { done: { success: true } }] });
    const r = await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
    const conferme = aiutante.azioni.filter((a) => ['enter', 'space'].includes(tastoMandato(a)));
    assert.deepEqual(conferme, [], `${keys}: Invio/spazio partito senza bersaglio valutato (${JSON.stringify(conferme)}); esito: ${r.testo}`);
  }
});

test('T-R1b (Normale): «tab+enter» senza ref ⇒ almeno una carta prima che parta l\'Invio', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome del profilo',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'keys', keys: 'tab+enter' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  const invii = aiutante.azioni.filter((a) => tastoMandato(a) === 'enter');
  const carteDellAzione = s.domande.map((q) => q[0].question).filter((c) => /about to do|cannot check/u.test(c));
  assert.ok(invii.length === 0 || carteDellAzione.length >= 1, `Invio partito senza carta: ${s.domande.map((q) => q[0].question).join(' | ')}`);
});

test('T-R2 (regola 17): nella domanda unica del gruppo un Invio senza ref NON si valuta sul ricordo del passo PRIMA (qui: il campo chat)', async () => {
  // passo 1: scrive in «Messaggio» (il ricordo resta lì); passo 2: scrive in «Nome», Invio senza ref (andrà a «Nome»), poi «Elimina account»
  const aiutante = aiutanteFinto({ stato: statoChat });
  const s = sessione({ testoDellaPersona: 'Scrivi ciao nel messaggio e Mario nel nome, poi elimina l\'account',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'ciao' }] },
      { actions: [{ type: 'type', ref: 'e2', text: 'Mario' }, { type: 'keys', keys: 'enter' }, { type: 'press', ref: 'e3' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  const multiple = s.domande.map((q) => q[0].question).filter((c) => /sensitive actions/u.test(c));
  for (const c of multiple) assert.doesNotMatch(c, /a send or submit/u, `la domanda unica elenca un invio che non avverrà (l'Invio va a «Nome»): ${c}`);
});

test('T-R3 (bassa, la regola dichiarata): la persona ha preso lo schermo (ask_person, «Fatto») ⇒ il ricordo non vale più per l\'Invio dopo', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome e premi invio', rispostaCarta: 'Done',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'ask_person', reason: 'check the form' }] },
      { actions: [{ type: 'keys', keys: 'enter' }] }, { done: { success: true } }] });
  s.valore.chiediDomanda = async (q) => { validaDomandeUtente(q); s.domande.push(q); const o = q[0].options.map((x) => x.label); return { status: 'answered', answers: { computer_use: o.includes('Done') ? 'Done' : 'Allow' } }; };
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  const invii = aiutante.azioni.filter((a) => a.nome === 'press_key' && a.argomenti.key === 'enter');
  assert.deepEqual(invii, [], `dopo la mano alla persona l'Invio senza ref è andato al campo ricordato: ${JSON.stringify(invii)}`);
});

// T-R4 (Invio nel campo del modulo con «Elimina account») è deciso dal terzo giro (Desktop 05/11, 14:33): Normale chiede una carta,
// Accesso pieno segna come al clic (decisione 159). Le prove sono in computer-use-terzo-giro.test.mjs (TG-1).

test('T-V1 (O-R1 chiuso): scrivi in Nome (ref), poi Invio senza ref nel passo dopo ⇒ il tasto va a Nome con element_token, nessun window_id', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome e premi invio',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'keys', keys: 'enter' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
  const tasti = aiutante.azioni.filter((a) => a.nome === 'press_key').map((a) => a.argomenti);
  assert.deepEqual(tasti, [{ key: 'enter', pid: 4242, element_token: 't1' }], JSON.stringify(tasti));
});

test('T-V2 (O-R1 chiuso): il ricordo NON sopravvive a un\'azione fallita (il tasto dopo un «premi» rifiutato si scarta)', async () => {
  const aiutante = aiutanteFinto();
  const chiamaVera = aiutante.chiama;
  aiutante.chiama = async (nome, argomenti, segnale) => (nome === 'scroll' ? { ok: false, dati: null, immagine: null, errore: 'x' } : chiamaVera(nome, argomenti, segnale));
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome e premi invio',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'scroll', direction: 'down' }] }, { actions: [{ type: 'keys', keys: 'enter' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
  assert.deepEqual(aiutante.azioni.filter((a) => a.nome === 'press_key'), [], JSON.stringify(aiutante.azioni));
});

// decisione 159 (owner 04/11): in Accesso pieno una cancellazione non chiesta passa e si segna; ferma solo col sospetto acceso. La prova
// resta sul riconoscimento (l'Invio con ref vale come «Elimina account»): con la politica di prima ferma, con quella nuova passa segnato
test('T-V3 (ATT-07 al contrario): Invio con ref su «Elimina account»: riconosciuto come cancellazione (decisione 159: passa e si segna)', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome',
    risposte: [{ actions: [{ type: 'keys', ref: 'e3', keys: 'enter' }] }, { done: { success: true } }] });
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno' });
  assert.equal(s.domande.length, 0, 'nessuna carta in Accesso pieno');
  assert.equal(aiutante.azioni.length, 1, r.testo);
  assert.deepEqual(aiutante.azioni, [{ nome: 'click', argomenti: { element_token: 't3' } }], "l'Invio con ref arriva sul pulsante giusto");
});

test('T-V4 (ATT-07 al contrario): Invio senza ref subito dopo un clic su «Elimina account» ⇒ valutato su quel pulsante (carta in Normale)', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Scrivi Mario nel campo Nome', rispostaCarta: 'Stop',
    risposte: [{ actions: [{ type: 'type', ref: 'e1', text: 'Mario' }] }, { actions: [{ type: 'click', x: 20, y: 610 }] }, { done: { success: true } }] });
  // il clic stesso su «Elimina account» chiede (cancellazione): Stop sulla carta ⇒ nessun clic
  await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.deepEqual(aiutante.azioni.filter((a) => a.nome === 'click'), [], JSON.stringify(aiutante.azioni));
});
