/*
 * ⛔⛔ F-016 (owner 01/10/2026: «errore spiegato + git worktree repair --relative-paths»; 02/10: «rimedio + avvertenza») — un
 *   worktree creato dal git di Windows, letto dal git della casa Linux. Misure e fonti in `src/kernel/worktree-windows.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { worktreeDiWindowsLettoDaLinux, spiegazioneWorktreeWindows } from '../src/kernel/worktree-windows.mjs'
import { eseguiComandoSandboxato } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

/* La riga vera, misurata il 02/10/2026 col git di WSL 2.53 su un worktree creato dal git per Windows 2.55. */
const VERA = 'fatal: not a git repository: /mnt/c/Users/x/prova/ramo/C:/Users/x/prova/principale/.git/worktrees/ramo'

test('F016-01: dalla riga di git si ricava il gitdir di Windows e il repository principale; gli altri errori non sono il caso', () => {
    assert.deepEqual(worktreeDiWindowsLettoDaLinux(`${VERA}\n`), { gitdir: 'C:/Users/x/prova/principale/.git/worktrees/ramo', principale: 'C:/Users/x/prova/principale' })
    assert.deepEqual(worktreeDiWindowsLettoDaLinux('fatal: not a git repository: C:/a b/r/.git/worktrees/w'), { gitdir: 'C:/a b/r/.git/worktrees/w', principale: 'C:/a b/r' }, 'senza la cartella davanti, e con uno spazio nel percorso')
    for (const altro of [
        'fatal: not a git repository (or any of the parent directories): .git',
        'fatal: not a git repository: (NULL)', // il verso opposto (Windows legge un worktree di Linux): fuori da F-016
        'fatal: not a git repository: /home/u/r/.git/worktrees/w',
        'fatal: not a git repository: /mnt/c/r/C:/r/.git', // non è un worktree
        '', null,
    ]) assert.equal(worktreeDiWindowsLettoDaLinux(altro), null, String(altro))
})

test('F016-02: la spiegazione dice causa, rimedio, versione, costo e alternativa — e chiede di proporlo, non di eseguirlo', () => {
    const s = spiegazioneWorktreeWindows(worktreeDiWindowsLettoDaLinux(VERA))
    assert.match(s, /^This is not a broken repository\./)
    assert.match(s, /gitdir: C:\/Users\/x\/prova\/principale\/\.git\/worktrees\/ramo/)
    assert.match(s, /in the main repository C:\/Users\/x\/prova\/principale: git worktree repair --relative-paths/)
    assert.match(s, /2\.48/)
    assert.match(s, /core\.repositoryformatversion=1.*libgit2/s)
    assert.match(s, /run git for this worktree on the Windows side/)
    assert.match(s, /Propose the fix to the person and do not run it without their answer\.$/)
})

/* ── WSL vero, coi due git veri: il worktree rotto si spiega; riparato, l'esito torna quello di git e basta ─────────── */

const sondaWsl = process.platform === 'win32' ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', 'git --version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null
const sondaGit = process.platform === 'win32' ? spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }) : null
const dueGit = { skip: sondaWsl?.status === 0 && sondaGit?.status === 0 ? false : 'servono Windows, il git di Windows e il git dentro WSL' }

function gitWindows(cartella, ...argomenti) {
    const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'core.autocrlf=false', ...argomenti], { cwd: cartella, encoding: 'utf8', windowsHide: true })
    assert.equal(r.status, 0, r.stderr)
    return r
}

test('F016-03 (WSL vero): il git di Linux su un worktree di Windows — esito di git intatto, accanto la spiegazione; riparato, niente spiegazione', dueGit, async (t) => {
    const base = mkdtempSync(join(tmpdir(), 'talos-f016-'))
    t.after(() => rimuoviCartellaDiProva(base))
    const principale = join(base, 'principale'), ramo = join(base, 'ramo')
    spawnSync('git', ['init', '-q', principale], { windowsHide: true })
    writeFileSync(join(principale, 'a.txt'), 'a\n')
    gitWindows(principale, 'add', 'a.txt')
    gitWindows(principale, 'commit', '-qm', 'uno')
    gitWindows(principale, 'worktree', 'add', '-q', ramo, '-b', 'ramo')

    const rotto = await eseguiComandoSandboxato('git status --short', ramo, { dove: 'wsl2' })
    assert.equal(rotto.enforcement, 'wsl2')
    assert.equal(rotto.codice, 128)
    assert.match(rotto.testo, /fatal: not a git repository: .*\/\.git\/worktrees\/ramo/, 'la riga di git resta')
    assert.match(rotto.testo, /\n\n⛔ This is not a broken repository\..*git worktree repair --relative-paths/s)
    assert.match(rotto.testo, new RegExp(`in the main repository ${principale.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`), 'il repository principale giusto')

    gitWindows(principale, 'worktree', 'repair', '--relative-paths')
    const riparato = await eseguiComandoSandboxato('git status --short', ramo, { dove: 'wsl2' })
    assert.equal(riparato.codice, 0, riparato.testo)
    assert.doesNotMatch(riparato.testo, /not a broken repository/)
})

test('F016-04 (WSL vero): la stessa frase in un comando riuscito, o sullo stdout, non è il caso', dueGit, async (t) => {
    const c = mkdtempSync(join(tmpdir(), 'talos-f016-frase-'))
    t.after(() => rimuoviCartellaDiProva(c))
    const frase = 'fatal: not a git repository: /mnt/c/r/C:/r/principale/.git/worktrees/w'
    const riuscito = await eseguiComandoSandboxato(`echo '${frase}' >&2`, c, { dove: 'wsl2' })
    assert.equal(riuscito.codice, 0)
    assert.doesNotMatch(riuscito.testo, /not a broken repository/, 'un comando riuscito non si spiega')
    const suStdout = await eseguiComandoSandboxato(`echo '${frase}'; exit 3`, c, { dove: 'wsl2' })
    assert.equal(suStdout.codice, 3)
    assert.doesNotMatch(suStdout.testo, /not a broken repository/, 'solo lo stderr: un cat di un registro non è git che fallisce')
    const daGit = await eseguiComandoSandboxato(`echo '${frase}' >&2; exit 128`, c, { dove: 'wsl2' })
    assert.match(daGit.testo, /not a broken repository/, 'controllo del verso: la stessa riga sullo stderr di un comando fallito sì')
})
