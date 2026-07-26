<script setup lang="ts">
import TalosThemedSelect, { type TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import { useSettingsStore, type TalosUtilityModelMode } from '@/stores/settings'
import { TALOS_TONE_PRESETS, isTalosToneId } from '@/lib/tone'

const settings = useSettingsStore()
const modeItems = [
    { value: 'same_as_chat', label: 'Same as chat' },
    { value: 'default_profile', label: 'Use default profile' },
]

// F3-T4 (owner #11): selectable assistant tone; the model may suggest a
// better fit via toast, but only the user switches it (here or from the toast).
const toneItems = TALOS_TONE_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label,
}))

function setTone(value: string): void {
    if (!isTalosToneId(value)) return
    void settings.setTone(value)
}

function setMode(key: 'utility_model_mode' | 'research_model_mode', value: string): void {
    if (value !== 'same_as_chat' && value !== 'default_profile') return
    void settings.setAiDefaults({ [key]: value as TalosUtilityModelMode })
}

function setVision(event: Event): void {
    void settings.setAiDefaults({ vision_enabled: (event.target as HTMLInputElement).checked })
}

// Library behaviour lives in the shell prefs but belongs on this panel.
/**
 * Owner 2026-07-25: the model's tools are governed per ACTION TYPE, and the
 * user owns that setting. The wording avoids the word "tool" where it can:
 * what matters to a person is whether TALOS may READ their things, CHANGE
 * them, or SEND them anywhere.
 */
const TOOL_CHOICES: TalosThemedSelectItem[] = [
    { value: 'allow', label: 'Always allow' },
    { value: 'ask', label: 'Ask me every time' },
    { value: 'deny', label: 'Never allow' },
]

function setToolPermission(action: 'read' | 'write' | 'outbound', value: string): void {
    void settings.setToolPermissions({ [action]: value as 'allow' | 'ask' | 'deny' })
}

function setShellFlag(key: 'library_context_enabled' | 'library_autosave_generated', event: Event): void {
    void settings.setShell({ [key]: (event.target as HTMLInputElement).checked })
}
</script>

<template>
    <div class="space-y-4">
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Assistant tone</span>
            <TalosThemedSelect
                class="mt-2"
                :model-value="settings.state.tone.preset"
                :items="toneItems"
                aria-label="Assistant tone"
                @update:model-value="setTone"
            />
            <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">
                The model may suggest a better-fitting tone for a conversation — you decide from the notification.
            </span>
        </label>

        <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Utility model mode</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.ai_defaults.utility_model_mode"
                    :items="modeItems"
                    aria-label="Utility model mode"
                    @update:model-value="setMode('utility_model_mode', $event)"
                />
            </label>
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Research model mode</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="settings.state.ai_defaults.research_model_mode"
                    :items="modeItems"
                    aria-label="Research model mode"
                    @update:model-value="setMode('research_model_mode', $event)"
                />
            </label>
        </div>

        <label class="flex min-h-14 cursor-pointer items-start justify-between gap-3 border-y border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Vision routing preference</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">Prefer a vision-capable profile when an image is attached.</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                aria-label="Vision routing preference"
                :checked="settings.state.ai_defaults.vision_enabled"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setVision"
            >
        </label>

        <!-- Owner 2026-07-25: Library behaviour belongs to AI defaults (what the
             model may read / write), not to Appearance. -->
        <label class="flex min-h-14 cursor-pointer items-start justify-between gap-3 border-b border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Let chats use your Library</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">The model can reference your global Library (every chat) as context, with each document's origin chat. Adds tokens per message.</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                aria-label="Let chats use your Library"
                :checked="settings.state.shell.library_context_enabled"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setShellFlag('library_context_enabled', $event)"
            >
        </label>

        <label class="flex min-h-14 cursor-pointer items-start justify-between gap-3 border-b border-[var(--talos-border)] py-3">
            <span>
                <span class="block text-sm font-semibold text-[var(--talos-text)]">Auto-save generated files</span>
                <span class="mt-1 block text-xs leading-5 text-[var(--talos-muted)]">When a chat generates a file or document, save it to your Library automatically.</span>
            </span>
            <input
                type="checkbox"
                role="switch"
                aria-label="Auto-save generated files to the Library"
                :checked="settings.state.shell.library_autosave_generated"
                class="mt-1 h-5 w-9 accent-[var(--talos-accent)]"
                @change="setShellFlag('library_autosave_generated', $event)"
            >
        </label>

        <!-- Owner 2026-07-25: what the model may do on its own. -->
        <section class="pt-4" data-testid="talos-tool-permissions">
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">What TALOS may do on its own</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                The model can use tools while answering — searching your Library, reading a
                document, checking your notes. These decide what it may do without stopping to ask.
            </p>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">Read your things</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-read"
                    :model-value="settings.state.tools.read"
                    :items="TOOL_CHOICES"
                    aria-label="Permission for reading"
                    @update:model-value="setToolPermission('read', $event)"
                />
            </label>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">Create or change things</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-write"
                    :model-value="settings.state.tools.write"
                    :items="TOOL_CHOICES"
                    aria-label="Permission for writing"
                    @update:model-value="setToolPermission('write', $event)"
                />
            </label>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">Send anything off this device</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-outbound"
                    :model-value="settings.state.tools.outbound"
                    :items="TOOL_CHOICES"
                    aria-label="Permission for sending data off the device"
                    @update:model-value="setToolPermission('outbound', $event)"
                />
                <span class="mt-1 block text-2xs leading-4 text-[var(--talos-muted)]">
                    Nothing in TALOS does this today. The setting exists so the answer is already
                    "never" the day something does.
                </span>
            </label>
        </section>
    </div>
</template>
