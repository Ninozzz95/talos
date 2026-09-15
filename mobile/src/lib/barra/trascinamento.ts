/**
 * ⭐ IL GESTO DELLA MANIGLIA — trascina in su e la conversazione entra in TALOS.
 *
 * ## Da dove viene: censito su Gemini l'11 agosto
 *
 * La sua carta della risposta ha in cima un nodo che l'albero di accessibilità
 * chiama `Punto di trascinamento`, e — misurato — è `clickable=false`: da loro
 * quella maniglia si trascina soltanto. Trascinata verso l'alto apre l'app
 * intera con la conversazione già dentro, titolo generato compreso.
 *
 * ⭐ Da noi il tocco fa la stessa cosa, ed è un sorpasso onesto: un elemento che
 * si può SOLO trascinare non esiste per chi naviga da tastiera o con lo screen
 * reader. Il gesto è un'aggiunta, non l'unica porta.
 *
 * ## Perché la matematica sta qui e non nel componente
 *
 * Perché così si può PROVARE nei due versi senza un dito: sopra la soglia apre,
 * sotto no, e un trascinamento verso il basso non apre mai. Dentro un gestore
 * di eventi la stessa regola sarebbe verificabile solo sul telefono.
 */

/**
 * Quanto bisogna tirare su prima che il gesto conti, in pixel logici.
 *
 * 64 px è circa mezzo pollice sul Pad: abbastanza da non far partire l'app
 * mentre scorri la risposta, poco da non richiedere una tirata.
 */
export const TALOS_SOGLIA_APERTURA = 64

/**
 * Di quanto la carta segue il dito.
 *
 * ⛔ Oltre la soglia il movimento si SMORZA invece di continuare uno a uno.
 * Non è decorazione: è il modo in cui una superficie dice «ho capito, puoi
 * lasciare» senza scriverlo. Senza smorzamento la carta continuerebbe a salire
 * fino a uscire dallo schermo, e il gesto non avrebbe nessun punto d'arrivo
 * visibile.
 *
 * `deltaY` è positivo verso l'ALTO (quanto il dito è salito rispetto a dove ha
 * premuto), perché è la direzione del gesto: chi legge questa funzione pensa
 * «ho tirato su di 80», non «la Y è diminuita di 80».
 */
export function talosOffsetDelTrascinamento(deltaY: number): number {
    // Verso il basso la carta non si muove: quel gesto non esiste ancora, e una
    // carta che scende senza fare niente è una promessa non mantenuta.
    if (deltaY <= 0) return 0
    if (deltaY <= TALOS_SOGLIA_APERTURA) return deltaY
    return TALOS_SOGLIA_APERTURA + (deltaY - TALOS_SOGLIA_APERTURA) * 0.35
}

/** Il gesto è arrivato: si apre TALOS intero. */
export function talosTrascinamentoApre(deltaY: number): boolean {
    return deltaY >= TALOS_SOGLIA_APERTURA
}
