import { describe, expect, it } from 'vitest'
import { talosSidebarSezioneAttiva } from '@/lib/sidebarSection'

describe('voce evidenziata della barra laterale', () => {
    it('BARRA-SEZ-01 le pagine di dettaglio contano per la loro sezione (comportamento già in uso)', () => {
        expect(talosSidebarSezioneAttiva('chat')).toBe('chats')
        expect(talosSidebarSezioneAttiva('chats')).toBe('chats')
        expect(talosSidebarSezioneAttiva('settings-models-local')).toBe('settings-models')
        expect(talosSidebarSezioneAttiva('task-detail')).toBe('tasks')
        expect(talosSidebarSezioneAttiva('note-detail')).toBe('notes')
        expect(talosSidebarSezioneAttiva('harness-session')).toBe('harness')
        expect(talosSidebarSezioneAttiva('doctor')).toBe('doctor')
        expect(talosSidebarSezioneAttiva('settings')).toBeNull()
    })

    it('K4E-BARRA-01 nel Codice r4 la voce «Codice» è evidenziata, come «Note» in Note (visto sul Pad, 17/10)', () => {
        expect(talosSidebarSezioneAttiva('codice-r4')).toBe('harness')
    })
})
