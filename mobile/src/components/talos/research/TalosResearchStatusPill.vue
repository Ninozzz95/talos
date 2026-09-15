<script setup lang="ts">
/**
 * Lo stato di una ricerca, in una pastiglia.
 *
 * Il mockup «Talos Calm» la mette in alto a destra di ogni dossier
 * (`pStatus`, app.js:196) ed e' l'unica cosa della scheda che si legge prima
 * del titolo: e' li' che si decide se questa ricerca merita un tocco adesso.
 *
 * ⛔ Icona E parola, mai solo il colore. Tre dei nove stati sono gialli — sono
 * i tre di MB-1, che condividono la gravita' e non la causa — e a distinguerli
 * e' il disegno, non la tinta.
 */
import { computed } from 'vue'
import {
    Activity, Ban, CircleCheck, CircleDashed, FileX, Hourglass, Pause, ShieldAlert, TriangleAlert,
} from '@lucide/vue'
import {
    TALOS_RESEARCH_TONE_CLASS,
    talosResearchStatusLook,
    type TalosResearchStatusIcon,
} from '@/components/talos/research/researchPresentation'
import type { TalosResearchBucket } from '@/lib/research/researchCard'

const props = defineProps<{
    bucket: TalosResearchBucket
    /** Gia' tradotta: la pastiglia non sa in che lingua si sta parlando. */
    label: string
    testId?: string
}>()

const ICONS: Readonly<Record<TalosResearchStatusIcon, unknown>> = {
    running: Activity,
    paused: Pause,
    interrupted: CircleDashed,
    done: CircleCheck,
    cancelled: Ban,
    failed: TriangleAlert,
    'no-report': FileX,
    permission: ShieldAlert,
    'unfinished-turns': Hourglass,
}

const look = computed(() => talosResearchStatusLook(props.bucket))
const icon = computed(() => ICONS[look.value.icon])
</script>

<template>
    <span
        :data-testid="props.testId"
        :data-bucket="props.bucket"
        :data-tone="look.tone"
        class="inline-flex shrink-0 items-center gap-[6px] rounded-full border px-[var(--talos-space-control)] py-[3px] text-2xs leading-none"
        :class="TALOS_RESEARCH_TONE_CLASS[look.tone]"
    >
        <component :is="icon" class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="whitespace-nowrap">{{ props.label }}</span>
    </span>
</template>
