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
import { talosEstimateSizeFromName } from './sizeFromName'
import { talosEstimatedCapacity, type TalosDeviceCapacity } from './fit'
import { TALOS_MOBILE_QUANTISATION_ORDER } from './browseVariant'
import { talosHasDeclaredPermissiveLicence } from './licensePolicy'

/** Le tre misure che decidono se un modello ci sta: due di memoria, una di disco. */
export type TalosFilterDevice = Pick<TalosDeviceCapacity,
    'availableRamBytes' | 'lowMemoryThresholdBytes' | 'freeStorageBytes'>

export type TalosBrowseFilterId = 'fits' | 'chat' | 'code' | 'q4' | 'open-licence'

export const TALOS_BROWSE_FILTERS: readonly TalosBrowseFilterId[] =
    Object.freeze(['fits', 'chat', 'code', 'q4', 'open-licence'])

export interface TalosBrowsableModel {
    id: string
    task?: string | null
    /** Puo' mancare: una lista salvata da una versione precedente non ce l'ha. */
    tags?: readonly string[]
    hasChatTemplate?: boolean
    /** Model-card licence metadata; it takes precedence over duplicated tags. */
    licence?: string | null
    /**
     * Presente sulle righe normalizzate dal client corrente. `null` e'
     * informazione: il client ha cercato una Q4 reale e non l'ha trovata.
     * L'assenza del campo, invece, identifica soltanto una cache legacy.
     */
    browseVariant?: {
        fileBytes: number
        workingBytes: number
        estimated?: boolean
        quantisation?: string
    } | null
}

export interface TalosBrowseCapacitySize {
    fileBytes: number
    workingBytes: number
    estimated: boolean
}

const CODE_TAGS = new Set(['code', 'coder', 'code-generation', 'text-to-code'])
const CODE_ID_TOKEN = /(?:^|[/_.-])(?:code|coder|starcoder|codestral|devstral|codellama|deepseek-coder|granite-code)(?=$|[/_.-])/iu

export function talosModelIsChatCapable(model: TalosBrowsableModel): boolean {
    return model.hasChatTemplate === true
        || (model.tags ?? []).some((tag) => tag.trim().toLowerCase() === 'conversational')
}

/** Hugging Face has no canonical Code facet: this conservative heuristic is TALOS-owned. */
export function talosModelIsCodeOriented(model: TalosBrowsableModel): boolean {
    if (model.task && CODE_TAGS.has(model.task.trim().toLowerCase())) return true
    if ((model.tags ?? []).some((tag) => CODE_TAGS.has(tag.trim().toLowerCase()))) return true
    return CODE_ID_TOKEN.test(model.id)
}

export function talosModelHasQ4Variant(model: TalosBrowsableModel): boolean {
    const quantisation = model.browseVariant?.quantisation?.trim().toUpperCase()
    return quantisation !== undefined
        && (TALOS_MOBILE_QUANTISATION_ORDER as readonly string[]).includes(quantisation)
}

/** The one byte source shared by the visible row and the positive fit filter. */
export function talosBrowseCapacitySize(
    model: TalosBrowsableModel,
): TalosBrowseCapacitySize | null {
    if (Object.prototype.hasOwnProperty.call(model, 'browseVariant')) {
        const variant = model.browseVariant
        if (
            variant === null
            || variant === undefined
            || !Number.isFinite(variant.fileBytes)
            || !Number.isFinite(variant.workingBytes)
            || variant.fileBytes <= 0
            || variant.workingBytes <= 0
        ) return null
        return {
            fileBytes: variant.fileBytes,
            workingBytes: variant.workingBytes,
            estimated: variant.estimated === true,
        }
    }

    // Compatibility only: cached rows written before browseVariant existed.
    return talosEstimateSizeFromName(model.id)
}

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
    device: TalosFilterDevice | null,
): boolean {
    switch (filter) {
        case 'fits': {
            const stima = talosBrowseCapacitySize(model)
            // «Gira qui» e' una promessa positiva: senza prova la riga resta
            // visibile a filtro spento, ma non entra in questo sottoinsieme.
            if (!stima) return false
            /*
             * Lo stesso verdetto dell'etichetta, non un secondo calcolo: il
             * filtro dice «mostrami solo quelli che posso avere adesso», e una
             * riga nascosta qui che l'etichetta chiamava verde — o viceversa —
             * e' il modo piu' veloce di far smettere di fidarsi di entrambe.
             *
             * E ora «non ci sta» include il telefono pieno, non solo la memoria
             * corta: un modello che non si puo' scaricare non e' un modello che
             * si puo' avere adesso.
             */
            const verdict = talosEstimatedCapacity({
                fileBytes: stima.fileBytes,
                workingBytes: stima.workingBytes,
                device,
            })
            return verdict.state === 'fits' || verdict.state === 'tight'
        }
        case 'chat':
            return talosModelIsChatCapable(model)
        case 'code':
            return talosModelIsCodeOriented(model)
        case 'q4':
            return talosModelHasQ4Variant(model)
        case 'open-licence':
            return talosHasDeclaredPermissiveLicence(model)
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
    device: TalosFilterDevice | null,
): T[] {
    if (active.length === 0) return [...models]
    return models.filter((model) =>
        active.every((filter) => talosModelPassesFilter(model, filter, device)))
}
