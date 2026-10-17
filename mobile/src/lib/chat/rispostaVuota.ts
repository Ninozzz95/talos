import { chiaveDiChiamata } from '@/lib/tools/chiaveDiChiamata'

/**
 * ⛔ La bolla vuota dopo che gli strumenti sono partiti.
 *
 * ## Cosa è stato misurato
 *
 * Pad dell'owner, 2026-08-09, motore locale Qwen3-1.7B, «elenca le notifiche».
 * La scheda di consenso compare, il tool parte, la richiesta risulta gestita —
 * e il messaggio finale arriva con **zero caratteri**: nessun testo, nessun
 * ragionamento, nessuna attività a schermo. Con Claude Sonnet 5 la stessa
 * richiesta produce l'elenco.
 *
 * ## Perché è un difetto e non un dettaglio
 *
 * È «fatto senza fare niente» girato al contrario: là l'azione mancava e la
 * frase c'era, qui l'azione c'è e manca la frase. In tutti e due i casi chi
 * legge la chat non può più dedurre che cosa sia successo — e una chat che non
 * è una prova è il modo più rapido di far smettere di controllare.
 *
 * ## ⛔ Perché NON si riassume il risultato
 *
 * Perché i risultati sono uscite di strumenti, e riscriverle qui vorrebbe dire
 * mettere in bocca al modello cose che non ha detto. Si afferma **solo** ciò
 * che sappiamo per certo — quanti strumenti sono partiti, e che la risposta
 * manca — e si offre la via d'uscita.
 *
 * Vale per ogni provider, non solo per il locale: un modello con chiave che
 * tornasse vuoto lascerebbe lo stesso buco.
 */
export function talosRispostaVuotaDopoStrumenti(
    testo: string,
    strumentiEseguiti: number,
): boolean {
    // ⛔ `trim`, non `length`: una risposta di soli a capo è vuota per chi la
    // guarda, ed è esattamente ciò che un modello piccolo produce quando si
    // ferma dopo il blocco della chiamata.
    return testo.trim() === '' && strumentiEseguiti > 0
}

/**
 * ⛔ QUANTI strumenti dire — e perché non è la lunghezza dell'elenco.
 *
 * MISURATO sul Pad il 2026-08-09: alla prima versione di questo avviso il
 * numero era **5**, e non erano cinque esecuzioni. Il modello locale aveva
 * chiesto `notification_list` cinque volte; la rete anti-ripetizione del ciclo
 * l'ha eseguita **una** e alle altre quattro ha risposto «già fatto, non l'ho
 * rifatto» — ma tutte e cinque restano in `executed`, perché quell'elenco
 * serve a rendere i risultati al modello, non a contare le azioni.
 *
 * Un avviso che nasce per non far credere cose false non può cominciare con un
 * numero gonfiato. Si contano i **nomi distinti**: è la stessa unità che una
 * persona intende quando legge «strumenti», ed è vera comunque il modello si
 * comporti. ⛔ Corretto l'11/10/2026: «nomi distinti» era troppo poco (cinque
 * ricerche diverse diventavano «1»); l'unità giusta è la chiamata distinta per
 * nome E argomenti, la stessa che decide che cosa il ciclo non riesegue.
 */
export function talosStrumentiPartiti(
    eseguiti: ReadonlyArray<{ call: { name: string, arguments?: unknown } }>,
): number {
    // ⛔ N13-STR-01 (Pad, 11/10/2026): contare i NOMI diceva «(1)» dopo cinque `web_search` vere, ognuna con la sua domanda.
    // Si conta con la chiave della rete anti-ripetizione (nome + argomenti in forma canonica): i doppioni che il ciclo non ha
    // rieseguito restano uno, le chiamate vere con argomenti diversi contano tutte.
    return new Set(eseguiti.map((riga) => chiaveDiChiamata(riga.call))).size
}
