<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, Loader2, SquareTerminal } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import Textarea from '../../ui/Textarea.vue'
import { useTalosAdmin } from '../../../composables/useTalosAdmin'

const props = defineProps<{
    token: string
}>()

const command = ref('php artisan about')
const localError = ref<string | null>(null)
const {
    shellDecision,
    loadingAdmin,
    adminError,
    previewShell,
} = useTalosAdmin()

const visibleError = computed(() => localError.value || adminError.value)
const canPreview = computed(() => props.token.trim().length > 0 && command.value.trim().length > 0 && !loadingAdmin.value)

async function previewPolicy() {
    localError.value = null

    try {
        await previewShell(props.token, command.value)
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not preview shell policy.'
    }
}
</script>

<template>
    <Surface data-testid="talos-admin-shell-policy">
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <SquareTerminal class="h-4 w-4 text-[var(--talos-accent)]" />
                        Shell policy
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Audited host boundary</h3>
                </div>
                <Badge tone="warning">default deny</Badge>
            </div>
        </div>

        <div class="space-y-3 p-4">
            <div class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]">
                Shell execution is disabled by default. Preview requests are audited and never run host commands.
            </div>

            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Command preview</span>
                <Textarea
                    v-model="command"
                    class="mt-2 min-h-[84px] font-mono text-xs"
                    aria-label="Shell command preview"
                />
            </label>

            <div class="flex flex-wrap gap-2">
                <Button type="button" size="sm" :disabled="!canPreview" @click="previewPolicy">
                    <Loader2 v-if="loadingAdmin" class="h-4 w-4 animate-spin" />
                    Preview policy
                </Button>
                <Button type="button" size="sm" variant="destructive" disabled>
                    Execute disabled
                </Button>
            </div>

            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertTriangle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="shellDecision" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-wrap gap-2">
                    <Badge :tone="shellDecision.allowed ? 'success' : 'warning'">decision {{ shellDecision.decision }}</Badge>
                    <Badge tone="neutral">required {{ shellDecision.required_scope }}</Badge>
                    <Badge tone="neutral">executed {{ shellDecision.executed ? 'yes' : 'no' }}</Badge>
                </div>
                <dl class="mt-3 grid gap-2 text-xs text-[var(--talos-muted)] sm:grid-cols-2">
                    <div>
                        <dt class="font-semibold uppercase">reason</dt>
                        <dd class="mt-1 font-mono text-[var(--talos-text)]">{{ shellDecision.reason }}</dd>
                    </div>
                    <div>
                        <dt class="font-semibold uppercase">command_hash</dt>
                        <dd class="mt-1 break-all font-mono text-[var(--talos-text)]">{{ shellDecision.command_hash }}</dd>
                    </div>
                </dl>
            </div>
        </div>
    </Surface>
</template>
