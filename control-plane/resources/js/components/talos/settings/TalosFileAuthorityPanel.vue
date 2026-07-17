<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { FileKey2, FileText, FolderOpen, Globe2, Loader2, RefreshCw, ShieldCheck, Trash2 } from '@lucide/vue'
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
import { useTalosFileAuthority } from '../../../composables/useTalosFileAuthority'
import type { TalosFileAuthorityGrant, TalosFileAuthorityPermission } from '../../../lib/talosTypes'

const props = defineProps<{
    activeTalosSessionId?: string | null
}>()

const {
    grants,
    availableVaultFiles,
    activeGlobalGrant,
    loadingGrants,
    loadingVaultFiles,
    mutating,
    authorityError,
    folderPermissionByGrant,
    folderPickerSupported,
    lastFolderImport,
    loadGrants,
    loadVaultFiles,
    createGrant,
    revokeGrant,
    pickFolder,
    importFolderFiles,
    reauthorizeFolder,
    setGlobalAccess,
} = useTalosFileAuthority()

const selectedScope = ref<'file' | 'session'>('file')
const selectedFileIds = ref<string[]>([])
const selectedPermissions = ref<TalosFileAuthorityPermission[]>(['model.read', 'browser.upload'])
const localError = ref<string | null>(null)
const feedback = ref<string | null>(null)
const folderFallbackInput = ref<HTMLInputElement | null>(null)

const activeGrants = computed(() => grants.value.filter((grant) => grant.status === 'active'))
const displayedError = computed(() => localError.value ?? authorityError.value)
const canCreateSelection = computed(() => selectedFileIds.value.length > 0
    && selectedPermissions.value.length > 0
    && (selectedScope.value !== 'session' || Boolean(props.activeTalosSessionId)))

function scopeLabel(grant: TalosFileAuthorityGrant) {
    return grant.scope === 'file' ? 'File'
        : grant.scope === 'folder' ? 'Folder'
            : grant.scope === 'session' ? 'Session'
                : 'Global'
}

function setScope(scope: 'file' | 'session') {
    selectedScope.value = scope
    if (scope === 'file' && selectedFileIds.value.length > 1) {
        selectedFileIds.value = selectedFileIds.value.slice(0, 1)
    }
}

function toggleFile(fileId: string, checked: boolean) {
    if (!checked) {
        selectedFileIds.value = selectedFileIds.value.filter((id) => id !== fileId)
        return
    }
    selectedFileIds.value = selectedScope.value === 'file'
        ? [fileId]
        : [...new Set([...selectedFileIds.value, fileId])]
}

function togglePermission(permission: TalosFileAuthorityPermission, checked: boolean) {
    selectedPermissions.value = checked
        ? [...new Set([...selectedPermissions.value, permission])]
        : selectedPermissions.value.filter((candidate) => candidate !== permission)
}

async function refresh() {
    localError.value = null
    await Promise.allSettled([
        loadGrants(props.activeTalosSessionId ?? null),
        loadVaultFiles(),
    ])
}

async function createSelectedGrant() {
    localError.value = null
    feedback.value = null
    if (!canCreateSelection.value) {
        localError.value = 'Select eligible Vault files and at least one permission.'
        return
    }
    try {
        await createGrant({
            scope: selectedScope.value,
            permissions: selectedPermissions.value,
            file_ids: [...selectedFileIds.value],
            ...(selectedScope.value === 'session'
                ? { session_id: props.activeTalosSessionId ?? null, label: 'Current chat files' }
                : { label: availableVaultFiles.value.find((file) => file.id === selectedFileIds.value[0])?.original_name ?? 'Selected file' }),
        })
        selectedFileIds.value = []
        feedback.value = selectedScope.value === 'session' ? 'Session authority created.' : 'File authority created.'
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not create file authority.'
    }
}

async function chooseFolder() {
    localError.value = null
    feedback.value = null
    try {
        await pickFolder(selectedPermissions.value)
        feedback.value = 'Folder files imported and authorized.'
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not import this folder.'
    }
}

async function handleFolderFallback(event: Event) {
    const input = event.target instanceof HTMLInputElement ? event.target : folderFallbackInput.value
    const files = input?.files ? [...input.files] : []
    if (input) input.value = ''
    if (files.length === 0) return
    localError.value = null
    feedback.value = null
    try {
        await importFolderFiles(files, selectedPermissions.value, 'Imported folder')
        feedback.value = 'Folder files imported. Reusable folder access is unavailable in this browser.'
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not import this folder.'
    }
}

async function enableGlobalAccess() {
    localError.value = null
    try {
        await setGlobalAccess(true, selectedPermissions.value)
        feedback.value = 'Global Vault authority enabled.'
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not enable global authority.'
    }
}

async function disableGlobalAccess() {
    localError.value = null
    try {
        await setGlobalAccess(false)
        feedback.value = 'Global Vault authority revoked.'
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not revoke global authority.'
    }
}

async function revoke(grantId: string) {
    localError.value = null
    try {
        await revokeGrant(grantId)
        feedback.value = 'File authority revoked.'
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not revoke this authority.'
    }
}

async function reauthorize(grantId: string) {
    const state = await reauthorizeFolder(grantId)
    feedback.value = state === 'granted'
        ? 'Folder permission restored.'
        : 'Folder permission remains unavailable. Revoke this grant and choose the folder again.'
}

onMounted(refresh)
watch(() => props.activeTalosSessionId ?? null, refresh)
</script>

<template>
    <section class="space-y-4 border-t border-[var(--talos-border)] pt-4" aria-labelledby="talos-file-authority-title">
        <div class="flex items-start gap-3">
            <FileKey2 class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
            <div class="min-w-0 flex-1">
                <h3 id="talos-file-authority-title" class="text-sm font-semibold text-[var(--talos-text)]">File authority</h3>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Grant TALOS only the Vault files it may read or upload. Local paths and folder handles never leave this browser.
                </p>
            </div>
            <Button type="button" variant="ghost" size="icon" :disabled="loadingGrants || loadingVaultFiles" aria-label="Refresh file authority" @click="refresh">
                <Loader2 v-if="loadingGrants || loadingVaultFiles" class="h-4 w-4 animate-spin" />
                <RefreshCw v-else class="h-4 w-4" />
            </Button>
        </div>

        <p v-if="displayedError" class="rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-3 py-2 text-xs text-[var(--talos-text)]" role="alert">
            {{ displayedError }}
        </p>
        <p v-else-if="feedback" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-xs text-[var(--talos-text)]" role="status">
            {{ feedback }}
        </p>

        <div class="space-y-3 border-y border-[var(--talos-border)] py-4">
            <div class="flex flex-wrap gap-2" aria-label="File authority scope">
                <Button
                    type="button"
                    size="sm"
                    :variant="selectedScope === 'file' ? 'default' : 'outline'"
                    data-testid="file-authority-scope-file"
                    @click="setScope('file')"
                >
                    <FileText class="mr-2 h-3.5 w-3.5" />
                    One file
                </Button>
                <Button
                    type="button"
                    size="sm"
                    :variant="selectedScope === 'session' ? 'default' : 'outline'"
                    data-testid="file-authority-scope-session"
                    :disabled="!activeTalosSessionId"
                    @click="setScope('session')"
                >
                    <ShieldCheck class="mr-2 h-3.5 w-3.5" />
                    Current chat
                </Button>
            </div>
            <p v-if="!activeTalosSessionId" class="text-xs text-[var(--talos-muted)]">Open a persistent chat to create session authority.</p>

            <div class="max-h-44 space-y-1 overflow-y-auto pr-1" aria-label="Available Vault files">
                <label
                    v-for="file in availableVaultFiles"
                    :key="file.id"
                    class="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-[var(--talos-panel-soft)]"
                >
                    <input
                        type="checkbox"
                        class="h-4 w-4 accent-[var(--talos-accent)]"
                        :data-testid="`file-authority-file-${file.id}`"
                        :checked="selectedFileIds.includes(file.id)"
                        @change="toggleFile(file.id, ($event.target as HTMLInputElement).checked)"
                    >
                    <span class="min-w-0 flex-1 truncate text-[var(--talos-text)]">{{ file.original_name }}</span>
                </label>
                <p v-if="!loadingVaultFiles && availableVaultFiles.length === 0" class="px-2 py-3 text-xs text-[var(--talos-muted)]">No available Vault files.</p>
            </div>

            <fieldset class="flex flex-wrap gap-4">
                <legend class="mb-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">Permissions</legend>
                <label class="flex items-center gap-2 text-xs text-[var(--talos-text)]">
                    <input type="checkbox" :checked="selectedPermissions.includes('model.read')" class="h-4 w-4 accent-[var(--talos-accent)]" @change="togglePermission('model.read', ($event.target as HTMLInputElement).checked)">
                    Model read
                </label>
                <label class="flex items-center gap-2 text-xs text-[var(--talos-text)]">
                    <input type="checkbox" :checked="selectedPermissions.includes('browser.upload')" class="h-4 w-4 accent-[var(--talos-accent)]" @change="togglePermission('browser.upload', ($event.target as HTMLInputElement).checked)">
                    Browser upload
                </label>
            </fieldset>

            <Button type="button" size="sm" data-testid="file-authority-create" :disabled="!canCreateSelection || mutating" @click="createSelectedGrant">
                <Loader2 v-if="mutating" class="mr-2 h-3.5 w-3.5 animate-spin" />
                Create authority
            </Button>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
            <section class="min-w-0 border-b border-[var(--talos-border)] pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
                <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                    <FolderOpen class="h-4 w-4 text-[var(--talos-accent)]" />
                    Folder import
                </div>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Imports up to 64 eligible files into the Vault from one explicit folder selection.</p>
                <Button v-if="folderPickerSupported" type="button" size="sm" variant="outline" class="mt-3" data-testid="file-authority-pick-folder" :disabled="mutating" @click="chooseFolder">
                    Choose folder
                </Button>
                <Button v-else type="button" size="sm" variant="outline" class="mt-3" data-testid="file-authority-pick-folder" :disabled="mutating" @click="folderFallbackInput?.click()">
                    Import folder files
                </Button>
                <input
                    ref="folderFallbackInput"
                    data-testid="file-authority-folder-fallback"
                    type="file"
                    class="sr-only"
                    multiple
                    webkitdirectory=""
                    directory=""
                    @change="handleFolderFallback"
                >
                <p v-if="lastFolderImport" class="mt-2 text-xs text-[var(--talos-muted)]">
                    {{ lastFolderImport.imported }} imported, {{ lastFolderImport.rejected }} rejected<span v-if="lastFolderImport.truncated">, limited to 64</span>.
                </p>
            </section>

            <section class="min-w-0">
                <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                    <Globe2 class="h-4 w-4 text-[var(--talos-warning)]" />
                    Global Vault authority
                </div>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Applies to all present and future owned Vault files, never the operating-system filesystem.</p>
                <AlertDialog v-if="!activeGlobalGrant">
                    <AlertDialogTrigger as-child>
                        <Button type="button" size="sm" variant="outline" class="mt-3" data-testid="file-authority-enable-global" :disabled="mutating || selectedPermissions.length === 0">
                            Enable global access
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Enable global Vault authority?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This grants the selected permissions to all present and future Vault files owned by your account. It does not grant access to arbitrary local paths.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction data-testid="file-authority-confirm-global" @click="enableGlobalAccess">Enable global access</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <AlertDialog v-else>
                    <AlertDialogTrigger as-child>
                        <Button type="button" size="sm" variant="destructive" class="mt-3" data-testid="file-authority-disable-global" :disabled="mutating">Disable global access</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Revoke global Vault authority?</AlertDialogTitle>
                            <AlertDialogDescription>Future model reads and Browser uploads must use a narrower active grant.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction @click="disableGlobalAccess">Revoke global access</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </section>
        </div>

        <section aria-labelledby="talos-active-authority-title">
            <h4 id="talos-active-authority-title" class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Active grants</h4>
            <div class="mt-2 space-y-2">
                <article v-for="grant in activeGrants" :key="grant.id" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2.5">
                    <div class="flex min-w-0 items-start gap-3">
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ grant.label }}</span>
                                <span class="rounded border border-[var(--talos-border)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--talos-muted)]">{{ scopeLabel(grant) }}</span>
                            </div>
                            <p class="mt-1 text-xs text-[var(--talos-muted)]">
                                {{ grant.permissions.join(' + ') }}<span v-if="grant.scope !== 'global'"> · {{ grant.files.length }} file{{ grant.files.length === 1 ? '' : 's' }}</span>
                            </p>
                            <p v-if="grant.scope === 'folder'" class="mt-1 text-xs text-[var(--talos-muted)]">Local permission: {{ folderPermissionByGrant[grant.id] ?? 'unavailable' }}</p>
                        </div>
                        <div class="flex shrink-0 items-center gap-1">
                            <Button
                                v-if="grant.scope === 'folder' && ['prompt', 'denied'].includes(folderPermissionByGrant[grant.id] ?? '')"
                                type="button"
                                size="icon"
                                variant="ghost"
                                :aria-label="`Reauthorize ${grant.label}`"
                                @click="reauthorize(grant.id)"
                            >
                                <RefreshCw class="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger as-child>
                                    <Button type="button" size="icon" variant="ghost" :data-testid="`file-authority-revoke-${grant.id}`" :aria-label="`Revoke ${grant.label}`">
                                        <Trash2 class="h-3.5 w-3.5 text-[var(--talos-danger)]" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Revoke {{ grant.label }}?</AlertDialogTitle>
                                        <AlertDialogDescription>TALOS will stop accepting this grant for model reads and Browser uploads.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction data-testid="file-authority-confirm-revoke" @click="revoke(grant.id)">Revoke authority</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </article>
                <p v-if="!loadingGrants && activeGrants.length === 0" class="py-3 text-xs text-[var(--talos-muted)]">No active file authority grants.</p>
            </div>
        </section>
    </section>
</template>
