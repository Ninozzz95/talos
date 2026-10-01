/*
 * ⛔ 01/10/2026 — PR pubblica #45 (desktop 0.1.20), job `desktop` rosso su `windows-latest`: dieci prove che lanciano processi
 *   VERI in WSL (SHELL07, OUTPUT13-WSL, META16-SESSION-wsl2, OUTPUT17-HEAP-wsl, WF08) si saltavano solo fuori da Windows, cioè
 *   davano per scontato che su ogni Windows WSL funzioni. Il runner ha `wsl.exe` ma nessuna distribuzione: «WSL non è installato
 *   o non risponde». Le altre prove WSL del repo si saltavano già con una sonda vera (`shell-wsl-data-boundary.test.mjs:10-12`,
 *   `shell-heredoc.test.mjs:12`): qui la stessa sonda, in un posto solo.
 * ⇒ `SALTA_SENZA_WSL` è `false` quando `wsl.exe --exec bash --version` risponde 0, altrimenti il motivo del salto (stringa).
 *   Si usa SOLO sulle varianti che lanciano WSL: quelle Windows girano sempre.
 */
import { spawnSync } from 'node:child_process'

const sonda = process.platform === 'win32'
    ? spawnSync('wsl.exe', ['--exec', 'bash', '--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
    : null

export const SALTA_SENZA_WSL = process.platform !== 'win32'
    ? 'Windows/WSL integration: not Windows'
    : sonda?.status === 0 ? false : 'WSL/Bash unavailable: real integration not executed'
