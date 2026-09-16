import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { impostaLingua } from '../../src/components/lingua.js';
import { TESTI, frasePerGenere, rimedioPerGenere } from '../../src/components/browser.js';

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE della corsia B — QUATTRO GUARDIE NATE DA UNA BOCCIATURA.
 *
 * Il controllore ha bocciato la consegna precedente e gli addebiti hanno tutti la stessa forma:
 * una cosa DETTA e non MISURATA. Questo file misura quelle che si leggono dal sorgente e dal
 * dizionario; l'annullamento vero si misura sulla app in `tests/browser/browser-p0.spec.mjs`,
 * perché è un fatto di rete e non di testo.
 *
 * 1. IL PANNELLO MEZZO IN INGLESE. Il commit del 16/09 dichiarava riparata la lingua del pannello;
 *    le foto consegnate mostravano, alla lettera, «I could not open this page» sopra «Il sito non
 *    ha risposto in tempo (6 secondi)». ⛔ Non era una riga dimenticata in `en.js`: era
 *    STRUTTURALE. Il server componeva la frase con un NUMERO dentro (`browser-frame.mjs`) e il
 *    client la passava a `t()`, che è un dizionario a chiavi fisse — una chiave con un numero
 *    dentro non ci potrà MAI essere, per nessuna lingua e per nessun numero.
 *    Ricerca 16/09/2026 (api-craft «Shall REST API error messages be internationalized?»:
 *    «locale-neutral errors with well-defined error values… allows the consumer to localize the
 *    message»; lingui.dev «Explicit vs generated IDs»): il servizio manda un CODICE stabile e i
 *    suoi parametri, chi disegna compone la frase nella lingua di chi guarda. La frase del server
 *    resta, ma come diagnostica — non è ciò che si mostra.
 *
 * 2. IL RIMEDIO SCELTO CON UNA REGEX SULL'ITALIANO. `rimedioPerIlMotivo` leggeva la frase del
 *    server con quattro espressioni regolari («non esiste», «certificato», …): in inglese non
 *    aggancia niente, e cambiare una parola nel server spegneva il rimedio in silenzio.
 *
 * 3. LO STATO DI UNA LINGUETTA PORTATO DAL SOLO COLORE. Il blocco CSS del 16/09 coloriva l'icona
 *    di una scheda in errore, e quell'icona è `aria-hidden`. WCAG 1.4.1 «Use of Color» (Livello A,
 *    riletto il 16/09/2026 su testparty.ai e accessibility.chat: «screen readers don't announce
 *    colors… combine color with text labels, icons, or patterns»). ⇒ servono TRE canali: colore,
 *    FORMA (un'icona diversa) e TESTO (`sr-only`, che si ascolta).
 *
 * 4. L'ID DI RIPIEGO CHE COLLIDE COL CONTATORE. Il contatore delle letture nuove partiva da 1
 *    (`lettura-1`) e il ripiego delle letture senza id partiva da 0 (`lettura-0`, `lettura-1`…):
 *    in una sessione già aperta la seconda lettura vecchia e la prima nuova finivano con LO STESSO
 *    id — due schede, un modo solo, una chiusura che ne nasconde due. Gli spazi dei nomi si
 *    separano per costruzione, non per fortuna (MDN «WebExtensions tabs»: un id non si riusa).
 */

const SORGENTE = readFileSync(new URL('../../src/components/browser.js', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const CODICE = senzaCommenti(SORGENTE);
const CODICE_APP = senzaCommenti(APP);

/** I generi che il server sa nominare (`classificaGuasto` + `valutaIntestazioni`, browser-frame.mjs). */
const GENERI = ['timeout', 'dns', 'rifiuto', 'certificato', 'rete', 'indirizzo', 'xfo-deny', 'xfo-sameorigin', 'frame-ancestors'];

test('IL PANNELLO PARLA UNA LINGUA SOLA: ogni genere ha la sua frase, e in inglese è inglese', () => {
  impostaLingua('en');
  try {
    for (const genere of GENERI) {
      const frase = frasePerGenere(genere, { secondi: 6 });
      assert.ok(frase, `il genere «${genere}» deve avere una frase sua: senza, si ricade sul testo del server`);
      assert.ok(!/(sito|indirizzo|risposto|cornice|raggiungere|valido)/i.test(frase),
        `«${genere}» resta in italiano quando la lingua è inglese: ${frase}`);
    }
    // il numero dei secondi è un PARAMETRO, non parte della chiave: è tutta la differenza
    assert.match(frasePerGenere('timeout', { secondi: 6 }), /\b6\b/, 'i secondi veri devono comparire nella frase');
    assert.match(frasePerGenere('timeout', { secondi: 11 }), /\b11\b/, 'e devono essere quelli che dice il server, non una costante');
  } finally { impostaLingua('it'); }
});

test('IL PANNELLO PARLA UNA LINGUA SOLA, AL CONTRARIO: un genere sconosciuto non inventa una frase', () => {
  assert.equal(frasePerGenere('genere-che-non-esiste', {}), '', 'meglio niente che una frase sbagliata detta con sicurezza');
  assert.equal(frasePerGenere(null, {}), '');
});

test('LA FRASE DEL SERVER NON PASSA PIÙ DAL DIZIONARIO (era la causa del pannello mezzo inglese)', () => {
  /* ⛔ 16/09 — questa guardia è stata RAFFORZATA dopo averla vista sopravvivere alla sua stessa
     rottura: la prima versione cercava `t(s.motivo)` alla lettera, e `t(String(s?.motivo))` le
     passava sotto. Ora si vieta `motivo` DENTRO una chiamata a `t(`, comunque sia avvolto. */
  const dentroUnT = CODICE.match(/\bt\(([^;\n]*)\)/g) || [];
  const colMotivo = dentroUnT.filter((x) => /\bmotivo\b/.test(x));
  assert.deepEqual(colMotivo, [],
    'una frase composta dal server non entra in t(): quella chiave non sarà mai nel dizionario, per nessun numero');
  assert.match(CODICE, /frasePerGenere\(s\?\.genere/, 'il pannello compone la frase dal genere della scheda');
});

test('IL RIMEDIO SI SCEGLIE DAL GENERE, non leggendo l’italiano con una regex', () => {
  assert.doesNotMatch(CODICE, /non esiste\|ERR_NAME/, 'la regex sull’italiano non aggancia niente in inglese');
  for (const genere of ['dns', 'certificato', 'timeout', 'rifiuto']) {
    assert.ok(rimedioPerGenere(genere), `il genere «${genere}» deve portare il suo rimedio`);
  }
  assert.notEqual(rimedioPerGenere('dns'), rimedioPerGenere('rifiuto'), 'due guasti diversi, due consigli diversi');
});

test('IL RIMEDIO, AL CONTRARIO: un genere senza rimedio proprio ricade su «chiedi all’agente», non sul vuoto', () => {
  const generico = rimedioPerGenere('xfo-deny');
  assert.ok(generico && generico.length > 4, 'una scheda ferma senza un consiglio è uno schermo vuoto con più parole');
});

test('OGNI FRASE NUOVA È NEL DIZIONARIO: le frasi dei guasti nascono da TESTI, che il cancello i18n legge', () => {
  impostaLingua('it');
  const stringhe = Object.values(TESTI).filter((v) => typeof v === 'string');
  for (const genere of GENERI) {
    const italiano = frasePerGenere(genere, { secondi: 6 });
    const daTesti = stringhe.some((s) => s === italiano || s.replace(/\{[a-z]+\}/g, '6') === italiano);
    assert.ok(daTesti, `la frase di «${genere}» («${italiano}») deve stare in TESTI, o il cancello i18n non la vede`);
  }
});

test('LO STATO DI UNA LINGUETTA NON È SOLO COLORE: forma diversa e testo che si ascolta (WCAG 1.4.1)', () => {
  /* ⛔ 16/09 — anche questa è stata rafforzata: cercare il NOME della costante la lasciava verde
     con la costante definita e mai usata. Si cerca l'USO, cioè dove la forma arriva all'icona. */
  assert.match(CODICE, /setAttribute\('href', ICONA_PER_STATO\[/, 'la FORMA dell’icona deve dipendere dallo stato, non solo il colore');
  assert.match(CODICE, /sr-only/, 'lo stato va scritto anche per chi ascolta: un lettore di schermo non annuncia i colori');
  assert.match(CODICE, /etichettaStatoScheda/, 'la parola dello stato è una sola, in un posto solo');
});

test('LO STATO DI UNA LINGUETTA, AL CONTRARIO: una scheda a posto non aggiunge rumore', () => {
  assert.match(CODICE, /etichettaStatoScheda\(/, 'esiste la funzione che dà la parola');
  assert.doesNotMatch(CODICE, /etichettaStatoScheda\('loaded'\)/, 'per una scheda sana non si scrive niente: sarebbe rumore su ogni riga');
});

test('GLI ID NON POSSONO COLLIDERE: il ripiego delle letture vecchie ha uno spazio di nomi suo', () => {
  const modelli = CODICE_APP.match(/`lettura-[^`]*`/g) || [];
  assert.ok(modelli.length >= 2, 'devono esserci almeno il contatore e il ripiego');
  const contatori = modelli.filter((m) => /browserProssimoId/.test(m));
  assert.equal(contatori.length, 1, 'il contatore che battezza una lettura nuova è UNO solo');
  const altri = modelli.filter((m) => !/browserProssimoId/.test(m));
  const collidenti = altri.filter((m) => !/^`lettura-e/.test(m));
  assert.deepEqual(collidenti, [],
    `questi nomi possono coincidere con quelli del contatore (\`lettura-1\`, \`lettura-2\`…): ${altri.join(' ')}`);
  assert.match(CODICE_APP, /function idDiLettura\(/, 'un solo posto decide l’id di una lettura: tre copie divergono');
});

test('GLI ID, AL CONTRARIO: chiudere una scheda continua a riconoscere ENTRAMBE le famiglie', () => {
  assert.match(CODICE_APP, /id\.startsWith\('lettura-'\)/,
    'la chiusura distingue lettura e pagina viva dal prefisso: il ripiego deve restare dentro quel prefisso');
});
