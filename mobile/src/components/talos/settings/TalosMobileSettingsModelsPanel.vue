<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Boxes, Cpu, KeyRound, SlidersHorizontal } from '@lucide/vue'
import { TabsContent } from 'reka-ui'
import TalosMobileProviderRuntimePanel from '@/components/talos/models/TalosMobileProviderRuntimePanel.vue'
// import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import TalosThemedTabs from '@/components/talos/ui/TalosThemedTabs.vue'
// Servivano alla sezione «Modello predefinito», commentata sotto.
// import { talosMobileModelProfileIsCallable, talosMobileProviderById } from '@/lib/mobileProviders'
import { talosRememberView, talosRememberedView } from '@/lib/navigation/rememberedView'
import { useChatController } from '@/stores/chatController'

const controller = useChatController()
const { t } = useTalosI18n()

/**
 * The three sections, their order and their names come from the register now.
 * What stays here is where the answer is kept — and that Model Lab reopens on
 * the section you left, which it never did: someone watching a download had to
 * walk back to it after every visit.
 */
const activeTab = ref<string>(talosRememberedView('models') ?? 'providers')

function chooseTab(tab: string): void {
    activeTab.value = tab
    talosRememberView('models', tab)
}

/** Presentation, like the sticky list in Appearance: the strip owns the names. */
const TAB_ICONS: Record<string, typeof KeyRound> = {
    providers: KeyRound,
    catalog: Boxes,
    'on-device': Cpu,
}
const TalosMobileModelCatalog = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileModelCatalog.vue'),
)
const TalosMobileModelAdvancedOptions = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileModelAdvancedOptions.vue'),
)
// Async like its siblings: the download centre pulls in the Hub client, the
// GGUF reader and the fit arithmetic, and none of that belongs in the bundle
// someone loads to pick a provider key.
const TalosMobileLocalModels = defineAsyncComponent(
    () => import('@/components/talos/models/TalosMobileLocalModels.vue'),
)
// const modelItems = computed(() => controller.profiles.value
//     .map((profile) => ({
//         value: profile.id,
//         label: `${talosMobileProviderById(profile.provider).label} - ${profile.display_name}`,
//         disabled: !profile.show_in_composer || !talosMobileModelProfileIsCallable(profile),
//     })))
onMounted(() => { void controller.init() })
</script>

<template>
    <div class="min-w-0 space-y-5">
        <!--
            RIMOSSA dall'owner il 2026-08-03: «puoi levare la sezione in alto del
            modello predefinito, è inutile».

            Commentata invece che cancellata perché la scelta esiste comunque in
            due posti che restano — il selettore rapido del composer e la
            linguetta Locale — quindi qui era una terza copia della stessa
            decisione, in cima a una pagina che parla d'altro. Se dovesse
            servire di nuovo, torna togliendo questi due marcatori.

        <section :aria-label="t('models.defaultModel')" data-testid="settings-models" class="rounded-md border border-[var(- -talos-border)] bg-[var(- -talos-panel)] p-3">
            <h4 class="flex items-center gap-2 text-sm font-semibold text-[var(- -talos-text)]">
                <Bot class="size-4 text-[var(- -talos-accent)]" aria-hidden="true" /> {{ t('models.defaultModel') }}
            </h4>
            <p class="mt-1 text-xs leading-5 text-[var(- -talos-muted)]">{{ t('models.sharedSelection') }}</p>
            <TalosThemedSelect
                v-if="modelItems.length"
                class="mt-3"
                :model-value="controller.selectedModelId.value ?? ''"
                :items="modelItems"
                :aria-label="t('models.defaultChatModel')"
                :placeholder="t('models.selectDiscovered')"
                @update:model-value="controller.selectModel"
            />
            <p v-else class="mt-3 text-xs leading-5 text-[var(- -talos-muted)]">{{ t('models.configureToBegin') }}</p>
        </section>
        -->

        <TalosThemedTabs
            class="min-w-0"
            surface="models"
            :model-value="activeTab"
            :aria-label="t('models.labSections')"
            @update:model-value="chooseTab"
        >
            <template #tab-leading="{ view }">
                <component :is="TAB_ICONS[view.id]" v-if="TAB_ICONS[view.id]" class="size-4" aria-hidden="true" />
            </template>

            <TabsContent
                value="providers"
                data-model-lab-section="providers"
                class="talos-motion-tab-panel mt-4 min-w-0 outline-none"
            >
                <TalosMobileProviderRuntimePanel />
                <details class="mt-4 rounded-md border border-[var(--talos-border)] bg-[var(--talos-background)] p-3">
                    <summary class="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                        <SlidersHorizontal class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('models.advancedManualModels') }}
                    </summary>
                    <div class="mt-3">
                        <TalosMobileModelAdvancedOptions />
                    </div>
                </details>
            </TabsContent>

            <TabsContent
                value="catalog"
                data-model-lab-section="catalog"
                class="talos-motion-tab-panel mt-4 min-w-0 outline-none"
            >
                <TalosMobileModelCatalog />
            </TabsContent>

            <!-- Models that run here, with nothing leaving the phone. Beside
                 the provider sections on purpose: it is the same decision. -->
            <TabsContent
                value="on-device"
                data-model-lab-section="on-device"
                class="talos-motion-tab-panel mt-4 min-w-0 outline-none"
            >
                <TalosMobileLocalModels />
            </TabsContent>
        </TalosThemedTabs>
    </div>
</template>
