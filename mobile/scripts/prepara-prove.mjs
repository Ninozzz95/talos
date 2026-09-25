/**
 * `npm run prepara:prove` — rende eseguibili le prove su un clone pulito di `mobile/`.
 *
 * ⭐ PREPARA-PROVE (owner 25/09/2026, «uno script + README»). Misurato il 25/09: con solo `mobile/` in una cartella
 * vuota, `npm ci` e `npm run build` sono verdi ma 31 prove cadono per file che git non porta:
 * - `scripts/harness-talos/dist/kernelPerIlBanco.js`, il kernel compilato per il banco (`npm run harness:kernel`; esce
 *   byte per byte uguale alla copia spedita in `android/.../talos-harness-ui/kernel/dist/`);
 * - i `node_modules` di `tools/android-assets` e `tools/git-bash-launcher`, pacchetti a sé col loro lock;
 * - `android/app/src/main/res/xml/config.xml`, scritto da `npx cap sync android` (che vuole la build in `dist/`).
 * Fa solo i passi che mancano, in quest'ordine; se uno fallisce si ferma e lo dice.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MOBILE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {(percorso: string) => boolean} esiste percorso relativo a `mobile/`
 * @returns {{perche: string, comando: string, argomenti: string[], cartella: string}[]}
 */
export function passiMancanti(esiste) {
    const passi = []
    if (!esiste('scripts/harness-talos/dist/kernelPerIlBanco.js')) {
        passi.push({ perche: 'kernel compilato per il banco', comando: 'npm', argomenti: ['run', 'harness:kernel'], cartella: '.' })
    }
    for (const strumento of ['tools/android-assets', 'tools/git-bash-launcher']) {
        if (!esiste(`${strumento}/node_modules`)) {
            passi.push({ perche: `dipendenze di ${strumento}`, comando: 'npm', argomenti: ['ci'], cartella: strumento })
        }
    }
    if (!esiste('android/app/src/main/res/xml/config.xml')) {
        if (!esiste('dist/index.html')) {
            passi.push({ perche: 'build web (serve alla sincronizzazione)', comando: 'npm', argomenti: ['run', 'build'], cartella: '.' })
        }
        passi.push({ perche: 'config.xml di Capacitor', comando: 'npx', argomenti: ['cap', 'sync', 'android'], cartella: '.' })
    }
    return passi
}

function esegui() {
    const passi = passiMancanti((percorso) => existsSync(join(MOBILE, percorso)))
    if (passi.length === 0) {
        console.log('prepara:prove — già tutto pronto.')
        return 0
    }
    for (const passo of passi) {
        const riga = [passo.comando, ...passo.argomenti].join(' ')
        console.log(`prepara:prove — ${passo.perche}: ${riga} (in ${passo.cartella})`)
        // `npm` e `npx` su Windows sono file .cmd: senza shell non partono. Comandi e argomenti sono fissi, qui sopra.
        const esito = spawnSync(passo.comando, passo.argomenti, {
            cwd: join(MOBILE, passo.cartella),
            stdio: 'inherit',
            shell: process.platform === 'win32',
        })
        if (esito.status !== 0) {
            console.error(`prepara:prove — fallito: ${riga} (in ${passo.cartella}), uscita ${esito.status ?? esito.signal}`)
            return esito.status || 1
        }
    }
    console.log('prepara:prove — pronto: ora `npx vitest run`.')
    return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = esegui()
}
