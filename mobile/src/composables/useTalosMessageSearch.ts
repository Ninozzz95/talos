import { computed, ref, watch, type Ref, type WatchSource } from 'vue'
import type { TalosChatRepository, TalosMessageSearchHit } from '@/repositories/chatRepository'
import { scoreTalosLibrarySearchFields, talosLibrarySearchTerms } from '@/lib/librarySearchText'

/** Shared by the conversation list and global search; stale reads never replace a newer query. */
export function useTalosMessageSearch(
    query: Ref<string>,
    search: TalosChatRepository['searchMessages'],
    revision: WatchSource = () => undefined,
) {
    const hits = ref<TalosMessageSearchHit[]>([])
    const pending = ref(false)
    const failed = ref(false)
    watch([query, revision], async ([value], _previous, onCleanup) => {
        let current = true
        onCleanup(() => { current = false })
        hits.value = []
        failed.value = false
        const terms = talosLibrarySearchTerms(value)
        pending.value = terms.length > 0
        if (!terms.length) return
        try {
            const matches = await Promise.all(terms.map((term) => search(term)))
            if (current) hits.value = [...new Map(matches.flat().map((hit) => [hit.messageId, hit])).values()]
        } catch {
            if (current) failed.value = true
        } finally {
            if (current) pending.value = false
        }
    }, { immediate: true })
    const bySession = computed(() => {
        const result = new Map<string, string[]>()
        for (const hit of hits.value) {
            const excerpts = result.get(hit.sessionId) ?? []
            excerpts.push(hit.excerpt)
            result.set(hit.sessionId, excerpts)
        }
        for (const excerpts of result.values()) excerpts.sort((a, b) =>
            scoreTalosLibrarySearchFields(query.value, [{ text: b }])
            - scoreTalosLibrarySearchFields(query.value, [{ text: a }]))
        return result
    })
    return { bySession, pending, failed }
}
