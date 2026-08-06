<script setup lang="ts">
import { computed, ref } from 'vue'
import { Brain } from '@lucide/vue'
import TalosMobileTraceRow from '@/components/chat/TalosMobileTraceRow.vue'
import { talosElapsedLabel, useTalosElapsed } from '@/composables/useTalosElapsed'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'

/**
 * Owner 2026-07-25 (defect #5): "i modelli mandano anche il proprio
 * ragionamento, oggi lo buttiamo." Decision: the reasoning is kept, persisted
 * with the message so it survives tomorrow and the export, and closed by
 * default — a trace is routinely longer than the answer, and opening it in
 * place buries the thing that was actually asked for.
 *
 * Owner 2026-07-26, with a screenshot of the Claude Android app: it must stop
 * being a bordered collapse and become "un semplice testo in grigio o colore
 * primario sbiadito" that opens a DRAWER. That also settles the burying
 * problem properly — the answer never moves at all now.
 *
 * The trace is rendered as plain text, never markdown: a live trace is full of
 * half-written syntax, and parsing it produces broken headings mid-thought.
 *
 * The drawer shell is imported statically on purpose. It was briefly an async
 * component "to keep it out of the chat chunk" — which bought nothing, because
 * the composer drawers already import the same shell eagerly, and it cost a
 * component that could not be asserted in a unit test. Laziness that saves no
 * bytes is just a slower path with worse tests.
 */
const props = defineProps<{
    reasoning: string
    /** True while it is still arriving, so the label can say so. */
    live?: boolean
}>()


const showTrace = ref(false)
/**
 * «Ha del contenuto», non «il contenuto ripulito».
 *
 * Era `props.reasoning.trim()`, e serviva solo a un `v-if`. Su un ragionamento
 * che cresce a ogni token quel `trim` allocava una copia dell'intera traccia a
 * ogni aggiornamento — costo quadratico su una cosa che deve solo rispondere
 * sì o no. La ricerca esce al primo carattere non bianco, che è il primo.
 */
const trimmed = computed(() => /\S/.test(props.reasoning))

/**
 * Owner 2026-07-26: "metti il tempo che è passato in secondi del ragionamento".
 *
 * Counting from mount, which is when reasoning first arrives on screen. A model
 * thinking for fifty seconds and a model that has hung look identical without
 * this, and after his 110-second run that difference is the whole question.
 */
const elapsed = useTalosElapsed()
const elapsedLabel = computed(() => (props.live ? talosElapsedLabel(elapsed.value) : ''))
</script>

<template>
    <div v-if="trimmed" data-testid="talos-reasoning-block" class="mb-1">
        <TalosMobileTraceRow
            testid="talos-reasoning-toggle"
            :label="live ? $t('chat.reasoningLive') : $t('chat.reasoning')"
            :detail="elapsedLabel"
            :live="live"
            @open="showTrace = true"
        >
            <template #icon>
                <Brain class="size-3.5" />
            </template>
        </TalosMobileTraceRow>

        <TalosMobileComposerSheet
            v-if="showTrace"
            :title="elapsedLabel ? $t('chat.reasoningWithTime', { time: elapsedLabel }) : $t('chat.reasoning')"
            testid="talos-reasoning-drawer"
            @close="showTrace = false"
        >
            <p
                data-testid="talos-reasoning-text"
                class="whitespace-pre-wrap break-words px-1 pb-2 text-xs leading-5 text-[var(--talos-muted)] [overflow-wrap:anywhere]"
            >{{ reasoning }}</p>
        </TalosMobileComposerSheet>
    </div>
</template>
