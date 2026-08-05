<script setup lang="ts">
import { Info } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { TalosFileOriginCard } from '@/lib/files/originCard'

/**
 * Where a file came from, on the file itself.
 *
 * Owner decision P-07: «la scheda d'origine è una sezione sempre visibile nel
 * dettaglio del file». Always — including when the answer is "we do not know",
 * because a card that only appears with good news teaches people to read its
 * absence as nothing at all.
 *
 * What it says is decided in `originCard.ts` and tested without a DOM; this is
 * only how it looks. The prompt is deliberately not among the things it can
 * show: the record references it, and a reference is not for reading aloud.
 */
const props = defineProps<{
    card: TalosFileOriginCard
    /** Rendered over a photograph, so it needs its own contrast. */
    onDark?: boolean
    /** Absent when the chat is gone, or when the surface cannot navigate. */
    canOpenChat?: boolean
}>()

const emit = defineEmits<{ openChat: [sessionId: string] }>()

const { t } = useTalosI18n()
</script>

<template>
    <section
        data-testid="talos-file-origin-card"
        :data-origin-kind="props.card.kind"
        aria-labelledby="talos-file-origin-heading"
        class="overflow-hidden rounded-xl border px-3 py-2 text-left"
        :class="props.onDark
            ? 'border-white/15 bg-black/50 text-white backdrop-blur'
            : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]'"
    >
        <p id="talos-file-origin-heading"
           class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide"
           :class="props.onDark ? 'text-white/60' : 'text-[var(--talos-muted)]'">
            <Info class="size-3.5 shrink-0" aria-hidden="true" />
            {{ t('library.originTitle') }}
        </p>
        <!--
            A model id, a chat title and a URL all arrive from outside and none
            of them promises a break opportunity. Without this an OpenRouter id
            or a long query string runs off the card — and inside the full-screen
            viewer there is nothing to scroll to reach it.
        -->
        <p data-testid="talos-file-origin-title" class="mt-1 break-words text-sm font-medium">{{ props.card.title }}</p>
        <p
            v-for="(line, index) in props.card.lines"
            :key="index"
            class="break-words text-xs leading-5 [overflow-wrap:anywhere]"
            :class="props.onDark ? 'text-white/70' : 'text-[var(--talos-muted)]'"
        >{{ line }}</p>
        <button
            v-if="props.canOpenChat && props.card.originSessionId"
            type="button"
            data-testid="talos-file-origin-open-chat"
            class="talos-pressable mt-1.5 min-h-touch text-xs underline underline-offset-2"
            :class="props.onDark ? 'text-white' : 'text-[var(--talos-accent)]'"
            @click="emit('openChat', props.card.originSessionId)"
        >{{ t('library.originOpenChat') }}</button>
    </section>
</template>
