import { Capacitor } from '@capacitor/core'
import {
    talosEngineDiagnosticRows,
    type TalosEngineDiagnosticRow,
} from '@/lib/models/engineDiagnostics'

/**
 * Raccoglie i fatti sul motore locale, da dove ciascuno vive davvero.
 *
 * ## Perché è un modulo a parte, e caricato a richiesta
 *
 * Perché il Doctor è una schermata rara e il motore locale è un grafo pesante:
 * `localEngine`, `deviceCapacity`, `fit`. Importarli dal Doctor come dipendenze
 * statiche significherebbe farli entrare nel grafo d'avvio di chi non apre mai
 * il Doctor — e il tetto d'avvio è a 32.000 byte di margine, guadagnati uno per
 * uno. Qui si importano **dentro** la funzione, quindi il costo lo paga solo chi
 * apre la schermata.
 *
 * ## Perché i fatti si raccolgono qui e si formattano altrove
 *
 * Perché la formattazione ha delle decisioni dentro — quale riga è rossa, cosa
 * NON deve uscire, come si abbrevia un percorso — e quelle decisioni vanno
 * provate senza un telefono. `engineDiagnostics` è puro e ha i suoi test; questo
 * modulo è solo il raccoglitore, e non decide niente.
 */
export async function talosLocalEngineDoctorRows(): Promise<TalosEngineDiagnosticRow[]> {
    if (!Capacitor.isNativePlatform()) return []

    const [{ talosLocalEngineStatus, talosLocalEngineTimings, talosLocalInstalledModels,
        talosPrefixCacheUsage },
        { talosMeasureDevice },
        { talosMaxContextFor }] = await Promise.all([
        import('@/services/localEngine'),
        import('@/services/deviceCapacity'),
        import('@/lib/models/fit'),
    ])

    /*
     * Tutte insieme e con `allSettled`: una sonda che rifiuta deve costare la
     * sua riga, non l'intera sezione. È la stessa regola che il Doctor applica
     * già alle altre — una schermata diagnostica che muore per una misura è la
     * cosa meno utile che possa esistere.
     */
    const [statoEsito, tempiEsito, deviceEsito, installatiEsito, statoGrezzoEsito,
        prefissiEsito] =
        await Promise.allSettled([
            talosLocalEngineStatus(),
            talosLocalEngineTimings(),
            talosMeasureDevice(),
            talosLocalInstalledModels(),
            rawEngineState(),
            // Quanto spazio ci stiamo prendendo con i prefissi congelati. Va
            // mostrato: un baratto che conviene resta un baratto, e chi lo
            // paga deve poterlo vedere.
            talosPrefixCacheUsage(),
        ])

    const stato = statoEsito.status === 'fulfilled' ? statoEsito.value : null
    const tempi = tempiEsito.status === 'fulfilled' ? tempiEsito.value : null
    const device = deviceEsito.status === 'fulfilled' ? deviceEsito.value : null
    const installati = installatiEsito.status === 'fulfilled'
        ? installatiEsito.value.models
        : []
    const grezzo = statoGrezzoEsito.status === 'fulfilled' ? statoGrezzoEsito.value : null
    const prefissi = prefissiEsito.status === 'fulfilled' ? prefissiEsito.value : null

    /**
     * ⛔ I pesi vanno RIMESSI nella memoria disponibile prima di chiedere il
     * tetto.
     *
     * `talosMaxContextFor` risponde alla domanda che si fa PRIMA di scaricare —
     * «se caricassi questo modello, quanto contesto mi resterebbe?» — e quindi
     * sottrae il peso. Qui il modello è **già** in memoria, e
     * `availableRamBytes` lo ha già scontato: passarla così toglierebbe i pesi
     * due volte.
     *
     * MISURATO sul Pad il 2026-08-06, ed è il motivo per cui questo commento
     * esiste: il Doctor mostrava un tetto di **512 token** per un modello da 1,8
     * GB su un dispositivo con gigabyte liberi. Un numero sbagliato in una
     * schermata diagnostica è peggio di nessun numero, perché ci si fida.
     *
     * È la stessa correzione che fa l'adattatore della chat. Una sola
     * aritmetica, non una «versione per la chat» e una «per il Doctor» che poi
     * si contraddicono.
     */
    const ceiling = stato?.shape && device
        ? talosMaxContextFor(stato.shape, {
            ...device,
            availableRamBytes: device.availableRamBytes + stato.shape.weightBytes,
        })
        : null

    return talosEngineDiagnosticRows({
        available: stato?.available ?? false,
        backends: stato?.backends ?? '',
        loadedPath: stato?.loadedPath ?? null,
        shape: stato?.shape ?? null,
        kvCacheType: grezzo?.kvCacheType ?? null,
        opensSinceStart: grezzo?.opensSinceStart ?? null,
        contextRebuilds: grezzo?.contextRebuilds ?? null,
        threads: grezzo?.threads ?? null,
        threadsBatch: grezzo?.threadsBatch ?? null,
        microBatch: grezzo?.microBatch ?? null,
        contextTokens: grezzo?.contextTokens ?? null,
        lastOpenMs: grezzo?.lastOpenMs ?? null,
        lastOpenReusedWeights: grezzo?.lastOpenReusedWeights ?? null,
        prefixCacheCount: prefissi?.count ?? null,
        prefixCacheBytes: prefissi?.bytes ?? null,
        contextCeiling: ceiling,
        timings: tempi,
        cpuCores: device?.cpuCores ?? null,
        cpuCapacities: device?.cpuCapacities ?? [],
        installedTotal: installati.length,
        installedConversational: installati.filter((file) => file.conversational !== false).length,
    })
}

/**
 * I campi che il ponte dichiara ma che il tipo pubblico non espone.
 *
 * ⛔ Letti così e non aggiunti a `TalosLocalEngineStatus`: quel tipo lo consuma
 * la chat, e allargarlo per una schermata diagnostica significherebbe far
 * dipendere il percorso caldo da fatti che gli servono solo per essere mostrati.
 * Qui la lettura è opportunistica e degrada a `null` — che è esattamente ciò che
 * succede contro un lato nativo più vecchio, un caso reale con le installazioni
 * affiancate.
 */
async function rawEngineState(): Promise<{
    kvCacheType: string | null
    engineBuild: string | null
    opensSinceStart: number | null
    contextRebuilds: number | null
    threads: number | null
    threadsBatch: number | null
    microBatch: number | null
    contextTokens: number | null
    lastOpenMs: number | null
    lastOpenReusedWeights: boolean | null
} | null> {
    try {
        const { registerPlugin } = await import('@capacitor/core')
        const plugin = registerPlugin<{ available(): Promise<Record<string, unknown>> }>('TalosLlama')
        const raw = await plugin.available()
        const numero = (value: unknown): number | null =>
            typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
        return {
            kvCacheType: typeof raw.kvCacheType === 'string' ? raw.kvCacheType : null,
            engineBuild: typeof raw.engineBuild === 'string' && raw.engineBuild !== ''
                ? raw.engineBuild
                : null,
            opensSinceStart: typeof raw.opensSinceStart === 'number' ? raw.opensSinceStart : null,
            contextRebuilds: typeof raw.contextRebuilds === 'number' ? raw.contextRebuilds : null,
            // ⛔ Zero è un valore VERO qui — un contesto rifatto può costare
            // meno di un millisecondo — quindi non passa da `numero()`, che
            // scarta lo zero perché per un conteggio di thread è un guasto.
            lastOpenMs: typeof raw.lastOpenMs === 'number' && Number.isFinite(raw.lastOpenMs)
                && raw.lastOpenMs >= 0
                ? raw.lastOpenMs
                : null,
            lastOpenReusedWeights: typeof raw.lastOpenReusedWeights === 'boolean'
                ? raw.lastOpenReusedWeights
                : null,
            threads: numero(raw.threads),
            threadsBatch: numero(raw.threadsBatch),
            microBatch: numero(raw.microBatch),
            contextTokens: numero(raw.contextTokens),
        }
    } catch {
        return null
    }
}
