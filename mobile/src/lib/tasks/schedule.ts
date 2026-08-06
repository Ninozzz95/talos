/**
 * Quando un'attività deve ripartire.
 *
 * ## Da dove nasce
 *
 * Owner 2026-08-05: le Attività di TALOS devono fare quello che fa «Pianificare»
 * di ChatGPT. La ricerca del 2026-08-06 ha misurato sette limiti di quella
 * funzione, e sei si battono per COSTRUZIONE — non perché siamo più bravi, ma
 * perché girando sul dispositivo non abbiamo i vincoli che ha un servizio:
 *
 * 1. **Tetto sul numero** — da 3 a 15 attività attive secondo l'abbonamento.
 *    Qui non c'è tetto: le righe stanno in SQLite, sul telefono di chi le scrive.
 * 2. **Solo a pagamento.** Qui no.
 * 3. **Mai più spesso di un'ora.** Qui il minimo è quindici minuti, che è il
 *    minimo di WorkManager — e per un'esecuzione singola si può essere esatti.
 * 4. **Va in letargo se non apri l'app.** WorkManager sopravvive ai riavvii e
 *    non chiede a nessuno di aprire niente.
 * 5. **Niente file, niente tool, niente modelli personalizzati.** Qui
 *    un'attività chiama lo stesso modello della chat, con gli stessi strumenti.
 * 6. **Nessuna condizione, quindi notifiche ripetute e inutili** — è la
 *    lamentela più citata. Qui c'è `onlyIfChanged`: se il risultato è identico
 *    all'ultimo, l'attività è girata e non ha disturbato nessuno.
 *
 * Il settimo — la deriva del contesto su una cronologia che cresce — non è un
 * limite di prodotto ma una conseguenza di far vivere l'attività dentro una
 * conversazione. Qui ogni esecuzione parte dall'istruzione dichiarata, che non
 * cambia da sola.
 *
 * ## Perché una funzione pura
 *
 * Perché «quando riparte» è la domanda che sbaglia tutto il resto se sbaglia
 * lei: il programmatore di sistema la chiede a ogni risveglio, l'interfaccia la
 * mostra prima di salvare, e la notifica la usa per dire «la prossima alle 8».
 * Tre posti, una risposta sola, e provabile senza aspettare domani.
 */

/** I quattro modi di ripetersi, e non uno di più finché non servono davvero. */
export type TalosTaskScheduleKind = 'once' | 'daily' | 'weekly' | 'interval'

export interface TalosTaskSchedule {
    kind: TalosTaskScheduleKind
    /**
     * L'ora locale, `HH:MM`. Assente per `interval`, che non guarda l'orologio.
     *
     * Ora LOCALE e non UTC: chi scrive «tutte le mattine alle 8» intende le otto
     * di dove si trova, e continuerà a intenderlo dopo un fuso o un cambio d'ora.
     * Salvare l'istante assoluto congelerebbe le otto di ieri.
     */
    at?: string
    /** Per `once`: il giorno, `AAAA-MM-GG` locale. */
    date?: string
    /**
     * Per `weekly`: i giorni, 0 = domenica come `Date.getDay()`.
     *
     * Un elenco e non un solo giorno perché «lunedì, mercoledì e venerdì» è una
     * cosa sola nella testa di chi la scrive, e costringerla in tre attività
     * separate significa poi doverle modificare tutte e tre.
     */
    days?: readonly number[]
    /** Per `interval`: ogni quanti minuti. Il minimo vero è 15. */
    everyMinutes?: number
    /**
     * Avvisa SOLO se il risultato è cambiato.
     *
     * È la risposta al limite più lamentato di «Pianificare»: senza condizione,
     * un controllo che gira ogni ora manda ventiquattro notifiche identiche al
     * giorno, e chi le riceve smette di guardarle — comprese quelle che
     * contavano.
     */
    onlyIfChanged?: boolean
}

/** Il minimo di WorkManager. Chiedere meno non fa girare più spesso: fa mentire. */
export const TALOS_TASK_MIN_INTERVAL_MINUTES = 15

const GIORNO_MS = 24 * 60 * 60 * 1000

/** `HH:MM` → minuti dalla mezzanotte, oppure `null` se non è un orario. */
export function talosParseTimeOfDay(at: string | undefined): number | null {
    if (typeof at !== 'string') return null
    const m = /^(\d{1,2}):(\d{2})$/.exec(at.trim())
    if (!m) return null
    const ore = Number(m[1])
    const minuti = Number(m[2])
    if (ore < 0 || ore > 23 || minuti < 0 || minuti > 59) return null
    return ore * 60 + minuti
}

/**
 * Vero se questa pianificazione è eseguibile.
 *
 * Tutto o niente, come per la forma del modello: mezza pianificazione — un
 * `weekly` senza giorni, un `interval` senza minuti — produrrebbe un'attività
 * che non parte mai e che nell'elenco sembra attiva. Un'attività che mente sul
 * proprio stato è peggio di un'attività che non si è potuta salvare.
 */
export function talosIsValidSchedule(schedule: TalosTaskSchedule | null | undefined): boolean {
    if (!schedule) return false
    switch (schedule.kind) {
        case 'once':
            return talosParseTimeOfDay(schedule.at) !== null
                && typeof schedule.date === 'string'
                && /^\d{4}-\d{2}-\d{2}$/.test(schedule.date)
        case 'daily':
            return talosParseTimeOfDay(schedule.at) !== null
        case 'weekly':
            return talosParseTimeOfDay(schedule.at) !== null
                && Array.isArray(schedule.days)
                && schedule.days.length > 0
                && schedule.days.every((g) => Number.isInteger(g) && g >= 0 && g <= 6)
        case 'interval':
            return typeof schedule.everyMinutes === 'number'
                && Number.isFinite(schedule.everyMinutes)
                && schedule.everyMinutes >= TALOS_TASK_MIN_INTERVAL_MINUTES
        default:
            return false
    }
}

/** Mezzanotte locale del giorno che contiene `istante`. */
function inizioGiorno(istante: number): Date {
    const d = new Date(istante)
    d.setHours(0, 0, 0, 0)
    return d
}

/**
 * Il prossimo istante in cui l'attività deve partire, o `null` se mai più.
 *
 * `null` non è un errore: un'esecuzione singola già passata non ha un dopo, ed è
 * proprio così che l'interfaccia sa scrivere «fatta» invece di «prossima fra…».
 *
 * `from` è esplicito e non `Date.now()` perché questa funzione deve poter essere
 * provata su un istante scelto: un test che dipende dall'ora in cui gira è un
 * test che un giorno diventa rosso da solo, di notte, per nessun motivo.
 */
export function talosNextRunAt(
    schedule: TalosTaskSchedule | null | undefined,
    from: number,
    lastRunAt: number | null = null,
): number | null {
    if (!talosIsValidSchedule(schedule) || !schedule) return null

    if (schedule.kind === 'interval') {
        const passo = Math.max(TALOS_TASK_MIN_INTERVAL_MINUTES, schedule.everyMinutes ?? 0) * 60_000
        // Dalla FINE dell'ultima esecuzione, non da un'origine fissa: un
        // «ogni due ore» deve dire due ore da quando è girato davvero, altrimenti
        // dopo un riavvio ripartirebbe subito e poi di nuovo fra poco.
        const base = lastRunAt ?? from
        const prossimo = base + passo
        return prossimo > from ? prossimo : from + passo
    }

    const minuti = talosParseTimeOfDay(schedule.at)
    if (minuti === null) return null

    if (schedule.kind === 'once') {
        const [anno, mese, giorno] = (schedule.date ?? '').split('-').map(Number)
        const quando = new Date(anno, mese - 1, giorno, 0, minuti, 0, 0).getTime()
        // Già passato e già eseguito: non c'è un dopo. Già passato e MAI
        // eseguito: parte adesso — chi programma per le 8 e riaccende alle 9 si
        // aspetta di trovarla fatta, non svanita.
        if (quando > from) return quando
        return lastRunAt === null ? from : null
    }

    const giorniAmmessi = schedule.kind === 'weekly'
        ? new Set(schedule.days ?? [])
        : null

    // Otto giorni e non sette: partendo da oggi, il settimo giro ricade su oggi
    // e servirebbe comunque quello dopo se l'ora di oggi è già passata.
    for (let salto = 0; salto <= 7; salto += 1) {
        const giorno = new Date(inizioGiorno(from).getTime() + salto * GIORNO_MS)
        if (giorniAmmessi && !giorniAmmessi.has(giorno.getDay())) continue
        const quando = new Date(
            giorno.getFullYear(), giorno.getMonth(), giorno.getDate(), 0, minuti, 0, 0,
        ).getTime()
        if (quando > from) return quando
    }
    return null
}

/**
 * Legge la pianificazione salvata. Qualunque cosa storta diventa `null`.
 *
 * Il JSON in colonna può arrivare da una versione futura o da un file rovinato,
 * e in quel caso l'unica risposta onesta è «questa attività non è pianificata»:
 * eseguirne una che non si è capita significa far partire qualcosa che nessuno
 * ha chiesto.
 */
export function talosParseSchedule(raw: unknown): TalosTaskSchedule | null {
    if (typeof raw !== 'string' || raw.trim() === '') return null
    let letto: unknown
    try {
        letto = JSON.parse(raw)
    } catch {
        return null
    }
    if (typeof letto !== 'object' || letto === null) return null
    const candidato = letto as TalosTaskSchedule
    return talosIsValidSchedule(candidato) ? candidato : null
}

/** Scrive la pianificazione, e rifiuta di scriverne una che non parte. */
export function talosSerializeSchedule(schedule: TalosTaskSchedule | null): string | null {
    if (!talosIsValidSchedule(schedule) || !schedule) return null
    return JSON.stringify(schedule)
}
