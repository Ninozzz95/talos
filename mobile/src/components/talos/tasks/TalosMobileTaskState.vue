<script setup lang="ts">
/**
 * La pastiglia che dice a che punto è un'attività.
 *
 * Copiata da `pStatus` del mockup (`app.js:119`): un'icona, una parola, un
 * tono. ⛔ Il tono non è mai l'unico segnale — l'icona cambia insieme al
 * colore, e la parola c'è sempre — perché un colore da solo non arriva a chi
 * non lo distingue, e non arriva affatto a chi ascolta la pagina.
 *
 * Il file è piccolo di proposito: la stessa pastiglia compare sulla scheda,
 * sulla riga e in testa alla pagina, e tre copie sarebbero tre posti dove
 * «In pausa» può diventare arancione in due e grigio nel terzo.
 */
import { computed } from 'vue'
import { Check, CircleDot, Clock, Info, Pause } from '@lucide/vue'
import { talosTaskTone, type TalosTaskState } from '@/components/talos/tasks/taskShape'

const props = defineProps<{
    state: TalosTaskState
    /** La parola, già tradotta. */
    label: string
    testId?: string
}>()

const ICONE = {
    done: Check,
    paused: Pause,
    doing: CircleDot,
    scheduled: Clock,
    todo: Info,
} as const

const tone = computed(() => talosTaskTone(props.state))

/**
 * I quattro toni, sui token che l'app ha già.
 *
 * `neutral` usa lo sfondo dei pannelli e non un colore: «da fare» è lo stato
 * che hanno quasi tutte, e dipingerlo insegnerebbe a non guardare le pastiglie
 * — la stessa ragione per cui la priorità «normale» non si mostra affatto.
 */
const CLASSI: Record<string, string> = {
    success: 'bg-[var(--talos-success-soft,var(--talos-active))] text-[var(--talos-success,var(--talos-text))]',
    warning: 'bg-[var(--talos-warning-soft,var(--talos-active))] text-[var(--talos-warning,var(--talos-text))]',
    info: 'bg-[var(--talos-info-soft,var(--talos-active))] text-[var(--talos-info,var(--talos-text))]',
    neutral: 'bg-[var(--talos-panel)] text-[var(--talos-muted)]',
}
</script>

<template>
    <span
        :data-testid="props.testId ?? 'talos-task-state'"
        :data-state="props.state"
        class="inline-flex items-center gap-[5px] whitespace-nowrap rounded-[var(--talos-radius-control)] px-[7px] py-1 text-2xs leading-[1.5]"
        :class="CLASSI[tone]"
    >
        <component :is="ICONE[props.state]" class="size-3 shrink-0" aria-hidden="true" />
        <span>{{ props.label }}</span>
    </span>
</template>
