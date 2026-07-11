<script setup lang="ts">
import { Check, Copy, Download, Pencil, Trash2, X } from '@lucide/vue'
import Badge from '../../../ui/Badge.vue'
import Button from '../../../ui/Button.vue'
import Input from '../../../ui/Input.vue'
import Textarea from '../../../ui/Textarea.vue'
import type { TalosNamedTheme } from '../../../../lib/talosThemes'

const props = defineProps<{
    library: readonly TalosNamedTheme[]
    activeCustomThemeId: string | null
    renamingThemeId: string | null
    renameThemeName: string
    exportJson: string
    importJson: string
    deleteThemeId: string | null
    exportFeedback: string
    disabled: boolean
    saving: boolean
}>()

const emit = defineEmits<{
    export: []
    copy: []
    download: []
    'update:importJson': [value: string]
    import: []
    apply: [theme: TalosNamedTheme]
    rename: [theme: TalosNamedTheme]
    'update:renameThemeName': [value: string]
    'save-rename': [theme: TalosNamedTheme]
    duplicate: [theme: TalosNamedTheme]
    'request-delete': [theme: TalosNamedTheme]
    'confirm-delete': []
    'cancel-delete': []
}>()

const deletingTheme = () => props.library.find((theme) => theme.id === props.deleteThemeId) ?? null
</script>

<template>
    <section
        id="talos-theme-control-panel-library"
        role="tabpanel"
        aria-labelledby="talos-theme-control-tab-library"
        aria-label="Custom theme library"
        class="space-y-4"
    >
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <h4 class="text-sm font-semibold text-[var(--talos-text)]">Custom theme library</h4>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Saved themes are personal preference objects, not executable assets.</p>
            </div>
            <div class="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" :disabled="disabled" @click="emit('export')"><Download :size="15" aria-hidden="true" />Export active theme</Button>
            </div>
        </div>

        <div v-if="library.length" class="space-y-2">
            <article
                v-for="themeItem in library"
                :key="themeItem.id"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
            >
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <h5 class="font-semibold text-[var(--talos-text)]">{{ themeItem.name }}</h5>
                            <Badge v-if="themeItem.id === activeCustomThemeId" tone="success">Active</Badge>
                            <Badge tone="neutral">{{ themeItem.base_theme }}</Badge>
                        </div>
                        <p class="mt-1 text-xs text-[var(--talos-muted)]">{{ themeItem.id }}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <Button size="sm" type="button" :disabled="saving || disabled" @click="emit('apply', themeItem)">Apply</Button>
                        <Button size="sm" variant="ghost" type="button" :disabled="saving || disabled" @click="emit('rename', themeItem)"><Pencil :size="14" aria-hidden="true" />Rename</Button>
                        <Button size="sm" variant="ghost" type="button" :disabled="saving || disabled" @click="emit('duplicate', themeItem)"><Copy :size="14" aria-hidden="true" />Duplicate</Button>
                        <Button size="sm" variant="destructive" type="button" :disabled="saving || disabled" @click="emit('request-delete', themeItem)"><Trash2 :size="14" aria-hidden="true" />Delete</Button>
                    </div>
                </div>
                <div v-if="renamingThemeId === themeItem.id" class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input :model-value="renameThemeName" aria-label="Rename theme" :disabled="saving || disabled" @update:model-value="emit('update:renameThemeName', String($event))" />
                    <Button size="sm" type="button" :disabled="saving || disabled" @click="emit('save-rename', themeItem)"><Check :size="14" aria-hidden="true" />Save name</Button>
                </div>
            </article>
        </div>
        <div v-else class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 text-sm text-[var(--talos-muted)]">No custom themes saved yet.</div>

        <div v-if="deleteThemeId && deletingTheme()" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-4" role="dialog" aria-modal="true" aria-labelledby="talos-theme-delete-title">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h4 id="talos-theme-delete-title" class="text-sm font-semibold text-[var(--talos-text)]">Delete {{ deletingTheme()?.name }}?</h4>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-text)]">This removes the saved theme. Deleting the active theme also restores the base preset values.</p>
                </div>
                <button type="button" class="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" aria-label="Close delete confirmation" @click="emit('cancel-delete')"><X :size="16" aria-hidden="true" /></button>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="destructive" :disabled="saving || disabled" @click="emit('confirm-delete')"><Trash2 :size="15" aria-hidden="true" />Delete theme</Button>
                <Button type="button" variant="ghost" :disabled="saving" @click="emit('cancel-delete')">Cancel</Button>
            </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
            <div>
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Exported theme JSON</span>
                    <Textarea :model-value="exportJson" data-testid="talos-theme-export-json" class="min-h-40 font-mono text-xs" readonly aria-label="Exported theme JSON" />
                </label>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" :disabled="!exportJson" @click="emit('copy')"><Copy :size="15" aria-hidden="true" />Copy export</Button>
                    <Button type="button" variant="outline" :disabled="!exportJson" @click="emit('download')"><Download :size="15" aria-hidden="true" />Download export</Button>
                    <span v-if="exportFeedback" class="text-xs text-[var(--talos-success-text)]" role="status" aria-live="polite">{{ exportFeedback }}</span>
                </div>
            </div>
            <div class="space-y-2">
                <label class="space-y-1 text-xs font-medium text-[var(--talos-muted)]">
                    <span>Import theme JSON</span>
                    <Textarea :model-value="importJson" class="min-h-40 font-mono text-xs" aria-label="Import theme JSON" :disabled="disabled" @update:model-value="emit('update:importJson', String($event))" />
                </label>
                <Button type="button" :disabled="saving || disabled" @click="emit('import')">Import theme</Button>
            </div>
        </div>
    </section>
</template>
