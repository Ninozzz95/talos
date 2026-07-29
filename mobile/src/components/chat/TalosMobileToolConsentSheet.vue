<script setup lang="ts">
import { computed } from 'vue'
import { ShieldAlert, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosToolAction } from '@/lib/tools/permissionTypes'

const MAX_RENDERED_ARGUMENTS = 4_096

const props = defineProps<{
    title: string
    description: string
    input: unknown
    actions: readonly TalosToolAction[]
    sessionTitle: string
    pendingCount: number
    allowPersistent: boolean
}>()

const emit = defineEmits<{
    allowOnce: []
    alwaysAllow: []
    deny: []
    later: []
}>()

const rendered = computed(() => {
    let value: string
    try {
        value = JSON.stringify(props.input, null, 2)
    } catch {
        value = String(props.input)
    }
    if (value.length <= MAX_RENDERED_ARGUMENTS) return value
    return `${value.slice(0, MAX_RENDERED_ARGUMENTS)}\n…`
})
</script>

<template>
    <Teleport to="body">
        <section
            data-testid="talos-tool-consent"
            role="dialog"
            aria-labelledby="talos-tool-authorization-title"
            tabindex="-1"
            class="pointer-events-auto fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[95] mx-auto w-auto max-w-[560px] rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4 shadow-2xl"
            @keydown.esc.stop="emit('later')"
        >
            <div class="flex items-start gap-3">
                <ShieldAlert
                    class="mt-0.5 size-5 shrink-0 text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                    <p class="text-2xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ $t('chat.authorizationFromChat', { title: sessionTitle }) }}
                    </p>
                    <h2
                        id="talos-tool-authorization-title"
                        class="mt-0.5 text-md font-semibold text-[var(--talos-text)]"
                    >{{ title }}</h2>
                    <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">
                        {{ description }}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-testid="talos-tool-consent-later"
                    :aria-label="$t('chat.authorizationLater')"
                    class="talos-pressable shrink-0 rounded-full"
                    @click="emit('later')"
                >
                    <X class="size-4" aria-hidden="true" />
                </Button>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                    v-for="action in actions"
                    :key="action"
                    class="rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 py-1 text-2xs font-medium text-[var(--talos-muted)]"
                >{{ $t(`chat.toolAction.${action}`) }}</span>
                <span class="ml-auto text-2xs text-[var(--talos-muted)]">
                    {{ $t('chat.pendingAuthorizationCount', { count: pendingCount }) }}
                </span>
            </div>

            <pre
                data-testid="talos-tool-consent-input"
                class="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-2 text-2xs leading-4 text-[var(--talos-muted)]"
            >{{ rendered }}</pre>

            <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Button
                    type="button"
                    data-testid="talos-tool-consent-deny"
                    class="talos-pressable min-h-11 rounded-full border border-[var(--talos-border)] bg-transparent text-sm text-[var(--talos-text)]"
                    @click="emit('deny')"
                >{{ $t('chat.denyTool') }}</Button>
                <Button
                    type="button"
                    data-testid="talos-tool-consent-allow-once"
                    class="talos-pressable min-h-11 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="emit('allowOnce')"
                >{{ $t('chat.consentOnce') }}</Button>
                <Button
                    v-if="allowPersistent"
                    type="button"
                    data-testid="talos-tool-consent-always"
                    class="talos-pressable col-span-2 min-h-11 rounded-full border border-[var(--talos-accent)] bg-transparent text-sm font-medium text-[var(--talos-accent)] sm:col-span-1"
                    @click="emit('alwaysAllow')"
                >{{ $t('chat.authorizationAlways') }}</Button>
            </div>
        </section>
    </Teleport>
</template>
