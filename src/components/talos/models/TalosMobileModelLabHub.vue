<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, type Component } from 'vue'
import { Boxes, ChevronRight, Cpu, KeyRound } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { TALOS_SHEET_CONTEXT_KEY } from '@/lib/sheetContext'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'
import { useChatController } from '@/stores/chatController'
import { talosLocalInstalledModels } from '@/services/localEngine'
import { talosOnLocalCatalogueChange } from '@/lib/models/localCatalogueSignal'
import { talosLocalModels, talosRefreshHuggingFaceToken } from '@/stores/localModels'
import TalosMobileDeviceCapacityCard from './TalosMobileDeviceCapacityCard.vue'

const { t } = useTalosI18n()
const controller = useChatController()
const insideSheet = inject(TALOS_SHEET_CONTEXT_KEY, false)
const installedCount = ref<number | null>(null)

const configuredProviders = computed(() => (
    Object.values(controller.secrets).filter(Boolean).length
    + (talosLocalModels.hasToken ? 1 : 0)
))
const profileCount = computed(() => controller.profiles.value.length)
const destinations = computed<Array<{
    route: TalosMobileRouteName
    icon: Component
    label: string
    description: string
    status: string
}>>(() => [
    {
        route: 'settings-models-providers',
        icon: KeyRound,
        label: t('models.providerAccessTitle'),
        description: t('models.providerAccessDescription'),
        status: t('models.providerAccessStatus', { configured: configuredProviders.value }),
    },
    {
        route: 'settings-models-catalog',
        icon: Boxes,
        label: t('models.catalogTitle'),
        description: t('models.catalogDescription'),
        status: t('models.catalogStatus', { count: profileCount.value }),
    },
    {
        route: 'settings-models-local',
        icon: Cpu,
        label: t('models.localTitle'),
        description: t('models.localDescription'),
        status: installedCount.value === null
            ? t('models.measurePending')
            : t('models.localStatus', { count: installedCount.value }),
    },
])

async function contaModelliLocali(): Promise<void> {
    try {
        installedCount.value = (await talosLocalInstalledModels()).models.length
    } catch {
        installedCount.value = null
    }
}

/**
 * ⭐ Il conteggio si aggiorna quando il disco cambia, non solo all'ingresso.
 *
 * Owner 2026-08-06: «il modello appena scaricato non viene aggiornato né la
 * lista modelli sul dispositivo locale in Model Hub». Questa riga leggeva una
 * volta al montaggio, quindi un download finito mentre l'Hub era aperto
 * lasciava scritto un numero vecchio — e un numero vecchio è peggio di nessun
 * numero, perché sembra una risposta.
 */
const smettiAscoltareCatalogo = talosOnLocalCatalogueChange(() => { void contaModelliLocali() })
onUnmounted(() => { smettiAscoltareCatalogo() })

onMounted(async () => {
    await Promise.all([
        controller.init().catch(() => undefined),
        talosRefreshHuggingFaceToken().catch(() => undefined),
        contaModelliLocali(),
    ])
})
</script>

<template>
    <div data-testid="talos-model-lab-hub" class="flex min-w-0 flex-col gap-[var(--talos-space-section)]">
        <header class="flex flex-col gap-[var(--talos-space-inline)]">
            <h1 :class="insideSheet ? 'sr-only' : 'talos-title text-lg font-semibold text-[var(--talos-text)]'">{{ t('models.labTitle') }}</h1>
            <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ t('models.labDescription') }}</p>
        </header>

        <TalosMobileDeviceCapacityCard />

        <nav :aria-label="t('models.labDestinations')" class="flex flex-col gap-[var(--talos-space-inline)]">
            <RouterLink
                v-for="destination in destinations"
                :key="destination.route"
                :to="{ name: destination.route }"
                data-testid="talos-model-lab-destination"
                class="talos-pressable flex min-h-touch min-w-0 items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)] text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
                <span class="grid size-[var(--talos-touch-target)] shrink-0 place-items-center rounded-[var(--talos-radius-control)] bg-[var(--talos-active)] text-[var(--talos-accent)]">
                    <component :is="destination.icon" class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                </span>
                <span class="min-w-0 flex-1">
                    <strong class="block text-sm text-[var(--talos-text)]">{{ destination.label }}</strong>
                    <span class="block text-xs leading-5 text-[var(--talos-muted)]">{{ destination.description }}</span>
                    <span class="block font-mono text-3xs text-[var(--talos-accent)]">{{ destination.status }}</span>
                </span>
                <ChevronRight class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                <span class="sr-only">{{ t('models.openDestination', { destination: destination.label }) }}</span>
            </RouterLink>
        </nav>
    </div>
</template>
