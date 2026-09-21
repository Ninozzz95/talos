/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchDossier.ts (94 righe, 11/09/2026).
 *
 * ⛔ `collector.mjs` (porto di `researchCollector.ts`) lo cura un'altra sessione:
 * qui ne servono solo i TIPI, che in JSDoc non producono nessun import a runtime.
 * Questo file quindi gira da solo.
 *
 * Il dossier come UNA cosa che due lettori sanno usare.
 *
 * La raccolta di un ramo deve servire una persona che sfoglia la Libreria e un
 * processo che riprende ore dopo, in un'istanza nuova, senza memoria di che
 * cosa aveva raccolto. Le due risposte ovvie sono sbagliate entrambe. Due file
 * — uno di prosa, uno di dati — sono due verità da tenere allineate, che è il
 * difetto che questo progetto ha già pagato più volte. Rileggere la prosa è
 * peggio: funziona finché qualcuno non cambia un titolo di sezione.
 *
 * Quindi è un documento solo: testo leggibile per la persona e per l'indice di
 * ricerca, col record strutturato recintato in fondo. Tutti e due scritti dallo
 * stesso oggetto nello stesso respiro, così non possono divergere, e il lettore
 * che ha bisogno dei dati non legge mai la prosa.
 *
 * Un dossier senza il recinto non si indovina. Si dichiara illeggibile — un
 * file vecchio, o uno che qualcuno ha modificato — perché una sintesi costruita
 * su una lettura speranzosa citerebbe passaggi che non sono mai stati controllati.
 */

/**
 * @import { TalosResearchCollection, TalosResearchSource } from './collector.mjs'
 */

const FENCE_OPEN = '```talos-research-json'
const FENCE_CLOSE = '```'

/**
 * Che cosa porta il recinto. Con la versione, così una forma successiva si riconosce.
 *
 * @typedef {object} TalosResearchDossierRecord
 * @property {1} version
 * @property {string} branchId
 * @property {string} query
 * @property {readonly TalosResearchSource[]} sources
 * @property {readonly { url: string, reason: string }[]} unreachable
 */

/**
 * @param {TalosResearchCollection} collection
 * @returns {string}
 */
export function talosResearchDossierDocument(collection) {
    /** @type {TalosResearchDossierRecord} */
    const record = {
        version: 1,
        branchId: collection.branchId,
        query: collection.query,
        sources: collection.sources,
        unreachable: collection.unreachable,
    }

    const prose = [
        `# ${collection.query}`,
        ...collection.sources.map((source) => [
            `## ${source.title}`,
            source.url,
            source.publishedAt ? `data dichiarata: ${source.publishedAt}` : 'data non dichiarata',
            source.obtained === 'snippet' ? '(solo estratto dal motore di ricerca)' : '',
            '',
            source.text,
        ].filter(Boolean).join('\n')),
        ...(collection.unreachable.length > 0
            ? ['## Non raggiungibili', ...collection.unreachable.map((entry) => `${entry.url} — ${entry.reason}`)]
            : []),
    ].join('\n\n')

    // Il recinto va per ULTIMO, così un lettore che si ferma prima — un'anteprima,
    // un estratto nei risultati di ricerca — vede la prosa e non un muro di JSON.
    return `${prose}\n\n${FENCE_OPEN}\n${JSON.stringify(record)}\n${FENCE_CLOSE}\n`
}

/**
 * Rilegge un dossier, o ammette di non poterlo fare.
 *
 * Torna `null` invece di un tentativo. Chi chiama sta per costruire un rapporto
 * le cui citazioni verranno controllate contro questi passaggi: un dossier
 * recuperato a metà produrrebbe affermazioni verificate contro un testo che non
 * è quello che è stato letto.
 *
 * @param {string} document
 * @returns {TalosResearchCollection | null}
 */
export function talosResearchParseDossier(document) {
    const start = document.indexOf(FENCE_OPEN)
    if (start < 0) return null
    const from = start + FENCE_OPEN.length
    const end = document.indexOf(FENCE_CLOSE, from)
    if (end < 0) return null

    try {
        /** @type {TalosResearchDossierRecord} */
        const parsed = JSON.parse(document.slice(from, end))
        if (parsed?.version !== 1 || !Array.isArray(parsed.sources)) return null
        return {
            branchId: String(parsed.branchId ?? ''),
            query: String(parsed.query ?? ''),
            sources: parsed.sources,
            unreachable: Array.isArray(parsed.unreachable) ? parsed.unreachable : [],
            // La spesa non viaggia qui: sta già nel giornale, che è l'unico
            // posto in cui si può contare. Una seconda copia prima o poi
            // verrebbe sommata alla prima.
            spend: { searches: 0, pages: 0, tokens: 0 },
        }
    } catch {
        return null
    }
}
