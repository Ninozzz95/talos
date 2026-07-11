<script setup lang="ts">
import TalosThemeEngine from '../../settings/TalosThemeEngine.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
</script>

<template>
    <TalosThemeEngine
        :theme="context.theme"
        @change-theme="context.changeTheme"
        @theme-customization-changed="context.themeCustomizationChanged"
        @theme-draft-changed="context.themeDraftChanged"
    />
</template>
