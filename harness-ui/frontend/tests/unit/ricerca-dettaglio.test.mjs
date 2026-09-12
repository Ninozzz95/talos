import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATI_RICERCA, statoRicercaApprofondita, conclusaDavvero, frasiVoce, durataUmana, articoloData,
  leggiDocumentoRapporto, PERCHE_SENZA_RECORD, bilancioDaRecord, frasiBilancio, verdettoInParole,
  comeOttenuta, dominioRegistrabile, proveDistinte, citazioniDaRecord, bibtexDaCitazioni,
  risDaCitazioni, nomeFileRapporto, vociMenuRicerca, montaDettaglioRicerca, magazzinoRicerche, VISTE,
  haRapportoLeggibile,
} from '../../src/components/ricerca-dettaglio.js';
import { statoRicerca } from '../../src/components/ricerca.js';

/*
 * Lotto L7, 11/09/2026 — la Ricerca approfondita che si consulta.
 *
 * ⛔ LA PROVA CHE CONTA È `L7-SCUSA`. L'11/09 una ricerca vera è finita «Conclusa» con 290 byte di
 *   scusa del modello salvati in Libreria al posto del rapporto. Qui quella scusa, VERBATIM, viene
 *   data in pasto alla sezione e si pretende che compaia SOLO come allegato dentro «Come è andata»,
 *   mai nel pannello del rapporto — e che lo stato non dica «Conclusa».
 * ⛔ Ogni prova sta anche nel verso contrario: un cancello che non si prova a respingere non si sa
 *   se respinge (lezione del cancello semantico spento da sempre, 27/8).
 */

/** La scusa da 290 byte, com'è sul disco dell'owner (disegno §1.4). */
const SCUSA = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente. Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato, o posso provare a scriverlo in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown nel workspace?';

/* -------------------------------------------------------------------- gli stati e le parole */

test('L7-STATI: solo «done» dice «Conclusa», e i tre stati nuovi dicono COSA FARE', () => {
  assert.equal(statoRicercaApprofondita('done').parola, 'Conclusa');
  assert.equal(statoRicercaApprofondita('done').tono, 'success');
  // ⛔ verso contrario: nessun altro stato può prendersi quella parola né quel tono
  for (const [stato, voce] of STATI_RICERCA) {
    if (stato === 'done') continue;
    assert.notEqual(voce.parola, 'Conclusa', `«${stato}» non può dirsi conclusa`);
    assert.notEqual(voce.tono, 'success', `«${stato}» non può essere verde`);
    assert.equal(conclusaDavvero(stato), false);
  }
  assert.equal(conclusaDavvero('done'), true);
  // i tre stati del cancello di consegna esistono, e la loro frase dice cosa fare
  for (const nuovo of ['senza-rapporto', 'bloccata-dal-permesso', 'giri-esauriti']) {
    const voce = statoRicercaApprofondita(nuovo);
    assert.ok(STATI_RICERCA.has(nuovo), `${nuovo} deve avere una parola sua`);
    assert.ok(voce.cosaFare.length > 30, `${nuovo} deve dire cosa fare, non solo cosa è successo`);
    assert.ok(/riprendi|riavvia|resta|riprendila|riavviala/i.test(voce.cosaFare), `${nuovo}: la frase deve proporre un'azione`);
  }
  // ⛔ uno stato sconosciuto NON diventa «Conclusa» per distrazione
  const ignoto = statoRicercaApprofondita('qualcosa-di-nuovo');
  assert.equal(ignoto.parola, 'Stato non registrato');
  assert.equal(ignoto.tono, '');
});

test('L7-UNA-PAROLA-SOLA: la riga del foglio laterale legge la STESSA tabella della sezione', () => {
  // Prima del lotto L7 `ricerca.js` aveva una sua tabella di cinque stati: i tre nuovi sarebbero
  // usciti «Stato non registrato» proprio nella riga che doveva dire la verità.
  for (const stato of [...STATI_RICERCA.keys()]) {
    assert.deepEqual(statoRicerca(stato), { testo: STATI_RICERCA.get(stato).parola, tono: STATI_RICERCA.get(stato).tono });
  }
  assert.equal(statoRicerca('bloccata-dal-permesso').testo, 'Bloccata');
});

test('L7-MOTIVO: il motivo del server vince sulla frase generica, ma non su una conclusa', () => {
  const bloccata = frasiVoce({ stato: 'bloccata-dal-permesso', motivo: 'La sessione era in sola lettura.', domanda: 'Una domanda' });
  assert.equal(bloccata.spiegazione, 'La sessione era in sola lettura.');
  // senza motivo si cade sulla frase dello stato, mai sul silenzio
  const senzaMotivo = frasiVoce({ stato: 'bloccata-dal-permesso', domanda: 'Una domanda' });
  assert.equal(senzaMotivo.spiegazione, STATI_RICERCA.get('bloccata-dal-permesso').cosaFare);
  // ⛔ verso contrario: su una conclusa il motivo non si stampa (il server lo manda solo se non è done)
  const conclusa = frasiVoce({ stato: 'done', motivo: 'residuo di un giro precedente', domanda: 'Una domanda' });
  assert.equal(conclusa.spiegazione, STATI_RICERCA.get('done').cosaFare);
});

test('L7-DOMANDA: si leggono sia «domanda» sia il vecchio «titolo», e il vuoto non diventa una data', () => {
  assert.equal(frasiVoce({ domanda: '  Che cosa cambia?  ' }).domanda, 'Che cosa cambia?');
  assert.equal(frasiVoce({ titolo: 'Forma vecchia' }).domanda, 'Forma vecchia');
  assert.equal(frasiVoce({ domanda: '   ', titolo: 'Forma vecchia' }).domanda, 'Forma vecchia');
  assert.equal(frasiVoce({}).domanda, 'Ricerca senza domanda');
  assert.equal(frasiVoce({ avviataAlle: 'non-una-data' }).avviata, null);
  assert.equal(frasiVoce({ reportLibraryId: 'lib-1' }).haRapporto, true);
  assert.equal(frasiVoce({ reportLibraryId: null }).haRapporto, false);
});

test('L7-DURATA: dall’avvio alla fine, e mai un numero quando una delle due manca', () => {
  assert.equal(durataUmana('2026-09-11T18:56:46.000Z', '2026-09-11T19:00:58.000Z'), '4 min 12 s');
  assert.equal(durataUmana('2026-09-11T18:56:46.000Z', '2026-09-11T18:57:16.000Z'), '30 s');
  assert.equal(durataUmana('2026-09-11T18:00:00.000Z', '2026-09-11T19:00:00.000Z'), '1 h');
  assert.equal(durataUmana('2026-09-11T18:00:00.000Z', '2026-09-11T19:20:00.000Z'), '1 h 20 min');
  // ⛔ verso contrario: senza fine, con date storte o con la fine PRIMA dell'inizio non esce niente
  assert.equal(durataUmana('2026-09-11T18:00:00.000Z', null), null);
  assert.equal(durataUmana(null, '2026-09-11T18:00:00.000Z'), null);
  assert.equal(durataUmana('boh', 'mah'), null);
  assert.equal(durataUmana('2026-09-11T19:00:00.000Z', '2026-09-11T18:00:00.000Z'), null);
});

test('L7-ARTICOLO: «l’8» e «l’11», ma «il 10» — l’italiano non lo scrive una macchina', () => {
  assert.equal(articoloData('2026-09-11T10:00:00.000Z'), 'l’');
  assert.equal(articoloData('2026-09-08T10:00:00.000Z'), 'l’');
  assert.equal(articoloData('2026-09-10T10:00:00.000Z'), 'il ');
  assert.equal(articoloData('2026-09-01T10:00:00.000Z'), 'il ');
  assert.equal(articoloData(null), 'il ');
});

/* ------------------------------------------------------------------ il rapporto e il record */

const RECORD = {
  version: 1,
  question: 'Una domanda',
  summary: 'Una risposta.',
  judge: 'un secondo modello',
  claims: [
    { text: 'a', sourceIndex: 1, passage: 'pa', checks: { claimSupported: 'yes' } },
    { text: 'b', sourceIndex: 1, passage: 'pb', checks: { claimSupported: 'partial' } },
    { text: 'c', sourceIndex: 2, passage: 'pc', checks: { claimSupported: 'contested' } },
    { text: 'd', sourceIndex: 2, passage: '', checks: { claimSupported: 'no' } },
    { text: 'e', sourceIndex: 3, passage: 'pe', checks: { claimSupported: 'unchecked' } },
    { text: 'f', sourceIndex: 3, passage: 'pf', checks: {} },
  ],
  sources: [
    { url: 'https://esempio.it/uno', title: 'Uno', publishedAt: '2026-01-02', obtained: 'page' },
    { url: 'https://esempio.it/due', title: 'Due', publishedAt: null, obtained: 'snippet' },
    { url: 'https://news.bbc.co.uk/tre', title: 'Tre {con} graffe', publishedAt: '2025-11-30', obtained: 'page' },
  ],
};

function documento(record, prosa = '# Una domanda\n\nUna risposta.\n') {
  return `${prosa}\n\`\`\`talos-research-report\n${JSON.stringify(record)}\n\`\`\`\n`;
}

test('L7-LETTURA: prosa e record si separano, e un record guasto NON diventa un bilancio a metà', () => {
  const letto = leggiDocumentoRapporto(documento(RECORD));
  assert.equal(letto.record.claims.length, 6);
  assert.ok(letto.prosa.startsWith('# Una domanda'));
  assert.ok(!letto.prosa.includes('talos-research-report'), 'il record non finisce nella prosa');
  assert.equal(letto.perche, null);

  // ⛔ verso contrario, quattro modi di non avere un record — e ognuno ha il SUO perché
  const senza = leggiDocumentoRapporto('# Solo prosa\n\ntesto');
  assert.equal(senza.record, null);
  assert.equal(senza.perche, 'senza-record');
  assert.equal(leggiDocumentoRapporto('').perche, 'vuoto');

  const troncato = leggiDocumentoRapporto('prosa\n```talos-research-report\n{"version":1,"claims":[');
  assert.equal(troncato.record, null);
  assert.equal(troncato.perche, 'record-troncato');
  assert.equal(troncato.prosa, 'prosa');

  const illeggibile = leggiDocumentoRapporto(documento(null).replace('null', '{non json'));
  assert.equal(illeggibile.record, null);
  assert.equal(illeggibile.perche, 'record-illeggibile');

  const altroFormato = leggiDocumentoRapporto(documento({ version: 2, claims: [], sources: [] }));
  assert.equal(altroFormato.record, null);
  assert.equal(altroFormato.perche, 'record-di-un-altro-formato');

  // ogni «perché» ha una frase per una persona, e nessuna nomina un formato o un errore tecnico
  for (const [chiave, frase] of PERCHE_SENZA_RECORD) {
    assert.ok(frase.length > 20, `${chiave} deve avere una frase vera`);
    assert.ok(!/json|parse|record recintato|fence/i.test(frase), `${chiave}: niente nomi tecnici a schermo`);
  }
});

test('L7-BILANCIO: cinque categorie, la contesa FUORI dalle parziali, e ciò che non si sa non è sostenuto', () => {
  const b = bilancioDaRecord(RECORD);
  assert.deepEqual(b, { totale: 6, sostenute: 1, inParte: 1, contese: 1, nonSostenute: 1, nonVerificate: 2 });
  // ⛔ la sesta affermazione non ha verdetto: finisce fra le NON verificate, non fra le sostenute
  assert.equal(b.sostenute + b.inParte + b.contese + b.nonSostenute + b.nonVerificate, b.totale);
  assert.deepEqual(bilancioDaRecord(null), { totale: 0, sostenute: 0, inParte: 0, contese: 0, nonSostenute: 0, nonVerificate: 0 });

  assert.equal(frasiBilancio(b), '1 sostenute · 1 in parte · 1 contesa · 1 non sostenute · 2 non verificate');
  // ⛔ le voci a zero non si scrivono: «0 contese» riempie lo spazio e non dice niente
  assert.equal(frasiBilancio({ totale: 3, sostenute: 3, inParte: 0, contese: 0, nonSostenute: 0, nonVerificate: 0 }), '3 sostenute');
  assert.equal(frasiBilancio({ totale: 0 }), 'Nessuna affermazione registrata');
  assert.equal(frasiBilancio(null), 'Nessuna affermazione registrata');
});

test('L7-VERDETTI: le parole del mobile, e «non verificata» per tutto ciò che non è un verdetto', () => {
  assert.equal(verdettoInParole({ claimSupported: 'yes' }).parola, 'sostenuta dalla fonte');
  assert.equal(verdettoInParole({ claimSupported: 'partial' }).parola, 'sostenuta solo in parte');
  assert.equal(verdettoInParole({ claimSupported: 'no' }).parola, 'NON sostenuta dalla fonte');
  assert.equal(verdettoInParole({ claimSupported: 'contested' }).parola, 'contesa — le fonti non concordano');
  assert.equal(verdettoInParole({ claimSupported: 'unchecked' }).parola, 'non verificata');
  assert.equal(verdettoInParole({}).parola, 'non verificata');
  assert.equal(verdettoInParole(null).parola, 'non verificata');
  // ⛔ i toni: la contesa NON è verde e NON è rossa — è un'informazione, non un esito
  assert.equal(verdettoInParole({ claimSupported: 'contested' }).tono, 'info');
  assert.equal(verdettoInParole({ claimSupported: 'no' }).tono, 'danger');
  assert.equal(comeOttenuta('page'), 'pagina letta');
  assert.equal(comeOttenuta('snippet'), 'solo estratto dal motore di ricerca');
  assert.equal(comeOttenuta(undefined), 'origine non registrata');
});

test('L7-PROVE: si contano i GRUPPI, e `bbc.co.uk` non diventa `co.uk`', () => {
  assert.equal(dominioRegistrabile('https://www.esempio.it/a/b'), 'esempio.it');
  assert.equal(dominioRegistrabile('https://news.bbc.co.uk/tre'), 'bbc.co.uk');
  assert.equal(dominioRegistrabile('https://sub.dominio.gov.it/x'), 'dominio.gov.it');
  // ⛔ verso contrario: un indirizzo illeggibile non inventa un dominio
  assert.equal(dominioRegistrabile('non un indirizzo'), null);
  assert.equal(dominioRegistrabile(null), null);

  const prove = proveDistinte(RECORD.sources);
  assert.equal(prove.indirizzi, 3);
  assert.equal(prove.gruppi, 2, 'due pagine di esempio.it sono UNA prova');
  assert.equal(prove.frase, '2 prove distinte su 3 indirizzi');
  // ⛔ un indirizzo illeggibile fa gruppo A SÉ: toglierlo farebbe sembrare la ricerca più solida
  assert.equal(proveDistinte([{ url: 'boh' }, { url: 'mah' }]).gruppi, 2);
  assert.equal(proveDistinte([]).frase, 'Nessuna fonte registrata');
  assert.equal(proveDistinte([{ url: 'https://uno.it' }]).frase, '1 prova distinta su 1 indirizzo');
});

/* ----------------------------------------------------------------------- le due esportazioni */

test('L7-CITAZIONI: quattro campi e basta — la domanda e il giudice NON escono dal file', () => {
  const citazioni = citazioniDaRecord(RECORD, '2026-09-11T19:00:58.000Z');
  assert.equal(citazioni.length, 3);
  assert.deepEqual(Object.keys(citazioni[0]).sort(), ['accessedAt', 'publishedAt', 'title', 'url']);
  assert.equal(citazioni[0].accessedAt, '2026-09-11');
  const serializzato = JSON.stringify(citazioni);
  assert.ok(!serializzato.includes('Una domanda'), 'la domanda non finisce in bibliografia');
  assert.ok(!serializzato.includes('secondo modello'), 'il giudice non finisce in bibliografia');
});

test('L7-BIBTEX: chiavi distinte, graffe tolte, e nessun anno inventato', () => {
  const bib = bibtexDaCitazioni(citazioniDaRecord(RECORD, '2026-09-11'));
  assert.ok(bib.includes('@misc{esempioit2026,'), 'la prima chiave resta pulita');
  // ⛔ due fonti dello STESSO dominio e dello STESSO anno: senza suffisso il gestore ne butta una in
  //   silenzio, e chi esporta se ne accorge quando gli manca una citazione a lavoro finito.
  const gemelle = bibtexDaCitazioni([
    { url: 'https://esempio.it/uno', title: 'Uno', publishedAt: '2026-01-02', accessedAt: '2026-09-11' },
    { url: 'https://esempio.it/due', title: 'Due', publishedAt: '2026-05-05', accessedAt: '2026-09-11' },
    { url: 'https://esempio.it/tre', title: 'Tre', publishedAt: '2026-07-07', accessedAt: '2026-09-11' },
  ]);
  assert.ok(gemelle.includes('@misc{esempioit2026,'), 'la prima resta pulita');
  assert.ok(gemelle.includes('@misc{esempioit2026b,'), `la seconda prende il suffisso — invece: ${gemelle}`);
  assert.ok(gemelle.includes('@misc{esempioit2026c,'), 'e la terza il successivo');
  assert.ok(bib.includes('title = {Tre con graffe}'), 'le graffe spaiate si tolgono');
  assert.ok(!bib.includes('{Tre {con} graffe}'));
  // la seconda fonte non ha data: niente `year`, mai un anno dedotto dalla lettura
  const seconda = bib.split('@misc{')[2];
  assert.ok(!seconda.includes('year'), `nessun anno inventato — invece: ${seconda}`);
  assert.equal(bibtexDaCitazioni([]), '');
  assert.equal(bibtexDaCitazioni(null), '');
});

test('L7-RIS: tipo ELEC, data di consultazione con le barre, e `ER` che chiude col suo spazio', () => {
  const ris = risDaCitazioni(citazioniDaRecord(RECORD, '2026-09-11'));
  const primo = ris.split('\n\n')[0].split('\n');
  assert.equal(primo[0], 'TY  - ELEC');
  assert.equal(primo[1], 'TI  - Uno');
  assert.ok(ris.includes('Y2  - 2026/09/11'));
  assert.ok(ris.endsWith('ER  - '), 'l’ultima riga di un record RIS finisce con uno spazio');
  assert.equal(risDaCitazioni([]), '');
});

test('L7-NOMEFILE: un nome che non porta con sé i due punti di una domanda', () => {
  assert.equal(nomeFileRapporto('Come va: davvero?', 'md'), 'Come-va-davvero.md');
  assert.equal(nomeFileRapporto('', 'bib'), 'ricerca.bib');
  assert.ok(!nomeFileRapporto('a/b\\c:d*e', 'ris').includes('/'));
});

/* ------------------------------------------------------------- il menu: nessuna voce morta */

test('L7-MENU: una voce esiste solo se può fare qualcosa', () => {
  const voce = { id: 'r1', domanda: 'D', stato: 'done', reportLibraryId: 'lib-1' };
  const letto = leggiDocumentoRapporto(documento(RECORD));
  const conRapporto = vociMenuRicerca(voce, { lettura: { stato: 'pronto', testo: 'x', ...letto }, onApriSessione: () => {} });
  assert.deepEqual(conRapporto.map((v) => v.chiave), ['apri-conversazione', 'copia', 'esporta', 'bibtex', 'ris']);
  // ⛔ verso contrario: senza rapporto letto restano solo le voci che funzionano
  const senzaRapporto = vociMenuRicerca({ id: 'r2', stato: 'bloccata-dal-permesso' }, { onApriSessione: () => {} });
  assert.deepEqual(senzaRapporto.map((v) => v.chiave), ['apri-conversazione']);
  // e senza nemmeno un posto dove andare, il menu è vuoto invece di offrire un salto nel vuoto
  assert.deepEqual(vociMenuRicerca({ id: 'r3' }, {}).map((v) => v.chiave), []);
  // un rapporto senza record: si copia e si esporta, ma non ci sono citazioni da dare a Zotero
  const soloProsa = vociMenuRicerca(voce, { lettura: { stato: 'pronto', prosa: 'testo', record: null } });
  assert.deepEqual(soloProsa.map((v) => v.chiave), ['copia', 'esporta']);
});

/* ------------------------------------------------- la prova dell’11/09: la scusa NON è un rapporto */

function nodoFinto(tag, doc) {
  const nodo = {
    tagName: String(tag).toUpperCase(),
    figli: [],
    dataset: {},
    className: '',
    textContent: '',
    style: {},
    attributi: new Map(),
    ascoltatori: new Map(),
    ownerDocument: doc,
    append(...nuovi) { for (const n of nuovi) if (n) nodo.figli.push(n); },
    replaceChildren(...nuovi) { nodo.figli = nuovi.filter(Boolean); },
    setAttribute(k, v) { nodo.attributi.set(k, String(v)); },
    getAttribute(k) { return nodo.attributi.get(k) ?? null; },
    addEventListener(tipo, fn) { nodo.ascoltatori.set(tipo, [...(nodo.ascoltatori.get(tipo) || []), fn]); },
    focus() { doc.activeElement = nodo; },
    discendenti() { return nodo.figli.flatMap((f) => [f, ...(f.discendenti ? f.discendenti() : [])]); },
    scatta(tipo, evento = {}) { for (const fn of nodo.ascoltatori.get(tipo) || []) fn({ target: nodo, preventDefault() {}, stopPropagation() {}, ...evento }); },
  };
  return nodo;
}
function documentoFinto() {
  const doc = { activeElement: null };
  doc.createElement = (tag) => nodoFinto(tag, doc);
  doc.createElementNS = (_ns, tag) => nodoFinto(tag, doc);
  doc.createTextNode = (t) => ({ textContent: String(t), figli: [], discendenti: () => [] });
  return doc;
}
/** Tutto il testo di un albero, per chiedergli se una frase c'è o non c'è. */
function testoDi(nodi) {
  const uno = (n) => [n.textContent || '', ...(n.discendenti ? n.discendenti().map((f) => f.textContent || '') : [])].join(' ');
  return nodi.map(uno).join(' ');
}
/** Il pannello della vista scelta, dentro il dettaglio appena costruito. */
function pannelloDi(pezzi) {
  return pezzi.find((n) => n.getAttribute?.('role') === 'tabpanel');
}
function schedeDi(pezzi) {
  const lista = pezzi.find((n) => n.getAttribute?.('role') === 'tablist');
  return lista ? lista.figli : [];
}

test('L7-SCUSA: i 290 byte dell’11/09 sono un ALLEGATO, mai il rapporto — e lo stato non dice «Conclusa»', () => {
  const doc = documentoFinto();
  const voce = {
    id: 'ric-bloccata',
    domanda: 'Come stanno evolvendo gli harness agentici desktop nel 2026?',
    stato: 'bloccata-dal-permesso',
    avviataAlle: '2026-09-11T18:56:46.041Z',
    conclusaAlle: '2026-09-11T19:00:33.549Z',
    reportLibraryId: null,
    motivo: 'La sessione era aperta in sola lettura: la ricerca non ha potuto depositare il suo rapporto.',
    padreId: 'madre',
    nome: 'Harness agentici desktop',
    ultimoMessaggio: SCUSA,
  };
  const schermo = nodoFinto('section', doc);
  const magazzino = magazzinoRicerche(schermo);
  const pezzi = montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni: {} });

  // 1. il timbro dice «Bloccata», e da nessuna parte compare «Conclusa»
  assert.ok(testoDi(pezzi).includes('Bloccata'));
  assert.ok(!testoDi(pezzi).includes('Conclusa'));

  // 2. la vista che si apre è «Come è andata»: è lì che c'è qualcosa da leggere
  const schede = schedeDi(pezzi);
  assert.equal(schede.length, VISTE.length);
  const aperta = schede.find((b) => b.getAttribute('aria-selected') === 'true');
  assert.equal(aperta.dataset.vista, 'andata');

  // 3. la scusa c'è, con la frase che dice cosa NON è
  const testoAndata = testoDi([pannelloDi(pezzi)]);
  assert.ok(testoAndata.includes(SCUSA), 'l’ultimo messaggio si legge per intero');
  assert.ok(testoAndata.includes('non il suo rapporto'), 'e la riga sopra dice che non è il rapporto');

  // 4. ⛔ IL VERSO CONTRARIO: nel pannello «Rapporto» quella scusa NON c'è
  const bottoneRapporto = schede.find((b) => b.dataset.vista === 'rapporto');
  bottoneRapporto.scatta('click');
  // il clic viaggia per delega sulla striscia: si aziona l'ascoltatore della lista
  const lista = pezzi.find((n) => n.getAttribute?.('role') === 'tablist');
  lista.scatta('click', { target: { closest: () => bottoneRapporto } });
  const testoRapporto = testoDi([pannelloDi(pezzi)]);
  assert.ok(!testoRapporto.includes(SCUSA), 'la scusa non compare MAI come rapporto');
  assert.ok(testoRapporto.includes('non ha depositato'), 'il pannello dice che il rapporto non c’è');
});

test('L7-SCHEDE: un solo stop del Tab, e le frecce spostano E aprono (W3C APG, attivazione automatica)', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = { id: 'r', domanda: 'D', stato: 'done', reportLibraryId: 'lib-1' };
  const magazzino = magazzinoRicerche(schermo);
  magazzino.rapporti.set('lib-1', { stato: 'pronto', testo: '', ...leggiDocumentoRapporto(documento(RECORD)) });
  const pezzi = montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni: {} });
  const schede = schedeDi(pezzi);
  const lista = pezzi.find((n) => n.getAttribute?.('role') === 'tablist');

  assert.equal(schede.filter((b) => b.tabIndex === 0).length, 1, 'un solo stop del Tab su tutta la striscia');
  assert.equal(schede.filter((b) => b.getAttribute('aria-selected') === 'true').length, 1);
  assert.equal(schede[0].getAttribute('aria-selected'), 'true', 'con un rapporto si apre su «Rapporto»');
  const pannello = pannelloDi(pezzi);
  assert.equal(pannello.getAttribute('aria-labelledby'), schede[0].id);
  assert.ok(schede.every((b) => b.getAttribute('aria-controls') === pannello.id));
  assert.equal(pannello.tabIndex, 0);

  lista.scatta('keydown', { key: 'ArrowRight' });
  assert.equal(schede[1].getAttribute('aria-selected'), 'true', 'la freccia apre, non solo sposta');
  assert.equal(schede[1].tabIndex, 0);
  assert.equal(schede[0].tabIndex, -1);
  lista.scatta('keydown', { key: 'End' });
  assert.equal(schede.at(-1).getAttribute('aria-selected'), 'true');
  lista.scatta('keydown', { key: 'ArrowRight' });
  assert.equal(schede[0].getAttribute('aria-selected'), 'true', 'dall’ultima si torna alla prima');
  lista.scatta('keydown', { key: 'Home' });
  assert.equal(schede[0].getAttribute('aria-selected'), 'true');
  // ⛔ verso contrario: un tasto qualunque non cambia la vista
  lista.scatta('keydown', { key: 'a' });
  assert.equal(schede[0].getAttribute('aria-selected'), 'true');
});

test('L7-BILANCIO-A-SCHERMO: col record si vede la barra, senza record si dice PERCHÉ non c’è', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = { id: 'r', domanda: 'Una domanda', stato: 'done', reportLibraryId: 'lib-2' };
  const magazzino = magazzinoRicerche(schermo);
  magazzino.rapporti.set('lib-2', { stato: 'pronto', testo: '', ...leggiDocumentoRapporto(documento(RECORD)) });
  const pezziRecord = montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni: {} });
  const conRecord = testoDi(pezziRecord);
  for (const voceBilancio of ['1 sostenute', '1 in parte', '1 contesa', '1 non sostenute', '2 non verificate']) {
    assert.ok(conRecord.includes(voceBilancio), `«${voceBilancio}» deve essere a schermo`);
  }
  // la barra è un'immagine con un nome per chi ascolta: il bilancio non vive solo nel colore
  const barra = pezziRecord.flatMap((n) => [n, ...(n.discendenti ? n.discendenti() : [])])
    .find((n) => n.getAttribute?.('role') === 'img');
  assert.equal(barra.getAttribute('aria-label'), 'Bilancio delle verifiche: 1 sostenute · 1 in parte · 1 contesa · 1 non sostenute · 2 non verificate');
  assert.ok(conRecord.includes('2 prove distinte su 3 indirizzi'));
  assert.ok(conRecord.includes('Una risposta.'), 'la risposta del rapporto si legge');
  // ⛔ il titolo NON esce due volte: una nell'intestazione, e la copia del rapporto viene tolta
  assert.equal(conRecord.split('Una domanda').length - 1, 1);

  const schermo2 = nodoFinto('section', doc);
  const magazzino2 = magazzinoRicerche(schermo2);
  magazzino2.rapporti.set('lib-3', { stato: 'pronto', testo: '', ...leggiDocumentoRapporto('# Un titolo\n\nsolo prosa') });
  const senzaRecord = testoDi(montaDettaglioRicerca({ id: 'r2', domanda: 'D', stato: 'done', reportLibraryId: 'lib-3' }, { doc, magazzino: magazzino2, ridisegna: () => {}, apriMenu: () => {}, opzioni: {} }));
  assert.ok(senzaRecord.includes('non porta con sé il riepilogo delle verifiche'));
  assert.ok(senzaRecord.includes('solo prosa'), 'il testo che c’è si mostra comunque');
  assert.ok(!/sostenute/.test(senzaRecord), '⛔ nessun bilancio stimato quando il record non c’è');
});

test('L7-SENZA-LETTORE: un rapporto che nessuno sa aprire non diventa un’attesa senza fine', () => {
  /*
   * ⛔ Trovato prima di consegnare: se `leggiRapporto` non è iniettato, la lettura non parte e il
   *   pannello restava su «Leggo il rapporto…» PER SEMPRE. Un'attesa che non finisce è una bugia
   *   come «Conclusa» su una ricerca senza rapporto — la stessa famiglia di difetto che questo
   *   lotto sta chiudendo.
   */
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = { id: 'r', domanda: 'D', stato: 'done', reportLibraryId: 'lib-1' };
  const testo = testoDi(montaDettaglioRicerca(voce, { doc, magazzino: magazzinoRicerche(schermo), ridisegna: () => {}, apriMenu: () => {}, opzioni: {} }));
  assert.ok(!testo.includes('Leggo il rapporto'), 'niente attesa infinita');
  assert.ok(testo.includes('depositato in Libreria'), 'si dice dov’è il rapporto');
});

test('L7-LETTURA-UNA-VOLTA: il rapporto si chiede una volta sola, anche se la sezione si ridisegna', async () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const magazzino = magazzinoRicerche(schermo);
  const voce = { id: 'r', domanda: 'D', stato: 'done', reportLibraryId: 'lib-9' };
  let letture = 0;
  const opzioni = { leggiRapporto: () => { letture += 1; return Promise.resolve(documento(RECORD)); } };
  montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni });
  montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni });
  montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni });
  // ⛔ La lettura parte in una microtask, non nel disegno: un dettaglio che aspetta la rete prima di
  //   comparire è un pannello vuoto per tutto il tempo della richiesta.
  await Promise.resolve();
  assert.equal(letture, 1, 'tre ridisegni, una sola lettura del file');
  await new Promise((fatto) => setTimeout(fatto, 0));
  assert.equal(magazzino.rapporti.get('lib-9').stato, 'pronto');
});

/* ---------------- 11/09, foto del 4174: `d2a453a8` — stato senza rapporto MA file depositato --- */

/*
 * ⛔⛔ IL CASO CHE NESSUNA FIXTURE AVEVA. `L7-SCUSA` qui sopra prova la scusa come ULTIMO
 *   MESSAGGIO, con `reportLibraryId: null`. La ricerca vera della foto ha le due cose INSIEME:
 *   stato `senza-rapporto` e un `reportLibraryId` vero, perché il file in Libreria esiste davvero
 *   — sono i 290 byte di scusa. È da lì che uscivano le tre contraddizioni a schermo.
 */
test('L7-DEPOSITATO: con un file in Libreria ma lo stato senza rapporto, decide lo STATO', () => {
  assert.equal(haRapportoLeggibile({ stato: 'senza-rapporto', reportLibraryId: 'lib-scusa' }), false);
  assert.equal(haRapportoLeggibile({ stato: 'bloccata-dal-permesso', reportLibraryId: 'lib-x' }), false);
  assert.equal(haRapportoLeggibile({ stato: 'giri-esauriti', reportLibraryId: 'lib-x' }), false);
  assert.equal(haRapportoLeggibile({ stato: 'failed', reportLibraryId: 'lib-x' }), false);
  assert.equal(haRapportoLeggibile({ stato: 'cancelled', reportLibraryId: 'lib-x' }), false);
  // ⛔ verso contrario: una conclusa col file depositato SÌ, e una conclusa senza file NO
  assert.equal(haRapportoLeggibile({ stato: 'done', reportLibraryId: 'lib-1' }), true);
  assert.equal(haRapportoLeggibile({ stato: 'done', reportLibraryId: null }), false);
});

test('L7-DEPOSITATO: il pannello «Rapporto» dice che un rapporto non c’è e mostra la scusa come ALLEGATO', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = {
    id: 'ric-scusa',
    domanda: 'Quali capacità separano gli harness agentici desktop nel 2026?',
    stato: 'senza-rapporto',
    avviataAlle: '2026-09-11T18:56:46.041Z',
    conclusaAlle: '2026-09-11T19:00:33.549Z',
    reportLibraryId: 'lib-scusa-290',
    motivo: 'Il documento consegnato non è un rapporto: la consegna l’ha respinto.',
    nome: 'Harness agentici desktop 2026',
    ultimoMessaggio: SCUSA,
  };
  const magazzino = magazzinoRicerche(schermo);
  magazzino.rapporti.set('lib-scusa-290', { stato: 'pronto', testo: SCUSA, ...leggiDocumentoRapporto(SCUSA) });
  const pezzi = montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni: { leggiRapporto: async () => SCUSA } });

  // 1. il file c'è, ma la vista che si apre NON è «Rapporto»: lì non c'è un rapporto da leggere
  const schede = schedeDi(pezzi);
  assert.equal(schede.find((b) => b.getAttribute('aria-selected') === 'true').dataset.vista, 'andata');
  // 2. e da nessuna parte compare «Conclusa»
  assert.ok(!testoDi(pezzi).includes('Conclusa'));

  // 3. aperto il pannello «Rapporto»: dice che non c'è, e la scusa sta sotto il suo nome vero
  const bottone = schede.find((b) => b.dataset.vista === 'rapporto');
  const lista = pezzi.find((n) => n.getAttribute?.('role') === 'tablist');
  lista.scatta('click', { target: { closest: () => bottone } });
  const pannello = pannelloDi(pezzi);
  const testo = testoDi([pannello]);
  /*
   * ⛔ FRASE CAMBIATA IL 12/09, e il test lo registra invece di inseguirla. Qui si pretendeva
   *   «non ha depositato un rapporto» stampato SOPRA il testo depositato: vero alla lettera e
   *   falso a leggerlo, perché nella stessa schermata c'è il contrario (trovato nella foto
   *   `respinta_menu-dark-1440`). Adesso la frase dice che il deposito c'è stato e non ha passato
   *   il controllo — che è la stessa cosa senza la parte che si contraddice da sola.
   *   ⛔ E si pretende ANCHE il verso contrario: che non dica più «non ha depositato».
   */
  assert.ok(testo.includes('non ha superato il controllo di consegna'), 'il pannello dice che quel testo non è un rapporto');
  assert.ok(!testo.includes('non ha depositato'), 'e non nega un deposito che sta stampando due righe sotto');
  assert.ok(testo.includes('Ciò che è stato depositato'), 'e il file ha il suo nome vero');
  /* ⛔ La didascalia del file, non una frase qualunque che contenga «rapporto»: prima questa riga
     passava grazie alla frase sull'ultimo messaggio, cioè per la ragione sbagliata. */
  assert.ok(testo.includes('Il file che questa ricerca ha lasciato in Libreria. Non è il suo rapporto.'),
    'la didascalia dice CHE COS’È il file');
  /* ⛔ e NON ripete il motivo del server, che sta già sotto il titolo (visto nella foto) */
  assert.equal(testo.split('la consegna l’ha respinto').length - 1, 0, 'il motivo non si ripete nel pannello');
  // ⛔ la scusa è un ALLEGATO: sta dentro `.td-allegato`, non nella prosa del rapporto
  const allegati = pannello.discendenti().filter((n) => n.className === 'td-allegato');
  assert.equal(allegati.length, 1);
  assert.ok(allegati[0].textContent.includes('sola lettura'));
  assert.ok(!pannello.discendenti().some((n) => n.className === 'td-prosa-rapporto'), 'mai resa come prosa del rapporto');
});

test('L7-DEPOSITATO: verso contrario — una conclusa col record ha il rapporto pieno e nessun «depositato»', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = { id: 'r-done', domanda: 'Una domanda', stato: 'done', reportLibraryId: 'lib-pieno' };
  const magazzino = magazzinoRicerche(schermo);
  magazzino.rapporti.set('lib-pieno', { stato: 'pronto', testo: '', ...leggiDocumentoRapporto(documento(RECORD)) });
  const pezzi = montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni: {} });
  const schede = schedeDi(pezzi);
  assert.equal(schede.find((b) => b.getAttribute('aria-selected') === 'true').dataset.vista, 'rapporto');
  const testo = testoDi([pannelloDi(pezzi)]);
  assert.ok(!testo.includes('Ciò che è stato depositato'));
  assert.ok(!testo.includes('non ha depositato'));
});

test('L7-DEPOSITATO: anche il MENU smette di chiamarlo rapporto', () => {
  const lettura = { stato: 'pronto', prosa: SCUSA, testo: SCUSA, record: null };
  const senza = vociMenuRicerca({ id: 'r', domanda: 'D', stato: 'senza-rapporto', reportLibraryId: 'lib-scusa-290' }, { lettura });
  assert.deepEqual(senza.map((v) => v.etichetta), ['Copia il file depositato', 'Esporta il file depositato']);
  // ⛔ verso contrario: su una conclusa le due voci tornano a chiamarsi col nome del rapporto
  const con = vociMenuRicerca({ id: 'r', domanda: 'D', stato: 'done', reportLibraryId: 'lib-1' }, { lettura });
  assert.deepEqual(con.map((v) => v.etichetta), ['Copia il rapporto', 'Esporta il rapporto']);
});
