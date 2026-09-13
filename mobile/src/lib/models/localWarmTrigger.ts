import type { TalosThermalState } from '@/lib/models/fit'

/**
 * P3-1 — decidere SE aprire un modello locale in anticipo, non farlo.
 *
 * ## Perché è un modulo a parte, puro
 *
 * `services/localEngine.ts` dichiara da sé di essere una "thin door" verso
 * il nativo — apre, chiude, non decide niente. Mettere qui il giudizio
 * ambientale (termico, memoria) violerebbe esattamente quel principio: la
 * decisione vive in un modulo suo, zero I/O, provabile senza un telefono e
 * senza mock del plugin. Chi vuole aprire in anticipo raccoglie i segnali
 * (una sola chiamata a `talosMeasureDevice()` li dà entrambi) e chiama
 * questa funzione prima di eseguire qualunque cosa.
 *
 * ## Cosa NON decide
 *
 * Non decide se il provider selezionato è locale (lo sa già chi chiama —
 * `chatController.selectModel`, che ha appena letto `provider === 'local'`
 * dal profilo scelto) e non decide il path: quello arriva da un catalogo
 * che garantisce già che il file esista. Qui restano solo i due segnali
 * ambientali che design.md §19.2 elenca esplicitamente come condizioni
 * AND, e che nessun catalogo può conoscere in anticipo.
 *
 * ## Conferma esterna, non solo il documento sorgente
 *
 * Ricerca web di questo stesso passo: la guida ufficiale Android Developers
 * ("Don't Prewarm App Features", medium.com/androiddevelopers) è esplicita
 * — pre-scaldare una funzione al lancio dell'app fa pagare un costo
 * condiviso a chi non la userà mai, a spese del tempo di avvio percepito.
 * È lo stesso principio che design.md §19.3 chiama "non fare" per questo
 * item: il warm-load parte su un segnale di intento reale (la scelta
 * esplicita del modello), mai al lancio.
 */
export interface TalosWarmTriggerSignals {
    thermal: TalosThermalState | null
    availableRamBytes: number | null
    lowMemoryThresholdBytes: number | null
}

/**
 * `null` su un segnale non è "procedi lo stesso": un warm-load è
 * un'ottimizzazione silenziosa, non una richiesta esplicita dell'utente — a
 * differenza delle capacità di un modello (dove "ignoto" non deve mai
 * diventare "no"), qui il rischio e il beneficio sono asimmetrici: il
 * peggio che può succedere non aprendo è tre secondi risparmiati in meno;
 * il peggio che può succedere aprendo alla cieca è lavoro e memoria spesi
 * mentre il telefono è già in difficoltà. Prudenza sul dato mancante, non
 * sul dato negativo.
 */
/**
 * ⛔⛔ PERCHE' NO — la meta' che mancava, 2026-09-10.
 *
 * Il cancello rispondeva `false` e basta. Un `false` non si distingue da un
 * riscaldamento che non e' mai partito, e infatti il 10/09 nessuno ha potuto
 * dire quale delle tre spiegazioni fosse quella vera: il cancello, il
 * sondaggio o un percorso morto. Owner, stesso giorno: «un riscaldamento che
 * non parte per calore e' una scelta legittima; un riscaldamento che non parte
 * in silenzio e' un difetto».
 *
 * ⇒ Una sola implementazione, due letture. `talosShouldWarmLocalModel` resta
 * il predicato di prima — stessa firma, stessi esiti — ed e' scritto SOPRA
 * questa funzione invece che accanto: due copie della stessa regola sono due
 * copie che un giorno divergono, ed e' il difetto che questo file gia'
 * dichiara di voler evitare per la decisione.
 */
export type TalosLocalWarmRefusal =
    /** Il dispositivo non ha detto quanto scotta (sotto API 29, o nessun PowerManager). */
    | 'unknown-heat'
    /** Ha detto che scotta: `severe` o `critical`. */
    | 'too-warm'
    /** Non ha detto quanta memoria e' libera, o qual e' la sua soglia. */
    | 'unknown-memory'
    /** L'ha detto, ed e' sotto la soglia con cui il sistema comincia a sfrattare. */
    | 'low-memory'

export function talosWhyNotWarmLocalModel(
    signals: TalosWarmTriggerSignals,
): TalosLocalWarmRefusal | null {
    if (signals.thermal === null) return 'unknown-heat'
    if (signals.thermal === 'severe' || signals.thermal === 'critical') return 'too-warm'
    if (signals.availableRamBytes === null || signals.lowMemoryThresholdBytes === null) {
        return 'unknown-memory'
    }
    return signals.availableRamBytes > signals.lowMemoryThresholdBytes ? null : 'low-memory'
}

export function talosShouldWarmLocalModel(signals: TalosWarmTriggerSignals): boolean {
    return talosWhyNotWarmLocalModel(signals) === null
}
