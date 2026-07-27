<script setup lang="ts">
import { computed, ref } from 'vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import type { TalosMobileWebSource } from '@/stores/chat'

/**
 * The "Sources" pill under an answer, with the drawer behind it — the shape the
 * owner pointed at in Claude and ChatGPT (2026-07-26).
 *
 * It shows the pages THAT answer rests on, never everything the conversation
 * ever read. A chip that lists the whole chat is decoration; a chip that lists
 * what this reply used is a citation.
 *
 * The site marks are letters, not favicons, on purpose: fetching a favicon means
 * a request to a third party (or to an icon service) for every source, which
 * would quietly break the one thing this feature promises — that only the query
 * leaves the device.
 */
const props = defineProps<{
    sources: readonly TalosMobileWebSource[]
}>()

const open = ref(false)

function siteOf(source: TalosMobileWebSource): string {
    if (source.site) return source.site
    try {
        return new URL(source.url).hostname.replace(/^www\./, '')
    } catch {
        return source.url
    }
}

/** Up to three marks, like the overlapping icons in the reference. */
const marks = computed(() => props.sources.slice(0, 3).map((source) => ({
    key: source.url,
    letter: siteOf(source).charAt(0).toUpperCase(),
})))

const extra = computed(() => Math.max(0, props.sources.length - marks.value.length))

/**
 * Owner 2026-07-26: a source you cannot open is a footnote, not a citation.
 * Opens in the in-app browser, which is where every other link in TALOS goes —
 * so the page loads under the app's own rules rather than being handed to
 * whatever browser happens to be default.
 */
async function openSource(source: TalosMobileWebSource): Promise<void> {
    const { openTalosLinkOnce } = await import('@/services/inAppBrowserService')
    await openTalosLinkOnce(source.url)
}
</script>

<template>
    <div v-if="sources.length" class="mt-1.5">
        <button
            type="button"
            data-testid="talos-sources-chip"
            aria-haspopup="dialog"
            :aria-label="`${sources.length} sources for this answer`"
            class="talos-pressable inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--talos-border)] px-3 text-xs text-[var(--talos-muted)] transition-colors duration-150 hover:text-[var(--talos-text)]"
            @click="open = true"
        >
            <span>Sources</span>
            <span class="flex items-center -space-x-1.5" aria-hidden="true">
                <span
                    v-for="mark in marks"
                    :key="mark.key"
                    class="flex size-5 items-center justify-center rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] text-3xs text-[var(--talos-text)]"
                >{{ mark.letter }}</span>
                <span
                    v-if="extra"
                    class="flex size-5 items-center justify-center rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] text-3xs text-[var(--talos-muted)]"
                >+{{ extra }}</span>
            </span>
        </button>

        <TalosMobileComposerSheet
            v-if="open"
            title="Sources"
            testid="talos-sources-drawer"
            @close="open = false"
        >
            <ul class="space-y-2 pb-2">
                <li v-for="source in sources" :key="source.url">
                    <button
                        type="button"
                        class="talos-pressable block w-full rounded-xl border border-[var(--talos-border)] px-3 py-2 text-left"
                        :data-testid="`talos-source-open`"
                        :aria-label="`Open ${source.title || siteOf(source)}`"
                        @click="openSource(source)"
                    >
                    <p class="truncate text-xs text-[var(--talos-text)]">{{ source.title || siteOf(source) }}</p>
                    <p class="mt-0.5 truncate text-2xs text-[var(--talos-muted)]">{{ siteOf(source) }}</p>
                    <!-- D7 all the way to the surface: a page that declares no
                         date says so, rather than leaving a blank the reader
                         fills in with "recent". -->
                    <p class="mt-0.5 text-3xs text-[var(--talos-muted)]">
                        {{ source.publishedAt ?? 'date unknown' }}
                    </p>
                    <p class="mt-1 truncate text-3xs text-[var(--talos-muted)] opacity-80">{{ source.url }}</p>
                    </button>
                </li>
            </ul>
        </TalosMobileComposerSheet>
    </div>
</template>
