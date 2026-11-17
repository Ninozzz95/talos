// @ts-check
/*
 * IL CRICCHETTO DELLE TAGLIE «DALLA BASE» — le regole, in un posto solo (owner 12/11/2026 13:12, «rifarlo come Hermes»).
 *
 * Questo file, come tutta la cartella, si legge dal commit di BASE dell'unione (il primo genitore), mai dal ramo in prova: la coda
 * di unione lo estrae dalla base in una cartella a parte e lancia quello. Un ramo che lo cambia lo cambia per le unioni DOPO.
 * Hermes, `hermes-agent-2026-11-01/scripts/code_health/config.py:11-13`: «read from main, never from the branch under test, so a PR
 * cannot relax its own check».
 *
 * Non c'è un file del debito: il tetto di ogni unità è la sua misura sulla base in quel momento (`config.py:19-20`: «a unit already
 * over its target keeps its own current value as its cap (measured on the base revision) and may only go down»).
 */

/**
 * L'interruttore, a tre posizioni come Hermes (`config.py:15-17`): `blocca` (una violazione fa uscire 1), `avvisa` (si scrive, si
 * passa), `spento` (non si misura). Si passa a `blocca` solo con la rigiocata a zero falsi rossi e una decisione dell'owner.
 * @type {'blocca' | 'avvisa' | 'spento'}
 */
export const INTERRUTTORE = 'avvisa';

/**
 * I bersagli. ⚠ I numeri sono quelli della regola 304 di oggi (800 / 2.000 / 300) e due segnaposto per i nuovi: li sceglie
 * l'owner con la rigiocata (`rigiocata.mjs`), non chi scrive il cancello.
 * - `fileNuovo`, `fileEsistente`, `funzione`: righe;
 * - `caratteriPerRiga`: il tetto in caratteri di un'unità è il suo bersaglio in righe per questo numero (regola 5: una riga da
 *   migliaia di caratteri non passa più sotto il conto delle righe). I caratteri sono quelli DI CODICE: senza commenti e senza
 *   spazi, così un formattatore o un commento non contano. Un'unità già sopra il bersaglio ha per tetto i suoi caratteri sulla base;
 * - `gigante`: righe sulla base oltre le quali un file ha il «conto di discesa» (proposta c).
 */
export const BERSAGLI = Object.freeze({ fileNuovo: 800, fileEsistente: 2000, funzione: 300, caratteriPerRiga: 200, gigante: 10000 });

/**
 * Le proposte di bersaglio accese (forma §2): `a` un file sopra il bersaglio non ingrassa; `b` funzioni e file nuovi sotto il
 * bersaglio e col controllo dei tipi; `c` il conto di discesa dei giganti. Le regole 1, 4 e 5 (cancello, archi e forme di
 * carico) non sono proposte: valgono sempre. I tetti in caratteri seguono la proposta della loro unità (file: a; funzioni e file nuovi: b).
 */
export const PROPOSTE = Object.freeze(['a', 'b', 'c']);

/** Somiglianza dei corpi oltre la quale due unità sono la stessa modificata (Hermes `compare.py:53`, `SIMILAR = 0.6`). */
export const SIMILE = 0.6;
/** Soglie minime di un corpo abbinato, in caratteri alfanumerici: 20 nello stesso file, 40 fra file (git blame -M / -C). */
export const SOGLIA_STESSO_FILE = 20;
export const SOGLIA_ALTRO_FILE = 40;

/** Le cartelle del codice contato. Non ricorsiva = solo i file al primo livello. */
export const CARTELLE = Object.freeze([
  { dir: 'harness-ui', ricorsiva: false },
  { dir: 'harness-ui/src', ricorsiva: true },
  { dir: 'harness-ui/scripts', ricorsiva: true },
  { dir: 'harness-ui/frontend/src', ricorsiva: true },
  { dir: 'harness-ui/desktop', ricorsiva: false },
  { dir: 'harness-ui/public/talos', ricorsiva: true },
  { dir: 'harness-ui/relay/src', ricorsiva: true },
  { dir: 'harness-ui/relay/bin', ricorsiva: true },
  { dir: 'context-engine/src', ricorsiva: true },
  { dir: 'cli/src', ricorsiva: true },
  { dir: 'mobile/src', ricorsiva: true },
]);
/** Gli alias con cui un pacchetto importa i propri file (Vite nel telefono: `@/x` è `mobile/src/x`): sono percorsi, non pacchetti. */
export const ALIAS = Object.freeze([{ dentro: 'mobile/', prefisso: '@/', verso: 'mobile/src/' }]);
/** Le lenti delle tre app: quale cartella del censimento appartiene a chi (per il rapporto, non per il verdetto). */
export const LENTI = Object.freeze({ cli: ['cli/src/'], mobile: ['mobile/src/'] });

/** Dentro il censimento ma non contati: uscita di build, librerie copiate, dizionari dei testi. Un arco verso di loro è un arco. */
export const ESCLUSE = Object.freeze([
  'harness-ui/src/kernel/dist/',
  'harness-ui/frontend/src/assets/xterm/',
  'harness-ui/frontend/src/assets/prism/',
  'harness-ui/frontend/src/assets/shell-quote/',
  'harness-ui/frontend/src/i18n/testi/',
]);
/** Le estensioni del codice contato. `.vue`: si contano righe e caratteri del file e le funzioni dei blocchi `<script>`. */
export const ESTENSIONI = Object.freeze(['.mjs', '.cjs', '.js', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.vue']);
/** Mai contati, ovunque stiano: prove, dichiarazioni dei tipi. Un arco dal censimento verso di loro è un arco. */
export const NON_PRODOTTO = /\.test\.[mc]?[jt]sx?$|\.d\.[mc]?ts$/u;

/**
 * Fuori dal censimento e dichiarate: prove, banchi, prototipi, codice nativo, gli altri prodotti alla radice. Un file di codice
 * NUOVO che non è contato e non sta sotto una di queste è «fuori non dichiarato»: una cartella nuova di prodotto non scappa.
 */
export const FUORI_NOTI = Object.freeze([
  'harness-ui/benchmarks/', 'harness-ui/desktop/scripts/', 'harness-ui/desktop/tests/', 'harness-ui/frontend/lab/',
  'harness-ui/frontend/prototypes/', 'harness-ui/frontend/scripts/', 'harness-ui/frontend/tests/', 'harness-ui/mockup-originale/',
  'harness-ui/native/', 'harness-ui/public/vendor/', 'harness-ui/tests/', 'harness-ui/relay/tests/', 'harness-ui/labs/',
  'harness-ui/contracts/', 'harness-ui/aiuto/', 'harness-ui/docs/', 'context-engine/tests/',
  'mobile/tests/', 'mobile/android/', 'mobile/scripts/', 'mobile/tools/', 'mobile/public/', 'mobile/docs/', 'mobile/upstream/',
  'mobile/packages/', 'mobile/third_party/', 'mobile/probe/', 'mobile/assets/', 'mobile/release/',
  '.claude/', '.github/', '.githooks/', 'artifact-worker/', 'browser-worker/', 'control-plane/', 'core/', 'human-journey/',
  'ocr-worker/', 'native/', 'scripts/', 'tools/', 'validator/', 'docker/', 'deploy/', 'docs/', 'storage/', 'test-results/',
  ...ESCLUSE,
]);
/** Fuori e dichiarati per forma: le configurazioni alla radice di un pacchetto e l'uscita della build in `public`. */
export const FORME_FUORI = Object.freeze([
  /^(?:harness-ui\/frontend|mobile|context-engine|harness-ui\/relay)\/[^/]+\.config\.[mc]?[jt]s$/u,
  /^harness-ui\/public\/[^/]+$/u,
]);

/** I file del cancello: un ramo che li tocca li cambia per le unioni dopo, e passa solo con un'eccezione scritta nell'INDICE. */
export const FILE_DEL_CANCELLO = Object.freeze(['harness-ui/tests/aiuto/taglie-base/', 'harness-ui/tests/taglie-base-']);

/**
 * I moduli di Node che fanno girare altro codice: importarne uno di più in un file è una forma di carico in più (regola 5).
 * Fonte: nodejs.org/docs/latest-v24.x/api (module.html `createRequire`, `register`, `registerHooks`; process.html
 * `getBuiltinModule`; vm.html; child_process.html `fork(modulePath)`; worker_threads.html `new Worker(filename)`), lette il 12/11/2026.
 * `child_process` non è qui (lo importa chiunque lanci git): di lui si contano `fork` e ogni chiamata che lancia Node stesso.
 */
export const MODULI_SENSIBILI = Object.freeze(['vm', 'module', 'worker_threads', 'cluster', 'inspector', 'repl']);

export const REGOLE = Object.freeze({
  INTERRUTTORE, BERSAGLI, PROPOSTE, SIMILE, SOGLIA_STESSO_FILE, SOGLIA_ALTRO_FILE, CARTELLE, ALIAS, LENTI, ESCLUSE, ESTENSIONI, NON_PRODOTTO,
  FUORI_NOTI, FORME_FUORI, FILE_DEL_CANCELLO, MODULI_SENSIBILI,
});
