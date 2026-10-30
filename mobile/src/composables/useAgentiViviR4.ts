import { computed, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { figlieAlLavoroR4 } from '@/lib/harness/r4/fermaTuttoR4'
import type { AgenteR4 } from '@/lib/harness/r4/agentiR4'

/**
 * ⛔ «Ferma tutto» (owner 29/10/2026; scheda `mockup/ferma-tutto/pezzi/SCHEDA-DI-CONSEGNA.md`, voce 1; ledger
 * `LEDGER-FERMA-TUTTO-MOBILE-2026-10-29.md`, riga 8): gli agenti VIVI sotto la conversazione del Codice su r4, per la SCHERMATA — lo Stop,
 * il foglio, la riga viva e lo Stop a chat ferma — anche col pannello chiuso. È il numero del contratto (`figlieAlLavoroR4`: tutto il
 * sottoalbero lungo `padreId`, non conclusi e non interrotti; chi aspetta conta, chi è in pausa no).
 * Le sorgenti sono quelle del pannello (`TalosCodiceR4Pannello.vue`, scheda Agenti), stesso cliente r4, fuse per `sessionId` (l'ultima
 * vince): l'elenco `GET /api/v1/sessions` (con le nipoti e `padreId`), i figli `GET /:id/children` (senza `padreId` sono di questa
 * chat), le istantanee dal vivo `talos.agenti` (`pannelloR4.ts`, `agentiInDiretta`). Si rilegge quando il pannello si rilegge:
 * all'apertura della sessione, a ogni giro finito, quando una figlia nasce o finisce dal vivo; e su richiesta (dopo uno Stop).
 * Una lettura non riuscita lascia gli agenti di prima: un dato che manca non diventa un numero.
 */
export interface AgentiViviR4 {
    /** Gli id dei vivi, nell'ordine dell'elenco; il numero è `quanti`. */
    vivi: ComputedRef<string[]>
    quanti: ComputedRef<number>
    rileggi: () => Promise<void>
}

/** Una voce dell'elenco, dei figli o dal vivo: la forma larga di `agentiR4.ts` (le stesse che il pannello riceve). */
type Voce = AgenteR4

export function useAgentiViviR4(opzioni: {
    radice: MaybeRefOrGetter<string | null | undefined>
    inDiretta: MaybeRefOrGetter<readonly { radice: string; agente: Voce }[]>
    caricaSessioni: () => Promise<readonly Voce[] | null>
    caricaFigli: () => Promise<readonly Voce[] | null>
    giriFiniti?: MaybeRefOrGetter<number>
}): AgentiViviR4 {
    const sessioniLette = ref<readonly Voce[]>([])
    const figliLetti = ref<readonly Voce[]>([])
    const radice = computed(() => toValue(opzioni.radice) || null)
    // vale solo l'ultima lettura partita (come l'elenco del Codice, REV-ELENCO-03): una lenta non rimette dati vecchi
    let ultima = 0

    async function rileggi(): Promise<void> {
        const id = radice.value
        if (!id) return
        const questa = ++ultima
        const [s, f] = await Promise.all([
            opzioni.caricaSessioni().catch(() => null),
            opzioni.caricaFigli().catch(() => null),
        ])
        if (questa !== ultima || radice.value !== id) return
        if (s) sessioniLette.value = s
        if (f) figliLetti.value = f
    }

    const inDiretta = computed(() => {
        const id = radice.value
        return id ? toValue(opzioni.inDiretta).filter((v) => v.radice === id).map((v) => v.agente) : []
    })
    watch(radice, () => {
        sessioniLette.value = []
        figliLetti.value = []
        void rileggi()
    }, { immediate: true })
    watch(() => toValue(opzioni.giriFiniti) ?? 0, () => { void rileggi() })
    // come il pannello: una figlia che nasce o finisce dal vivo fa rileggere elenco e figli
    watch(() => inDiretta.value.map((a) => `${String(a.sessionId)}:${a.conclusa === true}`).join('|'), (ora, prima) => { if (ora !== prima) void rileggi() })

    const vivi = computed(() => {
        const id = radice.value
        if (!id) return []
        const figli = figliLetti.value.map((f) => ({ ...f, padreId: f.padreId ?? id }))
        return figlieAlLavoroR4([...sessioniLette.value, ...figli, ...inDiretta.value], id)
    })
    return { vivi, quanti: computed(() => vivi.value.length), rileggi }
}
