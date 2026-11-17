/**
 * 0.2.2-CU, second round of the cure (11/11/2026, reviewers A, B and C, judge v1493, v1498 and v1499, owner decision 17:12).
 * - G1 (R1, reviewer B): the yes remembers WHERE it was given: Ctrl/Cmd+Enter in another chat, the other way round, and «Pubblica»
 *   after «Invia» each ask their own card; the same place still shares one yes.
 * - G2: recipients changed while the card is open: nothing is sent, and the new card shows the new recipients.
 * - G3: «Cc recipients» and «Bcc recipients» are recipient fields; recipients shown as separate name elements (chips) next to an empty
 *   «A» field are read and tied to the yes; the card never writes the window heading as the recipient of a mail.
 * - G4 (T1): the shortcut for a recipient named in the words reads the A, Cc, Bcc fields and the chips, never the heading alone.
 * - P1 (reviewer A point 1, judge v1498 option A): on a checkout a click by coordinates that lands on the Document or a container is a
 *   blind click.
 * - S (5a): the spend is booked only by the action that pays; «Avanti» on a checkout only reserves it.
 * - D (5b), T (5c), K (5d, 5h): pay names with decorations, title noise both ways, tests for the mutants left alive.
 * - C (5f, 5i, owner 17:12): the true number of recipients, a list the card cannot show whole opens in full and «Allow» waits for it.
 * Fake ports and a fake helper only. Like Hermes, where each destination authorises itself (tools/send_message_tool.py:264-265).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito } from '../src/computer-use/ciclo.mjs';
import { POLITICHE, valutaAzione } from '../src/computer-use/protezioni.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE, anteprimaDeiDestinatari } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO, pcConsentiSempre: SEMPRE } = POLITICHE;
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });
const M = 'marco@esempio.it';

function porte({ risposte, guarda, agisci = () => ({ esito: 'non-verificabile', modo: 'sottofondo' }), persona = () => 'si', consenso = false, bersaglio = null }) {
  const p = { eseguite: [], domande: [], richieste: 0, catture: 0, ora: 0, si: 0 };
  p.porte = {
    guarda: async () => { p.catture += 1; return guarda(p); },
    chiedi: async () => { p.richieste += 1; return risposte(p) ?? { fine: { riuscito: true } }; },
    agisci: async (azione, b) => { const r = await agisci(azione, b, p); p.eseguite.push(b?.nome ?? azione.tipo); return r; },
    bersaglio: bersaglio ?? ((azione, s) => (azione.ref != null && azione.ref !== '' ? s.elementi.find((e) => e.ref === azione.ref) ?? null : null)),
    chiediPersona: async (q) => { p.domande.push(q); const r = persona(q); if (r === 'si' && (q.motivo === 'conferma' || q.motivo === 'conferme')) p.si += 1; return r; },
    attendi: async () => {}, emetti: () => {}, adesso: () => { p.ora += 10; return p.ora; },
  };
  if (consenso) p.porte.consensoDelCompito = async () => 'si';
  return p;
}
const carte = (p) => p.domande.filter((q) => q.motivo === 'conferma');
const fila = (lista) => { let k = 0; return () => (k < lista.length ? lista[k++] : null); };
const uno = (...azioni) => ({ azioni });
const PREMI = { tipo: 'premi', ref: 'inv' };
const CTRL_CHAT = { tipo: 'tasti', ref: 'chat', combinazione: 'ctrl+enter' };

// ------------------------------------------------ G1 the yes is tied to where it was given ------------------------------------------------
const pagina = (a = M) => ({ frenoArmato: true, app: 'chrome', dominio: 'posta.example', titolo: 'Posta', elementi: [el('h', 'intestazione', 'Nuovo messaggio'),
  el('a', 'campo', 'A', { valore: a }), el('m', 'campo', 'Messaggio', { valore: 'ciao' }), el('inv', 'pulsante', 'Invia'),
  el('chat', 'campo', 'Scrivi un messaggio'), el('pub', 'pulsante', 'Pubblica')] });
async function corsa(prima, dopo, politica = NORMALE) {
  const p = porte({ risposte: fila([uno(prima), uno(dopo)]), guarda: () => pagina() });
  await eseguiCompito({ testoDellaPersona: 'manda la mail a marco', politica, porte: p.porte });
  return [carte(p).length, p.eseguite.length];
}

test('G1 R1: Ctrl/Cmd+Enter in another chat, the other way round, Ctrl+Enter in the message and «Pubblica» after «Invia» each ask their own card', async () => {
  const esiti = {
    altraChat: await corsa(PREMI, CTRL_CHAT),
    cmdAltraChat: await corsa(PREMI, { tipo: 'tasti', ref: 'chat', combinazione: 'meta+enter' }),
    chatPoiInvia: await corsa(CTRL_CHAT, PREMI),
    messaggioDopoInvia: await corsa(PREMI, { tipo: 'tasti', ref: 'm', combinazione: 'ctrl+enter' }),
    pubblicaDopoInvia: await corsa(PREMI, { tipo: 'premi', ref: 'pub' }),
  };
  assert.deepEqual(esiti, { altraChat: [2, 2], cmdAltraChat: [2, 2], chatPoiInvia: [2, 2], messaggioDopoInvia: [2, 2], pubblicaDopoInvia: [2, 2] });
});

test('G1 R1: the same place still shares one yes: a second «Invia», Alt+S of the window, Ctrl+Enter twice in the same chat; Full access asks none', async () => {
  assert.deepEqual(await corsa(PREMI, PREMI), [1, 2]);
  assert.deepEqual(await corsa(PREMI, { tipo: 'tasti', ref: 'a', combinazione: 'alt+s' }), [1, 2]);
  assert.deepEqual(await corsa(CTRL_CHAT, CTRL_CHAT), [1, 2]);
  assert.deepEqual(await corsa(PREMI, PREMI, PIENO), [0, 2]);
});

// ------------------------------------------------ G2 recipients changed while the card is open ------------------------------------------------
test('G2: recipients changed while the card was open: nothing is sent, and the next card shows the new recipients', async () => {
  const p = porte({ risposte: fila([uno(PREMI), uno(PREMI)]), guarda: (q) => pagina(q.si ? `${M}; Tutti i dipendenti` : M) });
  const r = await eseguiCompito({ testoDellaPersona: 'manda la mail a marco', politica: NORMALE, porte: p.porte });
  assert.equal(carte(p).length, 2);
  assert.deepEqual(p.eseguite, ['Invia'], 'the first yes was for «marco» only: nothing went to «Tutti i dipendenti» under it');
  assert.doesNotMatch(JSON.stringify(carte(p)[0].destinatario), /Tutti i dipendenti/u);
  assert.match(JSON.stringify(carte(p)[1].destinatario), /Tutti i dipendenti/u);
  assert.ok(r.storia.some((x) => /destinatario-cambiato/u.test(x)), r.storia.join(' | '));
});

// ------------------------------------------------ G3 Cc and Bcc recipients, chips, never the heading ------------------------------------------------
const gmail = ({ a = M, cc = '', bcc = '' } = {}) => ({ frenoArmato: true, app: 'chrome', dominio: 'mail.google.com', titolo: 'Nuovo messaggio - Gmail', elementi: [
  el('h', 'intestazione', 'Nuovo messaggio'), el('a', 'campo', 'To recipients', { valore: a }), el('cc', 'campo', 'Cc recipients', { valore: cc }),
  el('bcc', 'campo', 'Bcc recipients', { valore: bcc }), el('m', 'campo', 'Corpo del messaggio', { valore: 'ciao' }), el('inv', 'pulsante', 'Invia')] });

test('G3: «Cc recipients» and «Bcc recipients» are recipient fields: shown on the card, and one added after the yes asks again', async () => {
  const p = porte({ risposte: fila([uno(PREMI)]), guarda: () => gmail({ cc: 'capo@esempio.it', bcc: 'spia@altrove.example' }) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
  assert.deepEqual(carte(p)[0].destinatario.campi, [{ tipo: 'a', valore: M, quanti: 1 }, { tipo: 'cc', valore: 'capo@esempio.it', quanti: 1 }, { tipo: 'ccn', valore: 'spia@altrove.example', quanti: 1 }]);
  const q = porte({ risposte: fila([uno(PREMI), uno(PREMI)]), guarda: (x) => gmail({ bcc: x.eseguite.length ? 'spia@altrove.example' : '' }) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: q.porte });
  assert.deepEqual([carte(q).length, q.eseguite.length], [2, 2]);
});

const gettoni = (chi, { a = '' } = {}) => ({ frenoArmato: true, app: 'chrome', dominio: 'posta.example', titolo: 'Posta', elementi: [el('h', 'intestazione', 'Nuovo messaggio'),
  el('a', 'campo', 'A', { valore: a }), ...chi.map((c, k) => el(`g${k}`, 'pulsante', c)), el('m', 'campo', 'Messaggio', { valore: 'ciao' }), el('inv', 'pulsante', 'Invia')] });

test('G3: recipients shown as name elements next to an empty «A» field are read, tied to the yes, and named on the card', async () => {
  const p = porte({ risposte: fila([uno(PREMI), uno(PREMI)]), guarda: (q) => gettoni(q.eseguite.length ? ['Marco Rossi', 'Tutti i dipendenti'] : ['Marco Rossi']) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
  assert.deepEqual([carte(p).length, p.eseguite.length], [2, 2]);
  assert.deepEqual(carte(p)[0].destinatario.campi, [{ tipo: 'a', valore: 'Marco Rossi', quanti: 1 }]);
  assert.deepEqual(carte(p)[1].destinatario.campi, [{ tipo: 'a', valore: 'Marco Rossi; Tutti i dipendenti', quanti: 2 }]);
  for (const q of carte(p)) assert.doesNotMatch(JSON.stringify(q.destinatario), /Nuovo messaggio/u);
});

test('G3: an empty recipient field and nothing else: the card says the recipient cannot be read, never the heading «Nuovo messaggio»', async () => {
  const p = porte({ risposte: fila([uno(PREMI), uno(PREMI)]), guarda: () => gettoni([]) });
  await eseguiCompito({ testoDellaPersona: 'manda le mail', politica: NORMALE, porte: p.porte });
  assert.deepEqual(carte(p)[0].destinatario, { campi: [], conversazione: null, accorciato: false });
  assert.equal(carte(p).length, 2, 'an unreadable recipient never shares a yes');
  // a chat with no recipient field keeps its header as the recipient (WhatsApp, Teams)
  const chat = () => ({ frenoArmato: true, app: 'chrome', dominio: 'web.whatsapp.com', titolo: 'WhatsApp', elementi: [el('h', 'intestazione', 'Marco Rossi'),
    el('chat', 'campo', 'Scrivi un messaggio', { valore: 'ciao' }), el('inv', 'pulsante', 'Invia')] });
  const q = porte({ risposte: fila([uno(PREMI)]), guarda: chat });
  await eseguiCompito({ testoDellaPersona: 'scrivi a marco', politica: NORMALE, porte: q.porte });
  assert.equal(carte(q)[0].destinatario.conversazione, 'Marco Rossi');
});

// ------------------------------------------------ G4 T1 reads the fields, not the heading alone ------------------------------------------------
const risposta = ({ a, ccn = null, campoA = true }) => ({ frenoArmato: true, app: 'outlook', titolo: 'Re: Riunione - Messaggio', elementi: [el('h', 'intestazione', 'Marco Rossi'),
  ...(campoA ? [el('a', 'campo', 'A', { valore: a })] : []), ...(ccn ? [el('ccn', 'campo', 'Ccn', { valore: ccn })] : []), el('m', 'campo', 'Messaggio', { valore: 'ok' }), el('inv', 'pulsante', 'Invia')] });

test('G4 T1: «manda la mail a Marco Rossi», heading «Marco Rossi», «A» with «Tutti i dipendenti» and an unknown Bcc: the card asks', async () => {
  const conta = async (s) => {
    const p = porte({ risposte: fila([uno(PREMI)]), guarda: () => s, consenso: true });
    await eseguiCompito({ testoDellaPersona: 'manda la mail a Marco Rossi', politica: NORMALE, porte: p.porte });
    return [carte(p).length, p.eseguite.length];
  };
  assert.deepEqual(await conta(risposta({ a: 'Tutti i dipendenti', ccn: 'spia@altrove.example' })), [1, 1]);
  assert.deepEqual(await conta(risposta({ a: 'Marco Rossi', ccn: 'spia@altrove.example' })), [1, 1], 'a Bcc nobody named is another recipient');
  assert.deepEqual(await conta(risposta({ a: '' })), [1, 1], 'an empty «A» field is not «Marco Rossi»');
  // still covered: the fields say only the person named in the words, or a chat whose header is that person
  assert.deepEqual(await conta(risposta({ a: 'Marco Rossi' })), [0, 1]);
  assert.deepEqual(await conta(risposta({ campoA: false })), [0, 1]);
});

// ------------------------------------------------ P1 the Document or a container under the click on a checkout ------------------------------------------------
const bersaglioComeAttrezzo = (azione, s) => {
  const el2 = s?.elementi ?? [];
  if (azione?.ref) return el2.find((e) => e.ref === azione.ref) ?? null;
  if (azione?.tipo === 'clic') {
    const dentro = el2.filter((e) => e.rettangolo && azione.x >= e.rettangolo.x && azione.x < e.rettangolo.x + e.rettangolo.w
      && azione.y >= e.rettangolo.y && azione.y < e.rettangolo.y + e.rettangolo.h);
    return dentro.sort((a, b) => a.rettangolo.w * a.rettangolo.h - b.rettangolo.w * b.rettangolo.h)[0] ?? null;
  }
  return null;
};
const negozio = (titolo, nome, { contenitore = false } = {}) => ({ frenoArmato: true, app: 'chrome', dominio: 'negozio.example', titolo, elementi: [
  el('e1', 'campo', titolo, { rettangolo: { x: 0, y: 100, w: 1920, h: 980 } }),
  ...(contenitore ? [el('e9', 'altro', '', { rettangolo: { x: 500, y: 500, w: 700, h: 300 } })] : []),
  el('e2', 'testo', 'Totale 49,00 €', { rettangolo: { x: 600, y: 600, w: 150, h: 30 } }),
  el('e3', 'pulsante', nome, { rettangolo: { x: 800, y: 600, w: 200, h: 50 } })] });

test('P1: on a checkout a click 5 px beside «Paga ora» lands on the Document or a container and asks the payment card, Normal and Full access', async () => {
  const esiti = [];
  for (const [nome, s] of [['document', negozio('Cassa - Negozio', 'Paga ora')], ['container', negozio('Checkout - Negozio', 'Paga ora', { contenitore: true })]]) {
    for (const politica of [NORMALE, PIENO]) {
      const p = porte({ risposte: fila([uno({ tipo: 'clic', x: 795, y: 620 })]), guarda: () => s, bersaglio: bersaglioComeAttrezzo });
      await eseguiCompito({ testoDellaPersona: 'compra le cuffie', piano: { domini: ['negozio.example'], app: [] }, politica, porte: p.porte });
      esiti.push([nome, politica.nome, carte(p).map((q) => q.protezione).join(','), p.eseguite.length]);
    }
  }
  assert.deepEqual(esiti, [['document', NORMALE.nome, 'pagamento', 1], ['document', PIENO.nome, 'pagamento', 1], ['container', NORMALE.nome, 'pagamento', 1], ['container', PIENO.nome, 'pagamento', 1]]);
});

test('P1: outside a checkout, and on a checkout where nothing pays, the click on the Document asks nothing more (decision 375)', async () => {
  for (const s of [negozio('Cuffie wireless - Negozio', 'Aggiungi al carrello'), negozio('Cassa - Negozio', 'Torna al carrello')]) {
    const p = porte({ risposte: fila([uno({ tipo: 'clic', x: 795, y: 620 })]), guarda: () => s, bersaglio: bersaglioComeAttrezzo });
    await eseguiCompito({ testoDellaPersona: 'guarda le cuffie', piano: { domini: ['negozio.example'], app: [] }, politica: NORMALE, porte: p.porte });
    assert.deepEqual([carte(p).length, p.eseguite.length], [0, 1], s.titolo);
  }
});

// ------------------------------------------------ S (5a) the spend is booked only by the action that pays ------------------------------------------------
const MIN = 60 * 1000;
const cassa = (titolo, totale) => ({ frenoArmato: true, titolo, dominio: 'negozio.example', elementi: [el('r0', 'testo', `Totale ${totale} €`),
  el('paga', 'pulsante', 'Paga ora'), el('cc', 'voce', 'Visa •••• 4242'), el('b1', 'pulsante', 'Avanti')] });
const TETTO = { testoDellaPersona: 'compra le cuffie, fino a 50 €', piano: { domini: ['negozio.example'], app: [] }, politica: NORMALE, limiti: { millisecondi: 60 * MIN } };

test('S 5a: «Avanti» then «Paga ora» on the same 30 € checkout under a 50 € cap: no card, one spend of 30', async () => {
  for (const titolo of ['Cassa - Negozio', 'Checkout - Negozio']) {
    const p = porte({ risposte: fila([uno({ tipo: 'premi', ref: 'b1' }), uno({ tipo: 'premi', ref: 'paga' })]), guarda: () => cassa(titolo, '30,00') });
    const r = await eseguiCompito({ ...TETTO, porte: p.porte });
    assert.deepEqual([p.domande.filter((q) => q.protezione === 'pagamento').length, p.eseguite], [0, ['Avanti', 'Paga ora']], titolo);
    assert.deepEqual(r.spese.map((x) => x.totale.importo), [30], titolo);
  }
});

test('S 5a: «Avanti» at 30 €, then the total is 35 € and the person says no: nothing was paid, and the log never says «pagati 30»', async () => {
  for (const titolo of ['Cassa - Negozio', 'Checkout - Negozio']) {
    const p = porte({ risposte: fila([uno({ tipo: 'premi', ref: 'b1' }), uno({ tipo: 'premi', ref: 'paga' }), { fine: { riuscito: false } }]),
      guarda: (q) => cassa(titolo, q.eseguite.length === 0 ? '30,00' : '35,00'), persona: (q) => (q.protezione === 'pagamento' ? 'no' : 'si') });
    const r = await eseguiCompito({ ...TETTO, porte: p.porte });
    assert.deepEqual(p.eseguite, ['Avanti'], titolo);
    assert.deepEqual(r.spese, [], titolo);
    assert.ok(!r.storia.some((x) => /pagati/u.test(x)), r.storia.join(' | '));
  }
});

test('S 5a: «Paga ora» alone under the cap still books the spend, and a second payment over the cap asks', async () => {
  const p = porte({ risposte: fila([uno({ tipo: 'premi', ref: 'paga' })]), guarda: () => cassa('Cassa - Negozio', '30,00') });
  const r = await eseguiCompito({ ...TETTO, porte: p.porte });
  assert.deepEqual([p.domande.filter((q) => q.protezione === 'pagamento').length, r.spese.map((x) => x.totale.importo)], [0, [30]]);
  assert.ok(r.storia.some((x) => /pagati 30 EUR/u.test(x)), r.storia.join(' | '));
});

// ------------------------------------------------ D (5b) pay names with decorations ------------------------------------------------
const BUIO = { tipo: 'clic', x: 724, y: 520 };
const conElemento = (titolo, x) => ({ frenoArmato: true, app: 'chrome', dominio: 'negozio.example', titolo, elementi: [el('t1', 'testo', 'Totale 499,00 €'), x, el('z', 'collegamento', 'Torna al carrello')] });
const buio = (s, politica = NORMALE) => valutaAzione({ azione: BUIO, bersaglio: null, schermata: s, politica, contesto: {} });

test('D 5b: decorated pay names as a link, a text or a field ask the payment card on a blind click', () => {
  const nomi = ['Paga ora →', 'Paga ora ›', 'Paga ora!', 'Pay $49.99', 'Paga 499,00 €', 'Acquista ora - 499,00 €', 'Jetzt bestellen', 'Checkout now', 'Buy with Google Pay', 'Prenota e paga', 'Paga in sicurezza'];
  const mancati = [];
  for (const nome of nomi) {
    for (const ruolo of ['collegamento', 'testo', 'campo']) {
      const v = buio(conElemento('Cuffie wireless - Negozio', el('x', ruolo, nome)));
      if (v.protezione !== 'pagamento') mancati.push(`${ruolo} «${nome}»`);
    }
  }
  assert.deepEqual(mancati, []);
});

test('D 5b: «Checkout» alone, and the names of every shop page that do not pay, still ask nothing (judge v1498, decision 375)', () => {
  for (const nome of ['Checkout', 'Checkout →', 'Vai alla cassa', 'PayPal', 'Metodi di pagamento', 'Come pagare', 'Carrello', 'Buy', 'Acquista', 'Paga in 3 rate senza interessi', 'Prezzo 49,99 €']) {
    for (const ruolo of ['collegamento', 'testo', 'campo']) assert.equal(buio(conElemento('Cuffie wireless - Negozio', el('x', ruolo, nome))).protezione, null, `${ruolo} «${nome}»`);
  }
});

// ------------------------------------------------ T (5c) «Cassa» in the title, both ways ------------------------------------------------
test('T 5c: «Cassa» counts only at the head of the title: «Registratore di cassa - Wikipedia», «Fondo cassa», «Libro cassa | Excel», «INPS - Cassa» are not checkouts', () => {
  const premi = (titolo, nome) => {
    const s = { frenoArmato: true, app: 'chrome', dominio: 'esempio.example', titolo, elementi: [el('t1', 'testo', 'Totale 499,00 €'), el('b', 'pulsante', nome)] };
    return valutaAzione({ azione: { tipo: 'clic', ref: 'b' }, bersaglio: s.elementi[1], schermata: s, politica: NORMALE, contesto: {} }).protezione;
  };
  assert.deepEqual(['Registratore di cassa - Wikipedia', 'Fondo cassa', 'Libro cassa | Excel', 'INPS - Cassa'].map((t) => premi(t, 'Cerca')), [null, null, null, null]);
  assert.deepEqual(['Cassa / Negozio', 'Cassa sicura - Negozio', 'Cassa (2 articoli) - Negozio', 'Cassa - Negozio', 'Vai alla cassa | Negozio'].map((t) => premi(t, 'Continua')),
    ['pagamento', 'pagamento', 'pagamento', 'pagamento', 'pagamento']);
});

// ------------------------------------------------ K (5d, 5h) tests for the mutants left alive ------------------------------------------------
test('K R-5: a button that pays on the page wins over an irreversible dialog: in Full access the blind click asks the payment card, never a deletion that goes', () => {
  const s = conElemento('Cuffie wireless - Negozio', el('x', 'pulsante', 'Paga ora'));
  s.elementi.push(el('w', 'finestra', 'Conferma', { modale: true }), el('wt', 'testo', 'Questa operazione non può essere annullata.', { finestra: 'w' }),
    el('w1', 'pulsante', 'Elimina', { finestra: 'w' }), el('w2', 'pulsante', 'Annulla', { finestra: 'w' }));
  for (const politica of [NORMALE, PIENO, SEMPRE]) assert.deepEqual([buio(s, politica).protezione, buio(s, politica).decisione], ['pagamento', 'chiedi'], politica.nome);
});

test('K R-3 R-6 R-7 X1: a hidden «Paga ora» asks nothing; a tab named «PayPal» asks nothing; a link «Paga» or «Pay» alone asks', () => {
  assert.equal(buio(conElemento('Cuffie wireless - Negozio', el('x', 'collegamento', 'Paga ora', { visibile: false }))).protezione, null, 'R-3 hidden');
  assert.equal(buio(conElemento('Cuffie wireless - Negozio', el('x', 'scheda', 'PayPal'))).protezione, null, 'R-6 a tab');
  for (const nome of ['Paga', 'Pay']) assert.equal(buio(conElemento('Cuffie wireless - Negozio', el('x', 'collegamento', nome))).protezione, 'pagamento', `R-7 «${nome}»`);
});

test('K DLG-3: «Paga ora» in a non-modal window with seven buttons asks the payment card in the third PC policy too, as a button and as a link', () => {
  const ignoto = 'Ez a művelet nem vonható vissza.';
  const scena = (ruolo) => [el('w', 'finestra', 'x', { modale: true }), el('wt0', 'testo', ignoto, { finestra: 'w' }), el('wb0', 'pulsante', 'Annulla', { finestra: 'w' }),
    el('p', 'finestra', 'App'), el('b9', ruolo, 'Paga ora', { finestra: 'p' }), ...Array.from({ length: 6 }, (_, k) => el(`a${k}`, 'pulsante', `Voce ${k}`, { finestra: 'p' }))];
  for (const ruolo of ['pulsante', 'collegamento']) {
    for (const politica of [NORMALE, PIENO, SEMPRE]) {
      const v = valutaAzione({ azione: { tipo: 'clic', x: 1, y: 1 }, bersaglio: null, schermata: { elementi: scena(ruolo) }, politica, contesto: { richiesta: { pagare: false } } });
      assert.equal(`${v.decisione}/${v.protezione}`, 'chiedi/pagamento', `${ruolo} ${politica.nome}`);
    }
  }
});

// ------------------------------------------------ C (5f, 5i, owner 17:12) the card of the PC ------------------------------------------------
function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const FINESTRA = { window_id: 101, pid: 4242, app_name: 'Outlook.exe', title: 'Posta - Outlook', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
const statoPosta = ({ a = null, cc = null }) => () => ({ window_title: FINESTRA.title, app_name: FINESTRA.app_name, window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [
    ...(a !== null ? [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'A', value: a, frame: { x: 10, y: 60, w: 1200, h: 30 } }] : []),
    ...(cc ? [{ element_index: 4, element_token: 't4', role: 'Edit', label: 'Cc', value: cc, frame: { x: 10, y: 100, w: 1200, h: 30 } }] : []),
    { element_index: 3, element_token: 't3', role: 'Document', label: 'Corpo del messaggio', frame: { x: 10, y: 180, w: 1200, h: 400 } },
    { element_index: 2, element_token: 't2', role: 'Button', label: 'Invia', frame: { x: 900, y: 600, w: 120, h: 40 } },
    { element_index: 6, element_token: 't6', role: 'Button', label: 'Pubblica adesso', frame: { x: 700, y: 600, w: 120, h: 40 } }] });
function aiutanteFinto(stato) {
  return {
    async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [FINESTRA] }, immagine: null, errore: null };
      if (nome === 'get_window_state') return { ok: true, dati: stato(), immagine: { base64: png(1280, 720).toString('base64'), mime: 'image/png' }, errore: null };
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
}
async function domandaDi(statoArgs, { lingua = 'en', azioni = [{ type: 'press', ref: 'e2' }] } = {}) {
  const domande = []; let n = 0;
  const risposte = [{ actions: azioni }, { done: { success: true } }];
  const sessione = {
    testoDellaPersona: 'Apri Outlook e manda il messaggio',
    chiediModello: async () => { const r = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(r), usage: null }; },
    chiediDomanda: async (q) => { domande.push(validaDomandeUtente(q)); return { status: 'answered', answers: Object.fromEntries(q.map((x) => [x.id, lingua === 'it' ? 'Consenti' : 'Allow'])) }; },
    emetti: () => {}, ...(lingua === 'it' ? { lingua: 'it' } : {}),
  };
  await creaOspiteComputerUse({ aiutante: aiutanteFinto(statoPosta(statoArgs)) })(NOME_COMPUTER_USE, { task: 'send the mail' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: 'scrittura-progetto', sessione });
  return domande[1][0];
}
const indirizzi = (n, forma = (k) => `persona${k}@esempio.it`) => Array.from({ length: n }, (_, k) => forma(k + 1));

test('C 5f: the card counts the WHOLE field, never what is left after a cut: 91 long addresses, 180, 300; «Rossi, Mario <m@…>» is one', async () => {
  const casi = [
    [indirizzi(91, (k) => `nome${k}.cognome${k}@azienda-esempio.com`), 91],
    [indirizzi(180), 180],
    [indirizzi(300), 300],
    [[...indirizzi(150), 'Rossi, Mario <mario.rossi@esempio.it>', '"Bianchi, Luca" <luca@esempio.it>'], 152],
  ];
  for (const [lista, n] of casi) {
    const q = await domandaDi({ a: lista.join('; ') });
    assert.match(q.question, new RegExp(`^TALOS is about to do a send or submit\\. ${n} recipients: this card does not show them all\\.`, 'u'), `${n}`);
    for (const x of lista) assert.ok(q.details.text.includes(x), `${n}: ${x} in the whole list`);
  }
});

test('C owner 17:12: a list the card cannot show whole: the true number, «not all shown», a button that opens the whole list, «Allow» waits for it (EN, IT)', async () => {
  const lista = indirizzi(150);
  const en = await domandaDi({ a: lista.join('; '), cc: 'capo@esempio.it' });
  assert.equal(en.question, 'TALOS is about to do a send or submit. 151 recipients: this card does not show them all. Open the whole list: you can allow only after opening it. Allow it?');
  assert.equal(en.details.label, 'Show all 151 recipients');
  assert.ok(en.details.text.startsWith('To: persona1@esempio.it; persona2@esempio.it;'), en.details.text.slice(0, 80));
  assert.ok(en.details.text.includes('Cc: capo@esempio.it'));
  assert.deepEqual(en.options.map((o) => [o.label, o.requiresDetails === true]), [['Allow', true], ["Don't allow", false], ['Stop', false]]);
  assert.ok(en.options.every((o) => o.preview === undefined));
  const it = await domandaDi({ a: lista.join('; '), cc: 'capo@esempio.it' }, { lingua: 'it' });
  assert.equal(it.question, 'TALOS sta per fare un invio. 151 destinatari: questa carta non li mostra tutti. Apri l\'elenco intero: puoi consentire solo dopo averlo aperto. Lo consenti?');
  assert.equal(it.details.label, 'Mostra tutti i 151 destinatari');
  assert.deepEqual(it.options.map((o) => [o.label, o.requiresDetails === true]), [['Consenti', true], ['Non consentire', false], ['Ferma', false]]);
  // a list that fits keeps the card as it was: no button, nothing waits
  const corta = await domandaDi({ a: indirizzi(3).join('; ') });
  assert.equal(corta.details, undefined);
  assert.ok(corta.options.every((o) => o.requiresDetails === undefined));
});

test('C 5i: the single question of a batch says each kind once; X2: «+3» on the screen is a shortened list', async () => {
  const lotto = await domandaDi({ a: M }, { azioni: [{ type: 'press', ref: 'e2' }, { type: 'press', ref: 'e6' }] });
  assert.equal(lotto.question, 'TALOS is about to do 2 sensitive actions on this screen (a send or submit ×2). To: marco@esempio.it. Allow them?');
  const it = await domandaDi({ a: M }, { lingua: 'it', azioni: [{ type: 'press', ref: 'e2' }, { type: 'press', ref: 'e6' }] });
  assert.equal(it.question, 'TALOS sta per fare 2 azioni delicate su questo schermo (un invio ×2). A: marco@esempio.it. Le consenti?');
  const piu = await domandaDi({ a: `${M} +3` });
  assert.equal(piu.question, 'TALOS is about to do a send or submit. To: marco@esempio.it +3. The screen does not show every recipient. Allow it?');
});

test('C contract: «details» and «requiresDetails» pass the question contract, and a «requiresDetails» with no «details» is refused', () => {
  const base = { id: 'computer_use', question: 'Allow it?', options: [{ label: 'Allow', description: 'x', requiresDetails: true }, { label: 'Stop', description: 'y' }] };
  const [q] = validaDomandeUtente([{ ...base, details: { label: 'Show all 3 recipients', text: 'To: a; b; c' } }]);
  assert.deepEqual([q.details, q.options[0].requiresDetails, q.options[1].requiresDetails], [{ label: 'Show all 3 recipients', text: 'To: a; b; c' }, true, undefined]);
  assert.throws(() => validaDomandeUtente([base]), /requiresDetails/u);
  const lunga = 'x'.repeat(150_000);
  assert.equal(validaDomandeUtente([{ ...base, details: { label: 'Show all', text: lunga } }])[0].details.text.length, 150_000);
});

// ------------------------------------------------ mutants left alive in the first count (G3c, G4) ------------------------------------------------
test('G3 mutant: an empty «A» field under a heading that names a person («Marco Rossi», a reply) is unreadable, never that heading', async () => {
  const p = porte({ risposte: fila([uno(PREMI)]), guarda: () => risposta({ a: '' }) });
  await eseguiCompito({ testoDellaPersona: 'manda la mail', politica: NORMALE, porte: p.porte });
  assert.deepEqual(carte(p)[0].destinatario, { campi: [], conversazione: null, accorciato: false });
});

test('G4 mutant: T1 decides on the fields: «A: Tutti i dipendenti» under the heading «Marco Rossi» asks; «Marco Rossi» twice (A and Cc) is covered', async () => {
  const conta = async (s) => {
    const p = porte({ risposte: fila([uno(PREMI)]), guarda: () => s, consenso: true });
    await eseguiCompito({ testoDellaPersona: 'manda la mail a Marco Rossi', politica: NORMALE, porte: p.porte });
    return [carte(p).length, p.eseguite.length];
  };
  assert.deepEqual(await conta(risposta({ a: 'Tutti i dipendenti' })), [1, 1], 'the heading alone never covers the fields');
  const dueVolte = risposta({ a: 'Marco Rossi' });
  dueVolte.elementi.splice(2, 0, el('cc', 'campo', 'Cc', { valore: 'Marco Rossi <marco.rossi@esempio.it>' }));
  assert.deepEqual(await conta(dueVolte), [0, 1], 'every entry is the person named in the words');
  assert.deepEqual(await conta(risposta({ a: 'Marco; Rossi' })), [1, 1], 'two people, «Marco» and «Rossi», are not «Marco Rossi» put together');
});

test('G1 mutant: the window shortcut is its «Invia» only: a yes to Alt+S never covers «Pubblica», nor the other way round', async () => {
  const ALT_S = { tipo: 'tasti', ref: 'a', combinazione: 'alt+s' };
  assert.deepEqual(await corsa(ALT_S, { tipo: 'premi', ref: 'pub' }), [2, 2]);
  assert.deepEqual(await corsa({ tipo: 'premi', ref: 'pub' }, ALT_S), [2, 2]);
  assert.deepEqual(await corsa(ALT_S, PREMI), [1, 2], 'Alt+S and «Invia» still share one yes');
});

// ------------------------------------------------ cure round after the reviewers A, B, C (judge v1544, v1553) ------------------------------------------------
/* B1 (reviewer B, RB-1): the yes was tied to the NAME of the button, so on a page with a mail and a chat, each with its own «Invia», one
   yes covered the other (1 card for 2 sends; the release asked 2). Now the yes is tied to the element: its role and name and its place
   among the elements with the same role and name. A redraw that renames the references keeps the same element, and the yes holds. Like
   Hermes, where every destination is authorised by itself (tools/send_message_tool.py:264-265). */
const doppia = () => ({ frenoArmato: true, app: 'chrome', dominio: 'lavoro.example', titolo: 'Lavoro', elementi: [el('h', 'intestazione', 'Nuovo messaggio'),
  el('a', 'campo', 'A', { valore: M }), el('m', 'campo', 'Corpo del messaggio', { valore: 'ciao' }), el('inv', 'pulsante', 'Invia'),
  el('chat', 'campo', 'Scrivi un messaggio', { valore: 'ciao a tutti' }), el('inv2', 'pulsante', 'Invia')] });
async function duePosti(prima, dopo, guarda = () => doppia(), frase = 'manda la mail a marco e rispondi in chat') {
  const p = porte({ risposte: fila([uno(prima), uno(dopo)]), guarda });
  await eseguiCompito({ testoDellaPersona: frase, politica: NORMALE, porte: p.porte });
  return [carte(p).length, p.eseguite.length];
}
test('B1: on a page with a mail and a chat, each «Invia» asks its own card: B1, B2, B3 (Ctrl+Enter in the mail), B4 (Alt+S), B5 (Enter on the chat button)', async () => {
  const esiti = {
    B1: await duePosti({ tipo: 'premi', ref: 'inv' }, { tipo: 'premi', ref: 'inv2' }),
    B2: await duePosti({ tipo: 'premi', ref: 'inv2' }, { tipo: 'premi', ref: 'inv' }),
    B3: await duePosti({ tipo: 'tasti', ref: 'm', combinazione: 'ctrl+enter' }, { tipo: 'premi', ref: 'inv2' }),
    B4: await duePosti({ tipo: 'tasti', combinazione: 'alt+s' }, { tipo: 'premi', ref: 'inv2' }),
    B4b: await duePosti({ tipo: 'tasti', combinazione: 'alt+s' }, { tipo: 'premi', ref: 'inv' }),
    B5: await duePosti({ tipo: 'premi', ref: 'inv' }, { tipo: 'tasti', ref: 'inv2', combinazione: 'enter' }),
  };
  // B4b: with two «Invia» on the screen the window shortcut is neither of them: it asks, and so does the button after it
  assert.deepEqual(esiti, { B1: [2, 2], B2: [2, 2], B3: [2, 2], B4: [2, 2], B4b: [2, 2], B5: [2, 2] });
});

test('B1: the SAME «Invia» after a redraw that renames every reference keeps its yes; the other one still asks', async () => {
  const ridisegnata = (p) => {
    const s = doppia();
    if (p.eseguite.length === 0) return s;
    return { ...s, elementi: s.elementi.map((e) => ({ ...e, ref: `n${e.ref}` })) };
  };
  assert.deepEqual(await duePosti({ tipo: 'premi', ref: 'inv' }, { tipo: 'premi', ref: 'ninv' }, ridisegnata), [1, 2], 'the mail «Invia» again');
  assert.deepEqual(await duePosti({ tipo: 'premi', ref: 'inv2' }, { tipo: 'premi', ref: 'ninv2' }, ridisegnata), [1, 2], 'the chat «Invia» again');
  assert.deepEqual(await duePosti({ tipo: 'premi', ref: 'inv' }, { tipo: 'premi', ref: 'ninv2' }, ridisegnata), [2, 2], 'the other one still asks');
  // one «Invia» on the screen: the window shortcut is that button, before and after a redraw
  const sola = (p) => { const s = pagina(); return p.eseguite.length === 0 ? s : { ...s, elementi: s.elementi.map((e) => ({ ...e, ref: `n${e.ref}` })) }; };
  const p = porte({ risposte: fila([uno({ tipo: 'tasti', ref: 'a', combinazione: 'alt+s' }), uno({ tipo: 'premi', ref: 'ninv' })]), guarda: sola });
  await eseguiCompito({ testoDellaPersona: 'manda la mail a marco', politica: NORMALE, porte: p.porte });
  assert.deepEqual([carte(p).length, p.eseguite.length], [1, 2], 'Alt+S then «Invia» after a redraw');
});

test('B1 RB-2 B-M2: Ctrl+Enter in two different chat fields asks two cards; the same chat field that moves down the screen keeps one yes', async () => {
  const due = () => ({ frenoArmato: true, app: 'chrome', dominio: 'chat.example', titolo: 'Chat', elementi: [el('h', 'intestazione', 'Chat del team'),
    el('c1', 'campo', 'Scrivi un messaggio', { valore: 'ok' }), el('c2', 'campo', 'Scrivi un messaggio', { valore: 'ok' })] });
  assert.deepEqual(await duePosti({ tipo: 'tasti', ref: 'c1', combinazione: 'ctrl+enter' }, { tipo: 'tasti', ref: 'c2', combinazione: 'ctrl+enter' }, due, 'rispondi in chat'), [2, 2]);
  // B7: a new message above moves the index of the same field at every send (cua-driver ties element_index to its snapshot)
  const sposta = (k) => ({ frenoArmato: true, app: 'chrome', dominio: 'chat.example', titolo: 'Chat', elementi: [el('h', 'intestazione', 'Luca'),
    ...Array.from({ length: k }, (_, i) => el(`e${i}`, 'testo', `messaggio ${i}`)), el(`e${k}`, 'campo', 'Scrivi un messaggio', { valore: 'ok' })] });
  const p = porte({ risposte: (q) => { const k = q.eseguite.length; return k < 4 ? uno({ tipo: 'tasti', ref: `e${3 + k}`, combinazione: 'ctrl+enter' }) : null; }, guarda: (q) => sposta(3 + q.eseguite.length) });
  await eseguiCompito({ testoDellaPersona: 'rispondi a Luca in chat quattro volte', politica: NORMALE, porte: p.porte });
  assert.deepEqual([carte(p).length, p.eseguite.length], [1, 4]);
});

/* P-1 (reviewer A, mutant alive): the Document under the point counts as a blind click only on a checkout (judge v1498, option A). Outside a
   checkout a click 5 px beside «Acquista ora» lands on the Document and asks nothing more (decision 375); on a checkout it asks. */
test('P-1: the Document beside «Acquista ora» asks nothing outside a checkout (decision 375) and asks the payment card on a checkout', async () => {
  const esiti = [];
  for (const titolo of ['Cuffie wireless - Negozio', 'Cassa - Negozio']) {
    for (const politica of [NORMALE, PIENO]) {
      const p = porte({ risposte: fila([uno({ tipo: 'clic', x: 795, y: 620 })]), guarda: () => negozio(titolo, 'Acquista ora'), bersaglio: bersaglioComeAttrezzo });
      await eseguiCompito({ testoDellaPersona: 'compra le cuffie', piano: { domini: ['negozio.example'], app: [] }, politica, porte: p.porte });
      esiti.push([titolo, politica.nome, carte(p).length, p.eseguite.length]);
    }
  }
  assert.deepEqual(esiti, [['Cuffie wireless - Negozio', NORMALE.nome, 0, 1], ['Cuffie wireless - Negozio', PIENO.nome, 0, 1], ['Cassa - Negozio', NORMALE.nome, 1, 1], ['Cassa - Negozio', PIENO.nome, 1, 1]]);
});

/* N5 (reviewer C, mutant alive): the preview of the card holds 20 lines, counted as the question contract counts them (the REAL lines,
   user-question-contract.mjs:96). The loop folds a field to one line and gives at most four paragraphs (A, Cc, Bcc, «shortened»), so the
   count never bound on a real screen and the mutant «22 lines» lived; the rule now sits in one function, held at 20 and at 2000 characters.
   A field that goes to a new line for every address is folded to one line, and its card passes the contract. */
test('N5: the preview takes the list only when the contract takes it: 20 real lines and 2000 characters, never 21 or 2001', async () => {
  const domanda = (anteprima) => validaDomandeUtente([{ id: 'computer_use', header: 'Computer', question: 'TALOS is about to do a send or submit.',
    options: [{ label: 'Allow', description: 'TALOS does this now.', preview: anteprima }, { label: 'Stop', description: 'TALOS stops.', preview: anteprima }] }]);
  const paragrafi = (n) => Array.from({ length: n }, (_, k) => `To: persona${k + 1}@esempio.it.`);
  assert.equal(anteprimaDeiDestinatari(paragrafi(10)).split('\n').length, 19);
  assert.equal(anteprimaDeiDestinatari(paragrafi(11)), null, '21 lines go behind the button');
  assert.equal(anteprimaDeiDestinatari([Array.from({ length: 20 }, (_, k) => `p${k}@esempio.it`).join('\n')]).split('\n').length, 20, 'twenty real lines fit');
  assert.equal(anteprimaDeiDestinatari([Array.from({ length: 21 }, (_, k) => `p${k}@esempio.it`).join('\n')]), null, 'twenty-one real lines do not');
  assert.equal(anteprimaDeiDestinatari(['x'.repeat(2000)]), 'x'.repeat(2000));
  assert.equal(anteprimaDeiDestinatari(['x'.repeat(2001)]), null);
  for (const ok of [anteprimaDeiDestinatari(paragrafi(10)), anteprimaDeiDestinatari([Array.from({ length: 20 }, (_, k) => `p${k}@esempio.it`).join('\n')])]) assert.doesNotThrow(() => domanda(ok));
  assert.throws(() => domanda(Array.from({ length: 21 }, (_, k) => `p${k}`).join('\n')), /21|lines/u, 'the contract refuses what the function refuses');
  // on the screen: a To field with an address per line is folded to one line; its card passes the contract (domandaDi validates it)
  const lunghi = (n) => indirizzi(n, (k) => `nome.cognome.numero${k}@azienda-esempio.it`).join('\n');
  const ventuno = await domandaDi({ a: lunghi(21) });
  assert.ok(ventuno.options.every((o) => typeof o.preview === 'string' && o.preview.split('\n').length === 1), 'one paragraph, one line');
  assert.ok(ventuno.options[0].preview.includes('nome.cognome.numero21@azienda\\-esempio.it'));
});

/* Mutants of the cure round (C4 and C10 alive on aef69f7c0): the place of the yes on a page with two «Invia», and for a click
   by coordinates on the second of two buttons with the same name. */
test('C4: with two «Invia» on the screen Ctrl+Enter in the mail body is neither of them: «Invia» of the mail after it asks again', async () => {
  assert.deepEqual(await duePosti({ tipo: 'tasti', ref: 'm', combinazione: 'ctrl+enter' }, { tipo: 'premi', ref: 'inv' }), [2, 2]);
});


test('C10: a click by coordinates on the second of two «Invia» keeps its yes for the same button, and the first one still asks', async () => {
  const conPosti = () => { const s = doppia(); const r = { inv: { x: 100, y: 300, w: 80, h: 30 }, inv2: { x: 100, y: 700, w: 80, h: 30 } };
    return { ...s, elementi: s.elementi.map((e) => (r[e.ref] ? { ...e, rettangolo: r[e.ref] } : e)) }; };
  const clic = (y) => ({ tipo: 'clic', x: 120, y });
  const corri = async (a, b) => {
    const p = porte({ risposte: fila([uno(a), uno(b)]), guarda: conPosti, bersaglio: bersaglioComeAttrezzo });
    await eseguiCompito({ testoDellaPersona: 'manda la mail a marco e rispondi in chat', politica: NORMALE, porte: p.porte });
    return [carte(p).length, p.eseguite.length];
  };
  assert.deepEqual(await corri(clic(710), clic(715)), [1, 2], 'the chat «Invia» twice');
  assert.deepEqual(await corri(clic(710), clic(310)), [2, 2], 'then the mail «Invia» asks');
});

// ------------------------------------------------ cure round after the second pass (judge v1570, v1571; reviewers B and C) ------------------------------------------------
/* B, second pass: a mail page with a «Pay» link in the menu. A click in the body of the mail (a container: it holds the signature), writing,
   a click in the frame of the compose window and «Invia» asked 3 cards in Normal (2 of payment) and 2 in Full access; before, 1 and 0.
   The «Pay» link is far from those clicks: they ask nothing, and the send asks its own card in Normal only. */
const r4 = (x, y, w, h) => ({ x, y, w, h });
const postaConMenu = (nomePay) => ({ frenoArmato: true, app: 'chrome', dominio: 'posta.example', titolo: 'Posta', elementi: [
  el('doc', 'campo', 'Posta', { rettangolo: r4(0, 0, 1600, 1000) }),
  ...(nomePay ? [el('pay', 'collegamento', nomePay, { rettangolo: r4(1400, 10, 60, 30) })] : []),
  el('h', 'intestazione', 'Nuovo messaggio', { rettangolo: r4(900, 300, 300, 30) }),
  el('fin', 'gruppo', 'Nuovo messaggio', { rettangolo: r4(900, 300, 650, 650) }),
  el('a', 'campo', 'A', { rettangolo: r4(910, 340, 600, 30), valore: M }),
  el('ogg', 'campo', 'Oggetto', { rettangolo: r4(910, 380, 600, 30), valore: 'riunione' }),
  el('corpo', 'campo', 'Corpo del messaggio', { rettangolo: r4(910, 420, 600, 400), valore: 'ciao' }),
  el('firma', 'collegamento', 'www.esempio.it', { rettangolo: r4(920, 780, 150, 20) }),
  el('inv', 'pulsante', 'Invia', { rettangolo: r4(910, 880, 90, 40) })] });
test('B second pass: a mail with «Pay» or «Paga» in the menu: clicks in the body and the compose frame ask nothing; the send asks 1 card in Normal, 0 in Full access', async () => {
  const compito = [{ tipo: 'clic', x: 1200, y: 500 }, { tipo: 'scrivi', ref: 'corpo', testo: 'ci vediamo alle 10' }, { tipo: 'clic', x: 1300, y: 860 }, { tipo: 'premi', ref: 'inv' }];
  const esiti = [];
  for (const nomePay of [null, 'Pay', 'Paga', 'PayPal']) {
    for (const politica of [NORMALE, PIENO]) {
      const p = porte({ risposte: fila(compito.map((a) => uno(a))), guarda: () => postaConMenu(nomePay), bersaglio: bersaglioComeAttrezzo });
      await eseguiCompito({ testoDellaPersona: 'scrivi a marco che ci vediamo alle 10 e mandala', politica, porte: p.porte });
      esiti.push(`${nomePay ?? '-'} ${politica.nome}: ${carte(p).map((q) => q.protezione).join(',') || '0'} (${p.eseguite.length}/4)`);
    }
  }
  assert.deepEqual(esiti, [`- ${NORMALE.nome}: invio (4/4)`, `- ${PIENO.nome}: 0 (4/4)`, `Pay ${NORMALE.nome}: invio (4/4)`, `Pay ${PIENO.nome}: 0 (4/4)`,
    `Paga ${NORMALE.nome}: invio (4/4)`, `Paga ${PIENO.nome}: 0 (4/4)`, `PayPal ${NORMALE.nome}: invio (4/4)`, `PayPal ${PIENO.nome}: 0 (4/4)`]);
  // five clicks in the body to fix the text: no payment card
  const p = porte({ risposte: fila(Array.from({ length: 5 }, (_, k) => uno({ tipo: 'clic', x: 1000 + 20 * k, y: 450 + 30 * k }))), guarda: () => postaConMenu('Pay'), bersaglio: bersaglioComeAttrezzo });
  await eseguiCompito({ testoDellaPersona: 'correggi la mail per marco', politica: NORMALE, porte: p.porte });
  assert.deepEqual([carte(p).filter((q) => q.protezione === 'pagamento').length, p.eseguite.length], [0, 5]);
});

/* B9b (reviewer B, judge v1571): two chat popups, each with its field; after the first send the used one goes to the bottom and the two
   swap places. The field of the second send then has the place the first one had (same role, same name, same position): 1 card for
   2 sends. The yes is now tied to the element AND to its own chat (the smallest named frame around it, «Anna» or «Bruno»): the field
   now in that place belongs to another chat, and asks. B9 with the buttons is the same case. */
const bolle = (scambiate) => {
  // the bar of the chats holds both popups (a larger named frame), and an unnamed row wraps the field and its button: the chat is the
  // SMALLEST NAMED frame; the Document (a field) never is
  const finestrella = (s, nome, x) => [el(`g${s}`, 'gruppo', nome, { rettangolo: r4(x, 400, 300, 500) }), el(`w${s}`, 'altro', '', { rettangolo: r4(x + 5, 835, 290, 50) }),
    el(`c${s}`, 'campo', 'Scrivi un messaggio', { valore: 'ok', rettangolo: r4(x + 10, 840, 220, 40) }), el(`i${s}`, 'pulsante', 'Invia', { rettangolo: r4(x + 240, 840, 50, 40) })];
  const a = finestrella('a', 'Anna', scambiate ? 500 : 100);
  const b = finestrella('b', 'Bruno', scambiate ? 100 : 500);
  return { frenoArmato: true, app: 'chrome', dominio: 'rete.example', titolo: 'Messaggi', elementi: [el('doc', 'campo', 'Messaggi', { rettangolo: r4(0, 0, 1600, 1000) }),
    el('barra', 'altro', 'Chat', { rettangolo: r4(50, 350, 900, 600) }), el('h', 'intestazione', 'Messaggi'), ...(scambiate ? [...b, ...a] : [...a, ...b])] };
};
test('B9b: two chat popups that swap places after the first send ask a card each, with Ctrl+Enter and with their buttons; the same chat twice asks once', async () => {
  const guarda = (q) => bolle(q.eseguite.length > 0);
  const due = async (prima, dopo) => {
    const p = porte({ risposte: fila([uno(prima), uno(dopo)]), guarda });
    await eseguiCompito({ testoDellaPersona: 'rispondi a tutti in chat', politica: NORMALE, porte: p.porte });
    return [carte(p).length, p.eseguite.length];
  };
  assert.deepEqual(await due({ tipo: 'tasti', ref: 'ca', combinazione: 'ctrl+enter' }, { tipo: 'tasti', ref: 'cb', combinazione: 'ctrl+enter' }), [2, 2], 'B9b');
  assert.deepEqual(await due({ tipo: 'premi', ref: 'ia' }, { tipo: 'premi', ref: 'ib' }), [2, 2], 'B9');
  assert.deepEqual(await due({ tipo: 'tasti', ref: 'ca', combinazione: 'ctrl+enter' }, { tipo: 'tasti', ref: 'ca', combinazione: 'ctrl+enter' }), [1, 2], 'the same chat, moved');
});

/* Reviewer C, second pass: the rule of mutant C9 pinned without a clock. Two sends that do not press «Invia» (an exit action, the
   same motive twice on the same page, to the same recipient) have no place (`dove` null on both sides): they share one yes, as
   before the place existed. Mutant `a !== null && a === b` asks 2 cards for 2. */
test('C9: two exit actions on the same page, to the same recipient, share one yes (no place on both sides); Full access asks none', async () => {
  const pagina = () => ({ frenoArmato: true, app: 'chrome', dominio: 'documenti.example', titolo: 'Documento', elementi: [
    el('a', 'campo', 'A', { valore: M }), el('u', 'pulsante', 'Condividi')] });
  const conta = async (politica) => {
    const p = porte({ risposte: fila([uno({ tipo: 'premi', ref: 'u', uscita: true }), uno({ tipo: 'premi', ref: 'u', uscita: true })]), guarda: pagina });
    await eseguiCompito({ testoDellaPersona: 'condividi il documento con marco', politica, porte: p.porte });
    return [carte(p).map((q) => `${q.protezione}`).join(','), p.eseguite.length];
  };
  assert.deepEqual(await conta(NORMALE), ['invio', 2]);
  assert.deepEqual(await conta(PIENO), ['', 2]);
});

/* The chat of a place is a VISIBLE named frame LARGER than the element, never the Document: the Document takes the title of the page
   («Messaggi (1)» after a message), a text with the very box of the field shows the draft, and a closed popup stays in the tree hidden.
   None of them changes the chat: the same field asks once for two sends. */
test('B9b: the chat is a visible named frame larger than the element, never the Document; the same field asks once for two sends', async () => {
  const solo = (k) => ({ frenoArmato: true, app: 'chrome', dominio: 'rete.example', titolo: 'Messaggi', elementi: [
    el('doc', 'campo', `Messaggi (${k})`, { rettangolo: r4(0, 0, 1600, 1000) }), el('h', 'intestazione', 'Anna'),
    el('ca', 'campo', 'Scrivi un messaggio', { valore: 'ok', rettangolo: r4(110, 840, 220, 40) })] });
  const conAnna = (k) => ({ frenoArmato: true, app: 'chrome', dominio: 'rete.example', titolo: 'Messaggi', elementi: [
    el('h', 'intestazione', 'Anna'), el('ga', 'gruppo', 'Anna', { rettangolo: r4(100, 400, 300, 500) }),
    ...(k === 0 ? [el('vecchia', 'gruppo', 'Bruno', { rettangolo: r4(105, 800, 250, 90), visibile: false })] : []),
    el('bozza', 'testo', `bozza ${k}`, { rettangolo: r4(110, 840, 220, 40) }),
    el('ca', 'campo', 'Scrivi un messaggio', { valore: 'ok', rettangolo: r4(110, 840, 220, 40) })] });
  const esiti = [];
  for (const schermo of [solo, conAnna]) {
    const p = porte({ risposte: fila([uno({ tipo: 'tasti', ref: 'ca', combinazione: 'ctrl+enter' }), uno({ tipo: 'tasti', ref: 'ca', combinazione: 'ctrl+enter' })]),
      guarda: (q) => schermo(q.eseguite.length) });
    await eseguiCompito({ testoDellaPersona: 'rispondi ad Anna in chat', politica: NORMALE, porte: p.porte });
    esiti.push([carte(p).length, p.eseguite.length]);
  }
  assert.deepEqual(esiti, [[1, 2], [1, 2]]);
});
