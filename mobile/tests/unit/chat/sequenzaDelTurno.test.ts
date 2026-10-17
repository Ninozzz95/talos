import { describe, expect, it } from 'vitest'
import {
    TALOS_METADATA_SEQUENZA,
    talosSegmentiDaiConfini,
    talosSequenzaDaMetadata,
    talosSequenzaDaSalvare,
    type TalosConfineDelGiro,
} from '@/lib/chat/sequenzaDelTurno'

/**
 * N13 (owner 02/10, decisioni del 09/10): ragionamento, righe degli attrezzi e testo nell'ordine in cui sono successi,
 * mentre scrive e dopo il reload. Le righe degli attrezzi restano al loro posto; un ragionamento per giro.
 * Riferimento: PocketPal `steps` (Message.tsx:340-385) — ragionamento, testo, attrezzi, per giro.
 */
const ricerca = [{ name: 'web_search', detail: 'meteo Messina' }]
const lettura = [{ name: 'web_read', detail: 'ilmeteo.it' }]

describe('i segmenti nascono dai confini dei giri (N13)', () => {
    it('SEQ-01 — ragionamento → attrezzo → testo: la riga sta SOTTO il ragionamento', () => {
        const confini: TalosConfineDelGiro[] = [{ testo: 0, ragionamento: 'Cerco il meteo'.length, attrezzi: ricerca }]
        expect(talosSegmentiDaiConfini(confini, 'Domani piove.', 'Cerco il meteo')).toEqual([
            { tipo: 'ragionamento', testo: 'Cerco il meteo' },
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'testo', testo: 'Domani piove.' },
        ])
    })

    it('SEQ-02 — testo → attrezzo → testo → attrezzo → testo: ogni riga sotto il testo che la precede', () => {
        const testo = 'Guardo il meteo. Leggo la pagina. Domani piove.'
        const confini: TalosConfineDelGiro[] = [
            { testo: 'Guardo il meteo. '.length, ragionamento: 0, attrezzi: ricerca },
            { testo: 'Guardo il meteo. Leggo la pagina. '.length, ragionamento: 0, attrezzi: lettura },
        ]
        expect(talosSegmentiDaiConfini(confini, testo, '')).toEqual([
            { tipo: 'testo', testo: 'Guardo il meteo. ' },
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'testo', testo: 'Leggo la pagina. ' },
            { tipo: 'attrezzi', attrezzi: lettura },
            { tipo: 'testo', testo: 'Domani piove.' },
        ])
    })

    it('SEQ-03 — un ragionamento per giro, ciascuno al suo posto', () => {
        const ragionamento = 'Primo pensiero.Secondo pensiero.'
        const confini: TalosConfineDelGiro[] = [{ testo: 0, ragionamento: 15, attrezzi: ricerca }]
        expect(talosSegmentiDaiConfini(confini, 'Fatto.', ragionamento)).toEqual([
            { tipo: 'ragionamento', testo: 'Primo pensiero.' },
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'ragionamento', testo: 'Secondo pensiero.' },
            { tipo: 'testo', testo: 'Fatto.' },
        ])
    })

    it('SEQ-04 — attrezzi in fila senza testo in mezzo: due righe, nessun blocco vuoto', () => {
        const confini: TalosConfineDelGiro[] = [
            { testo: 0, ragionamento: 0, attrezzi: ricerca },
            { testo: 0, ragionamento: 0, attrezzi: lettura },
        ]
        expect(talosSegmentiDaiConfini(confini, '', '')).toEqual([
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'attrezzi', attrezzi: lettura },
        ])
    })

    it('SEQ-05 — confini oltre la lunghezza (ragionamento azzerato dal trasporto) non rompono niente', () => {
        const confini: TalosConfineDelGiro[] = [{ testo: 0, ragionamento: 400, attrezzi: ricerca }]
        expect(talosSegmentiDaiConfini(confini, 'Ok.', 'corto')).toEqual([
            { tipo: 'ragionamento', testo: 'corto' },
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'testo', testo: 'Ok.' },
        ])
    })
})

describe('quello che si salva nel messaggio (N13)', () => {
    const pulisci = (testo: string) => testo.trim()

    it('SEQ-06 — senza giri di attrezzi non si salva niente: il messaggio resta come oggi', () => {
        expect(talosSequenzaDaSalvare([], 'Ciao.', 'pensavo', 'Ciao.', pulisci)).toBeNull()
    })

    it('SEQ-07 — con giri di attrezzi si salva la sequenza, col ragionamento pulito', () => {
        const confini: TalosConfineDelGiro[] = [{ testo: 0, ragionamento: 14, attrezzi: ricerca }]
        expect(talosSequenzaDaSalvare(confini, 'Domani piove.', '  Cerco meteo   ', 'Domani piove.', pulisci)).toEqual([
            { tipo: 'ragionamento', testo: 'Cerco meteo' },
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'testo', testo: 'Domani piove.' },
        ])
    })

    it('SEQ-08 — testo finale diverso da quello arrivato (preambolo falso tolto): un solo testo in fondo, il resto al suo posto', () => {
        const confini: TalosConfineDelGiro[] = [{ testo: 24, ragionamento: 0, attrezzi: ricerca }]
        const arrivato = 'Sveglia delle 7 tolta.\n\nHo mandato il comando.'
        expect(talosSequenzaDaSalvare(confini, arrivato, '', 'Ho mandato il comando.', pulisci)).toEqual([
            { tipo: 'attrezzi', attrezzi: ricerca },
            { tipo: 'testo', testo: 'Ho mandato il comando.' },
        ])
    })

    it('SEQ-09 — gli spazi fra i giri non contano per la riconciliazione', () => {
        const confini: TalosConfineDelGiro[] = [{ testo: 7, ragionamento: 0, attrezzi: ricerca }]
        const salvata = talosSequenzaDaSalvare(confini, 'Guardo.Trovato.', '', 'Guardo.\n\nTrovato.', pulisci)
        expect(salvata?.filter((segmento) => segmento.tipo === 'testo')).toEqual([
            { tipo: 'testo', testo: 'Guardo.' },
            { tipo: 'testo', testo: 'Trovato.' },
        ])
    })
})

describe('la sequenza riletta dal metadata (N13)', () => {
    it('SEQ-10 — una sequenza salvata si rilegge uguale', () => {
        const sequenza = [
            { tipo: 'ragionamento', testo: 'Cerco' },
            { tipo: 'attrezzi', attrezzi: [{ name: 'web_search', detail: null }] },
            { tipo: 'testo', testo: 'Piove.' },
        ]
        expect(TALOS_METADATA_SEQUENZA).toBe('talos_sequenza')
        expect(talosSequenzaDaMetadata(sequenza)).toEqual(sequenza)
    })

    it('SEQ-11 — dati storti non diventano interfaccia: null (si mostra il testo come oggi)', () => {
        for (const storto of [null, 'testo', 42, {}, [{ tipo: 'boh' }], [{ tipo: 'testo', testo: 3 }],
            [{ tipo: 'attrezzi', attrezzi: 'web' }], [{ tipo: 'attrezzi', attrezzi: [{ name: 7 }] }], []]) {
            expect(talosSequenzaDaMetadata(storto)).toBeNull()
        }
    })

    /*
     * ⛔ SEQ-REG-PAD-01 (Pad, 11/10/2026, LFM2.5-2.6B-QAD-Q4_0, ripresa dopo il permesso): il modello locale ha chiesto un attrezzo
     * SENZA NOME. Mentre scriveva la riga era vuota; a risposta finita la sequenza intera veniva rifiutata alla rilettura e le righe
     * sparivano tutte, proprio il difetto che N13 cura.
     */
    it('SEQ-12 — un attrezzo senza nome non si salva; un giro fatto solo di attrezzi senza nome non lascia una riga vuota', () => {
        const confini: TalosConfineDelGiro[] = [
            { testo: 0, ragionamento: 0, attrezzi: [{ name: 'web_search', detail: 'meteo' }, { name: '  ', detail: null }] },
            { testo: 0, ragionamento: 'Penso.'.length, attrezzi: [{ name: '', detail: null }] },
        ]
        expect(talosSequenzaDaSalvare(confini, 'Fatto.', 'Penso.Ancora.', 'Fatto.', (testo) => testo)).toEqual([
            { tipo: 'attrezzi', attrezzi: [{ name: 'web_search', detail: 'meteo' }] },
            { tipo: 'ragionamento', testo: 'Penso.' },
            { tipo: 'ragionamento', testo: 'Ancora.' },
            { tipo: 'testo', testo: 'Fatto.' },
        ])
    })

    it('SEQ-13 — rilettura: un attrezzo storto si salta, il resto della sequenza resta (non sparisce tutto)', () => {
        const salvata = [
            { tipo: 'attrezzi', attrezzi: [{ name: 'web_search', detail: 'meteo' }] },
            { tipo: 'ragionamento', testo: 'Penso.' },
            { tipo: 'attrezzi', attrezzi: [{ name: '', detail: null }] },
            { tipo: 'attrezzi', attrezzi: [{ name: 7 }, { name: 'web_read', detail: 'ilmeteo.it' }] },
            { tipo: 'testo', testo: 'Fatto.' },
        ]
        expect(talosSequenzaDaMetadata(salvata)).toEqual([
            { tipo: 'attrezzi', attrezzi: [{ name: 'web_search', detail: 'meteo' }] },
            { tipo: 'ragionamento', testo: 'Penso.' },
            { tipo: 'attrezzi', attrezzi: [{ name: 'web_read', detail: 'ilmeteo.it' }] },
            { tipo: 'testo', testo: 'Fatto.' },
        ])
    })
})
