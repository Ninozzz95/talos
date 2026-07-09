<script setup lang="ts">
import Button from '../../ui/Button.vue'
import Input from '../../ui/Input.vue'
import Switch from '../../ui/Switch.vue'

type AgentToolsPreferences = {
    tool_call_limit: number
    max_steps_per_message: number
    code_enabled: boolean
    search_enabled: boolean
    documents_enabled: boolean
    media_enabled: boolean
    knowledge_enabled: boolean
    system_enabled: boolean
}

type AgentToolToggleKey = keyof Omit<AgentToolsPreferences, 'tool_call_limit' | 'max_steps_per_message'>

defineProps<{
    agentTools: AgentToolsPreferences
    agentToolOptions: Array<{ key: AgentToolToggleKey; label: string }>
}>()

const emit = defineEmits<{
    updateToolCallLimit: [limit: number]
    updateMaxStepsPerMessage: [steps: number]
    updateAgentTool: [key: AgentToolToggleKey, enabled: boolean]
    openModule: [id: string]
}>()
</script>

<template>
    <div class="grid gap-3 md:grid-cols-2">
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Tool call limit</span>
            <Input :model-value="agentTools.tool_call_limit" class="mt-2" type="number" min="0" aria-label="Tool call limit" @update:model-value="(value) => emit('updateToolCallLimit', Number(value))" />
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Max steps per message</span>
            <Input :model-value="agentTools.max_steps_per_message" class="mt-2" type="number" min="1" aria-label="Max steps per message" @update:model-value="(value) => emit('updateMaxStepsPerMessage', Number(value))" />
        </label>
    </div>
    <div class="grid gap-2 md:grid-cols-2">
        <label v-for="item in agentToolOptions" :key="item.key" class="flex cursor-pointer items-center justify-between rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
            <span>{{ item.label }}</span>
            <Switch :model-value="agentTools[item.key]" :aria-label="item.label" @update:model-value="(value) => emit('updateAgentTool', item.key, Boolean(value))" />
        </label>
    </div>
    <Button size="sm" variant="secondary" @click="emit('openModule', 'tools')">Open Tool Registry</Button>
</template>
