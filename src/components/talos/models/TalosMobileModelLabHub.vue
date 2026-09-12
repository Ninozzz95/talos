<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onMounted, onUnmounted, ref, type Component } from 'vue'
import { Boxes, ChevronRight, Cpu, KeyRound } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { TALOS_SHEET_CONTEXT_KEY } from '@/lib/sheetContext'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'
import { useChatController } from '@/stores/chatController'
import { talosLocalInstalledModels } from '@/services/localEngine'
import { talosOnLocalCatalogueChange } from '@/lib/models/localCatalogueSignal'
import { talosLocalModels, talosRefreshHuggingFaceToken } from '@/stores/localModels'
import TalosMobileDeviceCapacityCard from './TalosMobileDeviceCapacityCard.vue'

/**
 * ⛔ PIGRO, e non per abitudine: `Model Lab` si apre da Impostazioni, non
 * all'avvio, e il grafo d'avvio ha 354 byte liberi su 623.000. Un selettore che
 * legge i dispositivi del motore non è ciò che si paga aprendo l'app.
 */
const TalosMobileLocalBackendChoice = defineAsyncComponent(
    () => import('./TalosMobileLocalBackendChoice.vue'),
)

/**
 * ⭐⭐⭐ I DISPOSITIVI VERI, chiesti al motore — mai dedotti dal nome del chip.
 *
 * Il 2026-09-10 questa schermata diceva «backend: CPU» e non offriva nessuna
 * scelta: l'ordine dell'owner — «LA SCELTA RESTA ALL'UTENTE, CPU GPU O
 * HEXAGON» — non aveva una casa. Adesso ce l'ha, e ciò che mostra viene da
 * `nativeBackendInventory`: se un motore non è registrato su QUESTO telefono,
 * la sua riga resta e dice che qui non c'è, invece di sparire in silenzio.
 */
const backendDevices = ref<Array<{ registry: string, name: string, canOffload: boolean }>>([])
const backendInUse = ref<'cpu' | 'gpu' | 'hexagon' | null>(null)
const backendInUseDevice = ref<string | null>(null)
/**
 * ⛔ Il formato dei pesi del modello SCELTO — non di quello aperto. La scheda
 * dice dove girera' il prossimo, e il prossimo e' quello scelto nel composer.
 */
const backendQuantisation = ref<string | null>(null)

async function leggiIDispositivi(): Promise<void> {
    try {
        const [{ talosLocalEngineStatus, talosLocalEngineBackendFacts },
            { talosLocalBackendInUse },
            { talosLocalBackendDevicesOf },
            { talosStoredLocalBackendPreference }] = await Promise.all([
            import('@/services/localEngine'),
            import('@/lib/models/localBackendChoice'),
            import('@/lib/models/localBackendPlan'),
            import('@/lib/models/localBackendPreferenceStore'),
        ])
        const [stato, fatti] = await Promise.all([
            talosLocalEngineStatus(),
            talosLocalEngineBackendFacts(),
        ])
        backendDevices.value = [...talosLocalBackendDevicesOf(stato.backends, fatti.offloadDevices)]
        /*
         * ⛔⛔ «In uso» NON si deduce qui, e la prima stesura lo faceva.
         *
         * Avevo scritto «se il motore non nomina un dispositivo e un modello è
         * aperto, allora è CPU». È una deduzione, ed è esattamente la forma di
         * difetto che questa giornata ha passato a togliere: a schermo usciva
         * «adesso gira su CPU · —», con un trattino al posto del dispositivo,
         * cioè una certezza costruita su un dato mancante.
         *
         * ⭐ Il risolutore vero esiste già — `talosLocalBackendInUse` — e
         * distingue TRE casi dove io ne vedevo due: combacia, è ripiegato su CPU
         * perché nessun acceleratore è registrato, oppure **non si sa**. Quel
         * terzo caso è quello che rende onesta la riga: `actual: null` ⇒ non si
         * mostra niente.
         */
        const preferita = await talosStoredLocalBackendPreference()
        const chiesto = preferita.mode === 'manual' && preferita.manual !== null
            ? preferita.manual
            : 'cpu'
        const inUso = talosLocalBackendInUse(chiesto, {
            backendDevice: fatti.backendDevice,
            gpuLayersEffective: fatti.gpuLayersEffective,
            offloadDevices: fatti.offloadDevices,
        })
        backendInUse.value = stato.loadedPath === null ? null : inUso.actual
        /*
         * ⛔⛔⛔ IL DISPOSITIVO E' UN NOME, NON UNA FAMIGLIA — visto a schermo l'11/09/2026.
         *
         * Questa riga faceva passare il nome del DISPOSITIVO (`HTP0`) dentro un
         * mappatore che si aspetta un REGISTRY (`HTP`). `HTP0` non combacia con
         * nessuno dei due nomi noti, e la funzione ha un ripiego onesto per il
         * suo scopo — «tutto il resto e', per chi guarda, la scheda grafica».
         *
         * Il risultato sullo schermo del Pad, sotto la scelta Hexagon:
         *
         *     adesso gira su Hexagon · GPU
         *
         * ⛔ Due motori diversi nella stessa frase, e proprio nella riga che e'
         * il nostro differenziatore contro PocketPal: loro mostrano cosa hai
         * scelto, noi mostriamo cosa sta girando davvero. Una riga che si
         * contraddice vale meno di una riga che non c'e'.
         *
         * ⛔ Finche' i motori spediti erano due, il ripiego a «GPU» era giusto
         * per caso: qualunque dispositivo di offload ERA la GPU. L'NPU non ha
         * introdotto il difetto — l'ha reso visibile.
         *
         * ⇒ Si stampa il nome vero, che e' esattamente cio' che il segnaposto
         * `{device}` promette: `HTP0`, `GPUOpenCL`. La famiglia la dice gia' la
         * prima meta' della frase.
         */
        backendInUseDevice.value = fatti.backendDevice === null || fatti.backendDevice === ''
            ? null
            : fatti.backendDevice

        /*
         * ⛔ Il formato decide se l'NPU ha senso su QUESTO modello, e va letto
         * dal file: misurato l'11/09, lo stesso Qwen3-4B legge a 1.126 t/s
         * sull'NPU in Q4_0 e a 55,7 in Q4_K_M. Il percorso e' quello del
         * modello scelto, non di quello aperto — la scheda parla del prossimo.
         */
        const scelto = controller.selectedProviderModel.value
        // ⛔ Per un modello locale l'''id E il percorso del GGUF: e la stessa
        // stringa che il ponte riceve quando lo apre, non una seconda verita'.
        if (scelto?.provider === 'local' && scelto.id) {
            const { talosLocalModelQuantisation } = await import('@/services/localEngine')
            backendQuantisation.value = await talosLocalModelQuantisation(scelto.id)
        }
    } catch {
        // Una diagnosi che non riesce non deve rompere la schermata: le righe
        // restano, e diranno «qui non c'è» invece di mentire.
    }
}

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
        leggiIDispositivi(),
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

        <TalosMobileLocalBackendChoice
            :devices="backendDevices"
            :in-use="backendInUse"
            :in-use-device="backendInUseDevice"
            :quantisation="backendQuantisation"
        />

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
