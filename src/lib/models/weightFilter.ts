/**
 * Scegliere la TAGLIA di un modello, non subirla.
 *
 * Owner 2026-08-05: «mettere un filtro di peso per i modelli locali, così filtro
 * solo i pesi (tipo 4 miliardi o 5 miliardi) che vuole utente».
 *
 * ## Perche' non e' lo stesso di «Ci sta»
 *
 * «Ci sta» risponde a *questo telefono ce la fa?*. Questo risponde a *quanto lo
 * voglio grande?*, ed e' una domanda diversa: c'e' chi vuole un modello piccolo
 * **anche se** quello grande entra, perche' risponde prima, scalda meno e non
 * si mangia la batteria. Un filtro che li confonde toglie quella scelta.
 *
 * ## Le fasce, e perche' proprio queste
 *
 * RICERCATO 2026-08-05: Hugging Face filtra per parametri con un intervallo
 * (`num_parameters=min:0,max:12B`) e delle fasce di comodo — <1B, 6B, 12B, 32B,
 * 128B, >500B. Sono pensate per un desktop: su un telefono **32B, 128B e 500B
 * danno la stessa risposta**, cioe' no. Tre quarti del controllo non servirebbe
 * a niente.
 *
 * Quindi i tagli stanno dove le famiglie si separano davvero su un telefono:
 *
 *     fino a 1B   0.5 · 0.6 · 1        gira su qualunque cosa
 *     1-4B        1.5 · 2 · 3 · 3.8    la fascia dei telefoni
 *     4-8B        7 (e i 4 quantizzati grossi)
 *     8-16B       9 · 12 · 14          solo i telefoni con molta RAM
 *     oltre 16B   30 · 70              oggi, su un telefono, no
 *
 * Un 4B e un 5B finiscono in fasce **diverse**: e' esattamente la distinzione
 * che l'owner ha chiesto nominando «4 miliardi o 5 miliardi».
 *
 * ## Il numero e' VERO, non dedotto
 *
 * `expand[]=gguf` restituisce `total`, cioe' i parametri esatti letti dal file.
 * Il nome resta solo come ripiego per le righe che il Hub non e' riuscito ad
 * aprire — e quando manca anche quello, la riga **non si esclude**: verrebbe
 * nascosta per un dato mancante invece che per una sua caratteristica, e chi
 * guarda non avrebbe modo di capire perche' e' sparita.
 */
import { talosEstimateSizeFromName } from './sizeFromName'

export type TalosWeightBandId = 'fino-1' | '1-4' | '4-8' | '8-16' | 'oltre-16'

/** Dalla piu' piccola alla piu' grande: l'ordine E' l'interfaccia. */
export const TALOS_WEIGHT_BANDS: readonly TalosWeightBandId[] =
    Object.freeze(['fino-1', '1-4', '4-8', '8-16', 'oltre-16'])

/**
 * I confini, in miliardi di parametri.
 *
 * Il limite superiore e' **incluso**, l'inferiore escluso: cosi' un modello «da
 * 4B» tondo finisce nella fascia che porta il suo nome, invece che in quella
 * dopo. Chi legge «1-4B» si aspetta di trovarci il 4B.
 */
const CONFINI: Record<TalosWeightBandId, { oltre: number; finoA: number }> = {
    'fino-1': { oltre: 0, finoA: 1 },
    '1-4': { oltre: 1, finoA: 4 },
    '4-8': { oltre: 4, finoA: 8 },
    '8-16': { oltre: 8, finoA: 16 },
    'oltre-16': { oltre: 16, finoA: Number.POSITIVE_INFINITY },
}

/** Quel poco che serve sapere di una riga per pesarla. */
export interface TalosWeighableModel {
    id: string
    gguf?: { parameters?: number | null } | null
}

/**
 * I parametri in miliardi, o `null` se non si sanno.
 *
 * `null` non e' zero e non e' «piccolo»: e' l'assenza di una misura, e chi
 * chiama deve trattarla come tale.
 */
export function talosModelParametersB(model: TalosWeighableModel): number | null {
    const misurati = model.gguf?.parameters
    if (typeof misurati === 'number' && Number.isFinite(misurati) && misurati > 0) {
        return misurati / 1e9
    }
    // Ripiego: il nome quasi sempre porta i parametri («…-30B-A3B…»).
    return talosEstimateSizeFromName(model.id)?.parametersB ?? null
}

/**
 * Se questo modello appartiene a quella fascia.
 *
 * Taglia ignota → **passa**, per ogni fascia. Vedi la dottrina in testa al file.
 */
export function talosModelPassesWeightBand(
    model: TalosWeighableModel,
    band: TalosWeightBandId,
): boolean {
    const miliardi = talosModelParametersB(model)
    if (miliardi === null) return true
    const { oltre, finoA } = CONFINI[band]
    return miliardi > oltre && miliardi <= finoA
}
