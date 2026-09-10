#!/usr/bin/env node
/**
 * ⭐⭐⭐ LA MISURA DI P-13 — prima e dopo, con UNA leva sola.
 *
 * ```
 * node misuraP13.mjs --controlla     dice cosa userebbe, senza spendere niente
 * node misuraP13.mjs --prima         corsa con l'elenco SPENTO
 * node misuraP13.mjs --dopo          corsa con l'elenco ACCESO
 * ```
 *
 * ## ⛔ Perché questo file esiste invece di due righe di comando
 *
 * «La cura che vive nella memoria non è una cura»: questa misura ha **quattro** parametri che devono
 * combaciare fra prima e dopo, e sbagliarne uno solo la rende muta. Scriverli qui significa che il
 * prossimo che la rilancia — anche fra un mese — non deve ricordarseli.
 *
 * 1. **Lo stesso kernel.** Senza `TALOS_HARNESS` il banco usa il kernel del MOBILE
 *    (`AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`, 350.796 byte, 06/09), non quello
 *    del prodotto (368.343 byte, 10/09). Sono due file diversi, quattro giorni di distanza: le due
 *    righe di P-13 stanno solo nel secondo. ⛔ E prima e dopo devono usare lo STESSO file, o si
 *    confrontano due kernel invece di una leva.
 * 2. **Lo stesso modello**, e non è il default. ⛔ Senza `BANCO_MODELLO` il banco gira con
 *    **`qwen/qwen3.7-flash`** — che è (a) vietato dalla decisione dell'owner del 09/09 «giri reali
 *    solo con glm-5.3-flash», e (b) il modello che ha già CONTAMINATO la campagna del 20/08: un
 *    solo fornitore su pool condiviso, e il banco scriveva `fallito` dove il fornitore rispondeva
 *    **429**. `glm-5.3-flash` ha 28 endpoint su 25 fornitori (letto dall'API di OpenRouter il
 *    10/09), quindi quel caso è molto più improbabile — non impossibile.
 * 3. **Lo stesso corpus**, e dichiarato accanto al risultato: un confronto vale solo a parità di
 *    corpus («confounded scaffold-model effects»).
 * 4. **La leva, e solo quella**: `BANCO_ELENCO_PROFONDO=1` accende l'elenco in `harness.mjs`.
 *    Qualunque altro valore lo lascia spento — provato.
 */

import { existsSync, statSync } from 'node:fs'

export const KERNEL_DEL_PRODOTTO =
    'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/src/kernel/talosHarness.mjs'

/** Il kernel che il banco userebbe SENZA che nessuno dica niente: quello del mobile. */
export const KERNEL_PREDEFINITO_DEL_BANCO =
    'C:/Users/Antonino/Desktop/projects/AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs'

export const MODELLO = 'z-ai/glm-5.3-flash'
export const RIPETIZIONI = 3

/** Che cosa girerebbe, senza spendere un centesimo. */
export function controlla() {
    const righe = []
    const dim = (p) => (existsSync(p) ? `${statSync(p).size} byte, ${statSync(p).mtime.toISOString().slice(0, 10)}` : 'MANCA')
    righe.push(`kernel del prodotto : ${KERNEL_DEL_PRODOTTO}`)
    righe.push(`                      ${dim(KERNEL_DEL_PRODOTTO)}`)
    righe.push(`kernel del banco    : ${dim(KERNEL_PREDEFINITO_DEL_BANCO)}  ← quello che userebbe da solo`)
    righe.push(`TALOS_HARNESS ora   : ${process.env.TALOS_HARNESS ?? '(non impostata → userebbe quello del banco)'}`)
    righe.push(`modello             : ${MODELLO}`)
    righe.push(`ripetizioni         : ${RIPETIZIONI}`)
    righe.push(`leva ora            : BANCO_ELENCO_PROFONDO=${process.env.BANCO_ELENCO_PROFONDO ?? '(assente → elenco SPENTO)'}`)
    return righe.join('\n')
}

/**
 * L'ambiente per una delle due corse.
 * ⛔ Torna un oggetto invece di toccare `process.env`: chi lancia deve vedere che cosa sta per
 *   fissare, e due corse nello stesso processo non devono potersi sporcare a vicenda.
 */
export function ambientePer(fase) {
    if (fase !== 'prima' && fase !== 'dopo') throw new Error(`fase sconosciuta: ${fase} (attese "prima" o "dopo")`)
    return {
        TALOS_HARNESS: KERNEL_DEL_PRODOTTO,
        BANCO_PROVIDER: 'openrouter',
        BANCO_MODELLO: MODELLO, // ⛔ senza questa il banco gira con qwen3.7-flash: vedi il punto 2
        BANCO_CORPUS: 'storia',
        ...(fase === 'dopo' ? { BANCO_ELENCO_PROFONDO: '1' } : {}),
    }
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
    const che = process.argv[2] ?? '--controlla'
    if (che === '--controlla') {
        console.log(controlla())
        console.log('\nprima:', JSON.stringify(ambientePer('prima')))
        console.log('dopo :', JSON.stringify(ambientePer('dopo')))
    } else {
        console.error('⛔ Le corse vere non partono da qui: sono lunghe e costano.')
        console.error('   Questo file dichiara i parametri; chi lancia li applica e sa che cosa sta spendendo.')
        process.exitCode = 2
    }
}
