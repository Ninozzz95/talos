<script setup lang="ts">
import type { Component } from 'vue'
import type { TalosWindowLoaderState } from '../../../lib/talosWindowLoader'
import type { TalosWindowModuleContext } from '../../../lib/talosWindowModuleContext'
import type { TalosWindowId, TalosWindowSection } from '../../../lib/talosWindowRegistry'
import TalosWindowErrorState from './TalosWindowErrorState.vue'
import TalosWindowLoadingState from './TalosWindowLoadingState.vue'
import TalosWindowSectionTabs from './TalosWindowSectionTabs.vue'

defineProps<{
    id: TalosWindowId
    title: string
    tabs: readonly TalosWindowSection[]
    activeSection: string
    loadState: TalosWindowLoaderState<Component>
    moduleComponent: Component | null
    moduleContext: TalosWindowModuleContext
    errorMessage: string
}>()

const emit = defineEmits<{
    selectSection: [sectionId: string]
    retry: []
}>()
</script>

<template>
    <TalosWindowSectionTabs
        v-if="tabs.length"
        :window-id="id"
        :tabs="tabs"
        :active-tab="activeSection"
        @select="emit('selectSection', $event)"
    />
    <component
        :is="moduleComponent"
        v-if="loadState.status === 'success' && moduleComponent"
        :context="moduleContext"
    />
    <TalosWindowErrorState
        v-else-if="loadState.status === 'error'"
        :title="title"
        :message="errorMessage"
        @retry="emit('retry')"
    />
    <TalosWindowLoadingState v-else :title="title" />
</template>
