/*
 * ⭐⭐ P4-quinquies — l'azione DICHIARATA ma non eseguita (owner 02/10/2026).
 *
 * Il caso del Pad: Spark-X2.5-4B, «salvami una nota: comprare il pane domani» ⇒ «Salvato la nota ✅» senza nessuna
 * chiamata d'attrezzo. La regola nel prompt c'è già (`tone.ts`: «Never state an outcome before the tool that produces
 * it has returned», come Hermes `agent/prompt_builder.py:430-470`) e un modello piccolo la ignora: serve un controllo
 * FUORI dal modello (arXiv 2608.02645, 2609.14758).
 *
 * Owner: «Frasi di esito, deterministico». Una frase conta come esito quando ha un participio d'esito vicino a un
 * oggetto d'azione (nota, promemoria, evento…), e NON quando è una domanda, un'offerta, un futuro o un negato. Il codice
 * dentro i blocchi non conta. Il ciclo lo chiede SOLO quando nel turno non è partito nessuno strumento: qui si guarda
 * il testo e basta.
 */

/** Il messaggio al modello per il secondo giro (inglese, come il resto del prompt di sistema). */
export const TALOS_SOLLECITO_AZIONE_DICHIARATA =
    'You said the action is done, but no tool was called in this turn, so nothing happened. '
    + 'Call the tool now to actually do it, or say plainly that it was not done.'

/*
 * ⛔⛔ «Nessuno strumento è partito» vuol dire nessuno strumento che FA qualcosa. Trovato sul Pad (02/10/2026, Spark): il
 * modello ha chiamato `tool_search` tre volte per cercare lo strumento delle note, non ha mai chiamato quello vero e ha
 * scritto «La nota è stata salvata». `tool_search` e `tool_details` consegnano solo la FORMA di altri strumenti (vedi
 * `chatController.ts`, «non è una capacità: è l'impianto del catalogo»): cercare non è fare.
 */
const ATTREZZI_DI_SOLA_SCOPERTA: ReadonlySet<string> = new Set(['tool_search', 'tool_details'])

/** Nel turno è partito almeno uno strumento che agisce davvero (non una semplice ricerca di strumenti)? */
export function talosHaAgito(eseguiti: ReadonlyArray<{ call: { name: string } }>): boolean {
    return eseguiti.some((voce) => !ATTREZZI_DI_SOLA_SCOPERTA.has(voce.call.name))
}

const LETTERA = '\\p{L}'
const PARTICIPI = [
    // italiano: radice + desinenza del participio (o/a/i/e)
    'salvat[oaie]', 'creat[oaie]', 'aggiunt[oaie]', 'annotat[oaie]', 'registrat[oaie]', 'impostat[oaie]',
    'programmat[oaie]', 'inviat[oaie]', 'mandat[oaie]', 'eliminat[oaie]', 'cancellat[oaie]', 'aggiornat[oaie]',
    'spostat[oaie]', 'fissat[oaie]', 'segnat[oaie]', 'inserit[oaie]', 'memorizzat[oaie]', 'mess[oaie] in agenda',
    // inglese
    'saved', 'created', 'added', 'noted', 'set', 'scheduled', 'sent', 'deleted', 'removed', 'updated', 'moved',
    'marked', 'stored', 'booked',
]
const OGGETTI = [
    'nota', 'note', 'promemoria', 'attività', 'evento', 'eventi', 'appuntament[oi]', 'agenda', 'calendario', 'memoria',
    'file', 'documento', 'documenti', 'messaggio', 'messaggi', 'sms', 'e-?mail', 'mail', 'sveglia', 'sveglie', 'timer',
    'contatto', 'contatti',
    // Parole che Spark ha davvero usato per dire «nota» sul Pad (02/10/2026: «Ho salvato per te la scrittura…»): il
    // rilevatore conosce solo le parole dell'elenco. ⛔ NON «libreria» né «archivio»: «ho aggiunto la libreria csv-parse»
    // è una risposta di programmazione, e un avviso «niente è stato fatto» su quella sarebbe falso.
    'scrittura', 'scritture', 'appunt[oi]', 'ricord[oi]',
    'notes?', 'reminders?', 'tasks?', 'events?', 'appointments?', 'calendar', 'memory', 'files?', 'documents?',
    'messages?', 'emails?', 'alarms?', 'timers?', 'contacts?',
]
const parola = (alternative: readonly string[]) =>
    new RegExp(`(?<!${LETTERA})(?:${alternative.join('|')})(?!${LETTERA})`, 'iu')
const PARTICIPIO = parola(PARTICIPI)
const OGGETTO = parola(OGGETTI)

/** Domande, offerte, futuri e condizionali: chi le scrive non dice che è fatto. */
const NON_ANCORA = new RegExp([
    '\\?',
    `(?<!${LETTERA})(?:vuoi che|se vuoi|posso|potrei|dovrei|preferisci)(?!${LETTERA})`,
    `(?<!${LETTERA})\\p{L}+(?:erò|irò|arò)(?!${LETTERA})`,
    `(?<!${LETTERA})(?:should i|shall i|i can|i could|i will|i'll|i would|would you like|do you want|want me to)(?!${LETTERA})`,
].join('|'), 'iu')

/** I negati: «non ho salvato», «non è stata salvata», «not saved», «haven't added». */
const NEGATO = new RegExp([
    `(?<!${LETTERA})non (?:ho|abbiamo|è|sono|l'ho|li ho|le ho)(?!${LETTERA})`,
    `(?<!${LETTERA})(?:not|never|haven't|hasn't|wasn't|weren't|didn't|couldn't)(?!${LETTERA})`,
].join('|'), 'iu')

function senzaCodice(testo: string): string {
    return testo.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
}

function frasiDi(testo: string): string[] {
    // La frase finisce a un punto, un esclamativo, una domanda o un a capo; il «?» resta attaccato alla sua frase.
    return senzaCodice(testo).split(/(?<=[.!?])\s+|\n+/u).map((frase) => frase.trim()).filter(Boolean)
}

export interface TalosAzioneDichiarata {
    readonly dichiarata: boolean
    /** La frase che ha fatto scattare il rilevatore, o `null`. */
    readonly frase: string | null
}

/*
 * ⛔ «Nota:» in testa alla frase è un'ETICHETTA, non l'oggetto di un'azione. Trovato sulla prima prova dei falsi positivi
 * (risposta vera del Pad sul viaggio a Lisbona): «Nota: Con pioggia, la gita a Sintra è eliminata…» — participio e
 * «nota» nella stessa frase, nessuna nota toccata. Resta nella prova AZD-07.
 */
const ETICHETTA = /^(?:nota|note|n\.\s?b\.|attenzione|importante)\s*:\s*/iu

export function talosAzioneDichiarata(testo: string): TalosAzioneDichiarata {
    for (const intera of frasiDi(testo)) {
        const frase = intera.replace(ETICHETTA, '')
        if (!PARTICIPIO.test(frase) || !OGGETTO.test(frase)) continue
        if (NON_ANCORA.test(frase) || NEGATO.test(frase)) continue
        return { dichiarata: true, frase: intera }
    }
    return { dichiarata: false, frase: null }
}
