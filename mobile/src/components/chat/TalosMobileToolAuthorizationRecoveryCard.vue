<script setup lang="ts">
import { AlertTriangle, RotateCcw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type {
    TalosToolAuthorizationRecoveryToolView,
} from '@/lib/tools/toolAuthorizationCheckpoint'

defineProps<{
    sessionTitle: string
    tools: readonly TalosToolAuthorizationRecoveryToolView[]
    recoveryCount: number
    busy: boolean
}>()

const emit = defineEmits<{
    retry: []
    cancel: []
    later: []
}>()
</script>

<template>
    <Teleport to="body">
        <section
            data-testid="talos-tool-recovery"
            role="dialog"
            aria-labelledby="talos-tool-recovery-title"
            tabindex="-1"
            class="pointer-events-auto fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[96] mx-auto w-auto max-w-[560px] rounded-2xl border border-[var(--talos-warning,var(--talos-border))] bg-[var(--talos-panel)] p-4 shadow-2xl"
            @keydown.esc.stop="emit('later')"
        >
            <div class="flex items-start gap-3">
                <AlertTriangle
                    class="mt-0.5 size-5 shrink-0 text-[var(--talos-warning,var(--talos-accent))]"
                    aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                    <p class="text-2xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ $t('chat.authorizationFromChat', { title: sessionTitle }) }}
                    </p>
                    <h2
                        id="talos-tool-recovery-title"
                        class="mt-0.5 text-md font-semibold text-[var(--talos-text)]"
                    >{{ $t('chat.authorizationRecoveryTitle') }}</h2>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        {{ $t('chat.authorizationRecoveryDescription') }}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-testid="talos-tool-recovery-later"
                    :aria-label="$t('chat.authorizationLater')"
                    class="talos-pressable shrink-0 rounded-full"
                    @click="emit('later')"
                >
                    <X class="size-4" aria-hidden="true" />
                </Button>
            </div>

            <div class="mt-3 space-y-2">
                <div
                    v-for="tool in tools"
                    :key="`${tool.tool}:${tool.actions.join(',')}`"
                    class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2"
                >
                    <p class="text-xs font-medium text-[var(--talos-text)]">
                        {{ $t(`agentTools.tools.${tool.tool}.title`) }}
                    </p>
                    <div class="mt-1 flex flex-wrap gap-1.5">
                        <span
                            v-for="action in tool.actions"
                            :key="action"
                            class="rounded-full border border-[var(--talos-border)] px-2 py-0.5 text-2xs text-[var(--talos-muted)]"
                        >{{ $t(`chat.toolAction.${action}`) }}</span>
                    </div>
                </div>
            </div>

            <p
                data-testid="talos-tool-recovery-warning"
                class="mt-3 rounded-xl bg-[var(--talos-warning,var(--talos-accent))]/10 px-3 py-2 text-xs leading-5 text-[var(--talos-text)]"
            >
                {{ $t('chat.authorizationRecoveryDuplicateWarning') }}
            </p>

            <p class="mt-2 text-2xs text-[var(--talos-muted)]">
                {{ $t('chat.authorizationRecoveryCount', { count: recoveryCount }) }}
            </p>

            <div class="mt-4 grid grid-cols-2 gap-2">
                <Button
                    type="button"
                    data-testid="talos-tool-recovery-cancel"
                    class="talos-pressable min-h-touch rounded-full border border-[var(--talos-border)] bg-transparent text-sm text-[var(--talos-text)]"
                    :disabled="busy"
                    @click="emit('cancel')"
                >{{ $t('chat.authorizationRecoveryCancel') }}</Button>
                <Button
                    type="button"
                    data-testid="talos-tool-recovery-retry"
                    class="talos-pressable min-h-touch rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    :disabled="busy"
                    @click="emit('retry')"
                >
                    <RotateCcw class="mr-1.5 size-4" aria-hidden="true" />
                    {{ busy
                        ? $t('chat.authorizationRecoveryRetrying')
                        : $t('chat.authorizationRecoveryRetry') }}
                </Button>
            </div>
        </section>
    </Teleport>
</template>
