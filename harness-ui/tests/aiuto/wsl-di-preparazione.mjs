/*
 * I comandi di PREPARAZIONE di una prova in WSL (creare un collegamento, una cartella): misurato il 01/10/2026 nella suite
 * completa, il servizio di WSL a volte non risponde (~30 s, poi `Wsl/Service/0x8007274c`, scritto da wsl.exe su STDOUT in
 * UTF-16; microsoft/WSL#12960, openai/codex#46703). Un `ln -s` caduto lì faceva fallire CL-10 più avanti con un ENOENT che
 * accusava il prodotto. ⇒ Si rifà UNA volta; se fallisce ancora, la prova si ferma dicendo che è la preparazione.
 */
import { spawnSync } from 'node:child_process'

export function wslDiPreparazione(argomenti) {
    let ultimo = null
    for (let tentativo = 1; tentativo <= 2; tentativo += 1) {
        ultimo = spawnSync('wsl.exe', argomenti, { encoding: 'utf8', windowsHide: true, timeout: 60_000 })
        if (ultimo.status === 0) return ultimo
    }
    const testo = `${String(ultimo.stdout ?? '')} ${String(ultimo.stderr ?? '')}`.replace(/\0/gu, '').trim()
    throw new Error(`preparazione in WSL non riuscita (wsl.exe ${argomenti.join(' ')}): uscita ${ultimo.status}${ultimo.error ? `, ${ultimo.error.message}` : ''}${testo ? ` — ${testo.slice(0, 300)}` : ''}`)
}
