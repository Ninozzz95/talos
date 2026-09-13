/*
 * ⛔⛔⛔ CORSIA 2, IL RESIDUO: LA CURA NON ARRIVAVA ALLO SCHERMO.
 *
 * Il difetto visibile: reindirizzare produceva una CARTA ROSSA che dava la colpa a chi legge —
 * «il giro si è interrotto per un errore, apri Doctor». Non era successo niente di male: aveva
 * solo cambiato direzione.
 *
 * ⛔ PERCHÉ UNA PROVA NUOVA, con `frontend/tests/unit/errori.test.mjs` già VERDE su questo.
 *   Quel file prova il MODULO: `spiegaErrore` con l'origine passata a mano risponde benissimo, e
 *   `vestizioneErrore` dichiara `silenziosa: true` da stamattina. Era verde mentre la carta rossa
 *   usciva davvero, perché nessuno provava la CATENA. È la forma dodicesima del 13/09 — una misura
 *   che non può smentirti: se passi tu l'origine, la funzione la userà sempre.
 *
 * ⛔ LA CATENA AVEVA TRE ANELLI ROTTI, e in tabella ne era dichiarato UNO:
 *     1. `legacy/app.js` chiamava `spiegaErrore(messaggio, codice)` — due argomenti su tre. Senza
 *        il terzo la famiglia `reindirizzato` era IRRAGGIUNGIBILE per costruzione: la sua regola
 *        pretende `origine === ORIGINI.REINDIRIZZAMENTO` (`errori.js` r. 332).
 *     2. `silenziosa` non lo leggeva NESSUNO: compariva solo nella propria definizione e in un
 *        test. Anche con l'origine giusta, la carta sarebbe uscita lo stesso.
 *     3. `appendStatusNote(..., isError=true, …)` chiama `aggiornaTickGiro({tono:'danger'})`: il
 *        rosso ha DUE manifestazioni — la carta e il tick del giro. Zittire solo la prima avrebbe
 *        lasciato l'altra a dire la stessa bugia, più piccola.
 *
 * ⛔ QUANTE COSE GUARDA QUESTA MISURA — dichiarato, perché «verde» senza un numero non dice niente:
 *     · la funzione della provenienza su 5 ingressi (in volo, non in volo, campo assente, oggetto
 *       vuoto, nessun argomento);
 *     · la catena intera su 4 messaggi di fermo su richiesta, nei DUE versi (con e senza origine);
 *     · i guasti veri su 3 messaggi, mentre un reindirizzamento è in volo — devono restare rossi;
 *     · il cablaggio nel monolite VERO su 5 asserzioni lette dal testo di
 *       `frontend/src/legacy/app.js`, ORDINE COMPRESO.
 *
 * ⛔ E GUARDA ANCHE L'ORDINE, non solo la presenza: `if (vestizione.silenziosa) return;` deve stare
 *   PRIMA della riga che colora il tick. Una guardia giusta messa dopo è una guardia assente, e la
 *   sola presenza della riga non lo direbbe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ORIGINI, provenienzaDelGiroFinito, spiegaErrore, vestizioneErrore,
} from '../frontend/src/components/errori.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const MONOLITE = readFileSync(join(QUI, '..', 'frontend', 'src', 'legacy', 'app.js'), 'utf8');

/* Le forme con cui un fermo su richiesta arriva davvero: l'italiano del motore e l'inglese del browser. */
const FERMI_SU_RICHIESTA = [
  ['⛔ interrotto su richiesta.', 'fermato'],
  ['⛔ interrotto su richiesta: nuova direzione', 'fermato'],
  ['This operation was aborted', 'internal-error'],
  ['', 'fermato'],
];

/* Guasti VERI, che non smettono di essere guasti perché un reindirizzamento è in volo. */
const GUASTI_VERI = [
  ['fetch failed: ECONNREFUSED 127.0.0.1:8080', 'internal-error', 'rete'],
  ['HTTP 429 rate limit exceeded', 'internal-error', 'quota'],
  ['exceeds the available context size (16384 tokens)', 'internal-error', 'contesto-pieno'],
];

/* ───────────────── 1. La provenienza: torna `null` quando non sa, e non indovina ───────────────── */

test('CORSIA2-PROV — la provenienza si dichiara solo quando si sa, mai indovinata', () => {
  assert.deepEqual(
    provenienzaDelGiroFinito({ reindirizzamentoInVolo: true }),
    { origine: ORIGINI.REINDIRIZZAMENTO },
    'con un reindirizzamento in volo la provenienza è quella, e va detta',
  );
  /*
   * ⛔ I quattro casi qui sotto tornano tutti UN OGGETTO VUOTO, e non `{origine: ORIGINI.STOP}`.
   *   Cercate sette forme di uno stop esplicito nel monolite il 13/09 (`stopRequest`, `stopPending`,
   *   `richiestaStop`, `RunStopped`…): nessuna esiste. Quindi «nessun reindirizzamento in volo» NON
   *   significa «la persona ha premuto Ferma» — può essere un guasto vero che nessuno ha chiesto.
   */
  for (const [nome, ingresso] of [
    ['non in volo', { reindirizzamentoInVolo: false }],
    ['campo assente', {}],
    ['campo esplicitamente indefinito', { reindirizzamentoInVolo: undefined }],
    ['nessun argomento', undefined],
  ]) {
    assert.deepEqual(provenienzaDelGiroFinito(ingresso), {}, `${nome}: provenienza IGNOTA, non «stop»`);
  }
});

test('CORSIA2-PROV-NO-STOP — nessuno inventa uno stop che nessuno ha chiesto', () => {
  const valori = [
    provenienzaDelGiroFinito({ reindirizzamentoInVolo: false }),
    provenienzaDelGiroFinito({}),
    provenienzaDelGiroFinito(),
  ];
  for (const v of valori) assert.notEqual(v.origine, ORIGINI.STOP, 'lo stop non si deduce da un’assenza');
});

/* ───────────────── 2. La catena intera, nei due versi ───────────────── */

test('CORSIA2-CATENA — con la provenienza il cambio di direzione NON è un guasto, e non si disegna', () => {
  for (const [messaggio, codice] of FERMI_SU_RICHIESTA) {
    const contesto = provenienzaDelGiroFinito({ reindirizzamentoInVolo: true });
    const s = spiegaErrore(messaggio, codice, contesto);
    assert.equal(s.famiglia, 'reindirizzato', `«${messaggio}» non è stato riconosciuto come cambio di direzione`);
    assert.equal(s.origine, ORIGINI.REINDIRIZZAMENTO);
    assert.doesNotMatch(s.cosa, /errore|guasto/i, 'non è un errore, e non lo si dice');
    assert.equal(s.rimedi.length, 0, 'non c’è niente da rimediare: il giro riparte da solo');
    assert.equal(s.tecnico, messaggio, 'il testo del server non sparisce mai');

    const vestizione = vestizioneErrore(s);
    assert.equal(vestizione.silenziosa, true, 'la famiglia chiede di non essere disegnata affatto');
    assert.notEqual(vestizione.tono, 'danger', 'nessuna carta rossa per chi ha solo cambiato strada');
  }
});

test('CORSIA2-CATENA-AL-CONTRARIO — SENZA la provenienza la famiglia è IRRAGGIUNGIBILE (era il difetto)', () => {
  /*
   * ⛔ È questa la prova che MORDE, ed è la riproduzione esatta del difetto: gli stessi messaggi,
   *   la stessa funzione, due argomenti invece di tre. Se un domani qualcuno togliesse il terzo
   *   argomento dal monolite, `CORSIA2-CABLAGGIO` diventerebbe rossa — e questa dice PERCHÉ.
   */
  for (const [messaggio, codice] of FERMI_SU_RICHIESTA) {
    const s = spiegaErrore(messaggio, codice);
    assert.notEqual(s.famiglia, 'reindirizzato', 'senza origine non si può dichiarare un cambio di direzione');
    assert.equal(s.origine, null, 'una provenienza che non si conosce resta nulla, non si indovina');
    assert.notEqual(vestizioneErrore(s).silenziosa, true, 'senza origine la nota si disegna: è il difetto di partenza');
  }
});

test('CORSIA2-GUASTI-VERI — un guasto vero resta rosso anche mentre un reindirizzamento è in volo', () => {
  /*
   * ⛔ Il trabocchetto: chi chiama sa che un reindirizzamento è pendente, ma il giro può essersi
   *   chiuso per un guasto VERO nello stesso istante. La provenienza da sola non basta — la regola
   *   pretende ANCHE che l'esito sia davvero un fermo su richiesta.
   */
  const contesto = provenienzaDelGiroFinito({ reindirizzamentoInVolo: true });
  for (const [messaggio, codice, atteso] of GUASTI_VERI) {
    const s = spiegaErrore(messaggio, codice, contesto);
    assert.equal(s.id, atteso, `un ${atteso} si travestiva da cambio di direzione`);
    assert.notEqual(s.famiglia, 'reindirizzato');
    const vestizione = vestizioneErrore(s);
    assert.equal(vestizione.tono, 'danger', 'un guasto vero resta rosso');
    assert.notEqual(vestizione.silenziosa, true, 'un guasto vero si vede sempre');
  }
});

/* ───────────────── 3. Il cablaggio nel monolite VERO ───────────────── */

test('CORSIA2-CABLAGGIO — i tre anelli sono attaccati nel monolite, e nell’ORDINE giusto', () => {
  assert.ok(
    MONOLITE.includes('provenienzaDelGiroFinito, spiegaErrore'),
    'app.js non importa la funzione della provenienza',
  );
  assert.ok(
    MONOLITE.includes('spiegaErrore(evento.message, evento.code, provenienzaDelGiroFinito('),
    'il RunError chiama ancora spiegaErrore con DUE argomenti: la famiglia resta irraggiungibile',
  );
  assert.ok(
    MONOLITE.includes('reindirizzamentoInVolo: Boolean(state.realSession.redirectPendingId)'),
    'la provenienza non viene ricavata dallo stato del reindirizzamento',
  );
  assert.ok(
    MONOLITE.includes('if (vestizione.silenziosa) return;'),
    'chi disegna non legge ancora `silenziosa`: la carta esce comunque',
  );
  /*
   * ⛔ L'ORDINE, che la sola presenza non direbbe: uscire DOPO aver colorato il tick lascerebbe
   *   metà del rosso a schermo. Una guardia giusta messa nel posto sbagliato è una guardia assente.
   */
  assert.ok(
    MONOLITE.indexOf('if (vestizione.silenziosa) return;')
      < MONOLITE.indexOf("if (isError) aggiornaTickGiro({ tono: 'danger' });"),
    'la nota tace ma il tick del giro diventa rosso lo stesso: mezza cura',
  );
});

test('CORSIA2-NIENTE-STOP-INVENTATO — il monolite non deduce uno stop da un’assenza', () => {
  assert.ok(
    !MONOLITE.includes('ORIGINI.STOP'),
    'qualcuno ha dedotto «la persona ha premuto Ferma» dall’assenza di un reindirizzamento: è una provenienza inventata',
  );
});
