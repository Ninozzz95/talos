import { describe, expect, it } from 'vitest'
import {
    TALOS_TASK_MIN_INTERVAL_MINUTES,
    talosIsValidSchedule,
    talosNextRunAt,
    talosParseSchedule,
    talosParseTimeOfDay,
    talosSerializeSchedule,
} from '@/lib/tasks/schedule'

/**
 * Un istante fisso, scelto e non pescato dall'orologio: martedì 2026-08-11 alle
 * 09:30 locali. Un test che dipende da quando gira è un test che una notte
 * diventa rosso da solo, per nessun motivo.
 */
const MARTEDI_0930 = new Date(2026, 7, 11, 9, 30, 0, 0).getTime()

function leggibile(istante: number | null): string | null {
    if (istante === null) return null
    const d = new Date(istante)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

describe('orario del giorno', () => {
    it('legge un orario e rifiuta ciò che non lo è', () => {
        expect(talosParseTimeOfDay('08:00')).toBe(480)
        expect(talosParseTimeOfDay('8:05')).toBe(485)
        expect(talosParseTimeOfDay('23:59')).toBe(1439)
        expect(talosParseTimeOfDay('24:00')).toBeNull()
        expect(talosParseTimeOfDay('08:60')).toBeNull()
        expect(talosParseTimeOfDay('otto')).toBeNull()
        expect(talosParseTimeOfDay(undefined)).toBeNull()
    })
})

/**
 * Mezza pianificazione produrrebbe un'attività che nell'elenco sembra attiva e
 * non parte mai — cioè una che mente sul proprio stato, che è peggio di una che
 * non si è potuta salvare.
 */
describe('una pianificazione vale tutta o niente', () => {
    it.each([
        ['once senza data', { kind: 'once', at: '08:00' }],
        ['once con data storta', { kind: 'once', at: '08:00', date: '11/08/2026' }],
        ['daily senza ora', { kind: 'daily' }],
        ['weekly senza giorni', { kind: 'weekly', at: '08:00', days: [] }],
        ['weekly con un giorno che non esiste', { kind: 'weekly', at: '08:00', days: [7] }],
        ['interval sotto il minimo', { kind: 'interval', everyMinutes: 5 }],
        ['interval senza minuti', { kind: 'interval' }],
        ['un genere inventato', { kind: 'lunare', at: '08:00' }],
    ])('rifiuta: %s', (_nome, schedule) => {
        expect(talosIsValidSchedule(schedule as never)).toBe(false)
        expect(talosNextRunAt(schedule as never, MARTEDI_0930)).toBeNull()
    })

    it.each([
        ['once', { kind: 'once', at: '08:00', date: '2026-08-12' }],
        ['daily', { kind: 'daily', at: '08:00' }],
        ['weekly', { kind: 'weekly', at: '08:00', days: [1, 3, 5] }],
        ['interval al minimo esatto', { kind: 'interval', everyMinutes: TALOS_TASK_MIN_INTERVAL_MINUTES }],
    ])('accetta: %s', (_nome, schedule) => {
        expect(talosIsValidSchedule(schedule as never)).toBe(true)
    })
})

describe('quando riparte', () => {
    it('ogni giorno: se l\'ora è passata va a domani, se no resta oggi', () => {
        expect(leggibile(talosNextRunAt({ kind: 'daily', at: '08:00' }, MARTEDI_0930)))
            .toBe('2026-08-12 08:00')
        expect(leggibile(talosNextRunAt({ kind: 'daily', at: '18:00' }, MARTEDI_0930)))
            .toBe('2026-08-11 18:00')
    })

    /**
     * Il caso che nessuno prova: l'ora è esattamente adesso. Deve andare al
     * giorno dopo, non ripartire in cerchio nello stesso minuto.
     */
    it('ogni giorno: l\'ora di ADESSO vale domani, non un altro giro di oggi', () => {
        expect(leggibile(talosNextRunAt({ kind: 'daily', at: '09:30' }, MARTEDI_0930)))
            .toBe('2026-08-12 09:30')
    })

    it('a giorni scelti: salta al primo giorno buono', () => {
        // Martedì è 2: chiedendo lunedì/mercoledì/venerdì tocca mercoledì 12.
        expect(leggibile(talosNextRunAt({ kind: 'weekly', at: '07:00', days: [1, 3, 5] }, MARTEDI_0930)))
            .toBe('2026-08-12 07:00')
        // Chiedendo martedì con un'ora ancora da venire, è oggi.
        expect(leggibile(talosNextRunAt({ kind: 'weekly', at: '21:00', days: [2] }, MARTEDI_0930)))
            .toBe('2026-08-11 21:00')
        // Chiedendo SOLO martedì con l'ora passata, è fra sette giorni.
        expect(leggibile(talosNextRunAt({ kind: 'weekly', at: '07:00', days: [2] }, MARTEDI_0930)))
            .toBe('2026-08-18 07:00')
    })

    it('a intervallo: conta dalla fine dell\'ultima esecuzione, non da un\'origine fissa', () => {
        const unOraFa = MARTEDI_0930 - 60 * 60_000
        // Ogni 2 ore, ultima un'ora fa: fra un'ora.
        expect(leggibile(talosNextRunAt({ kind: 'interval', everyMinutes: 120 }, MARTEDI_0930, unOraFa)))
            .toBe('2026-08-11 10:30')
        // Mai eseguita: il primo giro parte da adesso.
        expect(leggibile(talosNextRunAt({ kind: 'interval', everyMinutes: 120 }, MARTEDI_0930, null)))
            .toBe('2026-08-11 11:30')
    })

    /**
     * Dopo un riavvio lungo l'ultima esecuzione può essere vecchissima, e il
     * «prossimo» calcolato cadrebbe nel passato. Deve tornare avanti: un istante
     * già passato farebbe partire l'attività subito e poi di nuovo fra poco.
     */
    it('a intervallo: dopo uno spegnimento lungo non torna nel passato', () => {
        const treGiorniFa = MARTEDI_0930 - 3 * 24 * 60 * 60_000
        const prossimo = talosNextRunAt({ kind: 'interval', everyMinutes: 60 }, MARTEDI_0930, treGiorniFa)
        expect(prossimo).not.toBeNull()
        expect(prossimo!).toBeGreaterThan(MARTEDI_0930)
    })

    it('una volta sola: se è futura è quella, e dopo non c\'è un dopo', () => {
        const schedule = { kind: 'once', at: '08:00', date: '2026-08-12' } as const
        expect(leggibile(talosNextRunAt(schedule, MARTEDI_0930))).toBe('2026-08-12 08:00')
        // Passata E già eseguita: non riparte.
        const dopo = new Date(2026, 7, 12, 9, 0).getTime()
        expect(talosNextRunAt(schedule, dopo, dopo - 3_600_000)).toBeNull()
    })

    /**
     * Passata ma MAI eseguita: parte adesso. Chi programma per le 8 e riaccende
     * il telefono alle 9 si aspetta di trovarla fatta, non svanita in silenzio —
     * ed è esattamente il modo in cui i promemoria perdono la fiducia di chi li
     * usa.
     */
    it('una volta sola: se il momento è passato mentre il telefono era spento, parte comunque', () => {
        const schedule = { kind: 'once', at: '08:00', date: '2026-08-11' } as const
        expect(talosNextRunAt(schedule, MARTEDI_0930, null)).toBe(MARTEDI_0930)
    })
})

describe('leggere e scrivere quello che sta in colonna', () => {
    it('fa il giro completo senza perdere niente', () => {
        const schedule = { kind: 'weekly', at: '08:30', days: [1, 5], onlyIfChanged: true } as const
        const scritto = talosSerializeSchedule(schedule)
        expect(scritto).not.toBeNull()
        expect(talosParseSchedule(scritto)).toEqual(schedule)
    })

    /**
     * Un JSON rovinato o venuto da una versione futura diventa «non
     * pianificata», mai un'eccezione e mai un'esecuzione: far partire qualcosa
     * che non si è capito è il modo peggiore di sbagliare.
     */
    it.each([
        ['niente', null],
        ['vuoto', ''],
        ['non è JSON', '{rotto'],
        ['JSON ma non un oggetto', '"otto"'],
        ['un oggetto che non è una pianificazione', '{"kind":"daily"}'],
    ])('legge %s come «non pianificata»', (_nome, raw) => {
        expect(talosParseSchedule(raw)).toBeNull()
    })

    it('rifiuta di scrivere una pianificazione che non partirebbe', () => {
        expect(talosSerializeSchedule({ kind: 'weekly', at: '08:00', days: [] })).toBeNull()
        expect(talosSerializeSchedule(null)).toBeNull()
    })
})

/**
 * Il difetto visto sul tablet il 2026-08-06: la data compariva
 * `07&#x2F;08&#x2F;26`. `escapeParameter` è acceso su tutta l'app — ed è giusto,
 * protegge da un parametro ostile — ma riscrive anche le barre di una data.
 *
 * La cura è che la data NON attraversi `t()`. Questo test tiene ferma la
 * ragione: se un giorno qualcuno rimettesse `{when}` dentro la stringa, la
 * chiave con il parametro tornerebbe a esistere e l'app tornerebbe a mostrare
 * entità HTML a chi legge un orario.
 */
describe("la data non passa dall'escape delle traduzioni", () => {
    it("esiste un'etichetta SENZA parametro, in entrambe le lingue", async () => {
        const [it, en] = await Promise.all([
            import('@/i18n/locales/it'),
            import('@/i18n/locales/en'),
        ])
        for (const dizionario of [it.TALOS_IT_MESSAGES, en.TALOS_EN_MESSAGES]) {
            const etichetta = dizionario.tasks.schedule.nextRunLabel
            expect(typeof etichetta).toBe('string')
            expect(etichetta).not.toContain('{')
        }
    })
})

