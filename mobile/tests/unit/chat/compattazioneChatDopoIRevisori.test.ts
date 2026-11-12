import { describe, expect, it } from 'vitest'
import type { ChatTurn } from '@/stores/chat'
import type { TalosLocalChatMessage } from '@/repositories/chatRepository'
import {
    TALOS_METADATA_COMPATTAZIONE,
    nucleoVersoTurni,
    richiestaDiRiassunto,
    riassuntiVeriDellaChat,
    stimaDellaRichiestaDelPc,
    turniVersoNucleo,
} from '@/lib/chat/compattazioneChat'
import { medianaRiassunti, stimaConPezziDelPc, stimaDegliAttrezziDelPc } from '@/lib/kernel/compattazione'

/*
 * Telefono 0.1.48 — il giro dopo i tre revisori (giudice v1535 e v1536): i pezzi della chat che i mutanti vivi lasciavano scoperti.
 */
const riga = (id: string, riassuntoVero?: unknown) => ({
    id, role: 'system', content: '', state: 'persisted',
    metadata: riassuntoVero === undefined ? {} : { [TALOS_METADATA_COMPATTAZIONE]: { riassuntoVero } },
}) as unknown as TalosLocalChatMessage

describe('Telefono 0.1.48 — la chat dopo i revisori', () => {
    // Mutante C4 (revisore C): `nucleoVersoTurni` che ignora il testo accorciato rimanderebbe al modello l'uscita intera.
    it('DC-01 un testo accorciato nel nucleo torna col testo nuovo e coi campi del turno', () => {
        const turni: ChatTurn[] = [
            { role: 'user', content: 'leggi' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'notes_list', arguments: '{}' }] },
            { role: 'tool', content: 'uscita lunga '.repeat(200), toolCallId: 'c1', toolName: 'notes_list' },
        ]
        const nucleo = turniVersoNucleo(turni)
        nucleo[2] = { ...nucleo[2]!, content: '[tolta per la finestra]' }
        const tornati = nucleoVersoTurni(nucleo)
        expect(tornati[2]).toEqual({ role: 'tool', content: '[tolta per la finestra]', toolCallId: 'c1', toolName: 'notes_list' })
        expect(tornati[0]).toBe(turni[0])
        expect(tornati[1]).toBe(turni[1])
    })

    // Mutanti C7 e B6: la mediana della chat viene da TUTTE le righe (le ultime nove), non dall'ultima.
    it('DC-02 i riassunti veri della chat da più righe, nell\'ordine, e la loro mediana', () => {
        const righe = [riga('a', 120), riga('b'), riga('c', 900), riga('d', 'rotta'), riga('e', 300)]
        expect(riassuntiVeriDellaChat(righe)).toEqual([120, 900, 300])
        expect(medianaRiassunti(riassuntiVeriDellaChat(righe))).toBe(300)
        expect(medianaRiassunti(riassuntiVeriDellaChat(righe.slice(0, 3)))).toBe(510)
        const dodici = Array.from({ length: 12 }, (_, i) => riga(`r${i}`, i + 1))
        expect(riassuntiVeriDellaChat(dodici)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
    })

    it('DC-03 la stima del PC della richiesta intera: sistema, turni e schemi degli attrezzi (il denominatore di k)', () => {
        const turni: ChatTurn[] = [{ role: 'user', content: 'ciao '.repeat(40) }, { role: 'assistant', content: 'é'.repeat(10) }]
        const attrezzi = [{ type: 'function', function: { name: 'notes_list', description: 'd'.repeat(400) } }]
        expect(stimaDellaRichiestaDelPc({ turni, system: 'Sistema.', tools: attrezzi }))
            .toBe(stimaConPezziDelPc([{ role: 'system', content: 'Sistema.' }, ...turniVersoNucleo(turni)]) + stimaDegliAttrezziDelPc(attrezzi))
        expect(stimaDellaRichiestaDelPc({ turni })).toBe(stimaConPezziDelPc(turniVersoNucleo(turni)))
    })

    // Giudice v1536: il tetto dello spazio libero arriva anche alla richiesta in coda, e vince sulle parole di Gallery.
    it('DC-04 la richiesta in coda col tetto in parole: il minore fra il tetto e le parole dei token rimasti', () => {
        const parti = { testa: [], mezzo: [], coda: [], richiesteLetterali: [], tagliabile: true } as never
        const ultimoGiro = { effort: 'off', thinking: false } as never
        const parole = (r: ReturnType<typeof richiestaDiRiassunto>) => Number(/less than (\d+) words/.exec(String(r.turns.at(-1)?.content))?.[1])
        expect(parole(richiestaDiRiassunto({ provider: 'local', turni: [], parti, ultimoGiro, tokenRimasti: 1_000 }))).toBe(750)
        expect(parole(richiestaDiRiassunto({ provider: 'local', turni: [], parti, ultimoGiro, tokenRimasti: 1_000, paroleMassime: 120 }))).toBe(120)
        expect(parole(richiestaDiRiassunto({ provider: 'local', turni: [], parti, ultimoGiro, tokenRimasti: 100, paroleMassime: 120 }))).toBe(75)
    })
})
