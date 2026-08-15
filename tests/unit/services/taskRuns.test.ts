import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le attività che si eseguono da sole, e la regola che non si può aggirare.
 *
 * ## Cosa prova questo file, e cosa no
 *
 * Il lavoro vero è in Java: quando arriva l'ora la WebView non esiste, e il
 * modello lo apre il lato nativo. Qui si prova **la decisione**, che è l'unica
 * parte che vive in TypeScript — e per una volta la parte più importante non è
 * quella che funziona, è quella che si RIFIUTA.
 *
 * ## ⛔ Il rifiuto
 *
 * Con il blocco dell'app acceso non si programma niente. Il database è cifrato
 * con una chiave avvolta dal PIN, senza recupero: un lavoro che parte alle sette
 * del mattino non ha modo di chiederlo.
 *
 * Si potrebbe tenere una copia dell'istruzione in un posto leggibile senza PIN.
 * Sarebbe comodo, e smentirebbe la promessa dell'app: chi accende il blocco sta
 * dicendo «senza il mio PIN non si legge niente», e «niente» comprende anche il
 * lavoro automatico. Questa prova esiste perché quella scorciatoia non venga
 * presa da nessuno, un giorno, per far funzionare una cosa.
 */

const nativo = vi.hoisted(() => ({ disponibile: true }))
vi.mock('@capacitor/core', () => ({
    Capacitor: { isPluginAvailable: () => nativo.disponibile },
    registerPlugin: () => ({}),
}))

function ponte() {
    return {
        schedule: vi.fn(async () => ({ scheduled: true, inMillis: 60_000 })),
        cancel: vi.fn(async () => undefined),
        clearAll: vi.fn(async () => undefined),
        scheduled: vi.fn(async () => ({ tasks: [] })),
    }
}

const compito = {
    id: 'mattina',
    modelPath: '/models/qwen.gguf',
    instruction: 'Riassumi le mie note di ieri.',
    title: 'Riassunto del mattino',
    nextRunAtMillis: 1_786_000_000_000,
}

beforeEach(() => { nativo.disponibile = true })

describe('programmare un\'attività che gira da sola', () => {
    it('col blocco spento la consegna al sistema, con tutto il necessario', async () => {
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()

        await expect(talosScheduleAutonomousTask(compito, false, bridge))
            .resolves.toEqual({ ok: true, inMillis: 60_000 })
        expect(bridge.schedule).toHaveBeenCalledWith(compito)
    })

    /**
     * ⛔ LA PROVA CHE CONTA. Col blocco acceso l'istruzione **non deve
     * attraversare il ponte**: non basta che il rifiuto arrivi, deve non essere
     * partito niente. Un'istruzione consegnata e poi ignorata sarebbe già una
     * copia fuori dal database cifrato.
     */
    it('col blocco ACCESO non manda niente, e lo dice con un motivo suo', async () => {
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()

        await expect(talosScheduleAutonomousTask(compito, true, bridge))
            .resolves.toEqual({ ok: false, reason: 'locked' })
        expect(bridge.schedule).not.toHaveBeenCalled()
    })

    /**
     * «Bloccata» e «rifiutata» sono due motivi diversi perché chi legge deve
     * fare due cose diverse: la prima si risolve spegnendo il blocco — una
     * scelta — la seconda è un guasto.
     */
    it('un rifiuto del sistema non si confonde col blocco', async () => {
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()
        bridge.schedule.mockResolvedValue({ scheduled: false, inMillis: 0 })

        await expect(talosScheduleAutonomousTask(compito, false, bridge))
            .resolves.toEqual({ ok: false, reason: 'refused' })
    })

    it('e un\'eccezione dal ponte non esce da qui come eccezione', async () => {
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()
        bridge.schedule.mockRejectedValue(new Error('TALOS_TASK_REFUSED'))

        await expect(talosScheduleAutonomousTask(compito, false, bridge))
            .resolves.toEqual({ ok: false, reason: 'refused' })
    })

    it('su una build senza il lato nativo si dichiara non supportata', async () => {
        nativo.disponibile = false
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()

        await expect(talosScheduleAutonomousTask(compito, false, bridge))
            .resolves.toEqual({ ok: false, reason: 'unsupported' })
        expect(bridge.schedule).not.toHaveBeenCalled()
    })
})

/**
 * Accendere il blocco è una promessa retroattiva: da quel momento senza il PIN
 * non si legge nulla, e ciò che era già stato consegnato al sistema va tolto.
 */
describe('quando il blocco viene acceso', () => {
    it('si dimentica tutto ciò che il sistema poteva aprire da solo', async () => {
        const { talosForgetAutonomousTasks } = await import('@/services/taskRuns')
        const bridge = ponte()

        await talosForgetAutonomousTasks(bridge)
        expect(bridge.clearAll).toHaveBeenCalled()
    })

    it('e un ponte che rifiuta non fa saltare l\'accensione del blocco', async () => {
        const { talosForgetAutonomousTasks } = await import('@/services/taskRuns')
        const bridge = ponte()
        bridge.clearAll.mockRejectedValue(new Error('boom'))

        // Se questo lanciasse, accendere il blocco fallirebbe — cioè la
        // protezione resterebbe spenta per colpa della pulizia.
        await expect(talosForgetAutonomousTasks(bridge)).resolves.toBeUndefined()
    })
})

describe('chiedere cosa è programmato', () => {
    it('non fa uscire l\'istruzione: si chiede QUANDO, non COSA', async () => {
        const { talosScheduledAutonomousTasks } = await import('@/services/taskRuns')
        const bridge = ponte()
        bridge.scheduled.mockResolvedValue({
            tasks: [{
                id: 'mattina', nextRunAtMillis: 1, title: 'Riassunto',
                onlyIfChanged: true, hasResult: false,
            }],
        })

        const elenco = await talosScheduledAutonomousTasks(bridge)
        expect(Object.keys(elenco[0]!)).not.toContain('instruction')
    })

    it('una lettura fallita è una lista vuota, non un errore in faccia', async () => {
        const { talosScheduledAutonomousTasks } = await import('@/services/taskRuns')
        const bridge = ponte()
        bridge.scheduled.mockRejectedValue(new Error('boom'))
        await expect(talosScheduledAutonomousTasks(bridge)).resolves.toEqual([])
    })
})
