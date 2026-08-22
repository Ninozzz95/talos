/**
 * Come si chiama un modello, quando nessuno gli ha dato un nome.
 *
 * ## Il difetto
 *
 * Owner 2026-08-06: «usando un modello locale spunta tutto il percorso del
 * modello e non solo il nome, stampando una riga enorme sotto la risposta».
 *
 * Sotto ogni risposta c'è una riga che dice chi ha risposto. Per i provider di
 * rete è un nome corto — `deepseek-v4-flash` — perché il profilo porta il suo
 * `display_name`. Per un modello locale l'identificativo **è il percorso del
 * file**, e quando il profilo non si trova la riga ripiega sull'identificativo:
 * quaranta caratteri di cartelle sotto una risposta di tre parole.
 *
 * ## Perché non basta «sistemare i profili»
 *
 * Perché il ripiego esiste proprio per i casi in cui il profilo NON c'è: un
 * modello cancellato dopo aver risposto, una chat riaperta prima che il
 * catalogo sia caricato, un file rinominato fuori dall'app. In tutti quei casi
 * la riga si vedrà comunque — e deve restare leggibile, perché è lì che serve
 * di più: sta dicendo con cosa è stata scritta una risposta che qualcuno sta
 * rileggendo mesi dopo.
 */

/** Estensioni che non dicono niente a chi legge. */
const ESTENSIONI = ['.gguf', '.bin', '.safetensors']

/**
 * Il nome corto di un modello, ricavato dal suo identificativo.
 *
 * Non inventa: **accorcia**. Un identificativo di rete (`openai/gpt-4o`) resta
 * riconoscibile, un percorso di file diventa il nome del file.
 */
export function talosShortModelLabel(id: string): string {
    const pulito = id.trim()
    if (pulito === '') return ''

    /*
     * Un percorso si riconosce dal fatto che comincia da una radice o contiene
     * un separatore di Windows. Non da «contiene una barra»: `openai/gpt-4o` ne
     * ha una ed è già il nome giusto, e accorciarlo a `gpt-4o` toglierebbe
     * l'unica cosa che distingue due modelli omonimi di provider diversi.
     */
    const sembraPercorso = pulito.startsWith('/')
        || pulito.startsWith('file:')
        || pulito.includes('\\')
        || ESTENSIONI.some((estensione) => pulito.toLowerCase().endsWith(estensione))
    if (!sembraPercorso) return pulito

    const ultimo = pulito.split(/[\\/]/).filter(Boolean).at(-1) ?? pulito
    const minuscolo = ultimo.toLowerCase()
    const estensione = ESTENSIONI.find((suffisso) => minuscolo.endsWith(suffisso))
    const senzaEstensione = estensione ? ultimo.slice(0, -estensione.length) : ultimo
    // Se togliendo tutto non resta niente, meglio l'identificativo intero di una
    // riga vuota: illeggibile è meglio di assente, quando si sta attribuendo
    // una risposta.
    return senzaEstensione.trim() === '' ? pulito : senzaEstensione
}
