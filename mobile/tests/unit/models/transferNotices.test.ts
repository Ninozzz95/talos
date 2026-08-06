import { describe, expect, it } from 'vitest'
import {
    talosTransferNotices,
    type TalosNoticeableTransfer,
} from '@/lib/models/transferNotices'

const item = (over: Partial<TalosNoticeableTransfer> = {}): TalosNoticeableTransfer => ({
    id: 'a',
    phase: 'running',
    modelName: 'Qwen3-0.6B',
    haveBytes: 10,
    totalBytes: 100,
    ...over,
})

describe('i tre momenti di un modello che arriva', () => {
    it('annuncia la partenza quando un trasferimento compare', () => {
        expect(talosTransferNotices([], [item()]))
            .toEqual([{ kind: 'started', modelName: 'Qwen3-0.6B' }])
    })

    /**
     * ⛔ IL CAMBIO DI CONTRATTO del 2026-08-06.
     *
     * Prima una riga sparita «arrivata in fondo» veniva annunciata come finita.
     * Quella deduzione regge solo se qualcuno stava guardando nell'istante
     * esatto della sparizione, e MISURATO sul Pad non è bastato: 214 MB in meno
     * di dodici secondi con la schermata aperta, e nessuna superficie se n'è
     * accorta.
     *
     * Ora la fine la dichiara il nativo — che l'ha compiuta — e qui restano
     * soltanto i due momenti che un'istantanea può onestamente vedere.
     */
    it('NON deduce più la fine da una riga sparita', () => {
        const finito = item({ haveBytes: 100, totalBytes: 100 })
        expect(talosTransferNotices([finito], [])).toEqual([])
    })

    it('e nemmeno da una sparita a metà, che è sempre stato giusto tacere', () => {
        expect(talosTransferNotices([item({ haveBytes: 30, totalBytes: 100 })], []))
            .toEqual([])
    })

    it('annuncia il fallimento UNA volta sola, non a ogni giro del poller', () => {
        const prima = item({ phase: 'running' })
        const caduto = item({ phase: 'failed' })
        expect(talosTransferNotices([prima], [caduto]))
            .toEqual([{ kind: 'failed', modelName: 'Qwen3-0.6B' }])
        // Il giro successivo lo rivede caduto: non deve ripetersi.
        expect(talosTransferNotices([caduto], [caduto])).toEqual([])
    })

    it('non confonde due trasferimenti diversi', () => {
        const uno = item({ id: 'uno', modelName: 'Uno', haveBytes: 100, totalBytes: 100 })
        const due = item({ id: 'due', modelName: 'Due' })
        // «uno» sparisce mentre «due» parte: la partenza si vede, la fine di
        // «uno» la racconta il nativo e non questa istantanea.
        expect(talosTransferNotices([uno], [due]))
            .toEqual([{ kind: 'started', modelName: 'Due' }])
    })

    it('usa l`id quando il nome del modello non c`è', () => {
        // Meglio un identificatore brutto che «undefined» in faccia a chi legge.
        expect(talosTransferNotices([], [item({ modelName: null, id: 'xyz' })]))
            .toEqual([{ kind: 'started', modelName: 'xyz' }])
    })

    it('non annuncia niente quando non cambia niente', () => {
        const fermo = [item()]
        expect(talosTransferNotices(fermo, fermo)).toEqual([])
    })
})
