/**
 * ⛔ Pad 16/10 (durante K3-C Allegati A1): ruotando il tablet la colonna ▤ diventa il foglio (e il contrario), cioè un altro punto del
 * template, e il pannello rinasceva sulla scheda «Contesto» con le cartelle chiuse e i file scelti persi. Ciò che la persona ha
 * scelto nel pannello lo tiene la schermata, una memoria per sessione, e la passa a tutti e due i posti.
 */
import { computed, ref, type Ref, type WritableComputedRef } from 'vue'
import type { VoceAlberoR4 } from './alberoR4'

export type SchedaPannelloR4 = 'contesto' | 'file' | 'processi' | 'agenti'

export interface MemoriaFileR4 {
    /** I livelli dell'albero già letti (si rileggono comunque a ogni giro finito). */
    livelli: Ref<Map<string, VoceAlberoR4[]>>
    aperte: Ref<Set<string>>
    scelti: Ref<string[]>
    ricerca: Ref<string>
    /** K3 Revisione: il file che la Review chiede di aprire nell'anteprima della scheda File (`null` quando la richiesta è servita). */
    daAprire: Ref<string | null>
}

export interface MemoriaPannelloR4 {
    scheda: Ref<SchedaPannelloR4>
    file: MemoriaFileR4
}

export function creaMemoriaFileR4(): MemoriaFileR4 {
    return { livelli: ref(new Map()), aperte: ref(new Set()), scelti: ref([]), ricerca: ref(''), daAprire: ref(null) }
}

export function creaMemoriaPannelloR4(): MemoriaPannelloR4 {
    return { scheda: ref<SchedaPannelloR4>('contesto'), file: creaMemoriaFileR4() }
}

/**
 * Un valore della memoria che chi lo usa legge e scrive con `.value`, come un `ref` suo; se la memoria arriva da fuori (e cambia
 * con la sessione) si segue quella, altrimenti ne vale una locale.
 */
export function campoDellaMemoriaR4<M, K extends keyof M>(memoria: () => M | undefined, locale: M, chiave: K): WritableComputedRef<M[K] extends Ref<infer V> ? V : never> {
    type V = M[K] extends Ref<infer X> ? X : never
    const sorgente = () => (memoria() ?? locale)[chiave] as unknown as Ref<V>
    return computed<V>({ get: () => sorgente().value, set: (v) => { sorgente().value = v } })
}
