<script setup lang="ts">
import { computed, ref } from 'vue'
import { Globe } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { useTalosSourceCardIcons } from '@/composables/useTalosSourceCardIcons'
import { useTalosI18n } from '@/i18n'
import { talosPublishedOn } from '@/lib/publishedDate'
import type { TalosMobileWebSource } from '@/stores/chat'

/**
 * The "Sources" pill under an answer, with the drawer behind it — the shape the
 * owner pointed at in Claude and ChatGPT (2026-07-26).
 *
 * It shows the pages THAT answer rests on, never everything the conversation
 * ever read. A chip that lists the whole chat is decoration; a chip that lists
 * what this reply used is a citation.
 *
 * Owner 2026-07-30: the marks are the sites' own favicons now, with the letter
 * behind them. The original objection stands and is the reason this reads from
 * disk and never fetches — a favicon requested when a chat is OPENED is a
 * request to every cited site every time, which would break the one thing this
 * feature promises, that only the query leaves the device. The bytes come from
 * the card captured when the link was saved; a source without one keeps its
 * letter, and the Library's backfill is what eventually gives old chats theirs.
 */
const props = defineProps<{
    sources: readonly TalosMobileWebSource[]
}>()

const open = ref(false)
const { locale } = useTalosI18n()

function siteOf(source: TalosMobileWebSource): string {
    if (source.site) return source.site
    try {
        return new URL(source.url).hostname.replace(/^www\./, '')
    } catch {
        return source.url
    }
}

// Read-only: no `backfill`, so opening a chat reaches for nothing.
const { icons } = useTalosSourceCardIcons(computed(() => props.sources.map((source) => source.url)))

/** Up to three marks, like the overlapping icons in the reference. */
const marks = computed(() => props.sources.slice(0, 3).map((source) => ({
    key: source.url,
    letter: siteOf(source).charAt(0).toUpperCase(),
    icon: icons.value[source.url] ?? null,
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
            :aria-label="$t('chat.sourceCount', { count: sources.length })"
            class="talos-pressable inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--talos-border)] px-3 text-xs text-[var(--talos-muted)] transition-colors duration-150 hover:text-[var(--talos-text)]"
            @click="open = true"
        >
            <span>{{ $t('chat.sources') }}</span>
            <span class="flex items-center -space-x-1.5" aria-hidden="true">
                <span
                    v-for="mark in marks"
                    :key="mark.key"
                    class="flex size-5 items-center justify-center overflow-hidden rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] text-3xs text-[var(--talos-text)]"
                >
                    <img
                        v-if="mark.icon"
                        data-testid="talos-source-favicon"
                        :src="mark.icon"
                        alt=""
                        class="size-3.5 object-contain"
                    >
                    <template v-else>{{ mark.letter }}</template>
                </span>
                <span
                    v-if="extra"
                    class="flex size-5 items-center justify-center rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] text-3xs text-[var(--talos-muted)]"
                >+{{ extra }}</span>
            </span>
        </button>

        <TalosMobileComposerSheet
            v-if="open"
            :title="$t('chat.sources')"
            testid="talos-sources-drawer"
            @close="open = false"
        >
            <ul class="space-y-2 pb-2">
                <li v-for="source in sources" :key="source.url">
                    <button
                        type="button"
                        class="talos-pressable block w-full rounded-xl border border-[var(--talos-border)] px-3 py-2 text-left"
                        :data-testid="`talos-source-open`"
                        :aria-label="$t('chat.openSource', { title: source.title || siteOf(source) })"
                        @click="openSource(source)"
                    >
                    <p class="flex min-w-0 items-center gap-1.5 text-xs text-[var(--talos-text)]">
                        <!--
                            Owner 2026-07-30: the drawer was left with letters
                            while the chip in front of it got real marks. The
                            bytes are the same ones, already on disk, so showing
                            them here costs nothing and their absence in a panel
                            opened FROM the marks read as broken.
                        -->
                        <img
                            v-if="icons[source.url]"
                            data-testid="talos-source-drawer-favicon"
                            :src="icons[source.url]"
                            alt=""
                            class="size-4 shrink-0 rounded-sm object-contain"
                        >
                        <Globe v-else class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                        <span class="min-w-0 flex-1 truncate">{{ source.title || siteOf(source) }}</span>
                    </p>
                    <p class="mt-0.5 truncate text-2xs text-[var(--talos-muted)]">{{ siteOf(source) }}</p>
                    <!-- D7 all the way to the surface: a page that declares no
                         date says so, rather than leaving a blank the reader
                         fills in with "recent". -->
                    <p class="mt-0.5 text-3xs text-[var(--talos-muted)]">
                        {{ source.publishedAt ? talosPublishedOn(source.publishedAt, locale) : $t('chat.dateUnknown') }}
                    </p>
                    <p class="mt-1 truncate text-3xs text-[var(--talos-muted)] opacity-80">{{ source.url }}</p>
                    </button>
                </li>
            </ul>
        </TalosMobileComposerSheet>
    </div>
</template>
