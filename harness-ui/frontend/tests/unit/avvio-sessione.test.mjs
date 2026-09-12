import test from 'node:test';
import assert from 'node:assert/strict';
import { statoAvvioSessione, nomeCartellaScelta } from '../../src/components/avvio-sessione.js';

/*
 * BC-14. Ogni prova ha due metà: il difetto VERO dell'11/09 che deve essere trovato, e il caso
 * sano che NON deve essere accusato. Il difetto, riprodotto sul banco, era doppio — il bottone si
 * bloccava E la ragione mostrata era falsa — quindi le prove guardano tutte e due le cose, mai
 * solo lo stato del bottone: uno stato giusto con una frase falsa è ancora un difetto.
 */

const FUORI = { path: 'C:/altrove/progetto-mio', projectId: null };
const AUTORIZZATA = { path: 'C:/progetti/AVM', projectId: '0' };
const DA_ESPLORA_FILE = { path: null, name: 'cartella-scelta-col-tasto-destro', launchId: 'A'.repeat(32), projectId: null };

test('⛔ IL DIFETTO DELL’OWNER: con una cartella scelta, «Scegli una cartella» non si dice più — con NESSUNO dei quattro permessi', () => {
  for (const permesso of ['Read only', 'Workspace write', 'On request', 'Full access']) {
    const esito = statoAvvioSessione({ cartella: FUORI, permesso });
    assert.doesNotMatch(
      esito.etichetta,
      /scegli una cartella/iu,
      `con «${permesso}» il bottone diceva ancora di scegliere una cartella che è GIÀ scelta`,
    );
    assert.doesNotMatch(esito.motivo, /scegli una cartella/iu, `la ragione con «${permesso}» è ancora quella falsa`);
    // ⛔ E il bottone non è mai spento: spento non dice perché. Spento è solo «sto aprendo».
    assert.equal(esito.disabilitato, false, `con «${permesso}» il bottone è ancora disabilitato`);
  }
});

test('⛔ AL CONTRARIO — senza cartella «Scegli una cartella» è VERO, e resta', () => {
  for (const cartella of [null, undefined, {}, { path: '', launchId: '' }]) {
    const esito = statoAvvioSessione({ cartella, permesso: 'Workspace write' });
    assert.equal(esito.situazione, 'senza-cartella');
    assert.equal(esito.etichetta, 'Scegli una cartella');
    assert.equal(esito.puoAvviare, false);
    assert.equal(esito.rimedioSu, 'cartella', 'premendolo si deve finire sull’albero, non sui permessi');
  }
});

/*
 * ⛔⛔⛔ 12/09 — BC-14, secondo giro. Questa prova esigeva l'OPPOSTO: «un percorso libero senza
 * «Accesso pieno» non parte». Era fedele al server dell'11/09, e il server aveva torto: il
 * cancello (`session-registry.mjs`, `avviaLibero`) è stato tolto nello stesso lotto — l'ambito di
 * una cartella scelta a mano lo tiene `cartellaGiaScelta`, non il permesso, quindi quel cancello
 * non restringeva niente e obbligava al livello di accesso più alto. Owner: «il pulsante dice
 * serve accesso pieno».
 */
test('⛔ IL DIFETTO DEL 12/09: una cartella scelta a mano parte con TUTTI e quattro i permessi', () => {
  for (const permesso of ['Read only', 'Workspace write', 'On request', 'Full access']) {
    const esito = statoAvvioSessione({ cartella: FUORI, permesso });
    assert.equal(esito.puoAvviare, true, `«${permesso}» su una cartella scelta a mano deve partire`);
    assert.equal(esito.situazione, 'pronto');
    assert.equal(esito.rimedioSu, null);
    assert.match(esito.etichetta, /Continua nella chat — progetto-mio/u);
    assert.doesNotMatch(esito.etichetta, /Serve/u, 'la frase segnalata dall’owner non deve poter tornare');
    if (permesso !== 'Full access') {
      // ⛔ «Accesso pieno» può comparire solo quando è il permesso SCELTO, mai come cosa che manca.
      assert.doesNotMatch(`${esito.etichetta} ${esito.motivo}`, /Accesso pieno/u, 'nominarlo qui rimetterebbe la richiesta che l’owner ha segnalato');
    }
  }
});

test('il PERMESSO comanda la frase del piede: quattro promesse diverse sulla stessa cartella', () => {
  const per = (permesso) => statoAvvioSessione({ cartella: FUORI, permesso }).motivo;

  assert.match(per('Read only'), /legge progetto-mio e non ci scrive niente/u);
  assert.match(per('Workspace write'), /resterà nella cartella scelta: scrive solo dentro progetto-mio/u);
  assert.match(per('On request'), /chiederà conferma prima di ogni scrittura/u);
  assert.match(per('Full access'), /senza i cancelli ordinari/u);

  // ⛔ Al contrario: quattro frasi DIVERSE, non la stessa con un nome sostituito.
  const frasi = new Set(['Read only', 'Workspace write', 'On request', 'Full access'].map(per));
  assert.equal(frasi.size, 4, 'due permessi che promettono la stessa cosa sono una frase che non dice niente');

  // ⛔ E ognuna dice che la cartella è fuori dai progetti autorizzati: è vero, e serve a chi avvia.
  for (const permesso of ['Read only', 'Workspace write', 'On request', 'Full access']) {
    assert.match(per(permesso), /Non è fra i progetti già autorizzati/u);
    // ⛔ …e lo dice UNA volta sola: nella foto del 12/09 il nome della cartella compariva due volte
    //   nella stessa riga di piede. Una riga che si ripete si smette di leggere.
    assert.ok((per(permesso).match(/progetto-mio/gu) ?? []).length <= 1, `il nome della cartella è ripetuto nella riga di «${permesso}»`);
  }
});

test('⛔ Mai il valore del kernel a schermo, con nessuno dei quattro permessi', () => {
  for (const permesso of ['Read only', 'Workspace write', 'On request', 'Full access']) {
    for (const cartella of [FUORI, AUTORIZZATA, DA_ESPLORA_FILE]) {
      const esito = statoAvvioSessione({ cartella, permesso });
      assert.doesNotMatch(
        `${esito.etichetta} ${esito.motivo}`,
        /Full access|Read only|Workspace write|On request/u,
        `il valore grezzo «${permesso}» è finito a schermo`,
      );
    }
  }
});

test('⛔ AL CONTRARIO — un permesso SCONOSCIUTO non si racconta: si nomina e basta, senza inventargli poteri', () => {
  const esito = statoAvvioSessione({ cartella: FUORI, permesso: 'Qualcosa di nuovo' });
  assert.equal(esito.puoAvviare, true);
  assert.match(esito.motivo, /Permesso scelto: «Qualcosa di nuovo»/u);
  assert.doesNotMatch(esito.motivo, /non ci scrive niente|senza i cancelli/u, 'mai promettere un comportamento per un permesso che non conosciamo');
});

test('una cartella dell’allowlist parte con TUTTI e quattro i permessi (era già così, e deve restarlo)', () => {
  for (const permesso of ['Read only', 'Workspace write', 'On request', 'Full access']) {
    const esito = statoAvvioSessione({ cartella: AUTORIZZATA, permesso });
    assert.equal(esito.puoAvviare, true, `«${permesso}» su una cartella autorizzata deve partire`);
    assert.match(esito.etichetta, /Continua nella chat — AVM/u);
    assert.match(esito.motivo, /AVM|cartella scelta/u, 'la frase deve comunque parlare della cartella scelta');
    // ⛔ Una cartella GIÀ autorizzata non si annuncia come esterna: quella coda è solo per le altre.
    assert.doesNotMatch(esito.motivo, /non è fra i progetti già autorizzati/u);
  }
});

test('⛔ IL SECONDO DIFETTO, non segnalato: la cartella del tasto destro era bloccata da noi, non dal server', () => {
  /*
   * Il server non chiede nessun permesso particolare per `workspaceLaunchId`, e lo provano due suoi
   * test verdi: `harness-ui/tests/session-registry.test.mjs:928` e
   * `harness-ui/tests/http-routes-workspace-launch.test.mjs:106` avviano con «Workspace write» e si
   * aspettano successo. Il frontend la bloccava lo stesso: un blocco su una combinazione che il
   * server accetta, cioè un divieto inventato qui.
   */
  for (const permesso of ['Read only', 'Workspace write', 'On request', 'Full access']) {
    const esito = statoAvvioSessione({ cartella: DA_ESPLORA_FILE, permesso });
    assert.equal(esito.puoAvviare, true, `«${permesso}» dal tasto destro lo accetta il server: qui non si blocca`);
    assert.match(esito.etichetta, /cartella-scelta-col-tasto-destro/u, 'si mostra il NOME: il percorso non attraversa il browser');
    assert.match(esito.motivo, /Esplora file/u);
  }
});

test('mentre la cartella si apre il bottone è spento — l’unico caso in cui spegnerlo è onesto', () => {
  const esito = statoAvvioSessione({ cartella: AUTORIZZATA, permesso: 'Workspace write', occupato: true });
  assert.equal(esito.disabilitato, true);
  assert.equal(esito.puoAvviare, false);
  assert.equal(esito.etichetta, 'Apro la cartella…');
  assert.equal(esito.rimedioSu, null, 'non c’è niente da rimediare: c’è solo da aspettare');
});

test('il nome della cartella: l’ultimo pezzo del percorso, o il nome quando il percorso non può esistere', () => {
  assert.equal(nomeCartellaScelta({ path: 'C:/progetti/AVM/' }), 'AVM');
  assert.equal(nomeCartellaScelta({ path: 'C:\\progetti\\AVM' }), 'AVM');
  assert.equal(nomeCartellaScelta({ path: null, name: 'dal-tasto-destro' }), 'dal-tasto-destro');
  assert.equal(nomeCartellaScelta(null), '');
});
