import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { campiDellaChat } from '../../src/components/chat-pronte.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { documento as documentoDeiBlocchi } from './aiuto-dom-blocchi.mjs';

/*
 * 15/11/2026 — SETTIMO GIRO DELL'AFFITTO, la pagina (owner 23:55, giudice v1919-v1921).
 *   · Revisore 2 del giro 6: le note «una riga aspetta» e «la riga è salvata» arrivavano come carte d'errore rosse («Il giro si è
 *     interrotto per un errore · Riprova il giro», testo chiuso sotto «Dettagli tecnici»), e chi si ricollegava vedeva la nota «in attesa»
 *     due volte (30 su 30). Ora è una nota informativa nella grammatica che la conversazione ha già per il salvataggio — la nota del
 *     journal riparato (`components/compattazione-legacy.js:435`, `creaNotaSistema` di `conversazione.js:1223`, idempotente per chiave come
 *     `aggiornaNotaJournalRiparato` `:503`) —, UNA per riga, che cambia stato quando la riga è salvata.
 *   · Revisore 3: `impronteViste` mancava fra i campi che la chat pronta porta via (`chat-pronte.js:29-46`): dopo un cambio di chat e il
 *     ritorno ogni numero visto restava senza impronta, e la riga dell'altro TALOS col numero del tardivo si scartava (dn 30/30, dnd 30/30).
 */
let modulo = null;
try { modulo = await import('../../src/components/nota-riga-in-attesa.js'); } catch { modulo = null; }
const aggiorna = (...a) => { if (!modulo) throw new Error('nota-riga-in-attesa.js is missing (before the seventh lease round)'); return modulo.aggiornaNotaRigaInAttesa(...a); };

function documento() {
  const doc = documentoDeiBlocchi();
  const proto = Object.getPrototypeOf(doc.body);
  if (!('lastElementChild' in proto)) Object.defineProperty(proto, 'lastElementChild', { get() { return this.children.at(-1) ?? null; } });
  return doc;
}
const EN_ATTESA = 'A line that arrived late is waiting to be saved: this chat is open in another TALOS window. It is kept on this computer and added here as soon as that window lets the chat go.';
const EN_SALVATA = 'The line that was waiting has been saved in this chat.'; // ottavo giro (21/11/2026): la frase non promette più un posto
const attesa = (id = 'a-1') => ({ id, stato: 'in-attesa', message: EN_ATTESA, messageChiave: 'server.sessionPersistence.lateLineWaiting' });
const salvata = (id = 'a-1', sequenza = 9) => ({ id, stato: 'adottata', sequenza, message: EN_SALVATA, messageChiave: 'server.sessionPersistence.lateLineAdded' });

test('G7-UI-01 (RED before) the waiting line is ONE informational note: the sentence is on screen (not under technical details), no error tone, no «Retry the turn»', () => {
  try {
    impostaLingua('en');
    const doc = documento();
    const colonna = doc.createElement('div');
    const n = aggiorna(colonna, attesa(), { document: doc });
    assert.equal(colonna.children.length, 1);
    assert.equal(n.getAttribute('data-c'), 'SystemNote', 'the system note of the conversation');
    assert.match(n.className, /talos-system-note/u);
    assert.doesNotMatch(n.className, /errore/u, 'not the error card');
    assert.notEqual(n.getAttribute('data-tone'), 'danger');
    assert.ok(n.querySelector('.talos-badge--info'), 'the informational badge');
    assert.ok(n.textContent.includes(EN_ATTESA), 'the sentence is visible');
    assert.doesNotMatch(n.textContent, /Retry|Riprova|error|errore|Technical details|Dettagli tecnici/iu);
    assert.equal(n.querySelector('details'), null, 'nothing closed under details');
  } finally { impostaLingua('it'); }
});

test('G7-UI-02 (RED before) a reconnection that sends the waiting note again draws nothing new; the saved note changes the SAME note', () => {
  try {
    impostaLingua('en');
    const doc = documento();
    const colonna = doc.createElement('div');
    const prima = aggiorna(colonna, attesa('a-1'), { document: doc });
    const ancora = aggiorna(colonna, attesa('a-1'), { document: doc });
    assert.equal(ancora, prima, 'the same note');
    assert.equal(colonna.children.length, 1, 'one note after the reconnection');
    aggiorna(colonna, attesa('a-2'), { document: doc });
    assert.equal(colonna.children.length, 2, 'another waiting line has its own note');
    const dopo = aggiorna(colonna, salvata('a-1', 9), { document: doc });
    assert.equal(dopo, prima, 'the saved note is the same note, changed');
    assert.equal(colonna.children.length, 2);
    assert.ok(prima.textContent.includes(EN_SALVATA), 'it now says the line is saved');
    assert.ok(!prima.textContent.includes(EN_ATTESA), 'and no longer that it waits');
    assert.equal(aggiorna(colonna, attesa('a-1'), { document: doc }), prima, 'a late waiting note for a saved line changes nothing');
    assert.ok(prima.textContent.includes(EN_SALVATA), 'the saved state stays');
    const sola = aggiorna(colonna, salvata('a-3', 12), { document: doc });
    assert.ok(sola.textContent.includes(EN_SALVATA), 'a saved note with no waiting note before it is drawn once');
    assert.equal(colonna.children.length, 3);
  } finally { impostaLingua('it'); }
});

test('G7-UI-02b three waiting lines, two reconnections that send all three again in another order: still three notes, and each saved note changes only its own', () => {
  try {
    impostaLingua('en');
    const doc = documento();
    const colonna = doc.createElement('div');
    const note = ['r-1', 'r-2', 'r-3'].map((id) => aggiorna(colonna, attesa(id), { document: doc }));
    for (const ordine of [['r-3', 'r-1', 'r-2'], ['r-2', 'r-3', 'r-1']]) for (const id of ordine) aggiorna(colonna, attesa(id), { document: doc });
    assert.equal(colonna.children.length, 3, 'one note per line, never twice');
    assert.deepEqual([...colonna.children].map((n) => n.dataset.rigaInAttesa), ['r-1', 'r-2', 'r-3']);
    aggiorna(colonna, salvata('r-2', 20), { document: doc });
    assert.deepEqual(note.map((n) => n.dataset.statoRiga), ['in-attesa', 'adottata', 'in-attesa'], 'only the saved line changes');
    assert.deepEqual(note.map((n) => n.textContent.includes(EN_SALVATA)), [false, true, false]);
    assert.equal(colonna.children.length, 3);
  } finally { impostaLingua('it'); }
});

test('G7-UI-03 (RED before) English then Italian: the Italian page says the Italian sentence; an unknown key falls back to the English sentence the server sent', () => {
  try {
    impostaLingua('it');
    const doc = documento();
    const colonna = doc.createElement('div');
    const n = aggiorna(colonna, attesa(), { document: doc });
    assert.ok(n.textContent.includes('Una riga arrivata in ritardo aspetta di essere salvata'), n.textContent);
    aggiorna(colonna, salvata(), { document: doc });
    assert.ok(n.textContent.includes('La riga che aspettava è stata salvata'), n.textContent);
    const altro = aggiorna(colonna, { id: 'b-1', stato: 'in-attesa', message: 'Some newer sentence.', messageChiave: 'server.sessionPersistence.nonEsiste' }, { document: doc });
    assert.ok(altro.textContent.includes('Some newer sentence.'), 'the English sentence, never the raw key');
    assert.equal(aggiorna(colonna, { stato: 'in-attesa' }, { document: doc }), null, 'no id, no note');
  } finally { impostaLingua('it'); }
});

test('G7-UI-04 (RED before) the page draws the note from the live stream in the place of the other saving notes, before any turn-ending code', () => {
  const sorgente = readFileSync(fileURLToPath(new URL('../../src/legacy/app.js', import.meta.url)), 'utf8');
  const qui = sorgente.indexOf('evento.name === EVENTO_RIGA_IN_ATTESA');
  assert.ok(qui > 0, 'the page handles the note');
  const riga = sorgente.slice(qui, sorgente.indexOf('\n', qui));
  assert.match(riga, /aggiornaNotaRigaInAttesa\(colonna, evento\.value, \{[^}]*inserisci: inserisciRigaCompattazione/u, 'drawn where the journal note goes');
  assert.match(riga, /return;/u, 'and nothing else happens (no end of turn, the Stop stays)');
  const terminale = sorgente.indexOf("    if (evento.type === 'RunError' || evento.type === 'RunFinished') {\n");
  assert.ok(terminale > 0 && qui < terminale, 'before the code that closes a turn on screen');
});

test('G7-UI-02c (X9) an old reconnection that sends the waiting notes after the saved ones: every saved note stays saved, in Italian too', () => {
  try {
    impostaLingua('it');
    const doc = documento();
    const colonna = doc.createElement('div');
    const note = ['s-1', 's-2'].map((id) => aggiorna(colonna, attesa(id), { document: doc }));
    aggiorna(colonna, salvata('s-1', 30), { document: doc });
    aggiorna(colonna, salvata('s-2', 31), { document: doc });
    for (const id of ['s-2', 's-1', 's-1']) aggiorna(colonna, attesa(id), { document: doc });
    aggiorna(colonna, salvata('s-1', 30), { document: doc }); // e la salvata ripetuta non cambia niente
    assert.deepEqual(note.map((n) => n.dataset.statoRiga), ['adottata', 'adottata']);
    assert.ok(note.every((n) => n.textContent.includes('La riga che aspettava è stata salvata')), note.map((n) => n.textContent).join(' | '));
    assert.equal(colonna.children.length, 2);
  } finally { impostaLingua('it'); }
});

test('G7-UI-04b (X10) the line of the page, run as the page runs it: the event draws one note in the conversation column, a second event with the same id adds nothing, and the handler stops there', () => {
  const sorgente = readFileSync(fileURLToPath(new URL('../../src/legacy/app.js', import.meta.url)), 'utf8');
  const inizio = sorgente.indexOf("    if (evento.type === 'CUSTOM' && evento.name === EVENTO_RIGA_IN_ATTESA)");
  assert.ok(inizio > 0, 'premise: the line is in app.js');
  const linea = sorgente.slice(inizio, sorgente.indexOf('\n', inizio));
  // eslint-disable-next-line no-new-func
  const gestore = new Function('evento', 'state', 'colonnaConversazione', 'ROOT', 'aggiornaNotaRigaInAttesa', 'document', 'inserisciRigaCompattazione', 'EVENTO_RIGA_IN_ATTESA', `${linea}\n return 'oltre';`);
  try {
    impostaLingua('en');
    const doc = documento();
    const colonna = doc.createElement('div');
    const inserite = [];
    const inserisci = (n) => { inserite.push(n); colonna.append(n); };
    const corri = (valore) => gestore({ type: 'CUSTOM', name: 'talos.riga-in-attesa', value: valore }, { realSession: { id: 's' } }, () => colonna, () => null, aggiorna, doc, inserisci, 'talos.riga-in-attesa');
    assert.equal(corri(attesa('p-1')), undefined, 'the handler returns: nothing after it runs');
    assert.equal(corri(attesa('p-1')), undefined);
    assert.equal(inserite.length, 1, 'one note, placed where the journal note goes');
    assert.equal(colonna.children.length, 1);
    assert.ok(colonna.children[0].textContent.includes(EN_ATTESA));
    corri(salvata('p-1', 4));
    assert.ok(colonna.children[0].textContent.includes(EN_SALVATA), 'the saved note changes it');
  } finally { impostaLingua('it'); }
});

/* ------------------------------------------------------------------- la chat pronta: cambio di chat e ritorno (strade dn e dnd) */
const SORGENTE = readFileSync(fileURLToPath(new URL('../../src/legacy/app.js', import.meta.url)), 'utf8');
/* il blocco VERO del «numero già visto» (legacy/app.js), eseguito come lo esegue la pagina; come `strada-pronta.mjs` del revisore 3 */
function bloccoDelNumeroVisto() {
  const inizio = SORGENTE.indexOf("    if (typeof evento._sequenza === 'number') {\n      /* 13/11/2026 (cura dell'affitto compromesso, i lettori)");
  const fine = SORGENTE.indexOf('    sequenzaEventoInCorso = typeof evento._sequenza', inizio);
  assert.ok(inizio > 0 && fine > inizio, 'premise: the block is where it was');
  // eslint-disable-next-line no-new-func
  return new Function('evento', 'state', `${SORGENTE.slice(inizio, fine)}\n return true;`);
}
function resetDelCambioDiChat() {
  const nuovaGen = SORGENTE.slice(SORGENTE.indexOf('function nuovaGenerazioneSessione('), SORGENTE.indexOf('state.realSession.generation += 1'));
  assert.ok(nuovaGen.includes('state.realSession.sequenzeViste = new Set();\n      state.realSession.impronteViste = new Map();'), 'premise: the reset clears both');
  const rimetti = SORGENTE.slice(SORGENTE.indexOf('function rimettiChatPronta(voce) {'), SORGENTE.indexOf('function rimettiChatPronta(voce) {') + 120);
  assert.ok(rimetti.includes('Object.assign(state.realSession, voce.rs);'), 'premise: the return puts the parked fields back');
}

/*
 * Il flusso delle strade dn e dnd (forma del revisore 1, flusso vero catturato dal revisore 2, `dn1.json` del revisore 3): A ha mostrato
 *   1..7 e il tardivo col numero 8; il tardivo non si scrive (l'altro tiene la chat) e va in attesa; l'altro TALOS (B) scrive il suo inizio
 *   di giro col numero 8; la persona su A va su un'altra chat e torna; il server rimanda da sotto (`rinumerate`): l'8 di B, poi il tardivo
 *   adottato col numero del disco.
 */
const ev = (type, _sequenza, extra = {}) => ({ type, _sequenza, ...extra });
const PRIMA = [ev('RunStarted', 1, { runId: 'r-A1' }), ev('TextMessageStart', 2, { messageId: 'm-A1' }), ev('TextMessageContent', 3, { messageId: 'm-A1' }), ev('TextMessageContent', 4, { messageId: 'm-A1' }), ev('TextMessageContent', 5, { messageId: 'm-A1' }), ev('TextMessageEnd', 6, { messageId: 'm-A1' }), ev('RunFinished', 7, { runId: 'r-A1' }), ev('CUSTOM', 8, { name: 'talos.tardivo-vivo' })];
const DAL_SERVER = (durevole) => [ev('RunStarted', 8, { runId: 'r-B1' }), ev('TextMessageStart', 9, { messageId: 'm-B1' }), ev('TextMessageEnd', 10, { messageId: 'm-B1' }), ev('RunFinished', 11, { runId: 'r-B1' }), ev('CUSTOM', 12, { name: durevole ? 'talos.tardivo-durevole' : 'talos.tardivo-vivo' })];

function strada({ cambio, durevole }) {
  const dedup = bloccoDelNumeroVisto();
  const state = { realSession: { id: 's', sequenzeViste: new Set(), impronteViste: new Map() } };
  for (const e of PRIMA) dedup({ ...e }, state);
  if (cambio) {
    resetDelCambioDiChat();
    const voce = { rs: campiDellaChat(state.realSession) }; // il parcheggio vero
    state.realSession.sequenzeViste = new Set(); state.realSession.impronteViste = new Map(); // il reset di nuovaGenerazioneSessione
    Object.assign(state.realSession, voce.rs); // rimettiChatPronta
  }
  const nascoste = DAL_SERVER(durevole).filter((e) => e.runId === 'r-B1' || e.messageId === 'm-B1').filter((e) => !dedup({ ...e }, state));
  return { nascoste: nascoste.length, senzaImpronta: [...state.realSession.sequenzeViste].filter((n) => !state.realSession.impronteViste.has(n)).length };
}

for (const durevole of [false, true]) {
  const nome = durevole ? 'dnd' : 'dn';
  test(`G7-UI-05${durevole ? 'b' : ''} [rev-aff6-3 ${nome}] (RED before) a chat switch and back keeps the fingerprints: the other TALOS line with the late line's number is shown`, () => {
    const conCambio = strada({ cambio: true, durevole });
    assert.equal(conCambio.senzaImpronta, 0, 'no seen number without its fingerprint after the return');
    assert.equal(conCambio.nascoste, 0, 'no line of the other TALOS hidden');
    assert.equal(strada({ cambio: false, durevole }).nascoste, 0, 'without a chat switch: 0, as before');
  });
}
