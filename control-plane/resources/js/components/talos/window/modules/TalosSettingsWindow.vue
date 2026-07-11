<script setup lang="ts">
import TalosSettingsCenter from '../../settings/TalosSettingsCenter.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <TalosSettingsCenter
        :model-profiles="context.modelProfiles"
        :context-sets="context.contextSets"
        :selected-model-profile-id="context.selectedModelProfileId"
        :selected-context-set-id="context.selectedContextSetId"
        :focused-tab="context.settingsRequestedTab"
        :focused-tab-revision="context.settingsRequestedTabRevision"
        :authenticated="context.authenticated"
        :auth-user-name="context.authUserName"
        :logout-url="context.logoutUrl"
        :csrf-token="context.csrfToken"
        @select-model="context.selectModel"
        @select-context="context.selectContext"
        @change-theme="context.changeTheme"
        @open-module="context.openModule"
        @saved="context.settingsSaved"
    />
</template>
