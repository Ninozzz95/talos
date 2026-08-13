import { Capacitor } from '@capacitor/core'

/**
 * ⭐⭐ L'UNICA STRADA CHE PORTA FUORI UNA DECISIONE PRESA DAL JS.
 *
 * ⛔ MISURATO l'11 agosto sul Pad: un `console.info` dalla WebView **non arriva
 * in `logcat`** in questa app — provato scrivendo una riga di prova e trovando
 * zero occorrenze. Quindi mentre stai riproducendo un difetto su un altro
 * schermo, tutto ciò che il JS «sa» è invisibile.
 *
 * Il ponte è l'unico canale. Questo file lo isola perché prima viveva dentro
 * `talosDettaturaAnnota`, cioè dentro il servizio della dettatura: chiunque
 * altro volesse tracciare doveva importarsi tutto quel modulo — e chi non
 * voleva pagarlo si riscriveva la riga a mano. Due posti che sanno tracciare
 * sono due posti che divergono, ed è lo stesso motivo per cui il comando del
 * freno arriva dal nativo invece di essere scritto due volte.
 *
 * ⛔ Si arriva ai plugin da `Capacitor.Plugins` e non con un `import`: così
 * questo modulo non tira dentro nessun servizio, e il grafo d'avvio non cresce.
 */
type PonteConTraccia = {
    Plugins?: Record<string, { traccia?: (o: { testo: string }) => Promise<unknown> }>
}

/**
 * L'istante, nella forma che si legge in `logcat` accanto ai tempi del nativo.
 *
 * ⛔⛔ L'ORA VIAGGIA COL FATTO, perché il ponte NON conserva l'ordine.
 *
 * MISURATO il 12 agosto: in `logcat` una riga compariva **1,4 secondi prima**
 * di due righe che nel codice le vengono prima. Non era un ritardo vero —
 * Capacitor esegue tutti i plugin su un thread solo, quindi l'ora che si legge
 * in `logcat` è quella di CONSEGNA, non quella del fatto. Una traccia che
 * riordina gli eventi è peggio di nessuna traccia: fa dedurre cause a rovescio.
 */
export function talosIstante(): string {
    return new Date().toISOString().slice(11, 23)
}

/**
 * Manda una riga fuori dalla WebView, verso `logcat`.
 *
 * ⛔ Non fallisce mai e non aspetta: una sonda che rompe la funzione che sta
 * osservando smette di essere una sonda e diventa il difetto.
 */
export function talosTracciaFuori(evento: string, ora: string = talosIstante()): void {
    const ponte = (Capacitor as unknown as PonteConTraccia).Plugins
    void ponte?.TalosDictation?.traccia?.({ testo: `[${ora}] ${evento}` })?.catch?.(() => undefined)
}
