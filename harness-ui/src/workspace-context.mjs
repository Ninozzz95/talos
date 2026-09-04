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
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { createProcessPolicy } from './process-policy.mjs';

const GIT_PROCESS_POLICY = createProcessPolicy({ allowedExecutables: ['git'] });

/** Profondità massima e tetto della scansione: un workspace da migliaia di cartelle non deve rallentare l'avvio della sessione. */
const PROFONDITA_REPO_ANNIDATI = 2;
const TETTO_CARTELLE_LETTE = 400;
const CARTELLE_SALTATE = new Set(['node_modules', '.git', 'dist', 'build', '.cache', 'target', 'vendor']);

/**
 * ⭐ 04/9 — W1-13 (Claude Code 2.1.232: un repository git dentro il workspace
 * ha una fiducia PROPRIA — i suoi `CLAUDE.md`/hook non sono quelli del
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
 * @param {{cartella:string, progetto:string|null}} input
 * @param {{exec?: Function}} [dipendenze] — SOLO per test: inietta
 *   un `exec` finto per provare "non è un repository git" senza spawnare un
 *   processo vero, o per provare un fallimento arbitrario.
 * @returns {{progetto:string|null, cartella:string, branch:string|null}}
 */
export function leggiContestoWorkspace({ cartella, progetto = null }, { exec } = {}) {
  const execFn = exec ?? ((comando, argomenti, opzioni = {}) => GIT_PROCESS_POLICY.execFileSync(comando, argomenti, {
    ...opzioni,
    cwd: opzioni.cwd ?? cartella,
  }));
  return {
    progetto,
    cartella,
    branch: ramoGit(cartella, execFn),
    // ⭐ 04/9, W1-13 — repository dentro il workspace: fiducia separata (mostrato nella scheda Ambiente)
    repoAnnidati: repoAnnidati(cartella),
  };
}
