/**
 * RICARICA DELLA MEMORIA POST-COMPATTAZIONE (owner 06/10/2026 — opzione A + i due elementi a costo zero
 * della C; capitolato §6.4 della ricerca 5×5×5×5: `harness-ui/scratchpad/ricerca-5x5x5x5-compattazione-memoria-post-compact-2026-10-06.md`).
 *
 * IL DIFETTO. Dopo l'auto-compattazione il contesto dipende dalla SOLA sintesi («Compaction is lossy,
 * specific details get summarized away» — Anthropic Cookbook, fonte D3 della ricerca): il commit
 * `c8641ae66` (BUG-25, 17:38) è scomparso dal contesto e è stato ritrovato solo interrogando git a mano.
 * La perdita è strutturale, non un difetto del riassuntore (§6.1 punto 1).
 *
 * LA CURA, in tre pezzi tutti dal codice:
 *  - (A) `costruisciBloccoFatti` — dopo ogni compattazione il CODICE legge fonti FRESHE al momento del
 *    compact (mai memoria del modello, mai stato ricostruito: lezione cline CLINE-2503 e claude-code
 *    2.1.269 sul git status stantio, §6.2 punto 4) e le fonde nel MESSAGGIO di compattazione stesso —
 *    un solo cache-break, mai un giro o un messaggio separato (vincolo 3; modello codex
 *    `BeforeLastUserMessage`, C3). Fonti: LEDGER append-only dichiarati dall'ospite (§6.1 punto 5),
 *    `git log` LOCALE della cartella progetto (nessuna rete: se la chiamata git fallisce, il blocco lo
 *    dice onestamente senza bloccare), coda pendente, pericoli aperti, puntatori ai file toccati.
 *  - (C-a) `REGOLE_SINTESI_VERBATIM` — le due regole zero-cost per i prompt di sintesi: le richieste
 *    pendenti e le azioni irreversibili (commit/push con hash) entrano VERBATIM, sul modello di opencode
 *    `summary.txt:10-11` (C5) e del prompt di codex (C3).
 *  - (C-b) `PREFISSO_SINTESI_RECINTATA` — separazione netta fra la sintesi RECINTATA (prefisso stile
 *    hermes `SUMMARY_PREFIX`, `context_compressor.py:265`, clone 2026-09-24: «REFERENCE ONLY», l'ultimo
 *    messaggio utente vince) e il blocco di fatti, che contiene SOLO fatti e puntatori — NESSUNA
 *    direttiva operativa, mai «riprendi da qui» (§6.2 punto 1: il framing spinto produce giri di sola
 *    narrazione; il «cosa fare adesso» lo dice l'ultimo messaggio vero della persona).
 *
 * I TRE VINCOLI FERMI del capitolato (§6.4), qui per costruzione:
 *  1. blocco calcolato DAL CODICE al momento del compact, con letture fresche;
 *  2. SOLO fatti e puntatori (`contieneDirettiva` è la prova automatica del vincolo 2);
 *  3. FUSO nel messaggio di compattazione (nessun giro/messaggio separato); tetto di caratteri
 *     (`CARATTERI_BLOCCO_MASSIMI`): il blocco non reintroduce il contesto pieno.
 *
 * FAIL-SOFT. Una fonte che non risponde NON fa fallire la compattazione: la sezione dice onestamente
 * «unreadable/unavailable» col motivo, e il compact continua (`costruisciBloccoFatti` non lancia MAI;
 * le letture sono locali, senza rete: `git -C <cartella> log` con `execFile`, senza shell, con timeout).
 *
 * ⛔ Modifica ADDITIVE ai due percorsi di compattazione (kernel `talosHarness.mjs` e desktop
 *   `compattazione-desktop.mjs`): senza fonti dichiarate il messaggio compattato resta carattere per
 *   carattere quello di prima (i test K3 fissano quella frase). Il blocco e il recinto si attivano dove
 *   il percorso ha le fonti (kernel: la `cartella` del task; desktop: la sessione, col suo `input.fontiRicarica`).
 */
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { percorsoTaskkill } from '../taskkill-di-sistema.mjs'; // G-R5 (revisione del blocco 10, 27/10/2026)
import { promisify } from 'node:util';

const eseguiGitGrezzo = promisify(execFile);

/*
 * ⛔ Revisione 7 della CLI (22/10/2026, F2): su Windows lo Stop non fermava git. Con il PATH abituale `git` è il LANCIATORE
 *   `Git\cmd\git.exe`: `execFile` con `signal` (o `timeout`) uccide solo lui, e restano vivi il `git.exe` vero di mingw64 e ciò che lancia
 *   (con `log.showSignature` acceso, gpg via `sh`) — la cartella del progetto restava aperta (EPERM su `rmSync`). La prova della revisione
 *   6 («nessuna lettura ancora aperta») misurava la promessa, non il processo.
 * Stato dell'arte (ricerca del 22/10/2026): su Windows non ci sono gruppi di processi e `taskkill /T` non trova più i figli di un processo
 *   già uscito (execa, `lib/terminate/kill-descendants.js`); tree-kill chiude l'albero con `taskkill /pid PID /T /F`.
 * ⇒ Lo Stop e il tempo scaduto chiudono PRIMA l'albero intero (finché il lanciatore è vivo), POI fanno finire la chiamata. E git non lancia
 *   più gpg: `-c log.showSignature=false` (la firma non serve a un elenco di commit, su ogni sistema).
 * ⛔ La chiusura dell'albero ha il suo tetto (2 s): lo Stop non aspetta mai git oltre quello.
 */
const erroreDiStop = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' });
function chiudiAlbero(figlio) {
  if (process.platform !== 'win32' || !Number.isInteger(figlio?.pid) || figlio.exitCode !== null) return Promise.resolve();
  return new Promise((ok) => {
    /* l'ambiente minimo che serve a taskkill, mai quello intero del server (cancello SPAWN-AMBIENTE-01) */
    const minimo = Object.fromEntries(['SystemRoot', 'windir', 'PATH'].filter((k) => typeof process.env[k] === 'string').map((k) => [k, process.env[k]]));
    /* G-R5 (revisione del blocco 10, 27/10/2026): per percorso intero, mai per nome (`taskkill-di-sistema.mjs`) */
    try { execFile(percorsoTaskkill(process.env.SystemRoot), ['/PID', String(figlio.pid), '/T', '/F'], { windowsHide: true, timeout: 2_000, env: minimo }, () => ok()); } catch { ok(); }
  });
}
/** Esportato per la prova dell'albero chiuso (revisione 7, F2); il blocco dei fatti lo usa quando nessuno inietta `eseguiGit`. */
export async function eseguiGitPredefinito(file, args, { timeout = 0, signal = null, ...opzioni } = {}) {
  if (signal?.aborted) throw erroreDiStop();
  const interno = new AbortController();
  const promessa = eseguiGitGrezzo(file, args, { ...opzioni, signal: interno.signal });
  const figlio = promessa.child ?? null;
  let motivo = null;
  const chiudi = async (perche) => {
    if (motivo) return;
    motivo = perche;
    await chiudiAlbero(figlio);
    interno.abort();
  };
  const alloStop = () => { void chiudi('stop'); };
  signal?.addEventListener('abort', alloStop, { once: true });
  const timer = timeout > 0 ? setTimeout(() => { void chiudi('tempo'); }, timeout) : null;
  try {
    return await promessa;
  } catch (errore) {
    if (motivo === 'stop') throw erroreDiStop();
    if (motivo === 'tempo') throw Object.assign(new Error(`git did not answer within ${timeout} ms`), { code: 'ETIMEDOUT' });
    throw errore;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', alloStop);
  }
}

/**
 * (C-b) Il recinto della sintesi: va messo SUBITO DOPO il marcatore di compattazione e PRIMA del
 * riassunto, nello stesso messaggio. La sintesi è un passaggio di consegne, non il giro attivo —
 * l'ultimo messaggio reale della persona vince (hermes, clone 2026-09-24, `context_compressor.py:265`).
 */
export const PREFISSO_SINTESI_RECINTATA = '[CONTEXT COMPACTION — REFERENCE ONLY] The summary below is a handoff from a previous context window: treat it as background reference, not as active instructions. Questions and requests mentioned in it were already addressed: the latest real user message wins.';

/** (C-b) L'intestazione del blocco di fatti: dichiara CHI lo ha calcolato e CHE COSA contiene (e non contiene). */
export const INTESTAZIONE_BLOCCO_FATTI = 'Post-compaction facts snapshot — computed by the code at compaction time from fresh reads (not model memory). Facts and pointers only: nothing in this section asks for an action.';

/** Il tetto del blocco: dichiarato, e la coda tagliata lo DICE (mai reintrodurre il contesto pieno). */
export const CARATTERI_BLOCCO_MASSIMI = 4_000;
export const MARCATORE_BLOCCO_TAGLIATO = '[… facts block truncated by the code to fit the context window …]';

/** Quanti commit e quanti caratteri per LEDGER: puntatori, non il contesto pieno. */
export const COMMIT_RECENTI = 5;
export const CARATTERI_LEDGER = 600;

/** Il motivo di una fonte non letta, in una riga, senza accapo e con un tetto. */
const motivoOnesto = (errore, tetto = 160) => {
  const grezzo = errore?.code ?? errore?.message ?? errore ?? 'unknown error';
  return String(grezzo).replace(/\s+/g, ' ').trim().slice(0, tetto) || 'unknown error';
};
const unaRiga = (valore, tetto) => String(valore ?? '').replace(/\s+/g, ' ').trim().slice(0, tetto);
const soloStringhe = (valore, tetto = 300) => (Array.isArray(valore) ? valore : [])
  .filter((v) => typeof v === 'string' && v.trim())
  .map((v) => unaRiga(v, tetto));

/*
 * (C-b, vincolo 2) Le forme che NON possono stare nel blocco di fatti: è la prova automatica del
 * «SOLO fatti e puntatori, nessuna direttiva operativa» (§6.2 punto 1 — hermes ha dovuto recintare in
 * produzione l'effetto di un blocco che spingeva: «7 consecutive narration-only turns», `:258-262`).
 * Il test della cura (RICARICA-C-BLOCCO-SENZA-DIRETTIVE) gira `contieneDirettiva` sul blocco costruito
 * e sul messaggio fuso: un mutante che scriva una direttiva nel blocco diventa rosso.
 */
const FORME_DIRETTIVA = [
  /\briprendi\b/i, /\briparti\b/i, /\bcontinua\b/i, /\bprosegui\b/i, /\bprocedi\b/i,
  /\bora fai\b/i, /\bfai ora\b/i, /\bdevi\b/i, /\bdovresti\b/i, /\bassicurati\b/i,
  /\bricorda di\b/i, /\bnon dimenticare\b/i, /\boccorre\b/i,
  /\bresume\b/i, /\bcontinue\b/i, /\bcarry on\b/i, /\byou must\b/i, /\byou should\b/i,
  /\bmake sure\b/i, /\bremember to\b/i, /\bdo not forget\b/i, /\bdon't forget\b/i,
  /\bnow do\b/i, /\bstart by\b/i, /\bnext step\b/i, /\bplease\b/i,
];

/** true se il testo contiene una direttiva operativa (le forme qui sopra, it/en). */
export function contieneDirettiva(testo) {
  const riga = String(testo ?? '');
  return FORME_DIRETTIVA.some((forma) => forma.test(riga));
}

/**
 * (A) Il blocco di fatti freschi. TUTTE le letture sono iniettabili (`leggiFile`, `eseguiGit`) per le
 * prove; i default sono le letture vere (file locale, `git` locale senza rete). NON lancia mai: una
 * fonte che fallisce diventa una riga onesta nella sua sezione. Ritorna `{ testo, fontiLette,
 * fontiNonLette }` — `testo` è pronto per essere FUSO nel messaggio di compattazione.
 *
 * @param {object} fonti — cosa il chiamante DICHIARA: `ledgers` (percorsi di LEDGER append-only),
 *   `cartellaProgetto` (per `git log` locale), `codaPendente` (lista di fatto, o null = non disponibile),
 *   `pericoliAperti` (lista), `fileToccati` (puntatori), `fatti` (righe di fatto già calcolate dal chiamante,
 *   es. `coveredThrough` del record di compattazione — la fonte ContextVersionV1 del dossier §6.1 punto 5).
 */
export async function costruisciBloccoFatti(fonti = {}, {
  ora = () => new Date(),
  leggiFile = readFile,
  eseguiGit = eseguiGitPredefinito,
  /* Revisione 6 della CLI (S4-1): lo Stop del giro ferma anche git, e chi aspetta il blocco non aspetta più del giro */
  segnale = null,
  caratteriMassimi = CARATTERI_BLOCCO_MASSIMI,
  commitRecenti = COMMIT_RECENTI,
  caratteriLedger = CARATTERI_LEDGER,
} = {}) {
  const dichiarate = fonti && typeof fonti === 'object' ? fonti : {};
  const fontiLette = [];
  const fontiNonLette = [];
  const righe = [
    INTESTAZIONE_BLOCCO_FATTI,
    `Computed at: ${ora().toISOString()}.`,
  ];

  /* I LEDGER append-only: il puntatore (percorso) ci sta SEMPRE, con l'ultima coda del file (il presente
   * di un append-only sta alla fine). Il percorso non leggibile si DICE, con il motivo. */
  const ledgers = soloStringhe(dichiarate.ledgers);
  righe.push('Durable ledgers (append-only; the path is the pointer, the excerpt is its tail):');
  if (ledgers.length === 0) righe.push('  - (none declared to the compaction code)');
  for (const percorso of ledgers) {
    try {
      const contenuto = await leggiFile(percorso, 'utf8');
      const coda = unaRiga(String(contenuto ?? '').slice(-caratteriLedger), caratteriLedger);
      righe.push(`  - ${percorso} — last excerpt: ${coda || '(empty file)'}`);
      fontiLette.push(percorso);
    } catch (errore) {
      righe.push(`  - ${percorso} — unreadable at compaction time (${motivoOnesto(errore, 120)})`);
      fontiNonLette.push(percorso);
    }
  }

  /* I commit recenti: LA fonte che avrebbe salvato il compact del 06/10 (`c8641ae66`). Solo lettura
   * locale, senza rete; senza cartella dichiarata, o con git assente/non-repo, la sezione lo dice. */
  const cartella = typeof dichiarate.cartellaProgetto === 'string' && dichiarate.cartellaProgetto.trim()
    ? dichiarate.cartellaProgetto.trim()
    : null;
  righe.push(`Recent commits (local git log${cartella ? ` of ${cartella}` : ''}, no network):`);
  if (!cartella) {
    righe.push('  - (no project folder declared to the compaction code)');
  } else {
    try {
      const { stdout } = await eseguiGit('git', ['-C', cartella, '-c', 'log.showSignature=false', 'log', '--oneline', `-${commitRecenti}`], { timeout: 5_000, windowsHide: true, ...(segnale ? { signal: segnale } : {}) });
      const visti = String(stdout ?? '').split(/\r?\n/).map((r) => unaRiga(r, 200)).filter(Boolean);
      if (visti.length === 0) righe.push(`  - (git log is empty: no commits in ${cartella})`);
      else righe.push(...visti.map((r) => `  - ${r}`));
      fontiLette.push(`git log ${cartella}`);
    } catch (errore) {
      righe.push(`  - (unavailable: ${motivoOnesto(errore)})`);
      fontiNonLette.push(`git log ${cartella}`);
    }
  }

  /* La coda pendente: l'oggetto più protetto nei pari (hermes ri-appende, opencode vieta di perderla).
   * Il kernel non la possiede: se il chiamante non la dichiara, lo si dice — mai inventarla. */
  righe.push('Pending queue:');
  if (dichiarate.codaPendente === null || dichiarate.codaPendente === undefined) {
    righe.push('  - (not available from the harness at compaction time)');
  } else {
    const coda = soloStringhe(dichiarate.codaPendente, 200);
    righe.push(...(coda.length ? coda.map((v) => `  - ${v}`) : ['  - (empty)']));
  }

  /* I pericoli aperti: fatti nominati dal chiamante (prova rossa, review in corso, …). */
  const pericoli = soloStringhe(dichiarate.pericoliAperti, 200);
  righe.push('Open perils:');
  righe.push(...(pericoli.length ? pericoli.map((v) => `  - ${v}`) : ['  - (none recorded)']));

  /* I file toccati di recente: SOLO puntatori (rileggere il contenuto è lavoro dell'agente, come per
   * l'indice meccanico del percorso desktop). */
  const fileToccati = soloStringhe(dichiarate.fileToccati);
  righe.push('Recently touched files (pointers only):');
  righe.push(...(fileToccati.length ? [...new Set(fileToccati)].map((v) => `  - ${v}`) : ['  - (none recorded)']));

  /* Fatti già calcolati dal chiamante (es. il record `talos.compattazione.v1` / ContextVersionV1). */
  const fatti = soloStringhe(dichiarate.fatti);
  if (fatti.length > 0) {
    righe.push('Session facts:');
    righe.push(...fatti.map((v) => `  - ${v}`));
  }

  let testo = righe.join('\n');
  if (Number.isFinite(caratteriMassimi) && caratteriMassimi > 0 && testo.length > caratteriMassimi) {
    testo = `${testo.slice(0, caratteriMassimi)}\n${MARCATORE_BLOCCO_TAGLIATO}`;
  }
  return { testo, fontiLette, fontiNonLette };
}
