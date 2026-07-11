import { ref, type Ref } from 'vue'
import type { TalosMessage } from '../lib/talosTypes'

export function useTalosMessageEvidence(messages: Ref<TalosMessage[]>) {
    const expandedEvidenceMessageIds = ref<string[]>([])

    function toggleMessageEvidence(message: TalosMessage) {
        expandedEvidenceMessageIds.value = expandedEvidenceMessageIds.value.includes(message.id)
            ? expandedEvidenceMessageIds.value.filter((id) => id !== message.id)
            : [...expandedEvidenceMessageIds.value, message.id]
    }

    function previousUserMessageFor(message: TalosMessage) {
        const index = messages.value.findIndex((item) => item.id === message.id)
        if (index <= 0) return null

        for (let candidate = index - 1; candidate >= 0; candidate--) {
            if (messages.value[candidate].role === 'user') return messages.value[candidate]
        }

        return null
    }

    return { expandedEvidenceMessageIds, toggleMessageEvidence, previousUserMessageFor }
}
