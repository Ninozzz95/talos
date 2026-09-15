/**
 * Che FORMA ha un'attività, letta dai campi che esistono davvero.
 *
 * ## Perché sta fuori dai componenti
 *
 * Perché le stesse domande — «a che punto è?», «quando riparte?», «quanti punti
 * sono spuntati?», «in che ordine vanno?» — servono alla scheda, alla riga,
 * alla pagina di dettaglio e ai filtri. Tenute dentro uno di quei posti, gli
 * altri tre avrebbero copiato la regola, ed è così che la stessa attività
 * comincia a dire due cose diverse a seconda di dove la si guarda. È la stessa
 * scelta già fatta per le note (`components/talos/notes/noteShape.ts`), e la
 * grammatica delle spunte arriva letteralmente da lì: una casella scritta in
 * una nota e una scritta in un'attività sono la stessa cosa, e riconoscerne una
 * sola sarebbe un difetto che nessuno saprebbe spiegare.
 *
 * ## ⛔ Il modello del mockup non è il nostro, e non si copia il modello
 *
 * Il mockup «Talos Calm Finale» tiene UNA colonna di stato con dentro cinque
 * valori (`open`, `scheduled`, `running`, `paused`, `completed`): lì «è
 * pianificata» esclude «è da fare», perché sono due caselle dello stesso
 * cassetto. Qui gli assi sono tre e separati — `status` (todo/doing/done),
 * `schedule_json` (ha una ricorrenza) e `paused` (la ricorrenza è ferma) — e
 * questo è meglio, perché un'attività pianificata PUÒ essere in corso.
 *
 * ⇒ Si copia il RISULTATO del mockup, non la sua tabella: una precedenza sola,
 * dichiarata qui una volta, che da tre assi ricava la parola che si legge
 * sulla scheda e il gruppo in cui l'attività viene contata. La precedenza è
 * quella che il mockup mostra a schermo — una ricorrenza settimanale «da fare»
 * lì si legge «Pianificata», non «Da fare».
 */

import { talosNoteChecklist, type TalosNoteCheckItem } from '@/components/talos/notes/noteShape'
import {
    talosNextRunAt,
    talosParseSchedule,
    type TalosTaskSchedule,
} from '@/lib/tasks/schedule'
import type { TalosLocalTask } from '@/repositories/chatRepository'

/** Una riga spuntabile di un'attività: è la stessa grammatica delle note. */
export type TalosTaskCheckItem = TalosNoteCheckItem

/**
 * I punti spuntabili scritti nella descrizione.
 *
 * ⛔ Nelle note le caselle sono un SEGNO; qui sono un'azione (decisione
 * dell'owner, 12/09/2026). La lettura però è identica, e va tenuta identica:
 * due regex diverse per la stessa sintassi vorrebbero dire che copiare un
 * elenco da una nota a un'attività può fargli perdere le spunte.
 */
export function talosTaskChecklist(description: string | null | undefined): TalosTaskCheckItem[] {
    return talosNoteChecklist(description)
}

/**
 * La riga già scritta `[ ]` ⇄ `[x]`, e la descrizione che ne esce.
 *
 * Torna `null` quando `index` non è una riga spuntabile: è il caso in cui la
 * descrizione è cambiata sotto (corretta da un'altra schermata, riscritta dal
 * modello) fra il disegno della casella e il tocco. Scrivere lo stesso
 * vorrebbe dire rovinare una riga di testo che non era una casella.
 *
 * ⛔ Riscrive SOLO i quattro caratteri del riquadro, tenendo il rientro, il
 * trattino e il testo come stavano (`m[1]`, `m[3]`): rimontare la riga da
 * capo normalizzerebbe l'indentazione di chi l'ha scritta, e una spunta non è
 * il momento per riformattare il testo di qualcun altro.
 *
 * Pura di proposito — è la parte che si prova come un calcolo, senza un
 * database e senza un browser di mezzo.
 */
export function talosTaskToggleCheck(
    description: string | null | undefined,
    index: number,
): string | null {
    if (!Number.isInteger(index) || index < 0) return null
    const righe = String(description ?? '').split('\n')
    const riga = righe[index]
    if (riga === undefined) return null
    const m = /^(\s*[-*]\s+)\[([ xX])\](\s+.+)$/.exec(riga)
    if (!m) return null
    righe[index] = `${m[1]}[${m[2] === ' ' ? 'x' : ' '}]${m[3]}`
    return righe.join('\n')
}

/**
 * L'anteprima della descrizione, SENZA le righe spuntabili.
 *
 * È il mockup alla lettera (`pTaskCard`): le caselle hanno già il loro posto —
 * la barra «N di M punti spuntati» — e ripeterne il testo nell'anteprima
 * riempirebbe la scheda di roba detta due volte, lasciando fuori la frase che
 * spiega di cosa si tratta.
 */
export function talosTaskPreview(description: string | null | undefined, limit = 170): string {
    const testo = String(description ?? '')
        .split('\n')
        .filter((riga) => !/^\s*[-*]\s+\[/.test(riga))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    if (testo.length <= limit) return testo
    const testa = testo.slice(0, limit - 1)
    const spazio = testa.lastIndexOf(' ')
    // Taglia su uno spazio quando lo spazio è abbastanza avanti, altrimenti sul
    // carattere: spezzare a metà parola è brutto, ma una parola lunghissima
    // senza spazi non deve far sparire l'anteprima.
    return `${testa.slice(0, spazio > limit * 0.7 ? spazio : testa.length).trimEnd()}…`
}

/** La ricorrenza salvata, o `null` se non ce n'è una eseguibile. */
export function talosTaskSchedule(task: Pick<TalosLocalTask, 'schedule_json'>): TalosTaskSchedule | null {
    return talosParseSchedule(task.schedule_json)
}

/** Vero se l'attività ha una ricorrenza eseguibile, in pausa o no. */
export function talosTaskIsScheduled(task: Pick<TalosLocalTask, 'schedule_json'>): boolean {
    return talosTaskSchedule(task) !== null
}

/**
 * La parola che si legge addosso all'attività.
 *
 * ⛔ L'ORDINE È LA COSA CHE CONTA, e va letto dall'alto:
 *
 *   1. **completata** vince su tutto — una ricorrenza su una cosa finita non è
 *      la notizia; che sia finita, sì;
 *   2. **in pausa** viene prima di «pianificata»: è la differenza fra una
 *      ricorrenza che partirà e una che non partirà, ed è l'unica ragione per
 *      cui la pausa esiste. Dirla solo nel menu significherebbe che la si
 *      scopre riaprendo il menu;
 *   3. **in corso** viene prima di «pianificata»: se qualcuno ci sta lavorando
 *      adesso, quello è lo stato, e l'ora del prossimo giro sta comunque
 *      scritta due centimetri sotto;
 *   4. **pianificata**, cioè «ha una ricorrenza e partirà»;
 *   5. altrimenti **da fare**.
 *
 * ⛔ `paused` su un'attività SENZA ricorrenza non produce «in pausa»: non c'è
 * niente da fermare, e una pastiglia che annuncia una pausa inesistente è una
 * riga che mente. (La stazione non offre nemmeno l'azione, ma una riga arrivata
 * da un backup o dalla chat può avere il campo acceso lo stesso.)
 */
export type TalosTaskState = 'done' | 'paused' | 'doing' | 'scheduled' | 'todo'

export function talosTaskState(task: TalosLocalTask): TalosTaskState {
    if (task.status === 'done') return 'done'
    const pianificata = talosTaskIsScheduled(task)
    if (pianificata && task.paused) return 'paused'
    if (task.status === 'doing') return 'doing'
    return pianificata ? 'scheduled' : 'todo'
}

/**
 * Il colore della pastiglia, come i cinque toni del mockup (`pStatus`).
 *
 * Il tono non è mai l'unico segnale — accanto c'è sempre la parola, e
 * un'icona — ma è quello che si legge da lontano.
 */
export type TalosTaskTone = 'success' | 'warning' | 'info' | 'neutral'

export function talosTaskTone(state: TalosTaskState): TalosTaskTone {
    if (state === 'done') return 'success'
    if (state === 'paused') return 'warning'
    if (state === 'doing') return 'info'
    return 'neutral'
}

/**
 * I quattro gruppi in cui si contano le attività.
 *
 * ⛔ SONO UNA PARTIZIONE, e devono esserlo: i numeri accanto ai filtri servono
 * a decidere dove guardare, e quattro numeri che non fanno il totale sono
 * quattro numeri di cui non ci si fida più. «In pausa» quindi NON è un quinto
 * gruppo: un'attività in pausa resta pianificata — è il suo stato, sospeso —
 * e si trova dove una persona la cerca, cioè fra le pianificate.
 *
 * L'appartenenza usa la stessa precedenza della pastiglia, meno la pausa: così
 * quello che si legge sulla scheda e il gruppo in cui la si trova non possono
 * divergere.
 */
export type TalosTaskFilter = 'all' | 'todo' | 'doing' | 'scheduled' | 'done'

export function talosTaskGroup(task: TalosLocalTask): Exclude<TalosTaskFilter, 'all'> {
    const stato = talosTaskState(task)
    return stato === 'paused' ? 'scheduled' : stato
}

export function talosTaskMatchesFilter(task: TalosLocalTask, filter: TalosTaskFilter): boolean {
    return filter === 'all' || talosTaskGroup(task) === filter
}

/** Quando riparte, in millisecondi, o `null` se mai più (o se è in pausa). */
export function talosTaskNextRun(task: TalosLocalTask, from = Date.now()): number | null {
    // ⛔ Una ricorrenza in pausa non ha un «prossimo»: dire «domani alle 8» di
    // una cosa che domani alle 8 non partirà è il modo più preciso di mentire.
    if (task.paused) return null
    const schedule = talosTaskSchedule(task)
    if (!schedule) return null
    return talosNextRunAt(schedule, from, task.last_run_at ? Date.parse(task.last_run_at) : null)
}

/** Le parole che servono alla riga della ricorrenza, già tradotte da chi chiama. */
export interface TalosTaskScheduleLabels {
    readonly none: string
    readonly paused: string
    /** «Ogni {minutes} minuti» */
    readonly everyMinutes: (minutes: number) => string
    /** «Ogni giorno» */
    readonly daily: string
    /** «Ogni settimana», quando i giorni scelti non si sanno leggere. */
    readonly weekly: string
}

/**
 * La riga che dice quando riparte — «Senza pianificazione», «Lun · 09:00»,
 * «11 set · 11:00» — copiata da `pFormatTime` del mockup.
 *
 * ⛔ I nomi dei giorni e il formato della data vengono da `Intl`, con la lingua
 * passata da chi chiama: il mockup ha un elenco italiano scritto a mano
 * (`['Dom','Lun',…]`) e comparirebbe identico a chi usa l'app in inglese. È lo
 * stesso motivo per cui i campi della pianificazione lo fanno già così.
 */
export function talosTaskScheduleSummary(
    task: TalosLocalTask,
    labels: TalosTaskScheduleLabels,
    locale: string,
): string {
    const schedule = talosTaskSchedule(task)
    if (!schedule) return labels.none
    if (task.paused) return labels.paused
    const at = schedule.at ?? '09:00'
    if (schedule.kind === 'interval') {
        return labels.everyMinutes(schedule.everyMinutes ?? 60)
    }
    if (schedule.kind === 'once') {
        const giorno = new Date(`${schedule.date}T00:00:00`)
        const data = Number.isNaN(giorno.getTime())
            ? String(schedule.date ?? '')
            : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(giorno)
        return `${data} · ${at}`
    }
    if (schedule.kind === 'weekly') {
        const formato = new Intl.DateTimeFormat(locale, { weekday: 'short' })
        // 2026-08-09 è una domenica: da lì scorrono i sette giorni in ordine,
        // come già fa `TalosTaskScheduleFields.vue`.
        const nomi = [...(schedule.days ?? [])]
            .sort((a, b) => a - b)
            .map((g) => formato.format(new Date(2026, 7, 9 + g)))
        return `${nomi.join(', ') || labels.weekly} · ${at}`
    }
    return `${labels.daily} · ${at}`
}

/** I tre ordinamenti del mockup. «Priorità» è il valore di serie, come là. */
export type TalosTaskSort = 'priority' | 'recent' | 'title'

const PESO_PRIORITA: Record<string, number> = { high: 0, normal: 1, low: 2 }

/**
 * L'elenco, nell'ordine scelto.
 *
 * `recent` è già l'ordine in cui il deposito ha risposto (`updated_at DESC`),
 * quindi non si tocca: riordinarlo qui vorrebbe dire avere due idee di
 * «recente», una delle quali prima o poi sbaglia.
 *
 * In `priority` le completate finiscono in fondo PRIMA di guardare la
 * priorità — è il mockup, ed è giusto: un'attività finita ad alta priorità non
 * è la cosa più urgente che si ha, è una cosa che non si deve più fare.
 */
export function talosTaskSorted(
    tasks: readonly TalosLocalTask[],
    sort: TalosTaskSort,
    locale: string,
): TalosLocalTask[] {
    if (sort === 'recent') return [...tasks]
    if (sort === 'title') {
        return [...tasks].sort((a, b) => a.title.localeCompare(b.title, locale))
    }
    return [...tasks].sort((a, b) => (
        Number(a.status === 'done') - Number(b.status === 'done')
        || (PESO_PRIORITA[a.priority] ?? 1) - (PESO_PRIORITA[b.priority] ?? 1)
        || a.title.localeCompare(b.title, locale)
    ))
}

/**
 * L'attività come testo, per l'esportazione.
 *
 * Titolo, riga vuota, descrizione — la forma minima che resta leggibile in
 * qualunque cosa la riceva. Le caselle restano scritte come sono (`- [x]`):
 * sono il modo in cui chi riceve capisce che quello è un elenco di cose da
 * fare, e toglierle trasformerebbe una lista in un paragrafo.
 *
 * Niente intestazioni nostre e niente firma: esce quello che la persona ha
 * scritto, non il nome dell'app addosso a una frase che non ha mai scritto.
 */
export function talosTaskAsPlainText(task: Pick<TalosLocalTask, 'title' | 'description'>): {
    title: string
    content: string
} {
    return { title: task.title.trim(), content: String(task.description ?? '').trim() }
}
