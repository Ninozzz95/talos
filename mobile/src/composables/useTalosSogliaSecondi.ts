import { computed, getCurrentScope, onScopeDispose, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from 'vue'

/**
 * I SECONDI DI UN CARICAMENTO, SOLO DOPO 2 s (owner 29/10, mockup «Caricamenti vivi» v6 approvato; regola comune col desktop
 * `SOGLIA_CARICAMENTO_VIVO_MS`): nei primi 2 s resta il testo di sempre, fermo, così un caricamento rapido non lampeggia; poi la riga
 * in corso riceve l'ora d'inizio e mostra «· 2s», «· 1m 4s».
 * Lo usano la carta d'attesa della Chat (`TalosAttesaCarta`) e le attese che possono durare nei fogli del Codice (Albero, Doctor, Hook).
 *   · `attivo`: l'attesa c'è (di serie sì). Quando torna vera l'attesa ricomincia da capo; quando è falsa niente secondi, niente timer.
 *   · `inizio`: l'ora vera dell'evento, se la si sa; senza, l'attesa comincia quando `attivo` diventa vero.
 *   · `chiave`: cambia a soglia passata. Data alla riga come `:key`, la fa rinascere: la riga si iscrive di nuovo all'orologio unico della
 *     pagina e legge l'ora di ADESSO, non quella dell'ultimo battito (fino a 1 s indietro: «· 1s» a 2 s, TRASC-06).
 */
export const SOGLIA_SECONDI_MS = 2_000

export function useTalosSogliaSecondi(opzioni: {
    attivo?: MaybeRefOrGetter<boolean>
    inizio?: MaybeRefOrGetter<number | null | undefined>
} = {}): { inizio: ComputedRef<number | null>, chiave: ComputedRef<string> } {
    const attivo = computed(() => toValue(opzioni.attivo) ?? true)
    const partitoAlle = ref(Date.now())
    const oltreSoglia = ref(false)
    let soglia: ReturnType<typeof setTimeout> | null = null
    function spegni(): void {
        if (soglia !== null) clearTimeout(soglia)
        soglia = null
    }

    const da = computed(() => {
        const vero = toValue(opzioni.inizio)
        return typeof vero === 'number' && Number.isFinite(vero) ? vero : partitoAlle.value
    })
    // un'attesa che ricomincia (il Doctor «Ricontrolla») riparte da zero
    watch(attivo, (ora, prima) => { if (ora && prima === false) partitoAlle.value = Date.now() }, { flush: 'sync' })
    watch([attivo, da], ([acceso, inizio]) => {
        spegni()
        oltreSoglia.value = false
        if (!acceso) return
        const manca = inizio + SOGLIA_SECONDI_MS - Date.now()
        if (manca <= 0) oltreSoglia.value = true
        else soglia = setTimeout(() => { soglia = null; oltreSoglia.value = true }, manca)
    }, { immediate: true, flush: 'sync' })
    if (getCurrentScope()) onScopeDispose(spegni)

    return {
        inizio: computed(() => (attivo.value && oltreSoglia.value ? da.value : null)),
        chiave: computed(() => (oltreSoglia.value ? 'secondi' : 'testo')),
    }
}
