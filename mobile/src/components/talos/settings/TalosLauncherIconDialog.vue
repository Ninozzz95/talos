<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { useLauncherIconController } from '@/services/launcherIcon'
import { talosThemePreset } from '@/lib/talosThemes'
import finalFrame from '@/assets/talosBootFinalFrame.json'

/**
 * Owner 2026-07-24 — consent prompt for the per-theme launcher icon. Switching
 * the enabled `<activity-alias>` only redraws on the launcher after the app
 * restarts, so the user chooses "restart now" (apply + exit) or "later" (apply
 * on next close). The card previews the exact target icon (mark in the preset
 * accent over its background) so the choice is concrete.
 */
const controller = useLauncherIconController()
const { t } = useTalosI18n()
const pending = computed(() => controller.state.pending)
const preset = computed(() => (pending.value ? talosThemePreset(pending.value.target) : null))
const adaptiveTransform = [
    `translate(${finalFrame.adaptive.pivotX} ${finalFrame.adaptive.pivotY})`,
    `scale(${finalFrame.adaptive.scale})`,
    `translate(${-finalFrame.adaptive.pivotX} ${-finalFrame.adaptive.pivotY})`,
].join(' ')
const markTransform = `translate(${finalFrame.mark.translateX} ${finalFrame.mark.translateY})`
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
                        <svg
                            data-testid="talos-launcher-icon-final-frame"
                            :viewBox="finalFrame.viewBox"
                            class="size-20"
                            aria-hidden="true"
                        >
                            <g :transform="adaptiveTransform">
                                <g
                                    :transform="markTransform"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path
                                        class="talos-launcher-hex"
                                        :d="finalFrame.mark.hex.path"
                                        fill="none"
                                        :stroke="preset.preview.accent"
                                        :stroke-width="finalFrame.mark.hex.strokeWidth"
                                        :stroke-opacity="finalFrame.mark.hex.strokeOpacity"
                                    />
                                    <path
                                        v-for="edge in finalFrame.mark.edges"
                                        :key="edge.path"
                                        class="talos-launcher-edge"
                                        :d="edge.path"
                                        fill="none"
                                        :stroke="preset.preview.accent"
                                        :stroke-width="finalFrame.mark.edgeStrokeWidth"
                                    />
                                    <circle
                                        v-for="node in finalFrame.mark.nodes"
                                        :key="`${node.cx}:${node.cy}:${node.r}`"
                                        class="talos-launcher-node"
                                        :cx="node.cx"
                                        :cy="node.cy"
                                        :r="node.r"
                                        :fill="preset.preview.accent"
                                        :stroke="preset.preview.accent"
                                        :stroke-width="finalFrame.mark.nodeStrokeWidth"
                                    />
                                    <g
                                        v-for="branch in finalFrame.mark.branches"
                                        :key="branch.rotation"
                                        :transform="`translate(250 225) rotate(${branch.rotation})`"
                                    >
                                        <path
                                            class="talos-launcher-edge"
                                            :d="branch.edgePath"
                                            fill="none"
                                            :stroke="preset.preview.accent"
                                            :stroke-width="finalFrame.mark.edgeStrokeWidth"
                                        />
                                        <circle
                                            class="talos-launcher-node"
                                            :cx="branch.node.cx"
                                            :cy="branch.node.cy"
                                            :r="branch.node.r"
                                            :fill="preset.preview.accent"
                                            :stroke="preset.preview.accent"
                                            :stroke-width="finalFrame.mark.nodeStrokeWidth"
                                        />
                                    </g>
                                </g>
                            </g>
                        </svg>
                    </span>

                    <h2 id="talos-launcher-icon-title" class="mt-4 text-lg font-semibold">{{ t('launcher.updateTitle') }}</h2>
                    <p class="mt-1 text-sm leading-5 text-[var(--talos-muted)]">
                        {{ t('launcher.restartDetail', { theme: preset.shortLabel }) }}
                    </p>
                </div>

                <div class="mt-6 flex flex-col gap-2">
                    <Button
                        type="button"
                        data-testid="talos-launcher-icon-restart"
                        class="talos-pressable min-h-touch w-full rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                        @click="controller.confirmNow()"
                    >
                        {{ t('launcher.restartNow') }}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-launcher-icon-later"
                        class="talos-pressable min-h-touch w-full rounded-full text-sm"
                        @click="controller.later()"
                    >
                        {{ t('launcher.later') }}
                    </Button>
                    <button
                        type="button"
                        data-testid="talos-launcher-icon-dismiss"
                        class="talos-pressable mt-1 min-h-9 text-xs text-[var(--talos-muted)]"
                        @click="controller.dismiss()"
                    >
                        {{ t('launcher.keepCurrent') }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>
