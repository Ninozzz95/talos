/**
 * ⭐ IL CORPO DI UN ARTEFATTO COME BLOCCO ```html NELLA RISPOSTA (owner 2026-10-23, solo per i modelli LOCALI).
 *
 * Un modello da 4B che deve infilare un sito intero dentro una stringa JSON sbaglia gli escape o si ferma al tetto a metà
 * (Spark-X2.5-4B sul Pad, D-LOC-1). Scritto come blocco di codice nella risposta, l'HTML è testo come un altro. Jan fa lo
 * stesso coi blocchi `html`/`svg` delle risposte (`web-app/src/lib/utils.ts:86-121`). La forma l'ha vista il Desktop prima
 * che fosse scritta, e in r4 resterà identica.
 *
 * Puro: niente stato, niente DOM. Il ciclo (`agentLoop.ts`) decide cosa farne.
 */

const APERTURA = /(^|\n)[ \t]*```[ \t]*html\b[^\n]*\n/i
const CHIUSURA = /(^|\n)[ \t]*```[ \t]*(?=\n|$)/

export type TalosBloccoHtml =
    | { html: string, senzaBlocco: string }
    | { aperto: true, prima: string, corpo: string }

/**
 * Il PRIMO blocco ```html della risposta. Chiuso: il suo corpo e il testo senza di lui. Aperto: `aperto` col testo prima
 * e il corpo fin lì — chi chiama decide, perché solo lui sa se la risposta si è fermata al tetto (allora è a metà, e
 * non si usa) o è finita senza la recinzione di chiusura (allora il corpo è intero). Assente: `null`.
 */
export function talosBloccoHtml(testo: string): TalosBloccoHtml | null {
    const apertura = APERTURA.exec(testo)
    if (!apertura) return null
    const inizioBlocco = apertura.index + apertura[1]!.length
    const inizioCorpo = apertura.index + apertura[0].length
    const resto = testo.slice(inizioCorpo)
    const chiusura = CHIUSURA.exec(resto)
    const prima = testo.slice(0, inizioBlocco).trimEnd()
    if (!chiusura) return { aperto: true, prima, corpo: resto }
    const html = resto.slice(0, chiusura.index)
    const dopo = resto.slice(chiusura.index + chiusura[0].length).trimStart()
    return { html, senzaBlocco: prima && dopo ? `${prima}\n\n${dopo}` : prima || dopo }
}

/**
 * Il seguito di una risposta tagliata dentro il blocco: si attacca a ciò che c'era, e se il modello riapre la recinzione
 * (succede: ricomincia «da capo» il blocco) l'apertura ripetuta si toglie (richiesta del Desktop, 23/10).
 */
export function talosUnisciSeguito(primo: string, seguito: string): string {
    return primo + seguito.replace(/^[ \t]*```[ \t]*html\b[^\n]*\n/i, '')
}
