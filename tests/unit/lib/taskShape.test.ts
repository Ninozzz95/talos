import { describe, expect, it } from 'vitest'
import {
    talosTaskAsPlainText,
    talosTaskChecklist,
    talosTaskGroup,
    talosTaskMatchesFilter,
    talosTaskNextRun,
    talosTaskPreview,
    talosTaskScheduleSummary,
    talosTaskSorted,
    talosTaskState,
    talosTaskToggleCheck,
    talosTaskTone,
} from '@/components/talos/tasks/taskShape'
import type { TalosLocalTask } from '@/repositories/chatRepository'

/**
 * La FORMA di un'attività, provata come un calcolo.
 *
 * Queste funzioni rispondono alle domande che scheda, riga, pagina e filtri si
 * fanno tutte: «a che punto è?», «in che gruppo la conto?», «quando riparte?».
 * Se sbagliano loro, sbagliano quattro superfici insieme e in modo coerente —
 * cioè nel modo più difficile da notare.
 *
 * ⛔ Ogni prova ha il suo VERSO CONTRARIO: un filtro che accetta tutto passa la
 * prova «accetta le completate» esattamente come uno vero.
 */

const BASE: TalosLocalTask = {
    id: 't1',
    title: 'Rivedere la presentazione',
    description: null,
    run_id: null,
    priority: 'normal',
    status: 'todo',
    content_origin: 'user-direct',
    schedule_json: null,
    instruction: null,
    last_run_at: null,
    paused: false,
    created_at: '2026-09-01T08:00:00.000Z',
    updated_at: '2026-09-01T08:00:00.000Z',
}

const OGNI_GIORNO = JSON.stringify({ kind: 'daily', at: '07:30' })

function task(patch: Partial<TalosLocalTask>): TalosLocalTask {
    return { ...BASE, ...patch }
}

describe('i punti spuntabili di un\'attività', () => {
    it('legge la stessa grammatica delle note, X maiuscola compresa', () => {
        const punti = talosTaskChecklist('- [ ] uno\n* [x] due\n- [X] tre\nnon un punto')
        expect(punti.map((p) => [p.index, p.done, p.text]))
            .toEqual([[0, false, 'uno'], [1, true, 'due'], [2, true, 'tre']])
    })

    it('riscrive SOLO il riquadro, tenendo rientro e trattino', () => {
        const prima = '    * [ ]   uno\n- [x] due'
        expect(talosTaskToggleCheck(prima, 0)).toBe('    * [x]   uno\n- [x] due')
        // ⛔ Al verso contrario: una spunta si toglie come si mette.
        expect(talosTaskToggleCheck(prima, 1)).toBe('    * [ ]   uno\n- [ ] due')
    })

    it('⛔ NON scrive niente dove non c\'è una casella', () => {
        expect(talosTaskToggleCheck('una frase\n- [ ] uno', 0)).toBeNull()
        // Fuori dal testo, e indici che non sono indici.
        expect(talosTaskToggleCheck('- [ ] uno', 9)).toBeNull()
        expect(talosTaskToggleCheck('- [ ] uno', -1)).toBeNull()
        expect(talosTaskToggleCheck('- [ ] uno', 1.5)).toBeNull()
        expect(talosTaskToggleCheck(null, 0)).toBeNull()
    })

    it('l\'anteprima toglie i punti e tiene la frase', () => {
        const testo = 'Apri le sei slide e controlla i contenuti.\n- [ ] uno\n- [x] due'
        expect(talosTaskPreview(testo)).toBe('Apri le sei slide e controlla i contenuti.')
        // Al verso contrario: senza frase resta una stringa vuota, non «- [ ] uno».
        expect(talosTaskPreview('- [ ] uno\n- [x] due')).toBe('')
    })

    it('l\'anteprima taglia su uno spazio, e sul carattere quando non ce n\'è', () => {
        expect(talosTaskPreview('alfa beta gamma delta', 12)).toBe('alfa beta…')
        expect(talosTaskPreview('a'.repeat(40), 12)).toBe(`${'a'.repeat(11)}…`)
    })
})

describe('a che punto è un\'attività', () => {
    it('legge la precedenza dall\'alto, una condizione per volta', () => {
        expect(talosTaskState(task({ status: 'done' }))).toBe('done')
        // Completata VINCE su tutto: una ricorrenza su una cosa finita non è la notizia.
        expect(talosTaskState(task({ status: 'done', schedule_json: OGNI_GIORNO, paused: true }))).toBe('done')
        expect(talosTaskState(task({ schedule_json: OGNI_GIORNO, paused: true }))).toBe('paused')
        // In pausa viene PRIMA di «in corso»: se non partirà, quello è lo stato.
        expect(talosTaskState(task({ status: 'doing', schedule_json: OGNI_GIORNO, paused: true }))).toBe('paused')
        expect(talosTaskState(task({ status: 'doing' }))).toBe('doing')
        expect(talosTaskState(task({ schedule_json: OGNI_GIORNO }))).toBe('scheduled')
        expect(talosTaskState(BASE)).toBe('todo')
    })

    it('⛔ «in pausa» su un\'attività SENZA ricorrenza non esiste', () => {
        // Il campo può arrivare acceso da un backup o dalla chat. Non c'è
        // niente da fermare, e una pastiglia che annuncia una pausa inesistente
        // è una riga che mente.
        expect(talosTaskState(task({ paused: true }))).toBe('todo')
        // Nemmeno con un JSON che non si sa leggere: quello NON è pianificata.
        expect(talosTaskState(task({ paused: true, schedule_json: '{rotto' }))).toBe('todo')
    })

    it('il tono accompagna la parola, e «da fare» resta neutro', () => {
        expect(talosTaskTone('done')).toBe('success')
        expect(talosTaskTone('paused')).toBe('warning')
        expect(talosTaskTone('doing')).toBe('info')
        expect(talosTaskTone('scheduled')).toBe('neutral')
        expect(talosTaskTone('todo')).toBe('neutral')
    })
})

describe('i cinque filtri', () => {
    const elenco = [
        task({ id: 'a' }),
        task({ id: 'b', status: 'doing' }),
        task({ id: 'c', schedule_json: OGNI_GIORNO }),
        task({ id: 'd', schedule_json: OGNI_GIORNO, paused: true }),
        task({ id: 'e', status: 'done' }),
    ]

    it('⛔ SONO UNA PARTIZIONE: i conteggi fanno il totale', () => {
        const gruppi = (['todo', 'doing', 'scheduled', 'done'] as const)
            .map((id) => elenco.filter((t) => talosTaskMatchesFilter(t, id)).length)
        expect(gruppi).toEqual([1, 1, 2, 1])
        expect(gruppi.reduce((a, b) => a + b, 0)).toBe(elenco.length)
    })

    it('un\'attività in pausa si conta fra le PIANIFICATE, dov\'è che la si cerca', () => {
        expect(talosTaskGroup(task({ schedule_json: OGNI_GIORNO, paused: true }))).toBe('scheduled')
    })

    it('«Tutte» accetta tutto, e ogni altro filtro RESPINGE qualcosa', () => {
        for (const t of elenco) expect(talosTaskMatchesFilter(t, 'all')).toBe(true)
        // ⛔ Il verso contrario: un filtro che non respinge mai supera la prova
        // «accetta le completate» come uno vero.
        expect(talosTaskMatchesFilter(task({ status: 'done' }), 'todo')).toBe(false)
        expect(talosTaskMatchesFilter(task({ status: 'doing' }), 'todo')).toBe(false)
        expect(talosTaskMatchesFilter(BASE, 'scheduled')).toBe(false)
        expect(talosTaskMatchesFilter(task({ schedule_json: OGNI_GIORNO }), 'done')).toBe(false)
    })
})

describe('quando riparte', () => {
    // 2026-09-01 è un martedì. Un istante fisso, non `Date.now()`: un test che
    // dipende dall'ora in cui gira è un test che un giorno diventa rosso da
    // solo, di notte, per nessun motivo.
    const MARTEDI_0900 = new Date(2026, 8, 1, 9, 0, 0).getTime()

    it('risponde per una ricorrenza viva', () => {
        const quando = talosTaskNextRun(task({ schedule_json: OGNI_GIORNO }), MARTEDI_0900)
        expect(quando).toBe(new Date(2026, 8, 2, 7, 30, 0).getTime())
    })

    it('⛔ NON risponde per una in pausa: «domani alle 7:30» sarebbe una bugia precisa', () => {
        expect(talosTaskNextRun(task({ schedule_json: OGNI_GIORNO, paused: true }), MARTEDI_0900)).toBeNull()
    })

    it('non risponde per una senza ricorrenza', () => {
        expect(talosTaskNextRun(BASE, MARTEDI_0900)).toBeNull()
    })
})

describe('la riga che dice quando riparte', () => {
    const etichette = {
        none: 'Senza pianificazione',
        paused: 'In pausa',
        everyMinutes: (minutes: number) => `Ogni ${minutes} minuti`,
        daily: 'Ogni giorno',
        weekly: 'Ogni settimana',
    }

    function riga(schedule: unknown, patch: Partial<TalosLocalTask> = {}): string {
        return talosTaskScheduleSummary(
            task({ schedule_json: schedule === null ? null : JSON.stringify(schedule), ...patch }),
            etichette,
            'it-IT',
        )
    }

    it('copre i quattro generi del mockup', () => {
        expect(riga({ kind: 'daily', at: '09:00' })).toBe('Ogni giorno · 09:00')
        expect(riga({ kind: 'interval', everyMinutes: 60 })).toBe('Ogni 60 minuti')
        expect(riga({ kind: 'once', at: '11:00', date: '2026-09-11' })).toMatch(/11 set.* · 11:00$/)
        expect(riga({ kind: 'weekly', at: '09:00', days: [1] })).toMatch(/ · 09:00$/)
    })

    it('dice «Senza pianificazione» quando non ce n\'è, e «In pausa» quando è ferma', () => {
        expect(riga(null)).toBe('Senza pianificazione')
        // Anche un JSON che non si sa leggere è «senza»: eseguire una
        // ricorrenza non capita significherebbe far partire qualcosa che
        // nessuno ha chiesto.
        expect(talosTaskScheduleSummary(task({ schedule_json: '{rotto' }), etichette, 'it-IT'))
            .toBe('Senza pianificazione')
        expect(riga({ kind: 'daily', at: '09:00' }, { paused: true })).toBe('In pausa')
    })

    it('⛔ i nomi dei giorni vengono dalla LINGUA, non da un elenco italiano', () => {
        const lun = riga({ kind: 'weekly', at: '09:00', days: [1] })
        const mon = talosTaskScheduleSummary(
            task({ schedule_json: JSON.stringify({ kind: 'weekly', at: '09:00', days: [1] }) }),
            etichette,
            'en-GB',
        )
        expect(lun).not.toBe(mon)
        expect(mon).toMatch(/^Mon/)
    })
})

describe('l\'ordine dell\'elenco', () => {
    const elenco = [
        task({ id: 'bassa', title: 'Zeta', priority: 'low' }),
        task({ id: 'alta', title: 'Alfa', priority: 'high' }),
        task({ id: 'finita', title: 'Beta', priority: 'high', status: 'done' }),
        task({ id: 'normale', title: 'Gamma', priority: 'normal' }),
    ]

    it('per priorità mette le COMPLETATE in fondo, anche se sono «alta»', () => {
        expect(talosTaskSorted(elenco, 'priority', 'it-IT').map((t) => t.id))
            .toEqual(['alta', 'normale', 'bassa', 'finita'])
    })

    it('per titolo ordina per titolo, e per «recenti» non tocca l\'ordine del deposito', () => {
        expect(talosTaskSorted(elenco, 'title', 'it-IT').map((t) => t.title))
            .toEqual(['Alfa', 'Beta', 'Gamma', 'Zeta'])
        expect(talosTaskSorted(elenco, 'recent', 'it-IT').map((t) => t.id))
            .toEqual(elenco.map((t) => t.id))
    })

    it('non modifica l\'elenco che riceve', () => {
        const copia = [...elenco]
        talosTaskSorted(elenco, 'priority', 'it-IT')
        expect(elenco).toEqual(copia)
    })
})

describe('l\'attività come testo', () => {
    it('è titolo e descrizione, coi punti scritti come sono', () => {
        expect(talosTaskAsPlainText(task({ description: '- [x] uno\n- [ ] due' })))
            .toEqual({ title: 'Rivedere la presentazione', content: '- [x] uno\n- [ ] due' })
    })

    it('senza descrizione resta il titolo, e nessuna riga vuota di troppo', () => {
        expect(talosTaskAsPlainText(task({ description: '   ' })))
            .toEqual({ title: 'Rivedere la presentazione', content: '' })
    })
})
