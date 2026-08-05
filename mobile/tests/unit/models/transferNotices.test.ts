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

    it('annuncia la fine quando sparisce DOPO essere arrivato in fondo', () => {
        // Non esiste una fase «completato»: un download riuscito sparisce.
        const finito = item({ haveBytes: 100, totalBytes: 100 })
        expect(talosTransferNotices([finito], []))
            .toEqual([{ kind: 'finished', modelName: 'Qwen3-0.6B' }])
    })

    it('TACE quando sparisce senza essere arrivato in fondo', () => {
        /*
         * Sparire e' anche cio' che fa un download interrotto. Annunciare
         * «finito» a qualcosa che non lo e' e' peggio che non annunciare
         * niente: manda a cercare un file che non c'e'.
         */
        expect(talosTransferNotices([item({ haveBytes: 30, totalBytes: 100 })], []))
            .toEqual([])
    })

    it('tace su ciò che l`utente ha annullato', () => {
        const annullato = item({ haveBytes: 100, totalBytes: 100 })
        expect(talosTransferNotices([annullato], [], new Set(['a'])))
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
        // «uno» finisce mentre «due» parte: due avvisi distinti, non uno.
        const avvisi = talosTransferNotices([uno], [due])
        expect(avvisi).toContainEqual({ kind: 'started', modelName: 'Due' })
        expect(avvisi).toContainEqual({ kind: 'finished', modelName: 'Uno' })
        expect(avvisi).toHaveLength(2)
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
