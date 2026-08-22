<script setup lang="ts">
/**
 * Cosa si decide PRIMA di far riscrivere un prompt.
 *
 * Owner 2026-08-04: «prima che parta l'enhancing bisogna selezionare modello e
 * ragionamento ove previsto, e il tono … se uso ChatGPT 5.6 Sol Max per la
 * chat, non e' detto che sia necessario usare lo stesso modello per un semplice
 * prompt enhancing, potrebbe essere uno spreco di token e soldi».
 *
 * ## L'ordine sullo schermo e' una scelta
 *
 * Prima **quanto riscrivere**, poi **chi lo riscrive**. La prima domanda
 * riguarda il risultato, la seconda la macchina — e chi apre questo pannello
 * ha in testa la prima. Metterle al contrario vorrebbe dire chiedere di
 * scegliere uno strumento prima di sapere cosa deve produrre.
 *
 * ## Un solo elemento parla
 *
 * Sotto i tre livelli c'e' UNA riga che dice cosa cambia davvero, e cambia con
 * la scelta. E' l'unica cosa in movimento: il resto sono le linguette e i
 * selettori che l'app usa dappertutto, perche' un pannello che inventa una sua
 * grammatica e' un pannello che va imparato.
 */
import { computed } from 'vue'
import { Sparkles } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import TalosThemedSelect, { type TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import { talosSortChipClass } from '@/lib/sortChip'
import { TALOS_PROMPT_ENHANCER_DEPTHS, type TalosPromptEnhancerDepth } from '@/lib/chat/promptEnhancerDepth'

const props = defineProps<{
    depth: TalosPromptEnhancerDepth
    model: string | null
    effort: string
    /** I modelli che questo dispositivo puo' davvero chiamare. */
    models: readonly { id: string, label: string, provider: string, efforts: readonly string[] }[]
}>()

const emit = defineEmits<{
    'update:depth': [value: TalosPromptEnhancerDepth]
    'update:model': [value: string | null]
    'update:effort': [value: string]
    start: []
}>()

const { t } = useTalosI18n()

const depthOptions = computed(() => TALOS_PROMPT_ENHANCER_DEPTHS.map((id) => ({
    value: id,
    label: t(`chat.enhancerDepth.${id}`),
})))

/**
 * «Quello del compositore» e' una voce, non l'assenza di una voce.
 *
 * Un selettore vuoto non dice cosa succede se non si sceglie; questa riga si'.
 *
 * Perche' una sentinella e non la stringa vuota: reka-ui riserva `''` a «nessuna
 * scelta, mostra il segnaposto» e RIFIUTA una voce che la usi. Scritta cosi', la
 * riga esplodeva al montaggio e il selettore del modello non si disegnava — un
 * difetto vero, non un rumore dei test, perche' l'errore nasce nel componente.
 */
const MODELLO_DELLA_CHAT = 'talos-enhancer-model-della-chat'
const modelItems = computed<TalosThemedSelectItem[]>(() => [
    { value: MODELLO_DELLA_CHAT, label: t('chat.enhancerModelSame') },
    ...props.models.map((entry) => ({ value: entry.id, label: `${entry.provider} · ${entry.label}` })),
])

/** Il ragionamento si mostra solo dove il modello scelto lo prevede davvero. */
const efforts = computed(() => props.models.find((entry) => entry.id === props.model)?.efforts ?? [])
/** Le stesse etichette del compositore: un livello non ha due nomi. */
function effortLabel(level: string): string {
    return t(`chat.effort${level.charAt(0).toUpperCase()}${level.slice(1)}`)
}
const effortOptions = computed(() => efforts.value.map((id) => ({
    value: id,
    label: effortLabel(id),
})))
</script>

<template>
    <div data-testid="talos-enhancer-setup" class="flex flex-col gap-4 pb-2">
        <section class="flex flex-col gap-2">
            <p class="text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                {{ t('chat.enhancerDepthLabel') }}
            </p>
            <TalosThemedFilter
                group-class="flex gap-1"
                :model-value="depth"
                :options="depthOptions"
                :group-label="t('chat.enhancerDepthLabel')"
                :option-class="talosSortChipClass"
                data-testid="talos-enhancer-depth"
                @update:model-value="(value) => emit('update:depth', value as TalosPromptEnhancerDepth)"
            />
            <!-- La sola cosa che si muove: cosa cambia DAVVERO nel risultato.
                 Tre nomi senza conseguenza costringono a provarli tutti e tre. -->
            <p data-testid="talos-enhancer-depth-body" class="text-2xs leading-5 text-[var(--talos-muted)]">
                {{ t(`chat.enhancerDepthBody.${depth}`) }}
            </p>
        </section>

        <section class="flex flex-col gap-2">
            <p class="text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                {{ t('chat.enhancerModelLabel') }}
            </p>
            <TalosThemedSelect
                data-testid="talos-enhancer-model"
                :model-value="model ?? MODELLO_DELLA_CHAT"
                :items="modelItems"
                :aria-label="t('chat.enhancerModelLabel')"
                @update:model-value="(value) => emit('update:model', value === MODELLO_DELLA_CHAT ? null : value)"
            />
            <p class="text-2xs leading-5 text-[var(--talos-muted)]">{{ t('chat.enhancerModelHint') }}</p>

            <!-- Solo dove il modello scelto lo prevede: un selettore che non
                 governa niente e' peggio di uno assente. -->
            <template v-if="effortOptions.length > 0">
                <p class="mt-1 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                    {{ t('chat.enhancerEffortLabel') }}
                </p>
                <TalosThemedFilter
                    group-class="flex gap-1"
                    :model-value="effort"
                    :options="effortOptions"
                    :group-label="t('chat.enhancerEffortLabel')"
                    :option-class="talosSortChipClass"
                    data-testid="talos-enhancer-effort"
                    @update:model-value="(value) => emit('update:effort', value)"
                />
            </template>
        </section>

        <Button data-testid="talos-enhancer-start" class="w-full" @click="emit('start')">
            <Sparkles class="size-4" aria-hidden="true" />
            {{ t('chat.enhancerStart') }}
        </Button>
    </div>
</template>
