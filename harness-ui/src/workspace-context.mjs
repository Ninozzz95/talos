/**
 * workspace-context.mjs — cosa mostrare nel pannello "Ambiente" del Context
 * Rail per una sessione VERA. Piano `elegant-spinning-dongarra.md`, FASE 1
 * (§1.3, riga "Contesto workspace" — prima "Parziale", ora vera).
 *
 * ⛔ Onesto, non forzato: i task di `progetti/` sono `cpSync` di una cartella
 * di tre file, **mai un repository git** (verificato: nessuna `.git/` dentro
 * `TALOS-BANCO/progetti/listino`, né altrove nel corpus). `branch` è quindi
 * `null` per ogni task oggi lanciabile — non un difetto di questa funzione,
 * è la verità sul corpus. Quando `storia/` (via `preparaDaCommit`, `git
 * archive`) arriverà come opzione lanciabile, `git archive` produce un
 * albero di file SENZA metadati git nemmeno lì — quindi anche allora
 * `branch` resterà `null`. Dichiarato qui perché non sembri un bug futuro.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createProcessPolicy } from './process-policy.mjs';

const GIT_PROCESS_POLICY = createProcessPolicy({ allowedExecutables: ['git'] });

/** Profondità massima e tetto della scansione: un workspace da migliaia di cartelle non deve rallentare l'avvio della sessione. */
const PROFONDITA_REPO_ANNIDATI = 2;
const TETTO_CARTELLE_LETTE = 400;
const CARTELLE_SALTATE = new Set(['node_modules', '.git', 'dist', 'build', '.cache', 'target', 'vendor']);

/**
 * ⭐ 04/9 — W1-13 (ricerca: un repository git dentro il workspace
 * ha una fiducia PROPRIA — i suoi file di controllo/hook non sono quelli del
 * workspace). Elenca le sottocartelle (profondità ≤ 2, tetto di letture)
 * che contengono una `.git/` propria. Mai un'eccezione: una cartella
 * illeggibile è saltata, e l'avvio della sessione non si ferma per questo.
 * @returns {string[]} percorsi relativi al workspace, ordinati
 */
export function repoAnnidati(cartella, { profondita = PROFONDITA_REPO_ANNIDATI, tetto = TETTO_CARTELLE_LETTE } = {}) {
  const trovati = [];
  let lette = 0;
  const visita = (assoluto, relativo, livello) => {
    if (livello > profondita || lette >= tetto) return;
    let voci;
    try { voci = readdirSync(assoluto, { withFileTypes: true }); } catch { return; }
    lette += 1;
    for (const voce of voci) {
      if (!voce.isDirectory() || CARTELLE_SALTATE.has(voce.name)) continue;
      const sotto = join(assoluto, voce.name);
      const sottoRelativo = relativo ? `${relativo}/${voce.name}` : voce.name;
      if (existsSync(join(sotto, '.git'))) { trovati.push(sottoRelativo); continue; } // un repo annidato non si scava: la sua fiducia è sua
      visita(sotto, sottoRelativo, livello + 1);
    }
  };
  if (typeof cartella === 'string' && cartella.length > 0) visita(cartella, '', 1);
  return trovati.sort();
}

function ramoGit(cartella, exec) {
  try {
    const uscita = exec('git', ['-C', cartella, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const ramo = String(uscita).trim();
    return ramo.length > 0 ? ramo : null;
  } catch {
    // ⛔ Non un repository git, o git non installato: stato onesto (null),
    // mai un errore che interrompe l'avvio della sessione per questo.
    return null;
  }
}

/**
 * Il nome del worktree collegato, o `null` se questa cartella e' il worktree PRINCIPALE.
 *
 * ⛔ Il modo affidabile non e' confrontare `--git-dir` con `--git-common-dir`: e' cercare il
 *   segmento `worktrees/` dentro `--git-dir` (git-scm.com/docs/git-worktree e la doc di
 *   `git-rev-parse`, lette il 10/09/2026). Misurato su questo repo: in un worktree collegato
 *   `--git-dir` vale `.../AVM/.git/worktrees/AVM-harness-desktop`, mentre nel principale vale `.git`
 *   — relativo, senza quel segmento. `$GIT_COMMON_DIR` puo' essere definito a mano e rendere il
 *   confronto fra i due bugiardo; il segmento no.
 *
 * ⛔⛔ Perche' questa funzione esiste: fino al 10/09 il pannello «Ambiente» scriveva `—` CABLATO,
 *   con un commento che diceva «mai un repository git nel corpus di oggi». Vero per i task del
 *   corpus (copie di tre file), FALSO per una sessione su una cartella dell'allowlist — e la riga
 *   sopra, «Ramo», lo smentiva gia' da sola mostrando `lane/harness-desktop`. Un trattino onesto
 *   quando non si sa; ma qui si sapeva, e non si guardava.
 */
function worktreeGit(cartella, exec) {
  try {
    const uscita = exec('git', ['-C', cartella, 'rev-parse', '--git-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    /* Windows e git mescolano le due barre nello stesso percorso: si separa su entrambe. */
    const dentro = String(uscita).trim().split(/[/\\]+/);
    const posizione = dentro.lastIndexOf('worktrees');
    if (posizione < 0 || posizione === dentro.length - 1) return null;
    return dentro[posizione + 1] || null;
  } catch {
    // Non un repository git, o git non installato: stesso stato onesto di ramoGit.
    return null;
  }
}

/**
 * ⭐⭐ VELOCITÀ, AVVIO DEL GIRO (owner 27/09/2026: «misura dal messaggio alla prima richiesta, poi cura quello che pesa»).
 *
 * Misurato (sonda in-process, registro come il server, kernel vero, fornitore finto, monorepo): 51,7 ms dal messaggio alla
 * prima richiesta, e il profilo della CPU mette 55 ms a giro in `spawnSync`, cioè i due `git rev-parse` SINCRONI qui
 * sopra. Sincroni: per quel tempo il server INTERO è fermo — le altre sessioni, gli SSE, tutto.
 * ⇒ Come Pi (`packages/coding-agent/src/core/footer-data-provider.ts:17-47`, `findGitPaths`: si risale fino a `.git`,
 *   directory o file `gitdir:` di un worktree; `:240-247`, il ramo letto dal file `HEAD`, git solo per i reftable):
 *   si leggono i file di git invece di lanciarlo.
 * ⛔ Torna `undefined` («non lo so dai file») in ogni caso che il file non decide da solo — `GIT_DIR`/`GIT_WORK_TREE`
 *   nell'ambiente, un `.git` illeggibile o strano, un `HEAD` che non è né un ramo né un commit, il segnaposto `.invalid`
 *   dei repository reftable — e lì decide git, come prima.
 * ⛔ Una differenza DICHIARATA: in un repository appena creato, senza commit, `rev-parse --abbrev-ref HEAD` fallisce
 *   (quindi `null`), mentre qui si legge il ramo che nascerà (lo stesso di `git symbolic-ref --short HEAD` e di Pi).
 * @returns {undefined | {branch: string|undefined, worktree: string|null}} `branch` undefined = chiedi a git
 */
function gitDaiFile(cartella) {
  if (typeof cartella !== 'string' || cartella.length === 0) return undefined;
  if (process.env.GIT_DIR || process.env.GIT_WORK_TREE || process.env.GIT_CEILING_DIRECTORIES) return undefined;
  let dir = resolve(cartella);
  for (;;) {
    const percorsoGit = join(dir, '.git');
    let stato = null;
    try { stato = statSync(percorsoGit); } catch { stato = null; }
    if (stato) {
      let gitDir;
      let worktree = null;
      try {
        if (stato.isDirectory()) gitDir = percorsoGit; // il principale: mai un worktree collegato
        else if (stato.isFile()) {
          const contenuto = readFileSync(percorsoGit, 'utf8').trim();
          if (!contenuto.startsWith('gitdir:')) return undefined;
          gitDir = resolve(dir, contenuto.slice('gitdir:'.length).trim());
          /* Un worktree collegato ha il suo git-dir in `<comune>/worktrees/<nome>`: il nome sono gli ULTIMI due pezzi,
             non il primo «worktrees» del percorso (un repo dentro `C:\worktrees\…` non è un worktree). */
          const pezzi = gitDir.split(/[/\\]+/u).filter(Boolean);
          worktree = pezzi.length >= 2 && pezzi[pezzi.length - 2] === 'worktrees' ? pezzi[pezzi.length - 1] : null;
        }
        else return undefined;
        const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
        let branch;
        if (head.startsWith('ref: refs/heads/')) {
          const nome = head.slice('ref: refs/heads/'.length);
          branch = nome && nome !== '.invalid' ? nome : undefined;
        }
        else if (/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(head)) branch = 'HEAD'; // staccato: la parola di `--abbrev-ref`
        return { branch, worktree };
      } catch {
        return undefined;
      }
    }
    /* ⛔ Review 27/09: git, dopo `.git`, guarda se la cartella STESSA è una directory git (un repository bare, o l'interno di
       un `.git`: `HEAD` + `objects` + `refs`, la sua `is_git_directory`). Senza questo, un bare dentro un altro repository
       prendeva il ramo di quello esterno. Lì decide git. */
    if (existsSync(join(dir, 'HEAD')) && existsSync(join(dir, 'objects')) && existsSync(join(dir, 'refs'))) return undefined;
    const padre = dirname(dir);
    if (padre === dir) return { branch: null, worktree: null }; // nessun `.git` fino alla radice: non è un repository
    dir = padre;
  }
}

/**
 * @param {{cartella:string, progetto:string|null}} input
 * @param {{exec?: Function}} [dipendenze] — SOLO per test: inietta
 *   un `exec` finto per provare "non è un repository git" senza spawnare un
 *   processo vero, o per provare un fallimento arbitrario.
 * @returns {{progetto:string|null, cartella:string, branch:string|null, worktree:string|null}}
 */
export function leggiContestoWorkspace({ cartella, progetto = null }, { exec } = {}) {
  const execFn = exec ?? ((comando, argomenti, opzioni = {}) => GIT_PROCESS_POLICY.execFileSync(comando, argomenti, {
    ...opzioni,
    cwd: opzioni.cwd ?? cartella,
  }));
  /* ⭐⭐ VELOCITÀ (27/09/2026) — prima i file (vedi `gitDaiFile`); git solo per ciò che i file non decidono. Un `exec`
     iniettato (le prove) resta sulla strada di prima, byte per byte. */
  const daiFile = exec ? undefined : gitDaiFile(cartella);
  return {
    progetto,
    cartella,
    branch: daiFile?.branch !== undefined ? daiFile.branch : ramoGit(cartella, execFn),
    // ⭐ 10/09 — il nome del worktree collegato: la scheda Ambiente lo scriveva `—` cablato.
    worktree: daiFile ? daiFile.worktree : worktreeGit(cartella, execFn),
    // ⭐ 04/9, W1-13 — repository dentro il workspace: fiducia separata (mostrato nella scheda Ambiente)
    repoAnnidati: repoAnnidati(cartella),
  };
}
