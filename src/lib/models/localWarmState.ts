import { readonly, ref, type DeepReadonly, type Ref } from 'vue'
import type { TalosLocalWarmRefusal } from '@/lib/models/localWarmTrigger'

/**
 * ⛔⛔⛔ A CHE PUNTO E' L'APERTURA DEL MODELLO LOCALE — 2026-09-10.
 *
 * ## Il difetto che questo file chiude
 *
 * Il riscaldamento anticipato esisteva da agosto (P3-1) ed era **muto per
 * costruzione**: ogni ramo finiva in un `catch {}` senza un log, senza uno
 * stato, senza un contatore. Il 10/09 il modello e' risultato freddo due
 * minuti dopo essere stato scelto — 32,0 s alla prima parola contro i 351 ms
 * di PocketPal — e **nessuna delle tre spiegazioni possibili era distinguibile
 * dalle altre**, perche' tutte e tre producono esattamente lo stesso niente.
 *
 * ⇒ Owner, 10/09: «un riscaldamento che non parte per calore e' una scelta
 * legittima; un riscaldamento che non parte in silenzio e' un difetto».
 *
 * ## Perche' uno stato e non solo un avviso a schermo
 *
 * Un avviso passa. Questo resta, e risponde a due domande diverse che finora
 * non aveva senso porre: «sta caricando adesso?» (quello che la persona vede)
 * e «quanto e' costata l'ultima apertura?» (quello che serve per non
 * confondere il tempo del DISCO col tempo del MOTORE — sono due cose, e
 * sommarle fa sembrare lento chi non lo e').
 *
 * ## Perche' un modulo suo
 *
 * Perche' chi lo SCRIVE (`localWarmSelectedModel.ts`, che chiama il ponte
 * nativo) e chi lo LEGGE (una superficie qualunque) non devono trascinarsi
 * dietro gli import l'uno dell'altro. Nessun Pinia: lo stato e' uno solo per
 * processo come il motore che descrive, e una store con un ciclo di vita
 * legato a un'app Vue direbbe una bugia su un motore che vive oltre di essa.
 *
 * ⛔ Vive fuori dal grafo d'avvio: lo importano solo moduli pigri.
 */

export type TalosLocalWarmPhase =
    /** Nessun modello locale e' stato scelto in questa sessione. */
    | 'idle'
    /** I pesi si stanno leggendo dal disco ADESSO. */
    | 'opening'
    /** Il modello e' in memoria: il prossimo messaggio non paga l'apertura. */
    | 'ready'
    /** Non e' partito, e `refusal` dice perche'. Non e' un guasto: e' una scelta. */
    | 'skipped'
    /** Ci ha provato e non ce l'ha fatta. Il primo messaggio riaprira' comunque. */
    | 'failed'

export interface TalosLocalWarmState {
    phase: TalosLocalWarmPhase
    /**
     * Il nome corto del modello — quello che la persona ha toccato nell'elenco.
     * ⛔ Mai il percorso: questo campo puo' finire a schermo.
     */
    model: string
    /** Il file, per chi deve confrontare. ⛔ Non si mostra a nessuno. */
    path: string | null
    /**
     * Quanto e' costata l'APERTURA, in millisecondi. Null finche' non e'
     * finita, e null per sempre se non e' mai partita.
     *
     * ⛔ Non e' il tempo alla prima parola e non va sommato con quello: uno e'
     * il disco che consegna 1,6 GB, l'altro e' il motore che macina il prompt.
     */
    openMs: number | null
    /** Perche' non e' partito. Valorizzato solo con `phase === 'skipped'`. */
    refusal: TalosLocalWarmRefusal | null
    /**
     * Il bersaglio e' stato scelto senza le misure di questo dispositivo —
     * perche' non potevano cambiare la decisione, o perche' non sono arrivate
     * entro il tetto d'attesa. E' la differenza fra «CPU perche' l'ha vinta» e
     * «CPU perche' non ho aspettato», e va tenuta.
     */
    withoutMeasuredProfiles: boolean
}

const IDLE: TalosLocalWarmState = Object.freeze({
    phase: 'idle',
    model: '',
    path: null,
    openMs: null,
    refusal: null,
    withoutMeasuredProfiles: false,
})

const stato = ref<TalosLocalWarmState>(IDLE)

/** Sola lettura: lo stato lo scrive chi apre, non chi guarda. */
export function talosLocalWarmState(): DeepReadonly<Ref<TalosLocalWarmState>> {
    return readonly(stato)
}

export function talosSetLocalWarmState(next: TalosLocalWarmState): void {
    stato.value = next
}

/** Solo per i test: riporta il processo allo stato di chi non ha ancora scelto niente. */
export function __resetTalosLocalWarmStateForTests(): void {
    stato.value = IDLE
}
