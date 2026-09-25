/**
 * ⛔⭐⭐ LA CODA DEL GIRO — i messaggi scritti mentre il modello sta rispondendo.
 *
 * ## Il difetto che questo esiste per chiudere
 *
 * Sulla chat nativa del telefono un messaggio scritto durante un giro veniva
 * scartato in silenzio: `send()` si apriva con un `return false` quando l'app
 * era occupata (`stores/chat.ts:1678`). Sul desktop il difetto era l'opposto e
 * peggiore (owner, 11/09 «funziona malissimo», 13/09 «quasi inutilizzabile»):
 * la persona voleva ACCODARE e partiva un REINDIRIZZAMENTO.
 *
 * ## La regola, e da dove viene (ricerca del 24/09/2026)
 *
 * - Coda PER CHAT, con tetto: 10 voci e 16.000 caratteri per voce, come
 *   LibreChat PR #14220 «Mid-Run Steering and Queued Messages»; i controlli
 *   restano con la chat da cui la coda è partita (LibreChat PR #16268).
 * - Stop con voci in coda ⇒ la coda va IN PAUSA e parte solo se la invii tu
 *   (Hermes desktop docs: «pressing Stop (or Esc) while turns are queued pauses
 *   the queue…»). Accodare in una coda in pausa NON la fa ripartire.
 * - La coda non si consuma mentre un permesso d'attrezzo aspetta la persona:
 *   il messaggio successivo passerebbe davanti a una domanda ancora aperta.
 * - ⛔ Nessun Invio produce un reindirizzo (desktop, sola lettura:
 *   `legacy/invio-durante-il-giro.js`, «NESSUN ingresso di `decidiInvio`
 *   produce un reindirizzamento»). Qui l'uscita «indirizza» non ESISTE nel tipo
 *   di `decidiInvio`: il reindirizzo nasce solo da `azioneVoce`, cioè da un
 *   gesto esplicito sulla singola voce in coda (Hermes issue #111325: «Steer
 *   now» ≠ «Send now»).
 * - «Indirizza» con attrezzi entra al prossimo confine fra attrezzi (LibreChat
 *   #14220, Codex `turn/steer`, Hermes PR #12116). Senza attrezzi quel confine
 *   non c'è: è «ferma e riparti» conservando il parziale, e il pulsante deve
 *   dirlo (regola «No fake feature»).
 *
 * Funzioni PURE: nessun DOM, nessuna rete, nessuno stato globale, e nessuna
 * muta il suo ingresso. Lo store decide QUANDO chiamarle; qui si decide COSA.
 */

/** Voci al massimo in una coda (LibreChat #14220). */
export const CODA_TETTO_VOCI = 10
/** Caratteri al massimo per voce (LibreChat #14220). */
export const CODA_TETTO_CARATTERI = 16_000

export interface TalosCodaVoce {
    id: string
    /** Il testo COSÌ COM'È STATO SCRITTO: non si ripulisce, si controlla. */
    testo: string
    /** ISO 8601, passato da fuori: la prova non dipende dall'orologio. */
    creataAlle: string
}

export interface TalosCodaStato {
    voci: readonly TalosCodaVoce[]
    /** Vero solo se c'è almeno una voce: una coda vuota non ha niente da fermare. */
    inPausa: boolean
}

/** La coda vuota condivisa. Congelata: nessuno la può sporcare per tutti. */
export const CODA_VUOTA: TalosCodaStato = Object.freeze({
    voci: Object.freeze([]) as readonly TalosCodaVoce[],
    inPausa: false,
})

export type TalosCodaRifiutoTesto = 'vuoto' | 'troppo-lungo'
export type TalosCodaRifiuto = TalosCodaRifiutoTesto | 'coda-piena'

/** Un testo accettabile come voce, o il motivo per cui non lo è. */
function rifiutoDelTesto(testo: unknown): TalosCodaRifiutoTesto | null {
    if (typeof testo !== 'string' || testo.trim() === '') return 'vuoto'
    if (testo.length > CODA_TETTO_CARATTERI) return 'troppo-lungo'
    return null
}

/** Legge un campo da un valore non fidato senza lasciar uscire un'eccezione (getter ostili). */
function campo(valore: unknown, nome: string): unknown {
    if (valore === null || typeof valore !== 'object') return undefined
    try {
        return (valore as Record<string, unknown>)[nome]
    } catch {
        return undefined
    }
}

/**
 * Lo stato della coda come arriva dal DISCO, reso sicuro. Il disco è un dato
 * non fidato: una versione vecchia, un file troncato, una scrittura a metà.
 *
 * - tiene solo le voci con id stringa non vuota (e non ripetuto: un id doppio
 *   renderebbe `togli` ambiguo), testo non vuoto entro il tetto, data stringa;
 * - le voci buone restano nell'ordine in cui erano, al massimo le prime 10;
 * - `inPausa` solo se era davvero `true` E c'è almeno una voce;
 * - mai un'eccezione: nel peggiore dei casi, la coda vuota.
 *
 * ⛔ All'avvio chi carica una coda da disco la mette in pausa (non c'è nessun
 *   giro vivo da aspettare, quindi partirebbe da sola): è lo store a farlo con
 *   `metteInPausa`, perché qui non si sa se si sta avviando o ricaricando.
 */
export function normalizzaStatoCoda(valore: unknown): TalosCodaStato {
    try {
        const grezze = campo(valore, 'voci')
        if (!Array.isArray(grezze)) return { voci: [], inPausa: false }
        const visti = new Set<string>()
        const voci: TalosCodaVoce[] = []
        for (const grezza of grezze) {
            if (voci.length >= CODA_TETTO_VOCI) break
            const id = campo(grezza, 'id')
            const testo = campo(grezza, 'testo')
            const creataAlle = campo(grezza, 'creataAlle')
            if (typeof id !== 'string' || id === '' || visti.has(id)) continue
            if (rifiutoDelTesto(testo) !== null || typeof creataAlle !== 'string') continue
            visti.add(id)
            voci.push({ id, testo: testo as string, creataAlle })
        }
        return { voci, inPausa: campo(valore, 'inPausa') === true && voci.length > 0 }
    } catch {
        return { voci: [], inPausa: false }
    }
}

/**
 * Aggiunge una voce IN FONDO. Non cambia `inPausa`: accodare in una coda in
 * pausa la lascia in pausa (parte solo se la invii tu), e accodare in una coda
 * attiva non la ferma.
 *
 * @throws TypeError se `id` è vuoto o già presente: è un errore di chi chiama
 *   (l'id si genera con `crypto.randomUUID()`), non un rifiuto da mostrare.
 *   Una voce con id doppio non si potrebbe più togliere da sola.
 */
export function accoda(
    stato: TalosCodaStato,
    testo: string,
    { id, adesso }: { id: string; adesso: string },
): { stato: TalosCodaStato } | { rifiuto: TalosCodaRifiuto } {
    const rifiuto = rifiutoDelTesto(testo)
    if (rifiuto !== null) return { rifiuto }
    if (stato.voci.length >= CODA_TETTO_VOCI) return { rifiuto: 'coda-piena' }
    if (typeof id !== 'string' || id === '') throw new TypeError('accoda: id vuoto')
    if (stato.voci.some((v) => v.id === id)) throw new TypeError(`accoda: id già in coda «${id}»`)
    return {
        stato: {
            voci: [...stato.voci, { id, testo, creataAlle: adesso }],
            inPausa: stato.inPausa,
        },
    }
}

/**
 * Toglie una voce. Togliere l'ULTIMA azzera la pausa: non resta niente da
 * tenere fermo. Un id che non c'è restituisce l'ingresso così com'è.
 */
export function togli(stato: TalosCodaStato, id: string): TalosCodaStato {
    if (!stato.voci.some((v) => v.id === id)) return stato
    const voci = stato.voci.filter((v) => v.id !== id)
    return { voci, inPausa: stato.inPausa && voci.length > 0 }
}

/**
 * Cambia il testo di una voce AL SUO POSTO (stesso id, stessa data, stessa
 * posizione nella fila). Stessi rifiuti di `accoda` per il testo. Un id che
 * non c'è restituisce l'ingresso così com'è.
 */
export function modifica(
    stato: TalosCodaStato,
    id: string,
    testo: string,
): { stato: TalosCodaStato } | { rifiuto: TalosCodaRifiutoTesto } {
    const rifiuto = rifiutoDelTesto(testo)
    if (rifiuto !== null) return { rifiuto }
    if (!stato.voci.some((v) => v.id === id)) return { stato }
    return {
        stato: {
            voci: stato.voci.map((v) => (v.id === id ? { ...v, testo } : v)),
            inPausa: stato.inPausa,
        },
    }
}

/** Lo Stop con voci in coda (Hermes desktop). Una coda vuota non va in pausa. */
export function metteInPausa(stato: TalosCodaStato): TalosCodaStato {
    return { voci: stato.voci, inPausa: stato.voci.length > 0 }
}

/** «Riprendi»: la coda torna a consegnarsi da sola quando l'app è libera. */
export function riprende(stato: TalosCodaStato): TalosCodaStato {
    return { voci: stato.voci, inPausa: false }
}

/**
 * La prossima voce da consegnare DA SOLA, o `null` se non è il momento.
 *
 * ⛔ `null` in cinque casi, ciascuno con la sua ragione:
 *   - coda vuota: niente da consegnare;
 *   - in pausa: dopo lo Stop parte solo se la invii tu;
 *   - giro vivo in questa chat: la voce aspetta la fine della risposta;
 *   - giro vivo in un'altra chat: l'app risponde a una conversazione alla volta;
 *   - permesso d'attrezzo in attesa: la domanda aperta viene prima.
 * Altrimenti la PRIMA voce: l'ordine è quello in cui la persona ha scritto.
 */
export function prossimaDaConsegnare(
    stato: TalosCodaStato,
    {
        giroVivoQui,
        altraChatInCorso,
        permessoInAttesa,
    }: { giroVivoQui: boolean; altraChatInCorso: boolean; permessoInAttesa: boolean },
): TalosCodaVoce | null {
    if (stato.voci.length === 0) return null
    if (stato.inPausa) return null
    if (giroVivoQui || altraChatInCorso || permessoInAttesa) return null
    return stato.voci[0]
}

/**
 * Che cosa fa l'Invio del compositore.
 *
 * ⛔⛔ INVARIANTE: nessun ingresso produce un reindirizzo. Non è un ramo che
 *   manca: è un valore che il tipo non contiene. Chiunque un giorno voglia
 *   «indirizzare con l'Invio» deve cambiare il tipo, e la prova CODA-13 lo vede.
 *
 * - campo vuoto (o di soli spazi) ⇒ 'invia': lo scarta chi chiama, come oggi;
 *   non si accoda un niente;
 * - occupato (qui o in un'altra chat) e testo ⇒ 'accoda' (predefinita
 *   conservativa del desktop e di Hermes: non toglie niente al giro in corso);
 * - altrimenti ⇒ 'invia'.
 */
export function decidiInvio({
    testo,
    giroVivoQui,
    altraChatInCorso,
}: {
    testo: string
    giroVivoQui: boolean
    altraChatInCorso: boolean
}): 'invia' | 'accoda' {
    if (typeof testo !== 'string' || testo.trim() === '') return 'invia'
    if (giroVivoQui === true || altraChatInCorso === true) return 'accoda'
    return 'invia'
}

/**
 * L'azione principale sulla singola voce in coda — l'UNICO posto da cui nasce
 * un reindirizzo, e solo per un gesto esplicito della persona.
 *
 * - giro vivo qui, con attrezzi ⇒ 'indirizza': entra al prossimo confine fra
 *   attrezzi, il giro continua;
 * - giro vivo qui, senza attrezzi ⇒ 'ferma-e-riparti': non c'è un confine
 *   dove entrare, quindi si ferma il giro conservando il parziale e si riparte
 *   con questa voce — e il pulsante lo dice, non promette un indirizzo;
 * - nessun giro vivo qui ⇒ 'invia-ora' (anche se risponde un'altra chat: lì
 *   sarà lo store a dire che deve aspettare).
 */
export function azioneVoce({
    giroVivoQui,
    conAttrezzi,
}: {
    giroVivoQui: boolean
    conAttrezzi: boolean
}): 'indirizza' | 'ferma-e-riparti' | 'invia-ora' {
    if (!giroVivoQui) return 'invia-ora'
    return conAttrezzi ? 'indirizza' : 'ferma-e-riparti'
}
