<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
    AlertTriangle,
    Database,
    FileText,
    Image,
    LoaderCircle,
    Paperclip,
    Plus,
    RefreshCw,
    Trash2,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import { useChatController } from '@/stores/chatController'

const controller = useChatController()
const attachments = controller.attachments
const actionBusy = ref(false)
const feedback = ref('')
const deleteOpen = ref(false)
const deleteTarget = ref<TalosLocalVaultFile | null>(null)

function formatBytes(value: number): string {
    if (value < 1024) return value + ' B'
    if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB'
    const megabytes = value / (1024 * 1024)
    return (Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)) + ' MB'
}

function isSelected(fileId: string): boolean {
    return attachments.items.some((item) =>
        item.vaultFileId === fileId && item.status === 'authorized',
    )
}

async function addFiles(): Promise<void> {
    if (actionBusy.value) return
    feedback.value = ''
    actionBusy.value = true
    try {
        await attachments.selectFiles()
    } finally {
        actionBusy.value = false
    }
}

async function attachFile(file: TalosLocalVaultFile): Promise<void> {
    if (actionBusy.value || file.status !== 'available') return
    feedback.value = ''
    actionBusy.value = true
    try {
        if (await attachments.attachExisting(file)) {
            feedback.value = file.display_name + ' is ready in the composer.'
        }
    } finally {
        actionBusy.value = false
    }
}

function requestDelete(file: TalosLocalVaultFile): void {
    deleteTarget.value = file
    deleteOpen.value = true
}

async function confirmDelete(): Promise<void> {
    const file = deleteTarget.value
    if (!file || actionBusy.value) return
    actionBusy.value = true
    feedback.value = ''
    try {
        await attachments.deleteVaultFile(file.id)
        feedback.value = file.display_name + ' was deleted.'
        deleteOpen.value = false
        deleteTarget.value = null
    } finally {
        actionBusy.value = false
    }
}

onMounted(async () => {
    await controller.init()
    await attachments.refreshVault()
})
</script>

<template>
    <TalosMobileScreen title="Library" eyebrow="Context Vault">
        <template #eyebrow-icon>
            <Database class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>

        <div
            class="flex gap-1 border-b border-[var(--talos-border)]"
            role="tablist"
            aria-label="Library sections"
        >
            <button
                id="talos-mobile-library-tab-context"
                type="button"
                role="tab"
                aria-selected="true"
                aria-controls="talos-mobile-library-panel-context"
                class="min-h-11 border-b-2 border-[var(--talos-accent)] px-3 text-sm font-semibold text-[var(--talos-text)]"
            >
                Context Vault
            </button>
            <button
                type="button"
                role="tab"
                aria-selected="false"
                aria-disabled="true"
                disabled
                class="min-h-11 border-b-2 border-transparent px-3 text-sm text-[var(--talos-muted)] opacity-60"
            >
                Documents
            </button>
        </div>

        <section
            id="talos-mobile-library-panel-context"
            role="tabpanel"
            aria-labelledby="talos-mobile-library-tab-context"
            class="mt-4"
        >

        <div class="mb-4 flex items-center justify-between gap-3 border-b border-[var(--talos-border)] pb-3">
            <div>
                <h2 class="text-sm font-semibold text-[var(--talos-text)]">Files</h2>
                <p class="mt-0.5 font-mono text-[10px] text-[var(--talos-muted)]">
                    {{ attachments.vaultFiles.length }} stored
                </p>
            </div>
            <Button
                type="button"
                size="sm"
                :disabled="actionBusy || attachments.selecting.value"
                aria-label="Add files to Vault"
                @click="addFiles"
            >
                <LoaderCircle
                    v-if="actionBusy || attachments.selecting.value"
                    class="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                />
                <Plus v-else class="size-4" aria-hidden="true" />
                Add files
            </Button>
        </div>

        <div
            v-if="attachments.vaultError.value"
            role="alert"
            class="mb-3 flex items-center gap-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]"
        >
            <AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1">{{ attachments.vaultError.value }}</span>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                class="min-h-11 min-w-11"
                aria-label="Retry Vault"
                @click="attachments.refreshVault()"
            >
                <RefreshCw class="size-4" aria-hidden="true" />
            </Button>
        </div>

        <div
            v-if="attachments.vaultLoading.value && attachments.vaultFiles.length === 0"
            role="status"
            class="flex items-center gap-2 py-8 text-sm text-[var(--talos-muted)]"
        >
            <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" />
            Loading Vault
        </div>

        <div
            v-else-if="attachments.vaultFiles.length === 0"
            class="rounded-md border border-dashed border-[var(--talos-border)] px-3 py-8 text-center text-sm text-[var(--talos-muted)]"
        >
            No files in your Vault
        </div>

        <div v-else class="space-y-2" role="list" aria-label="Vault files">
            <article
                v-for="file in attachments.vaultFiles"
                :key="file.id"
                :data-vault-file-id="file.id"
                role="listitem"
                class="flex min-w-0 items-center gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
            >
                <Image
                    v-if="file.media_type.startsWith('image/')"
                    class="size-5 shrink-0 text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
                <FileText v-else class="size-5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />

                <div class="min-w-0 flex-1">
                    <h3 class="truncate text-sm font-medium text-[var(--talos-text)]">{{ file.display_name }}</h3>
                    <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--talos-muted)]">
                        <span>{{ formatBytes(file.size_bytes) }}</span>
                        <span>{{ file.media_type }}</span>
                        <span v-if="file.status === 'available'" class="text-[var(--talos-success)]">Ready</span>
                        <span v-else-if="file.status === 'pending'">Inspecting</span>
                        <span v-else class="text-[var(--talos-danger)]">Could not inspect</span>
                    </p>
                    <p
                        v-if="file.failure_code"
                        class="mt-1 truncate font-mono text-[10px] text-[var(--talos-danger)]"
                    >
                        {{ file.failure_code }}
                    </p>
                </div>

                <div class="flex shrink-0 items-center gap-1">
                    <Button
                        v-if="file.status === 'available'"
                        type="button"
                        size="icon"
                        variant="outline"
                        class="min-h-11 min-w-11"
                        :aria-label="'Attach ' + file.display_name + ' to message'"
                        :title="isSelected(file.id) ? 'Already attached' : 'Attach to message'"
                        :disabled="actionBusy || isSelected(file.id)"
                        @click="attachFile(file)"
                    >
                        <Paperclip class="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        class="min-h-11 min-w-11 text-[var(--talos-danger)]"
                        :aria-label="'Delete ' + file.display_name"
                        title="Delete file"
                        :disabled="actionBusy"
                        @click="requestDelete(file)"
                    >
                        <Trash2 class="size-4" aria-hidden="true" />
                    </Button>
                </div>
            </article>
        </div>
        </section>

        <p class="sr-only" role="status" aria-live="polite">{{ feedback }}</p>
    </TalosMobileScreen>

    <!-- R1-1: reka Dialog never renders on the owner's WebView — migrated to
         the device-proven surface. -->
    <TalosMobileConfirmDialog
        v-if="deleteOpen"
        title="Delete file?"
        :description="`${deleteTarget?.display_name} will be removed from this device. Existing chat history keeps only its safe file label.`"
        @close="actionBusy ? undefined : deleteOpen = false"
    >
        <template #footer>
            <Button type="button" variant="outline" :disabled="actionBusy" @click="deleteOpen = false">
                Cancel
            </Button>
            <Button
                type="button"
                :disabled="actionBusy"
                class="bg-[var(--talos-danger)] text-white"
                @click="confirmDelete"
            >
                Delete file
            </Button>
        </template>
    </TalosMobileConfirmDialog>
</template>
