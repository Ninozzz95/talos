/*
 * Giro di cure R2 del computer use (04/11/2026), dalla revisione avversaria delle cure R (REVISIONE-CURE-CU-R-2026-11-04.md) e dalle
 * decisioni dell'owner 169 (riempimento automatico fuori dai luoghi del compito in Accesso pieno: una carta) e 170 («Elimina» nudo in
 * una finestra di conferma anche con Consenti sempre e Normale; telefono di serie invariato). Ogni prova era rossa sul ramo
 * fix/cu-cure-revisione-r-2026-11-04 @ 1d4b66429, salvo quelle segnate «verso contrario» (verdi per costruzione, fissano ciò che non
 * deve cambiare) e quelle che uccidono un mutante vivo della revisione (rosse solo col mutante).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito } from '../src/computer-use/ciclo.mjs';
import { valutaAzione, POLITICHE } from '../src/computer-use/protezioni.mjs';
import { cambiaQualcosa } from '../src/computer-use/guardia.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

const PIENO = POLITICHE.pcAccessoPieno;
const SEMPRE = POLITICHE.pcConsentiSempre;
const NORMALE = POLITICHE.pcNormale;
const TEL = POLITICHE.telefono;
const TEL_PIENO = POLITICHE.telefonoAccessoPieno;
const ctx = (over = {}) => ({ richiesta: { pagare: false, inviare: false, cancellare: false }, sospetto: false, piano: { domini: [], app: [] }, ...over });
const vuota = { elementi: [], dominio: 'posta.example' };
const val = (azione, bersaglio, politica, contesto = ctx(), schermata = vuota) => valutaAzione({ azione, bersaglio, schermata, politica, contesto });
const INVIO = { tipo: 'tasti', combinazione: 'enter' };
const CLIC = { tipo: 'premi' };

function porte({ risposte = [], guarda, agisci = () => ({ esito: 'confermata', modo: 'sottofondo' }), chiediPersona = () => 'si', ...altro } = {}) {
  let t = 0; let k = 0;
  const eseguite = []; const domande = [];
  return { eseguite, domande, porte: {
    guarda: async () => guarda(),
    chiedi: async () => (k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }),
    agisci: async (azione, bersaglio) => { eseguite.push({ azione, bersaglio: bersaglio?.nome ?? null }); return agisci(azione, bersaglio); },
    bersaglio: (azione, s) => s.elementi.find((e) => e.ref === azione.ref) ?? null,
    chiediPersona: async (q) => { domande.push(q); return chiediPersona(q); },
    emetti: () => {}, adesso: () => { t += 10; return t; }, ...altro,
  } };
}

// ---------- N3: campi di commento e di recensione ----------
test('R2-01 (N3): Invio o un a capo in fondo in un campo di commento o di recensione pubblica: invio (Pieno col sospetto: ferma)', () => {
  const fuori = [];
  for (const nome of ['Scrivi un commento', 'Add a comment…', 'Write a comment', 'Commenta', 'Leave a review', 'Lascia una recensione']) {
    const campo = { ruolo: 'campo', nome };
    for (const azione of [INVIO, { tipo: 'scrivi', testo: 'Bellissimo!\n' }]) {
      const s = val(azione, campo, SEMPRE);
      const p = val(azione, campo, PIENO, ctx({ sospetto: true }));
      if (s.protezione !== 'invio' || s.decisione !== 'chiedi' || p.decisione !== 'ferma') fuori.push(`${nome} ${azione.tipo}: ${s.protezione}/${s.decisione}, Pieno+sospetto ${p.decisione}`);
    }
  }
  assert.deepEqual(fuori, []);
});
test('R2-01b (N3, verso contrario): corpo, nota e descrizione vanno a capo; scrivere senza a capo in un commento non è un invio', () => {
  for (const nome of ['Corpo del messaggio', 'Descrizione', 'Note']) assert.equal(val(INVIO, { ruolo: 'campo', nome }, SEMPRE).protezione, null, nome);
  assert.equal(val({ tipo: 'scrivi', testo: 'Bellissimo' }, { ruolo: 'campo', nome: 'Scrivi un commento' }, SEMPRE).protezione, null);
});

// ---------- N1 e N9: Invio su ciò che si preme = il clic ----------
test('R2-02 (N1, N9): Invio su un pulsante, un link, una voce o una scheda dice la stessa cosa del clic', () => {
  const diversi = [];
  for (const [ruolo, nome] of [['pulsante', 'Elimina messaggio'], ['collegamento', 'Rispondi'], ['collegamento', 'Reply'], ['collegamento', 'Commenti'],
    ['voce', 'Chat con Mario'], ['scheda', 'Messaggi'], ['scheda', 'Commenti'], ['pulsante', 'Review order'], ['collegamento', 'Send e-mail'], ['pulsante', 'Invia']]) {
    const clic = val(CLIC, { ruolo, nome }, SEMPRE);
    const invio = val(INVIO, { ruolo, nome }, SEMPRE);
    if (clic.protezione !== invio.protezione || clic.decisione !== invio.decisione) diversi.push(`${ruolo} «${nome}»: clic ${clic.protezione}/${clic.decisione}, Invio ${invio.protezione}/${invio.decisione}`);
  }
  assert.deepEqual(diversi, []);
});
test('R2-02b (N1, verso contrario): in un campo di chat Invio resta un invio; col sospetto in Pieno ferma', () => {
  assert.equal(val(INVIO, { ruolo: 'campo', nome: 'Scrivi un messaggio' }, SEMPRE).protezione, 'invio');
  assert.equal(val(INVIO, { ruolo: 'altro', nome: 'Type a message' }, SEMPRE).protezione, 'invio'); // ruolo che l'ospite non conosce: resta campo
  assert.equal(val(INVIO, { ruolo: 'campo', nome: 'Scrivi un messaggio' }, PIENO, ctx({ sospetto: true })).decisione, 'ferma');
});

// ---------- decisione 169: riempimento automatico in Accesso pieno ----------
test('R2-03 (decisione 169): Accesso pieno, riempimento automatico fuori dai luoghi del compito ⇒ chiedi; dentro ⇒ passa e si segna', () => {
  const visa = { ruolo: 'voce', nome: 'Visa •••• 4242' };
  const pw = { ruolo: 'voce', nome: 'mario.rossi ••••••••' };
  const civetta = { elementi: [visa, pw], dominio: 'offerte-treni.example' };
  const treni = { elementi: [visa, pw], dominio: 'www.trenitalia.com' };
  const nelPiano = ctx({ piano: { domini: ['trenitalia.com'], app: [] } });
  const righe = [];
  for (const b of [visa, pw]) {
    righe.push([b.nome, 'fuori', val(CLIC, b, PIENO, nelPiano, civetta).decisione]);
    righe.push([b.nome, 'dentro', val(CLIC, b, PIENO, nelPiano, treni).decisione]);
    righe.push([b.nome, 'dentro+sospetto', val(CLIC, b, PIENO, { ...nelPiano, sospetto: true }, treni).decisione]);
    righe.push([b.nome, 'fuori+sospetto', val(CLIC, b, PIENO, { ...nelPiano, sospetto: true }, civetta).decisione]);
  }
  assert.deepEqual(righe.map((r) => r[2]), ['chiedi', 'procedi-e-segna', 'ferma', 'ferma', 'chiedi', 'procedi-e-segna', 'ferma', 'ferma'], JSON.stringify(righe));
  // i luoghi del compito sono anche le app del piano (una finestra senza dominio)
  const app = { elementi: [visa], dominio: '', app: 'Portafoglio' };
  assert.equal(val(CLIC, visa, PIENO, ctx({ piano: { domini: [], app: ['Portafoglio'] } }), app).decisione, 'procedi-e-segna');
  assert.equal(val(CLIC, visa, PIENO, ctx({ piano: { domini: [], app: ['Altra'] } }), app).decisione, 'chiedi');
});
test('R2-03b (decisione 169, verso contrario): il telefono e le altre modalità del PC non cambiano; il segreto del portachiavi resta senza carta', () => {
  const visa = { ruolo: 'voce', nome: 'Visa •••• 4242' };
  const civetta = { elementi: [visa], dominio: 'offerte-treni.example' };
  assert.equal(val(CLIC, visa, TEL_PIENO, ctx(), civetta).decisione, 'ferma');
  assert.equal(val(CLIC, visa, TEL, ctx(), civetta).decisione, 'ferma');
  assert.equal(val(CLIC, visa, SEMPRE, ctx(), civetta).decisione, 'chiedi');
  assert.equal(val(CLIC, visa, NORMALE, ctx(), civetta).decisione, 'chiedi');
  const pw = { ruolo: 'campo', nome: 'Password', segnali: { isPassword: true } };
  assert.equal(val({ tipo: 'scrivi', testo: '{{segreto:sito}}' }, pw, PIENO, ctx(), civetta).decisione, 'procedi-e-segna');
  // N8: Invio in un campo password già riempito non scrive un segreto: in Pieno passa e si segna (scelta 3 dell'autore)
  assert.equal(val(INVIO, pw, PIENO, ctx(), civetta).decisione, 'procedi-e-segna');
  assert.equal(val(INVIO, pw, PIENO, ctx({ sospetto: true }), civetta).decisione, 'ferma');
});

// ---------- decisione 170: «Elimina» nudo in una finestra di conferma ----------
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });
const finestra = (titolo, testo, pulsanti, ruoloPulsanti = 'pulsante') => ({ frenoArmato: true, dominio: '', elementi: [el('w', 'finestra', titolo, { modale: true }),
  el('t', 'testo', testo, { finestra: 'w' }), ...pulsanti.map((p, i) => el(`b${i}`, ruoloPulsanti, p, { finestra: 'w' }))] });
// le sette schermate del conto del Computer use (CONTO-ELIMINA-NUDO-2026-11-04, strumenti/elimina-nudo/schermate-elimina.mjs)
const SCHERMATE = {
  A: [finestra('Eliminare il messaggio?', 'Eliminare il messaggio?', ['Elimina per tutti', 'Elimina per me', 'Annulla']), 'Elimina per tutti'],
  B: [finestra('Eliminare 1 file?', 'Eliminare 1 file?', ['Annulla', 'Elimina']), 'Elimina'],
  C: [finestra('Eliminare questo evento?', 'Eliminare questo evento?', ['Annulla', 'Elimina']), 'Elimina'],
  D: [finestra('Eliminare il messaggio?', 'Il messaggio verrà spostato in Posta eliminata.', ['Elimina', 'Annulla']), 'Elimina'],
  E: [{ frenoArmato: true, dominio: 'mail.example', elementi: [el('b0', 'pulsante', 'Elimina'), el('m', 'voce', 'Riunione giovedì')] }, 'Elimina'],
  F: [finestra('Spostare nel cestino?', 'Gli elementi restano nel cestino per 60 giorni.', ['Annulla', 'Sposta nel cestino']), 'Sposta nel cestino'],
  G: [finestra('Elimina file', 'Spostare questo file nel Cestino?', ['Sì', 'No']), 'Sì'],
};
const POL = { Normale: NORMALE, 'Consenti sempre': SEMPRE, 'Accesso pieno': PIENO, Telefono: TEL, 'Telefono accesso pieno': TEL_PIENO };
function decisioneSu(sch, nome, politica, chiesta, azione = CLIC) {
  const b = sch.elementi.find((e) => e.nome === nome);
  return valutaAzione({ azione: { ...azione, ref: b.ref }, bersaglio: b, schermata: sch, politica, contesto: { richiesta: { cancellare: chiesta } } });
}
test('R2-04 (decisione 170): le sette schermate, cinque permessi, cancellazione chiesta e non chiesta', () => {
  // [chiesta, non chiesta] per permesso: B, C, D cambiano; A era già presa dal nome; E (senza finestra), F, G non cambiano; Telefono di serie invariato
  const atteso = {
    A: { Normale: ['chiedi', 'chiedi'], 'Consenti sempre': ['procedi', 'chiedi'], 'Accesso pieno': ['procedi-e-segna', 'procedi-e-segna'], Telefono: ['ferma', 'ferma'], 'Telefono accesso pieno': ['procedi-e-segna', 'procedi-e-segna'] },
    B: { Normale: ['chiedi', 'chiedi'], 'Consenti sempre': ['procedi', 'chiedi'], 'Accesso pieno': ['procedi-e-segna', 'procedi-e-segna'], Telefono: ['procedi', 'procedi'], 'Telefono accesso pieno': ['procedi-e-segna', 'procedi-e-segna'] },
  };
  atteso.C = atteso.B; atteso.D = atteso.B;
  const nessuna = Object.fromEntries(Object.keys(POL).map((k) => [k, ['procedi', 'procedi']]));
  atteso.E = nessuna; atteso.F = nessuna; atteso.G = nessuna;
  const sbagliati = [];
  for (const [k, [sch, nome]] of Object.entries(SCHERMATE)) {
    for (const [np, p] of Object.entries(POL)) {
      const got = [decisioneSu(sch, nome, p, true).decisione, decisioneSu(sch, nome, p, false).decisione];
      if (got.join() !== atteso[k][np].join()) sbagliati.push(`${k} ${np}: ${got.join('/')} invece di ${atteso[k][np].join('/')}`);
    }
  }
  assert.deepEqual(sbagliati, []);
});
test('R2-05 (decisione 170): nudo anche con segni ai bordi, con «Sì,» davanti, a link e con Invio sul pulsante; telefono di serie invariato', () => {
  const fuori = [];
  for (const nome of ['Elimina…', '🗑 Elimina', 'Sì, elimina', 'Yes, delete', 'Delete', 'Rimuovi', 'Remove', 'Löschen']) {
    const sch = finestra('Eliminare 1 file?', 'Eliminare 1 file?', ['Annulla', nome]);
    const r = decisioneSu(sch, nome, SEMPRE, false);
    if (r.protezione !== 'cancellazione' || r.decisione !== 'chiedi') fuori.push(`${nome}: ${r.protezione}/${r.decisione}`);
    const t = decisioneSu(sch, nome, SEMPRE, false, INVIO);
    if (t.protezione !== 'cancellazione') fuori.push(`${nome} con Invio: ${t.protezione}`);
    if (decisioneSu(sch, nome, TEL, false).protezione !== null) fuori.push(`${nome}: il telefono di serie è cambiato`);
  }
  const link = finestra('Eliminare 1 file?', 'Eliminare 1 file?', ['Annulla', 'Elimina'], 'collegamento');
  const r = decisioneSu(link, 'Elimina', SEMPRE, false);
  if (r.protezione !== 'cancellazione') fuori.push(`link Elimina: ${r.protezione}`);
  assert.deepEqual(fuori, []);
});
test('R2-05b (decisione 170, verso contrario): uscire, un nome che non è nudo, una finestra non modale e una politica senza la regola non cambiano', () => {
  const sch = finestra('Eliminare 1 file?', 'Eliminare 1 file?', ['Annulla', 'Elimina file', 'Elimina']);
  assert.equal(decisioneSu(sch, 'Annulla', SEMPRE, false).protezione, null);
  assert.equal(decisioneSu(sch, 'Elimina file', SEMPRE, false).protezione, null); // fuori dalla decisione: resta aperto nel rapporto
  const nonModale = { ...sch, elementi: sch.elementi.map((e) => (e.ruolo === 'finestra' ? { ...e, modale: false } : e)) };
  assert.equal(decisioneSu(nonModale, 'Elimina', SEMPRE, false).protezione, null);
  const senzaRegola = { ...PIENO, eliminaNudoInFinestra: undefined };
  assert.equal(decisioneSu(sch, 'Elimina', senzaRegola, false).protezione, null);
  assert.equal(TEL.eliminaNudoInFinestra, false);
});

// ---------- compito 7: la domanda unica col totale illeggibile ----------
const cassaSenzaTotale = (conTotale) => ({ frenoArmato: true, titolo: 'Checkout - Treni', dominio: 'treni.example', origine: 'https://treni.example', elementi: [
  { ref: 'p', ruolo: 'testo', nome: 'Roma - Milano 45,00 €' }, ...(conTotale ? [{ ref: 't', ruolo: 'testo', nome: 'Totale 45,00 €' }] : []),
  { ref: 'inv', ruolo: 'pulsante', nome: 'Invia ordine al venditore' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Acquista' }] });
test('R2-06 (compito 7): col totale illeggibile sulla stessa pagina immutata il sì della domanda unica vale: una carta, non tre', async () => {
  const p = porte({ guarda: () => cassaSenzaTotale(false), risposte: [{ azioni: [{ tipo: 'premi', ref: 'inv' }, { tipo: 'premi', ref: 'paga' }] }] });
  await eseguiCompito({ testoDellaPersona: 'compra il biglietto', piano: { domini: ['treni.example'], app: [] }, politica: SEMPRE, porte: p.porte });
  assert.deepEqual(p.domande.map((q) => q.motivo), ['conferme'], JSON.stringify(p.domande));
  assert.deepEqual(p.eseguite.map((e) => e.bersaglio), ['Invia ordine al venditore', 'Acquista']);
});
test('R2-06b (compito 7, verso contrario): un totale che compare fra la domanda e il clic fa decadere il sì', async () => {
  let risposto = false;
  const p = porte({ guarda: () => cassaSenzaTotale(risposto), risposte: [{ azioni: [{ tipo: 'premi', ref: 'inv' }, { tipo: 'premi', ref: 'paga' }] }],
    chiediPersona: (q) => { if (q.motivo === 'conferme') risposto = true; return 'si'; } });
  await eseguiCompito({ testoDellaPersona: 'compra il biglietto', piano: { domini: ['treni.example'], app: [] }, politica: SEMPRE, porte: p.porte });
  assert.equal(p.domande[0].motivo, 'conferme');
  assert.ok(p.domande.length >= 2 && p.domande.slice(1).every((q) => q.motivo === 'conferma'), JSON.stringify(p.domande.map((q) => q.motivo)));
});

// ---------- mutanti vivi della revisione ----------
test('R2-07 (mutante C05): la carta della guardia che non si può mostrare chiude con «domanda non mostrata», non come uno Stop', async () => {
  const banca = { frenoArmato: true, origine: 'https://www.unicredit.it', elementi: [{ ref: 'b1', ruolo: 'pulsante', nome: 'Avanti' }, { ref: 't1', ruolo: 'testo', nome: 'Saldo disponibile' }] };
  const p = porte({ guarda: () => banca, risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }], chiediPersona: () => { throw new Error('carta rotta'); } });
  const r = await eseguiCompito({ testoDellaPersona: 'guarda il saldo', politica: PIENO, porte: p.porte, guardia: { accesa: true, aggiunti: [] } });
  assert.deepEqual([r.esito, r.motivo], ['fermato', 'domanda-non-mostrata'], r.storia?.join(' | '));
  assert.equal(p.eseguite.length, 0);
});
test('R2-08 (mutante C06): la carta S-5 che non si può mostrare chiude con «domanda non mostrata»', async () => {
  const pagina = { frenoArmato: true, dominio: 'posta.example', elementi: [{ ref: 'b', ruolo: 'pulsante', nome: 'Sendж' }] };
  const p = porte({ guarda: () => pagina, risposte: [{ azioni: [{ tipo: 'premi', ref: 'b' }] }], chiediPersona: () => { throw new Error('carta rotta'); } });
  const r = await eseguiCompito({ testoDellaPersona: 'apri la posta', piano: { domini: ['posta.example'], app: [] }, politica: SEMPRE, porte: p.porte });
  assert.deepEqual([r.esito, r.motivo], ['fermato', 'domanda-non-mostrata'], r.storia?.join(' | '));
  assert.equal(p.eseguite.length, 0);
});
test('R2-09 (mutante C07): sul telefono in Accesso pieno il sì alla carta della guardia su una cassa non diventa un sì al pagamento', async () => {
  const cassa = { frenoArmato: true, titolo: 'Checkout - Negozio', dominio: 'negozio.example', origine: 'https://negozio.example/cassa', app: 'com.negozio.app',
    elementi: [{ ref: 'r0', ruolo: 'testo', nome: 'Totale 30,00 €' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }, { ref: 'cp', ruolo: 'campo', nome: 'Codice sconto' }] };
  const p = porte({ guarda: () => cassa, risposte: [{ azioni: [{ tipo: 'scrivi', ref: 'cp', testo: 'BENVENUTO' }] }, { azioni: [{ tipo: 'premi', ref: 'paga' }] }] });
  const r = await eseguiCompito({ testoDellaPersona: 'compra le cuffie', piano: { domini: ['negozio.example'], app: [] }, politica: TEL_PIENO, porte: p.porte,
    guardia: { accesa: true, aggiunti: ['negozio.example'], appAggiunte: ['com.negozio.app'] } });
  assert.ok(p.domande.some((q) => q.motivo === 'guardia'), JSON.stringify(p.domande.map((q) => q.motivo)));
  assert.deepEqual(r.conferme.filter((e) => e.protezione === 'pagamento'), [], JSON.stringify(r.conferme));
  assert.equal(p.eseguite.filter((e) => e.bersaglio === 'Paga ora').length, 0);
});
test('R2-10 (mutante G02): sul telefono in Accesso pieno toccare un testo cambia qualcosa per la guardia, come sul telefono di serie', () => {
  for (const politica of [TEL, TEL_PIENO]) assert.equal(cambiaQualcosa({ tipo: 'premi' }, { ruolo: 'testo' }, { protezione: null }, politica, null), true, politica.nome);
  assert.equal(cambiaQualcosa({ tipo: 'premi' }, { ruolo: 'testo' }, { protezione: null }, PIENO, null), false);
});

// ---------- ospite del PC (attrezzo): A04, A05 ----------
function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const FINESTRA = { window_id: 101, pid: 4242, app_name: 'Notepad.exe', title: 'Chat', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };
const statoChat = () => ({ window_title: 'Chat', app_name: 'Notepad.exe', window_bounds: FINESTRA.bounds, screenshot_width: 1280, screenshot_height: 720,
  elements: [{ element_index: 1, element_token: 't1', role: 'Edit', label: 'Messaggio', frame: { x: 10, y: 60, w: 400, h: 30 } }] });
function aiutanteFinto() {
  const azioni = [];
  return {
    azioni,
    async apri() { return { ok: true }; },
    compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [FINESTRA] }, immagine: null, errore: null };
      if (nome === 'get_window_state') return { ok: true, dati: statoChat(), immagine: { base64: png(1280, 720).toString('base64'), mime: 'image/png' }, errore: null };
      azioni.push({ nome, argomenti });
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
}
function sessione({ testoDellaPersona, risposte }) {
  const domande = []; let n = 0;
  return { domande, valore: {
    testoDellaPersona,
    chiediModello: async () => { const r = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(r), usage: null }; },
    chiediDomanda: async (q) => { validaDomandeUtente(q); domande.push(q); return { status: 'answered', answers: Object.fromEntries(q.map((x) => [x.id, 'Allow'])) }; },
    emetti: () => {},
  } };
}
const esegui = (ospite, s, livello) =>
  ospite(NOME_COMPUTER_USE, { task: 'move the cursor' }, { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione: s.valore });
test('R2-11 (mutante A04): «arrowright» arriva come la freccia a destra, non si scarta', async () => {
  const aiutante = aiutanteFinto();
  const s = sessione({ testoDellaPersona: 'Sposta il cursore nel campo Messaggio', risposte: [{ actions: [{ type: 'keys', ref: 'e1', keys: 'arrowright' }] }, { done: { success: true } }] });
  await esegui(creaOspiteComputerUse({ aiutante }), s, 'accesso-pieno');
  const tasti = aiutante.azioni.filter((a) => a.nome === 'press_key' || a.nome === 'hotkey').map((a) => a.argomenti.key ?? a.argomenti.keys?.at(-1));
  assert.deepEqual(tasti, ['right'], JSON.stringify(aiutante.azioni));
});

// ---------- mutanti vivi del giro R2 (copia git archive di 1e60a46fe): N03, N04, N07, L03, L06 ----------
test('R2-12 (N1, mutanti N03, N04, N07): verbo in fondo fino a quattro parole; oltre è navigazione; il trattino tiene unita la parola', () => {
  const link = (nome) => ({ ruolo: 'collegamento', nome });
  const lettura = (nome) => [val(CLIC, link(nome), SEMPRE).protezione, val(INVIO, link(nome), SEMPRE).protezione];
  // tre e quattro parole col verbo in fondo: invio
  for (const nome of ['Jetzt Nachricht senden', 'Kommentar jetzt absenden', 'Die Nachricht jetzt senden']) assert.deepEqual(lettura(nome), ['invio', 'invio'], nome);
  // cinque parole o più col verbo in fondo: è una frase di aiuto, non un comando
  for (const nome of ['Wie kann ich Nachrichten senden', 'So können Sie Ihre Bewerbung absenden']) assert.deepEqual(lettura(nome), [null, null], nome);
  // il trattino è dentro la parola: «Post-it» e «Upload-Bereich» non sono il verbo seguito da un oggetto
  for (const nome of ['Post-it', 'Upload-Bereich']) assert.deepEqual(lettura(nome), [null, null], nome);
});
test('R2-13 (decisione 169, mutanti L03 e L06): le app del piano contano solo per una finestra senza dominio e con un nome', () => {
  const visa = { ruolo: 'voce', nome: 'Visa •••• 4242' };
  // una pagina web su un dominio fuori dal piano non diventa un luogo del compito perché il browser è un'app del piano
  const web = { elementi: [visa], dominio: 'offerte-treni.example', app: 'Chrome' };
  assert.equal(val(CLIC, visa, PIENO, ctx({ piano: { domini: [], app: ['Chrome'] } }), web).decisione, 'chiedi');
  // una finestra senza nome d'app non è mai un luogo del compito, nemmeno con una voce vuota nel piano
  const senzaNome = { elementi: [visa], dominio: '', app: '' };
  assert.equal(val(CLIC, visa, PIENO, ctx({ piano: { domini: [], app: [''] } }), senzaNome).decisione, 'chiedi');
});
