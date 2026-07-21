<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { BadgeCheck, Bot, KeyRound, Trash2 } from '@lucide/vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import { useChatController } from '@/stores/chatController'
import { TALOS_MOBILE_PROVIDERS, talosMobileModelProfileIsCallable } from '@/lib/mobileProviders'

// Functional Settings: provider API keys land in the OS Keystore (via the controller),
// never in plaintext; the default model is chosen here. Both feed the same controller
// the chat composer uses, so saving a key immediately un-gates sending.
const controller = useChatController()
const { profiles, selectedModelId, secrets, selectModel, saveKey, removeKey } = controller

const keyDrafts = reactive<Record<string, string>>({})
const busyProvider = ref<string | null>(null)
const keyProviders = TALOS_MOBILE_PROVIDERS.filter((provider) => provider.requiresSecret)

onMounted(() => { void controller.init() })

async function onSaveKey(providerId: string): Promise<void> {
    const draft = (keyDrafts[providerId] ?? '').trim()
    if (draft === '' || busyProvider.value) return
    busyProvider.value = providerId
    try {
        await saveKey(providerId, draft)
        keyDrafts[providerId] = ''
    } finally {
        busyProvider.value = null
    }
}

async function onRemoveKey(providerId: string): Promise<void> {
    if (busyProvider.value) return
    busyProvider.value = providerId
    try {
        await removeKey(providerId)
    } finally {
        busyProvider.value = null
    }
}
</script>

<template>
    <TalosMobileScreen title="Settings Center" eyebrow="Protected preferences">
        <template #eyebrow-icon>
            <KeyRound class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>

        <!-- Provider keys -->
        <section aria-label="Provider keys" data-testid="settings-provider-keys" class="mt-2">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <KeyRound class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" /> Provider keys
            </h2>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                Keys are stored in the device secure enclave (Android Keystore) — never in plaintext, never sent anywhere but the provider.
            </p>
            <ul class="mt-3 flex flex-col gap-3">
                <li
                    v-for="provider in keyProviders"
                    :key="provider.id"
                    :data-provider="provider.id"
                    class="rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
                >
                    <div class="flex items-center gap-2">
                        <TalosMobileProviderIcon :provider="provider.id" class="size-6" />
                        <span class="text-sm font-medium text-[var(--talos-text)]">{{ provider.label }}</span>
                        <span
                            v-if="secrets[provider.id]"
                            data-testid="key-present"
                            class="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--talos-success-soft,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--talos-success,var(--talos-accent))]"
                        >
                            <BadgeCheck class="size-3.5" aria-hidden="true" /> Key saved
                        </span>
                    </div>
                    <div class="mt-2 flex items-center gap-2">
                        <input
                            v-model="keyDrafts[provider.id]"
                            type="password"
                            autocomplete="new-password"
                            :aria-label="`${provider.label} API key`"
                            :placeholder="secrets[provider.id] ? 'Enter a new key to replace' : 'Paste your API key'"
                            class="h-10 min-w-0 flex-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        >
                        <button
                            type="button"
                            :disabled="busyProvider === provider.id || !(keyDrafts[provider.id] ?? '').trim()"
                            :aria-label="`Save ${provider.label} key`"
                            class="inline-flex h-10 items-center rounded-md bg-[var(--talos-accent)] px-3 text-sm font-medium text-[var(--talos-accent-contrast,var(--talos-accent-text))] disabled:opacity-50"
                            @click="onSaveKey(provider.id)"
                        >Save</button>
                        <button
                            v-if="secrets[provider.id]"
                            type="button"
                            :aria-label="`Remove ${provider.label} key`"
                            class="inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-[var(--talos-border)] text-[var(--talos-muted)]"
                            @click="onRemoveKey(provider.id)"
                        >
                            <Trash2 class="size-4" aria-hidden="true" />
                        </button>
                    </div>
                </li>
            </ul>
        </section>

        <!-- Default model -->
        <section aria-label="Default model" data-testid="settings-models" class="mt-6">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Bot class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" /> Default model
            </h2>
            <ul class="mt-3 flex flex-col gap-2">
                <li v-for="profile in profiles" :key="profile.id">
                    <button
                        type="button"
                        :data-model-id="profile.id"
                        :aria-pressed="profile.id === selectedModelId"
                        :disabled="!talosMobileModelProfileIsCallable(profile)"
                        class="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50"
                        :class="profile.id === selectedModelId
                            ? 'border-[var(--talos-accent)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent)]'
                            : 'border-[var(--talos-border)] text-[var(--talos-text)]'"
                        @click="selectModel(profile.id)"
                    >
                        <TalosMobileProviderIcon :provider="profile.provider" class="size-5" />
                        <span class="min-w-0 flex-1 truncate">{{ profile.display_name }}</span>
                        <span v-if="!profile.has_secret" class="text-[11px] text-[var(--talos-muted)]">needs key</span>
                    </button>
                </li>
            </ul>
        </section>
    </TalosMobileScreen>
</template>
