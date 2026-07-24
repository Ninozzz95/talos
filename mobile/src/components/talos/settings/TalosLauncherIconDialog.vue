<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useLauncherIconController } from '@/services/launcherIcon'
import { talosThemePreset } from '@/lib/talosThemes'

/**
 * Owner 2026-07-24 — consent prompt for the per-theme launcher icon. Switching
 * the enabled `<activity-alias>` only redraws on the launcher after the app
 * restarts, so the user chooses "restart now" (apply + exit) or "later" (apply
 * on next close). The card previews the exact target icon (mark in the preset
 * accent over its background) so the choice is concrete.
 */
const controller = useLauncherIconController()
const pending = computed(() => controller.state.pending)
const preset = computed(() => (pending.value ? talosThemePreset(pending.value.target) : null))
</script>

<template>
    <Teleport to="body">
        <div
            v-if="pending && preset"
            data-testid="talos-launcher-icon-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="talos-launcher-icon-title"
            class="fixed inset-0 z-[86] flex items-end justify-center bg-black/50 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:items-center"
            @click.self="controller.dismiss()"
            @keydown.escape="controller.dismiss()"
        >
            <div
                class="w-full max-w-sm rounded-3xl border border-[var(--talos-border)] bg-[var(--talos-window-bg,var(--talos-background))] p-6 text-[var(--talos-text)] shadow-2xl"
            >
                <div class="flex flex-col items-center text-center">
                    <!-- Live preview of the target launcher icon. -->
                    <span
                        class="flex size-20 items-center justify-center rounded-[22px] shadow-inner"
                        :style="{ backgroundColor: preset.preview.background, color: preset.preview.accent }"
                        aria-hidden="true"
                    >
                        <svg viewBox="0 0 500 500" class="size-14" fill="none" stroke="currentColor"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path stroke-width="12" d="M 218 123.5 L 121.9 179 A 21 21 0 0 0 111.5 197 L 111.5 333 A 21 21 0 0 0 121.9 351 L 239.6 419 A 21 21 0 0 0 260.4 419 L 378.1 351 A 21 21 0 0 0 388.5 333 L 388.5 197 A 21 21 0 0 0 378.1 179 L 282 123.5" />
                            <g stroke-width="9">
                                <circle cx="250" cy="105" r="22" />
                                <circle cx="250" cy="225" r="18" />
                                <circle cx="250" cy="338" r="14" />
                                <path d="M 250 140 L 250 195" />
                                <path d="M 250 255 L 250 315" />
                                <g transform="translate(250, 225) rotate(45)">
                                    <path d="M 0 32 L 0 95" />
                                    <circle cx="0" cy="118" r="14" />
                                </g>
                                <g transform="translate(250, 225) rotate(-45)">
                                    <path d="M 0 32 L 0 95" />
                                    <circle cx="0" cy="118" r="14" />
                                </g>
                            </g>
                        </svg>
                    </span>

                    <h2 id="talos-launcher-icon-title" class="mt-4 text-lg font-semibold">Update the app icon?</h2>
                    <p class="mt-1 text-sm leading-5 text-[var(--talos-muted)]">
                        TALOS needs to restart to switch its home-screen icon to the
                        <span class="font-medium text-[var(--talos-text)]">{{ preset.shortLabel }}</span> theme.
                    </p>
                </div>

                <div class="mt-6 flex flex-col gap-2">
                    <Button
                        type="button"
                        data-testid="talos-launcher-icon-restart"
                        class="talos-pressable min-h-11 w-full rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                        @click="controller.confirmNow()"
                    >
                        Restart now
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-launcher-icon-later"
                        class="talos-pressable min-h-11 w-full rounded-full text-sm"
                        @click="controller.later()"
                    >
                        Later — change on next close
                    </Button>
                    <button
                        type="button"
                        data-testid="talos-launcher-icon-dismiss"
                        class="talos-pressable mt-1 min-h-9 text-xs text-[var(--talos-muted)]"
                        @click="controller.dismiss()"
                    >
                        Keep the current icon
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>
