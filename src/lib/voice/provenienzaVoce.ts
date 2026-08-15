/**
 * ⭐⭐ SE HAI PARLATO, TI RISPONDE A VOCE.
 *
 * Owner 2026-08-10: «se premo il pulsante in basso a destra per parlare, la
 * risposta deve essere automaticamente in TTS. Abbiamo modo di rilevarlo in
 * modo super efficace?».
 *
 * ⛔ La risposta è che NON si rileva: si SA. Quel testo l'ha scritto il motore
 * di dettatura, non la tastiera — è una provenienza, non un indizio. Nessuna
 * euristica sul contenuto, nessuna soglia da tarare, nessun falso positivo
 * possibile per costruzione.
 *
 * ## Perché non basta un booleano
 *
 * Le tre cose che una persona fa davvero, e che un flag secco sbaglierebbe:
 *
 *   1. detta, poi corregge due parole a mano → è ancora un turno nato di voce,
 *      e chi ha parlato si aspetta di sentire;
 *   2. detta, cancella TUTTO e riscrive a mano → ha cambiato idea sul mezzo,
 *      e una voce che parte lo stesso è un rumore che non ha chiesto;
 *   3. detta, poi annulla → non ha mandato niente, e il turno dopo non deve
 *      ereditare niente.
 *
 * Perciò si tiene il PEZZO dettato e lo si cerca nella bozza: finché è lì,
 * quella frase viene dalla voce. Quando sparisce, sparisce anche la voce.
 *
 * ## Il confronto con i concorrenti
 *
 * Né ChatGPT né Gemini leggono la risposta se non entri in una *modalità
 * voce* dedicata: si sceglie una volta, e vale per tutto. Qui non c'è nessuna
 * modalità da entrare e da ricordarsi di uscire — la decisione è per turno, e
 * la prende il modo in cui hai scritto quel turno.
 */
export interface TalosProvenienzaVoce {
    /** La dettatura ha prodotto testo: `prima` è la bozza com'era, `dopo` com'è. */
    dettatura(prima: string, dopo: string): void
    /** La bozza è cambiata (a mano, o svuotata dall'invio). */
    aggiornaBozza(testo: string): void
    /** Questo turno nasce dalla voce? */
    nataDiVoce(): boolean
    /** Turno chiuso: il prossimo riparte pulito. */
    azzera(): void
}

export function talosProvenienzaVoce(): TalosProvenienzaVoce {
    /** Il pezzo che ha scritto la dettatura, non tutta la bozza. */
    let pezzo = ''

    return {
        dettatura(prima, dopo) {
            // La dettatura compone SOPRA la bozza catturata all'inizio: il
            // pezzo nuovo è la coda. Se la coda è vuota (ha detto qualcosa che
            // il motore ha scartato) non c'è niente da ricordare.
            const coda = dopo.startsWith(prima) ? dopo.slice(prima.length) : dopo
            const pulito = coda.trim()
            if (pulito) pezzo = pulito
        },
        aggiornaBozza(testo) {
            if (!pezzo) return
            // ⛔ Il campo svuotato uccide la provenienza anche se il pezzo era
            // vuoto di suo: è il gesto con cui una persona dice «lascia
            // perdere, riscrivo».
            if (!testo.trim() || !testo.includes(pezzo)) pezzo = ''
        },
        nataDiVoce() {
            return pezzo.length > 0
        },
        azzera() {
            pezzo = ''
        },
    }
}
