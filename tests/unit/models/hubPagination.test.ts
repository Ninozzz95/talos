import { describe, expect, it } from 'vitest'
import { talosNextPageCursor } from '@/lib/models/huggingFace'

/**
 * C45-RED-19J — la ricerca modelli non finisce a venti.
 *
 * Owner 2026-08-06: «non possiamo dare solo 20 risultati, è da pazzi». Il tetto
 * era `searchModels(query, 20, sort)`: una pagina sola, e tutto il resto del Hub
 * invisibile.
 *
 * **MISURATO contro l'API vera lo stesso giorno**: il Hub non accetta `skip` né
 * `offset` sui modelli — pagina con un CURSORE che mette lui nell'header `Link`.
 * Avrei indovinato sbagliato, ed è per questo che il lettore di quell'header ha
 * una prova sua.
 */
describe('C45-RED-19J hub cursor pagination', () => {
    /** La forma esatta osservata sull'API il 2026-08-06. */
    const REALE = '<https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1'
        + '&limit=3&cursor=eyIkb3IiOlt7ImRvd25sb2FkcyI6NDY4NTM2OH1dfQ>; rel="next"'

    it('reads the cursor out of the real Link header', () => {
        expect(talosNextPageCursor(REALE)).toBe('eyIkb3IiOlt7ImRvd25sb2FkcyI6NDY4NTM2OH1dfQ')
    })

    /**
     * Assente = ultima pagina, e va detto. Non è un guasto: uno scorrimento che
     * non dichiara mai la fine lascia tirare in basso per sempre una lista che
     * non cresce più.
     */
    it('says «no next page» rather than failing', () => {
        expect(talosNextPageCursor(null)).toBeNull()
        expect(talosNextPageCursor(undefined)).toBeNull()
        expect(talosNextPageCursor('')).toBeNull()
    })

    /** Un header con più relazioni: si prende `next`, non la prima che capita. */
    it('picks next among several relations', () => {
        const header = '<https://h.co/api/models?cursor=PRIMA>; rel="prev", '
            + '<https://h.co/api/models?cursor=DOPO>; rel="next"'
        expect(talosNextPageCursor(header)).toBe('DOPO')
    })

    it('ignores a next relation that carries no cursor', () => {
        expect(talosNextPageCursor('<https://h.co/api/models?limit=50>; rel="next"')).toBeNull()
    })

    /** Le virgolette attorno a `next` sono facoltative nella RFC 8288. */
    it('accepts an unquoted relation', () => {
        expect(talosNextPageCursor('<https://h.co/api/models?cursor=X>; rel=next')).toBe('X')
    })

    /**
     * Un URL che non si analizza è una pagina che non si può chiedere: vale
     * come fine elenco, non come eccezione buttata addosso a chi scorre.
     */
    it('treats an unparseable url as the end, without throwing', () => {
        expect(() => talosNextPageCursor('<::nonsense::>; rel="next"')).not.toThrow()
        expect(talosNextPageCursor('<::nonsense::>; rel="next"')).toBeNull()
    })
})
