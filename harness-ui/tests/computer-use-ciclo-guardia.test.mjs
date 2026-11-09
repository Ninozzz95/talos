/*
 * La modalità guardia (decisione 145) agganciata al ciclo: la carta «Sto guardando» la apre il ciclo PRIMA di ogni azione su un sito
 * delicato, una azione per passo dentro la guardia, il resto del lotto fermo se lo schermo entra in un sito delicato a metà.
 * Porte finte come in computer-use-ciclo.test.mjs. Ogni prova guarda il verso sicuro: nessuna azione su un sito delicato senza il sì.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito, EVENTI } from '../src/computer-use/ciclo.mjs';
import { POLITICHE } from '../src/computer-use/protezioni.mjs';

const PIENO = POLITICHE.pcAccessoPieno;
const MIN = 60 * 1000;
const ELEMENTI = [{ ref: 'b1', ruolo: 'pulsante', nome: 'Avanti' }, { ref: 'b2', ruolo: 'pulsante', nome: 'Indietro' }];
const banca = (over = {}) => ({ frenoArmato: true, elementi: ELEMENTI, origine: 'https://www.unicredit.it', ...over });
const negozio = (over = {}) => ({ frenoArmato: true, elementi: ELEMENTI, origine: 'https://negozio.example', ...over });
const ACCESA = { accesa: true, aggiunti: [] };

function porte({ risposte = [], guarda = () => banca(), chiediPersona = () => 'si', passoMs = 10, ...altro } = {}) {
  let t = 1000; let k = 0;
  const eventi = []; const eseguite = []; const domande = []; const ordine = [];
  return {
    eventi, eseguite, domande, ordine,
    porte: {
      guarda: async () => guarda(eseguite.length),
      chiedi: async () => (k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }),
      agisci: async (azione, bersaglio) => { ordine.push('azione'); eseguite.push({ azione, bersaglio: bersaglio?.nome ?? null }); return { esito: 'confermata' }; },
      bersaglio: (azione, s) => s.elementi.find((e) => e.ref === azione.ref) ?? null,
      chiediPersona: async (q) => { ordine.push(`domanda:${q.motivo}`); domande.push(q); return chiediPersona(q); },
      emetti: (nome, dati) => eventi.push({ nome, dati }),
      adesso: () => { t += passoMs; return t; },
      ...altro,
    },
  };
}
const domandeGuardia = (p) => p.domande.filter((q) => q.motivo === 'guardia');
const eventiGuardia = (p) => p.eventi.filter((e) => e.nome === EVENTI.guardia).map((e) => e.dati);
const premi = (ref = 'b1') => ({ tipo: 'premi', ref });

test('GUARDIA-CICLO-01: spenta di serie (anche con valori che non sono true): nessuna carta, nessun evento, lotto intero', async () => {
  for (const guardia of [undefined, { accesa: false }, { accesa: 'true' }, { accesa: 1 }, null]) {
    const p = porte({ risposte: [{ azioni: [premi(), premi()] }] });
    const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte, ...(guardia === undefined ? {} : { guardia }) });
    assert.equal(r.esito, 'riuscito', JSON.stringify(guardia));
    assert.equal(domandeGuardia(p).length, 0);
    assert.equal(eventiGuardia(p).length, 0);
    assert.equal(p.eseguite.length, 2, 'spenta: il lotto resta di due azioni');
  }
});

test('GUARDIA-CICLO-02: accesa su un sito delicato, la carta viene PRIMA di qualunque azione, e dopo il sì si va', async () => {
  const p = porte({ risposte: [{ azioni: [premi()] }] });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito');
  assert.equal(p.ordine[0], 'domanda:guardia', 'la carta prima di tutto');
  // variante A (decisione 145): la carta dice che torna ogni 5 minuti di azioni
  assert.deepEqual(domandeGuardia(p)[0], { motivo: 'guardia', tipo: 'guardia', sito: 'unicredit.it', perche: 'ingresso', rinnovo: 'ogni-5-minuti-di-azioni' });
  assert.equal(p.eseguite.length, 1);
  assert.deepEqual(eventiGuardia(p).map((e) => [e.fase, e.motivo, e.sito]), [['chiedi', 'ingresso', 'unicredit.it'], ['si', 'ingresso', 'unicredit.it']]);
});

test('GUARDIA-CICLO-03: «Ferma», una risposta diversa da sì o una carta scaduta fermano senza azioni', async () => {
  for (const risposta of ['no', 'annulla', null, { si: true }, 'SI']) {
    const p = porte({ risposte: [{ azioni: [premi()] }], chiediPersona: () => risposta });
    const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
    assert.equal(r.esito, 'fermato', String(risposta)); assert.equal(r.motivo, 'pulsante-ferma');
    assert.equal(p.eseguite.length, 0);
  }
  const lenta = porte({ risposte: [{ azioni: [premi()] }], chiediPersona: () => new Promise(() => {}) });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: lenta.porte, guardia: ACCESA, limiti: { msAttesaPermesso: 20, msAnnullamento: 10 } });
  assert.equal(r.motivo, 'attesa-scaduta'); assert.equal(lenta.eseguite.length, 0);
});

test('GUARDIA-CICLO-04: senza la porta della persona la guardia ferma, non va avanti da sola', async () => {
  const p = porte({ risposte: [{ azioni: [premi()] }] });
  delete p.porte.chiediPersona;
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'guardia'); assert.equal(p.eseguite.length, 0);
});

test('GUARDIA-CICLO-05 (variante A): dentro la guardia il lotto si chiude dopo un\'azione che cambia qualcosa; il resto non parte', async () => {
  const p = porte({ risposte: [{ azioni: [premi(), premi('b2'), premi()] }, { fine: { riuscito: true } }] });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito');
  assert.equal(p.eseguite.length, 1);
  assert.equal(r.storia.filter((riga) => riga.includes('non-eseguita')).length, 2, r.storia.join(' | '));
  // fuori dalla guardia, con la guardia accesa, il lotto resta intero
  const fuori = porte({ risposte: [{ azioni: [premi(), premi()] }], guarda: () => negozio() });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: fuori.porte, guardia: ACCESA });
  assert.equal(fuori.eseguite.length, 2); assert.equal(domandeGuardia(fuori).length, 0);
});

test('GUARDIA-CICLO-06: dopo 5 minuti sul sito la carta torna, col motivo «tempo»', async () => {
  const p = porte({ risposte: Array(6).fill({ azioni: [premi()] }), passoMs: 40 * 1000 });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
  const perche = domandeGuardia(p).map((q) => q.perche);
  assert.equal(perche[0], 'ingresso');
  assert.ok(perche.includes('tempo'), JSON.stringify(perche));
});

test('GUARDIA-CICLO-07: a metà lotto lo schermo entra in una banca: il resto del lotto non parte, e la carta arriva prima della prossima', async () => {
  // prima azione sul negozio; da lì in poi lo schermo è la banca
  const p = porte({ risposte: [{ azioni: [premi(), premi('b2'), premi()] }, { azioni: [premi()] }], guarda: (fatte) => (fatte === 0 ? negozio() : banca()) });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito');
  const primaDomanda = p.ordine.indexOf('domanda:guardia');
  assert.equal(primaDomanda, 1, `una sola azione prima della carta: ${p.ordine.join(',')}`);
  assert.ok(r.storia.some((riga) => riga.includes('non-eseguita')));
});

test('GUARDIA-CICLO-08: schermo che resta spento: al più due carte di fila senza un\'azione, alla terza ci si ferma', async () => {
  // la persona dice sì cinque volte, poi «no»: senza il tetto delle carte la prova finisce lo stesso (con «pulsante-ferma»), non resta appesa
  let si = 0;
  const p = porte({ risposte: Array(10).fill({ azioni: [premi()] }), guarda: () => banca({ schermoSpento: true }), chiediPersona: () => (si++ < 5 ? 'si' : 'no') });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'guardia');
  assert.equal(p.eseguite.length, 0, 'schermo spento: nessuna azione');
  assert.equal(domandeGuardia(p).length, 2);
});

test('GUARDIA-CICLO-09: orologio rotto (la porta lancia o dà 0): il sì non si data, ci si ferma senza azioni', async () => {
  for (const adesso of [() => { throw new Error('orologio'); }, () => 0, () => NaN]) {
    const p = porte({ risposte: [{ azioni: [premi()] }], adesso });
    const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
    assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'guardia');
    assert.equal(p.eseguite.length, 0);
    assert.equal(domandeGuardia(p).length, 1, 'il sì che non si può datare ferma subito, senza una seconda carta');
  }
});

test('GUARDIA-CICLO-10: un sito aggiunto dalla persona entra; un suffisso pubblico aggiunto no', async () => {
  const p = porte({ risposte: [{ azioni: [premi()] }], guarda: () => negozio() });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: { accesa: true, aggiunti: ['negozio.example'] } });
  assert.equal(domandeGuardia(p).length, 1);
  assert.equal(domandeGuardia(p)[0].sito, 'negozio.example');
  const q = porte({ risposte: [{ azioni: [premi()] }], guarda: () => negozio({ origine: 'https://pagina.github.io' }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte, guardia: { accesa: true, aggiunti: ['github.io'] } });
  assert.equal(domandeGuardia(q).length, 0);
});

test('GUARDIA-CICLO-11: il tempo passato aspettando il modello conta: scaduti i 5 minuti, l\'azione già scelta non parte senza la carta', async () => {
  // il sì arriva sul posto alla prima azione; poi il modello impiega più di 5 minuti (orologio della porta) prima di rispondere
  let t = 1000; let lento = false;
  const p = porte({ risposte: [{ azioni: [premi()] }, { azioni: [premi()] }, { fine: { riuscito: true } }], adesso: () => { t += lento ? 6 * MIN : 10; return t; } });
  const chiediVero = p.porte.chiedi;
  p.porte.chiedi = async (...a) => { lento = true; const v = await chiediVero(...a); return v; };
  const chiediPersonaVera = p.porte.chiediPersona;
  p.porte.chiediPersona = async (q) => { lento = false; return chiediPersonaVera(q); };
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA, limiti: { millisecondi: 600 * MIN } });
  // il secondo `premi` arriva col tempo scaduto: prima di agire torna la carta, col motivo «tempo»
  assert.deepEqual(p.ordine, ['domanda:guardia', 'azione', 'domanda:guardia', 'azione']);
  assert.deepEqual(domandeGuardia(p).map((q) => q.perche), ['ingresso', 'tempo']);
});

test('GUARDIA-CICLO-12: uscire dal sito delicato e rientrare entro i 5 minuti nello stesso compito: il sì vale ancora (O2, owner 04/11)', async () => {
  // banca (sì, un'azione) → negozio (un'azione) → di nuovo banca: niente seconda carta (prima della O2 la carta tornava)
  const schermi = [banca(), negozio(), banca()];
  const p = porte({ risposte: [{ azioni: [premi()] }, { azioni: [premi()] }, { azioni: [premi()] }], guarda: (fatte) => schermi[Math.min(fatte, 2)] });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.deepEqual(domandeGuardia(p).map((q) => q.perche), ['ingresso'], p.ordine.join(','));
  assert.deepEqual(p.ordine.slice(0, 4), ['domanda:guardia', 'azione', 'azione', 'azione']);
});

test('GUARDIA-CICLO-13 (variante A): entrando a metà lotto in un sito delicato, l\'«Invia» porta UNA carta sola con la riga della guardia', async () => {
  // la seconda azione sulla banca è un «Invia» che chiede la conferma dell'invio: la riga della guardia entra in quella carta, prima dell'azione
  const ELEMENTI_INVIO = [...ELEMENTI, { ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }];
  // pcNormale: l'invio chiede (con pcAccessoPieno ferma, prima di qualunque carta)
  const p = porte({ risposte: [{ azioni: [premi(), premi('inv')] }, { fine: { riuscito: true } }],
    guarda: (fatte) => (fatte === 0 ? negozio({ elementi: ELEMENTI_INVIO }) : banca({ elementi: ELEMENTI_INVIO })) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: p.porte, guardia: ACCESA });
  assert.deepEqual(p.ordine, ['azione', 'domanda:conferma', 'azione'], p.ordine.join(','));
  const carta = p.domande.find((q) => q.motivo === 'conferma');
  assert.equal(carta.protezione, 'invio');
  assert.deepEqual(carta.guardia, { sito: 'unicredit.it', perche: 'ingresso', rinnovo: 'ogni-5-minuti-di-azioni' });
  // e senza la riga (risposta «no» alla carta unica) l'invio non parte
  const q = porte({ risposte: [{ azioni: [premi(), premi('inv')] }, { fine: { riuscito: true } }], chiediPersona: () => 'no',
    guarda: (fatte) => (fatte === 0 ? negozio({ elementi: ELEMENTI_INVIO }) : banca({ elementi: ELEMENTI_INVIO })) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: q.porte, guardia: ACCESA });
  assert.equal(q.eseguite.filter((e) => e.bersaglio === 'Invia').length, 0, q.ordine.join(','));
});

test('GUARDIA-CICLO-14: nell\'app di una banca (decisione 145 bis) la carta arriva prima di ogni azione e dice che è un\'app', async () => {
  const app = (over = {}) => ({ frenoArmato: true, elementi: ELEMENTI, app: 'com.unicredit', ...over });
  const p = porte({ risposte: [{ azioni: [premi(), premi('b2')] }], guarda: () => app() });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito');
  assert.equal(p.ordine[0], 'domanda:guardia');
  assert.deepEqual(domandeGuardia(p)[0], { motivo: 'guardia', tipo: 'guardia', sito: 'com.unicredit', perche: 'ingresso', rinnovo: 'ogni-5-minuti-di-azioni', genere: 'app' });
  // variante A: la carta arriva sul posto, prima dell'azione del passo 1 (non più in cima al giro, passo 0)
  assert.deepEqual(eventiGuardia(p)[0], { passo: 1, sito: 'com.unicredit', motivo: 'ingresso', fase: 'chiedi', genere: 'app' });
  assert.equal(p.eseguite.length, 1, 'dentro la guardia una azione per passo anche in un\'app');
});

test('GUARDIA-CICLO-15: un\'app aggiunta dalla persona entra nella guardia; un\'aggiunta malformata non toglie niente', async () => {
  const p = porte({ risposte: [{ azioni: [premi()] }], guarda: () => ({ frenoArmato: true, elementi: ELEMENTI, app: 'com.miabanca.app' }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: { accesa: true, aggiunti: [], appAggiunte: ['com.miabanca.app', 'Banca Fake'] } });
  assert.equal(domandeGuardia(p).length, 1);
  const q = porte({ risposte: [{ azioni: [premi()] }], guarda: () => ({ frenoArmato: true, elementi: ELEMENTI, app: 'com.unicredit' }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte, guardia: { accesa: true, aggiunti: [], appAggiunte: 'com.unicredit' } });
  assert.equal(domandeGuardia(q).length, 1, 'un valore che non è un elenco lascia l\'elenco di partenza intero');
});

test('GUARDIA-CICLO-16: Chrome sul sito della banca: la carta è quella del sito, invariata', async () => {
  const p = porte({ risposte: [{ azioni: [premi()] }], guarda: () => banca({ app: 'com.android.chrome' }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.deepEqual(domandeGuardia(p)[0], { motivo: 'guardia', tipo: 'guardia', sito: 'unicredit.it', perche: 'ingresso', rinnovo: 'ogni-5-minuti-di-azioni' });
});

// ---- cure della revisione Q del Desktop (04/11): D1, D2, D4, D5. Porte con l'orologio che salta quando lo si chiede.
const NORMALE = POLITICHE.pcNormale;
function porteConSalto(o = {}) {
  const orologio = { t: 1000, salto: 0 };
  const p = porte({ ...o, adesso: () => { orologio.t += 10 + orologio.salto; orologio.salto = 0; return orologio.t; } });
  const chiediPersonaVera = p.porte.chiediPersona;
  if (o.dopoLaPersona) p.porte.chiediPersona = async (q) => { const r = await chiediPersonaVera(q); o.dopoLaPersona(q, orologio); return r; };
  return { ...p, orologio };
}
const cassa = (over = {}) => ({ frenoArmato: true, titolo: 'Cassa - Negozio', dominio: 'negozio.example', elementi: [{ ref: 'r0', ruolo: 'testo', nome: 'Totale 30,00 €' },
  { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }, { ref: 'cc', ruolo: 'voce', nome: 'Visa •••• 4242' }, { ref: 'b1', ruolo: 'pulsante', nome: 'Avanti' }], ...over });
const pagati = (p) => p.eseguite.filter((e) => e.bersaglio === 'Paga ora').length;
// variante A: il sì si dà sul posto, alla prima azione che cambia qualcosa. Per far scadere un sì GIÀ dato, le prove D4-D5 cominciano
// con un «Avanti» (sì della guardia, nessuna protezione) e poi chiedono il pagamento o l'invio
const sommaSotto = (r) => r.conferme.reduce((a, c) => a + c.azioni.length, 0);
const TETTO = { testoDellaPersona: 'compra le cuffie, fino a 50 €', piano: { domini: ['negozio.example'], app: [] }, politica: NORMALE,
  guardia: { accesa: true, aggiunti: ['negozio.example'] }, limiti: { millisecondi: 60 * MIN } };
// la porta della riga «Posso» si legge a ogni valutazione: alla seconda dopo la risposta del modello (quella dell'azione, dopo il conto
// della domanda unica) l'orologio salta di 5 minuti, cioè fra il conto del tetto e l'azione
function saltaFraContoEAzione(p) {
  let valutazioni = -1;
  const chiediVero = p.porte.chiedi;
  p.porte.chiedi = async (...a) => { valutazioni = 0; return chiediVero(...a); };
  p.porte.richiestaAggiornata = () => { if (valutazioni >= 0 && ++valutazioni === 2) p.orologio.salto = 5 * MIN; return undefined; };
}

test('GUARDIA-CICLO-17 (D1): la pagina va da sola su un sito delicato mentre il modello pensa: la carta prima della prima azione', async () => {
  let rediretto = false;
  const p = porte({ risposte: [{ azioni: [premi()] }, { fine: { riuscito: true } }], guarda: () => (rediretto ? banca({ origine: 'https://www.paypal.com/checkoutnow' }) : negozio()) });
  const chiediVero = p.porte.chiedi;
  p.porte.chiedi = async (...a) => { const v = await chiediVero(...a); rediretto = true; return v; };
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(p.ordine[0], 'domanda:guardia', p.ordine.join(','));
  assert.equal(domandeGuardia(p)[0].sito, 'paypal.com');
});

test('GUARDIA-CICLO-18 (D2): una lettura senza indirizzo nella STESSA app resta dentro (una azione per passo); un\'altra app esce', async () => {
  const p = porte({ risposte: [{ azioni: [premi()] }, { azioni: [premi(), premi('b2'), premi()] }, { fine: { riuscito: true } }],
    guarda: (fatte) => (fatte === 0 ? banca({ app: 'Microsoft Edge' }) : { frenoArmato: true, elementi: ELEMENTI, app: 'Microsoft Edge' }) });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito');
  assert.equal(p.eseguite.length, 2, 'dentro la guardia UNA azione per passo');
  const q = porte({ risposte: [{ azioni: [premi()] }, { azioni: [premi(), premi('b2')] }, { fine: { riuscito: true } }],
    guarda: (fatte) => (fatte === 0 ? banca({ app: 'Microsoft Edge' }) : { frenoArmato: true, elementi: ELEMENTI, app: 'Blocco note' }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte, guardia: ACCESA });
  assert.equal(q.eseguite.length, 3, 'nel Blocco note si è fuori dalla guardia: lotto intero');
  assert.equal(domandeGuardia(q).length, 1);
});

test('GUARDIA-CICLO-19 (D4): i 5 minuti scadono mentre il modello sceglie il pagamento: niente spesa contata due volte, niente carta «sopra il tetto»', async () => {
  let n = 0;
  const p = porteConSalto({ risposte: [{ azioni: [premi('b1')] }, { azioni: [premi('paga')] }, { fine: { riuscito: true } }], guarda: () => cassa() });
  const chiediVero = p.porte.chiedi;
  p.porte.chiedi = async (...a) => { n += 1; if (n === 2) p.orologio.salto = 5 * MIN; return chiediVero(...a); };
  const r = await eseguiCompito({ ...TETTO, porte: p.porte });
  assert.deepEqual(p.ordine, ['domanda:guardia', 'azione', 'domanda:guardia', 'azione']);
  assert.deepEqual(domandeGuardia(p).map((q) => q.perche), ['ingresso', 'tempo']);
  assert.equal(pagati(p), 1);
  assert.equal(r.spese.length, pagati(p), JSON.stringify(r.spese));
  assert.equal(p.domande.filter((q) => q.motivo === 'conferma').length, 0, p.ordine.join(','));
});

test('GUARDIA-CICLO-20 (D4): scaduti DOPO il conto del tetto e prima dell\'azione: la carta sul posto, e col sì si paga una volta sola', async () => {
  const p = porteConSalto({ risposte: [{ azioni: [premi('b1')] }, { azioni: [premi('paga')] }, { fine: { riuscito: true } }], guarda: () => cassa() });
  saltaFraContoEAzione(p);
  const r = await eseguiCompito({ ...TETTO, porte: p.porte });
  assert.deepEqual(p.ordine, ['domanda:guardia', 'azione', 'domanda:guardia', 'azione'], 'la seconda carta arriva sul posto, poi si paga');
  assert.equal(pagati(p), 1);
  assert.equal(r.spese.length, 1);
  assert.deepEqual(domandeGuardia(p).map((q) => q.perche), ['ingresso', 'tempo']);
});

test('GUARDIA-CICLO-21 (D4): carta sul posto, ma dopo il sì il totale è cambiato: niente pagamento e la spesa contata si DISFA', async () => {
  let cambiato = false;
  const p = porteConSalto({ risposte: [{ azioni: [premi('b1')] }, { azioni: [premi('paga')] }, { fine: { riuscito: true } }],
    guarda: () => (cambiato ? cassa({ elementi: [{ ref: 'r0', ruolo: 'testo', nome: 'Totale 45,00 €' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }] }) : cassa()),
    dopoLaPersona: (q) => { if (q.motivo === 'guardia' && q.perche === 'tempo') cambiato = true; } });
  saltaFraContoEAzione(p);
  const r = await eseguiCompito({ ...TETTO, porte: p.porte });
  assert.deepEqual(domandeGuardia(p).map((q) => q.perche), ['ingresso', 'tempo'], p.ordine.join(','));
  assert.equal(pagati(p), 0, p.ordine.join(','));
  assert.deepEqual(r.spese, [], 'una spesa mai fatta non resta nel conto');
  assert.ok(r.storia.some((x) => /schermo-cambiato/u.test(x)), r.storia.join(' | '));
});

test('GUARDIA-CICLO-22 (D5): la carta dell\'invio risposta dopo i 5 minuti: la guardia chiede sul posto e l\'invio parte, segnato una volta', async () => {
  const el = [...ELEMENTI, { ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }];
  const p = porteConSalto({ risposte: [{ azioni: [premi()] }, { azioni: [premi('inv')] }, { fine: { riuscito: true } }], guarda: () => banca({ elementi: el }),
    dopoLaPersona: (q, orologio) => { if (q.motivo === 'conferma') orologio.salto = 6 * MIN; } });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: p.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
  assert.deepEqual(p.ordine, ['domanda:guardia', 'azione', 'domanda:conferma', 'domanda:guardia', 'azione']);
  assert.equal(p.domande.find((q) => q.motivo === 'conferma').guardia, undefined, 'col sì fresco la carta dell\'invio non porta la riga');
  assert.equal(r.decisioni.filter((d) => d.protezione === 'invio').length, 1);
  assert.equal(sommaSotto(r), 1);
  // senza un sì prima, la riga della guardia sta DENTRO la carta dell'invio: una domanda sola
  const q = porteConSalto({ risposte: [{ azioni: [premi('inv')] }, { fine: { riuscito: true } }], guarda: () => banca({ elementi: el }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: q.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
  assert.deepEqual(q.ordine, ['domanda:conferma', 'azione']);
  assert.equal(q.domande[0].guardia?.perche, 'ingresso');
});

test('GUARDIA-CICLO-23 (D5): carta sul posto, ma dopo il sì il pulsante non c\'è più: niente invio, e decisione e «sotto il sì» si disfano', async () => {
  const el = [...ELEMENTI, { ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }];
  let sparito = false;
  const p = porteConSalto({ risposte: [{ azioni: [premi()] }, { azioni: [premi('inv')] }, { fine: { riuscito: true } }], guarda: () => banca({ elementi: sparito ? ELEMENTI : el }),
    dopoLaPersona: (q, orologio) => { if (q.motivo === 'conferma') orologio.salto = 6 * MIN; if (q.motivo === 'guardia' && q.perche === 'tempo') sparito = true; } });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: p.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
  assert.deepEqual(domandeGuardia(p).map((q) => q.perche), ['ingresso', 'tempo'], p.ordine.join(','));
  assert.equal(p.eseguite.filter((e) => e.bersaglio === 'Invia').length, 0, p.ordine.join(','));
  assert.deepEqual([r.decisioni.length, sommaSotto(r), r.conferme.length], [0, 0, 0]);
});

test('GUARDIA-CICLO-24: la riga della storia per un\'app dice «app delicata»', async () => {
  const p = porte({ risposte: [{ azioni: [premi()] }], guarda: () => ({ frenoArmato: true, elementi: ELEMENTI, app: 'com.unicredit' }) });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.ok(r.storia.some((x) => x.includes('app delicata com.unicredit')), r.storia.join(' | '));
});

// ---- risposte dell'owner alla revisione Q (Desktop 13:57): D3, D6, D7, O1, O2, e l'elenco «di passaggio»
test('GUARDIA-CICLO-25 (D3): un riquadro di un sito delicato dentro un sito normale accende la guardia: carta prima, una azione per passo', async () => {
  const el = [...ELEMENTI, { ref: 'pp', ruolo: 'pulsante', nome: 'Accedi', origine: 'https://www.paypal.com' }];
  const p = porte({ risposte: [{ azioni: [premi('pp'), premi('pp')] }, { fine: { riuscito: true } }], guarda: () => negozio({ elementi: el }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.deepEqual(p.ordine.slice(0, 2), ['domanda:guardia', 'azione'], p.ordine.join(','));
  assert.equal(domandeGuardia(p)[0].sito, 'paypal.com');
  assert.equal(p.eseguite.length, 1, 'dentro la guardia del riquadro UNA azione per passo');
  // un elemento del sito normale accanto al riquadro: lotto intero, nessuna carta
  const q = porte({ risposte: [{ azioni: [premi('b1'), premi('b2')] }, { fine: { riuscito: true } }], guarda: () => negozio({ elementi: el }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte, guardia: ACCESA });
  assert.deepEqual([domandeGuardia(q).length, q.eseguite.length], [0, 2]);
});

test('GUARDIA-CICLO-26 (D6): una risposta a un\'altra carta DATA SULLO SCHERMO PILOTATO rinnova il sì; dal telefono (o senza la porta) no', async () => {
  const el = [...ELEMENTI, { ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }];
  const corsa = async (sulloSchermo) => {
    const p = porteConSalto({ risposte: [{ azioni: [premi()] }, { azioni: [premi('inv')] }, { fine: { riuscito: true } }], guarda: () => banca({ elementi: el }),
      dopoLaPersona: (q, orologio) => { if (q.motivo === 'conferma') orologio.salto = 4.5 * MIN; },
      ...(sulloSchermo === undefined ? {} : { rispostaSulloSchermo: () => sulloSchermo }) });
    let n = 0; const chiediVero = p.porte.chiedi;
    // variante A: il sì si dà sul posto alla prima azione; il minuto passa DOPO, mentre il modello sceglie l'invio
    p.porte.chiedi = async (...x) => { n += 1; if (n === 2) p.orologio.salto = MIN; return chiediVero(...x); };
    await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: p.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
    return p.ordine;
  };
  const schermo = await corsa(true);
  assert.deepEqual(schermo.slice(schermo.indexOf('domanda:conferma')), ['domanda:conferma', 'azione'], schermo.join(','));
  for (const dove of [false, undefined]) {
    const o = await corsa(dove);
    assert.deepEqual(o.slice(o.indexOf('domanda:conferma')), ['domanda:conferma', 'domanda:guardia', 'azione'], `${dove}: ${o.join(',')}`);
  }
});

test('GUARDIA-CICLO-27 (O1): dopo una pausa (schermo bloccato) la carta torna anche sul PC, come sul telefono', async () => {
  let k = 0;
  const p = porte({ risposte: [{ azioni: [premi()] }, { azioni: [premi()] }, { fine: { riuscito: true } }],
    guarda: (fatte) => (fatte === 1 && k++ === 0 ? banca({ pausa: 'schermo-bloccato' }) : banca()), attendiRipresa: async () => true });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(domandeGuardia(p).length, 2, p.ordine.join(','));
});

test('GUARDIA-CICLO-28 (variante A, riscritta): il sì è UNO per compito, anche attraverso la catena SPID (1 carta, non 2)', async () => {
  const pagine = [banca({ origine: 'https://www.inps.it' }), banca({ origine: 'https://posteid.poste.it' }), banca({ origine: 'https://www.inps.it' })];
  const p = porte({ risposte: [{ azioni: [premi()] }, { azioni: [premi()] }, { azioni: [premi()] }, { fine: { riuscito: true } }],
    guarda: (fatte) => pagine[Math.min(fatte, 2)] });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.deepEqual(domandeGuardia(p).map((q) => q.sito), ['inps.it'], p.ordine.join(','));
  assert.equal(p.eseguite.length, 3);
  // passati i 5 minuti, l'azione dopo chiede di nuovo, col motivo «tempo», sul sito dove si è
  const q = porteConSalto({ risposte: [{ azioni: [premi()] }, { azioni: [premi()] }, { azioni: [premi()] }, { fine: { riuscito: true } }],
    guarda: (fatte) => pagine[Math.min(fatte, 2)] });
  q.porte.agisci = async (azione, bersaglio) => {
    q.ordine.push('azione'); q.eseguite.push({ azione, bersaglio: bersaglio?.nome ?? null });
    if (q.eseguite.length === 2) q.orologio.salto = 5 * MIN;
    return { esito: 'confermata' };
  };
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
  assert.deepEqual(domandeGuardia(q).map((x) => [x.sito, x.perche]), [['inps.it', 'ingresso'], ['inps.it', 'tempo']], q.ordine.join(','));
});

test('GUARDIA-CICLO-29 (D7, variante A riscritta): una pagina di cassa (titolo + totale + Paga) entra nella guardia; leggere non chiede', async () => {
  // pcNormale: «Paga ora» chiede la conferma del pagamento; la riga della guardia (la cassa come sito) entra in QUELLA carta
  const corsa = async (guardia) => {
    const p = porte({ risposte: [{ azioni: [premi('r0')] }, { azioni: [premi('paga')] }, { fine: { riuscito: true } }], guarda: () => cassa({ titolo: 'Checkout - Negozio' }) });
    await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: p.porte, ...(guardia ? { guardia } : {}) });
    return p;
  };
  const p = await corsa(ACCESA);
  assert.deepEqual(p.ordine, ['azione', 'domanda:conferma', 'azione'], 'il testo del totale si legge senza carta; il pagamento chiede prima');
  const carta = p.domande.find((q) => q.motivo === 'conferma');
  assert.equal(carta.protezione, 'pagamento');
  assert.deepEqual(carta.guardia, { sito: 'negozio.example', perche: 'ingresso', rinnovo: 'ogni-5-minuti-di-azioni' }, 'una cassa è un sito, senza «genere»');
  // guardia spenta: la cassa da sola non porta la riga della guardia
  const q = await corsa(null);
  assert.deepEqual(q.ordine, ['azione', 'domanda:conferma', 'azione']);
  assert.equal(q.domande.find((x) => x.motivo === 'conferma').guardia, undefined);
  assert.equal(domandeGuardia(q).length, 0);
});

test('GUARDIA-CICLO-30 (passaggio): sulla banca col sì, davanti la finestra di TALOS si resta nella guardia; il Blocco note no', async () => {
  // passo 1 sulla banca, poi sempre la finestra di passaggio senza indirizzo; passo 2 chiede due azioni
  const corsa = async (app, guardia = ACCESA) => {
    const p = porte({ risposte: [{ azioni: [premi()] }, { azioni: [premi(), premi('b2')] }, { fine: { riuscito: true } }],
      guarda: (fatte) => (fatte === 0 ? banca({ app: 'Microsoft Edge' }) : { frenoArmato: true, elementi: ELEMENTI, app }) });
    await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia });
    return p;
  };
  const talos = await corsa('TALOS');
  assert.deepEqual([domandeGuardia(talos).length, talos.eseguite.length], [1, 2], `TALOS davanti: dentro, una azione per passo: ${talos.ordine.join(',')}`);
  const note = await corsa('Blocco note');
  assert.deepEqual([domandeGuardia(note).length, note.eseguite.length], [1, 3], `Blocco note: fuori, lotto intero: ${note.ordine.join(',')}`);
  // chi monta il ciclo aggiunge il suo nome (la tastiera attiva sul telefono, il processo di TALOS sul PC se diverso)
  const dev = await corsa('TalosDev', { ...ACCESA, passaggio: ['TalosDev'] });
  assert.deepEqual([domandeGuardia(dev).length, dev.eseguite.length], [1, 2], dev.ordine.join(','));
  assert.equal((await corsa('TalosDev')).eseguite.length, 3, 'senza aggiunta è un\'app diversa');
});
