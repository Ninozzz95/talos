<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { TalosHuggingFaceModel } from '@/lib/models/huggingFace'
import type { TalosFitTone } from '@/lib/models/fitBadge'
import { talosModelLicenceId } from '@/lib/models/licensePolicy'
import TalosModelFitBar from '@/components/talos/models/TalosModelFitBar.vue'

const props = defineProps<{
    model: TalosHuggingFaceModel
    capacity: {
        tone: TalosFitTone
        ratio: number | null
        label: string
        size: string | null
        estimated: boolean
    }
}>()

const { t, locale } = useTalosI18n()

const routeTarget = computed(() => {
    const firstSlash = props.model.id.indexOf('/')
    if (firstSlash <= 0 || firstSlash === props.model.id.length - 1) return null
    if (props.model.id.indexOf('/', firstSlash + 1) !== -1) return null
    const owner = props.model.id.slice(0, firstSlash)
    const repo = props.model.id.slice(firstSlash + 1)
    if (!owner.trim() || !repo.trim() || /[\u0000-\u001f\u007f]/.test(`${owner}${repo}`)) return null
    return {
        name: 'settings-models-local-repo' as const,
        params: { owner, repo },
        query: { revision: props.model.revision ?? 'main' },
    }
})

const licence = computed(() => talosModelLicenceId(props.model.tags, props.model.licence))
const parameters = computed(() => {
    const total = props.model.gguf?.parameters
    if (!total) return null
    if (total >= 1e12) return `${(total / 1e12).toFixed(1).replace(/\.0$/, '')}T`
    if (total >= 1e9) return `${Math.round(total / 1e9)}B`
    return `${Math.round(total / 1e6)}M`
})
const downloads = computed(() => new Intl.NumberFormat(locale.value, {
    notation: 'compact',
    maximumFractionDigits: 1,
}).format(props.model.downloads))
</script>

<template>
    <component
        :is="routeTarget ? RouterLink : 'div'"
        :to="routeTarget ?? undefined"
        data-testid="talos-models-result"
        :data-testid-invalid="routeTarget ? undefined : 'true'"
        :aria-label="routeTarget ? `${t('localModels.open')} ${model.id}` : undefined"
        :aria-disabled="routeTarget ? undefined : 'true'"
        :data-model-repo="model.id"
        class="talos-pressable block min-w-0 bg-[var(--talos-panel)] px-[var(--talos-space-control)] py-[var(--talos-space-inline)] text-left"
    >
        <span v-if="!routeTarget" data-testid="talos-model-row-invalid" aria-disabled="true" class="sr-only">{{ model.id }}</span>
        <span class="flex min-w-0 items-center gap-[var(--talos-space-inline)]">
            <span class="min-w-0 flex-1">
                <span data-testid="talos-model-row-title" class="line-clamp-2 break-words font-mono text-sm font-semibold leading-snug text-[var(--talos-text)]">{{ model.id }}</span>
                <span data-testid="talos-model-row-metadata" class="mt-[calc(var(--talos-space-inline)/2)] flex flex-wrap items-center gap-x-[var(--talos-space-inline)] font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                    <template v-if="licence"><span>{{ licence }}</span><span class="opacity-40">·</span></template>
                    <template v-if="parameters"><span>{{ parameters }}</span><span class="opacity-40">·</span></template>
                    <span>{{ t('localModels.downloadsShort', { count: downloads }) }}</span>
                    <template v-if="model.likes"><span class="opacity-40">·</span><span>{{ model.likes }} ★</span></template>
                    <span v-if="model.gated" class="rounded-full bg-[var(--talos-active)] px-[var(--talos-space-inline)] font-semibold uppercase tracking-wide">{{ t('localModels.gated') }}</span>
                </span>
            </span>
            <ChevronRight v-if="routeTarget" class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
        </span>
        <TalosModelFitBar
            class="mt-[calc(var(--talos-space-inline)/2)]"
            :tone="capacity.tone"
            :ratio="capacity.ratio"
            :label="capacity.label"
            :size="capacity.size"
            :estimated="capacity.estimated"
        />
    </component>
</template>
