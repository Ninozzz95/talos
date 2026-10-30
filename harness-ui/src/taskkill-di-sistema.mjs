/*
 * The system's `taskkill.exe`, by its full path (J-R4, block 9 adversarial review, 27/10/2026).
 *
 * `execFile('taskkill', …)` by NAME lets Windows look for it: first in the current folder of the server (unless the environment has
 * `NoDefaultCurrentDirectoryInExePath` — ⛔ correction of the block 10 review: the server DOES set it, `server.mjs` imports
 * `difesa-ricerca-programmi.mjs` first, so in the app only the PATH case was reachable), then in the folders of the server's PATH — and libuv searches the
 * PARENT's PATH when the child's environment has none, so `env: { SystemRoot }` did not narrow it. The reviewer planted a harmless
 * `taskkill.exe` in both places and it ran instead of the system's, leaving the process tree alive (`J-taskkill-piantato.test.mjs`).
 *
 * The cure is the one of `remoto/elevazione.mjs` (C-R2, block 8): a path under `SystemRoot`, with `SystemRoot` accepted only when it is a
 * drive root with a letter (`^[A-Za-z]:\\`). `win32.isAbsolute` says yes to `\Windows` (on the current folder's drive) and to a network
 * root `\\server\share`, and an empty or relative value would make the path relative again: every other shape is `C:\Windows`.
 */
import { win32 } from 'node:path';

export const SYSTEM_ROOT_DI_SERIE = 'C:\\Windows';

/** `SystemRoot` if it is a drive root with a letter, else `C:\Windows`. */
export function radiceDiSistema(systemRoot = process.env.SystemRoot) {
  return typeof systemRoot === 'string' && /^[A-Za-z]:\\/u.test(systemRoot) ? systemRoot : SYSTEM_ROOT_DI_SERIE;
}

/** `<SystemRoot>\System32\taskkill.exe`, never a name Windows would search for. */
export function percorsoTaskkill(systemRoot = process.env.SystemRoot) {
  return win32.join(radiceDiSistema(systemRoot), 'System32', 'taskkill.exe');
}

/*
 * G-R5 (block 10 review, 27/10/2026): the same rule for the other two system programs the server modules started by NAME —
 * `powershell.exe` (the process table of the adopted background commands, `impronta-processo.mjs`; the resource sampler,
 * `risorse-processi.mjs`) and `wsl.exe` (the WSL sampler). A planted `powershell.exe` in the server's PATH ran instead of the system's
 * (`G-taskkill-cura.test.mjs` G4). Both live under System32 on every Windows that has them: Windows PowerShell 5.1 at
 * `System32\WindowsPowerShell\v1.0\powershell.exe` (its fixed place since Windows 7), and the inbox `System32\wsl.exe`, which also
 * forwards to the Store WSL when that is installed (measured on this PC, 27/10/2026: both files present; `where wsl` lists
 * System32 first and the WindowsApps alias second).
 * ⛔ The kernel (`src/kernel/`, shared with the CLI) still starts `taskkill` and `wsl.exe` by name: not changed here, listed for the CLI.
 */

/** `<SystemRoot>\System32\WindowsPowerShell\v1.0\powershell.exe`, never a name Windows would search for. */
export function percorsoPowershell(systemRoot = process.env.SystemRoot) {
  return win32.join(radiceDiSistema(systemRoot), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** `<SystemRoot>\System32\wsl.exe`, never a name Windows would search for. */
export function percorsoWsl(systemRoot = process.env.SystemRoot) {
  return win32.join(radiceDiSistema(systemRoot), 'System32', 'wsl.exe');
}
