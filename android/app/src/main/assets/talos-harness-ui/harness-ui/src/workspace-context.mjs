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
import { execFileSync } from 'node:child_process';

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
 * @param {{exec?: typeof execFileSync}} [dipendenze] — SOLO per test: inietta
 *   un `exec` finto per provare "non è un repository git" senza spawnare un
 *   processo vero, o per provare un fallimento arbitrario.
 * @returns {{progetto:string|null, cartella:string, branch:string|null}}
 */
export function leggiContestoWorkspace({ cartella, progetto = null }, { exec = execFileSync } = {}) {
  return {
    progetto,
    cartella,
    branch: ramoGit(cartella, exec),
  };
}
