/*
 * Guardia, variante A (decisione 145, owner 04/11; forma FORMA-GUARDIA-VARIANTE-A-2026-11-04, OK di Desktop, CLI e Mobile).
 * Sul sito o nell'app sensibile si legge in silenzio; la carta arriva prima della PRIMA AZIONE CHE CAMBIA QUALCOSA; il sì vale per
 * il compito (catena SPID compresa); i 5 minuti contano solo prima di un'azione che cambia qualcosa; la mano alla persona («fatto»)
 * rinnova il sì; una carta sola quando guardia e protezione servono insieme; la cassa si riconosce da campi della carta, oppure da
 * titolo + totale + tasto Paga, oppure da un errore di lettura (un titolo da solo non basta più).
 * Prove ROSSE scritte prima del codice (Desktop 14:48). Le esportazioni nuove si leggono dallo spazio dei nomi, così una che manca
 * fa cadere la sua prova e non tutto il file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito } from '../src/computer-use/ciclo.mjs';
import * as prot from '../src/computer-use/protezioni.mjs';
import * as guardiaMod from '../src/computer-use/guardia.mjs';

const { POLITICHE } = prot;
const PIENO = POLITICHE.pcAccessoPieno;
const NORMALE = POLITICHE.pcNormale;
const TELEFONO = POLITICHE.telefono;
const MIN = 60 * 1000;
const ACCESA = { accesa: true, aggiunti: [] };
const ELEMENTI = [{ ref: 'b1', ruolo: 'pulsante', nome: 'Avanti' }, { ref: 'b2', ruolo: 'pulsante', nome: 'Indietro' },
  { ref: 't1', ruolo: 'testo', nome: 'Saldo disponibile' }, { ref: 'c1', ruolo: 'campo', nome: 'Causale' }];
const banca = (over = {}) => ({ frenoArmato: true, elementi: ELEMENTI, origine: 'https://www.unicredit.it', ...over });

/** Porte finte; l'orologio salta di `orologio.salto` alla lettura successiva; `chiediPersona(q)` decide la risposta. */
function porte({ risposte = [], guarda = () => banca(), chiediPersona = () => 'si', dopoLaPersona, ...altro } = {}) {
  const orologio = { t: 1000, salto: 0 };
  let k = 0;
  const eventi = []; const eseguite = []; const domande = []; const ordine = [];
  const p = {
    eventi, eseguite, domande, ordine, orologio,
    porte: {
      guarda: async () => guarda(eseguite.length),
      chiedi: async () => (k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }),
      agisci: async (azione, bersaglio) => { ordine.push('azione'); eseguite.push({ tipo: azione?.tipo, bersaglio: bersaglio?.nome ?? null }); return { esito: 'confermata' }; },
      bersaglio: (azione, s) => (Array.isArray(s.elementi) ? s.elementi.find((e) => e.ref === azione.ref) : null) ?? null,
      chiediPersona: async (q) => { ordine.push(`domanda:${q.motivo}`); domande.push(q); const r = await chiediPersona(q); dopoLaPersona?.(q, orologio); return r; },
      emetti: (nome, dati) => eventi.push({ nome, dati }),
      adesso: () => { orologio.t += 10 + orologio.salto; orologio.salto = 0; return orologio.t; },
      ...altro,
    },
  };
  return p;
}
/** Il modello risponde: alla chiamata numero n (da 1) l'orologio salta di `salti[n]` millisecondi. */
function conSalti(p, salti) {
  let n = 0; const chiediVero = p.porte.chiedi;
  p.porte.chiedi = async (...a) => { n += 1; if (salti[n]) p.orologio.salto = salti[n]; return chiediVero(...a); };
}
const domandeGuardia = (p) => p.domande.filter((q) => q.motivo === 'guardia');
const premi = (ref = 'b1') => ({ tipo: 'premi', ref });
const scorri = () => ({ tipo: 'scorri', direzione: 'giu' });
const scrivi = (ref = 'c1', testo = 'affitto novembre') => ({ tipo: 'scrivi', ref, testo });

test('GA-01: banca sul PC, solo lettura e scorrimento per tre giri: nessuna carta della guardia, lotti interi', async () => {
  const giro = { azioni: [scorri(), scorri()] };
  const p = porte({ risposte: [giro, giro, giro, { fine: { riuscito: true } }] });
  const r = await eseguiCompito({ testoDellaPersona: 'guarda il saldo', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito', r.storia?.join(' | '));
  assert.equal(domandeGuardia(p).length, 0, p.ordine.join(','));
  assert.equal(p.eseguite.length, 6, 'leggere non taglia il lotto');
});

test('GA-02: la prima «scrivi» sul sito sensibile chiede PRIMA di agire, e la carta dice che torna ogni 5 minuti di azioni', async () => {
  const p = porte({ risposte: [{ azioni: [scorri(), scrivi()] }, { azioni: [scrivi()] }, { fine: { riuscito: true } }] });
  const r = await eseguiCompito({ testoDellaPersona: 'compila la causale', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito', r.storia?.join(' | '));
  assert.equal(p.ordine[0], 'azione', `lo scorrimento parte senza carta: ${p.ordine.join(',')}`);
  const iCarta = p.ordine.indexOf('domanda:guardia');
  const iScrivi = p.eseguite.findIndex((e) => e.tipo === 'scrivi');
  assert.ok(iCarta > 0 && iScrivi >= 0, p.ordine.join(','));
  // la posizione in `ordine` della prima scrittura: la (iScrivi+1)-esima «azione»
  const posAzioni = p.ordine.flatMap((x, i) => (x === 'azione' ? [i] : []));
  const posScrivi = posAzioni[iScrivi];
  assert.ok(iCarta < posScrivi, `la carta prima della scrittura: ${p.ordine.join(',')}`);
  const carta = domandeGuardia(p)[0];
  assert.equal(carta.sito, 'unicredit.it');
  assert.equal(carta.perche, 'ingresso');
  assert.equal(carta.rinnovo, 'ogni-5-minuti-di-azioni');
  // con «no» la scrittura non parte
  const no = porte({ risposte: [{ azioni: [scorri(), scrivi()] }, { azioni: [scrivi()] }], chiediPersona: () => 'no' });
  const rn = await eseguiCompito({ testoDellaPersona: 'compila la causale', politica: PIENO, porte: no.porte, guardia: ACCESA });
  assert.equal(rn.esito, 'fermato');
  assert.equal(no.eseguite.filter((e) => e.tipo === 'scrivi').length, 0, no.ordine.join(','));
  assert.equal(domandeGuardia(no).length, 1);
});

test('GA-03: dopo il sì, il passaggio dalla pagina SPID e il ritorno non chiedono di nuovo nello stesso compito', async () => {
  const schermi = [banca({ origine: 'https://www.inps.it' }), banca({ origine: 'https://posteid.poste.it/jod-login' }), banca({ origine: 'https://www.inps.it' })];
  const p = porte({ risposte: [{ azioni: [premi()] }, { azioni: [premi()] }, { azioni: [premi()] }, { fine: { riuscito: true } }],
    guarda: (fatte) => schermi[Math.min(fatte, 2)] });
  const r = await eseguiCompito({ testoDellaPersona: 'scarica il cedolino', politica: PIENO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito', r.storia?.join(' | '));
  assert.equal(domandeGuardia(p).length, 1, p.ordine.join(','));
  assert.equal(p.eseguite.length, 3);
});

test('GA-04: sì, poi 6 minuti di sola lettura senza carte; alla prima azione che cambia qualcosa la carta torna col motivo «tempo»', async () => {
  const p = porte({ risposte: [{ azioni: [premi()] }, { azioni: [scorri()] }, { azioni: [scorri()] }, { azioni: [premi()] }, { fine: { riuscito: true } }] });
  conSalti(p, { 2: 6 * MIN });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
  assert.equal(r.esito, 'riuscito', r.storia?.join(' | '));
  assert.deepEqual(p.ordine, ['domanda:guardia', 'azione', 'azione', 'azione', 'domanda:guardia', 'azione']);
  assert.deepEqual(domandeGuardia(p).map((q) => q.perche), ['ingresso', 'tempo']);
});

test('GA-05: la mano alla persona chiusa con «fatto» rinnova il sì: l\'azione dopo, entro 5 minuti da «fatto», non chiede', async () => {
  let fatto = false;
  const verifica = { ref: 'v1', ruolo: 'testo', nome: 'Autorizza il pagamento nell\'app della banca' };
  const p = porte({
    risposte: [{ azioni: [premi()] }, { azioni: [premi()] }, { azioni: [premi()] }, { fine: { riuscito: true } }],
    guarda: (fatte) => (fatte === 1 && !fatto ? banca({ elementi: [...ELEMENTI, verifica] }) : banca()),
    chiediPersona: (q) => (q.motivo === 'verifica-banca' ? 'fatto' : 'si'),
    dopoLaPersona: (q) => { if (q.motivo === 'verifica-banca') fatto = true; },
  });
  // 4 minuti dopo il primo sì arriva la verifica della banca; altri 2 minuti dopo «fatto» (6 dal primo sì, 2 da «fatto»)
  conSalti(p, { 2: 4 * MIN, 3: 2 * MIN });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
  assert.equal(r.esito, 'riuscito', r.storia?.join(' | '));
  assert.ok(p.domande.some((q) => q.motivo === 'verifica-banca'), p.ordine.join(','));
  assert.deepEqual(domandeGuardia(p).map((q) => q.perche), ['ingresso'], p.ordine.join(','));
  assert.equal(p.eseguite.length, 2);
});

test('GA-06: guardia da chiedere e protezione «invio» sulla stessa azione: UNA domanda sola, con la riga della guardia dentro', async () => {
  const el = [...ELEMENTI, { ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }];
  const p = porte({ risposte: [{ azioni: [premi('inv')] }, { fine: { riuscito: true } }], guarda: () => banca({ elementi: el }) });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: p.porte, guardia: ACCESA, limiti: { millisecondi: 60 * MIN } });
  assert.equal(r.esito, 'riuscito', r.storia?.join(' | '));
  assert.deepEqual(p.ordine, ['domanda:conferma', 'azione']);
  const [q] = p.domande;
  assert.equal(q.protezione, 'invio');
  assert.equal(q.guardia?.sito, 'unicredit.it', JSON.stringify(q));
});

test('GA-07: la cassa: titolo + totale + Paga, campi della carta, errore di lettura; un titolo da solo NON è più una cassa', () => {
  const totale = { ref: 'r0', ruolo: 'testo', nome: 'Totale 30,00 €' };
  const paga = { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' };
  const titolo = 'Checkout - Negozio';
  const rotto = { ref: 'x', get ruolo() { throw new Error('lettura'); }, nome: 'boh' };
  const casi = [
    [{ titolo, elementi: [totale, paga] }, true, 'titolo-totale-paga'],
    [{ elementi: [{ ref: 'n', ruolo: 'campo', nome: 'Numero della carta' }] }, true, 'campi'],
    [{ titolo, elementi: [rotto] }, true, 'errore'],
    [{ titolo, elementi: [] }, false, null],
    [{ titolo, elementi: [totale] }, false, null],
    [{ titolo, elementi: [paga] }, false, null],
    [{ titolo: 'Il mio conto', elementi: [totale, paga] }, false, null],
    [{ elementi: [] }, false, null],
  ];
  const sbagliati = casi.filter(([s, cassa]) => prot.eUnaCassa(s) !== cassa).map(([s, , ragione]) => `${s.titolo ?? '-'}/${s.elementi.length}/${ragione}`);
  assert.deepEqual(sbagliati, [], 'eUnaCassa');
  assert.equal(typeof prot.ragioneDellaCassa, 'function', 'ragioneDellaCassa esportata da protezioni.mjs');
  for (const [s, , ragione] of casi) assert.equal(prot.ragioneDellaCassa(s), ragione, JSON.stringify({ titolo: s.titolo, n: s.elementi.length }));
});

// «Checkout»: la parola «cassa» da sola non è nel titolo di cassa delle protezioni (vuol dire anche l'altoparlante): domanda al Desktop
const cassa = (over = {}) => ({ frenoArmato: true, titolo: 'Checkout - Negozio', dominio: 'negozio.example', origine: 'https://negozio.example/cassa',
  elementi: [{ ref: 'r0', ruolo: 'testo', nome: 'Totale 30,00 €' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' },
    { ref: 'cc', ruolo: 'voce', nome: 'Visa •••• 4242' }, { ref: 'cp', ruolo: 'campo', nome: 'Codice sconto' }], ...over });
const NEGOZIO = { testoDellaPersona: 'compra le cuffie', piano: { domini: ['negozio.example'], app: [] }, politica: NORMALE,
  guardia: { accesa: true, aggiunti: ['negozio.example'] }, limiti: { millisecondi: 60 * MIN } };

test('GA-08: PC, cassa: il sì alla carta della cassa vale come conferma del pagamento; importo cambiato ⇒ di nuovo la carta', async () => {
  const p = porte({ risposte: [{ azioni: [scrivi('cp', 'BENVENUTO')] }, { azioni: [premi('paga')] }, { fine: { riuscito: true } }], guarda: () => cassa() });
  const r = await eseguiCompito({ ...NEGOZIO, porte: p.porte });
  assert.equal(r.esito, 'riuscito', r.storia?.join(' | '));
  assert.equal(p.domande.length, 1, `una carta sola: ${p.ordine.join(',')}`);
  assert.equal(p.ordine[0].startsWith('domanda:'), true);
  assert.equal(p.eseguite.filter((e) => e.bersaglio === 'Paga ora').length, 1);
  // il totale cambia dopo il codice sconto: il sì di prima non copre il pagamento nuovo
  const cambiata = cassa({ elementi: [{ ref: 'r0', ruolo: 'testo', nome: 'Totale 45,00 €' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' },
    { ref: 'cc', ruolo: 'voce', nome: 'Visa •••• 4242' }, { ref: 'cp', ruolo: 'campo', nome: 'Codice sconto' }] });
  const q = porte({ risposte: [{ azioni: [scrivi('cp', 'BENVENUTO')] }, { azioni: [premi('paga')] }, { fine: { riuscito: true } }],
    guarda: (fatte) => (fatte === 0 ? cassa() : cambiata) });
  await eseguiCompito({ ...NEGOZIO, porte: q.porte });
  assert.equal(q.domande.length, 2, q.ordine.join(','));
  assert.equal(q.domande[1].motivo, 'conferma');
  assert.equal(q.domande[1].protezione, 'pagamento');
});

test('GA-09: «cambia qualcosa»: vocabolario del telefono (Mobile 14:50), equivalenti del nucleo, e il PC', () => {
  assert.equal(typeof guardiaMod.cambiaQualcosa, 'function', 'cambiaQualcosa esportata da guardia.mjs');
  const c = guardiaMod.cambiaQualcosa;
  const testo = { ref: 't1', ruolo: 'testo', nome: 'Saldo disponibile' };
  const pulsante = { ref: 'b1', ruolo: 'pulsante', nome: 'Avanti' };
  const nessuna = { protezione: null };
  // telefono, vocabolario del pilota: ogni tocco cambia qualcosa
  for (const tipo of ['tocca', 'premiALungo', 'scrivi', 'imposta']) assert.equal(c({ tipo }, testo, nessuna, TELEFONO, null), true, tipo);
  for (const tipo of ['scorri', 'indietro', 'home', 'recenti', 'apri_app', 'attendi', 'fine']) assert.equal(c({ tipo }, null, nessuna, TELEFONO, null), false, tipo);
  // telefono, nucleo: «premi» anche su un testo cambia qualcosa; scorrere, il tasto di sistema e aprire un'app no
  assert.equal(c({ tipo: 'premi', ref: 't1' }, testo, nessuna, TELEFONO, null), true);
  for (const tipo of ['scorri', 'sistema', 'apri', 'aspetta']) assert.equal(c({ tipo }, null, nessuna, TELEFONO, null), false, tipo);
  // PC: scrivere e premere un pulsante cambiano; premere un testo e scorrere no; una protezione riconosciuta cambia sempre
  assert.equal(c({ tipo: 'scrivi', ref: 'c1', testo: 'x' }, { ref: 'c1', ruolo: 'campo', nome: 'Causale' }, nessuna, PIENO, null), true);
  assert.equal(c({ tipo: 'premi', ref: 'b1' }, pulsante, nessuna, PIENO, null), true);
  assert.equal(c({ tipo: 'premi', ref: 't1' }, testo, nessuna, PIENO, null), false);
  assert.equal(c({ tipo: 'scorri' }, null, nessuna, PIENO, null), false);
  assert.equal(c({ tipo: 'premi', ref: 't1' }, testo, { protezione: 'invio' }, PIENO, null), true);
});

test('GA-09: nell\'app della banca sul telefono si scorre senza carta; il tocco su un testo chiede prima', async () => {
  const app = (over = {}) => ({ frenoArmato: true, elementi: ELEMENTI, app: 'com.unicredit', ...over });
  const p = porte({ risposte: [{ azioni: [scorri()] }, { azioni: [premi('t1')] }, { fine: { riuscito: true } }], guarda: () => app() });
  const r = await eseguiCompito({ testoDellaPersona: 'guarda il saldo', politica: TELEFONO, porte: p.porte, guardia: ACCESA });
  assert.equal(r.esito, 'riuscito', r.storia?.join(' | '));
  assert.deepEqual(p.ordine, ['azione', 'domanda:guardia', 'azione']);
  assert.equal(domandeGuardia(p)[0].genere, 'app');
});

test('GA-10: telefono, cassa: dopo il sì alla carta il pagamento resta fermo (condizione del Mobile)', async () => {
  const p = porte({ risposte: [{ azioni: [premi('paga')] }, { fine: { riuscito: true } }], guarda: () => cassa({ app: 'com.negozio.app' }) });
  const r = await eseguiCompito({ ...NEGOZIO, politica: TELEFONO, guardia: { accesa: true, aggiunti: ['negozio.example'], appAggiunte: ['com.negozio.app'] }, porte: p.porte });
  assert.equal(p.eseguite.filter((e) => e.bersaglio === 'Paga ora').length, 0, p.ordine.join(','));
  assert.equal(r.esito, 'fermato');
});
