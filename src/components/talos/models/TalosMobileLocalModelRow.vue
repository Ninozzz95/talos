<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { TalosHuggingFaceModel } from '@/lib/models/huggingFace'
import type { TalosFitTone } from '@/lib/models/fitBadge'
import { talosModelLicenceId } from '@/lib/models/licensePolicy'
import { talosFormatCompactCount, talosFormatParameterCount } from '@/lib/models/presentation'
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

/**
 * Restyle Blocco 5 — l'iniziale del publisher, come nel mockup ("UN",
 * "BA", "GG"): due lettere, non un colore per publisher (nessuna
 * funzione di hash-a-colore nel mockup né altrove in questo albero — non
 * se ne inventa una qui). Deriva dallo stesso `owner` di `routeTarget`,
 * mai un secondo parsing dell'id.
 */
const publisherInitials = computed(() => {
    const owner = routeTarget.value?.params.owner ?? props.model.id.split('/')[0] ?? ''
    return owner.slice(0, 2).toUpperCase()
})
const parameters = computed(() => talosFormatParameterCount(props.model.gguf?.parameters))
const downloads = computed(() => talosFormatCompactCount(props.model.downloads, locale.value))
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
            <!-- Restyle Blocco 5 — l'iniziale del publisher, come nel
                 mockup: aiuta a scorrere un elenco raggruppato quando le
                 sole due lettere bastano a riconoscere chi l'ha pubblicato. -->
            <span
                data-testid="talos-model-row-avatar"
                aria-hidden="true"
                class="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--talos-border)] font-mono text-2xs font-semibold text-[var(--talos-muted)]"
            >{{ publisherInitials }}</span>
            <span class="min-w-0 flex-1">
                <span data-testid="talos-model-row-title" class="line-clamp-2 break-words font-mono text-sm font-semibold leading-snug text-[var(--talos-text)]">{{ model.id }}</span>
                <span data-testid="talos-model-row-metadata" class="mt-[calc(var(--talos-space-inline)/2)] flex flex-wrap items-center gap-[calc(var(--talos-space-inline)/2)] font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                    <span v-if="licence" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[calc(var(--talos-space-inline)/2)]">{{ licence }}</span>
                    <span v-if="parameters" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[calc(var(--talos-space-inline)/2)]">{{ parameters }}</span>
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
