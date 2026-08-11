/**
 * ⭐⭐ IL PASSAGGIO DI CONSEGNE dalla barra a TALOS intero.
 *
 * ## ⛔ Il difetto, e la frase falsa che lo teneva in piedi
 *
 * Owner 2026-08-11: «quando faccio "apri in TALOS" si deve aprire la chat
 * aggiornata col testo che ho inviato, o comunque tutta la conversazione».
 *
 * Il codice apriva l'app e basta, con un commento che diceva: «la chat è già la
 * stessa, per costruzione: non c'è niente da trasferire». Era falso. La barra
 * vive in un'altra Activity, quindi in un'altra **WebView**: un altro contesto
 * JavaScript, un'altra istanza del negozio della chat. In comune c'è solo il
 * database. Aprendo l'app senza dirle niente, quella restava sulla conversazione
 * che aveva lei — e la persona vedeva sparire ciò che aveva appena scritto.
 *
 * ⇒ L'id viaggia nell'indirizzo, che è l'unico canale che attraversa due
 * contesti web diversi, e qui si legge.
 */

/** L'id della conversazione da aprire, o `null` se questo non è quell'indirizzo. */
export function talosSessioneDaAprire(indirizzo: string | null | undefined): string | null {
    if (!indirizzo) return null
    try {
        const url = new URL(indirizzo)
        // ⛔ Si controlla lo SCHEMA e il percorso: un indirizzo qualunque non
        // deve poter cambiare la conversazione aperta. Fallisce chiuso.
        if (url.protocol !== 'talos:') return null
        if (url.hostname !== 'chat' && url.pathname.replace(/^\/+/, '') !== 'chat') return null
        const id = url.searchParams.get('sessione')
        return id && id.trim() ? id : null
    } catch {
        return null
    }
}

/**
 * Apre quella conversazione nell'app intera, adesso e a ogni ritorno.
 *
 * ⛔ DUE agganci, e servono tutti e due: `getLaunchUrl` per quando TALOS parte
 * da zero con l'indirizzo, `appUrlOpen` per quando era già vivo e il sistema gli
 * consegna un intent nuovo (`onNewIntent`). Con uno solo, metà delle aperture
 * finirebbe sulla conversazione sbagliata — e sarebbe la metà difficile da
 * riprodurre, cioè quella che resta rotta per settimane.
 */
export async function talosAscoltaLaConsegna(
    apri: (sessione: string) => Promise<void>,
): Promise<void> {
    try {
        const { App } = await import('@capacitor/app')
        const lancio = await App.getLaunchUrl()
        const subito = talosSessioneDaAprire(lancio?.url)
        if (subito) await apri(subito)
        await App.addListener('appUrlOpen', (evento) => {
            const dopo = talosSessioneDaAprire(evento.url)
            if (dopo) void apri(dopo)
        })
    } catch {
        // Sul web non arriva nessun intent: non c'è niente da consegnare.
    }
}
