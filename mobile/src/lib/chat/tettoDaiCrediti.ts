/**
 * ⭐⭐ IL RIFIUTO DICE IL NUMERO: si legge, invece di farlo leggere alla persona.
 *
 * ## Il difetto, con la frase vera
 *
 * Owner 2026-08-10, screenshot dal telefono, `openrouter / google/gemini-3.6-flash`:
 *
 * > This request requires more credits, or fewer max_tokens. You requested up
 * > to **65536** tokens, but can only afford **65050**.
 *
 * ⛔ E noi quei 65.536 non li avevamo chiesti: **non mandiamo `max_tokens`
 * affatto** — misurato leggendo il corpo che costruiamo. È OpenRouter che, in
 * assenza del campo, RISERVA il massimo di output del modello contro il
 * credito. La documentazione della comunità lo chiama «budget reservation
 * trap» e misura fino a **320×** fra riservato e speso davvero.
 *
 * ## ⛔ Perché non si sceglie un tetto a caso
 *
 * La cura ovvia — «mettiamo 8.192 e via» — è un numero inventato: taglia le
 * risposte lunghe legittime per proteggere da un problema che riguarda solo il
 * PREVENTIVO. E il giorno che il credito è alto, quel taglio resta lì a
 * peggiorare le risposte senza servire a niente.
 *
 * ⇒ Il numero giusto lo dice **il provider stesso, nel rifiuto**. Si legge, si
 * riprova una volta sola con quello, e la persona non vede mai il 402. Nessun
 * numero scritto a mano, e il tetto si adatta al credito che c'è oggi.
 *
 * ## Il primo tentativo non costa token
 *
 * Il 402 arriva PRIMA che il modello generi: è un controllo di budget, non una
 * generazione buttata. Quindi la seconda chiamata non paga due volte — paga la
 * sola volta che produce davvero la risposta.
 */

/**
 * Il tetto che il provider dice di poterci permettere, o `null`.
 *
 * ⛔ Vuole ENTRAMBI i segni — la richiesta e la disponibilità — perché un
 * numero solo non basta a distinguere questo rifiuto da un altro messaggio che
 * contiene una cifra. Un ripiego che scatta sul messaggio sbagliato imporrebbe
 * un tetto a caso a una richiesta sana.
 */
export function talosTettoDaiCrediti(messaggio: string): number | null {
    if (!/max_tokens/i.test(messaggio)) return null
    const affare = /can only afford\s+([0-9][0-9_,.]*)/i.exec(messaggio)
    if (!affare) return null
    const numero = Number.parseInt(affare[1]!.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(numero) || numero <= 0) return null
    /*
     * ⛔ Un margine, e piccolo. Fra il rifiuto e il secondo tentativo il credito
     * può essere sceso di qualche token — una richiesta partita altrove, una
     * spesa in corso — e riprovare con la cifra ESATTA rischia un secondo 402
     * per un pelo. Il 2% toglie quel pelo senza accorciare la risposta in modo
     * percepibile: su 65.050 sono 1.301 token, cioè circa mille parole ancora
     * disponibili in più di quante ne serva a qualunque risposta di chat.
     */
    const conMargine = Math.floor(numero * 0.98)
    return Math.max(1, conMargine)
}

/** Vero se questo errore è il rifiuto per crediti, e non un guasto qualunque. */
export function talosRifiutoPerCrediti(messaggio: string): boolean {
    return talosTettoDaiCrediti(messaggio) !== null
}
