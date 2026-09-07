<script setup lang="ts">
import { computed } from 'vue'
import { talosThemeCustomizationStyle, type TalosThemePreset } from '../../../../lib/talosThemes'
import { talosScalePercentLabel } from '../../../../lib/talosUiScale'
import type { TalosChatLayoutPreferences } from '../../../../lib/talosTypes'
import type { ThemeCustomizationForm } from './themeEngineTypes'

const props = defineProps<{
    preset: TalosThemePreset
    customization: ThemeCustomizationForm
    chatLayout: TalosChatLayoutPreferences
}>()

const fontFamily = computed(() => {
    if (props.customization.font === 'manrope') {
        return 'Manrope, "Instrument Sans"'
    }

    if (props.customization.font === 'mono') {
        return '"JetBrains Mono"'
    }

    if (props.customization.font === 'system') {
        return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }

    if (props.customization.font === 'display') {
        return 'Sora, Manrope'
    }

    if (props.customization.font === 'serif') {
        return '"Source Serif 4", "Instrument Sans"'
    }

    return '"Instrument Sans", Manrope'
})

const previewStyle = computed(() => ({
    ...talosThemeCustomizationStyle(props.customization),
    '--talos-font-ui': fontFamily.value,
    '--talos-font-display': fontFamily.value,
    '--talos-preview-font': fontFamily.value,
}))

const layoutLabel = computed(() => `${talosScalePercentLabel(props.chatLayout.message_scale)} messages, ${props.chatLayout.composer_mode} composer`)
</script>

<template>
    <section
        data-testid="talos-theme-product-preview"
        aria-label="Product preview"
        class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-background)]"
        :style="previewStyle"
    >
        <header class="flex min-h-10 items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-panel)] px-3" data-testid="talos-theme-preview-chrome">
            <div class="min-w-0">
                <div class="truncate text-xs font-semibold text-[var(--talos-text)]">TALOS / {{ preset.shortLabel }}</div>
                <div class="truncate text-[10px] uppercase tracking-[0.12em] text-[var(--talos-muted)]">Theme product preview</div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                <span class="h-2 w-2 rounded-full bg-[var(--talos-secondary)]"></span>
                <span class="h-2 w-2 rounded-full bg-[var(--talos-accent)]"></span>
                <span class="h-2 w-2 rounded-full bg-[var(--talos-border-strong)]"></span>
            </div>
        </header>

        <div class="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_11rem]">
            <div class="min-w-0 space-y-3" :style="{ fontFamily }">
                <div class="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.1em] text-[var(--talos-muted)]">
                    <span>Conversation</span>
                    <span data-testid="talos-theme-preview-layout">{{ layoutLabel }}</span>
                </div>

                <div class="flex justify-end">
                    <div class="max-w-[80%] rounded-md border border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] px-2.5 py-2 text-xs text-[var(--talos-text)]" data-testid="talos-theme-preview-message">
                        Run the deterministic validation pass.
                    </div>
                </div>

                <div class="max-w-[88%] rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 py-2 text-xs text-[var(--talos-text)]">
                    <div class="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--talos-secondary)]">Assistant</div>
                    <p class="leading-5">The run is ready. Evidence stays attached to the response.</p>
                    <pre class="mt-2 overflow-hidden rounded-sm border border-[var(--talos-border)] bg-[var(--talos-background)] p-2 text-[10px] leading-4 text-[var(--talos-secondary)]" data-testid="talos-theme-preview-code"><code>const status = "ready"</code></pre>
                </div>

                <div class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-1.5 text-[10px] text-[var(--talos-muted)]" data-testid="talos-theme-preview-input">
                    <input class="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--talos-text)] outline-none" value="Ask TALOS a follow-up" readonly aria-label="Theme preview input">
                    <span class="rounded-sm bg-[var(--talos-accent)] px-2 py-1 font-semibold text-[var(--talos-accent-text)]">Send</span>
                </div>

                <div class="flex flex-wrap items-center gap-2 text-[10px]" data-testid="talos-theme-preview-status">
                    <span class="inline-flex items-center gap-1 text-[var(--talos-secondary)]"><span class="h-1.5 w-1.5 rounded-full bg-[var(--talos-secondary)]"></span>Run succeeded</span>
                    <span class="text-[var(--talos-muted)]">42 ms</span>
                    <span class="border-l border-[var(--talos-border)] pl-2 text-[var(--talos-muted)]" data-testid="talos-theme-preview-evidence">Evidence attached</span>
                </div>
            </div>

            <aside class="border-t border-[var(--talos-border)] pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
                <div class="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--talos-muted)]">Palette</div>
                <ul class="mt-2 space-y-1.5 text-[10px] text-[var(--talos-muted)]">
                    <li v-for="color in [
                        { label: 'Background', value: customization.background },
                        { label: 'Panel', value: customization.panel },
                        { label: 'Text', value: customization.text },
                        { label: 'Accent', value: customization.accent },
                        { label: 'Secondary', value: customization.secondary },
                    ]" :key="color.label" class="flex items-center justify-between gap-2">
                        <span>{{ color.label }}</span>
                        <span class="flex items-center gap-1 font-mono text-[9px] text-[var(--talos-text)]"><span class="h-3 w-3 rounded-sm border border-[var(--talos-border)]" :style="{ background: color.value }"></span>{{ color.value }}</span>
                    </li>
                </ul>
                <div class="mt-3 border-t border-[var(--talos-border)] pt-3 text-[10px] text-[var(--talos-muted)]">
                    <div class="font-semibold text-[var(--talos-text)]">{{ customization.font }}</div>
                    <div class="mt-1">{{ customization.density }} density</div>
                    <div>{{ customization.radius }} corners</div>
                </div>
            </aside>
        </div>
    </section>
</template>
