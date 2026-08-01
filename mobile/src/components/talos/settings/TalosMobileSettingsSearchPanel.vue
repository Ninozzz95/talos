<script setup lang="ts">
import { computed } from 'vue'

import TalosMobileSearchSourcePanel from '@/components/talos/settings/TalosMobileSearchSourcePanel.vue'
import { useSettingsStore } from '@/stores/settings'
import { talosT as t } from '@/i18n'

/**
 * Web search, in the place people look for it.
 *
 * This screen exists because of a defect the owner spotted on 2026-08-01: the
 * key that makes web search work lived under *AI Defaults*, while the settings
 * hub had a **Search** entry — sitting between Browser and Integrations, where
 * anyone would look — that said «not installed in this build». Two surfaces
 * with the same name, one of which denied its own existence.
 *
 * The split is not arbitrary. A search source is a **connection**: an outside
 * service, an address, a key — exactly like its neighbours. Which model answers
 * a search-shaped question is a **default**, and that stays in AI Defaults. One
 * home each, and a pointer from here to the permission that governs it, because
 * two copies of a setting are two copies that drift.
 */
const settings = useSettingsStore()

/**
 * The permission lives with its two siblings in AI Defaults — moving it here
 * would split a set of three that are read together. So this shows its state
 * and says where it is, which is the pointer half of «one home plus a pointer».
 */
const outbound = computed(() => settings.effectiveToolPermissions().outbound)
</script>

<template>
    <!-- No introduction of its own: the picker below already opens with "TALOS
         has no index of the web…", and saying it twice in two paragraphs reads
         as a screen that was assembled rather than written. -->
    <section class="space-y-4" data-testid="talos-settings-search">
        <TalosMobileSearchSourcePanel />

        <div
            class="rounded-xl border border-[var(--talos-border)] p-3"
            data-testid="talos-search-permission-pointer"
        >
            <p class="text-xs font-medium text-[var(--talos-text)]">
                {{ t('search.permissionTitle') }}
            </p>
            <p class="mt-1 text-xs text-[var(--talos-muted)]">
                <span v-if="outbound === 'allow'">{{ t('search.permissionAllow') }}</span>
                <span v-else-if="outbound === 'ask'">{{ t('search.permissionAsk') }}</span>
                <!-- Only reachable when the user CHOSE to refuse: the default
                     asks, and an unchosen value is never `deny`. So "you
                     refused" is now literally true, which it was not when this
                     line was first written on a fresh install. -->
                <span v-else>{{ t('search.permissionDeny') }}</span>
            </p>
            <p class="mt-1 text-xs text-[var(--talos-muted)]">
                {{ t('search.permissionWhere') }}
            </p>
        </div>
    </section>
</template>
