import { describe, expect, it } from 'vitest'
import {
    TALOS_FILTRI_STATO_CHAT,
    talosFacetteAttive,
    talosModelloDellaChat,
    talosNomeCortoModello,
    talosNelPeriodo,
    talosOrdinaChat,
    talosPassaFacette,
    talosSessioniConDocumentiGenerati,
    talosStatoNelFiltro,
    type TalosFacetteChat,
} from '@/lib/chat/filtriElencoChat'
import type { TalosLocalChatSession, TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * A3-84 (owner 24/09 sera, decisioni 25/09) — l'elenco delle chat con la grammatica delle stazioni: schede di stato,
 * e nel foglio periodo, contenuto, modello e ordine. Logica pura: la schermata la usa, qui si prova da sola.
 */

function sessione(parziale: Partial<TalosLocalChatSession> & { id: string }): TalosLocalChatSession {
    return {
        title: parziale.id, surface: 'chat', mode: 'verified_execution', persistence_mode: 'persistent',
        active_model_profile_id: null, metadata: {}, created_at: '2026-09-01T10:00:00.000Z',
        updated_at: '2026-09-01T10:00:00.000Z', has_messages: true, last_message: null,
        ...parziale,
    }
}

const NESSUNA: TalosFacetteChat = { periodo: 'sempre', contenuto: 'tutte', modello: null }

describe('A3-84 · schede di stato', () => {
    it('ELENCO-01 le schede sono le quattro dell\'owner più Tutte, in quest\'ordine', () => {
        expect(TALOS_FILTRI_STATO_CHAT).toEqual(['tutte', 'in-corso', 'in-coda', 'in-pausa', 'concluse'])
    })

    it('ELENCO-02 ogni scheda prende il suo stato; aspetta te, fallite e interrotte stanno solo in Tutte', () => {
        expect(talosStatoNelFiltro('in-corso', 'in-corso')).toBe(true)
        expect(talosStatoNelFiltro('in-coda', 'in-coda')).toBe(true)
        expect(talosStatoNelFiltro('in-pausa', 'in-pausa')).toBe(true)
        expect(talosStatoNelFiltro('conclusa', 'concluse')).toBe(true)
        expect(talosStatoNelFiltro('in-pausa', 'in-coda')).toBe(false)
        for (const stato of ['aspetta-te', 'fallita', 'interrotta', 'vuota'] as const) {
            expect(talosStatoNelFiltro(stato, 'tutte')).toBe(true)
            for (const filtro of ['in-corso', 'in-coda', 'in-pausa', 'concluse'] as const) {
                expect(talosStatoNelFiltro(stato, filtro)).toBe(false)
            }
        }
    })
})

describe('A3-84 · periodo, dalla mezzanotte locale', () => {
    // Le 00:10 del 25/09 in ora locale: il confine che si sbaglia solo di notte.
    const adesso = new Date(2026, 8, 25, 0, 10)
    const alle = (giorno: number, ora: number, minuti = 0) => new Date(2026, 8, giorno, ora, minuti).toISOString()

    it('ELENCO-03 «Oggi» è il giorno di calendario: le 23:50 di ieri non sono oggi', () => {
        expect(talosNelPeriodo(alle(25, 0, 5), 'oggi', adesso)).toBe(true)
        expect(talosNelPeriodo(alle(24, 23, 50), 'oggi', adesso)).toBe(false)
    })

    it('ELENCO-04 ultimi 7 e 30 giorni come le fasce; «più vecchie» è il resto, senza sovrapposizioni', () => {
        expect(talosNelPeriodo(alle(18, 9), '7g', adesso)).toBe(true)
        expect(talosNelPeriodo(alle(17, 9), '7g', adesso)).toBe(false)
        expect(talosNelPeriodo(alle(17, 9), '30g', adesso)).toBe(true)
        expect(talosNelPeriodo(new Date(2026, 7, 26, 9).toISOString(), '30g', adesso)).toBe(true)
        expect(talosNelPeriodo(new Date(2026, 7, 25, 9).toISOString(), '30g', adesso)).toBe(false)
        expect(talosNelPeriodo(new Date(2026, 7, 25, 9).toISOString(), 'oltre-30g', adesso)).toBe(true)
        expect(talosNelPeriodo(alle(17, 9), 'oltre-30g', adesso)).toBe(false)
    })

    it('ELENCO-05 «Sempre» prende tutto; una data mancante o storta la prende solo «Sempre»', () => {
        expect(talosNelPeriodo(alle(1, 1), 'sempre', adesso)).toBe(true)
        expect(talosNelPeriodo('non è una data', 'sempre', adesso)).toBe(true)
        expect(talosNelPeriodo('non è una data', 'oggi', adesso)).toBe(false)
        expect(talosNelPeriodo(null, 'oltre-30g', adesso)).toBe(false)
    })
})

describe('A3-84 · contenuto e modello', () => {
    const adesso = new Date(2026, 8, 25, 12)
    const fonti = { conAllegati: new Set(['a']), conGenerati: new Set(['g']), adesso }

    it('ELENCO-06 contenuto: con allegati, con documenti generati, o tutte', () => {
        const a = sessione({ id: 'a' })
        const g = sessione({ id: 'g' })
        expect(talosPassaFacette(a, { ...NESSUNA, contenuto: 'allegati' }, fonti)).toBe(true)
        expect(talosPassaFacette(g, { ...NESSUNA, contenuto: 'allegati' }, fonti)).toBe(false)
        expect(talosPassaFacette(g, { ...NESSUNA, contenuto: 'generati' }, fonti)).toBe(true)
        expect(talosPassaFacette(a, NESSUNA, fonti)).toBe(true)
    })

    it('ELENCO-07 il modello è quello dell\'ULTIMA RISPOSTA: un ultimo messaggio dell\'utente non ne ha', () => {
        const risposta = sessione({ id: 'r', last_message: { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: 'glm' } })
        const domanda = sessione({ id: 'd', last_message: { role: 'user', state: 'persisted', interrupted: false, model_profile_id: null }, active_model_profile_id: 'glm' })
        expect(talosModelloDellaChat(risposta)).toBe('glm')
        expect(talosModelloDellaChat(domanda)).toBeNull()
        expect(talosPassaFacette(risposta, { ...NESSUNA, modello: 'glm' }, fonti)).toBe(true)
        expect(talosPassaFacette(domanda, { ...NESSUNA, modello: 'glm' }, fonti)).toBe(false)
    })

    it('ELENCO-08 le facette si sommano; il numero sul pulsante conta solo quelle accese', () => {
        const s = sessione({ id: 'a', updated_at: new Date(2026, 8, 25, 9).toISOString(), last_message: { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: 'glm' } })
        const tutte: TalosFacetteChat = { periodo: 'oggi', contenuto: 'allegati', modello: 'glm' }
        expect(talosPassaFacette(s, tutte, fonti)).toBe(true)
        expect(talosPassaFacette(s, { ...tutte, modello: 'altro' }, fonti)).toBe(false)
        expect(talosFacetteAttive(NESSUNA)).toBe(0)
        expect(talosFacetteAttive(tutte)).toBe(3)
        expect(talosFacetteAttive({ ...NESSUNA, periodo: '7g' })).toBe(1)
    })

    it('ELENCO-09 documenti generati: solo i file NATI in quella chat e non le pagine lette in ricerca', () => {
        const file = (id: string, metadata: Record<string, unknown>) => ({ id, metadata }) as unknown as TalosLocalVaultFile
        const insieme = talosSessioniConDocumentiGenerati([
            file('1', { origin: 'generated', origin_session_id: 'g' }),
            file('2', { origin: 'upload', origin_session_id: 'u' }),
            file('3', { origin: 'generated', origin_session_id: 'w', kind: 'web_source' }),
            file('4', { origin: 'generated' }),
        ])
        expect([...insieme]).toEqual(['g'])
    })
})

describe('A3-84 · ordine', () => {
    const titolo = (s: { title: string }) => s.title
    const lista = [
        sessione({ id: 'b', title: 'banana', created_at: '2026-09-02T10:00:00.000Z', updated_at: '2026-09-20T10:00:00.000Z' }),
        sessione({ id: 'a', title: 'Albero', created_at: '2026-09-03T10:00:00.000Z', updated_at: '2026-09-10T10:00:00.000Z' }),
        sessione({ id: 'c', title: 'ciliegia', created_at: '2026-09-05T10:00:00.000Z', updated_at: '2026-09-24T10:00:00.000Z' }),
    ]

    it('ELENCO-10 creazione: dalla più nuova; titolo: A–Z senza badare alle maiuscole', () => {
        expect(talosOrdinaChat(lista, 'creazione', titolo).map((s) => s.id)).toEqual(['c', 'a', 'b'])
        expect(talosOrdinaChat(lista, 'titolo', titolo).map((s) => s.id)).toEqual(['a', 'b', 'c'])
    })

    it('ELENCO-11 attività: l\'ordine che arriva (quello di sempre, `orderChatSessions`) resta com\'è', () => {
        expect(talosOrdinaChat(lista, 'attivita', titolo).map((s) => s.id)).toEqual(['b', 'a', 'c'])
    })
})

describe('A3-84 · il nome corto del modello', () => {
    it('ELENCO-12 senza il prefisso del fornitore, come il desktop (col prefisso il nome si troncava)', () => {
        expect(talosNomeCortoModello('Z.ai: GLM 5.3 Flash')).toBe('GLM 5.3 Flash')
        expect(talosNomeCortoModello('GLM 5.3 Flash')).toBe('GLM 5.3 Flash')
        // Un «:» dentro il nome (una versione, un'etichetta lunga) non si taglia.
        expect(talosNomeCortoModello('qwen3:8b')).toBe('qwen3:8b')
        expect(talosNomeCortoModello('  ')).toBe('')
    })
})
