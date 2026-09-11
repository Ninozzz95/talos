import test from 'node:test';
import assert from 'node:assert/strict';
import { statoAvvioSessione, nomeCartellaScelta, PERMESSO_PER_CARTELLA_LIBERA } from '../../src/components/avvio-sessione.js';

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

test('il blocco VERO resta: un percorso libero senza «Accesso pieno» non parte — ma dice perché, col nome umano', () => {
  for (const permesso of ['Read only', 'Workspace write', 'On request']) {
    const esito = statoAvvioSessione({ cartella: FUORI, permesso });
    assert.equal(esito.puoAvviare, false, `«${permesso}» non deve poter partire: lo rifiuta il server`);
    assert.equal(esito.situazione, 'permesso-insufficiente');
    assert.equal(esito.rimedioSu, 'permesso');
    assert.match(esito.motivo, /Accesso pieno/u, 'la ragione deve nominare il permesso che serve');
    assert.match(esito.motivo, /progetto-mio/u, 'e deve nominare la cartella di cui sta parlando');
    // ⛔ Mai il valore del kernel a schermo: né nel bottone né nella frase.
    assert.doesNotMatch(`${esito.etichetta} ${esito.motivo}`, /Full access|Read only|Workspace write|On request/u);
  }
});

test('⛔ AL CONTRARIO — con «Accesso pieno» lo stesso percorso libero parte davvero', () => {
  const esito = statoAvvioSessione({ cartella: FUORI, permesso: PERMESSO_PER_CARTELLA_LIBERA });
  assert.equal(esito.puoAvviare, true);
  assert.equal(esito.situazione, 'pronto');
  assert.match(esito.etichetta, /Continua nella chat — progetto-mio/u);
});

test('una cartella dell’allowlist parte con TUTTI e quattro i permessi (era già così, e deve restarlo)', () => {
  for (const permesso of ['Read only', 'Workspace write', 'On request', 'Full access']) {
    const esito = statoAvvioSessione({ cartella: AUTORIZZATA, permesso });
    assert.equal(esito.puoAvviare, true, `«${permesso}» su una cartella autorizzata deve partire`);
    assert.match(esito.etichetta, /Continua nella chat — AVM/u);
    assert.match(esito.motivo, /resterà nella cartella scelta/u);
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
