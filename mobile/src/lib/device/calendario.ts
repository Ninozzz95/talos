import { registerPlugin } from '@capacitor/core'

/**
 * ⭐⭐⭐ LA PORTA VERSO IL CALENDARIO DEL TELEFONO.
 *
 * ## Il difetto che l'ha resa necessaria
 *
 * MISURATO sul Pad il 2026-08-14: «che impegni ho domani?» e TALOS rispondeva
 * «non hai compiti registrati per domani», avendo guardato le PROPRIE note e
 * attività. Non è «non lo so»: è una risposta **sicura e falsa sulla giornata
 * di una persona**, che chiude il telefono convinta di avere il giorno libero.
 *
 * ## ⭐ Dove Gemini non arriva
 *
 * Gemini legge attraverso l'**account Google**. Sul Pad il calendario `1` è
 * **locale** — non appartiene a nessun account — e lui non lo vede: verificato,
 * un evento scritto nel provider gli è rimasto invisibile. Leggendo il provider
 * si vede **tutto**: locali, Google, OEM, qualunque account sincronizzato.
 *
 * ⛔ `permesso` viaggia SEMPRE, anche con `eventi` vuoto: «non ho il permesso
 * di guardare» e «ho guardato e non c'è niente» sono due fatti diversi, e
 * confonderli è il difetto trovato in quattro strati in un giorno solo.
 */
export interface TalosEventoCalendario {
    /**
     * ⭐⭐⭐ L'id dell'EVENTO, che è ciò che rende possibile modificarlo.
     *
     * ⛔ È `Instances.EVENT_ID`, non `Instances._ID`: il secondo identifica la
     * singola RICORRENZA e non si può passare a `Events.CONTENT_URI`. Due numeri
     * che sembrano lo stesso, ed è il modo esatto in cui si cancella l'evento
     * sbagliato.
     */
    readonly id: number
    readonly titolo: string
    /** Millisecondi epoch. ⛔ Se `tuttoIlGiorno`, vanno letti in UTC. */
    readonly inizio: number
    readonly fine: number
    /**
     * ⛔ Un evento «tutto il giorno» è memorizzato a **mezzanotte UTC**, non
     * locale: convertirlo col fuso del telefono lo fa comparire a cavallo di due
     * giorni, o sparire dal giorno giusto. Il flag viaggia perché chi formatta
     * deve saperlo.
     */
    readonly tuttoIlGiorno: boolean
    readonly luogo: string
    readonly calendario: string
    /** Falso per le festività: non occupano la giornata. */
    readonly occupa: boolean
}

export interface PonteCalendario {
    /** ⛔ `da` e `a` sono stringhe: i millisecondi epoch non stanno in un int32. */
    leggi(options: { da: string, a: string, conFestivita?: boolean }): Promise<{
        permesso: boolean
        eventi: TalosEventoCalendario[]
        /** I calendari VISIBILI su cui la lettura è passata. Vedi il tipo esito. */
        calendari?: string[]
    }>
    chiediPermesso(): Promise<{ permesso: boolean }>
    scrivi(options: {
        titolo: string
        inizio: string
        fine: string
        luogo?: string
        note?: string
        calendario?: string
    }): Promise<{
        permesso: boolean
        /** ⛔ Vero solo se la riga è stata RILETTA dal provider dopo l'insert. */
        scritto: boolean
        /**
         * `quale-calendario` | `nessun-calendario-scrivibile`
         * | `insert-rifiutato` | `scritto-ma-non-rileggibile`
         */
        motivo?: string
        /** L'inizio VERO riletto dal provider, in millisecondi, come stringa. */
        inizioVero?: string
        /** Su quale è finito, o fra quali scegliere. */
        calendario?: string
        calendari?: string[]
    }>
    /**
     * ⭐⭐ Il verso che mancava: cambiare o cancellare un impegno che c'è già.
     *
     * ⛔ `fatto` vuol dire RILETTO, come `scritto`: dopo un cambio si rilegge la
     * riga, dopo una cancellazione si controlla che non ci sia più. Il conteggio
     * che rendono `update` e `delete` è la risposta del provider, non il fatto.
     */
    modifica(options: {
        id: string
        elimina?: boolean
        titolo?: string
        inizio?: string
        fine?: string
        luogo?: string
        note?: string
    }): Promise<{
        permesso: boolean
        fatto: boolean
        /**
         * `id-mancante` | `niente-da-cambiare` | `cambiato-ma-non-rileggibile`
         * | `cancellato-ma-ancora-li`
         */
        motivo?: string
        inizioVero?: string
        titoloVero?: string
    }>
    chiediPermessoScrittura(): Promise<{ permesso: boolean }>
}

export const TalosCalendarioBridge = registerPlugin<PonteCalendario>('TalosCalendario')

/**
 * ⭐⭐⭐ `calendari` — LE FONTI DELLA RISPOSTA, e non è un dettaglio diagnostico.
 *
 * Owner 2026-08-14, dal suo telefono: «che impegni ho domani?» → «non hai
 * impegni in calendario», mentre il Dentista e la Cena da Mario erano lì,
 * sincronizzati. Sul Pad, interrogando il provider a mano, i quattro eventi
 * c'erano tutti coi valori giusti.
 *
 * ⇒ Su quel telefono la risposta è nata da un insieme di calendari **diverso**,
 * e la frase era identica a quella giusta. Una risposta che non elenca le
 * proprie fonti non si può controllare: «non hai impegni» e «ho guardato questi
 * tre calendari e non c'è niente» sono la stessa notizia per chi ha ragione, e
 * due notizie diverse per chi ha torto.
 */
export type TalosEsitoCalendario =
    | {
        stato: 'letto'
        eventi: readonly TalosEventoCalendario[]
        /** ⛔ Sempre presente, anche a lettura piena: vedi sopra. */
        calendari: readonly string[]
    }
    | { stato: 'permesso-mancante' }
    | { stato: 'ponte-chiuso' }

/**
 * Legge gli impegni fra due istanti, o dice esattamente perché non ci riesce.
 *
 * ⭐⭐ SI CHIEDE, non si manda in Impostazioni — la stessa regola della rubrica.
 * Il dialogo di sistema costa un tocco e compare sopra quello che la persona sta
 * facendo; mandarla a cercare un interruttore è la strada lunga.
 *
 * ⛔ UNA volta sola: se dice di no, la seconda lettura risponde ancora
 * `permesso: false` e si esce. Un permesso chiesto due volte di fila è un
 * permesso che viene negato.
 */
export async function talosLeggiCalendario(
    da: number,
    a: number,
    conFestivita = false,
): Promise<TalosEsitoCalendario> {
    const argomenti = { da: String(da), a: String(a), conFestivita }
    let esito: { permesso: boolean, eventi: TalosEventoCalendario[], calendari?: string[] }
    try {
        esito = await TalosCalendarioBridge.leggi(argomenti)
    }
    catch {
        return { stato: 'ponte-chiuso' }
    }
    if (!esito.permesso) {
        const concesso = await TalosCalendarioBridge.chiediPermesso()
            .then((r) => r.permesso)
            .catch(() => false)
        if (!concesso) return { stato: 'permesso-mancante' }
        esito = await TalosCalendarioBridge.leggi(argomenti).catch(() => esito)
    }
    if (!esito.permesso) return { stato: 'permesso-mancante' }
    return {
        stato: 'letto',
        eventi: esito.eventi,
        // ⛔ Un ponte vecchio non manda l'elenco: si degrada a vuoto, e chi lo
        // legge dice «non so quali» invece di inventarne.
        calendari: Array.isArray(esito.calendari) ? esito.calendari : [],
    }
}

export type TalosEsitoScrittura =
    /**
     * ⛔ «Scritto» vuol dire RILETTO dal provider, non «l'insert ha risposto».
     *
     * ⭐ `inizioVero` viene dal PROVIDER, non da ciò che il modello ha mandato:
     * è l'unico numero che non può mentire sul giorno in cui l'appuntamento è
     * davvero finito. Vedi il difetto misurato in `calendarioTools`.
     */
    | { stato: 'scritto', calendario: string, inizioVero: number | null }
    | { stato: 'quale-calendario', calendari: readonly string[] }
    | { stato: 'nessun-calendario' }
    /** Il provider ha rifiutato la riga: non è mai esistita. */
    | { stato: 'rifiutato' }
    /**
     * ⛔ Il provider ha ACCETTATO la riga e poi non c'è. È il caso che l'owner
     * ha visto il 2026-08-14 e che prima non aveva nome: TALOS diceva «salvo
     * l'impegno» e nel calendario non compariva niente.
     */
    | { stato: 'non-rileggibile' }
    | { stato: 'permesso-mancante' }
    | { stato: 'ponte-chiuso' }

/**
 * ⭐⭐⭐ Scrive un appuntamento, **senza aprire niente**.
 *
 * Android offre `ACTION_INSERT`, che non chiede permessi ma **apre l'app
 * Calendario** con un modulo da confermare — l'errore che la sveglia ci ha
 * appena mostrato. Qui si scrive sul provider: costa un permesso e non sposta
 * nessuno. E luogo e descrizione ci stanno, che è ciò che Google dichiara
 * Gemini **non** saper modificare.
 *
 * ⛔ `quale-calendario` NON è un errore: è una domanda. Scegliere per la persona
 * su quale agenda finisce un appuntamento è la stessa famiglia del contatto con
 * tre numeri — e finire sull'agenda di famiglia invece che su quella di lavoro
 * lo vede la persona sbagliata.
 */
export async function talosScriviInCalendario(input: {
    titolo: string
    inizio: number
    fine: number
    luogo?: string
    note?: string
    calendario?: string
}): Promise<TalosEsitoScrittura> {
    const argomenti = {
        ...input,
        inizio: String(input.inizio),
        fine: String(input.fine),
    }
    let esito: Awaited<ReturnType<PonteCalendario['scrivi']>>
    try {
        esito = await TalosCalendarioBridge.scrivi(argomenti)
    }
    catch {
        return { stato: 'ponte-chiuso' }
    }
    if (!esito.permesso) {
        const concesso = await TalosCalendarioBridge.chiediPermessoScrittura()
            .then((r) => r.permesso)
            .catch(() => false)
        if (!concesso) return { stato: 'permesso-mancante' }
        esito = await TalosCalendarioBridge.scrivi(argomenti).catch(() => esito)
    }
    if (!esito.permesso) return { stato: 'permesso-mancante' }
    if (esito.motivo === 'quale-calendario') {
        return { stato: 'quale-calendario', calendari: esito.calendari ?? [] }
    }
    if (esito.motivo === 'nessun-calendario-scrivibile') return { stato: 'nessun-calendario' }
    /*
     * ⛔⛔⛔ «Scritto» adesso vuol dire RILETTO dal provider, non «l'insert ha
     * risposto». Owner 2026-08-14: TALOS ha detto «salvo l'impegno sul
     * calendario persona@example.com» e nel calendario non c'era niente.
     *
     * ⇒ I due motivi nuovi si tengono DISTINTI, perché portano a due frasi
     * diverse: «il telefono ha rifiutato di scrivere» e «ha detto di aver
     * scritto ma la riga non c'è» sono due guasti diversi, e il secondo è
     * quello che va detto per nome — se lo si nasconde dietro un generico
     * «non ha funzionato», la prossima volta si cerca nel posto sbagliato.
     */
    if (esito.motivo === 'insert-rifiutato') return { stato: 'rifiutato' }
    if (esito.motivo === 'scritto-ma-non-rileggibile') return { stato: 'non-rileggibile' }
    if (!esito.scritto) return { stato: 'ponte-chiuso' }
    const inizioVero = Number(esito.inizioVero)
    return {
        stato: 'scritto',
        calendario: esito.calendario ?? '',
        inizioVero: Number.isFinite(inizioVero) ? inizioVero : null,
    }
}

/**
 * ⭐⭐ Cambiare o cancellare un impegno che c'è già.
 *
 * ⛔ Stessa forma di `talosScriviInCalendario`, permesso compreso: se manca lo
 * si chiede una volta e si riprova. Un attrezzo che fallisce «per un permesso»
 * senza averlo mai chiesto è un attrezzo che non funziona e dà la colpa fuori.
 */
export type TalosEsitoModifica =
    | { stato: 'fatto', inizioVero?: number, titoloVero?: string }
    | { stato: 'permesso-mancante' }
    | { stato: 'ponte-chiuso' }
    | { stato: 'non-riuscito', motivo?: string }

export async function talosModificaInCalendario(input: {
    id: number
    elimina?: boolean
    titolo?: string
    inizio?: number
    fine?: number
    luogo?: string
    note?: string
}): Promise<TalosEsitoModifica> {
    const argomenti = {
        id: String(input.id),
        ...(input.elimina === true ? { elimina: true } : {}),
        ...(input.titolo ? { titolo: input.titolo } : {}),
        ...(input.inizio !== undefined ? { inizio: String(input.inizio) } : {}),
        ...(input.fine !== undefined ? { fine: String(input.fine) } : {}),
        ...(input.luogo ? { luogo: input.luogo } : {}),
        ...(input.note ? { note: input.note } : {}),
    }
    let esito: Awaited<ReturnType<PonteCalendario['modifica']>>
    try {
        esito = await TalosCalendarioBridge.modifica(argomenti)
    }
    catch {
        return { stato: 'ponte-chiuso' }
    }
    if (!esito.permesso) {
        const concesso = await TalosCalendarioBridge.chiediPermessoScrittura()
            .then((r) => r.permesso)
            .catch(() => false)
        if (!concesso) return { stato: 'permesso-mancante' }
        esito = await TalosCalendarioBridge.modifica(argomenti).catch(() => esito)
    }
    if (!esito.permesso) return { stato: 'permesso-mancante' }
    if (!esito.fatto) return { stato: 'non-riuscito', motivo: esito.motivo }
    return {
        stato: 'fatto',
        ...(esito.inizioVero ? { inizioVero: Number(esito.inizioVero) } : {}),
        ...(esito.titoloVero ? { titoloVero: esito.titoloVero } : {}),
    }
}
