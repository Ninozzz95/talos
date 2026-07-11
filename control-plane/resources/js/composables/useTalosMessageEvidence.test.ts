import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useTalosMessageEvidence } from './useTalosMessageEvidence'
import type { TalosMessage } from '../lib/talosTypes'

function message(id: string, role: TalosMessage['role']): TalosMessage {
    return { id, role, content: id } as TalosMessage
}

describe('useTalosMessageEvidence', () => {
    it('finds the nearest prior user turn and toggles evidence expansion', () => {
        const user = message('user-1', 'user')
        const assistant = message('assistant-1', 'assistant')
        const messages = ref([user, assistant])
        const evidence = useTalosMessageEvidence(messages)

        expect(evidence.previousUserMessageFor(assistant)?.id).toBe(user.id)
        evidence.toggleMessageEvidence(assistant)
        expect(evidence.expandedEvidenceMessageIds.value).toEqual(['assistant-1'])
        evidence.toggleMessageEvidence(assistant)
        expect(evidence.expandedEvidenceMessageIds.value).toEqual([])
    })
})
