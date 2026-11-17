/**
 * 0.2.2-CU round 4, the last one (Desktop brief of 10/11/2026; red verdict of the round-3 reviewer, same night).
 * - F1 (high, security): a blind click in front of a «Confirm purchase» window that also says «This operation cannot be undone.» asked
 *   ONE «deletion» card, its yes was remembered for the clicks after it and the spending limit was never read. The strongest button of
 *   the modal windows comes first: when it pays, the card is a PAYMENT card and in Normal its yes is never remembered.
 * - 8c (high, experience): a healthy task whose «Save» stays disabled until three fields are filled (refused three times, NOT in a row)
 *   was closed with «the same element did not respond». The count of an element starts again when the task changed something since
 *   its last failure.
 * - F2: one remembered yes covered any number of clicks (20 requests: 1 card, 20 clicks), another object behind the same window, and a
 *   send whose recipient changed. At most 3 uses per remembered yes; a send only towards the same recipient.
 * - App or title changed between the card and the action, the confirmation window identical: the yes was spent on another screen.
 * - 8d: an element that blinks on a screen with a clock in its tree was forgiven at every capture (20 requests, 41 captures).
 * - Point 6 (decision 159; judge v1394 N1): in Full access ONE card for the same payment, not one per click; another amount or another
 *   recipient is another payment and asks again. An approval bound to the order, the merchant and the amount, never a flag for the
 *   whole conversation (NHI journal FAQ on agentic payments and HackerNoon «human approval is a protocol, not a button», read 11/11/2026).
 * - The six mutants the reviewer left alive: K-S1, K-S4, K-S5, K-G1, K-G2, K-G3.
 * Fake ports and a fake helper (the shape of cua-driver): no screen, no helper, no model. Hermes gives an approval a scope key and a
 * lifetime (tools/computer_use/tool.py:34, :382-401); Codex asks again when the key of the action changes
 * (codex-rs/core/src/tools/sandboxing.rs:66-97).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito, EVENTI } from '../src/computer-use/ciclo.mjs';
import { POLITICHE, valutaAzione, improntaDeiDialoghi } from '../src/computer-use/protezioni.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO } = POLITICHE;
const BUIO = { tipo: 'clic', x: 5, y: 5 }; // a coordinate click with no element under the point
const uno = (...azioni) => ({ azioni });
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });
const IRREVERSIBILE = 'Eliminare definitivamente questo file? L\'azione non può essere annullata.';
/** a screen with one modal window; `fuori` are the elements behind it */
const finestra = ({ titolo = 'Elimina file', testi = [IRREVERSIBILE], pulsanti = ['Elimina', 'Annulla'], fuori = [], ...over } = {}) => ({ frenoArmato: true, app: 'explorer', titolo: 'Download',
  elementi: [...fuori, el('w', 'finestra', titolo, { modale: true }), ...testi.map((t, k) => el(`t${k}`, 'testo', t, { finestra: 'w' })),
    ...pulsanti.map((nome, k) => el(`b${k + 1}`, 'pulsante', nome, { finestra: 'w' }))], ...over });
/** the reviewer's window: a purchase that «cannot be undone», [Paga ora, Annulla] */
const ACQUISTO = (over = {}) => finestra({ titolo: 'Conferma acquisto', testi: ['Confermi l\'acquisto? Questa operazione non può essere annullata.', 'Totale 499,00 €'],
  pulsanti: ['Paga ora', 'Annulla'], app: 'chrome', dominio: 'negozio.example', ...over });

function porte({ risposte = [], guarda = () => finestra(), agisci = () => ({ esito: 'non-verificabile', modo: 'sottofondo' }), carta = () => 'si', ...altro } = {}) {
  let k = 0;
  const p = { eventi: [], eseguite: [], domande: [], richieste: 0, catture: 0, ora: 0 };
  p.porte = {
    guarda: async () => { p.catture += 1; return guarda(p); },
    chiedi: async () => { p.richieste += 1; const r = typeof risposte === 'function' ? risposte(p) : (k < risposte.length ? risposte[k++] : null); return r ?? { fine: { riuscito: true } }; },
    agisci: async (azione, bersaglio) => { const r = await agisci(azione, bersaglio, p); p.eseguite.push(azione.tipo); return r; },
    bersaglio: (azione, s) => (azione.ref != null && azione.ref !== '' ? s.elementi.find((e) => e.ref === azione.ref) ?? null : null),
    chiediPersona: async (q) => { p.domande.push(q); return carta(q, p); },
    attendi: async () => {},
    emetti: (nome, dati) => p.eventi.push({ nome, dati }),
    adesso: () => { p.ora += 10; return p.ora; },
    ...altro,
  };
  return p;
}
const corsa = (p, politica = NORMALE, extra = {}) => eseguiCompito({ testoDellaPersona: 'riordina la cartella Download', politica, porte: p.porte, ...extra });
const carte = (p) => p.domande.filter((q) => q.motivo === 'conferma');
const ripeti = (n, a) => Array.from({ length: n }, () => uno(a));

// ------------------------------------------------ F1 ------------------------------------------------
test('G4-1 (F1, nucleus): the strongest button of the modal windows comes first: «Paga ora» under «cannot be undone» is a PAYMENT, never a deletion', () => {
  for (const politica of [NORMALE, PIENO]) {
    const v = valutaAzione({ azione: BUIO, bersaglio: null, schermata: ACQUISTO(), politica, contesto: {} });
    assert.deepEqual([v.protezione, v.motivo, v.decisione], ['pagamento', 'clic-senza-bersaglio', 'chiedi'], politica.nome);
  }
  // the deletion still wins when no button pays: the irreversible text decides, as before
  const elimina = valutaAzione({ azione: BUIO, bersaglio: null, schermata: finestra(), politica: NORMALE, contesto: {} });
  assert.deepEqual([elimina.protezione, elimina.motivo], ['cancellazione', 'dialogo']);
});

test('G4-2 (F1, cycle): three blind clicks in front of the purchase: a payment card at every click in Normal, the total and the spending limit on the card, never a remembered yes', async () => {
  const p = porte({ risposte: ripeti(3, BUIO), guarda: () => ACQUISTO() });
  const r = await corsa(p, NORMALE, { testoDellaPersona: 'compra le cuffie e paga, spendi al massimo 50 €' });
  assert.deepEqual([r.esito, carte(p).length, p.eseguite.length], ['riuscito', 3, 3]);
  assert.deepEqual(carte(p).map((q) => q.protezione), ['pagamento', 'pagamento', 'pagamento']);
  // the spending limit is read: the card carries the total and the limit, and a blind click never counts as money spent
  assert.deepEqual([carte(p)[0].totale, carte(p)[0].tetto], [{ importo: 499, valuta: 'EUR' }, { importo: 50, valuta: 'EUR' }]);
  assert.deepEqual(r.spese, []);
  assert.ok(!r.storia.some((riga) => riga.includes('dato davanti a questa stessa finestra')), JSON.stringify(r.storia));
});

// the reviewer's probe through the REAL host: the helper is fake (cua-driver shape), the host and the cycle are the shipped ones
function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const PICCOLA = { x: 500, y: 300, width: 420, height: 200 };
const ospEl = (i, role, label, depth, frame) => ({ el: { element_index: i, element_token: `s0:${i}`, role, label, depth, actions: ['invoke'], frame, enabled: true },
  md: `${'  '.repeat(depth)}- [${i}] ${role} "${label}"` });
const ospRiga = (depth, role, label) => ({ md: `${'  '.repeat(depth)}- ${role} "${label}"` });
function aiutanteFinto({ app, titolo, righe }) {
  const azioni = [];
  const f = { window_id: 500, pid: 77, app_name: `${app}.exe`, title: titolo, bounds: PICCOLA, z_index: 9, is_on_screen: true, minimized: false };
  return { azioni, async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [f] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, dati: { window_id: f.window_id, pid: f.pid, window_title: f.title, app_name: f.app_name, window_bounds: f.bounds,
          screenshot_width: PICCOLA.width, screenshot_height: PICCOLA.height, elements: righe.filter((x) => x.el).map((x) => x.el),
          tree_markdown: `${righe.map((x) => x.md).join('\n')}\n` }, immagine: { base64: png(PICCOLA.width, PICCOLA.height).toString('base64'), mime: 'image/png' }, errore: null };
      }
      azioni.push({ nome, argomenti }); return { ok: true, dati: {}, immagine: null, errore: null };
    } };
}
const PER_APP = /wants to use this computer|outside the places/u;
async function viaOspite(schermo, passi, livello, frase = 'apri lo store e guarda le app in evidenza') {
  const aiutante = aiutanteFinto(schermo);
  const domande = []; const eventi = []; let n = 0;
  const risposte = [...passi.map((azioni) => ({ actions: azioni })), { done: { success: true, note: 'done' } }];
  const sessione = { testoDellaPersona: frase,
    chiediModello: async () => { const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => { domande.push(q[0].question); return { status: 'answered', answers: { [q[0].id]: q[0].options[0].label } }; },
    emetti: (nome, dati) => { eventi.push({ nome, dati }); } };
  await creaOspiteComputerUse({ aiutante })(NOME_COMPUTER_USE, { task: 'work on the screen' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione });
  return { carte: domande.filter((c) => !PER_APP.test(c)), clic: aiutante.azioni.filter((a) => a.nome === 'click').length,
    segni: eventi.filter((e) => e.nome === EVENTI.protezione).map((e) => e.dati?.protezione).filter(Boolean) };
}
const ACQUISTO_OSPITE = { app: 'store', titolo: 'Conferma acquisto', righe: [ospRiga(0, 'Window', 'Conferma acquisto'),
  ospRiga(1, 'Text', 'Confermi l\'acquisto? Questa operazione non può essere annullata.'), ospRiga(1, 'Text', 'Totale 499,00 €'),
  ospEl(1, 'Button', 'Paga ora', 1, { x: 560, y: 440, w: 100, h: 30 }), ospEl(2, 'Button', 'Annulla', 1, { x: 680, y: 440, w: 100, h: 30 })] };
const BUIO_OSPITE = { type: 'click', x: 10, y: 10 };

test('G4-3 (F1 through the real host): the reviewer\'s purchase window, 3 blind clicks: payment cards, never «deletion»; Normal one per click, Full access one for the same payment', async () => {
  const normale = await viaOspite(ACQUISTO_OSPITE, [[BUIO_OSPITE], [BUIO_OSPITE], [BUIO_OSPITE]], 'scrittura-progetto');
  assert.deepEqual([normale.carte.length, normale.clic], [3, 3], JSON.stringify(normale));
  assert.ok(normale.carte.every((c) => /a payment/u.test(c) && !/deletion/u.test(c)), JSON.stringify(normale.carte));
  assert.ok(!normale.segni.includes('cancellazione'), JSON.stringify(normale.segni));
  const pieno = await viaOspite(ACQUISTO_OSPITE, [[BUIO_OSPITE], [BUIO_OSPITE], [BUIO_OSPITE]], 'accesso-pieno');
  assert.deepEqual([pieno.carte.length, pieno.clic], [1, 3], JSON.stringify(pieno));
  assert.match(pieno.carte[0], /a payment/u);
});

// ------------------------------------------------ point 6: one card for the same payment in Full access ------------------------------------------------
test('G4-4 (point 6, decision 159, judge N1): Full access, the same payment clicked three times = ONE card; another amount or another recipient = a new card', async () => {
  const stesso = porte({ risposte: ripeti(3, BUIO), guarda: () => ACQUISTO() });
  const rs = await corsa(stesso, PIENO);
  assert.deepEqual([carte(stesso).length, stesso.eseguite.length, rs.esito], [1, 3, 'riuscito']);
  // a spinner or a video in the page changes only the PICTURE at every capture: still the same payment, one card (mutant N1-g)
  const animata = porte({ risposte: ripeti(3, BUIO), guarda: (q) => ACQUISTO({ impronta: `fotogramma ${q.catture}` }) });
  await corsa(animata, PIENO);
  assert.deepEqual([carte(animata).length, animata.eseguite.length], [1, 3]);
  // the amount on the screen changes after the first click: another payment
  const cifra = porte({ risposte: ripeti(3, BUIO), guarda: (q) => ACQUISTO(q.eseguite.length === 0 ? {} : { testi: ['Confermi l\'acquisto? Questa operazione non può essere annullata.', 'Totale 599,00 €'] }) });
  await corsa(cifra, PIENO);
  assert.deepEqual([carte(cifra).length, cifra.eseguite.length], [2, 3]);
  // the recipient read on the screen changes after the first click: another payment
  const chi = porte({ risposte: ripeti(3, BUIO), guarda: (q) => ACQUISTO({ conversazione: q.eseguite.length === 0 ? 'Negozio Rossi' : 'Negozio Bianchi' }) });
  await corsa(chi, PIENO);
  assert.deepEqual([carte(chi).length, chi.eseguite.length], [2, 3]);
  // anything else on the screen changes at every click: the payment is not «the same» any more
  const altro = porte({ risposte: ripeti(3, BUIO), guarda: (q) => ACQUISTO({ fuori: [el('v', 'voce', `Articolo ${q.eseguite.length}`)] }) });
  await corsa(altro, PIENO);
  assert.equal(carte(altro).length, 3);
  // never into another task: a second task in front of the very same payment asks its own card
  const dopo = porte({ risposte: ripeti(2, BUIO), guarda: () => ACQUISTO() });
  await corsa(dopo, PIENO);
  assert.equal(carte(dopo).length, 1);
  // Normal is untouched: a payment card for every click (the yes to a payment is never remembered there)
  const normale = porte({ risposte: ripeti(3, BUIO), guarda: () => ACQUISTO() });
  await corsa(normale, NORMALE);
  assert.equal(carte(normale).length, 3);
});

// ------------------------------------------------ F2 ------------------------------------------------
test('G4-5 (F2): a remembered yes has at most 3 uses; another object behind the window costs a new card every 4 clicks; a send only to the same recipient', async () => {
  // 20 requests of the same blind click: one card, 3 clicks under it, then a new card (before: 1 card for 20 clicks)
  const venti = porte({ risposte: ripeti(40, BUIO) });
  const rv = await corsa(venti);
  assert.deepEqual([rv.motivo, carte(venti).length, venti.eseguite.length], ['tetto-passi', 5, 20]);
  // another file selected behind the same generic window at every click
  const file = ['relazione.docx', 'tesi.docx', 'foto.png', 'contratto.pdf', 'bilancio.xlsx', 'diario.txt'];
  const dietro = porte({ risposte: ripeti(6, BUIO), guarda: (q) => finestra({ fuori: [el('v1', 'voce', file[Math.min(q.eseguite.length, 5)], { stato: { selezionato: true } })] }) });
  await corsa(dietro);
  assert.deepEqual([carte(dietro).length, dietro.eseguite.length], [2, 6]);
  // a send whose recipient (the header behind the window) changes at every click: a card every time
  const INVIA = { titolo: 'Invia', testi: ['Inviare il messaggio senza oggetto?'], pulsanti: ['Invia', 'Annulla'], app: 'outlook' };
  const nomi = ['Marco', 'Giulia', 'Banca', 'Capo', 'Tutti', 'Lista'];
  const destinatari = porte({ risposte: ripeti(6, BUIO), guarda: (q) => finestra({ ...INVIA, fuori: [el('h', 'intestazione', nomi[Math.min(q.eseguite.length, 5)])] }) });
  await corsa(destinatari);
  assert.deepEqual([carte(destinatari).map((q) => q.protezione), destinatari.eseguite.length], [Array(6).fill('invio'), 6]);
  // the same recipient: the yes is remembered (3 uses)
  const stesso = porte({ risposte: ripeti(4, BUIO), guarda: () => finestra({ ...INVIA, fuori: [el('h', 'intestazione', 'Marco')] }) });
  await corsa(stesso);
  assert.deepEqual([carte(stesso).length, stesso.eseguite.length], [1, 4]);
  // a recipient that cannot be read: the yes holds only while the whole screen stays the same (a message that changes behind asks again)
  const muto = porte({ risposte: ripeti(4, BUIO), guarda: () => finestra({ ...INVIA, fuori: [el('m', 'campo', 'Messaggio', { valore: 'ciao' })] }) });
  await corsa(muto);
  assert.deepEqual([carte(muto).length, muto.eseguite.length], [1, 4]);
  const cambia = porte({ risposte: ripeti(3, BUIO), guarda: (q) => finestra({ ...INVIA, fuori: [el('m', 'campo', 'Messaggio', { valore: `bozza ${q.eseguite.length}` })] }) });
  await corsa(cambia);
  assert.deepEqual([carte(cambia).length, cambia.eseguite.length], [3, 3]);
});

// ------------------------------------------------ app or title between card and action ------------------------------------------------
test('G4-6 (app or title changed while the card is open, the window identical): the click does not start, «screen changed»', async () => {
  const cambiaAllaCarta = (dopo) => { let aperta = false; return { carta: () => { aperta = true; return 'si'; }, guarda: () => (aperta ? dopo() : finestra()) }; };
  for (const [nome, dopo] of [['another app', () => finestra({ app: 'outlook' })], ['another title of the app window', () => ({ ...finestra(), titolo: 'Documenti' })]]) {
    const p = porte({ risposte: [uno(BUIO)], ...cambiaAllaCarta(dopo) });
    const r = await corsa(p);
    assert.deepEqual([carte(p).length, p.eseguite], [1, []], nome);
    assert.ok(r.storia.some((riga) => riga.includes('→ non-eseguita (schermo-cambiato)')), `${nome}: ${JSON.stringify(r.storia)}`);
  }
  // the same through the «I can» row: the person turns the permission on, meanwhile another app, or another title of the same app
  // window (another folder behind the same dialog), is in front (mutant K4-A2: the «I can» row checking the app only)
  for (const [nome, dopo] of [['another app', () => finestra({ app: 'outlook' })], ['another title of the app window', () => ({ ...finestra(), titolo: 'Documenti' })]]) {
    let acceso = false;
    const valuta = ({ schermata }) => (schermata.elementi.some((e) => e.modale) && !acceso ? { decisione: 'ferma', protezione: 'cancellazione', motivo: 'dialogo', prova: 'x' }
      : { decisione: 'procedi', protezione: null, motivo: null, prova: null });
    const posso = porte({ risposte: [uno(BUIO)], permessoMancante: async () => { acceso = true; return 'aggiunto'; }, guarda: () => (acceso ? dopo() : finestra()) });
    const rp = await corsa(posso, NORMALE, { valuta });
    assert.deepEqual(posso.eseguite, [], nome);
    assert.ok(rp.storia.some((riga) => riga.includes('→ non-eseguita (schermo-cambiato)')), `${nome}: ${JSON.stringify(rp.storia)}`);
  }
});

// ------------------------------------------------ 8c ------------------------------------------------
/** the reviewer's healthy task: twelve boxes, then «Salva» disabled until three fields are filled; refused three times NOT in a row */
async function salva({ campiVisibili }) {
  const stato = { pieni: [], salvato: false, passo: 0 };
  const schermo = () => ({ frenoArmato: true, app: 'chrome', dominio: 'modulo.example', titolo: 'Modulo', elementi: [
    ...['Nome', 'Cognome', 'Email'].map((n, k) => el(`c${k}`, 'campo', n, campiVisibili ? { valore: stato.pieni[k] ?? '' } : {})), el('sa', 'pulsante', 'Salva'),
    ...Array.from({ length: 12 }, (_, k) => el(`v${k}`, 'casella', `Voce ${k}`))] });
  const piano = [...Array.from({ length: 12 }, (_, k) => ({ tipo: 'premi', ref: `v${k}` })), { tipo: 'premi', ref: 'sa' }, { tipo: 'scrivi', ref: 'c0', testo: 'a' },
    { tipo: 'premi', ref: 'sa' }, { tipo: 'scrivi', ref: 'c1', testo: 'b' }, { tipo: 'premi', ref: 'sa' }, { tipo: 'scrivi', ref: 'c2', testo: 'c' }, { tipo: 'premi', ref: 'sa' }];
  const agisci = (azione, b) => {
    if (azione.tipo === 'scrivi') { stato.pieni[Number(azione.ref.slice(1))] = azione.testo; return { esito: 'non-verificabile' }; }
    if (b?.ref === 'sa') { if (stato.pieni.filter(Boolean).length < 3) return { esito: 'rifiutata', motivo: 'altro' }; stato.salvato = true; }
    return { esito: 'non-verificabile' };
  };
  const p = porte({ risposte: () => (stato.passo < piano.length ? uno(piano[stato.passo++]) : null), guarda: schermo, agisci });
  const r = await corsa(p, PIENO, { testoDellaPersona: 'compila e salva' });
  return { r, stato, p };
}

test('G4-7 (8c): the healthy 19-step task with «Save» refused three times NOT in a row ends well, whether the fields show their value or not', async () => {
  for (const campiVisibili of [true, false]) {
    const { r, stato } = await salva({ campiVisibili });
    assert.deepEqual([r.esito, r.motivo, stato.salvato], ['riuscito', 'completato', true], `${campiVisibili}: ${JSON.stringify(r.storia.slice(-4))}`);
  }
  // the other way round: what is NOT progress. The same write done again, a scroll, a blind click in between: the third failure closes.
  // Cure of the reviewer's RED (N2, 11/11): this holds where only the TITLE moves; when the texts of the elements change (a licence
  // scrolled, a save in progress) the count of the element starts again ONCE: tests/computer-use-lotti-cura-del-rosso.test.mjs, R3
  const SALVA = { tipo: 'premi', ref: 'sa' };
  // an animated title: every capture differs, so a blind click «worked» and the failures in a row start again (Performance S8)
  const modulo = (q) => ({ frenoArmato: true, app: 'chrome', dominio: 'modulo.example', titolo: `Modulo ${q.catture}`, elementi: [el('c0', 'campo', 'Nome'), el('sa', 'pulsante', 'Salva')] });
  const rifiutaSalva = (azione, b) => (b?.ref === 'sa' ? { esito: 'rifiutata', motivo: 'altro' } : { esito: 'non-verificabile' });
  for (const [nome, inMezzo] of [['the same write', { tipo: 'scrivi', ref: 'c0', testo: 'a' }], ['a scroll', { tipo: 'scorri', ref: 'c0', direzione: 'giu', quantita: 3 }], ['a blind click', BUIO]]) {
    const p = porte({ risposte: [uno(inMezzo), uno(SALVA), uno(inMezzo), uno(SALVA), uno(inMezzo), uno(SALVA), uno(inMezzo)], guarda: modulo, agisci: rifiutaSalva });
    const r = await corsa(p, PIENO);
    assert.deepEqual([r.esito, r.motivo], ['non-riuscito', 'elemento-non-risponde'], nome);
  }
  // scrolling three DIFFERENT lists is still not progress (mutant M4-8c-c): each scroll is new, the third failure still closes
  const liste = (q) => ({ ...modulo(q), elementi: [...modulo(q).elementi, el('l1', 'lista', 'Prodotti'), el('l2', 'lista', 'Recensioni'), el('l3', 'lista', 'Domande')] });
  const giu = (ref) => uno({ tipo: 'scorri', ref, direzione: 'giu', quantita: 3 });
  const pl = porte({ risposte: [giu('l1'), uno(SALVA), giu('l2'), uno(SALVA), giu('l3'), uno(SALVA), giu('l1')], guarda: liste, agisci: rifiutaSalva });
  const rl = await corsa(pl, PIENO);
  assert.deepEqual([rl.esito, rl.motivo], ['non-riuscito', 'elemento-non-risponde'], JSON.stringify(rl.storia.slice(-4)));
  // «Save» fails FIRST, then a blind click or a scroll comes for the first time: still not progress (mutants M4-8c-c, M4-8c-d)
  for (const [nome, inMezzo] of [['a blind click', BUIO], ['a scroll', { tipo: 'scorri', ref: 'c0', direzione: 'giu', quantita: 3 }]]) {
    const p = porte({ risposte: [uno(SALVA), uno(inMezzo), uno(SALVA), uno(inMezzo), uno(SALVA), uno(inMezzo), uno(SALVA)], guarda: modulo, agisci: rifiutaSalva });
    const r = await corsa(p, PIENO);
    assert.deepEqual([r.esito, r.motivo, p.eseguite.filter((t) => t === 'premi').length], ['non-riuscito', 'elemento-non-risponde', 3], `${nome} after the first failure`);
  }
});

// ------------------------------------------------ 8d ------------------------------------------------
test('G4-8 (8d): an element that blinks on a screen with a clock in its tree is forgiven once, not at every capture: early stop, not 20 requests', async () => {
  for (const orologio of [false, true, 'immagine']) {
    const p = porte({ risposte: () => uno({ tipo: 'scorri', direzione: 'giu', quantita: 3 }, { tipo: 'premi', ref: 'e9' }),
      // 'immagine': only the picture changes at every capture (an animation), the tree stays: forgiven once too (mutant N1-g*)
      guarda: (q) => ({ frenoArmato: true, app: 'chrome', dominio: 'sito.example', titolo: 'Lista', ...(orologio === 'immagine' ? { impronta: `fotogramma ${q.catture}` } : {}), elementi: [el('l', 'voce', 'Riga'),
        ...(q.catture % 2 === 1 ? [el('e9', 'pulsante', 'Carica altri')] : []), ...(orologio ? [el('o', 'testo', `ore 10:00:${String(q.catture).padStart(2, '0')}`)] : [])] }) });
    const r = await corsa(p, PIENO, { testoDellaPersona: 'carica tutto' });
    assert.deepEqual([r.esito, r.motivo, p.richieste], ['non-riuscito', 'elemento-non-trovato', 4], `clock ${orologio}`);
    assert.ok(p.catture <= 8, `clock ${orologio}: ${p.catture} captures`);
  }
});

// ------------------------------------------------ the six mutants left alive ------------------------------------------------
test('G4-9 (K-S1): a yes whose click never started is not remembered, even when the guard card in between finds the screen changed', async () => {
  // a sensitive site in the guard; the five minutes of the guard yes run out between the card and the click, so the guard asks on the
  // spot and its re-read finds another amount on the screen: the click does not start. The next blind click must ask its own card.
  const MIN = 60_000;
  const base = () => finestra({ app: 'chrome', dominio: 'poste.it', titolo: 'Documenti - Poste' });
  const p = porte({ risposte: [uno(BUIO), uno(BUIO)],
    carta: (q, x) => { if (q.motivo === 'guardia') x.guardie = (x.guardie ?? 0) + 1; return 'si'; },
    guarda: (q) => {
      if (carte(q).length === 1 && !q.saltato) { q.saltato = true; q.ora += 6 * MIN; } // after the first card: six minutes go by
      if (q.guardie === 1 && !q.cambiato) { q.cambiato = true; const s = base(); return { ...s, elementi: [...s.elementi, el('i', 'testo', 'Commissione 12,00 €')] }; }
      return base();
    } });
  const r = await corsa(p, NORMALE, { guardia: { accesa: true }, limiti: { millisecondi: 3_600_000 } });
  assert.ok(r.storia.some((riga) => riga.includes('→ non-eseguita (schermo-cambiato)')), JSON.stringify(r.storia));
  assert.deepEqual([carte(p).length, p.eseguite], [2, ['clic']], JSON.stringify(r.storia));
});

test('G4-10 (K-S4): the fingerprint of the windows reads the non-modal windows too; one that changes behind the dialog asks again', async () => {
  const conLista = (nome) => ({ ...finestra(), elementi: [...finestra().elementi, el('w2', 'finestra', 'Download', { modale: false }), el('l1', 'voce', nome, { finestra: 'w2' })] });
  assert.notEqual(improntaDeiDialoghi(conLista('relazione.docx')), improntaDeiDialoghi(conLista('tesi.docx')));
  const p = porte({ risposte: ripeti(2, BUIO), guarda: (q) => conLista(q.eseguite.length === 0 ? 'relazione.docx' : 'tesi.docx') });
  await corsa(p);
  assert.deepEqual([carte(p).length, p.eseguite.length], [2, 2]);
});

test('G4-11 (K-S5): with no target, the evidence read again after the card must be the one the card was asked for', async () => {
  // the same windows, but what the protections found changed while the card was open: the click does not start
  const p = porte({ risposte: [uno(BUIO)] });
  const valuta = () => ({ decisione: 'chiedi', protezione: 'cancellazione', motivo: 'dialogo', prova: carte(p).length === 0 ? 'x' : 'y' });
  const r = await corsa(p, NORMALE, { valuta });
  assert.deepEqual([carte(p).length, p.eseguite], [1, []]);
  assert.ok(r.storia.some((riga) => riga.includes('→ non-eseguita (protezione-cambiata)')), JSON.stringify(r.storia));
});

test('G4-12 (K-G1, K-G2, K-G3): the count of «did not respond» is per action AND element: no element, another name on the same ref, another kind of action do not add up', async () => {
  const rotto = (quali) => (azione) => (quali(azione) ? { esito: 'rifiutata', motivo: 'altro' } : { esito: 'non-verificabile', modo: 'sottofondo' });
  const SCORRI = { tipo: 'scorri', direzione: 'giu', quantita: 3 };
  const base = { frenoArmato: true, app: 'chrome', dominio: 'sito.example', titolo: 'Lista' };
  const alterna = (azioni) => azioni.flatMap((a) => [uno(a), uno(SCORRI)]);
  // K-G1: blind clicks that fail, with a scroll that works in between, are not «the same element»
  const g1 = porte({ risposte: alterna([BUIO, BUIO, BUIO]), guarda: () => ({ ...base, elementi: [el('l', 'voce', 'Riga')] }), agisci: rotto((a) => a.tipo === 'clic') });
  const r1 = await corsa(g1, PIENO);
  assert.deepEqual([r1.esito, r1.motivo], ['riuscito', 'completato'], JSON.stringify(r1.storia));
  // K-G2: the same ref with another name (the helper numbered the tree again) is another element
  const E1 = { tipo: 'premi', ref: 'e1' };
  const g2 = porte({ risposte: alterna([E1, E1, E1]), guarda: (q) => ({ ...base, elementi: [el('e1', 'pulsante', q.richieste === 2 ? 'Invia' : 'Salva') /* the capture before the 3rd request */] }), agisci: rotto((a) => a.tipo === 'premi') });
  const r2 = await corsa(g2, PIENO);
  assert.deepEqual([r2.esito, r2.motivo], ['riuscito', 'completato'], JSON.stringify(r2.storia));
  // K-G3: another kind of action on the same element is another action
  const g3 = porte({ risposte: alterna([{ tipo: 'premi', ref: 'c1' }, { tipo: 'scrivi', ref: 'c1', testo: 'a' }, { tipo: 'premi', ref: 'c1' }]),
    guarda: () => ({ ...base, elementi: [el('c1', 'campo', 'Nome')] }), agisci: rotto((a) => a.tipo === 'premi' || a.tipo === 'scrivi') });
  const r3 = await corsa(g3, PIENO);
  assert.deepEqual([r3.esito, r3.motivo], ['riuscito', 'completato'], JSON.stringify(r3.storia));
  // control: the same action on the same element three times closes, as in round 3
  const tre = porte({ risposte: alterna([E1, E1, E1]), guarda: () => ({ ...base, elementi: [el('e1', 'pulsante', 'Salva')] }), agisci: rotto((a) => a.tipo === 'premi') });
  assert.equal((await corsa(tre, PIENO)).motivo, 'elemento-non-risponde');
});
