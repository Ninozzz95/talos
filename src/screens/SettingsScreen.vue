<script setup lang="ts">
import { computed, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { KeyRound } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileSettingsCenter from '@/components/talos/settings/TalosMobileSettingsCenter.vue'
import { TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB } from '@/components/talos/settings/settingsTabs'

const route = useRoute()
const router = useRouter()
const { t } = useTalosI18n()
const requestedTab = computed(() => typeof route.query.tab === 'string' ? route.query.tab : null)
const legacyModelLab = computed(() => requestedTab.value === TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB)

watch(legacyModelLab, (legacy) => {
    if (!legacy) return
    void router.replace({ name: 'settings-models' }).catch(() => undefined)
}, { immediate: true })

/**
 * Keep `?tab=` telling the truth.
 *
 * It used to be one-way: the query could open a category and nothing ever wrote
 * back, so the address bar started lying the moment anyone touched the list —
 * and a deep link copied out of it reopened somewhere else entirely.
 *
 * `replace`, never `push`. Every category tap would otherwise leave a history
 * entry, and Android's back gesture would walk out of Settings one category at
 * a time instead of leaving. The sheet header already owns Back; a second,
 * invisible back stack fighting it is worse than the lie this fixes.
 */
function rememberOpenTab(tab: string | null): void {
    // Read the query, not the computed above it: that one is cached against the
    // render, and this runs in answer to an event.
    const shown = typeof route.query.tab === 'string' ? route.query.tab : null
    if (shown === tab) return
    const query = { ...route.query }
    if (tab) query.tab = tab
    else delete query.tab
    // A duplicate navigation rejects rather than throwing anywhere useful, and
    // a settings screen is not worth an unhandled rejection over.
    void router.replace({ query }).catch(() => undefined)
}
</script>

<template>
    <TalosMobileScreen
        :title="t('stations.settingsCenterTitle')"
        :eyebrow="t('settings.protectedPreferences')"
        tablet-edge-to-edge
    >
        <template #eyebrow-icon>
            <KeyRound class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>
        <TalosMobileSettingsCenter
            v-if="!legacyModelLab"
            :requested-tab="requestedTab"
            @update:open-tab="rememberOpenTab"
        />
    </TalosMobileScreen>
</template>
