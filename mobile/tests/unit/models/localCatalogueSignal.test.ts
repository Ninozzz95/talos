import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    talosAnnounceLocalCatalogueChange,
    talosOnLocalCatalogueChange,
    talosResetLocalCatalogueListeners,
} from '@/lib/models/localCatalogueSignal'

afterEach(() => { talosResetLocalCatalogueListeners() })

/**
 * C45-RED-19F — «il modello scaricato deve comparire nel composer da solo».
 *
 * Il difetto non stava in una funzione: stava nella CUCITURA. Il download
 * finiva, il toast lo diceva, e il selettore della chat continuava a mostrare
 * l'elenco di prima finché qualcuno non premeva «aggiorna». Le prove qui
 * guardano quindi il collegamento, non il calcolo.
 */
describe('C45-RED-19F local catalogue signal', () => {
    it('tells every listener, with the reason', () => {
        const first = vi.fn()
        const second = vi.fn()
        talosOnLocalCatalogueChange(first)
        talosOnLocalCatalogueChange(second)

        talosAnnounceLocalCatalogueChange('transfer-finished')

        expect(first).toHaveBeenCalledWith('transfer-finished')
        expect(second).toHaveBeenCalledWith('transfer-finished')
    })

    /**
     * Un elenco aggiornato a metà sarebbe peggio di uno fermo, perché non
     * ci sarebbe niente addosso che lo dica.
     */
    it('one listener throwing does not silence the others', () => {
        const broken = vi.fn(() => { throw new Error('boom') })
        const healthy = vi.fn()
        talosOnLocalCatalogueChange(broken)
        talosOnLocalCatalogueChange(healthy)

        expect(() => talosAnnounceLocalCatalogueChange('deleted')).not.toThrow()
        expect(healthy).toHaveBeenCalledWith('deleted')
    })

    it('a released listener stops hearing', () => {
        const listener = vi.fn()
        const release = talosOnLocalCatalogueChange(listener)

        release()
        talosAnnounceLocalCatalogueChange('imported')

        expect(listener).not.toHaveBeenCalled()
    })

    /** Disiscriversi due volte è l'esito normale di una doppia pulizia. */
    it('releasing twice is not an error', () => {
        const release = talosOnLocalCatalogueChange(vi.fn())
        release()
        expect(() => release()).not.toThrow()
    })

    /**
     * Iscriversi durante un annuncio non deve far ricevere QUELL'annuncio: chi
     * è appena arrivato non stava aspettando la notizia in corso, e riceverla
     * lo farebbe rileggere il disco due volte per lo stesso fatto.
     */
    it('a listener added while announcing waits for the next one', () => {
        const late = vi.fn()
        talosOnLocalCatalogueChange(() => { talosOnLocalCatalogueChange(late) })

        talosAnnounceLocalCatalogueChange('transfer-finished')
        expect(late).not.toHaveBeenCalled()

        talosAnnounceLocalCatalogueChange('deleted')
        expect(late).toHaveBeenCalledWith('deleted')
    })
})
