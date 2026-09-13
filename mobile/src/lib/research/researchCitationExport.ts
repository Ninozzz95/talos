import { talosResearchRegistrableHost } from '@/lib/research/researchIndependence'

/**
 * ⛔⛔ EXPORT-06 — le fonti in un formato che un gestore di bibliografie legge.
 *
 * Il rapporto esce già in Markdown e PDF, che sono per una persona. Chi fa un
 * lavoro serio con delle fonti però le mette in Zotero, Mendeley o EndNote, e
 * quei programmi parlano **BibTeX** e **RIS**. Senza, ogni riferimento va
 * ricopiato a mano — ed è esattamente il punto in cui una bibliografia si
 * sporca.
 *
 * ## ⛔ Cosa NON esce, e perché è una decisione di privacy
 *
 * Una citazione descrive una PAGINA, non chi l'ha letta. Da qui non escono la
 * query che l'ha trovata, il modello che l'ha giudicata, l'identificativo della
 * ricerca né la chat da cui viene. Un file di bibliografia finisce in una
 * cartella condivisa, in un allegato, in un repository: è il posto meno
 * controllato in cui un dato personale possa arrivare.
 *
 * ⇒ La forma in ingresso dichiara i quattro campi che servono e **basta**: ciò
 * che il chiamante passa in più non viene nemmeno letto.
 */

export interface TalosResearchCitation {
    readonly url: string
    readonly title: string
    /** ISO, o `null` quando la pagina non la dichiara. Non si inventa. */
    readonly publishedAt: string | null
    /** Quando l'abbiamo letta: per una pagina web è il campo che conta di più. */
    readonly accessedAt: string
}

/** L'anno, solo se la data c'è ed è leggibile. */
function anno(iso: string | null): string | null {
    if (!iso) return null
    const trovato = /^(\d{4})/.exec(iso.trim())
    return trovato ? trovato[1]! : null
}

/**
 * ⛔ Le graffe e le barre rovesce nel titolo ROMPONO il file.
 *
 * In BibTeX una graffa apre un gruppo: un titolo che ne contiene una spaiata fa
 * fallire il parsing dell'intera voce — e i gestori non lo dicono, saltano la
 * voce. Si tolgono, invece di scappare: un titolo è testo da leggere, non
 * codice, e nessun lettore ha bisogno delle graffe originali.
 */
function bibtexSicuro(testo: string): string {
    return testo
        .replace(/[{}\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

/** In RIS ogni riga è un campo: un a capo dentro un valore spezza il record. */
function risSicuro(testo: string): string {
    return testo.replace(/\s+/g, ' ').trim()
}

/**
 * La chiave della voce: dominio + anno, e un suffisso quando serve.
 *
 * ⛔ Due fonti dello stesso dominio nello stesso anno darebbero la stessa
 * chiave, e un file con due chiavi uguali non è valido: il gestore ne butta una
 * **in silenzio**. Chi esporta se ne accorge quando gli manca una citazione in
 * fondo a un lavoro finito.
 */
function chiaviDistinte(citations: readonly TalosResearchCitation[]): string[] {
    const viste = new Map<string, number>()
    return citations.map((citation) => {
        const host = talosResearchRegistrableHost(citation.url) ?? 'fonte'
        const base = `${host.replace(/[^a-z0-9]/gi, '')}${anno(citation.publishedAt) ?? ''}`
        const quante = viste.get(base) ?? 0
        viste.set(base, quante + 1)
        // La prima resta pulita: `example2026`, poi `example2026b`, `example2026c`.
        return quante === 0 ? base : `${base}${String.fromCharCode(97 + quante)}`
    })
}

export function talosResearchBibtex(citations: readonly TalosResearchCitation[]): string {
    if (citations.length === 0) return ''
    const chiavi = chiaviDistinte(citations)

    return citations.map((citation, indice) => {
        const righe = [
            `  title = {${bibtexSicuro(citation.title)}}`,
            `  url = {${citation.url.trim()}}`,
            `  urldate = {${citation.accessedAt.trim()}}`,
        ]
        const quando = anno(citation.publishedAt)
        // ⛔ Un anno inventato è peggio di un anno mancante: chi cita si fida.
        if (quando) righe.splice(1, 0, `  year = {${quando}}`)
        // `@misc` è il tipo per una risorsa online: `@article` prometterebbe una
        // rivista, e una pagina web non lo è.
        return `@misc{${chiavi[indice]},\n${righe.join(',\n')},\n}`
    }).join('\n\n')
}

export function talosResearchRis(citations: readonly TalosResearchCitation[]): string {
    if (citations.length === 0) return ''

    return citations.map((citation) => {
        const righe = [
            // ELEC = risorsa elettronica, il tipo giusto per una pagina web.
            'TY  - ELEC',
            `TI  - ${risSicuro(citation.title)}`,
            `UR  - ${citation.url.trim()}`,
        ]
        const quando = anno(citation.publishedAt)
        if (quando) righe.push(`PY  - ${quando}`)
        // Y2 è la data di consultazione, e RIS la vuole con le barre.
        righe.push(`Y2  - ${citation.accessedAt.trim().replace(/-/g, '/')}`)
        // ⛔ `ER` chiude il record e la sua riga finisce con uno spazio: è la
        // forma che i gestori si aspettano, e senza non riconoscono la fine.
        righe.push('ER  - ')
        return righe.join('\n')
    }).join('\n\n')
}
