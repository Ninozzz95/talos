/*
 * P0-E, punto 9 — IL COMANDO SI LEGGE, NON SI INDOVINA.
 *
 * ⛔ Il difetto che questi test riproducono: la colonna «Processi» stampava la riga di comando
 *   come UNA stringa monospazio troncata con l'ellissi (`inspector.js`, `.talos-process__cmd`).
 *   A parità di larghezza (la colonna sta intorno ai 300 px) di `npm run verify:all --workspace=@talos/harness-ui`
 *   si leggeva `npm run verify:all --work…`: quello che conta — COSA fa, DOVE, con quali opzioni —
 *   è la parte che sparisce per prima, perché l'ellissi taglia la coda.
 *
 * ⛔ E la famiglia del comando NON si riconosce per sottostringa. `echo "git push"` non è un
 *   comando git, `grep npm package.json` non è un comando npm: sono i due casi che qui sotto
 *   provano la regola, e sono la ragione per cui si parsa invece di cercare parole dentro la riga.
 *
 * RICERCA 16/09/2026 (regola zero), prima di scrivere:
 *  · VS Code, «Terminal Shell Integration» (code.visualstudio.com/docs/terminal/shell-integration,
 *    pagina aggiornata 02/09/2026): le decorazioni di comando sono TRE — errore, successo e
 *    «default» — e nascono dal codice di uscita che la sequenza `OSC 633 ; D [; <exitcode>] ST`
 *    porta con sé. ⇒ lo stato di una riga si dice col codice di uscita quando c'è, e con una terza
 *    parola quando non c'è: mai due soli valori.
 *  · npm `shell-quote` 1.10.0 (registry.npmjs.org, letto il 16/09/2026): MIT, nessuna dipendenza di
 *    produzione, `parse()` emette gli operatori di controllo `|| && ;; |& <( <<< >> >& <& & ; ( ) |
 *    < >`, i glob e i commenti. È il parser vendorizzato in `src/assets/shell-quote/`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analizzaComando,
  famigliaDaEseguibile,
  ICONA_FAMIGLIA,
  FAMIGLIE,
} from '../../src/components/comando-shell.js';

/** Scorciatoia: la sequenza dei tipi dei segmenti, per leggere le attese a colpo d'occhio. */
const tipi = (riga) => analizzaComando(riga).segmenti.map((s) => s.tipo);
/** Scorciatoia: il testo rimesso insieme. ⛔ Deve SEMPRE poter tornare la riga leggibile. */
const testo = (riga) => analizzaComando(riga).segmenti.map((s) => s.testo).join(' ');

test('CS-01 — trenta comandi veri: eseguibile, famiglia e sottocomando, letti dal PARSE', () => {
  /*
   * ⛔ Ogni riga è un comando che questo progetto lancia davvero (o che un modello lancia in una
   *   sessione): niente esempi di fantasia. L'attesa è [eseguibile, famiglia, sottocomando].
   */
  const casi = [
    ['git status --short', 'git', 'git', 'status'],
    ['git commit -m "p0/E: la colonna destra"', 'git', 'git', 'commit'],
    ['npm install', 'npm', 'install', 'install'],
    ['npm ci --no-audit', 'npm', 'install', 'ci'],
    ['npm run build', 'npm', 'build', 'run'],
    ['npm run test:unit', 'npm', 'test', 'run'],
    ['npm start', 'npm', 'server', 'start'],
    ['pnpm test', 'pnpm', 'test', 'test'],
    ['yarn add react', 'yarn', 'install', 'add'],
    ['bun run dev', 'bun', 'server', 'run'],
    ['npx playwright test tests/browser', 'npx', 'test', 'playwright'],
    ['node --test tests/unit/inspector.test.mjs', 'node', 'test', null],
    ['node server.mjs', 'node', 'node', null],
    ['python script.py', 'python', 'python', null],
    ['python3 -m venv .venv', 'python3', 'python', null],
    ['pytest -q tests/', 'pytest', 'test', null],
    ['pip install -r requirements.txt', 'pip', 'install', 'install'],
    ['docker compose up -d', 'docker', 'docker', 'compose'],
    ['docker build -t talos .', 'docker', 'build', 'build'],
    ['kubectl get pods -n prod', 'kubectl', 'docker', 'get'],
    ['cargo build --release', 'cargo', 'build', 'build'],
    ['cargo test -- --nocapture', 'cargo', 'test', 'test'],
    ['go test ./...', 'go', 'test', 'test'],
    ['make -j4', 'make', 'build', null],
    ['curl -sS https://registry.npmjs.org/shell-quote/latest', 'curl', 'rete', null],
    ['ssh utente@host "uptime"', 'ssh', 'rete', null],
    ['grep -rn "talos-process" src/styles/index.css', 'grep', 'filesystem', null],
    ['find . -name "*.test.mjs" -print', 'find', 'filesystem', null],
    ['tar -czf backup.tgz .claude', 'tar', 'filesystem', null],
    ['./gradlew assembleDebug', 'gradlew', 'build', null],
  ];
  assert.equal(casi.length, 30, 'trenta comandi, come chiede il criterio di chiusura');
  for (const [riga, eseguibileAtteso, famigliaAttesa, sottoAtteso] of casi) {
    const a = analizzaComando(riga);
    assert.equal(a.ok, true, `parse riuscito: ${riga}`);
    assert.equal(a.eseguibile, eseguibileAtteso, `eseguibile di: ${riga}`);
    assert.equal(a.famiglia, famigliaAttesa, `famiglia di: ${riga}`);
    assert.equal(a.sottocomando, sottoAtteso, `sottocomando di: ${riga}`);
    assert.ok(ICONA_FAMIGLIA[a.famiglia], `la famiglia ${a.famiglia} ha un'icona`);
  }
});

test('CS-02 — AL CONTRARIO: la famiglia viene dall\'ESEGUIBILE, mai da una sottostringa della riga', () => {
  /*
   * ⛔ Questi cinque sono la prova che morde: tutti NOMINANO un comando di un'altra famiglia, e
   *   nessuno lo È. Una `includes('git')` sulla riga li sbaglierebbe tutti e cinque.
   */
  assert.equal(analizzaComando('echo "git push --force"').famiglia, 'shell');
  assert.equal(analizzaComando('grep npm package.json').famiglia, 'filesystem');
  assert.equal(analizzaComando('cat docker-compose.yml').famiglia, 'filesystem');
  assert.equal(analizzaComando('rm -rf node_modules').famiglia, 'filesystem');
  assert.equal(analizzaComando("sed -i 's/python/node/' README.md").famiglia, 'filesystem');
  /* ⛔ E nel verso giusto: gli stessi nomi, quando SONO l'eseguibile, restano riconosciuti. */
  assert.equal(analizzaComando('git push --force').famiglia, 'git');
  assert.equal(analizzaComando('npm ls').famiglia, 'node');
});

test('CS-03 — un comando sconosciuto o ambiguo è «generico», non una famiglia indovinata', () => {
  assert.equal(analizzaComando('zzz-strumento-mai-visto --x').famiglia, 'generico');
  assert.equal(analizzaComando('./bin/mio-script').famiglia, 'generico');
  /* ⛔ Riga vuota: non si inventa un eseguibile, e `ok` dice che non c'era niente da leggere. */
  const vuoto = analizzaComando('   ');
  assert.equal(vuoto.ok, false);
  assert.equal(vuoto.eseguibile, null);
  assert.equal(vuoto.famiglia, 'generico');
  assert.deepEqual(vuoto.segmenti, []);
});

test('CS-04 — il percorso dell\'eseguibile non cambia la famiglia; .exe/.cmd si tolgono', () => {
  assert.equal(famigliaDaEseguibile('git'), 'git');
  assert.equal(analizzaComando('/usr/bin/git log').eseguibile, 'git');
  /* ⛔ Percorso di Windows, con gli spazi fra virgolette come in una riga vera: la barra rovescia
     deve restare un separatore di cartella, non un escape (vedi `SENZA_ESCAPE`). */
  assert.equal(analizzaComando('"C:\\Program Files\\nodejs\\node.exe" --version').eseguibile, 'node');
  assert.equal(analizzaComando('C:\\tools\\nodejs\\node.exe --version').eseguibile, 'node');
  assert.equal(analizzaComando('./node_modules/.bin/eslint src').eseguibile, 'eslint');
  assert.equal(analizzaComando('./node_modules/.bin/eslint src').famiglia, 'node');
  /* ⛔ `sudo`, `env` e `time` non sono il comando: lo PRECEDONO. */
  assert.equal(analizzaComando('sudo docker ps').eseguibile, 'docker');
  assert.equal(analizzaComando('env FOO=1 pytest').eseguibile, 'pytest');
});

test('CS-05 — pipe, redirezioni, operatori e commenti diventano segmenti propri', () => {
  assert.deepEqual(
    tipi('git log --oneline | head -20'),
    ['eseguibile', 'sottocomando', 'flag', 'operatore', 'eseguibile', 'flag'],
  );
  assert.deepEqual(
    tipi('npm run build > build.log 2>&1'),
    ['eseguibile', 'sottocomando', 'argomento', 'operatore', 'percorso', 'argomento', 'operatore', 'argomento'],
  );
  assert.deepEqual(tipi('make && make install'), ['eseguibile', 'operatore', 'eseguibile', 'argomento']);
  /* ⛔ Dopo `&&` ricomincia un comando: il secondo `make` è un ESEGUIBILE, non un argomento. */
  const due = analizzaComando('make && make install');
  assert.equal(due.segmenti[2].testo, 'make');
  /* Il commento `#` è suo, e non diventa un argomento. */
  assert.deepEqual(tipi('ls -la # elenco lungo'), ['eseguibile', 'flag', 'commento']);
});

test('CS-06 — URL e percorsi si distinguono dagli argomenti semplici', () => {
  const c = analizzaComando('curl -sS https://example.org/x -o out/file.json');
  assert.deepEqual(c.segmenti.map((s) => s.tipo), ['eseguibile', 'flag', 'url', 'flag', 'percorso']);
  assert.equal(analizzaComando('node ./scripts/build.mjs').segmenti[1].tipo, 'percorso');
  assert.equal(analizzaComando('git checkout main').segmenti[2].tipo, 'argomento');
  /* Un glob resta un percorso: è ciò che il comando andrà a toccare. */
  assert.equal(analizzaComando('node --test tests/*.test.mjs').segmenti.at(-1).tipo, 'percorso');
});

test('CS-07 — le virgolette tornano dove servono: la riga rimessa insieme resta leggibile', () => {
  /*
   * ⛔ `parse()` toglie le virgolette: `-m "due parole"` torna come token `due parole`. Rimetterle
   *   NON è cosmetica — senza, la riga rimessa insieme diventa un altro comando.
   */
  assert.equal(testo('git commit -m "p0/E: colonna destra"'), 'git commit -m "p0/E: colonna destra"');
  assert.equal(testo("grep -n 'due parole' file.txt"), 'grep -n "due parole" file.txt');
  /* Un token senza spazi né metacaratteri non si tocca. */
  assert.equal(testo('git status --short'), 'git status --short');
});

test('CS-08 — le variabili NON si espandono: un comando si mostra, non si esegue', () => {
  /*
   * ⛔ Col comportamento di serie di `shell-quote` (`env = {}`) `$HOME` diventa stringa vuota: a
   *   schermo sparirebbe un pezzo del comando che la persona ha visto girare. L'adattatore passa un
   *   `env` che restituisce la variabile a se stessa.
   */
  assert.equal(testo('ls $HOME/progetti'), 'ls $HOME/progetti');
  assert.equal(testo('echo "${MIA_VARIABILE}"'), 'echo $MIA_VARIABILE');
});

test('CS-09 — quando il parse fallisce si dice, e si ripiega su testo piano (mai un\'eccezione a schermo)', () => {
  /*
   * ⛔ `parse()` LANCIA su una sostituzione malformata (`${}`): è documentato di monte
   *   («Bad substitution»). Una riga di comando storta non deve buttare giù la colonna.
   */
  const rotto = analizzaComando('echo ${}');
  assert.equal(rotto.ok, false);
  assert.equal(rotto.famiglia, 'generico');
  assert.equal(rotto.segmenti.length, 1);
  assert.equal(rotto.segmenti[0].tipo, 'grezzo');
  assert.equal(rotto.segmenti[0].testo, 'echo ${}');
});

test('CS-10 — ogni famiglia dichiarata ha un\'icona dello sprite, e «generico» è il ripiego', () => {
  assert.ok(FAMIGLIE.includes('generico'));
  assert.equal(new Set(FAMIGLIE).size, FAMIGLIE.length, 'nessuna famiglia ripetuta');
  for (const f of FAMIGLIE) {
    assert.match(ICONA_FAMIGLIA[f] || '', /^i-[a-z-]+$/u, `${f} ha un id di sprite`);
  }
  assert.equal(famigliaDaEseguibile(''), 'generico');
  assert.equal(famigliaDaEseguibile(null), 'generico');
});
