import { describe, expect, it } from 'vitest'
import {
    talosShizukuGuidance,
    talosShizukuReach,
    type TalosShizukuSnapshot,
    type TalosShizukuState,
} from '@/lib/privilege/shizukuGuidance'

/**
 * ⛔ La schermata che deve dire UN passo, non un elenco.
 *
 * Le porte sono quattro e si chiudono in fila. Mostrarle tutte con una spunta
 * ciascuna sembra informativo ed è il modo più rapido di paralizzare: chi legge
 * non sa da dove cominciare, e comincia da nessuna parte.
 *
 * E c'è una cosa che le guide di Shizuku non hanno e questa deve avere: lo
 * stato «**il tuo produttore lo impedisce**». MISURATO sul Pad il 2026-08-08,
 * detto da Shizuku stesso — su ColorOS i permessi di adb sono limitati e
 * l'autorizzazione non arriva mai. Senza quello stato, la persona riproverebbe
 * all'infinito un pulsante che non può funzionare, dando la colpa a noi.
 */

const BASE: TalosShizukuSnapshot = {
    state: 'da_autorizzare',
    version: 13,
    uid: 2000,
    outdated: false,
    canGrantPermissions: false,
}

describe('dice UN passo, e sempre uno', () => {
    const STATI: readonly TalosShizukuState[] = [
        'assente', 'spento', 'da_autorizzare', 'negato', 'pronto',
    ]

    it('ogni stato ha il suo titolo, la sua spiegazione, e nessuno è vuoto', () => {
        const vuoti: string[] = []
        for (const state of STATI) {
            for (const chiesto of [false, true]) {
                const g = talosShizukuGuidance({ ...BASE, state }, chiesto)
                if (!g.titleKey || !g.bodyKey) vuoti.push(`${state}/${chiesto}`)
            }
        }
        expect(vuoti, `stati senza testo: ${vuoti.join(', ')}`).toEqual([])
    })

    it('e solo «pronto» dice di esserlo', () => {
        const pronti = STATI.filter((state) =>
            talosShizukuGuidance({ ...BASE, state }, false).ready)
        expect(pronti).toEqual(['pronto'])
    })

    it('quando è pronto non c’è niente da premere', () => {
        const g = talosShizukuGuidance({ ...BASE, state: 'pronto' }, true)
        expect(g.actionKey).toBeNull()
        expect(g.action).toBe('none')
    })
})

/**
 * Il cuore della schermata. Lo STESSO stato — «da autorizzare» — significa due
 * cose opposte a seconda che si sia già chiesto:
 *
 * - non ho ancora chiesto → **premi il pulsante**
 * - ho chiesto e sono ancora qui → **il tuo produttore lo impedisce**
 *
 * Su un sistema che non interferisce, chiedere porta a `pronto` o a `negato`.
 * Mai indietro a se stesso.
 */
describe('⛔ distingue «devi chiedere» da «il produttore lo impedisce»', () => {
    it('prima di aver chiesto, è un passo da fare', () => {
        const g = talosShizukuGuidance(BASE, false)
        expect(g.action).toBe('request')
        expect(g.manufacturerBlocked).toBe(false)
    })

    it('dopo aver chiesto ed essere ancora fermi, è un BLOCCO', () => {
        const g = talosShizukuGuidance(BASE, true)
        expect(g.manufacturerBlocked).toBe(true)
        // E manda dove sta l'interruttore, non a ripremere il pulsante che ha
        // appena non funzionato.
        expect(g.action).toBe('openDeveloperOptions')
    })

    it('e i due casi NON dicono la stessa cosa', () => {
        const prima = talosShizukuGuidance(BASE, false)
        const dopo = talosShizukuGuidance(BASE, true)
        expect(dopo.titleKey).not.toBe(prima.titleKey)
        expect(dopo.bodyKey).not.toBe(prima.bodyKey)
    })

    it('⛔ e nessun altro stato viene MAI chiamato blocco del produttore', () => {
        // Accusare il produttore quando la causa è un'altra manderebbe la
        // persona a cercare un interruttore che non risolve niente.
        const accusati: string[] = []
        for (const state of ['assente', 'spento', 'negato', 'pronto'] as const) {
            for (const chiesto of [false, true]) {
                if (talosShizukuGuidance({ ...BASE, state }, chiesto).manufacturerBlocked) {
                    accusati.push(`${state}/${chiesto}`)
                }
            }
        }
        expect(accusati, `stati accusati a torto: ${accusati.join(', ')}`).toEqual([])
    })
})

describe('dopo un rifiuto non si insiste', () => {
    it('non ripropone la finestra di sistema', () => {
        // Insistere con una richiesta di permesso dopo un no è il modo più
        // rapido di far disinstallare un'app.
        const g = talosShizukuGuidance({ ...BASE, state: 'negato' }, true)
        expect(g.action).not.toBe('request')
    })
})

/**
 * ⛔ «Autorizzato» non vuol dire «tutto».
 *
 * Con l'identità della shell si FANNO cose finché Shizuku è vivo; i permessi
 * che sopravvivono al riavvio vogliono root o Dhizuku. Una schermata che
 * dicesse solo «pronto» prometterebbe la seconda cosa avendo ottenuto la prima.
 */
describe('quanto lontano arriva davvero', () => {
    it('con la shell si può AGIRE, ma niente sopravvive al riavvio', () => {
        const r = talosShizukuReach({ ...BASE, state: 'pronto', uid: 2000, canGrantPermissions: false })
        expect(r.canAct).toBe(true)
        expect(r.survivesReboot).toBe(false)
    })

    it('con root sopravvive', () => {
        const r = talosShizukuReach({ ...BASE, state: 'pronto', uid: 0, canGrantPermissions: true })
        expect(r.survivesReboot).toBe(true)
    })

    it('e senza autorizzazione non si fa niente, qualunque sia l’identità', () => {
        for (const uid of [0, 2000, -1]) {
            const r = talosShizukuReach({
                ...BASE, state: 'da_autorizzare', uid, canGrantPermissions: uid === 0,
            })
            expect(r.canAct, `uid ${uid}`).toBe(false)
            expect(r.survivesReboot, `uid ${uid}`).toBe(false)
        }
    })

    it('e la schermata di «pronto» dice quale dei due, non solo «pronto»', () => {
        const shell = talosShizukuGuidance({ ...BASE, state: 'pronto', canGrantPermissions: false }, true)
        const root = talosShizukuGuidance({ ...BASE, state: 'pronto', canGrantPermissions: true }, true)
        expect(shell.bodyKey).not.toBe(root.bodyKey)
    })
})
