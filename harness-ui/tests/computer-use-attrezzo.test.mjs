/*
 * L'attrezzo `computer_use` dalla parte dell'ospite (passo 5 del piano, decisione 129; forma FORMA-ATTREZZO-COLLEGAMENTO §1-§3 con le
 * condizioni di Performance, CLI e Mobile). Ciclo VERO con un aiutante finto e un modello finto: nessuna prova tocca lo schermo vero.
 *  - una carta in Normale, zero in Accesso pieno, zero coi luoghi tutti ricordati;
 *  - il permesso si legge dalle parole della persona, mai dal `task` del modello;
 *  - la password non esce mai (osservazione, richiesta al modello, eventi, testo per il modello);
 *  - al terzo passo una sola immagine nel contesto, lato lungo ≤ 1280;
 *  - freno durante un gruppo di mosse ⇒ nessuna azione dopo; la combinazione del freno non si preme;
 *  - aiutante assente ⇒ «not available on this computer», nessun modello chiamato.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaOspiteComputerUse, pianoDallaFrase, segnaRiservati, NOME_COMPUTER_USE, LATO_MASSIMO_SCHERMATA } from '../src/computer-use/attrezzo.mjs';
import { NON_DISPONIBILE } from '../src/computer-use/aiutante-mcp.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

/** I primi 24 byte di un PNG: firma, IHDR, larghezza e altezza. Bastano per leggerne le dimensioni. */
function png(larghezza, altezza) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(larghezza, 16); b.writeUInt32BE(altezza, 20);
  return b;
}
const dimensioniDaDataUrl = (url) => {
  const b = Buffer.from(String(url).split(',')[1], 'base64');
  return { larghezza: b.readUInt32BE(16), altezza: b.readUInt32BE(20) };
};

const FINESTRA = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Senza titolo - Blocco note', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
const BROWSER = { window_id: 202, pid: 5151, app_name: 'msedge.exe', title: 'Carrello - Amazon', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
const statoNotepad = (extra = []) => ({
  window_title: FINESTRA.title, app_name: FINESTRA.app_name, window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Document', label: 'Editor di testo', frame: { x: 10, y: 60, w: 1200, h: 600 } }, ...extra],
});

/** Aiutante finto: list_windows dà le finestre, get_window_state gli stati in fila (l'ultimo resta), le azioni si registrano. */
function aiutanteFinto({ finestre = [FINESTRA], stati = [statoNotepad()], immagine = png(1280, 720), apri = { ok: true } } = {}) {
  const azioni = []; const chiamate = []; let k = 0; let compiti = 0; let aperture = 0;
  return {
    azioni, chiamate, aperture: () => aperture, compitiAperti: () => compiti,
    async apri() { aperture += 1; return apri; },
    compito() { compiti += 1; return () => { compiti -= 1; }; },
    async chiama(nome, argomenti) {
      chiamate.push({ nome, argomenti });
      if (nome === 'list_windows') return { ok: true, dati: { windows: finestre }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        const s = stati[Math.min(k, stati.length - 1)]; k += 1;
        return { ok: true, dati: s, immagine: immagine ? { base64: immagine.toString('base64'), mime: 'image/png' } : null, errore: null };
      }
      azioni.push({ nome, argomenti });
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
}

/** Modello finto: risponde in fila con il JSON del vocabolario; registra ogni richiesta (le parti del contenuto). */
function modelloFinto(risposte) {
  const richieste = []; let n = 0;
  const fn = async ({ contenuto }) => {
    richieste.push(contenuto);
    const r = risposte[Math.min(n, risposte.length - 1)]; n += 1;
    return { testo: JSON.stringify(r), usage: { prompt_tokens: 2000, completion_tokens: 40 } };
  };
  return { fn, richieste };
}

function sessione({ testoDellaPersona, risposte, domande = [], eventi = [], rispostaCarta = 'Allow' } = {}) {
  const m = modelloFinto(risposte);
  return {
    modello: m, domande, eventi,
    valore: {
      testoDellaPersona,
      chiediModello: m.fn,
      chiediDomanda: async (questions) => {
        // il canale vero valida la forma (registro: `richiediDomandaUtente`): una carta storta non arriva mai alla persona
        validaDomandeUtente(questions);
        domande.push(questions);
        return { status: 'answered', answers: Object.fromEntries(questions.map((q) => [q.id, rispostaCarta])) };
      },
      emetti: (nome, dati) => eventi.push({ nome, dati }),
    },
  };
}
const esegui = (ospite, s, opzioni = {}) => ospite(NOME_COMPUTER_USE, { task: opzioni.task ?? 'type hello in Notepad' },
  { fase: 'esegui', toolCallId: 'call-1', segnale: opzioni.segnale ?? new AbortController().signal, livelloAccesso: opzioni.livello ?? 'scrittura-progetto', sessione: s.valore });

const SCRIVI_E_FINISCI = [{ actions: [{ type: 'type', ref: 'e1', text: 'ciao' }] }, { done: { success: true, note: 'typed' } }];

test('ATT-01: compito normale in permesso Normale ⇒ UNA carta (il consenso del compito), dal canale delle domande', async () => {
  const aiutante = aiutanteFinto();
  const ospite = creaOspiteComputerUse({ aiutante });
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI });
  const r = await esegui(ospite, s);
  assert.equal(r.ok, true, r.testo);
  assert.equal(s.domande.length, 1, 'una carta sola');
  assert.equal(s.domande[0].length, 1);
  assert.deepEqual(aiutante.azioni.map((a) => a.nome), ['type_text']);
  assert.equal(aiutante.azioni[0].argomenti.text, 'ciao');
  assert.equal(aiutante.azioni[0].argomenti.element_token, 't1');
  assert.match(r.testo, /^Computer use finished: succeeded/u);
  assert.doesNotMatch(r.testo, /base64|data:image/u, 'testo per il modello senza schermate');
  assert.equal(aiutante.compitiAperti(), 0, 'il compito si chiude: l\'aiutante può spegnersi');
});

test('ATT-02: Accesso pieno ⇒ zero carte; luoghi tutti ricordati ⇒ la carta iniziale resta (decisione 239); «Consenti sempre» salva il luogo', async () => {
  const pieno = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI });
  const r1 = await esegui(creaOspiteComputerUse({ aiutante: aiutanteFinto() }), pieno, { livello: 'accesso-pieno' });
  assert.equal(r1.ok, true, r1.testo);
  assert.equal(pieno.domande.length, 0);
  const ricordati = []; const registroLuoghi = { perIlCiclo: async () => ({ domini: [], app: ['notepad'] }), ricorda: async (l) => { ricordati.push(l); } };
  const ricordato = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI });
  const r2 = await esegui(creaOspiteComputerUse({ aiutante: aiutanteFinto(), registroLuoghi }), ricordato);
  assert.equal(r2.ok, true, r2.testo);
  assert.equal(ricordato.domande.length, 1, 'decisione 239 (owner 05/11): coi luoghi ricordati la carta iniziale resta');
  const sempre = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI, rispostaCarta: 'Always allow' });
  const vuoto = { perIlCiclo: async () => ({ domini: [], app: [] }), ricorda: async (l) => { ricordati.push(l); } };
  await esegui(creaOspiteComputerUse({ aiutante: aiutanteFinto(), registroLuoghi: vuoto }), sempre);
  assert.deepEqual(ricordati, [{ domini: [], app: ['notepad'] }]);
});

// decisione 159 (owner 04/11): in Accesso pieno il pagamento fa UNA carta invece di fermare; la prova resta sul piano letto dalla persona
test('ATT-03: il task del modello dice «pay», la persona no ⇒ carta del pagamento prima di premere, Stop ⇒ niente premuto (il piano si legge dalla persona)', async () => {
  const stato = { window_title: 'Carrello - Amazon', app_name: 'msedge.exe', window_bounds: BROWSER.bounds, screenshot_width: 1280, screenshot_height: 720,
    elements: [
      { element_index: 1, element_token: 'u1', role: 'Edit', label: 'Barra degli indirizzi e di ricerca', value: 'https://www.amazon.it/cart', frame: { x: 100, y: 10, w: 600, h: 30 } },
      { element_index: 2, element_token: 'u2', role: 'Button', label: 'Paga ora', frame: { x: 900, y: 600, w: 120, h: 40 } },
    ] };
  const aiutante = aiutanteFinto({ finestre: [BROWSER], stati: [stato] });
  const s = sessione({ testoDellaPersona: 'metti il libro nel carrello su amazon.it', risposte: [{ actions: [{ type: 'press', ref: 'e2' }] }], rispostaCarta: 'Stop' });
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s, { livello: 'accesso-pieno', task: 'buy the book and pay for it now' });
  assert.equal(r.ok, false);
  assert.equal(s.domande.length, 1, 'una carta sola, quella del pagamento (in Accesso pieno niente carta del compito)');
  assert.match(s.domande[0][0].question, /pay/iu, s.domande[0][0].question);
  assert.deepEqual(aiutante.azioni, [], 'il pulsante del pagamento non è stato premuto');
  assert.deepEqual(pianoDallaFrase('metti il libro nel carrello su amazon.it'), { domini: ['amazon.it'], app: [] });
});

test('ATT-04: campo password col testo ⇒ il testo non compare nell\'osservazione, nella richiesta al modello, negli eventi, nel testo finale', async () => {
  const SEGRETO = 'segreto-123-xyz';
  const stato = statoNotepad([
    { element_index: 2, element_token: 't2', role: 'Edit', label: 'Password', value: SEGRETO, frame: { x: 10, y: 10, w: 200, h: 30 } },
    { element_index: 3, element_token: 't3', role: 'Edit', label: SEGRETO, value: SEGRETO, is_password: true, frame: { x: 10, y: 40, w: 200, h: 30 } },
  ]);
  const aiutante = aiutanteFinto({ stati: [stato] });
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI });
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s);
  const tutto = JSON.stringify({ richieste: s.modello.richieste.map((c) => c.filter((p) => p.type === 'text')), eventi: s.eventi, testo: r.testo, domande: s.domande });
  assert.ok(!tutto.includes(SEGRETO), 'il segreto non esce');
  const marcati = segnaRiservati(stato.elements);
  assert.deepEqual(marcati.filter((e) => e.riservato).map((e) => [e.element_index, e.value ?? null]), [[2, null], [3, null]]);
  assert.ok(marcati.every((e) => e.label !== SEGRETO), 'nemmeno come etichetta');
});

test('ATT-05: al terzo passo nel contesto di chiedi c\'è UNA immagine, col lato lungo ≤ 1280; i token per passo arrivano negli eventi', async () => {
  const ridotte = [];
  const ridimensiona = async (byte, { latoMax }) => { ridotte.push(latoMax); return { byte: png(1280, 720), mime: 'image/png', larghezza: 1280, altezza: 720 }; };
  const aiutante = aiutanteFinto({ immagine: png(2560, 1440) });
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [
    { actions: [{ type: 'type', ref: 'e1', text: 'a' }, { type: 'scroll', ref: 'e1', direction: 'down' }] },
    { actions: [{ type: 'type', ref: 'e1', text: 'b' }] },
    { actions: [{ type: 'type', ref: 'e1', text: 'c' }] },
    { done: { success: true } },
  ] });
  const r = await esegui(creaOspiteComputerUse({ aiutante, ridimensiona }), s);
  assert.equal(r.ok, true, r.testo);
  assert.ok(s.modello.richieste.length >= 3);
  const terza = s.modello.richieste[2];
  const immagini = terza.filter((p) => p.type === 'image_url');
  assert.equal(immagini.length, 1, 'solo l\'ultima schermata');
  const { larghezza, altezza } = dimensioniDaDataUrl(immagini[0].image_url.url);
  assert.ok(Math.max(larghezza, altezza) <= LATO_MASSIMO_SCHERMATA, `lato lungo ${Math.max(larghezza, altezza)}`);
  assert.ok(ridotte.length >= 1 && ridotte.every((l) => l === 1280));
  // la richiesta all'aiutante chiede già il lato massimo
  assert.equal(aiutante.chiamate.find((c) => c.nome === 'get_window_state').argomenti.max_image_dimension, 1280);
  const misure = s.eventi.filter((e) => e.nome === 'talos.computer-use-passo' && e.dati.fase === 'modello');
  assert.ok(misure.length >= 3);
  for (const m of misure) {
    assert.ok(Number.isInteger(m.dati.tokenImmagine) && m.dati.tokenImmagine > 0);
    assert.ok(Number.isInteger(m.dati.tokenTesto) && m.dati.tokenTesto >= 0);
    assert.equal(m.dati.immagini, 1);
    assert.equal(m.dati.toolCallId, 'call-1');
  }
});

test('ATT-06: freno durante un gruppo di mosse ⇒ nessuna azione dopo', async () => {
  const ctl = new AbortController();
  const aiutante = aiutanteFinto();
  const chiamaVera = aiutante.chiama;
  aiutante.chiama = async (nome, argomenti) => {
    const r = await chiamaVera(nome, argomenti);
    if (nome === 'type_text') ctl.abort(); // la persona preme «Ferma» subito dopo la prima azione
    return r;
  };
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [
    { actions: [{ type: 'type', ref: 'e1', text: 'uno' }, { type: 'type', ref: 'e1', text: 'due' }, { type: 'type', ref: 'e1', text: 'tre' }] },
  ] });
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s, { segnale: ctl.signal });
  assert.deepEqual(aiutante.azioni.map((a) => a.argomenti.text), ['uno']);
  assert.match(r.testo, /stopped/u);
});

test('ATT-07: il vocabolario arriva all\'aiutante coi nomi letti nel suo sorgente; l\'Esc del modello passa (decisione 136: il gancio lascia l\'iniettato)', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: [
    { actions: [{ type: 'keys', keys: 'Esc', ref: 'e1' }] },
    { actions: [{ type: 'keys', keys: 'ctrl+s', ref: 'e1' }] },
    { actions: [{ type: 'click', x: 640, y: 360 }] },
    { done: { success: true } },
  ] });
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.equal(r.ok, true, r.testo);
  assert.deepEqual(aiutante.azioni, [
    // revisione O e T: un tasto con ref su un CAMPO va all'elemento valutato dalla politica (element_token, senza window_id); una
    // combinazione passa da press_key con `modifiers`, perché `hotkey` in sottofondo non mette a fuoco l'elemento (hotkey.rs:362-380)
    { nome: 'press_key', argomenti: { key: 'escape', pid: 4242, element_token: 't1' } },
    { nome: 'press_key', argomenti: { key: 's', modifiers: ['ctrl'], pid: 4242, element_token: 't1' } },
    { nome: 'click', argomenti: { pid: 4242, window_id: 101, x: 640, y: 360 } },
  ]);
});

test('ATT-08: aiutante assente o impronta diversa ⇒ «not available on this computer», nessun modello chiamato, nessuna carta', async () => {
  for (const motivo of ['binario', 'impronta', 'impronta-non-fissata']) {
    const aiutante = aiutanteFinto({ apri: { ok: false, motivo } });
    const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI });
    const r = await esegui(creaOspiteComputerUse({ aiutante }), s);
    assert.equal(r.ok, false);
    assert.ok(r.testo.startsWith(NON_DISPONIBILE), r.testo);
    assert.equal(s.modello.richieste.length, 0);
    assert.equal(s.domande.length, 0);
    assert.deepEqual(aiutante.chiamate, []);
  }
  const senza = sessione({ testoDellaPersona: 'x', risposte: SCRIVI_E_FINISCI });
  const r = await esegui(creaOspiteComputerUse({ aiutante: null }), senza);
  assert.ok(r.testo.startsWith(NON_DISPONIBILE));
});

test('ATT-09: senza parole della persona in questo giro, in sola lettura o con argomenti storti ⇒ rifiuto, nessun aiutante', async () => {
  const aiutante = aiutanteFinto();
  const ospite = creaOspiteComputerUse({ aiutante });
  const vuoto = await esegui(ospite, sessione({ testoDellaPersona: '', risposte: SCRIVI_E_FINISCI }));
  assert.match(vuoto.testo, /^REFUSED\./u);
  const lettura = await esegui(ospite, sessione({ testoDellaPersona: 'scrivi ciao nel Blocco note', risposte: SCRIVI_E_FINISCI }), { livello: 'lettura' });
  assert.match(lettura.testo, /^REFUSED\./u);
  const storto = await ospite(NOME_COMPUTER_USE, { task: '' }, { fase: 'esegui', toolCallId: 'x', sessione: sessione({ testoDellaPersona: 'ciao', risposte: [] }).valore });
  assert.match(storto.testo, /^REFUSED\./u);
  assert.equal(aiutante.aperture(), 0);
});

test('ATT-10: il piano dalla frase della persona: siti e programmi nominati, i nomi di file non sono siti', () => {
  assert.deepEqual(pianoDallaFrase('apri il Blocco note e salva note.txt'), { domini: [], app: ['notepad'] });
  assert.deepEqual(pianoDallaFrase('cerca su https://www.wikipedia.org/wiki/Roma con Chrome'), { domini: ['wikipedia.org'], app: ['chrome'] });
  assert.deepEqual(pianoDallaFrase(''), { domini: [], app: [] });
});

test('ATT-11: «Ferma» sulla carta del compito ⇒ la frase di serie del no (sulla candidata DECLINED); il freno e i rifiuti di sicurezza no', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI, rispostaCarta: 'Stop' });
  const r = await esegui(creaOspiteComputerUse({ aiutante }), s);
  assert.equal(r.ok, false);
  assert.ok(r.testo.startsWith('REFUSED. the person did not approve it. '), r.testo);
  assert.match(r.testo, /nothing more was done on the screen/u);
  assert.deepEqual(aiutante.azioni, [], 'dopo il no nessuna azione');
  assert.equal(s.modello.richieste.length, 0, 'dopo il no nessun modello chiamato');
  // in italiano: la stessa cosa con «Ferma»
  const it = sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI, rispostaCarta: 'Ferma' });
  it.valore.lingua = 'it';
  const rIt = await esegui(creaOspiteComputerUse({ aiutante: aiutanteFinto() }), it);
  assert.ok(rIt.testo.startsWith('REFUSED. the person did not approve it. '), rIt.testo);
  // il freno a metà compito non è un no a una carta: resta «stopped», il modello può dire alla persona dove si è fermato
  const ctl = new AbortController();
  const frenato = aiutanteFinto();
  const chiamaVera = frenato.chiama;
  frenato.chiama = async (nome, argomenti) => { const x = await chiamaVera(nome, argomenti); if (nome === 'type_text') ctl.abort(); return x; };
  const rFreno = await esegui(creaOspiteComputerUse({ aiutante: frenato }), sessione({ testoDellaPersona: 'Apri il Blocco note e scrivi ciao', risposte: SCRIVI_E_FINISCI }), { segnale: ctl.signal });
  assert.match(rFreno.testo, /^Computer use stopped: the person pressed Stop/u);
  // un rifiuto di sicurezza dell'ospite non usa la frase del no
  const vuoto = await esegui(creaOspiteComputerUse({ aiutante: aiutanteFinto() }), sessione({ testoDellaPersona: '', risposte: SCRIVI_E_FINISCI }));
  assert.ok(!vuoto.testo.startsWith('REFUSED. the person did not approve it.'), vuoto.testo);
});
