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
export function talosShouldWarmLocalModel(signals: TalosWarmTriggerSignals): boolean {
    if (signals.thermal === null) return false
    if (signals.thermal === 'severe' || signals.thermal === 'critical') return false
    if (signals.availableRamBytes === null || signals.lowMemoryThresholdBytes === null) return false
    return signals.availableRamBytes > signals.lowMemoryThresholdBytes
}
