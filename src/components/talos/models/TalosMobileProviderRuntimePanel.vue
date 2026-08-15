<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import { BadgeCheck, ChevronDown, KeyRound, LogIn, RefreshCw, RotateCcw, Server, Trash2 } from '@lucide/vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import { TALOS_MOBILE_PROVIDERS } from '@/lib/mobileProviders'
import { useChatController } from '@/stores/chatController'

const controller = useChatController()
const { t } = useTalosI18n()
const providers = TALOS_MOBILE_PROVIDERS.filter(
    // Only providers with something to configure. local is in the list so
    // the runtime knows it exists, and has no settings row to draw.
    (provider): provider is typeof provider & { id: TalosMobileProviderId } => provider.id !== 'unknown' && provider.configurable,
)
const endpointProviders = new Set<TalosMobileProviderId>(['openai', 'deepseek', 'openrouter', 'ollama'])
const keyDrafts = reactive<Partial<Record<TalosMobileProviderId, string>>>({})
const endpointDrafts = reactive<Partial<Record<TalosMobileProviderId, string>>>({})
const timeoutDrafts = reactive<Partial<Record<TalosMobileProviderId, number>>>({})
const busyProvider = ref<TalosMobileProviderId | null>(null)
const error = ref('')

// Owner 2026-07-24: each provider is a collapsible accordion, default
// COLLAPSED to declutter the long list. Accessible disclosure — button header,
// aria-expanded/controls, body display:none when collapsed (v-show → out of
// tab order + SR). The header shows status (model count / Key saved / Not
// configured) so state is legible without expanding; tap to configure.
const expanded = reactive<Partial<Record<TalosMobileProviderId, boolean>>>({})
function isExpanded(id: TalosMobileProviderId): boolean {
    return expanded[id] === true
}
function toggleProvider(id: TalosMobileProviderId): void {
    expanded[id] = !isExpanded(id)
}

watch(() => controller.endpoints, (value) => {
    for (const provider of providers) {
        if (!endpointProviders.has(provider.id)) continue
        endpointDrafts[provider.id] = value[provider.id] ?? ''
    }
}, { immediate: true, deep: true })

watch(() => controller.modelLabPreferences.value.provider_runtime, (value) => {
    for (const provider of providers) {
        timeoutDrafts[provider.id] = value[provider.id]?.timeout_seconds ?? 60
    }
}, { immediate: true, deep: true })

function modelCountLabel(count: number): string {
    return count === 1 ? t('models.availableOne') : t('models.availableMany', { count })
}

async function run(provider: TalosMobileProviderId, action: () => Promise<unknown>): Promise<void> {
    if (busyProvider.value) return
    busyProvider.value = provider
    error.value = ''
    try {
        await action()
    } catch (cause) {
        error.value = talosTranslatableErrorMessage(cause, t)
            ?? (cause instanceof Error ? cause.message : t('models.providerOperationFailed'))
    } finally {
        busyProvider.value = null
    }
}

/**
 * Chi si può far accedere senza incollare niente.
 *
 * ⛔ Uno solo, e non è una svista. TALOS è distribuita: chiunque abbia l'APK ha
 * ogni byte che contiene, quindi un `client_secret` dentro non sarebbe un
 * segreto. Anthropic, OpenAI, Gemini e DeepSeek offrono OAuth solo a client
 * «riservati», cioè con quel segreto custodito su un server che non abbiamo e
 * che local-first non vuole. OpenRouter pubblica un flusso PKCE per client
 * pubblici, che di segreti non ne chiede. Per gli altri quattro la chiave
 * incollata a mano resta l'unica strada onesta — e questa riga si tiene stretta
 * fino a quando uno di loro non cambia idea.
 */
const oauthProviders = new Set<TalosMobileProviderId>(['openrouter'])
const OAUTH_FAILURE_KEYS = {
    port: 'models.oauthPortFailed',
    browser: 'models.oauthBrowserFailed',
    cancelled: 'models.oauthCancelled',
    exchange: 'models.oauthExchangeFailed',
} as const

/**
 * Caricato al tocco, non all'avvio: chi non accede da OpenRouter non deve
 * pagare il codice che serve a farlo.
 */
async function loginWithOAuth(provider: TalosMobileProviderId): Promise<void> {
    await run(provider, async () => {
        const { talosLoginWithOpenRouter } = await import('@/services/openRouterLogin')
        const result = await talosLoginWithOpenRouter()
        if (!result.ok) throw new Error(t(OAUTH_FAILURE_KEYS[result.reason]))
        // La stessa porta della chiave incollata: elenco modelli, stato
        // «chiave salvata» e messaggi d'errore restano una cosa sola.
        await controller.saveKey(provider, result.key)
    })
}

/**
 * ⭐ Riprende un accesso OpenRouter rimasto a metà.
 *
 * ⛔ MISURATO sul Pad il 2026-08-10: Android ricrea l'attività mentre il
 * browser di sistema è davanti, la WebView riparte, e la promessa che
 * aspettava il codice muore col suo contesto. Il codice arrivava e non lo
 * ritirava nessuno: nessuna chiave, nessun errore, nessuna traccia. Adesso il
 * nativo lo conserva e questa riga lo va a prendere quando la schermata torna.
 *
 * ⛔ Silenzioso quando non c'è niente da riprendere — che è il caso normale.
 */
async function riprendiOpenRouter(): Promise<void> {
    const { talosRiprendiAccessoOpenRouter } = await import('@/services/openRouterLogin')
    const ripreso = await talosRiprendiAccessoOpenRouter().catch(() => null)
    if (!ripreso) return
    if (!ripreso.ok) {
        error.value = t(OAUTH_FAILURE_KEYS[ripreso.reason])
        return
    }
    await run('openrouter', async () => { await controller.saveKey('openrouter', ripreso.key) })
}

/**
 * ⛔⛔ AL RISVEGLIO, non al montaggio — 2026-08-10, seconda correzione.
 *
 * La prima versione chiamava la ripresa in `onMounted`, e non serviva a niente:
 * tornando dal browser il pannello era GIA' montato, quindi non scattava. Il
 * codice era conservato nel nativo e nessuno lo chiedeva — stesso silenzio di
 * prima, causa diversa. Il momento giusto e' quando la pagina torna visibile.
 */
onMounted(() => {
    void riprendiOpenRouter()
    document.addEventListener('visibilitychange', quandoTorna)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', quandoTorna))
function quandoTorna(): void {
    if (document.visibilityState === 'visible') void riprendiOpenRouter()
}

async function saveKey(provider: TalosMobileProviderId): Promise<void> {
    const key = keyDrafts[provider]?.trim() ?? ''
    if (!key) return
    await run(provider, async () => {
        await controller.saveKey(provider, key)
        keyDrafts[provider] = ''
    })
}

async function saveRuntime(provider: TalosMobileProviderId): Promise<void> {
    const timeout = Number(timeoutDrafts[provider])
    const endpoint = endpointDrafts[provider]?.trim() ?? ''
    await run(provider, async () => {
        await controller.setProviderTimeout(provider, timeout)
        if (!endpointProviders.has(provider)) {
            await controller.refreshProvider(provider)
            return
        }
        if (!endpoint) {
            if (provider === 'ollama') throw new Error(t('models.ollamaEndpointRequired'))
            await controller.removeEndpoint(provider)
            await controller.refreshProvider(provider)
            return
        }
        await controller.saveEndpoint(provider, endpoint)
    })
}

async function resetEndpoint(provider: TalosMobileProviderId): Promise<void> {
    await run(provider, async () => {
        await controller.removeEndpoint(provider)
        endpointDrafts[provider] = ''
        if (provider !== 'ollama') await controller.refreshProvider(provider)
    })
}
</script>

<template>
    <div data-testid="settings-provider-keys" class="space-y-[var(--talos-space-section)]">
        <p v-if="error" role="alert" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-[var(--talos-space-control)] text-sm text-[var(--talos-text)]">
            {{ error }}
        </p>

        <section
            v-for="provider in providers"
            :key="provider.id"
            data-provider-runtime
            :data-provider="provider.id"
            :aria-labelledby="`provider-${provider.id}-title`"
            class="rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]"
        >
            <button
                type="button"
                :aria-expanded="isExpanded(provider.id)"
                :aria-controls="`provider-${provider.id}-body`"
                class="talos-pressable flex min-h-touch w-full min-w-0 items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] p-[var(--talos-space-card)] text-left"
                @click="toggleProvider(provider.id)"
            >
                <TalosMobileProviderIcon :provider="provider.id" class="size-[calc(var(--talos-icon-size)*1.75)] shrink-0" />
                <div class="min-w-0 flex-1">
                    <h5 :id="`provider-${provider.id}-title`" class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ provider.label }}</h5>
                    <p class="text-2xs text-[var(--talos-muted)]">
                        <template v-if="controller.catalogs[provider.id].status === 'ready'">{{ modelCountLabel(controller.catalogs[provider.id].models.length) }}</template>
                        <template v-else-if="controller.catalogs[provider.id].status === 'loading'">{{ $t('models.discovering') }}</template>
                        <template v-else-if="controller.catalogs[provider.id].status === 'error'">{{ $t('models.discoveryFailed') }}</template>
                        <template v-else>{{ $t('models.notConfigured') }}</template>
                    </p>
                </div>
                <span v-if="controller.secrets[provider.id]" data-testid="key-present" class="inline-flex items-center gap-[var(--talos-space-inline)] text-2xs font-semibold text-[var(--talos-success)]">
                    <BadgeCheck class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ $t('models.keySaved') }}
                </span>
                <ChevronDown
                    class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-muted)] transition-transform"
                    :class="isExpanded(provider.id) ? '' : '-rotate-90'"
                    aria-hidden="true"
                />
            </button>

            <div v-show="isExpanded(provider.id)" :id="`provider-${provider.id}-body`" class="px-[var(--talos-space-card)] pb-[var(--talos-space-card)]">
            <!-- L'accesso viene PRIMA della casella: incollare una chiave è la
                 strada di riserva, non quella principale, per chi ce l'ha. -->
            <div v-if="oauthProviders.has(provider.id)" class="mb-[var(--talos-space-control)]">
                <button
                    type="button"
                    :data-testid="`talos-provider-oauth-${provider.id}`"
                    :disabled="busyProvider === provider.id"
                    class="talos-pressable flex h-[var(--talos-touch-target)] w-full items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-sm font-medium text-[var(--talos-accent-text)] disabled:opacity-50"
                    @click="loginWithOAuth(provider.id)"
                >
                    <LogIn class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    {{ $t('models.signInWith', { provider: provider.label }) }}
                </button>
                <p class="mt-[var(--talos-space-inline)] text-center text-2xs text-[var(--talos-muted)]">{{ $t('models.orPasteKey') }}</p>
            </div>
            <div v-if="provider.requiresSecret" class="flex gap-[var(--talos-space-inline)]">
                <label class="min-w-0 flex-1">
                    <span class="sr-only">{{ $t('models.apiKey', { provider: provider.label }) }}</span>
                    <input
                        v-model="keyDrafts[provider.id]"
                        type="password"
                        autocomplete="new-password"
                        :aria-label="$t('models.apiKey', { provider: provider.label })"
                        :placeholder="controller.secrets[provider.id] ? $t('models.replacementKey') : $t('models.pasteApiKey')"
                        class="h-[var(--talos-touch-target)] w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-input)] px-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    >
                </label>
                <button type="button" :aria-label="$t('models.saveKey', { provider: provider.label })" :disabled="busyProvider === provider.id || !keyDrafts[provider.id]?.trim()" class="h-[var(--talos-touch-target)] rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-sm font-medium text-[var(--talos-accent-text)] disabled:opacity-50" @click="saveKey(provider.id)">
                    {{ $t('common.save') }}
                </button>
                <button v-if="controller.secrets[provider.id]" type="button" :aria-label="$t('models.removeKey', { provider: provider.label })" :disabled="busyProvider === provider.id" class="inline-flex size-[var(--talos-touch-target)] items-center justify-center rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] text-[var(--talos-muted)] disabled:opacity-50" @click="run(provider.id, () => controller.removeKey(provider.id))">
                    <Trash2 class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                </button>
            </div>

            <div class="mt-[var(--talos-space-section)] grid gap-[var(--talos-space-section)] sm:grid-cols-[minmax(0,1fr)_9rem]">
                <label v-if="endpointProviders.has(provider.id)" class="min-w-0">
                    <span class="mb-[var(--talos-space-inline)] flex items-center gap-[var(--talos-space-inline)] text-xs font-medium text-[var(--talos-muted)]">
                        <Server class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ provider.id === 'ollama' ? $t('models.endpoint') : $t('models.customEndpoint') }}
                    </span>
                    <input
                        v-model="endpointDrafts[provider.id]"
                        type="url"
                        inputmode="url"
                        autocapitalize="none"
                        autocomplete="url"
                        :aria-label="provider.id === 'ollama' ? 'Ollama endpoint' : $t('models.providerCustomEndpoint', { provider: provider.label })"
                        :placeholder="provider.id === 'ollama' ? 'http://192.168.1.20:11434' : $t('models.officialEndpoint')"
                        class="h-[var(--talos-touch-target)] w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-input)] px-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    >
                </label>
                <div :class="endpointProviders.has(provider.id) ? '' : 'sm:col-span-2'">
                    <label :for="`provider-${provider.id}-timeout`" class="mb-[var(--talos-space-inline)] block text-xs font-medium text-[var(--talos-muted)]">{{ $t('models.timeout') }}</label>
                    <div class="flex items-center gap-[var(--talos-space-inline)]">
                        <input :id="`provider-${provider.id}-timeout`" v-model.number="timeoutDrafts[provider.id]" type="range" min="5" max="300" step="5" class="min-w-0 flex-1 accent-[var(--talos-accent)]" :aria-label="$t('models.providerTimeout', { provider: provider.label })">
                        <input v-model.number="timeoutDrafts[provider.id]" type="number" min="5" max="300" step="1" :aria-label="$t('models.providerTimeoutSeconds', { provider: provider.label })" class="h-[var(--talos-touch-target)] w-[calc(var(--talos-touch-target)*1.75)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-input)] px-[var(--talos-space-inline)] text-sm text-[var(--talos-text)]">
                    </div>
                </div>
            </div>

            <div class="mt-[var(--talos-space-section)] flex flex-wrap items-center gap-[var(--talos-space-inline)]">
                <button type="button" :aria-label="$t('models.saveRuntimeOptions', { provider: provider.label })" :disabled="busyProvider === provider.id" class="inline-flex min-h-touch items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-xs font-semibold text-[var(--talos-accent-text)] disabled:opacity-50" @click="saveRuntime(provider.id)">
                    <KeyRound class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ $t('models.saveRuntime') }}
                </button>
                <button type="button" :aria-label="$t('models.refreshProvider', { provider: provider.label })" :disabled="busyProvider === provider.id" class="inline-flex min-h-touch items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-xs font-semibold text-[var(--talos-text)] disabled:opacity-50" @click="run(provider.id, () => controller.refreshProvider(provider.id))">
                    <RefreshCw class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ $t('chat.refresh') }}
                </button>
                <button v-if="endpointProviders.has(provider.id) && controller.endpoints[provider.id]" type="button" :aria-label="$t('models.resetProviderEndpoint', { provider: provider.label })" :disabled="busyProvider === provider.id" class="inline-flex min-h-touch items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] px-[var(--talos-space-inline)] text-xs font-medium text-[var(--talos-muted)] disabled:opacity-50" @click="resetEndpoint(provider.id)">
                    <RotateCcw class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ $t('models.resetEndpoint') }}
                </button>
            </div>

            <p v-if="controller.catalogs[provider.id].error" role="status" class="mt-[var(--talos-space-inline)] text-xs text-[var(--talos-danger)]">
                {{ controller.catalogs[provider.id].error }}
            </p>
            </div>
        </section>
    </div>
</template>
