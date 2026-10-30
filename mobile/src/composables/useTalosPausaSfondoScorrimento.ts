/**
 * Lo sfondo animato si ferma SOLO mentre si scorre, e riparte poco dopo (owner 28/10/2026: «se lo switch è acceso animato anche
 * coi messaggi»). Prima, dal 02/09 (`ba89ebaea`), la Chat lo fermava del tutto appena c'erano messaggi, per la fluidità dello
 * scorrimento. Il desktop tiene la fluidità senza spegnerlo: pausa durante lo scorrimento, ripresa 220 ms dopo l'ultimo
 * (`harness-ui/frontend/src/legacy/app.js:20441`, `:20595-20602`, ascoltatori `wheel`/`scroll` in cattura a `:20693-20694`).
 * Stessa forma qui: un tempo solo, ascoltatori passivi, tutto tolto allo smontaggio.
 */
import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'

export const TALOS_RIPRESA_SFONDO_MS = 220

export function useTalosPausaSfondoScorrimento(ritardoMs = TALOS_RIPRESA_SFONDO_MS, bersaglio: Document = document): Ref<boolean> {
    const inPausa = ref(false)
    let tempo: ReturnType<typeof setTimeout> | null = null
    const scorre = (): void => {
        inPausa.value = true
        if (tempo !== null) clearTimeout(tempo)
        tempo = setTimeout(() => {
            tempo = null
            inPausa.value = false
        }, ritardoMs)
    }
    const opzioni = { capture: true, passive: true } as const
    bersaglio.addEventListener('scroll', scorre, opzioni)
    bersaglio.addEventListener('wheel', scorre, opzioni)
    if (getCurrentScope()) {
        onScopeDispose(() => {
            bersaglio.removeEventListener('scroll', scorre, opzioni)
            bersaglio.removeEventListener('wheel', scorre, opzioni)
            if (tempo !== null) clearTimeout(tempo)
        })
    }
    return inPausa
}
