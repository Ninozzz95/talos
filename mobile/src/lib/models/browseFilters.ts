/**
 * I filtri della lista dei modelli, come nel mockup approvato.
 *
 * Owner 2026-08-04: «voglio una lista già caricata con un loading, con i
 * filtri». Nel mockup sono cinque chip: Ci sta · Chat · Codice · Q4 · Licenza
 * libera.
 *
 * ## Perche' questi cinque e non le faccette del Hub
 *
 * Hugging Face espone decine di categorie. Nessuna risponde alla domanda che si
 * fa chi sta scegliendo un modello da mettere su un TELEFONO, che e' sempre la
 * stessa: entra? serve a cosa? quanto perdo di qualita'? posso usarlo?
 *
 * Ogni filtro qui e' una di quelle quattro domande. Il quinto — «ci sta» — e'
 * l'unico che non esiste su nessun altro catalogo, perche' e' l'unico che ha
 * bisogno di sapere quanta memoria ha QUESTO dispositivo.
 *
 * ## «Ci sta» filtra, l'etichetta resta
 *
 * L'owner ha deciso che la capienza si vede sempre come etichetta. Questo
 * filtro non la contraddice: e' un gesto ESPLICITO per dire «mostrami solo
 * quelli che posso avere adesso», e resta spento finche' non lo si tocca.
 * L'etichetta continua a esserci su tutte le righe, filtro o no.
 */
import { talosEstimateSizeFromName, talosEstimatedBand } from './sizeFromName'

export type TalosBrowseFilterId = 'fits' | 'chat' | 'code' | 'q4' | 'open-licence'

export const TALOS_BROWSE_FILTERS: readonly TalosBrowseFilterId[] =
    Object.freeze(['fits', 'chat', 'code', 'q4', 'open-licence'])

export interface TalosBrowsableModel {
    id: string
    task?: string | null
    /** Puo' mancare: una lista salvata da una versione precedente non ce l'ha. */
    tags?: readonly string[]
}

/** Le licenze che permettono di usare il modello senza chiedere niente a nessuno. */
const LIBERE = /license:(apache-2\.0|mit|bsd|cc-by-4\.0|cc0|openrail|llama\d)/i

/**
 * Se questo modello passa quel filtro.
 *
 * Ogni filtro sa dire di no solo quando ha di che deciderlo: un modello che non
 * dichiara la licenza NON viene escluso da «licenza libera» — verrebbe
 * nascosto per un dato mancante, non per una sua caratteristica, e chi guarda
 * non avrebbe modo di capire perche' e' sparito.
 */
export function talosModelPassesFilter(
    model: TalosBrowsableModel,
    filter: TalosBrowseFilterId,
    availableBytes: number,
): boolean {
    switch (filter) {
        case 'fits': {
            const stima = talosEstimateSizeFromName(model.id)
            // Senza stima non si esclude: «non lo so» non e' «non ci sta».
            if (!stima || availableBytes <= 0) return true
            return talosEstimatedBand(stima.workingBytes, availableBytes) !== 'wont-run'
        }
        case 'chat':
            return model.task === 'text-generation' || /instruct|chat/i.test(model.id)
        case 'code':
            return /coder|code|starcoder|deepseek-coder/i.test(model.id)
        case 'q4':
            // La quantizzazione piu' usata su un telefono: il compromesso fra
            // qualita' e memoria che quasi sempre e' quello giusto.
            return /[-_.]I?Q4(?:[-_.]|$)|[-_.]Q4_[KM01]/i.test(model.id)
        case 'open-licence': {
            const tags = model.tags ?? []
            return tags.some((tag) => LIBERE.test(tag))
                || !tags.some((tag) => tag.startsWith('license:'))
        }
    }
}

/**
 * La lista filtrata.
 *
 * I filtri si SOMMANO: chi accende «codice» e «ci sta» vuole i modelli di
 * codice che entrano, non l'unione dei due insiemi. E' la lettura che chiunque
 * da' a due interruttori accesi insieme.
 */
export function talosApplyBrowseFilters<T extends TalosBrowsableModel>(
    models: readonly T[],
    active: readonly TalosBrowseFilterId[],
    availableBytes: number,
): T[] {
    if (active.length === 0) return [...models]
    return models.filter((model) =>
        active.every((filter) => talosModelPassesFilter(model, filter, availableBytes)))
}
