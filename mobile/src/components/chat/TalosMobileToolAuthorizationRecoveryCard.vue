<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, RotateCcw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type {
    TalosToolAuthorizationRecoveryToolView,
} from '@/lib/tools/toolAuthorizationCheckpoint'

/**
 * ⛔⭐ Due schede in una, e la differenza NON è cosmetica.
 *
 * - Senza `error`: il turno si era interrotto a metà. Si può riprendere, e il
 *   pericolo è di RIFARE un'azione già fatta — da qui l'avviso sul duplicato.
 * - Con `error`: la richiesta è caduta. Non c'è niente da riprendere e niente
 *   che possa essere già successo: nessuno strumento è mai partito. Offrire
 *   «Riprova» qui sarebbe un pulsante che non può funzionare.
 */
const props = defineProps<{
    sessionTitle: string
    tools: readonly TalosToolAuthorizationRecoveryToolView[]
    recoveryCount: number
    busy: boolean
    error?: string | null
}>()

const caduta = computed(() => typeof props.error === 'string' && props.error.length > 0)

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
                        {{ $t('chat.authorizationFromChat') }} {{ sessionTitle }}
                    </p>
                    <h2
                        id="talos-tool-recovery-title"
                        class="mt-0.5 text-md font-semibold text-[var(--talos-text)]"
                    >{{ caduta
                        ? $t('chat.authorizationDroppedTitle')
                        : $t('chat.authorizationRecoveryTitle') }}</h2>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                        {{ caduta
                            ? $t('chat.authorizationDroppedDescription')
                            : $t('chat.authorizationRecoveryDescription') }}
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
                v-if="caduta && tools.length === 0"
                data-testid="talos-tool-recovery-unknown-tools"
                class="mt-3 text-xs leading-5 text-[var(--talos-muted)]"
            >
                {{ $t('chat.authorizationDroppedUnknownTools') }}
            </p>

            <p
                v-if="caduta"
                data-testid="talos-tool-recovery-reason"
                class="mt-3 rounded-xl bg-[var(--talos-panel-soft)] px-3 py-2 font-mono text-2xs leading-5 text-[var(--talos-muted)]"
            >
                {{ $t('chat.authorizationDroppedReason', { code: error }) }}
            </p>
            <p
                v-else
                data-testid="talos-tool-recovery-warning"
                class="mt-3 rounded-xl bg-[var(--talos-warning,var(--talos-accent))]/10 px-3 py-2 text-xs leading-5 text-[var(--talos-text)]"
            >
                {{ $t('chat.authorizationRecoveryDuplicateWarning') }}
            </p>

            <p class="mt-2 text-2xs text-[var(--talos-muted)]">
                {{ $t('chat.authorizationRecoveryCount', { count: recoveryCount }) }}
            </p>

            <div class="mt-4 gap-2" :class="caduta ? 'grid grid-cols-1' : 'grid grid-cols-2'">
                <Button
                    type="button"
                    data-testid="talos-tool-recovery-cancel"
                    class="talos-pressable min-h-touch rounded-full text-sm"
                    :class="caduta
                        ? 'bg-[var(--talos-accent)] font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                        : 'border border-[var(--talos-border)] bg-transparent text-[var(--talos-text)]'"
                    :disabled="busy"
                    @click="emit('cancel')"
                >{{ caduta
                    ? $t('chat.authorizationDroppedClose')
                    : $t('chat.authorizationRecoveryCancel') }}</Button>
                <Button
                    v-if="!caduta"
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
