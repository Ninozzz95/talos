/*
 * ⭐ Riga del bugfixer (10/10/2026, dalla review C06 della sessione desktop) — DUE MESSAGGI «user» DI FILA NON ARRIVANO AL FORNITORE.
 *   L'avviso di sistema (comando in sottofondo fermato dalla persona, C06 a) viaggia come un `user` subito prima del messaggio della
 *   persona: nella storia restano DUE voci, ognuna con la sua origine. Ma i template jinja di alcuni modelli locali (`llama-server
 *   --jinja` usa quello del GGUF: Mistral, Gemma) alzano «Conversation roles must alternate», e il giro locale fallirebbe.
 *   Come Hermes, che ripara la sequenza PRIMA di ogni chiamata (`agent/agent_runtime_helpers.py:764-780`, «Providers require strict
 *   alternation… violations: silent empty responses or 400s») unendo gli `user` consecutivi (`:1228-1244`): testo con testo
 *   separati da una riga vuota, liste concatenate, un testo accanto a una lista diventa un blocco di testo. Solo il CORPO della
 *   richiesta: la storia non cambia. Un `user` dopo un `assistant` resta com'è.
 * ⛔ SOLO verso un motore che gira su questo computer (`runtime-owner-adapter.mjs`, `FONTI_DI_MOTORE_LOCALE`), non nel corpo del
 *   kernel. Messa nel kernel valeva per OGNI fornitore e cambiava la forma del corpo cloud: nove prove della compattazione
 *   cercavano il riassunto o il marcatore del mezzo omesso come messaggio a sé, e lo trovavano fuso con la consegna; e un `user`
 *   in coda che il giro dopo si fonde col successivo cambia un messaggio già spedito, cioè il prefisso che la cache del
 *   fornitore aveva salvato. I fornitori cloud (via OpenRouter, o nativi) accettano due `user` di fila: il difetto è dei
 *   template locali, e la cura sta dove la richiesta li incontra.
 * ⛔ Resta un costo, dichiarato (review del desktop su 84abe0073): anche verso il motore locale un `user` in coda che il giro dopo
 *   si fonde col successivo cambia un messaggio già spedito, e la cache KV di llama-server ricalcola da lì. È locale e costa poco;
 *   un giro che fallisce per i ruoli costa tutto.
 * ⛔ Il messaggio unito tiene i campi in più del PRIMO (per esempio `talosOrigin`) e lascia cadere quelli del secondo: oggi un
 *   `user` nel corpo porta solo `role` e `content`, quindi non si perde niente; un campo nuovo sui messaggi `user` va pensato qui.
 */
export function conUtentiUniti(messaggi) {
    if (!Array.isArray(messaggi)) return messaggi
    const comeBlocchi = (c) => (Array.isArray(c) ? c : typeof c === 'string' && c !== '' ? [{ type: 'text', text: c }] : [])
    const uniti = []
    for (const m of messaggi) {
        const prima = uniti.at(-1)
        if (prima?.role === 'user' && m?.role === 'user') {
            const contenuto = typeof prima.content === 'string' && typeof m.content === 'string'
                ? [prima.content, m.content].filter((t) => t !== '').join('\n\n')
                : [...comeBlocchi(prima.content), ...comeBlocchi(m.content)]
            uniti[uniti.length - 1] = { ...prima, content: contenuto }
            continue
        }
        uniti.push(m)
    }
    return uniti
}
