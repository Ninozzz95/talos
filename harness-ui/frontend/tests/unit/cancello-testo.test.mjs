import test from 'node:test';
import assert from 'node:assert/strict';
import {
  testoGrezzo,
  sembraJson,
  sembraInglese,
  sembraErroreGrezzo,
  paroleIngleseTrovate,
  nomiTecniciTrovati,
  esenzioneDi,
} from '../../scripts/cancello/testo-grezzo.mjs';

/*
 * Cancello unico, classe 4. Ogni prova ha due metà: che il difetto si trovi, e che NON si trovi
 * dove non c'è. La seconda metà è quella che tiene vivo il cancello — un rapporto pieno di falsi
 * allarmi si smette di leggerlo, e allora è come non averlo (lezione del cancello semantico,
 * spento da sempre senza che un test se ne accorgesse, perché ognuno provava solo il caso buono).
 */

/** Il difetto vero del 06/9: gli argomenti della chiamata e il rifiuto del kernel, a schermo. */
const RIQUADRO_ATTIVITA_NON_RIUSCITA = [
  { selettore: '.attivita__titolo', testo: 'Attività non riuscita', dentroCodice: false },
  {
    selettore: '.attivita__argomenti',
    testo: '{"titolo":"Piano di rilascio","html":"<!doctype html><html lang=\\"it\\"><body>"',
    dentroCodice: false,
  },
  { selettore: '.attivita__esito', testo: 'REFUSED. Empty html: nothing was created.', dentroCodice: false },
];

test('IL DIFETTO VERO: il riquadro «Attività non riuscita» viene bocciato, su tutte e due le righe', () => {
  const difetti = testoGrezzo(RIQUADRO_ATTIVITA_NON_RIUSCITA, { nomiTecnici: ['document_create'] });
  const tipi = difetti.map((d) => d.tipo);
  assert.ok(tipi.includes('json'), 'gli argomenti grezzi della chiamata');
  assert.ok(tipi.includes('errore'), 'il rifiuto del kernel in inglese');
  assert.equal(difetti.filter((d) => d.selettore === '.attivita__titolo').length, 0, '«Attività non riuscita» è testo giusto');
  const json = difetti.find((d) => d.tipo === 'json');
  assert.ok(json.estratto.includes('"titolo"'), 'il rapporto dice DOVE, non solo che c\'è del JSON');
  assert.equal(json.gravita, 'alta');
});

test('IL DIFETTO VERO al contrario: lo stesso riquadro scritto bene non produce niente', () => {
  const riparato = [
    { selettore: '.attivita__titolo', testo: 'Attività non riuscita', dentroCodice: false },
    { selettore: '.attivita__argomenti', testo: 'Documento «Piano di rilascio», pagina vuota', dentroCodice: false },
    { selettore: '.attivita__esito', testo: 'Rifiutata: il contenuto della pagina era vuoto, non è stato creato niente.', dentroCodice: false },
  ];
  assert.deepEqual(testoGrezzo(riparato, { nomiTecnici: ['document_create'] }), []);
});

test('JSON: le firme del grezzo, anche troncato', () => {
  assert.ok(sembraJson('{"titolo":"Piano","html":"<p>"'));
  assert.ok(sembraJson('…,"html":"<!doctype html>'), 'un frammento tagliato a metà, la forma più dannosa');
  assert.ok(sembraJson('"titolo": "Piano"'), 'un frammento che comincia dalla chiave');
  assert.ok(sembraJson('[{"nome":"a"},{"nome":"b"}]'));
  assert.ok(sembraJson('{\\"chiave\\": 1}'), 'un oggetto serializzato dentro un altro');
  assert.ok(sembraJson('[object Object]'), 'la variabile stampata al posto del testo');
  assert.ok(sembraJson('undefined'));
});

test('JSON AL CONTRARIO: la prosa italiana con virgolette e due punti non è JSON', () => {
  assert.equal(sembraJson('Ha risposto: "sì", poi "no": tutto qui'), false, 'il falso positivo che ha cambiato la firma');
  assert.equal(sembraJson('Sessione «Piano di rilascio»: conclusa alle 14:32'), false);
  assert.equal(sembraJson('Percorso: C:\\Users\\esempio\\progetti'), false);
  assert.equal(sembraJson('La nullità dell\'atto e il numero di Nan'), false, '«null» e «nan» dentro una parola non sono valori crudi');
  assert.equal(sembraJson(''), false);
  assert.equal(sembraJson(null), false);
});

test('ERRORE GREZZO: rifiuti, eccezioni, errno e tracce di pila', () => {
  assert.ok(sembraErroreGrezzo('REFUSED. Empty html: nothing was created.'));
  assert.ok(sembraErroreGrezzo('TypeError: cannot read properties of null'));
  assert.ok(sembraErroreGrezzo('Error: qualcosa è andato storto'));
  assert.ok(sembraErroreGrezzo('    at leggiSessione (/app/store.mjs:120:9)'));
  assert.ok(sembraErroreGrezzo('Traceback (most recent call last)'));
  assert.ok(sembraErroreGrezzo('ENOENT: no such file or directory'));
  assert.ok(sembraErroreGrezzo('Uncaught in promise'));
  assert.ok(sembraErroreGrezzo('java.lang.IllegalStateException'));
});

test('ERRORE GREZZO AL CONTRARIO: il messaggio italiano CORRETTO non viene accusato', () => {
  assert.equal(sembraErroreGrezzo('Errore: non è stato possibile salvare il documento'), false,
    '«Errore:» comincia con le stesse cinque lettere di «Error:»: senza confine di parola questo cancello boccerebbe ogni messaggio giusto');
  assert.equal(sembraErroreGrezzo('Errori rilevati: 3'), false);
  assert.equal(sembraErroreGrezzo('La cartella non è stata trovata'), false);
  assert.equal(sembraErroreGrezzo('Il rifiuto è stato registrato alle 14:32'), false);
  assert.equal(sembraErroreGrezzo(''), false);
});

test('INGLESE: parole e frasi intere di una interfaccia non tradotta', () => {
  assert.ok(sembraInglese('Loading…'));
  assert.ok(sembraInglese('Settings'));
  assert.ok(sembraInglese('Cancel'));
  assert.deepEqual(paroleIngleseTrovate('Something went wrong. Please try again'),
    ['something went wrong', 'try again', 'please'],
    'la frase si conta una volta sola, e le sue parole non si ricontano');
  assert.deepEqual(paroleIngleseTrovate('Submit'), ['submit']);
});

test('INGLESE AL CONTRARIO: italiano, prestiti veri, nomi propri e nomi di modello', () => {
  assert.equal(sembraInglese('Caricamento in corso'), false);
  assert.equal(sembraInglese('Impostazioni'), false);
  assert.equal(sembraInglese('glm-5.3-flash · z-ai · Opus 5 · qwen3.7-flash'), false,
    'i nomi dei modelli hanno cifre e trattini: sono nomi di cosa, non inglese da tradurre');
  assert.equal(sembraInglese('Claude, Hermes, Codex e Playwright'), false, 'i nomi propri non sono nel vocabolario, e ciò che non è dichiarato è innocente');
  assert.equal(sembraInglese('Apri il file, controlla il link e chiudi il browser'), false,
    'file/link/browser sono italiano parlato: accusarli riempirebbe il rapporto di rumore');
  assert.equal(sembraInglese('Settings', { consentite: ['settings'] }), false, 'l\'ammissione dichiarata, come la fa i18n-lint');
  assert.equal(sembraInglese(''), false);
});

test('NOMI TECNICI: si trovano interi, e la lista arriva sempre da fuori', () => {
  const nomi = ['web_search', 'document_create', 'generate_image', 'tool_create', 'delega_sottotask'];
  assert.deepEqual(nomiTecniciTrovati('Sto usando web_search per cercare', nomi), ['web_search']);
  assert.deepEqual(nomiTecniciTrovati('document_create · generate_image', nomi), ['document_create', 'generate_image']);
  // AL CONTRARIO: il nome umano non è il nome tecnico, e senza lista non si accusa nessuno
  assert.deepEqual(nomiTecniciTrovati('Ricerca sul web e creazione del documento', nomi), []);
  assert.deepEqual(nomiTecniciTrovati('Sto usando web_search', []), [], 'lista vuota ⇒ nessuna accusa: la lista è del chiamante');
  assert.deepEqual(nomiTecniciTrovati('web_search_v2 non è web_search', ['web_search']), ['web_search'],
    'il nome più lungo non conta, quello isolato sì');
  assert.deepEqual(nomiTecniciTrovati('lo strumento xweb_searchy', ['web_search']), [],
    'dentro un identificatore più lungo non è un\'etichetta a schermo');
});

test('ESENZIONI: il codice mostrato di proposito e il dettaglio tecnico dichiarato', () => {
  assert.equal(esenzioneDi({ dentroCodice: true, testo: '{"a":1}' }), 'mostra codice di proposito');
  assert.equal(esenzioneDi({ dettaglioTecnico: true }), 'dettaglio tecnico dichiarato');
  assert.ok(esenzioneDi({ selettore: '.attrezzo__dettagli span' }, ['.attrezzo__dettagli']));
  // AL CONTRARIO: un elemento normale non è esente, altrimenti il cancello sarebbe inerte
  assert.equal(esenzioneDi({ selettore: '.attivita__esito' }, ['.attrezzo__dettagli']), null);
  assert.equal(esenzioneDi({ dentroCodice: false }), null);
});

test('CANCELLO: `dentroCodice` esclude per costruzione, anche col JSON più sfacciato', () => {
  const visibili = [
    { selettore: 'pre.blocco-codice', testo: '{"titolo":"Piano","html":"<p>ciao</p>"}', dentroCodice: true },
    { selettore: 'code', testo: 'throw new Error: qualcosa', dentroCodice: true },
    { selettore: 'pre', testo: 'const settings = { loading: true }', dentroCodice: true },
  ];
  assert.deepEqual(testoGrezzo(visibili, { nomiTecnici: ['web_search'] }), [],
    'un blocco di codice è ciò che la persona ha CHIESTO di vedere: qui il grezzo è il contenuto, non il difetto');
});

test('CANCELLO: il nome tecnico come dettaglio secondario è ammesso, come etichetta principale no', () => {
  const nomiTecnici = ['web_search'];
  const ammesso = [
    { selettore: '.attrezzo__nome', testo: 'Ricerca sul web' },
    { selettore: '.attrezzo__dettagli code', testo: 'web_search', dentroCodice: true },
    { selettore: '.attrezzo__grezzo', testo: 'web_search', dettaglioTecnico: true },
  ];
  assert.deepEqual(testoGrezzo(ammesso, { nomiTecnici }), [],
    'la regola vieta che il nome tecnico sia l\'etichetta principale, non che esista');
  const vietato = [{ selettore: '.attrezzo__nome', testo: 'web_search' }];
  const difetti = testoGrezzo(vietato, { nomiTecnici });
  assert.equal(difetti.length, 1);
  assert.equal(difetti[0].tipo, 'nome-tecnico');
  assert.match(difetti[0].cosa, /web_search/);
});

test('CANCELLO: un difetto, una riga — il JSON non viene accusato anche di essere inglese', () => {
  const difetti = testoGrezzo([
    { selettore: '.esito', testo: 'REFUSED. Empty html: nothing was created.' },
  ]);
  assert.equal(difetti.length, 1, 'la riga è piena di parole inglesi, ma la cura è una sola');
  assert.equal(difetti[0].tipo, 'errore');
});

test('CANCELLO: una schermata italiana sana resta muta, e un ingresso storto non esplode', () => {
  const sana = [
    { selettore: '.intestazione', testo: 'Sessioni' },
    { selettore: '.stato', testo: 'Conclusa alle 14:32 · 12 attività · glm-5.3-flash' },
    { selettore: '.vuoto', testo: 'Nessuna sessione: premi «Nuova sessione» per cominciare' },
    { selettore: '.errore', testo: 'Errore: la cartella scelta non esiste più' },
    { selettore: '.spazi', testo: '   \n  ' },
  ];
  assert.deepEqual(testoGrezzo(sana, { nomiTecnici: ['web_search', 'document_create'] }), []);
  assert.deepEqual(testoGrezzo(null), []);
  assert.deepEqual(testoGrezzo(undefined, {}), []);
  assert.deepEqual(testoGrezzo([null, {}, { testo: '' }]), []);
});
