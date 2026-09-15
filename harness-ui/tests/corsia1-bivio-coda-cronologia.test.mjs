/*
 * ⛔⛔⛔ CORSIA 1 — SI ACCODA, E NON PARTE UN REINDIRIZZAMENTO.
 *
 * Il difetto, segnalato dall'owner due volte (11/09 «funziona malissimo», 13/09 «adesso quasi
 * inutilizzabile»): scrive mentre il modello lavora, vuole ACCODARE, e parte un REINDIRIZZAMENTO.
 *
 * ⛔ PREMESSA ACCERTATA PRIMA DI CURARE, e non solo nel sorgente. Le due cause stavano anche nel
 *   pacchetto servito `public/app.js`, cioè in ciò che l'owner ha davvero sotto le dita:
 *     · `[data-bivio="indirizza"]` prendeva il fuoco all'apertura del bivio
 *       (sorgente 9945, bundle 26494) ⇒ il secondo Invio — il gesto più naturale dopo il primo —
 *       attivava «Indirizza ora», perché un <button> col fuoco si attiva con Invio e con Spazio;
 *     · `redirectRunButton.hidden = !(attivo && haTesto)` (sorgente 9311) ⇒ il pulsante si scopre
 *       da solo mentre si scrive, dentro la barra del composer, e il clic parte senza chiedere.
 *   Le due rotte sono separate e vive (POST .../queue e POST .../redirect): la coda c'è, partiva
 *   l'altra.
 *
 * ⛔ QUANTE COSE GUARDA QUESTA MISURA — dichiarato, perché «verde» senza un numero non dice niente:
 *     · `decidiInvio` su 24 combinazioni (6 testi × 2 stati del giro × 2 stati di Ctrl). ⛔ I 24
 *       sono tutte le combinazioni di QUEI SEI testi, non tutte le stringhe possibili: i sei sono
 *       scelti per coprire le forme che il campo produce (vuoto, soli spazi, messaggio, comando
 *       `!`, comando muto `!!`). Il numero dice quanto guarda — non che guardi tutto;
 *     · il cancello del reindirizzamento su 7 provenienze;
 *     · la visibilità della scorciatoia su 8 combinazioni;
 *     · la cronologia su 13 prove, migrazione e tetto compresi;
 *     · il cablaggio nel monolite VERO su 6 asserzioni + 3 conteggi di chiamate, letti dal testo
 *       di `frontend/src/legacy/app.js`.
 *
 * ⛔ PROVATO NEL VERSO CHE DEVE FALLIRE, rompendo il codice di produzione e guardando il rosso —
 *   il resoconto della corsia porta i comandi e l'esito di ognuna delle rotture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AZIONE_ACCODA, AZIONE_BIVIO, AZIONE_COMANDO, AZIONE_INVIA,
  CHIAVE_CRONOLOGIA_V1, CHIAVE_CRONOLOGIA_V2, TETTO_CRONOLOGIA,
  ORIGINE_SCELTA_ESPLICITA, SCELTA_PREDEFINITA_BIVIO, SELETTORE_SCELTA_PREDEFINITA,
  creaCronologiaComposer, decidiInvio, mostraPulsanteReindirizzo, reindirizzoConsentito,
} from '../frontend/src/legacy/invio-durante-il-giro.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const MONOLITE = readFileSync(join(QUI, '..', 'frontend', 'src', 'legacy', 'app.js'), 'utf8');

/* ───────────────────── 1. L'Invio non produce MAI un reindirizzamento ───────────────────── */

test('⛔ NESSUNO dei 24 ingressi possibili dell Invio produce un reindirizzamento', () => {
  const testi = ['', '   ', 'ciao', 'accoda questo', '!echo ciao', '!!echo muto'];
  let visti = 0;
  for (const testo of testi) {
    for (const giroAttivo of [true, false]) {
      for (const conCtrl of [true, false]) {
        const azione = decidiInvio({ testo, giroAttivo, conCtrl });
        visti += 1;
        assert.notEqual(azione, 'indirizza', `«${testo}» giro=${giroAttivo} ctrl=${conCtrl} ha prodotto un reindirizzamento`);
        assert.ok([AZIONE_COMANDO, AZIONE_ACCODA, AZIONE_BIVIO, AZIONE_INVIA].includes(azione), `azione sconosciuta: ${azione}`);
      }
    }
  }
  assert.equal(visti, 24, 'la misura deve guardare tutte e 24 le combinazioni, non un sottoinsieme');
});

test('a giro acceso l Invio APRE IL BIVIO, e Ctrl+Invio accoda diretto', () => {
  assert.equal(decidiInvio({ testo: 'correggi il test', giroAttivo: true }), AZIONE_BIVIO);
  assert.equal(decidiInvio({ testo: 'correggi il test', giroAttivo: true, conCtrl: true }), AZIONE_ACCODA);
});

test('a giro spento l Invio manda e basta, col Ctrl o senza', () => {
  assert.equal(decidiInvio({ testo: 'ciao', giroAttivo: false }), AZIONE_INVIA);
  assert.equal(decidiInvio({ testo: 'ciao', giroAttivo: false, conCtrl: true }), AZIONE_INVIA);
});

test('⛔ un comando ! non è né un indirizzo né una coda, nemmeno a giro acceso', () => {
  assert.equal(decidiInvio({ testo: '!npm test', giroAttivo: true }), AZIONE_COMANDO);
  assert.equal(decidiInvio({ testo: '!npm test', giroAttivo: true, conCtrl: true }), AZIONE_COMANDO);
  assert.equal(decidiInvio({ testo: '!!npm test', giroAttivo: false }), AZIONE_COMANDO);
});

test('un campo vuoto a giro acceso non apre nessun bivio', () => {
  assert.equal(decidiInvio({ testo: '', giroAttivo: true }), AZIONE_INVIA);
});

/* ───────────────────── 2. Il bivio si apre sulla scelta che non fa danno ───────────────────── */

test('⛔ la scelta predefinita del bivio è ACCODA, non INDIRIZZA', () => {
  assert.equal(SCELTA_PREDEFINITA_BIVIO, 'accoda');
  assert.equal(SELETTORE_SCELTA_PREDEFINITA, '[data-bivio="accoda"]');
});

/* ───────────────────── 3. Il cancello: un reindirizzamento vuole una scelta ───────────────── */

test('⛔ il reindirizzamento passa SOLO da una scelta esplicita — 7 provenienze', () => {
  assert.equal(reindirizzoConsentito(ORIGINE_SCELTA_ESPLICITA), true);
  const respinte = [undefined, null, '', 'automatico', 'bivio', 'scelta', 0];
  for (const origine of respinte) {
    assert.equal(reindirizzoConsentito(origine), false, `«${String(origine)}» non doveva passare`);
  }
  assert.equal(respinte.length, 7);
});

/* ───────────────────── 4. La scorciatoia «Reindirizza», dichiarata ───────────────────── */

test('la scorciatoia si mostra solo a giro acceso e con del testo — 8 combinazioni', () => {
  let visti = 0;
  for (const giroAttivo of [true, false]) {
    for (const haTesto of [true, false]) {
      for (const scorciatoiaAbilitata of [true, false]) {
        const atteso = scorciatoiaAbilitata && giroAttivo && haTesto;
        assert.equal(mostraPulsanteReindirizzo({ giroAttivo, haTesto, scorciatoiaAbilitata }), atteso);
        visti += 1;
      }
    }
  }
  assert.equal(visti, 8);
});

test('⛔ spenta la scorciatoia, il pulsante non compare in NESSUNO stato', () => {
  for (const giroAttivo of [true, false]) {
    for (const haTesto of [true, false]) {
      assert.equal(mostraPulsanteReindirizzo({ giroAttivo, haTesto, scorciatoiaAbilitata: false }), false);
    }
  }
});

/* ───────────────────── 5. PO-21 — la freccia in su ───────────────────── */

function cronologiaFinta(iniziale = {}) {
  const deposito = { ...iniziale };
  return {
    deposito,
    cronologia: creaCronologiaComposer({
      leggi: (k) => (k in deposito ? deposito[k] : null),
      scrivi: (k, v) => { deposito[k] = v; },
    }),
  };
}

test('↑ ripesca i MESSAGGI normali, non solo i comandi', () => {
  const { cronologia } = cronologiaFinta();
  cronologia.ricorda('correggi il test instabile');
  assert.equal(cronologia.scorri(-1, { campoVuoto: true }), 'correggi il test instabile');
});

test('⛔ ↑ NON ruba il tasto a campo pieno: si scrive un messaggio lungo senza sorprese', () => {
  const { cronologia } = cronologiaFinta();
  cronologia.ricorda('un messaggio di ieri');
  assert.equal(cronologia.scorri(-1, { campoVuoto: false }), null, 'a campo pieno la freccia resta al cursore');
});

test('⛔ una volta partito lo scorrimento, ↑ continua anche se il campo ora è pieno', () => {
  const { cronologia } = cronologiaFinta();
  cronologia.ricorda('primo');
  cronologia.ricorda('secondo');
  assert.equal(cronologia.scorri(-1, { campoVuoto: true }), 'secondo');
  assert.equal(cronologia.scorri(-1, { campoVuoto: false }), 'primo');
});

test('⛔⛔ un messaggio ripescato NON diventa un comando di shell', () => {
  const { cronologia } = cronologiaFinta();
  cronologia.ricorda('spiega cosa hai fatto');
  const ripescato = cronologia.scorri(-1, { campoVuoto: true });
  assert.equal(ripescato, 'spiega cosa hai fatto');
  assert.ok(!ripescato.startsWith('!'), 'la vecchia cronologia rimetteva ! davanti a OGNI voce');
});

test('un comando ripescato resta un comando, col suo !', () => {
  const { cronologia } = cronologiaFinta();
  cronologia.ricorda('!npm test');
  assert.equal(cronologia.scorri(-1, { campoVuoto: true }), '!npm test');
});

test('⛔ le voci v1 (comandi salvati senza !) si migrano, non si fraintendono', () => {
  const { cronologia } = cronologiaFinta({ [CHIAVE_CRONOLOGIA_V1]: JSON.stringify(['npm test', 'git status']) });
  assert.deepEqual(cronologia.voci(), ['!npm test', '!git status']);
});

test('la v2, quando c è, vince sulla v1', () => {
  const { cronologia } = cronologiaFinta({
    [CHIAVE_CRONOLOGIA_V1]: JSON.stringify(['vecchio']),
    [CHIAVE_CRONOLOGIA_V2]: JSON.stringify(['nuovo verbatim']),
  });
  assert.deepEqual(cronologia.voci(), ['nuovo verbatim']);
});

test('↓ oltre il più recente torna al foglio bianco', () => {
  const { cronologia } = cronologiaFinta();
  cronologia.ricorda('unico');
  assert.equal(cronologia.scorri(-1, { campoVuoto: true }), 'unico');
  assert.equal(cronologia.scorri(+1, { campoVuoto: true }), '');
});

test('niente ripetizioni consecutive, e il tetto dichiarato tiene', () => {
  const { cronologia, deposito } = cronologiaFinta();
  cronologia.ricorda('stesso');
  cronologia.ricorda('stesso');
  assert.deepEqual(cronologia.voci(), ['stesso']);
  for (let i = 0; i < TETTO_CRONOLOGIA + 10; i += 1) cronologia.ricorda(`messaggio ${i}`);
  assert.equal(cronologia.voci().length, TETTO_CRONOLOGIA);
  assert.equal(JSON.parse(deposito[CHIAVE_CRONOLOGIA_V2]).length, TETTO_CRONOLOGIA);
});

test('il più recente sta per primo', () => {
  const { cronologia } = cronologiaFinta();
  cronologia.ricorda('vecchio');
  cronologia.ricorda('recente');
  assert.deepEqual(cronologia.voci(), ['recente', 'vecchio']);
});

test('⛔ un deposito che LANCIA non impedisce di mandare un messaggio', () => {
  /*
   * In una finestra privata, o coi dati di sito bloccati, `localStorage` LANCIA invece di
   * restituire vuoto. La prova che conta è che l'eccezione non esca: una cronologia assente non
   * deve mai impedire di mandare un messaggio.
   * ⭐ E la lettura in memoria resta buona per la sessione in corso — è il comportamento vero,
   *   misurato qui, non quello che avevo dato per scontato scrivendo la prova: ciò che si perde è
   *   solo la sopravvivenza a un F5, che è esattamente ciò che il deposito rotto non può dare.
   */
  const cronologia = creaCronologiaComposer({
    leggi: () => { throw new Error('finestra privata'); },
    scrivi: () => { throw new Error('finestra privata'); },
  });
  assert.doesNotThrow(() => cronologia.ricorda('un messaggio'));
  assert.equal(cronologia.scorri(-1, { campoVuoto: true }), 'un messaggio', 'la sessione in corso ricorda comunque');
});

test('⛔ col deposito rotto e niente ancora scritto, la freccia non consuma il tasto', () => {
  const cronologia = creaCronologiaComposer({
    leggi: () => { throw new Error('finestra privata'); },
    scrivi: () => { throw new Error('finestra privata'); },
  });
  assert.equal(cronologia.scorri(-1, { campoVuoto: true }), null);
});

test('una cronologia vuota non consuma il tasto', () => {
  const { cronologia } = cronologiaFinta();
  assert.equal(cronologia.scorri(-1, { campoVuoto: true }), null);
});

/* ───────────────────── 6. Il cablaggio nel monolite VERO ───────────────────── */

test('⛔ il monolite usa la regola estratta, e non una sua copia rimasta indietro', () => {
  assert.ok(MONOLITE.includes("from './invio-durante-il-giro.js'"), 'app.js non importa il modulo estratto');
  assert.ok(MONOLITE.includes('SELETTORE_SCELTA_PREDEFINITA'), 'il bivio non prende il fuoco dalla scelta predefinita');
  assert.ok(!/\$\('\[data-bivio="indirizza"\]', bivioInvio\)\?\.focus\(\)/.test(MONOLITE), 'il fuoco è ancora inchiodato su «Indirizza ora»');
  assert.ok(MONOLITE.includes('mostraPulsanteReindirizzo('), 'la visibilità della scorciatoia non passa dal modulo');
  assert.ok(MONOLITE.includes('ORIGINE_SCELTA_ESPLICITA'), 'i reindirizzamenti non dichiarano la loro provenienza');
  assert.ok(!MONOLITE.includes('`!${lista[prossimo]}`'), 'la vecchia cronologia rimette ! davanti a ogni voce ripescata');
});

test('⛔ ogni chiamata al reindirizzamento passa dal cancello', () => {
  /* Le chiamate legittime sono quelle dentro `chiediReindirizzamento`; fuori di lì nessuno deve
     poter far partire una POST /redirect senza dichiarare da dove viene. */
  const chiamate = [...MONOLITE.matchAll(/reindirizzaSessioneReale\(/g)].length;
  const dichiarazione = [...MONOLITE.matchAll(/async function reindirizzaSessioneReale\(/g)].length;
  const dalCancello = [...MONOLITE.matchAll(/chiediReindirizzamento\(/g)].length;
  assert.equal(dichiarazione, 1, 'una sola dichiarazione');
  assert.ok(dalCancello >= 3, `il cancello deve essere dichiarato e usato dai due punti di scelta (trovati ${dalCancello})`);
  assert.ok(chiamate <= 2, `reindirizzaSessioneReale è chiamata ${chiamate} volte: deve restare interna al cancello`);
});

test('⛔ nessun segnaposto del composer promette che l Invio REINDIRIZZI', () => {
  /*
   * 13/09, trovato in review: a giro SPENTO il segnaposto diceva «Scrivi… Invio indirizza il giro
   * in corso». A riposo non c'è nessun giro da indirizzare, e `decidiInvio` non restituisce un
   * reindirizzamento in nessuno dei 24 ingressi: erano le parole sullo schermo a smentire la regola
   * di questo modulo, una riga sotto la cura — ed è il modello mentale sbagliato da cui nasce il
   * difetto segnalato dall'owner. La regola giusta nel codice non basta se la UI insegna l'altra.
   *
   * ⛔⛔ QUESTA GUARDIA È NATA INERTE, e vale più della cura che protegge. Prima versione scritta
   *   con una regex, arrivata nel file senza le sue barre rovesce (le classi tipo «spazio» ridotte
   *   a lettere normali): non poteva più trovare NIENTE, e un cancello che guarda il vuoto passa
   *   sempre. Una regex che perde gli escape non protesta — TACE. L'unica ragione per cui si è
   *   vista è l'asserzione «ho trovato almeno un segnaposto», che qui vale quanto la guardia.
   * ⇒ Niente regex: si taglia per testo, e il cancello dichiara quanti segnaposto ha in mano.
   */
  const segnaposto = MONOLITE.split('composerInput.placeholder')
    .slice(1)
    .map((pezzo) => pezzo.slice(0, pezzo.indexOf(';')));
  assert.ok(segnaposto.length >= 1, 'nessun segnaposto trovato: il cancello starebbe guardando il vuoto');
  assert.ok(segnaposto.some((r) => r.includes('Scrivi')), 'il cancello non ha in mano i segnaposto veri del composer');
  for (const riga of segnaposto) {
    assert.ok(!riga.includes('Invio indirizza'), `un segnaposto promette che l'Invio reindirizza: ${riga.trim()}`);
  }
});
