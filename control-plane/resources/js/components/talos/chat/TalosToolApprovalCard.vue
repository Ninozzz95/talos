<script setup lang="ts">
import { computed } from 'vue'
import { FileUp, Loader2, MousePointerClick, ShieldCheck, TriangleAlert } from '@lucide/vue'
import { Button } from '../../ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '../../ui/alert-dialog'
import type { TalosPendingToolApproval } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    approval: TalosPendingToolApproval
    busy?: boolean
}>(), {
    busy: false,
})

const emit = defineEmits<{
    decide: [decision: 'approve' | 'reject']
}>()

const pageHost = computed(() => {
    if (!props.approval.url) return 'Current browser page'
    try {
        return new URL(props.approval.url).host
    } catch {
        return 'Current browser page'
    }
})
const evidenceSuffix = computed(() => props.approval.evidence_hash.slice(-12))
const isUpload = computed(() => props.approval.tool_name === 'browser_file_upload')
const uploadFiles = computed(() => props.approval.tool_name === 'browser_file_upload' ? props.approval.files : [])
const uploadFileNames = computed(() => uploadFiles.value.map((file) => file.name).join(', '))

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} KB`
    return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`
}
</script>

<template>
    <section
        data-testid="tool-approval-card"
        :data-tool-name="approval.tool_name"
        :data-approval-status="approval.status"
        class="min-w-0 rounded-md border px-3 py-3 text-sm"
        :class="approval.status === 'stale'
            ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)]'
            : 'border-[var(--talos-accent)]/45 bg-[var(--talos-panel-soft)]'"
        :aria-label="approval.status === 'stale' ? 'Stale browser action' : 'Browser action approval'"
    >
        <div class="flex min-w-0 items-start gap-3">
            <TriangleAlert v-if="approval.status === 'stale'" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
            <FileUp v-else-if="isUpload" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
            <MousePointerClick v-else class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
            <div class="min-w-0 flex-1">
                <div class="font-semibold text-[var(--talos-text)]">
                    {{ approval.status === 'stale' ? 'This action is stale' : isUpload ? 'File upload requires approval' : 'Browser action requires approval' }}
                </div>
                <p v-if="approval.status === 'stale'" class="mt-1 break-words text-xs text-[var(--talos-muted)]">
                    The captured page changed before approval. Retry the request to create fresh evidence.
                </p>
                <template v-else>
                    <p v-if="isUpload" class="mt-1 break-words text-xs text-[var(--talos-muted)]">
                        TALOS will upload the listed Vault files through the verified {{ approval.target.role }} target
                        <strong class="font-semibold text-[var(--talos-text)]">{{ approval.target.name }}</strong>
                        on {{ pageHost }}.
                    </p>
                    <p v-else class="mt-1 break-words text-xs text-[var(--talos-muted)]">
                        TALOS will activate the verified {{ approval.target.role }} target
                        <strong class="font-semibold text-[var(--talos-text)]">{{ approval.target.name }}</strong>
                        on {{ pageHost }}.
                    </p>
                    <ul v-if="isUpload" class="mt-3 space-y-1" aria-label="Files awaiting upload approval">
                        <li
                            v-for="file in uploadFiles"
                            :key="file.file_id"
                            class="flex min-w-0 items-center justify-between gap-3 rounded border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-1.5 text-xs"
                        >
                            <span class="min-w-0 truncate font-medium text-[var(--talos-text)]">{{ file.name }}</span>
                            <span class="shrink-0 text-[var(--talos-muted)]">{{ formatBytes(file.size_bytes) }}</span>
                        </li>
                    </ul>
                    <dl class="mt-3 grid min-w-0 gap-1 text-xs sm:grid-cols-[6rem_minmax(0,1fr)]">
                        <dt class="text-[var(--talos-muted)]">Expected effect</dt>
                        <dd class="min-w-0 break-words text-[var(--talos-text)]">{{ approval.expected_effect }}</dd>
                        <dt class="text-[var(--talos-muted)]">Evidence</dt>
                        <dd class="min-w-0 font-mono text-[11px] text-[var(--talos-muted)]">...{{ evidenceSuffix }}</dd>
                    </dl>
                </template>
                <code v-if="approval.stale_reason" class="mt-2 block break-all text-[11px] text-[var(--talos-warning)]">{{ approval.stale_reason }}</code>
            </div>
        </div>

        <div v-if="approval.actionable && approval.status === 'pending'" class="mt-3 flex flex-wrap justify-end gap-2">
            <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tool-approval-reject"
                :disabled="busy"
                @click="emit('decide', 'reject')"
            >
                Reject
            </Button>
            <AlertDialog>
                <AlertDialogTrigger as-child>
                    <Button
                        type="button"
                        size="sm"
                        data-testid="tool-approval-open-confirm"
                        :disabled="busy"
                    >
                        <Loader2 v-if="busy" class="mr-2 h-3.5 w-3.5 animate-spin" />
                        <ShieldCheck v-else class="mr-2 h-3.5 w-3.5" />
                        Approve
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{{ isUpload ? 'Approve this exact file upload?' : 'Approve this exact browser action?' }}</AlertDialogTitle>
                        <AlertDialogDescription>
                            <template v-if="isUpload">
                                TALOS will upload {{ uploadFileNames }} through "{{ approval.target.name }}" on {{ pageHost }} using evidence bound to this run. A changed page or revoked grant invalidates this approval.
                            </template>
                            <template v-else>
                                TALOS will click "{{ approval.target.name }}" on {{ pageHost }} using evidence bound to this run. A changed page invalidates this approval.
                            </template>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction data-testid="tool-approval-confirm" @click="emit('decide', 'approve')">
                            {{ isUpload ? 'Approve upload' : 'Approve action' }}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    </section>
</template>
