<script setup lang="ts">
/**
 * La stessa ricerca, in una riga.
 *
 * Il mockup tiene due presentazioni per ogni sezione (`pListRow`, app.js:208) e
 * la differenza non e' la densita': la scheda si guarda, la riga si scorre. Qui
 * sopravvive l'essenziale — il simbolo, il titolo, una riga di contesto, lo
 * stato e il menu — e tutto il resto cade, perche' una riga che prova a portare
 * anche l'estratto e le fonti smette di essere scorribile.
 *
 * ⛔ MB-1: la riga di contesto di una ricerca finita senza rapporto e' l'invito
 * a rimetterla in moto, non i suoi conti. Su una riga c'e' posto per una frase
 * sola, e quella frase deve essere la piu' utile.
 */
import { computed, ref } from 'vue'
import { Check, Loader2, Search } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosResearchStatusPill from '@/components/talos/research/TalosResearchStatusPill.vue'
import {
    talosResearchBucketOneKey,
    talosResearchFootOf,
} from '@/components/talos/research/researchPresentation'
import { talosResearchCardVoice, type TalosResearchCard } from '@/lib/research/researchCard'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'

const props = defineProps<{
    card: TalosResearchCard
    dateLabel: string
    actions: readonly TalosRowAction[]
    selectionMode: boolean
    selected: boolean
    selectable: boolean
    busy: boolean
}>()

const emit = defineEmits<{ open: []; action: [string] }>()

const { t } = useTalosI18n()
const onda = useTalosTouchWave()

const voice = computed(() => talosResearchCardVoice(props.card))
const foot = computed(() => talosResearchFootOf(props.card))

/** Una riga sola di contesto, scelta per utilita' e non per completezza. */
const detail = computed(() => {
    if (voice.value.kind === 'incomplete') {
        const resumable = props.actions.some((action) => action.id === 'resume')
        return t(`research.completion.${props.card.bucket}.${resumable ? 'do' : 'what'}`)
    }
    if (voice.value.kind === 'running') {
        return t('research.cardRunning', { done: props.card.done, total: props.card.total })
    }
    if (voice.value.kind === 'pausing') {
        return t('research.pausing', { done: props.card.done, total: props.card.total })
    }
    const parts = foot.value.sources ? [t(foot.value.sources.key, { count: foot.value.sources.count })] : []
    parts.push(t(foot.value.second.key, { count: foot.value.second.count }))
    parts.push(props.dateLabel)
    return parts.join(' · ')
})

/**
 * Il marcatore della riga di contesto CAMBIA col contenuto, e non e' un vezzo.
 *
 * La scheda e la riga dicono la stessa cosa in due forme; se solo la scheda
 * portasse un nome per «si sta fermando», una prova scritta su una delle due
 * presentazioni non direbbe niente dell'altra — ed e' cosi' che una delle due
 * smette di dirlo senza che nessuno se ne accorga.
 */
const detailTestId = computed(() => ({
    pausing: 'talos-research-card-pausing',
    running: 'talos-research-card-progress',
    incomplete: 'talos-research-card-incomplete',
    standing: 'talos-research-row-detail',
    state: 'talos-research-row-detail',
}[voice.value.kind]))

const menuHost = ref<HTMLElement | null>(null)
function onContextMenu(event: Event): void {
    event.preventDefault()
    if (props.selectionMode) return
    menuHost.value?.querySelector('button')?.click()
}
</script>

<template>
    <article
        role="listitem"
        data-testid="talos-research-card"
        :data-research-id="props.card.id"
        :data-bucket="props.card.bucket"
        class="talos-calm-marker flex min-w-0 items-center gap-[var(--talos-space-inline)] border-b border-[var(--talos-border)] pr-[var(--talos-space-inline)] [overflow-wrap:anywhere]"
        :class="props.busy ? 'opacity-60' : ''"
        @contextmenu="onContextMenu"
    >
        <span class="flex size-11 shrink-0 items-center justify-center">
            <span
                v-if="props.selectionMode && props.selectable"
                data-testid="talos-research-card-tick"
                class="flex size-5 items-center justify-center rounded-full border-2"
                :class="props.selected
                    ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)]'
                    : 'border-[var(--talos-border)]'"
                aria-hidden="true"
            >
                <Check v-if="props.selected" class="size-3.5" />
            </span>
            <Loader2
                v-else-if="props.selectionMode"
                class="size-4 animate-spin text-[var(--talos-muted)]"
                :aria-label="t('research.runningNotSelectable')"
            />
            <Search v-else class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </span>

        <button
            type="button"
            data-testid="talos-research-open"
            class="talos-pressable talos-pressable-row talos-wave-host flex min-h-touch min-w-0 flex-1 flex-col justify-center gap-[2px] rounded-[var(--talos-radius-control)] py-[var(--talos-space-inline)] text-left focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :disabled="props.busy"
            :aria-label="props.card.question"
            :aria-pressed="props.selectionMode && props.selectable ? props.selected : undefined"
            @click="emit('open')"
            @pointerdown="onda.onPointerDown"
        >
            <span class="truncate text-sm font-medium text-[var(--talos-text)]">{{ props.card.question }}</span>
            <span
                :data-testid="detailTestId"
                :data-completion="voice.kind === 'incomplete' ? props.card.bucket : undefined"
                class="truncate text-2xs"
                :class="voice.kind === 'incomplete' ? 'text-[var(--talos-warning)]' : 'text-[var(--talos-muted)]'"
            >{{ detail }}</span>
        </button>

        <TalosResearchStatusPill
            :bucket="props.card.bucket"
            :label="t(talosResearchBucketOneKey(props.card.bucket))"
            :test-id="`talos-research-card-status-${props.card.id}`"
        />
        <span v-if="!props.selectionMode" ref="menuHost" class="shrink-0">
            <TalosRowActions
                :label="t('research.actionsFor', { title: props.card.question })"
                :items="props.actions"
                :test-id="`talos-research-menu-${props.card.id}`"
                @select="(id) => emit('action', id)"
            />
        </span>
    </article>
</template>
