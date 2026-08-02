<script setup lang="ts">
import { computed, ref } from 'vue'
import { ShieldCheck } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import type { TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import {
    TALOS_AGENT_TOOL_CONTROLS,
    type TalosAgentToolGroup,
} from '@/lib/tools/toolControlCatalog'
import type { TalosAgentToolId } from '@/lib/tools/toolControls'

const { t } = useTalosI18n()
const settings = useSettingsStore()
type AgentToolControl = typeof TALOS_AGENT_TOOL_CONTROLS[number]
// Hand-ordered, so a group added to the catalogue and forgotten here is a set
// of tools nobody can switch off. `models` arrived 2026-07-31 with the
// on-device download tools.
const groupOrder: readonly TalosAgentToolGroup[] = ['library', 'personal', 'web', 'create', 'models']
const groups = computed(() => groupOrder.map((id) => ({
    id,
    tools: TALOS_AGENT_TOOL_CONTROLS.filter((tool) => tool.group === id),
})))
const enabledCount = computed(() => TALOS_AGENT_TOOL_CONTROLS.filter(
    (tool) => settings.state.agent_tools[tool.id],
).length)
// Moved here from AI defaults on 2026-08-02, owner-approved: how far the
// model may go without asking is the frame around WHICH tools it may use,
// so it belongs above the list rather than at the foot of another screen.
const toolChoices = computed<TalosThemedSelectItem[]>(() => [
    { value: 'allow', label: t('agentTools.alwaysAllow') },
    { value: 'ask', label: t('agentTools.askEveryTime') },
    { value: 'deny', label: t('agentTools.neverAllow') },
])

function setToolPermission(action: 'read' | 'write' | 'outbound', value: string): void {
    void settings.setToolPermissions({ [action]: value as 'allow' | 'ask' | 'deny' })
}

const savingTool = ref<TalosAgentToolId | null>(null)
const revokingTool = ref<TalosAgentToolId | null>(null)
const saveError = ref<string | null>(null)

function title(tool: AgentToolControl): string {
    return t(`agentTools.tools.${tool.id}.title`)
}

function description(tool: AgentToolControl): string {
    return t(`agentTools.tools.${tool.id}.description`)
}

async function setEnabled(tool: AgentToolControl, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const enabled = input.checked
    // Native checkboxes flip before `change` runs. Keep the visual and
    // accessible state on the committed value until persistence succeeds.
    input.checked = settings.state.agent_tools[tool.id]
    if (savingTool.value !== null) return

    savingTool.value = tool.id
    saveError.value = null
    try {
        await settings.setAgentToolEnabled(tool.id, enabled)
    } catch {
        input.checked = settings.state.agent_tools[tool.id]
        saveError.value = t('agentTools.saveFailed', { tool: title(tool) })
    } finally {
        savingTool.value = null
    }
}

function hasSavedAuthorization(tool: AgentToolControl): boolean {
    return settings.state.tool_authorizations.grants[tool.id] !== undefined
}

async function revokeAuthorization(tool: AgentToolControl): Promise<void> {
    if (revokingTool.value !== null || savingTool.value !== null) return
    revokingTool.value = tool.id
    saveError.value = null
    try {
        await settings.revokeToolAuthorization(tool.id)
    } catch {
        saveError.value = t('agentTools.revokeFailed', { tool: title(tool) })
    } finally {
        revokingTool.value = null
    }
}
</script>

<template>
    <section
        data-testid="talos-settings-agent-tools"
        class="flex flex-col gap-4"
        :aria-busy="savingTool !== null || revokingTool !== null"
    >
        <div class="flex items-start gap-2">
            <ShieldCheck class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <div class="min-w-0">
                <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ t('agentTools.intro') }}</p>
                <p class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">{{ t('agentTools.policyNote') }}</p>
            </div>
        </div>

        <!-- Owner 2026-07-25: what the model may do on its own. Moved out of AI
             defaults 2026-08-02: trust first, then the eighteen capacities. -->
        <section data-testid="talos-tool-permissions">
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('agentTools.autonomousTitle') }}</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('agentTools.autonomousBody') }}
            </p>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('agentTools.readThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-read"
                    :model-value="settings.state.tools.read"
                    :items="toolChoices"
                    :aria-label="t('agentTools.readPermission')"
                    @update:model-value="setToolPermission('read', $event)"
                />
            </label>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('agentTools.writeThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-write"
                    :model-value="settings.state.tools.write"
                    :items="toolChoices"
                    :aria-label="t('agentTools.writePermission')"
                    @update:model-value="setToolPermission('write', $event)"
                />
            </label>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('agentTools.outboundThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-outbound"
                    :model-value="settings.state.tools.outbound"
                    :items="toolChoices"
                    :aria-label="t('agentTools.outboundPermission')"
                    @update:model-value="setToolPermission('outbound', $event)"
                />
                <span class="mt-1 block text-2xs leading-4 text-[var(--talos-muted)]">
                    {{ t('agentTools.outboundBody') }}
                </span>
            </label>
        </section>

        <p class="text-xs font-medium text-[var(--talos-text)]" aria-live="polite">
            {{ t('agentTools.enabledCount', { enabled: enabledCount, total: TALOS_AGENT_TOOL_CONTROLS.length }) }}
        </p>

        <p
            v-if="saveError"
            data-testid="agent-tools-save-error"
            role="alert"
            class="rounded-xl border border-[var(--talos-danger)]/35 bg-[var(--talos-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--talos-danger)]"
        >{{ saveError }}</p>

        <section v-for="group in groups" :key="group.id">
            <h4 class="mb-1.5 px-1 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                {{ t(`agentTools.groups.${group.id}`) }}
            </h4>
            <div class="divide-y divide-[var(--talos-border)] overflow-hidden rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70">
                <div
                    v-for="tool in group.tools"
                    :key="tool.id"
                    :data-agent-tool="tool.id"
                    class="relative flex min-h-14 items-center gap-3 px-3 py-2.5"
                >
                    <label
                        :for="`talos-agent-tool-${tool.id}`"
                        :data-agent-tool-label="tool.id"
                        class="absolute inset-0 z-0 cursor-pointer"
                    >
                        <span class="sr-only">{{ title(tool) }}</span>
                    </label>
                    <span class="pointer-events-none relative z-10 min-w-0 flex-1">
                        <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ title(tool) }}</span>
                        <span class="mt-0.5 block text-xs leading-4 text-[var(--talos-muted)]">{{ description(tool) }}</span>
                        <span class="mt-1.5 flex flex-wrap gap-1" aria-hidden="true">
                            <span
                                v-for="action in tool.actions"
                                :key="action"
                                :data-agent-tool-action="action"
                                class="rounded-md border border-[var(--talos-border)] px-1.5 py-0.5 text-3xs uppercase tracking-wide text-[var(--talos-muted)]"
                            >{{ t(`agentTools.actions.${action}`) }}</span>
                        </span>
                        <span
                            v-if="hasSavedAuthorization(tool)"
                            class="mt-1.5 inline-flex rounded-full bg-[var(--talos-accent)]/12 px-2 py-0.5 text-3xs font-medium text-[var(--talos-accent)]"
                        >{{ t('agentTools.alwaysAllowed') }}</span>
                    </span>
                    <span class="relative z-20 flex shrink-0 flex-col items-end gap-1">
                        <button
                            v-if="hasSavedAuthorization(tool)"
                            type="button"
                            :data-agent-tool-revoke="tool.id"
                            class="talos-pressable min-h-8 rounded-full px-2 text-2xs font-medium text-[var(--talos-accent)]"
                            :disabled="revokingTool !== null || savingTool !== null"
                            @click="revokeAuthorization(tool)"
                        >{{ t('agentTools.askAgain') }}</button>
                        <label
                            :for="`talos-agent-tool-${tool.id}`"
                            class="flex min-h-11 cursor-pointer items-center"
                        >
                            <input
                                :id="`talos-agent-tool-${tool.id}`"
                                type="checkbox"
                                role="switch"
                                class="peer sr-only"
                                :aria-label="t('agentTools.enableAria', { tool: title(tool) })"
                                :checked="settings.state.agent_tools[tool.id]"
                                :disabled="savingTool !== null || revokingTool !== null"
                                @change="setEnabled(tool, $event)"
                            >
                            <span
                                data-agent-tool-toggle-visual
                                aria-hidden="true"
                                class="pointer-events-none relative block h-6 w-11 rounded-full border border-[var(--talos-border)] bg-[var(--talos-input)] transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-[var(--talos-card)] after:shadow-sm after:transition-transform peer-checked:border-[var(--talos-accent)] peer-checked:bg-[var(--talos-accent)] peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--talos-ring)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--talos-panel)]"
                            />
                        </label>
                    </span>
                </div>
            </div>
        </section>
    </section>
</template>
