<script setup lang="ts">
import Button from '../../../ui/Button.vue'
import Input from '../../../ui/Input.vue'
import TalosThemedSelect from '../../ui/TalosThemedSelect.vue'
import TalosGuideInfoButton from '../../guide/TalosGuideInfoButton.vue'
import {
    TALOS_THEME_AREA_OPTIONS,
    TALOS_THEME_AREA_TOKEN_OPTIONS,
    type TalosThemeAreaId,
    type TalosThemeAreaTokenKey,
} from '../../../../lib/talosThemes'
import type { AreaTokenForm } from './themeEngineTypes'

const props = defineProps<{
    selectedArea: TalosThemeAreaId
    form: AreaTokenForm
    disabled: boolean
    saving: boolean
    hasDraft: boolean
}>()

const emit = defineEmits<{
    'update:selectedArea': [value: TalosThemeAreaId]
    'update:form': [value: AreaTokenForm]
    save: []
    reset: []
}>()

function updateToken(key: TalosThemeAreaTokenKey, value: unknown) {
    emit('update:form', { ...props.form, [key]: String(value ?? '') })
}
</script>

<template>
    <section
        id="talos-theme-control-panel-advanced"
        role="tabpanel"
        aria-labelledby="talos-theme-control-tab-advanced"
        aria-label="Advanced theme tokens"
        class="space-y-4"
    >
        <div>
            <div class="flex items-center gap-1.5">
                <h4 class="text-sm font-semibold text-[var(--talos-text)]">Advanced area tokens</h4>
                <TalosGuideInfoButton guide-id="theme.advanced" compact side="bottom" />
            </div>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Override specific interface zones through explicit, safe CSS variables.</p>
        </div>
        <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
            <span>Area</span>
            <TalosThemedSelect :model-value="selectedArea" :items="TALOS_THEME_AREA_OPTIONS" aria-label="Area" :disabled="disabled" @update:model-value="emit('update:selectedArea', $event as TalosThemeAreaId)" />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
            <label v-for="token in TALOS_THEME_AREA_TOKEN_OPTIONS" :key="token.value" class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                <span>{{ token.label }}</span>
                <Input :model-value="form[token.value]" :aria-label="`Area ${token.value}`" :disabled="disabled" @update:model-value="updateToken(token.value, $event)" />
            </label>
        </div>
        <div class="flex flex-wrap gap-2">
            <Button type="button" :disabled="saving || !hasDraft || disabled" @click="emit('save')">Save area tokens</Button>
            <Button type="button" variant="outline" :disabled="saving || disabled" @click="emit('reset')">Reset area</Button>
        </div>
    </section>
</template>
