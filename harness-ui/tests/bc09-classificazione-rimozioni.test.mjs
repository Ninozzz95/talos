import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * BC-09 — LA CLASSIFICAZIONE DELLE RIMOZIONI, e il cancello che la fa rispettare.
 *
 * La cura di BC-09 non e' «mettere i ritentativi ovunque». La coda lo dice: «prima di adottarlo,
 * chiedersi caso per caso se quella cartella dovrebbe gia' essere vuota — un ritentativo
 * generalizzato nasconderebbe un file che nessuno ha chiuso, che invece e' una cosa da sapere».
 *
 * ⇒ Due classi, e il criterio e' UNO SOLO, verificabile leggendo la prova:
 *
 *   CLASSE A — teardown innocuo. Nella cartella temporanea ci sono solo file che gli store
 *     scrivono e chiudono dentro la chiamata (writeFileSync/appendFile). Nessuno tiene niente
 *     aperto a fine prova: se la cancellazione fallisce, e' la corsa del filesystem di Windows.
 *     ⇒ adotta `rimuoviCartellaDiProva`, che ritenta E AVVISA.
 *
 *   CLASSE B — la cancellazione fallita e' un SINTOMO. Nella stessa prova vive una risorsa che il
 *     prodotto (o la prova) deve chiudere: un server HTTP in ascolto, un watcher, un runtime, un
 *     agente esterno, un processo figlio col cwd dentro la cartella, un browser. Se la cartella
 *     non si cancella, la notizia e' «qualcuno non ha chiuso», e deve arrivare ROSSA e SUBITO.
 *     ⇒ resta la rimozione nuda, e il file e' elencato qui sotto col suo motivo.
 *
 * ⛔ Questo cancello e' nei DUE VERSI: protesta se un file di CLASSE A torna alla rimozione nuda
 * (cura persa in silenzio) e protesta se un file elencato qui non ha piu' rimozioni nude (elenco
 * stantio, cioe' una riga che descrive un mondo che non esiste piu').
 */

const RADICE_TEST = fileURLToPath(new URL('./', import.meta.url));
const RADICE_FRONTEND = fileURLToPath(new URL('../frontend/tests/', import.meta.url));

/** I file che NON adottano l'aiuto, e il perche'. Il valore e' il motivo, e viene letto. */
const CLASSE_B = new Map([
  ['tests/acp-agent.test.mjs', 'un agente ACP esterno vive nella cartella e va chiuso (`agente.chiudi()`)'],
  ['tests/context-embedding-runtime.test.mjs', 'il runtime degli embedding lancia un processo figlio (`runtime.close()`)'],
  ['tests/context-engine-server.test.mjs', 'il servizio del contesto e un processo figlio con un socket (`stop()`)'],
  ['tests/context-runtime.test.mjs', 'runtime desktop vivi, chiusi uno per uno nel teardown'],
  ['tests/git-service.test.mjs', '`execFileSync(git)` gira col cwd DENTRO la cartella: un git rimasto vivo la tiene'],
  ['tests/harness-receipt-keypair.test.mjs', '`spawnSync` di uno script che scrive il .env dentro la cartella'],
  ['tests/http-routes-git.test.mjs', 'server HTTP in ascolto piu git col cwd nella cartella'],
  ['tests/http-routes-note-attivita-memoria.test.mjs', 'server HTTP in ascolto sulla cartella della prova'],
  ['tests/http-routes-research.test.mjs', 'server HTTP in ascolto sulla cartella della prova'],
  ['tests/http-routes-research-esportazioni.test.mjs', 'server HTTP in ascolto sulla cartella della prova'],
  ['tests/http-routes-sessions.test.mjs', 'server HTTP in ascolto sulla cartella della prova'],
  ['tests/kernel-loop-locale-e-stop.test.mjs', 'comandi veri e taskkill sull albero dei processi: un nipote vivo tiene la cartella'],
  ['tests/plugin-session.test.mjs', 'il plugin esegue `node -e` col cwd DENTRO la cartella'],
  ['tests/provider-pi.test.mjs', 'server HTTP in ascolto sulla cartella della prova'],
  ['tests/provider-pk.test.mjs', 'server HTTP in ascolto sulla cartella della prova'],
  ['tests/provider-pkl-bis.test.mjs', 'server HTTP in ascolto sulla cartella della prova'],
  ['tests/workspace-context.test.mjs', '`git init --quiet` gira sulla cartella della prova'],
  ['tests/sidebar-feed.test.mjs', 'server HTTP in ascolto sulla cartella delle note, chiuso prima della rimozione'],
  ['tests/workspace-watcher.test.mjs', 'il watcher E il soggetto della prova: se non si chiude, deve vedersi'],
  ['tests/fixtures/bc48-cbis-banco.mjs', 'il banco tiene insieme server HTTP, git e watcher sulla stessa cartella'],
  ['frontend/tests/browser/sidebar-desktop.spec.mjs', 'due finestre Chromium e un server HTTP reale: un socket o processo non chiuso deve fallire subito'],
  ['frontend/tests/unit/provider-pk-browser.test.mjs', 'server HTTP piu un Chromium vivo'],
  ['frontend/tests/unit/provider-pkl-bis-dom.test.mjs', 'server HTTP piu un Chromium vivo'],
  ['frontend/tests/parity/automation-backend-fixture.mjs', 'la fixture tiene un server HTTP in ascolto'],
  ['frontend/tests/parity/capability-backend-fixture.mjs', 'la fixture tiene un server HTTP in ascolto'],
  ['frontend/tests/parity/estensioni-backend-fixture.mjs', 'la fixture tiene un server HTTP in ascolto'],
  ['frontend/tests/parity/fonte-ricerca-backend-fixture.mjs', 'la fixture tiene un server HTTP in ascolto'],
  ['frontend/tests/parity/forge-backend-fixture.mjs', 'la fixture tiene un server HTTP in ascolto'],
]);

/** I due file che la cura non riguarda, e il perche'. Anche questi vengono verificati, non esentati. */
const FUORI_CURA = new Map([
  ['tests/aiuto/rimuovi-cartella-di-prova.mjs', 'e l aiuto stesso: la rimozione nuda e la cosa che implementa, non un difetto'],
  ['tests/aiuto-rimozione-ritentativi.test.mjs', 'la sua prova tiene viva una premessa apposta e la smonta a mano, coi ritentativi in chiaro'],
]);

/*
 * ⛔ Il modello si COMPONE a pezzi di proposito: scritto per intero, questo file conterrebbe una
 * rimozione nuda e il cancello accuserebbe se stesso — un'ancora che misura il proprio commento
 * invece del codice. Composto cosi', la scansione di questo file trova zero siti, ed e' una cosa
 * che la prova verifica invece di darla per buona.
 */
const MODELLO_NUDO = new RegExp('\\brm(?:Sync)?\\(' + '[^;]{0,400}?' + 'recursive' + ':\\s*true', 'g');
const MODELLO_AIUTO = /\brimuoviCartellaDiProva(?:Attesa)?\(/g;

function quantiNe(testo, modello) {
  return (testo.match(modello) || []).length;
}

function raccogli(radice, prefisso) {
  const trovati = [];
  const scendi = (cartella) => {
    for (const nome of readdirSync(cartella)) {
      const pieno = join(cartella, nome);
      if (statSync(pieno).isDirectory()) {
        if (nome === 'node_modules' || nome === 'artifacts') continue;
        scendi(pieno);
      } else if (nome.endsWith('.mjs') || nome.endsWith('.js')) {
        trovati.push({ chiave: prefisso + relative(radice, pieno).split(sep).join('/'), pieno });
      }
    }
  };
  scendi(radice);
  return trovati;
}

test('BC09-CLASSIFICAZIONE — ogni rimozione nuda e DICHIARATA, e ogni dichiarazione e ancora vera', () => {
  const file = [...raccogli(RADICE_TEST, 'tests/'), ...raccogli(RADICE_FRONTEND, 'frontend/tests/')];

  // ⛔ Una misura che non guarda niente passa per costruzione: qui si dichiara su quanto ha guardato.
  assert.ok(file.length > 200, `la scansione ha visto solo ${file.length} file: il giro e rotto, non e un esito`);

  const nudi = new Map();
  const conAiuto = new Map();
  let sitiNudi = 0;
  let sitiConAiuto = 0;
  for (const { chiave, pieno } of file) {
    const fonte = readFileSync(pieno, 'utf8');
    const n = quantiNe(fonte, MODELLO_NUDO);
    const a = quantiNe(fonte, MODELLO_AIUTO);
    if (n > 0) { nudi.set(chiave, n); sitiNudi += n; }
    if (a > 0) { conAiuto.set(chiave, a); sitiConAiuto += a; }
  }

  // Questo file stesso non deve comparire fra gli accusati: il modello e composto apposta.
  assert.equal(nudi.has('tests/bc09-classificazione-rimozioni.test.mjs'), false, 'il cancello sta misurando il proprio testo, non il codice');

  const nonDichiarati = [...nudi.keys()].filter((k) => !CLASSE_B.has(k) && !FUORI_CURA.has(k));
  assert.deepEqual(
    nonDichiarati, [],
    'Rimozione nuda non dichiarata. O adotta `aiuto/rimuovi-cartella-di-prova.mjs` (classe A), '
    + 'o aggiungi il file a CLASSE_B qui sopra scrivendo QUALE risorsa a lunga vita tiene la cartella.',
  );

  const stantii = [...CLASSE_B.keys(), ...FUORI_CURA.keys()].filter((k) => !nudi.has(k));
  assert.deepEqual(stantii, [], 'Dichiarazioni stantie: questi file non hanno piu rimozioni nude, la riga va tolta');

  const misti = [...CLASSE_B.keys()].filter((k) => conAiuto.has(k));
  assert.deepEqual(misti, [], 'Un file di classe B non deve usare anche l aiuto: la stessa prova direbbe due cose diverse');

  for (const [chiave, motivo] of CLASSE_B) {
    assert.ok(motivo && motivo.length > 20, `motivo troppo corto per ${chiave}: un elenco senza motivo e una lista di eccezioni`);
  }

  console.log(`BC09: ${file.length} file letti · ${sitiConAiuto} siti con l aiuto in ${conAiuto.size} file · ${sitiNudi} siti nudi dichiarati in ${nudi.size} file`);
});
