/*
 * ⛔⛔ F-016 (owner 01/10 e 02/10/2026: «errore spiegato + `git worktree repair --relative-paths`», poi «rimedio + avvertenza»)
 *   — UN WORKTREE CREATO DAL GIT DI WINDOWS, LETTO DAL GIT DELLA CASA LINUX.
 *
 * Misurato il 02/10/2026 (scratchpad `f016`): git per Windows 2.55 scrive nel file `.git` del worktree un percorso ASSOLUTO di
 *   Windows (`gitdir: C:/…/principale/.git/worktrees/ramo`); il git di WSL 2.53 lo legge come percorso RELATIVO e risponde
 *   `fatal: not a git repository: <cartella corrente>/C:/…/.git/worktrees/ramo`, uscita 128. Prima il modello vedeva solo
 *   quella riga, e un worktree sano sembrava un repository rotto.
 * Rimedio verificato: `git worktree repair --relative-paths` (git ≥ 2.48) dal lato Windows ⇒ `gitdir: ../principale/.git/…`,
 *   e il git di Linux legge il worktree (uscita 0).
 * ⛔ Il rimedio ha un costo, misurato: il repository passa a `core.repositoryformatversion=1` + `extensions.relativeworktrees`,
 *   che git più vecchi della 2.48 e gli strumenti basati su libgit2 non leggono (git-worktree(1); libgit2#7210;
 *   dotnet-affected#194). Per questo la spiegazione lo DICE e chiede di proporlo alla persona, non di eseguirlo da solo.
 * ⛔ Fuori di qui, registrato e non curato: il verso opposto (worktree creato da Linux, `gitdir: /mnt/c/…`, letto dal git di
 *   Windows) risponde `fatal: not a git repository: (NULL)`, senza il percorso.
 */

/* `fatal: not a git repository: <qualcosa>/C:/…/.git/worktrees/<nome>` — il pezzo da `X:/` in poi è il gitdir scritto da Windows. */
const RIGA_WORKTREE_WINDOWS = /fatal: not a git repository: (?:\S*?\/)?([A-Za-z]:\/[^\r\n]*?\/\.git\/worktrees\/[^\s/]+)/u

/** Il gitdir di Windows che il git di Linux non ha saputo seguire, letto dal suo errore. `null` = non è quel caso. */
export function worktreeDiWindowsLettoDaLinux(testo) {
    const trovato = RIGA_WORKTREE_WINDOWS.exec(String(testo ?? ''))
    if (!trovato) return null
    const gitdir = trovato[1]
    return { gitdir, principale: gitdir.slice(0, gitdir.lastIndexOf('/.git/worktrees/')) }
}

/** La spiegazione per il modello (inglese, come ogni testo dei risultati degli attrezzi): causa, rimedio, costo, alternativa. */
export function spiegazioneWorktreeWindows({ gitdir, principale }) {
    return 'This is not a broken repository. Git in Linux cannot open this worktree because it was created by Git for Windows, '
        + `which wrote an absolute Windows path in the worktree's .git file (gitdir: ${gitdir}); Linux Git reads that as a relative path. `
        + `Fix, from Git for Windows 2.48 or newer, in the main repository ${principale}: git worktree repair --relative-paths `
        + '(new worktrees: git worktree add --relative-paths). Note: this switches the repository to the relativeWorktrees format '
        + '(core.repositoryformatversion=1), which Git older than 2.48 and libgit2-based tools cannot read. Alternative with no '
        + 'change: run git for this worktree on the Windows side. Propose the fix to the person and do not run it without their answer.'
}
