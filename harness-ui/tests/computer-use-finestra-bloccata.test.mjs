/*
 * Cura «finestra bloccata» del computer use del PC (owner 15/11 11:48, giudice v1943 e v1945; settima voce dei limiti della 0.2.2).
 * Parole dell'owner: «finestra bloccata per id scelta all'inizio, carta se cambia, stop se la persona muove mouse o tastiera».
 * Ciclo VERO, aiutante finto con una scena che cambia mentre il modello pensa, modello finto: nessuna prova tocca lo schermo vero.
 *  FB-01..03 sono le tre rosse del brief sul codice di prima (seconda finestra della stessa app, app con «Consenti sempre», mano della
 *  persona); le altre fissano i versi che la cura non deve rompere (finestra nata dal compito, tetto delle carte, input dell'aiutante).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

function png(larghezza, altezza) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(larghezza, 16); b.writeUInt32BE(altezza, 20);
  return b;
}
const IMMAGINE = png(1280, 720).toString('base64');
const BORDI = { x: 0, y: 0, width: 1280, height: 720 };
const finestra = (window_id, pid, app_name, title, z_index, bounds = BORDI) => ({ window_id, pid, app_name, title, bounds, z_index, is_on_screen: true, minimized: false });
const NOTEPAD = finestra(101, 4242, 'Notepad.exe', 'Compito - Blocco note', 5);
// la seconda finestra della STESSA app (stesso nome), aperta dalla persona prima del compito: non è del compito
const NOTEPAD_DELLA_PERSONA = finestra(102, 4343, 'Notepad.exe', 'Diario privato - Blocco note', 9);
const POSTA = finestra(303, 7070, 'olk.exe', 'Posta in arrivo - Outlook', 9);
const stato = (f, label = 'Editor di testo', token = `t${f.window_id}`) => ({
  window_title: f.title, app_name: f.app_name, window_bounds: f.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: token, role: 'Document', label, frame: { x: 10, y: 60, w: 1200, h: 600 } }],
});

/** Aiutante finto con una scena viva: `scena.finestre` si cambia da fuori (il modello finto la cambia mentre «pensa»). */
function aiutanteFinto(scena) {
  const chiamate = []; const azioni = []; const letture = [];
  return {
    chiamate, azioni, letture,
    async apri() { return { ok: true }; },
    compito() { return () => {}; },
    async chiama(nome, argomenti) {
      chiamate.push({ nome, argomenti });
      if (nome === 'list_windows') {
        const tutte = scena.finestre.map((w) => ({ ...w }));
        return { ok: true, dati: { windows: argomenti?.on_screen_only === false ? [...tutte, ...(scena.ridotte ?? [])] : tutte }, immagine: null, errore: null };
      }
      if (nome === 'get_window_state') {
        letture.push(argomenti.window_id);
        const w = [...scena.finestre, ...(scena.ridotte ?? [])].find((x) => x.window_id === argomenti.window_id);
        return { ok: true, dati: w ? stato(w, scena.etichette?.[w.window_id]) : {}, immagine: { base64: IMMAGINE, mime: 'image/png' }, errore: null };
      }
      azioni.push({ nome, argomenti, al: Date.now() });
      if (typeof scena.dopoAzione === 'function') scena.dopoAzione(nome, argomenti);
      if (nome === 'launch_app') return { ok: true, dati: { pid: scena.pidLanciato ?? 9999, windows: [] }, immagine: null, errore: null };
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
}

/** Modello finto: ogni risposta può essere una funzione (riceve il numero della richiesta e il testo dello schermo). */
function modelloFinto(risposte) {
  const testi = []; let n = 0;
  const fn = async ({ contenuto }) => {
    const testo = contenuto.find((p) => p.type === 'text')?.text ?? '';
    testi.push(testo);
    const r0 = risposte[Math.min(n, risposte.length - 1)]; n += 1;
    const r = typeof r0 === 'function' ? await r0(n, testo) : r0;
    return { testo: JSON.stringify(r), usage: { prompt_tokens: 100, completion_tokens: 10 } };
  };
  return { fn, testi };
}

function sessione({ testoDellaPersona, risposte, rispostaCarta = 'Allow' }) {
  const m = modelloFinto(risposte); const domande = []; const eventi = [];
  return {
    modello: m, domande, eventi,
    valore: {
      testoDellaPersona, lingua: 'en', chiediModello: m.fn,
      chiediDomanda: async (questions) => {
        validaDomandeUtente(questions);
        domande.push(questions);
        const r = typeof rispostaCarta === 'function' ? await rispostaCarta(domande.length, questions) : rispostaCarta;
        return { status: 'answered', answers: Object.fromEntries(questions.map((q) => [q.id, r])) };
      },
      emetti: (nome, dati) => eventi.push({ nome, dati }),
    },
  };
}
const esegui = (ospite, s, livello = 'scrittura-progetto') => ospite(NOME_COMPUTER_USE, { task: 'write in Notepad' },
  { fase: 'esegui', toolCallId: 'call-fb', segnale: new AbortController().signal, livelloAccesso: livello, sessione: s.valore });
const fermato = (s) => s.eventi.find((e) => e.nome === 'talos.computer-use-fermato')?.dati ?? null;
const pausa = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
// oltre il margine dell'inizio e delle risposte della persona (1,5 s) e quello delle azioni dell'aiutante (0,3 s)
const DOPO_I_MARGINI_MS = 1700;
const SCRIVI = (testo) => ({ actions: [{ type: 'type', ref: 'e1', text: testo }] });
const FINE = { done: { success: true, note: 'ok' } };

test('FB-01 (rossa del brief): una seconda finestra della STESSA app passa davanti ⇒ non si legge mai, e senza un sì non si agisce lì', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [
      () => { scena.finestre = [NOTEPAD_DELLA_PERSONA, NOTEPAD]; return SCRIVI('ciao'); }, // mentre il modello pensa, la finestra della persona passa davanti
      SCRIVI('addio'), FINE,
    ],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.ok(!aiutante.letture.includes(102), `la finestra della persona non si legge mai (letture: ${aiutante.letture.join(',')})`);
  assert.ok(!s.modello.testi.some((t) => t.includes('Diario privato')), 'il suo titolo non arriva al modello');
  assert.ok(aiutante.azioni.every((a) => a.argomenti.element_token !== 't102' && a.argomenti.window_id !== 102), 'nessuna azione nella finestra della persona');
  assert.equal(s.domande.length, 2, 'la carta del luogo nuovo parte per la finestra diversa');
  assert.match(s.domande[1][0].question, /Diario privato - Blocco note/u, 'la carta dice il titolo della finestra');
  assert.equal(r.ok, false);
});

test('FB-02 (rossa del brief): un\'app con «Consenti sempre» passa davanti ⇒ la carta parte lo stesso, e prima del sì nulla si legge', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const registroLuoghi = { perIlCiclo: async () => ({ domini: [], app: ['notepad', 'olk'] }), ricorda: async () => {} };
  let letturePrimaDelSi = null;
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
    rispostaCarta: (n) => { if (n === 2) letturePrimaDelSi = [...aiutante.letture]; return n === 1 ? 'Allow' : 'Stop'; },
    risposte: [() => { scena.finestre = [POSTA, NOTEPAD]; return SCRIVI('ciao'); }, SCRIVI('ancora'), FINE],
  });
  await esegui(creaOspiteComputerUse({ aiutante, registroLuoghi, pidDiTalos: 1 }), s);
  assert.equal(s.domande.length, 2, '«Consenti sempre» vale per l\'app ma non salta la carta di una finestra diversa da quella bloccata');
  assert.match(s.domande[1][0].question, /Posta in arrivo - Outlook/u);
  assert.ok(Array.isArray(letturePrimaDelSi) && !letturePrimaDelSi.includes(303), 'prima del sì la finestra nuova non si legge');
  assert.ok(!aiutante.letture.includes(303), 'col no non si legge mai');
});

test('FB-03 (rossa del brief): la persona muove mouse o tastiera durante il compito ⇒ stop col motivo, nessuna azione dopo', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const sensore = { ultimo: 0, async ultimoInput() { return this.ultimo; } };
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    // la persona muove il mouse mentre il modello pensa, fuori dal margine dell'inizio e lontano da ogni azione dell'aiutante
    risposte: [SCRIVI('ciao'), async () => { await pausa(DOPO_I_MARGINI_MS); sensore.ultimo = Date.now(); return SCRIVI('addio'); }, FINE],
  });
  sensore.ultimo = Date.now() - 60_000; // l'ultimo tocco della persona è di un minuto fa
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput: sensore }), s);
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.text), ['ciao'], 'dopo la mano della persona non parte nessuna azione');
  assert.equal(fermato(s)?.motivo, 'mano-della-persona', 'il motivo è quello della nota di sistema che c\'è già (computer.end.hand)');
  assert.match(r.testo, /the person took the mouse or keyboard/u);
});

test('FB-04: l\'input iniettato DALL\'AIUTANTE (durante una sua azione) non ferma il compito', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const sensore = { ultimo: Date.now() - 60_000, async ultimoInput() { return this.ultimo; } };
  scena.dopoAzione = () => { sensore.ultimo = Date.now(); }; // SendInput dell'aiutante: l'ultimo input cade dentro la sua azione
  // la prima azione parte DOPO il margine dell'inizio: a escluderla è solo la finestra dell'azione dell'aiutante
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    risposte: [async () => { await pausa(DOPO_I_MARGINI_MS); return SCRIVI('ciao'); }, SCRIVI('addio'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput: sensore }), s);
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.text), ['ciao', 'addio']);
});

test('FB-04b: anche un tasto dell\'aiutante dopo il margine, a metà compito, non è la mano della persona', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const sensore = { ultimo: Date.now() - 60_000, async ultimoInput() { return this.ultimo; } };
  scena.dopoAzione = (nome) => { if (nome === 'press_key') sensore.ultimo = Date.now(); };
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
    risposte: [SCRIVI('ciao'), async () => { await pausa(DOPO_I_MARGINI_MS); return { actions: [{ type: 'keys', ref: 'e1', keys: 'end' }] }; }, SCRIVI('fine'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput: sensore }), s);
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(aiutante.azioni.map((a) => a.nome), ['type_text', 'press_key', 'type_text']);
});

test('FB-05: il clic della persona sulla carta non è «mano della persona» (la risposta a TALOS ha il suo margine)', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const sensore = { ultimo: Date.now() - 60_000, async ultimoInput() { return this.ultimo; } };
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
    // la persona legge la carta oltre il margine dell'inizio e preme «Consenti»: è input, ma è la risposta
    rispostaCarta: async () => { await pausa(DOPO_I_MARGINI_MS); sensore.ultimo = Date.now(); return 'Allow'; },
    risposte: [SCRIVI('ciao'), FINE],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput: sensore }), s);
  assert.equal(r.ok, true, r.testo);
  assert.equal(s.domande.length, 1);
});

test('FB-06: una finestra NATA dal compito (stesso pid, dopo un\'azione: «Salva con nome») si segue senza carta; chiusa, si torna alla prima', async () => {
  const SALVA = finestra(111, 4242, 'Notepad.exe', 'Salva con nome', 8, { x: 200, y: 100, width: 800, height: 500 });
  const scena = { finestre: [NOTEPAD] };
  scena.dopoAzione = (nome, a) => {
    if (nome === 'hotkey' || nome === 'press_key') scena.finestre = [SALVA, NOTEPAD];
    if (nome === 'type_text' && a.element_token === 't111') scena.finestre = [NOTEPAD];
  };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e salvalo',
    risposte: [{ actions: [{ type: 'keys', ref: 'e1', keys: 'ctrl+s' }] }, SCRIVI('nota.txt'), SCRIVI('fine'), FINE],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(r.ok, true, r.testo);
  assert.equal(s.domande.length, 1, 'nessuna carta in più per la finestra nata dal compito');
  assert.deepEqual([...new Set(aiutante.letture)], [101, 111], 'si legge la finestra nata, poi di nuovo la prima');
  assert.equal(aiutante.letture.at(-1), 101);
});

test('FB-07: Accesso pieno, una finestra estranea copre quella del compito ⇒ niente lettura e, se il modello vuole agire, stop', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    risposte: [() => { scena.finestre = [POSTA, NOTEPAD]; return SCRIVI('ciao'); }, SCRIVI('addio'), FINE],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(s.domande.length, 0, 'Accesso pieno: zero carte');
  assert.ok(!aiutante.letture.includes(303), 'la finestra estranea non si legge');
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.text), ['ciao']);
  assert.equal(fermato(s)?.motivo, 'finestra-cambiata');
  assert.equal(r.ok, false);
});

test('FB-08: la finestra estranea passa davanti e se ne va mentre il modello aspetta ⇒ nessuna carta, si riprende sulla stessa finestra', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    risposte: [
      () => { scena.finestre = [POSTA, NOTEPAD]; return SCRIVI('ciao'); },
      () => { scena.finestre = [NOTEPAD]; return { actions: [{ type: 'wait', seconds: 0 }] }; },
      SCRIVI('addio'), FINE,
    ],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(r.ok, true, r.testo);
  assert.match(s.modello.testi[1] ?? '', /covered|closed/u, 'il modello legge che la finestra del compito è coperta');
  assert.doesNotMatch(s.modello.testi[1] ?? '', /Posta in arrivo/u, 'e non il titolo di chi la copre');
  assert.equal(s.domande.length, 1);
  assert.ok(!aiutante.letture.includes(303));
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.text), ['ciao', 'addio']);
});

test('FB-09: il piano nomina il Blocco note ma non è aperto ⇒ la finestra estranea in cima non si legge; quella aperta dal compito sì, senza carta', async () => {
  const scena = { finestre: [POSTA], pidLanciato: 4242 };
  scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [NOTEPAD, POSTA]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
    risposte: [{ actions: [{ type: 'open', app: 'notepad' }] }, SCRIVI('ciao'), FINE],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(r.ok, true, r.testo);
  assert.ok(!aiutante.letture.includes(303), 'la posta in cima non arriva al modello');
  assert.ok(!s.modello.testi.some((t) => t.includes('Posta in arrivo')));
  assert.equal(s.domande.length, 1);
  assert.deepEqual(aiutante.azioni.map((a) => a.nome), ['launch_app', 'type_text']);
});

test('FB-10: col sì sulla carta della finestra nuova il compito passa lì, e una sola carta (non anche quella dell\'app)', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    // l'azione decisa sullo schermo NON letto (la finestra coperta) non parte: dopo il sì il modello legge la finestra nuova e decide di nuovo
    risposte: [() => { scena.finestre = [POSTA, NOTEPAD]; return SCRIVI('ciao'); }, SCRIVI('addio'), SCRIVI('addio'), FINE],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(r.ok, true, r.testo);
  assert.equal(s.modello.testi.length, 4);
  assert.equal(s.domande.length, 2, 'la carta iniziale e quella della finestra: non anche quella dell\'app «olk»');
  assert.ok(aiutante.letture.includes(303), 'dopo il sì si legge');
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.element_token), ['t101', 't303']);
});

test('FB-11: la mano della persona si sente anche PRIMA della prima lettura dopo il modello (nessuna lettura, nessuna azione)', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const sensore = { ultimo: Date.now() - 60_000, async ultimoInput() { return this.ultimo; } };
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [async () => { await pausa(DOPO_I_MARGINI_MS); sensore.ultimo = Date.now(); return SCRIVI('ciao'); }, FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput: sensore }), s);
  assert.equal(aiutante.azioni.length, 0, 'l\'azione decisa dopo la mano non parte');
  assert.equal(fermato(s)?.motivo, 'mano-della-persona');
});

test('FB-13: il motivo nuovo «finestra-cambiata» ha la sua frase a schermo, inglese e italiano, e la sua frase per il modello', async () => {
  const { readFileSync } = await import('node:fs');
  const parole = readFileSync(new URL('../frontend/src/components/computer-use/parole.js', import.meta.url), 'utf8');
  assert.match(parole, /'finestra-cambiata': 'computer\.end\.windowChanged'/u);
  const { default: testi } = await import('../frontend/src/i18n/testi/computer.js');
  assert.match(testi.en['end.windowChanged'], /^The window I was working in was closed, minimized or covered by another window, so I stopped\./u);
  assert.match(testi.it['end.windowChanged'], /^La finestra su cui lavoravo è stata chiusa, ridotta o coperta da un'altra, quindi mi sono fermato\./u);
  const { fraseFinale } = await import('../src/computer-use/attrezzo.mjs');
  assert.match(fraseFinale({ esito: 'fermato', motivo: 'finestra-cambiata', passi: 1 }, null), /window of this task was closed, minimized or covered/u);
});

test('FB-14: il compito chiude la sua finestra ⇒ si legge «chiusa», niente della finestra sotto, e il modello può dire fatto senza carta', async () => {
  const scena = { finestre: [NOTEPAD, POSTA] };
  scena.dopoAzione = (nome) => { if (nome === 'hotkey' || nome === 'press_key') scena.finestre = [POSTA]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Chiudi il Blocco note', risposte: [{ actions: [{ type: 'keys', ref: 'e1', keys: 'alt+f4' }] }, FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(r.ok, true, r.testo);
  assert.equal(s.domande.length, 1);
  assert.ok(!aiutante.letture.includes(303), 'la posta, ora in cima, non si legge');
  assert.match(s.modello.testi[1] ?? '', /closed/u);
  assert.doesNotMatch(s.modello.testi[1] ?? '', /Posta in arrivo/u);
});

test('FB-15: lo stesso window_id tornato con un ALTRO pid non è la finestra del compito', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const IMPOSTORE = finestra(101, 6666, 'Notepad.exe', 'Altro documento - Blocco note', 9);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [() => { scena.finestre = [IMPOSTORE]; return SCRIVI('ciao'); }, SCRIVI('addio'), FINE],
  });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(aiutante.letture.length, 1, 'si è letta solo la prima volta, col pid giusto');
  assert.equal(s.domande.length, 2);
  assert.match(s.domande[1][0].question, /Altro documento/u);
});

test('FB-16: una finestra della persona dello STESSO pid (Blocco note a processo unico), ridotta prima del compito e riaperta dopo un\'azione, non è «nata dal compito»', async () => {
  const PRIVATA = finestra(102, 4242, 'Notepad.exe', 'Diario privato - Blocco note', 9);
  const scena = { finestre: [NOTEPAD], ridotte: [{ ...PRIVATA, is_on_screen: false, minimized: true }] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [() => { scena.ridotte = []; scena.finestre = [PRIVATA, NOTEPAD]; return SCRIVI('ciao'); }, SCRIVI('addio'), FINE],
  });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.ok(!aiutante.letture.includes(102), 'stesso pid ma c\'era già: non si legge');
  assert.equal(s.domande.length, 2, 'la carta della finestra');
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.text), ['ciao']);
});

test('FB-05b: la risposta a una carta a METÀ compito (finestra nuova consentita) non è la mano della persona', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const sensore = { ultimo: Date.now() - 60_000, async ultimoInput() { return this.ultimo; } };
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    rispostaCarta: async (n) => { if (n === 2) { await pausa(DOPO_I_MARGINI_MS); sensore.ultimo = Date.now(); } return 'Allow'; },
    risposte: [() => { scena.finestre = [POSTA, NOTEPAD]; return SCRIVI('ciao'); }, SCRIVI('addio'), SCRIVI('addio'), FINE],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput: sensore }), s);
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.element_token), ['t101', 't303']);
  assert.equal(s.domande.length, 2, 'una carta per la finestra, non anche quella della sua app');
});

test('FB-08b: Accesso pieno, la finestra estranea passa e se ne va mentre il modello aspetta ⇒ nessuno stop, si riprende', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    risposte: [() => { scena.finestre = [POSTA, NOTEPAD]; return SCRIVI('ciao'); }, () => { scena.finestre = [NOTEPAD]; return { actions: [{ type: 'wait', seconds: 0 }] }; }, SCRIVI('addio'), FINE],
  });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.text), ['ciao', 'addio']);
});

test('FB-17b: Accesso pieno, una finestra dello stesso pid comparsa prima di ogni azione ⇒ non si legge, e al tentativo di agire stop', async () => {
  const POPUP = finestra(112, 4242, 'Notepad.exe', 'Aggiornamento disponibile', 8);
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
    risposte: [() => { scena.finestre = [POPUP, NOTEPAD]; return { actions: [{ type: 'wait', seconds: 0 }] }; }, SCRIVI('ciao'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.ok(!aiutante.letture.includes(112));
  assert.equal(fermato(s)?.motivo, 'finestra-cambiata');
  assert.equal(aiutante.azioni.length, 0);
});

test('FB-17: una finestra dello stesso pid comparsa PRIMA di ogni azione del compito non è nata dal compito', async () => {
  const POPUP = finestra(112, 4242, 'Notepad.exe', 'Aggiornamento disponibile', 8);
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
    rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [() => { scena.finestre = [POPUP, NOTEPAD]; return { actions: [{ type: 'wait', seconds: 0 }] }; }, SCRIVI('ciao'), FINE],
  });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.ok(!aiutante.letture.includes(112));
  assert.equal(s.domande.length, 2);
  assert.match(s.domande[1][0].question, /Aggiornamento disponibile/u);
});

/** Un `esegui` finto che chiama le porte dell'ospite a mano: prova le difese dell'ospite anche se il ciclo non le raggiungesse. */
const eseguiAMano = (passi) => async ({ porte }) => {
  const esiti = [];
  for (const p of passi) {
    if (p === 'guarda') { esiti.push(await porte.guarda()); continue; }
    esiti.push(await porte.agisci(p, null, undefined));
  }
  eseguiAMano.ultimi = esiti;
  return { esito: 'riuscito', passi: 0 };
};
const MANO_DI = (testo) => sessione({ testoDellaPersona: testo, risposte: [FINE] });

test('FB-18: con la finestra del compito coperta l\'ospite rifiuta da sé tasti e clic (difesa anche senza il ciclo)', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const ospite = creaOspiteComputerUse({ aiutante, pidDiTalos: 1, esegui: async (a) => {
    await a.porte.guarda(); scena.finestre = [POSTA, NOTEPAD];
    return eseguiAMano(['guarda', { tipo: 'tasti', combinazione: 'enter' }, { tipo: 'clic', x: 10, y: 10, pixel: { x: 10, y: 10 } }, { tipo: 'aspetta', secondi: 0 },
      { tipo: 'apri', app: 'notepad' }])(a);
  } });
  await esegui(ospite, MANO_DI('Apri il Blocco note e scrivi ciao'), 'accesso-pieno');
  const [g, tasto, clic, attesa, apri] = eseguiAMano.ultimi;
  assert.equal(g.cambioFinestra?.motivo, 'coperta');
  assert.equal(tasto.esito, 'rifiutata');
  assert.equal(clic.esito, 'rifiutata');
  assert.equal(attesa.esito, 'non-verificabile', 'l\'attesa resta possibile');
  assert.equal(apri.esito, 'rifiutata', 'con la scelta in attesa nemmeno un\'app nuova');
  assert.equal(aiutante.azioni.length, 0);
});

test('FB-19: con la finestra del compito chiusa l\'ospite rifiuta da sé scorrimento e tasti', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const ospite = creaOspiteComputerUse({ aiutante, pidDiTalos: 1, esegui: async (a) => {
    await a.porte.guarda(); scena.finestre = [POSTA];
    return eseguiAMano(['guarda', { tipo: 'scorri', direzione: 'down', quantita: 3 }, { tipo: 'tasti', combinazione: 'ctrl+a' }, { tipo: 'apri', app: 'notepad' }])(a);
  } });
  await esegui(ospite, MANO_DI('Apri il Blocco note e scrivi ciao'), 'accesso-pieno');
  const [g, scorri, tasti, apri] = eseguiAMano.ultimi;
  assert.equal(g.cambioFinestra?.motivo, 'chiusa');
  assert.equal(scorri.esito, 'rifiutata');
  assert.equal(tasti.esito, 'rifiutata');
  assert.equal(apri.esito, 'rifiutata');
  assert.equal(aiutante.azioni.length, 0);
});

test('FB-20b: nessuna finestra a schermo e nessun piano ⇒ un tasto non parte verso il primo piano', async () => {
  const scena = { finestre: [] };
  const aiutante = aiutanteFinto(scena);
  const ospite = creaOspiteComputerUse({ aiutante, pidDiTalos: 1, esegui: eseguiAMano(['guarda', { tipo: 'tasti', combinazione: 'enter' }, { tipo: 'scorri', direzione: 'up', quantita: 1 }]) });
  await esegui(ospite, MANO_DI('premi invio'), 'accesso-pieno');
  const [g, tasto, scorri] = eseguiAMano.ultimi;
  assert.equal(g.app, null);
  assert.equal(tasto.esito, 'rifiutata');
  assert.equal(scorri.esito, 'rifiutata');
  assert.equal(aiutante.azioni.length, 0);
});

test('FB-20: senza nessuna finestra letta un tasto o uno scorrimento non vanno alla finestra in primo piano; aprire un\'app sì', async () => {
  const scena = { finestre: [POSTA] };
  const aiutante = aiutanteFinto(scena);
  const ospite = creaOspiteComputerUse({ aiutante, pidDiTalos: 1, esegui: eseguiAMano(['guarda', { tipo: 'tasti', combinazione: 'ctrl+a' },
    { tipo: 'scorri', direzione: 'down', quantita: 3 }, { tipo: 'apri', app: 'notepad' }]) });
  await esegui(ospite, MANO_DI('Apri il Blocco note e scrivi ciao'), 'accesso-pieno');
  const [g, tasti, scorri, apri] = eseguiAMano.ultimi;
  assert.equal(g.app, null, 'il piano nomina il Blocco note: la posta non si legge');
  assert.equal(tasti.esito, 'rifiutata');
  assert.equal(scorri.esito, 'rifiutata');
  assert.notEqual(apri.esito, 'rifiutata');
  assert.deepEqual(aiutante.azioni.map((a) => a.nome), ['launch_app']);
});

test('FB-21: con la finestra bloccata, la finestra di un\'app aperta DAL compito è nata dal compito: chiede solo la carta dell\'app', async () => {
  const CALC = finestra(404, 7777, 'CalculatorApp.exe', 'Calcolatrice', 9);
  const scena = { finestre: [NOTEPAD], pidLanciato: 7777 };
  scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [CALC, NOTEPAD]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao',
    risposte: [{ actions: [{ type: 'open', app: 'calc' }] }, SCRIVI('2+2'), SCRIVI('2+2'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(r.ok, true, r.testo);
  assert.equal(s.domande.length, 2);
  assert.match(s.domande[1][0].question, /reached "calculatorapp"/u, 'la carta dell\'app che c\'era già, non quella della finestra');
  assert.ok(aiutante.letture.includes(404));
});

test('FB-22: in Accesso pieno la finestra di un\'app aperta dal compito si segue (nessuno stop)', async () => {
  const CALC = finestra(404, 7777, 'CalculatorApp.exe', 'Calcolatrice', 9);
  const scena = { finestre: [NOTEPAD], pidLanciato: 7777 };
  scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [CALC, NOTEPAD]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [{ actions: [{ type: 'open', app: 'calc' }] }, SCRIVI('2+2'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.element_token ?? a.nome), ['launch_app', 't404']);
});

test('FB-23: la persona muove il mouse durante un\'attesa ⇒ alla lettura dopo ci si ferma, senza leggere e senza chiedere al modello', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const sensore = { ultimo: Date.now() - 60_000, async ultimoInput() { return this.ultimo; } };
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [
    async () => { await pausa(DOPO_I_MARGINI_MS); setTimeout(() => { sensore.ultimo = Date.now(); }, 400); return { actions: [{ type: 'wait', seconds: 1 }] }; },
    SCRIVI('ciao'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput: sensore }), s, 'accesso-pieno');
  assert.equal(fermato(s)?.motivo, 'mano-della-persona');
  assert.equal(aiutante.letture.length, 1, 'dopo la mano nessuna lettura');
  assert.equal(s.modello.testi.length, 1, 'e nessuna domanda al modello');
});

test('FB-24: la mano durante un\'attesa a metà lotto ⇒ la rilettura per l\'azione dopo non parte', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const sensore = { ultimo: Date.now() - 60_000, async ultimoInput() { return this.ultimo; } };
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [
    async () => { await pausa(DOPO_I_MARGINI_MS); setTimeout(() => { sensore.ultimo = Date.now(); }, 400); return { actions: [{ type: 'wait', seconds: 1 }, { type: 'type', ref: 'e1', text: 'ciao' }] }; },
    FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput: sensore }), s, 'accesso-pieno');
  assert.equal(fermato(s)?.motivo, 'mano-della-persona');
  assert.equal(aiutante.letture.length, 1);
  assert.equal(aiutante.azioni.length, 0);
});

test('FB-25: una finestra della persona dello stesso pid, già a schermo all\'inizio e portata davanti dopo un\'azione, chiede la carta', async () => {
  const PRIVATA_SOTTO = finestra(102, 4242, 'Notepad.exe', 'Diario privato - Blocco note', 1, { x: 900, y: 600, width: 300, height: 200 });
  const scena = { finestre: [NOTEPAD, PRIVATA_SOTTO] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({
    testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [() => { scena.finestre = [{ ...PRIVATA_SOTTO, z_index: 9, bounds: BORDI }, NOTEPAD]; return SCRIVI('ciao'); }, SCRIVI('addio'), FINE],
  });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.ok(!aiutante.letture.includes(102));
  assert.equal(s.domande.length, 2);
});

test('FB-26: il piano nomina un sito e nessun browser è aperto ⇒ la finestra in cima non si legge', async () => {
  const scena = { finestre: [POSTA] };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Vai su example.com e leggi il titolo', risposte: [{ done: { success: false, impossible: true, note: 'no browser' } }] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.ok(!aiutante.letture.includes(303));
  assert.doesNotMatch(s.modello.testi[0] ?? '', /Posta in arrivo/u);
});

test('FB-27: Accesso pieno, lo stesso window_id con un altro pid ⇒ non si legge e, al tentativo di agire, stop', async () => {
  const scena = { finestre: [NOTEPAD] };
  const aiutante = aiutanteFinto(scena);
  const IMPOSTORE = finestra(101, 6666, 'Notepad.exe', 'Altro documento - Blocco note', 9);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao poi addio',
    risposte: [() => { scena.finestre = [IMPOSTORE]; return SCRIVI('ciao'); }, SCRIVI('addio'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(aiutante.letture.length, 1);
  assert.equal(fermato(s)?.motivo, 'finestra-cambiata');
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.text), ['ciao']);
});

test('FB-12: un sensore che non risponde o lancia non ferma il compito (non si inventa una mano)', async () => {
  for (const sensoreInput of [{ ultimoInput: async () => null }, { ultimoInput: async () => { throw new Error('rotto'); } }]) {
    const scena = { finestre: [NOTEPAD] };
    const aiutante = aiutanteFinto(scena);
    const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [SCRIVI('ciao'), FINE] });
    const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1, sensoreInput }), s);
    assert.equal(r.ok, true, r.testo);
  }
});

/*
 * Revisore C della 0.2.3 (ROSSO, peggioramento sulla 0.2.2; `C:/T/rev-cuf-C/harness-ui/tests/rev-c-dieci-compiti.test.mjs` C09, C10,
 * C12): un'app a PROCESSO UNICO aperta dal compito passa la finestra al processo già acceso (Esplora file alla shell; Chrome ed Edge già
 * accesi al loro processo) e il pid di `launch_app` esce (cua-driver `related_processes` guarda solo i discendenti, `win32/apps.rs:66-70`).
 * La finestra nuova ha un pid che il compito non conosce: Accesso pieno si fermava per `finestra-cambiata`, Normale chiedeva una carta in
 * più che diceva il falso. Cura STRETTA (giudice v1996): è del compito anche una finestra che (1) ha un id che non c'era nella
 * `list_windows` fatta per `apri` (subito prima di `launch_app`, ridotte comprese), (2) è dello stesso programma lanciato, (3) si guarda
 * prima dell'azione dopo. FB-31, FB-32 e FB-33 tengono ciascuna delle tre condizioni.
 */
const ESPLORA = finestra(601, 3000, 'explorer.exe', 'Download - Esplora file', 9);
const APRI = (app) => ({ actions: [{ type: 'open', app }] });
const esploraScena = () => {
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 }; // 8888 esce: la finestra la apre la shell già accesa (pid 3000)
  scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [ESPLORA, NOTEPAD]; };
  return scena;
};
const tokenOppureNome = (aiutante) => aiutante.azioni.map((a) => a.argomenti.element_token ?? a.nome);

test('FB-28 (C10 del revisore C): Accesso pieno, il compito apre Esplora file (processo unico) ⇒ la finestra nuova si segue, nessuno stop', async () => {
  const aiutante = aiutanteFinto(esploraScena());
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('x'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(r.ok, true, r.testo);
  assert.equal(fermato(s), null);
  assert.equal(s.domande.length, 0);
  assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', 't601']);
});

test('FB-29 (C09 del revisore C): Normale, il compito apre Esplora file ⇒ solo la carta del compito, mai «no longer in front»', async () => {
  const aiutante = aiutanteFinto(esploraScena());
  // il modello lo chiama col nome che vede la persona: è lo stesso programma (`explorer`, come nel piano dalla frase)
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', risposte: [SCRIVI('ciao'), APRI('File Explorer'), SCRIVI('x'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(r.ok, true, r.testo);
  assert.equal(s.domande.length, 1, s.domande.map((q) => q[0].question).join(' | '));
  assert.ok(aiutante.letture.includes(601));
  assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', 't601']);
});

test('FB-30 (C12 del revisore C): Normale, Chrome già acceso con la finestra della persona ridotta ⇒ si segue solo la finestra nuova, una carta', async () => {
  const PERSONA = { ...finestra(700, 6060, 'chrome.exe', 'Persona - Google Chrome', 1), minimized: true, is_on_screen: false };
  const NUOVA = finestra(701, 6060, 'chrome.exe', 'Nuova scheda - Google Chrome', 9);
  const scena = { finestre: [NOTEPAD], ridotte: [PERSONA], pidLanciato: 8889 };
  scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [NUOVA, NOTEPAD]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Scrivi ciao nel Blocco note e poi apri Chrome', risposte: [SCRIVI('ciao'), APRI('chrome'), SCRIVI('x'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(r.ok, true, r.testo);
  assert.equal(s.domande.length, 1, s.domande.map((q) => q[0].question).join(' | '));
  assert.ok(aiutante.letture.includes(701));
  assert.ok(!aiutante.letture.includes(700), 'la finestra della persona non si legge mai');
});

test('FB-31 (condizione 3): la finestra di Esplora file compare solo DOPO l\'azione seguente ⇒ non è del compito: Accesso pieno si ferma, mai letta', async () => {
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
  scena.dopoAzione = (nome, a) => { if (nome === 'type_text' && a.text === 'y') scena.finestre = [ESPLORA, NOTEPAD]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file',
    risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('y'), SCRIVI('x'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(fermato(s)?.motivo, 'finestra-cambiata');
  assert.ok(!aiutante.letture.includes(601));
  assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', 't101']);
});

test('FB-32 (condizione 2): dopo «apri Esplora file» compare una finestra NUOVA di un altro programma ⇒ carta, mai letta prima del sì', async () => {
  const PROMEMORIA = finestra(304, 7070, 'olk.exe', 'Promemoria privato - Outlook', 9);
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
  scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [PROMEMORIA, NOTEPAD]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('x'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(s.domande.length, 2);
  assert.match(s.domande[1][0].question, /Promemoria privato/u);
  assert.ok(!aiutante.letture.includes(304));
  assert.ok(!s.modello.testi.some((t) => t.includes('Promemoria privato')));
});

// la persona apre (ridotta) una sua finestra di Esplora file a compito iniziato; «apri Esplora file» la riporta su: c'era PRIMA del lancio
const vecchiaScena = () => {
  const VECCHIA = finestra(600, 3000, 'explorer.exe', 'Documenti privati - Esplora file', 9);
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
  scena.dopoAzione = (nome, a) => {
    if (nome === 'type_text' && a.text === 'ciao') scena.ridotte = [{ ...VECCHIA, minimized: true, is_on_screen: false }];
    if (nome === 'launch_app') { scena.finestre = [VECCHIA, NOTEPAD]; scena.ridotte = []; }
  };
  return scena;
};

test('FB-33 (condizione 1): «apri Esplora file» riporta su una finestra di Esplora file che c\'era già (ridotta) ⇒ non è del compito: carta, mai letta', async () => {
  const aiutante = aiutanteFinto(vecchiaScena());
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('x'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(s.domande.length, 2);
  assert.ok(!aiutante.letture.includes(600));
  assert.ok(!s.modello.testi.some((t) => t.includes('Documenti privati')));
});

test('FB-36 (condizione 1, Accesso pieno): la finestra di Esplora file che c\'era prima del lancio ⇒ stop, mai letta', async () => {
  const aiutante = aiutanteFinto(vecchiaScena());
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('x'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(fermato(s)?.motivo, 'finestra-cambiata');
  assert.ok(!aiutante.letture.includes(600));
});

test('FB-35: Accesso pieno, il modello apre «Esplora file» col nome italiano ⇒ è lo stesso programma, la finestra nuova si segue', async () => {
  const aiutante = aiutanteFinto(esploraScena());
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', risposte: [SCRIVI('ciao'), APRI('Esplora file'), SCRIVI('x'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', 't601']);
});

test('FB-37 (condizione 3, Normale): la finestra di Esplora file compare solo dopo l\'azione seguente ⇒ carta, mai letta prima del sì', async () => {
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
  scena.dopoAzione = (nome, a) => { if (nome === 'type_text' && a.text === 'y') scena.finestre = [ESPLORA, NOTEPAD]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('y'), SCRIVI('x'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(s.domande.length, 2);
  assert.match(s.domande[1][0].question, /Esplora file/u);
  assert.ok(!aiutante.letture.includes(601));
});

test('FB-39 (condizione 2, Accesso pieno): dopo «apri Esplora file» una finestra nuova di un altro programma ⇒ stop, mai letta', async () => {
  const PROMEMORIA = finestra(304, 7070, 'olk.exe', 'Promemoria privato - Outlook', 9);
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
  scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [PROMEMORIA, NOTEPAD]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('x'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(fermato(s)?.motivo, 'finestra-cambiata');
  assert.ok(!aiutante.letture.includes(304));
  assert.ok(!s.modello.testi.some((t) => t.includes('Promemoria privato')));
});

// come la finestra «nata dal compito», l'eccezione vale solo con una finestra del compito già scelta: non sceglie lei la prima (FB-09, FB-26)
for (const livello of ['scrittura-progetto', 'accesso-pieno']) {
  test(`FB-38 (${livello}): nessuna finestra ancora scelta, il compito apre un programma fuori dal piano ⇒ la sua finestra non diventa la prima`, async () => {
    const CALC = finestra(404, 3100, 'CalculatorApp.exe', 'Calcolatrice', 9);
    const scena = { finestre: [], pidLanciato: 8890 };
    scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [CALC]; };
    const aiutante = aiutanteFinto(scena);
    const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [APRI('calculator'), FINE] });
    await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, livello);
    assert.deepEqual(aiutante.letture, []);
    assert.ok(!s.modello.testi.some((t) => t.includes('Calcolatrice')));
  });
}

test('FB-34: dopo «apri» un\'attesa non è un\'azione sullo schermo: la finestra di Esplora file comparsa durante l\'attesa si segue', async () => {
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file',
    risposte: [SCRIVI('ciao'), APRI('explorer'), () => { scena.finestre = [ESPLORA, NOTEPAD]; return { actions: [{ type: 'wait', seconds: 0 }] }; }, SCRIVI('x'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(r.ok, true, r.testo);
  assert.equal(fermato(s), null);
  assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', 't601']);
});

// il pid della finestra seguita (la shell, o il Chrome della persona) NON diventa del compito: un'altra finestra di quel processo,
// comparsa dopo, resta della persona
const altraEsploraScena = () => {
  const ALTRA = finestra(602, 3000, 'explorer.exe', 'Documenti privati - Esplora file', 10);
  const scena = esploraScena();
  const primaDopo = scena.dopoAzione;
  scena.dopoAzione = (nome, a) => { primaDopo(nome, a); if (nome === 'type_text' && a.text === 'x') scena.finestre = [ALTRA, ESPLORA, NOTEPAD]; };
  return scena;
};
test('FB-40: Accesso pieno, dopo Esplora file seguita la persona apre un\'altra finestra di Esplora file ⇒ stop, mai letta', async () => {
  const aiutante = aiutanteFinto(altraEsploraScena());
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('x'), SCRIVI('z'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(fermato(s)?.motivo, 'finestra-cambiata');
  assert.ok(!aiutante.letture.includes(602));
  assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', 't601']);
});
test('FB-41: Normale, dopo Esplora file seguita la persona apre un\'altra finestra di Esplora file ⇒ carta, mai letta prima del sì', async () => {
  const aiutante = aiutanteFinto(altraEsploraScena());
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [SCRIVI('ciao'), APRI('explorer'), SCRIVI('x'), SCRIVI('z'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.equal(s.domande.length, 2);
  assert.ok(!aiutante.letture.includes(602));
  assert.ok(!s.modello.testi.some((t) => t.includes('Documenti privati')));
});

/*
 * V9 della verifica mirata (giudice v2008, prima dell'uscita 0.2.3): un nome di «apri» in cui il piano legge DUE programmi
 * («File Explorer Outlook») rendeva del compito anche le finestre nuove del secondo, che nessuno aveva lanciato e la 0.2.2 non leggeva.
 * Cura: con due o più programmi nel nome si adottano solo le finestre nuove del PRIMO (il primo scritto), o di nessuno se non si può dire.
 */
const POSTA_NUOVA = finestra(909, 5050, 'outlook.exe', 'Posta in arrivo privata - Outlook', 9);
const ESPLORA_NUOVA = finestra(602, 3000, 'explorer.exe', 'Cartella privata - Esplora file', 9);
const dueNuove = (sopra, sotto) => {
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 }; // 8888 esce: nessuna delle due ha il pid del lancio
  scena.dopoAzione = (nome) => { if (nome === 'launch_app') scena.finestre = [sopra, { ...sotto, z_index: 8 }, NOTEPAD]; };
  return scena;
};

test('FB-42 (V9, Accesso pieno): «apri File Explorer Outlook» ⇒ la finestra nuova di Outlook (secondo programma) non è del compito: mai letta, stop', async () => {
  const aiutante = aiutanteFinto(dueNuove(POSTA_NUOVA, ESPLORA));
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Esplora file', risposte: [SCRIVI('ciao'), APRI('File Explorer Outlook'), SCRIVI('x'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.ok(!aiutante.letture.includes(909), 'la finestra del secondo programma non si legge');
  assert.ok(!s.modello.testi.some((t) => t.includes('Posta in arrivo privata')));
  assert.equal(fermato(s)?.motivo, 'finestra-cambiata');
  assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app']);
});

test('FB-43 (V9, Normale): «apri Outlook File Explorer» ⇒ conta il primo SCRITTO (Outlook), non l\'ordine della tabella: Esplora file chiede la carta', async () => {
  const aiutante = aiutanteFinto(dueNuove(ESPLORA_NUOVA, POSTA_NUOVA));
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Outlook e Esplora file', rispostaCarta: (n) => (n === 1 ? 'Allow' : 'Stop'),
    risposte: [SCRIVI('ciao'), APRI('Outlook File Explorer'), SCRIVI('x'), FINE] });
  await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s);
  assert.ok(!aiutante.letture.includes(602), 'la finestra del secondo programma non si legge');
  assert.ok(!s.modello.testi.some((t) => t.includes('Cartella privata')));
  assert.equal(s.domande.length, 2);
  assert.match(s.domande[1][0].question, /Cartella privata/u);
});

// al contrario: un nome con UN programma solo continua ad adottare la sua finestra nuova (anche col nome lungo che vede la persona)
for (const nome of ['outlook', 'Microsoft Outlook', 'File Explorer']) {
  test(`FB-44 (V9 al contrario, Accesso pieno): «apri ${nome}», un programma solo ⇒ la sua finestra nuova si segue, nessuno stop`, async () => {
    const nuova = /explorer/iu.test(nome) ? ESPLORA_NUOVA : POSTA_NUOVA;
    const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
    scena.dopoAzione = (n) => { if (n === 'launch_app') scena.finestre = [nuova, NOTEPAD]; };
    const aiutante = aiutanteFinto(scena);
    const s = sessione({ testoDellaPersona: `Apri il Blocco note, scrivi ciao, poi apri ${nome}`, risposte: [SCRIVI('ciao'), APRI(nome), SCRIVI('x'), FINE] });
    const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
    assert.equal(r.ok, true, r.testo);
    assert.equal(fermato(s), null);
    assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', `t${nuova.window_id}`]);
  });
}

// un programma solo che il piano legge col nome di un altro («Notepad++» ⇒ notepad): il nome dato resta del compito
test('FB-46 (V9 al contrario, Accesso pieno): «apri Notepad++» ⇒ la finestra nuova di notepad++.exe si segue, nessuno stop', async () => {
  const NUOVA = finestra(505, 5151, 'notepad++.exe', 'new 1 - Notepad++', 9);
  const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
  scena.dopoAzione = (n) => { if (n === 'launch_app') scena.finestre = [NUOVA, NOTEPAD]; };
  const aiutante = aiutanteFinto(scena);
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Notepad++', risposte: [SCRIVI('ciao'), APRI('Notepad++'), SCRIVI('x'), FINE] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
  assert.equal(r.ok, true, r.testo);
  assert.equal(fermato(s), null);
  assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', 't505']);
});

// con due programmi nel nome il PRIMO scritto resta del compito: la cura non spegne l'adozione per tutti
for (const [nome, nuova] of [['File Explorer Outlook', ESPLORA_NUOVA], ['Outlook File Explorer', POSTA_NUOVA]]) {
  test(`FB-45 (V9, Accesso pieno): «apri ${nome}» ⇒ la finestra nuova del primo programma scritto si segue, nessuno stop`, async () => {
    const scena = { finestre: [NOTEPAD], pidLanciato: 8888 };
    scena.dopoAzione = (n) => { if (n === 'launch_app') scena.finestre = [nuova, NOTEPAD]; };
    const aiutante = aiutanteFinto(scena);
    const s = sessione({ testoDellaPersona: 'Apri il Blocco note, scrivi ciao, poi apri Outlook e Esplora file', risposte: [SCRIVI('ciao'), APRI(nome), SCRIVI('x'), FINE] });
    const r = await esegui(creaOspiteComputerUse({ aiutante, pidDiTalos: 1 }), s, 'accesso-pieno');
    assert.equal(r.ok, true, r.testo);
    assert.equal(fermato(s), null);
    assert.deepEqual(tokenOppureNome(aiutante), ['t101', 'launch_app', `t${nuova.window_id}`]);
  });
}
