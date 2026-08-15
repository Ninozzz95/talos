<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import {
    mobileEffortLadderFromLevels,
} from '@/lib/mobileEffort'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'

const props = defineProps<{
    effortLevels: string[]
    selectedEffort: string
    supportsThinking: boolean
    thinking: boolean
}>()

const emit = defineEmits<{
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
    requestClose: []
}>()

const { t } = useTalosI18n()
const effortLadder = computed(() => mobileEffortLadderFromLevels(props.effortLevels))
function effortLabel(level: string): string {
    const key = `chat.effort${level.charAt(0).toUpperCase()}${level.slice(1)}`
    return t(key)
}

const effortOptions = computed(() => effortLadder.value.map((level) => ({
    value: level,
    label: effortLabel(level),
    // The row already carried this hook and the tests point at it; the
    // primitive owns the button now, so it has to carry it too.
    testId: 'talos-mobile-effort-level',
})))

/**
 * Appearance stays here; the radiogroup grammar belongs to the primitive. The
 * selected skin comes from `aria-checked` in the scoped stylesheet below, so
 * this does not need to know which one is chosen.
 */
function effortOptionClass(): string {
    return `talos-mobile-effort-level min-h-touch rounded-md border px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring,var(--ring))]`
}

function chooseEffort(value: string): void {
    const found = effortLadder.value.find((level) => level === value)
    if (found) emit('selectEffort', found)
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    emit('requestClose')
}
</script>

<template>
    <div
        data-testid="talos-mobile-effort-picker"
        class="space-y-3"
        @keydown="onKeydown"
    >
        <div class="text-2xs font-semibold uppercase text-[var(--talos-muted,var(--muted-foreground))]">
            {{ $t('chat.reasoningEffort') }}
        </div>
        <!-- One effort among several, so a radiogroup. As `role="group"` plus
             `aria-pressed` it was eight independent tab stops standing between
             a keyboard user and the switch underneath. -->
        <TalosThemedFilter
            group-class="flex flex-wrap gap-1.5"
            :model-value="selectedEffort"
            :options="effortOptions"
            :group-label="$t('chat.reasoningEffortLevels')"
            :option-class="effortOptionClass"
            @update:model-value="chooseEffort"
        >
            <template #option="{ option }">{{ option.label }}</template>
        </TalosThemedFilter>

        <!--
            L'interruttore condiviso, al posto della sesta copia fatta a mano.

            Owner 2026-08-03, con uno screenshot: il pomello stava FUORI dal
            binario. Non era un'approssimazione grafica — misurato nella pagina
            viva sul tablet, il binario è largo 48px e il pomello cominciava a
            48px, cioè sbordava di venti pixel interi, tutto quanto.

            La causa: il pomello era `absolute` senza `left`, quindi partiva
            dalla sua POSIZIONE STATICA — e un `<button>` centra il proprio
            contenuto, per cui quella posizione è il centro (24px) — e sopra ci
            si sommava `translate-x-6`, altri 24px. Le altre cinque copie in
            giro per l'app scrivono `left` esplicito e infatti stanno dentro:
            questa era l'unica rotta, ed è per questo che si vedeva in un posto
            solo.

            `TalosThemedSwitch` non posiziona nulla in assoluto: il pomello è un
            figlio in flusso dentro un contenitore `items-center`. Il difetto
            non è corretto, è reso impossibile.
        -->
        <div
            v-if="supportsThinking"
            class="flex min-h-touch items-center justify-between gap-3 border-t border-[var(--talos-border,var(--border))] pt-2 text-sm text-[var(--talos-text,var(--foreground))]"
        >
            <span class="min-w-0">{{ $t('chat.extendedThinking') }}</span>
            <TalosThemedSwitch
                test-id="talos-mobile-thinking-toggle"
                :model-value="thinking"
                :aria-label="$t('chat.extendedThinking')"
                @update:model-value="emit('selectThinking', $event)"
            />
        </div>

        <p
            v-if="effortLadder.length <= 1"
            class="text-2xs leading-4 text-[var(--talos-muted,var(--muted-foreground))]"
        >
            {{ $t('chat.noReasoningSetting') }}
        </p>
    </div>
</template>

<style scoped>
/*
 * `:deep` because the buttons are rendered by the shared filter now, and a
 * scoped rule only reaches a child component's ROOT element. Without it these
 * two rules would quietly stop applying and the pills would lose their skin.
 *
 * Selected is read from `aria-checked`, not from a parallel data attribute:
 * the look and the announcement then cannot disagree with each other.
 */
:deep(.talos-mobile-effort-level) {
    border-color: var(--talos-border, var(--border));
    background: var(--talos-panel, var(--card));
    color: var(--talos-muted, var(--muted-foreground));
}

:deep(.talos-mobile-effort-level[aria-checked="true"]) {
    border-color: var(--talos-accent-border, var(--border));
    background: var(--talos-accent-soft, var(--accent));
    color: var(--talos-accent-text, var(--accent-foreground));
}
</style>
