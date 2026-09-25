import { describe, expect, it } from 'vitest'
import { talosEsitoAutorizzazione } from '@/lib/chat/esitoAutorizzazione'
import type { TalosLocalToolActivity } from '@/repositories/chatRepository'

/**
 * GESTITA-01 (owner 25/09/2026, «riga compatta»): dopo «Consenti» la risposta sospesa restava una bolla con la sola
 * scheda «La richiesta di autorizzazione è stata gestita.». L'esito è già salvato nell'attività `tool.authorization`
 * (stesso id del checkpoint, le richieste con la decisione): da lì si legge «Permesso concesso/negato: <strumento>».
 */
function attivita(id: string, richieste: Array<{ tool: string, decision: string }>, operation = 'tool.authorization'): TalosLocalToolActivity {
    return {
        id, session_id: 's', message_id: null, operation, status: 'succeeded',
        payload: { contract: 'x', checkpoint: { id, requests: richieste.map((r, i) => ({ id: `r${i}`, ...r })) } },
        evidence: {}, created_at: '2026-09-25T10:00:00.000Z', updated_at: '2026-09-25T10:00:00.000Z',
    }
}

describe('GESTITA-01 · esito di una richiesta di permesso', () => {
    it('ogni strumento con la sua decisione, concesso o negato', () => {
        const esito = talosEsitoAutorizzazione([
            attivita('cp-1', [{ tool: 'document_create', decision: 'allow_once' }, { tool: 'web_fetch', decision: 'deny' }]),
        ], 'cp-1')
        expect(esito).toEqual([
            { tool: 'document_create', concesso: true },
            { tool: 'web_fetch', concesso: false },
        ])
    })

    it('tutte le forme del sì contano come concesso', () => {
        for (const decision of ['allow_once', 'allow_turn', 'always_allow']) {
            expect(talosEsitoAutorizzazione([attivita('cp', [{ tool: 't', decision }])], 'cp')).toEqual([{ tool: 't', concesso: true }])
        }
    })

    it('ancora in attesa, attività di un altro tipo, id che non c\'è, dati storti: nessun esito, mai inventato', () => {
        expect(talosEsitoAutorizzazione([attivita('cp', [{ tool: 't', decision: 'pending' }])], 'cp')).toBeNull()
        expect(talosEsitoAutorizzazione([attivita('cp', [{ tool: 't', decision: 'allow_once' }], 'browser.navigate')], 'cp')).toBeNull()
        expect(talosEsitoAutorizzazione([attivita('altro', [{ tool: 't', decision: 'allow_once' }])], 'cp')).toBeNull()
        const storta = { ...attivita('cp', []), payload: { checkpoint: { requests: 'no' } } } as TalosLocalToolActivity
        expect(talosEsitoAutorizzazione([storta], 'cp')).toBeNull()
    })
})
