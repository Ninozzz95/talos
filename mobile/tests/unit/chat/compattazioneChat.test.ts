import { describe, expect, it } from 'vitest'
import type { ChatTurn } from '@/stores/chat'
import type { TalosLocalChatMessage } from '@/repositories/chatRepository'
import { creaRecord, dividiPerCompattazione } from '@/lib/kernel/compattazione'
import {
    TALOS_METADATA_COMPATTAZIONE,
    TALOS_METADATA_COMPATTAZIONE_ANNULLATA,
    applicaCompattazioneChat,
    compattazioneAttiva,
    decidiCompattazioneChat,
    nucleoVersoTurni,
    richiestaDiRiassunto,
    richiestaInCoda,
    turniVersoNucleo,
} from '@/lib/chat/compattazioneChat'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — la compattazione nella CHAT, sopra il nucleo condiviso del passo 1. Decisioni
 * dell'owner: «Una riga nella storia» (come `compact_boundary` di Claude Code), riassunto in coda alla conversazione viva
 * per il locale (Gallery `SummarizationContextCompactor.kt:105-150`). Ledger `LEDGER-P4TER-COMPATTATORE-2026-10-02.md`.
 */

let ordinale = 0
function riga(role: TalosLocalChatMessage['role'], content: string, metadata: Record<string, unknown> = {}, id = `m${ordinale + 1}`): TalosLocalChatMessage {
    ordinale += 1
    return {
        id, session_id: 's', role, content, state: 'persisted', model_profile_id: null, run_id: null, ordinal: ordinale,
        metadata, created_at: '2026-10-02T10:00:00.000Z', updated_at: '2026-10-02T10:00:00.000Z',
    }
}

const turni = (n: number): ChatTurn[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `t${i}` }))

describe('P4-ter passo 2 — compattazione della chat, il modulo puro', () => {
    it('CHAT-COMP-01 i turni della chat passano dal nucleo e tornano identici (attrezzi, blocchi del fornitore, allegati)', () => {
        const originali: ChatTurn[] = [
            { role: 'user', content: 'leggi la nota', parts: [{ type: 'text', text: 'leggi la nota' } as never] },
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'notes_read', arguments: '{"id":"n1"}' }], providerBlocks: [{ type: 'server_tool_use' }] },
            { role: 'tool', content: 'testo della nota', toolCallId: 'c1', toolName: 'notes_read' },
            { role: 'assistant', content: 'Ecco la nota.' },
        ]
        const nucleo = turniVersoNucleo(originali)
        expect(nucleo[1]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'notes_read', arguments: '{"id":"n1"}' } }] })
        expect(nucleo[2]).toMatchObject({ role: 'tool', tool_call_id: 'c1', content: 'testo della nota' })
        expect(nucleoVersoTurni(nucleo)).toEqual(originali)
        // Un messaggio nato nel nucleo (il riassunto) diventa un turno semplice.
        expect(nucleoVersoTurni([{ role: 'user', content: 'RIASSUNTO' }])).toEqual([{ role: 'user', content: 'RIASSUNTO' }])
    })

    it('CHAT-COMP-02 la riga di compattazione più recente vale finché una riga «annullata» non la spegne', () => {
        ordinale = 0
        const righe = [riga('user', 'a'), riga('assistant', 'b'), riga('user', 'c'), riga('assistant', 'd')]
        const record = creaRecord({ coveredThrough: 4, riassunto: [{ role: 'user', content: 'RIASSUNTO' }], tokenPrima: 9_000, tokenDopo: 1_200, misura: 'stimato', at: 'a1' })
        const conRiga = [...righe, riga('system', 'Conversazione riassunta · 9.000 → 1.200 token', { [TALOS_METADATA_COMPATTAZIONE]: { record, ultimoCoperto: 'm4', righeCoperte: 4 } })]
        expect(compattazioneAttiva(conRiga)?.record.at).toBe('a1')
        const annullata = [...conRiga, riga('system', 'Riassunto annullato', { [TALOS_METADATA_COMPATTAZIONE_ANNULLATA]: { at: 'a1' } })]
        expect(compattazioneAttiva(annullata)).toBeNull()
    })

    it('CHAT-COMP-03 un messaggio coperto cancellato o riscritto scarta il record (mai un riassunto applicato a un\'altra storia)', () => {
        ordinale = 0
        const righe = [riga('user', 'a'), riga('assistant', 'b'), riga('user', 'c'), riga('assistant', 'd')]
        const record = creaRecord({ coveredThrough: 4, riassunto: [{ role: 'user', content: 'RIASSUNTO' }], at: 'a1' })
        const marca = riga('system', 'x', { [TALOS_METADATA_COMPATTAZIONE]: { record, ultimoCoperto: 'm4', righeCoperte: 4 } })
        expect(compattazioneAttiva([...righe, marca])).not.toBeNull()
        // Un turno coperto cancellato: le righe prima della marca non sono più 4.
        expect(compattazioneAttiva([righe[0]!, righe[1]!, righe[3]!, marca])).toBeNull()
        // L'ultimo messaggio coperto non c'è più (riscritto dal punto prima).
        expect(compattazioneAttiva([righe[0]!, righe[1]!, righe[2]!, riga('assistant', 'd2', {}, 'nuovo'), marca])).toBeNull()
        // Le righe di sistema (errori, altre marche) non contano fra le coperte.
        expect(compattazioneAttiva([righe[0]!, riga('system', 'errore'), righe[1]!, righe[2]!, righe[3]!, marca])).not.toBeNull()
    })

    it('CHAT-COMP-04 applicare il record: i turni coperti diventano il riassunto, i nuovi seguono alla lettera', () => {
        ordinale = 0
        const record = creaRecord({ coveredThrough: 4, riassunto: [{ role: 'user', content: 'RIASSUNTO' }], at: 'a1' })
        const proiettati = applicaCompattazioneChat(turni(7), { record, ultimoCoperto: 'm4', righeCoperte: 4 })
        expect(proiettati).toEqual([{ role: 'user', content: 'RIASSUNTO' }, ...turni(7).slice(4)])
        expect(applicaCompattazioneChat(turni(3), null)).toEqual(turni(3))
    })

    it('CHAT-COMP-05 locale: la richiesta in coda lascia il prefisso IDENTICO (cache del motore) e aggiunge una sola domanda', () => {
        const prima = turni(6)
        const richiesta = richiestaInCoda(prima, { tokenRimasti: 2_000 })
        expect(richiesta.slice(0, 6)).toEqual(prima)
        expect(richiesta).toHaveLength(7)
        expect(richiesta[6]).toMatchObject({ role: 'user' })
        // Parole come Gallery: min(max(rimasti × 0,75, 50), 1000).
        expect(richiesta[6]!.content).toContain('1000')
        expect(richiestaInCoda(prima, { tokenRimasti: 40 })[6]!.content).toContain(' 50 ')
        expect(richiestaInCoda(prima, { tokenRimasti: 800 })[6]!.content).toContain(' 600 ')
    })

    /*
     * ⛔ +1 su Hermes (owner 02/10): verso un fornitore remoto il riassuntore riceve il mezzo OSCURATO. Il turno originale
     * che viaggia nascosto nei messaggi del nucleo non deve tornare indietro qui: riporterebbe il testo in chiaro.
     */
    it('CHAT-COMP-07 fornitore remoto: richiesta separata, senza attrezzi, col mezzo oscurato (nessun segreto torna dal turno nascosto)', () => {
        const conSegreto: ChatTurn[] = [
            { role: 'user', content: 'leggi la configurazione' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'library_read', arguments: '{}' }] },
            { role: 'tool', content: 'OPENROUTER_API_KEY=sk-or-v1-abcdef0123456789abcdef0123456789', toolCallId: 'c1', toolName: 'library_read' },
            ...turni(12),
        ]
        const nucleo = turniVersoNucleo(conSegreto)
        const parti = dividiPerCompattazione(nucleo)
        expect(parti.tagliabile).toBe(true)
        const richiesta = richiestaDiRiassunto({ provider: 'openrouter', turni: conSegreto, parti, ultimoGiro: { system: 'S', tools: [{ name: 'x' }], effort: 'off', thinking: false } })
        expect(richiesta.modo).toBe('separata')
        expect(richiesta.tools).toBeUndefined()
        expect(richiesta.turns.at(-1)).toMatchObject({ role: 'user' })
        expect(richiesta.turns.at(-1)!.content.startsWith('CONTEXT COMPACTION')).toBe(true)
        expect(JSON.stringify(richiesta)).not.toContain('sk-or-v1-abcdef')
        expect(JSON.stringify(richiesta)).toContain('library_read')
    })

    it('CHAT-COMP-08 locale con l\'ultimo giro in memoria: in coda, con LO STESSO sistema e GLI STESSI attrezzi (la cache regge); senza, la richiesta separata', () => {
        const conversazione = turni(14)
        const parti = dividiPerCompattazione(turniVersoNucleo(conversazione))
        const ultimoGiro = { system: 'SISTEMA DEL GIRO', tools: [{ name: 'notes_list' }], effort: 'off', thinking: false, locale: 'it' }
        const inCoda = richiestaDiRiassunto({ provider: 'local', turni: conversazione, parti, ultimoGiro, tokenRimasti: 2_000 })
        expect(inCoda.modo).toBe('in-coda')
        expect(inCoda.system).toBe('SISTEMA DEL GIRO')
        expect(inCoda.tools).toBe(ultimoGiro.tools)
        expect(inCoda.turns.slice(0, 14)).toEqual(conversazione)
        expect(inCoda.turns).toHaveLength(15)
        const aFreddo = richiestaDiRiassunto({ provider: 'local', turni: conversazione, parti, ultimoGiro: null })
        expect(aFreddo.modo).toBe('separata')
        expect(aFreddo.tools).toBeUndefined()
    })

    it('CHAT-COMP-06 la decisione usa la finestra utile del modello e il numero vero dell\'ultima risposta quando c\'è', () => {
        // Finestra 8.192, riserva 1.024 ⇒ soglia 0,75 × 7.168 = 5.376.
        const base = { finestraToken: 8_192, riservaUscita: 1_024, tettoToken: null }
        expect(decidiCompattazioneChat({ ...base, turni: turni(4), promptTokens: 5_000 })).toMatchObject({ scatta: false, soglia: 5_376 })
        expect(decidiCompattazioneChat({ ...base, turni: turni(4), promptTokens: 5_400 })).toMatchObject({ scatta: true, motivo: 'soglia', token: 5_400 })
        // Senza il numero vero, la stima dei turni (pochi caratteri ⇒ niente).
        expect(decidiCompattazioneChat({ ...base, turni: turni(4), promptTokens: null })).toMatchObject({ scatta: false })
    })
})
