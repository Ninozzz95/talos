/**
 * Un'immagine può uscire da questo telefono? La regola, in un posto solo.
 *
 * ## Il buco che l'ha fatta nascere — 12/09/2026
 *
 * Il consenso sulle immagini esisteva da agosto, e stava su **una strada
 * sola**: la scelta di un file nuovo dalla galleria
 * (`useTalosMobileAttachments.pick`). Ma nella chat un'immagine entra anche da
 * un'altra porta — `attachExisting`, cioè un file **già nel Vault**, archiviato
 * ieri e ripescato dalla Libreria. Quella porta non chiedeva niente: una foto
 * messa da parte una settimana fa partiva verso OpenRouter senza che comparisse
 * nessun cartellino.
 *
 * ⛔ Il difetto NON era «manca una chiamata in `attachExisting`». Era che la
 * guardia stava sul gesto sbagliato: **allegare non fa uscire niente dal
 * telefono, inviare sì**. Finché la guardia sta sull'allegare, ogni porta nuova
 * verso il vassoio è un buco nuovo — e domani ce ne sarà un'altra.
 *
 * ⇒ La guardia si sposta dove avviene la cosa di cui si chiede il permesso, che
 * è anche la raccomandazione della piattaforma: chiedere il consenso **nel
 * momento in cui la funzione che ne ha bisogno viene usata** — Android, *App
 * permissions best practices*, letto 12/09/2026:
 * https://developer.android.com/training/permissions/usage-notes
 *
 * ## Perché è una funzione PURA e non un `if` dentro l'invio
 *
 * Perché le condizioni sono quattro e si combinano, e un `if` dentro una
 * funzione che parla con il modello si prova solo montando mezza applicazione —
 * cioè non si prova al verso contrario, che è dove stanno i buchi. Qui la
 * regola si interroga a tavolino, compreso il caso «non chiedere»: un consenso
 * si prova soprattutto **quando NON deve comparire**.
 */

/** La preferenza salvata: `shell.image_attachment_consent`. */
export type TalosImageConsentStance = 'allow' | 'ask' | 'deny'

/** Che cosa fa l'invio. Tre esiti, non due: «chiedi» non è né sì né no. */
export type TalosImageSendDecision =
    /** Parte, e nessuna domanda compare. */
    | 'send'
    /** Si mostra il cartellino; la risposta decide. */
    | 'ask'
    /** Non parte, e si dice perché. Il testo NON si manda senza le immagini. */
    | 'refuse'

export interface TalosImageSendInput {
    /** Quante immagini autorizzate ci sono nel vassoio, adesso. */
    readonly imageCount: number
    /**
     * Il provider del modello scelto **dopo** l'eventuale passaggio a un modello
     * che vede le immagini: è quello a cui la foto andrà davvero.
     */
    readonly provider: string | null
    /**
     * Per QUESTA bozza il cartellino è già comparso e ha avuto un sì.
     *
     * Serve a non chiedere due volte. Chi ha appena scelto una foto dalla
     * galleria ha risposto un secondo fa; richiederglielo premendo Invia è il
     * modo di insegnare a rispondere senza leggere — cioè di distruggere il
     * valore della domanda proprio mentre si crede di rafforzarlo.
     */
    readonly alreadyAnsweredForDraft: boolean
    readonly stance: TalosImageConsentStance
}

export function talosImageSendDecision(input: TalosImageSendInput): TalosImageSendDecision {
    // Niente immagini, niente da decidere. Un cartellino su un messaggio di
    // solo testo è rumore, e il rumore si impara a chiudere senza leggere.
    if (input.imageCount <= 0) return 'send'

    /*
     * ⛔ Il modello locale NON fa uscire niente.
     *
     * È un file su questo disco, e la domanda che il cartellino pone — «questa
     * foto può lasciare il telefono?» — non ha oggetto. Chiedere il permesso
     * per una cosa che non si sta facendo è peggio che non chiederlo: rende
     * indistinguibile la volta in cui la foto esce davvero.
     */
    if (input.provider === 'local') return 'send'

    // Già chiesto e già risposto sì, per queste stesse immagini.
    if (input.alreadyAnsweredForDraft) return 'send'

    if (input.stance === 'allow') return 'send'
    if (input.stance === 'deny') return 'refuse'
    return 'ask'
}
