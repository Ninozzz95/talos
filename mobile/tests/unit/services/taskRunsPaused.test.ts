import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * U-17 — un'attività IN PAUSA non parte, e non basta non programmarla.
 *
 * ## Perché il caso vive in un file suo
 *
 * `taskRuns.test.ts` prova il rifiuto per il blocco dell'app: una regola di
 * sicurezza, che nessuno deve poter aggirare per far funzionare una cosa.
 * Questo è un rifiuto di genere diverso — è una decisione della persona, ed è
 * l'unica delle tre che si annulla da sola quando lei preme «Riprendi».
 * Tenerli separati è ciò che impedisce che, un giorno, qualcuno «semplifichi»
 * i due rami in uno solo.
 *
 * ## ⛔ La parte che si dimentica: DISDIRE
 *
 * Il lavoro che dorme è già registrato nel sistema, e con `setPersisted(true)`
 * sopravvive anche a un riavvio del telefono. Uscire senza disdire lo
 * lascerebbe partire lo stesso, alla sua ora, con la persona convinta di averlo
 * fermato: una pausa che non ferma è peggio di nessuna pausa.
 *
 * E si disdice perché `JobScheduler` non ha una pausa — «cancel() cancella il
 * lavoro indicato; se sta girando viene fermato subito»
 * (https://developer.android.com/reference/android/app/job/JobScheduler, letto
 * il 12/09/2026). Fermare e riprendere si scrive come disdire e riprogrammare.
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

describe('la pausa di un\'attività pianificata', () => {
    it('in pausa NON programma, e disdice quello che c\'era', async () => {
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()

        await expect(talosScheduleAutonomousTask({ ...compito, paused: true }, false, bridge))
            .resolves.toEqual({ ok: false, reason: 'paused' })
        expect(bridge.schedule).not.toHaveBeenCalled()
        // ⛔ La riga che conta: senza questa, la pausa è una bugia.
        expect(bridge.cancel).toHaveBeenCalledWith({ id: 'mattina' })
    })

    it('⛔ AL VERSO CONTRARIO: ripresa, riparte — e non si disdice niente', async () => {
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()

        await expect(talosScheduleAutonomousTask({ ...compito, paused: false }, false, bridge))
            .resolves.toEqual({ ok: true, inMillis: 60_000 })
        expect(bridge.schedule).toHaveBeenCalledWith({ ...compito, paused: false })
        expect(bridge.cancel).not.toHaveBeenCalled()
    })

    it('senza il campo si comporta come prima: una pausa assente non è una pausa', async () => {
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()

        await expect(talosScheduleAutonomousTask(compito, false, bridge))
            .resolves.toEqual({ ok: true, inMillis: 60_000 })
        expect(bridge.cancel).not.toHaveBeenCalled()
    })

    it('«in pausa» resta DIVERSO da «bloccata»: due ragioni, due risposte', async () => {
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()

        // Col blocco acceso la ragione è `locked`, e vince: è una regola
        // dell'app, non una decisione revocabile con un tocco.
        await expect(talosScheduleAutonomousTask({ ...compito, paused: true }, true, bridge))
            .resolves.toEqual({ ok: false, reason: 'locked' })
        // ⛔ E col blocco acceso non si disdice niente: il lavoro nativo è già
        // stato cancellato da `talosForgetAutonomousTasks` quando il blocco è
        // stato acceso, e chiedere di nuovo qui non aggiungerebbe niente.
        expect(bridge.cancel).not.toHaveBeenCalled()
    })

    it('senza il plugin nativo la risposta resta «non supportato»', async () => {
        nativo.disponibile = false
        const { talosScheduleAutonomousTask } = await import('@/services/taskRuns')
        const bridge = ponte()

        await expect(talosScheduleAutonomousTask({ ...compito, paused: true }, false, bridge))
            .resolves.toEqual({ ok: false, reason: 'unsupported' })
        expect(bridge.cancel).not.toHaveBeenCalled()
    })
})
