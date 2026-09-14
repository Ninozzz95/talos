import { describe, expect, it } from 'vitest'
import { talosActivityToolName, talosTurnToolActivities } from '@/lib/chat/turnActivities'

/**
 * Owner 2026-09-13 — «Dettagli esecuzione» diceva «Nessun attrezzo usato» su una
 * risposta con la ricerca web: le attivita' si salvano con message_id nullo.
 */
const messages = [
    { id: 'u1', role: 'user', created_at: '2026-09-13T10:00:00.000Z' },
    { id: 'a1', role: 'assistant', created_at: '2026-09-13T10:00:05.000Z' },
    { id: 'u2', role: 'user', created_at: '2026-09-13T10:05:00.000Z' },
    { id: 't2', role: 'tool', created_at: '2026-09-13T10:05:02.000Z' },
    { id: 'a2', role: 'assistant', created_at: '2026-09-13T10:05:09.000Z' },
]
const activity = (id: string, created_at: string, operation = 'tool.web_search', message_id: string | null = null) =>
    ({ id, message_id, operation, created_at })
const activities = [
    activity('prima', '2026-09-13T10:00:01.000Z'),
    activity('dopo', '2026-09-13T10:05:01.000Z'),
    activity('dopo-ancora', '2026-09-13T10:06:00.000Z', 'tool.library_read'),
    activity('permesso', '2026-09-13T10:05:01.500Z', 'tool.authorization'),
]
const ids = (list: { id: string }[] | null) => list?.map((a) => a.id) ?? null

describe('talosTurnToolActivities', () => {
    it('una risposta con attrezzi a message_id nullo li trova nella sua coppia', () => {
        expect(ids(talosTurnToolActivities(messages, activities, 'a2'))).toEqual(['dopo', 'dopo-ancora'])
    })

    it('la stessa coppia, chiesta dalla domanda, da lo stesso elenco', () => {
        expect(ids(talosTurnToolActivities(messages, activities, 'u2'))).toEqual(['dopo', 'dopo-ancora'])
    })

    /** ⛔ Il verso contrario: la coppia prima NON prende gli attrezzi della coppia dopo. */
    it('la prima coppia si ferma alla domanda successiva', () => {
        expect(ids(talosTurnToolActivities(messages, activities, 'a1'))).toEqual(['prima'])
    })

    it("un'attivita' legata a un messaggio vale per la sua coppia, a qualunque ora", () => {
        const legata = [activity('legata', '2026-09-13T10:07:00.000Z', 'tool.notes_create', 'a1')]
        expect(ids(talosTurnToolActivities(messages, legata, 'a1'))).toEqual(['legata'])
        expect(ids(talosTurnToolActivities(messages, legata, 'a2'))).toEqual([])
    })

    it('le richieste di autorizzazione non sono contate come attrezzi', () => {
        expect(ids(talosTurnToolActivities(messages, activities, 'a2'))).not.toContain('permesso')
    })

    /** ⛔ Chi non sa, lo dice: un messaggio che non e' in vista da null, non un elenco vuoto. */
    it('un messaggio sconosciuto da null e non «nessun attrezzo»', () => {
        expect(talosTurnToolActivities(messages, activities, 'non-esiste')).toBeNull()
    })
})

describe('talosActivityToolName', () => {
    it('toglie il prefisso tool. e lascia stare il resto', () => {
        expect(talosActivityToolName('tool.web_search')).toBe('web_search')
        expect(talosActivityToolName('browser.open')).toBe('browser.open')
    })
})
